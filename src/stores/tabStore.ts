import { create } from "zustand";
import type {
  TabState,
  TabSnapshot,
  FilterConfig,
  SessionDetail,
} from "../types";
import * as tauri from "../utils/tauri";
import { useSettingsStore } from "./settingsStore";
import { useToastStore } from "./toastStore";
import { extractUserText } from "../utils/filterEvents";
import {
  TabPinService,
  CloseOthersPolicy,
  CloseToRightPolicy,
  CloseAllPolicy,
} from "../utils/tabPinService";

// 后端请求用：始终加载全部内容块，前端侧再做用户过滤
const FULL_FILTER: FilterConfig = {
  showThinking: true,
  showToolCalls: true,
  showToolResults: true,
  hideEmptyToolResults: false,
  showSystemMessages: true,
  showFileSnapshots: false,
};

let tabCounter = 0;

// ===== 标签页状态持久化 =====

let saveTabTimer: ReturnType<typeof setTimeout> | null = null;

/** 执行实际的标签页状态保存 */
function persistTabState() {
  const { tabs, activeTabId } = useTabStore.getState();
  const settingsState = useSettingsStore.getState();
  const settings = settingsState.settings;

  const activeIndex = tabs.findIndex((t) => t.id === activeTabId);
  const snapshots: TabSnapshot[] = tabs.map((t) => ({
    sessionPath: t.sessionPath,
    providerName: t.providerName,
    pinned: t.pinned,
    workingDir: t.workingDir,
    title: t.title,
  }));

  const updated: typeof settings = {
    ...settings,
    tabSnapshots: snapshots,
    activeTabIndex: activeIndex >= 0 ? activeIndex : 0,
  };

  useSettingsStore.setState({ settings: updated });
  tauri
    .saveSettings(updated)
    .catch((err) => console.error("Failed to save tab state:", err));
}

/** 触发标签页状态保存（300ms debounce） */
function triggerSaveTabState() {
  if (saveTabTimer) clearTimeout(saveTabTimer);
  saveTabTimer = setTimeout(persistTabState, 300);
}

/** 读取当前设置的 displayFirstUserMessage */
function getUseLast(): boolean {
  return !useSettingsStore.getState().settings.displayFirstUserMessage;
}

/** 从 SessionDetail 提取标签页标题 */
function buildTabTitle(detail: SessionDetail, useLast?: boolean): string {
  if (useLast) {
    // 取最后一条用户消息
    const userEvents = (detail.events || []).filter(
      (e) => e.eventType === "user",
    );
    const lastUser = userEvents[userEvents.length - 1];
    if (lastUser) {
      const text = extractUserText(lastUser);
      if (text) return text.slice(0, 60);
    }
  }
  // 默认取第一条用户消息：优先使用后端清理过的 display 字段
  if (detail.display && detail.display !== "(Empty session)") {
    return detail.display.slice(0, 60);
  }
  // 兜底：前端从 events 中提取第一条
  const firstUserEvent = detail.events?.find((e) => e.eventType === "user");
  if (!firstUserEvent) return "Untitled";
  return extractUserText(firstUserEvent).slice(0, 60) || "Untitled";
}

/** 生成唯一 tab id */
function generateTabId(): string {
  tabCounter += 1;
  return `tab_${Date.now()}_${tabCounter}`;
}

/** 获取钉住服务实例（从设置中读取 maxPinnedTabs） */
function getPinService(): TabPinService {
  const maxPinned = useSettingsStore.getState().settings.maxPinnedTabs ?? 4;
  return new TabPinService(maxPinned);
}

interface TabStoreState {
  // === 数据 ===
  tabs: TabState[];
  activeTabId: string | null;
  closedTabs: TabSnapshot[];
  tabOrder: string[];

  // === 操作 ===
  /** 打开标签页（已存在则激活），返回 tabId。activate=false 时在后台打开不切换 */
  openTab: (
    sessionPath: string,
    providerName: string,
    activate?: boolean,
    cwd?: string,
  ) => Promise<string>;
  /** 关闭标签页 */
  closeTab: (tabId: string) => void;
  /** 激活标签页 */
  activateTab: (tabId: string) => void;
  /** 关闭其他标签页 */
  closeOtherTabs: (tabId: string) => void;
  /** 关闭右侧标签页 */
  closeTabsToRight: (tabId: string) => void;
  /** 关闭所有标签页 */
  closeAllTabs: () => void;
  /** 恢复最近关闭的标签页 */
  reopenClosedTab: () => Promise<string | null>;
  /** 切换钉住状态 */
  togglePinTab: (tabId: string) => void;
  /** 移动标签页（拖拽排序） */
  moveTab: (fromIndex: number, toIndex: number) => void;
  /** 更新标签页过滤器 */
  updateTabFilter: (tabId: string, filter: Partial<FilterConfig>) => void;
  /** 更新标签页查找栏状态 */
  updateTabFindBar: (tabId: string, show: boolean) => void;
  /** 更新标签页滚动位置 */
  updateTabScrollTop: (tabId: string, scrollTop: number) => void;
  /** 更新标签页展开状态 */
  updateTabExpanded: (
    tabId: string,
    type: "thinking" | "toolCall" | "toolResult",
    uuids: string[],
  ) => void;
  /** 更新标签页搜索高亮 */
  updateTabSearchHighlight: (
    tabId: string,
    highlight: string | undefined,
  ) => void;
  /** 刷新标签页（重新加载会话内容） */
  refreshTab: (tabId: string) => Promise<void>;
  /** 保存当前标签页状态到设置（debounce 300ms） */
  saveTabState: () => void;
  /** 立即保存标签页状态（用于窗口关闭） */
  saveTabStateImmediate: () => void;
  /** 延迟加载占位标签页的会话内容 */
  loadTabContent: (tabId: string) => Promise<void>;
  /** 从快照恢复标签页（启动时调用），返回恢复的 tab ID 列表 */
  restoreTabs: () => Promise<string[]>;
  /** 初始化设置订阅（app 启动时调用一次） */
  initSettingsSubscription: () => void;
  /** 同步所有标签页标题（设置变更时调用） */
  syncTabTitles: () => void;
}

export const useTabStore = create<TabStoreState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  closedTabs: [],
  tabOrder: [],

  openTab: async (sessionPath, providerName, activate = true, cwd) => {
    ensureSettingsSubscribed();
    const { tabs } = get();
    // 检测是否已存在相同 sessionPath 的标签页
    const existing = tabs.find((t) => t.sessionPath === sessionPath);
    if (existing) {
      if (activate) {
        get().activateTab(existing.id);
      }
      return existing.id;
    }

    const id = generateTabId();
    // 从用户设置中读取默认过滤器
    const userDefaultFilter =
      useSettingsStore.getState().settings.defaultFilter;
    const newTab: TabState = {
      id,
      sessionPath,
      providerName,
      sessionDetail: null,
      isLoading: true,
      error: null,
      filter: { ...userDefaultFilter },
      showFindBar: false,
      searchHighlight: undefined,
      scrollTop: 0,
      expandedThinking: [],
      expandedToolCalls: [],
      expandedToolResults: [],
      title: "加载中...",
      pinned: false,
      workingDir: cwd,
    };

    set((s) => ({
      tabs: [...s.tabs, newTab],
      activeTabId: activate ? id : s.activeTabId,
      tabOrder: [id, ...s.tabOrder.filter((tid) => tid !== id)],
    }));

    // 异步加载会话内容
    try {
      const detail = await tauri.getConversation(
        sessionPath,
        FULL_FILTER,
        providerName,
      );
      const title = buildTabTitle(detail, getUseLast());
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === id
            ? {
                ...t,
                sessionDetail: { ...detail, providerName },
                title,
                isLoading: false,
                error: null,
              }
            : t,
        ),
      }));
      triggerSaveTabState();
    } catch (err) {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === id ? { ...t, isLoading: false, error: String(err) } : t,
        ),
      }));
    }

    return id;
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId } = get();
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;

    // 存入关闭历史
    const snapshot: TabSnapshot = {
      sessionPath: tab.sessionPath,
      providerName: tab.providerName,
      pinned: tab.pinned,
      workingDir: tab.workingDir,
      title: tab.title,
    };

    const remainingTabs = tabs.filter((t) => t.id !== tabId);
    let nextActiveId = activeTabId;

    // 如果关闭的是当前激活标签页，选择新的激活标签页
    if (activeTabId === tabId) {
      if (remainingTabs.length === 0) {
        nextActiveId = null;
      } else {
        const closedIndex = tabs.findIndex((t) => t.id === tabId);
        // 优先右侧，其次左侧
        if (closedIndex < remainingTabs.length) {
          nextActiveId = remainingTabs[closedIndex].id;
        } else {
          nextActiveId = remainingTabs[remainingTabs.length - 1].id;
        }
      }
    }

    set((s) => ({
      tabs: remainingTabs,
      activeTabId: nextActiveId,
      closedTabs: [snapshot, ...s.closedTabs].slice(0, 20),
      tabOrder: s.tabOrder.filter((tid) => tid !== tabId),
    }));
    triggerSaveTabState();
  },

  activateTab: (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    set((s) => ({
      activeTabId: tabId,
      // 将该 tab 移到 tabOrder 最前面
      tabOrder: [tabId, ...s.tabOrder.filter((tid) => tid !== tabId)],
    }));
    // 延迟加载占位标签页的会话内容
    if (tab && tab.sessionDetail === null && !tab.isLoading) {
      get().loadTabContent(tabId);
    }
    triggerSaveTabState();
  },

  closeOtherTabs: (tabId) => {
    const { tabs } = get();
    const pinService = getPinService();
    const { kept, closed } = pinService.applyClosePolicy(
      tabs,
      new CloseOthersPolicy(tabId),
    );
    const snapshots: TabSnapshot[] = closed.map((t) => ({
      sessionPath: t.sessionPath,
      providerName: t.providerName,
      pinned: t.pinned,
      workingDir: t.workingDir,
      title: t.title,
    }));
    set((s) => ({
      tabs: kept,
      activeTabId: tabId,
      closedTabs: [...snapshots, ...s.closedTabs].slice(0, 20),
      tabOrder: s.tabOrder.filter((tid) => kept.some((t) => t.id === tid)),
    }));
    triggerSaveTabState();
  },

  closeTabsToRight: (tabId) => {
    const { tabs, activeTabId } = get();
    const pinService = getPinService();
    const { kept, closed } = pinService.applyClosePolicy(
      tabs,
      new CloseToRightPolicy(tabId),
    );
    const snapshots: TabSnapshot[] = closed.map((t) => ({
      sessionPath: t.sessionPath,
      providerName: t.providerName,
      pinned: t.pinned,
      workingDir: t.workingDir,
      title: t.title,
    }));
    // 如果当前激活的标签被关闭，切换到保留列表中的第一个
    let nextActiveId = activeTabId;
    if (activeTabId && !kept.some((t) => t.id === activeTabId)) {
      nextActiveId = kept.length > 0 ? kept[0].id : null;
    }
    set((s) => ({
      tabs: kept,
      activeTabId: nextActiveId,
      closedTabs: [...snapshots, ...s.closedTabs].slice(0, 20),
      tabOrder: s.tabOrder.filter((tid) => kept.some((t) => t.id === tid)),
    }));
    triggerSaveTabState();
  },

  closeAllTabs: () => {
    const { tabs, closedTabs } = get();
    const pinService = getPinService();
    const { kept, closed } = pinService.applyClosePolicy(
      tabs,
      new CloseAllPolicy(),
    );
    const snapshots: TabSnapshot[] = closed.map((t) => ({
      sessionPath: t.sessionPath,
      providerName: t.providerName,
      pinned: t.pinned,
      workingDir: t.workingDir,
      title: t.title,
    }));
    set({
      tabs: kept,
      activeTabId: kept.length > 0 ? kept[0].id : null,
      closedTabs: [...snapshots, ...closedTabs].slice(0, 20),
      tabOrder: kept.map((t) => t.id),
    });
    triggerSaveTabState();
  },

  reopenClosedTab: async () => {
    const { closedTabs } = get();
    if (closedTabs.length === 0) return null;
    const [snapshot, ...rest] = closedTabs;
    set({ closedTabs: rest });
    const tabId = await get().openTab(
      snapshot.sessionPath,
      snapshot.providerName,
      true,
      snapshot.workingDir,
    );
    if (snapshot.pinned) {
      const { tabs } = get();
      const pinService = getPinService();
      if (pinService.canPin(pinService.countPinned(tabs))) {
        // 先标记 pinned，再重排
        const marked = tabs.map((t) =>
          t.id === tabId ? { ...t, pinned: true } : t,
        );
        const reordered = pinService.reorderOnPin(marked, tabId);
        set({
          tabs: reordered,
          tabOrder: reordered.map((t) => t.id),
        });
      }
    }
    return tabId;
  },

  togglePinTab: (tabId) => {
    const { tabs } = get();
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;

    const pinService = getPinService();

    if (!tab.pinned) {
      // 尝试钉住 — 检查是否达到上限
      const pinnedCount = pinService.countPinned(tabs);
      if (!pinService.canPin(pinnedCount)) {
        useToastStore
          .getState()
          .showToast(
            `已达最大钉住数 (${pinService.getMaxPinned()})，请在设置中调整`,
          );
        return;
      }
    }

    // 先切换 pinned 状态
    const toggled = tabs.map((t) =>
      t.id === tabId ? { ...t, pinned: !t.pinned } : t,
    );

    // 再重排位置
    const reordered = tab.pinned
      ? pinService.reorderOnUnpin(toggled, tabId) // 取消钉住
      : pinService.reorderOnPin(toggled, tabId); // 钉住

    set({
      tabs: reordered,
      tabOrder: reordered.map((t) => t.id),
    });
    triggerSaveTabState();
  },

  moveTab: (fromIndex, toIndex) => {
    set((s) => {
      const tabs = [...s.tabs];
      const [moved] = tabs.splice(fromIndex, 1);
      tabs.splice(toIndex, 0, moved);
      return { tabs };
    });
    triggerSaveTabState();
  },

  updateTabFilter: (tabId, filter) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, filter: { ...t.filter, ...filter } } : t,
      ),
    }));
  },

  updateTabFindBar: (tabId, show) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, showFindBar: show } : t,
      ),
    }));
  },

  updateTabScrollTop: (tabId, scrollTop) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, scrollTop } : t)),
    }));
  },

  updateTabExpanded: (tabId, type, uuids) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        switch (type) {
          case "thinking":
            return { ...t, expandedThinking: uuids };
          case "toolCall":
            return { ...t, expandedToolCalls: uuids };
          case "toolResult":
            return { ...t, expandedToolResults: uuids };
          default:
            return t;
        }
      }),
    }));
  },

  updateTabSearchHighlight: (tabId, highlight) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, searchHighlight: highlight } : t,
      ),
    }));
  },

  refreshTab: async (tabId) => {
    const { tabs } = get();
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;

    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, isLoading: true, error: null } : t,
      ),
    }));

    try {
      const detail = await tauri.getConversation(
        tab.sessionPath,
        FULL_FILTER,
        tab.providerName,
      );
      const title = buildTabTitle(detail, getUseLast());
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tabId
            ? {
                ...t,
                sessionDetail: { ...detail, providerName: tab.providerName },
                title,
                isLoading: false,
                error: null,
              }
            : t,
        ),
      }));
    } catch (err) {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tabId ? { ...t, isLoading: false, error: String(err) } : t,
        ),
      }));
    }
  },

  saveTabState: () => {
    triggerSaveTabState();
  },

  saveTabStateImmediate: () => {
    if (saveTabTimer) {
      clearTimeout(saveTabTimer);
      saveTabTimer = null;
    }
    persistTabState();
  },

  loadTabContent: async (tabId) => {
    const { tabs } = get();
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab || tab.sessionDetail !== null || tab.isLoading) return;

    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, isLoading: true, error: null } : t,
      ),
    }));

    try {
      const detail = await tauri.getConversation(
        tab.sessionPath,
        FULL_FILTER,
        tab.providerName,
      );
      const title = buildTabTitle(detail, getUseLast());
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tabId
            ? {
                ...t,
                sessionDetail: { ...detail, providerName: tab.providerName },
                title,
                isLoading: false,
                error: null,
              }
            : t,
        ),
      }));
    } catch (err) {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tabId ? { ...t, isLoading: false, error: String(err) } : t,
        ),
      }));
    }
  },

  restoreTabs: async () => {
    const { tabSnapshots } = useSettingsStore.getState().settings;
    if (!tabSnapshots || tabSnapshots.length === 0) return [];

    const userDefaultFilter =
      useSettingsStore.getState().settings.defaultFilter;

    // 分离钉住和普通标签页，保持各自相对顺序
    const pinnedSnaps = tabSnapshots.filter((s) => s.pinned);
    const regularSnaps = tabSnapshots.filter((s) => !s.pinned);

    // 先钉住，后普通
    const orderedSnaps = [...pinnedSnaps, ...regularSnaps];

    const tabIds: string[] = [];
    const newTabs: TabState[] = [];

    for (const snap of orderedSnaps) {
      const id = generateTabId();
      tabIds.push(id);
      newTabs.push({
        id,
        sessionPath: snap.sessionPath,
        providerName: snap.providerName,
        sessionDetail: null,
        isLoading: false, // 占位状态，不加载内容
        error: null,
        filter: { ...userDefaultFilter },
        showFindBar: false,
        searchHighlight: undefined,
        scrollTop: 0,
        expandedThinking: [],
        expandedToolCalls: [],
        expandedToolResults: [],
        title: snap.title || snap.sessionPath.split("/").pop() || "Untitled",
        pinned: snap.pinned,
        workingDir: snap.workingDir,
      });
    }

    // 映射活跃标签页索引（考虑重排后的顺序）
    const activeIndex =
      tabSnapshots.length > 0
        ? Math.min(
            useSettingsStore.getState().settings.activeTabIndex ?? 0,
            tabSnapshots.length - 1,
          )
        : 0;

    // 找到原始快照中 activeIndex 对应的 sessionPath
    const activeSnapshot = tabSnapshots[activeIndex];
    // 在重排后的 orderedSnaps 中找到对应的 tabId
    const activeTabId = activeSnapshot
      ? (() => {
          const idx = orderedSnaps.findIndex(
            (s) => s.sessionPath === activeSnapshot.sessionPath,
          );
          return idx >= 0 ? tabIds[idx] : tabIds[0];
        })()
      : tabIds[0];

    set({
      tabs: newTabs,
      activeTabId: activeTabId ?? null,
      closedTabs: [],
      tabOrder: activeTabId
        ? [activeTabId, ...tabIds.filter((tid) => tid !== activeTabId)]
        : tabIds,
    });

    // 仅加载活跃标签页的内容
    if (activeTabId) {
      get().loadTabContent(activeTabId);
    }

    return tabIds;
  },

  /** app 启动时调用一次，激活设置变更监听 */
  initSettingsSubscription: () => {
    ensureSettingsSubscribed();
  },

  /** 设置变更时同步所有标签页标题 */
  syncTabTitles: () => {
    ensureSettingsSubscribed();
    const { tabs } = get();
    const useLast = getUseLast();
    const updated = tabs.map((t) => {
      if (!t.sessionDetail) return t;
      const title = buildTabTitle(t.sessionDetail, useLast);
      if (title === t.title) return t;
      return { ...t, title };
    });
    set({ tabs: updated });
  },
}));

// 订阅设置变更：显示最后一条/第一条的切换（惰性注册，首次调用时激活）
let _settingsSubscribed = false;
let _prevDisplayFirst: boolean | undefined;
function ensureSettingsSubscribed() {
  if (_settingsSubscribed) return;
  _settingsSubscribed = true;
  _prevDisplayFirst =
    useSettingsStore.getState().settings.displayFirstUserMessage;
  useSettingsStore.subscribe((state) => {
    const current = state.settings.displayFirstUserMessage;
    if (current !== _prevDisplayFirst) {
      _prevDisplayFirst = current;
      useTabStore.getState().syncTabTitles();
    }
  });
}
