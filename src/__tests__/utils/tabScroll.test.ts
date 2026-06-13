import { describe, it, expect } from 'vitest';
import {
  computeScrollOneLeft,
  computeScrollOneRight,
  type TabMetrics,
} from '../../utils/tabScroll';

/** 辅助：创建等宽标签 */
function tabsEq(count: number, width: number): TabMetrics[] {
  const tabs: TabMetrics[] = [];
  let offset = 0;
  for (let i = 0; i < count; i++) {
    tabs.push({ offsetLeft: offset, offsetWidth: width });
    offset += width;
  }
  return tabs;
}

/** 辅助：创建宽度不等的标签 */
function tabsVar(widths: number[]): TabMetrics[] {
  const tabs: TabMetrics[] = [];
  let offset = 0;
  for (const w of widths) {
    tabs.push({ offsetLeft: offset, offsetWidth: w });
    offset += w;
  }
  return tabs;
}

/** 验证标签在视口中是否完整可见 */
function isFullyVisible(
  tab: TabMetrics,
  viewportLeft: number,
  viewportRight: number
): boolean {
  return tab.offsetLeft >= viewportLeft &&
    tab.offsetLeft + tab.offsetWidth <= viewportRight;
}

// ============================================================
// computeScrollOneRight
// ============================================================
describe('computeScrollOneRight', () => {
  it('无隐藏标签时返回 null', () => {
    const tabs = tabsEq(3, 100); // 300px 内容, viewport 400
    expect(computeScrollOneRight(0, 400, 300, tabs)).toBeNull();
  });

  it('最后一个标签恰好填满视口时返回 null', () => {
    const tabs = tabsEq(4, 100); // 400px 内容, viewport 400
    expect(computeScrollOneRight(0, 400, 400, tabs)).toBeNull();
  });

  it('右侧有一个隐藏标签 — 右边缘对齐视口右边缘', () => {
    // A(0-150), B(150-300), C(300-450), D(450-600), viewport 400
    const tabs = tabsEq(4, 150);
    // D offsetLeft=450 >= rightEdge=400 → 隐藏
    // target = D.right - viewport = 600 - 400 = 200
    expect(computeScrollOneRight(0, 400, 600, tabs)).toBe(200);

    // 验证 D 完整显示：viewport 200-600, D 450-600 ✓
    expect(isFullyVisible(tabs[3], 200, 600)).toBe(true);
  });

  it('右侧多个隐藏标签 — 每次只揭示一个', () => {
    // 6×100=600, viewport 300, scrollLeft=0
    // D(300-400) offsetLeft=300 >= rightEdge=300 → 隐藏
    // target = 400 - 300 = 100
    const tabs = tabsEq(6, 100);
    expect(computeScrollOneRight(0, 300, 600, tabs)).toBe(100);
    // 验证 D 完整显示：viewport 100-400, D 300-400 ✓
    expect(isFullyVisible(tabs[3], 100, 400)).toBe(true);
  });

  it('滚动目标不超过 maxScroll', () => {
    // A(0-200), B(200-400), C(400-600), viewport 300, maxScroll=300
    const tabs = tabsEq(3, 200);
    // C offsetLeft=400 >= rightEdge=300 → 隐藏
    // target = 600 - 300 = 300, maxScroll=300 → 300
    expect(computeScrollOneRight(0, 300, 600, tabs)).toBe(300);

    // 验证 C 完整显示：viewport 300-600, C 400-600 ✓
    expect(isFullyVisible(tabs[2], 300, 600)).toBe(true);

    // scrollLeft=300 之后无隐藏标签
    expect(computeScrollOneRight(300, 300, 600, tabs)).toBeNull();
  });

  it('部分可见标签不算隐藏', () => {
    // A(0-150), B(150-300), C(300-450), viewport 300
    const tabs = tabsEq(3, 150);
    // scrollLeft=150, rightEdge=450
    // C offsetLeft=300 < 450 → 部分可见，不算隐藏
    expect(computeScrollOneRight(150, 300, 450, tabs)).toBeNull();
  });

  it('不等宽标签 — 揭示后完整显示', () => {
    // A(200), B(300), C(250) = 750, viewport 400
    const tabs = tabsVar([200, 300, 250]);
    // C offsetLeft=500 >= rightEdge=400 → 隐藏
    // target = 750 - 400 = 350, maxScroll=350 → 350
    expect(computeScrollOneRight(0, 400, 750, tabs)).toBe(350);

    // 验证 C 完整显示：viewport 350-750, C 500-750 ✓
    expect(isFullyVisible(tabs[2], 350, 750)).toBe(true);
  });
});

// ============================================================
// computeScrollOneLeft
// ============================================================
describe('computeScrollOneLeft', () => {
  it('无隐藏标签时返回 null', () => {
    expect(computeScrollOneLeft(0, tabsEq(3, 100))).toBeNull();
  });

  it('左侧有一个隐藏标签 — 对齐其左边缘', () => {
    // A(0-150), B(150-300), C(300-450), D(450-600), scrollLeft=200
    // A right=150 <= 200 → 隐藏, offsetLeft=0
    const tabs = tabsEq(4, 150);
    expect(computeScrollOneLeft(200, tabs)).toBe(0);

    // 验证 A 完整显示：viewport 0-400, A 0-150 ✓
    expect(isFullyVisible(tabs[0], 0, 400)).toBe(true);
  });

  it('左侧多个隐藏标签 — 对齐最靠近视口者', () => {
    // 5×150=750, scrollLeft=500
    // A(150<=500), B(300<=500), C(450<=500) → lastHidden=C(offsetLeft=300)
    const tabs = tabsEq(5, 150);
    expect(computeScrollOneLeft(500, tabs)).toBe(300);

    // 验证 C 完整显示：viewport 300-700, C 300-450 ✓
    expect(isFullyVisible(tabs[2], 300, 700)).toBe(true);
  });

  it('不等宽标签 — 对齐到非零 offsetLeft', () => {
    // A(0-200), B(200-350), C(350-530), D(530-690), E(690-830)
    const tabs = tabsVar([200, 150, 180, 160, 140]);
    // scrollLeft=400
    // A: 200<=400 ✓, B: 350<=400 ✓ → lastHidden=B(offsetLeft=200)
    expect(computeScrollOneLeft(400, tabs)).toBe(200);

    // 验证 B 完整显示：viewport 200-600, B 200-350 ✓
    expect(isFullyVisible(tabs[1], 200, 600)).toBe(true);
  });

  it('标签右边缘恰好等于 scrollLeft 时视为隐藏', () => {
    const tabs = tabsEq(3, 100);
    // scrollLeft=100, A right=100 <= 100 → 隐藏
    expect(computeScrollOneLeft(100, tabs)).toBe(0);
  });

  it('部分可见标签不被视为隐藏', () => {
    const tabs = tabsEq(3, 200);
    // scrollLeft=150, A right=200 > 150 → 部分可见，不算隐藏
    expect(computeScrollOneLeft(150, tabs)).toBeNull();
  });

  it('滚动到 0 不产生负值', () => {
    const tabs = tabsEq(3, 200);
    // scrollLeft=300, A right=200 <= 300 → 隐藏, offsetLeft=0
    expect(computeScrollOneLeft(300, tabs)).toBe(0);
  });
});

// ============================================================
// 综合场景 — 模拟用户多次点击
// ============================================================
describe('连续点击 — 右侧指示器', () => {
  it('等宽标签逐次揭示直到全部可见', () => {
    // 7×120=840, viewport 400, maxScroll=440
    const tabs = tabsEq(7, 120);
    const viewport = 400;
    const totalWidth = 840;
    let scrollLeft = 0;

    const targets: number[] = [];
    for (let i = 0; i < 10; i++) {
      const next = computeScrollOneRight(scrollLeft, viewport, totalWidth, tabs);
      if (next === null) break;
      targets.push(next);
      scrollLeft = next;
    }

    // E(480-600) 首次隐藏, target=600-400=200
    // F(600-720) 下次隐藏, target=720-400=320
    // G(720-840) 最后隐藏, target=min(840-400=440, 440)=440
    expect(targets).toEqual([200, 320, 440]);

    // 最后不超过 maxScroll
    expect(targets[targets.length - 1]).toBeLessThanOrEqual(totalWidth - viewport);

    // 最终视口内最后一个标签完整可见
    const finalLeft = targets[targets.length - 1];
    const finalRight = finalLeft + viewport;
    const lastTab = tabs[tabs.length - 1];
    expect(isFullyVisible(lastTab, finalLeft, finalRight)).toBe(true);
  });

  it('不等宽标签 — 揭示后完整显示', () => {
    // A(200), B(300), C(250)=750, viewport 400
    const tabs = tabsVar([200, 300, 250]);
    const viewport = 400;
    const totalWidth = 750;
    let scrollLeft = 0;

    const targets: number[] = [];
    for (let i = 0; i < 10; i++) {
      const next = computeScrollOneRight(scrollLeft, viewport, totalWidth, tabs);
      if (next === null) break;
      targets.push(next);
      scrollLeft = next;
    }

    // C offsetLeft=500 >= rightEdge=400 → target=750-400=350 → maxScroll=350
    expect(targets).toEqual([350]);

    // C 完整显示：viewport 350-750, C 500-750 ✓
    expect(isFullyVisible(tabs[2], 350, 750)).toBe(true);
  });
});

describe('连续点击 — 左侧指示器', () => {
  it('等宽标签逐次揭示直到全部可见', () => {
    // 7×120=840, viewport 400, maxScroll=440
    const tabs = tabsEq(7, 120);
    let scrollLeft = 440; // 从最右侧开始

    const targets: number[] = [];
    for (let i = 0; i < 10; i++) {
      const next = computeScrollOneLeft(scrollLeft, tabs);
      if (next === null) break;
      targets.push(next);
      scrollLeft = next;
    }

    // C offsetLeft=240 (last hidden at scrollLeft=440) → 240
    // B offsetLeft=120 → 120
    // A offsetLeft=0 → 0
    expect(targets).toEqual([240, 120, 0]);
  });

  it('不等宽标签 — 被带入的标签完整显示', () => {
    // A(200), B(150), C(180), D(160), E(140) = 830, viewport 400, maxScroll=430
    const tabs = tabsVar([200, 150, 180, 160, 140]);
    let scrollLeft = 430;

    const steps: { target: number; revealedTabIndex: number }[] = [];
    for (let i = 0; i < 10; i++) {
      const next = computeScrollOneLeft(scrollLeft, tabs);
      if (next === null) break;

      // 找到滚动后左边缘对齐视口的标签
      const revealedIdx = tabs.findIndex(
        (t) => t.offsetLeft === next
      );
      steps.push({ target: next, revealedTabIndex: revealedIdx });
      scrollLeft = next;
    }

    // B(offsetLeft=200) 是 scrollLeft=430 时最靠近视口的隐藏标签
    expect(steps[0]).toEqual({ target: 200, revealedTabIndex: 1 });
    // B 完整显示：viewport 200-600, B 200-350 ✓
    expect(isFullyVisible(tabs[1], 200, 600)).toBe(true);

    // A(offsetLeft=0) 是下一次的隐藏标签
    expect(steps[1]).toEqual({ target: 0, revealedTabIndex: 0 });
    // A 完整显示：viewport 0-400, A 0-200 ✓
    expect(isFullyVisible(tabs[0], 0, 400)).toBe(true);

    expect(steps.length).toBe(2);
  });
});

// ============================================================
// 回归测试 — 每个被揭示的标签都完整显示
// ============================================================
describe('揭示标签完整性验证', () => {
  it('左侧 — 所有场景下被揭示标签左边缘对齐视口', () => {
    const testCases = [
      { tabs: tabsEq(5, 150), scrollLeft: 350 },
      { tabs: tabsVar([200, 150, 180, 160, 140]), scrollLeft: 300 },
      { tabs: tabsVar([100, 250, 100, 300]), scrollLeft: 400 },
      { tabs: tabsEq(10, 100), scrollLeft: 600 },
    ];

    for (const { tabs, scrollLeft } of testCases) {
      const next = computeScrollOneLeft(scrollLeft, tabs);
      if (next === null) continue;

      // 找到被带入视野的标签
      let revealed: TabMetrics | null = null;
      for (const tab of tabs) {
        if (tab.offsetLeft + tab.offsetWidth <= scrollLeft) {
          revealed = tab;
        } else break;
      }

      if (revealed) {
        // 标签左边缘应等于滚动目标（即对齐视口左边缘）
        expect(revealed.offsetLeft).toBe(next);
      }
    }
  });

  it('右侧 — 所有场景下被揭示标签右边缘对齐视口', () => {
    const testCases = [
      { tabs: tabsEq(5, 150), viewport: 400, scrollLeft: 0, totalWidth: 750 },
      { tabs: tabsVar([200, 300, 250]), viewport: 400, scrollLeft: 0, totalWidth: 750 },
      { tabs: tabsVar([100, 250, 100, 300]), viewport: 350, scrollLeft: 0, totalWidth: 750 },
      { tabs: tabsEq(10, 100), viewport: 300, scrollLeft: 0, totalWidth: 1000 },
    ];

    for (const { tabs, viewport, scrollLeft, totalWidth } of testCases) {
      const next = computeScrollOneRight(scrollLeft, viewport, totalWidth, tabs);
      if (next === null) continue;

      const rightEdge = scrollLeft + viewport;

      // 找到被带入视野的标签（第一个完全隐藏的）
      let revealed: TabMetrics | null = null;
      for (const tab of tabs) {
        if (tab.offsetLeft >= rightEdge) {
          revealed = tab;
          break;
        }
      }

      if (revealed) {
        // 标签右边缘应等于滚动后视口右边缘
        const newViewportRight = next + viewport;
        expect(revealed.offsetLeft + revealed.offsetWidth).toBe(newViewportRight);
        // 标签完整可见
        expect(isFullyVisible(revealed, next, newViewportRight)).toBe(true);
      }
    }
  });
});
