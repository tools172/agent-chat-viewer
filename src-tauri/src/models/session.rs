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
    /// Client environment: "vscode", "cli", "ui", "subagent", or "" (unknown)
    pub client_type: String,
    /// Last user message text (for hover hints), empty until polished
    #[serde(default)]
    pub last_user_text: String,
    /// 会话文件的实际存储目录（与 project_path 不同：project_path 是分组键，
    /// storage_path 是文件所在目录；对于有 data_dir() 的 provider 如 Cursor，
    /// 则是源数据库目录）
    pub storage_path: String,
}

/// Full session detail with all events
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDetail {
    pub id: String,
    pub file_path: String,
    pub events: Vec<ChatEvent>,
    /// Cleaned first user message (used as tab title)
    pub display: String,
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
