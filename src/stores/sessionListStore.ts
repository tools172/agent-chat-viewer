import { create } from 'zustand';
import type {
  SessionSummary,
  ViewMode,
  SortConfig,
  AppSettings,
} from '../types';
import { DEFAULT_SORTS } from '../utils/sort';
import { useSettingsStore } from './settingsStore';
import * as tauri from '../utils/tauri';

interface SessionListState {
  viewMode: ViewMode;
  sortConfig: SortConfig;
  viewSortConfigs: Record<string, SortConfig>;

  // 数据
  allSessions: SessionSummary[];
  projects: import('../types').Project[];
  projectSessions: import('../types').SessionSummary[];
  searchResults: SessionSummary[];

  // 过滤
  projectFilter: string | null;

  // 搜索
  searchQuery: string;
  highlightEnabled: boolean;

  // 加载状态
  isLoadingAll: boolean;
  isLoadingProjects: boolean;
  isLoadingProject: boolean;
  isLoadingSearch: boolean;
  error: string | null;

  // 操作
  setViewMode: (mode: ViewMode) => void;
  setSortConfig: (config: SortConfig) => void;
  setProjectFilter: (path: string | null) => void;
  toggleHighlight: () => void;
  loadAllSessions: (settings: AppSettings) => Promise<void>;
  loadProjects: (settings: AppSettings) => Promise<void>;
  selectProject: (
    projectPath: string,
    provider: string
  ) => Promise<void>;
  search: (
    query: string,
    settings: AppSettings
  ) => Promise<void>;
  refresh: (settings: AppSettings) => Promise<void>;
  polishAllSessions: (sessions: SessionSummary[]) => Promise<void>;
  polishProjectSessions: (sessions: SessionSummary[]) => Promise<void>;
  setSearchQuery: (query: string) => void;
  clearError: () => void;
}

export const useSessionListStore = create<SessionListState>((set, get) => ({
  viewMode: 'flat',
  sortConfig: DEFAULT_SORTS.flat,
  viewSortConfigs: { ...DEFAULT_SORTS },

  allSessions: [],
  projects: [],
  projectSessions: [],
  searchResults: [],

  projectFilter: null,
  searchQuery: '',
  highlightEnabled: true,

  isLoadingAll: false,
  isLoadingProjects: false,
  isLoadingProject: false,
  isLoadingSearch: false,
  error: null,

  setViewMode: (mode) => {
    const { viewSortConfigs } = get();
    set({
      viewMode: mode,
      sortConfig: viewSortConfigs[mode] ?? DEFAULT_SORTS[mode],
    });
  },

  setSortConfig: (config) => {
    const { viewMode, viewSortConfigs } = get();
    set({
      sortConfig: config,
      viewSortConfigs: { ...viewSortConfigs, [viewMode]: config },
    });
  },

  setProjectFilter: (path) => set({ projectFilter: path }),
  toggleHighlight: () =>
    set((s) => ({ highlightEnabled: !s.highlightEnabled })),

  // 加载全部会话（快速模式 → 渐进 polish）
  loadAllSessions: async (settings) => {
    set({ isLoadingAll: true, error: null });
    try {
      const allSessions = await tauri.listAllSessions(settings);
      set({ allSessions, isLoadingAll: false });
      // 渐进式 polish：后台逐批清洗 display + 检测 clientType
      get().polishAllSessions(allSessions);
    } catch (err) {
      set({ error: String(err), isLoadingAll: false });
    }
  },

  /** 后台渐进 polish：分批进行，批次大小从设置中读取 */
  polishAllSessions: async (sessions: SessionSummary[]) => {
    const BATCH = useSettingsStore.getState().settings.polishBatchSize ?? 5;
    const pairs: [string, string][] = sessions.map((s) => [s.filePath, s.providerName]);
    for (let i = 0; i < pairs.length; i += BATCH) {
      const batch = pairs.slice(i, i + BATCH);
      try {
        const polished = await tauri.polishSessions(batch);
        const map = new Map(polished.map((p) => [p.filePath, p]));
        set((state) => ({
          allSessions: state.allSessions.map((s) => {
            const p = map.get(s.filePath);
            return p ? { ...s, display: p.display, timestamp: p.timestamp, messageCount: p.messageCount, cwd: p.cwd, clientType: p.clientType } : s;
          }),
        }));
      } catch {
        // polish 失败不影响已加载的数据
      }
    }
  },

  // 加载工作目录列表
  loadProjects: async (settings) => {
    set({ isLoadingProjects: true, error: null });
    try {
      const projects = await tauri.listProjects(settings);
      set({ projects, isLoadingProjects: false });
    } catch (err) {
      set({ error: String(err), isLoadingProjects: false });
    }
  },

  // 选中工作目录，加载会话
  selectProject: async (projectPath, provider) => {
    set({
      isLoadingProject: true,
      projectFilter: projectPath,
      projectSessions: [],  // 清空旧数据，避免展开时闪现上一个项目的内容
      error: null,
    });
    try {
      const sessions = await tauri.listSessions(projectPath, provider);
      set({ projectSessions: sessions, isLoadingProject: false });
      // 渐进 polish
      get().polishProjectSessions(sessions);
    } catch (err) {
      set({ error: String(err), isLoadingProject: false });
    }
  },

  /** 后台 polish 项目会话，分批更新使内容更快出现 */
  polishProjectSessions: async (sessions: SessionSummary[]) => {
    if (sessions.length === 0) return;
    const BATCH = useSettingsStore.getState().settings.polishBatchSize ?? 5;
    const pairs: [string, string][] = sessions.map((s) => [s.filePath, s.providerName]);
    for (let i = 0; i < pairs.length; i += BATCH) {
      const batch = pairs.slice(i, i + BATCH);
      try {
        const polished = await tauri.polishSessions(batch);
        const map = new Map(polished.map((p) => [p.filePath, p]));
        set((state) => ({
          projectSessions: state.projectSessions.map((s) => {
            const p = map.get(s.filePath);
            return p ? { ...s, display: p.display, timestamp: p.timestamp, messageCount: p.messageCount, cwd: p.cwd, clientType: p.clientType } : s;
          }),
        }));
      } catch {
        // polish 失败不影响已加载数据
      }
    }
  },

  // 搜索
  search: async (query, settings) => {
    if (!query.trim()) {
      set({ searchResults: [], searchQuery: '' });
      return;
    }
    set({ isLoadingSearch: true, searchQuery: query, error: null });
    try {
      const searchResults = await tauri.searchSessions(query, settings);
      set({ searchResults, isLoadingSearch: false });
    } catch (err) {
      set({ error: String(err), isLoadingSearch: false });
    }
  },

  /** 刷新当前视图的数据：重载工作目录列表 + 全部会话，并根据当前视图状态重载搜索/工作目录会话 */
  refresh: async (settings: AppSettings) => {
    const { viewMode, searchQuery, projectFilter } = get();
    // 并行重载基础数据
    await Promise.all([
      get().loadProjects(settings),
      get().loadAllSessions(settings),
    ]);
    // 根据视图/状态重载特定数据
    if (viewMode === 'search' && searchQuery.trim()) {
      await get().search(searchQuery, settings);
    }
    if (projectFilter) {
      const { projects } = get();
      const project = projects.find((p) => p.path === projectFilter);
      if (project) {
        await get().selectProject(projectFilter, project.providerName);
      }
    }
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
  clearError: () => set({ error: null }),
}));
