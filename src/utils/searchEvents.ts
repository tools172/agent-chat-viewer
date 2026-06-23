import type { ChatEvent, ContentBlock } from '../types';

export interface EventMatch {
  eventIdx: number;
  blockIdx: number;
  /** 该块内第几个匹配（0 起始），用于定位当前激活的高亮 */
  occurrenceIdx: number;
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
 * 构建搜索用正则的标志位。
 * 查询词含非 ASCII 字符时不加 `i`，防止 JS 引擎 Unicode case-folding bug
 *（例如 `/的/i` 错误匹配 ASCII `d`）。
 */
export function regexFlags(query: string): string {
  return /[^\x00-\x7F]/.test(query) ? 'g' : 'gi';
}

/**
 * 在事件列表中搜索匹配项（按关键词出现次数计数）。
 * 纯函数，方便单元测试。
 */
export function searchEvents(
  events: ChatEvent[],
  query: string
): EventMatch[] {
  if (!query.trim()) return [];

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, regexFlags(query));
  const result: EventMatch[] = [];

  for (let ei = 0; ei < events.length; ei++) {
    const event = events[ei];
    for (let bi = 0; bi < event.content.length; bi++) {
      const text = blockToSearchText(event.content[bi]);
      const occurrences = text.match(regex);
      if (occurrences) {
        for (let mi = 0; mi < occurrences.length; mi++) {
          result.push({ eventIdx: ei, blockIdx: bi, occurrenceIdx: mi });
        }
      }
    }
  }

  return result;
}
