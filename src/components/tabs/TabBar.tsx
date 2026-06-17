import React, { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import type { TabState } from '../../types';
import { TabItem } from './TabItem';
import { TabPinService } from '../../utils/tabPinService';
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

/** 溢出指示器 hook — 监听滚动容器的溢出状态 */
function useOverflowIndicator(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  tabs: TabState[],
) {
  const [overflowLeft, setOverflowLeft] = useState(0);
  const [overflowRight, setOverflowRight] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || tabs.length === 0) return;

    const calc = () => {
      // 使用 getBoundingClientRect — 与 tabScroll.ts 的 scrollOneRight/scrollOneLeft
      // 使用完全相同的测量方式，避免 offsetLeft (整数) vs rect (浮点) 的亚像素偏差
      const scrollRect = el.getBoundingClientRect();
      const items = el.querySelectorAll<HTMLElement>('[data-tab-item]');
      let hiddenLeft = 0;
      let hiddenRight = 0;
      for (let i = 0; i < items.length; i++) {
        const rect = items[i].getBoundingClientRect();
        if (rect.right <= scrollRect.left) {
          hiddenLeft++;
        } else if (rect.left >= scrollRect.right) {
          hiddenRight++;
        }
      }
      setOverflowLeft(hiddenLeft);
      setOverflowRight(hiddenRight);
    };

    calc();
    el.addEventListener('scroll', calc, { passive: true });
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(calc)
        : null;
    // 同时观察滚动容器自身和父容器，确保钉住区增减时宽度变化也能触发重算
    ro?.observe(el);
    const containerEl = el.parentElement;
    if (containerEl) ro?.observe(containerEl);
    window.addEventListener('resize', calc);
    return () => {
      el.removeEventListener('scroll', calc);
      ro?.disconnect();
      window.removeEventListener('resize', calc);
    };
  }, [scrollRef, tabs]);

  return { overflowLeft, overflowRight };
}

/** 溢出指示器按钮 */
const OverflowIndicator: React.FC<{
  direction: 'left' | 'right';
  count: number;
  title: string;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}> = ({ direction, count, title, onClick }) => {
  const active = count > 0;
  const borderClass =
    direction === 'left' ? 'border-r border-gray-200' : 'border-l border-gray-200';
  const marginClass =
    direction === 'left' ? 'mr-1 pr-1 pl-1' : 'ml-1 pl-1 pr-1';

  return (
    <div
      className={`flex-shrink-0 flex items-center gap-0.5 text-xs bg-gray-50/80 cursor-pointer select-none ${borderClass} ${marginClass}
        ${active ? 'text-primary-600 hover:text-primary-700 hover:bg-gray-100 font-bold' : 'text-gray-300'}`}
      title={title}
      onClick={active ? onClick : undefined}
    >
      {direction === 'left' ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15,18 9,12 15,6" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9,18 15,12 9,6" />
        </svg>
      )}
      <span className="tabular-nums">{count}</span>
    </div>
  );
};

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  onActivateTab,
  onCloseTab,
  onMoveTab,
  onOpenContextMenu,
}) => {
  // === 拆分钉住 / 普通标签 ===
  const pinService = useMemo(() => new TabPinService(), []);
  const { pinned: pinnedTabs, regular: regularTabs } = useMemo(
    () => pinService.split(tabs),
    [pinService, tabs],
  );
  const pinnedStart = 0;
  const regularStart = pinnedTabs.length;

  // === 两个独立的滚动容器 ===
  const pinnedScrollRef = useRef<HTMLDivElement>(null);
  const regularScrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // === 溢出指示器 ===
  const pinnedOverflow = useOverflowIndicator(pinnedScrollRef, pinnedTabs);
  const regularOverflow = useOverflowIndicator(regularScrollRef, regularTabs);

  // === 滚轮时间追踪（防误触） ===
  const wheelTimeRef = useRef(0);

  // === 拖拽状态 ===
  const dragIndexRef = useRef<number | null>(null);
  const dragSectionRef = useRef<'pinned' | 'regular' | null>(null);

  // 激活标签时滚动到视野内
  useEffect(() => {
    if (!activeTabId) return;
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (!activeTab) return;

    const scrollRef = activeTab.pinned ? pinnedScrollRef : regularScrollRef;
    const raf = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      const activeItem = el.querySelector<HTMLElement>(
        `[data-tab-id="${activeTabId}"]`,
      );
      if (activeItem) {
        activeItem.scrollIntoView({
          block: 'nearest',
          inline: 'nearest',
          behavior: 'smooth',
        });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [activeTabId, tabs]);

  // === 拖拽事件处理 ===
  const handleDragStart = useCallback(
    (section: 'pinned' | 'regular') =>
      (_e: React.DragEvent, index: number) => {
        dragIndexRef.current = index;
        dragSectionRef.current = section;
        if (_e.dataTransfer) {
          _e.dataTransfer.effectAllowed = 'move';
          _e.dataTransfer.setData('text/plain', String(index));
        }
      },
    [],
  );

  const handleDragOver = useCallback(
    (section: 'pinned' | 'regular') =>
      (e: React.DragEvent) => {
        if (dragSectionRef.current === section) {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        } else {
          // 跨区拖拽 — 禁止
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
        }
      },
    [],
  );

  const handleDrop = useCallback(
    (section: 'pinned' | 'regular', sectionStart: number) =>
      (e: React.DragEvent, toIndex: number) => {
        e.preventDefault();
        if (dragSectionRef.current !== section) return;
        const fromIndex = dragIndexRef.current;
        if (fromIndex !== null && fromIndex !== toIndex) {
          onMoveTab(sectionStart + fromIndex, sectionStart + toIndex);
        }
        dragIndexRef.current = null;
        dragSectionRef.current = null;
      },
    [onMoveTab],
  );

  // === 滚轮事件 ===
  const handleWheel = useCallback((e: React.WheelEvent) => {
    wheelTimeRef.current = Date.now();
    const el = e.currentTarget as HTMLDivElement;
    if (!el) return;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    const atStart = el.scrollLeft <= 0;
    if ((e.deltaY > 0 && !atEnd) || (e.deltaY < 0 && !atStart)) {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    }
  }, []);

  // === 滚轮后抑制激活（防误触） ===
  const handleActivate = useCallback(
    (tabId: string) => {
      if (Date.now() - wheelTimeRef.current > 250) {
        onActivateTab(tabId);
      }
    },
    [onActivateTab],
  );

  // === 溢出按钮点击回调（使用 tabScroll.ts 中已测试的工具函数） ===

  /** 向左滚动一个标签：使用 scrollIntoView 确保亚像素精度 */
  const scrollOneLeft = useCallback(
    (ref: React.RefObject<HTMLDivElement | null>) => () => {
      const el = ref.current;
      if (el) utilScrollOneLeft(el);
    },
    [],
  );

  /** 向右滚动一个标签：使用 scrollIntoView 确保亚像素精度 */
  const scrollOneRight = useCallback(
    (ref: React.RefObject<HTMLDivElement | null>) => () => {
      const el = ref.current;
      if (el) utilScrollOneRight(el);
    },
    [],
  );

  /** 左侧按钮点击：普通=滚动一个标签，Shift=跳到最左 */
  const scrollToStart = useCallback(
    (ref: React.RefObject<HTMLDivElement | null>) => (e: React.MouseEvent) => {
      if (e.shiftKey && ref.current) {
        ref.current.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        scrollOneLeft(ref)();
      }
    },
    [scrollOneLeft],
  );

  /** 右侧按钮点击：普通=滚动一个标签，Shift=跳到最右 */
  const scrollToEnd = useCallback(
    (ref: React.RefObject<HTMLDivElement | null>) => (e: React.MouseEvent) => {
      if (e.shiftKey && ref.current) {
        ref.current.scrollTo({
          left: ref.current.scrollWidth,
          behavior: 'smooth',
        });
      } else {
        scrollOneRight(ref)();
      }
    },
    [scrollOneRight],
  );

  if (tabs.length === 0) return null;

  // 是否显示钉住区域
  const showPinned = pinnedTabs.length > 0;

  return (
    <div
      ref={containerRef}
      className="flex items-stretch bg-gray-50 border-b border-gray-200 flex-shrink-0 relative"
      style={{ height: 36 }}
    >
      {/* ====== 钉住区域 ====== */}
      {showPinned && (
        <>
          <div
            ref={pinnedScrollRef}
            onWheel={handleWheel}
            className="flex items-stretch min-w-0 overflow-x-auto"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {pinnedTabs.map((tab, i) => (
              <div
                key={tab.id}
                data-tab-item
                data-tab-id={tab.id}
                className="flex-shrink-0"
              >
                <TabItem
                  tab={tab}
                  isActive={tab.id === activeTabId}
                  index={i}
                  onActivate={handleActivate}
                  onClose={onCloseTab}
                  onContextMenu={onOpenContextMenu}
                  onDragStart={handleDragStart('pinned')}
                  onDragOver={handleDragOver('pinned')}
                  onDrop={handleDrop('pinned', pinnedStart)}
                />
              </div>
            ))}
          </div>

          {/* 钉住区右溢出指示器 */}
          {pinnedOverflow.overflowRight > 0 && (
            <OverflowIndicator
              direction="right"
              count={pinnedOverflow.overflowRight}
              title={`钉住区域右侧还有 ${pinnedOverflow.overflowRight} 个标签`}
              onClick={scrollToEnd(pinnedScrollRef)}
            />
          )}

          {/* 钉住 / 普通 分隔线 */}
          <div className="flex-shrink-0 w-px bg-gray-300 mx-0.5" />
        </>
      )}

      {/* ====== 普通区域 ====== */}

      {/* 左溢出指示器 */}
      <OverflowIndicator
        direction="left"
        count={regularOverflow.overflowLeft}
        title={
          regularOverflow.overflowLeft > 0
            ? `点击向左滚动一个标签 · Shift+点击直接跳到最左侧（左侧还有 ${regularOverflow.overflowLeft} 个标签页）`
            : '已到最左侧'
        }
        onClick={scrollToStart(regularScrollRef)}
      />

      <div
        ref={regularScrollRef}
        onWheel={handleWheel}
        className="flex items-stretch flex-1 min-w-0 overflow-x-auto"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {regularTabs.map((tab, i) => (
          <div
            key={tab.id}
            data-tab-item
            data-tab-id={tab.id}
            className="flex-shrink-0"
          >
            <TabItem
              tab={tab}
              isActive={tab.id === activeTabId}
              index={i}
              onActivate={handleActivate}
              onClose={onCloseTab}
              onContextMenu={onOpenContextMenu}
              onDragStart={handleDragStart('regular')}
              onDragOver={handleDragOver('regular')}
              onDrop={handleDrop('regular', regularStart)}
            />
          </div>
        ))}
      </div>

      {/* 右溢出指示器 */}
      <OverflowIndicator
        direction="right"
        count={regularOverflow.overflowRight}
        title={
          regularOverflow.overflowRight > 0
            ? `点击向右滚动一个标签 · Shift+点击直接跳到最右侧（右侧还有 ${regularOverflow.overflowRight} 个标签页）`
            : '所有标签页已展示'
        }
        onClick={scrollToEnd(regularScrollRef)}
      />

      {/* 隐藏 webkit 滚动条 */}
      <style>{`
        .overflow-x-auto::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
};
