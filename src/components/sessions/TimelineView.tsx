import React, { useMemo } from 'react';
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Filter, Clock } from 'lucide-react';
import type { SessionSummary, SortConfig } from '../../types';
import { multiSort } from '../../utils/sort';
import { SessionItem } from './SessionItem';

interface TimelineViewProps {
  sessions: SessionSummary[];
  sortConfig: SortConfig;
  selectedSessionPath: string | null;
  /** 当前过滤上下文 */
  filterContext: 'all' | string;
  filterContextLabel?: string;
  onSelectSession: (path: string, providerName: string, cwd?: string) => void;
  onOpenInNewTab?: (path: string, providerName: string, cwd?: string) => void;
  onClearFilter?: () => void;
}

interface TimeGroup {
  label: string;
  sessions: SessionSummary[];
}

function groupByTime(sessions: SessionSummary[]): TimeGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekStart = new Date(today.getTime() - today.getDay() * 86400000);
  const lastWeekStart = new Date(weekStart.getTime() - 7 * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const groups: Record<string, SessionSummary[]> = {
    '今天': [],
    '昨天': [],
    '本周': [],
    '上周': [],
    '本月': [],
  };
  const monthGroups: Record<string, SessionSummary[]> = {};
  const older: SessionSummary[] = [];

  for (const session of sessions) {
    const date = new Date(session.timestamp);
    if (isNaN(date.getTime())) {
      older.push(session);
      continue;
    }
    if (date >= today) groups['今天'].push(session);
    else if (date >= yesterday) groups['昨天'].push(session);
    else if (date >= weekStart) groups['本周'].push(session);
    else if (date >= lastWeekStart) groups['上周'].push(session);
    else if (date >= monthStart) groups['本月'].push(session);
    else {
      const monthKey = date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
      });
      if (!monthGroups[monthKey]) monthGroups[monthKey] = [];
      monthGroups[monthKey].push(session);
    }
  }

  const result: TimeGroup[] = [];
  for (const label of ['今天', '昨天', '本周', '上周', '本月']) {
    if (groups[label].length > 0) {
      result.push({ label, sessions: multiSort(groups[label], [{ field: 'created', direction: 'desc' }]) });
    }
  }
  for (const [label, sess] of Object.entries(monthGroups)) {
    result.push({ label, sessions: multiSort(sess, [{ field: 'created', direction: 'desc' }]) });
  }
  if (older.length > 0) {
    result.push({ label: '更早', sessions: multiSort(older, [{ field: 'created', direction: 'desc' }]) });
  }
  return result;
}

export const TimelineView: React.FC<TimelineViewProps> = ({
  sessions,
  sortConfig,
  selectedSessionPath,
  filterContext,
  filterContextLabel,
  onSelectSession,
  onOpenInNewTab,
  onClearFilter,
}) => {
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(
    new Set()
  );

  // 先全局排序再分组
  const sortedSessions = useMemo(
    () => multiSort(sessions, sortConfig),
    [sessions, sortConfig]
  );
  const groups = useMemo(() => groupByTime(sortedSessions), [sortedSessions]);

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const allCollapsed = collapsedGroups.size >= groups.length && groups.length > 0;

  const toggleAll = () => {
    if (allCollapsed) {
      setCollapsedGroups(new Set());
    } else {
      setCollapsedGroups(new Set(groups.map((g) => g.label)));
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 过滤上下文指示条 */}
      <div className="px-3 py-1.5 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Filter className="h-3 w-3" />
          <span>
            范围: {filterContext === 'all' ? '全部工作目录' : (filterContextLabel ?? filterContext)}
          </span>
          {/* 一键折叠/展开 */}
          {groups.length > 0 && (
            <button
              onClick={toggleAll}
              className={`flex items-center gap-1 px-1.5 py-0.5 text-[11px] rounded-full border transition-colors ${
                allCollapsed
                  ? 'border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:border-blue-300'
                  : 'border-gray-200 bg-gray-100 text-gray-600 hover:bg-gray-200 hover:border-gray-300'
              } ${filterContext === 'all' ? 'ml-auto' : 'ml-1'}`}
              title={allCollapsed ? '点击展开全部' : '点击折叠全部'}
            >
              {allCollapsed ? (
                <ChevronsDownUp className="h-3 w-3" />
              ) : (
                <ChevronsUpDown className="h-3 w-3" />
              )}
              {allCollapsed ? '展开' : '折叠'}
            </button>
          )}
          {filterContext !== 'all' && onClearFilter && (
            <button
              onClick={onClearFilter}
              className="ml-auto text-primary-600 hover:text-primary-700"
            >
              清除过滤
            </button>
          )}
        </div>
      </div>

      {/* 时间分组列表 */}
      <div className="flex-1 overflow-y-auto py-1">
        {groups.map((group) => (
          <div key={group.label} className="mb-2">
            <button
              onClick={() => toggleGroup(group.label)}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors sticky top-0 bg-white z-10"
            >
              {collapsedGroups.has(group.label) ? (
                <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
              )}
              <Clock className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
              <span>{group.label}</span>
              <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full ml-auto">
                {group.sessions.length}
              </span>
            </button>
            {!collapsedGroups.has(group.label) && (
              <div className="ml-4 border-l-2 border-gray-200 pl-1">
                {group.sessions.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    isSelected={selectedSessionPath === session.filePath}
                    showProject={filterContext === 'all'}
                    showProvider={true}
                    onClick={onSelectSession}
                    onOpenInNewTab={onOpenInNewTab}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
