import { create } from "zustand";
import type {
  SessionSummary,
  ViewMode,
  SortConfig,
  TimeField,
  AppSettings,
} from "../types";
import { DEFAULT_SORTS } from "../utils/sort";
import { useSettingsStore } from "./settingsStore";
import * as tauri from "../utils/tauri";

/** 各视图的默认时间字段 */
const DEFAULT_TIME_FIELDS: Record<string, TimeField> = {
  flat: "created",
  "by-project": "created",
  "by-time": "created",
  search: "created",
};

interface SessionListState {
  viewMode: ViewMode;
  sortConfig: SortConfig;
  viewSortConfigs: Record<string, SortConfig>;

  // 时间线时间字段（按视图独立保持状态）
  timeField: TimeField;
  viewTimeFields: Record<string, TimeField>;

  // 数据
  allSessions: SessionSummary[];
  projects: import("../types").Project[];
  /** 按项目路径缓存的会话列表，每个展开的文件夹独立存储 */
  projectSessionsCache: Record<string, import("../types").SessionSummary[]>;
  searchResults: SessionSummary[];

  // 过滤
  projectFilter: string | null;

  // 搜索
  searchQuery: string;
  highlightEnabled: boolean;

  // 文件夹视图定位目标（右键菜单 "定位到文件夹列表"）
  locateTarget: { filePath: string; projectPath: string } | null;

  // 加载状态
  isLoadingAll: boolean;
  isLoadingProjects: boolean;
  isLoadingProject: boolean;
  isLoadingSearch: boolean;
  error: string | null;

  // 操作
  setViewMode: (mode: ViewMode) => void;
  setSortConfig: (config: SortConfig) => void;
  setTimeField: (field: TimeField) => void;
  setProjectFilter: (path: string | null) => void;
  setLocateTarget: (
    target: { filePath: string; projectPath: string } | null,
  ) => void;
  toggleHighlight: () => void;
  loadAllSessions: (settings: AppSettings) => Promise<void>;
  loadProjects: (settings: AppSettings) => Promise<void>;
  selectProject: (projectPath: string, provider: string) => Promise<void>;
  search: (query: string, settings: AppSettings) => Promise<void>;
  refresh: (settings: AppSettings) => Promise<void>;
  polishAllSessions: (sessions: SessionSummary[]) => Promise<void>;
  polishProjectSessions: (
    projectPath: string,
    sessions: SessionSummary[],
  ) => Promise<void>;
  polishSearchResults: (sessions: SessionSummary[]) => Promise<void>;
  setSearchQuery: (query: string) => void;
  clearError: () => void;
}

export const useSessionListStore = create<SessionListState>((set, get) => ({
  viewMode: "flat",
  sortConfig: DEFAULT_SORTS.flat,
  viewSortConfigs: { ...DEFAULT_SORTS },

  timeField: "created",
  viewTimeFields: { ...DEFAULT_TIME_FIELDS },

  allSessions: [],
  projects: [],
  projectSessionsCache: {},
  searchResults: [],

  projectFilter: null,
  locateTarget: null,
  searchQuery: "",
  highlightEnabled: true,

  isLoadingAll: false,
  isLoadingProjects: false,
  isLoadingProject: false,
  isLoadingSearch: false,
  error: null,

  setViewMode: (mode) => {
    const { viewSortConfigs, viewTimeFields } = get();
    set({
      viewMode: mode,
      sortConfig: viewSortConfigs[mode] ?? DEFAULT_SORTS[mode],
      timeField: viewTimeFields[mode] ?? DEFAULT_TIME_FIELDS[mode],
      // 切离文件夹视图时清除定位高亮
      ...(mode !== "by-project" ? { locateTarget: null } : {}),
    });
  },

  setSortConfig: (config) => {
    const { viewMode, viewSortConfigs } = get();
    set({
      sortConfig: config,
      viewSortConfigs: { ...viewSortConfigs, [viewMode]: config },
    });
  },

  setTimeField: (field) => {
    const { viewMode, viewTimeFields } = get();
    set({
      timeField: field,
      viewTimeFields: { ...viewTimeFields, [viewMode]: field },
    });
  },

  setProjectFilter: (path) => set({ projectFilter: path }),
  setLocateTarget: (target) => set({ locateTarget: target }),
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
    const pairs: [string, string][] = sessions.map((s) => [
      s.filePath,
      s.providerName,
    ]);
    for (let i = 0; i < pairs.length; i += BATCH) {
      const batch = pairs.slice(i, i + BATCH);
      try {
        const polished = await tauri.polishSessions(batch);
        const map = new Map(polished.map((p) => [p.filePath, p]));
        set((state) => ({
          allSessions: state.allSessions.map((s) => {
            const p = map.get(s.filePath);
            return p
              ? {
                  ...s,
                  display: p.display,
                  lastUserText: p.lastUserText,
                  timestamp: p.timestamp,
                  messageCount: p.messageCount,
                  cwd: p.cwd,
                  clientType: p.clientType,
                }
              : s;
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

  // 选中工作目录，加载会话（缓存到 projectSessionsCache[projectPath]）
  selectProject: async (projectPath, provider) => {
    // 如果已缓存，直接切换 projectFilter，不重复加载
    const cached = get().projectSessionsCache[projectPath];
    if (cached) {
      set({ projectFilter: projectPath, isLoadingProject: false, error: null });
      return;
    }
    set({
      isLoadingProject: true,
      projectFilter: projectPath,
      error: null,
    });
    try {
      const sessions = await tauri.listSessions(projectPath, provider);
      set((state) => ({
        projectSessionsCache: {
          ...state.projectSessionsCache,
          [projectPath]: sessions,
        },
        isLoadingProject: false,
      }));
      // 渐进 polish
      get().polishProjectSessions(projectPath, sessions);
    } catch (err) {
      set({ error: String(err), isLoadingProject: false });
    }
  },

  /** 后台 polish 项目会话，分批更新使内容更快出现 */
  polishProjectSessions: async (
    projectPath: string,
    sessions: SessionSummary[],
  ) => {
    if (sessions.length === 0) return;
    const BATCH = useSettingsStore.getState().settings.polishBatchSize ?? 5;
    const pairs: [string, string][] = sessions.map((s) => [
      s.filePath,
      s.providerName,
    ]);
    for (let i = 0; i < pairs.length; i += BATCH) {
      const batch = pairs.slice(i, i + BATCH);
      try {
        const polished = await tauri.polishSessions(batch);
        const map = new Map(polished.map((p) => [p.filePath, p]));
        set((state) => {
          const entries = state.projectSessionsCache[projectPath];
          if (!entries) return {};
          return {
            projectSessionsCache: {
              ...state.projectSessionsCache,
              [projectPath]: entries.map((s) => {
                const p = map.get(s.filePath);
                return p
                  ? {
                      ...s,
                      display: p.display,
                      lastUserText: p.lastUserText,
                      timestamp: p.timestamp,
                      messageCount: p.messageCount,
                      cwd: p.cwd,
                      clientType: p.clientType,
                    }
                  : s;
              }),
            },
          };
        });
      } catch {
        // polish 失败不影响已加载数据
      }
    }
  },

  /** 后台 polish 搜索结果，分批更新使内容更快出现 */
  polishSearchResults: async (sessions: SessionSummary[]) => {
    if (sessions.length === 0) return;
    const BATCH = useSettingsStore.getState().settings.polishBatchSize ?? 5;
    const pairs: [string, string][] = sessions.map((s) => [
      s.filePath,
      s.providerName,
    ]);
    for (let i = 0; i < pairs.length; i += BATCH) {
      const batch = pairs.slice(i, i + BATCH);
      try {
        const polished = await tauri.polishSessions(batch);
        const map = new Map(polished.map((p) => [p.filePath, p]));
        set((state) => ({
          searchResults: state.searchResults.map((s) => {
            const p = map.get(s.filePath);
            return p
              ? {
                  ...s,
                  display: p.display,
                  lastUserText: p.lastUserText,
                  timestamp: p.timestamp,
                  messageCount: p.messageCount,
                  cwd: p.cwd,
                  clientType: p.clientType,
                }
              : s;
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
      set({ searchResults: [], searchQuery: "" });
      return;
    }
    set({ isLoadingSearch: true, searchQuery: query, error: null });
    try {
      const searchResults = await tauri.searchSessions(query, settings);
      set({ searchResults, isLoadingSearch: false });
      // 渐进 polish 搜索结果，填充 display/clientType 等信息
      get().polishSearchResults(searchResults);
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
    // 清空项目会话缓存，强制重新加载
    set({ projectSessionsCache: {} });
    // 根据视图/状态重载特定数据
    if (viewMode === "search" && searchQuery.trim()) {
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
