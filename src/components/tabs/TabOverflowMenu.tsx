import React, { useRef, useEffect, useLayoutEffect } from "react";
import { ChevronDown } from "lucide-react";
import type { TabState } from "../../types";
import { getProviderColor } from "../../utils/providers";

interface TabOverflowMenuProps {
  tabs: TabState[];
  activeTabId: string | null;
  onActivate: (tabId: string) => void;
  onClose: () => void;
}

export const TabOverflowMenu: React.FC<TabOverflowMenuProps> = ({
  tabs,
  activeTabId,
  onActivate,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // 调整位置
  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 8;
    if (rect.right > vw) {
      menuRef.current.style.left = `${Math.max(gap, vw - rect.width - gap)}px`;
    }
    if (rect.bottom > vh) {
      menuRef.current.style.top = "auto";
      menuRef.current.style.bottom = "100%";
    }
  }, []);

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full mt-1 z-[110] bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[200px] max-h-[300px] overflow-y-auto"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => {
            onActivate(tab.id);
            onClose();
          }}
          className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm transition-colors ${
            tab.id === activeTabId
              ? "bg-primary-50 text-primary-700"
              : "text-gray-700 hover:bg-gray-100"
          }`}
        >
          <span
            className={`flex-shrink-0 w-2 h-2 rounded-full ${getProviderColor(tab.providerName)}`}
          />
          <span className="truncate flex-1 text-left">{tab.title}</span>
        </button>
      ))}
    </div>
  );
};

interface TabOverflowButtonProps {
  hiddenCount: number;
  tabs: TabState[];
  activeTabId: string | null;
  onActivate: (tabId: string) => void;
}

export const TabOverflowButton: React.FC<TabOverflowButtonProps> = ({
  hiddenCount,
  tabs,
  activeTabId,
  onActivate,
}) => {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="relative flex-shrink-0">
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-200 rounded transition-colors"
        title={`还有 ${hiddenCount} 个标签页`}
      >
        <ChevronDown className="h-3 w-3" />
        <span className="tabular-nums">{hiddenCount}</span>
      </button>
      {open && (
        <TabOverflowMenu
          tabs={tabs}
          activeTabId={activeTabId}
          onActivate={onActivate}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
};
