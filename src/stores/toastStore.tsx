import { create } from "zustand";
import React, { useEffect, useRef } from "react";
import { Info, AlertTriangle, Copy, Check } from "lucide-react";

export type ToastVariant = "info" | "error";

export interface ToastOptions {
  /** 停留时长（毫秒）。不传时：error 默认 10000，info 默认 2500 */
  duration?: number;
  /** 展示风格：error 为错误提示（暖墨卡片 + 朱砂辉光，悬停暂停、点击外部立即隐藏） */
  variant?: ToastVariant;
  /** 点击 Toast 复制 message（用于展示错误路径等，方便用户复制） */
  copyable?: boolean;
}

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
  copyable?: boolean;
  /** 停留总时长（毫秒），用于倒计时线程 */
  duration: number;
  /** 预计消失时刻；鼠标悬停时暂停计时，移开后按剩余时间继续 */
  expiresAt: number;
}

interface ToastState {
  toasts: Toast[];
  showToast: (message: string, options?: ToastOptions) => void;
  dismissToast: (id: number) => void;
  dismissAll: () => void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  showToast: (message, options = {}) => {
    const variant = options.variant ?? "info";
    const duration = options.duration ?? (variant === "error" ? 10000 : 2500);
    const id = ++counter;
    set((s) => ({
      toasts: [
        ...s.toasts,
        {
          id,
          message,
          variant,
          copyable: options.copyable,
          duration,
          expiresAt: Date.now() + duration,
        },
      ],
    }));
  },

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  dismissAll: () => set({ toasts: [] }),
}));

/**
 * 全局 Toast 容器组件 — 放在应用根节点即可。
 * 设计：info 为浅色玻璃卡片、error 为暖墨深色卡片，均带编辑级小标签与底部倒计时线程。
 * 行为：
 *  - error 变体以深色 + 朱砂辉光提示错误，停留更久（默认 10000ms）；
 *  - 倒计时线程随时间消退，鼠标悬停时凝固、移开后继续；
 *  - 点击 Toast 外部立即隐藏所有提示；
 *  - 设置了 copyable 的提示点击可复制完整信息。
 */
export const ToastContainer: React.FC = () => {
  const toasts = useToastStore((s) => s.toasts);
  const dismissAll = useToastStore((s) => s.dismissAll);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击 Toast 外部 → 立即隐藏全部提示
  useEffect(() => {
    if (toasts.length === 0) return;
    const onMouseDown = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        dismissAll();
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [toasts.length, dismissAll]);

  if (toasts.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 pointer-events-none max-w-[90vw]"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: Toast }> = ({ toast }) => {
  const [visible, setVisible] = React.useState(false);
  const [remainingPct, setRemainingPct] = React.useState(100);
  const [copied, setCopied] = React.useState(false);
  const dismissToast = useToastStore((s) => s.dismissToast);
  const elRef = useRef<HTMLDivElement>(null);
  const isError = toast.variant === "error";
  const copyable = !!toast.copyable;

  // 入场动画（柔和上升 + 轻微收敛）
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // 倒计时：驱动底部时间线程，到时自动消失；悬停暂停、移开继续
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    let interval: ReturnType<typeof setInterval> | null = null;
    let hovered = false;

    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const tick = () => {
      if (hovered) return;
      const remaining = toast.expiresAt - Date.now();
      if (remaining <= 0) {
        stop();
        dismissToast(toast.id);
        return;
      }
      setRemainingPct((remaining / toast.duration) * 100);
    };

    const start = () => {
      if (interval) return;
      interval = setInterval(tick, 100);
      tick();
    };

    const onEnter = () => {
      hovered = true;
      stop();
    };
    const onLeave = () => {
      hovered = false;
      start();
    };

    start();
    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      stop();
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [toast.expiresAt, toast.duration, toast.id, dismissToast]);

  // 只有复制图标可点击复制；点击/选中正文不再触发复制
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(toast.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* 忽略剪贴板不可用 */
    }
  };

  return (
    <div
      ref={elRef}
      data-testid="toast-card"
      className={`pointer-events-auto select-text ${
        isError
          ? "bg-stone-900/90 ring-white/[0.07] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_2px_rgba(0,0,0,0.3),0_24px_56px_-16px_rgba(192,57,43,0.35)]"
          : "bg-white/90 ring-gray-900/[0.05] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_40px_-16px_rgba(15,23,42,0.16)]"
      } backdrop-blur-xl rounded-2xl overflow-hidden ring-1 max-w-full transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        visible
          ? "opacity-100 translate-y-0 scale-100 rotate-0"
          : "opacity-0 translate-y-3 scale-[0.97] rotate-[0.4deg]"
      }`}
    >
      <div className="px-4 pt-3 pb-2.5 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <span
            className={`flex items-center gap-1.5 text-sm font-semibold tracking-[0.22em] ${
              isError ? "text-[#F08A5C]" : "text-primary-600"
            }`}
          >
            {isError ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <Info className="h-4 w-4" />
            )}
            {isError ? "错误" : "提示"}
          </span>
          {copyable && (
            <button
              type="button"
              onClick={handleCopy}
              title="点击复制完整信息"
              className={`flex-shrink-0 inline-flex items-center gap-1 text-xs cursor-pointer select-none rounded-md px-1.5 py-0.5 transition-colors ${
                copied
                  ? isError
                    ? "text-emerald-400"
                    : "text-emerald-600"
                  : isError
                    ? "text-stone-400 hover:text-[#F08A5C] hover:bg-white/[0.06]"
                    : "text-gray-400 hover:text-primary-600 hover:bg-gray-900/[0.04]"
              }`}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "已复制" : "复制"}
            </button>
          )}
        </div>
        <p
          className={`text-[13px] leading-relaxed break-words ${
            isError ? "font-medium text-[#f4efe7]" : "text-gray-700"
          }`}
        >
          {toast.message}
        </p>
      </div>
      <div
        className={`h-[3px] ${isError ? "bg-white/[0.08]" : "bg-gray-900/[0.06]"}`}
      >
        <div
          className={`h-full rounded-r-full transition-[width] duration-100 ease-linear ${
            isError
              ? "bg-gradient-to-r from-[#F08A5C] to-[#C0392B]"
              : "bg-gradient-to-r from-primary-400 to-primary-600"
          }`}
          style={{ width: `${remainingPct}%` }}
        />
      </div>
    </div>
  );
};
