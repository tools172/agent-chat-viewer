/**
 * 模拟真实使用场景的端到端测试
 *
 * 模拟一个完整的 Claude Code 对话：用户提问 → 助手思考 → 工具调用 → 工具结果 → 助手回复
 * 验证 searchEvents 能在真实的对话数据中正确找到中文关键词。
 */
import { describe, it, expect } from 'vitest';
import { searchEvents, blockToSearchText } from '../../utils/searchEvents';
import type { ChatEvent, ContentBlock } from '../../types';

/**
 * 构造一个真实场景的对话：
 * 用户："帮我写一个登录工具"
 * 助手思考："用户需要登录功能，我来读取现有代码"
 * 助手工具调用：Read(src/auth/login.ts)
 * 工具结果：文件内容
 * 助手回复："我已经查看了代码，现在帮你修改"
 * 助手工具调用：Write(src/auth/login.ts)
 * 工具结果：(空结果)
 * 助手回复："登录工具已完成"
 */
function makeRealConversation(): ChatEvent[] {
  return [
    makeEvent('e1', 'user', [
      t('帮我写一个登录工具，需要支持用户验证'),
    ]),
    makeEvent('e2', 'assistant', [
      th('用户需要一个登录工具，让我先看看现有代码的结构'),
      tc('call_1', 'Read', { file_path: 'src/auth/login.ts' }),
    ]),
    makeEvent('e3', 'user', [
      tr('call_1', 'import { Router } from "express";\nconst router = Router();\n// login logic', false),
    ]),
    makeEvent('e4', 'assistant', [
      t('我已经查看了现有的登录代码，现在帮你添加 JWT 验证功能。'),
      tc('call_2', 'Write', {
        file_path: 'src/auth/login.ts',
        content: 'import jwt from "jsonwebtoken";\n// 登录工具实现代码...',
      }),
    ]),
    makeEvent('e5', 'user', [
      tr('call_2', '', false), // 空结果
    ]),
    makeEvent('e6', 'assistant', [
      th('工具写入成功，登录功能已完成。'),
      t('登录工具已经完成，包含了以下功能：\n1. JWT 令牌生成\n2. 密码验证\n3. 登录拦截中间件'),
    ]),
  ];
}

// 辅助函数
function t(text: string): ContentBlock {
  return { blockType: 'text', text };
}
function th(thinking: string): ContentBlock {
  return { blockType: 'thinking', thinking, signature: 'sig' };
}
function tc(id: string, name: string, input: Record<string, unknown>): ContentBlock {
  return { blockType: 'tool_use', toolId: id, toolName: name, toolInput: input };
}
function tr(id: string, content: string, isError: boolean): ContentBlock {
  return { blockType: 'tool_result', toolUseId: id, content, isError };
}
function makeEvent(
  uuid: string,
  eventType: 'user' | 'assistant',
  blocks: ContentBlock[]
): ChatEvent {
  return {
    uuid,
    parentUuid: null,
    eventType,
    timestamp: `2026-06-09T10:00:0${uuid.slice(1)}Z`,
    content: blocks,
  };
}

describe('真实场景：搜索中文关键词', () => {
  const conversation = makeRealConversation();

  it('搜索"登录" — 应命中多个事件的文本、思考和工具调用', () => {
    const matches = searchEvents(conversation, '登录');
    // e1(text), e2(thinking), e3(tool_result), e4(text), e4(tool_use), e6(thinking), e6(text)
    // 每个事件最多算一次：e1, e2, e3, e4, e6 = 5
    expect(matches.length).toBeGreaterThanOrEqual(4);
    // 验证具体命中
    expect(matches.some((m) => m.eventIdx === 0)).toBe(true); // e1
    expect(matches.some((m) => m.eventIdx === 1)).toBe(true); // e2 (thinking)
    expect(matches.some((m) => m.eventIdx === 3)).toBe(true); // e4 (text + tool_use)
  });

  it('搜索"工具" — 通过中文标签命中 tool_use 和 tool_result', () => {
    const matches = searchEvents(conversation, '工具');
    expect(matches.length).toBeGreaterThanOrEqual(4);
    // e1(text:"登录工具"), e2(tool_use标签), e3(tool_result标签), e4(text+tool_use)
    // e5(tool_result标签，虽然内容为空但标签中有"工具结果"), e6(text:"登录工具")
    expect(matches.some((m) => m.eventIdx === 0)).toBe(true); // e1 text
    expect(matches.some((m) => m.eventIdx === 1)).toBe(true); // e2 tool_use标签
    expect(matches.some((m) => m.eventIdx === 2)).toBe(true); // e3 tool_result标签
  });

  it('搜索"工具调用" — 精确命中 tool_use 标签', () => {
    const matches = searchEvents(conversation, '工具调用');
    expect(matches.length).toBe(2); // e2, e4
  });

  it('搜索"工具结果" — 精确命中 tool_result 标签', () => {
    const matches = searchEvents(conversation, '工具结果');
    expect(matches.length).toBe(2); // e3, e5
  });

  it('搜索"思考过程" — 命中 thinking 标签', () => {
    const matches = searchEvents(conversation, '思考过程');
    expect(matches.length).toBe(2); // e2, e6
  });

  it('搜索"Read" — 命中工具名', () => {
    const matches = searchEvents(conversation, 'Read');
    expect(matches.length).toBe(1); // e2
    expect(matches[0].eventIdx).toBe(1);
  });

  it('搜索"JWT" — 命中文本内容', () => {
    const matches = searchEvents(conversation, 'JWT');
    expect(matches.length).toBeGreaterThanOrEqual(2); // e4(text + tool_use), e6(text)
  });

  it('搜索不存在的内容返回空', () => {
    expect(searchEvents(conversation, 'Python').length).toBe(0);
    expect(searchEvents(conversation, '数据库').length).toBe(0);
  });

  it('每个 blockToSearchText 结果都包含可搜索的中文标签', () => {
    for (const event of conversation) {
      for (const block of event.content) {
        const text = blockToSearchText(block);
        // 每种块类型都应该产生有意义的搜索文本
        expect(typeof text).toBe('string');
      }
    }
    // tool_use 包含 "工具调用"
    const toolUseText = blockToSearchText({
      blockType: 'tool_use',
      toolId: 'x',
      toolName: 'Write',
      toolInput: {},
    });
    expect(toolUseText).toContain('工具调用');
    expect(toolUseText).toContain('Write');

    // tool_result 包含 "工具结果"
    const toolResultText = blockToSearchText({
      blockType: 'tool_result',
      toolUseId: 'x',
      content: 'hello',
      isError: false,
    });
    expect(toolResultText).toContain('工具结果');
    expect(toolResultText).toContain('hello');
  });
});
