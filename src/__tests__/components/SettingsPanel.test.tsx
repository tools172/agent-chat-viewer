import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPanel } from '../../components/settings/SettingsPanel';

const mockStore = {
  settings: {
    watchDirectories: ['/test/dir'],
    defaultFilter: {
      showThinking: false,
      showToolCalls: true,
      showToolResults: true,
      hideEmptyToolResults: true,
      showSystemMessages: false,
      showFileSnapshots: false,
    },
    providerEnabled: { claude_code: true, openclaw: false },
    searchColors: { search: '#fef08a', find: '#fed7aa' },
  },
  updateFilter: vi.fn(),
  updateSearchColors: vi.fn(),
  resetSearchColors: vi.fn(),
  resetFilter: vi.fn(),
  addWatchDirectory: vi.fn(),
  removeWatchDirectory: vi.fn(),
  toggleProvider: vi.fn(),
  save: vi.fn(),
};

vi.mock('../../stores/settingsStore', () => ({
  useSettingsStore: vi.fn(() => mockStore),
}));

describe('SettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('渲染设置面板标题和所有设置区域', () => {
    render(<SettingsPanel onClose={vi.fn()} />);

    expect(screen.getByRole('heading', { name: /设置/ })).toBeInTheDocument();
    expect(screen.getByText(/监控目录/)).toBeInTheDocument();
    expect(screen.getByText(/搜索高亮配色/)).toBeInTheDocument();
    expect(screen.getByText(/默认过滤器/)).toBeInTheDocument();
    expect(screen.getByText(/Agent 支持/)).toBeInTheDocument();
  });

  it('渲染操作按钮', () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    expect(screen.getByText('恢复默认配色')).toBeInTheDocument();
    expect(screen.getByText('保存设置')).toBeInTheDocument();
  });

  it('点击关闭按钮触发 onClose', () => {
    const onClose = vi.fn();
    render(<SettingsPanel onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('输入目录并点击添加', () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('输入目录路径...'), {
      target: { value: '/new/dir' },
    });
    fireEvent.click(screen.getByText('添加'));
    expect(mockStore.addWatchDirectory).toHaveBeenCalledWith('/new/dir');
  });

  it('恢复默认配色', () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('恢复默认配色'));
    expect(mockStore.resetSearchColors).toHaveBeenCalledTimes(1);
  });

  it('保存设置', () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('保存设置'));
    expect(mockStore.save).toHaveBeenCalledTimes(1);
  });
});
