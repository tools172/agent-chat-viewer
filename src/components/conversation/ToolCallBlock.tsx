import React from "react";
import { Wrench, ChevronDown, ChevronRight } from "lucide-react";
import { highlightDual } from "../../utils/highlight";

interface ToolCallBlockProps {
  toolName: string;
  toolInput: Record<string, unknown>;
  isExpanded: boolean;
  onToggle: () => void;
  searchHighlight?: string;
  findHighlight?: string;
  searchColors: { search: string; find: string };
}

export const ToolCallBlock: React.FC<ToolCallBlockProps> = ({
  toolName,
  toolInput,
  isExpanded,
  onToggle,
  searchHighlight,
  findHighlight,
  searchColors,
}) => {
  const inputStr = JSON.stringify(toolInput, null, 2);
  const label = `工具调用: ${toolName}`;
  const preview = JSON.stringify(toolInput).slice(0, 80);

  return (
    <div className="my-2 border border-purple-200 rounded-lg overflow-hidden bg-purple-50/50">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-purple-700 hover:bg-purple-100/50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        <Wrench className="h-3.5 w-3.5" />
        <span>
          {highlightDual(label, searchHighlight, findHighlight, searchColors)}
        </span>
        {!isExpanded && (
          <span className="text-purple-500 ml-2 truncate max-w-[200px] font-mono">
            {highlightDual(
              preview,
              searchHighlight,
              findHighlight,
              searchColors,
            )}
          </span>
        )}
      </button>
      {isExpanded && (
        <div className="px-4 py-2 border-t border-purple-200">
          <pre className="text-xs text-purple-900 bg-purple-100/50 p-2 rounded overflow-x-auto">
            <code>
              {highlightDual(
                inputStr,
                searchHighlight,
                findHighlight,
                searchColors,
              )}
            </code>
          </pre>
        </div>
      )}
    </div>
  );
};
