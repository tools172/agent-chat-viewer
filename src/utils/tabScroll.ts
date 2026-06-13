/** 单个标签页的布局度量（用于滚动计算） */
export interface TabMetrics {
  offsetLeft: number;
  offsetWidth: number;
}

/**
 * 计算向右滚动一个标签的目标 scrollLeft。
 * 找到右侧第一个完全隐藏的标签，将其右边缘对齐视口右边缘以确保完整显示。
 * 返回 null 表示右侧没有隐藏标签，无需滚动。
 */
export function computeScrollOneRight(
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
  tabs: TabMetrics[]
): number | null {
  const maxScroll = scrollWidth - clientWidth;
  const rightEdge = scrollLeft + clientWidth;

  for (const tab of tabs) {
    // offsetLeft >= rightEdge → 标签完全在视口右侧之外
    if (tab.offsetLeft >= rightEdge) {
      // 让该标签的右边缘对齐视口右边缘，保证完整显示
      const target = Math.min(
        tab.offsetLeft + tab.offsetWidth - clientWidth,
        maxScroll
      );
      return Math.max(0, target);
    }
  }
  return null;
}

/**
 * 计算向左滚动一个标签的目标 scrollLeft。
 * 找到左侧最后一个完全隐藏的标签，将其左边缘对齐视口左边缘。
 * 返回 null 表示左侧没有隐藏标签，无需滚动。
 */
export function computeScrollOneLeft(
  scrollLeft: number,
  tabs: TabMetrics[]
): number | null {
  let lastHiddenLeft: TabMetrics | null = null;

  for (const tab of tabs) {
    // offsetLeft + offsetWidth <= scrollLeft → 标签完全在视口左侧之外
    if (tab.offsetLeft + tab.offsetWidth <= scrollLeft) {
      lastHiddenLeft = tab;
    } else {
      break; // 之后都是可见的
    }
  }

  if (lastHiddenLeft) {
    return Math.max(lastHiddenLeft.offsetLeft, 0);
  }
  return null;
}

/**
 * 从 DOM 元素中提取精确的 TabMetrics 数组。
 * 使用 getBoundingClientRect() 获取亚像素精度，避免 offsetWidth 整数舍入累积误差。
 * @param scrollEl 滚动容器元素
 * @param items 标签页 DOM 元素列表
 */
export function collectTabMetrics(
  scrollEl: HTMLElement,
  items: NodeListOf<Element> | HTMLCollection
): TabMetrics[] {
  const scrollRect = scrollEl.getBoundingClientRect();
  const result: TabMetrics[] = [];
  for (let i = 0; i < items.length; i++) {
    const el = items[i] as HTMLElement;
    const rect = el.getBoundingClientRect();
    result.push({
      // 相对于滚动容器内容起点的精确位置
      offsetLeft: rect.left - scrollRect.left + scrollEl.scrollLeft,
      offsetWidth: rect.width,
    });
  }
  return result;
}

/**
 * 使用 scrollIntoView 向右滚动一个标签。
 * 让右侧第一个完全隐藏的标签右边缘对齐视口右边缘。
 */
export function scrollOneRight(scrollEl: HTMLElement): void {
  const items = scrollEl.querySelectorAll<HTMLElement>('[data-tab-item]');
  const scrollRect = scrollEl.getBoundingClientRect();
  for (let i = 0; i < items.length; i++) {
    const rect = items[i].getBoundingClientRect();
    // 标签左边缘在视口右边缘之外 → 完全隐藏
    if (rect.left >= scrollRect.right - 0.5) {
      items[i].scrollIntoView({ block: 'nearest', inline: 'end', behavior: 'smooth' });
      return;
    }
  }
}

/**
 * 使用 scrollIntoView 向左滚动一个标签。
 * 让左侧最后一个完全隐藏的标签左边缘对齐视口左边缘。
 */
export function scrollOneLeft(scrollEl: HTMLElement): void {
  const items = scrollEl.querySelectorAll<HTMLElement>('[data-tab-item]');
  const scrollRect = scrollEl.getBoundingClientRect();
  let lastHiddenLeft: HTMLElement | null = null;
  for (let i = 0; i < items.length; i++) {
    const rect = items[i].getBoundingClientRect();
    // 标签右边缘在视口左边缘之外 → 部分/完全可见
    if (rect.right <= scrollRect.left + 0.5) {
      lastHiddenLeft = items[i];
    } else {
      break;
    }
  }
  if (lastHiddenLeft) {
    lastHiddenLeft.scrollIntoView({ block: 'nearest', inline: 'start', behavior: 'smooth' });
  }
}
