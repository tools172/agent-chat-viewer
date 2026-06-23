import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react';
import type { ChatEvent } from '../../types';
import { searchEvents, type EventMatch } from '../../utils/searchEvents';

interface ConversationFindBarProps {
  events: ChatEvent[];
  visible: boolean;
  onClose: () => void;
  onQueryChange: (query: string) => void;
  /** 当前匹配项变化时回调，用于定位和高亮当前激活匹配 */
  onCurrentMatchChange?: (match: EventMatch | null) => void;
}

export const ConversationFindBar: React.FC<ConversationFindBarProps> = ({
  events,
  visible,
  onClose,
  onQueryChange,
  onCurrentMatchChange,
}) => {
  const [query, setQuery] = useState('');
  const [currentIdx, setCurrentIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(
    () => searchEvents(events, query),
    [events, query]
  );

  // 聚焦输入
  useEffect(() => {
    if (visible) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [visible]);

  // 关闭时清除
  useEffect(() => {
    if (!visible) {
      setQuery('');
      setCurrentIdx(0);
      onQueryChange('');
    }
  }, [visible]); // 故意不加 onQueryChange

  // 搜索词变化 → 通知父组件高亮
  useEffect(() => {
    onQueryChange(query.trim() || '');
  }, [query]); // 故意不加 onQueryChange

  // 重置 currentIdx 当匹配变化
  useEffect(() => {
    setCurrentIdx(matches.length > 0 ? 0 : -1);
  }, [matches.length]);

  // 通知父组件当前匹配项变化
  useEffect(() => {
    onCurrentMatchChange?.(matches[currentIdx] ?? null);
  }, [matches, currentIdx, onCurrentMatchChange]);

  // 滚动到指定匹配
  const scrollTo = (idx: number) => {
    const match = matches[idx];
    if (!match) return;
    const uuid = events[match.eventIdx]?.uuid;
    if (!uuid) return;

    // 优先精确定位到 find <mark> 元素（处理代码块内匹配被裁切的情况）
    const markEl = document.querySelector(
      `[data-event-uuid="${uuid}"] [data-find-block="${match.blockIdx}"][data-find-occurrence="${match.occurrenceIdx}"]`
    );
    const target = markEl ?? document.querySelector(`[data-event-uuid="${uuid}"]`);

    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // 事件卡片加闪烁环
    const eventEl = document.querySelector(`[data-event-uuid="${uuid}"]`);
    if (eventEl) {
      eventEl.classList.add('ring-2', 'ring-orange-400');
      setTimeout(() => eventEl.classList.remove('ring-2', 'ring-orange-400'), 2000);
    }
  };

  const goNext = () => {
    if (matches.length === 0) return;
    const next = (currentIdx + 1) % matches.length;
    setCurrentIdx(next);
    scrollTo(next);
  };

  const goPrev = () => {
    if (matches.length === 0) return;
    const prev =
      (currentIdx - 1 + matches.length) % matches.length;
    setCurrentIdx(prev);
    scrollTo(prev);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.shiftKey ? goPrev() : goNext();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!visible) return null;

  const hasResults = matches.length > 0;
  const hasQuery = query.trim().length > 0;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 border-b border-orange-200 animate-fade-in">
      <Search className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="在会话中查找..."
        className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none"
      />
      {/* 匹配计数 */}
      {hasResults && (
        <span className="text-xs text-orange-600 font-mono whitespace-nowrap">
          {currentIdx + 1}/{matches.length}
        </span>
      )}
      {hasQuery && !hasResults && (
        <span className="text-xs text-red-400 whitespace-nowrap">
          0 个匹配
        </span>
      )}
      <button
        onClick={goPrev}
        disabled={!hasResults}
        className="p-0.5 hover:bg-orange-100 rounded disabled:opacity-30"
        title="上一个 (Shift+Enter)"
      >
        <ChevronUp className="h-3.5 w-3.5 text-orange-600" />
      </button>
      <button
        onClick={goNext}
        disabled={!hasResults}
        className="p-0.5 hover:bg-orange-100 rounded disabled:opacity-30"
        title="下一个 (Enter)"
      >
        <ChevronDown className="h-3.5 w-3.5 text-orange-600" />
      </button>
      <button
        onClick={onClose}
        className="p-0.5 hover:bg-orange-100 rounded"
        title="关闭 (Escape)"
      >
        <X className="h-3.5 w-3.5 text-orange-500" />
      </button>
    </div>
  );
};
