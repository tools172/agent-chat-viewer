import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  List,
  Folder,
  Clock,
  Search,
  MessageSquare,
  Database,
  RefreshCw,
} from 'lucide-react';
import type { ViewMode, Project, SessionSummary, SortConfig } from '../../types';
import { FlatSessionList } from '../sessions/FlatSessionList';
import { ProjectList } from '../projects/ProjectList';
import { TimelineView } from '../sessions/TimelineView';
import { SearchPanel } from '../search/SearchPanel';
import SortBar from '../filter/SortBar';
import { LoadingSkeleton } from '../common/LoadingSkeleton';
import { LoadingBar } from '../common/LoadingBar';
import { useSettingsStore } from '../../stores/settingsStore';
import { version } from '../../../package.json';

const MIN_WIDTH = 200;
const MAX_WIDTH = 600;

interface ViewDef {
  mode: ViewMode;
  label: string;
  icon: React.ReactNode;
}

const VIEWS: ViewDef[] = [
  { mode: 'flat', label: '全部', icon: <List className="h-4 w-4" /> },
  { mode: 'by-project', label: '文件夹', icon: <Folder className="h-4 w-4" /> },
  { mode: 'by-time', label: '时间线', icon: <Clock className="h-4 w-4" /> },
  { mode: 'search', label: '搜索', icon: <Search className="h-4 w-4" /> },
];

interface SessionNavigatorProps {
  viewMode: ViewMode;
  sortConfig: SortConfig;
  projects: Project[];
  allSessions: SessionSummary[];
  projectSessionsCache: Record<string, SessionSummary[]>;
  searchQuery: string;
  searchResults: SessionSummary[];
  highlightEnabled: boolean;
  isSearching: boolean;
  isLoadingAll: boolean;
  isLoadingProject: boolean;
  isRefreshing?: boolean;
  projectFilter: string | null;
  selectedProjectPath: string | null;
  selectedSessionPath: string | null;
  sidebarWidth?: number;
  onViewModeChange: (mode: ViewMode) => void;
  onSortChange: (config: SortConfig) => void;
  onSelectProject: (path: string, providerName: string) => void;
  onSelectSession: (path: string, providerName: string, cwd?: string) => void;
  onOpenInNewTab?: (path: string, providerName: string, cwd?: string) => void;
  onSearchQueryChange: (query: string) => void;
  onSearch: (query: string) => void;
  onToggleHighlight: () => void;
  onClearProjectFilter: () => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
}

export const SessionNavigator: React.FC<SessionNavigatorProps> = ({
  viewMode,
  sortConfig,
  projects,
  allSessions,
  projectSessionsCache,
  searchQuery,
  searchResults,
  highlightEnabled,
  isSearching,
  isLoadingAll,
  isLoadingProject,
  isRefreshing = false,
  projectFilter,
  selectedProjectPath,
  selectedSessionPath,
  sidebarWidth = 320,
  onViewModeChange,
  onSortChange,
  onSelectProject,
  onSelectSession,
  onOpenInNewTab,
  onSearchQueryChange,
  onSearch,
  onToggleHighlight,
  onClearProjectFilter,
  onOpenSettings,
  onRefresh,
}) => {
  const store = useSettingsStore();
  const totalSessions =
    allSessions.length > 0
      ? allSessions.length
      : projects.reduce((s, p) => s + p.sessionCount, 0);

  // ---- 拖拽调整宽度 ----
  const [width, setWidth] = useState(sidebarWidth);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWRef = useRef(0);

  // 同步外部 prop 变化（如设置面板滑块调整）
  useEffect(() => {
    if (!draggingRef.current) {
      setWidth(sidebarWidth);
    }
  }, [sidebarWidth]);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startWRef.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const delta = e.clientX - startXRef.current; // 右拖 = 变宽
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWRef.current + delta));
      setWidth(next);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      store.updateSidebarWidth(width);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [width, store]);

  return (
    <div
      className="flex-shrink-0 border-r border-gray-200 bg-white flex flex-col h-full relative"
      style={{ width: `${width}px` }}
    >
      {/* 拖拽手柄（右侧边缘） */}
      <div
        onMouseDown={onDragStart}
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary-400/50 transition-colors z-10"
        title="拖拽调整宽度"
      />
      {/* 重载进度条 */}
      <LoadingBar
        visible={
          (isLoadingAll && allSessions.length > 0) ||
          (isLoadingProject && (projectFilter ? (projectSessionsCache[projectFilter]?.length ?? 0) > 0 : false)) ||
          (isSearching && searchResults.length > 0)
        }
      />

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary-600" />
            <h1 className="font-semibold text-sm text-gray-800">
              聊天记录浏览器
            </h1>
            <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full font-mono">
              v{version}
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
              title="刷新列表"
            >
              <RefreshCw
                className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
              />
            </button>
            <button
              onClick={onOpenSettings}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
              title="设置"
            >
              ⚙️
            </button>
          </div>
        </div>

        {/* 视图 Tab（4个） */}
        <div className="flex bg-gray-100 rounded-lg p-0.5 mb-2">
          {VIEWS.map(({ mode, label, icon }) => (
            <button
              key={mode}
              onClick={() => onViewModeChange(mode)}
              className={`flex items-center justify-center gap-1 flex-1 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
                viewMode === mode
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {icon}
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* 排序栏（所有视图统一可用） */}
        <SortBar config={sortConfig} onChange={onSortChange} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {viewMode === 'flat' && (
          isLoadingAll && allSessions.length === 0 ? (
            <LoadingSkeleton rows={8} variant="list" />
          ) : (
            <FlatSessionList
              sessions={allSessions}
              sortConfig={sortConfig}
              selectedSessionPath={selectedSessionPath}
              onSelectSession={onSelectSession}
              onOpenInNewTab={onOpenInNewTab}
            />
          )
        )}

        {viewMode === 'by-project' && (
          isLoadingAll && projects.length === 0 ? (
            <LoadingSkeleton rows={6} variant="list" />
          ) : (
            <ProjectList
              projects={projects}
              sessionsCache={projectSessionsCache}
              allSessions={allSessions}
              sortConfig={sortConfig}
              selectedProjectPath={selectedProjectPath}
              selectedSessionPath={selectedSessionPath}
              onSelectProject={onSelectProject}
              onSelectSession={onSelectSession}
              onOpenInNewTab={onOpenInNewTab}
              isLoadingProject={isLoadingProject}
            />
          )
        )}

        {viewMode === 'by-time' && (
          isLoadingAll && allSessions.length === 0 ? (
            <LoadingSkeleton rows={8} variant="list" />
          ) : (
            <TimelineView
              sessions={
                projectFilter ? (projectSessionsCache[projectFilter] ?? []) : allSessions
              }
              sortConfig={sortConfig}
              selectedSessionPath={selectedSessionPath}
              filterContext={projectFilter ?? 'all'}
              filterContextLabel={
                projectFilter
                  ? projects.find((p) => p.path === projectFilter)?.name
                  : undefined
              }
              onSelectSession={onSelectSession}
              onOpenInNewTab={onOpenInNewTab}
              onClearFilter={
                projectFilter ? onClearProjectFilter : undefined
              }
            />
          )
        )}

        {viewMode === 'search' && (
          <SearchPanel
            query={searchQuery}
            results={searchResults}
            isLoading={isSearching}
            highlightEnabled={highlightEnabled}
            onQueryChange={onSearchQueryChange}
            onSearch={onSearch}
            onSelectSession={onSelectSession}
            onOpenInNewTab={onOpenInNewTab}
            onToggleHighlight={onToggleHighlight}
            selectedSessionPath={selectedSessionPath}
          />
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Database className="h-3 w-3" />
          <span>
            {projects.length} 个工作目录 · {totalSessions} 个会话
          </span>
        </div>
      </div>
    </div>
  );
};
