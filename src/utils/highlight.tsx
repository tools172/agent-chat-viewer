import React from 'react';

interface HighlightColors {
  search: string;
  find: string;
}

/**
 * 高亮文本中的关键词（搜索标签用）
 */
export function highlightText(
  text: string,
  term: string,
  color: string
): React.ReactNode {
  if (!term || !term.trim()) return text;

  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  if (parts.length === 1) return text;

  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark
        key={i}
        style={{ backgroundColor: color, borderRadius: '3px', padding: '0 2px' }}
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}

/**
 * 双色高亮：搜索标签 + 会话查找
 */
export function highlightDual(
  text: string,
  searchTerm: string | undefined,
  findTerm: string | undefined,
  colors: HighlightColors
): React.ReactNode {
  if (!searchTerm && !findTerm) return text;

  // 只有搜索词
  if (searchTerm && !findTerm) {
    return highlightText(text, searchTerm, colors.search);
  }

  // 只有查找词
  if (!searchTerm && findTerm) {
    return highlightText(text, findTerm, colors.find);
  }

  // 两者都有：先分割搜索词，再在片段上标查找词
  const escaped = searchTerm!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  if (parts.length === 1) {
    return highlightText(text, findTerm!, colors.find);
  }

  return parts.map((part, i) => {
    if (regex.test(part)) {
      const inner = highlightText(part, findTerm!, colors.find);
      return (
        <mark
          key={i}
          style={{ backgroundColor: colors.search, borderRadius: '3px', padding: '0 2px' }}
        >
          {inner}
        </mark>
      );
    }
    return findTerm ? (
      <React.Fragment key={i}>
        {highlightText(part, findTerm, colors.find)}
      </React.Fragment>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    );
  });
}
