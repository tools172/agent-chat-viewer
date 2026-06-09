import { describe, it, expect } from 'vitest';
import { multiSort, getFieldLabel, getDirectionLabel, getLevelLabel } from '../../utils/sort';
import type { SessionSummary, SortConfig } from '../../types';

function make(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: '1', projectName: 'a', projectPath: '/a', display: 'A',
    timestamp: '2026-01-01T00:00:00Z', messageCount: 5, fileSize: 100,
    cwd: '/', filePath: '/a/s.jsonl', providerName: 'claude_code',
    ...overrides,
  };
}

describe('multiSort', () => {
  const sessions = [
    make({ id: 'a', projectName: 'ccc', messageCount: 10, timestamp: '2026-06-01T00:00:00Z' }),
    make({ id: 'b', projectName: 'aaa', messageCount: 20, timestamp: '2026-01-01T00:00:00Z' }),
    make({ id: 'c', projectName: 'aaa', messageCount: 5,  timestamp: '2026-12-01T00:00:00Z' }),
    make({ id: 'd', projectName: 'bbb', messageCount: 15, timestamp: '2026-03-01T00:00:00Z' }),
  ];

  it('单级：按时间降序', () => {
    const cfg: SortConfig = [{ field: 'time', direction: 'desc' }];
    const r = multiSort(sessions, cfg);
    expect(r[0].id).toBe('c'); // newest
    expect(r[3].id).toBe('b'); // oldest
  });

  it('单级：按路径升序', () => {
    const cfg: SortConfig = [{ field: 'path', direction: 'asc' }];
    const r = multiSort(sessions, cfg);
    expect(r[0].projectName).toBe('aaa');
    expect(r[1].projectName).toBe('aaa');
    expect(r[2].projectName).toBe('bbb');
    expect(r[3].projectName).toBe('ccc');
  });

  it('多级：先按路径升序，再按消息数降序', () => {
    const cfg: SortConfig = [
      { field: 'path', direction: 'asc' },
      { field: 'messageCount', direction: 'desc' },
    ];
    const r = multiSort(sessions, cfg);
    // 先按路径：aaa, aaa, bbb, ccc
    // aaa 内部按消息数降序：msgCount 20 > 5
    expect(r[0].id).toBe('b'); // aaa, 20 msgs
    expect(r[1].id).toBe('c'); // aaa, 5 msgs
    expect(r[2].projectName).toBe('bbb');
    expect(r[3].projectName).toBe('ccc');
  });

  it('空配置返回原顺序', () => {
    const r = multiSort(sessions, []);
    expect(r).toHaveLength(4);
  });

  it('按 agent 排序', () => {
    const s = [
      make({ providerName: 'openclaw' }),
      make({ providerName: 'claude_code' }),
    ];
    const cfg: SortConfig = [{ field: 'agent', direction: 'asc' }];
    expect(multiSort(s, cfg)[0].providerName).toBe('claude_code');
  });

  it('按大小排序', () => {
    const s = [
      make({ fileSize: 1000 }),
      make({ fileSize: 100 }),
    ];
    const cfg: SortConfig = [{ field: 'size', direction: 'desc' }];
    expect(multiSort(s, cfg)[0].fileSize).toBe(1000);
  });
});

describe('标签函数', () => {
  it('getFieldLabel 返回中文标签', () => {
    expect(getFieldLabel('time')).toBe('按时间');
    expect(getFieldLabel('path')).toBe('按路径');
    expect(getFieldLabel('agent')).toBe('按 Agent');
    expect(getFieldLabel('size')).toBe('按大小');
  });

  it('getDirectionLabel 返回方向描述', () => {
    expect(getDirectionLabel('time', 'desc')).toBe('最新优先');
    expect(getDirectionLabel('path', 'asc')).toBe('项目 A→Z');
    expect(getDirectionLabel('messageCount', 'desc')).toBe('最多优先');
  });

  it('getLevelLabel 返回摘要', () => {
    expect(getLevelLabel({ field: 'time', direction: 'desc' })).toBe('按时间 ↓');
    expect(getLevelLabel({ field: 'path', direction: 'asc' })).toBe('按路径 ↑');
  });
});
