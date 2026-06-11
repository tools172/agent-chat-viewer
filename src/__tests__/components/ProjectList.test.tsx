import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectList } from '../../components/projects/ProjectList';

// Mock tauri utils
const mockedOpenContainingFolder = vi.fn();
const mockedOpenProjectFolder = vi.fn();

vi.mock('../../utils/tauri', () => ({
  openContainingFolder: (...args: unknown[]) => mockedOpenContainingFolder(...args),
  openProjectFolder: (...args: unknown[]) => mockedOpenProjectFolder(...args),
}));

// Mock settingsStore
vi.mock('../../stores/settingsStore', () => ({
  useSettingsStore: vi.fn((selector) => {
    const state = {
      settings: {
        searchColors: { search: '#fef08a', find: '#fed7aa' },
        watchDirectories: [],
        defaultFilter: {},
        providerEnabled: {},
      },
    };
    return selector ? selector(state) : state;
  }),
}));

describe('ProjectList', () => {
  const mockProjects = [
    { name: 'project-a', path: '/data/project-a', sessionCount: 3, lastActivity: '2026-06-10T00:00:00Z', providerName: 'claude_code' },
    { name: 'project-b', path: '/data/project-b', sessionCount: 1, lastActivity: '2026-06-09T00:00:00Z', providerName: 'claude_code' },
  ];

  const mockSessions = [
    { id: 's1', projectName: 'project-a', projectPath: '/data/project-a', display: 'Session 1', timestamp: '2026-06-10T00:00:00Z', messageCount: 5, fileSize: 100, cwd: '/real/project-a', filePath: '/data/project-a/s1.jsonl', providerName: 'claude_code' },
    { id: 's2', projectName: 'project-a', projectPath: '/data/project-a', display: 'Session 2', timestamp: '2026-06-09T00:00:00Z', messageCount: 3, fileSize: 50, cwd: '/real/project-a', filePath: '/data/project-a/s2.jsonl', providerName: 'claude_code' },
    { id: 's3', projectName: 'project-b', projectPath: '/data/project-b', display: 'Session 3', timestamp: '2026-06-09T00:00:00Z', messageCount: 1, fileSize: 20, cwd: '', filePath: '/data/project-b/s3.jsonl', providerName: 'claude_code' },
  ];

  const defaultProps = {
    projects: mockProjects,
    sessions: mockSessions,
    sortConfig: [{ field: 'time' as const, direction: 'desc' as const }],
    selectedProjectPath: null,
    selectedSessionPath: null,
    onSelectProject: vi.fn(),
    onSelectSession: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================
  // 渲染
  // ============================================================

  it('渲染所有文件夹', () => {
    render(<ProjectList {...defaultProps} />);
    expect(screen.getByText('project-a')).toBeInTheDocument();
    expect(screen.getByText('project-b')).toBeInTheDocument();
  });

  it('显示每个文件夹的会话数量', () => {
    render(<ProjectList {...defaultProps} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('选中文件夹高亮', () => {
    render(
      <ProjectList {...defaultProps} selectedProjectPath="/data/project-a" />
    );
    const btn = screen.getByText('project-a').closest('button');
    expect(btn?.className).toContain('primary');
  });

  // ============================================================
  // 右键菜单 — 打开工作目录（cwd 查找）
  // ============================================================

  it('右键菜单：打开工作目录 使用 allSessions 中的 cwd', async () => {
    const allSessions = [
      { id: 's1', projectName: 'project-a', projectPath: '/data/project-a', display: '', timestamp: '', messageCount: 1, fileSize: 0, cwd: '/real/project-a', filePath: '/data/project-a/s.jsonl', providerName: 'claude_code' },
    ];

    render(
      <ProjectList {...defaultProps} sessions={[]} allSessions={allSessions} />
    );

    // 右键点击文件夹
    const projectBtn = screen.getByText('project-a').closest('button')!;
    fireEvent.contextMenu(projectBtn);

    // 点击"打开工作目录"
    const menuItem = screen.getByText('打开工作目录');
    fireEvent.click(menuItem);

    // 应使用 cwd 而非 project.path
    expect(mockedOpenProjectFolder).toHaveBeenCalledWith('/real/project-a');
  });

  it('右键菜单：打开工作目录 在 cwd 为空时回退到 project.path', async () => {
    // project-b 的 session 没有 cwd
    const allSessions = [
      { id: 's3', projectName: 'project-b', projectPath: '/data/project-b', display: '', timestamp: '', messageCount: 1, fileSize: 0, cwd: '', filePath: '/data/project-b/s.jsonl', providerName: 'claude_code' },
    ];

    render(
      <ProjectList {...defaultProps} sessions={[]} allSessions={allSessions} />
    );

    const projectBtn = screen.getByText('project-b').closest('button')!;
    fireEvent.contextMenu(projectBtn);

    const menuItem = screen.getByText('打开工作目录');
    fireEvent.click(menuItem);

    // 回退到 project.path
    expect(mockedOpenProjectFolder).toHaveBeenCalledWith('/data/project-b');
  });

  it('右键菜单：打开工作目录 无 allSessions 时回退到 project.path', async () => {
    render(
      <ProjectList {...defaultProps} sessions={[]} />
    );

    const projectBtn = screen.getByText('project-a').closest('button')!;
    fireEvent.contextMenu(projectBtn);

    const menuItem = screen.getByText('打开工作目录');
    fireEvent.click(menuItem);

    // 没有 allSessions，回退到 project.path
    expect(mockedOpenProjectFolder).toHaveBeenCalledWith('/data/project-a');
  });

  // ============================================================
  // 右键菜单 — 打开所在文件夹
  // ============================================================

  it('右键菜单：打开所在文件夹 调用 openContainingFolder', () => {
    render(<ProjectList {...defaultProps} />);

    const projectBtn = screen.getByText('project-a').closest('button')!;
    fireEvent.contextMenu(projectBtn);

    const menuItem = screen.getByText('打开所在文件夹');
    fireEvent.click(menuItem);

    expect(mockedOpenContainingFolder).toHaveBeenCalledWith('/data/project-a');
  });

  // ============================================================
  // 点击行为
  // ============================================================

  it('点击文件夹触发 onSelectProject', () => {
    const onSelectProject = vi.fn();
    render(
      <ProjectList {...defaultProps} onSelectProject={onSelectProject} />
    );

    fireEvent.click(screen.getByText('project-a'));
    expect(onSelectProject).toHaveBeenCalledWith('/data/project-a', 'claude_code');
  });

  it('点击文件夹展开/折叠子会话列表', () => {
    render(<ProjectList {...defaultProps} />);

    // 初始：会话列表不显示
    expect(screen.queryByText('Session 1')).not.toBeInTheDocument();

    // 点击展开
    fireEvent.click(screen.getByText('project-a'));
    expect(screen.getByText('Session 1')).toBeInTheDocument();
    expect(screen.getByText('Session 2')).toBeInTheDocument();

    // 再次点击折叠
    fireEvent.click(screen.getByText('project-a'));
    expect(screen.queryByText('Session 1')).not.toBeInTheDocument();
  });

  // ============================================================
  // 文件夹排序
  // ============================================================

  /** 用于排序测试的乱序文件夹数据 */
  const shuffledProjects = [
    { name: 'ccc-project', path: '/data/ccc', sessionCount: 5, lastActivity: '2026-06-08T00:00:00Z', providerName: 'openclaw' },
    { name: 'aaa-project', path: '/data/aaa', sessionCount: 10, lastActivity: '2026-06-10T00:00:00Z', providerName: 'claude_code' },
    { name: 'bbb-project', path: '/data/bbb', sessionCount: 1, lastActivity: '2026-06-09T00:00:00Z', providerName: 'claude_code' },
  ];

  /** 验证容器中文案的出现顺序 */
  function expectTextOrder(container: HTMLElement, texts: string[]) {
    const fullText = container.textContent || '';
    let prevIndex = -1;
    for (const t of texts) {
      const idx = fullText.indexOf(t);
      if (idx === -1) {
        throw new Error(`文本 "${t}" 未在容器中找到`);
      }
      if (idx < prevIndex) {
        throw new Error(
          `文本 "${t}" 出现在前一个文本之前 (${idx} < ${prevIndex})`
        );
      }
      prevIndex = idx;
    }
  }

  it('文件夹按 path 升序排列', () => {
    const { container } = render(
      <ProjectList
        {...defaultProps}
        projects={shuffledProjects}
        sessions={[]}
        sortConfig={[{ field: 'path', direction: 'asc' }]}
      />
    );
    expectTextOrder(container, ['aaa-project', 'bbb-project', 'ccc-project']);
  });

  it('文件夹按 path 降序排列', () => {
    const { container } = render(
      <ProjectList
        {...defaultProps}
        projects={shuffledProjects}
        sessions={[]}
        sortConfig={[{ field: 'path', direction: 'desc' }]}
      />
    );
    expectTextOrder(container, ['ccc-project', 'bbb-project', 'aaa-project']);
  });

  it('文件夹按 name 排序', () => {
    const { container } = render(
      <ProjectList
        {...defaultProps}
        projects={shuffledProjects}
        sessions={[]}
        sortConfig={[{ field: 'name', direction: 'asc' }]}
      />
    );
    expectTextOrder(container, ['aaa-project', 'bbb-project', 'ccc-project']);
  });

  it('文件夹按 sessionCount 降序排列', () => {
    const { container } = render(
      <ProjectList
        {...defaultProps}
        projects={shuffledProjects}
        sessions={[]}
        sortConfig={[{ field: 'messageCount', direction: 'desc' }]}
      />
    );
    // sessionCount: aaa=10, ccc=5, bbb=1
    expectTextOrder(container, ['aaa-project', 'ccc-project', 'bbb-project']);
  });

  it('文件夹按 time 升序排列（最早优先）', () => {
    const { container } = render(
      <ProjectList
        {...defaultProps}
        projects={shuffledProjects}
        sessions={[]}
        sortConfig={[{ field: 'time', direction: 'asc' }]}
      />
    );
    // lastActivity: ccc=06-08, bbb=06-09, aaa=06-10
    expectTextOrder(container, ['ccc-project', 'bbb-project', 'aaa-project']);
  });

  it('文件夹按 agent 排序', () => {
    const { container } = render(
      <ProjectList
        {...defaultProps}
        projects={shuffledProjects}
        sessions={[]}
        sortConfig={[{ field: 'agent', direction: 'asc' }]}
      />
    );
    // asc: claude_code before openclaw
    // claude_code: aaa, bbb; openclaw: ccc
    const fullText = container.textContent || '';
    const aaaIdx = fullText.indexOf('aaa-project');
    const cccIdx = fullText.indexOf('ccc-project');
    // claude_code 工作目录应该在 openclaw 之前
    expect(aaaIdx).toBeLessThan(cccIdx);
  });

  it('空 sortConfig 保留原顺序', () => {
    // 用某种排序后再传空配置，应保留文件夹的原始输入顺序
    const { container } = render(
      <ProjectList
        {...defaultProps}
        projects={shuffledProjects}
        sessions={[]}
        sortConfig={[]}
      />
    );
    expectTextOrder(container, ['ccc-project', 'aaa-project', 'bbb-project']);
  });

  it('多级排序：先按 agent 升序，再按 path 升序', () => {
    // agent 相同(claude_code)的 aaa 和 bbb 按 path 二级排序
    const { container } = render(
      <ProjectList
        {...defaultProps}
        projects={shuffledProjects}
        sessions={[]}
        sortConfig={[
          { field: 'agent', direction: 'asc' },
          { field: 'path', direction: 'asc' },
        ]}
      />
    );
    // claude_code: aaa, bbb (按 path); openclaw: ccc
    expectTextOrder(container, ['aaa-project', 'bbb-project', 'ccc-project']);
  });
});
