import React from "react";
import { Download, Check, Minus, ChevronUp } from "lucide-react";
import { useUpdateStore } from "../../stores/updateStore";

function formatMb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

/**
 * 右下角的下载/升级组件。
 *
 * - 下载中：展示进度条，可折叠成右下角小胶囊
 * - 下载完成：弹出升级提示（立即升级 / 最小化）
 * - 折叠态：点击小胶囊重新展开
 */
export const UpdateWidget: React.FC = () => {
  const {
    phase,
    progress,
    latest,
    widgetMinimized,
    installAndExit,
    minimizeWidget,
    expandWidget,
  } = useUpdateStore();

  if (phase !== "downloading" && phase !== "ready") return null;

  const total = progress.total;
  const percent =
    total > 0
      ? Math.min(100, Math.round((progress.received / total) * 100))
      : 0;

  if (widgetMinimized) {
    return (
      <button
        onClick={expandWidget}
        className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 px-3 py-2 bg-white shadow-lg rounded-full border border-gray-200 text-sm hover:shadow-xl transition-shadow"
        aria-label="展开更新进度"
      >
        {phase === "ready" ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <Download className="h-4 w-4 text-primary-600" />
        )}
        <span className="text-gray-700">
          {phase === "ready"
            ? `v${latest?.version} 已就绪`
            : `下载中 ${percent}%`}
        </span>
        <ChevronUp className="h-4 w-4 text-gray-400" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[60] w-80 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          {phase === "ready" ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Download className="h-4 w-4 text-primary-600" />
          )}
          {phase === "ready" ? "更新已就绪" : "正在下载更新"}
        </span>
        <button
          onClick={minimizeWidget}
          className="p-1 hover:bg-gray-200 rounded"
          aria-label="最小化"
        >
          <Minus className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        {phase === "downloading" ? (
          <>
            <p className="text-xs text-gray-500">
              {total > 0
                ? `已下载 ${formatMb(progress.received)} MB / ${formatMb(
                    total,
                  )} MB`
                : "正在下载…"}
            </p>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-600 transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            {total > 0 && (
              <p className="text-xs text-gray-400 tabular-nums">{percent}%</p>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-gray-700">
              新版本 <span className="font-semibold">v{latest?.version}</span>{" "}
              已下载完成。
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => void installAndExit()}
                className="flex-1 px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                立即升级
              </button>
              <button
                onClick={minimizeWidget}
                className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
              >
                最小化
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
