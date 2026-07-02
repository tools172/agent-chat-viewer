import type { ProviderMeta } from '../types';

/**
 * Agent 提供者的视觉元数据
 * 配色方案：热带风情色系（橘子汽水 · 青柠 · 热带海水 · 火龙果）
 */
export const PROVIDER_META: Record<string, ProviderMeta> = {
  claude_code: {
    label: 'Claude',
    color: 'bg-orange-200 text-orange-800 border-orange-400',
  },
  codex: {
    label: 'Codex',
    color: 'bg-lime-200 text-lime-800 border-lime-400',
  },
  cursor: {
    label: 'Cursor',
    color: 'bg-cyan-200 text-cyan-800 border-cyan-400',
  },
  openclaw: {
    label: 'OpenClaw',
    color: 'bg-fuchsia-200 text-fuchsia-800 border-fuchsia-400',
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

/** Agent 对应启用状态的徽章色（低饱和度背景 + 同色系文字） */
const PROVIDER_ENABLED_COLORS: Record<string, string> = {
  claude_code: 'bg-orange-100 text-orange-700',
  codex: 'bg-lime-100 text-lime-700',
  cursor: 'bg-cyan-100 text-cyan-700',
  openclaw: 'bg-fuchsia-100 text-fuchsia-700',
};

/**
 * 获取 Agent 启用状态徽章的样式类
 */
export function getProviderEnabledColor(providerName: string): string {
  return (
    PROVIDER_ENABLED_COLORS[providerName] ??
    'bg-green-100 text-green-700'
  );
}

/** 提供商标识圆点的饱和色（比 badge 用色更深，确保小尺寸下醒目） */
const PROVIDER_DOT_COLORS: Record<string, string> = {
  claude_code: 'bg-orange-500',
  codex: 'bg-lime-500',
  cursor: 'bg-cyan-500',
  openclaw: 'bg-fuchsia-500',
};

/**
 * 获取 Agent 标识圆点的背景色（高饱和度，适合小圆点）
 */
export function getProviderDotColor(providerName: string): string {
  return PROVIDER_DOT_COLORS[providerName] ?? 'bg-gray-500';
}
