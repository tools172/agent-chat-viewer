import type { TabState } from '../types';

// ===== ClosePolicy 策略接口（开闭原则：新增关闭方式只需实现此接口） =====

/** 关闭策略接口 — 判断标签在批量关闭操作中是否应保留 */
export interface ClosePolicy {
  shouldKeep(
    tab: { id: string; pinned: boolean },
    allTabs: TabState[],
  ): boolean;
}

/** 关闭其他：保留指定标签 + 所有钉住标签 */
export class CloseOthersPolicy implements ClosePolicy {
  constructor(private readonly keepTabId: string) {}

  shouldKeep(tab: { id: string; pinned: boolean }): boolean {
    return tab.id === this.keepTabId || tab.pinned;
  }
}

/** 关闭右侧：保留左侧（含锚点）标签 + 所有钉住标签 */
export class CloseToRightPolicy implements ClosePolicy {
  constructor(private readonly anchorId: string) {}

  shouldKeep(
    tab: { id: string; pinned: boolean },
    allTabs: TabState[],
  ): boolean {
    const anchorIdx = allTabs.findIndex((t) => t.id === this.anchorId);
    const tabIdx = allTabs.findIndex((t) => t.id === tab.id);
    return tabIdx <= anchorIdx || tab.pinned;
  }
}

/** 全部关闭：仅保留钉住标签 */
export class CloseAllPolicy implements ClosePolicy {
  shouldKeep(tab: { pinned: boolean }): boolean {
    return tab.pinned;
  }
}

// ===== TabPinService =====

/**
 * 钉住服务 — 封装所有钉住相关逻辑
 *
 * 设计原则：
 * - 单一职责：只管钉住逻辑，不涉及其他标签操作
 * - 依赖注入：maxPinned 通过构造参数注入，方便测试
 * - 纯函数：所有方法无副作用，输入→输出
 */
export class TabPinService {
  private maxPinned: number;

  constructor(maxPinned: number = 4) {
    this.maxPinned = Math.max(1, Math.min(8, maxPinned));
  }

  /** 更新最大钉住数配置 */
  setMaxPinned(n: number): void {
    this.maxPinned = Math.max(1, Math.min(8, n));
  }

  /** 获取当前最大钉住数 */
  getMaxPinned(): number {
    return this.maxPinned;
  }

  /** 是否允许新增钉住 */
  canPin(pinnedCount: number): boolean {
    return pinnedCount < this.maxPinned;
  }

  /** 统计当前钉住标签数 */
  countPinned(tabs: TabState[]): number {
    return tabs.filter((t) => t.pinned).length;
  }

  /**
   * 批量关闭 — 应用策略过滤
   * @returns kept: 保留的标签, closed: 将被关闭的标签
   */
  applyClosePolicy(
    tabs: TabState[],
    policy: ClosePolicy,
  ): { kept: TabState[]; closed: TabState[] } {
    const kept: TabState[] = [];
    const closed: TabState[] = [];
    for (const tab of tabs) {
      if (policy.shouldKeep(tab, tabs)) {
        kept.push(tab);
      } else {
        closed.push(tab);
      }
    }
    return { kept, closed };
  }

  /**
   * 钉住时重排：将标签移到钉住区末尾（最后一个 pinned 之后）
   * 返回新的 tabs 数组（不修改原数组）
   */
  reorderOnPin(tabs: TabState[], tabId: string): TabState[] {
    const idx = tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return tabs;

    const result = [...tabs];
    const [tab] = result.splice(idx, 1);

    // 找到最后一个 pinned 标签的位置
    let insertAt = 0;
    for (let i = 0; i < result.length; i++) {
      if (result[i].pinned) insertAt = i + 1;
    }

    result.splice(insertAt, 0, tab);
    return result;
  }

  /**
   * 取消钉住时重排：将标签移到普通区起始（最后一个 pinned 之后）
   * 返回新的 tabs 数组（不修改原数组）
   */
  reorderOnUnpin(tabs: TabState[], tabId: string): TabState[] {
    const idx = tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return tabs;

    const result = [...tabs];
    const [tab] = result.splice(idx, 1);

    // 插入到最后一个 pinned 之后
    let insertAt = 0;
    for (let i = 0; i < result.length; i++) {
      if (result[i].pinned) insertAt = i + 1;
    }

    result.splice(insertAt, 0, tab);
    return result;
  }

  /** 将 tabs 拆分为 pinned + regular */
  split(tabs: TabState[]): { pinned: TabState[]; regular: TabState[] } {
    const pinned: TabState[] = [];
    const regular: TabState[] = [];
    for (const tab of tabs) {
      if (tab.pinned) {
        pinned.push(tab);
      } else {
        regular.push(tab);
      }
    }
    return { pinned, regular };
  }

  /** 新标签应插入的位置（最后一个 pinned 之后），保证普通标签不在 pinned 之前 */
  getInsertIndex(tabs: TabState[]): number {
    let insertAt = tabs.length;
    for (let i = tabs.length - 1; i >= 0; i--) {
      if (tabs[i].pinned) {
        insertAt = i + 1;
        break;
      }
    }
    return insertAt;
  }
}
