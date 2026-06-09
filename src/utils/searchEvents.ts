import type { ChatEvent, ContentBlock } from '../types';

export interface EventMatch {
  eventIdx: number;
}

/**
 * 将内容块转换为其在 UI 中显示的中文文本表示。
 * 必须与 React 组件渲染的标签保持一致，否则搜索不到。
 */
export function blockToSearchText(block: ContentBlock): string {
  switch (block.blockType) {
    case 'text':
      return block.text;

    case 'thinking':
      return `思考过程 ${block.thinking}`;

    case 'tool_use':
      return `工具调用 ${block.toolName} ${JSON.stringify(block.toolInput)}`;

    case 'tool_result':
      return `工具结果 ${block.content ?? ''} ${block.isError ? '错误' : ''}`;

    default:
      return '';
  }
}

/**
 * 在事件列表中搜索匹配项（按事件粒度，每个事件最多匹配一次）。
 * 纯函数，方便单元测试。
 */
export function searchEvents(
  events: ChatEvent[],
  query: string
): EventMatch[] {
  if (!query.trim()) return [];

  const lower = query.toLowerCase();
  const result: EventMatch[] = [];
  const seen = new Set<number>();

  for (let ei = 0; ei < events.length; ei++) {
    const event = events[ei];
    for (const block of event.content) {
      const text = blockToSearchText(block);
      if (text.toLowerCase().includes(lower) && !seen.has(ei)) {
        result.push({ eventIdx: ei });
        seen.add(ei);
        break;
      }
    }
  }

  return result;
}
