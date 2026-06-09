import type { SessionSummary, SortField, SortDirection, SortConfig, SortLevel } from '../types';

// ===== Strategy Pattern: 每种排序字段是一个策略 =====

interface SortStrategy {
  label: string;
  ascLabel: string;
  descLabel: string;
  compare: (a: SessionSummary, b: SessionSummary) => number;
}

/** 排序策略注册表 — 扩展只需添加新条目 */
const STRATEGIES: Record<SortField, SortStrategy> = {
  time: {
    label: '按时间',
    ascLabel: '最早优先',
    descLabel: '最新优先',
    compare: (a, b) => a.timestamp.localeCompare(b.timestamp),
  },
  path: {
    label: '按路径',
    ascLabel: '项目 A→Z',
    descLabel: '项目 Z→A',
    compare: (a, b) => a.projectName.localeCompare(b.projectName),
  },
  name: {
    label: '按名称',
    ascLabel: '标题 A→Z',
    descLabel: '标题 Z→A',
    compare: (a, b) => a.display.localeCompare(b.display),
  },
  messageCount: {
    label: '按消息数',
    ascLabel: '最少优先',
    descLabel: '最多优先',
    compare: (a, b) => a.messageCount - b.messageCount,
  },
  agent: {
    label: '按 Agent',
    ascLabel: 'Claude 优先',
    descLabel: 'OpenClaw 优先',
    compare: (a, b) => a.providerName.localeCompare(b.providerName),
  },
  size: {
    label: '按大小',
    ascLabel: '最小优先',
    descLabel: '最大优先',
    compare: (a, b) => a.fileSize - b.fileSize,
  },
};

// ===== 公共 API =====

/** 所有可用的排序字段 */
export const SORT_FIELDS: SortField[] = Object.keys(STRATEGIES) as SortField[];

/** 获取排序字段的显示标签 */
export function getFieldLabel(field: SortField): string {
  return STRATEGIES[field].label;
}

/** 获取排序方向的显示描述 */
export function getDirectionLabel(field: SortField, dir: SortDirection): string {
  return dir === 'asc' ? STRATEGIES[field].ascLabel : STRATEGIES[field].descLabel;
}

/** 获取单级的简短摘要（用于分段按钮显示） */
export function getLevelLabel(level: SortLevel): string {
  return `${getFieldLabel(level.field)} ${level.direction === 'asc' ? '↑' : '↓'}`;
}

/**
 * 多级稳定排序。
 * 按 sortConfig 顺序依次比较，前一级相等时才看下一级。
 */
export function multiSort(
  sessions: SessionSummary[],
  config: SortConfig
): SessionSummary[] {
  if (!config.length) return [...sessions];

  const sorted = [...sessions];
  sorted.sort((a, b) => {
    for (const level of config) {
      const cmp = STRATEGIES[level.field].compare(a, b);
      if (cmp !== 0) {
        return level.direction === 'asc' ? cmp : -cmp;
      }
    }
    return 0;
  });
  return sorted;
}

/** 默认排序配置（每种视图独立） */
export const DEFAULT_SORTS: Record<string, SortConfig> = {
  flat: [{ field: 'time', direction: 'desc' }],
  'by-project': [{ field: 'path', direction: 'asc' }],
  'by-time': [{ field: 'time', direction: 'desc' }],
  search: [{ field: 'time', direction: 'desc' }],
};
