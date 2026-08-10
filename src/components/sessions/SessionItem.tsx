import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { MessageSquare, FolderOpen, Copy, Check, Hash, Folder, ExternalLink, FolderTree } from 'lucide-react';
import { relativeTime, formatDateTime } from '../../utils/time';
import { getProviderLabel, getProviderColor } from '../../utils/providers';
import { useSettingsStore } from '../../stores/settingsStore';
import { highlightText } from '../../utils/highlight';
import * as tauri from '../../utils/tauri';
import { runOpenFolderAction } from '../../utils/openFolder';

interface SessionItemProps {
  session: import('../../types').SessionSummary;
  isSelected: boolean;
  showProject?: boolean;
  highlight?: string;
  showProvider?: boolean;
  /** 相对时间显示依据：'created' | 'modified'，默认 'created' */
  timeField?: import('../../types').TimeField;
  /** 显示密度：'compact'（紧凑）| 'loose'（宽松），默认 'compact' */
  density?: 'compact' | 'loose';
  onClick: (path: string, providerName: string, cwd?: string) => void;
  /** 在新标签页中打开（中键/Ctrl+点击/右键菜单） */
  onOpenInNewTab?: (path: string, providerName: string, cwd?: string) => void;
  /** 定位到文件夹列表（右键菜单） */
  onLocateInFolderList?: (filePath: string, projectPath: string, providerName: string) => void;
}

/** 返回客户端环境标签（CLI 不显示，属于默认） */
function getClientBadge(clientType: string): { label: string; color: string } | null {
  switch (clientType) {
    case 'vscode':
      return { label: 'VSCode', color: 'bg-blue-100 text-blue-600 border-blue-300' };
    case 'ui':
      return { label: 'UI', color: 'bg-emerald-100 text-emerald-600 border-emerald-300' };
    case 'subagent':
      return { label: 'Sub', color: 'bg-amber-100 text-amber-600 border-amber-300' };
    default:
      return null; // CLI — 不显示，最普通的情况
  }
}

export const SessionItem: React.FC<SessionItemProps> = ({
  session,
  isSelected,
  showProject,
  highlight,
  showProvider = true,
  timeField,
  density,
  onClick,
  onOpenInNewTab,
  onLocateInFolderList,
}) => {
  const settings = useSettingsStore((s) => s.settings);
  const searchColors = settings.searchColors;
  const isCompact = (density ?? 'compact') === 'compact';
  const showFirst = settings.displayFirstUserMessage !== false;
  const effectiveTimeField: import('../../types').TimeField =
    timeField ?? (settings.timeBase as import('../../types').TimeField | undefined) ?? 'created';
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [copiedPath, setCopiedPath] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const clientBadge = getClientBadge(session.clientType || '');
  const isSkeleton = !session.clientType; // 骨架阶段：clientType 为空，等待 polish

  // 点击外部 / Esc 关闭菜单
  useEffect(() => {
    if (!contextMenu) return;
    const clickHandler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    document.addEventListener('mousedown', clickHandler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', clickHandler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [contextMenu]);

  // 调整菜单位置不超出视口边界
  useLayoutEffect(() => {
    if (!contextMenu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 8;
    if (contextMenu.x + rect.width > vw) {
      menuRef.current.style.left = `${Math.max(gap, vw - rect.width - gap)}px`;
    }
    if (contextMenu.y + rect.height > vh) {
      menuRef.current.style.top = `${Math.max(gap, vh - rect.height - gap)}px`;
    }
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleOpenStorageDir = async () => {
    setContextMenu(null);
    await runOpenFolderAction('打开存储目录', async () => {
      // Cursor: open the source DB directory instead of the cached JSONL path
      if (session.providerName === 'cursor') {
        const dataDir = await tauri.getProviderDataDir('cursor');
        if (dataDir) {
          await tauri.openProjectFolder(dataDir);
          return;
        }
      }
      await tauri.openContainingFolder(session.filePath);
    });
  };

  const handleCopyPath = async () => {
    setContextMenu(null);
    try {
      await navigator.clipboard.writeText(session.filePath);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    } catch (err) {
      console.error('复制路径失败:', err);
    }
  };

  const handleOpenWorkingDir = async () => {
    setContextMenu(null);
    // cwd 是会话记录中实际的工作目录，projectPath 只是 .jsonl 文件的存放目录
    await runOpenFolderAction('打开工作目录', () =>
      tauri.openProjectFolder(session.cwd || session.projectPath),
    );
  };

  const handleCopySessionId = async () => {
    setContextMenu(null);
    try {
      await navigator.clipboard.writeText(session.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch (err) {
      console.error('复制会话ID失败:', err);
    }
  };

  const sessionCwd = session.cwd || session.projectPath;

  const handleOpenInNewTab = () => {
    setContextMenu(null);
    if (onOpenInNewTab) {
      onOpenInNewTab(session.filePath, session.providerName, sessionCwd);
    }
  };

  const handleLocateInFolderList = () => {
    setContextMenu(null);
    if (onLocateInFolderList) {
      onLocateInFolderList(session.filePath, session.projectPath, session.providerName);
    }
  };

  return (
    <>
      <button
        onClick={(e) => {
          // Ctrl+Click / Cmd+Click → 在新标签页打开
          if ((e.ctrlKey || e.metaKey) && onOpenInNewTab) {
            e.preventDefault();
            onOpenInNewTab(session.filePath, session.providerName, sessionCwd);
            return;
          }
          onClick(session.filePath, session.providerName, sessionCwd);
        }}
        onMouseDown={(e) => {
          // 中键点击 → 在新标签页打开
          if (e.button === 1 && onOpenInNewTab) {
            e.preventDefault();
            onOpenInNewTab(session.filePath, session.providerName, sessionCwd);
          }
        }}
        onContextMenu={handleContextMenu}
        className={`w-full text-left ${isCompact ? 'pl-1.5 pr-1.5 py-1' : 'px-3 py-2.5'} rounded-lg transition-colors duration-150 group ${
          isSelected
            ? 'bg-primary-100 text-primary-900'
            : 'hover:bg-gray-100 text-gray-700'
        }`}
      >
        <div className={`flex items-start ${isCompact ? 'gap-1.5' : 'gap-2.5'}`}>
          <MessageSquare
            className={`${isCompact ? 'h-3.5 w-3.5 mt-px' : 'h-4 w-4 mt-0.5'} flex-shrink-0 ${
              isSelected ? 'text-primary-500' : 'text-gray-400'
            }`}
          />
          <div className="flex-1 min-w-0">
            {isSkeleton ? (
              <>
                <div className={`${isCompact ? 'h-[17px]' : 'h-[20px]'} w-3/4 bg-gray-200 rounded`} />
                <div className={`${isCompact ? 'h-[12px]' : 'h-[16px]'} w-1/3 bg-gray-100 rounded mt-1`} />
                {showProject && (
                  <div className={`${isCompact ? 'h-[12px]' : 'h-[16px]'} w-2/5 bg-gray-100 rounded ${isCompact ? 'mt-px' : 'mt-0.5'}`} />
                )}
              </>
            ) : (
              <>
                <p className={`${isCompact ? 'text-[13px] leading-snug' : 'text-sm'} font-medium truncate`} title={
                  ((f, l) => {
                    const first = (f || '').trim();
                    const last = (l || '').trim();
                    if (!last || first === last) return first || '(空会话)';
                    const MAX = 1000;
                    const prefix1 = '第一条:\n';
                    const prefix2 = '\n\n最后一条:\n';
                    const overhead = (prefix1 + prefix2).length;
                    const total = first.length + last.length;
                    if (total + overhead <= MAX) {
                      return prefix1 + first + prefix2 + last;
                    }
                    // 超限时等比例分配空间
                    const available = MAX - overhead;
                    const half = Math.floor(available / 2);
                    const fLen = Math.min(first.length, half);
                    const lLen = Math.min(last.length, available - fLen);
                    const fTrunc = first.length > fLen ? first.slice(0, fLen - 2) + '..' : first;
                    const lTrunc = last.length > lLen ? last.slice(0, lLen - 2) + '..' : last;
                    return prefix1 + fTrunc + prefix2 + lTrunc;
                  })(session.display, session.lastUserText || '')
                }>
                  {highlight
                    ? highlightText(
                        showFirst ? (session.display || '(空会话)') : (session.lastUserText || session.display || '(空会话)'),
                        highlight, searchColors.search)
                    : (showFirst ? (session.display || '(空会话)') : (session.lastUserText || session.display || '(空会话)'))}
                </p>
                <div className={`flex items-center ${isCompact ? 'gap-1 mt-px' : 'gap-1.5 mt-1'} text-xs text-gray-500 flex-wrap`}>
                  <span title={`创建: ${formatDateTime(session.timestamp)}${session.fileMtime ? `\n修改: ${formatDateTime(session.fileMtime)}` : ''}`}>
                    {relativeTime(effectiveTimeField === 'modified' ? (session.fileMtime || session.timestamp) : session.timestamp)}
                  </span>
                  {session.messageCount > 0 && (
                    <span className="text-gray-400">
                      · {session.messageCount} 条消息
                    </span>
                  )}
                  {showProvider && (
                    <span
                      className={`inline-flex items-center ${isCompact ? 'px-1' : 'px-1.5'} py-0.5 rounded-full text-[10px] font-medium border ${getProviderColor(session.providerName)}`}
                    >
                      {getProviderLabel(session.providerName)}
                    </span>
                  )}
                  {clientBadge && (
                    <span
                      className={`inline-flex items-center ${isCompact ? 'px-1' : 'px-1.5'} py-0.5 rounded-full text-[10px] font-medium border ${clientBadge.color}`}
                    >
                      {clientBadge.label}
                    </span>
                  )}
                </div>
                {showProject && (
                  <p
                    className={`text-xs text-gray-400 ${isCompact ? 'mt-px' : 'mt-0.5'} truncate`}
                    title={`会话存储路径: ${session.storagePath}\n工作目录: ${session.cwd || session.projectPath}`}
                  >
                    📁 {session.projectName}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </button>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-[100] bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {onOpenInNewTab && (
            <button
              onClick={handleOpenInNewTab}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <ExternalLink className="h-4 w-4 text-gray-400" />
              在新标签页中打开
            </button>
          )}
          <button
            onClick={handleOpenStorageDir}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <FolderOpen className="h-4 w-4 text-gray-400" />
            打开存储目录
          </button>
          <button
            onClick={handleOpenWorkingDir}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <Folder className="h-4 w-4 text-gray-400" />
            打开工作目录
          </button>
          {onLocateInFolderList && (
            <>
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={handleLocateInFolderList}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <FolderTree className="h-4 w-4 text-gray-400" />
                定位到文件夹列表
              </button>
              <div className="border-t border-gray-100 my-1" />
            </>
          )}
          <button
            onClick={handleCopyPath}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
          >
            {copiedPath ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4 text-gray-400" />
            )}
            复制文件路径
          </button>
          <button
            onClick={handleCopySessionId}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
          >
            {copiedId ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Hash className="h-4 w-4 text-gray-400" />
            )}
            复制会话 ID
          </button>
        </div>
      )}
    </>
  );
};
