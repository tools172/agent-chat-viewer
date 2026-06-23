import React, { useRef, useEffect, useCallback } from 'react';
import { Search, X, Highlighter } from 'lucide-react';
import { SessionItem } from '../sessions/SessionItem';
import { LoadingSpinner } from '../common/LoadingSpinner';
import type { SessionSummary } from '../../types';

interface SearchPanelProps {
  query: string;
  results: SessionSummary[];
  isLoading: boolean;
  highlightEnabled: boolean;
  /** 当前视图是否可见，用于控制自动聚焦 */
  visible?: boolean;
  onQueryChange: (query: string) => void;
  onSearch: (query: string) => void;
  onSelectSession: (path: string, providerName: string, cwd?: string) => void;
  onOpenInNewTab?: (path: string, providerName: string, cwd?: string) => void;
  onToggleHighlight: () => void;
  selectedSessionPath: string | null;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({
  query,
  results,
  isLoading,
  highlightEnabled,
  visible = true,
  onQueryChange,
  onSearch,
  onSelectSession,
  onOpenInNewTab,
  onToggleHighlight,
  selectedSessionPath,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

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
    [onQueryChange, onSearch]
  );

  const handleClear = () => {
    handleChange('');
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
            placeholder="搜索会话内容..."
            className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            onKeyDown={(e) => {
              if (e.key === 'Escape') handleClear();
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

        {/* 高亮开关 */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {query && results.length > 0
              ? `找到 ${results.length} 条结果`
              : query
                ? '搜索中...'
                : ''}
          </span>
          <button
            onClick={onToggleHighlight}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
              highlightEnabled
                ? 'bg-yellow-100 text-yellow-700 border border-yellow-300'
                : 'bg-gray-100 text-gray-500 border border-gray-200'
            }`}
            title={
              highlightEnabled
                ? '关闭高亮（列表和对话内容）'
                : '开启高亮（列表和对话内容）'
            }
          >
            <Highlighter className="h-3 w-3" />
            <span>高亮{highlightEnabled ? '开' : '关'}</span>
          </button>
        </div>
      </div>

      {/* 结果列表 */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
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
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
