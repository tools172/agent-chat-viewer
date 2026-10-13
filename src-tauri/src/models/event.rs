use serde::{Deserialize, Serialize};

/// Represents a single event in a chat session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatEvent {
    pub uuid: String,
    pub parent_uuid: Option<String>,
    pub event_type: EventType,
    pub timestamp: String,
    pub content: Vec<ContentBlock>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
}

/// The type of a chat event
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventType {
    User,
    Assistant,
    Developer,
    System,
    Attachment,
    Mode,
    PermissionMode,
    FileHistorySnapshot,
    LastPrompt,
    AiTitle,
    Unknown(String),
}

impl std::fmt::Display for EventType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EventType::User => write!(f, "user"),
            EventType::Assistant => write!(f, "assistant"),
            EventType::Developer => write!(f, "developer"),
            EventType::System => write!(f, "system"),
            EventType::Attachment => write!(f, "attachment"),
            EventType::Mode => write!(f, "mode"),
            EventType::PermissionMode => write!(f, "permission_mode"),
            EventType::FileHistorySnapshot => write!(f, "file_history_snapshot"),
            EventType::LastPrompt => write!(f, "last_prompt"),
            EventType::AiTitle => write!(f, "ai_title"),
            EventType::Unknown(s) => write!(f, "{}", s),
        }
    }
}

/// Content blocks within an event (thinking, text, tool_use, tool_result)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "blockType", rename_all = "snake_case")]
pub enum ContentBlock {
    Text {
        text: String,
    },
    Thinking {
        thinking: String,
        #[serde(default)]
        signature: String,
    },
    ToolUse {
        #[serde(rename = "toolId")]
        tool_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
        #[serde(rename = "toolInput")]
        tool_input: serde_json::Value,
    },
    ToolResult {
        #[serde(rename = "toolUseId")]
        tool_use_id: String,
        content: Option<String>,
        #[serde(rename = "isError")]
        #[serde(default)]
        is_error: bool,
    },
}

impl ContentBlock {
    /// Returns true if this block has meaningful displayable content
    pub fn has_content(&self) -> bool {
        match self {
            ContentBlock::Text { text } => !text.trim().is_empty(),
            ContentBlock::Thinking { thinking, .. } => !thinking.trim().is_empty(),
            ContentBlock::ToolUse { .. } => true, // tool use always has name+input
            ContentBlock::ToolResult {
                content, is_error, ..
            } => {
                if *is_error && content.as_ref().is_none_or(|c| c.trim().is_empty()) {
                    false // empty error results have no content
                } else {
                    content.as_ref().is_some_and(|c| !c.trim().is_empty())
                }
            }
        }
    }

    /// Returns true if this is a tool result with no meaningful content
    pub fn is_empty_tool_result(&self) -> bool {
        matches!(self, ContentBlock::ToolResult { content, .. }
            if content.as_ref().is_none_or(|c| c.trim().is_empty()))
    }

    /// Returns the block type as a string
    pub fn block_type(&self) -> &str {
        match self {
            ContentBlock::Text { .. } => "text",
            ContentBlock::Thinking { .. } => "thinking",
            ContentBlock::ToolUse { .. } => "tool_use",
            ContentBlock::ToolResult { .. } => "tool_result",
        }
    }
}
