import { describe, it, expect } from 'vitest';
import React from 'react';
import { highlightText, highlightDual } from '../../utils/highlight';

const COLORS = { search: '#fef08a', find: '#fed7aa' };

describe('highlightText', () => {
  it('匹配词被包裹为 React 元素', () => {
    const result = highlightText('登录工具', '工具', COLORS.search);
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      expect(result.length).toBe(3);
      expect(React.isValidElement(result[1])).toBe(true);
    }
  });

  it('无匹配返回原文字符串', () => {
    expect(highlightText('普通文本', '不存在', COLORS.search)).toBe('普通文本');
  });

  it('空查询返回原文', () => {
    expect(highlightText('文本', '', COLORS.search)).toBe('文本');
  });
});

describe('highlightDual', () => {
  it('仅搜索词', () => {
    const result = highlightDual('登录工具', '登录', undefined, COLORS);
    expect(Array.isArray(result)).toBe(true);
  });

  it('仅查找词', () => {
    const result = highlightDual('登录工具', undefined, '工具', COLORS);
    expect(Array.isArray(result)).toBe(true);
  });

  it('两者都没有返回原文', () => {
    expect(highlightDual('文本', undefined, undefined, COLORS)).toBe('文本');
  });

  it('两者都有', () => {
    const result = highlightDual('登录工具', '登录', '工具', COLORS);
    expect(Array.isArray(result)).toBe(true);
  });
});
