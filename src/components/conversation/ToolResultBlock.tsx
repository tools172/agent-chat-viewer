import React from "react";
import {
  FileOutput,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { highlightDual } from "../../utils/highlight";

interface ToolResultBlockProps {
  content: string | null;
  isError: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  searchHighlight?: string;
  findHighlight?: string;
  searchColors: { search: string; find: string };
}

export const ToolResultBlock: React.FC<ToolResultBlockProps> = ({
  content,
  isError,
  isExpanded,
  onToggle,
  searchHighlight,
  findHighlight,
  searchColors,
}) => {
  const isEmpty = !content || content.trim().length === 0;
  const displayContent = content || "";
  const label = isError ? "错误" : "工具结果";

  return (
    <div
      className={`my-2 border rounded-lg overflow-hidden ${isError ? "border-red-200 bg-red-50/50" : "border-green-200 bg-green-50/50"}`}
    >
      <button
        onClick={onToggle}
        className={`flex items-center gap-2 w-full px-3 py-2 text-xs font-medium transition-colors ${isError ? "text-red-700 hover:bg-red-100/50" : "text-green-700 hover:bg-green-100/50"}`}
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        {isError ? (
          <AlertTriangle className="h-3.5 w-3.5" />
        ) : (
          <FileOutput className="h-3.5 w-3.5" />
        )}
        <span>
          {highlightDual(label, searchHighlight, findHighlight, searchColors)}
        </span>
        {isEmpty && <span className="text-gray-400 ml-1">(空)</span>}
        {!isExpanded && !isEmpty && (
          <span className="text-gray-500 ml-2 truncate max-w-[250px] font-mono">
            {highlightDual(
              displayContent.slice(0, 100),
              searchHighlight,
              findHighlight,
              searchColors,
            )}
          </span>
        )}
      </button>
      {isExpanded && (
        <div
          className={`px-4 py-2 border-t ${isError ? "border-red-200" : "border-green-200"}`}
        >
          {isEmpty ? (
            <p className="text-xs text-gray-400 italic">无内容</p>
          ) : (
            <pre
              className={`text-xs p-2 rounded overflow-x-auto max-h-60 overflow-y-auto ${isError ? "text-red-900 bg-red-100/50" : "text-green-900 bg-green-100/50"}`}
            >
              <code>
                {highlightDual(
                  displayContent,
                  searchHighlight,
                  findHighlight,
                  searchColors,
                )}
              </code>
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
