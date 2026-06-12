import { create } from 'zustand';
import type { AppSettings, FilterConfig, WatchDirectory } from '../types';
import * as tauri from '../utils/tauri';

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
  updateSearchColors: (colors: Partial<import('../types').SearchColors>) => void;
  updateSidebarWidth: (width: number) => void;
  updateNavigatorWidth: (width: number) => void;
  updatePolishBatchSize: (size: number) => void;
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
  },
  providerEnabled: {
    claude_code: true,
    openclaw: false,
  },
  searchColors: {
    search: '#fef08a',
    find: '#fed7aa',
  },
  sidebarWidth: 320,
  navigatorWidth: 256,
  polishBatchSize: 5,
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
      watchDirectories: settings.watchDirectories.filter((d) => d.path !== path),
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

  updateSidebarWidth: (width) => {
    const { settings } = get();
    set({
      settings: {
        ...settings,
        sidebarWidth: Math.max(200, Math.min(600, width)),
      },
    });
  },

  updateNavigatorWidth: (width) => {
    const { settings } = get();
    set({
      settings: {
        ...settings,
        navigatorWidth: Math.max(160, Math.min(400, width)),
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
