import { describe, it, expect } from 'vitest';
import { collapseConsecutiveEvents } from '../../utils/filterEvents';
import type { ChatEvent } from '../../types';

function makeEvent(
  eventType: ChatEvent['eventType'],
  text: string = 'Hello',
  overrides: Partial<ChatEvent> = {},
): ChatEvent {
  return {
    uuid: `uuid-${eventType}-${text}`,
    parentUuid: null,
    eventType,
    timestamp: '2026-06-09T10:00:00Z',
    content: [{ blockType: 'text', text }],
    ...overrides,
  };
}

describe('collapseConsecutiveEvents', () => {
  it('空列表返回空', () => {
    const result = collapseConsecutiveEvents([]);
    expect(result).toHaveLength(0);
  });

  it('单条事件原样返回', () => {
    const events = [makeEvent('user', 'hello')];
    const result = collapseConsecutiveEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(events[0]);
  });

  it('交替角色不折叠', () => {
    const events = [
      makeEvent('user', 'msg1'),
      makeEvent('assistant', 'reply1'),
      makeEvent('user', 'msg2'),
      makeEvent('assistant', 'reply2'),
    ];
    const result = collapseConsecutiveEvents(events);
    expect(result).toHaveLength(4);
    expect(result.map((e) => e.uuid)).toEqual(events.map((e) => e.uuid));
  });

  it('连续用户消息只保留最后一条', () => {
    const events = [
      makeEvent('user', 'first'),
      makeEvent('user', 'second'),
      makeEvent('user', 'third'),
      makeEvent('assistant', 'reply'),
    ];
    const result = collapseConsecutiveEvents(events);
    expect(result).toHaveLength(2);
    expect(result[0].content[0]).toMatchObject({ text: 'third' });
    expect(result[1].content[0]).toMatchObject({ text: 'reply' });
  });

  it('连续助手消息只保留最后一条', () => {
    const events = [
      makeEvent('user', 'question'),
      makeEvent('assistant', 'thinking...'),
      makeEvent('assistant', 'checking...'),
      makeEvent('assistant', 'final answer'),
    ];
    const result = collapseConsecutiveEvents(events);
    expect(result).toHaveLength(2);
    expect(result[0].content[0]).toMatchObject({ text: 'question' });
    expect(result[1].content[0]).toMatchObject({ text: 'final answer' });
  });

  it('多组连续同角色均被折叠', () => {
    const events = [
      makeEvent('user', 'u1'),
      makeEvent('user', 'u2'),
      makeEvent('assistant', 'a1'),
      makeEvent('assistant', 'a2'),
      makeEvent('assistant', 'a3'),
      makeEvent('user', 'u3'),
      makeEvent('user', 'u4'),
      makeEvent('assistant', 'a4'),
    ];
    const result = collapseConsecutiveEvents(events);
    expect(result).toHaveLength(4);
    expect(result[0].content[0]).toMatchObject({ text: 'u2' });
    expect(result[1].content[0]).toMatchObject({ text: 'a3' });
    expect(result[2].content[0]).toMatchObject({ text: 'u4' });
    expect(result[3].content[0]).toMatchObject({ text: 'a4' });
  });

  it('系统消息参与折叠', () => {
    const events = [
      makeEvent('system', 'sys1'),
      makeEvent('system', 'sys2'),
      makeEvent('user', 'hello'),
      makeEvent('user', 'world'),
    ];
    const result = collapseConsecutiveEvents(events);
    expect(result).toHaveLength(2);
    expect(result[0].content[0]).toMatchObject({ text: 'sys2' });
    expect(result[1].content[0]).toMatchObject({ text: 'world' });
  });

  it('系统消息打断折叠链', () => {
    const events = [
      makeEvent('user', 'u1'),
      makeEvent('system', 'sys'),
      makeEvent('user', 'u2'),
    ];
    const result = collapseConsecutiveEvents(events);
    // u1 is alone, sys breaks chain, u2 is alone
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.eventType)).toEqual(['user', 'system', 'user']);
  });

  it('只有一条 user 和一条 assistant 交替穿插, 不折叠', () => {
    const events = [
      makeEvent('user', 'hi'),
      makeEvent('assistant', 'hello'),
      makeEvent('user', 'how are you'),
      makeEvent('assistant', 'fine'),
      makeEvent('user', 'good'),
    ];
    const result = collapseConsecutiveEvents(events);
    expect(result).toHaveLength(5);
  });

  // ======================== 边界测试 ========================

  it('attachment 事件不参与折叠', () => {
    const events = [
      makeEvent('user', 'msg1'),
      makeEvent('attachment', 'file1'),
      makeEvent('attachment', 'file2'),
      makeEvent('assistant', 'reply'),
    ];
    const result = collapseConsecutiveEvents(events);
    // attachment 不折叠，各保留
    expect(result).toHaveLength(4);
    expect(result.map((e) => e.eventType)).toEqual([
      'user',
      'attachment',
      'attachment',
      'assistant',
    ]);
  });

  it('unknown 事件不参与折叠', () => {
    const events = [
      makeEvent('assistant', 'reply1'),
      makeEvent('unknown', 'weird event'),
      makeEvent('unknown', 'another weird'),
      makeEvent('assistant', 'reply2'),
    ];
    const result = collapseConsecutiveEvents(events);
    expect(result).toHaveLength(4);
  });

  it('混合 attachment 和 system 不折叠但 user/assistant 正常折叠', () => {
    const events = [
      makeEvent('system', 'sys'),
      makeEvent('user', 'u1'),
      makeEvent('user', 'u2'),
      makeEvent('attachment', 'file'),
      makeEvent('assistant', 'a1'),
      makeEvent('assistant', 'a2'),
      makeEvent('assistant', 'a3'),
    ];
    const result = collapseConsecutiveEvents(events);
    expect(result).toHaveLength(4);
    expect(result[0].eventType).toBe('system');
    expect(result[1].eventType).toBe('user');
    expect(result[1].content[0]).toMatchObject({ text: 'u2' });
    expect(result[2].eventType).toBe('attachment');
    expect(result[3].eventType).toBe('assistant');
    expect(result[3].content[0]).toMatchObject({ text: 'a3' });
  });

  it('整个列表只有一种角色全部折叠为一条', () => {
    const events = [
      makeEvent('user', 'u1'),
      makeEvent('user', 'u2'),
      makeEvent('user', 'u3'),
      makeEvent('user', 'u4'),
      makeEvent('user', 'u5'),
    ];
    const result = collapseConsecutiveEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0].content[0]).toMatchObject({ text: 'u5' });
  });

  it('原数组不被修改', () => {
    const events = [
      makeEvent('user', 'first'),
      makeEvent('user', 'second'),
      makeEvent('assistant', 'reply'),
    ];
    const original = [...events];
    collapseConsecutiveEvents(events);
    expect(events).toEqual(original);
    expect(events).toHaveLength(3);
  });

  it('保留事件的完整属性（uuid, timestamp, parentUuid 等）', () => {
    const events = [
      makeEvent('user', 'u1', { parentUuid: 'parent1', timestamp: '2026-01-01T00:00:00Z' }),
      makeEvent('user', 'u2', { parentUuid: 'parent2', timestamp: '2026-06-09T10:00:00Z' }),
      makeEvent('assistant', 'reply'),
    ];
    const result = collapseConsecutiveEvents(events);
    expect(result).toHaveLength(2);
    // 保留最后一条 user 的完整属性
    expect(result[0].uuid).toBe('uuid-user-u2');
    expect(result[0].parentUuid).toBe('parent2');
    expect(result[0].timestamp).toBe('2026-06-09T10:00:00Z');
    expect(result[0].content).toHaveLength(1);
    expect(result[0].content[0]).toMatchObject({ blockType: 'text', text: 'u2' });
  });

  it('大序列：100 条连续 user + 1 条 assistant → 折叠为 2 条', () => {
    const events: ChatEvent[] = [];
    for (let i = 0; i < 100; i++) {
      events.push(makeEvent('user', `msg${i}`));
    }
    events.push(makeEvent('assistant', 'reply'));
    const result = collapseConsecutiveEvents(events);
    expect(result).toHaveLength(2);
    expect(result[0].content[0]).toMatchObject({ text: 'msg99' });
    expect(result[1].content[0]).toMatchObject({ text: 'reply' });
  });
});
