/**
 * 测试双色高亮函数（内联样式版本）
 */
import { describe, it, expect } from 'vitest';

/** 与 EventCard 中 applyHighlights 完全一致的实现 */
function applyHighlights(
  text: string,
  searchTerm?: string,
  findTerm?: string
): string {
  let result = text;
  if (searchTerm) {
    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(
      new RegExp(`(${escaped})`, 'gi'),
      '<mark style="background-color:#fef08a;border-radius:3px;padding:0 2px">$1</mark>'
    );
  }
  if (findTerm) {
    const escaped = findTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(
      new RegExp(`(${escaped})`, 'gi'),
      '<mark style="background-color:#fed7aa;border-radius:3px;padding:0 2px">$1</mark>'
    );
  }
  return result;
}

describe('applyHighlights 双色高亮', () => {
  it('仅搜索标签高亮（黄色）', () => {
    const result = applyHighlights('请帮我写一个登录工具', '登录');
    expect(result).toContain('#fef08a');
    expect(result).toContain('登录');
    expect(result).not.toContain('#fed7aa');
  });

  it('仅会话查找高亮（橙色）', () => {
    const result = applyHighlights('请帮我写一个登录工具', undefined, '工具');
    expect(result).toContain('#fed7aa');
    expect(result).toContain('工具');
    expect(result).not.toContain('#fef08a');
  });

  it('同时应用两种高亮', () => {
    const result = applyHighlights('请帮我写一个登录工具', '登录', '工具');
    expect(result).toContain('#fef08a');
    expect(result).toContain('#fed7aa');
  });

  it('相同关键词重叠时两者都标记', () => {
    const result = applyHighlights('登录登录', '登录', '登录');
    // 两种内联样式都存在
    expect(result).toContain('#fef08a');
    expect(result).toContain('#fed7aa');
  });

  it('无高亮词时返回原文', () => {
    const result = applyHighlights('普通文本');
    expect(result).toBe('普通文本');
  });

  it('特殊正则字符转义', () => {
    const result = applyHighlights('test (hello) world', '(hello)');
    expect(result).toContain('#fef08a');
    expect(result).toContain('(hello)');
  });
});

describe('Markdown 渲染兼容性', () => {
  it('高亮不影响 Markdown 语法', () => {
    const text = '**粗体** 和 `代码`';
    const result = applyHighlights(text, '粗体');
    expect(result).toContain('**<mark');
    expect(result).toContain('粗体</mark>**');
  });

  it('代码块中的文字也高亮', () => {
    const text = '请查看 `login.ts` 文件';
    const result = applyHighlights(text, 'login');
    expect(result).toContain('<mark');
    expect(result).toContain('login</mark>');
  });
});
