use std::path::Path;
use std::sync::Arc;

use crate::models::{ChatEvent, SessionDetail, SessionSummary};
use crate::providers::base::{ChatProvider, ParseError};
use crate::utils::path::read_session_text;

/// Parse a JSONL session file and return all parsed events
pub fn parse_session_file(
    file_path: &Path,
    provider: &Arc<dyn ChatProvider>,
) -> Result<Vec<ChatEvent>, String> {
    let content = read_session_text(file_path)
        .ok_or_else(|| format!("Failed to read file: {}", file_path.display()))?;

    let mut events = Vec::new();

    for (line_num, line) in content.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        match provider.parse_event(trimmed) {
            Ok(event) => events.push(event),
            // Bookkeeping lines a provider intentionally drops (e.g. DeepSeek
            // Harness turn/step boundaries) are skipped silently.
            Err(ParseError::Skipped) => {}
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

    // Compute display title from first user event, using provider's clean_display_text
    let mut display = String::from("(Empty session)");
    for event in &events {
        if let crate::models::EventType::User = event.event_type {
            for block in &event.content {
                if let crate::models::ContentBlock::Text { text } = block {
                    let cleaned = provider.clean_display_text(text);
                    if !cleaned.is_empty() {
                        display = cleaned.chars().take(1000).collect();
                        if cleaned.len() > 1000 {
                            display.push_str("...");
                        }
                        break;
                    }
                }
            }
            if display != "(Empty session)" {
                break;
            }
        }
    }

    Ok(SessionDetail {
        id,
        file_path: file_path.to_string_lossy().to_string(),
        events,
        display,
    })
}

/// 仅用文件元数据创建骨架 SessionSummary，完全不读文件内容。
/// 速度快（仅 stat 调用），用于渐进式加载的第一遍渲染。
pub fn create_skeleton_summary(
    file_path: &Path,
    project_name: &str,
    project_path: &str,
    provider: &Arc<dyn ChatProvider>,
) -> Option<SessionSummary> {
    let metadata = std::fs::metadata(file_path).ok()?;
    // 使用 provider 特定的会话 ID（如 DeepSeek Harness 取父目录名），
    // 避免文件名固定（session.v4.jsonl）导致所有会话 ID 相同、React key 冲突。
    let id = provider.extract_session_id(file_path).unwrap_or_else(|| {
        file_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string()
    });
    let provider_name = provider.name().to_string();
    let file_size = metadata.len();
    let file_mtime = metadata
        .modified()
        .ok()
        .map(|m| {
            let dt: chrono::DateTime<chrono::Utc> = m.into();
            dt.to_rfc3339()
        })
        .unwrap_or_default();

    Some(SessionSummary {
        id: id.clone(),
        project_name: project_name.to_string(),
        project_path: project_path.to_string(),
        display: id,                   // 骨架阶段用文件名作为占位标题，polish 后替换
        timestamp: file_mtime.clone(), // 用文件修改时间作为初始时间戳，polish 后用真实时间戳替换
        message_count: 0,              // polish 后填充
        file_size,
        cwd: String::new(), // polish 后填充
        file_path: file_path.to_string_lossy().to_string(),
        provider_name,
        file_mtime,
        client_type: String::new(),    // polish 后填充
        last_user_text: String::new(), // polish 后填充
        storage_path: file_path
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default(),
    })
}

/// Create a SessionSummary by reading first and last events from a file.
///
/// When `quick` is true, skips display cleaning and client type detection —
/// the caller can later call `polish_session` to fill in those fields.
pub fn create_session_summary(
    file_path: &Path,
    project_name: &str,
    project_path: &str,
    provider: &Arc<dyn ChatProvider>,
    quick: bool,
) -> Option<SessionSummary> {
    let content = read_session_text(file_path)?;
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
    let mut last_user_text = String::new();
    let mut timestamp = String::new();
    let mut message_count: u32 = 0;
    let mut cwd = String::new();
    let mut client_type = String::new();
    let mut client_detected = false;
    let mut first_raw = String::new();

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
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    if let Some(raw_cwd) = provider.extract_cwd(&value) {
                        cwd = raw_cwd;
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

            // Track user text (first for display, last for hint)
            if let crate::models::EventType::User = event.event_type {
                for block in &event.content {
                    if let crate::models::ContentBlock::Text { text } = block {
                        if first_raw.is_empty() {
                            first_raw = text.clone();
                        }
                        let cleaned = provider.clean_display_text(text);
                        if !cleaned.is_empty() {
                            // Always update last_user_text on every user event
                            if quick {
                                last_user_text = text.chars().take(1000).collect();
                            } else {
                                last_user_text = cleaned.chars().take(1000).collect();
                            }
                        }
                        if display == "(Empty session)" {
                            // 快速模式：直接用原文，不清理、不检测
                            if quick {
                                display = text.chars().take(80).collect();
                                if text.len() > 80 {
                                    display.push_str("...");
                                }
                            } else {
                                // 完整模式：检测类型 + 清理显示文本
                                if !client_detected {
                                    client_type =
                                        provider.detect_client_from_text(text).to_string();
                                    client_detected = true;
                                }
                                let cleaned = provider.clean_display_text(text);
                                if cleaned.is_empty() {
                                    continue;
                                }
                                display = cleaned.chars().take(80).collect();
                                if cleaned.len() > 80 {
                                    display.push_str("...");
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 最终兜底：所有 User 事件的文本都是元数据/空，用第一条原文
    if display == "(Empty session)" && !first_raw.is_empty() {
        display = first_raw.chars().take(80).collect();
        if first_raw.len() > 80 {
            display.push_str("...");
        }
    }

    let provider_name = provider.name().to_string();

    Some(SessionSummary {
        id,
        project_name: project_name.to_string(),
        project_path: project_path.to_string(),
        display,
        last_user_text,
        timestamp,
        message_count,
        file_size,
        cwd,
        file_path: file_path.to_string_lossy().to_string(),
        provider_name,
        file_mtime,
        client_type,
        storage_path: provider
            .data_dir()
            .map(|d| d.to_string_lossy().to_string())
            .unwrap_or_else(|| {
                file_path
                    .parent()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_default()
            }),
    })
}

/// 渐进式加载用：对骨架会话进行内容读取 + display 清洗 + client_type 检测。
/// 返回更新后的字段，前端按 filePath 匹配更新列表。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPolish {
    pub file_path: String,
    pub display: String,
    pub last_user_text: String,
    pub timestamp: String,
    pub message_count: u32,
    pub cwd: String,
    pub client_type: String,
}

/// 对单个会话文件执行内容解析，返回 polish 结果。
pub fn polish_session(file_path: &Path, provider: &Arc<dyn ChatProvider>) -> Option<SessionPolish> {
    let content = read_session_text(file_path)?;
    let mut display = String::from("(Empty session)");
    let mut last_user_text = String::new();
    let mut timestamp = String::new();
    let mut message_count: u32 = 0;
    let mut cwd = String::new();
    let mut client_type = String::new();
    let mut client_detected = false;
    let mut first_raw = String::new();

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Ok(event) = provider.parse_event(trimmed) {
            if timestamp.is_empty() {
                timestamp = event.timestamp.clone();
            }
            if cwd.is_empty() {
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    if let Some(raw_cwd) = provider.extract_cwd(&value) {
                        cwd = raw_cwd;
                    }
                }
            }
            match event.event_type {
                crate::models::EventType::User | crate::models::EventType::Assistant => {
                    message_count += 1;
                }
                _ => {}
            }
            if let crate::models::EventType::User = event.event_type {
                // Detect client type from first user event
                if !client_detected {
                    if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
                        if let Some(raw_text) = provider.extract_raw_user_text(&value) {
                            client_type = provider.detect_client_from_text(&raw_text).to_string();
                            client_detected = true;
                        }
                    }
                }
                for block in &event.content {
                    if let crate::models::ContentBlock::Text { text } = block {
                        if first_raw.is_empty() {
                            first_raw = text.clone();
                        }
                        let cleaned = provider.clean_display_text(text);
                        if !cleaned.is_empty() {
                            // 始终更新最后一条用户消息
                            last_user_text = cleaned.chars().take(1000).collect();
                            // 仅在首次遇到时设置 display
                            if display == "(Empty session)" {
                                display = last_user_text.clone();
                                if cleaned.len() > 1000 {
                                    display.push_str("...");
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 最终兜底：所有 User 事件的文本都是元数据/空，用第一条原文
    if display == "(Empty session)" && !first_raw.is_empty() {
        display = first_raw.chars().take(1000).collect();
        if first_raw.len() > 1000 {
            display.push_str("...");
        }
    }

    Some(SessionPolish {
        file_path: file_path.to_string_lossy().to_string(),
        display,
        last_user_text,
        timestamp,
        message_count,
        cwd,
        client_type,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::claude_code::ClaudeCodeProvider;
    use crate::providers::codex::CodexProvider;
    use crate::providers::openclaw::OpenClawProvider;
    use std::io::Write;

    // ===== clean_display_text 测试 =====

    #[test]
    fn test_clean_openclaw_display_with_sender_metadata() {
        let provider = OpenClawProvider::new();
        let text = "Sender (untrusted metadata):\n```json\n{\"label\": \"test\"}\n```\n\n[Tue 2026-06-09 11:21 GMT+8] 如何配置子agent？";
        let cleaned = provider.clean_display_text(text);
        assert_eq!(cleaned, "如何配置子agent？");
    }

    #[test]
    fn test_clean_openclaw_display_with_web_ui_sender() {
        let provider = OpenClawProvider::new();
        let text = "Sender (untrusted metadata):\n```json\n{\"label\": \"openclaw-control-ui\", \"id\": \"openclaw-control-ui\"}\n```\n\n[Thu 2026-06-11 18:06 GMT+8] 请从知网查找5篇文献";
        let cleaned = provider.clean_display_text(text);
        assert_eq!(cleaned, "请从知网查找5篇文献");
    }

    #[test]
    fn test_clean_openclaw_display_timestamp_only() {
        let provider = OpenClawProvider::new();
        let text = "[Tue 2026-06-09 11:21 GMT+8] 如何配置子agent？";
        let cleaned = provider.clean_display_text(text);
        assert_eq!(cleaned, "如何配置子agent？");
    }

    #[test]
    fn test_clean_openclaw_display_no_prefix() {
        let provider = OpenClawProvider::new();
        let text = "直接的问题文本";
        let cleaned = provider.clean_display_text(text);
        assert_eq!(cleaned, "直接的问题文本");
    }

    #[test]
    fn test_clean_openclaw_display_subagent_format() {
        let provider = OpenClawProvider::new();
        let text = "[Mon 2026-06-08 20:45 GMT+8] [Subagent Context] You are running as a subagent (depth 1/1). Results auto-announce to your requester; do not busy-poll for status.\n\n[Subagent Task]: 请使用 cnki-yx-literature-search 技能检索关键词\"智障恢复\"的文献，返回结构化结果（标题、作者、来源、摘要、被引频次等）。";
        let cleaned = provider.clean_display_text(text);
        assert_eq!(cleaned, "请使用 cnki-yx-literature-search 技能检索关键词\"智障恢复\"的文献，返回结构化结果（标题、作者、来源、摘要、被引频次等）。");
    }

    #[test]
    fn test_clean_claude_code_display_with_ide_selection() {
        let provider = ClaudeCodeProvider::new();
        let text = "<ide_selection>The user selected lines 13 to 13 from file.ts:\nTomlConfig\n\nThis may or may not be related to the current task.</ide_selection>\n现在我在config.toml文件中增加local_frontend_res = 1";
        let cleaned = provider.clean_display_text(text);
        assert_eq!(
            cleaned,
            "现在我在config.toml文件中增加local_frontend_res = 1"
        );
    }

    #[test]
    fn test_clean_claude_code_display_no_ide_selection() {
        let provider = ClaudeCodeProvider::new();
        let text = "这是一条普通的消息";
        let cleaned = provider.clean_display_text(text);
        assert_eq!(cleaned, "这是一条普通的消息");
    }

    #[test]
    fn test_clean_claude_code_display_only_ide_selection() {
        let provider = ClaudeCodeProvider::new();
        let text = "<ide_selection>only selection</ide_selection>";
        let cleaned = provider.clean_display_text(text);
        assert_eq!(cleaned, "");
    }

    #[test]
    fn test_clean_claude_code_display_ide_opened_file() {
        let provider = ClaudeCodeProvider::new();
        let text = "<ide_opened_file>The user opened the file f:\\work_project\\config.toml in the IDE. This may or may not be related to the current task.</ide_opened_file>\nconfig.toml这个文件的内容符合标准格式吗？";
        let cleaned = provider.clean_display_text(text);
        assert_eq!(cleaned, "config.toml这个文件的内容符合标准格式吗？");
    }

    #[test]
    fn test_clean_claude_code_display_only_ide_opened_file() {
        let provider = ClaudeCodeProvider::new();
        let text = "<ide_opened_file>opened config.toml</ide_opened_file>";
        let cleaned = provider.clean_display_text(text);
        assert_eq!(cleaned, "");
    }

    #[test]
    fn test_clean_claude_code_display_local_command_caveat() {
        let provider = ClaudeCodeProvider::new();
        let text = "<local-command-caveat>Caveat: The messages below were generated by the user while running local commands.</local-command-caveat>";
        let cleaned = provider.clean_display_text(text);
        assert_eq!(cleaned, "");
    }

    #[test]
    fn test_clean_claude_code_display_mixed_tags() {
        let provider = ClaudeCodeProvider::new();
        let text = "<ide_opened_file>opened file</ide_opened_file>\n<ide_selection>selected lines</ide_selection>\n实际的问题";
        let cleaned = provider.clean_display_text(text);
        assert_eq!(cleaned, "实际的问题");
    }

    #[test]
    fn test_clean_codex_display_strips_environment_context() {
        let provider = CodexProvider::new();
        let text = "<environment_context>\n  <cwd>/test</cwd>\n  <shell>powershell</shell>\n</environment_context>";
        let cleaned = provider.clean_display_text(text);
        assert_eq!(cleaned, "");
    }

    #[test]
    fn test_clean_codex_display_strips_tags_preserves_user_message() {
        let provider = CodexProvider::new();
        let text =
            "<environment_context>\n  <cwd>/test</cwd>\n</environment_context>\n今天几号了？";
        let cleaned = provider.clean_display_text(text);
        assert_eq!(cleaned, "今天几号了？");
    }

    // ===== detect_client_from_text 测试 =====

    #[test]
    fn test_detect_openclaw_ui_client() {
        let provider = OpenClawProvider::new();
        let content =
            "Sender (untrusted metadata):\n```json\n{}\n```\n\n[Tue 2026-06-09 11:21 GMT+8] test";
        assert_eq!(provider.detect_client_from_text(content), "ui");
    }

    #[test]
    fn test_detect_openclaw_cli_client() {
        let provider = OpenClawProvider::new();
        let content = "普通对话内容，没有 sender 元数据";
        assert_eq!(provider.detect_client_from_text(content), "cli");
    }

    #[test]
    fn test_detect_openclaw_subagent_client() {
        let provider = OpenClawProvider::new();
        let content = "[Mon 2026-06-08 20:45 GMT+8] [Subagent Context] You are running as a subagent (depth 1/1).\n\n[Subagent Task]: 请检索文献";
        assert_eq!(provider.detect_client_from_text(content), "subagent");
    }

    #[test]
    fn test_detect_claude_code_vscode_client() {
        let provider = ClaudeCodeProvider::new();
        let content = "<ide_selection>selected text</ide_selection>\n用户消息";
        assert_eq!(provider.detect_client_from_text(content), "vscode");
    }

    #[test]
    fn test_detect_claude_code_vscode_via_ide_opened_file() {
        let provider = ClaudeCodeProvider::new();
        let content = "<ide_opened_file>opened config.toml</ide_opened_file>\n用户消息";
        assert_eq!(provider.detect_client_from_text(content), "vscode");
    }

    #[test]
    fn test_detect_claude_code_cli_client() {
        let provider = ClaudeCodeProvider::new();
        let content = "用户在命令行中的消息";
        assert_eq!(provider.detect_client_from_text(content), "cli");
    }

    #[test]
    fn test_detect_codex_desktop_client() {
        let provider = CodexProvider::new();
        let content = "<environment_context><cwd>/test</cwd></environment_context>";
        assert_eq!(provider.detect_client_from_text(content), "desktop");
    }

    #[test]
    fn test_trait_default_detect_client() {
        // The trait default returns empty string
        use crate::providers::base::ChatProvider;
        // Verify Codex always returns desktop even without XML tags
        let provider = CodexProvider::new();
        assert_eq!(provider.detect_client_from_text("plain message"), "desktop");
    }

    #[test]
    fn test_polish_session_tracks_last_user_text() {
        use crate::providers::claude_code::ClaudeCodeProvider;
        use std::io::Write;
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("multi-user.jsonl");
        let content = concat!(
            r#"{"type":"user","message":{"role":"user","content":"First question"},"uuid":"u1","timestamp":"2026-01-01T00:00:00Z","sessionId":"s1"}"#,
            "\n",
            r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Answer 1"}]},"uuid":"u2","timestamp":"2026-01-01T00:00:01Z","sessionId":"s1"}"#,
            "\n",
            r#"{"type":"user","message":{"role":"user","content":"Second question"},"uuid":"u3","timestamp":"2026-01-01T00:00:02Z","sessionId":"s1"}"#,
            "\n",
            r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Answer 2"}]},"uuid":"u4","timestamp":"2026-01-01T00:00:03Z","sessionId":"s1"}"#,
            "\n",
            r#"{"type":"user","message":{"role":"user","content":"Third question"},"uuid":"u5","timestamp":"2026-01-01T00:00:04Z","sessionId":"s1"}"#,
            "\n",
        );
        let mut file = std::fs::File::create(&file_path).unwrap();
        file.write_all(content.as_bytes()).unwrap();
        let provider: Arc<dyn ChatProvider> = Arc::new(ClaudeCodeProvider::new());
        let polished = polish_session(&file_path, &provider).unwrap();
        assert_eq!(polished.display, "First question");
        assert_eq!(polished.last_user_text, "Third question");
        assert_eq!(polished.message_count, 5);
    }

    // ===== create_skeleton_summary 测试 =====

    #[test]
    fn test_skeleton_uses_file_metadata() {
        let (dir, file_path) = create_temp_jsonl(
            r#"{"type":"user","message":{"role":"user","content":"Hello"},"uuid":"u1","timestamp":"2026-06-09T10:00:00Z","sessionId":"s1"}"#,
        );
        let provider: Arc<dyn ChatProvider> = Arc::new(ClaudeCodeProvider::new());
        let summary =
            create_skeleton_summary(&file_path, "test-proj", "/test/proj", &provider).unwrap();

        assert_eq!(summary.project_name, "test-proj");
        assert_eq!(summary.provider_name, "claude_code");
        assert_eq!(summary.client_type, ""); // 骨架阶段为空
        assert_eq!(summary.message_count, 0); // 骨架阶段为 0
        assert_eq!(summary.cwd, "");
        assert!(!summary.file_mtime.is_empty());
        assert!(summary.file_size > 0);
        assert_eq!(
            summary.storage_path,
            dir.path().to_string_lossy().to_string(),
            "storage_path 默认为 file_path 父目录"
        );
    }

    #[test]
    fn test_skeleton_returns_none_for_missing_file() {
        let provider: Arc<dyn ChatProvider> = Arc::new(ClaudeCodeProvider::new());
        let result =
            create_skeleton_summary(Path::new("/nonexistent/file.jsonl"), "p", "/p", &provider);
        assert!(result.is_none());
    }

    // ===== polish_session 测试 =====

    #[test]
    fn test_polish_session_fills_all_fields() {
        let (_dir, file_path) = create_temp_jsonl(
            r#"{"type":"user","message":{"role":"user","content":"Hello Claude"},"uuid":"u1","timestamp":"2026-06-09T10:00:00Z","sessionId":"s1","cwd":"/work"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hi there!"}]},"uuid":"u2","timestamp":"2026-06-09T10:00:01Z","sessionId":"s1"}
"#,
        );
        let provider: Arc<dyn ChatProvider> = Arc::new(ClaudeCodeProvider::new());
        let polished = polish_session(&file_path, &provider).unwrap();

        assert_eq!(polished.file_path, file_path.to_string_lossy());
        assert_eq!(polished.display, "Hello Claude");
        assert_eq!(polished.client_type, "cli"); // 无 <ide_selection>
        assert_eq!(polished.message_count, 2); // 1 user + 1 assistant
        assert!(!polished.timestamp.is_empty());
        assert_eq!(polished.cwd, "/work");
    }

    #[test]
    fn test_polish_session_vscode_display_cleaned() {
        let (_dir, file_path) = create_temp_jsonl(
            r#"{"type":"user","message":{"role":"user","content":[{"type":"text","text":"<ide_selection>selected lines</ide_selection>"},{"type":"text","text":"实际的问题内容"}]},"uuid":"u1","timestamp":"2026-06-09T10:00:00Z","sessionId":"s1"}
"#,
        );
        let provider: Arc<dyn ChatProvider> = Arc::new(ClaudeCodeProvider::new());
        let polished = polish_session(&file_path, &provider).unwrap();

        assert_eq!(polished.display, "实际的问题内容"); // 第一个 block 被跳过
        assert_eq!(polished.client_type, "vscode"); // 从第一个 block 检测到
    }

    #[test]
    fn test_polish_session_returns_none_for_missing_file() {
        let provider: Arc<dyn ChatProvider> = Arc::new(ClaudeCodeProvider::new());
        let result = polish_session(Path::new("/nonexistent/file.jsonl"), &provider);
        assert!(result.is_none());
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
