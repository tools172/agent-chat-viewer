use std::path::{Path, PathBuf};

use crate::models::{ChatEvent, ContentBlock, EventType};
use crate::providers::base::{ChatProvider, ParseError};

/// Provider for OpenClaw chat records.
///
/// OpenClaw stores sessions under:
/// `~/.openclaw/agents/<agent>/sessions/<uuid>.jsonl`
///
/// ## JSONL Format
///
/// Each line is a JSON object with a `type` field:
/// - `session` — session metadata (line 1)
/// - `model_change` — model/provider selection
/// - `thinking_level_change` — thinking on/off toggle
/// - `custom` — internal metadata snapshots
/// - `message` — actual chat messages with `message.role`:
///   - `user` → user input
///   - `assistant` → AI response (may embed `toolCall` content blocks)
///   - `toolResult` → result of a tool execution
pub struct OpenClawProvider {
    base_dir: PathBuf,
}

impl OpenClawProvider {
    pub fn new() -> Self {
        let home = home_dir();
        let base_dir = home.join(".openclaw").join("agents");
        Self { base_dir }
    }

    /// Parse the `message`-type event into a ChatEvent.
    /// Dispatches on `message.role` to determine EventType and content blocks.
    fn parse_message_event(
        id: &str,
        parent_id: Option<String>,
        timestamp: &str,
        message: &serde_json::Value,
    ) -> Result<ChatEvent, ParseError> {
        let role = message["role"].as_str().unwrap_or("unknown");
        let content_arr = message["content"].as_array();

        match role {
            "user" => {
                let content = Self::parse_user_content(content_arr, None);
                Ok(ChatEvent {
                    uuid: id.to_string(),
                    parent_uuid: parent_id,
                    event_type: EventType::User,
                    timestamp: timestamp.to_string(),
                    content,
                    session_id: None,
                })
            }
            "assistant" => {
                let content = Self::parse_assistant_content(content_arr);
                Ok(ChatEvent {
                    uuid: id.to_string(),
                    parent_uuid: parent_id,
                    event_type: EventType::Assistant,
                    timestamp: timestamp.to_string(),
                    content,
                    session_id: None,
                })
            }
            "toolResult" => {
                let tool_call_id = message["toolCallId"]
                    .as_str()
                    .unwrap_or("")
                    .to_string();
                let is_error = message["isError"].as_bool().unwrap_or(false);

                let content = Self::parse_tool_result_content(
                    &tool_call_id,
                    is_error,
                    content_arr,
                );
                Ok(ChatEvent {
                    uuid: id.to_string(),
                    parent_uuid: parent_id,
                    event_type: EventType::User,
                    timestamp: timestamp.to_string(),
                    content,
                    session_id: None,
                })
            }
            other => Err(ParseError::UnknownEventType(format!(
                "Unknown message role: {}",
                other
            ))),
        }
    }

    /// Parse user message content blocks: text only (metadata prefix cleaned)
    fn parse_user_content(
        content_arr: Option<&Vec<serde_json::Value>>,
        _extra: Option<&serde_json::Value>,
    ) -> Vec<ContentBlock> {
        let mut blocks = Vec::new();
        if let Some(items) = content_arr {
            for item in items {
                let block_type = item["type"].as_str().unwrap_or("");
                if block_type == "text" {
                    if let Some(text) = item["text"].as_str() {
                        blocks.push(ContentBlock::Text {
                            text: clean_openclaw_user_text(text),
                        });
                    }
                }
            }
        }
        blocks
    }

    /// Parse assistant message content blocks: text + toolCall
    fn parse_assistant_content(
        content_arr: Option<&Vec<serde_json::Value>>,
    ) -> Vec<ContentBlock> {
        let mut blocks = Vec::new();
        if let Some(items) = content_arr {
            for item in items {
                let block_type = item["type"].as_str().unwrap_or("");
                match block_type {
                    "text" => {
                        if let Some(text) = item["text"].as_str() {
                            blocks.push(ContentBlock::Text {
                                text: text.to_string(),
                            });
                        }
                    }
                    "toolCall" => {
                        blocks.push(ContentBlock::ToolUse {
                            tool_id: item["id"].as_str().unwrap_or("").to_string(),
                            tool_name: item["name"]
                                .as_str()
                                .unwrap_or("")
                                .to_string(),
                            tool_input: item["arguments"].clone(),
                        });
                    }
                    _ => {}
                }
            }
        }
        blocks
    }

    /// Parse tool result content blocks.
    /// Tool results in OpenClaw have their structure at the message level,
    /// not embedded in content blocks. We create one ToolResult block containing
    /// the concatenated text from all content items.
    fn parse_tool_result_content(
        tool_call_id: &str,
        is_error: bool,
        content_arr: Option<&Vec<serde_json::Value>>,
    ) -> Vec<ContentBlock> {
        let mut text_parts: Vec<String> = Vec::new();

        if let Some(items) = content_arr {
            for item in items {
                let block_type = item["type"].as_str().unwrap_or("");
                if block_type == "text" {
                    if let Some(text) = item["text"].as_str() {
                        text_parts.push(text.to_string());
                    }
                }
            }
        }

        let content = if text_parts.is_empty() {
            None
        } else {
            Some(text_parts.join("\n"))
        };

        vec![ContentBlock::ToolResult {
            tool_use_id: tool_call_id.to_string(),
            content,
            is_error,
        }]
    }

    /// Parse a metadata event (session, model_change, etc.) into a System ChatEvent.
    fn parse_metadata_event(
        id: &str,
        parent_id: Option<String>,
        timestamp: &str,
        event_type_str: &str,
        value: &serde_json::Value,
    ) -> ChatEvent {
        let summary = match event_type_str {
            "session" => {
                let cwd = value["cwd"].as_str().unwrap_or("");
                let version = value["version"].as_u64().unwrap_or(0);
                format!("[Session v{}] cwd: {}", version, cwd)
            }
            "model_change" => {
                let provider = value["provider"].as_str().unwrap_or("");
                let model = value["modelId"].as_str().unwrap_or("");
                format!("[Model] {} / {}", provider, model)
            }
            "thinking_level_change" => {
                let level = value["thinkingLevel"].as_str().unwrap_or("");
                format!("[Thinking] {}", level)
            }
            "custom" => {
                let custom_type = value["customType"].as_str().unwrap_or("");
                format!("[Custom: {}]", custom_type)
            }
            _ => format!("[{}]", event_type_str),
        };

        ChatEvent {
            uuid: id.to_string(),
            parent_uuid: parent_id,
            event_type: EventType::System,
            timestamp: timestamp.to_string(),
            content: vec![ContentBlock::Text {
                text: summary,
            }],
            session_id: None,
        }
    }
}

fn home_dir() -> PathBuf {
    if let Ok(home) = std::env::var("USERPROFILE") {
        return PathBuf::from(home);
    }
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home);
    }
    PathBuf::from(".")
}

/// Clean OpenClaw user message text by removing metadata prefixes.
///
/// Handles three formats:
/// 1. UI messages: `"Sender (untrusted metadata):" + JSON block + timestamp line`
/// 2. Subagent: `"[Subagent Task]: actual task"`
/// 3. Timestamp-only: `"[Tue ... GMT+8] message"`
fn clean_openclaw_user_text(text: &str) -> String {
    // 1) "Sender (untrusted metadata):" + JSON block + timestamp line
    if text.contains("Sender (untrusted metadata):") {
        if let Some(ts_line) = text.rfind("\n[") {
            let after = &text[ts_line + 1..];
            if let Some(ts_end) = after.find("] ") {
                let result = after[ts_end + 2..].trim().to_string();
                if !result.is_empty() {
                    return result;
                }
            }
        }
    }
    // 2) Subagent format: "[Subagent Task]: actual task"
    if let Some(idx) = text.find("[Subagent Task]:") {
        let after = text[idx + "[Subagent Task]:".len()..].trim().to_string();
        if !after.is_empty() {
            return after;
        }
    }
    // 3) Fallback: timestamp-only line "[Tue ... GMT+8] message"
    if let Some(stripped) = text.strip_prefix(|c: char| c == '[') {
        if let Some(idx) = stripped.find("] ") {
            let after = stripped[idx + 2..].trim().to_string();
            if !after.is_empty() {
                return after;
            }
        }
    }
    text.to_string()
}

impl ChatProvider for OpenClawProvider {
    fn name(&self) -> &'static str {
        "openclaw"
    }

    fn display_name(&self) -> &'static str {
        "OpenClaw"
    }

    fn default_base_dir(&self) -> PathBuf {
        self.base_dir.clone()
    }

    fn parse_event(&self, line: &str) -> Result<ChatEvent, ParseError> {
        let value: serde_json::Value = serde_json::from_str(line)?;

        let event_type_str = value["type"].as_str().ok_or_else(|| {
            ParseError::MissingField("type".to_string())
        })?;

        let id = value["id"].as_str().unwrap_or("unknown").to_string();
        let parent_id = value["parentId"].as_str().map(String::from);
        let timestamp = value["timestamp"].as_str().unwrap_or("").to_string();

        match event_type_str {
            "message" => {
                let message = &value["message"];
                if message.is_null() {
                    return Err(ParseError::MissingField(
                        "message".to_string(),
                    ));
                }
                Self::parse_message_event(&id, parent_id, &timestamp, message)
            }
            "session"
            | "model_change"
            | "thinking_level_change"
            | "custom" => Ok(Self::parse_metadata_event(
                &id,
                parent_id,
                &timestamp,
                event_type_str,
                &value,
            )),
            other => Err(ParseError::UnknownEventType(other.to_string())),
        }
    }

    fn detect_format(&self, path: &Path) -> bool {
        let home = home_dir();
        let openclaw_dir = home.join(".openclaw");
        path.starts_with(&openclaw_dir)
    }

    fn metadata_path(&self) -> Option<PathBuf> {
        Some(
            home_dir()
                .join(".openclaw")
                .join("agents")
                .join("main")
                .join("sessions")
                .join("sessions.json"),
        )
    }

    fn detect_by_content(&self, first_lines: &str) -> bool {
        // OpenClaw sessions start with a "session" metadata line containing version
        if let Some(first_line) = first_lines.lines().find(|l| !l.trim().is_empty()) {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(first_line) {
                if let Some(event_type) = value["type"].as_str() {
                    return event_type == "session" && value["version"].as_u64().is_some();
                }
            }
        }
        false
    }

    /// OpenClaw stores sessions one level deeper: `<agent>/sessions/*.jsonl`.
    /// Also handles flat directories (e.g., when a sessions folder is added
    /// directly as a watch directory and project_dir itself contains `.jsonl` files).
    fn enumerate_session_files(&self, project_dir: &Path) -> Vec<PathBuf> {
        let sessions_dir = project_dir.join("sessions");
        let scan_dir = if sessions_dir.is_dir() {
            sessions_dir
        } else {
            project_dir.to_path_buf()
        };
        let mut files = Vec::new();
        if let Ok(entries) = std::fs::read_dir(&scan_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && self.is_session_file(&path) {
                    files.push(path);
                }
            }
        }
        files
    }

    fn clean_display_text(&self, text: &str) -> String {
        clean_openclaw_user_text(text)
    }

    fn detect_client_from_text(&self, text: &str) -> &'static str {
        if text.contains("Sender (untrusted metadata):") {
            "ui"
        } else if text.contains("[Subagent Task]:") || text.contains("[Subagent Context]") {
            "subagent"
        } else {
            "cli"
        }
    }

    fn extract_raw_user_text(&self, value: &serde_json::Value) -> Option<String> {
        // OpenClaw user messages: message.content[0].text
        if let Some(text) = value["message"]["content"][0]["text"].as_str() {
            if !text.is_empty() {
                return Some(text.to_string());
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(line: &str) -> ChatEvent {
        OpenClawProvider::new()
            .parse_event(line)
            .expect("parse should succeed")
    }

    #[test]
    fn test_parse_session_metadata() {
        let line = r#"{"type":"session","version":3,"id":"abc-123","timestamp":"2026-04-17T04:44:21.996Z","cwd":"C:\\Users\\test\\workspace"}"#;
        let event = parse(line);
        assert_eq!(event.uuid, "abc-123");
        assert!(matches!(event.event_type, EventType::System));
        match &event.content[0] {
            ContentBlock::Text { text } => {
                assert!(text.contains("Session v3"));
                assert!(text.contains("workspace"));
            }
            _ => panic!("Expected Text block"),
        }
    }

    #[test]
    fn test_parse_model_change() {
        let line = r#"{"type":"model_change","id":"m1","parentId":null,"timestamp":"2026-06-09T10:00:00Z","provider":"custom-api","modelId":"deepseek-v3"}"#;
        let event = parse(line);
        assert_eq!(event.uuid, "m1");
        assert!(event.parent_uuid.is_none());
        assert!(matches!(event.event_type, EventType::System));
        match &event.content[0] {
            ContentBlock::Text { text } => {
                assert!(text.contains("custom-api"));
                assert!(text.contains("deepseek-v3"));
            }
            _ => panic!("Expected Text block"),
        }
    }

    #[test]
    fn test_parse_thinking_level_change() {
        let line = r#"{"type":"thinking_level_change","id":"t1","parentId":"m1","timestamp":"2026-06-09T10:00:01Z","thinkingLevel":"off"}"#;
        let event = parse(line);
        assert_eq!(event.parent_uuid.as_deref(), Some("m1"));
        assert!(matches!(event.event_type, EventType::System));
        match &event.content[0] {
            ContentBlock::Text { text } => {
                assert!(text.contains("off"));
            }
            _ => panic!("Expected Text block"),
        }
    }

    #[test]
    fn test_parse_custom_event() {
        let line = r#"{"type":"custom","customType":"model-snapshot","data":{},"id":"c1","parentId":"t1","timestamp":"2026-06-09T10:00:02Z"}"#;
        let event = parse(line);
        assert_eq!(event.uuid, "c1");
        match &event.content[0] {
            ContentBlock::Text { text } => {
                assert!(text.contains("model-snapshot"));
            }
            _ => panic!("Expected Text block"),
        }
    }

    #[test]
    fn test_parse_user_message() {
        let line = r#"{"type":"message","id":"u1","parentId":"c1","timestamp":"2026-06-09T10:00:03Z","message":{"role":"user","content":[{"type":"text","text":"Hello, Claude"}]}}"#;
        let event = parse(line);
        assert_eq!(event.uuid, "u1");
        assert!(matches!(event.event_type, EventType::User));
        assert_eq!(event.content.len(), 1);
        match &event.content[0] {
            ContentBlock::Text { text } => assert_eq!(text, "Hello, Claude"),
            _ => panic!("Expected Text block"),
        }
    }

    #[test]
    fn test_parse_assistant_text() {
        let line = r#"{"type":"message","id":"a1","parentId":"u1","timestamp":"2026-06-09T10:00:04Z","message":{"role":"assistant","content":[{"type":"text","text":"Hi there!"}]}}"#;
        let event = parse(line);
        assert!(matches!(event.event_type, EventType::Assistant));
        match &event.content[0] {
            ContentBlock::Text { text } => assert_eq!(text, "Hi there!"),
            _ => panic!("Expected Text block"),
        }
    }

    #[test]
    fn test_parse_assistant_with_tool_call() {
        let line = r#"{"type":"message","id":"a2","parentId":"u1","timestamp":"2026-06-09T10:00:05Z","message":{"role":"assistant","content":[{"type":"text","text":"Let me read that file."},{"type":"toolCall","id":"call_abc","name":"read","arguments":{"path":"/test/file.txt"}}]}}"#;
        let event = parse(line);
        assert_eq!(event.content.len(), 2);
        match &event.content[0] {
            ContentBlock::Text { text } => assert_eq!(text, "Let me read that file."),
            _ => panic!("Expected Text block"),
        }
        match &event.content[1] {
            ContentBlock::ToolUse {
                tool_id,
                tool_name,
                tool_input,
            } => {
                assert_eq!(tool_id, "call_abc");
                assert_eq!(tool_name, "read");
                assert_eq!(tool_input["path"], "/test/file.txt");
            }
            _ => panic!("Expected ToolUse block"),
        }
    }

    #[test]
    fn test_parse_tool_result() {
        let line = r#"{"type":"message","id":"tr1","parentId":"a2","timestamp":"2026-06-09T10:00:06Z","message":{"role":"toolResult","toolCallId":"call_abc","toolName":"read","content":[{"type":"text","text":"File contents here"}],"isError":false}}"#;
        let event = parse(line);
        assert!(matches!(event.event_type, EventType::User));
        assert_eq!(event.content.len(), 1);
        match &event.content[0] {
            ContentBlock::ToolResult {
                tool_use_id,
                content,
                is_error,
            } => {
                assert_eq!(tool_use_id, "call_abc");
                assert_eq!(content.as_deref(), Some("File contents here"));
                assert!(!is_error);
            }
            _ => panic!("Expected ToolResult block"),
        }
    }

    #[test]
    fn test_parse_tool_result_error() {
        let line = r#"{"type":"message","id":"tr2","parentId":"a2","timestamp":"2026-06-09T10:00:06Z","message":{"role":"toolResult","toolCallId":"call_bad","toolName":"exec","content":[{"type":"text","text":"Permission denied"}],"isError":true}}"#;
        let event = parse(line);
        match &event.content[0] {
            ContentBlock::ToolResult {
                tool_use_id,
                content,
                is_error,
            } => {
                assert_eq!(tool_use_id, "call_bad");
                assert!(is_error);
                assert_eq!(content.as_deref(), Some("Permission denied"));
            }
            _ => panic!("Expected ToolResult block"),
        }
    }

    #[test]
    fn test_parse_unknown_event_type() {
        let line = r#"{"type":"weird_unknown_type","id":"x1","timestamp":"2026-06-09T10:00:00Z"}"#;
        let result = OpenClawProvider::new().parse_event(line);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_missing_type_field() {
        let line = r#"{"id":"x1","timestamp":"2026-06-09T10:00:00Z"}"#;
        let result = OpenClawProvider::new().parse_event(line);
        assert!(result.is_err());
    }

    #[test]
    fn test_detect_format() {
        let provider = OpenClawProvider::new();
        let home = home_dir();
        assert!(provider.detect_format(&home.join(".openclaw").join("agents").join("main")));
        assert!(!provider.detect_format(Path::new("/tmp/something")));
    }

    #[test]
    fn test_detect_by_content_session_line() {
        let provider = OpenClawProvider::new();
        let content = r#"{"type":"session","version":3,"id":"abc-123","timestamp":"2026-04-17T04:44:21.996Z","cwd":"/home/user/workspace"}
{"type":"message","id":"u1","parentId":"abc-123","message":{"role":"user","content":[{"type":"text","text":"Hello"}]}}"#;
        assert!(provider.detect_by_content(content));
    }

    #[test]
    fn test_detect_by_content_rejects_claude_code_format() {
        let provider = OpenClawProvider::new();
        let content = r#"{"type":"user","message":{"role":"user","content":"Hello"},"uuid":"u-001","timestamp":"2026-06-09T10:00:00Z","sessionId":"s1"}"#;
        assert!(!provider.detect_by_content(content));
    }

    #[test]
    fn test_detect_by_content_empty() {
        let provider = OpenClawProvider::new();
        assert!(!provider.detect_by_content(""));
    }

    #[test]
    fn test_extract_session_id() {
        let provider = OpenClawProvider::new();
        let path = Path::new("/home/user/.openclaw/agents/main/sessions/abc-123.jsonl");
        assert_eq!(
            provider.extract_session_id(path),
            Some("abc-123".to_string())
        );
    }

    // ===== clean_openclaw_user_text tests =====

    #[test]
    fn test_clean_ui_metadata_prefix() {
        let input = "Sender (untrusted metadata):\n```json\n{\n  \"label\": \"openclaw-control-ui\",\n  \"id\": \"openclaw-control-ui\"\n}\n```\n\n[Mon 2026-06-15 18:33 GMT+8] 请帮我查找文献";
        let result = clean_openclaw_user_text(input);
        assert_eq!(result, "请帮我查找文献");
    }

    #[test]
    fn test_clean_subagent_task() {
        let input = "[Subagent Task]: read and summarize the file";
        let result = clean_openclaw_user_text(input);
        assert_eq!(result, "read and summarize the file");
    }

    #[test]
    fn test_clean_timestamp_only() {
        let input = "[Tue 2026-06-15 18:33 GMT+8] Hello world";
        let result = clean_openclaw_user_text(input);
        assert_eq!(result, "Hello world");
    }

    #[test]
    fn test_clean_plain_text_passthrough() {
        let input = "Hello, Claude";
        let result = clean_openclaw_user_text(input);
        assert_eq!(result, "Hello, Claude");
    }

    #[test]
    fn test_parse_user_message_with_ui_metadata() {
        let line = r#"{"type":"message","id":"u1","parentId":"c1","timestamp":"2026-06-09T10:00:03Z","message":{"role":"user","content":[{"type":"text","text":"Sender (untrusted metadata):\n```json\n{\n  \"label\": \"openclaw-control-ui\",\n  \"id\": \"openclaw-control-ui\"\n}\n```\n\n[Mon 2026-06-15 18:33 GMT+8] 请从知网查找50篇文献"}]}}"#;
        let event = parse(line);
        assert_eq!(event.uuid, "u1");
        assert!(matches!(event.event_type, EventType::User));
        assert_eq!(event.content.len(), 1);
        match &event.content[0] {
            ContentBlock::Text { text } => assert_eq!(text, "请从知网查找50篇文献"),
            _ => panic!("Expected Text block"),
        }
    }
}
