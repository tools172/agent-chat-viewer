use serde::{Deserialize, Serialize};

/// A project containing chat sessions
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub name: String,
    pub path: String,
    pub session_count: u32,
    pub last_activity: String,
}
