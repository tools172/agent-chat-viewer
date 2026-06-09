import React, { useMemo, useState } from 'react';
import { Folder, ChevronDown, ChevronRight } from 'lucide-react';
import type { Project, SessionSummary, SortConfig } from '../../types';
import { multiSort } from '../../utils/sort';
import { SessionItem } from '../sessions/SessionItem';

interface ProjectListProps {
  projects: Project[];
  sessions: SessionSummary[];
  sortConfig: SortConfig;
  selectedProjectPath: string | null;
  selectedSessionPath: string | null;
  isLoadingProject?: boolean;
  onSelectProject: (path: string) => void;
  onSelectSession: (path: string) => void;
}

export const ProjectList: React.FC<ProjectListProps> = ({
  projects,
  sessions,
  sortConfig,
  selectedProjectPath,
  selectedSessionPath,
  onSelectProject,
  onSelectSession,
}) => {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    new Set()
  );

  const handleProjectClick = (projectPath: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectPath)) next.delete(projectPath);
      else next.add(projectPath);
      return next;
    });
    onSelectProject(projectPath);
  };

  // 对项目内的会话排序
  const sortedSessions = useMemo(
    () => multiSort(sessions, sortConfig),
    [sessions, sortConfig]
  );

  return (
    <div className="py-1">
      {projects.map((project) => {
        const isExpanded = expandedProjects.has(project.path);
        const isSelected = selectedProjectPath === project.path;

        return (
          <div key={project.path}>
            <button
              onClick={() => handleProjectClick(project.path)}
              className={`flex items-center gap-2 w-full px-3 py-2 text-sm font-medium transition-colors ${
                isSelected
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
              )}
              <Folder className="h-4 w-4 flex-shrink-0 text-yellow-500" />
              <span className="flex-1 truncate text-left" title={project.name}>
                {project.name}
              </span>
              <span className="text-xs text-gray-400 flex-shrink-0 bg-gray-100 px-1.5 py-0.5 rounded-full">
                {project.sessionCount}
              </span>
            </button>

            {isExpanded && (
              <div className="ml-4 border-l-2 border-gray-100 pl-1">
                {sortedSessions.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-400">
                    加载中...
                  </p>
                ) : (
                  sortedSessions.map((session) => (
                    <SessionItem
                      key={session.id}
                      session={session}
                      isSelected={selectedSessionPath === session.filePath}
                      showProject={false}
                      showProvider={true}
                      onClick={() => onSelectSession(session.filePath)}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
