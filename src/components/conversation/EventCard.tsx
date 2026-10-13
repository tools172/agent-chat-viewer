import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import {
  User,
  Bot,
  Clock,
  Copy,
  Check,
  FileJson,
  FileText,
} from "lucide-react";
import type { ChatEvent, ContentBlock } from "../../types";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallBlock } from "./ToolCallBlock";
import { ToolResultBlock } from "./ToolResultBlock";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { highlightTextInDOM } from "../../utils/highlightDom";
import { isUserTextTurn } from "../../utils/filterEvents";

interface EventCardProps {
  event: ChatEvent;
  expandedThinking: Set<string>;
  expandedToolCalls: Set<string>;
  expandedToolResults: Set<string>;
  onToggleThinking: (key: string) => void;
  onToggleToolCall: (key: string) => void;
  onToggleToolResult: (key: string) => void;
  blockKey: (eventUuid: string, blockIndex: number) => string;
  searchHighlight?: string;
  findHighlight?: string;
  /** 配色 */
  searchColors: { search: string; find: string };
  /** 当前激活的查找匹配所在块（仅本事件含激活匹配时才传入） */
  activeFindBlockIdx?: number;
  /** 当前激活的查找匹配在该块内的序号（0 起始） */
  activeFindOccurrenceIdx?: number;
}

/**
 * Format an ISO timestamp to full local date + time string
 */
function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

/**
 * 包裹 MarkdownRenderer，在 React 渲染完成后通过 useLayoutEffect 遍历 DOM
 * 文本节点创建 <mark> 高亮。此方案不依赖预注入 HTML，因此 Markdown 代码块
 *（```code``` 和 `inline code`）内的关键词也能正确高亮。
 */
const HighlightedMarkdown: React.FC<{
  content: string;
  searchHighlight?: string;
  findHighlight?: string;
  searchColors: { search: string; find: string };
  activeFindOccurrence?: number;
  blockIdx?: number;
}> = React.memo(
  ({
    content,
    searchHighlight,
    findHighlight,
    searchColors,
    activeFindOccurrence,
    blockIdx,
  }) => {
    const ref = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
      if (!ref.current) return;

      // 先清理上一次的 <mark>，展开为纯文本。这样无论是切换导航位置
      // 还是关闭查找栏，都能确保从干净的 DOM 状态重新应用高亮。
      const oldMarks = ref.current.querySelectorAll("mark");
      if (oldMarks.length > 0) {
        oldMarks.forEach((m) => {
          const parent = m.parentNode;
          if (parent) {
            parent.replaceChild(
              document.createTextNode(m.textContent || ""),
              m,
            );
          }
        });
        ref.current.normalize(); // 合并相邻文本节点
      }

      if (!searchHighlight && !findHighlight) return;

      highlightTextInDOM(
        ref.current,
        searchHighlight,
        findHighlight,
        searchColors,
        activeFindOccurrence,
        blockIdx,
      );
    });

    return (
      <div ref={ref} className="mb-1">
        <MarkdownRenderer content={content} />
      </div>
    );
  },
);

export const EventCard: React.FC<EventCardProps> = React.memo(
  ({
    event,
    expandedThinking,
    expandedToolCalls,
    expandedToolResults,
    onToggleThinking,
    onToggleToolCall,
    onToggleToolResult,
    blockKey,
    searchHighlight,
    findHighlight,
    searchColors,
    activeFindBlockIdx,
    activeFindOccurrenceIdx,
  }) => {
    const [copied, setCopied] = useState(false);
    const [contextMenu, setContextMenu] = useState<{
      x: number;
      y: number;
    } | null>(null);
    const [ctxAction, setCtxAction] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const isUser = event.eventType === "user";
    const isDeveloper = event.eventType === "developer";
    const isSystem = event.eventType === "system";
    const isManualUserTurn = isUserTextTurn(event);

    useEffect(() => {
      if (!contextMenu) return;
      const clickHandler = (e: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
          setContextMenu(null);
        }
      };
      const keyHandler = (e: KeyboardEvent) => {
        if (e.key === "Escape") setContextMenu(null);
      };
      document.addEventListener("mousedown", clickHandler);
      document.addEventListener("keydown", keyHandler);
      return () => {
        document.removeEventListener("mousedown", clickHandler);
        document.removeEventListener("keydown", keyHandler);
      };
    }, [contextMenu]);

    const getEventText = () => {
      return event.content
        .map((b) => {
          if (b.blockType === "text") return b.text;
          if (b.blockType === "thinking") return b.thinking;
          if (b.blockType === "tool_use")
            return `[Tool: ${b.toolName}] ${JSON.stringify(b.toolInput)}`;
          if (b.blockType === "tool_result")
            return `[Result] ${b.content || "(empty)"}`;
          return "";
        })
        .join("\n");
    };

    const handleCopy = () => {
      const text = getEventText();
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    };

    const handleCopyEventText = () => {
      setContextMenu(null);
      navigator.clipboard.writeText(getEventText()).then(() => {
        setCtxAction("text");
        setTimeout(() => setCtxAction(null), 1500);
      });
    };

    const handleCopyEventJson = () => {
      setContextMenu(null);
      navigator.clipboard.writeText(JSON.stringify(event, null, 2)).then(() => {
        setCtxAction("json");
        setTimeout(() => setCtxAction(null), 1500);
      });
    };

    const renderBlock = (block: ContentBlock, index: number) => {
      const key = blockKey(event.uuid, index);

      switch (block.blockType) {
        case "text":
          return (
            <HighlightedMarkdown
              key={key}
              content={block.text}
              searchHighlight={searchHighlight}
              findHighlight={findHighlight}
              searchColors={searchColors}
              blockIdx={index}
              activeFindOccurrence={
                index === activeFindBlockIdx
                  ? activeFindOccurrenceIdx
                  : undefined
              }
            />
          );

        case "thinking":
          return (
            <ThinkingBlock
              key={key}
              thinking={block.thinking}
              signature={block.signature}
              isExpanded={expandedThinking.has(key)}
              onToggle={() => onToggleThinking(key)}
              searchHighlight={searchHighlight}
              findHighlight={findHighlight}
              searchColors={searchColors}
            />
          );

        case "tool_use":
          return (
            <ToolCallBlock
              key={key}
              toolName={block.toolName}
              toolInput={block.toolInput}
              isExpanded={expandedToolCalls.has(key)}
              onToggle={() => onToggleToolCall(key)}
              searchHighlight={searchHighlight}
              findHighlight={findHighlight}
              searchColors={searchColors}
            />
          );

        case "tool_result":
          return (
            <ToolResultBlock
              key={key}
              content={block.content}
              isError={block.isError}
              isExpanded={expandedToolResults.has(key)}
              onToggle={() => onToggleToolResult(key)}
              searchHighlight={searchHighlight}
              findHighlight={findHighlight}
              searchColors={searchColors}
            />
          );

        default:
          return null;
      }
    };

    return (
      <div
        data-event-uuid={event.uuid}
        className={`group flex gap-3 px-4 py-3 ${
          isManualUserTurn
            ? "msg-user-input"
            : isUser
              ? "bg-blue-50/30"
              : "bg-white"
        } hover:bg-gray-50/50 transition-colors`}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        {/* Avatar */}
        <div className="flex-shrink-0 mt-0.5">
          {event.eventType === "assistant" ? (
            <div className="h-7 w-7 rounded-full bg-gray-700 flex items-center justify-center">
              <Bot className="h-4 w-4 text-white" />
            </div>
          ) : (
            <div
              className={`h-7 w-7 rounded-full flex items-center justify-center ${
                isUser
                  ? "bg-blue-500"
                  : isDeveloper
                    ? "bg-green-200"
                    : "bg-teal-200"
              }`}
            >
              <User className="h-4 w-4 text-white" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-gray-500">
              {isUser
                ? "用户"
                : isDeveloper
                  ? "开发者"
                  : isSystem
                    ? "系统"
                    : "助手"}
            </span>
            <Clock className="h-3 w-3 text-gray-400" />
            <span className="text-xs text-gray-400">
              {formatTime(event.timestamp)}
            </span>
          </div>

          {/* Content blocks */}
          <div>{event.content.map((block, i) => renderBlock(block, i))}</div>
        </div>

        {/* Actions (visible on hover) */}
        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleCopy}
            className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-600"
            title="复制内容"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        {/* 右键菜单 */}
        {contextMenu && (
          <div
            ref={menuRef}
            className="fixed z-[100] bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={handleCopyEventText}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              {ctxAction === "text" ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <FileText className="h-4 w-4 text-gray-400" />
              )}
              复制事件文本
            </button>
            <button
              onClick={handleCopyEventJson}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              {ctxAction === "json" ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <FileJson className="h-4 w-4 text-gray-400" />
              )}
              复制事件 JSON
            </button>
          </div>
        )}
      </div>
    );
  },
  (prev, next) => {
    // 快速路径：event uuid 相同则所有内容相同
    return (
      prev.event.uuid === next.event.uuid &&
      prev.searchHighlight === next.searchHighlight &&
      prev.findHighlight === next.findHighlight &&
      prev.expandedThinking === next.expandedThinking &&
      prev.expandedToolCalls === next.expandedToolCalls &&
      prev.expandedToolResults === next.expandedToolResults &&
      prev.searchColors === next.searchColors &&
      prev.activeFindBlockIdx === next.activeFindBlockIdx &&
      prev.activeFindOccurrenceIdx === next.activeFindOccurrenceIdx
      // toggle/blockKey 都是稳定引用，无需比较
    );
  },
);
