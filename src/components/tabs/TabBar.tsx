import React, { useRef, useCallback, useState, useEffect } from 'react';
import type { TabState } from '../../types';
import { TabItem } from './TabItem';
import {
  scrollOneLeft as utilScrollOneLeft,
  scrollOneRight as utilScrollOneRight,
} from '../../utils/tabScroll';

interface TabBarProps {
  tabs: TabState[];
  activeTabId: string | null;
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onMoveTab: (fromIndex: number, toIndex: number) => void;
  onOpenContextMenu: (
    e: React.MouseEvent,
    tabId: string
  ) => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  onActivateTab,
  onCloseTab,
  onMoveTab,
  onOpenContextMenu,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragIndexRef = useRef<number | null>(null);
  const wheelTimeRef = useRef(0);
  const [overflowLeft, setOverflowLeft] = useState(0);
  const [overflowRight, setOverflowRight] = useState(0);

  // 当 activeTabId 变化时，将激活的标签页滚动到视野内
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !activeTabId) return;
    // 延迟一帧，等 DOM 更新完成再滚动
    const raf = requestAnimationFrame(() => {
      const activeItem = el.querySelector<HTMLElement>(
        `[data-tab-id="${activeTabId}"]`
      );
      if (activeItem) {
        activeItem.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [activeTabId]);

  // 监听滚动、容器尺寸变化、窗口尺寸变化，计算溢出标签数
  useEffect(() => {
    const scrollEl = scrollRef.current;
    const containerEl = containerRef.current;
    if (!scrollEl || !containerEl || tabs.length === 0) return;

    const calc = () => {
      const leftEdge = scrollEl.scrollLeft;
      const rightEdge = leftEdge + scrollEl.clientWidth;
      const items = scrollEl.querySelectorAll<HTMLElement>('[data-tab-item]');
      let hiddenLeft = 0;
      let hiddenRight = 0;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.offsetLeft + item.offsetWidth < leftEdge) {
          hiddenLeft++;
        } else if (item.offsetLeft > rightEdge) {
          hiddenRight++;
        }
      }
      setOverflowLeft(hiddenLeft);
      setOverflowRight(hiddenRight);
    };

    calc();
    scrollEl.addEventListener('scroll', calc, { passive: true });
    // 观察外层容器：侧边栏拖拽 / 窗口 resize 都会触发容器宽度变化
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(calc)
        : null;
    ro?.observe(containerEl);
    // 窗口 resize 作为兜底
    window.addEventListener('resize', calc);
    return () => {
      scrollEl.removeEventListener('scroll', calc);
      ro?.disconnect();
      window.removeEventListener('resize', calc);
    };
  }, [tabs]);

  // 拖拽排序
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    dragIndexRef.current = index;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, _index: number) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      const fromIndex = dragIndexRef.current;
      if (fromIndex !== null && fromIndex !== toIndex) {
        onMoveTab(fromIndex, toIndex);
      }
      dragIndexRef.current = null;
    },
    [onMoveTab]
  );

  // 鼠标滚轮水平滚动（记录时间，用于抑制误触激活）
  const handleWheel = useCallback((e: React.WheelEvent) => {
    wheelTimeRef.current = Date.now();
    const el = scrollRef.current;
    if (!el) return;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    const atStart = el.scrollLeft <= 0;
    if ((e.deltaY > 0 && !atEnd) || (e.deltaY < 0 && !atStart)) {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    }
  }, []);

  /** 向左滚动一个标签：使用 scrollIntoView 确保亚像素精度 */
  const scrollOneLeft = useCallback(() => {
    const el = scrollRef.current;
    if (el) utilScrollOneLeft(el);
  }, []);

  /** 向右滚动一个标签：使用 scrollIntoView 确保亚像素精度 */
  const scrollOneRight = useCallback(() => {
    const el = scrollRef.current;
    if (el) utilScrollOneRight(el);
  }, []);

  const scrollToStart = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ left: 0, behavior: 'smooth' });
  }, []);

  const scrollToEnd = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
  }, []);

  /** 左侧按钮点击：普通=滚动一个标签，Shift=跳到最左 */
  const handleLeftClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.shiftKey) {
        scrollToStart();
      } else {
        scrollOneLeft();
      }
    },
    [scrollOneLeft, scrollToStart]
  );

  /** 右侧按钮点击：普通=滚动一个标签，Shift=跳到最右 */
  const handleRightClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.shiftKey) {
        scrollToEnd();
      } else {
        scrollOneRight();
      }
    },
    [scrollOneRight, scrollToEnd]
  );

  // 滚轮滚动后 250ms 内抑制标签激活，防止滚轮误触切换选中
  const handleActivate = useCallback(
    (tabId: string) => {
      if (Date.now() - wheelTimeRef.current > 250) {
        onActivateTab(tabId);
      }
    },
    [onActivateTab]
  );

  if (tabs.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="flex items-stretch bg-gray-50 border-b border-gray-200 flex-shrink-0 relative"
      style={{ height: 36 }}
    >
      {/* 左侧指示器始终存在 */}
      <div
        className={`flex-shrink-0 flex items-center gap-1 mr-1.5 pr-1.5 pl-1.5 text-xs border-r border-gray-200
          bg-gray-50/80
          ${overflowLeft > 0 ? 'text-primary-600 hover:text-primary-700 cursor-pointer font-bold' : 'text-gray-300'}`}
        title={
          overflowLeft > 0
            ? `点击向左滚动一个标签 · Shift+点击直接跳到最左侧（左侧还有 ${overflowLeft} 个标签页）`
            : '已到最左侧'
        }
        onClick={overflowLeft > 0 ? handleLeftClick : undefined}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15,18 9,12 15,6" />
        </svg>
        <span className="tabular-nums">{overflowLeft}</span>
      </div>

      {/* 可水平滚动的标签列表 */}
      <div
        ref={scrollRef}
        onWheel={handleWheel}
        className="flex items-stretch flex-1 min-w-0 overflow-x-auto"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {tabs.map((tab, i) => (
          <div key={tab.id} data-tab-item data-tab-id={tab.id} className="flex-shrink-0">
            <TabItem
              tab={tab}
              isActive={tab.id === activeTabId}
              index={i}
              onActivate={handleActivate}
              onClose={onCloseTab}
              onContextMenu={onOpenContextMenu}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            />
          </div>
        ))}
      </div>

      {/* 右侧指示器始终存在，撑住位置防止标签关闭按钮位移 */}
      <div
        className={`flex-shrink-0 flex items-center gap-1 ml-1.5 pl-1.5 pr-1.5 text-xs border-l border-gray-200
          bg-gray-50/80
          ${overflowRight > 0 ? 'text-primary-600 hover:text-primary-700 cursor-pointer font-bold' : 'text-gray-300'}`}
        title={
          overflowRight > 0
            ? `点击向右滚动一个标签 · Shift+点击直接跳到最右侧（右侧还有 ${overflowRight} 个标签页）`
            : '所有标签页已展示'
        }
        onClick={overflowRight > 0 ? handleRightClick : undefined}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9,18 15,12 9,6" />
        </svg>
        <span className="tabular-nums">{overflowRight}</span>
      </div>

      {/* 隐藏 webkit 滚动条 */}
      <style>{`
        .overflow-x-auto::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
};
