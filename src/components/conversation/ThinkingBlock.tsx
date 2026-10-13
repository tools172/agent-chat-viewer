import React from "react";
import { Brain, ChevronDown, ChevronRight } from "lucide-react";
import { highlightDual } from "../../utils/highlight";

interface ThinkingBlockProps {
  thinking: string;
  signature: string;
  isExpanded: boolean;
  onToggle: () => void;
  searchHighlight?: string;
  findHighlight?: string;
  searchColors: { search: string; find: string };
}

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({
  thinking,
  signature,
  isExpanded,
  onToggle,
  searchHighlight,
  findHighlight,
  searchColors,
}) => {
  return (
    <div className="my-2 border border-amber-200 rounded-lg overflow-hidden bg-amber-50/50">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100/50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        <Brain className="h-3.5 w-3.5" />
        <span>
          {highlightDual(
            "思考过程",
            searchHighlight,
            findHighlight,
            searchColors,
          )}
        </span>
        {!isExpanded && (
          <span className="text-amber-500 ml-2 truncate max-w-[200px]">
            {highlightDual(
              thinking.slice(0, 60),
              searchHighlight,
              findHighlight,
              searchColors,
            )}
          </span>
        )}
      </button>
      {isExpanded && (
        <div className="px-4 py-2 border-t border-amber-200">
          <p className="text-sm text-amber-900 whitespace-pre-wrap leading-relaxed">
            {highlightDual(
              thinking,
              searchHighlight,
              findHighlight,
              searchColors,
            )}
          </p>
          {signature && (
            <p className="text-xs text-amber-500 mt-2">签名: {signature}</p>
          )}
        </div>
      )}
    </div>
  );
};
