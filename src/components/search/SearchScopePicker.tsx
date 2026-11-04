import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Search, X } from "lucide-react";
import type { Project, SearchScope, SearchScopeMode } from "../../types";
import { getProviderColor, getProviderLabel } from "../../utils/providers";

/** 浮层锚点（来自触发按钮的 getBoundingClientRect） */
export interface PickerAnchorRect {
  left: number;
  top: number;
  bottom: number;
}

interface SearchScopePickerProps {
  anchorRect: PickerAnchorRect;
  mode: SearchScopeMode;
  scopes: SearchScope[];
  projects: Project[];
  onClose: () => void;
  onModeChange: (mode: SearchScopeMode) => void;
  onToggleScope: (scope: SearchScope) => void;
  onSetScopes: (scopes: SearchScope[]) => void;
}

const POPOVER_WIDTH = 320;

function scopeKey(scope: SearchScope): string {
  // projectPath 可能包含冒号（Windows 盘符），使用分隔符拼接避免歧义
  return `${scope.providerName}\u0000${scope.projectPath}`;
}

export const SearchScopePicker: React.FC<SearchScopePickerProps> = ({
  anchorRect,
  mode,
  scopes,
  projects,
  onClose,
  onModeChange,
  onToggleScope,
  onSetScopes,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState("");
  const [position, setPosition] = useState({
    left: anchorRect.left,
    top: anchorRect.bottom + 4,
  });

  const selectedKeys = useMemo(
    () => new Set(scopes.map(scopeKey)),
    [scopes],
  );

  const filteredProjects = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter(
      (project) =>
        project.name.toLowerCase().includes(query) ||
        project.path.toLowerCase().includes(query) ||
        getProviderLabel(project.providerName).toLowerCase().includes(query),
    );
  }, [filter, projects]);

  const unavailableScopes = useMemo(
    () =>
      scopes.filter(
        (scope) =>
          !projects.some(
            (project) =>
              project.path === scope.projectPath &&
              project.providerName === scope.providerName,
          ),
      ),
    [projects, scopes],
  );

  // 依据实际尺寸把浮层限制在视口内，避免被侧栏滚动容器裁剪
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = Math.min(anchorRect.left, vw - rect.width - gap);
    left = Math.max(gap, left);

    let top = anchorRect.bottom + 4;
    if (top + rect.height > vh - gap) {
      top = Math.max(gap, anchorRect.top - rect.height - 4);
    }

    setPosition({ left, top });
  }, [anchorRect]);

  // 点击外部 / Esc 关闭；触发按钮自身由 data 属性排除
  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (rootRef.current?.contains(target as Node)) return;
      if (target?.closest?.("[data-search-scope-trigger]")) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    const onResize = () => onClose();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [onClose]);

  const toggleProject = (project: Project) => {
    onToggleScope({
      projectPath: project.path,
      providerName: project.providerName,
    });
  };

  const handleSelectAll = () => {
    const additions = filteredProjects
      .filter(
        (project) =>
          !selectedKeys.has(
            scopeKey({
              projectPath: project.path,
              providerName: project.providerName,
            }),
          ),
      )
      .map((project) => ({
        projectPath: project.path,
        providerName: project.providerName,
      }));
    if (additions.length === 0 && mode === "selected") return;
    onSetScopes([...scopes, ...additions]);
  };

  return (
    <div
      ref={rootRef}
      className="fixed z-[120] bg-white border border-gray-200 rounded-lg shadow-lg p-2"
      style={{ left: position.left, top: position.top, width: POPOVER_WIDTH }}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <div className="px-1 pb-1.5 text-xs font-medium text-gray-700">
        选择工作目录
      </div>

      {/* 范围模式 */}
      <div className="space-y-1 px-1 pb-1.5">
        <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
          <input
            type="radio"
            name="search-scope-mode"
            checked={mode === "all"}
            onChange={() => onModeChange("all")}
          />
          全部工作目录
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
          <input
            type="radio"
            name="search-scope-mode"
            checked={mode === "selected"}
            onChange={() => onModeChange("selected")}
          />
          指定工作目录
          <span className="text-gray-400">（已选 {scopes.length}）</span>
        </label>
      </div>

      {/* 筛选 */}
      <div className="relative px-1 pb-1.5">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="筛选工作目录..."
          className="w-full pl-7 pr-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-transparent"
        />
      </div>

      {/* 项目列表 */}
      <div className="max-h-60 overflow-y-auto border-t border-gray-100 pt-1">
        {filteredProjects.length === 0 ? (
          <p className="px-2 py-4 text-xs text-gray-400 text-center">
            未找到工作目录
          </p>
        ) : (
          filteredProjects.map((project) => {
            const checked =
              mode === "selected" &&
              selectedKeys.has(
                scopeKey({
                  projectPath: project.path,
                  providerName: project.providerName,
                }),
              );
            return (
              <label
                key={`${project.providerName}:${project.path}`}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
                title={project.path}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleProject(project)}
                  className="flex-shrink-0"
                />
                <span className="flex-1 min-w-0 truncate text-xs text-gray-700">
                  {project.name}
                </span>
                <span
                  className={`flex-shrink-0 text-[10px] px-1 py-0.5 rounded border ${getProviderColor(project.providerName)}`}
                >
                  {getProviderLabel(project.providerName)}
                </span>
              </label>
            );
          })
        )}

        {/* 刷新后已不存在的范围项：保留并允许移除，但不参与搜索 */}
        {mode === "selected" && unavailableScopes.length > 0 && (
          <div className="border-t border-gray-100 mt-1 pt-1">
            <p className="px-2 py-0.5 text-[10px] text-gray-400">不可用</p>
            {unavailableScopes.map((scope) => (
              <div
                key={scopeKey(scope)}
                className="flex items-center gap-2 px-2 py-1 text-xs text-gray-400"
                title={scope.projectPath}
              >
                <span className="flex-1 min-w-0 truncate">
                  {scope.projectPath}
                </span>
                <span className="flex-shrink-0 text-[10px] px-1 py-0.5 rounded bg-gray-100 text-gray-500">
                  不可用
                </span>
                <button
                  type="button"
                  onClick={() => onToggleScope(scope)}
                  className="p-0.5 rounded hover:bg-gray-200 hover:text-red-500"
                  title="从搜索范围中移除"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部操作 */}
      <div className="flex items-center justify-between gap-2 border-t border-gray-100 mt-1 pt-1.5 px-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleSelectAll}
            className="px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-100 rounded"
          >
            全选
          </button>
          <button
            type="button"
            onClick={() => onSetScopes([])}
            className="px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-100 rounded"
          >
            清空
          </button>
        </div>
        <span className="text-[11px] text-gray-400">
          已选 {scopes.length}/{projects.length}
        </span>
      </div>
    </div>
  );
};
