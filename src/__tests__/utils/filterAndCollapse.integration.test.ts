import { describe, it, expect } from 'vitest';
import { filterEvents, collapseConsecutiveEvents } from '../../utils/filterEvents';
import type { ChatEvent, FilterConfig } from '../../types';

function makeEvent(
  eventType: ChatEvent['eventType'],
  blocks: ChatEvent['content'],
  overrides: Partial<ChatEvent> = {},
): ChatEvent {
  return {
    uuid: `uuid-${eventType}-${Math.random().toString(36).slice(2, 8)}`,
    parentUuid: null,
    eventType,
    timestamp: '2026-06-09T10:00:00Z',
    content: blocks,
    ...overrides,
  };
}

function makeTextEvent(eventType: ChatEvent['eventType'], text: string): ChatEvent {
  return makeEvent(eventType, [{ blockType: 'text', text }]);
}

const defaultFilter: FilterConfig = {
  showThinking: false,
  showToolCalls: true,
  showToolResults: true,
  hideEmptyToolResults: true,
  showSystemMessages: false,
  showFileSnapshots: false,
  collapseConsecutive: false,
};

function filterAndCollapse(events: ChatEvent[], config: FilterConfig): ChatEvent[] {
  const filtered = filterEvents(events, config);
  if (config.collapseConsecutive) {
    return collapseConsecutiveEvents(filtered, events);
  }
  return filtered;
}

describe('filter + collapse 集成测试', () => {
  it('collapseConsecutive=false 时不折叠', () => {
    const events = [
      makeTextEvent('user', 'u1'),
      makeTextEvent('user', 'u2'),
      makeTextEvent('assistant', 'a1'),
    ];
    const result = filterAndCollapse(events, { ...defaultFilter, collapseConsecutive: false });
    expect(result).toHaveLength(3);
  });

  it('纯文本组折叠只留最后一条', () => {
    const events = [
      makeTextEvent('user', 'u1'),
      makeTextEvent('user', 'u2'),
      makeTextEvent('assistant', 'a1'),
    ];
    const result = filterAndCollapse(events, { ...defaultFilter, collapseConsecutive: true });
    expect(result).toHaveLength(2);
    expect(result[0].content[0]).toMatchObject({ text: 'u2' });
    expect(result[1].content[0]).toMatchObject({ text: 'a1' });
  });

  it('含 tool_use 的连续 assistant 不折叠：filter + collapse 保护工具调用', () => {
    const events = [
      makeTextEvent('user', 'fix this'),
      makeEvent('assistant', [
        { blockType: 'tool_use', toolId: 't1', toolName: 'edit', toolInput: {} },
      ]),
      makeEvent('assistant', [
        { blockType: 'tool_use', toolId: 't2', toolName: 'read', toolInput: {} },
      ]),
      makeTextEvent('assistant', 'Done!'),
    ];
    const result = filterAndCollapse(events, {
      ...defaultFilter,
      showToolCalls: true,
      showToolResults: false,
      collapseConsecutive: true,
    });
    // 3 consecutive assistants with tool_use → NOT collapsed
    expect(result).toHaveLength(4); // user + 3 assistants
    expect(result[1].content[0]).toMatchObject({ blockType: 'tool_use', toolName: 'edit' });
    expect(result[2].content[0]).toMatchObject({ blockType: 'tool_use', toolName: 'read' });
    expect(result[3].content[0]).toMatchObject({ blockType: 'text', text: 'Done!' });
  });

  it('filter 移除 tool_use 后变纯文本 → 正常折叠', () => {
    // When showToolCalls=false, tool_use blocks are removed.
    // After filter: events become pure text → they ARE collapsed.
    const events = [
      makeTextEvent('user', 'hello'),
      makeEvent('assistant', [
        { blockType: 'tool_use', toolId: 't1', toolName: 'read', toolInput: {} },
        { blockType: 'text', text: 'part1' },
      ]),
      makeEvent('assistant', [
        { blockType: 'tool_use', toolId: 't2', toolName: 'grep', toolInput: {} },
        { blockType: 'text', text: 'part2' },
      ]),
      makeTextEvent('assistant', 'final'),
      makeTextEvent('user', 'done'),
    ];
    const result = filterAndCollapse(events, {
      ...defaultFilter,
      showToolCalls: false,
      collapseConsecutive: true,
    });
    // After filter: tool_use removed, [text:part1], [text:part2], [text:final]
    // → pure text group → collapsed to last
    // Result: user:hello, assistant:final, user:done = 3
    expect(result).toHaveLength(3);
    expect(result[0].eventType).toBe('user');
    expect(result[0].content[0]).toMatchObject({ text: 'hello' });
    expect(result[1].eventType).toBe('assistant');
    expect(result[1].content).toHaveLength(1);
    expect(result[1].content[0]).toMatchObject({ text: 'final' });
    expect(result[2].eventType).toBe('user');
    expect(result[2].content[0]).toMatchObject({ text: 'done' });
  });

  it('filter 移除空事件后相邻纯文本正确折叠', () => {
    const events = [
      makeTextEvent('user', 'hello'),
      makeEvent('assistant', [
        { blockType: 'thinking', thinking: 'hmm', signature: '' },
      ]), // thinking hidden → empty → removed（但在原始时间线上仍是边界）
      makeTextEvent('user', 'world'),
    ];
    const result = filterAndCollapse(events, { ...defaultFilter, showThinking: false, collapseConsecutive: true });
    // 被隐藏的 thinking 事件应作为边界，user "hello" 与 "world" 不应合并
    expect(result).toHaveLength(2);
    expect(result[0].content[0]).toMatchObject({ text: 'hello' });
    expect(result[1].content[0]).toMatchObject({ text: 'world' });
  });

  it('真实混合场景：纯文本折叠，含工具不折叠', () => {
    const events = [
      makeTextEvent('user', '问题1'),
      makeTextEvent('user', '补充说明1'),
      makeEvent('assistant', [
        { blockType: 'thinking', thinking: '让我想想...', signature: '' },
        { blockType: 'text', text: '这是回答1' },
      ]),
      makeEvent('assistant', [
        { blockType: 'tool_use', toolId: 't1', toolName: 'read', toolInput: {} },
        { blockType: 'text', text: '我查了一下...' },
      ]),
      makeTextEvent('assistant', '总结回答1'),
      makeTextEvent('user', '问题2'),
      makeEvent('assistant', [
        { blockType: 'thinking', thinking: '再想想...', signature: '' },
        { blockType: 'text', text: '这是回答2' },
      ]),
    ];
    const result = filterAndCollapse(events, { ...defaultFilter, collapseConsecutive: true });

    // filter: thinking hidden, tool_use kept
    // user "问题1","补充说明1" → pure text → collapse to "补充说明1"
    // assistant [text], [tool_use+text], [text] → contains tool_use → ALL 3 KEPT
    // user "问题2" → single, kept
    // assistant [text] → single, kept
    expect(result).toHaveLength(6);
    expect(result[0].eventType).toBe('user');
    expect(result[0].content[0]).toMatchObject({ text: '补充说明1' });
    expect(result[1].eventType).toBe('assistant');
    expect(result[1].content[0]).toMatchObject({ text: '这是回答1' });
    expect(result[2].eventType).toBe('assistant');
    expect(result[2].content[0]).toMatchObject({ blockType: 'tool_use' });
    expect(result[2].content[1]).toMatchObject({ text: '我查了一下...' });
    expect(result[3].eventType).toBe('assistant');
    expect(result[3].content[0]).toMatchObject({ text: '总结回答1' });
  });

  it('全部移除后返回空', () => {
    const events = [
      makeEvent('assistant', [
        { blockType: 'thinking', thinking: 'hmm', signature: '' },
      ]),
      makeEvent('assistant', [
        { blockType: 'thinking', thinking: 'hmm2', signature: '' },
      ]),
    ];
    const result = filterAndCollapse(events, {
      ...defaultFilter, showThinking: false, collapseConsecutive: true,
    });
    expect(result).toHaveLength(0);
  });

  it('单条不崩溃', () => {
    const events = [makeTextEvent('user', 'hello')];
    const result = filterAndCollapse(events, { ...defaultFilter, collapseConsecutive: true });
    expect(result).toHaveLength(1);
  });

  it('system 事件正常折叠', () => {
    const events = [
      makeTextEvent('system', 'sys1'),
      makeTextEvent('user', 'hello'),
      makeTextEvent('system', 'sys2'),
      makeTextEvent('user', 'world'),
    ];
    const result = filterAndCollapse(events, {
      ...defaultFilter, showSystemMessages: true, collapseConsecutive: true,
    });
    expect(result).toHaveLength(4);
    expect(result.map((e) => e.eventType)).toEqual(['system', 'user', 'system', 'user']);
  });
});
