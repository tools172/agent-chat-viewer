import { describe, it, expect } from 'vitest';
import {
  searchEvents,
  blockToSearchText,
} from '../../utils/searchEvents';
import type { ChatEvent, ContentBlock } from '../../types';

function makeEvent(
  uuid: string,
  eventType: 'user' | 'assistant',
  blocks: ContentBlock[]
): ChatEvent {
  return {
    uuid,
    parentUuid: null,
    eventType,
    timestamp: '2026-06-09T10:00:00Z',
    content: blocks,
  };
}

describe('blockToSearchText', () => {
  it('text 块直接返回文本', () => {
    const block: ContentBlock = {
      blockType: 'text',
      text: '请帮我写一个登录工具',
    };
    expect(blockToSearchText(block)).toBe('请帮我写一个登录工具');
  });

  it('thinking 块包含"思考过程"前缀', () => {
    const block: ContentBlock = {
      blockType: 'thinking',
      thinking: '用户需要帮助',
      signature: 'sig',
    };
    expect(blockToSearchText(block)).toContain('思考过程');
    expect(blockToSearchText(block)).toContain('用户需要帮助');
  });

  it('tool_use 块包含"工具调用"中文标签', () => {
    const block: ContentBlock = {
      blockType: 'tool_use',
      toolId: 'call_1',
      toolName: 'Read',
      toolInput: { file_path: '/test.txt' },
    };
    const text = blockToSearchText(block);
    expect(text).toContain('工具调用');
    expect(text).toContain('Read');
    expect(text).toContain('file_path');
  });

  it('tool_result 块包含"工具结果"中文标签', () => {
    const block: ContentBlock = {
      blockType: 'tool_result',
      toolUseId: 'call_1',
      content: '文件内容',
      isError: false,
    };
    const text = blockToSearchText(block);
    expect(text).toContain('工具结果');
    expect(text).toContain('文件内容');
  });

  it('tool_result isError 包含"错误"', () => {
    const block: ContentBlock = {
      blockType: 'tool_result',
      toolUseId: 'call_1',
      content: null,
      isError: true,
    };
    expect(blockToSearchText(block)).toContain('错误');
  });
});

describe('searchEvents', () => {
  const events: ChatEvent[] = [
    makeEvent('u1', 'user', [
      { blockType: 'text', text: '请帮我写一个登录工具' },
    ]),
    makeEvent('u2', 'assistant', [
      { blockType: 'thinking', thinking: '用户需要登录功能', signature: 'sig' },
      { blockType: 'tool_use', toolId: 'c1', toolName: 'Read', toolInput: { file_path: '/test.ts' } },
    ]),
    makeEvent('u3', 'user', [
      {
        blockType: 'tool_result',
        toolUseId: 'c1',
        content: 'export function login() {}',
        isError: false,
      },
    ]),
    makeEvent('u4', 'assistant', [
      { blockType: 'text', text: '我已经创建了登录函数，还有什么需要帮助的吗？' },
    ]),
  ];

  it('搜索"登录"应匹配多个事件', () => {
    const matches = searchEvents(events, '登录');
    expect(matches.length).toBe(3); // u1(text), u2(thinking), u4(text)
  });

  it('搜索"工具"应匹配 text + tool_use + tool_result', () => {
    const matches = searchEvents(events, '工具');
    // "工具"出现在: u1(text: "登录工具"), u2(tool_use中文标签), u3(tool_result中文标签)
    expect(matches.length).toBe(3);
    expect(matches.some((m) => m.eventIdx === 0)).toBe(true); // u1 text
    expect(matches.some((m) => m.eventIdx === 1)).toBe(true); // u2 tool_use
    expect(matches.some((m) => m.eventIdx === 2)).toBe(true); // u3 tool_result
  });

  it('搜索"工具调用"应匹配 tool_use', () => {
    const matches = searchEvents(events, '工具调用');
    expect(matches.length).toBe(1);
    expect(matches[0].eventIdx).toBe(1);
  });

  it('搜索"工具结果"应匹配 tool_result', () => {
    const matches = searchEvents(events, '工具结果');
    expect(matches.length).toBe(1);
    expect(matches[0].eventIdx).toBe(2);
  });

  it('搜索"思考"应匹配 thinking 块', () => {
    const matches = searchEvents(events, '思考');
    expect(matches.length).toBe(1);
    expect(matches[0].eventIdx).toBe(1);
  });

  it('搜索"Read"应匹配 tool_use 的工具名', () => {
    const matches = searchEvents(events, 'Read');
    expect(matches.length).toBe(1);
  });

  it('搜索"帮助"应匹配文本中的词', () => {
    const matches = searchEvents(events, '帮助');
    expect(matches.length).toBe(1);
    expect(matches[0].eventIdx).toBe(3);
  });

  it('搜索不存在的词返回空数组', () => {
    const matches = searchEvents(events, '不存在的词xyz');
    expect(matches.length).toBe(0);
  });

  it('空查询返回空数组', () => {
    expect(searchEvents(events, '').length).toBe(0);
    expect(searchEvents(events, '  ').length).toBe(0);
  });

  it('大小写不敏感', () => {
    const matchesUpper = searchEvents(events, 'READ');
    const matchesLower = searchEvents(events, 'read');
    expect(matchesUpper.length).toBeGreaterThan(0);
    expect(matchesUpper.length).toBe(matchesLower.length);
  });

  it('同一事件中多次出现应分别计数', () => {
    // u1 text: "登录请帮我写一个登录 登录工具" — "登录" 出现 3 次
    const evts: ChatEvent[] = [
      makeEvent('u1', 'user', [
        { blockType: 'text', text: '登录请帮我写一个登录 登录工具' },
      ]),
    ];
    const matches = searchEvents(evts, '登录');
    expect(matches.length).toBe(3);
    expect(matches.every((m) => m.eventIdx === 0)).toBe(true);
    expect(matches[0].occurrenceIdx).toBe(0);
    expect(matches[1].occurrenceIdx).toBe(1);
    expect(matches[2].occurrenceIdx).toBe(2);
  });

  it('同一事件多个块中分别出现应分别计数', () => {
    // assistant 中有两个 text 块，各自包含 "函数"
    const evts: ChatEvent[] = [
      makeEvent('u1', 'assistant', [
        { blockType: 'text', text: '创建了登录函数' },
        { blockType: 'text', text: '还有函数需要帮助吗？' },
      ]),
    ];
    const matches = searchEvents(evts, '函数');
    expect(matches.length).toBe(2);
    expect(matches[0].blockIdx).toBe(0);
    expect(matches[0].occurrenceIdx).toBe(0);
    expect(matches[1].blockIdx).toBe(1);
    expect(matches[1].occurrenceIdx).toBe(0);
  });
});
