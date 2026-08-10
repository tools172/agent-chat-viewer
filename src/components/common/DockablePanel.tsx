import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { PANEL_OPACITY_DEFAULT, PANEL_OPACITY_DRAG } from '../../types';

/** 滑板默认宽度（px），对应 w-96 */
const DEFAULT_WIDTH = 384;

interface DockablePanelProps {
  /** 面板水平偏移（0~1，相对可用空间的比例）；null/undefined 表示默认停靠右侧 */
  offset?: number | null;
  /** 面板不透明度（0~1），经 CSS 变量注入背景色 */
  opacity?: number;
  /** 面板宽度（px），默认 384 */
  width?: number;
  /** 是否启用毛玻璃模糊（backdrop-filter），默认 false（纯透明） */
  glass?: boolean;
  /** 除右侧边缘外的吸附锚点 x（px）：提供时，挂载会把持久化偏移吸附到「右侧边缘」或本锚点中更近的一个 */
  anchorX?: number;
  /** 头部标题 */
  title?: React.ReactNode;
  /** 头部右侧操作区（如关闭按钮） */
  actions?: React.ReactNode;
  onOffsetChange: (ratio: number) => void;
  onClose: () => void;
  /** 面板主体：头部下方的完整内容（自行负责内部滚动 / 底部固定区布局） */
  children: React.ReactNode;
}

/**
 * 覆盖式可拖动滑板（single responsibility：只负责「浮层 + 自由拖动 + 半透明」表现）
 * - fixed 浮层盖在内容之上，不挤占布局
 * - 头部手柄可水平拖动，松手停留在任意位置，偏移以「相对可用空间的比例」持久化，窗口缩放后按比例重新定位
 * - 背景用 rgba + --panel-opacity 实现半透明（rgb 变量保证 WebView2 兼容），不透明度由调用方注入
 * - 拖动中临时移除毛玻璃模糊并增大透明度：方便看清下方内容、避免拖动时 backdrop-filter 卡顿
 */
export const DockablePanel: React.FC<DockablePanelProps> = ({
  offset,
  opacity = PANEL_OPACITY_DEFAULT,
  width = DEFAULT_WIDTH,
  glass = false,
  anchorX,
  title,
  actions,
  onOffsetChange,
  onClose,
  children,
}) => {
  // 视口宽度：用于钳制偏移边界，随窗口缩放更新
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  // 瞬态水平偏移（px）：拖动中生效；null = 跟随持久化的 offset
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // 拖动起点与最近一次偏移，均只在事件回调中读写
  const dragStartRef = useRef({ pointerX: 0, offset: 0 });
  const latestOffsetRef = useRef<number>(0);

  const maxOffset = Math.max(0, viewportWidth - width);
  // 停靠比例：缺省停靠右侧；钳制在 0~1。窗口缩放后 px 偏移随 maxOffset 等比伸缩
  const dockedRatio = offset == null ? 1 : Math.min(1, Math.max(0, offset));
  const rawDockedOffset = dockedRatio * maxOffset;
  // 若指定 anchorX：打开时把上次位置吸附到「右侧边缘」或「anchorX」中更近的一个。
  // 只在挂载时计算一次——SettingsPanel 每次打开都会重新挂载，正好按上次关闭位置选位。
  const [snappedAnchor] = useState<number | null>(() => {
    if (anchorX == null) return null;
    const a = Math.min(Math.max(0, anchorX), maxOffset);
    return Math.abs(rawDockedOffset - maxOffset) <= Math.abs(rawDockedOffset - a)
      ? maxOffset
      : a;
  });
  // 吸附只作用于「打开那一刻」：一旦拖拽并松手，停驻就跟随自由位置（rawDockedOffset），不再回跳锚点
  const [hasDragged, setHasDragged] = useState(false);
  const baseOffset = !hasDragged && snappedAnchor != null ? snappedAnchor : rawDockedOffset;
  // 实际渲染偏移
  const renderOffset = dragOffset ?? baseOffset;
  // 拖动中：临时增大透明度（方便看清下方内容、避免卡顿），松手恢复静止值
  const renderOpacity = isDragging ? PANEL_OPACITY_DRAG : opacity;
  // 挂载滑入动画起点：从吸附位最近的屏外边缘滑入（纯 CSS keyframes，无需 rAF/状态）
  const slideFromX = baseOffset < viewportWidth / 2 ? -width : viewportWidth;

  // 窗口缩放时更新视口宽度
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 停靠位置变化时，同步「最新偏移」基线（拖动起点始终从当前位置开始）
  useEffect(() => {
    latestOffsetRef.current = baseOffset;
  }, [baseOffset]);

  // 吸附后把实际位置写回持久化：即使本次未拖动就关闭，「上次位置」也是吸附位（挂载时仅执行一次）
  useEffect(() => {
    if (snappedAnchor == null) return;
    onOffsetChange(maxOffset > 0 ? snappedAnchor / maxOffset : 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startDrag = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    // 头部内的交互控件（关闭按钮、透明度滑块等）不应触发拖拽
    if ((e.target as HTMLElement).closest('button')) return;
    if ((e.target as HTMLElement).closest('input')) return;
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* 某些环境（如 jsdom）不支持 pointer capture，忽略 */
    }
    dragStartRef.current = { pointerX: e.clientX, offset: latestOffsetRef.current };
    setIsDragging(true);
  }, []);

  const onDragMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      const { pointerX, offset: start } = dragStartRef.current;
      const next = Math.min(maxOffset, Math.max(0, start + (e.clientX - pointerX)));
      latestOffsetRef.current = next;
      setDragOffset(next);
    },
    [isDragging, maxOffset]
  );

  const endDrag = useCallback(() => {
    if (!isDragging) return;
    // 停留在松手时的位置：按比例持久化（窗口缩放后等比跟随）；瞬态偏移置空并与 store 更新同批提交（React 18 自动批处理），不会跳帧
    const current = latestOffsetRef.current;
    onOffsetChange(maxOffset > 0 ? current / maxOffset : 1);
    // 标记已拖拽：此后停驻跟随自由位置，不再被吸附锚点拉回
    setHasDragged(true);
    setDragOffset(null);
    setIsDragging(false);
  }, [isDragging, maxOffset, onOffsetChange]);

  return (
    <>
      {/* 背景遮罩：点击关闭 */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* 覆盖式滑板 */}
      <div
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col shadow-xl panel-glass${glass && !isDragging ? ' panel-glass-blur' : ''}`}
        style={{
          width: `${width}px`,
          transform: `translateX(${renderOffset}px)`,
          ['--panel-opacity' as string]: String(renderOpacity),
          ['--slide-from-x' as string]: `${slideFromX}px`,
          animation: 'dockable-slide-in 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {/* 头部：拖拽手柄 + 标题 + 操作区
            光标模型自洽：可拖区域（标题块/头部空白）→ grab；操作区（stopPropagation 切断拖拽）→ 箭头；
            操作区内的可点击控件自己叠加 cursor-pointer。不能让不可拖的地方显示抓手 */}
        <div
          className="flex items-center justify-between gap-3 px-5 py-4 border-b cursor-grab active:cursor-grabbing select-none touch-none"
          onPointerDown={startDrag}
          onPointerMove={onDragMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {/* 标题区固定不收缩，避免被右侧操作区挤压变形；这里才是真正的拖拽手柄 */}
          <div className="flex items-center gap-2 shrink-0" title="拖动面板到任意位置">
            <GripVertical className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <h2 className="text-lg font-semibold whitespace-nowrap">{title}</h2>
          </div>
          {/* 操作区占满剩余宽度（flex-1）并允许收缩：内部滑块承担收缩，空间不足时滑块变窄而非标题变形。
              整体 cursor-default：操作区不参与拖拽，间隙/容器不再误显抓手 */}
          <div className="flex items-center gap-1 flex-1 min-w-0 cursor-default">{actions}</div>
        </div>

        {children}
      </div>
    </>
  );
};
