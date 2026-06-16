import { describe, it, expect } from 'vitest';
import {
  TabPinService,
  CloseOthersPolicy,
  CloseToRightPolicy,
  CloseAllPolicy,
} from '../../utils/tabPinService';
import type { TabState } from '../../types';

/** 创建简化版 TabState 用于测试 */
function makeTab(id: string, pinned = false): TabState {
  return {
    id,
    sessionPath: `/test/${id}.jsonl`,
    providerName: 'claude_code',
    sessionDetail: null,
    isLoading: false,
    error: null,
    filter: {
      showThinking: false,
      showToolCalls: true,
      showToolResults: true,
      hideEmptyToolResults: true,
      showSystemMessages: false,
      showFileSnapshots: false,
    },
    showFindBar: false,
    searchHighlight: undefined,
    scrollTop: 0,
    expandedThinking: [],
    expandedToolCalls: [],
    expandedToolResults: [],
    title: id,
    pinned,
  };
}

describe('TabPinService', () => {
  // ============================================================
  // canPin
  // ============================================================

  it('canPin 在未达上限时返回 true', () => {
    const service = new TabPinService(4);
    expect(service.canPin(0)).toBe(true);
    expect(service.canPin(3)).toBe(true);
  });

  it('canPin 在达到上限时返回 false', () => {
    const service = new TabPinService(4);
    expect(service.canPin(4)).toBe(false);
    expect(service.canPin(5)).toBe(false);
  });

  // ============================================================
  // countPinned
  // ============================================================

  it('countPinned 正确统计钉住数量', () => {
    const service = new TabPinService(4);
    const tabs = [makeTab('a', true), makeTab('b'), makeTab('c', true)];
    expect(service.countPinned(tabs)).toBe(2);
  });

  // ============================================================
  // split
  // ============================================================

  it('split 正确拆分钉住和普通标签', () => {
    const service = new TabPinService(4);
    const tabs = [
      makeTab('a', true),
      makeTab('b'),
      makeTab('c', true),
      makeTab('d'),
    ];
    const { pinned, regular } = service.split(tabs);
    expect(pinned.map((t) => t.id)).toEqual(['a', 'c']);
    expect(regular.map((t) => t.id)).toEqual(['b', 'd']);
  });

  // ============================================================
  // getInsertIndex
  // ============================================================

  it('getInsertIndex 返回最后一个 pinned 之后的位置', () => {
    const service = new TabPinService(4);
    const tabs = [makeTab('a', true), makeTab('b', true), makeTab('c')];
    expect(service.getInsertIndex(tabs)).toBe(2);
  });

  it('getInsertIndex 无 pinned 时返回 tabs.length', () => {
    const service = new TabPinService(4);
    const tabs = [makeTab('a'), makeTab('b')];
    expect(service.getInsertIndex(tabs)).toBe(2);
  });

  // ============================================================
  // reorderOnPin
  // ============================================================

  it('reorderOnPin 将标签移到钉住区末尾', () => {
    const service = new TabPinService(4);
    const tabs = [makeTab('a', true), makeTab('b'), makeTab('c')];
    const result = service.reorderOnPin(tabs, 'c');
    expect(result.map((t) => t.id)).toEqual(['a', 'c', 'b']);
    // c 的 pinned 属性不变（reorderOnPin 只改位置不改属性）
    expect(result[1].pinned).toBe(false);
  });

  // ============================================================
  // reorderOnUnpin
  // ============================================================

  it('reorderOnUnpin 将标签移到普通区起始', () => {
    const service = new TabPinService(4);
    const tabs = [
      makeTab('a', true),
      makeTab('b', true),
      makeTab('c'),
      makeTab('d'),
    ];
    const result = service.reorderOnUnpin(tabs, 'b');
    // b 移到 pinned(a) 之后、普通区起始
    expect(result.map((t) => t.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  // ============================================================
  // applyClosePolicy
  // ============================================================

  describe('CloseOthersPolicy', () => {
    it('保留指定标签和钉住标签', () => {
      const service = new TabPinService(4);
      const tabs = [
        makeTab('a', true),
        makeTab('b'),
        makeTab('c'),
        makeTab('d', true),
      ];
      const { kept, closed } = service.applyClosePolicy(
        tabs,
        new CloseOthersPolicy('b'),
      );
      expect(kept.map((t) => t.id)).toEqual(['a', 'b', 'd']);
      expect(closed.map((t) => t.id)).toEqual(['c']);
    });
  });

  describe('CloseToRightPolicy', () => {
    it('保留左侧标签和钉住标签', () => {
      const service = new TabPinService(4);
      const tabs = [
        makeTab('a'),
        makeTab('b'),
        makeTab('c', true),
        makeTab('d'),
      ];
      const { kept, closed } = service.applyClosePolicy(
        tabs,
        new CloseToRightPolicy('a'),
      );
      // a 左侧(含) = [a]，pinned = [c]
      expect(kept.map((t) => t.id)).toEqual(['a', 'c']);
      expect(closed.map((t) => t.id)).toEqual(['b', 'd']);
    });
  });

  describe('CloseAllPolicy', () => {
    it('仅保留钉住标签', () => {
      const service = new TabPinService(4);
      const tabs = [
        makeTab('a', true),
        makeTab('b'),
        makeTab('c', true),
        makeTab('d'),
      ];
      const { kept, closed } = service.applyClosePolicy(
        tabs,
        new CloseAllPolicy(),
      );
      expect(kept.map((t) => t.id)).toEqual(['a', 'c']);
      expect(closed.map((t) => t.id)).toEqual(['b', 'd']);
    });
  });

  // ============================================================
  // setMaxPinned
  // ============================================================

  it('setMaxPinned 限制在 1~8 范围内', () => {
    const service = new TabPinService(4);

    service.setMaxPinned(0);
    expect(service.getMaxPinned()).toBe(1);

    service.setMaxPinned(10);
    expect(service.getMaxPinned()).toBe(8);

    service.setMaxPinned(5);
    expect(service.getMaxPinned()).toBe(5);
  });
});
