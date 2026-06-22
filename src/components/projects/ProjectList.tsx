import React, { useMemo, useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Folder, ChevronDown, ChevronRight, FolderOpen } from 'lucide-react';
import type { Project, SessionSummary, SortConfig } from '../../types';
import { multiSort } from '../../utils/sort';
import { SessionItem } from '../sessions/SessionItem';
import { LoadingSkeleton } from '../common/LoadingSkeleton';
import * as tauri from '../../utils/tauri';

interface ProjectListProps {
  projects: Project[];
  /** 按项目路径缓存的会话列表 */
  sessionsCache: Record<string, SessionSummary[]>;
  allSessions?: SessionSummary[];
  sortConfig: SortConfig;
  selectedProjectPath: string | null;
  selectedSessionPath: string | null;
  isLoadingProject?: boolean;
  onSelectProject: (path: string, providerName: string) => void;
  onSelectSession: (path: string, providerName: string, cwd?: string) => void;
  onOpenInNewTab?: (path: string, providerName: string, cwd?: string) => void;
}

export const ProjectList: React.FC<ProjectListProps> = ({
  projects,
  sessionsCache,
  allSessions,
  sortConfig,
  selectedProjectPath,
  selectedSessionPath,
  isLoadingProject = false,
  onSelectProject,
  onSelectSession,
  onOpenInNewTab,
}) => {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    new Set()
  );
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; projectPath: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const handleProjectClick = (projectPath: string, providerName: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectPath)) next.delete(projectPath);
      else next.add(projectPath);
      return next;
    });
    onSelectProject(projectPath, providerName);
  };

  const handleProjectContextMenu = (e: React.MouseEvent, projectPath: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, projectPath });
  };

  const handleOpenProjectFolder = async () => {
    if (!contextMenu) return;
    const projectPath = contextMenu.projectPath;
    setContextMenu(null);
    try {
      // 优先使用会话中记录的实际工作目录(cwd)，回退到数据目录
      const session = allSessions?.find((s) => s.projectPath === projectPath && s.cwd);
      const targetDir = session?.cwd || projectPath;
      await tauri.openProjectFolder(targetDir);
    } catch (err) {
      console.error('打开工作目录失败:', err);
    }
  };

  const handleOpenProjectLocateFolder = async () => {
    if (!contextMenu) return;
    const path = contextMenu.projectPath;
    setContextMenu(null);
    try {
      await tauri.openContainingFolder(path);
    } catch (err) {
      console.error('打开所在文件夹失败:', err);
    }
  };

  // 对文件夹项排序
  const sortedProjects = useMemo(() => {
    if (!sortConfig.length) return projects;
    return [...projects].sort((a, b) => {
      for (const level of sortConfig) {
        let cmp = 0;
        switch (level.field) {
          case 'path':
            cmp = a.path.localeCompare(b.path);
            break;
          case 'created':
          case 'modified':
            cmp = a.lastActivity.localeCompare(b.lastActivity);
            break;
          case 'name':
            cmp = a.name.localeCompare(b.name);
            break;
          case 'messageCount':
            cmp = a.sessionCount - b.sessionCount;
            break;
          case 'agent':
            cmp = a.providerName.localeCompare(b.providerName);
            break;
          default:
            cmp = a.path.localeCompare(b.path);
            break;
        }
        if (cmp !== 0) {
          return level.direction === 'asc' ? cmp : -cmp;
        }
      }
      return 0;
    });
  }, [projects, sortConfig]);

  // 预计算每个文件夹的工作目录（cwd），用于 tooltip
  const projectWorkingPaths = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of projects) {
      // 优先使用会话中记录的实际工作目录(cwd)，回退到数据目录路径
      const session = allSessions?.find((s) => s.projectPath === project.path && s.cwd);
      map.set(project.path, session?.cwd || project.path);
    }
    return map;
  }, [projects, allSessions]);

  return (
    <div className="py-1">
      {sortedProjects.map((project) => {
        const isExpanded = expandedProjects.has(project.path);
        const isSelected = selectedProjectPath === project.path;

        return (
          <div key={project.path}>
            <button
              onClick={() => handleProjectClick(project.path, project.providerName)}
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
              <span
                className="flex-1 truncate text-left"
                title={`${project.name}\n工作目录: ${projectWorkingPaths.get(project.path) || project.path}`}
              >
                {project.name}
              </span>
              <span className="text-xs text-gray-400 flex-shrink-0 bg-gray-100 px-1.5 py-0.5 rounded-full">
                {project.sessionCount}
              </span>
            </button>

            {isExpanded && (() => {
              const projectSessions = sessionsCache[project.path];
              const sortedProjectSessions = projectSessions
                ? multiSort(projectSessions, sortConfig)
                : [];
              return (
              <div className="ml-4 border-l-2 border-gray-100 pl-1">
                {isLoadingProject && !projectSessions ? (
                  <LoadingSkeleton rows={3} variant="list" />
                ) : sortedProjectSessions.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-400">
                    暂无会话
                  </p>
                ) : (
                  sortedProjectSessions.map((session) => (
                    <SessionItem
                      key={session.id}
                      session={session}
                      isSelected={selectedSessionPath === session.filePath}
                      showProject={false}
                      showProvider={true}
                      onClick={onSelectSession}
                      onOpenInNewTab={onOpenInNewTab}
                    />
                  ))
                )}
              </div>
              );
            })()}
          </div>
        );
      })}

      {/* 文件夹右键菜单 */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-[100] bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={handleOpenProjectLocateFolder}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <FolderOpen className="h-4 w-4 text-gray-400" />
            打开所在文件夹
          </button>
          <button
            onClick={handleOpenProjectFolder}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <Folder className="h-4 w-4 text-gray-400" />
            打开工作目录
          </button>
        </div>
      )}
    </div>
  );
};
