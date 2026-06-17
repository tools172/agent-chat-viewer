import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TabItem } from '../../components/tabs/TabItem';
import type { TabState } from '../../types';

// Mock settingsStore
vi.mock('../../stores/settingsStore', () => ({
  useSettingsStore: vi.fn((selector) => {
    const state = {
      settings: {
        searchColors: { search: '#fef08a', find: '#fed7aa' },
        watchDirectories: [],
        defaultFilter: {
          showThinking: false,
          showToolCalls: true,
          showToolResults: true,
          hideEmptyToolResults: true,
          showSystemMessages: false,
          showFileSnapshots: false,
        },
        providerEnabled: {},
      },
    };
    return selector ? selector(state) : state;
  }),
}));

function makeTab(overrides: Partial<TabState> = {}): TabState {
  return {
    id: 'tab-1',
    sessionPath: '/test/session.jsonl',
    providerName: 'claude_code',
    sessionDetail: null,
    isLoading: false,
    error: null,
    filter: {
      showThinking: false,
      showToolCalls: true,
      showToolResults: true,
      hideEmptyToolResults: true,
      showSystemMessages: false,
      showFileSnapshots: false,
    },
    showFindBar: false,
    searchHighlight: undefined,
    scrollTop: 0,
    expandedThinking: [],
    expandedToolCalls: [],
    expandedToolResults: [],
    title: 'Test Session',
    pinned: false,
    ...overrides,
  };
}

describe('TabItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('渲染标签标题', () => {
    render(
      <TabItem
        tab={makeTab()}
        isActive={false}
        index={0}
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onContextMenu={vi.fn()}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
      />
    );
    expect(screen.getByText('Test Session')).toBeInTheDocument();
  });

  it('渲染 Provider 色点', () => {
    const { container } = render(
      <TabItem
        tab={makeTab()}
        isActive={false}
        index={0}
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onContextMenu={vi.fn()}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
      />
    );
    // 色点是 span.w-2\\.5.h-2\\.5.rounded-full
    const dots = container.querySelectorAll('span.w-2\\.5.h-2\\.5.rounded-full');
    expect(dots.length).toBe(1);
  });

  it('点击触发 onActivate', () => {
    const onActivate = vi.fn();
    render(
      <TabItem
        tab={makeTab()}
        isActive={false}
        index={0}
        onActivate={onActivate}
        onClose={vi.fn()}
        onContextMenu={vi.fn()}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Test Session').closest('div')!);
    expect(onActivate).toHaveBeenCalledWith('tab-1');
  });

  it('中键点击触发 onClose', () => {
    const onClose = vi.fn();
    render(
      <TabItem
        tab={makeTab()}
        isActive={false}
        index={0}
        onActivate={vi.fn()}
        onClose={onClose}
        onContextMenu={vi.fn()}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
      />
    );
    fireEvent.mouseDown(screen.getByText('Test Session').closest('div')!, {
      button: 1,
    });
    expect(onClose).toHaveBeenCalledWith('tab-1');
  });

  it('普通左键点击不触发 onClose', () => {
    const onClose = vi.fn();
    render(
      <TabItem
        tab={makeTab()}
        isActive={false}
        index={0}
        onActivate={vi.fn()}
        onClose={onClose}
        onContextMenu={vi.fn()}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
      />
    );
    fireEvent.mouseDown(screen.getByText('Test Session').closest('div')!, {
      button: 0,
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('关闭按钮点击触发 onClose（阻止冒泡）', () => {
    const onClose = vi.fn();
    const onActivate = vi.fn();
    render(
      <TabItem
        tab={makeTab()}
        isActive={false}
        index={0}
        onActivate={onActivate}
        onClose={onClose}
        onContextMenu={vi.fn()}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
      />
    );
    // 点击关闭按钮（SVG 的父级 button）
    const closeBtn = document.querySelector('button[title="关闭标签页"]');
    expect(closeBtn).not.toBeNull();
    fireEvent.click(closeBtn!);
    expect(onClose).toHaveBeenCalledWith('tab-1');
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('显示 loading spinner 当 isLoading=true', () => {
    const { container } = render(
      <TabItem
        tab={makeTab({ isLoading: true })}
        isActive={false}
        index={0}
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onContextMenu={vi.fn()}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
      />
    );
    // Loading spinner has animate-spin class
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).not.toBeNull();
  });

  it('显示 pin 图标当 pinned=true', () => {
    const { container } = render(
      <TabItem
        tab={makeTab({ pinned: true })}
        isActive={false}
        index={0}
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onContextMenu={vi.fn()}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
      />
    );
    // Pin 图标是 lucide Pin svg icon（text-amber-500）
    const pinIcon = container.querySelector('.text-amber-500');
    expect(pinIcon).not.toBeNull();
  });

  it('错误标签显示删除线样式', () => {
    const { container } = render(
      <TabItem
        tab={makeTab({ error: 'Load failed' })}
        isActive={false}
        index={0}
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onContextMenu={vi.fn()}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
      />
    );
    const title = screen.getByText('Test Session');
    expect(title.className).toContain('line-through');
    // 错误标签有红色文字
    expect(container.querySelector('.text-red-600')).not.toBeNull();
  });

  it('右键菜单触发 onContextMenu', () => {
    const onContextMenu = vi.fn();
    render(
      <TabItem
        tab={makeTab()}
        isActive={false}
        index={0}
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onContextMenu={onContextMenu}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
      />
    );
    fireEvent.contextMenu(screen.getByText('Test Session').closest('div')!);
    expect(onContextMenu).toHaveBeenCalledTimes(1);
  });

  it('拖拽事件传递 index', () => {
    const onDragStart = vi.fn();
    render(
      <TabItem
        tab={makeTab()}
        isActive={false}
        index={3}
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onContextMenu={vi.fn()}
        onDragStart={onDragStart}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
      />
    );
    const el = screen.getByText('Test Session').closest('div')!;
    fireEvent.dragStart(el);
    expect(onDragStart).toHaveBeenCalledWith(
      expect.any(Object),
      3
    );
  });
});
