import { create } from 'zustand';
import type { AppSettings, FilterConfig } from '../types';
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
  toggleProvider: (name: string, enabled: boolean) => void;
  updateSearchColors: (colors: Partial<import('../types').SearchColors>) => void;
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
  },
  providerEnabled: {
    claude_code: true,
    openclaw: false,
  },
  searchColors: {
    search: '#fef08a',
    find: '#fed7aa',
  },
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
    if (!settings.watchDirectories.includes(path)) {
      const newSettings = {
        ...settings,
        watchDirectories: [...settings.watchDirectories, path],
      };
      set({ settings: newSettings });
    }
  },

  removeWatchDirectory: (path) => {
    const { settings } = get();
    const newSettings = {
      ...settings,
      watchDirectories: settings.watchDirectories.filter((d) => d !== path),
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
