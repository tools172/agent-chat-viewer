import type { ProviderMeta } from '../types';

/**
 * Agent 提供者的视觉元数据
 */
export const PROVIDER_META: Record<string, ProviderMeta> = {
  claude_code: {
    label: 'Claude',
    color: 'bg-amber-200 text-amber-800 border-amber-400',
  },
  codex: {
    label: 'Codex',
    color: 'bg-emerald-200 text-emerald-800 border-emerald-400',
  },
  openclaw: {
    label: 'OpenClaw',
    color: 'bg-purple-200 text-purple-800 border-purple-400',
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
    'bg-gray-200 text-gray-700 border-gray-400'
  );
}

/** 提供商标识圆点的饱和色（比 badge 用色更深，确保小尺寸下醒目） */
const PROVIDER_DOT_COLORS: Record<string, string> = {
  claude_code: 'bg-amber-500',
  codex: 'bg-emerald-500',
  openclaw: 'bg-purple-500',
};

/**
 * 获取 Agent 标识圆点的背景色（高饱和度，适合小圆点）
 */
export function getProviderDotColor(providerName: string): string {
  return PROVIDER_DOT_COLORS[providerName] ?? 'bg-gray-500';
}
