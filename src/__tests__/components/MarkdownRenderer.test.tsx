import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MarkdownRenderer } from '../../components/conversation/MarkdownRenderer';

describe('MarkdownRenderer 高亮渲染', () => {
  it('allowHtml=true 时渲染内联样式 <mark> 标签', () => {
    const content =
      '这是测试<mark style="background-color:#fed7aa;border-radius:3px;padding:0 2px">工具</mark>文本';
    render(<MarkdownRenderer content={content} allowHtml={true} />);

    const mark = document.querySelector('mark');
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe('工具');
    expect(mark?.getAttribute('style')).toContain('background-color');
  });

  it('allowHtml=false 时 <mark> 被转义不渲染', () => {
    const content =
      '这是测试<mark style="background-color:#fed7aa">工具</mark>文本';
    render(<MarkdownRenderer content={content} allowHtml={false} />);

    const mark = document.querySelector('mark');
    expect(mark).toBeNull();
  });

  it('搜索标签高亮（黄色内联样式）', () => {
    const content =
      '请帮我写一个<mark style="background-color:#fef08a;border-radius:3px;padding:0 2px">登录</mark>工具';
    render(<MarkdownRenderer content={content} allowHtml={true} />);

    const mark = document.querySelector('mark');
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe('登录');
    expect(mark?.getAttribute('style')).toContain('background-color');
  });

  it('同时两种高亮', () => {
    const content =
      '<mark style="background-color:#fef08a">登录</mark>和<mark style="background-color:#fed7aa">工具</mark>';
    render(<MarkdownRenderer content={content} allowHtml={true} />);

    const marks = document.querySelectorAll('mark');
    expect(marks.length).toBeGreaterThanOrEqual(2);
  });

  it('高亮不影响普通 Markdown 渲染', () => {
    const content =
      '**粗体** `代码` <mark style="background-color:#fed7aa">高亮</mark>';
    render(<MarkdownRenderer content={content} allowHtml={true} />);

    // 粗体
    expect(document.querySelector('strong')).not.toBeNull();
    // 代码
    expect(document.querySelector('code')).not.toBeNull();
    // 高亮
    const mark = document.querySelector('mark');
    expect(mark).not.toBeNull();
  });
});
