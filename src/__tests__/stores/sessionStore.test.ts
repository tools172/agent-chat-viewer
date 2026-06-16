import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSessionStore } from '../../stores/sessionStore';
import { invoke } from '@tauri-apps/api/core';

const mockedInvoke = vi.mocked(invoke);

// Mock the tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('sessionStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the store
    useSessionStore.setState({
      projects: [],
      sessions: [],
      currentSession: null,
      searchResults: [],
      viewMode: 'by-project' as const,
      selectedProjectPath: null,
      selectedSessionPath: null,
      searchQuery: '',
      isLoading: false,
      isLoadingConversation: false,
      error: null,
    });
  });

  it('should have initial state', () => {
    const state = useSessionStore.getState();
    expect(state.projects).toEqual([]);
    expect(state.sessions).toEqual([]);
    expect(state.currentSession).toBeNull();
    expect(state.viewMode).toBe('by-project');
    expect(state.isLoading).toBe(false);
  });

  it('should set view mode', () => {
    useSessionStore.getState().setViewMode('by-time');
    expect(useSessionStore.getState().viewMode).toBe('by-time');
  });

  it('should set search query', () => {
    useSessionStore.getState().setSearchQuery('test query');
    expect(useSessionStore.getState().searchQuery).toBe('test query');
  });

  it('should clear selection', () => {
    useSessionStore.setState({
      currentSession: {
        id: 'test',
        filePath: '/test.jsonl',
        events: [],
      },
      selectedSessionPath: '/test.jsonl',
    });

    useSessionStore.getState().clearSelection();
    const state = useSessionStore.getState();
    expect(state.currentSession).toBeNull();
    expect(state.selectedSessionPath).toBeNull();
  });

  it('should clear error', () => {
    useSessionStore.setState({ error: 'test error' });
    useSessionStore.getState().clearError();
    expect(useSessionStore.getState().error).toBeNull();
  });

  // ============================================================
  // Filter 一致性测试 — 验证 selectSession 使用的是传入的 filter
  // 而非闭包中的陈旧值（Bug: stale closure in useSessions wrapper）
  // ============================================================

  it('selectSession 应使用显式传入的 filter 而非旧值', async () => {
    const filterA = {
      showThinking: false,
      showToolCalls: false,
      showToolResults: false,
      hideEmptyToolResults: false,
      showSystemMessages: false,
      showFileSnapshots: false,
    };

    const filterB = {
      ...filterA,
      showThinking: true, // 只有这一个差异
    };

    mockedInvoke.mockResolvedValue({
      id: 'test',
      filePath: '/test.jsonl',
      display: '(Empty session)',
      events: [],
    });

    // 第一次请求：用 filterA (thinking=false)
    await useSessionStore
      .getState()
      .selectSession('/test.jsonl', filterA, 'claude_code');

    expect(mockedInvoke).toHaveBeenCalledTimes(1);
    // invoke('get_conversation', { sessionPath, filter, providerName })
    const call1Args = mockedInvoke.mock.calls[0]![1] as { filter: typeof filterA };
    expect(call1Args.filter.showThinking).toBe(false);

    // 第二次请求：用 filterB (thinking=true)
    // 这是关键断言：filter 必须是 B 而非 A
    await useSessionStore
      .getState()
      .selectSession('/test.jsonl', filterB, 'claude_code');

    expect(mockedInvoke).toHaveBeenCalledTimes(2);
    const call2Args = mockedInvoke.mock.calls[1]![1] as { filter: typeof filterA };
    expect(call2Args.filter.showThinking).toBe(true);
    // 同时验证 filterB 的其他值也没变
    expect(call2Args.filter.showToolCalls).toBe(false);
  });

  it('连续切换 filter 每次都应传递正确的值', async () => {
    mockedInvoke.mockResolvedValue({
      id: 'test',
      filePath: '/test.jsonl',
      display: '(Empty session)',
      events: [],
    });

    const steps = [
      { showThinking: true, showToolCalls: true, showToolResults: true },
      { showThinking: false, showToolCalls: true, showToolResults: true },
      { showThinking: false, showToolCalls: false, showToolResults: true },
      { showThinking: false, showToolCalls: false, showToolResults: false },
      { showThinking: true, showToolCalls: false, showToolResults: false },
    ];

    for (let i = 0; i < steps.length; i++) {
      const filter = {
        ...steps[i],
        hideEmptyToolResults: true,
        showSystemMessages: false,
        showFileSnapshots: false,
      };
      await useSessionStore
        .getState()
        .selectSession('/test.jsonl', filter, 'claude_code');

      const callArgs = mockedInvoke.mock.calls[i]!;
      const passedFilter = (callArgs[1] as { filter: typeof filter }).filter;
      expect(passedFilter.showThinking).toBe(steps[i].showThinking);
      expect(passedFilter.showToolCalls).toBe(steps[i].showToolCalls);
      expect(passedFilter.showToolResults).toBe(steps[i].showToolResults);
    }
  });
});
