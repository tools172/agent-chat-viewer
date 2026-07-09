import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { PanelRightClose, PanelRightOpen, GripVertical } from 'lucide-react';
import type { ChatEvent } from '../../types';
import { extractUserText } from '../../utils/filterEvents';

/** 小尖括号 + 顶部横线：回到最顶部 */
function ScrollTopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    >
      <line x1="4" y1="3" x2="12" y2="3" />
      <polyline points="11,7 8,4 5,7" />
    </svg>
  );
}

/** 小尖括号 + 底部横线：回到底部 */
function ScrollBottomIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    >
      <polyline points="5,9 8,12 11,9" />
      <line x1="4" y1="13" x2="12" y2="13" />
    </svg>
  );
}

const TURN_HINT_MAX_LEN = 2000;

interface Turn {
  uuid: string;
  label: string;
  /** 完整内容（用于 hint，超过 2000 字截断加 ...） */
  hint: string;
  index: number;
}

interface TurnNavigatorProps {
  events: ChatEvent[];
  containerRef: { current: HTMLDivElement | null };
  /** 导航面板默认宽度（px），来自设置 */
  defaultWidth?: number;
  /** 拖拽结束后回调，用于持久化宽度 */
  onWidthChange?: (width: number) => void;
}

function extractTurns(events: ChatEvent[]): Turn[] {
  const turns: Turn[] = [];
  let turnIndex = 0;
  for (const event of events) {
    if (event.eventType !== 'user') continue;
    const hasText = event.content.some((b) => b.blockType === 'text');
    if (!hasText) continue;
    turnIndex++;
    // 跳过系统注解块，取真实用户消息
    const fullText = extractUserText(event);
    // 显示标签：40 字，替换换行
    const flatText = fullText.replace(/\n/g, ' ');
    const label = flatText.slice(0, 40) || '(空)';
    // 仅当内容被截断时才设置 hint（超出 2000 字再截断一次）
    const truncated = flatText.length > 40;
    const hint = truncated
      ? (fullText.length > TURN_HINT_MAX_LEN
          ? fullText.slice(0, TURN_HINT_MAX_LEN) + '...'
          : fullText)
      : '';
    turns.push({
      uuid: event.uuid,
      label: label.length >= 40 ? label + '…' : label,
      hint,
      index: turnIndex,
    });
  }
  return turns;
}

const MIN_WIDTH = 160;
const DEFAULT_WIDTH = 256;
const MAX_WIDTH = 400;

export const TurnNavigator: React.FC<TurnNavigatorProps> = ({ events, containerRef, defaultWidth = DEFAULT_WIDTH, onWidthChange }) => {
  const turns = useMemo(() => extractTurns(events), [events]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const lockRef = useRef(false);

  // 折叠 / 宽度
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(defaultWidth);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWRef = useRef(0);

  // 导航列表自身的滚动容器 ref
  const listRef = useRef<HTMLDivElement>(null);
  // 列表中溢出可视区域的轮次数
  const [overflowAbove, setOverflowAbove] = useState(0);
  const [overflowBelow, setOverflowBelow] = useState(0);

  const calcOverflow = useCallback(() => {
    const list = listRef.current;
    if (!list || turns.length === 0) {
      setOverflowAbove(0);
      setOverflowBelow(0);
      return;
    }
    const listTop = list.scrollTop;
    const listBottom = listTop + list.clientHeight;
    let above = 0;
    let below = 0;
    for (const turn of turns) {
      const el = list.querySelector(`[data-turn-index="${turn.index}"]`) as HTMLElement | null;
      if (!el) continue;
      const top = el.offsetTop;
      const bottom = top + el.offsetHeight;
      if (bottom <= listTop) above++;
      else if (top >= listBottom) below++;
    }
    setOverflowAbove(above);
    setOverflowBelow(below);
  }, [turns]);

  // 轮次变化或列表尺寸变化时重新计算溢出量
  useEffect(() => {
    calcOverflow();
  }, [turns, width, collapsed, calcOverflow]);

  const handleListScroll = useCallback(() => {
    calcOverflow();
  }, [calcOverflow]);

  // ---- IntersectionObserver ----
  useEffect(() => {
    if (!containerRef.current) return;
    const turnIndexByUuid = new Map<string, number>();
    turns.forEach((t) => turnIndexByUuid.set(t.uuid, t.index));

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (lockRef.current) return;
        let best: { uuid: string; ratio: number } | null = null;
        for (const entry of entries) {
          const uuid = (entry.target as HTMLElement).dataset.eventUuid;
          if (uuid && entry.intersectionRatio > (best?.ratio ?? 0)) {
            best = { uuid, ratio: entry.intersectionRatio };
          }
        }
        if (best) {
          const idx = turnIndexByUuid.get(best.uuid);
          if (idx !== undefined) {
            setActiveIndex(idx);
            scrollListTo(idx);
          }
        }
      },
      { root: containerRef.current, threshold: [0, 0.25, 0.5, 0.75] }
    );

    const el = containerRef.current;
    el.querySelectorAll('[data-event-uuid]').forEach((n) => observerRef.current?.observe(n));
    return () => observerRef.current?.disconnect();
  }, [turns, containerRef, events]);

  // ---- 拖拽调整宽度 ----
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startWRef.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const delta = startXRef.current - e.clientX; // 向左拖 = 变大
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWRef.current + delta));
      setWidth(next);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      onWidthChange?.(width);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [width, onWidthChange]);

  // ---- 滚动（导航列表自身 + 聊天内容） ----
  const scrollChatTo = useCallback((uuid: string) => {
    // 聊天内容即时定位
    containerRef.current
      ?.querySelector(`[data-event-uuid="${uuid}"]`)
      ?.scrollIntoView({ block: 'start' });
  }, [containerRef]);

  const scrollListTo = useCallback((index: number) => {
    // 导航列表自身滚动到对应项（最小滚动，刚好露出完整项）
    const btn = listRef.current?.querySelector(`[data-turn-index="${index}"]`);
    (btn as HTMLElement)?.scrollIntoView({ block: 'nearest' });
  }, []);

  const scrollToTurn = useCallback((uuid: string) => {
    const turn = turns.find((t) => t.uuid === uuid);
    if (!turn) return;
    setActiveIndex(turn.index);
    lockRef.current = true;
    scrollChatTo(uuid);
    scrollListTo(turn.index);
    setTimeout(() => { lockRef.current = false; }, 500);
  }, [turns, scrollChatTo, scrollListTo]);

  const scrollToTop = useCallback(() => {
    if (turns.length === 0) return;
    const first = turns[0];
    setActiveIndex(first.index);
    lockRef.current = true;
    scrollChatTo(first.uuid);
    listRef.current?.scrollTo({ top: 0 });
    setTimeout(() => { lockRef.current = false; }, 500);
  }, [turns, scrollChatTo]);

  const scrollToBottom = useCallback(() => {
    if (turns.length === 0) return;
    const last = turns[turns.length - 1];
    setActiveIndex(last.index);
    lockRef.current = true;
    const sentinel = containerRef.current?.querySelector('[data-bottom-sentinel]');
    if (sentinel) {
      sentinel.scrollIntoView({ block: 'end' });
    } else {
      scrollChatTo(last.uuid);
    }
    // 导航列表滚到底部
    if (listRef.current) {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight });
    }
    setTimeout(() => { lockRef.current = false; }, 500);
  }, [turns, scrollChatTo, containerRef]);

  if (turns.length === 0) return null;

  // ---- 折叠状态：只显示展开按钮 ----
  if (collapsed) {
    return (
      <div
        className="flex-shrink-0 border-l border-gray-200 bg-gray-50/30 flex flex-col items-center py-2 gap-2"
        onContextMenu={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setCollapsed(false)}
          className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-600"
          title="展开轮次导航"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex-shrink-0 border-l border-gray-200 bg-gray-50/30 flex flex-col h-full relative"
      style={{ width }}
      onContextMenu={(e) => e.stopPropagation()}
    >
      {/* 拖拽手柄（左边缘） */}
      <div
        onMouseDown={onDragStart}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary-400/50 transition-colors z-10 flex items-center justify-center"
      >
        <GripVertical className="h-4 w-4 text-gray-300 pointer-events-none" />
      </div>

      {/* 顶部按钮行 */}
      <div className="flex items-center border-b border-gray-200">
        <span className="pl-2 text-xs font-semibold text-gray-700 whitespace-nowrap select-none">
          共 {turns.length} 轮
        </span>
        <button
          onClick={scrollToTop}
          className="flex-1 flex items-center justify-center gap-0.5 py-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          title="回到顶部"
        >
          {overflowAbove > 0 && (
            <span className="text-xs font-semibold tabular-nums text-gray-900">{overflowAbove}</span>
          )}
          <ScrollTopIcon />
        </button>
        <button
          onClick={() => setCollapsed(true)}
          className="py-1 px-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          title="折叠导航"
        >
          <PanelRightClose className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 轮次列表 */}
      <div ref={listRef} onScroll={handleListScroll} className="flex-1 overflow-y-auto py-0.5 pl-[5px]">
        {turns.map((turn) => (
          <button
            key={turn.uuid}
            data-turn-index={turn.index}
            onClick={() => scrollToTurn(turn.uuid)}
            className={`w-full text-left pl-[7px] pr-2 pt-0 pb-0.5 text-xs transition-colors border-l-2 ${
              activeIndex === turn.index
                ? 'border-primary-500 bg-primary-50 text-primary-700'
                : 'border-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            }`}
            title={turn.hint || undefined}
          >
            <span className="font-medium text-[10px] leading-none text-gray-400">
              {turn.index}
            </span><span className="line-clamp-2 leading-tight -ml-px">{turn.label}</span>
          </button>
        ))}
      </div>

      {/* 底部按钮 */}
      <button
        onClick={scrollToBottom}
        className="flex items-center justify-center gap-0.5 py-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors border-t border-gray-200"
        title="回到底部"
      >
        <ScrollBottomIcon />
        {overflowBelow > 0 && (
          <span className="text-xs font-semibold tabular-nums text-gray-900">{overflowBelow}</span>
        )}
      </button>
    </div>
  );
};
