import { create } from 'zustand';
import type {
  SessionSummary,
  ViewMode,
  SortConfig,
  AppSettings,
} from '../types';
import { DEFAULT_SORTS } from '../utils/sort';
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

  // 加载全部会话
  loadAllSessions: async (settings) => {
    set({ isLoadingAll: true, error: null });
    try {
      const allSessions = await tauri.listAllSessions(settings);
      set({ allSessions, isLoadingAll: false });
    } catch (err) {
      set({ error: String(err), isLoadingAll: false });
    }
  },

  // 加载项目列表
  loadProjects: async (settings) => {
    set({ isLoadingProjects: true, error: null });
    try {
      const projects = await tauri.listProjects(settings);
      set({ projects, isLoadingProjects: false });
    } catch (err) {
      set({ error: String(err), isLoadingProjects: false });
    }
  },

  // 选中项目，加载会话
  selectProject: async (projectPath, provider) => {
    set({
      isLoadingProject: true,
      projectFilter: projectPath,
      error: null,
    });
    try {
      const sessions = await tauri.listSessions(projectPath, provider);
      set({ projectSessions: sessions, isLoadingProject: false });
    } catch (err) {
      set({ error: String(err), isLoadingProject: false });
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

  /** 刷新当前视图的数据：重载项目列表 + 全部会话，并根据当前视图状态重载搜索/项目会话 */
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
