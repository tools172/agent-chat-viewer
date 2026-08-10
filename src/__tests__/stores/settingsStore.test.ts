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
    // 旧版文件无 settingsPanelOffset → 保持缺省（组件按停靠右侧处理）
    expect(useSettingsStore.getState().settings.settingsPanelOffset).toBeUndefined();
    // 旧版文件无 settingsPanelOpacity → 默认不透明度 0.8（透明度 20%）
    expect(useSettingsStore.getState().settings.settingsPanelOpacity).toBe(0.8);
    // 旧版文件无 settingsPanelGlass → 默认开启毛玻璃（true）
    expect(useSettingsStore.getState().settings.settingsPanelGlass).toBe(true);
  });

  it('should update settings panel offset and opacity via dedicated actions', () => {
    // 偏移以比例(0~1)存储
    useSettingsStore.getState().updateSettingsPanelOffset(0.5);
    expect(useSettingsStore.getState().settings.settingsPanelOffset).toBe(0.5);
    // 比例被钳制在 0~1
    useSettingsStore.getState().updateSettingsPanelOffset(2);
    expect(useSettingsStore.getState().settings.settingsPanelOffset).toBe(1);
    useSettingsStore.getState().updateSettingsPanelOffset(-1);
    expect(useSettingsStore.getState().settings.settingsPanelOffset).toBe(0);

    useSettingsStore.getState().updateSettingsPanelOpacity(0.5);
    expect(useSettingsStore.getState().settings.settingsPanelOpacity).toBe(0.5);
    // 超出上下限时被钳制：保底不会全透明
    useSettingsStore.getState().updateSettingsPanelOpacity(1);
    expect(useSettingsStore.getState().settings.settingsPanelOpacity).toBe(0.95);
    useSettingsStore.getState().updateSettingsPanelOpacity(0);
    expect(useSettingsStore.getState().settings.settingsPanelOpacity).toBe(0.05);

    useSettingsStore.getState().updateSettingsPanelGlass(true);
    expect(useSettingsStore.getState().settings.settingsPanelGlass).toBe(true);
    useSettingsStore.getState().updateSettingsPanelGlass(false);
    expect(useSettingsStore.getState().settings.settingsPanelGlass).toBe(false);
  });
});
