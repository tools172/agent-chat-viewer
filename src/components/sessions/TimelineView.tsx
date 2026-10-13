import React, { useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Filter,
  Clock,
  Sparkles,
} from "lucide-react";
import type { SessionSummary, SortConfig, TimeField } from "../../types";
import { multiSort, getSessionTime } from "../../utils/sort";
import { useSettingsStore } from "../../stores/settingsStore";
import { SessionItem } from "./SessionItem";
import SortBar from "../filter/SortBar";

interface TimelineViewProps {
  sessions: SessionSummary[];
  sortConfig: SortConfig;
  /** 排序变更（从属于时间分组） */
  onSortChange: (config: SortConfig) => void;
  /** 时间分组依据：按创建时间 or 按修改时间 */
  timeField: TimeField;
  /** 切换时间分组依据 */
  onTimeFieldChange: (field: TimeField) => void;
  selectedSessionPath: string | null;
  /** 当前过滤上下文 */
  filterContext: "all" | string;
  filterContextLabel?: string;
  onSelectSession: (path: string, providerName: string, cwd?: string) => void;
  onOpenInNewTab?: (path: string, providerName: string, cwd?: string) => void;
  onLocateInFolderList?: (
    filePath: string,
    projectPath: string,
    providerName: string,
  ) => void;
  onClearFilter?: () => void;
}

interface TimeGroup {
  label: string;
  sessions: SessionSummary[];
}

function groupByTime(
  sessions: SessionSummary[],
  timeField: TimeField,
): TimeGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekStart = new Date(today.getTime() - today.getDay() * 86400000);
  const lastWeekStart = new Date(weekStart.getTime() - 7 * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const groups: Record<string, SessionSummary[]> = {
    今天: [],
    昨天: [],
    本周: [],
    上周: [],
    本月: [],
  };
  const monthGroups: Record<string, SessionSummary[]> = {};
  const older: SessionSummary[] = [];

  // 时间字段对应的 SortField（用于分组内子排序）
  const timeSortField = timeField === "modified" ? "modified" : "created";

  for (const session of sessions) {
    const date = new Date(getSessionTime(session, timeField));
    if (isNaN(date.getTime())) {
      older.push(session);
      continue;
    }
    if (date >= today) groups["今天"].push(session);
    else if (date >= yesterday) groups["昨天"].push(session);
    else if (date >= weekStart) groups["本周"].push(session);
    else if (date >= lastWeekStart) groups["上周"].push(session);
    else if (date >= monthStart) groups["本月"].push(session);
    else {
      const monthKey = date.toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "long",
      });
      if (!monthGroups[monthKey]) monthGroups[monthKey] = [];
      monthGroups[monthKey].push(session);
    }
  }

  const result: TimeGroup[] = [];
  for (const label of ["今天", "昨天", "本周", "上周", "本月"]) {
    if (groups[label].length > 0) {
      result.push({
        label,
        sessions: multiSort(groups[label], [
          { field: timeSortField, direction: "desc" },
        ]),
      });
    }
  }
  for (const [label, sess] of Object.entries(monthGroups)) {
    result.push({
      label,
      sessions: multiSort(sess, [{ field: timeSortField, direction: "desc" }]),
    });
  }
  if (older.length > 0) {
    result.push({
      label: "更早",
      sessions: multiSort(older, [{ field: timeSortField, direction: "desc" }]),
    });
  }
  return result;
}

export const TimelineView: React.FC<TimelineViewProps> = ({
  sessions,
  sortConfig,
  onSortChange,
  timeField,
  onTimeFieldChange,
  selectedSessionPath,
  filterContext,
  filterContextLabel,
  onSelectSession,
  onOpenInNewTab,
  onLocateInFolderList,
  onClearFilter,
}) => {
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(
    new Set(),
  );

  // 先全局排序再分组
  const sortedSessions = useMemo(
    () => multiSort(sessions, sortConfig),
    [sessions, sortConfig],
  );
  const groups = useMemo(
    () => groupByTime(sortedSessions, timeField),
    [sortedSessions, timeField],
  );

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const density = useSettingsStore(
    (s) => s.settings.sessionListStyle ?? "loose",
  );
  const isCompact = density === "compact";

  const allCollapsed =
    collapsedGroups.size >= groups.length && groups.length > 0;

  const toggleAll = () => {
    if (allCollapsed) {
      setCollapsedGroups(new Set());
    } else {
      setCollapsedGroups(new Set(groups.map((g) => g.label)));
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 过滤上下文 + 时间切换 — 左右两栏 */}
      <div className="px-3 py-0.5 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2 text-xs min-w-0">
          {/* 左侧：范围标签 + 清除，超长省略 */}
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span
              className="text-gray-400 flex items-center gap-1 min-w-0 truncate"
              title={
                filterContext === "all"
                  ? "全部"
                  : (filterContextLabel ?? filterContext)
              }
            >
              <Filter className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">
                {filterContext === "all"
                  ? "全部"
                  : (filterContextLabel ?? filterContext)}
              </span>
            </span>
            {filterContext !== "all" && onClearFilter && (
              <button
                onClick={onClearFilter}
                className="whitespace-nowrap text-primary-600 hover:text-primary-700 flex-shrink-0"
              >
                清除
              </button>
            )}
          </div>

          {/* 右侧：时间字段滑动胶囊 */}
          <div className="flex-shrink-0">
            <div
              className="relative flex items-center rounded-lg p-px
                          bg-amber-100/40 backdrop-blur-sm
                          shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]
                          border border-amber-200/50"
              role="radiogroup"
              aria-label="时间线分组依据"
            >
              {/* 滑动指示器 */}
              <div
                className="absolute top-px h-[calc(100%-2px)] w-[calc(50%-1px)] rounded-md
                            bg-gradient-to-r from-amber-400 to-orange-400
                            shadow shadow-amber-400/25
                            transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
                style={{
                  left: timeField === "created" ? "1px" : "calc(50% - 0px)",
                }}
              />
              <button
                onClick={() => onTimeFieldChange("created")}
                className={`relative z-10 flex items-center justify-center gap-0.5 px-1.5 py-0.5 text-[11px] rounded-md transition-colors duration-200 whitespace-nowrap
                  ${timeField === "created" ? "font-semibold text-white" : "font-medium text-amber-700/50 hover:text-amber-700/70"}`}
                role="radio"
                aria-checked={timeField === "created"}
              >
                <Clock
                  className={`h-3 w-3 transition-transform duration-200 ${timeField === "created" ? "scale-110" : ""}`}
                />
                创建时间
              </button>
              <button
                onClick={() => onTimeFieldChange("modified")}
                className={`relative z-10 flex items-center justify-center gap-0.5 px-1.5 py-0.5 text-[11px] rounded-md transition-colors duration-200 whitespace-nowrap
                  ${timeField === "modified" ? "font-semibold text-white" : "font-medium text-amber-700/50 hover:text-amber-700/70"}`}
                role="radio"
                aria-checked={timeField === "modified"}
              >
                <Sparkles
                  className={`h-3 w-3 transition-transform duration-200 ${timeField === "modified" ? "scale-110" : ""}`}
                />
                修改时间
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 排序 + 折叠 — 从属于上方的时间分组选择 */}
      <div className="flex items-center gap-2 pr-3">
        <div className="flex-1">
          <SortBar config={sortConfig} onChange={onSortChange} />
        </div>
        {groups.length > 0 && (
          <button
            onClick={toggleAll}
            className={`flex items-center gap-1 px-1.5 py-0.5 text-[11px] rounded-full border transition-colors whitespace-nowrap flex-shrink-0 ${
              allCollapsed
                ? "border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:border-blue-300"
                : "border-gray-200 bg-gray-100 text-gray-600 hover:bg-gray-200 hover:border-gray-300"
            }`}
            title={allCollapsed ? "展开全部" : "折叠全部"}
          >
            {allCollapsed ? (
              <ChevronsDownUp className="h-3 w-3" />
            ) : (
              <ChevronsUpDown className="h-3 w-3" />
            )}
            {allCollapsed ? "展开" : "折叠"}
          </button>
        )}
      </div>

      {/* 时间分组列表 */}
      <div
        className={`flex-1 overflow-y-auto ${isCompact ? "py-0.5" : "py-1"}`}
      >
        {groups.map((group) => (
          <div key={group.label} className={isCompact ? "mb-1.5" : "mb-2"}>
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
                    showProject={filterContext === "all"}
                    showProvider={true}
                    timeField={timeField}
                    density={density}
                    onClick={onSelectSession}
                    onOpenInNewTab={onOpenInNewTab}
                    onLocateInFolderList={onLocateInFolderList}
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
