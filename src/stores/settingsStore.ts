import { create } from "zustand";
import type {
  AppSettings,
  FilterConfig,
  WatchDirectory,
  ThemeMode,
} from "../types";
import {
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  TURN_NAV_MIN_WIDTH,
  TURN_NAV_MAX_WIDTH,
  TURN_NAV_DEFAULT_WIDTH,
  PANEL_OPACITY_MIN,
  PANEL_OPACITY_MAX,
  PANEL_OPACITY_DEFAULT,
  CONTENT_ZOOM_MIN,
  CONTENT_ZOOM_MAX,
  CONTENT_ZOOM_DEFAULT,
} from "../types";
import * as tauri from "../utils/tauri";

interface SettingsState {
  // Data
  settings: AppSettings;
  defaultPaths: Record<string, string>;
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  load: () => Promise<void>;
  save: () => Promise<void>;
  updateFilter: (filter: Partial<FilterConfig>) => void;
  addWatchDirectory: (path: string) => void;
  removeWatchDirectory: (path: string) => void;
  toggleWatchDirectory: (path: string) => void;
  toggleProvider: (name: string, enabled: boolean) => void;
  updateSearchColors: (
    colors: Partial<import("../types").SearchColors>,
  ) => void;
  updateNavCollapsed: (collapsed: boolean) => void;
  updateAutoSavePanelWidths: (autoSave: boolean) => void;
  updateSidebarWidth: (width: number) => void;
  updateNavigatorWidth: (width: number) => void;
  updatePolishBatchSize: (size: number) => void;
  updateRestoreTabsOnStartup: (restore: boolean) => void;
  updateTheme: (theme: ThemeMode) => void;
  updateMaxPinnedTabs: (n: number) => void;
  updateSettingsPanelOffset: (offset: number) => void;
  updateSettingsPanelOpacity: (opacity: number) => void;
  updateSettingsPanelGlass: (glass: boolean) => void;
  updateContentZoom: (zoom: number) => void;
  setSetting: (partial: Partial<AppSettings>) => void;
  resetSearchColors: () => void;
  resetFilter: () => void;
  clearError: () => void;
}

const defaultSettings: AppSettings = {
  watchDirectories: [],
  defaultFilter: {
    showThinking: false,
    showToolCalls: true,
    showToolResults: true,
    hideEmptyToolResults: true,
    showSystemMessages: false,
    showFileSnapshots: false,
    collapseConsecutive: false,
    showProcess: false,
  },
  providerEnabled: {
    claude_code: true,
    codex: true,
    cursor: true,
    openclaw: false,
    deepseek_harness: false,
  },
  searchColors: {
    search: "#fef08a",
    find: "#fed7aa",
  },
  navCollapsed: false,
  autoSavePanelWidths: true,
  sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
  navigatorWidth: TURN_NAV_DEFAULT_WIDTH,
  polishBatchSize: 5,
  restoreTabsOnStartup: true,
  theme: "system",
  maxPinnedTabs: 4,
  displayFirstUserMessage: true,
  timeBase: "modified",
  sessionListStyle: "loose",
  // settingsPanelOffset 缺省 = 停靠右侧
  settingsPanelOpacity: PANEL_OPACITY_DEFAULT,
  // 毛玻璃默认勾选：面板带磨砂模糊质感
  settingsPanelGlass: true,
  contentZoom: CONTENT_ZOOM_DEFAULT,
  skippedUpdateVersion: null,
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: defaultSettings,
  defaultPaths: {},
  isLoaded: false,
  isLoading: false,
  error: null,

  load: async () => {
    set({ isLoading: true, error: null });
    try {
      const [settings, defaultPaths] = await Promise.all([
        tauri.loadSettings().catch(() => defaultSettings),
        tauri.getDefaultPaths().catch(() => ({})),
      ]);
      // 确保 searchColors 有默认值（兼容旧版本设置文件）
      if (!settings.searchColors) {
        settings.searchColors = { ...defaultSettings.searchColors };
      }
      // 确保 maxPinnedTabs 有默认值（兼容旧版本设置文件）
      if (settings.maxPinnedTabs == null) {
        settings.maxPinnedTabs = defaultSettings.maxPinnedTabs;
      }
      // 确保 sessionListStyle 有默认值（兼容旧版本设置文件）
      if (settings.sessionListStyle == null) {
        settings.sessionListStyle = defaultSettings.sessionListStyle;
      }
      // 确保设置面板不透明度有默认值（兼容旧版本设置文件）
      if (settings.settingsPanelOpacity == null) {
        settings.settingsPanelOpacity = defaultSettings.settingsPanelOpacity;
      }
      // 确保设置面板毛玻璃开关有默认值（兼容旧版本设置文件）
      if (settings.settingsPanelGlass == null) {
        settings.settingsPanelGlass = defaultSettings.settingsPanelGlass;
      }
      // 确保内容缩放有默认值（兼容旧版本设置文件）
      if (settings.contentZoom == null) {
        settings.contentZoom = defaultSettings.contentZoom;
      }
      // 合并默认 providerEnabled（兼容旧版本设置文件缺少新增 agent）
      settings.providerEnabled = {
        ...defaultSettings.providerEnabled,
        ...settings.providerEnabled,
      };
      set({ settings, defaultPaths, isLoaded: true, isLoading: false });
    } catch (err) {
      set({
        settings: defaultSettings,
        isLoaded: true,
        isLoading: false,
        error: String(err),
      });
    }
  },

  save: async () => {
    const { settings } = get();
    set({ isLoading: true, error: null });
    try {
      await tauri.saveSettings(settings);
      set({ isLoading: false });
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },

  updateFilter: (filter) => {
    const { settings } = get();
    const newSettings = {
      ...settings,
      defaultFilter: { ...settings.defaultFilter, ...filter },
    };
    set({ settings: newSettings });
  },

  addWatchDirectory: (path) => {
    const { settings } = get();
    if (!settings.watchDirectories.some((d) => d.path === path)) {
      const entry: WatchDirectory = { path, enabled: true };
      const newSettings = {
        ...settings,
        watchDirectories: [...settings.watchDirectories, entry],
      };
      set({ settings: newSettings });
    }
  },

  removeWatchDirectory: (path) => {
    const { settings } = get();
    const newSettings = {
      ...settings,
      watchDirectories: settings.watchDirectories.filter(
        (d) => d.path !== path,
      ),
    };
    set({ settings: newSettings });
  },

  toggleWatchDirectory: (path) => {
    const { settings } = get();
    const newSettings = {
      ...settings,
      watchDirectories: settings.watchDirectories.map((d) =>
        d.path === path ? { ...d, enabled: !d.enabled } : d,
      ),
    };
    set({ settings: newSettings });
  },

  toggleProvider: (name, enabled) => {
    const { settings } = get();
    const newSettings = {
      ...settings,
      providerEnabled: {
        ...settings.providerEnabled,
        [name]: enabled,
      },
    };
    set({ settings: newSettings });
  },

  updateSearchColors: (colors) => {
    const { settings } = get();
    set({
      settings: {
        ...settings,
        searchColors: { ...settings.searchColors, ...colors },
      },
    });
  },

  updateNavCollapsed: (collapsed) => {
    const { settings } = get();
    set({
      settings: {
        ...settings,
        navCollapsed: collapsed,
      },
    });
  },

  updateAutoSavePanelWidths: (autoSave) => {
    const { settings } = get();
    set({
      settings: {
        ...settings,
        autoSavePanelWidths: autoSave,
      },
    });
  },

  updateSidebarWidth: (width) => {
    const { settings } = get();
    set({
      settings: {
        ...settings,
        sidebarWidth: Math.max(
          SIDEBAR_MIN_WIDTH,
          Math.min(SIDEBAR_MAX_WIDTH, width),
        ),
      },
    });
  },

  updateNavigatorWidth: (width) => {
    const { settings } = get();
    set({
      settings: {
        ...settings,
        navigatorWidth: Math.max(
          TURN_NAV_MIN_WIDTH,
          Math.min(TURN_NAV_MAX_WIDTH, width),
        ),
      },
    });
  },

  updateSettingsPanelOffset: (offset) => {
    const { settings } = get();
    set({
      settings: {
        ...settings,
        // 比例存储：0~1，窗口缩放后按比例重新定位；保留 4 位小数避免抖动
        settingsPanelOffset:
          Math.round(Math.min(1, Math.max(0, offset)) * 10000) / 10000,
      },
    });
  },

  updateSettingsPanelOpacity: (opacity) => {
    const { settings } = get();
    set({
      settings: {
        ...settings,
        // 钳制到 0.3~0.95 并保留两位小数，避免浮点抖动
        settingsPanelOpacity:
          Math.round(
            Math.min(PANEL_OPACITY_MAX, Math.max(PANEL_OPACITY_MIN, opacity)) *
              100,
          ) / 100,
      },
    });
  },

  updateSettingsPanelGlass: (glass) => {
    const { settings } = get();
    set({
      settings: {
        ...settings,
        settingsPanelGlass: glass,
      },
    });
  },

  updateContentZoom: (zoom) => {
    const { settings } = get();
    set({
      settings: {
        ...settings,
        // 钳制到 50~200，四舍五入到整数，避免浮点抖动
        contentZoom: Math.round(
          Math.min(CONTENT_ZOOM_MAX, Math.max(CONTENT_ZOOM_MIN, zoom)),
        ),
      },
    });
  },

  updatePolishBatchSize: (size: number) => {
    const { settings } = get();
    set({
      settings: {
        ...settings,
        polishBatchSize: size,
      },
    });
  },

  updateRestoreTabsOnStartup: (restore: boolean) => {
    const { settings } = get();
    set({
      settings: {
        ...settings,
        restoreTabsOnStartup: restore,
      },
    });
  },

  updateTheme: (theme: ThemeMode) => {
    const { settings } = get();
    set({
      settings: {
        ...settings,
        theme,
      },
    });
  },

  updateMaxPinnedTabs: (n: number) => {
    const { settings } = get();
    set({
      settings: {
        ...settings,
        maxPinnedTabs: Math.max(1, Math.min(8, n)),
      },
    });
  },

  setSetting: (partial: Partial<AppSettings>) => {
    const { settings } = get();
    set({
      settings: { ...settings, ...partial },
    });
  },

  resetSearchColors: () => {
    const { settings } = get();
    set({
      settings: {
        ...settings,
        searchColors: { ...defaultSettings.searchColors },
      },
    });
  },

  resetFilter: () => {
    const { settings } = get();
    set({
      settings: {
        ...settings,
        defaultFilter: defaultSettings.defaultFilter,
      },
    });
  },

  clearError: () => set({ error: null }),
}));
