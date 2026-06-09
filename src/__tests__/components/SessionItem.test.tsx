import { describe, it, expect, vi } from 'vitest';
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

describe('SessionItem', () => {
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

  it('showProject=true 时显示项目名', () => {
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
});
