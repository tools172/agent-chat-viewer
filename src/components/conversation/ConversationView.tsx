import React, { useCallback, useRef } from 'react';
import { Search, MessageSquare, ChevronUp, ChevronDown } from 'lucide-react';
import type { ChatEvent } from '../../types';
import { useConversation } from '../../hooks/useConversation';
import { useSettingsStore } from '../../stores/settingsStore';
import { EventCard } from './EventCard';
import { ConversationFindBar } from './ConversationFindBar';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { EmptyState } from '../common/EmptyState';

interface ConversationViewProps {
  events: ChatEvent[];
  isLoading: boolean;
  /** 搜索标签高亮词（黄色） */
  searchHighlight?: string;
}

export const ConversationView: React.FC<ConversationViewProps> = ({
  events,
  isLoading,
  searchHighlight,
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollBtns, setShowScrollBtns] = React.useState({ top: false, bottom: true });

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const nearTop = el.scrollTop < 100;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setShowScrollBtns({ top: !nearTop, bottom: !nearBottom });
  }, []);

  const scrollToTop = () => topRef.current?.scrollIntoView({ behavior: 'smooth' });
  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: 'smooth' });

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
    <div className="flex flex-col h-full">
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
        ref={scrollContainerRef}
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
        <div ref={bottomRef} />

        {/* 浮动滚动按钮 */}
        <div className="sticky bottom-3 flex flex-col items-end gap-1.5 pr-3 pointer-events-none">
          {showScrollBtns.top && (
            <button
              onClick={scrollToTop}
              title="回到顶部"
              className="pointer-events-auto p-1.5 bg-white border rounded-full shadow-md hover:bg-gray-50 text-gray-500 transition-all"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          )}
          {showScrollBtns.bottom && (
            <button
              onClick={scrollToBottom}
              title="回到底部"
              className="pointer-events-auto p-1.5 bg-white border rounded-full shadow-md hover:bg-gray-50 text-gray-500 transition-all"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
