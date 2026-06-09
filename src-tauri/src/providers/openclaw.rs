use std::path::{Path, PathBuf};

use crate::models::ChatEvent;
use crate::providers::base::{ChatProvider, ParseError};

/// Provider for OpenClaw chat records (stub for future implementation).
///
/// OpenClaw stores sessions under:
/// `~/.openclaw/agents/<agent>/sessions/<uuid>.jsonl`
pub struct OpenClawProvider {
    base_dir: PathBuf,
}

impl OpenClawProvider {
    pub fn new() -> Self {
        let home = home_dir();
        let base_dir = home.join(".openclaw").join("agents");
        Self { base_dir }
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

    fn parse_event(&self, _line: &str) -> Result<ChatEvent, ParseError> {
        // OpenClaw format parsing will be implemented in a future version
        Err(ParseError::UnknownEventType(
            "OpenClaw parsing not yet implemented".to_string(),
        ))
    }

    fn detect_format(&self, path: &Path) -> bool {
        let home = home_dir();
        let openclaw_dir = home.join(".openclaw");
        path.starts_with(&openclaw_dir)
    }

    fn metadata_path(&self) -> Option<PathBuf> {
        Some(home_dir().join(".openclaw").join("agents").join("main").join("sessions").join("sessions.json"))
    }
}
