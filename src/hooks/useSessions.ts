import { useEffect, useCallback } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { useSettingsStore } from '../stores/settingsStore';
import type { FilterConfig } from '../types';

/**
 * Hook to load and manage session data.
 * Automatically loads projects on mount when settings are loaded.
 */
export function useSessions() {
  const settings = useSettingsStore((s) => s.settings);
  const isSettingsLoaded = useSettingsStore((s) => s.isLoaded);
  const {
    projects,
    sessions,
    currentSession,
    searchResults,
    viewMode,
    selectedProjectPath,
    selectedSessionPath,
    isLoading,
    isLoadingConversation,
    error,
    loadProjects,
    selectProject,
    selectSession,
    search,
    setViewMode,
    clearSelection,
    clearError,
  } = useSessionStore();

  // Load projects when settings are ready
  useEffect(() => {
    if (isSettingsLoaded) {
      loadProjects(settings);
    }
  }, [isSettingsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-load when settings change (e.g., new watch directory added)
  const reloadProjects = useCallback(() => {
    loadProjects(settings);
  }, [settings, loadProjects]);

  const handleSelectProject = useCallback(
    (projectPath: string) => {
      selectProject(projectPath, 'claude_code');
    },
    [selectProject]
  );

  const handleSelectSession = useCallback(
    (sessionPath: string) => {
      selectSession(sessionPath, settings.defaultFilter, 'claude_code');
    },
    [selectSession, settings.defaultFilter]
  );

  // 带显式 filter 参数的版本，避免闭包陈旧值问题。
  // 用于 FilterBar 切换后立即重新加载，此时 settings.defaultFilter 可能尚未更新。
  const selectSessionWithFilter = useCallback(
    (sessionPath: string, filter: FilterConfig) => {
      selectSession(sessionPath, filter, 'claude_code');
    },
    [selectSession]
  );

  const handleSearch = useCallback(
    (query: string) => {
      search(query, settings);
    },
    [search, settings]
  );

  return {
    // Data
    projects,
    sessions,
    currentSession,
    searchResults,
    // UI state
    viewMode,
    selectedProjectPath,
    selectedSessionPath,
    isLoading,
    isLoadingConversation,
    error,
    // Actions
    reloadProjects,
    selectProject: handleSelectProject,
    selectSession: handleSelectSession,
    selectSessionWithFilter,
    search: handleSearch,
    setViewMode,
    clearSelection,
    clearError,
  };
}
