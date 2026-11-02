import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { open } from "@tauri-apps/plugin-shell";
import { Link, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import { useCodeBlockExpansion } from "./CodeBlockContext";

interface MarkdownRendererProps {
  content: string;
  /** 代码块 id 前缀（通常是事件 uuid + 块索引），用于区分不同事件中的相同代码 */
  codeBlockIdPrefix?: string;
}

/** 折叠后最多显示的行数 */
const COLLAPSE_LINE_THRESHOLD = 3;

/** hast 节点的最小结构，用于从 AST 中提取代码原文 */
interface HastNode {
  type?: string;
  value?: string;
  children?: HastNode[];
  position?: { start?: { line?: number } };
}

/** 检测字符串是否为合法 URL */
function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** 递归提取 hast 节点的纯文本（代码块的高亮标记会被展平） */
function hastToText(node?: HastNode): string {
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  if (!node.children) return "";
  return node.children.map(hastToText).join("");
}

/** 统计代码行数（忽略末尾换行） */
function countCodeLines(text: string): number {
  const normalized = text.replace(/\n$/, "");
  return normalized.length === 0 ? 0 : normalized.split("\n").length;
}

/** AST 缺少位置信息时的兜底 id（基于代码内容） */
function fallbackCodeBlockId(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return `h${Math.abs(hash).toString(36)}`;
}

interface CodeBlockPreProps extends React.HTMLAttributes<HTMLPreElement> {
  node?: HastNode;
  idPrefix: string;
}

/** 围栏代码块：折叠 / 展开 + 悬浮复制按钮 */
const CodeBlockPre: React.FC<CodeBlockPreProps> = ({
  node,
  idPrefix,
  children,
  ...rest
}) => {
  const codeText = useMemo(() => hastToText(node), [node]);
  const lineCount = useMemo(() => countCodeLines(codeText), [codeText]);
  const blockId = useMemo(() => {
    const startLine = node?.position?.start?.line;
    return `${idPrefix}:${startLine ?? fallbackCodeBlockId(codeText)}`;
  }, [idPrefix, node, codeText]);

  const { expanded, toggle } = useCodeBlockExpansion(blockId);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const collapsible = lineCount > COLLAPSE_LINE_THRESHOLD;
  const collapsed = collapsible && !expanded;

  const handleCopy = useCallback(() => {
    const text = codeText.replace(/\n$/, "");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    });
  }, [codeText]);

  return (
    <div className="code-block" data-code-block-id={blockId}>
      <pre
        {...rest}
        className={collapsed ? "code-block-collapsed" : undefined}
        data-collapsed={collapsed ? "true" : undefined}
      >
        {children}
      </pre>

      {/* 折叠后底部常显的展开入口 */}
      {collapsed && (
        <div className="code-block-footer">
          <button
            type="button"
            onClick={toggle}
            data-no-highlight=""
            title={`展开代码块（共 ${lineCount} 行）`}
            className="flex items-center gap-1 rounded-md border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] text-white/80 transition-colors hover:bg-white/20 hover:text-white"
          >
            <ChevronDown className="h-3 w-3" />
            展开（共 {lineCount} 行）
          </button>
        </div>
      )}

      {/* 悬浮操作组：复制 + 折叠/展开 */}
      <div className="code-block-actions">
        <button
          type="button"
          onClick={handleCopy}
          data-no-highlight=""
          title={copied ? "已复制" : "复制代码"}
          aria-label="复制代码"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
        {collapsible && (
          <button
            type="button"
            onClick={toggle}
            data-no-highlight=""
            title={expanded ? "折叠代码块" : "展开代码块"}
            aria-label={expanded ? "折叠代码块" : "展开代码块"}
          >
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = React.memo(
  ({ content, codeBlockIdPrefix }) => {
    const [linkMenu, setLinkMenu] = useState<{
      x: number;
      y: number;
      url: string;
    } | null>(null);
    const [toast, setToast] = useState(false);
    const linkMenuRef = useRef<HTMLDivElement>(null);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 清理定时器
    useEffect(() => {
      return () => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      };
    }, []);

    // 点击菜单外部 / Esc 关闭菜单
    useEffect(() => {
      if (!linkMenu) return;
      const close = () => setLinkMenu(null);
      const handler = (e: MouseEvent) => {
        if (
          linkMenuRef.current &&
          !linkMenuRef.current.contains(e.target as Node)
        ) {
          close();
        }
      };
      const keyHandler = (e: KeyboardEvent) => {
        if (e.key === "Escape") close();
      };
      document.addEventListener("mousedown", handler);
      document.addEventListener("keydown", keyHandler);
      return () => {
        document.removeEventListener("mousedown", handler);
        document.removeEventListener("keydown", keyHandler);
      };
    }, [linkMenu]);

    // Toast 自动消失
    useEffect(() => {
      if (!toast) return;
      toastTimerRef.current = setTimeout(() => setToast(false), 1500);
    }, [toast]);

    const handleLinkClick = useCallback((e: React.MouseEvent, href: string) => {
      e.preventDefault();
      if (isValidUrl(href)) {
        open(href);
      }
    }, []);

    const handleLinkContextMenu = useCallback(
      (e: React.MouseEvent, href: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (isValidUrl(href)) {
          setLinkMenu({ x: e.clientX, y: e.clientY, url: href });
        }
      },
      [],
    );

    const handleCopyLink = useCallback(() => {
      if (!linkMenu) return;
      navigator.clipboard.writeText(linkMenu.url).then(() => {
        setLinkMenu(null);
        setToast(true);
      });
    }, [linkMenu]);

    const components = useMemo(
      () => ({
        a: ({
          href,
          children,
          ...props
        }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
          const url = href || "";
          return (
            <a
              href={url}
              onClick={(e) => handleLinkClick(e, url)}
              onContextMenu={(e) => handleLinkContextMenu(e, url)}
              {...props}
            >
              {children}
            </a>
          );
        },
        pre: (props: Omit<CodeBlockPreProps, "idPrefix">) => (
          <CodeBlockPre {...props} idPrefix={codeBlockIdPrefix ?? "md"} />
        ),
      }),
      [codeBlockIdPrefix, handleLinkClick, handleLinkContextMenu],
    );

    return (
      <div className="markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {content}
        </ReactMarkdown>

        {/* 链接右键菜单 */}
        {linkMenu && (
          <div
            ref={linkMenuRef}
            className="fixed z-[100] bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px]"
            style={{ left: linkMenu.x, top: linkMenu.y }}
          >
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <Link className="h-4 w-4 text-gray-400" />
              复制链接
            </button>
          </div>
        )}

        {/* 复制成功 Toast */}
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] bg-white/90 backdrop-blur border border-gray-200 text-gray-800 text-sm px-4 py-2 rounded-lg shadow-md flex items-center gap-2">
            <Copy className="h-3.5 w-3.5 text-green-500" />
            复制成功
          </div>
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.content === next.content &&
    prev.codeBlockIdPrefix === next.codeBlockIdPrefix,
);
