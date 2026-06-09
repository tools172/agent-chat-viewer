import React, { useState, useCallback } from 'react';
import { Download, MessageSquare } from 'lucide-react';
import { useSessions } from '../../hooks/useSessions';
import { useSessionList } from '../../hooks/useSessionList';
import { useSettingsStore } from '../../stores/settingsStore';
import { Sidebar } from './Sidebar';
import { FilterBar } from '../filter/FilterBar';
import { ConversationView } from '../conversation/ConversationView';
import { ExportDialog } from '../export/ExportDialog';
import { SettingsPanel } from '../settings/SettingsPanel';
import { EmptyState } from '../common/EmptyState';
import { ErrorBanner } from '../common/ErrorBanner';

export const MainLayout: React.FC = () => {
  // 会话列表 store
  const list = useSessionList();

  // 会话内容 store
  const {
    currentSession,
    selectedSessionPath,
    isLoadingConversation,
    error,
    selectSession,
    selectSessionWithFilter,
    clearSelection,
    clearError,
  } = useSessions();

  const { settings, updateFilter } = useSettingsStore();
  const [showExport, setShowExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeFilter, setActiveFilter] = useState(settings.defaultFilter);
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  // 当前激活的搜索高亮词（同时用于左侧列表和右侧对话内容）
  const [activeSearchHighlight, setActiveSearchHighlight] = useState<string | undefined>();

  // 选择会话：仅在搜索视图且高亮开启时传递高亮词
  const handleSelectSession = useCallback(
    (sessionPath: string) => {
      if (
        list.viewMode === 'search' &&
        localSearchQuery.trim() &&
        list.highlightEnabled
      ) {
        setActiveSearchHighlight(localSearchQuery);
      } else {
        setActiveSearchHighlight(undefined);
      }
      selectSession(sessionPath);
    },
    [selectSession, list.viewMode, localSearchQuery, list.highlightEnabled]
  );

  // 高亮开关变化时，同步更新激活的高亮
  React.useEffect(() => {
    if (!list.highlightEnabled) {
      setActiveSearchHighlight(undefined);
    } else if (list.viewMode === 'search' && localSearchQuery.trim()) {
      setActiveSearchHighlight(localSearchQuery);
    }
  }, [list.highlightEnabled, list.viewMode, localSearchQuery]);

  // 选择项目 → 也设置时间线过滤
  const handleSelectProject = useCallback(
    (projectPath: string) => {
      list.selectProject(projectPath, 'claude_code');
    },
    [list]
  );

  // 清除项目过滤
  const handleClearProjectFilter = useCallback(() => {
    list.setProjectFilter(null);
  }, [list]);

  // 排序
  const handleSortChange = useCallback(
    (config: import('../../types').SortConfig) => list.setSortConfig(config),
    [list]
  );

  // 搜索
  const handleSearch = useCallback(
    (query: string) => {
      list.search(query, settings);
    },
    [list, settings]
  );

  // 视图切换（文件夹视图自动设置项目过滤）
  const handleViewModeChange = useCallback(
    (mode: import('../../types').ViewMode) => {
      if (mode === 'by-project') {
        list.setProjectFilter(null);
      }
      list.setViewMode(mode);
    },
    [list]
  );

  // 过滤器变更
  const handleFilterChange = useCallback(
    (filterUpdate: Partial<typeof activeFilter>) => {
      const newFilter = { ...activeFilter, ...filterUpdate };
      setActiveFilter(newFilter);
      updateFilter(filterUpdate);
      if (selectedSessionPath) {
        // 使用 selectSessionWithFilter 传递显式的 newFilter，
        // 避免 selectSession 闭包捕获到旧的 settings.defaultFilter
        selectSessionWithFilter(selectedSessionPath, newFilter);
      }
    },
    [updateFilter, selectedSessionPath, selectSessionWithFilter, activeFilter]
  );

  // 获取会话标题
  const sessionTitle =
    currentSession?.events
      ?.find((e) => e.eventType === 'user')
      ?.content?.find((b) => b.blockType === 'text')?.text?.slice(0, 60) ||
    'Untitled';

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        viewMode={list.viewMode}
        sortConfig={list.sortConfig}
        projects={list.projects}
        allSessions={list.allSessions}
        projectSessions={list.projectSessions}
        searchQuery={localSearchQuery}
        searchResults={list.searchResults}
        highlightEnabled={list.highlightEnabled}
        isSearching={list.isLoadingSearch}
        isLoadingAll={list.isLoadingAll}
        isLoadingProject={list.isLoadingProject}
        projectFilter={list.projectFilter}
        selectedProjectPath={list.projectFilter}
        selectedSessionPath={selectedSessionPath}
        onViewModeChange={handleViewModeChange}
        onSortChange={handleSortChange}
        onSelectProject={handleSelectProject}
        onSelectSession={handleSelectSession}
        onSearchQueryChange={setLocalSearchQuery}
        onSearch={handleSearch}
        onToggleHighlight={list.toggleHighlight}
        onClearProjectFilter={handleClearProjectFilter}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {error && <ErrorBanner message={error} onDismiss={clearError} />}

        {currentSession ? (
          <>
            <div className="px-4 py-2 border-b bg-white">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={clearSelection}
                    className="text-xs text-gray-500 hover:text-gray-700 flex-shrink-0"
                  >
                    ← 返回
                  </button>
                  <h2
                    className="text-sm font-medium text-gray-800 truncate"
                    title={sessionTitle}
                  >
                    {sessionTitle}
                  </h2>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setShowExport(true)}
                    className="flex items-center gap-1.5 px-3 py-1 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    导出
                  </button>
                </div>
              </div>
              <FilterBar
                filter={activeFilter}
                onChange={handleFilterChange}
              />
            </div>

            <div className="flex-1 overflow-hidden">
              <ConversationView
                events={currentSession.events}
                isLoading={isLoadingConversation}
                searchHighlight={activeSearchHighlight}
              />
            </div>
          </>
        ) : (
          <EmptyState
            icon={<MessageSquare className="h-20 w-20" />}
            title="选择一个会话查看聊天记录"
            description="使用左侧面板浏览项目或搜索会话。"
          />
        )}
      </div>

      {/* Dialogs */}
      {showExport && currentSession && (
        <ExportDialog
          sessionPath={currentSession.filePath}
          sessionTitle={sessionTitle}
          onClose={() => setShowExport(false)}
        />
      )}

      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
};
