import React, { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import {
  Download,
  MessageSquare,
  FolderOpen,
  Folder,
  Copy,
  Check,
  Hash,
  RefreshCw,
} from 'lucide-react';
import { useSessions } from '../../hooks/useSessions';
import { useSessionList } from '../../hooks/useSessionList';
import { useSettingsStore } from '../../stores/settingsStore';
import { filterEvents, collapseConsecutiveEvents } from '../../utils/filterEvents';
import { SessionNavigator } from './SessionNavigator';
import { FilterBar } from '../filter/FilterBar';
import { ConversationView } from '../conversation/ConversationView';
import { TurnNavigator } from '../conversation/TurnNavigator';
import { ExportDialog } from '../export/ExportDialog';
import { SettingsPanel } from '../settings/SettingsPanel';
import { EmptyState } from '../common/EmptyState';
import { ErrorBanner } from '../common/ErrorBanner';
import { LoadingOverlay } from '../common/LoadingOverlay';
import * as tauri from '../../utils/tauri';

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
    clearError,
  } = useSessions();

  const { settings, updateFilter } = useSettingsStore();
  const [showExport, setShowExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeFilter, setActiveFilter] = useState(settings.defaultFilter);
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  // 当前激活的搜索高亮词（同时用于左侧列表和右侧对话内容）
  const [activeSearchHighlight, setActiveSearchHighlight] = useState<string | undefined>();
  const [showFindBar, setShowFindBar] = useState(false);
  const [convStats, setConvStats] = useState<{ totalEvents: number; userCount: number; assistantCount: number; thinkingCount: number; toolCallCount: number } | null>(null);

  // 对话滚动容器 ref（供 TurnNavigator 使用，需包含 null 以支持赋值）
  const convScrollRef = useRef<HTMLDivElement | null>(null);

  // 右键菜单
  const [convContextMenu, setConvContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [copiedPath, setCopiedPath] = useState(false);
  const convMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!convContextMenu) return;
    const handler = (e: MouseEvent) => {
      if (convMenuRef.current && !convMenuRef.current.contains(e.target as Node)) {
        setConvContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [convContextMenu]);

  // 调整菜单位置不超出视口边界
  useLayoutEffect(() => {
    if (!convContextMenu || !convMenuRef.current) return;
    const rect = convMenuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 8;
    if (convContextMenu.x + rect.width > vw) {
      convMenuRef.current.style.left = `${Math.max(gap, vw - rect.width - gap)}px`;
    }
    if (convContextMenu.y + rect.height > vh) {
      convMenuRef.current.style.top = `${Math.max(gap, vh - rect.height - gap)}px`;
    }
  }, [convContextMenu]);

  const handleConvContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setConvContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleOpenSessionFolder = async () => {
    setConvContextMenu(null);
    if (!currentSession?.filePath) return;
    try {
      await tauri.openContainingFolder(currentSession.filePath);
    } catch (err) {
      console.error('打开文件夹失败:', err);
    }
  };

  const handleCopySessionPath = async () => {
    setConvContextMenu(null);
    if (!currentSession?.filePath) return;
    try {
      await navigator.clipboard.writeText(currentSession.filePath);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    } catch (err) {
      console.error('复制路径失败:', err);
    }
  };

  const handleCopySessionId = async () => {
    setConvContextMenu(null);
    if (!currentSession?.id) return;
    try {
      await navigator.clipboard.writeText(currentSession.id);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    } catch (err) {
      console.error('复制会话ID失败:', err);
    }
  };

  const handleRefreshSession = () => {
    setConvContextMenu(null);
    if (!currentSession?.filePath || !currentSession?.providerName) return;
    selectSession(currentSession.filePath, currentSession.providerName);
  };

  const handleOpenProjectFolder = async () => {
    setConvContextMenu(null);
    if (!currentProjectPath) return;
    try {
      await tauri.openProjectFolder(currentProjectPath);
    } catch (err) {
      console.error('打开工作目录失败:', err);
    }
  };

  // 选择会话：仅在搜索视图且高亮开启时传递高亮词
  const handleSelectSession = useCallback(
    (sessionPath: string, providerName: string) => {
      if (
        list.viewMode === 'search' &&
        localSearchQuery.trim() &&
        list.highlightEnabled
      ) {
        setActiveSearchHighlight(localSearchQuery);
      } else {
        setActiveSearchHighlight(undefined);
      }
      selectSession(sessionPath, providerName);
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

  // 选择工作目录 → 也设置时间线过滤
  const handleSelectProject = useCallback(
    (projectPath: string, providerName: string) => {
      list.selectProject(projectPath, providerName);
    },
    [list]
  );

  // 清除工作目录过滤
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

  // 视图切换（文件夹视图自动设置工作目录过滤）
  const handleViewModeChange = useCallback(
    (mode: import('../../types').ViewMode) => {
      if (mode === 'by-project') {
        list.setProjectFilter(null);
      }
      list.setViewMode(mode);
    },
    [list]
  );

  // 过滤器变更 — 纯前端过滤，不重新请求后端
  const handleFilterChange = useCallback(
    (filterUpdate: Partial<typeof activeFilter>) => {
      const newFilter = { ...activeFilter, ...filterUpdate };
      setActiveFilter(newFilter);
      updateFilter(filterUpdate);
    },
    [updateFilter, activeFilter]
  );

  // 前端侧过滤：后端返回全量事件，这里按 activeFilter 筛选
  const filteredEvents = useMemo(() => {
    if (!currentSession) return [];
    const filtered = filterEvents(currentSession.events, activeFilter);
    if (activeFilter.collapseConsecutive) {
      return collapseConsecutiveEvents(filtered);
    }
    return filtered;
  }, [currentSession, activeFilter]);

  // 获取会话标题
  const sessionTitle =
    currentSession?.events
      ?.find((e) => e.eventType === 'user')
      ?.content?.find((b) => b.blockType === 'text')?.text?.slice(0, 60) ||
    'Untitled';

  // 从会话列表查找当前会话的工作目录（优先 cwd，即实际工作目录）
  const currentProjectPath = useMemo(() => {
    if (!selectedSessionPath) return null;
    const session = list.allSessions.find(
      (s) => s.filePath === selectedSessionPath
    );
    if (!session) return null;
    return session.cwd || session.projectPath;
  }, [selectedSessionPath, list.allSessions]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* 会话导航 */}
      <SessionNavigator
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
        isRefreshing={list.isRefreshing}
        projectFilter={list.projectFilter}
        selectedProjectPath={list.projectFilter}
        selectedSessionPath={selectedSessionPath}
        sidebarWidth={settings.sidebarWidth ?? 320}
        onViewModeChange={handleViewModeChange}
        onSortChange={handleSortChange}
        onSelectProject={handleSelectProject}
        onSelectSession={handleSelectSession}
        onSearchQueryChange={setLocalSearchQuery}
        onSearch={handleSearch}
        onToggleHighlight={list.toggleHighlight}
        onClearProjectFilter={handleClearProjectFilter}
        onOpenSettings={() => setShowSettings(true)}
        onRefresh={list.reload}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {error && <ErrorBanner message={error} onDismiss={clearError} />}

        {currentSession ? (
          <>
            <div className="px-4 py-2 border-b bg-white">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-3 min-w-0">
                  <h2
                    className="text-sm font-medium text-gray-800 truncate"
                    title={currentProjectPath ? `工作目录: ${currentProjectPath}\n存储路径: ${currentSession?.filePath || ''}` : sessionTitle}
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
                stats={convStats ?? undefined}
                showFindBar={showFindBar}
                onToggleFind={() => setShowFindBar((v) => !v)}
              />
            </div>

            <div
              className="flex-1 flex overflow-hidden"
              onContextMenu={handleConvContextMenu}
            >
              <ConversationView
                events={filteredEvents}
                isLoading={isLoadingConversation}
                searchHighlight={activeSearchHighlight}
                scrollHostRef={convScrollRef}
                showFindBar={showFindBar}
                onToggleFind={() => setShowFindBar((v) => !v)}
                onStatsChange={setConvStats}
              />
              <TurnNavigator
                events={filteredEvents}
                containerRef={convScrollRef}
                defaultWidth={settings.navigatorWidth ?? 256}
              />
            </div>

            {/* 对话区域右键菜单 */}
            {convContextMenu && currentSession && (
              <div
                ref={convMenuRef}
                className="fixed z-[100] bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[200px]"
                style={{ left: convContextMenu.x, top: convContextMenu.y }}
              >
                <button
                  onClick={handleRefreshSession}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <RefreshCw className="h-4 w-4 text-gray-400" />
                  刷新
                </button>
                <div className="border-t border-gray-100 my-1" />
                <button
                  onClick={handleOpenSessionFolder}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <FolderOpen className="h-4 w-4 text-gray-400" />
                  打开所在文件夹
                </button>
                <button
                  onClick={handleOpenProjectFolder}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <Folder className="h-4 w-4 text-gray-400" />
                  打开工作目录
                </button>
                <button
                  onClick={handleCopySessionPath}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  {copiedPath ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4 text-gray-400" />
                  )}
                  复制文件路径
                </button>
                <button
                  onClick={handleCopySessionId}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <Hash className="h-4 w-4 text-gray-400" />
                  复制会话 ID
                </button>
                <div className="border-t border-gray-100 my-1" />
                <button
                  onClick={() => {
                    setConvContextMenu(null);
                    setShowExport(true);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <Download className="h-4 w-4 text-gray-400" />
                  导出会话...
                </button>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={<MessageSquare className="h-20 w-20" />}
            title="选择一个会话查看聊天记录"
            description="使用左侧面板浏览工作目录或搜索会话。"
          />
        )}
      </div>

      {/* Dialogs */}
      {showExport && currentSession && (
        <ExportDialog
          sessionPath={currentSession.filePath}
          sessionTitle={sessionTitle}
          providerName={currentSession.providerName || 'claude_code'}
          onClose={() => setShowExport(false)}
        />
      )}

      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          onSettingsSaved={() => list.reload()}
        />
      )}

      {/* 首次加载会话数据 — 半透明遮罩浮在页面上方 */}
      {list.isLoadingAll && list.allSessions.length === 0 && (
        <LoadingOverlay />
      )}
    </div>
  );
};
