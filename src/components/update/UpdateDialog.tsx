import React from "react";
import { Download, X, Rocket } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useUpdateStore } from "../../stores/updateStore";
import * as tauri from "../../utils/tauri";

/** 把版本说明里的链接改为在系统浏览器中打开（避免 WebView 内导航/被墙超时） */
const markdownComponents = {
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (href) {
          void tauri.openExternal(href);
        }
      }}
      className="text-primary-600 underline cursor-pointer"
    >
      {children}
    </a>
  ),
};

/**
 * 启动时检测到新版本的升级弹窗。
 *
 * 三个操作：
 * - 「下载并安装」：关闭弹窗，右下角弹出下载进度组件
 * - 「下次再说」：本次关闭，不写持久化，下次启动仍会询问
 * - 「忽略此版本」：写入 skippedUpdateVersion，该版本不再询问
 */
export const UpdateDialog: React.FC = () => {
  const { latest, dialogOpen, startDownload, closeDialog, dismissCurrent } =
    useUpdateStore();

  if (!latest || !dialogOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-[480px] max-h-[90vh] flex flex-col animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary-600" />
            发现新版本
          </h2>
          <button
            onClick={closeDialog}
            className="p-1 hover:bg-gray-100 rounded"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3 overflow-y-auto">
          <p className="text-sm text-gray-600">
            新版本{" "}
            <span className="font-semibold text-gray-800">
              v{latest.version}
            </span>{" "}
            （当前 v{latest.currentVersion}）
          </p>

          {latest.notes && (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {latest.notes}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t bg-gray-50 rounded-b-xl">
          <button
            onClick={dismissCurrent}
            className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-200 rounded-lg transition-colors"
          >
            忽略此版本
          </button>
          <button
            onClick={closeDialog}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
          >
            下次再说
          </button>
          <button
            onClick={() => void startDownload()}
            className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            下载并安装
          </button>
        </div>
      </div>
    </div>
  );
};
