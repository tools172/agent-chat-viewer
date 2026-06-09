import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSettingsStore } from '../../stores/settingsStore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('settingsStore', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      settings: {
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
        searchColors: { search: '#fef08a', find: '#fed7aa' },
        sidebarWidth: 320,
      },
      defaultPaths: {},
      isLoaded: false,
      isLoading: false,
      error: null,
    });
  });

  it('should update filter settings', () => {
    useSettingsStore.getState().updateFilter({ showThinking: true });
    const settings = useSettingsStore.getState().settings;
    expect(settings.defaultFilter.showThinking).toBe(true);
  });

  it('should add watch directory', () => {
    useSettingsStore.getState().addWatchDirectory('/test/path');
    const settings = useSettingsStore.getState().settings;
    expect(settings.watchDirectories).toContain('/test/path');
  });

  it('should not add duplicate watch directory', () => {
    useSettingsStore.getState().addWatchDirectory('/test/path');
    useSettingsStore.getState().addWatchDirectory('/test/path');
    const settings = useSettingsStore.getState().settings;
    expect(settings.watchDirectories.length).toBe(1);
  });

  it('should remove watch directory', () => {
    useSettingsStore.getState().addWatchDirectory('/test/path');
    useSettingsStore.getState().removeWatchDirectory('/test/path');
    const settings = useSettingsStore.getState().settings;
    expect(settings.watchDirectories).not.toContain('/test/path');
  });

  it('should toggle provider', () => {
    useSettingsStore.getState().toggleProvider('claude_code', false);
    const settings = useSettingsStore.getState().settings;
    expect(settings.providerEnabled['claude_code']).toBe(false);
  });

  it('should reset filter to defaults', () => {
    useSettingsStore.getState().updateFilter({
      showThinking: true,
      showToolCalls: false,
    });
    useSettingsStore.getState().resetFilter();
    const settings = useSettingsStore.getState().settings;
    expect(settings.defaultFilter.showThinking).toBe(false);
    expect(settings.defaultFilter.showToolCalls).toBe(true);
  });
});
