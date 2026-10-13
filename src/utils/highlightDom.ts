/**
 * DOM 级别的高亮工具。
 *
 * 在已渲染的 DOM 容器中遍历文本节点，为搜索词和查找词创建 <mark> 高亮。
 * 因为操作的是最终渲染的 DOM，所以 Markdown 代码块内的文本也能正确高亮。
 */

import { regexFlags } from "./searchEvents";

interface HighlightColors {
  search: string;
  find: string;
}

interface Match {
  start: number;
  end: number;
  text: string;
  type: "search" | "find";
}

/**
 * 在容器内为 searchTerm / findTerm 创建 <mark> 高亮。
 *
 * @param blockIdx - 当前内容块的索引，用于给 find <mark> 标记 data 属性以便滚动定位
 */
export function highlightTextInDOM(
  container: HTMLElement,
  searchTerm: string | undefined,
  findTerm: string | undefined,
  colors: HighlightColors,
  activeFindOccurrence?: number,
  blockIdx?: number,
): void {
  if (!searchTerm && !findTerm) return;

  // 收集所有文本节点（跳过已有的 <mark>，避免重复包裹）
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // 跳过已高亮的 <mark> 内的文本
      const parent = node.parentElement;
      if (parent && parent.tagName === "MARK") {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }

  let findOccurrence = 0;

  for (const textNode of textNodes) {
    const text = textNode.textContent || "";
    const matches = collectMatches(text, searchTerm, findTerm);
    if (matches.length === 0) continue;

    // 按位置排序，重叠时 find 优先
    matches.sort((a, b) => a.start - b.start || (a.type === "find" ? -1 : 1));
    const filtered = removeOverlaps(matches);

    const fragment = document.createDocumentFragment();
    let lastIdx = 0;

    for (const match of filtered) {
      // 匹配前的文本
      if (match.start > lastIdx) {
        fragment.appendChild(
          document.createTextNode(text.slice(lastIdx, match.start)),
        );
      }

      const mark = document.createElement("mark");
      mark.textContent = match.text;
      mark.style.borderRadius = "3px";
      mark.style.padding = "0 2px";

      if (match.type === "search") {
        mark.style.backgroundColor = colors.search;
      } else {
        mark.style.backgroundColor = colors.find;
        mark.setAttribute("data-find-occurrence", String(findOccurrence));
        if (blockIdx !== undefined) {
          mark.setAttribute("data-find-block", String(blockIdx));
        }
        if (
          activeFindOccurrence !== undefined &&
          findOccurrence === activeFindOccurrence
        ) {
          mark.style.outline = "2px solid #f97316";
          mark.style.outlineOffset = "1px";
        }
        findOccurrence++;
      }

      fragment.appendChild(mark);
      lastIdx = match.end;
    }

    // 剩余文本
    if (lastIdx < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIdx)));
    }

    textNode.parentNode?.replaceChild(fragment, textNode);
  }
}

/** 收集文本中所有搜索/查找匹配的位置 */
function collectMatches(
  text: string,
  searchTerm: string | undefined,
  findTerm: string | undefined,
): Match[] {
  const matches: Match[] = [];

  if (searchTerm) {
    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const flags = regexFlags(searchTerm);
    const regex = new RegExp(escaped, flags);
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        type: "search",
      });
    }
  }

  if (findTerm) {
    const escaped = findTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const flags = regexFlags(findTerm);
    const regex = new RegExp(escaped, flags);
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        type: "find",
      });
    }
  }

  return matches;
}

/** 移除重叠的匹配，find 类型优先 */
function removeOverlaps(matches: Match[]): Match[] {
  const result: Match[] = [];
  for (const m of matches) {
    const overlaps = result.some((r) => r.start < m.end && m.start < r.end);
    if (!overlaps) result.push(m);
  }
  return result;
}
