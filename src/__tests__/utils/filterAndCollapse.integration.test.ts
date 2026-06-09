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

/**
 * 完整流水线：先 content-block 过滤，再合并连发
 */
function filterAndCollapse(events: ChatEvent[], config: FilterConfig): ChatEvent[] {
  const filtered = filterEvents(events, config);
  if (config.collapseConsecutive) {
    return collapseConsecutiveEvents(filtered);
  }
  return filtered;
}

describe('filter + collapse 集成测试', () => {
  // ======================== 基础流水线 ========================

  it('collapseConsecutive=false 时不折叠', () => {
    const events = [
      makeTextEvent('user', 'u1'),
      makeTextEvent('user', 'u2'),
      makeTextEvent('assistant', 'a1'),
    ];
    const result = filterAndCollapse(events, { ...defaultFilter, collapseConsecutive: false });
    expect(result).toHaveLength(3);
  });

  it('collapseConsecutive=true 时折叠连续同角色', () => {
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

  // ======================== filter 移除事件后 collapse ========================

  it('filter 移除思考块后 empty 事件被 drop，collapse 不受影响', () => {
    const events = [
      makeTextEvent('user', 'hello'),
      makeEvent('assistant', [
        { blockType: 'thinking', thinking: 'hmm', signature: '' },
      ]), // 整条移除
      makeTextEvent('user', 'world'),
    ];
    // showThinking=false → assistant 事件被移除，两个 user 相邻
    const result = filterAndCollapse(events, { ...defaultFilter, showThinking: false, collapseConsecutive: true });
    expect(result).toHaveLength(1);
    expect(result[0].content[0]).toMatchObject({ text: 'world' });
  });

  it('filter 保留部分块后，事件仍参与 collapse', () => {
    const events = [
      makeEvent('assistant', [
        { blockType: 'thinking', thinking: 'hmm', signature: '' },
        { blockType: 'text', text: 'answer1' },
      ]),
      makeTextEvent('assistant', 'answer2'),
      makeTextEvent('assistant', 'answer3'),
      makeTextEvent('user', 'thanks'),
    ];
    // showThinking=false → thinking 块移除，text 保留
    const result = filterAndCollapse(events, { ...defaultFilter, showThinking: false, collapseConsecutive: true });
    expect(result).toHaveLength(2);
    // 3 个连续的 assistant → 折叠后只留最后一个
    expect(result[0].content[0]).toMatchObject({ text: 'answer3' });
    expect(result[1].content[0]).toMatchObject({ text: 'thanks' });
  });

  // ======================== 真实场景模拟 ========================

  it('模拟真实对话：多轮 user+assistant 混合 + 连续发送 + filter + collapse', () => {
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

    // 默认: hideThinking, showTools
    const result = filterAndCollapse(events, { ...defaultFilter, collapseConsecutive: true });

    // user: "问题1","补充说明1" → folded to "补充说明1"
    // assistant: [text:"这是回答1"], [tool_use+text:"我查了一下..."], [text:"总结回答1"] → folded to "总结回答1"
    // user: "问题2"
    // assistant: [text:"这是回答2"]
    expect(result).toHaveLength(4);
    expect(result[0].eventType).toBe('user');
    expect(result[0].content[0]).toMatchObject({ text: '补充说明1' });
    expect(result[1].eventType).toBe('assistant');
    expect(result[1].content[0]).toMatchObject({ text: '总结回答1' });
    expect(result[2].eventType).toBe('user');
    expect(result[2].content[0]).toMatchObject({ text: '问题2' });
    expect(result[3].eventType).toBe('assistant');
    expect(result[3].content[0]).toMatchObject({ text: '这是回答2' });
  });

  // ======================== 开思考 + collapse ========================

  it('showThinking=true + collapseConsecutive=true：折叠保留最后一条含思考的事件', () => {
    const events = [
      makeEvent('assistant', [
        { blockType: 'thinking', thinking: '第一步思考', signature: '' },
        { blockType: 'text', text: '第一步' },
      ]),
      makeEvent('assistant', [
        { blockType: 'thinking', thinking: '第二步思考', signature: '' },
        { blockType: 'text', text: '第二步' },
      ]),
      makeEvent('assistant', [
        { blockType: 'thinking', thinking: '最终思考', signature: '' },
        { blockType: 'text', text: '最终答案' },
      ]),
    ];
    const result = filterAndCollapse(events, {
      ...defaultFilter,
      showThinking: true,
      collapseConsecutive: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0].content).toHaveLength(2); // thinking + text
    expect(result[0].content[0]).toMatchObject({ blockType: 'thinking', thinking: '最终思考' });
    expect(result[0].content[1]).toMatchObject({ blockType: 'text', text: '最终答案' });
  });

  // ======================== 隐藏工具调用 + collapse ========================

  it('showToolCalls=false 后 collapse：连续 assistant 仍正确折叠', () => {
    const events = [
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
    // 3 个连续 assistant → 折叠只留 "final"
    expect(result).toHaveLength(2);
    expect(result[0].eventType).toBe('assistant');
    // tool_use 被隐藏，只剩 text:"final"
    expect(result[0].content).toHaveLength(1);
    expect(result[0].content[0]).toMatchObject({ blockType: 'text', text: 'final' });
    expect(result[1].eventType).toBe('user');
  });

  // ======================== 边界场景 ========================

  it('所有事件都被 filter 移除后，collapse 返回空', () => {
    const events = [
      makeEvent('assistant', [
        { blockType: 'thinking', thinking: 'hmm', signature: '' },
      ]),
      makeEvent('assistant', [
        { blockType: 'thinking', thinking: 'hmm2', signature: '' },
      ]),
    ];
    const result = filterAndCollapse(events, {
      ...defaultFilter,
      showThinking: false,
      collapseConsecutive: true,
    });
    expect(result).toHaveLength(0);
  });

  it('单条事件不崩溃', () => {
    const events = [makeTextEvent('user', 'hello')];
    const result = filterAndCollapse(events, { ...defaultFilter, collapseConsecutive: true });
    expect(result).toHaveLength(1);
    expect(result[0].content[0]).toMatchObject({ text: 'hello' });
  });

  it('collapse 不影响过滤后的 system 事件（system 已被 filter 移除或保留）', () => {
    const events = [
      makeTextEvent('system', 'sys1'),
      makeTextEvent('user', 'hello'),
      makeTextEvent('system', 'sys2'),
      makeTextEvent('user', 'world'),
    ];
    // showSystemMessages=true → system 保留
    const result = filterAndCollapse(events, {
      ...defaultFilter,
      showSystemMessages: true,
      collapseConsecutive: true,
    });
    // system 不被折叠，各 system 独立保留
    expect(result).toHaveLength(4);
    expect(result.map((e) => e.eventType)).toEqual(['system', 'user', 'system', 'user']);
  });
});
