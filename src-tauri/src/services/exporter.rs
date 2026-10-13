use crate::models::{ChatEvent, ContentBlock, EventType};

/// Export a session's events to Markdown format
pub fn export_to_markdown(events: &[ChatEvent], title: &str, project: &str) -> String {
    let mut md = String::new();

    // Header
    md.push_str(&format!("# {}\n\n", title));
    md.push_str(&format!("**项目:** {}\n\n", project));

    // Find timestamp from first event
    if let Some(first) = events.first() {
        md.push_str(&format!("**日期:** {}\n\n", first.timestamp));
    }

    md.push_str("---\n\n");

    // Render events
    for event in events {
        match event.event_type {
            EventType::User => {
                // Check if this is a user message or tool result
                let has_tool_results = event
                    .content
                    .iter()
                    .any(|b| matches!(b, ContentBlock::ToolResult { .. }));
                let has_text = event
                    .content
                    .iter()
                    .any(|b| matches!(b, ContentBlock::Text { .. }));

                if has_text {
                    md.push_str("## 👤 User\n\n");
                    for block in &event.content {
                        render_block_to_markdown(block, &mut md);
                    }
                }

                if has_tool_results {
                    for block in &event.content {
                        if matches!(block, ContentBlock::ToolResult { .. }) {
                            render_block_to_markdown(block, &mut md);
                        }
                    }
                }
            }
            EventType::Assistant => {
                md.push_str("## 🤖 Assistant\n\n");
                for block in &event.content {
                    render_block_to_markdown(block, &mut md);
                }
            }
            EventType::Developer => {
                md.push_str("## 💻 Developer\n\n");
                for block in &event.content {
                    render_block_to_markdown(block, &mut md);
                }
            }
            _ => {
                // Skip system/metadata events
            }
        }
    }

    md
}

/// Render a single content block as markdown
fn render_block_to_markdown(block: &ContentBlock, md: &mut String) {
    match block {
        ContentBlock::Text { text } => {
            md.push_str(text);
            md.push_str("\n\n");
        }
        ContentBlock::Thinking { thinking, .. } => {
            md.push_str("<details>\n<summary>💭 Thinking</summary>\n\n");
            md.push_str("> ");
            md.push_str(&thinking.replace('\n', "\n> "));
            md.push_str("\n\n</details>\n\n");
        }
        ContentBlock::ToolUse {
            tool_name,
            tool_input,
            ..
        } => {
            md.push_str(&format!(
                "<details>\n<summary>🔧 Tool Call: **{}**</summary>\n\n",
                tool_name
            ));
            md.push_str("```json\n");
            md.push_str(&serde_json::to_string_pretty(tool_input).unwrap_or_default());
            md.push_str("\n```\n\n</details>\n\n");
        }
        ContentBlock::ToolResult {
            content, is_error, ..
        } => {
            let label = if *is_error {
                "❌ Error"
            } else {
                "📋 Result"
            };
            md.push_str(&format!(
                "<details>\n<summary>{} Tool Result</summary>\n\n",
                label
            ));
            if let Some(c) = content {
                md.push_str("```\n");
                md.push_str(c);
                md.push_str("\n```\n");
            } else {
                md.push_str("*(empty)*\n");
            }
            md.push_str("\n</details>\n\n");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_export_basic_conversation() {
        let events = vec![
            ChatEvent {
                uuid: "u1".to_string(),
                parent_uuid: None,
                event_type: EventType::User,
                timestamp: "2026-06-09T10:00:00Z".to_string(),
                content: vec![ContentBlock::Text {
                    text: "Hello".to_string(),
                }],
                session_id: None,
            },
            ChatEvent {
                uuid: "u2".to_string(),
                parent_uuid: Some("u1".to_string()),
                event_type: EventType::Assistant,
                timestamp: "2026-06-09T10:00:01Z".to_string(),
                content: vec![ContentBlock::Text {
                    text: "Hi there!".to_string(),
                }],
                session_id: None,
            },
        ];

        let md = export_to_markdown(&events, "Test Session", "test-project");
        assert!(md.contains("# Test Session"));
        assert!(md.contains("**项目:** test-project"));
        assert!(md.contains("## 👤 User"));
        assert!(md.contains("Hello"));
        assert!(md.contains("## 🤖 Assistant"));
        assert!(md.contains("Hi there!"));
    }

    #[test]
    fn test_export_includes_thinking_in_details() {
        let events = vec![ChatEvent {
            uuid: "u1".to_string(),
            parent_uuid: None,
            event_type: EventType::Assistant,
            timestamp: "2026-06-09T10:00:00Z".to_string(),
            content: vec![ContentBlock::Thinking {
                thinking: "Let me think...".to_string(),
                signature: "sig".to_string(),
            }],
            session_id: None,
        }];

        let md = export_to_markdown(&events, "Test", "test");
        assert!(md.contains("💭 Thinking"));
        assert!(md.contains("Let me think..."));
        assert!(md.contains("<details>"));
    }

    #[test]
    fn test_export_tool_use_as_details() {
        let input = serde_json::json!({"filePath": "/test/file.txt"});
        let events = vec![ChatEvent {
            uuid: "u1".to_string(),
            parent_uuid: None,
            event_type: EventType::Assistant,
            timestamp: "2026-06-09T10:00:00Z".to_string(),
            content: vec![ContentBlock::ToolUse {
                tool_id: "call_1".to_string(),
                tool_name: "Read".to_string(),
                tool_input: input,
            }],
            session_id: None,
        }];

        let md = export_to_markdown(&events, "Test", "test");
        assert!(md.contains("🔧 Tool Call"));
        assert!(md.contains("Read"));
        assert!(md.contains("```json"));
    }
}
