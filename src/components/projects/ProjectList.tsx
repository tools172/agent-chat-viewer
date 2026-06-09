import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Folder, ChevronDown, ChevronRight, FolderOpen, Copy, Check } from 'lucide-react';
import type { Project, SessionSummary, SortConfig } from '../../types';
import { multiSort } from '../../utils/sort';
import { SessionItem } from '../sessions/SessionItem';
import * as tauri from '../../utils/tauri';

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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; projectPath: string } | null>(null);
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

  const handleProjectClick = (projectPath: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectPath)) next.delete(projectPath);
      else next.add(projectPath);
      return next;
    });
    onSelectProject(projectPath);
  };

  const handleProjectContextMenu = (e: React.MouseEvent, projectPath: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, projectPath });
  };

  const handleOpenProjectFolder = async () => {
    if (!contextMenu) return;
    const path = contextMenu.projectPath;
    setContextMenu(null);
    try {
      await tauri.openContainingFolder(path);
    } catch (err) {
      console.error('打开文件夹失败:', err);
    }
  };

  const handleCopyProjectPath = async () => {
    if (!contextMenu) return;
    const path = contextMenu.projectPath;
    setContextMenu(null);
    try {
      await navigator.clipboard.writeText(path);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    } catch (err) {
      console.error('复制路径失败:', err);
    }
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
              onContextMenu={(e) => handleProjectContextMenu(e, project.path)}
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

      {/* 项目右键菜单 */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-[100] bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={handleOpenProjectFolder}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <FolderOpen className="h-4 w-4 text-gray-400" />
            打开项目文件夹
          </button>
          <button
            onClick={handleCopyProjectPath}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
          >
            {copiedPath ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4 text-gray-400" />
            )}
            复制文件夹路径
          </button>
        </div>
      )}
    </div>
  );
};
