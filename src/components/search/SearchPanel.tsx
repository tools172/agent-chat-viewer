import React, { useRef, useEffect, useCallback, useState } from "react";
import { Search, X, Highlighter, Folder, ChevronDown } from "lucide-react";
import { SessionItem } from "../sessions/SessionItem";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { SearchScopePicker, type PickerAnchorRect } from "./SearchScopePicker";
import type {
  Project,
  SearchScope,
  SearchScopeMode,
  SessionSummary,
} from "../../types";

interface SearchPanelProps {
  query: string;
  results: SessionSummary[];
  isLoading: boolean;
  highlightEnabled: boolean;
  /** 当前视图是否可见，用于控制自动聚焦 */
  visible?: boolean;
  /** 所有可选的搜索范围 */
  projects: Project[];
  scopeMode: SearchScopeMode;
  scopes: SearchScope[];
  onQueryChange: (query: string) => void;
  onSearch: (query: string) => void;
  onSelectSession: (path: string, providerName: string, cwd?: string) => void;
  onOpenInNewTab?: (path: string, providerName: string, cwd?: string) => void;
  onLocateInFolderList?: (
    filePath: string,
    projectPath: string,
    providerName: string,
  ) => void;
  onToggleHighlight: () => void;
  onScopeModeChange: (mode: SearchScopeMode) => void;
  onToggleScope: (scope: SearchScope) => void;
  onSetScopes: (scopes: SearchScope[]) => void;
  selectedSessionPath: string | null;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({
  query,
  results,
  isLoading,
  highlightEnabled,
  visible = true,
  projects,
  scopeMode,
  scopes,
  onQueryChange,
  onSearch,
  onSelectSession,
  onOpenInNewTab,
  onLocateInFolderList,
  onToggleHighlight,
  onScopeModeChange,
  onToggleScope,
  onSetScopes,
  selectedSessionPath,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const scopeButtonRef = useRef<HTMLButtonElement>(null);
  const [scopePickerOpen, setScopePickerOpen] = useState(false);
  const [scopeAnchor, setScopeAnchor] = useState<PickerAnchorRect | null>(null);

  const isScoped = scopeMode === "selected";
  const scopedWithoutSelection = isScoped && scopes.length === 0;

  const scopeSummary = isScoped
    ? scopes.length > 0
      ? `${scopes.length} 个工作目录`
      : "选择工作目录"
    : "全部工作目录";

  const searchPlaceholder = isScoped
    ? scopes.length > 0
      ? `在 ${scopes.length} 个工作目录中搜索...`
      : "请先选择工作目录..."
    : "搜索会话内容...";

  const handleToggleScopePicker = () => {
    if (!scopePickerOpen) {
      const rect = scopeButtonRef.current?.getBoundingClientRect();
      if (rect) {
        setScopeAnchor({ left: rect.left, top: rect.top, bottom: rect.bottom });
      }
    }
    setScopePickerOpen((open) => !open);
  };

  const resultCountText = scopedWithoutSelection
    ? ""
    : query
      ? results.length > 0
        ? isScoped && scopes.length > 0
          ? `在 ${scopes.length} 个工作目录中找到 ${results.length} 条结果`
          : `找到 ${results.length} 条结果`
        : isLoading
          ? "搜索中..."
          : "未找到结果"
      : "";

  useEffect(() => {
    if (visible) {
      inputRef.current?.focus();
    }
  }, [visible]);

  const handleChange = useCallback(
    (value: string) => {
      onQueryChange(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onSearch(value);
      }, 300);
    },
    [onQueryChange, onSearch],
  );

  const handleClear = () => {
    handleChange("");
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-full">
      {/* 搜索输入 + 高亮切换 */}
      <div className="px-3 py-2 space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            onKeyDown={(e) => {
              if (e.key === "Escape") handleClear();
            }}
          />
          {query && (
            <button
              onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-200 rounded"
            >
              <X className="h-3.5 w-3.5 text-gray-400" />
            </button>
          )}
        </div>

        {/* 搜索范围（多选，收起态只显示摘要） */}
        <div className="flex items-center gap-1">
          <button
            ref={scopeButtonRef}
            data-search-scope-trigger
            onClick={handleToggleScopePicker}
            className={`flex items-center gap-1 min-w-0 flex-1 px-2 py-1 rounded text-xs border transition-colors ${
              isScoped
                ? "bg-primary-50 text-primary-700 border-primary-200"
                : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
            }`}
            title={
              isScoped
                ? scopes.length > 0
                  ? `搜索范围：${scopes.length} 个工作目录`
                  : "请选择工作目录"
                : "搜索全部工作目录"
            }
          >
            <Folder className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{scopeSummary}</span>
            <ChevronDown className="h-3 w-3 flex-shrink-0 ml-auto" />
          </button>
        </div>

        {visible && scopePickerOpen && scopeAnchor && (
          <SearchScopePicker
            anchorRect={scopeAnchor}
            mode={scopeMode}
            scopes={scopes}
            projects={projects}
            onClose={() => setScopePickerOpen(false)}
            onModeChange={onScopeModeChange}
            onToggleScope={onToggleScope}
            onSetScopes={onSetScopes}
          />
        )}

        {/* 结果统计 + 高亮开关 */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">{resultCountText}</span>
          <button
            onClick={onToggleHighlight}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
              highlightEnabled
                ? "bg-yellow-100 text-yellow-700 border border-yellow-300"
                : "bg-gray-100 text-gray-500 border border-gray-200"
            }`}
            title={
              highlightEnabled
                ? "关闭高亮（列表和对话内容）"
                : "开启高亮（列表和对话内容）"
            }
          >
            <Highlighter className="h-3 w-3" />
            <span>高亮{highlightEnabled ? "开" : "关"}</span>
          </button>
        </div>
      </div>

      {/* 结果列表 */}
      <div className="flex-1 overflow-y-auto">
        {scopedWithoutSelection ? (
          <p className="px-4 py-8 text-sm text-gray-500 text-center">
            请选择至少一个工作目录
          </p>
        ) : !query && isScoped ? (
          <p className="px-4 py-8 text-sm text-gray-500 text-center">
            输入关键词，在 {scopes.length} 个工作目录中搜索
          </p>
        ) : isLoading ? (
          <LoadingSpinner size="sm" message="搜索中..." />
        ) : query && results.length === 0 ? (
          <p className="px-4 py-8 text-sm text-gray-500 text-center">
            未找到匹配的会话
          </p>
        ) : (
          <div className="px-1.5">
            {results.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isSelected={selectedSessionPath === session.filePath}
                showProject={true}
                showProvider={true}
                highlight={highlightEnabled ? query : undefined}
                onClick={onSelectSession}
                onOpenInNewTab={onOpenInNewTab}
                onLocateInFolderList={onLocateInFolderList}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
