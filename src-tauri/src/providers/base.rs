use std::path::{Path, PathBuf};

use crate::models::ChatEvent;

/// Errors that can occur during parsing
#[derive(Debug, thiserror::Error)]
pub enum ParseError {
    #[error("Failed to parse JSON: {0}")]
    JsonError(#[from] serde_json::Error),
    #[error("Unknown event type: {0}")]
    UnknownEventType(String),
    #[error("Missing required field: {0}")]
    MissingField(String),
}

/// Core trait that all chat providers must implement.
///
/// This is the Strategy pattern — each agent (Claude Code, OpenClaw, etc.)
/// provides its own implementation of this trait.
pub trait ChatProvider: Send + Sync {
    /// Unique name for this provider (e.g., "claude_code", "openclaw")
    fn name(&self) -> &'static str;

    /// Human-readable display name
    fn display_name(&self) -> &'static str;

    /// Default directory where this agent stores chat records
    fn default_base_dir(&self) -> PathBuf;

    /// Parse a single JSONL line into a ChatEvent
    fn parse_event(&self, line: &str) -> Result<ChatEvent, ParseError>;

    /// Detect if a given directory/file belongs to this agent's format
    fn detect_format(&self, path: &Path) -> bool;

    /// Path to the metadata/history file, if any
    fn metadata_path(&self) -> Option<PathBuf>;

    /// File extension for session files
    fn session_extension(&self) -> &'static str {
        "jsonl"
    }
}
