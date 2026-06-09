import React, { useCallback, useRef } from 'react';
import { Search, MessageSquare } from 'lucide-react';
import type { ChatEvent } from '../../types';
import { useConversation } from '../../hooks/useConversation';
import { useSettingsStore } from '../../stores/settingsStore';
import { EventCard } from './EventCard';
import { ConversationFindBar } from './ConversationFindBar';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { EmptyState } from '../common/EmptyState';

/** 小尖括号 + 顶部横线：回到最顶部 */
function ScrollTopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    >
      <line x1="4" y1="3" x2="12" y2="3" />
      <polyline points="11,7 8,4 5,7" />
    </svg>
  );
}

/** 小尖括号 + 底部横线：回到底部 */
function ScrollBottomIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    >
      <polyline points="5,9 8,12 11,9" />
      <line x1="4" y1="13" x2="12" y2="13" />
    </svg>
  );
}

interface ConversationViewProps {
  events: ChatEvent[];
  isLoading: boolean;
  /** 搜索标签高亮词（黄色） */
  searchHighlight?: string;
  /** 外部传入 ref，用于 TurnNavigator 等组件获取滚动容器 */
  scrollHostRef?: { current: HTMLDivElement | null };
}

export const ConversationView: React.FC<ConversationViewProps> = ({
  events,
  isLoading,
  searchHighlight,
  scrollHostRef: externalRef,
}) => {
  const {
    expandedThinking,
    expandedToolCalls,
    expandedToolResults,
    toggleThinking,
    toggleToolCall,
    toggleToolResult,
    stats,
    blockKey,
  } = useConversation(events);

  const searchColors = useSettingsStore((s) => s.settings.searchColors);
  const [showFindBar, setShowFindBar] = React.useState(false);
  const [findQuery, setFindQuery] = React.useState('');
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [showScrollBtns, setShowScrollBtns] = React.useState({ top: false, bottom: true });

  // 回调 ref：同步设置内部 ref 和外部 ref，确保 TurnNavigator 立即可用
  const setScrollRef = useCallback(
    (node: HTMLDivElement | null) => {
      scrollContainerRef.current = node;
      if (externalRef) (externalRef as { current: HTMLDivElement | null }).current = node;
    },
    [externalRef]
  );

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const nearTop = el.scrollTop < 100;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setShowScrollBtns({ top: !nearTop, bottom: !nearBottom });
  }, []);

  const scrollToTop = () => topRef.current?.scrollIntoView({ block: 'start' });
  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ block: 'end' });

  // NOT intercepting Ctrl+F — let browser handle native find

  if (isLoading) {
    return <LoadingSpinner size="lg" message="加载会话中..." />;
  }

  if (events.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquare className="h-16 w-16" />}
        title="暂无消息"
        description="此会话没有可显示的消息。"
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full min-w-0">
      {/* 会话内查找栏（橙色） */}
      <ConversationFindBar
        events={events}
        visible={showFindBar}
        onClose={() => setShowFindBar(false)}
        onQueryChange={setFindQuery}
      />

      {/* Stats bar */}
      <div className="flex items-center gap-4 px-4 py-1.5 bg-gray-100/50 border-b text-xs text-gray-500">
        <span>共 {stats.totalEvents} 条事件</span>
        <span>{stats.userCount} 用户消息</span>
        <span>{stats.assistantCount} 助手回复</span>
        {stats.thinkingCount > 0 && (
          <span>{stats.thinkingCount} 思考块</span>
        )}
        {stats.toolCallCount > 0 && (
          <span>{stats.toolCallCount} 工具调用</span>
        )}
        {/* 会话内查找按钮 */}
        <button
          onClick={() => setShowFindBar(!showFindBar)}
          className={`ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
            showFindBar
              ? 'bg-orange-100 text-orange-700'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'
          }`}
          title="在会话中查找"
        >
          <Search className="h-3 w-3" />
          <span>查找</span>
        </button>
      </div>

      {/* Event list */}
      <div
        ref={setScrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto relative"
      >
        <div ref={topRef} />
        {events.map((event) => (
          <EventCard
            key={event.uuid}
            event={event}
            expandedThinking={expandedThinking}
            expandedToolCalls={expandedToolCalls}
            expandedToolResults={expandedToolResults}
            onToggleThinking={toggleThinking}
            onToggleToolCall={toggleToolCall}
            onToggleToolResult={toggleToolResult}
            blockKey={blockKey}
            searchHighlight={searchHighlight}
            findHighlight={findQuery || undefined}
            searchColors={searchColors}
          />
        ))}
        <div ref={bottomRef} data-bottom-sentinel="" />

        {/* 浮动滚动按钮 */}
        <div className="sticky bottom-3 flex flex-col items-end gap-1.5 pr-3 pointer-events-none">
          {showScrollBtns.top && (
            <button
              onClick={scrollToTop}
              title="回到顶部"
              className="pointer-events-auto p-1.5 bg-white border rounded-full shadow-md hover:bg-gray-50 text-gray-500 transition-all"
            >
              <ScrollTopIcon />
            </button>
          )}
          {showScrollBtns.bottom && (
            <button
              onClick={scrollToBottom}
              title="回到底部"
              className="pointer-events-auto p-1.5 bg-white border rounded-full shadow-md hover:bg-gray-50 text-gray-500 transition-all"
            >
              <ScrollBottomIcon />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
