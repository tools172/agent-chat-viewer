import { useEffect, useCallback } from "react";
import { useSessionStore } from "../stores/sessionStore";
import { useSettingsStore } from "../stores/settingsStore";
import type { FilterConfig } from "../types";

// 后端请求用：始终加载全部内容块，前端侧再做用户过滤
const FULL_FILTER: FilterConfig = {
  showThinking: true,
  showToolCalls: true,
  showToolResults: true,
  hideEmptyToolResults: false,
  showSystemMessages: true,
  showFileSnapshots: false,
};

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
    (projectPath: string, providerName: string) => {
      selectProject(projectPath, providerName);
    },
    [selectProject],
  );

  // 始终用 FULL_FILTER 从后端加载全部内容块，
  // 用户过滤在前端侧通过 filterEvents() 完成，避免切换时重新请求。
  const handleSelectSession = useCallback(
    (sessionPath: string, providerName: string) => {
      selectSession(sessionPath, FULL_FILTER, providerName);
    },
    [selectSession],
  );

  const handleSearch = useCallback(
    (query: string) => {
      search(query, settings);
    },
    [search, settings],
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
