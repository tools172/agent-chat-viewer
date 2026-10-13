use crate::models::{ChatEvent, ContentBlock, EventType, FilterConfig};

/// Apply filter configuration to a list of events.
/// Returns only the events that should be displayed.
pub fn filter_events(events: &[ChatEvent], config: &FilterConfig) -> Vec<ChatEvent> {
    events
        .iter()
        .filter(|event| should_show_event(event, config))
        .map(|event| filter_event_content(event, config))
        .collect()
}

/// Determine if an event should be shown based on its type
fn should_show_event(event: &ChatEvent, config: &FilterConfig) -> bool {
    match event.event_type {
        EventType::User | EventType::Assistant => {
            // For user/assistant events, check if any content remains after filtering
            let visible_blocks: Vec<&ContentBlock> = event
                .content
                .iter()
                .filter(|block| should_show_block(block, config, &event.event_type))
                .collect();
            !visible_blocks.is_empty()
        }
        EventType::Developer | EventType::System => config.show_system_messages,
        EventType::FileHistorySnapshot => config.show_file_snapshots,
        EventType::Mode
        | EventType::PermissionMode
        | EventType::LastPrompt
        | EventType::AiTitle => false, // Always hide metadata events
        EventType::Attachment => config.show_system_messages,
        EventType::Unknown(_) => config.show_system_messages,
    }
}

/// Determine if a content block should be shown
fn should_show_block(block: &ContentBlock, config: &FilterConfig, _event_type: &EventType) -> bool {
    match block {
        ContentBlock::Text { .. } => true, // Always show text
        ContentBlock::Thinking { .. } => config.show_thinking,
        ContentBlock::ToolUse { .. } => config.show_tool_calls,
        ContentBlock::ToolResult { .. } => {
            if !config.show_tool_results {
                return false;
            }
            if config.hide_empty_tool_results && block.is_empty_tool_result() {
                return false;
            }
            true
        }
    }
}

/// Filter individual content blocks within an event
fn filter_event_content(event: &ChatEvent, config: &FilterConfig) -> ChatEvent {
    let filtered_content: Vec<ContentBlock> = event
        .content
        .iter()
        .filter(|block| should_show_block(block, config, &event.event_type))
        .cloned()
        .collect();

    ChatEvent {
        uuid: event.uuid.clone(),
        parent_uuid: event.parent_uuid.clone(),
        event_type: event.event_type.clone(),
        timestamp: event.timestamp.clone(),
        content: filtered_content,
        session_id: event.session_id.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_event(event_type: EventType, blocks: Vec<ContentBlock>) -> ChatEvent {
        ChatEvent {
            uuid: "test-uuid".to_string(),
            parent_uuid: None,
            event_type,
            timestamp: "2026-06-09T10:00:00Z".to_string(),
            content: blocks,
            session_id: None,
        }
    }

    #[test]
    fn test_filter_hides_thinking_by_default() {
        let config = FilterConfig::default(); // show_thinking = false
        let events = vec![make_event(
            EventType::Assistant,
            vec![
                ContentBlock::Thinking {
                    thinking: "Hmm...".to_string(),
                    signature: "sig".to_string(),
                },
                ContentBlock::Text {
                    text: "Hello!".to_string(),
                },
            ],
        )];

        let filtered = filter_events(&events, &config);
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].content.len(), 1);
        assert!(matches!(filtered[0].content[0], ContentBlock::Text { .. }));
    }

    #[test]
    fn test_filter_shows_thinking_when_enabled() {
        let config = FilterConfig {
            show_thinking: true,
            ..FilterConfig::default()
        };
        let events = vec![make_event(
            EventType::Assistant,
            vec![
                ContentBlock::Thinking {
                    thinking: "Hmm...".to_string(),
                    signature: "sig".to_string(),
                },
                ContentBlock::Text {
                    text: "Hello!".to_string(),
                },
            ],
        )];

        let filtered = filter_events(&events, &config);
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].content.len(), 2);
    }

    #[test]
    fn test_filter_hides_empty_tool_results() {
        let config = FilterConfig::default(); // hide_empty_tool_results = true
        let events = vec![make_event(
            EventType::User,
            vec![ContentBlock::ToolResult {
                tool_use_id: "call_1".to_string(),
                content: None,
                is_error: true,
            }],
        )];

        let filtered = filter_events(&events, &config);
        // Empty tool result should be fully hidden
        assert!(filtered.is_empty());
    }

    #[test]
    fn test_filter_hides_system_messages_by_default() {
        let config = FilterConfig::default();
        let events = vec![make_event(
            EventType::System,
            vec![ContentBlock::Text {
                text: "System message".to_string(),
            }],
        )];

        let filtered = filter_events(&events, &config);
        assert!(filtered.is_empty());
    }

    #[test]
    fn test_collapse_consecutive_defaults_to_false() {
        let config = FilterConfig::default();
        assert!(!config.collapse_consecutive);
    }

    #[test]
    fn test_collapse_consecutive_can_be_set_true() {
        let config = FilterConfig {
            collapse_consecutive: true,
            ..FilterConfig::default()
        };
        assert!(config.collapse_consecutive);
    }

    #[test]
    fn test_cursor_tool_call_visible_without_tool_results() {
        // Simulates Cursor's pattern: standalone ToolUse in Assistant event
        let config = FilterConfig {
            show_tool_calls: true,
            show_tool_results: false,
            ..FilterConfig::default()
        };
        let events = vec![
            make_event(
                EventType::Assistant,
                vec![ContentBlock::ToolUse {
                    tool_id: "call_1".to_string(),
                    tool_name: "edit_file_v2".to_string(),
                    tool_input: serde_json::json!({"path": "test.html"}),
                }],
            ),
            make_event(
                EventType::User,
                vec![ContentBlock::ToolResult {
                    tool_use_id: "call_1".to_string(),
                    content: Some("file written".to_string()),
                    is_error: false,
                }],
            ),
        ];

        let filtered = filter_events(&events, &config);
        // Tool call event should survive, tool result should be hidden
        assert_eq!(filtered.len(), 1);
        assert!(matches!(filtered[0].event_type, EventType::Assistant));
        assert!(matches!(
            filtered[0].content[0],
            ContentBlock::ToolUse { .. }
        ));
    }

    #[test]
    fn test_cursor_tool_result_visible_without_tool_calls() {
        // Simulates Cursor's standalone ToolResult in User event
        let config = FilterConfig {
            show_tool_calls: false,
            show_tool_results: true,
            ..FilterConfig::default()
        };
        let events = vec![
            make_event(
                EventType::Assistant,
                vec![ContentBlock::ToolUse {
                    tool_id: "call_1".to_string(),
                    tool_name: "edit_file_v2".to_string(),
                    tool_input: serde_json::json!({"path": "test.html"}),
                }],
            ),
            make_event(
                EventType::User,
                vec![ContentBlock::ToolResult {
                    tool_use_id: "call_1".to_string(),
                    content: Some("file written".to_string()),
                    is_error: false,
                }],
            ),
        ];

        let filtered = filter_events(&events, &config);
        // Tool result event should survive, tool call should be hidden
        assert_eq!(filtered.len(), 1);
        assert!(matches!(filtered[0].event_type, EventType::User));
        assert!(matches!(
            filtered[0].content[0],
            ContentBlock::ToolResult { .. }
        ));
    }
}
