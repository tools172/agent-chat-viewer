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
/// provides its own implementation of this trait. To add a new provider:
///
/// 1. Implement this trait with agent-specific parsing logic
/// 2. Register it in `ProviderRegistry::new()`
/// 3. Add visual metadata in frontend `PROVIDER_META`
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

    /// Extract session ID from a file path (default: file stem)
    fn extract_session_id(&self, file_path: &Path) -> Option<String> {
        file_path.file_stem()?.to_str().map(String::from)
    }

    /// Enumerate all session files within a project/agent directory.
    ///
    /// Default: scan the directory directly for `.jsonl` files.
    /// Providers with nested structures (e.g. OpenClaw's `sessions/` subdirectory)
    /// should override this method.
    fn enumerate_session_files(&self, project_dir: &Path) -> Vec<PathBuf> {
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

    /// Check if a given file is a session file of this provider.
    fn is_session_file(&self, path: &Path) -> bool {
        path.extension()
            .map_or(false, |ext| ext.eq_ignore_ascii_case(self.session_extension()))
    }
}
