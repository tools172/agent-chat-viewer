use std::path::{Path, PathBuf};

/// Normalize a path, expanding `~` to the user's home directory
pub fn normalize_path(path: &str) -> PathBuf {
    if path.starts_with('~') {
        let home = home_dir();
        if let Some(rest) = path.strip_prefix("~") {
            let rest = rest.trim_start_matches('/').trim_start_matches('\\');
            return home.join(rest);
        }
        return home;
    }
    PathBuf::from(path)
}

/// Get the user's home directory
pub fn home_dir() -> PathBuf {
    if let Ok(home) = std::env::var("USERPROFILE") {
        return PathBuf::from(home);
    }
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home);
    }
    PathBuf::from(".")
}

/// Check if a path has a JSONL extension
pub fn is_jsonl_file(path: &Path) -> bool {
    path.extension()
        .map_or(false, |ext| ext.eq_ignore_ascii_case("jsonl"))
}

/// Extract the project name from a path
/// For Claude Code: ~/.claude/projects/<project-name>/<session>.jsonl
pub fn extract_project_name(path: &Path) -> String {
    path.parent()
        .and_then(|p| p.file_name())
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_jsonl_file() {
        assert!(is_jsonl_file(Path::new("test.jsonl")));
        assert!(is_jsonl_file(Path::new("session.JSONL")));
        assert!(!is_jsonl_file(Path::new("test.json")));
        assert!(!is_jsonl_file(Path::new("test.txt")));
    }

    #[test]
    fn test_extract_project_name() {
        let path = Path::new("/home/user/.claude/projects/my-project/session.jsonl");
        assert_eq!(extract_project_name(path), "my-project");
    }

    #[test]
    fn test_normalize_path() {
        let path = normalize_path("~/.claude/projects");
        assert!(path.to_string_lossy().contains(".claude"));
    }
}
