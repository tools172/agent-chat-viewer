import type { ChatEvent, ContentBlock, FilterConfig } from '../types';

/**
 * 前端侧过滤：对已加载的事件应用内容块级别的过滤。
 * 元数据事件（mode/ai_title/queue_operation 等）已由后端过滤，此处只处理
 * thinking / tool_use / tool_result 的显示/隐藏。
 *
 * 与 Rust services::filter::filter_events 逻辑一致。
 */
export function filterEvents(
  events: ChatEvent[],
  config: FilterConfig,
): ChatEvent[] {
  return events
    .map((event) => filterEventContent(event, config))
    .filter((event) => event.content.length > 0);
}

function filterEventContent(
  event: ChatEvent,
  config: FilterConfig,
): ChatEvent {
  const filteredContent = event.content.filter((block) =>
    shouldShowBlock(block, config),
  );
  return { ...event, content: filteredContent };
}

function shouldShowBlock(block: ContentBlock, config: FilterConfig): boolean {
  switch (block.blockType) {
    case 'text':
      return true; // 文本始终显示
    case 'thinking':
      return config.showThinking;
    case 'tool_use':
      return config.showToolCalls;
    case 'tool_result':
      if (!config.showToolResults) return false;
      if (
        config.hideEmptyToolResults &&
        (!block.content || block.content.trim() === '')
      ) {
        return false;
      }
      return true;
    default:
      return true;
  }
}
