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

/**
 * 合并连发：折叠同一角色（user / assistant）的连续事件，每组只保留最后一条。
 * 系统消息等其他事件类型不会被折叠，只透传。
 *
 * 应在 content-block 过滤之后调用，此时已移除空事件。
 */
export function collapseConsecutiveEvents(events: ChatEvent[]): ChatEvent[] {
  if (events.length === 0) return [];

  const result: ChatEvent[] = [];
  let i = 0;

  while (i < events.length) {
    const current = events[i];
    const role = current.eventType;

    // 只折叠 user 和 assistant 的连续消息
    if (role !== 'user' && role !== 'assistant') {
      result.push(current);
      i++;
      continue;
    }

    // 找到该角色连续分组的末尾
    let j = i;
    while (j + 1 < events.length && events[j + 1].eventType === role) {
      j++;
    }

    // 只保留该组的最后一条
    result.push(events[j]);
    i = j + 1;
  }

  return result;
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
