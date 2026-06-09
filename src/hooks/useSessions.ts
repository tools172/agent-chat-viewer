import { useEffect, useCallback } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { useSettingsStore } from '../stores/settingsStore';

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
    search: handleSearch,
    setViewMode,
    clearSelection,
    clearError,
  };
}
