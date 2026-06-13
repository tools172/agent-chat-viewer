import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { open } from '@tauri-apps/plugin-shell';
import { Link, Copy } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  /** 允许 <mark> 等 HTML 标签（用于搜索高亮） */
  allowHtml?: boolean;
}

/** 检测字符串是否为合法 URL */
function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = React.memo(({
  content,
  allowHtml,
}) => {
  const [linkMenu, setLinkMenu] = useState<{ x: number; y: number; url: string } | null>(null);
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
      if (linkMenuRef.current && !linkMenuRef.current.contains(e.target as Node)) {
        close();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
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

  const handleLinkContextMenu = useCallback((e: React.MouseEvent, href: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (isValidUrl(href)) {
      setLinkMenu({ x: e.clientX, y: e.clientY, url: href });
    }
  }, []);

  const handleCopyLink = useCallback(() => {
    if (!linkMenu) return;
    navigator.clipboard.writeText(linkMenu.url).then(() => {
      setLinkMenu(null);
      setToast(true);
    });
  }, [linkMenu]);

  const components = {
    a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
      const url = href || '';
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
  };

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={allowHtml ? [rehypeRaw] : []}
        components={components}
      >
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
}, (prev, next) => prev.content === next.content && prev.allowHtml === next.allowHtml);
