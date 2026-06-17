import React from 'react';
import { Eye, EyeOff, Brain, Wrench, FileOutput, Filter, Combine, Search, Cpu } from 'lucide-react';
import type { FilterConfig } from '../../types';

interface FilterBarProps {
  filter: FilterConfig;
  onChange: (filter: Partial<FilterConfig>) => void;
  /** 统计信息，显示在过滤按钮右侧 */
  stats?: { totalEvents: number; userCount: number; assistantCount: number; thinkingCount: number; toolCallCount: number };
  /** 查找按钮回调 */
  showFindBar?: boolean;
  onToggleFind?: () => void;
  /** 当前会话的 provider，用于条件渲染特定过滤按钮 */
  providerName?: string;
}

const FilterToggle: React.FC<{
  label: string;
  icon: React.ReactNode;
  enabled: boolean;
  onChange: (value: boolean) => void;
}> = ({ label, icon, enabled, onChange }) => (
  <button
    onClick={() => onChange(!enabled)}
    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
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

export const FilterBar: React.FC<FilterBarProps> = ({ filter, onChange, stats, showFindBar, onToggleFind, providerName }) => {
  return (
    <div className="flex items-center gap-2 overflow-hidden">
      {/* 过滤按钮组 */}
      <span className="flex items-center gap-1 flex-shrink-0">
        <Filter className="h-3 w-3 text-gray-400" />
        <FilterToggle
          label="思考"
          icon={<Brain className="h-3 w-3" />}
          enabled={filter.showThinking}
          onChange={(v) => onChange({ showThinking: v })}
        />
        <FilterToggle
          label="工具调用"
          icon={<Wrench className="h-3 w-3" />}
          enabled={filter.showToolCalls}
          onChange={(v) => onChange({ showToolCalls: v })}
        />
        <FilterToggle
          label="工具结果"
          icon={<FileOutput className="h-3 w-3" />}
          enabled={filter.showToolResults}
          onChange={(v) => onChange({ showToolResults: v })}
        />
        {providerName === 'codex' && (
          <FilterToggle
            label="开发者消息"
            icon={<Cpu className="h-3 w-3" />}
            enabled={filter.showSystemMessages}
            onChange={(v) => onChange({ showSystemMessages: v })}
          />
        )}
        <button
          onClick={() =>
            onChange({ hideEmptyToolResults: !filter.hideEmptyToolResults })
          }
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
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
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
            filter.collapseConsecutive
              ? 'bg-primary-100 text-primary-700 border border-primary-300'
              : 'bg-gray-100 text-gray-400 border border-gray-200'
          }`}
          title={filter.collapseConsecutive ? '展开连续同角色消息' : '折叠连续同角色消息，只显示最后一条'}
        >
          <Combine className="h-3 w-3" />
          <span>合并连发</span>
        </button>
      </span>

      {/* 分隔 + 统计 + 查找（窗口太窄时整体隐藏，不换行） */}
      {stats && (
        <span className="hidden sm:flex items-center gap-3 text-xs text-gray-400 flex-shrink-0 ml-3 whitespace-nowrap">
          <span className="text-gray-300">|</span>
          <span>共 {stats.totalEvents} 条事件</span>
          <span>{stats.userCount} 用户消息</span>
          <span>{stats.assistantCount} 助手回复</span>
          {stats.thinkingCount > 0 && (
            <span>{stats.thinkingCount} 思考块</span>
          )}
          {stats.toolCallCount > 0 && (
            <span>{stats.toolCallCount} 工具调用</span>
          )}
          {onToggleFind && (
            <>
              <span className="text-gray-300 ml-1">|</span>
              <button
                onClick={onToggleFind}
                className={`flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
                  showFindBar
                    ? 'bg-orange-100 text-orange-700'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'
                }`}
                title="在会话中查找"
              >
                <Search className="h-3 w-3" />
                <span>查找</span>
              </button>
            </>
          )}
        </span>
      )}
    </div>
  );
};
