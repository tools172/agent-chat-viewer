import React, { useMemo } from 'react';
import type { SessionSummary, SortConfig } from '../../types';
import { multiSort } from '../../utils/sort';
import { useSettingsStore } from '../../stores/settingsStore';
import { SessionItem } from './SessionItem';

interface FlatSessionListProps {
  sessions: SessionSummary[];
  sortConfig: SortConfig;
  selectedSessionPath: string | null;
  /** 搜索高亮词 */
  highlight?: string;
  onSelectSession: (path: string, providerName: string, cwd?: string) => void;
  onOpenInNewTab?: (path: string, providerName: string, cwd?: string) => void;
  onLocateInFolderList?: (filePath: string, projectPath: string, providerName: string) => void;
}

export const FlatSessionList: React.FC<FlatSessionListProps> = ({
  sessions,
  sortConfig,
  selectedSessionPath,
  highlight,
  onSelectSession,
  onOpenInNewTab,
  onLocateInFolderList,
}) => {
  const density = useSettingsStore((s) => s.settings.sessionListStyle ?? 'loose');
  const isCompact = density === 'compact';

  const sorted = useMemo(
    () => multiSort(sessions, sortConfig),
    [sessions, sortConfig]
  );

  if (sessions.length === 0) {
    return (
      <p className="px-4 py-8 text-sm text-gray-400 text-center">
        暂无会话记录
      </p>
    );
  }

  return (
    <div className={isCompact ? 'py-0.5' : 'py-1'}>
      {sorted.map((session) => (
        <SessionItem
          key={session.id}
          session={session}
          isSelected={selectedSessionPath === session.filePath}
          showProject={true}
          showProvider={true}
          highlight={highlight}
          density={density}
          onClick={onSelectSession}
          onOpenInNewTab={onOpenInNewTab}
          onLocateInFolderList={onLocateInFolderList}
        />
      ))}
    </div>
  );
};
