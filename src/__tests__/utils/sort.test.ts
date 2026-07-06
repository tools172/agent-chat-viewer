import { describe, it, expect } from 'vitest';
import { multiSort, getFieldLabel, getDirectionLabel, getLevelLabel, SORT_FIELDS, getTimeField, getSessionTime } from '../../utils/sort';
import type { SessionSummary, SortConfig, SortField, SortDirection } from '../../types';

// ============================================================
// 测试数据工厂
// ============================================================

let _idCounter = 0;
function make(overrides: Partial<SessionSummary> = {}): SessionSummary {
  _idCounter++;
  return {
    id: String(_idCounter),
    projectName: 'a',
    projectPath: '/data/a',
    display: 'Session',
    timestamp: '2026-06-01T00:00:00Z',
    messageCount: 5,
    fileSize: 100,
    cwd: '/workspace/a',
    filePath: '/data/a/s.jsonl',
    providerName: 'claude_code',
    fileMtime: '2026-06-01T00:00:00Z',
    clientType: 'cli',
    storagePath: '/data/a',
    ...overrides,
  };
}

/** 提取 id 数组，方便断言 */
function ids(sessions: SessionSummary[]): string[] {
  return sessions.map((s) => s.id);
}

// ============================================================
// 固定测试数据集
// ============================================================

/** 4 条跨项目、各字段有区分度的会话 */
function makeBaseSessions(): SessionSummary[] {
  _idCounter = 0;
  return [
    make({ id: 'x', projectPath: '/data/ccc', cwd: '/work/ccc', projectName: 'ccc-proj', display: 'Zebra',  timestamp: '2026-06-01T00:00:00Z', messageCount: 10, fileSize: 1000, providerName: 'openclaw' }),
    make({ id: 'a', projectPath: '/data/aaa', cwd: '/work/aaa', projectName: 'aaa-proj', display: 'Alpha',  timestamp: '2026-01-01T00:00:00Z', messageCount: 20, fileSize: 500,  providerName: 'claude_code' }),
    make({ id: 'b', projectPath: '/data/aaa', cwd: '/work/aaa', projectName: 'aaa-proj', display: 'Beta',   timestamp: '2026-12-01T00:00:00Z', messageCount: 5,  fileSize: 300,  providerName: 'claude_code' }),
    make({ id: 'y', projectPath: '/data/bbb', cwd: '/work/bbb', projectName: 'bbb-proj', display: 'Gamma',  timestamp: '2026-03-01T00:00:00Z', messageCount: 15, fileSize: 200,  providerName: 'claude_code' }),
  ];
}

// ============================================================
// 工具函数：验证有序
// ============================================================

function expectOrder<T>(
  items: T[],
  extract: (item: T) => number | string,
  direction: 'asc' | 'desc'
) {
  for (let i = 1; i < items.length; i++) {
    const prev = extract(items[i - 1]);
    const curr = extract(items[i]);
    if (direction === 'asc') {
      if (prev > curr) {
        throw new Error(`期望升序，但索引 ${i - 1} (${prev}) > 索引 ${i} (${curr})`);
      }
    } else {
      if (prev < curr) {
        throw new Error(`期望降序，但索引 ${i - 1} (${prev}) < 索引 ${i} (${curr})`);
      }
    }
  }
}

// ============================================================
// 测试开始
// ============================================================

describe('multiSort', () => {
  // ----------------------------------------------------------
  // §1  单字段 × 双方向 — 全覆盖（6 字段 × 2 方向 = 12 组）
  // ----------------------------------------------------------

  const singleFieldExtractors: Record<SortField, (s: SessionSummary) => number | string> = {
    path:         (s) => s.projectPath,        // 新策略：projectPath 为主
    created:      (s) => s.timestamp,
    modified:     (s) => s.fileMtime || s.timestamp,
    name:         (s) => s.display,
    messageCount: (s) => s.messageCount,
    agent:        (s) => s.providerName,
    size:         (s) => s.fileSize,
  };

  for (const field of SORT_FIELDS) {
    for (const direction of ['asc', 'desc'] as SortDirection[]) {
      it(`单字段：${getFieldLabel(field)} ${getDirectionLabel(field, direction)}`, () => {
        const cfg: SortConfig = [{ field, direction }];
        const r = multiSort(makeBaseSessions(), cfg);
        expect(r).toHaveLength(4);
        expectOrder(r, singleFieldExtractors[field], direction);
      });
    }
  }

  // ----------------------------------------------------------
  // §2  多级排序 — 核心组合
  // ----------------------------------------------------------

  it('多级：path ↑ + messageCount ↓（同项目内消息多优先）', () => {
    const cfg: SortConfig = [
      { field: 'path', direction: 'asc' },
      { field: 'messageCount', direction: 'desc' },
    ];
    const r = multiSort(makeBaseSessions(), cfg);
    // projectPath 排序: /aaa(a,b) < /bbb(y) < /ccc(x)
    // /aaa 内部按消息数降序: a(20) > b(5)
    expect(ids(r)).toEqual(['a', 'b', 'y', 'x']);
  });

  it('多级：path ↑ + messageCount ↑（同项目内消息少优先）', () => {
    const cfg: SortConfig = [
      { field: 'path', direction: 'asc' },
      { field: 'messageCount', direction: 'asc' },
    ];
    const r = multiSort(makeBaseSessions(), cfg);
    // /aaa 内部按消息数升序: b(5) < a(20)
    expect(ids(r)).toEqual(['b', 'a', 'y', 'x']);
  });

  it('多级：path ↑ + time ↓（同项目内最新优先）', () => {
    const cfg: SortConfig = [
      { field: 'path', direction: 'asc' },
      { field: 'created', direction: 'desc' },
    ];
    const r = multiSort(makeBaseSessions(), cfg);
    // /aaa 内部: b(Dec) > a(Jan)
    expect(ids(r)).toEqual(['b', 'a', 'y', 'x']);
  });

  it('多级：agent ↑ + path ↑', () => {
    const cfg: SortConfig = [
      { field: 'agent', direction: 'asc' },
      { field: 'path', direction: 'asc' },
    ];
    const r = multiSort(makeBaseSessions(), cfg);
    // claude_code 先（a,b,y），openclaw 后（x）
    // claude_code 内部按 path: a,b 在 y 前
    expect(ids(r)[0]).not.toBe('x'); // openclaw 不在第一位
    expect(ids(r)[3]).toBe('x');     // openclaw 在最后
  });

  it('多级：messageCount ↓ + time ↓', () => {
    const cfg: SortConfig = [
      { field: 'messageCount', direction: 'desc' },
      { field: 'created', direction: 'desc' },
    ];
    const r = multiSort(makeBaseSessions(), cfg);
    // a(20) > y(15) > x(10) > b(5)
    expect(r[0].id).toBe('a');
    expect(r[3].id).toBe('b');
  });

  it('多级：三级 — path ↑ + messageCount ↓ + time ↓', () => {
    // 添加一条同路径、同消息数的会话
    const s = [
      ...makeBaseSessions(),
      make({ id: 'a2', projectPath: '/data/aaa', cwd: '/work/aaa', messageCount: 20, timestamp: '2026-07-01T00:00:00Z' }),
    ];
    const cfg: SortConfig = [
      { field: 'path', direction: 'asc' },
      { field: 'messageCount', direction: 'desc' },
      { field: 'created', direction: 'desc' },
    ];
    const r = multiSort(s, cfg);
    // /aaa 内: a2(20,Jul) vs a(20,Jan) → 同级消息数 → 按 time ↓: a2 在前
    // 然后是 b(5)
    const idxA2 = r.findIndex((s) => s.id === 'a2');
    const idxA = r.findIndex((s) => s.id === 'a');
    expect(idxA2).toBeLessThan(idxA); // a2 在 a 前（时间更新）
    expect(r[r.length - 1].id).toBe('x'); // /ccc 最后
  });

  // ----------------------------------------------------------
  // §3  BUG 回归：同项目内 cwd 不一致时，二级排序仍然生效
  // ----------------------------------------------------------

  it('同项目 cwd 不一致时，path 排序仍视为同组（二级排序生效）', () => {
    // 模拟：同项目 (/data/proj) 下有 3 条会话，cwd 分别是空、有值、空
    const s = [
      make({ id: 's1', projectPath: '/data/proj', cwd: '/real/path', messageCount: 10, projectName: 'proj' }),
      make({ id: 's2', projectPath: '/data/proj', cwd: '',            messageCount: 50, projectName: 'proj' }),
      make({ id: 's3', projectPath: '/data/proj', cwd: '',            messageCount: 5,  projectName: 'proj' }),
    ];
    // path ↑ + messageCount ↓: 先按 projectPath（全部 /data/proj → 相等），再按消息数降
    const cfg: SortConfig = [
      { field: 'path', direction: 'asc' },
      { field: 'messageCount', direction: 'desc' },
    ];
    const r = multiSort(s, cfg);
    // cwd 空('') < '/real/path'，所以 s2,s3 在 s1 前；s2,s3 同 cwd → msg↓: 50 > 5
    expect(ids(r)).toEqual(['s2', 's3', 's1']);
  });

  it('同项目 cwd 不一致 + 消息数升序', () => {
    const s = [
      make({ id: 's1', projectPath: '/data/proj', cwd: '/real/path', messageCount: 10, projectName: 'proj' }),
      make({ id: 's2', projectPath: '/data/proj', cwd: '',            messageCount: 50, projectName: 'proj' }),
      make({ id: 's3', projectPath: '/data/proj', cwd: '',            messageCount: 5,  projectName: 'proj' }),
    ];
    const cfg: SortConfig = [
      { field: 'path', direction: 'asc' },
      { field: 'messageCount', direction: 'asc' },
    ];
    const r = multiSort(s, cfg);
    // cwd 空('') < '/real/path'，所以 s3,s2 在 s1 前；s3,s2 同 cwd → msg↑: 5 < 50
    expect(ids(r)).toEqual(['s3', 's2', 's1']);
  });

  it('跨项目 cwd 不一致时，projectPath 主导排序', () => {
    const s = [
      make({ id: 'p1', projectPath: '/data/aaa', cwd: '/real/zzz', projectName: 'aaa' }),
      make({ id: 'p2', projectPath: '/data/bbb', cwd: '',           projectName: 'bbb' }),
      make({ id: 'p3', projectPath: '/data/ccc', cwd: '/real/aaa', projectName: 'ccc' }),
    ];
    const cfg: SortConfig = [{ field: 'path', direction: 'asc' }];
    const r = multiSort(s, cfg);
    // projectPath 排序：/data/aaa < /data/bbb < /data/ccc
    // cwd 只在同 projectPath 时才起作用
    expect(ids(r)).toEqual(['p1', 'p2', 'p3']);
  });

  it('同 projectPath，不同 cwd — 按 cwd 细化', () => {
    const s = [
      make({ id: 'w1', projectPath: '/data/proj', cwd: '/work/ccc', projectName: 'proj' }),
      make({ id: 'w2', projectPath: '/data/proj', cwd: '/work/aaa', projectName: 'proj' }),
      make({ id: 'w3', projectPath: '/data/proj', cwd: '/work/bbb', projectName: 'proj' }),
    ];
    const cfg: SortConfig = [{ field: 'path', direction: 'asc' }];
    const r = multiSort(s, cfg);
    expect(ids(r)).toEqual(['w2', 'w3', 'w1']); // /work/aaa < /work/bbb < /work/ccc
  });

  // ----------------------------------------------------------
  // §4  稳定排序
  // ----------------------------------------------------------

  it('排序是稳定的（同值保持原始相对顺序）', () => {
    const s = [
      make({ id: 'A', projectPath: '/same', messageCount: 5 }),
      make({ id: 'B', projectPath: '/same', messageCount: 5 }),
      make({ id: 'C', projectPath: '/same', messageCount: 5 }),
    ];
    const r = multiSort(s, [{ field: 'messageCount', direction: 'asc' }]);
    expect(ids(r)).toEqual(['A', 'B', 'C']);
  });

  // ----------------------------------------------------------
  // §5  边界情况
  // ----------------------------------------------------------

  it('空配置返回副本（不改变顺序）', () => {
    const s = makeBaseSessions();
    const r = multiSort(s, []);
    expect(ids(r)).toEqual(ids(s));
    expect(r).not.toBe(s); // 是新数组
  });

  it('单条会话直接返回', () => {
    const s = [make({ id: 'only' })];
    const r = multiSort(s, [{ field: 'created', direction: 'desc' }]);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('only');
  });

  it('空数组返回空数组', () => {
    const r = multiSort([], [{ field: 'created', direction: 'desc' }]);
    expect(r).toEqual([]);
  });

  it('全部字段相等的会话保持原顺序', () => {
    const s = [
      make({ id: 'X', projectPath: '/same', cwd: '/same', messageCount: 3, timestamp: '2026-01-01T00:00:00Z' }),
      make({ id: 'Y', projectPath: '/same', cwd: '/same', messageCount: 3, timestamp: '2026-01-01T00:00:00Z' }),
    ];
    const r = multiSort(s, [
      { field: 'path', direction: 'asc' },
      { field: 'messageCount', direction: 'desc' },
      { field: 'created', direction: 'asc' },
    ]);
    expect(r[0].id).toBe('X');
    expect(r[1].id).toBe('Y');
  });

  it('agent 升序：claude_code 在 openclaw 前', () => {
    const s = [
      make({ providerName: 'openclaw' }),
      make({ providerName: 'claude_code' }),
    ];
    const cfg: SortConfig = [{ field: 'agent', direction: 'asc' }];
    expect(multiSort(s, cfg)[0].providerName).toBe('claude_code');
  });

  it('agent 降序：openclaw 在 claude_code 前', () => {
    const s = [
      make({ providerName: 'claude_code' }),
      make({ providerName: 'openclaw' }),
    ];
    const cfg: SortConfig = [{ field: 'agent', direction: 'desc' }];
    expect(multiSort(s, cfg)[0].providerName).toBe('openclaw');
  });

  it('size 降序：大文件在前', () => {
    const s = [
      make({ fileSize: 100 }),
      make({ fileSize: 1000 }),
    ];
    const cfg: SortConfig = [{ field: 'size', direction: 'desc' }];
    expect(multiSort(s, cfg)[0].fileSize).toBe(1000);
  });

  it('size 升序：小文件在前', () => {
    const s = [
      make({ fileSize: 1000 }),
      make({ fileSize: 100 }),
    ];
    const cfg: SortConfig = [{ field: 'size', direction: 'asc' }];
    expect(multiSort(s, cfg)[0].fileSize).toBe(100);
  });
});

// ============================================================
// 标签函数
// ============================================================

describe('标签函数', () => {
  it('getFieldLabel 返回中文标签', () => {
    expect(getFieldLabel('created')).toBe('按创建时间');
    expect(getFieldLabel('modified')).toBe('按修改时间');
    expect(getFieldLabel('path')).toBe('按路径');
    expect(getFieldLabel('name')).toBe('按名称');
    expect(getFieldLabel('messageCount')).toBe('按消息数');
    expect(getFieldLabel('agent')).toBe('按 Agent');
    expect(getFieldLabel('size')).toBe('按大小');
  });

  it('getDirectionLabel 返回方向描述', () => {
    expect(getDirectionLabel('created', 'desc')).toBe('最新优先');
    expect(getDirectionLabel('created', 'asc')).toBe('最早优先');
    expect(getDirectionLabel('path', 'asc')).toBe('工作目录 A→Z');
    expect(getDirectionLabel('path', 'desc')).toBe('工作目录 Z→A');
    expect(getDirectionLabel('messageCount', 'desc')).toBe('最多优先');
    expect(getDirectionLabel('messageCount', 'asc')).toBe('最少优先');
  });

  it('getLevelLabel 返回摘要', () => {
    expect(getLevelLabel({ field: 'created', direction: 'desc' })).toBe('按创建时间 ↓');
    expect(getLevelLabel({ field: 'path', direction: 'asc' })).toBe('按路径 ↑');
  });
});

// ============================================================
// TimeField 工具函数
// ============================================================

describe('getTimeField', () => {
  it('空配置返回 created', () => {
    expect(getTimeField([])).toBe('created');
  });

  it('主排序为 created 返回 created', () => {
    expect(getTimeField([{ field: 'created', direction: 'desc' }])).toBe('created');
  });

  it('主排序为 modified 返回 modified', () => {
    expect(getTimeField([{ field: 'modified', direction: 'asc' }])).toBe('modified');
  });

  it('主排序为非时间字段（path）回退到 created', () => {
    expect(getTimeField([{ field: 'path', direction: 'asc' }])).toBe('created');
  });

  it('主排序为非时间字段（name）回退到 created', () => {
    expect(getTimeField([{ field: 'name', direction: 'asc' }])).toBe('created');
  });

  it('多级排序只看第一级', () => {
    const cfg: SortConfig = [
      { field: 'modified', direction: 'desc' },
      { field: 'path', direction: 'asc' },
    ];
    expect(getTimeField(cfg)).toBe('modified');
  });
});

describe('getSessionTime', () => {
  it('timeField=created 返回 timestamp', () => {
    const s = make({ timestamp: '2026-06-01T00:00:00Z', fileMtime: '2026-07-01T00:00:00Z' });
    expect(getSessionTime(s, 'created')).toBe('2026-06-01T00:00:00Z');
  });

  it('timeField=modified 返回 fileMtime', () => {
    const s = make({ timestamp: '2026-06-01T00:00:00Z', fileMtime: '2026-07-01T00:00:00Z' });
    expect(getSessionTime(s, 'modified')).toBe('2026-07-01T00:00:00Z');
  });

  it('timeField=modified 但 fileMtime 为空时 fallback 到 timestamp', () => {
    const s = make({ timestamp: '2026-06-01T00:00:00Z', fileMtime: '' });
    expect(getSessionTime(s, 'modified')).toBe('2026-06-01T00:00:00Z');
  });

  it('timeField=modified 且 fileMtime 和 timestamp 都为空时返回空字符串', () => {
    const s = make({ timestamp: '', fileMtime: '' });
    expect(getSessionTime(s, 'modified')).toBe('');
  });
});
