use std::path::Path;
use std::sync::Arc;

use lazy_static::lazy_static;
use regex::Regex;

use crate::models::{ChatEvent, SessionDetail, SessionSummary};
use crate::providers::base::ChatProvider;

lazy_static! {
    /// 匹配 OpenClaw 发送者元数据头：`Sender (untrusted metadata):` + JSON 代码块 + 时间戳行
    static ref OPENCLAW_PREFIX_RE: Regex = Regex::new(
        r"(?s)^Sender\s*\(untrusted metadata\):\s*\n```json\s*\n.*?\n```\s*\n\n\[[A-Z][a-z]{2}\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+[A-Z+0-9]+\]\s*"
    ).unwrap();

    /// 匹配 Claude Code VSCode 插件插入的 `<ide_selection>` 块（含内容）
    static ref IDE_SELECTION_RE: Regex = Regex::new(
        r"(?s)<ide_selection>.*?</ide_selection>\s*"
    ).unwrap();
}

/// 清理会话显示文本：去除元数据前缀，提取实际对话内容
fn clean_display_text(text: &str, provider_name: &str) -> String {
    match provider_name {
        "openclaw" => {
            // 1) "Sender (untrusted metadata):" + JSON 代码块 + 时间戳行
            if let Some(caps) = OPENCLAW_PREFIX_RE.find(text) {
                let stripped = text[caps.end()..].trim().to_string();
                if !stripped.is_empty() {
                    return stripped;
                }
            }
            // 2) Subagent 格式: "[...] [Subagent Context] ...\n\n[Subagent Task]: 实际任务"
            if let Some(idx) = text.find("[Subagent Task]:") {
                let after = text[idx + "[Subagent Task]:".len()..].trim().to_string();
                if !after.is_empty() {
                    return after;
                }
            }
            // 3) 兜底：如果只有时间戳行（没有 sender 元数据），也尝试去除
            if let Some(stripped) = text.strip_prefix(|c: char| c == '[') {
                if let Some(idx) = stripped.find("] ") {
                    let after = stripped[idx + 2..].trim().to_string();
                    if !after.is_empty() {
                        return after;
                    }
                }
            }
            text.to_string()
        }
        "claude_code" => {
            // 去除 <ide_selection>...</ide_selection> 块
            // 注意：不兜底返回原文 — 纯元数据块返回空，由调用方跳过并取下一个 text block
            IDE_SELECTION_RE.replace_all(text, "").trim().to_string()
        }
        _ => text.to_string(),
    }
}

/// 从首条用户消息的原始文本中检测客户端类型（轻量，仅字符串查找）
fn detect_client_from_text(text: &str, provider_name: &str) -> &'static str {
    match provider_name {
        "openclaw" => {
            if text.contains("Sender (untrusted metadata):") {
                "ui"
            } else if text.contains("[Subagent Task]:") || text.contains("[Subagent Context]") {
                "subagent"
            } else {
                "cli"
            }
        }
        "claude_code" => {
            if text.contains("<ide_selection>") {
                "vscode"
            } else {
                "cli"
            }
        }
        _ => "",
    }
}

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
    let metadata = std::fs::metadata(file_path).ok()?;
    let file_size = metadata.len();
    let file_mtime = metadata
        .modified()
        .ok()
        .map(|m| {
            let dt: chrono::DateTime<chrono::Utc> = m.into();
            dt.to_rfc3339()
        })
        .unwrap_or_default();
    let id = file_path.file_stem()?.to_str()?.to_string();

    let mut display = String::from("(Empty session)");
    let mut timestamp = String::new();
    let mut message_count: u32 = 0;
    let mut cwd = String::new();
    let mut client_type = String::new();
    let mut client_detected = false;

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

            // Find first user text message for display title + client type detection
            if display == "(Empty session)" {
                if let crate::models::EventType::User = event.event_type {
                    let mut first_raw = String::new();
                    for block in &event.content {
                        if let crate::models::ContentBlock::Text { text } = block {
                            // 从第一条文本块检测客户端环境
                            if !client_detected {
                                client_type = detect_client_from_text(text, provider_name).to_string();
                                client_detected = true;
                            }
                            // 记下原始文本作为兜底
                            if first_raw.is_empty() {
                                first_raw = text.clone();
                            }
                            let cleaned = clean_display_text(text, provider_name);
                            // 纯元数据块（清理后为空）→ 跳过，取下一个 text block
                            if cleaned.is_empty() {
                                continue;
                            }
                            display = cleaned.chars().take(80).collect();
                            if cleaned.len() > 80 {
                                display.push_str("...");
                            }
                            break;
                        }
                    }
                    // 兜底：所有 text block 都是元数据，用第一条的原文
                    if display == "(Empty session)" && !first_raw.is_empty() {
                        display = first_raw.chars().take(80).collect();
                        if first_raw.len() > 80 {
                            display.push_str("...");
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
        file_mtime,
        client_type,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::claude_code::ClaudeCodeProvider;
    use std::io::Write;

    // ===== clean_display_text 测试 =====

    #[test]
    fn test_clean_openclaw_display_with_sender_metadata() {
        let text = "Sender (untrusted metadata):\n```json\n{\"label\": \"test\"}\n```\n\n[Tue 2026-06-09 11:21 GMT+8] 如何配置子agent？";
        let cleaned = clean_display_text(text, "openclaw");
        assert_eq!(cleaned, "如何配置子agent？");
    }

    #[test]
    fn test_clean_openclaw_display_with_web_ui_sender() {
        let text = "Sender (untrusted metadata):\n```json\n{\"label\": \"openclaw-control-ui\", \"id\": \"openclaw-control-ui\"}\n```\n\n[Thu 2026-06-11 18:06 GMT+8] 请从知网查找5篇文献";
        let cleaned = clean_display_text(text, "openclaw");
        assert_eq!(cleaned, "请从知网查找5篇文献");
    }

    #[test]
    fn test_clean_openclaw_display_timestamp_only() {
        // 只有时间戳行，没有 sender 元数据
        let text = "[Tue 2026-06-09 11:21 GMT+8] 如何配置子agent？";
        let cleaned = clean_display_text(text, "openclaw");
        assert_eq!(cleaned, "如何配置子agent？");
    }

    #[test]
    fn test_clean_openclaw_display_no_prefix() {
        // 普通消息，无需清理
        let text = "直接的问题文本";
        let cleaned = clean_display_text(text, "openclaw");
        assert_eq!(cleaned, "直接的问题文本");
    }

    #[test]
    fn test_clean_openclaw_display_subagent_format() {
        let text = "[Mon 2026-06-08 20:45 GMT+8] [Subagent Context] You are running as a subagent (depth 1/1). Results auto-announce to your requester; do not busy-poll for status.\n\n[Subagent Task]: 请使用 cnki-yx-literature-search 技能检索关键词\"智障恢复\"的文献，返回结构化结果（标题、作者、来源、摘要、被引频次等）。";
        let cleaned = clean_display_text(text, "openclaw");
        assert_eq!(cleaned, "请使用 cnki-yx-literature-search 技能检索关键词\"智障恢复\"的文献，返回结构化结果（标题、作者、来源、摘要、被引频次等）。");
    }

    #[test]
    fn test_clean_claude_code_display_with_ide_selection() {
        let text = "<ide_selection>The user selected lines 13 to 13 from file.ts:\nTomlConfig\n\nThis may or may not be related to the current task.</ide_selection>\n现在我在config.toml文件中增加local_frontend_res = 1";
        let cleaned = clean_display_text(text, "claude_code");
        assert_eq!(cleaned, "现在我在config.toml文件中增加local_frontend_res = 1");
    }

    #[test]
    fn test_clean_claude_code_display_no_ide_selection() {
        let text = "这是一条普通的消息";
        let cleaned = clean_display_text(text, "claude_code");
        assert_eq!(cleaned, "这是一条普通的消息");
    }

    #[test]
    fn test_clean_claude_code_display_only_ide_selection() {
        // 纯元数据块，清理后为空（由调用方跳过取下一个 text block）
        let text = "<ide_selection>only selection</ide_selection>";
        let cleaned = clean_display_text(text, "claude_code");
        assert_eq!(cleaned, "");
    }

    // ===== detect_client_from_text 测试 =====

    #[test]
    fn test_detect_openclaw_ui_client() {
        let content = "Sender (untrusted metadata):\n```json\n{}\n```\n\n[Tue 2026-06-09 11:21 GMT+8] test";
        assert_eq!(detect_client_from_text(content, "openclaw"), "ui");
    }

    #[test]
    fn test_detect_openclaw_cli_client() {
        let content = "普通对话内容，没有 sender 元数据";
        assert_eq!(detect_client_from_text(content, "openclaw"), "cli");
    }

    #[test]
    fn test_detect_openclaw_subagent_client() {
        let content = "[Mon 2026-06-08 20:45 GMT+8] [Subagent Context] You are running as a subagent (depth 1/1).\n\n[Subagent Task]: 请检索文献";
        assert_eq!(detect_client_from_text(content, "openclaw"), "subagent");
    }

    #[test]
    fn test_detect_claude_code_vscode_client() {
        let content = "<ide_selection>selected text</ide_selection>\n用户消息";
        assert_eq!(detect_client_from_text(content, "claude_code"), "vscode");
    }

    #[test]
    fn test_detect_claude_code_cli_client() {
        let content = "用户在命令行中的消息";
        assert_eq!(detect_client_from_text(content, "claude_code"), "cli");
    }

    #[test]
    fn test_detect_unknown_provider() {
        assert_eq!(detect_client_from_text("anything", "unknown"), "");
    }

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
