import React, { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import {
  Download,
  FolderOpen,
  Folder,
  Copy,
  Check,
  Hash,
  RefreshCw,
  Layout,
  Undo2,
} from 'lucide-react';
import { useSessionList } from '../../hooks/useSessionList';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTabStore } from '../../stores/tabStore';
import { SessionNavigator } from './SessionNavigator';
import { TabBar } from '../tabs/TabBar';
import { TabContextMenu, type TabContextAction } from '../tabs/TabContextMenu';
import { TabContent } from '../tabs/TabContent';
import { ExportDialog } from '../export/ExportDialog';
import { SettingsPanel } from '../settings/SettingsPanel';
import { EmptyState } from '../common/EmptyState';
import { LoadingOverlay } from '../common/LoadingOverlay';
import * as tauri from '../../utils/tauri';

export const MainLayout: React.FC = () => {
  // 会话列表 store
  const list = useSessionList();

  // 标签页 store
  const {
    tabs,
    activeTabId,
    closedTabs,
    tabOrder,
    openTab,
    closeTab,
    activateTab,
    closeOtherTabs,
    closeTabsToRight,
    closeAllTabs,
    reopenClosedTab,
    togglePinTab,
    moveTab,
    updateTabFilter,
    updateTabFindBar,
    refreshTab,
  } = useTabStore();

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) ?? null,
    [tabs, activeTabId]
  );

  const { settings } = useSettingsStore();
  const [showExport, setShowExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  // 当前激活的搜索高亮词（同时用于左侧列表和右侧对话内容）
  const [activeSearchHighlight, setActiveSearchHighlight] = useState<string | undefined>();

  // 标签栏右键菜单
  const [tabContextMenu, setTabContextMenu] = useState<{
    x: number;
    y: number;
    tabId: string;
  } | null>(null);

  // 对话区域右键菜单
  const [convContextMenu, setConvContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [copiedPath, setCopiedPath] = useState(false);
  const convMenuRef = useRef<HTMLDivElement>(null);

  // 对话区域右键菜单 — 点击外部关闭
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

  // 调整对话区域菜单位置
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

  // 高亮开关变化时，同步更新激活的高亮
  useEffect(() => {
    if (!list.highlightEnabled) {
      setActiveSearchHighlight(undefined);
    } else if (list.viewMode === 'search' && localSearchQuery.trim()) {
      setActiveSearchHighlight(localSearchQuery);
    }
  }, [list.highlightEnabled, list.viewMode, localSearchQuery]);

  // 搜索高亮变化时，同步到 activeTab
  useEffect(() => {
    if (activeTabId) {
      useTabStore
        .getState()
        .updateTabSearchHighlight(activeTabId, activeSearchHighlight);
    }
  }, [activeSearchHighlight, activeTabId]);

  // 选择工作目录
  const handleSelectProject = useCallback(
    (projectPath: string, providerName: string) => {
      list.selectProject(projectPath, providerName);
    },
    [list]
  );

  const handleClearProjectFilter = useCallback(() => {
    list.setProjectFilter(null);
  }, [list]);

  const handleSortChange = useCallback(
    (config: import('../../types').SortConfig) => list.setSortConfig(config),
    [list]
  );

  const handleSearch = useCallback(
    (query: string) => {
      list.search(query, settings);
    },
    [list, settings]
  );

  const handleViewModeChange = useCallback(
    (mode: import('../../types').ViewMode) => {
      if (mode === 'by-project') {
        list.setProjectFilter(null);
      }
      list.setViewMode(mode);
    },
    [list]
  );

  // === 标签栏操作 ===

  const handleTabContextMenu = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.preventDefault();
      setTabContextMenu({ x: e.clientX, y: e.clientY, tabId });
    },
    []
  );

  const handleTabContextAction = useCallback(
    async (action: TabContextAction, tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;

      switch (action) {
        case 'refresh':
          refreshTab(tabId);
          break;
        case 'togglePin':
          togglePinTab(tabId);
          break;
        case 'close':
          closeTab(tabId);
          break;
        case 'closeOthers':
          closeOtherTabs(tabId);
          break;
        case 'closeToRight':
          closeTabsToRight(tabId);
          break;
        case 'closeAll':
          closeAllTabs();
          break;
        case 'copyPath':
          try {
            await navigator.clipboard.writeText(tab.sessionPath);
          } catch { /* ignore */ }
          break;
        case 'copyId':
          if (tab.sessionDetail?.id) {
            try {
              await navigator.clipboard.writeText(tab.sessionDetail.id);
            } catch { /* ignore */ }
          }
          break;
        case 'openFolder':
          try {
            await tauri.openContainingFolder(tab.sessionPath);
          } catch (err) {
            console.error('打开文件夹失败:', err);
          }
          break;
        case 'openProjectFolder': {
          // 查找该会话的工作目录
          const session = list.allSessions.find(
            (s) => s.filePath === tab.sessionPath
          );
          const projectDir = session?.cwd || session?.projectPath;
          if (projectDir) {
            try {
              await tauri.openProjectFolder(projectDir);
            } catch (err) {
              console.error('打开工作目录失败:', err);
            }
          }
          break;
        }
        case 'export':
          activateTab(tabId);
          setShowExport(true);
          break;
      }
    },
    [
      tabs,
      list.allSessions,
      refreshTab,
      togglePinTab,
      closeTab,
      closeOtherTabs,
      closeTabsToRight,
      closeAllTabs,
      activateTab,
    ]
  );

  const handleConvContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setConvContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleOpenSessionFolder = async () => {
    setConvContextMenu(null);
    if (!activeTab?.sessionPath) return;
    try {
      await tauri.openContainingFolder(activeTab.sessionPath);
    } catch (err) {
      console.error('打开文件夹失败:', err);
    }
  };

  const handleCopySessionPath = async () => {
    setConvContextMenu(null);
    if (!activeTab?.sessionPath) return;
    try {
      await navigator.clipboard.writeText(activeTab.sessionPath);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    } catch (err) {
      console.error('复制路径失败:', err);
    }
  };

  const handleCopySessionId = async () => {
    setConvContextMenu(null);
    if (!activeTab?.sessionDetail?.id) return;
    try {
      await navigator.clipboard.writeText(activeTab.sessionDetail.id);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    } catch (err) {
      console.error('复制会话ID失败:', err);
    }
  };

  const handleRefreshSession = () => {
    setConvContextMenu(null);
    if (activeTabId) refreshTab(activeTabId);
  };

  // 合并所有已知会话来源，去重（路径归一化处理）
  const allKnownSessions = useMemo(() => {
    const seen = new Set<string>();
    const merged: import('../../types').SessionSummary[] = [];
    for (const s of [
      ...list.allSessions,
      ...list.searchResults,
      ...list.projectSessions,
    ]) {
      const normalized = s.filePath.replace(/\\/g, '/');
      if (!seen.has(normalized)) {
        seen.add(normalized);
        merged.push(s);
      }
    }
    return merged;
  }, [list.allSessions, list.searchResults, list.projectSessions]);

  // 获取当前会话的工作目录（用于右键菜单等）
  const currentProjectPath = useMemo(() => {
    if (!activeTab?.sessionPath) return null;
    const normalizedPath = activeTab.sessionPath.replace(/\\/g, '/');
    const session = allKnownSessions.find(
      (s) => s.filePath.replace(/\\/g, '/') === normalizedPath
    );
    if (!session) return null;
    return session.cwd || session.projectPath;
  }, [activeTab?.sessionPath, allKnownSessions]);

  // === 会话选择 ===

  /** 单击会话 → 在当前激活标签页打开（无标签则新建并激活） */
  const handleSelectSession = useCallback(
    (sessionPath: string, providerName: string, cwd?: string) => {
      if (
        list.viewMode === 'search' &&
        localSearchQuery.trim() &&
        list.highlightEnabled
      ) {
        setActiveSearchHighlight(localSearchQuery);
      } else {
        setActiveSearchHighlight(undefined);
      }
      openTab(sessionPath, providerName, true, cwd);
    },
    [openTab, list.viewMode, localSearchQuery, list.highlightEnabled]
  );

  /** Ctrl+Click / 中键 / 右键菜单 → 在后台新标签页打开 */
  const handleOpenInNewTab = useCallback(
    (sessionPath: string, providerName: string, cwd?: string) => {
      openTab(sessionPath, providerName, false, cwd);
    },
    [openTab]
  );

  const handleOpenProjectFolder = async () => {
    setConvContextMenu(null);
    if (!currentProjectPath) return;
    try {
      await tauri.openProjectFolder(currentProjectPath);
    } catch (err) {
      console.error('打开工作目录失败:', err);
    }
  };

  // === keepAlive 排名计算 ===
  const keepAliveRanks = useMemo(() => {
    const ranks = new Map<string, number>();
    tabOrder.forEach((id, i) => {
      ranks.set(id, i);
    });
    // 未在 tabOrder 中的 tab 给一个很大的 rank
    tabs.forEach((t) => {
      if (!ranks.has(t.id)) ranks.set(t.id, 999);
    });
    return ranks;
  }, [tabs, tabOrder]);

  const getKeepAliveRank = useCallback(
    (tabId: string) => keepAliveRanks.get(tabId) ?? 999,
    [keepAliveRanks]
  );

  // === 导出 ===
  const exportSessionTitle = activeTab?.title || 'Untitled';
  const exportSessionPath = activeTab?.sessionPath || '';
  const exportProviderName = activeTab?.providerName || 'claude_code';

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
        selectedSessionPath={activeTab?.sessionPath ?? null}
        sidebarWidth={settings.sidebarWidth ?? 320}
        onViewModeChange={handleViewModeChange}
        onSortChange={handleSortChange}
        onSelectProject={handleSelectProject}
        onSelectSession={handleSelectSession}
        onOpenInNewTab={handleOpenInNewTab}
        onSearchQueryChange={setLocalSearchQuery}
        onSearch={handleSearch}
        onToggleHighlight={list.toggleHighlight}
        onClearProjectFilter={handleClearProjectFilter}
        onOpenSettings={() => setShowSettings(true)}
        onRefresh={list.reload}
      />

      {/* 右侧：标签页系统 */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeTab ? (
          <>
            {/* 标签栏 */}
            <TabBar
              tabs={tabs}
              activeTabId={activeTabId}
              onActivateTab={activateTab}
              onCloseTab={closeTab}
              onMoveTab={moveTab}
              onOpenContextMenu={handleTabContextMenu}
            />

            {/* 标签页内容 */}
            <div
              className="flex-1 flex flex-col min-h-0"
              onContextMenu={handleConvContextMenu}
            >
              {tabs.map((tab) => (
                <TabContent
                  key={tab.id}
                  tab={tab}
                  isActive={tab.id === activeTabId}
                  keepAliveRank={getKeepAliveRank(tab.id)}
                  onFilterChange={updateTabFilter}
                  onFindBarToggle={updateTabFindBar}
                />
              ))}
            </div>

            {/* 标签栏右键菜单 */}
            {tabContextMenu && (
              <TabContextMenu
                x={tabContextMenu.x}
                y={tabContextMenu.y}
                tabId={tabContextMenu.tabId}
                isPinned={
                  tabs.find((t) => t.id === tabContextMenu.tabId)?.pinned ??
                  false
                }
                sessionPath={
                  tabs.find((t) => t.id === tabContextMenu.tabId)
                    ?.sessionPath ?? ''
                }
                sessionId={
                  tabs.find((t) => t.id === tabContextMenu.tabId)
                    ?.sessionDetail?.id
                }
                onAction={handleTabContextAction}
                onClose={() => setTabContextMenu(null)}
              />
            )}

            {/* 对话区域右键菜单 */}
            {convContextMenu && activeTab && (
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
          /* 无标签页时的空状态 */
          <EmptyState
            icon={<Layout className="h-20 w-20" />}
            title="打开一个会话开始查看"
            description="从左侧面板选择会话，或使用搜索找到您想查看的聊天记录。"
            action={
              closedTabs.length > 0 ? (
                <button
                  onClick={reopenClosedTab}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  <Undo2 className="h-4 w-4" />
                  恢复最近关闭的标签页
                </button>
              ) : undefined
            }
          />
        )}
      </div>

      {/* Dialogs */}
      {showExport && activeTab && (
        <ExportDialog
          sessionPath={exportSessionPath}
          sessionTitle={exportSessionTitle}
          providerName={exportProviderName}
          onClose={() => setShowExport(false)}
        />
      )}

      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          onSettingsSaved={() => list.reload()}
        />
      )}

      {/* 首次加载 — 半透明遮罩 */}
      {list.isLoadingAll && list.allSessions.length === 0 && (
        <LoadingOverlay />
      )}
    </div>
  );
};
