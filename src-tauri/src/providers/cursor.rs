use std::path::{Path, PathBuf};

use crate::models::{ChatEvent, ContentBlock, EventType};
use crate::providers::base::{ChatProvider, ParseError};

/// Provider for Cursor AI editor chat records.
///
/// Cursor stores chat/composer data in a SQLite database:
/// `%APPDATA%\Cursor\User\globalStorage\state.vscdb`
///
/// ## Data Model
///
/// The `cursorDiskKV` table is a key-value store:
/// - `composerData:<id>` — composer/session metadata
/// - `bubbleId:<composer_id>:<bubble_id>` — individual messages
///
/// Bubble types in Cursor:
/// - `type: 1` → user message
/// - `type: 2` → assistant response (may embed text, thinking, tool calls, code blocks)
///
/// ## Cached JSONL Approach
///
/// Cursor uses SQLite, not JSONL files. To integrate with the existing file-based
/// architecture, we read composers from SQLite and generate cached JSONL files in
/// `~/.agent-chat-viewer/cursor_sessions/`. The cache is refreshed when the source
/// DB has been modified since the last cache write.
///
/// Each cached JSONL line produces exactly one ChatEvent:
/// - `type: session_meta` → System event (one per file)
/// - `type: cursor_bubble` → User or Assistant event
/// - `type: cursor_tool_result` → User event (paired with tool use bubble)
pub struct CursorProvider {}

impl CursorProvider {
    pub fn new() -> Self {
        Self {}
    }

    /// Get the user's home directory (cross-platform)
    fn home_dir() -> PathBuf {
        if let Ok(home) = std::env::var("USERPROFILE") {
            return PathBuf::from(home);
        }
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home);
        }
        PathBuf::from(".")
    }

    /// Path to the globalStorage SQLite database (cross-platform)
    fn db_path() -> Option<PathBuf> {
        #[cfg(target_os = "windows")]
        {
            let roaming = std::env::var("APPDATA").ok()?;
            Some(
                PathBuf::from(roaming)
                    .join("Cursor")
                    .join("User")
                    .join("globalStorage")
                    .join("state.vscdb"),
            )
        }
        #[cfg(target_os = "macos")]
        {
            let home = std::env::var("HOME").ok()?;
            Some(
                PathBuf::from(home)
                    .join("Library")
                    .join("Application Support")
                    .join("Cursor")
                    .join("User")
                    .join("globalStorage")
                    .join("state.vscdb"),
            )
        }
        #[cfg(target_os = "linux")]
        {
            let config = std::env::var("XDG_CONFIG_HOME")
                .or_else(|_| {
                    std::env::var("HOME").map(|h| format!("{}/.config", h))
                })
                .ok()?;
            Some(
                PathBuf::from(config)
                    .join("Cursor")
                    .join("User")
                    .join("globalStorage")
                    .join("state.vscdb"),
            )
        }
        #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
        {
            None
        }
    }

    /// Path to the cache directory for generated JSONL files
    fn cache_dir() -> PathBuf {
        Self::home_dir()
            .join(".agent-chat-viewer")
            .join("cursor_sessions")
    }

    /// Cache version — bump when the generated JSONL format changes
    const CACHE_VERSION: u32 = 4;

    /// Check if the cache needs refresh (DB is newer than cache dir, or cache is empty)
    fn needs_refresh() -> bool {
        let db = match Self::db_path() {
            Some(p) => p,
            None => return false,
        };
        if !db.exists() {
            return false;
        }
        let cache = Self::cache_dir();
        if !cache.exists() {
            return true;
        }
        // Check cache version
        let version_file = cache.join(".cache_version");
        let version_ok = std::fs::read_to_string(&version_file)
            .ok()
            .and_then(|v| v.trim().parse::<u32>().ok())
            == Some(Self::CACHE_VERSION);
        if !version_ok {
            return true;
        }
        // Check if any JSONL files exist in cache
        if let Ok(entries) = std::fs::read_dir(&cache) {
            if entries.count() == 0 {
                return true;
            }
        }
        // Compare modification times
        let db_mtime = db.metadata().ok().and_then(|m| m.modified().ok());
        let cache_mtime = cache.metadata().ok().and_then(|m| m.modified().ok());
        match (db_mtime, cache_mtime) {
            (Some(db_t), Some(cache_t)) => db_t > cache_t,
            _ => true,
        }
    }

    /// Refresh the JSONL cache from the Cursor SQLite database.
    /// Returns the list of cached session file paths.
    pub fn refresh_cache() -> Result<Vec<PathBuf>, String> {
        let db = match Self::db_path() {
            Some(p) => p,
            None => return Ok(Vec::new()),
        };
        if !db.exists() {
            return Ok(Vec::new());
        }

        let cache_dir = Self::cache_dir();
        std::fs::create_dir_all(&cache_dir)
            .map_err(|e| format!("Failed to create cache dir: {}", e))?;

        // Clear stale cache files from previous versions
        if let Ok(entries) = std::fs::read_dir(&cache_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.extension().map_or(false, |e| e == "jsonl") {
                    let _ = std::fs::remove_file(&p);
                }
            }
        }

        let conn = rusqlite::Connection::open(&db)
            .map_err(|e| format!("Failed to open Cursor DB: {}", e))?;

        // Read all composerData entries
        let mut stmt = conn
            .prepare(
                "SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%'",
            )
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let composer_rows: Vec<(String, String)> = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| format!("Failed to query composers: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        // Close statement before using conn again in the loop
        drop(stmt);

        let mut cached_files = Vec::new();

        for (_key, value) in &composer_rows {
            let composer_data: serde_json::Value =
                serde_json::from_str(value).unwrap_or_default();
            let composer_id = composer_data["composerId"]
                .as_str()
                .unwrap_or("unknown")
                .to_string();
            if composer_id == "unknown" {
                continue;
            }

            // Skip empty/draft composers with no bubbles
            let headers = composer_data["fullConversationHeadersOnly"].as_array();
            if headers.map_or(true, |h| h.is_empty()) {
                continue;
            }

            let workspace_project_dir = Self::resolve_workspace_dir(
                &conn,
                &composer_data,
                &composer_id,
                headers,
            );

            let timestamp = composer_data["createdAt"]
                .as_u64()
                .map(|ts| {
                    // Convert unix ms to RFC3339
                    let secs = ts / 1000;
                    let nsecs = ((ts % 1000) * 1_000_000) as u32;
                    if let Some(dt) =
                        chrono::DateTime::from_timestamp(secs as i64, nsecs)
                    {
                        dt.to_rfc3339()
                    } else {
                        String::new()
                    }
                })
                .unwrap_or_default();

            let unified_mode = composer_data["unifiedMode"].as_str().unwrap_or("");
            let status = composer_data["status"].as_str().unwrap_or("");

            // Build JSONL for this composer
            let mut jsonl = String::new();

            // Line 1: session_meta
            let meta = serde_json::json!({
                "type": "session_meta",
                "composerId": composer_id,
                "workspaceProjectDir": workspace_project_dir,
                "createdAt": composer_data["createdAt"],
                "unifiedMode": unified_mode,
                "status": status,
                "timestamp": timestamp,
            });
            jsonl.push_str(&serde_json::to_string(&meta).unwrap());
            jsonl.push('\n');

            // Lines 2+: bubbles (one per line, plus tool_result lines)
            if let Some(headers) = headers {
                for header in headers {
                    let bid = header["bubbleId"].as_str().unwrap_or("");
                    let bkey = format!("bubbleId:{}:{}", composer_id, bid);
                    let bdata: serde_json::Value = conn
                        .query_row(
                            "SELECT value FROM cursorDiskKV WHERE key = ?1",
                            [&bkey],
                            |row| row.get::<_, String>(0),
                        )
                        .ok()
                        .and_then(|v| serde_json::from_str(&v).ok())
                        .unwrap_or_default();

                    Self::push_bubble_line(
                        &mut jsonl,
                        &composer_id,
                        header,
                        &bdata,
                    );
                    Self::push_tool_result_line(
                        &mut jsonl,
                        &composer_id,
                        header,
                        &bdata,
                    );
                }
            }

            // Write to cache file
            let cache_file =
                cache_dir.join(format!("{}.jsonl", composer_id));
            std::fs::write(&cache_file, &jsonl)
                .map_err(|e| format!("Failed to write cache file: {}", e))?;
            cached_files.push(cache_file);
        }

        // Write cache version marker
        let _ = std::fs::write(
            cache_dir.join(".cache_version"),
            Self::CACHE_VERSION.to_string(),
        );

        Ok(cached_files)
    }

    /// Convert a VSCode-URI path to native format.
    /// On Windows, "/X:/path/to/file" becomes "X:\\path\\to\\file".
    /// On other platforms, leading "/" is stripped if the path starts
    /// with a drive-letter pattern.
    fn to_native_path(uri_path: &str) -> String {
        let path = if cfg!(windows) && uri_path.starts_with('/') {
            // /X:/foo/bar → X:\foo\bar
            let stripped = &uri_path[1..]; // X:/foo/bar
            stripped.replace('/', "\\")
        } else if uri_path.starts_with('/') {
            uri_path.to_string()
        } else {
            uri_path.to_string()
        };
        path
    }

    /// Resolve workspace directory from composer/bubble data with 4 fallbacks.
    fn resolve_workspace_dir(
        conn: &rusqlite::Connection,
        composer_data: &serde_json::Value,
        composer_id: &str,
        headers: Option<&Vec<serde_json::Value>>,
    ) -> String {
        // 1. composerData["workspaceProjectDir"] (old format)
        let mut dir = composer_data["workspaceProjectDir"]
            .as_str()
            .unwrap_or("")
            .to_string();

        // 2. composerData["workspaceIdentifier"]["uri"]["fsPath"] (new format)
        if dir.is_empty() {
            if let Some(fs) = composer_data["workspaceIdentifier"]["uri"]["fsPath"]
                .as_str()
            {
                dir = fs.to_string();
            }
        }

        // 3. First bubble's ["workspaceProjectDir"] (old format fallback)
        if dir.is_empty() {
            if let Some(first_header) = headers.and_then(|h| h.first()) {
                let first_bubble_id = first_header["bubbleId"].as_str().unwrap_or("");
                let first_key = format!("bubbleId:{}:{}", composer_id, first_bubble_id);
                if let Ok(raw) = conn.query_row(
                    "SELECT value FROM cursorDiskKV WHERE key = ?1",
                    [&first_key],
                    |row| row.get::<_, String>(0),
                ) {
                    if let Ok(bv) = serde_json::from_str::<serde_json::Value>(&raw) {
                        if let Some(d) = bv["workspaceProjectDir"].as_str() {
                            if !d.is_empty() {
                                dir = d.to_string();
                            }
                        }
                    }
                }
            }
        }

        // 4. newlyCreatedFiles[0].uri (last resort)
        if dir.is_empty() {
            if let Some(first_file) = composer_data["newlyCreatedFiles"]
                .as_array()
                .and_then(|a| a.first())
            {
                let uri = &first_file["uri"];
                let raw = uri["fsPath"]
                    .as_str()
                    .or_else(|| uri["path"].as_str())
                    .unwrap_or("");
                if !raw.is_empty() {
                    let native = Self::to_native_path(raw);
                    if let Some(parent) = std::path::Path::new(&native).parent() {
                        dir = parent.to_string_lossy().to_string();
                    }
                }
            }
        }

        dir
    }

    /// Serialize a single bubble into a cursor_bubble JSONL line.
    fn push_bubble_line(
        jsonl: &mut String,
        composer_id: &str,
        header: &serde_json::Value,
        bubble_data: &serde_json::Value,
    ) {
        let line = serde_json::json!({
            "type": "cursor_bubble",
            "parentComposerId": composer_id,
            "bubbleId": header["bubbleId"],
            "bubbleType": header["type"],
            "text": bubble_data["text"].as_str().unwrap_or(""),
            "createdAt": header["createdAt"].as_str().unwrap_or(""),
            "allThinkingBlocks": &bubble_data["allThinkingBlocks"],
            "toolFormerData": &bubble_data["toolFormerData"],
            "codeBlocks": &bubble_data["codeBlocks"],
            "modelInfo": &bubble_data["modelInfo"],
        });
        jsonl.push_str(&serde_json::to_string(&line).unwrap());
        jsonl.push('\n');
    }

    /// Emit a cursor_tool_result line if the bubble has a tool result.
    fn push_tool_result_line(
        jsonl: &mut String,
        composer_id: &str,
        header: &serde_json::Value,
        bubble_data: &serde_json::Value,
    ) {
        let tool = &bubble_data["toolFormerData"];
        if tool.get("result").is_none() && tool.get("status").is_none() {
            return;
        }
        let status = tool["status"].as_str().unwrap_or("");
        let result = tool["result"].as_str().unwrap_or("");
        if result.is_empty() && status != "error" && status != "completed" {
            return;
        }
        let line = serde_json::json!({
            "type": "cursor_tool_result",
            "parentComposerId": composer_id,
            "bubbleId": header["bubbleId"],
            "toolCallId": tool["toolCallId"],
            "toolName": tool["name"].as_str().unwrap_or(""),
            "result": result,
            "isError": status == "error",
            "createdAt": header["createdAt"].as_str().unwrap_or(""),
        });
        jsonl.push_str(&serde_json::to_string(&line).unwrap());
        jsonl.push('\n');
    }

    /// Map Cursor tool IDs to human-readable names
    #[allow(dead_code)]
    fn map_tool_name(tool_id: u64) -> String {
        match tool_id {
            38 => "edit_file_v2".to_string(),
            40 => "read_file_v2".to_string(),
            42 => "glob_file_search".to_string(),
            other => format!("cursor_tool_{}", other),
        }
    }

    /// Parse a session_meta line into a System event
    fn parse_session_meta(value: &serde_json::Value) -> Result<ChatEvent, ParseError> {
        let composer_id = value["composerId"]
            .as_str()
            .unwrap_or("unknown")
            .to_string();
        let workspace = value["workspaceProjectDir"].as_str().unwrap_or("");
        let unified_mode = value["unifiedMode"].as_str().unwrap_or("");
        let status = value["status"].as_str().unwrap_or("");

        Ok(ChatEvent {
            uuid: format!("cursor-session-{}", composer_id),
            parent_uuid: None,
            event_type: EventType::System,
            timestamp: value["timestamp"].as_str().unwrap_or("").to_string(),
            content: vec![ContentBlock::Text {
                text: format!(
                    "Cursor {} ({}) — workspace: {}",
                    unified_mode, status, workspace
                ),
            }],
            session_id: Some(composer_id),
        })
    }

    /// Parse a cursor_bubble line into a ChatEvent (exactly one event per call)
    fn parse_bubble(value: &serde_json::Value) -> Result<ChatEvent, ParseError> {
        let bubble_type = value["bubbleType"].as_u64().unwrap_or(0);
        let bubble_id = value["bubbleId"]
            .as_str()
            .unwrap_or("unknown")
            .to_string();
        let parent_composer_id =
            value["parentComposerId"].as_str().unwrap_or("");
        let timestamp = value["createdAt"].as_str().unwrap_or("").to_string();
        let text = value["text"].as_str().unwrap_or("").to_string();

        match bubble_type {
            1 => {
                // User message
                Ok(ChatEvent {
                    uuid: format!("cursor-user-{}", bubble_id),
                    parent_uuid: None,
                    event_type: EventType::User,
                    timestamp,
                    content: vec![ContentBlock::Text { text }],
                    session_id: if parent_composer_id.is_empty() {
                        None
                    } else {
                        Some(parent_composer_id.to_string())
                    },
                })
            }
            2 => {
                // Assistant response — can have text, thinking, tool calls
                let all_thinking = value["allThinkingBlocks"].as_array();
                let tool_former = &value["toolFormerData"];

                let mut content_blocks: Vec<ContentBlock> = Vec::new();

                // Thinking blocks
                if let Some(thinking_blocks) = all_thinking {
                    for tb in thinking_blocks {
                        if let Some(thinking_text) = tb["content"].as_str() {
                            content_blocks.push(ContentBlock::Thinking {
                                thinking: thinking_text.to_string(),
                                signature: String::new(),
                            });
                        }
                    }
                }

                // Tool use block (toolFormerData with name/params)
                if let Some(tool_name_str) =
                    tool_former["name"].as_str().map(|s| s.to_string())
                {
                    let tool_id = tool_former["toolCallId"]
                        .as_str()
                        .unwrap_or("")
                        .to_string();
                    let tool_params =
                        tool_former["params"].as_str().unwrap_or("{}");

                    // Try to parse params as JSON, fall back to raw string
                    let tool_input: serde_json::Value =
                        serde_json::from_str(tool_params)
                            .unwrap_or_else(|_| {
                                serde_json::Value::String(
                                    tool_params.to_string(),
                                )
                            });

                    content_blocks.push(ContentBlock::ToolUse {
                        tool_id,
                        tool_name: tool_name_str,
                        tool_input,
                    });
                }

                // Text content (may coexist with thinking/tool calls)
                if !text.is_empty() {
                    content_blocks.push(ContentBlock::Text { text });
                }

                // If no content blocks at all, treat as empty text
                if content_blocks.is_empty() {
                    content_blocks.push(ContentBlock::Text {
                        text: String::new(),
                    });
                }

                Ok(ChatEvent {
                    uuid: format!("cursor-assistant-{}", bubble_id),
                    parent_uuid: None,
                    event_type: EventType::Assistant,
                    timestamp,
                    content: content_blocks,
                    session_id: if parent_composer_id.is_empty() {
                        None
                    } else {
                        Some(parent_composer_id.to_string())
                    },
                })
            }
            _ => Err(ParseError::UnknownEventType(format!(
                "unknown bubble type: {}",
                bubble_type
            ))),
        }
    }

    /// Parse a cursor_tool_result line into a User event with ToolResult block
    fn parse_tool_result(value: &serde_json::Value) -> Result<ChatEvent, ParseError> {
        let bubble_id = value["bubbleId"]
            .as_str()
            .unwrap_or("unknown")
            .to_string();
        let parent_composer_id = value["parentComposerId"].as_str().unwrap_or("");
        let timestamp = value["createdAt"].as_str().unwrap_or("").to_string();
        let tool_call_id = value["toolCallId"].as_str().unwrap_or("").to_string();
        let result_str = value["result"].as_str().unwrap_or("").to_string();
        let is_error = value["isError"].as_bool().unwrap_or(false);

        Ok(ChatEvent {
            uuid: format!("cursor-tool-result-{}", bubble_id),
            parent_uuid: Some(format!("cursor-assistant-{}", bubble_id)),
            event_type: EventType::User,
            timestamp,
            content: vec![ContentBlock::ToolResult {
                tool_use_id: tool_call_id,
                content: if result_str.is_empty() {
                    None
                } else {
                    Some(result_str)
                },
                is_error,
            }],
            session_id: if parent_composer_id.is_empty() {
                None
            } else {
                Some(parent_composer_id.to_string())
            },
        })
    }
}

impl ChatProvider for CursorProvider {
    fn name(&self) -> &'static str {
        "cursor"
    }

    fn display_name(&self) -> &'static str {
        "Cursor"
    }

    fn default_base_dir(&self) -> PathBuf {
        Self::cache_dir()
    }

    fn parse_event(&self, line: &str) -> Result<ChatEvent, ParseError> {
        let value: serde_json::Value = serde_json::from_str(line)?;
        let event_type = value["type"].as_str().ok_or_else(|| {
            ParseError::MissingField("type".to_string())
        })?;

        match event_type {
            "session_meta" => Self::parse_session_meta(&value),
            "cursor_bubble" => Self::parse_bubble(&value),
            "cursor_tool_result" => Self::parse_tool_result(&value),
            other => Err(ParseError::UnknownEventType(format!(
                "cursor event type: {}",
                other
            ))),
        }
    }

    fn detect_format(&self, path: &Path) -> bool {
        let cache = Self::cache_dir();
        path.starts_with(&cache)
    }

    fn metadata_path(&self) -> Option<PathBuf> {
        None
    }

    fn session_extension(&self) -> &'static str {
        "jsonl"
    }

    fn enumerate_session_files(&self, project_dir: &Path) -> Vec<PathBuf> {
        // Refresh cache if needed
        if Self::needs_refresh() {
            let _ = Self::refresh_cache();
        }

        let mut files = Vec::new();
        if let Ok(entries) = std::fs::read_dir(project_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && self.is_session_file(&path) {
                    files.push(path);
                }
            }
        }
        files
    }

    fn detect_by_content(&self, first_lines: &str) -> bool {
        if let Some(first_line) = first_lines.lines().find(|l| !l.trim().is_empty()) {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(first_line) {
                if let Some(event_type) = value["type"].as_str() {
                    return event_type == "session_meta"
                        && value["composerId"].as_str().is_some();
                }
            }
        }
        false
    }

    fn data_dir(&self) -> Option<PathBuf> {
        Self::db_path().and_then(|p| p.parent().map(|d| d.to_path_buf()))
    }

    fn use_cwd_grouping(&self) -> bool {
        true
    }

    fn read_session_cwd_from_file(&self, file_path: &Path) -> Option<String> {
        use std::io::{BufRead, BufReader};
        let file = std::fs::File::open(file_path).ok()?;
        let mut reader = BufReader::new(file);
        let mut first_line = String::new();
        reader.read_line(&mut first_line).ok()?;
        let value: serde_json::Value = serde_json::from_str(&first_line).ok()?;
        value["workspaceProjectDir"]
            .as_str()
            .map(String::from)
    }

    fn extract_cwd(&self, value: &serde_json::Value) -> Option<String> {
        // session_meta lines have workspaceProjectDir
        if let Some(dir) = value["workspaceProjectDir"].as_str() {
            return Some(dir.to_string());
        }
        None
    }

    fn clean_display_text(&self, text: &str) -> String {
        // Cursor messages are generally clean — no metadata prefixes like
        // Claude Code or OpenClaw. Pass through unchanged.
        text.to_string()
    }

    fn detect_client_from_text(&self, _text: &str) -> &'static str {
        "ide"
    }

    fn extract_raw_user_text(&self, value: &serde_json::Value) -> Option<String> {
        // cursor_bubble with bubbleType 1: text field
        if let Some(bubble_type) = value["bubbleType"].as_u64() {
            if bubble_type == 1 {
                if let Some(text) = value["text"].as_str() {
                    if !text.is_empty() {
                        return Some(text.to_string());
                    }
                }
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn parse(line: &str) -> ChatEvent {
        CursorProvider::new()
            .parse_event(line)
            .expect("parse should succeed")
    }

    fn parse_line(line: &str) -> Result<ChatEvent, ParseError> {
        CursorProvider::new().parse_event(line)
    }

    #[test]
    fn test_parse_session_meta() {
        let line = r#"{"type":"session_meta","composerId":"test-composer-123","workspaceProjectDir":"F:\\test\\project","createdAt":1782985612483,"unifiedMode":"agent","status":"completed","timestamp":"2026-07-02T09:46:52.830Z"}"#;
        let event = parse(line);
        assert!(matches!(event.event_type, EventType::System));
        assert_eq!(event.session_id.as_deref(), Some("test-composer-123"));
        match &event.content[0] {
            ContentBlock::Text { text } => {
                assert!(text.contains("agent"));
                assert!(text.contains("completed"));
                assert!(text.contains("F:\\test\\project"));
            }
            _ => panic!("Expected Text block"),
        }
    }

    #[test]
    fn test_parse_user_bubble() {
        let line = r#"{"type":"cursor_bubble","parentComposerId":"comp-1","bubbleId":"bub-1","bubbleType":1,"text":"Hello, can you help me code?","createdAt":"2026-07-02T09:46:52.830Z","allThinkingBlocks":[],"toolFormerData":null,"codeBlocks":[],"modelInfo":{"modelName":"gpt-5.2-codex"}}"#;
        let event = parse(line);
        assert!(matches!(event.event_type, EventType::User));
        assert_eq!(event.session_id.as_deref(), Some("comp-1"));
        match &event.content[0] {
            ContentBlock::Text { text } => {
                assert_eq!(text, "Hello, can you help me code?");
            }
            _ => panic!("Expected Text block"),
        }
    }

    #[test]
    fn test_parse_assistant_text_bubble() {
        let line = r#"{"type":"cursor_bubble","parentComposerId":"comp-1","bubbleId":"bub-2","bubbleType":2,"text":"Sure! I can help you with that.","createdAt":"2026-07-02T09:47:07.520Z","allThinkingBlocks":[],"toolFormerData":null,"codeBlocks":[],"modelInfo":{"modelName":"gpt-5.2-codex"}}"#;
        let event = parse(line);
        assert!(matches!(event.event_type, EventType::Assistant));
        match &event.content[0] {
            ContentBlock::Text { text } => {
                assert_eq!(text, "Sure! I can help you with that.");
            }
            _ => panic!("Expected Text block"),
        }
    }

    #[test]
    fn test_parse_assistant_with_thinking() {
        let line = r#"{"type":"cursor_bubble","parentComposerId":"comp-1","bubbleId":"bub-3","bubbleType":2,"text":"","createdAt":"2026-07-02T09:50:29.954Z","allThinkingBlocks":[{"content":"The user wants to create a calculator app. I'll write the HTML file."}],"toolFormerData":null,"codeBlocks":[],"modelInfo":{}}"#;
        let event = parse(line);
        assert!(matches!(event.event_type, EventType::Assistant));
        assert_eq!(event.content.len(), 1);
        match &event.content[0] {
            ContentBlock::Thinking { thinking, signature } => {
                assert!(thinking.contains("calculator"));
                assert!(signature.is_empty());
            }
            _ => panic!("Expected Thinking block"),
        }
    }

    #[test]
    fn test_parse_tool_call_bubble() {
        let line = r#"{"type":"cursor_bubble","parentComposerId":"comp-1","bubbleId":"bub-4","bubbleType":2,"text":"","createdAt":"2026-07-02T09:46:56.991Z","allThinkingBlocks":[],"toolFormerData":{"tool":38,"toolIndex":0,"toolCallId":"tool_test123","status":"completed","name":"edit_file_v2","params":"{\"relativeWorkspacePath\":\"test.html\"}","result":"{\"beforeContentId\":\"abc\",\"afterContentId\":\"def\"}"},"codeBlocks":[],"modelInfo":{}}"#;
        let event = parse(line);
        assert!(matches!(event.event_type, EventType::Assistant));
        let has_tool_use =
            event.content.iter().any(|b| matches!(b, ContentBlock::ToolUse { .. }));
        assert!(has_tool_use, "Expected ToolUse block");
    }

    #[test]
    fn test_parse_tool_result() {
        let line = r#"{"type":"cursor_tool_result","parentComposerId":"comp-1","bubbleId":"bub-4","toolCallId":"tool_test123","toolName":"edit_file_v2","result":"{\"beforeContentId\":\"abc\",\"afterContentId\":\"def\"}","isError":false,"createdAt":"2026-07-02T09:46:56.991Z"}"#;
        let event = parse(line);
        assert!(matches!(event.event_type, EventType::User));
        match &event.content[0] {
            ContentBlock::ToolResult {
                tool_use_id,
                content,
                is_error,
            } => {
                assert_eq!(tool_use_id, "tool_test123");
                assert!(content.is_some());
                assert!(!is_error);
            }
            _ => panic!("Expected ToolResult block"),
        }
    }

    #[test]
    fn test_parse_tool_result_error() {
        let line = r#"{"type":"cursor_tool_result","parentComposerId":"comp-1","bubbleId":"bub-5","toolCallId":"tool_err","toolName":"shell_command","result":"Error: command not found","isError":true,"createdAt":"2026-07-02T09:46:57.000Z"}"#;
        let event = parse(line);
        assert!(matches!(event.event_type, EventType::User));
        match &event.content[0] {
            ContentBlock::ToolResult { is_error, .. } => {
                assert!(is_error);
            }
            _ => panic!("Expected ToolResult block"),
        }
    }

    #[test]
    fn test_tool_name_mapping() {
        assert_eq!(CursorProvider::map_tool_name(38), "edit_file_v2");
        assert_eq!(CursorProvider::map_tool_name(40), "read_file_v2");
        assert_eq!(CursorProvider::map_tool_name(42), "glob_file_search");
        assert_eq!(CursorProvider::map_tool_name(99), "cursor_tool_99");
    }

    #[test]
    fn test_detect_by_content_session_meta() {
        let provider = CursorProvider::new();
        let content = r#"{"type":"session_meta","composerId":"test-123","workspaceProjectDir":"/test","createdAt":123,"unifiedMode":"agent","status":"completed","timestamp":"2026-07-02T09:46:52.830Z"}
{"type":"cursor_bubble","parentComposerId":"test-123","bubbleId":"b1","bubbleType":1,"text":"Hello","createdAt":"2026-07-02T09:46:52.830Z"}"#;
        assert!(provider.detect_by_content(content));
    }

    #[test]
    fn test_detect_by_content_rejects_other_format() {
        let provider = CursorProvider::new();
        // Claude Code format
        let content = r#"{"type":"user","message":{"role":"user","content":"Hello"},"uuid":"u-001","timestamp":"2026-06-09T10:00:00Z","sessionId":"s1"}"#;
        assert!(!provider.detect_by_content(content));
    }

    #[test]
    fn test_detect_by_content_empty() {
        let provider = CursorProvider::new();
        assert!(!provider.detect_by_content(""));
    }

    #[test]
    fn test_detect_format() {
        let provider = CursorProvider::new();
        let cache = CursorProvider::cache_dir();
        assert!(provider.detect_format(&cache.join("test.jsonl")));
        assert!(!provider.detect_format(Path::new("/tmp/something.jsonl")));
    }

    #[test]
    fn test_extract_session_id() {
        let provider = CursorProvider::new();
        let path = Path::new(
            "/home/user/.agent-chat-viewer/cursor_sessions/test-uuid.jsonl",
        );
        assert_eq!(
            provider.extract_session_id(path),
            Some("test-uuid".to_string())
        );
    }

    #[test]
    fn test_parse_missing_type_field() {
        let line = r#"{"bubbleId":"x1","createdAt":"2026-06-09T10:00:00Z"}"#;
        let result = parse_line(line);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_unknown_type() {
        let line = r#"{"type":"weird_type","bubbleId":"x1","createdAt":"2026-06-09T10:00:00Z"}"#;
        let result = parse_line(line);
        assert!(result.is_err());
    }

    #[test]
    fn test_clean_display_text_passthrough() {
        let provider = CursorProvider::new();
        let text = "Hello, can you help me with this code?";
        assert_eq!(provider.clean_display_text(text), text);
    }

    #[test]
    fn test_extract_raw_user_text() {
        let provider = CursorProvider::new();
        let value: serde_json::Value = serde_json::from_str(
            r#"{"type":"cursor_bubble","bubbleType":1,"text":"Hello Cursor"}"#,
        )
        .unwrap();
        assert_eq!(
            provider.extract_raw_user_text(&value),
            Some("Hello Cursor".to_string())
        );
    }

    #[test]
    fn test_extract_raw_user_text_not_user_bubble() {
        let provider = CursorProvider::new();
        let value: serde_json::Value = serde_json::from_str(
            r#"{"type":"cursor_bubble","bubbleType":2,"text":"Response"}"#,
        )
        .unwrap();
        assert_eq!(provider.extract_raw_user_text(&value), None);
    }

    #[test]
    fn test_detect_client_from_text() {
        let provider = CursorProvider::new();
        assert_eq!(provider.detect_client_from_text("anything"), "ide");
    }

    #[test]
    fn test_extract_cwd_from_session_meta() {
        let provider = CursorProvider::new();
        let value: serde_json::Value = serde_json::from_str(
            r#"{"type":"session_meta","workspaceProjectDir":"F:\\test\\project"}"#,
        )
        .unwrap();
        assert_eq!(
            provider.extract_cwd(&value),
            Some("F:\\test\\project".to_string())
        );
    }

    // ===== to_native_path =====

    #[test]
    fn test_to_native_path_windows_drive_letter() {
        // /X:/path/to/file → X:\path\to\file
        let result = CursorProvider::to_native_path("/f:/for_test/cursor/llm_api_test");
        if cfg!(windows) {
            assert_eq!(result, "f:\\for_test\\cursor\\llm_api_test");
        } else {
            assert_eq!(result, "/f:/for_test/cursor/llm_api_test");
        }
    }

    #[test]
    fn test_to_native_path_no_leading_slash_passthrough() {
        // Only called on newlyCreatedFiles URIs, which always have leading /
        let result = CursorProvider::to_native_path("relative/path");
        assert_eq!(result, "relative/path");
    }

    #[test]
    fn test_to_native_path_drive_letter_handles_colon() {
        // /f:/project → f:\project on Windows, unchanged elsewhere
        let result = CursorProvider::to_native_path("/f:/project");
        if cfg!(windows) {
            assert_eq!(result, "f:\\project");
        } else {
            assert_eq!(result, "/f:/project");
        }
    }

    // ===== push_bubble_line =====

    #[test]
    fn test_push_bubble_line_user() {
        let mut jsonl = String::new();
        let header = serde_json::json!({"bubbleId": "b1", "type": 1, "createdAt": "2026-07-01T00:00:00Z"});
        let bdata = serde_json::json!({"text": "Hello Cursor", "allThinkingBlocks": [], "toolFormerData": null, "codeBlocks": null, "modelInfo": {"modelName": "gpt-5"}});
        CursorProvider::push_bubble_line(&mut jsonl, "comp-1", &header, &bdata);
        let parsed: serde_json::Value = serde_json::from_str(jsonl.trim()).unwrap();
        assert_eq!(parsed["type"], "cursor_bubble");
        assert_eq!(parsed["bubbleType"], 1);
        assert_eq!(parsed["text"], "Hello Cursor");
        assert_eq!(parsed["parentComposerId"], "comp-1");
    }

    #[test]
    fn test_push_bubble_line_tool_call() {
        let mut jsonl = String::new();
        let header = serde_json::json!({"bubbleId": "b2", "type": 2, "createdAt": "2026-07-01T00:00:01Z"});
        let bdata = serde_json::json!({"text": "", "allThinkingBlocks": [], "toolFormerData": {"name": "edit_file_v2", "toolCallId": "t1"}, "codeBlocks": [], "modelInfo": null});
        CursorProvider::push_bubble_line(&mut jsonl, "comp-1", &header, &bdata);
        let parsed: serde_json::Value = serde_json::from_str(jsonl.trim()).unwrap();
        assert_eq!(parsed["type"], "cursor_bubble");
        assert_eq!(parsed["bubbleType"], 2);
        assert_eq!(parsed["toolFormerData"]["name"], "edit_file_v2");
    }

    // ===== push_tool_result_line =====

    #[test]
    fn test_push_tool_result_line_when_has_result() {
        let mut jsonl = String::new();
        let header = serde_json::json!({"bubbleId": "b2", "createdAt": "2026-07-01T00:00:01Z"});
        let bdata = serde_json::json!({"toolFormerData": {"name": "edit", "toolCallId": "t1", "result": "{\"ok\":true}", "status": "completed"}});
        CursorProvider::push_tool_result_line(&mut jsonl, "comp-1", &header, &bdata);
        assert!(!jsonl.is_empty());
        let parsed: serde_json::Value = serde_json::from_str(jsonl.trim()).unwrap();
        assert_eq!(parsed["type"], "cursor_tool_result");
        assert_eq!(parsed["toolCallId"], "t1");
        assert!(!parsed["isError"].as_bool().unwrap());
    }

    #[test]
    fn test_push_tool_result_line_error_status() {
        let mut jsonl = String::new();
        let header = serde_json::json!({"bubbleId": "b3", "createdAt": "2026-07-01T00:00:02Z"});
        let bdata = serde_json::json!({"toolFormerData": {"name": "shell", "toolCallId": "t2", "result": "Error: fail", "status": "error"}});
        CursorProvider::push_tool_result_line(&mut jsonl, "comp-1", &header, &bdata);
        let parsed: serde_json::Value = serde_json::from_str(jsonl.trim()).unwrap();
        assert!(parsed["isError"].as_bool().unwrap());
    }

    #[test]
    fn test_push_tool_result_line_skips_when_no_result() {
        let mut jsonl = String::new();
        let header = serde_json::json!({"bubbleId": "b4", "createdAt": ""});
        let bdata = serde_json::json!({"toolFormerData": {"name": "read", "toolCallId": "t3"}});
        CursorProvider::push_tool_result_line(&mut jsonl, "comp-1", &header, &bdata);
        // No result field → should skip
        assert!(jsonl.is_empty());
    }

    // ===== resolve_workspace_dir (static fallbacks — DB not mocked) =====

    #[test]
    fn test_resolve_workspace_new_format() {
        // Uses workspaceIdentifier.uri.fsPath (new Cursor format)
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let conn = rusqlite::Connection::open(&db_path).unwrap();
        conn.execute("CREATE TABLE IF NOT EXISTS cursorDiskKV (key TEXT, value TEXT)", []).unwrap();

        let composer = serde_json::json!({
            "workspaceIdentifier": {
                "uri": {"fsPath": "F:\\test\\project"}
            }
        });
        let result = CursorProvider::resolve_workspace_dir(&conn, &composer, "c1", None);
        assert_eq!(result, "F:\\test\\project");
    }

    #[test]
    fn test_resolve_workspace_old_format() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let conn = rusqlite::Connection::open(&db_path).unwrap();
        conn.execute("CREATE TABLE IF NOT EXISTS cursorDiskKV (key TEXT, value TEXT)", []).unwrap();

        let composer = serde_json::json!({
            "workspaceProjectDir": "C:\\old\\format"
        });
        let result = CursorProvider::resolve_workspace_dir(&conn, &composer, "c1", None);
        assert_eq!(result, "C:\\old\\format");
    }

    #[test]
    fn test_resolve_workspace_newly_created_files_fallback() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let conn = rusqlite::Connection::open(&db_path).unwrap();
        conn.execute("CREATE TABLE IF NOT EXISTS cursorDiskKV (key TEXT, value TEXT)", []).unwrap();

        let composer = serde_json::json!({
            "newlyCreatedFiles": [{
                "uri": {"path": "/f:/project/src/index.js"}
            }]
        });
        let result = CursorProvider::resolve_workspace_dir(&conn, &composer, "c1", None);
        if cfg!(windows) {
            assert!(result.contains("project\\src") || result.contains("project/src"));
        } else {
            assert!(result.contains("project/src"));
        }
    }

    #[test]
    fn test_resolve_workspace_empty_when_no_data() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let conn = rusqlite::Connection::open(&db_path).unwrap();
        conn.execute("CREATE TABLE IF NOT EXISTS cursorDiskKV (key TEXT, value TEXT)", []).unwrap();

        let composer = serde_json::json!({});
        let result = CursorProvider::resolve_workspace_dir(&conn, &composer, "c1", None);
        assert_eq!(result, "");
    }

    // ===== Integration: polish_session with generated test data =====

    #[test]
    fn test_polish_session_with_cursor_data() {
        use std::sync::Arc;
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test-cursor-session.jsonl");

        let content = concat!(
            r#"{"type":"session_meta","composerId":"test-composer","workspaceProjectDir":"F:\\test\\project","createdAt":1782985612483,"unifiedMode":"agent","status":"completed","timestamp":"2026-07-02T09:46:52.830Z"}"#,
            "\n",
            r#"{"type":"cursor_bubble","parentComposerId":"test-composer","bubbleId":"b1","bubbleType":1,"text":"Hello Cursor","createdAt":"2026-07-02T09:46:52.830Z","allThinkingBlocks":[],"toolFormerData":null,"codeBlocks":[],"modelInfo":{}}"#,
            "\n",
            r#"{"type":"cursor_bubble","parentComposerId":"test-composer","bubbleId":"b2","bubbleType":2,"text":"Hi there!","createdAt":"2026-07-02T09:46:53.000Z","allThinkingBlocks":[],"toolFormerData":null,"codeBlocks":[],"modelInfo":{}}"#,
            "\n",
        );
        let mut file = std::fs::File::create(&file_path).unwrap();
        file.write_all(content.as_bytes()).unwrap();

        let provider: Arc<dyn ChatProvider> = Arc::new(CursorProvider::new());
        let polished = crate::services::parser::polish_session(
            &file_path,
            &provider,
        )
        .expect("polish should succeed for Cursor session");

        assert_eq!(polished.display, "Hello Cursor");
        assert_eq!(polished.message_count, 2); // 1 user + 1 assistant
        assert_eq!(polished.client_type, "ide");
        assert!(!polished.timestamp.is_empty());
        assert_eq!(polished.cwd, "F:\\test\\project");
    }

    #[test]
    fn test_create_session_summary_uses_data_dir() {
        use std::sync::Arc;
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test-cursor-storage.jsonl");

        let content = concat!(
            r#"{"type":"session_meta","composerId":"test-storage","workspaceProjectDir":"F:\\test\\project","createdAt":1782985612483,"unifiedMode":"agent","status":"completed","timestamp":"2026-07-02T09:46:52.830Z"}"#,
            "\n",
            r#"{"type":"cursor_bubble","parentComposerId":"test-storage","bubbleId":"b1","bubbleType":1,"text":"Hello","createdAt":"2026-07-02T09:46:52.830Z","allThinkingBlocks":[],"toolFormerData":null,"codeBlocks":[],"modelInfo":{}}"#,
            "\n",
        );
        let mut file = std::fs::File::create(&file_path).unwrap();
        file.write_all(content.as_bytes()).unwrap();

        let provider: Arc<dyn ChatProvider> = Arc::new(CursorProvider::new());
        let summary = crate::services::parser::create_session_summary(
            &file_path,
            "test-proj",
            "F:\\test\\project",
            &provider,
            true,
        )
        .expect("create_session_summary should succeed");

        // Cursor 的 data_dir() 返回数据库所在目录，不应等于临时文件父目录
        let temp_parent = dir.path().to_string_lossy().to_string();
        assert!(
            !summary.storage_path.is_empty(),
            "storage_path 不应为空"
        );
        assert_ne!(
            summary.storage_path, temp_parent,
            "Cursor 的 storage_path 应为数据库目录，而非缓存文件父目录"
        );
    }
}
