import type { ProviderMeta } from '../types';

/**
 * Agent 提供者的视觉元数据
 */
export const PROVIDER_META: Record<string, ProviderMeta> = {
  claude_code: {
    label: 'Claude',
    color: 'bg-amber-100 text-amber-700 border-amber-300',
  },
  codex: {
    label: 'Codex',
    color: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  },
  openclaw: {
    label: 'OpenClaw',
    color: 'bg-purple-100 text-purple-700 border-purple-300',
  },
};

/**
 * 获取 Agent 的显示名称
 */
export function getProviderLabel(providerName: string): string {
  return PROVIDER_META[providerName]?.label ?? providerName;
}

/**
 * 获取 Agent 的样式类
 */
export function getProviderColor(providerName: string): string {
  return (
    PROVIDER_META[providerName]?.color ??
    'bg-gray-100 text-gray-600 border-gray-300'
  );
}
