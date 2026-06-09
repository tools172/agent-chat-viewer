import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { EventCard } from '../../components/conversation/EventCard';
import type { ChatEvent } from '../../types';

/**
 * 验证 EventCard 在接收 searchHighlight 和 findHighlight 时
 * 能正确将高亮词传递给 MarkdownRenderer 生成 <mark> 标签。
 */
function makeEvent(
  uuid: string,
  eventType: 'user' | 'assistant',
  blocks: ChatEvent['content']
): ChatEvent {
  return {
    uuid,
    parentUuid: null,
    eventType,
    timestamp: '2026-06-09T10:00:00Z',
    content: blocks,
  };
}

const emptySet = new Set<string>();
const blockKey = (uuid: string, i: number) => `${uuid}-${i}`;

describe('EventCard 高亮渲染', () => {
  it('findHighlight 触发橙色高亮', () => {
    const event = makeEvent('e1', 'user', [
      { blockType: 'text', text: '请帮我写一个登录工具' },
    ]);

    const { container } = render(
      <EventCard
        event={event}
        expandedThinking={emptySet}
        expandedToolCalls={emptySet}
        expandedToolResults={emptySet}
        onToggleThinking={vi.fn()}
        onToggleToolCall={vi.fn()}
        onToggleToolResult={vi.fn()}
        blockKey={blockKey}
        findHighlight="工具"
        searchColors={{ search: '#fef08a', find: '#fed7aa' }}
      />
    );

    const mark = container.querySelector('mark[style]');
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe('工具');
  });

  it('searchHighlight 触发黄色高亮', () => {
    const event = makeEvent('e1', 'user', [
      { blockType: 'text', text: '请帮我写一个登录工具' },
    ]);

    const { container } = render(
      <EventCard
        event={event}
        expandedThinking={emptySet}
        expandedToolCalls={emptySet}
        expandedToolResults={emptySet}
        onToggleThinking={vi.fn()}
        onToggleToolCall={vi.fn()}
        onToggleToolResult={vi.fn()}
        blockKey={blockKey}
        searchHighlight="登录"
        searchColors={{ search: '#fef08a', find: '#fed7aa' }}
      />
    );

    const mark = container.querySelector('mark[style]');
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe('登录');
  });

  it('同时传入 searchHighlight 和 findHighlight，两者都渲染', () => {
    const event = makeEvent('e1', 'user', [
      { blockType: 'text', text: '请帮我写一个登录工具' },
    ]);

    const { container } = render(
      <EventCard
        event={event}
        expandedThinking={emptySet}
        expandedToolCalls={emptySet}
        expandedToolResults={emptySet}
        onToggleThinking={vi.fn()}
        onToggleToolCall={vi.fn()}
        onToggleToolResult={vi.fn()}
        blockKey={blockKey}
        searchHighlight="登录"
        findHighlight="工具"
        searchColors={{ search: '#fef08a', find: '#fed7aa' }}
      />
    );

    const marks = container.querySelectorAll('mark[style]');
    expect(marks.length).toBe(2);
    // 第一个 mark 包装了 "登录"（黄色），第二个包装了 "工具"（橙色）
    expect(marks[0]?.textContent).toBe('登录');
    expect(marks[1]?.textContent).toBe('工具');
  });

  it('无高亮词时不生成 mark 标签', () => {
    const event = makeEvent('e1', 'user', [
      { blockType: 'text', text: '普通文本' },
    ]);

    const { container } = render(
      <EventCard
        event={event}
        expandedThinking={emptySet}
        expandedToolCalls={emptySet}
        expandedToolResults={emptySet}
        onToggleThinking={vi.fn()}
        onToggleToolCall={vi.fn()}
        onToggleToolResult={vi.fn()}
        blockKey={blockKey}
        searchColors={{ search: '#fef08a', find: '#fed7aa' }}
      />
    );

    const marks = container.querySelectorAll('mark');
    expect(marks.length).toBe(0);
  });
});
