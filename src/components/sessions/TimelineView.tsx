import React, { useMemo } from 'react';
import { ChevronDown, ChevronRight, Filter } from 'lucide-react';
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
  onSelectSession: (path: string, providerName: string) => void;
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
      result.push({ label, sessions: multiSort(groups[label], [{ field: 'time', direction: 'desc' }]) });
    }
  }
  for (const [label, sess] of Object.entries(monthGroups)) {
    result.push({ label, sessions: multiSort(sess, [{ field: 'time', direction: 'desc' }]) });
  }
  if (older.length > 0) {
    result.push({ label: '更早', sessions: multiSort(older, [{ field: 'time', direction: 'desc' }]) });
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

  return (
    <div className="flex flex-col h-full">
      {/* 过滤上下文指示条 */}
      <div className="px-3 py-1.5 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Filter className="h-3 w-3" />
          <span>
            范围: {filterContext === 'all' ? '全部项目' : (filterContextLabel ?? filterContext)}
          </span>
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
          <div key={group.label}>
            <button
              onClick={() => toggleGroup(group.label)}
              className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {collapsedGroups.has(group.label) ? (
                <ChevronRight className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              <span>{group.label}</span>
              <span className="text-gray-400 ml-auto">
                {group.sessions.length}
              </span>
            </button>
            {!collapsedGroups.has(group.label) && (
              <div className="px-1.5">
                {group.sessions.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    isSelected={selectedSessionPath === session.filePath}
                    showProject={filterContext === 'all'}
                    showProvider={true}
                    onClick={onSelectSession}
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
