import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionItem } from '../../components/sessions/SessionItem';

// Mock settingsStore 提供默认配色
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

// Mock tauri utils
const mockedOpenContainingFolder = vi.fn();
const mockedOpenProjectFolder = vi.fn();

vi.mock('../../utils/tauri', () => ({
  openContainingFolder: (...args: unknown[]) => mockedOpenContainingFolder(...args),
  openProjectFolder: (...args: unknown[]) => mockedOpenProjectFolder(...args),
}));

describe('SessionItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockSession = {
    id: 'test-session',
    projectName: 'test-project',
    projectPath: '/test/project',
    display: 'Hello, this is a test message',
    timestamp: '2026-06-09T10:00:00Z',
    messageCount: 15,
    fileSize: 1024,
    cwd: '/test',
    filePath: '/test/session.jsonl',
    providerName: 'claude_code',
  };

  it('渲染会话标题', () => {
    render(
      <SessionItem
        session={mockSession}
        isSelected={false}
        onClick={() => {}}
      />
    );
    expect(
      screen.getByText('Hello, this is a test message')
    ).toBeInTheDocument();
  });

  it('渲染消息数量', () => {
    render(
      <SessionItem
        session={mockSession}
        isSelected={false}
        onClick={() => {}}
      />
    );
    expect(screen.getByText(/15 条消息/)).toBeInTheDocument();
  });

  it('showProject=true 时显示工作目录名', () => {
    render(
      <SessionItem
        session={mockSession}
        isSelected={false}
        showProject={true}
        onClick={() => {}}
      />
    );
    expect(screen.getByText(/test-project/)).toBeInTheDocument();
  });

  it('显示 Agent 标签', () => {
    render(
      <SessionItem
        session={mockSession}
        isSelected={false}
        showProvider={true}
        onClick={() => {}}
      />
    );
    expect(screen.getByText('Claude')).toBeInTheDocument();
  });

  it('点击触发 onClick', () => {
    const onClick = vi.fn();
    render(
      <SessionItem
        session={mockSession}
        isSelected={false}
        onClick={onClick}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('高亮搜索词', () => {
    render(
      <SessionItem
        session={mockSession}
        isSelected={false}
        highlight="test"
        onClick={() => {}}
      />
    );
    const marks = document.querySelectorAll('mark');
    expect(marks.length).toBeGreaterThan(0);
  });

  // ============================================================
  // 右键菜单 — 打开工作目录 (cwd 优先)
  // ============================================================

  it('右键菜单：打开工作目录 使用 cwd', () => {
    render(
      <SessionItem
        session={mockSession}
        isSelected={false}
        onClick={() => {}}
      />
    );

    fireEvent.contextMenu(screen.getByRole('button'));
    const menuItem = screen.getByText('打开工作目录');
    fireEvent.click(menuItem);

    // cwd 存在时优先使用
    expect(mockedOpenProjectFolder).toHaveBeenCalledWith('/test');
  });

  it('右键菜单：打开工作目录 在 cwd 为空时回退到 projectPath', () => {
    const sessionNoCwd = { ...mockSession, cwd: '' };

    render(
      <SessionItem
        session={sessionNoCwd}
        isSelected={false}
        onClick={() => {}}
      />
    );

    fireEvent.contextMenu(screen.getByRole('button'));
    const menuItem = screen.getByText('打开工作目录');
    fireEvent.click(menuItem);

    // 回退到 projectPath
    expect(mockedOpenProjectFolder).toHaveBeenCalledWith('/test/project');
  });

  it('右键菜单：打开所在文件夹 打开包含文件的文件夹', () => {
    render(
      <SessionItem
        session={mockSession}
        isSelected={false}
        onClick={() => {}}
      />
    );

    fireEvent.contextMenu(screen.getByRole('button'));
    const menuItem = screen.getByText('打开所在文件夹');
    fireEvent.click(menuItem);

    expect(mockedOpenContainingFolder).toHaveBeenCalledWith(
      '/test/session.jsonl'
    );
  });

  it('右键菜单：包含所有菜单项', () => {
    render(
      <SessionItem
        session={mockSession}
        isSelected={false}
        onClick={() => {}}
      />
    );

    fireEvent.contextMenu(screen.getByRole('button'));

    expect(screen.getByText('打开所在文件夹')).toBeInTheDocument();
    expect(screen.getByText('打开工作目录')).toBeInTheDocument();
    expect(screen.getByText('复制文件路径')).toBeInTheDocument();
    expect(screen.getByText('复制会话 ID')).toBeInTheDocument();
  });

  it('右键菜单：点击外部关闭菜单', () => {
    render(
      <SessionItem
        session={mockSession}
        isSelected={false}
        onClick={() => {}}
      />
    );

    fireEvent.contextMenu(screen.getByRole('button'));
    expect(screen.getByText('打开工作目录')).toBeInTheDocument();

    // 点击外部 → 菜单关闭
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('打开工作目录')).not.toBeInTheDocument();
  });
});
