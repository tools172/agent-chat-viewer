import React from 'react';
import { Eye, EyeOff, Brain, Wrench, FileOutput, Settings, Combine } from 'lucide-react';
import type { FilterConfig } from '../../types';

interface FilterBarProps {
  filter: FilterConfig;
  onChange: (filter: Partial<FilterConfig>) => void;
}

const FilterToggle: React.FC<{
  label: string;
  icon: React.ReactNode;
  enabled: boolean;
  onChange: (value: boolean) => void;
}> = ({ label, icon, enabled, onChange }) => (
  <button
    onClick={() => onChange(!enabled)}
    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
      enabled
        ? 'bg-primary-100 text-primary-700 border border-primary-300'
        : 'bg-gray-100 text-gray-400 border border-gray-200'
    }`}
    title={`${enabled ? '隐藏' : '显示'} ${label}`}
  >
    {icon}
    <span>{label}</span>
    {enabled ? (
      <Eye className="h-3 w-3" />
    ) : (
      <EyeOff className="h-3 w-3" />
    )}
  </button>
);

export const FilterBar: React.FC<FilterBarProps> = ({ filter, onChange }) => {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Settings className="h-3.5 w-3.5 text-gray-400 mr-1" />
      <FilterToggle
        label="思考"
        icon={<Brain className="h-3.5 w-3.5" />}
        enabled={filter.showThinking}
        onChange={(v) => onChange({ showThinking: v })}
      />
      <FilterToggle
        label="工具调用"
        icon={<Wrench className="h-3.5 w-3.5" />}
        enabled={filter.showToolCalls}
        onChange={(v) => onChange({ showToolCalls: v })}
      />
      <FilterToggle
        label="工具结果"
        icon={<FileOutput className="h-3.5 w-3.5" />}
        enabled={filter.showToolResults}
        onChange={(v) => onChange({ showToolResults: v })}
      />
      <button
        onClick={() =>
          onChange({ hideEmptyToolResults: !filter.hideEmptyToolResults })
        }
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
          filter.hideEmptyToolResults
            ? 'bg-amber-100 text-amber-700 border border-amber-300'
            : 'bg-gray-100 text-gray-400 border border-gray-200'
        }`}
        title="隐藏空结果"
      >
        <EyeOff className="h-3 w-3" />
        <span>隐藏空结果</span>
      </button>
      <button
        onClick={() =>
          onChange({ collapseConsecutive: !filter.collapseConsecutive })
        }
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
          filter.collapseConsecutive
            ? 'bg-primary-100 text-primary-700 border border-primary-300'
            : 'bg-gray-100 text-gray-400 border border-gray-200'
        }`}
        title={filter.collapseConsecutive ? '展开连续同角色消息' : '折叠连续同角色消息，只显示最后一条'}
      >
        <Combine className="h-3.5 w-3.5" />
        <span>合并连发</span>
      </button>
    </div>
  );
};
