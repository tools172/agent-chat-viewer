import React from "react";
import { regexFlags } from "./searchEvents";

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
  color: string,
): React.ReactNode {
  if (!term || !term.trim()) return text;

  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, regexFlags(term));
  const parts = text.split(regex);

  if (parts.length === 1) return text;

  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark
        key={i}
        style={{
          backgroundColor: color,
          borderRadius: "3px",
          padding: "0 2px",
        }}
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

/** 激活匹配的样式（橙色描边，和浏览器的行为一致） */
const ACTIVE_FIND_STYLE: React.CSSProperties = {
  outline: "2px solid #f97316",
  outlineOffset: "1px",
  borderRadius: "3px",
};

/**
 * 高亮查找词，支持标记第 N 个匹配为"当前激活"。
 * 返回 React 节点和匹配总数，便于外层跨 chunk 累加计数。
 */
function highlightFindWithActive(
  text: string,
  term: string,
  color: string,
  startCounter: number,
  activeOccurrence?: number,
): { nodes: React.ReactNode[]; count: number } {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, regexFlags(term));
  const parts = text.split(regex);

  if (parts.length === 1) {
    return { nodes: [text], count: 0 };
  }

  let counter = startCounter;
  const nodes = parts.map((part, i) => {
    if (regex.test(part)) {
      const isActive =
        activeOccurrence !== undefined && counter === activeOccurrence;
      counter++;
      const style: React.CSSProperties = {
        backgroundColor: color,
        borderRadius: "3px",
        padding: "0 2px",
        ...(isActive ? ACTIVE_FIND_STYLE : {}),
      };
      return (
        <mark key={i} style={style}>
          {part}
        </mark>
      );
    }
    return part;
  });

  return { nodes, count: counter - startCounter };
}

/**
 * 双色高亮：搜索标签 + 会话查找，支持标记当前激活的查找匹配项。
 *
 * @param activeFindOccurrence - 全局（跨所有块）的查找匹配序号，仅当
 *   序号等于该匹配的累计位置时，该 `<mark>` 会带上激活样式。
 */
export function highlightDual(
  text: string,
  searchTerm: string | undefined,
  findTerm: string | undefined,
  colors: HighlightColors,
  activeFindOccurrence?: number,
): React.ReactNode {
  if (!searchTerm && !findTerm) return text;

  // 只有搜索词
  if (searchTerm && !findTerm) {
    return highlightText(text, searchTerm, colors.search);
  }

  // 只有查找词
  if (!searchTerm && findTerm) {
    const { nodes } = highlightFindWithActive(
      text,
      findTerm,
      colors.find,
      0,
      activeFindOccurrence,
    );
    return nodes;
  }

  // 两者都有：先按搜索词分割，再在片段上标查找词
  const escaped = searchTerm!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, regexFlags(searchTerm!));
  const parts = text.split(regex);

  if (parts.length === 1) {
    const { nodes } = highlightFindWithActive(
      text,
      findTerm!,
      colors.find,
      0,
      activeFindOccurrence,
    );
    return nodes;
  }

  let findCounter = 0;
  return parts.map((part, i) => {
    if (regex.test(part)) {
      // 搜索词匹配 → 搜索色为底，内层再做查找高亮
      const inner = highlightFindWithActive(
        part,
        findTerm!,
        colors.find,
        findCounter,
        activeFindOccurrence,
      );
      findCounter += inner.count;
      return (
        <mark
          key={i}
          style={{
            backgroundColor: colors.search,
            borderRadius: "3px",
            padding: "0 2px",
          }}
        >
          {inner.nodes}
        </mark>
      );
    }
    // 非搜索匹配 → 仅做查找高亮
    const inner = highlightFindWithActive(
      part,
      findTerm!,
      colors.find,
      findCounter,
      activeFindOccurrence,
    );
    findCounter += inner.count;
    // 如果 inner.nodes 仅一个字符串元素，直接返回避免多余的 Fragment key 警告
    if (inner.nodes.length === 1 && typeof inner.nodes[0] === "string") {
      return <React.Fragment key={i}>{inner.nodes[0]}</React.Fragment>;
    }
    return <React.Fragment key={i}>{inner.nodes}</React.Fragment>;
  });
}
