import React from 'react';
import { Loader2, Pin } from 'lucide-react';
import type { TabState } from '../../types';
import { getProviderColor } from '../../utils/providers';
import { extractUserText } from '../../utils/filterEvents';

interface TabItemProps {
  tab: TabState;
  isActive: boolean;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onContextMenu: (e: React.MouseEvent, tabId: string) => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  index: number;
}

const HINT_MAX_LEN = 2000;

export const TabItem: React.FC<TabItemProps> = ({
  tab,
  isActive,
  onActivate,
  onClose,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  index,
}) => {
  const handleMouseDown = (e: React.MouseEvent) => {
    // 中键关闭
    if (e.button === 1) {
      e.preventDefault();
      onClose(tab.id);
    }
  };

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      onMouseDown={handleMouseDown}
      onClick={() => onActivate(tab.id)}
      onContextMenu={(e) => onContextMenu(e, tab.id)}
      className={`group flex items-center gap-1.5 px-2.5 py-1.5 text-xs cursor-pointer select-none
        min-w-[100px] max-w-[200px] transition-colors duration-100 border-r border-gray-200
        ${isActive
          ? 'bg-white text-gray-800 border-b-2 border-b-primary-500'
          : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
        }
        ${tab.error ? 'text-red-600' : ''}
      `}
      title={
        (() => {
          const dirInfo =
            `工作目录: ${tab.workingDir || '(未知)'}\n存储路径: ${tab.sessionPath}`;
          if (tab.error) {
            return `加载失败: ${tab.error}\n\n${dirInfo}`;
          }
          const firstUserEvent = tab.sessionDetail?.events?.find(
            (e) => e.eventType === 'user'
          );
          const rawText = firstUserEvent
            ? extractUserText(firstUserEvent)
            : '';
          const truncated =
            rawText.length > HINT_MAX_LEN
              ? rawText.slice(0, HINT_MAX_LEN) + '...'
              : rawText;
          return `${dirInfo}\n\n${truncated}`;
        })()
      }
    >
      {/* 提供商标识色点 */}
      <span
        className={`flex-shrink-0 w-2 h-2 rounded-full ${getProviderColor(tab.providerName)}`}
      />

      {/* Pin 图标 */}
      {tab.pinned && (
        <Pin className="h-3 w-3 flex-shrink-0 text-amber-500" />
      )}

      {/* 加载动画 */}
      {tab.isLoading && (
        <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin text-primary-500" />
      )}

      {/* 标题 */}
      <span className={`truncate flex-1 ${tab.error ? 'line-through' : ''}`}>
        {tab.title}
      </span>

      {/* 关闭按钮（悬停时可见，始终保留空间） */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose(tab.id);
        }}
        className="flex-shrink-0 p-0.5 rounded hover:bg-gray-300/50 text-gray-400 hover:text-gray-700
          opacity-0 group-hover:opacity-100 transition-opacity"
        title="关闭标签页"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1="1" y1="1" x2="9" y2="9" />
          <line x1="9" y1="1" x2="1" y2="9" />
        </svg>
      </button>
    </div>
  );
};
