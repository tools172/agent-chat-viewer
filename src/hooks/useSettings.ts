import { useEffect } from 'react';
import { useSettingsStore } from '../stores/settingsStore';

/**
 * Hook to load and manage application settings.
 */
export function useSettings() {
  const store = useSettingsStore();

  useEffect(() => {
    if (!store.isLoaded) {
      store.load();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return store;
}
