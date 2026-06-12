import React, { useRef, useCallback, useState, useEffect } from 'react';
import type { TabState } from '../../types';
import { TabItem } from './TabItem';

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
  const dragIndexRef = useRef<number | null>(null);
  const wheelTimeRef = useRef(0);
  const [overflowLeft, setOverflowLeft] = useState(0);
  const [overflowRight, setOverflowRight] = useState(0);

  // 监听滚动，计算左右两侧视口外各有几个标签
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || tabs.length === 0) return;

    const calc = () => {
      const leftEdge = el.scrollLeft;
      const rightEdge = leftEdge + el.clientWidth;
      const items = el.querySelectorAll<HTMLElement>('[data-tab-item]');
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
    el.addEventListener('scroll', calc, { passive: true });
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(calc)
        : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener('scroll', calc);
      observer?.disconnect();
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

  const scrollToStart = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ left: 0, behavior: 'smooth' });
  };

  // 滚轮滚动后 250ms 内抑制标签激活，防止滚轮误触切换选中
  const handleActivate = useCallback(
    (tabId: string) => {
      if (Date.now() - wheelTimeRef.current > 250) {
        onActivateTab(tabId);
      }
    },
    [onActivateTab]
  );

  const scrollToEnd = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
  };

  if (tabs.length === 0) return null;

  return (
    <div
      className="flex items-stretch bg-gray-100 border-b border-gray-200 flex-shrink-0 relative"
      style={{ height: 36 }}
    >
      {/* 左侧指示器始终存在 */}
      <div
        className={`flex-shrink-0 flex items-center gap-1 mr-1.5 pr-1.5 pl-1.5 text-xs border-r border-gray-200
          bg-gradient-to-r from-gray-100 via-gray-100 to-transparent
          ${overflowLeft > 0 ? 'text-primary-600 hover:text-primary-700 cursor-pointer font-bold' : 'text-gray-300'}`}
        title={overflowLeft > 0 ? `左侧还有 ${overflowLeft} 个标签页` : '已到最左侧'}
        onClick={overflowLeft > 0 ? scrollToStart : undefined}
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
          <div key={tab.id} data-tab-item className="flex-shrink-0">
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
          bg-gradient-to-l from-gray-100 via-gray-100 to-transparent
          ${overflowRight > 0 ? 'text-primary-600 hover:text-primary-700 cursor-pointer font-bold' : 'text-gray-300'}`}
        title={overflowRight > 0 ? `右侧还有 ${overflowRight} 个标签页` : '所有标签页已展示'}
        onClick={overflowRight > 0 ? scrollToEnd : undefined}
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
