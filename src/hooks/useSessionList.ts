import { useEffect, useCallback } from 'react';
import { useSessionListStore } from '../stores/sessionListStore';
import { useSettingsStore } from '../stores/settingsStore';

export function useSessionList() {
  const settings = useSettingsStore((s) => s.settings);
  const isSettingsLoaded = useSettingsStore((s) => s.isLoaded);

  const store = useSessionListStore();

  // 设置加载完成后，加载全部数据
  useEffect(() => {
    if (isSettingsLoaded) {
      store.loadProjects(settings);
      store.loadAllSessions(settings);
    }
  }, [isSettingsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(() => {
    store.loadProjects(settings);
    store.loadAllSessions(settings);
  }, [settings, store]);

  return {
    ...store,
    reload,
  };
}
