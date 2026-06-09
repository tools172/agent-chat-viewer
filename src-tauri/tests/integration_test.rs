use std::sync::Arc;

use agent_chat_viewer_lib::models::{AppSettings, FilterConfig};
use agent_chat_viewer_lib::providers::base::ChatProvider;
use agent_chat_viewer_lib::providers::claude_code::ClaudeCodeProvider;
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
