import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTabStore } from '../../stores/tabStore';

// Mock tauri utils
const mockedGetConversation = vi.fn();

vi.mock('../../utils/tauri', () => ({
  getConversation: (...args: unknown[]) => mockedGetConversation(...args),
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

vi.mock('../../stores/settingsStore', () => ({
  useSettingsStore: {
    getState: vi.fn(() => ({
      settings: {
        defaultFilter: mockDefaultFilter,
        watchDirectories: [],
        providerEnabled: {},
        searchColors: { search: '#fef08a', find: '#fed7aa' },
      },
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
});
