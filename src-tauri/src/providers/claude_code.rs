use std::path::{Path, PathBuf};

use crate::models::{ChatEvent, ContentBlock, EventType};
use crate::providers::base::{ChatProvider, ParseError};

/// Provider for Claude Code chat records.
///
/// Claude Code stores sessions as JSONL files under:
/// `~/.claude/projects/<project-name>/<session-uuid>.jsonl`
///
/// Metadata is stored in `~/.claude/history.jsonl`
pub struct ClaudeCodeProvider {
    base_dir: PathBuf,
}

impl ClaudeCodeProvider {
    pub fn new() -> Self {
        let home = dirs_next().unwrap_or_else(|| PathBuf::from("."));
        let base_dir = home.join(".claude").join("projects");
        Self { base_dir }
    }

    /// Get the home directory
    fn home_dir() -> PathBuf {
        dirs_next().unwrap_or_else(|| PathBuf::from("."))
    }

    /// Parse a raw JSON value into a ChatEvent
    fn parse_raw_event(value: &serde_json::Value) -> Result<ChatEvent, ParseError> {
        let event_type_str = value["type"]
            .as_str()
            .ok_or_else(|| ParseError::MissingField("type".to_string()))?;

        // Determine EventType
        let event_type = match event_type_str {
            "user" => EventType::User,
            "assistant" => EventType::Assistant,
            "system" => EventType::System,
            "attachment" => EventType::Attachment,
            "mode" => EventType::Mode,
            "permission-mode" => EventType::PermissionMode,
            "file-history-snapshot" => EventType::FileHistorySnapshot,
            "last-prompt" => EventType::LastPrompt,
            "ai-title" => EventType::AiTitle,
            other => EventType::Unknown(other.to_string()),
        };

        let uuid = value["uuid"]
            .as_str()
            .unwrap_or("unknown")
            .to_string();

        let parent_uuid = value["parentUuid"].as_str().map(|s| s.to_string());

        let timestamp = value["timestamp"]
            .as_str()
            .unwrap_or("")
            .to_string();

        let session_id = value["sessionId"].as_str().map(|s| s.to_string());

        // Parse content blocks from the message
        let content = Self::parse_content(value);

        Ok(ChatEvent {
            uuid,
            parent_uuid,
            event_type,
            timestamp,
            content,
            session_id,
        })
    }

    /// Extract content blocks from the event JSON
    fn parse_content(value: &serde_json::Value) -> Vec<ContentBlock> {
        let mut blocks = Vec::new();

        // Check for message.content array (assistant messages)
        if let Some(content_arr) = value["message"]["content"].as_array() {
            for item in content_arr {
                let content_type = item["type"].as_str().unwrap_or("");
                match content_type {
                    "text" => {
                        if let Some(text) = item["text"].as_str() {
                            blocks.push(ContentBlock::Text {
                                text: text.to_string(),
                            });
                        }
                    }
                    "thinking" => {
                        if let Some(thinking) = item["thinking"].as_str() {
                            blocks.push(ContentBlock::Thinking {
                                thinking: thinking.to_string(),
                                signature: item["signature"]
                                    .as_str()
                                    .unwrap_or("")
                                    .to_string(),
                            });
                        }
                    }
                    "tool_use" => {
                        blocks.push(ContentBlock::ToolUse {
                            tool_id: item["id"].as_str().unwrap_or("").to_string(),
                            tool_name: item["name"].as_str().unwrap_or("").to_string(),
                            tool_input: item["input"].clone(),
                        });
                    }
                    "tool_result" => {
                        let content_str = match &item["content"] {
                            serde_json::Value::String(s) => Some(s.clone()),
                            serde_json::Value::Array(_) => {
                                Some(serde_json::to_string(&item["content"]).unwrap_or_default())
                            }
                            serde_json::Value::Object(_) => {
                                Some(serde_json::to_string(&item["content"]).unwrap_or_default())
                            }
                            _ => None,
                        };

                        blocks.push(ContentBlock::ToolResult {
                            tool_use_id: item["tool_use_id"]
                                .as_str()
                                .unwrap_or("")
                                .to_string(),
                            content: content_str,
                            is_error: item["is_error"].as_bool().unwrap_or(false),
                        });
                    }
                    _ => {}
                }
            }
        }

        // For user messages without structured content (plain user input)
        if blocks.is_empty() {
            if let Some(text) = value["message"]["content"].as_str() {
                blocks.push(ContentBlock::Text {
                    text: text.to_string(),
                });
            }
        }

        blocks
    }
}

impl ChatProvider for ClaudeCodeProvider {
    fn name(&self) -> &'static str {
        "claude_code"
    }

    fn display_name(&self) -> &'static str {
        "Claude Code"
    }

    fn default_base_dir(&self) -> PathBuf {
        self.base_dir.clone()
    }

    fn parse_event(&self, line: &str) -> Result<ChatEvent, ParseError> {
        let value: serde_json::Value = serde_json::from_str(line)?;
        Self::parse_raw_event(&value)
    }

    fn detect_format(&self, path: &Path) -> bool {
        // Claude Code stores data under ~/.claude/projects/
        let home = Self::home_dir();
        let claude_projects = home.join(".claude").join("projects");
        path.starts_with(&claude_projects)
    }

    fn metadata_path(&self) -> Option<PathBuf> {
        Some(Self::home_dir().join(".claude").join("history.jsonl"))
    }

    fn detect_by_content(&self, first_lines: &str) -> bool {
        // Claude Code sessions start with user/assistant/system type
        if let Some(first_line) = first_lines.lines().find(|l| !l.trim().is_empty()) {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(first_line) {
                if let Some(event_type) = value["type"].as_str() {
                    return matches!(event_type, "user" | "assistant" | "system");
                }
            }
        }
        false
    }

    fn clean_display_text(&self, text: &str) -> String {
        let mut result = text;
        loop {
            let mut changed = false;
            for tag in &["</ide_selection>", "</ide_opened_file>",
                          "</local-command-caveat>", "</command-name>",
                          "</command-message>", "</command-args>"] {
                if let Some(end) = result.find(tag) {
                    result = result[end + tag.len()..].trim_start();
                    changed = true;
                }
            }
            if !changed {
                break;
            }
        }
        result.to_string()
    }

    fn detect_client_from_text(&self, text: &str) -> &'static str {
        if text.contains("<ide_selection>") || text.contains("<ide_opened_file>") {
            "vscode"
        } else {
            "cli"
        }
    }
}

/// Helper to get the user's home directory (cross-platform)
fn dirs_next() -> Option<PathBuf> {
    // Windows
    if let Ok(home) = std::env::var("USERPROFILE") {
        return Some(PathBuf::from(home));
    }
    // Unix
    if let Ok(home) = std::env::var("HOME") {
        return Some(PathBuf::from(home));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_user_message() {
        let provider = ClaudeCodeProvider::new();
        let line = r#"{"parentUuid":null,"isSidechain":false,"promptId":"test","type":"user","message":{"role":"user","content":"Hello, Claude"},"uuid":"u1","timestamp":"2026-06-09T10:00:00Z","sessionId":"s1"}"#;

        let event = provider.parse_event(line).unwrap();
        assert_eq!(event.event_type, EventType::User);
        assert_eq!(event.uuid, "u1");
        assert_eq!(event.content.len(), 1);
        match &event.content[0] {
            ContentBlock::Text { text } => assert_eq!(text, "Hello, Claude"),
            _ => panic!("Expected Text block"),
        }
    }

    #[test]
    fn test_parse_assistant_with_thinking() {
        let provider = ClaudeCodeProvider::new();
        let line = r#"{"parentUuid":"u1","isSidechain":false,"message":{"id":"msg1","type":"message","role":"assistant","model":"claude-opus-4-8","content":[{"type":"thinking","thinking":"The user says hello.","signature":"sig1"},{"type":"text","text":"Hello! How can I help you today?"}],"stop_reason":"end_turn","usage":{"input_tokens":10,"output_tokens":20}},"type":"assistant","uuid":"u2","timestamp":"2026-06-09T10:00:01Z","sessionId":"s1"}"#;

        let event = provider.parse_event(line).unwrap();
        assert_eq!(event.event_type, EventType::Assistant);
        assert_eq!(event.content.len(), 2);

        match &event.content[0] {
            ContentBlock::Thinking { thinking, signature } => {
                assert_eq!(thinking, "The user says hello.");
                assert_eq!(signature, "sig1");
            }
            _ => panic!("Expected Thinking block"),
        }
        match &event.content[1] {
            ContentBlock::Text { text } => {
                assert_eq!(text, "Hello! How can I help you today?");
            }
            _ => panic!("Expected Text block"),
        }
    }

    #[test]
    fn test_parse_tool_use() {
        let provider = ClaudeCodeProvider::new();
        let line = r#"{"parentUuid":"u1","isSidechain":false,"message":{"id":"msg2","type":"message","role":"assistant","model":"claude-opus-4-8","content":[{"type":"tool_use","id":"call_001","name":"Read","input":{"file_path":"/test/file.txt"}}],"stop_reason":"tool_use","usage":{"input_tokens":10,"output_tokens":30}},"type":"assistant","uuid":"u3","timestamp":"2026-06-09T10:00:02Z","sessionId":"s1"}"#;

        let event = provider.parse_event(line).unwrap();
        assert_eq!(event.content.len(), 1);
        match &event.content[0] {
            ContentBlock::ToolUse {
                tool_id,
                tool_name,
                tool_input,
            } => {
                assert_eq!(tool_id, "call_001");
                assert_eq!(tool_name, "Read");
                assert_eq!(tool_input["file_path"], "/test/file.txt");
            }
            _ => panic!("Expected ToolUse block"),
        }
    }

    #[test]
    fn test_parse_tool_result() {
        let provider = ClaudeCodeProvider::new();
        let line = r#"{"parentUuid":"u3","isSidechain":false,"promptId":"test","type":"user","message":{"role":"user","content":[{"tool_use_id":"call_001","type":"tool_result","content":"File contents here"}]},"uuid":"u4","timestamp":"2026-06-09T10:00:03Z","sessionId":"s1"}"#;

        let event = provider.parse_event(line).unwrap();
        assert_eq!(event.event_type, EventType::User);
        match &event.content[0] {
            ContentBlock::ToolResult {
                tool_use_id,
                content,
                is_error,
            } => {
                assert_eq!(tool_use_id, "call_001");
                assert_eq!(content.as_deref(), Some("File contents here"));
                assert!(!is_error);
            }
            _ => panic!("Expected ToolResult block"),
        }
    }

    #[test]
    fn test_detect_by_content_user_type() {
        let provider = ClaudeCodeProvider::new();
        let content = r#"{"type":"user","message":{"role":"user","content":"Hello"},"uuid":"u-001","timestamp":"2026-06-09T10:00:00Z","sessionId":"s1"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hi"}]},"uuid":"u-002","timestamp":"2026-06-09T10:00:01Z","sessionId":"s1"}"#;
        assert!(provider.detect_by_content(content));
    }

    #[test]
    fn test_detect_by_content_rejects_openclaw_format() {
        let provider = ClaudeCodeProvider::new();
        let content = r#"{"type":"session","version":3,"id":"abc-123","timestamp":"2026-04-17T04:44:21.996Z","cwd":"/home/user/workspace"}"#;
        assert!(!provider.detect_by_content(content));
    }

    #[test]
    fn test_detect_by_content_empty() {
        let provider = ClaudeCodeProvider::new();
        assert!(!provider.detect_by_content(""));
    }
}
