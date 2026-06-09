import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, FolderOpen, Copy, Check } from 'lucide-react';
import { relativeTime } from '../../utils/time';
import { getProviderLabel, getProviderColor } from '../../utils/providers';
import { useSettingsStore } from '../../stores/settingsStore';
import { highlightText } from '../../utils/highlight';
import * as tauri from '../../utils/tauri';

interface SessionItemProps {
  session: import('../../types').SessionSummary;
  isSelected: boolean;
  showProject?: boolean;
  highlight?: string;
  showProvider?: boolean;
  onClick: (path: string, providerName: string) => void;
}

export const SessionItem: React.FC<SessionItemProps> = ({
  session,
  isSelected,
  showProject,
  highlight,
  showProvider = true,
  onClick,
}) => {
  const searchColors = useSettingsStore((s) => s.settings.searchColors);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [copiedPath, setCopiedPath] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleOpenFolder = async () => {
    setContextMenu(null);
    try {
      await tauri.openContainingFolder(session.filePath);
    } catch (err) {
      console.error('打开文件夹失败:', err);
    }
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

  return (
    <>
      <button
        onClick={() => onClick(session.filePath, session.providerName)}
        onContextMenu={handleContextMenu}
        className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors duration-150 group ${
          isSelected
            ? 'bg-primary-100 text-primary-900'
            : 'hover:bg-gray-100 text-gray-700'
        }`}
      >
        <div className="flex items-start gap-2.5">
          <MessageSquare
            className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
              isSelected ? 'text-primary-500' : 'text-gray-400'
            }`}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" title={session.display}>
              {highlight
                ? highlightText(session.display || '(空会话)', highlight, searchColors.search)
                : (session.display || '(空会话)')}
            </p>

            {/* 元信息行 */}
            <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500 flex-wrap">
              <span>{relativeTime(session.timestamp)}</span>
              {session.messageCount > 0 && (
                <span className="text-gray-400">
                  · {session.messageCount} 条消息
                </span>
              )}
              {showProvider && (
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${getProviderColor(session.providerName)}`}
                >
                  {getProviderLabel(session.providerName)}
                </span>
              )}
            </div>

            {/* 项目路径（全部/时间线视图显示） */}
            {showProject && (
              <p
                className="text-xs text-gray-400 mt-0.5 truncate"
                title={session.projectPath}
              >
                📁 {session.projectName}
              </p>
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
          <button
            onClick={handleOpenFolder}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <FolderOpen className="h-4 w-4 text-gray-400" />
            打开所在文件夹
          </button>
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
        </div>
      )}
    </>
  );
};
