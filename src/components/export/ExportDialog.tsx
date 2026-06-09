import React, { useState } from 'react';
import { Download, FileText, FileJson, X, Check } from 'lucide-react';
import { save } from '@tauri-apps/plugin-dialog';
import type { ExportFormat, ExportOptions, FilterConfig } from '../../types';
import * as tauri from '../../utils/tauri';

interface ExportDialogProps {
  sessionPath: string;
  sessionTitle: string;
  onClose: () => void;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
  sessionPath,
  sessionTitle,
  onClose,
}) => {
  const [format, setFormat] = useState<ExportFormat>('markdown');
  const [options, setOptions] = useState<ExportOptions>({
    format: 'markdown',
    includeThinking: true,
    includeToolCalls: true,
    includeToolResults: true,
    excludeEmptyToolResults: true,
  });
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);

    try {
      const ext = format === 'markdown' ? 'md' : 'json';
      const safeTitle = sessionTitle
        .replace(/[^a-zA-Z0-9一-龥]/g, '_')
        .slice(0, 50);

      // 使用原生保存对话框
      const savePath = await save({
        defaultPath: `session_${safeTitle}.${ext}`,
        filters: [
          {
            name: format === 'markdown' ? 'Markdown' : 'JSON',
            extensions: [ext],
          },
        ],
      });

      if (!savePath) {
        // 用户取消了保存对话框
        setIsExporting(false);
        return;
      }

      const exportFilter: FilterConfig = {
        showThinking: options.includeThinking,
        showToolCalls: options.includeToolCalls,
        showToolResults: options.includeToolResults,
        hideEmptyToolResults: options.excludeEmptyToolResults,
        showSystemMessages: false,
        showFileSnapshots: false,
      };

      let content: string;
      if (format === 'markdown') {
        content = await tauri.exportMarkdown(
          sessionPath,
          exportFilter,
          'claude_code'
        );
      } else {
        content = await tauri.exportJson(sessionPath, 'claude_code');
      }

      // 使用 Rust 命令写入文件
      await tauri.writeTextFile(savePath, content);

      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-[480px] max-h-[90vh] overflow-y-auto animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Download className="h-5 w-5" />
            导出会话
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Format selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              导出格式
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => setFormat('markdown')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm ${
                  format === 'markdown'
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-300 text-gray-600 hover:border-gray-400'
                }`}
              >
                <FileText className="h-4 w-4" />
                Markdown
              </button>
              <button
                onClick={() => setFormat('json')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm ${
                  format === 'json'
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-300 text-gray-600 hover:border-gray-400'
                }`}
              >
                <FileJson className="h-4 w-4" />
                JSON
              </button>
            </div>
          </div>

          {/* Content options */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              内容选项
            </label>
            <div className="space-y-2">
              {[
                { key: 'includeThinking', label: '包含思考过程' },
                { key: 'includeToolCalls', label: '包含工具调用' },
                { key: 'includeToolResults', label: '包含工具结果' },
                {
                  key: 'excludeEmptyToolResults',
                  label: '排除空工具结果',
                },
              ].map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={
                      options[key as keyof ExportOptions] as boolean
                    }
                    onChange={(e) =>
                      setOptions((prev) => ({
                        ...prev,
                        [key]: e.target.checked,
                      }))
                    }
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              <Check className="h-4 w-4" />
              导出成功！
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {isExporting ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {isExporting ? '导出中...' : '导出'}
          </button>
        </div>
      </div>
    </div>
  );
};
