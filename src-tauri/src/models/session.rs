use serde::{Deserialize, Serialize};

use super::event::ChatEvent;

/// Summary of a chat session (shown in lists)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: String,
    pub project_name: String,
    pub project_path: String,
    /// First user message (used as display title)
    pub display: String,
    pub timestamp: String,
    pub message_count: u32,
    /// File size in bytes
    pub file_size: u64,
    pub cwd: String,
    /// Path to the JSONL file
    pub file_path: String,
    /// Agent provider name (e.g. "claude_code", "openclaw")
    pub provider_name: String,
    /// File modification time (RFC 3339), for sorting by last modified
    pub file_mtime: String,
    /// Client environment: "vscode", "cli", "gui", "subagent", or "" (unknown)
    pub client_type: String,
}

/// Full session detail with all events
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDetail {
    pub id: String,
    pub file_path: String,
    pub events: Vec<ChatEvent>,
}

/// Entry in the Claude history.jsonl file
#[derive(Debug, Deserialize)]
pub struct HistoryEntry {
    pub display: String,
    pub timestamp: i64,
    pub project: String,
    #[serde(rename = "sessionId")]
    pub session_id: String,
}
