use std::path::{Path, PathBuf};

use crate::models::ChatEvent;
use serde_json::Value;

/// Errors that can occur during parsing
#[derive(Debug, thiserror::Error)]
pub enum ParseError {
    #[error("Failed to parse JSON: {0}")]
    JsonError(#[from] serde_json::Error),
    #[error("Unknown event type: {0}")]
    UnknownEventType(String),
    #[error("Missing required field: {0}")]
    MissingField(String),
    /// Line intentionally skipped (bookkeeping/metadata event with no
    /// user-visible content). Callers should ignore it without warning.
    #[error("Skipped event")]
    Skipped,
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
            .is_some_and(|ext| ext.eq_ignore_ascii_case(self.session_extension()))
    }

    /// Detect if the given content (first lines of a JSONL file) matches
    /// this provider's format. Used for content-based provider detection.
    ///
    /// Default: try parsing the first non-empty line and check if it succeeds.
    /// Providers should override this with format-specific fingerprint checks.
    fn detect_by_content(&self, first_lines: &str) -> bool {
        if let Some(first_line) = first_lines.lines().find(|l| !l.trim().is_empty()) {
            self.parse_event(first_line).is_ok()
        } else {
            false
        }
    }

    /// Clean a display text by removing provider-specific metadata/context tags.
    ///
    /// Default: return the text unchanged.
    fn clean_display_text(&self, text: &str) -> String {
        text.to_string()
    }

    /// Detect the client type from the first user message text.
    ///
    /// Returns a static string like "cli", "vscode", "ui", "desktop", "subagent", etc.
    /// Default: empty string (unknown client type).
    fn detect_client_from_text(&self, _text: &str) -> &'static str {
        ""
    }

    /// Extract the first raw user-facing text from a JSONL line value,
    /// before any parse-time cleaning strips provider-specific metadata.
    ///
    /// This is used for client-type detection (e.g., "vscode" vs "cli" vs "desktop").
    /// Default: returns `None` (provider doesn't support raw-text extraction).
    fn extract_raw_user_text(&self, _value: &Value) -> Option<String> {
        None
    }

    /// Extract the working directory (cwd) from a JSONL line value.
    ///
    /// Default: try top-level `cwd` field, then `payload.cwd` (Codex convention).
    /// Providers with different structures should override this.
    fn extract_cwd(&self, value: &Value) -> Option<String> {
        if let Some(cwd) = value["cwd"].as_str() {
            return Some(cwd.to_string());
        }
        if let Some(cwd) = value["payload"]["cwd"].as_str() {
            return Some(cwd.to_string());
        }
        None
    }

    /// Return the directory where this provider's source data lives
    /// (e.g. Cursor's SQLite DB directory). Default: `None`.
    /// Used by "Open containing folder" to open the real data source
    /// instead of a cached/generated file path.
    fn data_dir(&self) -> Option<PathBuf> {
        None
    }

    /// Whether this provider groups sessions by working directory (cwd)
    /// rather than by filesystem subdirectory structure.
    ///
    /// When true, callers should discover all session files from the base
    /// directory, extract cwd via `read_session_cwd_from_file`, and group
    /// by cwd instead of by subdirectory name.
    ///
    /// Default: `false` (use subdirectory-based grouping).
    fn use_cwd_grouping(&self) -> bool {
        false
    }

    /// Read the working directory from a session file without parsing the
    /// entire file. Used during scanning/discovery to group sessions by cwd.
    ///
    /// Default: returns `None` (provider does not support file-level cwd
    /// extraction).
    fn read_session_cwd_from_file(&self, _file_path: &Path) -> Option<String> {
        None
    }
}
