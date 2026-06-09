import { describe, it, expect } from 'vitest';
import { filterEvents } from '../../utils/filterEvents';
import type { ChatEvent, FilterConfig } from '../../types';

function makeEvent(
  eventType: ChatEvent['eventType'],
  blocks: ChatEvent['content'],
): ChatEvent {
  return {
    uuid: `uuid-${eventType}`,
    parentUuid: null,
    eventType,
    timestamp: '2026-06-09T10:00:00Z',
    content: blocks,
  };
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

describe('filterEvents (前端)', () => {
  // ======================== 思考 ========================

  it('默认隐藏 thinking', () => {
    const events = [
      makeEvent('assistant', [
        { blockType: 'thinking', thinking: 'Hmm...', signature: 'sig' },
        { blockType: 'text', text: 'Hello' },
      ]),
    ];

    const result = filterEvents(events, defaultFilter);
    expect(result).toHaveLength(1);
    expect(result[0].content).toHaveLength(1);
    expect(result[0].content[0].blockType).toBe('text');
  });

  it('开启思考后显示 thinking', () => {
    const events = [
      makeEvent('assistant', [
        { blockType: 'thinking', thinking: 'Hmm...', signature: 'sig' },
        { blockType: 'text', text: 'Hello' },
      ]),
    ];

    const result = filterEvents(events, {
      ...defaultFilter,
      showThinking: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0].content).toHaveLength(2);
  });

  it('仅含 thinking 的事件在隐藏思考后整个移除', () => {
    const events = [
      makeEvent('assistant', [
        { blockType: 'thinking', thinking: 'Hmm...', signature: 'sig' },
      ]),
    ];

    const result = filterEvents(events, defaultFilter);
    expect(result).toHaveLength(0);
  });

  // ======================== 工具调用 ========================

  it('隐藏 tool_use', () => {
    const events = [
      makeEvent('assistant', [
        { blockType: 'tool_use', toolId: '1', toolName: 'read', toolInput: {} },
        { blockType: 'text', text: 'Done' },
      ]),
    ];

    const result = filterEvents(events, {
      ...defaultFilter,
      showToolCalls: false,
    });
    expect(result[0].content).toHaveLength(1);
    expect(result[0].content[0].blockType).toBe('text');
  });

  // ======================== 工具结果 ========================

  it('隐藏所有 tool_result', () => {
    const events = [
      makeEvent('user', [
        { blockType: 'tool_result', toolUseId: '1', content: 'result', isError: false },
        { blockType: 'text', text: 'Next' },
      ]),
    ];

    const result = filterEvents(events, {
      ...defaultFilter,
      showToolResults: false,
    });
    expect(result[0].content).toHaveLength(1);
    expect(result[0].content[0].blockType).toBe('text');
  });

  // ======================== 隐藏空结果 ========================

  it('隐藏空 tool_result (content=null)', () => {
    const events = [
      makeEvent('user', [
        { blockType: 'tool_result', toolUseId: '1', content: null, isError: false },
      ]),
    ];

    const result = filterEvents(events, defaultFilter);
    expect(result).toHaveLength(0);
  });

  it('隐藏空白字符串 tool_result', () => {
    const events = [
      makeEvent('user', [
        { blockType: 'tool_result', toolUseId: '1', content: '  ', isError: false },
      ]),
    ];

    const result = filterEvents(events, defaultFilter);
    expect(result).toHaveLength(0);
  });

  it('不隐藏空结果开关关闭后显示所有 tool_result', () => {
    const events = [
      makeEvent('user', [
        { blockType: 'tool_result', toolUseId: '1', content: null, isError: false },
        { blockType: 'tool_result', toolUseId: '2', content: 'has content', isError: false },
      ]),
    ];

    const result = filterEvents(events, {
      ...defaultFilter,
      hideEmptyToolResults: false,
    });
    expect(result[0].content).toHaveLength(2);
  });

  // ======================== 组合场景 ========================

  it('四个按钮全灰 — 只显示 text 块', () => {
    const events = [
      makeEvent('assistant', [
        { blockType: 'thinking', thinking: '...', signature: '' },
        { blockType: 'tool_use', toolId: '1', toolName: 'read', toolInput: {} },
        { blockType: 'text', text: 'Hello' },
        { blockType: 'tool_result', toolUseId: '1', content: null, isError: false },
      ]),
    ];

    const result = filterEvents(events, {
      ...defaultFilter,
      showThinking: false,
      showToolCalls: false,
      showToolResults: false,
    });
    expect(result).toHaveLength(1);
    // 只剩 text
    expect(result[0].content).toHaveLength(1);
    expect(result[0].content[0].blockType).toBe('text');
  });

  it('全开 — 所有块都保留', () => {
    const events = [
      makeEvent('assistant', [
        { blockType: 'thinking', thinking: '...', signature: '' },
        { blockType: 'tool_use', toolId: '1', toolName: 'read', toolInput: {} },
        { blockType: 'text', text: 'Hello' },
      ]),
      makeEvent('user', [
        { blockType: 'tool_result', toolUseId: '1', content: 'OK', isError: false },
      ]),
    ];

    const result = filterEvents(events, {
      ...defaultFilter,
      showThinking: true,
      showToolCalls: true,
      showToolResults: true,
      hideEmptyToolResults: false,
    });

    const totalBlocks = result.reduce((s, e) => s + e.content.length, 0);
    expect(totalBlocks).toBe(4);
  });
});
