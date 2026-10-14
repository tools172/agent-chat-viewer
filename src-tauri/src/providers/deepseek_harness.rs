use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::models::{ChatEvent, ContentBlock, EventType};
use crate::providers::base::{ChatProvider, ParseError};
use crate::utils::path::{home_dir, read_session_text};

/// Provider for DeepSeek Harness (`dsh`) chat records.
///
/// ## Storage layout
///
/// The full transcript lives at:
/// `~/.dsh/sessions/--<normalized-cwd>--/<session-id>/session.v4.jsonl.zstd`
///
/// (`--<cwd>--` is a lossy encoding of the workspace directory, so the
/// authoritative `cwd` is read from the header and used for grouping instead.)
/// `session_projcache` under `~/.dsh/storages/` is only a project-level cache
/// (titles + turn outline), not the transcript, so it is not parsed here.
///
/// ## File format
///
/// The `.zstd` file is a concatenation of independent Zstandard frames; after
/// decompression it is JSONL. The first line is an immutable header:
/// `{"type":"session","version":4,"id","createdAt","cwd","delegationDepth",...}`
/// followed by `{"type","seq","time","data"}` event rows:
///
/// - `user/message`      → `data.content: [{type:"text",text}]`
/// - `assistant/message` → `data.message.content` blocks:
///   `reasoning`(text) / `text`(text) / `tool-call`(id,name,arguments=raw string)
/// - `tool/result`       → `data.message.{toolCallId, content, isError}`
/// - `system/message`    → `data.message.content`
/// - everything else (`turn/*`, `step/*`, `request/*`, `session/title`, …)
///   is bookkeeping and skipped.
pub struct DeepSeekHarnessProvider {
    base_dir: PathBuf,
}

impl Default for DeepSeekHarnessProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl DeepSeekHarnessProvider {
    pub fn new() -> Self {
        let base_dir = home_dir().join(".dsh").join("sessions");
        Self { base_dir }
    }

    /// Prefer a natural event id (`data.id` / `data.message.id`), else the
    /// monotonic `seq`, which is unique within a session.
    fn event_id(&self, value: &Value) -> String {
        if let Some(id) = value["data"]["id"].as_str() {
            return id.to_string();
        }
        if let Some(id) = value["data"]["message"]["id"].as_str() {
            return id.to_string();
        }
        value["seq"]
            .as_i64()
            .map(|s| s.to_string())
            .unwrap_or_default()
    }

    /// `time` is a Unix epoch in milliseconds; convert to RFC 3339 so event
    /// timestamps sort/display consistently with the rest of the app.
    fn event_time(&self, value: &Value) -> String {
        value["time"]
            .as_i64()
            .and_then(chrono::DateTime::from_timestamp_millis)
            .map(|dt| dt.to_rfc3339())
            .unwrap_or_default()
    }

    /// Parse a content array (`[{type:"text",text}]`) or a plain string into
    /// text blocks.
    fn parse_text_blocks(content: &Value) -> Vec<ContentBlock> {
        let mut blocks = Vec::new();
        if let Some(text) = content.as_str() {
            blocks.push(ContentBlock::Text {
                text: text.to_string(),
            });
            return blocks;
        }
        if let Some(items) = content.as_array() {
            for item in items {
                if item["type"].as_str() == Some("text") {
                    if let Some(text) = item["text"].as_str() {
                        blocks.push(ContentBlock::Text {
                            text: text.to_string(),
                        });
                    }
                }
            }
        }
        blocks
    }

    /// `tool-call` blocks carry `arguments` as a raw JSON string; parse it back
    /// into an object for `ToolUse::tool_input`, falling back to wrapping the
    /// raw string when it isn't valid JSON.
    fn parse_tool_arguments(arguments: &Value) -> Value {
        if let Some(raw) = arguments.as_str() {
            if let Ok(parsed) = serde_json::from_str::<Value>(raw) {
                return parsed;
            }
            return serde_json::json!({ "arguments": raw });
        }
        arguments.clone()
    }

    fn parse_header(&self, value: &Value) -> ChatEvent {
        let version = value["version"].as_u64().unwrap_or(0);
        let cwd = value["cwd"].as_str().unwrap_or("");
        let id = value["id"].as_str().unwrap_or("");
        ChatEvent {
            uuid: id.to_string(),
            parent_uuid: None,
            event_type: EventType::System,
            timestamp: value["createdAt"]
                .as_i64()
                .and_then(chrono::DateTime::from_timestamp_millis)
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_default(),
            content: vec![ContentBlock::Text {
                text: format!("[Session v{}] cwd: {}", version, cwd),
            }],
            session_id: None,
        }
    }

    fn parse_user_message(&self, value: &Value) -> ChatEvent {
        let content = Self::parse_text_blocks(&value["data"]["content"]);
        // `source.kind == "user"` marks the real user input. Other kinds
        // (`runtime-context`, `skill-catalog`, `model-selection`,
        // `user-approval`, `agent-instructions`, …) are system-injected
        // context recorded in the user stream — surface them as System so
        // they stay hidden by default instead of appearing as user messages.
        let event_type = match value["data"]["source"]["kind"].as_str() {
            Some("user") => EventType::User,
            _ => EventType::System,
        };
        ChatEvent {
            uuid: self.event_id(value),
            parent_uuid: None,
            event_type,
            timestamp: self.event_time(value),
            content,
            session_id: None,
        }
    }

    fn parse_assistant_message(&self, value: &Value) -> ChatEvent {
        let mut blocks = Vec::new();
        if let Some(items) = value["data"]["message"]["content"].as_array() {
            for item in items {
                match item["type"].as_str().unwrap_or("") {
                    "text" => {
                        if let Some(text) = item["text"].as_str() {
                            let trimmed = text.trim();
                            if !trimmed.is_empty() {
                                blocks.push(ContentBlock::Text {
                                    text: trimmed.to_string(),
                                });
                            }
                        }
                    }
                    "reasoning" => {
                        if let Some(text) = item["text"].as_str() {
                            let trimmed = text.trim();
                            if !trimmed.is_empty() {
                                blocks.push(ContentBlock::Thinking {
                                    thinking: trimmed.to_string(),
                                    signature: String::new(),
                                });
                            }
                        }
                    }
                    "tool-call" => {
                        blocks.push(ContentBlock::ToolUse {
                            tool_id: item["id"].as_str().unwrap_or("").to_string(),
                            tool_name: item["name"].as_str().unwrap_or("").to_string(),
                            tool_input: Self::parse_tool_arguments(&item["arguments"]),
                        });
                    }
                    _ => {}
                }
            }
        }
        ChatEvent {
            uuid: self.event_id(value),
            parent_uuid: None,
            event_type: EventType::Assistant,
            timestamp: self.event_time(value),
            content: blocks,
            session_id: None,
        }
    }

    fn parse_tool_result(&self, value: &Value) -> ChatEvent {
        let message = &value["data"]["message"];
        let tool_use_id = message["toolCallId"].as_str().unwrap_or("").to_string();
        let is_error = message["isError"].as_bool().unwrap_or(false);

        let mut text_parts = Vec::new();
        if let Some(items) = message["content"].as_array() {
            for item in items {
                if item["type"].as_str() == Some("text") {
                    if let Some(text) = item["text"].as_str() {
                        text_parts.push(text.to_string());
                    }
                }
            }
        } else if let Some(text) = message["content"].as_str() {
            text_parts.push(text.to_string());
        }
        let content = if text_parts.is_empty() {
            None
        } else {
            Some(text_parts.join("\n"))
        };

        ChatEvent {
            uuid: self.event_id(value),
            parent_uuid: None,
            event_type: EventType::User,
            timestamp: self.event_time(value),
            content: vec![ContentBlock::ToolResult {
                tool_use_id,
                content,
                is_error,
            }],
            session_id: None,
        }
    }

    fn parse_system_message(&self, value: &Value) -> ChatEvent {
        let content = Self::parse_text_blocks(&value["data"]["message"]["content"]);
        ChatEvent {
            uuid: self.event_id(value),
            parent_uuid: None,
            event_type: EventType::System,
            timestamp: self.event_time(value),
            content,
            session_id: None,
        }
    }
}

impl ChatProvider for DeepSeekHarnessProvider {
    fn name(&self) -> &'static str {
        "deepseek_harness"
    }

    fn display_name(&self) -> &'static str {
        "DeepSeek Harness"
    }

    fn default_base_dir(&self) -> PathBuf {
        self.base_dir.clone()
    }

    fn parse_event(&self, line: &str) -> Result<ChatEvent, ParseError> {
        let value: Value = serde_json::from_str(line)?;
        let event_type = value["type"]
            .as_str()
            .ok_or_else(|| ParseError::MissingField("type".to_string()))?;

        match event_type {
            "session" => Ok(self.parse_header(&value)),
            "user/message" => Ok(self.parse_user_message(&value)),
            "assistant/message" => Ok(self.parse_assistant_message(&value)),
            "tool/result" => Ok(self.parse_tool_result(&value)),
            "system/message" => Ok(self.parse_system_message(&value)),
            // Bookkeeping events (turn/step boundaries, request metadata,
            // session/title, standalone tool/call — which is already embedded
            // in the assistant message — etc.) carry no user-visible content.
            _ => Err(ParseError::Skipped),
        }
    }

    fn detect_format(&self, path: &Path) -> bool {
        path.starts_with(home_dir().join(".dsh"))
    }

    fn metadata_path(&self) -> Option<PathBuf> {
        None
    }

    /// The `session` header line carries `version` and a mandatory
    /// `delegationDepth`, which distinguishes it from OpenClaw's
    /// `type:"session"` + `version` header.
    fn detect_by_content(&self, first_lines: &str) -> bool {
        if let Some(first_line) = first_lines.lines().find(|l| !l.trim().is_empty()) {
            if let Ok(value) = serde_json::from_str::<Value>(first_line) {
                return value["type"].as_str() == Some("session")
                    && value["version"].as_u64().is_some()
                    && value["delegationDepth"].as_u64().is_some();
            }
        }
        false
    }

    /// Transcripts are named `session.v4.jsonl.zstd` (or `session.jsonl` with
    /// `compression: none`), regardless of the session id.
    fn is_session_file(&self, path: &Path) -> bool {
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default();
        name.starts_with("session") && (name.ends_with(".jsonl") || name.ends_with(".jsonl.zstd"))
    }

    /// The session id is the directory name (`<session-id>`), not the file
    /// stem (which would always be `session`).
    fn extract_session_id(&self, file_path: &Path) -> Option<String> {
        file_path
            .parent()
            .and_then(|p| p.file_name())
            .and_then(|n| n.to_str())
            .map(String::from)
    }

    /// Transcripts are nested two levels deep:
    /// `--<cwd>--/<session-id>/session.v4.jsonl.zstd`. Walk up to 3 levels to
    /// cover both a `--<cwd>--` dir and the sessions base dir.
    fn enumerate_session_files(&self, project_dir: &Path) -> Vec<PathBuf> {
        let mut files = Vec::new();
        self.collect_session_files(project_dir, 0, &mut files);
        files
    }

    /// Group sessions by the authoritative `cwd` from the header, since the
    /// `--<cwd>--` directory names are lossy/truncated.
    fn use_cwd_grouping(&self) -> bool {
        true
    }

    fn read_session_cwd_from_file(&self, file_path: &Path) -> Option<String> {
        let text = read_session_text(file_path)?;
        let first_line = text.lines().find(|l| !l.trim().is_empty())?;
        let value: Value = serde_json::from_str(first_line).ok()?;
        value["cwd"].as_str().map(String::from)
    }

    fn extract_cwd(&self, value: &Value) -> Option<String> {
        if value["type"].as_str() == Some("session") {
            value["cwd"].as_str().map(String::from)
        } else {
            None
        }
    }

    /// Extract the raw first user text (used for client-type detection).
    fn extract_raw_user_text(&self, value: &Value) -> Option<String> {
        let content = &value["data"]["content"];
        if let Some(text) = content[0]["text"].as_str() {
            if !text.is_empty() {
                return Some(text.to_string());
            }
        }
        content.as_str().filter(|t| !t.is_empty()).map(String::from)
    }

    /// DeepSeek Harness 会话没有可靠的客户端标识字段，统一按 CLI 处理。
    /// 返回非空值使 `client_type` 得以填充，避免前端误判为骨架占位。
    fn detect_client_from_text(&self, _text: &str) -> &'static str {
        "cli"
    }
}

impl DeepSeekHarnessProvider {
    fn collect_session_files(&self, dir: &Path, depth: u32, out: &mut Vec<PathBuf>) {
        if depth > 3 || !dir.is_dir() {
            return;
        }
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if self.is_session_file(&path) {
                    out.push(path);
                }
            } else if path.is_dir() {
                self.collect_session_files(&path, depth + 1, out);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(line: &str) -> ChatEvent {
        DeepSeekHarnessProvider::new()
            .parse_event(line)
            .expect("parse should succeed")
    }

    #[test]
    fn test_parse_header() {
        let line = r#"{"type":"session","version":4,"id":"session-1","createdAt":1791911108529,"cwd":"F:\\work\\repo","isSeeded":false,"delegationDepth":0,"agentPreset":"standard"}"#;
        let event = parse(line);
        assert_eq!(event.uuid, "session-1");
        assert!(matches!(event.event_type, EventType::System));
        match &event.content[0] {
            ContentBlock::Text { text } => {
                assert!(text.contains("Session v4"));
                assert!(text.contains("repo"));
            }
            _ => panic!("expected text block"),
        }
    }

    #[test]
    fn test_parse_user_message() {
        let line = r#"{"type":"user/message","seq":8,"time":1791911122009,"data":{"content":[{"type":"text","text":"hello"}],"source":{"kind":"user"},"role":"user","id":"u-1"},"surfaceOp":"append"}"#;
        let event = parse(line);
        assert_eq!(event.uuid, "u-1");
        assert!(matches!(event.event_type, EventType::User));
        match &event.content[0] {
            ContentBlock::Text { text } => assert_eq!(text, "hello"),
            _ => panic!("expected text block"),
        }
    }

    #[test]
    fn test_parse_user_message_injected_context_maps_to_system() {
        // dsh records system-injected context (runtime snapshot, skill
        // catalog, model-change notices, …) as user/message rows with a
        // non-"user" source.kind. These must not surface as user messages.
        let line = r#"{"type":"user/message","seq":9,"time":1791911122010,"data":{"content":[{"type":"text","text":"Current runtime context. This snapshot supersedes earlier runtime-context snapshots."}],"source":{"kind":"runtime-context"},"role":"user","id":"u-2"},"surfaceOp":"append"}"#;
        let event = parse(line);
        assert!(matches!(event.event_type, EventType::System));
    }

    #[test]
    fn test_extract_raw_user_text() {
        let provider = DeepSeekHarnessProvider::new();
        let value: Value = serde_json::from_str(
            r#"{"type":"user/message","data":{"content":[{"type":"text","text":"真实输入"}]}}"#,
        )
        .unwrap();
        assert_eq!(
            provider.extract_raw_user_text(&value),
            Some("真实输入".to_string())
        );
    }

    #[test]
    fn test_detect_client_from_text_non_empty() {
        let provider = DeepSeekHarnessProvider::new();
        assert_eq!(provider.detect_client_from_text("任意文本"), "cli");
    }

    #[test]
    fn test_parse_assistant_blocks() {
        let line = r#"{"type":"assistant/message","seq":9,"time":1791911123009,"data":{"turn":1,"step":1,"message":{"role":"assistant","content":[{"type":"reasoning","text":"think"},{"type":"text","text":"ok"},{"type":"tool-call","id":"call_1","name":"write","arguments":"{\"file_path\":\"C:/a.ps1\"}"}],"id":"a-1"}},"surfaceOp":"append"}"#;
        let event = parse(line);
        assert!(matches!(event.event_type, EventType::Assistant));
        assert_eq!(event.content.len(), 3);
        assert!(matches!(event.content[0], ContentBlock::Thinking { .. }));
        assert!(matches!(event.content[1], ContentBlock::Text { .. }));
        match &event.content[2] {
            ContentBlock::ToolUse {
                tool_id,
                tool_name,
                tool_input,
            } => {
                assert_eq!(tool_id, "call_1");
                assert_eq!(tool_name, "write");
                assert_eq!(tool_input["file_path"], "C:/a.ps1");
            }
            _ => panic!("expected tool use block"),
        }
    }

    #[test]
    fn test_parse_tool_result() {
        let line = r#"{"type":"tool/result","seq":10,"time":1791911124009,"data":{"turn":1,"step":1,"message":{"role":"tool","toolCallId":"call_1","content":[{"type":"text","text":"Created file"}],"isError":false,"id":"tr-1"}},"surfaceOp":"append"}"#;
        let event = parse(line);
        assert!(matches!(event.event_type, EventType::User));
        match &event.content[0] {
            ContentBlock::ToolResult {
                tool_use_id,
                content,
                is_error,
            } => {
                assert_eq!(tool_use_id, "call_1");
                assert_eq!(content.as_deref(), Some("Created file"));
                assert!(!is_error);
            }
            _ => panic!("expected tool result block"),
        }
    }

    #[test]
    fn test_parse_skips_bookkeeping() {
        let line = r#"{"type":"turn/start","seq":4,"time":1791911121940,"data":{"turn":1}}"#;
        let result = DeepSeekHarnessProvider::new().parse_event(line);
        assert!(matches!(result, Err(ParseError::Skipped)));
    }

    #[test]
    fn test_detect_by_content() {
        let provider = DeepSeekHarnessProvider::new();
        let content = r#"{"type":"session","version":4,"id":"session-1","createdAt":1791911108529,"cwd":"/work","delegationDepth":0}
{"type":"user/message","seq":8,"time":1791911122009,"data":{"content":[{"type":"text","text":"hi"}]}}"#;
        assert!(provider.detect_by_content(content));
    }

    #[test]
    fn test_detect_by_content_rejects_openclaw() {
        let provider = DeepSeekHarnessProvider::new();
        // OpenClaw header: type:"session" + version, but no delegationDepth
        let content = r#"{"type":"session","version":3,"id":"abc","timestamp":"2026-01-01T00:00:00Z","cwd":"/home/u/ws"}"#;
        assert!(!provider.detect_by_content(content));
    }

    #[test]
    fn test_extract_cwd_from_header() {
        let provider = DeepSeekHarnessProvider::new();
        let value: Value = serde_json::from_str(
            r#"{"type":"session","version":4,"cwd":"F:\\work\\repo","delegationDepth":0}"#,
        )
        .unwrap();
        assert_eq!(
            provider.extract_cwd(&value),
            Some("F:\\work\\repo".to_string())
        );
    }

    #[test]
    fn test_extract_session_id_from_parent_dir() {
        let provider = DeepSeekHarnessProvider::new();
        let path = Path::new("/home/u/.dsh/sessions/--work--/session-abc/session.v4.jsonl.zstd");
        assert_eq!(
            provider.extract_session_id(path),
            Some("session-abc".to_string())
        );
    }

    #[test]
    fn test_is_session_file() {
        let provider = DeepSeekHarnessProvider::new();
        assert!(provider.is_session_file(Path::new("session.v4.jsonl.zstd")));
        assert!(provider.is_session_file(Path::new("session.jsonl")));
        assert!(!provider.is_session_file(Path::new("notes.txt")));
        assert!(!provider.is_session_file(Path::new("other.jsonl")));
    }
}
