use std::path::{Path, PathBuf};

use crate::models::{ChatEvent, ContentBlock, EventType};
use crate::providers::base::{ChatProvider, ParseError};

/// Provider for Codex (OpenAI) chat records.
///
/// Codex stores sessions as JSONL files under a date-based directory:
/// `~/.codex/sessions/<YYYY>/<MM>/<DD>/<rollout-id>.jsonl`
///
/// ## JSONL Format
///
/// Each line is a JSON object with a `type` field:
/// - `session_meta` — session metadata (id, cwd, timestamp)
/// - `event_msg` — event messages (task_started, user_message, agent_message,
///   agent_reasoning, task_complete, token_count, turn_aborted)
/// - `response_item` — actual chat content:
///   - `message` (role: `user`) → user input (content type: `input_text`)
///   - `message` (role: `assistant`) → AI response (content type: `output_text`)
///   - `message` (role: `developer`) → system/developer instructions
///   - `function_call` → tool call request (parsed as ToolUse)
///   - `function_call_output` → tool call result (parsed as ToolResult)
/// - `turn_context` — turn-level context (model, cwd, etc.)
pub struct CodexProvider {
    base_dir: PathBuf,
}

impl CodexProvider {
    pub fn new() -> Self {
        let home = home_dir();
        let base_dir = home.join(".codex").join("sessions");
        Self { base_dir }
    }

    /// Parse a response_item line into a ChatEvent
    fn parse_response_item(value: &serde_json::Value) -> Result<ChatEvent, ParseError> {
        let payload = value.get("payload").ok_or_else(|| {
            ParseError::MissingField("payload".to_string())
        })?;

        let item_type = payload["type"].as_str().unwrap_or("");

        match item_type {
            "message" => Self::parse_message_response_item(value, payload),
            "function_call" => Self::parse_function_call(value, payload),
            "function_call_output" => Self::parse_function_call_output(value, payload),
            other => Err(ParseError::UnknownEventType(format!(
                "response_item type: {}",
                other
            ))),
        }
    }

    /// Parse a "message" type response_item
    fn parse_message_response_item(
        value: &serde_json::Value,
        payload: &serde_json::Value,
    ) -> Result<ChatEvent, ParseError> {
        let role = payload["role"].as_str().unwrap_or("unknown");

        let event_type = match role {
            "user" => EventType::User,
            "assistant" => EventType::Assistant,
            "developer" => EventType::System,
            other => EventType::Unknown(other.to_string()),
        };

        let mut content = Self::parse_content(payload);

        // For User events, clean provider-specific XML metadata from text blocks
        if event_type == EventType::User {
            content = content
                .into_iter()
                .filter_map(|block| {
                    if let ContentBlock::Text { text } = &block {
                        let cleaned = clean_codex_user_text(text);
                        if cleaned.is_empty() {
                            return None;
                        }
                        return Some(ContentBlock::Text { text: cleaned });
                    }
                    Some(block)
                })
                .collect();
        }

        let timestamp = value["timestamp"].as_str().unwrap_or("").to_string();
        let uuid = format!("codex-{}-{}", timestamp.replace([':', '.', '-'], ""), role);

        Ok(ChatEvent {
            uuid,
            parent_uuid: None,
            event_type,
            timestamp,
            content,
            session_id: None,
        })
    }

    /// Parse a "function_call" response_item into a ToolUse event
    fn parse_function_call(
        value: &serde_json::Value,
        payload: &serde_json::Value,
    ) -> Result<ChatEvent, ParseError> {
        let call_id = payload["call_id"].as_str().unwrap_or("unknown").to_string();
        let name = payload["name"].as_str().unwrap_or("unknown").to_string();
        // Codex stores arguments as a JSON string; parse it into a Value,
        // falling back to a JSON string wrapper if parsing fails.
        let tool_input: serde_json::Value = payload["arguments"]
            .as_str()
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or_else(|| {
                serde_json::Value::String(
                    payload["arguments"].as_str().unwrap_or("").to_string(),
                )
            });

        let timestamp = value["timestamp"].as_str().unwrap_or("").to_string();
        let uuid = format!(
            "codex-tool-{}",
            timestamp.replace([':', '.', '-'], "")
        );

        Ok(ChatEvent {
            uuid,
            parent_uuid: None,
            event_type: EventType::Assistant,
            timestamp,
            content: vec![ContentBlock::ToolUse {
                tool_id: call_id,
                tool_name: name,
                tool_input,
            }],
            session_id: None,
        })
    }

    /// Parse a "function_call_output" response_item into a ToolResult event
    fn parse_function_call_output(
        value: &serde_json::Value,
        payload: &serde_json::Value,
    ) -> Result<ChatEvent, ParseError> {
        let call_id = payload["call_id"].as_str().unwrap_or("unknown").to_string();
        let output = payload["output"].as_str().unwrap_or("").to_string();

        // Detect error from output content (Codex shell commands indicate
        // failure via non-zero exit code or stderr patterns)
        let is_error = output.contains("Exit code: 1")
            || output.starts_with("Error:")
            || output.contains("FullyQualifiedErrorId");

        let timestamp = value["timestamp"].as_str().unwrap_or("").to_string();
        let uuid = format!(
            "codex-result-{}",
            timestamp.replace([':', '.', '-'], "")
        );

        Ok(ChatEvent {
            uuid,
            parent_uuid: None,
            event_type: EventType::User,
            timestamp,
            content: vec![ContentBlock::ToolResult {
                tool_use_id: call_id,
                content: if output.is_empty() { None } else { Some(output) },
                is_error,
            }],
            session_id: None,
        })
    }

    /// Parse content blocks from a response_item payload
    fn parse_content(payload: &serde_json::Value) -> Vec<ContentBlock> {
        let mut blocks = Vec::new();

        if let Some(content_arr) = payload["content"].as_array() {
            for item in content_arr {
                let content_type = item["type"].as_str().unwrap_or("");

                if let Some(text) = item["text"].as_str() {
                    match content_type {
                        "input_text" | "output_text" => {
                            blocks.push(ContentBlock::Text {
                                text: text.to_string(),
                            });
                        }
                        _ => {
                            // Catch-all for unknown content types that have text
                            blocks.push(ContentBlock::Text {
                                text: text.to_string(),
                            });
                        }
                    }
                }
            }
        }

        blocks
    }

    /// Parse a user_message event_msg into a ChatEvent
    fn parse_user_message_event(value: &serde_json::Value) -> Result<ChatEvent, ParseError> {
        let payload = value.get("payload").ok_or_else(|| {
            ParseError::MissingField("payload".to_string())
        })?;

        let message = clean_codex_user_text(
            payload["message"].as_str().unwrap_or("")
        );

        let timestamp = value["timestamp"].as_str().unwrap_or("").to_string();
        let uuid = format!(
            "codex-msg-{}",
            timestamp.replace([':', '.', '-'], "")
        );

        Ok(ChatEvent {
            uuid,
            parent_uuid: None,
            event_type: EventType::User,
            timestamp,
            content: vec![ContentBlock::Text { text: message }],
            session_id: None,
        })
    }

    /// Parse a session_meta line into a ChatEvent (treated as System)
    fn parse_session_meta(value: &serde_json::Value) -> Result<ChatEvent, ParseError> {
        let payload = value.get("payload").ok_or_else(|| {
            ParseError::MissingField("payload".to_string())
        })?;

        let session_id = payload["id"].as_str().unwrap_or("unknown").to_string();
        let cwd = payload["cwd"].as_str().unwrap_or("").to_string();
        let timestamp = value["timestamp"].as_str().unwrap_or("").to_string();
        let cli_version = payload["cli_version"].as_str().unwrap_or("");
        let source = payload["source"].as_str().unwrap_or("");

        Ok(ChatEvent {
            uuid: format!("codex-session-{}", session_id),
            parent_uuid: None,
            event_type: EventType::System,
            timestamp,
            content: vec![ContentBlock::Text {
                text: format!(
                    "Codex session: cwd={}, version={}, source={}",
                    cwd, cli_version, source
                ),
            }],
            session_id: Some(session_id),
        })
    }
    /// Parse an agent_message event_msg into a ChatEvent (assistant response)
    fn parse_agent_message_event(value: &serde_json::Value) -> Result<ChatEvent, ParseError> {
        let payload = value.get("payload").ok_or_else(|| {
            ParseError::MissingField("payload".to_string())
        })?;

        let message = payload["message"].as_str().unwrap_or("").to_string();
        let timestamp = value["timestamp"].as_str().unwrap_or("").to_string();
        let uuid = format!("codex-agent-msg-{}", timestamp.replace([':', '.', '-'], ""));

        Ok(ChatEvent {
            uuid,
            parent_uuid: None,
            event_type: EventType::Assistant,
            timestamp,
            content: vec![ContentBlock::Text { text: message }],
            session_id: None,
        })
    }

    /// Parse an agent_reasoning event_msg into a ChatEvent (thinking/reasoning)
    fn parse_agent_reasoning_event(value: &serde_json::Value) -> Result<ChatEvent, ParseError> {
        let payload = value.get("payload").ok_or_else(|| {
            ParseError::MissingField("payload".to_string())
        })?;

        let text = payload["text"].as_str().unwrap_or("").to_string();
        let timestamp = value["timestamp"].as_str().unwrap_or("").to_string();
        let uuid = format!("codex-reasoning-{}", timestamp.replace([':', '.', '-'], ""));

        Ok(ChatEvent {
            uuid,
            parent_uuid: None,
            event_type: EventType::Assistant,
            timestamp,
            content: vec![ContentBlock::Thinking {
                thinking: text,
                signature: String::new(),
            }],
            session_id: None,
        })
    }
}

/// Clean Codex user message text by removing XML metadata tags.
///
/// Codex prepends context tags before the actual user input:
/// - `<environment_context>...</environment_context>` — shell, cwd, platform info
/// - `<app-context>...</app-context>` — application context
/// - `<permissions instructions>...</permissions instructions>` — tool permissions
/// - `<skills_instructions>...</skills_instructions>` — skill instructions
/// - `<plugins_instructions>...</plugins_instructions>` — plugin instructions
/// - `<collaboration_mode>...</collaboration_mode>` — collaboration mode config
fn clean_codex_user_text(text: &str) -> String {
    let mut result = text;
    for tag in &["</environment_context>", "</app-context>",
                  "</permissions instructions>", "</skills_instructions>",
                  "</plugins_instructions>", "</collaboration_mode>"] {
        if let Some(end) = result.find(tag) {
            result = result[end + tag.len()..].trim_start();
        }
    }
    if result.is_empty() {
        String::new()
    } else {
        result.to_string()
    }
}

impl ChatProvider for CodexProvider {
    fn name(&self) -> &'static str {
        "codex"
    }

    fn display_name(&self) -> &'static str {
        "Codex"
    }

    fn default_base_dir(&self) -> PathBuf {
        self.base_dir.clone()
    }

    fn parse_event(&self, line: &str) -> Result<ChatEvent, ParseError> {
        let value: serde_json::Value = serde_json::from_str(line)?;

        let event_type = value["type"].as_str().unwrap_or("");

        match event_type {
            "response_item" => Self::parse_response_item(&value),
            "session_meta" => Self::parse_session_meta(&value),
            "event_msg" => {
                let payload_type = value["payload"]["type"].as_str().unwrap_or("");
                match payload_type {
                    "user_message" => Self::parse_user_message_event(&value),
                    "agent_message" => Self::parse_agent_message_event(&value),
                    "agent_reasoning" => Self::parse_agent_reasoning_event(&value),
                    "task_started" | "task_complete" | "token_count"
                    | "turn_aborted" =>
                    {
                        Err(ParseError::UnknownEventType(format!(
                            "event_msg: {} (skipped)",
                            payload_type
                        )))
                    }
                    _ => Err(ParseError::UnknownEventType(format!(
                        "event_msg: {} (unrecognized, skipped)",
                        payload_type
                    ))),
                }
            }
            // Skip turn_context lines
            other => Err(ParseError::UnknownEventType(other.to_string())),
        }
    }

    fn detect_format(&self, path: &Path) -> bool {
        // Codex stores data under ~/.codex/sessions/
        let home = home_dir();
        let codex_sessions = home.join(".codex").join("sessions");
        path.starts_with(&codex_sessions)
    }

    fn metadata_path(&self) -> Option<PathBuf> {
        None
    }

    fn session_extension(&self) -> &'static str {
        "jsonl"
    }

    /// Codex sessions are nested: sessions/<YYYY>/<MM>/<DD>/<file>.jsonl
    /// The project_dir is typically a year directory (e.g. sessions/2026),
    /// so we recurse up to 2 levels deep (month/day) to find session files.
    fn enumerate_session_files(&self, project_dir: &Path) -> Vec<PathBuf> {
        let mut files = Vec::new();

        // Scan up to 3 levels deep from project_dir: month/day/*.jsonl
        // Use a stack for iterative DFS
        let mut stack: Vec<(PathBuf, u32)> = vec![(project_dir.to_path_buf(), 0)];

        while let Some((dir, depth)) = stack.pop() {
            if depth > 2 {
                // Only go 2 levels deep: month/ -> day/ -> files
                continue;
            }

            if let Ok(entries) = std::fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() && depth < 2 {
                        stack.push((path, depth + 1));
                    } else if path.is_file() && self.is_session_file(&path) {
                        files.push(path);
                    }
                }
            }
        }

        files
    }

    fn detect_by_content(&self, first_lines: &str) -> bool {
        if let Some(first_line) = first_lines.lines().find(|l| !l.trim().is_empty()) {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(first_line) {
                if let Some(event_type) = value["type"].as_str() {
                    return matches!(
                        event_type,
                        "session_meta" | "response_item" | "event_msg"
                    );
                }
            }
        }
        false
    }

    fn clean_display_text(&self, text: &str) -> String {
        clean_codex_user_text(text)
    }

    fn detect_client_from_text(&self, text: &str) -> &'static str {
        if text.contains("<environment_context>") || text.contains("<app-context>") {
            "desktop"
        } else {
            "desktop"
        }
    }

    /// Codex nests cwd inside payload.cwd
    fn extract_cwd(&self, value: &serde_json::Value) -> Option<String> {
        if let Some(cwd) = value["payload"]["cwd"].as_str() {
            return Some(cwd.to_string());
        }
        None
    }

    fn extract_raw_user_text(&self, value: &serde_json::Value) -> Option<String> {
        // response_item user message: payload.content[0].text
        if let Some(text) = value["payload"]["content"][0]["text"].as_str() {
            if !text.is_empty() {
                return Some(text.to_string());
            }
        }
        // event_msg user_message: payload.message
        if let Some(text) = value["payload"]["message"].as_str() {
            if !text.is_empty() {
                return Some(text.to_string());
            }
        }
        None
    }
}

/// Read the working directory (cwd) from a Codex session file.
///
/// Codex JSONL files always start with a `session_meta` line that contains
/// `payload.cwd`. This function reads only the first line to extract it,
/// avoiding the cost of reading the entire file.
pub fn read_session_cwd(file_path: &Path) -> Option<String> {
    use std::io::{BufRead, BufReader};
    let file = std::fs::File::open(file_path).ok()?;
    let mut reader = BufReader::new(file);
    let mut first_line = String::new();
    reader.read_line(&mut first_line).ok()?;
    let value: serde_json::Value = serde_json::from_str(&first_line).ok()?;
    value["payload"]["cwd"].as_str().map(String::from)
}

/// Helper to get the user's home directory (cross-platform)
fn home_dir() -> PathBuf {
    if let Ok(home) = std::env::var("USERPROFILE") {
        return PathBuf::from(home);
    }
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home);
    }
    PathBuf::from(".")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_session_meta() {
        let provider = CodexProvider::new();
        let line = r#"{"timestamp":"2026-06-14T16:19:09.155Z","type":"session_meta","payload":{"id":"test-session-id","timestamp":"2026-06-14T16:19:08.742Z","cwd":"C:\\Users\\test\\project","originator":"Codex Desktop","cli_version":"0.140.0","source":"vscode","thread_source":"user","model_provider":"custom"}}"#;

        let event = provider.parse_event(line).unwrap();
        assert_eq!(event.event_type, EventType::System);
        assert_eq!(event.session_id.as_deref(), Some("test-session-id"));
        assert_eq!(event.content.len(), 1);
    }

    #[test]
    fn test_parse_user_response_item() {
        let provider = CodexProvider::new();
        let line = r#"{"timestamp":"2026-06-14T16:19:09.180Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"Hello, who are you?"}]}}"#;

        let event = provider.parse_event(line).unwrap();
        assert_eq!(event.event_type, EventType::User);
        assert_eq!(event.content.len(), 1);
        match &event.content[0] {
            ContentBlock::Text { text } => assert_eq!(text, "Hello, who are you?"),
            _ => panic!("Expected Text block"),
        }
    }

    #[test]
    fn test_parse_assistant_response_item() {
        let provider = CodexProvider::new();
        let line = r#"{"timestamp":"2026-06-14T16:41:44.033Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"I am Codex, based on GPT-5."}]}}"#;

        let event = provider.parse_event(line).unwrap();
        assert_eq!(event.event_type, EventType::Assistant);
        assert_eq!(event.content.len(), 1);
        match &event.content[0] {
            ContentBlock::Text { text } => assert_eq!(text, "I am Codex, based on GPT-5."),
            _ => panic!("Expected Text block"),
        }
    }

    #[test]
    fn test_parse_developer_response_item() {
        let provider = CodexProvider::new();
        let line = r#"{"timestamp":"2026-06-14T16:19:09.180Z","type":"response_item","payload":{"type":"message","role":"developer","content":[{"type":"input_text","text":"System instructions here"}]}}"#;

        let event = provider.parse_event(line).unwrap();
        assert_eq!(event.event_type, EventType::System);
    }

    #[test]
    fn test_parse_user_message_event() {
        let provider = CodexProvider::new();
        let line = r#"{"timestamp":"2026-06-14T16:19:09.195Z","type":"event_msg","payload":{"type":"user_message","client_id":"test-client","message":"Hello","images":[],"local_images":[],"text_elements":[]}}"#;

        let event = provider.parse_event(line).unwrap();
        assert_eq!(event.event_type, EventType::User);
        match &event.content[0] {
            ContentBlock::Text { text } => assert_eq!(text, "Hello"),
            _ => panic!("Expected Text block"),
        }
    }

    #[test]
    fn test_skip_task_started_event_msg() {
        let provider = CodexProvider::new();
        let line = r#"{"timestamp":"2026-06-14T16:19:09.157Z","type":"event_msg","payload":{"type":"task_started","turn_id":"test-turn","started_at":123,"model_context_window":950000,"collaboration_mode_kind":"default"}}"#;

        // task_started should be skipped (returns Err so caller filters it out)
        let result = provider.parse_event(line);
        assert!(result.is_err());
    }

    #[test]
    fn test_skip_turn_context() {
        let provider = CodexProvider::new();
        let line = r#"{"timestamp":"2026-06-14T16:19:09.180Z","type":"turn_context","payload":{"turn_id":"test-turn","cwd":"/test"}}"#;

        let result = provider.parse_event(line);
        assert!(result.is_err());
    }

    #[test]
    fn test_detect_by_content_session_meta() {
        let provider = CodexProvider::new();
        let content = r#"{"timestamp":"2026-06-14T16:19:09.155Z","type":"session_meta","payload":{"id":"test","cwd":"/test"}}"#;
        assert!(provider.detect_by_content(content));
    }

    #[test]
    fn test_detect_by_content_response_item() {
        let provider = CodexProvider::new();
        let content = r#"{"timestamp":"2026-06-14T16:19:09.180Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"Hello"}]}}"#;
        assert!(provider.detect_by_content(content));
    }

    #[test]
    fn test_detect_by_content_rejects_other_format() {
        let provider = CodexProvider::new();
        // Claude Code format
        let content = r#"{"type":"user","message":{"role":"user","content":"Hello"},"uuid":"u-001","timestamp":"2026-06-09T10:00:00Z","sessionId":"s1"}"#;
        assert!(!provider.detect_by_content(content));
    }

    #[test]
    fn test_detect_by_content_empty() {
        let provider = CodexProvider::new();
        assert!(!provider.detect_by_content(""));
    }

    #[test]
    fn test_parse_agent_message_event() {
        let provider = CodexProvider::new();
        let line = r#"{"timestamp":"2026-06-14T16:41:44.033Z","type":"event_msg","payload":{"type":"agent_message","message":"I am Codex, based on GPT-5.","phase":null,"memory_citation":null}}"#;

        let event = provider.parse_event(line).unwrap();
        assert_eq!(event.event_type, EventType::Assistant);
        match &event.content[0] {
            ContentBlock::Text { text } => assert_eq!(text, "I am Codex, based on GPT-5."),
            _ => panic!("Expected Text block"),
        }
    }

    #[test]
    fn test_parse_agent_reasoning_event() {
        let provider = CodexProvider::new();
        let line = r#"{"timestamp":"2026-06-14T16:41:42.747Z","type":"event_msg","payload":{"type":"agent_reasoning","text":"The user is asking what model I am."}}"#;

        let event = provider.parse_event(line).unwrap();
        assert_eq!(event.event_type, EventType::Assistant);
        match &event.content[0] {
            ContentBlock::Thinking { thinking, .. } => assert_eq!(thinking, "The user is asking what model I am."),
            _ => panic!("Expected Thinking block"),
        }
    }

    #[test]
    fn test_skip_token_count_event_msg() {
        let provider = CodexProvider::new();
        let line = r#"{"timestamp":"2026-06-14T16:41:44.050Z","type":"event_msg","payload":{"type":"token_count","input_tokens":100,"output_tokens":50}}"#;

        let result = provider.parse_event(line);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_function_call() {
        let provider = CodexProvider::new();
        let line = r#"{"timestamp":"2026-06-14T16:19:10.000Z","type":"response_item","payload":{"type":"function_call","name":"shell_command","arguments":"{\"command\":\"cargo build\"}","call_id":"call_00_test123"}}"#;

        let event = provider.parse_event(line).unwrap();
        assert_eq!(event.event_type, EventType::Assistant);
        assert_eq!(event.content.len(), 1);
        match &event.content[0] {
            ContentBlock::ToolUse {
                tool_id,
                tool_name,
                tool_input,
            } => {
                assert_eq!(tool_id, "call_00_test123");
                assert_eq!(tool_name, "shell_command");
                assert_eq!(tool_input["command"], "cargo build");
            }
            _ => panic!("Expected ToolUse block"),
        }
    }

    #[test]
    fn test_parse_function_call_output() {
        let provider = CodexProvider::new();
        let line = r#"{"timestamp":"2026-06-14T16:19:12.000Z","type":"response_item","payload":{"type":"function_call_output","call_id":"call_00_test123","output":"Exit code: 0\nOutput:\nBuild succeeded"}}"#;

        let event = provider.parse_event(line).unwrap();
        assert_eq!(event.event_type, EventType::User);
        assert_eq!(event.content.len(), 1);
        match &event.content[0] {
            ContentBlock::ToolResult {
                tool_use_id,
                content,
                is_error,
            } => {
                assert_eq!(tool_use_id, "call_00_test123");
                assert_eq!(
                    content.as_deref(),
                    Some("Exit code: 0\nOutput:\nBuild succeeded")
                );
                assert!(!is_error);
            }
            _ => panic!("Expected ToolResult block"),
        }
    }

    #[test]
    fn test_parse_function_call_output_error() {
        let provider = CodexProvider::new();
        let line = r#"{"timestamp":"2026-06-14T16:19:12.000Z","type":"response_item","payload":{"type":"function_call_output","call_id":"call_err_1","output":"Exit code: 1\nFullyQualifiedErrorId : CommandNotFound"}}"#;

        let event = provider.parse_event(line).unwrap();
        assert_eq!(event.event_type, EventType::User);
        match &event.content[0] {
            ContentBlock::ToolResult { is_error, .. } => {
                assert!(is_error);
            }
            _ => panic!("Expected ToolResult block"),
        }
    }

    #[test]
    fn test_parse_function_call_output_empty() {
        let provider = CodexProvider::new();
        let line = r#"{"timestamp":"2026-06-14T16:19:12.000Z","type":"response_item","payload":{"type":"function_call_output","call_id":"call_empty","output":""}}"#;

        let event = provider.parse_event(line).unwrap();
        match &event.content[0] {
            ContentBlock::ToolResult { content, is_error, .. } => {
                assert!(content.is_none());
                assert!(!is_error);
            }
            _ => panic!("Expected ToolResult block"),
        }
    }

    #[test]
    fn test_skip_turn_aborted_event_msg() {
        let provider = CodexProvider::new();
        let line = r#"{"timestamp":"2026-06-14T16:19:12.000Z","type":"event_msg","payload":{"type":"turn_aborted","turn_id":"test-turn"}}"#;

        let result = provider.parse_event(line);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_function_call_with_complex_arguments() {
        let provider = CodexProvider::new();
        // update_plan has nested JSON in arguments
        let line = r#"{"timestamp":"2026-06-14T16:20:00.000Z","type":"response_item","payload":{"type":"function_call","name":"update_plan","arguments":"{\"plan\":[{\"status\":\"in_progress\",\"step\":\"Test\"}],\"explanation\":\"update\"}","call_id":"call_plan_1"}}"#;

        let event = provider.parse_event(line).unwrap();
        match &event.content[0] {
            ContentBlock::ToolUse { tool_input, .. } => {
                assert_eq!(tool_input["plan"][0]["step"], "Test");
                assert_eq!(tool_input["explanation"], "update");
            }
            _ => panic!("Expected ToolUse block"),
        }
    }

    #[test]
    fn test_polish_session_with_realistic_data() {
        use std::io::Write;
        let provider = CodexProvider::new();
        // Simulate a minimal realistic Codex session
        let content = concat!(
            r#"{"timestamp":"2026-06-14T16:19:09.155Z","type":"session_meta","payload":{"id":"test-session","cwd":"C:\\Users\\test\\project","cli_version":"0.140.0","source":"vscode"}}"#,
            "\n",
            r#"{"timestamp":"2026-06-14T16:19:09.180Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"你好，请帮我写代码"}]}}"#,
            "\n",
            r#"{"timestamp":"2026-06-14T16:19:10.000Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"好的，我来帮你写代码。"}]}}"#,
            "\n",
        );

        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test-codex-session.jsonl");
        let mut file = std::fs::File::create(&file_path).unwrap();
        file.write_all(content.as_bytes()).unwrap();

        let provider: std::sync::Arc<dyn ChatProvider> = std::sync::Arc::new(provider);
        let polished = crate::services::parser::polish_session(
            &file_path,
            &provider,
        )
        .expect("polish should succeed for Codex session");

        assert_eq!(polished.display, "你好，请帮我写代码");
        assert_eq!(polished.message_count, 2); // 1 user + 1 assistant
        assert!(!polished.timestamp.is_empty());
    }

    // ===== clean_codex_user_text tests =====

    #[test]
    fn test_clean_environment_context_preserves_user_message() {
        let input = "<environment_context>\n  <cwd>/test</cwd>\n  <shell>powershell</shell>\n</environment_context>\n今天几号了？";
        let result = clean_codex_user_text(input);
        assert_eq!(result, "今天几号了？");
    }

    #[test]
    fn test_clean_environment_context_only() {
        let input = "<environment_context>\n  <cwd>/test</cwd>\n  <shell>powershell</shell>\n</environment_context>";
        let result = clean_codex_user_text(input);
        assert_eq!(result, "");
    }

    #[test]
    fn test_clean_mixed_codex_tags() {
        let input = "<environment_context>\n  <cwd>/test</cwd>\n</environment_context>\n<app-context>Codex Desktop</app-context>\n请帮我写代码";
        let result = clean_codex_user_text(input);
        assert_eq!(result, "请帮我写代码");
    }

    #[test]
    fn test_clean_permissions_instructions() {
        let input = "<permissions instructions>You have full access.</permissions instructions>\nRun the tests";
        let result = clean_codex_user_text(input);
        assert_eq!(result, "Run the tests");
    }

    #[test]
    fn test_clean_plain_text_passthrough() {
        let input = "Hello, who are you?";
        let result = clean_codex_user_text(input);
        assert_eq!(result, "Hello, who are you?");
    }

    #[test]
    fn test_parse_user_response_item_with_environment_context() {
        let provider = CodexProvider::new();
        let line = r#"{"timestamp":"2026-06-14T16:19:09.180Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"<environment_context>\n  <cwd>/test</cwd>\n</environment_context>\n今天几号了？"}]}}"#;
        let event = provider.parse_event(line).unwrap();
        assert_eq!(event.event_type, EventType::User);
        assert_eq!(event.content.len(), 1);
        match &event.content[0] {
            ContentBlock::Text { text } => assert_eq!(text, "今天几号了？"),
            _ => panic!("Expected Text block"),
        }
    }

    #[test]
    fn test_parse_user_message_event_cleaned() {
        let provider = CodexProvider::new();
        let line = r#"{"timestamp":"2026-06-14T16:19:09.195Z","type":"event_msg","payload":{"type":"user_message","client_id":"test-client","message":"<app-context>desktop</app-context>\nHello","images":[],"local_images":[],"text_elements":[]}}"#;
        let event = provider.parse_event(line).unwrap();
        assert_eq!(event.event_type, EventType::User);
        match &event.content[0] {
            ContentBlock::Text { text } => assert_eq!(text, "Hello"),
            _ => panic!("Expected Text block"),
        }
    }

    // ===== read_session_cwd tests =====

    #[test]
    fn test_read_session_cwd_from_session_meta() {
        use std::io::Write;
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.jsonl");
        let mut f = std::fs::File::create(&file_path).unwrap();
        writeln!(
            f,
            r#"{{"timestamp":"2026-06-16T12:40:00.022Z","type":"session_meta","payload":{{"id":"test-id","cwd":"F:\\for_test\\rust\\tauri\\llm_api_rust_test"}}}}"#
        )
        .unwrap();

        let cwd = read_session_cwd(&file_path);
        assert_eq!(
            cwd.as_deref(),
            Some("F:\\for_test\\rust\\tauri\\llm_api_rust_test")
        );
    }

    #[test]
    fn test_read_session_cwd_missing_file() {
        let result = read_session_cwd(Path::new("/nonexistent/file.jsonl"));
        assert!(result.is_none());
    }

    #[test]
    fn test_read_session_cwd_no_cwd_field() {
        use std::io::Write;
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.jsonl");
        let mut f = std::fs::File::create(&file_path).unwrap();
        writeln!(
            f,
            r#"{{"timestamp":"2026-06-16T12:40:00.022Z","type":"session_meta","payload":{{"id":"test-id"}}}}"#
        )
        .unwrap();

        let cwd = read_session_cwd(&file_path);
        assert_eq!(cwd, None);
    }
}
