import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export interface CodeBlockControls {
  /** 查询某个代码块当前是否展开 */
  isExpanded: (blockId: string) => boolean;
  /** 单块折叠 / 展开切换 */
  toggleOne: (blockId: string) => void;
  /** 强制展开某块（用于查找定位） */
  expandOne: (blockId: string) => void;
}

export const CodeBlockContext = createContext<CodeBlockControls | null>(null);

/** 供查找栏等外部组件使用；不在 Provider 内时返回 null */
export function useCodeBlockControls(): CodeBlockControls | null {
  return useContext(CodeBlockContext);
}

/**
 * 管理一个会话内所有代码块的展开状态。
 *
 * - allCollapsed：工具栏"折叠/展开全部"的全局模式
 * - overrides：单块手动切换后的覆盖值（true 展开 / false 折叠）
 *
 * 全局模式切换时会清空覆盖值，保证所有代码块跟随全局按钮。
 */
export function useCodeBlockController() {
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const isExpanded = useCallback(
    (blockId: string) => overrides[blockId] ?? !allCollapsed,
    [overrides, allCollapsed],
  );

  const toggleOne = useCallback(
    (blockId: string) => {
      setOverrides((prev) => ({
        ...prev,
        [blockId]: !(prev[blockId] ?? !allCollapsed),
      }));
    },
    [allCollapsed],
  );

  const expandOne = useCallback((blockId: string) => {
    setOverrides((prev) => ({ ...prev, [blockId]: true }));
  }, []);

  const toggleAll = useCallback(() => {
    setAllCollapsed((collapsed) => !collapsed);
    setOverrides({});
  }, []);

  const controls = useMemo(
    () => ({ isExpanded, toggleOne, expandOne }),
    [isExpanded, toggleOne, expandOne],
  );

  return { allCollapsed, toggleAll, controls };
}

/** 代码块自身的展开状态；无 Provider 时退回组件本地状态 */
export function useCodeBlockExpansion(blockId: string) {
  const controls = useContext(CodeBlockContext);
  const [localExpanded, setLocalExpanded] = useState(true);

  const toggle = useCallback(() => {
    if (controls) controls.toggleOne(blockId);
    else setLocalExpanded((expanded) => !expanded);
  }, [controls, blockId]);

  return {
    expanded: controls ? controls.isExpanded(blockId) : localExpanded,
    toggle,
  };
}
