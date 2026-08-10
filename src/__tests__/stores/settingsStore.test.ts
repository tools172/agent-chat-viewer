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
    expect(settings.watchDirectories.some((d) => d.path === '/test/path')).toBe(true);
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
    expect(settings.watchDirectories.some((d) => d.path === '/test/path')).toBe(false);
  });

  it('should toggle watch directory enabled state', () => {
    useSettingsStore.getState().addWatchDirectory('/test/path');
    useSettingsStore.getState().toggleWatchDirectory('/test/path');
    const settings = useSettingsStore.getState().settings;
    const dir = settings.watchDirectories.find((d) => d.path === '/test/path');
    expect(dir?.enabled).toBe(false);
    // toggle back
    useSettingsStore.getState().toggleWatchDirectory('/test/path');
    const dir2 = useSettingsStore.getState().settings.watchDirectories.find((d) => d.path === '/test/path');
    expect(dir2?.enabled).toBe(true);
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

  it('should update session list style via setSetting', () => {
    useSettingsStore.getState().setSetting({ sessionListStyle: 'compact' });
    expect(useSettingsStore.getState().settings.sessionListStyle).toBe('compact');
    useSettingsStore.getState().setSetting({ sessionListStyle: 'loose' });
    expect(useSettingsStore.getState().settings.sessionListStyle).toBe('loose');
  });

  it('load() fills default sessionListStyle for legacy settings files', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockImplementation(
      async (cmd: string) => {
        if (cmd === 'load_settings') {
          // 模拟旧版设置文件：缺少 sessionListStyle
          return {
            watchDirectories: [],
            defaultFilter: {},
            providerEnabled: { claude_code: true },
            searchColors: { search: '#fef08a', find: '#fed7aa' },
          };
        }
        if (cmd === 'get_default_paths') return {};
        return undefined;
      }
    );

    await useSettingsStore.getState().load();

    expect(useSettingsStore.getState().settings.sessionListStyle).toBe('loose');
  });
});
