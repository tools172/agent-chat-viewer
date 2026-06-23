import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTabStore } from '../../stores/tabStore';

// Mock tauri utils
const mockedGetConversation = vi.fn();
const mockedSaveSettings = vi.fn();

vi.mock('../../utils/tauri', () => ({
  getConversation: (...args: unknown[]) => mockedGetConversation(...args),
  saveSettings: (...args: unknown[]) => mockedSaveSettings(...args),
}));

// Mock settingsStore — openTab reads defaultFilter from it
const mockDefaultFilter = {
  showThinking: false,
  showToolCalls: true,
  showToolResults: true,
  hideEmptyToolResults: true,
  showSystemMessages: false,
  showFileSnapshots: false,
};

let mockSettingsState = {
  settings: {
    defaultFilter: mockDefaultFilter,
    watchDirectories: [],
    providerEnabled: {},
    searchColors: { search: '#fef08a', find: '#fed7aa' },
    maxPinnedTabs: 4,
    restoreTabsOnStartup: true,
    tabSnapshots: [] as import('../../types').TabSnapshot[],
    activeTabIndex: 0,
  },
};

vi.mock('../../stores/settingsStore', () => ({
  useSettingsStore: {
    getState: vi.fn(() => mockSettingsState),
    setState: vi.fn((partial: Partial<typeof mockSettingsState>) => {
      Object.assign(mockSettingsState, partial);
    }),
  },
}));

// Mock toastStore
const mockShowToast = vi.fn();
vi.mock('../../stores/toastStore', () => ({
  useToastStore: {
    getState: vi.fn(() => ({
      showToast: mockShowToast,
    })),
  },
}));

const mockSessionDetail = {
  id: 'session-1',
  filePath: '/test/session.jsonl',
  display: 'Hello world',
  events: [
    {
      uuid: 'evt-1',
      parentUuid: null,
      eventType: 'user' as const,
      timestamp: '2026-06-01T10:00:00Z',
      content: [{ blockType: 'text' as const, text: 'Hello world' }],
    },
    {
      uuid: 'evt-2',
      parentUuid: 'evt-1',
      eventType: 'assistant' as const,
      timestamp: '2026-06-01T10:00:01Z',
      content: [{ blockType: 'text' as const, text: 'Hi there!' }],
    },
  ],
};

describe('tabStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetConversation.mockResolvedValue(mockSessionDetail);
    mockedSaveSettings.mockResolvedValue(undefined);
    mockSettingsState = {
      settings: {
        defaultFilter: mockDefaultFilter,
        watchDirectories: [],
        providerEnabled: {},
        searchColors: { search: '#fef08a', find: '#fed7aa' },
        maxPinnedTabs: 4,
        restoreTabsOnStartup: true,
        tabSnapshots: [],
        activeTabIndex: 0,
      },
    };
    useTabStore.setState({
      tabs: [],
      activeTabId: null,
      closedTabs: [],
      tabOrder: [],
    });
  });

  // ============================================================
  // 初始状态
  // ============================================================

  it('初始状态为空', () => {
    const state = useTabStore.getState();
    expect(state.tabs).toEqual([]);
    expect(state.activeTabId).toBeNull();
    expect(state.closedTabs).toEqual([]);
    expect(state.tabOrder).toEqual([]);
  });

  // ============================================================
  // openTab
  // ============================================================

  it('openTab 创建新标签页并激活', async () => {
    const tabId = await useTabStore
      .getState()
      .openTab('/test/session.jsonl', 'claude_code');

    const state = useTabStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).toBe(tabId);
    expect(state.tabOrder[0]).toBe(tabId);
    expect(state.tabs[0].sessionPath).toBe('/test/session.jsonl');
    expect(state.tabs[0].providerName).toBe('claude_code');
    expect(state.tabs[0].isLoading).toBe(false);
    expect(state.tabs[0].title).toBe('Hello world');
    expect(mockedGetConversation).toHaveBeenCalledTimes(1);
  });

  it('openTab 加载完成填充 sessionDetail', async () => {
    const tabId = await useTabStore
      .getState()
      .openTab('/test/session.jsonl', 'claude_code');

    const tab = useTabStore.getState().tabs.find((t) => t.id === tabId);
    expect(tab?.sessionDetail).not.toBeNull();
    expect(tab?.sessionDetail?.events).toHaveLength(2);
    expect(tab?.title).toBe('Hello world');
  });

  it('openTab 不带 user 消息时标题为 Untitled', async () => {
    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      display: '(Empty session)',
      events: [
        {
          uuid: 'evt-1',
          parentUuid: null,
          eventType: 'assistant' as const,
          timestamp: '2026-06-01T10:00:00Z',
          content: [{ blockType: 'text' as const, text: 'Hi' }],
        },
      ],
    });

    const tabId = await useTabStore
      .getState()
      .openTab('/test/session.jsonl', 'claude_code');

    const tab = useTabStore.getState().tabs.find((t) => t.id === tabId);
    expect(tab?.title).toBe('Untitled');
  });

  it('openTab 相同 sessionPath 不创建重复标签', async () => {
    const tabId1 = await useTabStore
      .getState()
      .openTab('/test/session.jsonl', 'claude_code');

    // 创建第二个不同路径的标签
    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session2.jsonl',
    });
    await useTabStore
      .getState()
      .openTab('/test/session2.jsonl', 'claude_code');

    // 再次打开 session1 → 应激活已有标签而非新建
    const tabId3 = await useTabStore
      .getState()
      .openTab('/test/session.jsonl', 'claude_code');

    expect(tabId3).toBe(tabId1);
    expect(useTabStore.getState().tabs).toHaveLength(2);
    expect(useTabStore.getState().activeTabId).toBe(tabId1);
    expect(mockedGetConversation).toHaveBeenCalledTimes(2); // 只有两次新加载
  });

  it('openTab 加载失败设置 error', async () => {
    mockedGetConversation.mockRejectedValue('File not found');

    const tabId = await useTabStore
      .getState()
      .openTab('/test/session.jsonl', 'claude_code');

    const tab = useTabStore.getState().tabs.find((t) => t.id === tabId);
    expect(tab?.isLoading).toBe(false);
    expect(tab?.error).toBe('File not found');
    expect(tab?.sessionDetail).toBeNull();
  });

  it('openTab(activate=false) 在后台打开不切换', async () => {
    // 先打开一个标签
    const tabId1 = await useTabStore
      .getState()
      .openTab('/test/session1.jsonl', 'claude_code', true);

    // 后台打开 session2
    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session2.jsonl',
    });
    const tabId2 = await useTabStore
      .getState()
      .openTab('/test/session2.jsonl', 'claude_code', false);

    // 前台仍然是 tab1
    expect(useTabStore.getState().tabs).toHaveLength(2);
    expect(useTabStore.getState().activeTabId).toBe(tabId1);
    // tab2 进入 tabOrder 但不激活
    expect(useTabStore.getState().tabOrder[0]).toBe(tabId2);
  });

  it('openTab(activate=false) 对已存在的标签页不激活', async () => {
    const tabId1 = await useTabStore
      .getState()
      .openTab('/test/session1.jsonl', 'claude_code', true);

    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session2.jsonl',
    });
    await useTabStore
      .getState()
      .openTab('/test/session2.jsonl', 'claude_code', true);

    // 后台打开 session1（已存在）
    const resultId = await useTabStore
      .getState()
      .openTab('/test/session1.jsonl', 'claude_code', false);

    expect(resultId).toBe(tabId1);
    // activeTabId 仍然指向 session2
    expect(useTabStore.getState().activeTabId).not.toBe(tabId1);
  });

  // ============================================================
  // closeTab
  // ============================================================

  it('closeTab 移除标签页并入关闭历史', async () => {
    const tabId = await useTabStore
      .getState()
      .openTab('/test/session.jsonl', 'claude_code');

    useTabStore.getState().closeTab(tabId);

    const state = useTabStore.getState();
    expect(state.tabs).toHaveLength(0);
    expect(state.activeTabId).toBeNull();
    expect(state.closedTabs).toHaveLength(1);
    expect(state.closedTabs[0].sessionPath).toBe('/test/session.jsonl');
  });

  it('closeTab 关闭当前标签后激活右侧相邻标签', async () => {
    const tabId1 = await useTabStore
      .getState()
      .openTab('/test/session1.jsonl', 'claude_code');

    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session2.jsonl',
    });
    const tabId2 = await useTabStore
      .getState()
      .openTab('/test/session2.jsonl', 'claude_code');

    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session3.jsonl',
    });
    await useTabStore
      .getState()
      .openTab('/test/session3.jsonl', 'claude_code');

    // 激活 tab1，然后关闭它 → 右侧 tab2 应激活
    useTabStore.getState().activateTab(tabId1);
    useTabStore.getState().closeTab(tabId1);

    expect(useTabStore.getState().activeTabId).toBe(tabId2);
    expect(useTabStore.getState().tabs).toHaveLength(2);
  });

  it('closeTab 关闭最后一个标签时激活左侧相邻标签', async () => {
    await useTabStore
      .getState()
      .openTab('/test/session1.jsonl', 'claude_code');

    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session2.jsonl',
    });
    const tabId2 = await useTabStore
      .getState()
      .openTab('/test/session2.jsonl', 'claude_code');

    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session3.jsonl',
    });
    const tabId3 = await useTabStore
      .getState()
      .openTab('/test/session3.jsonl', 'claude_code');

    // tabs: [tab1, tab2, tab3], 关闭 tab3 (index 2)
    // remaining: [tab1, tab2] (length 2)
    // closedIndex(2) >= remaining.length(2) → pick remaining[1] = tab2
    useTabStore.getState().closeTab(tabId3);

    expect(useTabStore.getState().activeTabId).toBe(tabId2);
    expect(useTabStore.getState().tabs).toHaveLength(2);
  });

  it('关闭的标签不在 tabOrder 中', async () => {
    const tabId = await useTabStore
      .getState()
      .openTab('/test/session.jsonl', 'claude_code');

    useTabStore.getState().closeTab(tabId);

    expect(useTabStore.getState().tabOrder).not.toContain(tabId);
  });

  it('关闭历史最多保留 20 条', async () => {
    // 打开并关闭 25 个标签
    for (let i = 0; i < 25; i++) {
      mockedGetConversation.mockResolvedValue({
        ...mockSessionDetail,
        filePath: `/test/session${i}.jsonl`,
      });
      const tabId = await useTabStore
        .getState()
        .openTab(`/test/session${i}.jsonl`, 'claude_code');
      useTabStore.getState().closeTab(tabId);
    }

    expect(useTabStore.getState().closedTabs.length).toBeLessThanOrEqual(20);
  });

  // ============================================================
  // activateTab
  // ============================================================

  it('activateTab 更新 activeTabId 和 tabOrder', async () => {
    const tabId1 = await useTabStore
      .getState()
      .openTab('/test/session1.jsonl', 'claude_code');

    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session2.jsonl',
    });
    await useTabStore
      .getState()
      .openTab('/test/session2.jsonl', 'claude_code');

    // tab2 当前激活，切换到 tab1
    useTabStore.getState().activateTab(tabId1);

    expect(useTabStore.getState().activeTabId).toBe(tabId1);
    // tab1 移到 tabOrder 最前面
    expect(useTabStore.getState().tabOrder[0]).toBe(tabId1);
  });

  // ============================================================
  // closeOtherTabs / closeTabsToRight / closeAllTabs
  // ============================================================

  it('closeOtherTabs 只保留指定标签', async () => {
    const tabId1 = await useTabStore
      .getState()
      .openTab('/test/session1.jsonl', 'claude_code');

    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session2.jsonl',
    });
    await useTabStore
      .getState()
      .openTab('/test/session2.jsonl', 'claude_code');

    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session3.jsonl',
    });
    await useTabStore
      .getState()
      .openTab('/test/session3.jsonl', 'claude_code');

    useTabStore.getState().closeOtherTabs(tabId1);

    expect(useTabStore.getState().tabs).toHaveLength(1);
    expect(useTabStore.getState().tabs[0].id).toBe(tabId1);
    expect(useTabStore.getState().activeTabId).toBe(tabId1);
    expect(useTabStore.getState().closedTabs).toHaveLength(2);
  });

  it('closeTabsToRight 关闭右侧所有标签', async () => {
    const tabId1 = await useTabStore
      .getState()
      .openTab('/test/session1.jsonl', 'claude_code');

    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session2.jsonl',
    });
    const tabId2 = await useTabStore
      .getState()
      .openTab('/test/session2.jsonl', 'claude_code');

    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session3.jsonl',
    });
    const tabId3 = await useTabStore
      .getState()
      .openTab('/test/session3.jsonl', 'claude_code');

    // tabs: [1, 2, 3], 关闭 tab1 右侧 → 关闭 2 和 3
    useTabStore.getState().closeTabsToRight(tabId1);

    const state = useTabStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].id).toBe(tabId1);
    expect(state.activeTabId).toBe(tabId1);
    // tab2 和 tab3 应从 tabOrder 移除
    expect(state.tabOrder).not.toContain(tabId2);
    expect(state.tabOrder).not.toContain(tabId3);
  });

  it('closeTabsToRight 在最后一个标签时无操作', async () => {
    await useTabStore
      .getState()
      .openTab('/test/session1.jsonl', 'claude_code');

    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session2.jsonl',
    });
    const tabId2 = await useTabStore
      .getState()
      .openTab('/test/session2.jsonl', 'claude_code');

    // 关闭 tab2 右侧 → 无操作
    useTabStore.getState().closeTabsToRight(tabId2);

    expect(useTabStore.getState().tabs).toHaveLength(2);
  });

  it('closeAllTabs 关闭全部标签', async () => {
    await useTabStore
      .getState()
      .openTab('/test/session1.jsonl', 'claude_code');

    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session2.jsonl',
    });
    await useTabStore
      .getState()
      .openTab('/test/session2.jsonl', 'claude_code');

    useTabStore.getState().closeAllTabs();

    expect(useTabStore.getState().tabs).toHaveLength(0);
    expect(useTabStore.getState().activeTabId).toBeNull();
    expect(useTabStore.getState().tabOrder).toHaveLength(0);
    expect(useTabStore.getState().closedTabs).toHaveLength(2);
  });

  // ============================================================
  // reopenClosedTab
  // ============================================================

  it('reopenClosedTab 恢复最近关闭的标签', async () => {
    const tabId = await useTabStore
      .getState()
      .openTab('/test/session.jsonl', 'claude_code');

    useTabStore.getState().closeTab(tabId);

    const restoredId = await useTabStore.getState().reopenClosedTab();

    expect(restoredId).not.toBeNull();
    expect(useTabStore.getState().tabs).toHaveLength(1);
    expect(useTabStore.getState().tabs[0].sessionPath).toBe(
      '/test/session.jsonl'
    );
    expect(useTabStore.getState().closedTabs).toHaveLength(0);
  });

  it('reopenClosedTab 恢复 pinned 标签保持 pinned 状态', async () => {
    const tabId = await useTabStore
      .getState()
      .openTab('/test/session.jsonl', 'claude_code');

    useTabStore.getState().togglePinTab(tabId);
    useTabStore.getState().closeTab(tabId);

    const restoredId = await useTabStore.getState().reopenClosedTab();

    const tab = useTabStore.getState().tabs.find((t) => t.id === restoredId);
    expect(tab?.pinned).toBe(true);
  });

  it('reopenClosedTab 无历史时返回 null', async () => {
    const result = await useTabStore.getState().reopenClosedTab();
    expect(result).toBeNull();
  });

  // ============================================================
  // togglePinTab
  // ============================================================

  it('togglePinTab 切换 pin 状态', async () => {
    const tabId = await useTabStore
      .getState()
      .openTab('/test/session.jsonl', 'claude_code');

    expect(useTabStore.getState().tabs[0].pinned).toBe(false);

    useTabStore.getState().togglePinTab(tabId);
    expect(useTabStore.getState().tabs[0].pinned).toBe(true);

    useTabStore.getState().togglePinTab(tabId);
    expect(useTabStore.getState().tabs[0].pinned).toBe(false);
  });

  // ============================================================
  // moveTab
  // ============================================================

  it('moveTab 移动标签页位置', async () => {
    const tabId1 = await useTabStore
      .getState()
      .openTab('/test/session1.jsonl', 'claude_code');

    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session2.jsonl',
    });
    const tabId2 = await useTabStore
      .getState()
      .openTab('/test/session2.jsonl', 'claude_code');

    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session3.jsonl',
    });
    const tabId3 = await useTabStore
      .getState()
      .openTab('/test/session3.jsonl', 'claude_code');

    // tabs: [1, 2, 3], 将 tab3(index 2) 移到 index 0
    useTabStore.getState().moveTab(2, 0);

    const ids = useTabStore.getState().tabs.map((t) => t.id);
    expect(ids).toEqual([tabId3, tabId1, tabId2]);
  });

  // ============================================================
  // updateTabFilter
  // ============================================================

  it('updateTabFilter 更新指定标签的过滤器', async () => {
    const tabId = await useTabStore
      .getState()
      .openTab('/test/session.jsonl', 'claude_code');

    useTabStore.getState().updateTabFilter(tabId, { showThinking: true });

    const tab = useTabStore.getState().tabs.find((t) => t.id === tabId);
    expect(tab?.filter.showThinking).toBe(true);
    // 其他 filter 字段不变
    expect(tab?.filter.showToolCalls).toBe(true);
  });

  // ============================================================
  // updateTabFindBar
  // ============================================================

  it('updateTabFindBar 切换查找栏状态', async () => {
    const tabId = await useTabStore
      .getState()
      .openTab('/test/session.jsonl', 'claude_code');

    useTabStore.getState().updateTabFindBar(tabId, true);
    expect(
      useTabStore.getState().tabs.find((t) => t.id === tabId)?.showFindBar
    ).toBe(true);
  });

  // ============================================================
  // updateTabExpanded
  // ============================================================

  it('updateTabExpanded 更新展开状态', async () => {
    const tabId = await useTabStore
      .getState()
      .openTab('/test/session.jsonl', 'claude_code');

    useTabStore
      .getState()
      .updateTabExpanded(tabId, 'thinking', ['key-1', 'key-2']);

    const tab = useTabStore.getState().tabs.find((t) => t.id === tabId);
    expect(tab?.expandedThinking).toEqual(['key-1', 'key-2']);
  });

  // ============================================================
  // updateTabSearchHighlight
  // ============================================================

  it('updateTabSearchHighlight 更新搜索高亮词', async () => {
    const tabId = await useTabStore
      .getState()
      .openTab('/test/session.jsonl', 'claude_code');

    useTabStore.getState().updateTabSearchHighlight(tabId, 'search term');

    const tab = useTabStore.getState().tabs.find((t) => t.id === tabId);
    expect(tab?.searchHighlight).toBe('search term');
  });

  // ============================================================
  // refreshTab
  // ============================================================

  it('refreshTab 重新加载会话内容', async () => {
    const tabId = await useTabStore
      .getState()
      .openTab('/test/session.jsonl', 'claude_code');

    mockedGetConversation.mockClear();
    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      display: 'Updated content',
      events: [
        {
          uuid: 'evt-new',
          parentUuid: null,
          eventType: 'user' as const,
          timestamp: '2026-06-02T10:00:00Z',
          content: [{ blockType: 'text' as const, text: 'Updated content' }],
        },
      ],
    });

    await useTabStore.getState().refreshTab(tabId);

    const tab = useTabStore.getState().tabs.find((t) => t.id === tabId);
    expect(mockedGetConversation).toHaveBeenCalledTimes(1);
    expect(tab?.title).toBe('Updated content');
    expect(tab?.isLoading).toBe(false);
  });

  it('refreshTab 加载失败设置 error', async () => {
    const tabId = await useTabStore
      .getState()
      .openTab('/test/session.jsonl', 'claude_code');

    mockedGetConversation.mockRejectedValue('Network error');

    await useTabStore.getState().refreshTab(tabId);

    const tab = useTabStore.getState().tabs.find((t) => t.id === tabId);
    expect(tab?.error).toBe('Network error');
    expect(tab?.isLoading).toBe(false);
  });

  it('refreshTab 不存在的标签无操作', async () => {
    await expect(
      useTabStore.getState().refreshTab('non-existent-id')
    ).resolves.toBeUndefined();
    expect(mockedGetConversation).not.toHaveBeenCalled();
  });

  // ============================================================
  // updateTabScrollTop
  // ============================================================

  it('updateTabScrollTop 更新滚动位置', async () => {
    const tabId = await useTabStore
      .getState()
      .openTab('/test/session.jsonl', 'claude_code');

    useTabStore.getState().updateTabScrollTop(tabId, 500);

    const tab = useTabStore.getState().tabs.find((t) => t.id === tabId);
    expect(tab?.scrollTop).toBe(500);
  });

  // ============================================================
  // 钉住行为 (Pinned behavior)
  // ============================================================

  it('closeOtherTabs 保留钉住标签', async () => {
    const tabId1 = await useTabStore
      .getState()
      .openTab('/test/session1.jsonl', 'claude_code');

    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session2.jsonl',
    });
    const tabId2 = await useTabStore
      .getState()
      .openTab('/test/session2.jsonl', 'claude_code');

    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session3.jsonl',
    });
    await useTabStore
      .getState()
      .openTab('/test/session3.jsonl', 'claude_code');

    // 钉住 tab2
    useTabStore.getState().togglePinTab(tabId2);

    // closeOtherTabs(tabId1) → 保留 tab1 + pinned(tab2)，关闭 tab3
    useTabStore.getState().closeOtherTabs(tabId1);

    const state = useTabStore.getState();
    expect(state.tabs).toHaveLength(2);
    expect(state.tabs.map((t) => t.id)).toContain(tabId1);
    expect(state.tabs.map((t) => t.id)).toContain(tabId2);
    expect(state.closedTabs).toHaveLength(1);
    expect(state.closedTabs[0].sessionPath).toBe('/test/session3.jsonl');
  });

  it('closeTabsToRight 保留右侧的钉住标签', async () => {
    const tabId1 = await useTabStore
      .getState()
      .openTab('/test/session1.jsonl', 'claude_code');

    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session2.jsonl',
    });
    await useTabStore
      .getState()
      .openTab('/test/session2.jsonl', 'claude_code');

    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session3.jsonl',
    });
    const tabId3 = await useTabStore
      .getState()
      .openTab('/test/session3.jsonl', 'claude_code');

    // tabs: [pinned:tab1, tab2, tab3]
    // 钉住 tab3（移到钉住区）
    useTabStore.getState().togglePinTab(tabId1);
    useTabStore.getState().togglePinTab(tabId3);
    // tabs: [pinned:tab1, pinned:tab3, tab2]

    // 以 tab1 为锚点关闭右侧 → tab2 被关闭，tab3(pinned) 保留
    useTabStore.getState().closeTabsToRight(tabId1);

    const state = useTabStore.getState();
    const ids = state.tabs.map((t) => t.id);
    expect(ids).toContain(tabId1);
    expect(ids).toContain(tabId3);
    expect(ids).not.toContain(
      state.tabs.find((t) => t.sessionPath === '/test/session2.jsonl')?.id,
    );
  });

  it('closeAllTabs 保留钉住标签', async () => {
    const tabId1 = await useTabStore
      .getState()
      .openTab('/test/session1.jsonl', 'claude_code');

    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session2.jsonl',
    });
    await useTabStore
      .getState()
      .openTab('/test/session2.jsonl', 'claude_code');

    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session3.jsonl',
    });
    await useTabStore
      .getState()
      .openTab('/test/session3.jsonl', 'claude_code');

    // 钉住 tab1 和 tab2
    useTabStore.getState().togglePinTab(tabId1);

    const tabId2 = useTabStore
      .getState()
      .tabs.find((t) => t.sessionPath === '/test/session2.jsonl')!.id;
    useTabStore.getState().togglePinTab(tabId2);

    // closeAll → 只关闭未钉住的 tab3
    useTabStore.getState().closeAllTabs();

    const state = useTabStore.getState();
    expect(state.tabs).toHaveLength(2);
    expect(state.tabs.every((t) => t.pinned)).toBe(true);
    expect(state.activeTabId).toBe(state.tabs[0].id);
    expect(state.closedTabs).toHaveLength(1);
  });

  it('togglePinTab 钉住后标签移到钉住区（最前面）', async () => {
    const tabId1 = await useTabStore
      .getState()
      .openTab('/test/session1.jsonl', 'claude_code');

    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session2.jsonl',
    });
    const tabId2 = await useTabStore
      .getState()
      .openTab('/test/session2.jsonl', 'claude_code');

    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session3.jsonl',
    });
    const tabId3 = await useTabStore
      .getState()
      .openTab('/test/session3.jsonl', 'claude_code');

    // tabs: [1, 2, 3] → pin tab3 → [pinned:3, 1, 2]
    useTabStore.getState().togglePinTab(tabId3);

    const ids = useTabStore.getState().tabs.map((t) => t.id);
    expect(ids[0]).toBe(tabId3);
    expect(useTabStore.getState().tabs[0].pinned).toBe(true);

    // pin tab2 → [pinned:3, pinned:2, 1]
    useTabStore.getState().togglePinTab(tabId2);

    const ids2 = useTabStore.getState().tabs.map((t) => t.id);
    expect(ids2[0]).toBe(tabId3);
    expect(ids2[1]).toBe(tabId2);
    expect(ids2[2]).toBe(tabId1);
  });

  it('togglePinTab 取消钉住后标签移到普通区起始', async () => {
    const tabId1 = await useTabStore
      .getState()
      .openTab('/test/session1.jsonl', 'claude_code');

    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session2.jsonl',
    });
    const tabId2 = await useTabStore
      .getState()
      .openTab('/test/session2.jsonl', 'claude_code');

    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session3.jsonl',
    });
    const tabId3 = await useTabStore
      .getState()
      .openTab('/test/session3.jsonl', 'claude_code');

    // pin tab1 和 tab3 → [pinned:1, pinned:3, tab2]
    useTabStore.getState().togglePinTab(tabId1);
    useTabStore.getState().togglePinTab(tabId3);

    // unpin tab3 → [pinned:1, tab3, tab2]
    useTabStore.getState().togglePinTab(tabId3);

    const ids = useTabStore.getState().tabs.map((t) => t.id);
    expect(ids[0]).toBe(tabId1); // pinned
    expect(ids[1]).toBe(tabId3); // unpinned, at regular section start
    expect(ids[2]).toBe(tabId2); // regular
    expect(useTabStore.getState().tabs.find((t) => t.id === tabId3)?.pinned).toBe(false);
  });

  it('togglePinTab 超过上限时拒绝并显示 toast', async () => {
    // 打开并钉住 4 个标签（maxPinnedTabs=4）
    for (let i = 0; i < 4; i++) {
      mockedGetConversation.mockResolvedValue({
        ...mockSessionDetail,
        filePath: `/test/pinned${i}.jsonl`,
      });
      const id = await useTabStore
        .getState()
        .openTab(`/test/pinned${i}.jsonl`, 'claude_code');
      useTabStore.getState().togglePinTab(id);
    }
    expect(useTabStore.getState().tabs.filter((t) => t.pinned)).toHaveLength(4);

    // 打开第 5 个标签
    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/extra.jsonl',
    });
    const extraId = await useTabStore
      .getState()
      .openTab('/test/extra.jsonl', 'claude_code');

    // 尝试钉住第 5 个 → 应该被拒绝
    mockShowToast.mockClear();
    useTabStore.getState().togglePinTab(extraId);

    const tab = useTabStore.getState().tabs.find((t) => t.id === extraId);
    expect(tab?.pinned).toBe(false); // 未钉住
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('已达最大钉住数'),
    );
  });

  it('openTab 新标签追加到末尾（钉住标签分区显示在最前）', async () => {
    // 打开并钉住 tab1
    const tabId1 = await useTabStore
      .getState()
      .openTab('/test/session1.jsonl', 'claude_code');
    useTabStore.getState().togglePinTab(tabId1);

    // 打开 tab2（普通标签）
    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session2.jsonl',
    });
    const tabId2 = await useTabStore
      .getState()
      .openTab('/test/session2.jsonl', 'claude_code');

    // 打开 tab3（普通标签）→ 应在 tab2 之后（末尾）
    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session3.jsonl',
    });
    const tabId3 = await useTabStore
      .getState()
      .openTab('/test/session3.jsonl', 'claude_code');

    const ids = useTabStore.getState().tabs.map((t) => t.id);
    // tab1(pinned) 在最前，tab2 和 tab3 按顺序在其后
    expect(ids[0]).toBe(tabId1);
    expect(ids[1]).toBe(tabId2);
    expect(ids[2]).toBe(tabId3);
  });

  // ============================================================
  // saveTabState / saveTabStateImmediate
  // ============================================================

  it('saveTabStateImmediate 将当前标签页序列化并保存到 settings', async () => {
    const tabId1 = await useTabStore
      .getState()
      .openTab('/test/session1.jsonl', 'claude_code', true, '/work/dir');

    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session2.jsonl',
    });
    await useTabStore
      .getState()
      .openTab('/test/session2.jsonl', 'codex');

    // 钉住第二个标签
    useTabStore.getState().togglePinTab(tabId1);

    mockedSaveSettings.mockClear();

    useTabStore.getState().saveTabStateImmediate();

    expect(mockedSaveSettings).toHaveBeenCalledTimes(1);
    const savedSettings = mockedSaveSettings.mock.calls[0][0];
    expect(savedSettings.tabSnapshots).toHaveLength(2);
    // 快照应按显示顺序
    expect(savedSettings.tabSnapshots[0].sessionPath).toBe('/test/session1.jsonl');
    expect(savedSettings.tabSnapshots[0].pinned).toBe(true);
    expect(savedSettings.tabSnapshots[0].workingDir).toBe('/work/dir');
    expect(savedSettings.tabSnapshots[0].title).toBe('Hello world');
    expect(savedSettings.tabSnapshots[1].sessionPath).toBe('/test/session2.jsonl');
    expect(savedSettings.tabSnapshots[1].providerName).toBe('codex');
    // activeTabIndex 指向当前活跃标签（tab2 是活跃的，在 tabs[1]）
    expect(savedSettings.activeTabIndex).toBe(1);
  });

  it('saveTabStateImmediate 无标签时保存空快照', () => {
    useTabStore.getState().saveTabStateImmediate();

    expect(mockedSaveSettings).toHaveBeenCalledTimes(1);
    const savedSettings = mockedSaveSettings.mock.calls[0][0];
    expect(savedSettings.tabSnapshots).toEqual([]);
    expect(savedSettings.activeTabIndex).toBe(0);
  });

  it('saveTabState 使用 debounce', async () => {
    vi.useFakeTimers();
    await useTabStore
      .getState()
      .openTab('/test/session1.jsonl', 'claude_code');

    mockedSaveSettings.mockClear();
    useTabStore.getState().saveTabState();

    // 不应立即保存
    expect(mockedSaveSettings).not.toHaveBeenCalled();

    // 300ms 后触发
    vi.advanceTimersByTime(300);
    expect(mockedSaveSettings).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('saveTabState 在 debounce 期间多次调用只保存最后一次', async () => {
    vi.useFakeTimers();
    await useTabStore
      .getState()
      .openTab('/test/session1.jsonl', 'claude_code');

    mockedSaveSettings.mockClear();

    // 模拟快速连续操作
    useTabStore.getState().saveTabState();
    useTabStore.getState().saveTabState();
    useTabStore.getState().saveTabState();

    vi.advanceTimersByTime(300);

    // 只保存一次
    expect(mockedSaveSettings).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  // ============================================================
  // loadTabContent（延迟加载）
  // ============================================================

  it('loadTabContent 加载占位标签页的会话内容', async () => {
    // 先创建占位标签页（模拟 restoreTabs 创建的骨架）
    const tabId = 'tab_test_1';
    useTabStore.setState({
      tabs: [
        {
          id: tabId,
          sessionPath: '/test/session.jsonl',
          providerName: 'claude_code',
          sessionDetail: null,
          isLoading: false,
          error: null,
          filter: { ...mockDefaultFilter },
          showFindBar: false,
          searchHighlight: undefined,
          scrollTop: 0,
          expandedThinking: [],
          expandedToolCalls: [],
          expandedToolResults: [],
          title: 'Placeholder title',
          pinned: false,
          workingDir: '/work/dir',
        },
      ],
      activeTabId: tabId,
    });

    await useTabStore.getState().loadTabContent(tabId);

    const tab = useTabStore.getState().tabs.find((t) => t.id === tabId);
    expect(tab?.sessionDetail).not.toBeNull();
    expect(tab?.sessionDetail?.events).toHaveLength(2);
    expect(tab?.title).toBe('Hello world'); // 加载后更新标题
    expect(tab?.isLoading).toBe(false);
    expect(mockedGetConversation).toHaveBeenCalledTimes(1);
  });

  it('loadTabContent 已加载的标签页不重复加载', async () => {
    const tabId = await useTabStore
      .getState()
      .openTab('/test/session.jsonl', 'claude_code');

    mockedGetConversation.mockClear();
    await useTabStore.getState().loadTabContent(tabId);

    // 已有 sessionDetail，不应调用
    expect(mockedGetConversation).not.toHaveBeenCalled();
  });

  it('loadTabContent 正在加载的标签页不重复加载', async () => {
    useTabStore.setState({
      tabs: [
        {
          id: 'loading_tab',
          sessionPath: '/test/session.jsonl',
          providerName: 'claude_code',
          sessionDetail: null,
          isLoading: true, // 正在加载中
          error: null,
          filter: { ...mockDefaultFilter },
          showFindBar: false,
          searchHighlight: undefined,
          scrollTop: 0,
          expandedThinking: [],
          expandedToolCalls: [],
          expandedToolResults: [],
          title: 'Loading...',
          pinned: false,
        },
      ],
    });

    mockedGetConversation.mockClear();
    await useTabStore.getState().loadTabContent('loading_tab');

    expect(mockedGetConversation).not.toHaveBeenCalled();
  });

  it('loadTabContent 加载失败设置 error', async () => {
    const tabId = 'error_tab';
    useTabStore.setState({
      tabs: [
        {
          id: tabId,
          sessionPath: '/test/missing.jsonl',
          providerName: 'claude_code',
          sessionDetail: null,
          isLoading: false,
          error: null,
          filter: { ...mockDefaultFilter },
          showFindBar: false,
          searchHighlight: undefined,
          scrollTop: 0,
          expandedThinking: [],
          expandedToolCalls: [],
          expandedToolResults: [],
          title: 'Should fail',
          pinned: false,
        },
      ],
    });

    mockedGetConversation.mockRejectedValue('File deleted');
    await useTabStore.getState().loadTabContent(tabId);

    const tab = useTabStore.getState().tabs.find((t) => t.id === tabId);
    expect(tab?.error).toBe('File deleted');
    expect(tab?.isLoading).toBe(false);
    expect(tab?.sessionDetail).toBeNull();
  });

  // ============================================================
  // restoreTabs
  // ============================================================

  it('restoreTabs 从快照恢复占位标签页', async () => {
    mockSettingsState.settings.tabSnapshots = [
      { sessionPath: '/test/session1.jsonl', providerName: 'claude_code', pinned: false, title: 'Tab One' },
      { sessionPath: '/test/session2.jsonl', providerName: 'codex', pinned: false, title: 'Tab Two' },
    ];
    mockSettingsState.settings.activeTabIndex = 0;

    mockedGetConversation.mockClear();
    const tabIds = await useTabStore.getState().restoreTabs();

    const state = useTabStore.getState();
    expect(state.tabs).toHaveLength(2);
    expect(tabIds).toHaveLength(2);

    // 占位标签页：第二个未加载内容（isLoading=false）
    expect(state.tabs[1].sessionDetail).toBeNull();
    expect(state.tabs[1].isLoading).toBe(false);
    expect(state.tabs[1].title).toBe('Tab Two');
    // 活跃标签页（第一个）：正在加载中
    expect(state.tabs[0].sessionDetail).toBeNull(); // 尚未完成加载
    expect(state.tabs[0].isLoading).toBe(true);     // 触发了 loadTabContent
    expect(state.tabs[0].title).toBe('Tab One');

    // 只有活跃标签页加载了内容
    expect(mockedGetConversation).toHaveBeenCalledTimes(1);
    expect(mockedGetConversation).toHaveBeenCalledWith(
      '/test/session1.jsonl',
      expect.anything(),
      'claude_code',
    );
  });

  it('restoreTabs 钉住标签排在最前面', async () => {
    mockSettingsState.settings.tabSnapshots = [
      { sessionPath: '/test/reg1.jsonl', providerName: 'claude_code', pinned: false, title: 'Reg1' },
      { sessionPath: '/test/pin1.jsonl', providerName: 'codex', pinned: true, title: 'Pin1' },
      { sessionPath: '/test/reg2.jsonl', providerName: 'claude_code', pinned: false, title: 'Reg2' },
      { sessionPath: '/test/pin2.jsonl', providerName: 'codex', pinned: true, title: 'Pin2' },
    ];
    mockSettingsState.settings.activeTabIndex = 0;

    const tabIds = await useTabStore.getState().restoreTabs();
    expect(tabIds).toHaveLength(4);

    const state = useTabStore.getState();
    // 钉住标签在前，保持各自相对顺序
    expect(state.tabs[0].title).toBe('Pin1');
    expect(state.tabs[0].pinned).toBe(true);
    expect(state.tabs[1].title).toBe('Pin2');
    expect(state.tabs[1].pinned).toBe(true);
    expect(state.tabs[2].title).toBe('Reg1');
    expect(state.tabs[2].pinned).toBe(false);
    expect(state.tabs[3].title).toBe('Reg2');
    expect(state.tabs[3].pinned).toBe(false);
  });

  it('restoreTabs 仅加载 activeTabIndex 指向的活跃标签页', async () => {
    mockSettingsState.settings.tabSnapshots = [
      { sessionPath: '/test/session1.jsonl', providerName: 'claude_code', pinned: false, title: 'A' },
      { sessionPath: '/test/session2.jsonl', providerName: 'claude_code', pinned: false, title: 'B' },
      { sessionPath: '/test/session3.jsonl', providerName: 'codex', pinned: false, title: 'C' },
    ];
    mockSettingsState.settings.activeTabIndex = 2; // 第三个是活跃的

    mockedGetConversation.mockClear();
    await useTabStore.getState().restoreTabs();

    const state = useTabStore.getState();
    // activeTabId 应指向第三个标签页（索引 2 = session3）
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
    expect(activeTab?.sessionPath).toBe('/test/session3.jsonl');

    // 只加载了活跃标签页
    expect(mockedGetConversation).toHaveBeenCalledTimes(1);
    expect(mockedGetConversation).toHaveBeenCalledWith(
      '/test/session3.jsonl',
      expect.anything(),
      'codex',
    );
  });

  it('restoreTabs 空快照返回空数组', async () => {
    mockSettingsState.settings.tabSnapshots = [];
    const tabIds = await useTabStore.getState().restoreTabs();

    expect(tabIds).toEqual([]);
    expect(useTabStore.getState().tabs).toHaveLength(0);
  });

  it('restoreTabs undefined 快照返回空数组', async () => {
    mockSettingsState.settings.tabSnapshots = undefined as unknown as [];
    const tabIds = await useTabStore.getState().restoreTabs();

    expect(tabIds).toEqual([]);
  });

  it('restoreTabs 保留 workingDir 信息', async () => {
    mockSettingsState.settings.tabSnapshots = [
      { sessionPath: '/test/session1.jsonl', providerName: 'claude_code', pinned: false, title: 'A', workingDir: '/custom/workdir' },
    ];
    mockSettingsState.settings.activeTabIndex = 0;

    await useTabStore.getState().restoreTabs();

    const tab = useTabStore.getState().tabs[0];
    expect(tab.workingDir).toBe('/custom/workdir');
  });

  it('restoreTabs title 为空时使用文件名兜底', async () => {
    mockSettingsState.settings.tabSnapshots = [
      { sessionPath: '/test/mytitle.jsonl', providerName: 'claude_code', pinned: false, title: '' },
    ];
    mockSettingsState.settings.activeTabIndex = 0;

    await useTabStore.getState().restoreTabs();

    expect(useTabStore.getState().tabs[0].title).toBe('mytitle.jsonl');
  });

  it('restoreTabs 活跃标签页的 activeIndex 考虑钉住重排', async () => {
    // 原始快照：reg1(pin=false), reg2(pin=false), pin1(pin=true)
    // activeIndex=2 指向 pin1
    // 重排后 → pin1(0), reg1(1), reg2(2)
    // activeTabId 应对应 pin1 (重排后 index 0)
    mockSettingsState.settings.tabSnapshots = [
      { sessionPath: '/test/reg1.jsonl', providerName: 'claude_code', pinned: false, title: 'Reg1' },
      { sessionPath: '/test/reg2.jsonl', providerName: 'claude_code', pinned: false, title: 'Reg2' },
      { sessionPath: '/test/pin1.jsonl', providerName: 'codex', pinned: true, title: 'Pin1' },
    ];
    mockSettingsState.settings.activeTabIndex = 2;

    await useTabStore.getState().restoreTabs();

    const state = useTabStore.getState();
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
    expect(activeTab?.sessionPath).toBe('/test/pin1.jsonl');
    // 活跃标签页的内容应被加载
    expect(mockedGetConversation).toHaveBeenCalledWith(
      '/test/pin1.jsonl',
      expect.anything(),
      'codex',
    );
  });

  // ============================================================
  // activateTab 触发延迟加载
  // ============================================================

  it('activateTab 对占位标签页触发 loadTabContent', async () => {
    const tabId = 'placeholder_tab';
    useTabStore.setState({
      tabs: [
        {
          id: tabId,
          sessionPath: '/test/lazy.jsonl',
          providerName: 'claude_code',
          sessionDetail: null,
          isLoading: false,
          error: null,
          filter: { ...mockDefaultFilter },
          showFindBar: false,
          searchHighlight: undefined,
          scrollTop: 0,
          expandedThinking: [],
          expandedToolCalls: [],
          expandedToolResults: [],
          title: 'Lazy tab',
          pinned: false,
        },
      ],
      activeTabId: null,
    });

    mockedGetConversation.mockClear();
    useTabStore.getState().activateTab(tabId);

    // activateTab 是同步操作，loadTabContent 是异步的
    // 等待异步加载完成
    await vi.waitFor(() => {
      expect(mockedGetConversation).toHaveBeenCalledTimes(1);
    });
  });

  it('activateTab 已加载的标签页不触发重复加载', async () => {
    const tabId1 = await useTabStore
      .getState()
      .openTab('/test/session1.jsonl', 'claude_code');

    // 创建第二个标签并激活
    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session2.jsonl',
    });
    await useTabStore
      .getState()
      .openTab('/test/session2.jsonl', 'claude_code');

    // 切换回 tab1（已加载内容）
    mockedGetConversation.mockClear();
    useTabStore.getState().activateTab(tabId1);

    // 不应触发 loadTabContent（tab1 已有内容）
    // 等待一小段时间确认没有异步加载
    await new Promise((r) => setTimeout(r, 50));
    // 没有新的 getConversation 调用
    expect(mockedGetConversation).not.toHaveBeenCalled();
  });

  // ============================================================
  // 关闭操作自动保存
  // ============================================================

  it('closeTab 后触发 saveTabState', async () => {
    const tabId = await useTabStore
      .getState()
      .openTab('/test/session.jsonl', 'claude_code');

    mockedSaveSettings.mockClear();
    useTabStore.getState().closeTab(tabId);

    // Debounce — 等待 350ms
    await new Promise((r) => setTimeout(r, 350));
    expect(mockedSaveSettings).toHaveBeenCalled();
  });

  it('openTab 加载完成后触发 saveTabState', async () => {
    mockedSaveSettings.mockClear();
    await useTabStore
      .getState()
      .openTab('/test/session.jsonl', 'claude_code');

    // Debounce
    await new Promise((r) => setTimeout(r, 350));
    expect(mockedSaveSettings).toHaveBeenCalled();
  });

  it('togglePinTab 后触发 saveTabState', async () => {
    const tabId = await useTabStore
      .getState()
      .openTab('/test/session.jsonl', 'claude_code');

    mockedSaveSettings.mockClear();
    useTabStore.getState().togglePinTab(tabId);

    await new Promise((r) => setTimeout(r, 350));
    expect(mockedSaveSettings).toHaveBeenCalled();
  });

  it('moveTab 后触发 saveTabState', async () => {
    await useTabStore
      .getState()
      .openTab('/test/session1.jsonl', 'claude_code');
    mockedGetConversation.mockResolvedValue({
      ...mockSessionDetail,
      filePath: '/test/session2.jsonl',
    });
    await useTabStore
      .getState()
      .openTab('/test/session2.jsonl', 'claude_code');

    mockedSaveSettings.mockClear();
    useTabStore.getState().moveTab(0, 1);

    await new Promise((r) => setTimeout(r, 350));
    expect(mockedSaveSettings).toHaveBeenCalled();
  });
});
