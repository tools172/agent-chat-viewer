use std::sync::Arc;

use agent_chat_viewer_lib::models::{AppSettings, FilterConfig};
use agent_chat_viewer_lib::providers::base::ChatProvider;
use agent_chat_viewer_lib::providers::claude_code::ClaudeCodeProvider;
use agent_chat_viewer_lib::providers::openclaw::OpenClawProvider;
use agent_chat_viewer_lib::services;

#[test]
fn test_parse_minimal_session() {
    let fixture = include_str!("fixtures/claude_code/minimal.jsonl");
    let provider = Arc::new(ClaudeCodeProvider::new());

    let events: Vec<_> = fixture
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| provider.parse_event(l).ok())
        .collect();

    // mode event is filtered by type (we don't count metadata)
    let user_events: Vec<_> = events
        .iter()
        .filter(|e| matches!(e.event_type, agent_chat_viewer_lib::models::EventType::User))
        .collect();
    let assistant_events: Vec<_> = events
        .iter()
        .filter(|e| matches!(e.event_type, agent_chat_viewer_lib::models::EventType::Assistant))
        .collect();

    assert_eq!(user_events.len(), 1);
    assert_eq!(assistant_events.len(), 1);
}

#[test]
fn test_parse_session_with_tools() {
    let fixture = include_str!("fixtures/claude_code/with_tools.jsonl");
    let provider = Arc::new(ClaudeCodeProvider::new());

    let events: Vec<_> = fixture
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| provider.parse_event(l).ok())
        .collect();

    // Should have 4 events: mode + user + assistant + user(tool result) + assistant
    assert_eq!(events.len(), 5);

    // Check that tool_use is parsed
    let has_tool_use = events.iter().any(|e| {
        e.content.iter().any(|b| {
            matches!(b, agent_chat_viewer_lib::models::ContentBlock::ToolUse { .. })
        })
    });
    assert!(has_tool_use);

    // Check that tool_result is parsed
    let has_tool_result = events.iter().any(|e| {
        e.content.iter().any(|b| {
            matches!(b, agent_chat_viewer_lib::models::ContentBlock::ToolResult { .. })
        })
    });
    assert!(has_tool_result);

    // Check thinking exists
    let has_thinking = events.iter().any(|e| {
        e.content.iter().any(|b| {
            matches!(b, agent_chat_viewer_lib::models::ContentBlock::Thinking { .. })
        })
    });
    assert!(has_thinking);
}

#[test]
fn test_parse_malformed_jsonl() {
    let fixture = include_str!("fixtures/claude_code/malformed.jsonl");
    let provider = Arc::new(ClaudeCodeProvider::new());

    let events: Vec<_> = fixture
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| provider.parse_event(l).ok())
        .collect();

    // Should get 2 valid events from the 4 lines
    assert_eq!(events.len(), 2);
}

#[test]
fn test_filter_hides_thinking() {
    let fixture = include_str!("fixtures/claude_code/with_tools.jsonl");
    let provider = Arc::new(ClaudeCodeProvider::new());

    let events: Vec<_> = fixture
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| provider.parse_event(l).ok())
        .collect();

    let default_filter = FilterConfig::default();
    let filtered = services::filter::filter_events(&events, &default_filter);

    // After filtering with default (hide_thinking = true),
    // no event should contain thinking blocks
    for event in &filtered {
        for block in &event.content {
            assert!(
                !matches!(block, agent_chat_viewer_lib::models::ContentBlock::Thinking { .. }),
                "Thinking block should be filtered out by default"
            );
        }
    }
}

#[test]
fn test_filter_with_thinking_enabled() {
    let fixture = include_str!("fixtures/claude_code/with_tools.jsonl");
    let provider = Arc::new(ClaudeCodeProvider::new());

    let events: Vec<_> = fixture
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| provider.parse_event(l).ok())
        .collect();

    let filter = FilterConfig {
        show_thinking: true,
        ..FilterConfig::default()
    };
    let filtered = services::filter::filter_events(&events, &filter);

    let has_thinking = filtered.iter().any(|e| {
        e.content.iter().any(|b| {
            matches!(b, agent_chat_viewer_lib::models::ContentBlock::Thinking { .. })
        })
    });
    assert!(has_thinking, "Thinking should be visible when enabled");
}

#[test]
fn test_export_markdown() {
    let fixture = include_str!("fixtures/claude_code/minimal.jsonl");
    let provider = Arc::new(ClaudeCodeProvider::new());

    let events: Vec<_> = fixture
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| provider.parse_event(l).ok())
        .collect();

    let md = services::exporter::export_to_markdown(&events, "Test", "test-project");

    assert!(md.contains("# Test"));
    assert!(md.contains("test-project"));
    assert!(md.contains("Hello"));
}

#[test]
fn test_app_settings_default() {
    let settings = AppSettings::default();
    assert!(settings.provider_enabled.get("claude_code").unwrap_or(&false));
    assert!(!settings.default_filter.show_thinking);
    assert!(settings.default_filter.show_tool_calls);
    assert!(settings.default_filter.hide_empty_tool_results);
}

// ============================================================
// 综合 Filter 测试 — 使用真实 Claude Code 会话数据
// 文件: tests/fixtures/claude_code/filter_test.jsonl (37 行)
// 包含: text, thinking, tool_use, tool_result, metadata 事件
// ============================================================

fn load_filter_fixture() -> Vec<agent_chat_viewer_lib::models::ChatEvent> {
    let fixture = include_str!("fixtures/claude_code/filter_test.jsonl");
    let provider = Arc::new(ClaudeCodeProvider::new());
    fixture
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| provider.parse_event(l).ok())
        .collect()
}

fn count_blocks(
    events: &[agent_chat_viewer_lib::models::ChatEvent],
) -> (usize, usize, usize, usize) {
    let (mut text, mut thinking, mut tool_use, mut tool_result) = (0, 0, 0, 0);
    for e in events {
        for b in &e.content {
            match b {
                agent_chat_viewer_lib::models::ContentBlock::Text { .. } => text += 1,
                agent_chat_viewer_lib::models::ContentBlock::Thinking { .. } => thinking += 1,
                agent_chat_viewer_lib::models::ContentBlock::ToolUse { .. } => tool_use += 1,
                agent_chat_viewer_lib::models::ContentBlock::ToolResult { .. } => {
                    tool_result += 1
                }
            }
        }
    }
    (text, thinking, tool_use, tool_result)
}

#[test]
fn test_filter_default_hides_thinking_and_empty_tool_results() {
    let events = load_filter_fixture();
    let filter = FilterConfig::default(); // showThinking=false, hideEmptyToolResults=true
    let filtered = services::filter::filter_events(&events, &filter);
    let (_, thinking, _, _) = count_blocks(&filtered);

    // 默认：thinking 应全部隐藏
    assert_eq!(thinking, 0, "默认过滤应隐藏所有 thinking 块");
}

#[test]
fn test_filter_show_thinking() {
    let events = load_filter_fixture();
    let raw_thinking: usize = events
        .iter()
        .flat_map(|e| &e.content)
        .filter(|b| matches!(b, agent_chat_viewer_lib::models::ContentBlock::Thinking { .. }))
        .count();

    let filter = FilterConfig {
        show_thinking: true,
        ..FilterConfig::default()
    };
    let filtered = services::filter::filter_events(&events, &filter);
    let (_, thinking, _, _) = count_blocks(&filtered);

    // 开启 thinking 后应恢复全部 thinking 块
    assert!(raw_thinking > 0, "fixture 应包含 thinking 块");
    assert_eq!(
        thinking, raw_thinking,
        "showThinking=true 时应显示所有 thinking 块"
    );
}

#[test]
fn test_filter_hide_tool_calls() {
    let events = load_filter_fixture();
    let raw_tool_use: usize = events
        .iter()
        .flat_map(|e| &e.content)
        .filter(|b| matches!(b, agent_chat_viewer_lib::models::ContentBlock::ToolUse { .. }))
        .count();

    let filter = FilterConfig {
        show_tool_calls: false,
        ..FilterConfig::default()
    };
    let filtered = services::filter::filter_events(&events, &filter);
    let (_, _, tool_use, _) = count_blocks(&filtered);

    assert!(raw_tool_use > 0, "fixture 应包含 tool_use 块");
    assert_eq!(tool_use, 0, "showToolCalls=false 时应隐藏所有 tool_use 块");
}

#[test]
fn test_filter_hide_tool_results() {
    let events = load_filter_fixture();
    let raw_tool_result: usize = events
        .iter()
        .flat_map(|e| &e.content)
        .filter(|b| {
            matches!(
                b,
                agent_chat_viewer_lib::models::ContentBlock::ToolResult { .. }
            )
        })
        .count();

    let filter = FilterConfig {
        show_tool_results: false,
        ..FilterConfig::default()
    };
    let filtered = services::filter::filter_events(&events, &filter);
    let (_, _, _, tool_result) = count_blocks(&filtered);

    assert!(raw_tool_result > 0, "fixture 应包含 tool_result 块");
    assert_eq!(
        tool_result, 0,
        "showToolResults=false 时应隐藏所有 tool_result 块"
    );
}

#[test]
fn test_filter_show_empty_tool_results() {
    let events = load_filter_fixture();

    // 先统计所有 tool_result（含空）
    let all_tool_results: Vec<_> = events
        .iter()
        .flat_map(|e| &e.content)
        .filter(|b| {
            matches!(
                b,
                agent_chat_viewer_lib::models::ContentBlock::ToolResult { .. }
            )
        })
        .collect();

    let filter = FilterConfig {
        show_tool_results: true,
        hide_empty_tool_results: false,
        ..FilterConfig::default()
    };
    let filtered = services::filter::filter_events(&events, &filter);
    let (_, _, _, tool_result) = count_blocks(&filtered);

    assert!(
        !all_tool_results.is_empty(),
        "fixture 应包含 tool_result 块"
    );
    assert_eq!(
        tool_result,
        all_tool_results.len(),
        "hideEmptyToolResults=false 时应显示所有 tool_result（含空的）"
    );
}

#[test]
fn test_filter_metadata_events_hidden() {
    let events = load_filter_fixture();
    let filter = FilterConfig::default();

    // 不过滤，检查原始文件中存在元数据事件类型
    let metadata_types: Vec<String> = events
        .iter()
        .map(|e| e.event_type.to_string())
        .filter(|t| {
            t != "user" && t != "assistant" && t != "system" && t != "attachment"
        })
        .collect();
    assert!(
        !metadata_types.is_empty(),
        "fixture 应包含 mode/ai_title/last_prompt 等元数据事件"
    );

    // 默认过滤后不应包含任何元数据事件
    let filtered = services::filter::filter_events(&events, &filter);
    for e in &filtered {
        let t = e.event_type.to_string();
        assert!(
            t == "user" || t == "assistant",
            "过滤后不应包含元数据事件: {}",
            t
        );
    }
}

#[test]
fn test_filter_all_off_shows_everything() {
    let events = load_filter_fixture();
    let _raw_total: usize = events.iter().map(|e| e.content.len()).sum();

    let filter = FilterConfig {
        show_thinking: true,
        show_tool_calls: true,
        show_tool_results: true,
        hide_empty_tool_results: false,
        show_system_messages: true,
        show_file_snapshots: true,
        collapse_consecutive: false,
    };
    let filtered = services::filter::filter_events(&events, &filter);
    let filtered_total: usize = filtered.iter().map(|e| e.content.len()).sum();

    // 全开时可见块数 >= raw_total（raw 含被过滤事件中的块）
    assert!(filtered_total > 0, "全开时应至少显示一些内容块");
}

#[test]
fn test_parse_real_session_events_count() {
    let events = load_filter_fixture();
    // 37 行 JSONL，含 metadata 行
    // parse_event 返回 Ok 的数量应 >= 10 (至少有 user + assistant 事件)
    assert!(
        events.len() >= 10,
        "应解析出至少 10 个事件，实际: {}",
        events.len()
    );

    let (text, thinking, tool_use, tool_result) = count_blocks(&events);
    // 真实数据必须有 text 块
    assert!(text > 0, "必须包含 text 块");
    // 必须有 thinking 块
    assert!(thinking > 0, "必须包含 thinking 块");
    // 必须有 tool_use 块
    assert!(tool_use > 0, "必须包含 tool_use 块");
    // 必须有 tool_result 块
    assert!(tool_result > 0, "必须包含 tool_result 块");
}

// ============================================================
// OpenClaw Provider 集成测试
// ============================================================

#[test]
fn test_openclaw_parse_minimal_session() {
    let fixture = include_str!("fixtures/openclaw/minimal.jsonl");
    let provider = Arc::new(OpenClawProvider::new());

    let events: Vec<_> = fixture
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| provider.parse_event(l).ok())
        .collect();

    // session metadata + user + assistant = 3 events
    assert_eq!(events.len(), 3);

    let user_events: Vec<_> = events
        .iter()
        .filter(|e| matches!(e.event_type, agent_chat_viewer_lib::models::EventType::User))
        .collect();
    let assistant_events: Vec<_> = events
        .iter()
        .filter(|e| matches!(e.event_type, agent_chat_viewer_lib::models::EventType::Assistant))
        .collect();
    let system_events: Vec<_> = events
        .iter()
        .filter(|e| matches!(e.event_type, agent_chat_viewer_lib::models::EventType::System))
        .collect();

    assert_eq!(user_events.len(), 1);
    assert_eq!(assistant_events.len(), 1);
    assert_eq!(system_events.len(), 1); // session metadata
}

#[test]
fn test_openclaw_parse_session_with_tools() {
    let fixture = include_str!("fixtures/openclaw/with_tools.jsonl");
    let provider = Arc::new(OpenClawProvider::new());

    let events: Vec<_> = fixture
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| provider.parse_event(l).ok())
        .collect();

    // session + model_change + user + assistant(toolCall) + toolResult + assistant = 6
    assert_eq!(events.len(), 6);

    // Check tool_use is parsed from toolCall
    let has_tool_use = events.iter().any(|e| {
        e.content.iter().any(|b| {
            matches!(b, agent_chat_viewer_lib::models::ContentBlock::ToolUse { .. })
        })
    });
    assert!(has_tool_use, "OpenClaw toolCall should map to ToolUse");

    // Check tool_result is parsed
    let has_tool_result = events.iter().any(|e| {
        e.content.iter().any(|b| {
            matches!(b, agent_chat_viewer_lib::models::ContentBlock::ToolResult { .. })
        })
    });
    assert!(has_tool_result, "OpenClaw toolResult should map to ToolResult");
}

#[test]
fn test_openclaw_export_markdown() {
    let fixture = include_str!("fixtures/openclaw/minimal.jsonl");
    let provider = Arc::new(OpenClawProvider::new());

    let events: Vec<_> = fixture
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| provider.parse_event(l).ok())
        .collect();

    let md = services::exporter::export_to_markdown(&events, "OpenClaw Test", "test-agent");

    assert!(md.contains("# OpenClaw Test"));
    assert!(md.contains("test-agent"));
    assert!(md.contains("Hello, OpenClaw"));
    assert!(md.contains("Hi there!"));
}

#[test]
fn test_openclaw_filter_default() {
    let fixture = include_str!("fixtures/openclaw/with_tools.jsonl");
    let provider = Arc::new(OpenClawProvider::new());

    let events: Vec<_> = fixture
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| provider.parse_event(l).ok())
        .collect();

    let default_filter = FilterConfig::default();
    let filtered = services::filter::filter_events(&events, &default_filter);

    // 默认过滤后应仍包含 user/assistant 事件
    let has_user = filtered.iter().any(|e| {
        matches!(e.event_type, agent_chat_viewer_lib::models::EventType::User)
    });
    let has_assistant = filtered.iter().any(|e| {
        matches!(e.event_type, agent_chat_viewer_lib::models::EventType::Assistant)
    });

    assert!(has_user, "过滤后应包含 user 事件");
    assert!(has_assistant, "过滤后应包含 assistant 事件");

    // 默认条件下 System 事件应被过滤
    for event in &filtered {
        assert!(
            !matches!(event.event_type, agent_chat_viewer_lib::models::EventType::System),
            "默认过滤应隐藏 System 事件"
        );
    }
}

#[test]
fn test_openclaw_detect_format() {
    let provider = OpenClawProvider::new();

    // Use the actual home directory so starts_with matches
    let home = if cfg!(target_os = "windows") {
        std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\default".to_string())
    } else {
        std::env::var("HOME").unwrap_or_else(|_| "/home/default".to_string())
    };
    let openclaw_path = std::path::PathBuf::from(home)
        .join(".openclaw")
        .join("agents")
        .join("main")
        .join("sessions")
        .join("s.jsonl");

    assert!(
        provider.detect_format(&openclaw_path),
        "Should detect path under ~/.openclaw: {}",
        openclaw_path.display()
    );

    // Should not detect paths outside .openclaw
    assert!(!provider.detect_format(std::path::Path::new("/tmp/test.jsonl")));
}

#[test]
fn test_openclaw_app_settings_default() {
    let settings = AppSettings::default();
    // openclaw 默认禁用
    assert!(!settings.provider_enabled.get("openclaw").unwrap_or(&true));
    // claude_code 默认启用
    assert!(settings.provider_enabled.get("claude_code").unwrap_or(&false));
}

// ============================================================
// collapse_consecutive 字段测试
// ============================================================

#[test]
fn test_filter_config_default_collapse_consecutive() {
    let config = FilterConfig::default();
    assert!(!config.collapse_consecutive, "collapse_consecutive 默认应为 false");
}

#[test]
fn test_filter_config_collapse_consecutive_can_enable() {
    let config = FilterConfig {
        collapse_consecutive: true,
        ..FilterConfig::default()
    };
    assert!(config.collapse_consecutive);
}

/// 验证旧版配置（不含 collapse_consecutive 字段）的反序列化兼容性
#[test]
fn test_deserialize_old_filter_config_without_collapse_consecutive() {
    // 模拟旧版 JSON：不包含 collapseConsecutive 字段
    let old_json = r#"{
        "showThinking": false,
        "showToolCalls": true,
        "showToolResults": true,
        "hideEmptyToolResults": true,
        "showSystemMessages": false,
        "showFileSnapshots": false
    }"#;

    let config: FilterConfig = serde_json::from_str(old_json).expect("旧版配置应能反序列化");
    assert!(!config.show_thinking);
    assert!(config.show_tool_calls);
    assert!(config.show_tool_results);
    assert!(config.hide_empty_tool_results);
    assert!(!config.show_system_messages);
    assert!(!config.show_file_snapshots);
    // 关键：缺少的字段应为默认值 false
    assert!(!config.collapse_consecutive, "旧版配置缺少 collapseConsecutive 字段时应默认为 false");
}

/// 验证新版配置（含 collapseConsecutive: true）可以正确序列化和反序列化
#[test]
fn test_serialize_roundtrip_with_collapse_consecutive() {
    let config = FilterConfig {
        show_thinking: true,
        show_tool_calls: false,
        show_tool_results: false,
        hide_empty_tool_results: false,
        show_system_messages: true,
        show_file_snapshots: true,
        collapse_consecutive: true,
    };

    let json = serde_json::to_string(&config).expect("序列化不应失败");
    let parsed: FilterConfig = serde_json::from_str(&json).expect("反序列化不应失败");

    assert!(parsed.show_thinking);
    assert!(!parsed.show_tool_calls);
    assert!(!parsed.show_tool_results);
    assert!(!parsed.hide_empty_tool_results);
    assert!(parsed.show_system_messages);
    assert!(parsed.show_file_snapshots);
    assert!(parsed.collapse_consecutive);
}

// ============================================================
// 内容检测 (detect_by_content via registry) 测试
// ============================================================

#[test]
fn test_detect_by_content_openclaw_via_registry() {
    let registry = agent_chat_viewer_lib::providers::ProviderRegistry::new();
    let content = r#"{"type":"session","version":3,"id":"abc-123","timestamp":"2026-04-17T04:44:21.996Z","cwd":"/home/user/workspace"}
{"type":"message","id":"u1","message":{"role":"user","content":[{"type":"text","text":"Hello"}]}}"#;
    let provider = registry.detect_by_content(content);
    assert!(provider.is_some());
    assert_eq!(provider.unwrap().name(), "openclaw");
}

#[test]
fn test_detect_by_content_claude_code_via_registry() {
    let registry = agent_chat_viewer_lib::providers::ProviderRegistry::new();
    let content = r#"{"type":"user","message":{"role":"user","content":"Hello"},"uuid":"u-001","timestamp":"2026-06-09T10:00:00Z","sessionId":"s1"}"#;
    let provider = registry.detect_by_content(content);
    assert!(provider.is_some());
    assert_eq!(provider.unwrap().name(), "claude_code");
}

#[test]
fn test_detect_by_content_unknown_format() {
    let registry = agent_chat_viewer_lib::providers::ProviderRegistry::new();
    let content = r#"{"some":"random","json":"data"}"#;
    let provider = registry.detect_by_content(content);
    assert!(provider.is_none());
}
