import React, { useRef, useEffect, useLayoutEffect } from 'react';
import {
  RefreshCw,
  Pin,
  PinOff,
  X,
  Copy,
  Hash,
  FolderOpen,
  Folder,
  Download,
  FileText,
} from 'lucide-react';

export type TabContextAction =
  | 'refresh'
  | 'togglePin'
  | 'close'
  | 'closeOthers'
  | 'closeToRight'
  | 'closeAll'
  | 'copyPath'
  | 'copyId'
  | 'openFolder'
  | 'openProjectFolder'
  | 'export';

interface TabContextMenuProps {
  x: number;
  y: number;
  tabId: string;
  isPinned: boolean;
  sessionPath: string;
  sessionId?: string;
  /** 钉住是否因达到上限而被禁用 */
  pinDisabled?: boolean;
  /** 最大钉住数（用于提示文案） */
  maxPinnedCount?: number;
  onAction: (action: TabContextAction, tabId: string) => void;
  onClose: () => void;
}

export const TabContextMenu: React.FC<TabContextMenuProps> = ({
  x,
  y,
  tabId,
  isPinned,
  sessionId,
  pinDisabled,
  maxPinnedCount,
  onAction,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // 按 Esc 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // 调整位置不超出视口
  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 8;
    if (x + rect.width > vw) {
      menuRef.current.style.left = `${Math.max(gap, vw - rect.width - gap)}px`;
    }
    if (y + rect.height > vh) {
      menuRef.current.style.top = `${Math.max(gap, vh - rect.height - gap)}px`;
    }
  }, [x, y]);

  const handleAction = (action: TabContextAction) => {
    onAction(action, tabId);
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-[110] bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[190px]"
      style={{ left: x, top: y }}
    >
      <button
        onClick={() => handleAction('refresh')}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
      >
        <RefreshCw className="h-4 w-4 text-gray-400" />
        重新加载
      </button>
      <button
        onClick={() => {
          if (pinDisabled && !isPinned) return; // 已达上限，不关闭菜单
          handleAction('togglePin');
        }}
        className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm transition-colors ${
          pinDisabled && !isPinned
            ? 'text-gray-400 cursor-not-allowed'
            : 'text-gray-700 hover:bg-gray-100'
        }`}
      >
        {isPinned ? (
          <>
            <PinOff className="h-4 w-4 text-gray-400" />
            取消钉住
          </>
        ) : (
          <>
            <Pin className="h-4 w-4 text-gray-400" />
            {pinDisabled
              ? `钉住 (已达上限 ${maxPinnedCount ?? 4})`
              : '钉住'}
          </>
        )}
      </button>

      <div className="border-t border-gray-100 my-1" />

      <button
        onClick={() => handleAction('close')}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
      >
        <X className="h-4 w-4 text-gray-400" />
        关闭
      </button>
      {!isPinned && (
        <>
          <button
            onClick={() => handleAction('closeOthers')}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <FileText className="h-4 w-4 text-gray-400" />
            关闭其他
          </button>
          <button
            onClick={() => handleAction('closeToRight')}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <FileText className="h-4 w-4 text-gray-400 rotate-90" />
            关闭右侧
          </button>
          <button
            onClick={() => handleAction('closeAll')}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="h-4 w-4 text-red-400" />
            全部关闭
          </button>
        </>
      )}

      <div className="border-t border-gray-100 my-1" />

      <button
        onClick={() => handleAction('copyPath')}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
      >
        <Copy className="h-4 w-4 text-gray-400" />
        复制文件路径
      </button>
      {sessionId && (
        <button
          onClick={() => handleAction('copyId')}
          className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <Hash className="h-4 w-4 text-gray-400" />
          复制会话 ID
        </button>
      )}
      <button
        onClick={() => handleAction('openFolder')}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
      >
        <FolderOpen className="h-4 w-4 text-gray-400" />
        打开所在文件夹
      </button>
      <button
        onClick={() => handleAction('openProjectFolder')}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
      >
        <Folder className="h-4 w-4 text-gray-400" />
        打开工作目录
      </button>

      <div className="border-t border-gray-100 my-1" />

      <button
        onClick={() => handleAction('export')}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
      >
        <Download className="h-4 w-4 text-gray-400" />
        导出会话...
      </button>
    </div>
  );
};
