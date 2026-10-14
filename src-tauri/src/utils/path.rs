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
        .is_some_and(|ext| ext.eq_ignore_ascii_case("jsonl"))
}

/// Check if a path is a Zstandard-compressed session file (`.zstd` suffix).
///
/// DeepSeek Harness stores transcripts as `session.v4.jsonl.zstd` — a
/// concatenation of independent Zstandard frames.
pub fn is_zstd_file(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| n.ends_with(".zstd"))
}

/// Check if a path is a session data file — plain `.jsonl` or compressed `.zstd`.
pub fn is_session_data_file(path: &Path) -> bool {
    is_jsonl_file(path) || is_zstd_file(path)
}

/// Read a session file as UTF-8 text, transparently decompressing Zstandard
/// archives. Returns `None` if the file can't be read or decompressed.
pub fn read_session_text(path: &Path) -> Option<String> {
    if is_zstd_file(path) {
        return decompress_zstd_file(path);
    }
    std::fs::read_to_string(path).ok()
}

/// Zstandard frame magic number `28 B5 2F FD`, marking the start of each frame
/// in a concatenated archive.
const ZSTD_MAGIC: [u8; 4] = [0x28, 0xB5, 0x2F, 0xFD];

/// Decompress a Zstandard archive that is a concatenation of independent
/// frames (the format DeepSeek Harness uses). `ruzstd::StreamingDecoder`
/// only decodes a single frame, so each frame is split on the magic number
/// and decoded separately, then joined.
fn decompress_zstd_file(path: &Path) -> Option<String> {
    decompress_zstd(&std::fs::read(path).ok()?)
}

fn decompress_zstd(data: &[u8]) -> Option<String> {
    use std::io::Read;

    // Locate every frame boundary (each begins with the 4-byte magic number).
    let mut starts: Vec<usize> = Vec::new();
    let mut i = 0;
    while i + ZSTD_MAGIC.len() <= data.len() {
        if data[i..i + ZSTD_MAGIC.len()] == ZSTD_MAGIC {
            starts.push(i);
        }
        i += 1;
    }
    if starts.is_empty() {
        return None;
    }

    let mut out: Vec<u8> = Vec::new();
    for (k, &start) in starts.iter().enumerate() {
        let end = if k + 1 < starts.len() {
            starts[k + 1]
        } else {
            data.len()
        };
        let frame = &data[start..end];
        if let Ok(mut decoder) = ruzstd::StreamingDecoder::new(std::io::Cursor::new(frame)) {
            let mut buf = Vec::new();
            if decoder.read_to_end(&mut buf).is_ok() {
                out.extend_from_slice(&buf);
            }
        }
    }

    Some(String::from_utf8_lossy(&out).into_owned())
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
    fn test_is_zstd_file() {
        assert!(is_zstd_file(Path::new("session.v4.jsonl.zstd")));
        assert!(!is_zstd_file(Path::new("session.jsonl")));
    }

    #[test]
    fn test_is_session_data_file() {
        assert!(is_session_data_file(Path::new("session.jsonl")));
        assert!(is_session_data_file(Path::new("session.v4.jsonl.zstd")));
        assert!(!is_session_data_file(Path::new("notes.txt")));
    }

    #[test]
    fn test_decompress_zstd_concatenated_frames() {
        let data = include_bytes!("../../tests/fixtures/deepseek_harness/minimal.jsonl.zstd");
        let text = decompress_zstd(data).expect("should decompress two-frame archive");
        assert!(text.contains("\"type\":\"session\""));
        assert!(text.contains("\"type\":\"user/message\""));
        assert!(text.contains("hi"));
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
