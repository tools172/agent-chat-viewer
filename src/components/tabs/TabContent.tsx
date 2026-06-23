import React, { useMemo, useRef } from 'react';
import { MessageSquare, AlertCircle } from 'lucide-react';
import type { TabState, FilterConfig } from '../../types';
import { useSettingsStore } from '../../stores/settingsStore';
import { filterEvents, collapseConsecutiveEvents } from '../../utils/filterEvents';
import { FilterBar } from '../filter/FilterBar';
import { ConversationView } from '../conversation/ConversationView';
import { TurnNavigator } from '../conversation/TurnNavigator';
import { EmptyState } from '../common/EmptyState';
import { LoadingSpinner } from '../common/LoadingSpinner';

interface TabContentProps {
  tab: TabState;
  isActive: boolean;
  keepAliveRank: number;
  onFilterChange: (tabId: string, filter: Partial<FilterConfig>) => void;
  onFindBarToggle: (tabId: string, show: boolean) => void;
}

export const TabContent: React.FC<TabContentProps> = React.memo(
  ({
    tab,
    isActive,
    keepAliveRank,
    onFilterChange,
    onFindBarToggle,
  }) => {
  const navigatorWidth = useSettingsStore((s) => s.settings.navigatorWidth ?? 256);
  const autoSavePanelWidths = useSettingsStore((s) => s.settings.autoSavePanelWidths);
  const updateNavigatorWidth = useSettingsStore((s) => s.updateNavigatorWidth);
  const scrollHostRef = useRef<HTMLDivElement | null>(null);
  const [convStats, setConvStats] = React.useState<{
    totalEvents: number;
    userCount: number;
    assistantCount: number;
    thinkingCount: number;
    toolCallCount: number;
  } | null>(null);

  // 前端侧过滤
  const filteredEvents = useMemo(() => {
    if (!tab.sessionDetail) return [];
    const filtered = filterEvents(tab.sessionDetail.events, tab.filter);
    if (tab.filter.collapseConsecutive) {
      return collapseConsecutiveEvents(filtered);
    }
    return filtered;
  }, [tab.sessionDetail, tab.filter]);

  // Cold pool: 不渲染 DOM，仅占位
  if (keepAliveRank > 3) {
    return (
      <div
        data-tab-id={tab.id}
        style={{ display: 'none' }}
        aria-hidden="true"
      />
    );
  }

  const containerStyle: React.CSSProperties =
    isActive ? {} : { display: 'none' };

  // 加载失败且无缓存数据
  if (tab.error && !tab.isLoading && !tab.sessionDetail) {
    return (
      <div style={containerStyle} className="flex-1 flex flex-col h-full">
        <EmptyState
          icon={<AlertCircle className="h-16 w-16 text-red-400" />}
          title="加载失败"
          description={tab.error}
        />
      </div>
    );
  }

  // 首次加载中
  if (tab.isLoading && !tab.sessionDetail) {
    return (
      <div style={containerStyle} className="flex-1 flex flex-col h-full">
        <LoadingSpinner size="lg" message="加载会话中..." />
      </div>
    );
  }

  if (!tab.sessionDetail) {
    return (
      <div style={containerStyle} className="flex-1 flex flex-col h-full">
        <EmptyState
          icon={<MessageSquare className="h-16 w-16" />}
          title="暂无内容"
        />
      </div>
    );
  }

  return (
    <div style={containerStyle} className="flex-1 flex flex-col h-full min-w-0">
      {/* FilterBar */}
      <div className="px-4 py-2 border-b bg-white">
        <FilterBar
          filter={tab.filter}
          onChange={(filterUpdate) => onFilterChange(tab.id, filterUpdate)}
          stats={convStats ?? undefined}
          showFindBar={tab.showFindBar}
          onToggleFind={() => onFindBarToggle(tab.id, !tab.showFindBar)}
          providerName={tab.providerName}
        />
      </div>

      {/* 对话内容 + TurnNavigator */}
      <div className="flex-1 flex overflow-hidden">
        <ConversationView
          events={filteredEvents}
          isLoading={tab.isLoading}
          searchHighlight={tab.searchHighlight}
          scrollHostRef={scrollHostRef}
          showFindBar={tab.showFindBar}
          onToggleFind={() => onFindBarToggle(tab.id, !tab.showFindBar)}
          onStatsChange={setConvStats}
        />
        <TurnNavigator
          events={filteredEvents}
          containerRef={scrollHostRef}
          defaultWidth={navigatorWidth}
          onWidthChange={(w) => {
            if (autoSavePanelWidths ?? true) {
              updateNavigatorWidth(w);
            }
          }}
        />
      </div>
    </div>
  );
},
// 自定义比较函数：只有关键 props 变化时才重渲染
(prev, next) => {
  return (
    prev.isActive === next.isActive &&
    prev.keepAliveRank === next.keepAliveRank &&
    prev.tab === next.tab && // TabState 引用不变则跳过
    prev.onFilterChange === next.onFilterChange &&
    prev.onFindBarToggle === next.onFindBarToggle
  );
});
