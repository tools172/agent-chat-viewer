use std::path::Path;
use std::sync::Arc;

use crate::models::{ChatEvent, SessionDetail, SessionSummary};
use crate::providers::base::ChatProvider;

/// Parse a JSONL session file and return all parsed events
pub fn parse_session_file(
    file_path: &Path,
    provider: &Arc<dyn ChatProvider>,
) -> Result<Vec<ChatEvent>, String> {
    let content =
        std::fs::read_to_string(file_path).map_err(|e| format!("Failed to read file: {}", e))?;

    let mut events = Vec::new();

    for (line_num, line) in content.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        match provider.parse_event(trimmed) {
            Ok(event) => events.push(event),
            Err(e) => {
                // Log the error but continue parsing
                eprintln!(
                    "Warning: failed to parse line {} in {}: {}",
                    line_num + 1,
                    file_path.display(),
                    e
                );
            }
        }
    }

    Ok(events)
}

/// Parse a session file into a SessionDetail
pub fn parse_session_detail(
    file_path: &Path,
    provider: &Arc<dyn ChatProvider>,
) -> Result<SessionDetail, String> {
    let events = parse_session_file(file_path, provider)?;
    let id = file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string();

    Ok(SessionDetail {
        id,
        file_path: file_path.to_string_lossy().to_string(),
        events,
    })
}

/// Create a SessionSummary by reading first and last events from a file
pub fn create_session_summary(
    file_path: &Path,
    project_name: &str,
    project_path: &str,
    provider: &Arc<dyn ChatProvider>,
    provider_name: &str,
) -> Option<SessionSummary> {
    let content = std::fs::read_to_string(file_path).ok()?;
    let file_size = std::fs::metadata(file_path).ok()?.len();
    let id = file_path.file_stem()?.to_str()?.to_string();

    let mut display = String::from("(Empty session)");
    let mut timestamp = String::new();
    let mut message_count: u32 = 0;
    let mut cwd = String::new();

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        if let Ok(event) = provider.parse_event(trimmed) {
            // Capture timestamp from first event
            if timestamp.is_empty() {
                timestamp = event.timestamp.clone();
            }

            // Try to get cwd from any event
            if cwd.is_empty() {
                // We can't easily access raw JSON fields from ChatEvent
                // So we try parsing the raw JSON
                if let Ok(value) =
                    serde_json::from_str::<serde_json::Value>(trimmed)
                {
                    if let Some(raw_cwd) = value["cwd"].as_str() {
                        cwd = raw_cwd.to_string();
                    }
                }
            }

            // Count "meaningful" messages (user + assistant)
            match event.event_type {
                crate::models::EventType::User | crate::models::EventType::Assistant => {
                    message_count += 1;
                }
                _ => {}
            }

            // Find first user text message for display title
            if display == "(Empty session)" {
                if let crate::models::EventType::User = event.event_type {
                    for block in &event.content {
                        if let crate::models::ContentBlock::Text { text } = block {
                            display = text.chars().take(80).collect();
                            if text.len() > 80 {
                                display.push_str("...");
                            }
                            break;
                        }
                    }
                }
            }
        }
    }

    Some(SessionSummary {
        id,
        project_name: project_name.to_string(),
        project_path: project_path.to_string(),
        display,
        timestamp,
        message_count,
        file_size,
        cwd,
        file_path: file_path.to_string_lossy().to_string(),
        provider_name: provider_name.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::claude_code::ClaudeCodeProvider;
    use std::io::Write;

    fn create_temp_jsonl(content: &str) -> (tempfile::TempDir, std::path::PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test-session.jsonl");
        let mut file = std::fs::File::create(&file_path).unwrap();
        file.write_all(content.as_bytes()).unwrap();
        (dir, file_path)
    }

    #[test]
    fn test_parse_session_file() {
        let content = r#"{"type":"user","message":{"role":"user","content":"Hello"},"uuid":"u1","timestamp":"2026-06-09T10:00:00Z","sessionId":"s1"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hi there!"}]},"uuid":"u2","timestamp":"2026-06-09T10:00:01Z","sessionId":"s1"}
"#;
        let (_dir, file_path) = create_temp_jsonl(content);
        let provider: Arc<dyn ChatProvider> = Arc::new(ClaudeCodeProvider::new());

        let events = parse_session_file(&file_path, &provider).unwrap();
        assert_eq!(events.len(), 2);
    }

    #[test]
    fn test_parse_session_with_malformed_lines() {
        let content = r#"{"type":"user","message":{"role":"user","content":"Hello"},"uuid":"u1","timestamp":"2026-06-09T10:00:00Z","sessionId":"s1"}
this is not valid json
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hi!"}]},"uuid":"u2","timestamp":"2026-06-09T10:00:01Z","sessionId":"s1"}
"#;
        let (_dir, file_path) = create_temp_jsonl(content);
        let provider: Arc<dyn ChatProvider> = Arc::new(ClaudeCodeProvider::new());

        let events = parse_session_file(&file_path, &provider).unwrap();
        // Should parse the 2 valid lines, skip the malformed one
        assert_eq!(events.len(), 2);
    }

    #[test]
    fn test_parse_empty_file() {
        let content = "";
        let (_dir, file_path) = create_temp_jsonl(content);
        let provider: Arc<dyn ChatProvider> = Arc::new(ClaudeCodeProvider::new());

        let events = parse_session_file(&file_path, &provider).unwrap();
        assert!(events.is_empty());
    }
}
