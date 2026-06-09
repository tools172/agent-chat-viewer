import React from 'react';
import { MessageSquare } from 'lucide-react';
import { relativeTime } from '../../utils/time';
import { getProviderLabel, getProviderColor } from '../../utils/providers';
import { useSettingsStore } from '../../stores/settingsStore';
import { highlightText } from '../../utils/highlight';

interface SessionItemProps {
  session: import('../../types').SessionSummary;
  isSelected: boolean;
  showProject?: boolean;
  highlight?: string;
  showProvider?: boolean;
  onClick: () => void;
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

  return (
    <button
      onClick={onClick}
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
  );
};
