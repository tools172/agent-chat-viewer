import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TabBar } from '../../components/tabs/TabBar';
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
  const id = overrides.id || `tab-${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    sessionPath: `/test/${id}.jsonl`,
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
    title: `Session ${id.slice(-4)}`,
    pinned: false,
    ...overrides,
  };
}

describe('TabBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('无标签时不渲染', () => {
    const { container } = render(
      <TabBar
        tabs={[]}
        activeTabId={null}
        onActivateTab={vi.fn()}
        onCloseTab={vi.fn()}
        onMoveTab={vi.fn()}
        onOpenContextMenu={vi.fn()}
      />
    );
    expect(container.innerHTML).toBe('');
  });

  it('渲染所有标签', () => {
    const tabs = [
      makeTab({ id: 'tab-1', title: 'First' }),
      makeTab({ id: 'tab-2', title: 'Second' }),
      makeTab({ id: 'tab-3', title: 'Third' }),
    ];

    render(
      <TabBar
        tabs={tabs}
        activeTabId="tab-2"
        onActivateTab={vi.fn()}
        onCloseTab={vi.fn()}
        onMoveTab={vi.fn()}
        onOpenContextMenu={vi.fn()}
      />
    );

    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(screen.getByText('Third')).toBeInTheDocument();
  });

  it('点击标签触发 onActivateTab', () => {
    const onActivate = vi.fn();
    render(
      <TabBar
        tabs={[makeTab({ id: 'tab-1', title: 'My Session' })]}
        activeTabId={null}
        onActivateTab={onActivate}
        onCloseTab={vi.fn()}
        onMoveTab={vi.fn()}
        onOpenContextMenu={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('My Session'));
    expect(onActivate).toHaveBeenCalledWith('tab-1');
  });

  it('点击关闭按钮触发 onCloseTab', () => {
    const onClose = vi.fn();
    render(
      <TabBar
        tabs={[makeTab({ id: 'tab-1', title: 'My Session' })]}
        activeTabId="tab-1"
        onActivateTab={vi.fn()}
        onCloseTab={onClose}
        onMoveTab={vi.fn()}
        onOpenContextMenu={vi.fn()}
      />
    );

    const closeBtn = document.querySelector('button[title="关闭标签页"]');
    fireEvent.click(closeBtn!);
    expect(onClose).toHaveBeenCalledWith('tab-1');
  });

  it('右键菜单触发 onOpenContextMenu', () => {
    const onContextMenu = vi.fn();
    render(
      <TabBar
        tabs={[makeTab({ id: 'tab-1', title: 'My Session' })]}
        activeTabId="tab-1"
        onActivateTab={vi.fn()}
        onCloseTab={vi.fn()}
        onMoveTab={vi.fn()}
        onOpenContextMenu={onContextMenu}
      />
    );

    fireEvent.contextMenu(screen.getByText('My Session'));
    expect(onContextMenu).toHaveBeenCalledTimes(1);
  });

  it('拖拽触发 onMoveTab', () => {
    const onMove = vi.fn();
    const tabs = [
      makeTab({ id: 'tab-1', title: 'First' }),
      makeTab({ id: 'tab-2', title: 'Second' }),
      makeTab({ id: 'tab-3', title: 'Third' }),
    ];

    const { container } = render(
      <TabBar
        tabs={tabs}
        activeTabId="tab-1"
        onActivateTab={vi.fn()}
        onCloseTab={vi.fn()}
        onMoveTab={onMove}
        onOpenContextMenu={vi.fn()}
      />
    );

    const tabItems = container.querySelectorAll('[draggable="true"]');
    expect(tabItems.length).toBe(3);

    fireEvent.dragStart(tabItems[0]);
    fireEvent.drop(tabItems[2]);
    expect(onMove).toHaveBeenCalled();
  });
});
