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

  it('渲染所有项目', () => {
    render(<ProjectList {...defaultProps} />);
    expect(screen.getByText('project-a')).toBeInTheDocument();
    expect(screen.getByText('project-b')).toBeInTheDocument();
  });

  it('显示每个项目的会话数量', () => {
    render(<ProjectList {...defaultProps} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('选中项目高亮', () => {
    render(
      <ProjectList {...defaultProps} selectedProjectPath="/data/project-a" />
    );
    const btn = screen.getByText('project-a').closest('button');
    expect(btn?.className).toContain('primary');
  });

  // ============================================================
  // 右键菜单 — 打开项目文件夹（cwd 查找）
  // ============================================================

  it('右键菜单：打开项目文件夹 使用 allSessions 中的 cwd', async () => {
    const allSessions = [
      { id: 's1', projectName: 'project-a', projectPath: '/data/project-a', display: '', timestamp: '', messageCount: 1, fileSize: 0, cwd: '/real/project-a', filePath: '/data/project-a/s.jsonl', providerName: 'claude_code' },
    ];

    render(
      <ProjectList {...defaultProps} sessions={[]} allSessions={allSessions} />
    );

    // 右键点击项目
    const projectBtn = screen.getByText('project-a').closest('button')!;
    fireEvent.contextMenu(projectBtn);

    // 点击"打开项目文件夹"
    const menuItem = screen.getByText('打开项目文件夹');
    fireEvent.click(menuItem);

    // 应使用 cwd 而非 project.path
    expect(mockedOpenProjectFolder).toHaveBeenCalledWith('/real/project-a');
  });

  it('右键菜单：打开项目文件夹 在 cwd 为空时回退到 project.path', async () => {
    // project-b 的 session 没有 cwd
    const allSessions = [
      { id: 's3', projectName: 'project-b', projectPath: '/data/project-b', display: '', timestamp: '', messageCount: 1, fileSize: 0, cwd: '', filePath: '/data/project-b/s.jsonl', providerName: 'claude_code' },
    ];

    render(
      <ProjectList {...defaultProps} sessions={[]} allSessions={allSessions} />
    );

    const projectBtn = screen.getByText('project-b').closest('button')!;
    fireEvent.contextMenu(projectBtn);

    const menuItem = screen.getByText('打开项目文件夹');
    fireEvent.click(menuItem);

    // 回退到 project.path
    expect(mockedOpenProjectFolder).toHaveBeenCalledWith('/data/project-b');
  });

  it('右键菜单：打开项目文件夹 无 allSessions 时回退到 project.path', async () => {
    render(
      <ProjectList {...defaultProps} sessions={[]} />
    );

    const projectBtn = screen.getByText('project-a').closest('button')!;
    fireEvent.contextMenu(projectBtn);

    const menuItem = screen.getByText('打开项目文件夹');
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

  it('点击项目触发 onSelectProject', () => {
    const onSelectProject = vi.fn();
    render(
      <ProjectList {...defaultProps} onSelectProject={onSelectProject} />
    );

    fireEvent.click(screen.getByText('project-a'));
    expect(onSelectProject).toHaveBeenCalledWith('/data/project-a', 'claude_code');
  });

  it('点击项目展开/折叠子会话列表', () => {
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
});
