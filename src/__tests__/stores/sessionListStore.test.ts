import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSessionListStore } from '../../stores/sessionListStore';

// Mock the tauri invoke
const mockedListAllSessions = vi.fn();
const mockedListProjects = vi.fn();
const mockedListSessions = vi.fn();
const mockedSearchSessions = vi.fn();

vi.mock('../../utils/tauri', () => ({
  listAllSessions: (...args: unknown[]) => mockedListAllSessions(...args),
  listProjects: (...args: unknown[]) => mockedListProjects(...args),
  listSessions: (...args: unknown[]) => mockedListSessions(...args),
  searchSessions: (...args: unknown[]) => mockedSearchSessions(...args),
}));

const mockSettings = {
  watchDirectories: [{ path: '/test/dir', enabled: true }],
  defaultFilter: {
    showThinking: true,
    showToolCalls: true,
    showToolResults: true,
    hideEmptyToolResults: false,
    showSystemMessages: false,
    showFileSnapshots: false,
  },
  providerEnabled: { claude_code: true },
  searchColors: { search: '#fef08a', find: '#fed7aa' },
};

describe('sessionListStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionListStore.setState({
      viewMode: 'flat',
      sortConfig: [{ field: 'created', direction: 'desc' }],
      viewSortConfigs: {},
      timeField: 'created',
      viewTimeFields: {},
      allSessions: [],
      projects: [],
      projectSessionsCache: {},
      searchResults: [],
      projectFilter: null,
      searchQuery: '',
      highlightEnabled: true,
      isLoadingAll: false,
      isLoadingProjects: false,
      isLoadingProject: false,
      isLoadingSearch: false,
      error: null,
    });
  });

  // ============================================================
  // refresh() — 上下文感知的刷新
  // ============================================================

  describe('refresh', () => {
    it('应并行重载工作目录列表和全部会话', async () => {
      mockedListProjects.mockResolvedValue([
        { name: 'proj', path: '/p', sessionCount: 1, lastActivity: '', providerName: 'claude_code' },
      ]);
      mockedListAllSessions.mockResolvedValue([
        { id: 's1', projectName: 'proj', projectPath: '/p', display: 'hi', timestamp: '', messageCount: 1, fileSize: 0, cwd: '/p', filePath: '/p/s.jsonl', providerName: 'claude_code', fileMtime: '', clientType: '', storagePath: '' },
      ]);

      await useSessionListStore.getState().refresh(mockSettings);

      expect(mockedListProjects).toHaveBeenCalledTimes(1);
      expect(mockedListAllSessions).toHaveBeenCalledTimes(1);
      expect(useSessionListStore.getState().projects).toHaveLength(1);
      expect(useSessionListStore.getState().allSessions).toHaveLength(1);
    });

    it('搜索视图且有活跃查询时，应重新执行搜索', async () => {
      useSessionListStore.setState({ viewMode: 'search', searchQuery: 'hello' });

      mockedListProjects.mockResolvedValue([]);
      mockedListAllSessions.mockResolvedValue([]);
      mockedSearchSessions.mockResolvedValue([
        { id: 's1', projectName: 'p', projectPath: '/p', display: 'hello world', timestamp: '', messageCount: 1, fileSize: 0, cwd: '/p', filePath: '/p/s.jsonl', providerName: 'claude_code', fileMtime: '', clientType: '', storagePath: '' },
      ]);

      await useSessionListStore.getState().refresh(mockSettings);

      expect(mockedSearchSessions).toHaveBeenCalledWith('hello', mockSettings);
      expect(useSessionListStore.getState().searchResults).toHaveLength(1);
    });

    it('搜索视图但无查询时，不应重新搜索', async () => {
      useSessionListStore.setState({ viewMode: 'search', searchQuery: '' });

      mockedListProjects.mockResolvedValue([]);
      mockedListAllSessions.mockResolvedValue([]);

      await useSessionListStore.getState().refresh(mockSettings);

      expect(mockedSearchSessions).not.toHaveBeenCalled();
    });

    it('有 projectFilter 时应重载该工作目录会话', async () => {
      useSessionListStore.setState({
        projectFilter: '/p',
        projects: [
          { name: 'proj', path: '/p', sessionCount: 2, lastActivity: '', providerName: 'claude_code' },
        ],
      });

      mockedListProjects.mockResolvedValue([
        { name: 'proj', path: '/p', sessionCount: 2, lastActivity: '', providerName: 'claude_code' },
      ]);
      mockedListAllSessions.mockResolvedValue([]);
      mockedListSessions.mockResolvedValue([
        { id: 's1', projectName: 'proj', projectPath: '/p', display: 'a', timestamp: '', messageCount: 1, fileSize: 0, cwd: '/p', filePath: '/p/a.jsonl', providerName: 'claude_code', fileMtime: '', clientType: '', storagePath: '' },
        { id: 's2', projectName: 'proj', projectPath: '/p', display: 'b', timestamp: '', messageCount: 1, fileSize: 0, cwd: '/p', filePath: '/p/b.jsonl', providerName: 'claude_code', fileMtime: '', clientType: '', storagePath: '' },
      ]);

      await useSessionListStore.getState().refresh(mockSettings);

      expect(mockedListSessions).toHaveBeenCalledWith('/p', 'claude_code');
      expect(useSessionListStore.getState().projectSessionsCache['/p']).toHaveLength(2);
    });

    it('projectFilter 对应工作目录不存在时不应崩溃', async () => {
      useSessionListStore.setState({
        projectFilter: '/nonexistent',
        projects: [],
      });

      mockedListProjects.mockResolvedValue([]);
      mockedListAllSessions.mockResolvedValue([]);

      // 不应 throw
      await expect(
        useSessionListStore.getState().refresh(mockSettings)
      ).resolves.toBeUndefined();

      expect(mockedListSessions).not.toHaveBeenCalled();
    });

    it('同时有搜索查询和工作目录过滤时应都刷新', async () => {
      useSessionListStore.setState({
        viewMode: 'search',
        searchQuery: 'test',
        projectFilter: '/p',
        projects: [
          { name: 'proj', path: '/p', sessionCount: 1, lastActivity: '', providerName: 'claude_code' },
        ],
      });

      mockedListProjects.mockResolvedValue([
        { name: 'proj', path: '/p', sessionCount: 1, lastActivity: '', providerName: 'claude_code' },
      ]);
      mockedListAllSessions.mockResolvedValue([]);
      mockedSearchSessions.mockResolvedValue([]);
      mockedListSessions.mockResolvedValue([]);

      await useSessionListStore.getState().refresh(mockSettings);

      expect(mockedListProjects).toHaveBeenCalledTimes(1);
      expect(mockedListAllSessions).toHaveBeenCalledTimes(1);
      expect(mockedSearchSessions).toHaveBeenCalledTimes(1);
      expect(mockedListSessions).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================
  // 基础操作
  // ============================================================

  it('初始状态', () => {
    const state = useSessionListStore.getState();
    expect(state.viewMode).toBe('flat');
    expect(state.allSessions).toEqual([]);
    expect(state.projects).toEqual([]);
    expect(state.projectFilter).toBeNull();
    expect(state.searchQuery).toBe('');
    expect(state.highlightEnabled).toBe(true);
  });

  it('切换高亮', () => {
    useSessionListStore.getState().toggleHighlight();
    expect(useSessionListStore.getState().highlightEnabled).toBe(false);
    useSessionListStore.getState().toggleHighlight();
    expect(useSessionListStore.getState().highlightEnabled).toBe(true);
  });

  it('设置视图模式会同时设置对应排序配置', () => {
    useSessionListStore.setState({
      viewSortConfigs: {
        'by-time': [{ field: 'created', direction: 'asc' }],
      },
    });
    useSessionListStore.getState().setViewMode('by-time');
    expect(useSessionListStore.getState().viewMode).toBe('by-time');
    expect(useSessionListStore.getState().sortConfig).toEqual([
      { field: 'created', direction: 'asc' },
    ]);
  });

  it('loadAllSessions 加载失败时设置 error', async () => {
    mockedListAllSessions.mockRejectedValue('Network error');

    await useSessionListStore.getState().loadAllSessions(mockSettings);

    expect(useSessionListStore.getState().isLoadingAll).toBe(false);
    expect(useSessionListStore.getState().error).toContain('Network error');
  });

  it('loadProjects 加载失败时设置 error', async () => {
    mockedListProjects.mockRejectedValue('Disk error');

    await useSessionListStore.getState().loadProjects(mockSettings);

    expect(useSessionListStore.getState().isLoadingProjects).toBe(false);
    expect(useSessionListStore.getState().error).toContain('Disk error');
  });

  // ============================================================
  // timeField — 时间线分组依据，按视图独立保持
  // ============================================================

  it('timeField 默认为 created', () => {
    expect(useSessionListStore.getState().timeField).toBe('created');
  });

  it('setTimeField 更新当前视图的时间字段', () => {
    useSessionListStore.getState().setTimeField('modified');
    expect(useSessionListStore.getState().timeField).toBe('modified');
  });

  it('viewTimeFields 按视图独立存储', () => {
    // 切换到时间线视图 → 设置 modified
    useSessionListStore.getState().setViewMode('by-time');
    useSessionListStore.getState().setTimeField('modified');

    // 切换到 flat 视图 → timeField 应恢复为该视图之前的值（created）
    useSessionListStore.getState().setViewMode('flat');
    expect(useSessionListStore.getState().timeField).toBe('created');

    // 切换回时间线视图 → timeField 应为之前保存的 modified
    useSessionListStore.getState().setViewMode('by-time');
    expect(useSessionListStore.getState().timeField).toBe('modified');
  });

  it('setViewMode 对未保存的视图使用默认值 created', () => {
    // 切换到 by-project，该视图之前未保存过 timeField
    useSessionListStore.getState().setViewMode('by-project');
    expect(useSessionListStore.getState().timeField).toBe('created');
  });
});
