import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterBar } from '../../components/filter/FilterBar';
import type { FilterConfig } from '../../types';

function makeFilter(overrides: Partial<FilterConfig> = {}): FilterConfig {
  return {
    showThinking: false,
    showToolCalls: true,
    showToolResults: true,
    hideEmptyToolResults: true,
    showSystemMessages: false,
    showFileSnapshots: false,
    ...overrides,
  };
}

describe('FilterBar', () => {
  // ======================== 渲染测试 ========================

  it('渲染全部 5 个过滤按钮', () => {
    const onChange = vi.fn();
    render(<FilterBar filter={makeFilter()} onChange={onChange} />);

    expect(screen.getByText('思考')).toBeInTheDocument();
    expect(screen.getByText('工具调用')).toBeInTheDocument();
    expect(screen.getByText('工具结果')).toBeInTheDocument();
    expect(screen.getByText('隐藏空结果')).toBeInTheDocument();
    expect(screen.getByText('合并连发')).toBeInTheDocument();
  });

  it('思考按钮默认关闭状态', () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        filter={makeFilter({ showThinking: false })}
        onChange={onChange}
      />
    );

    const btn = screen.getByText('思考').closest('button')!;
    // 关闭时 showThinking=false → enabled=false → 灰色样式
    expect(btn.className).toContain('bg-gray-100');
    expect(btn.className).not.toContain('bg-primary');
  });

  it('工具调用默认开启状态', () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        filter={makeFilter({ showToolCalls: true })}
        onChange={onChange}
      />
    );

    const btn = screen.getByText('工具调用').closest('button')!;
    expect(btn.className).toContain('bg-primary');
    expect(btn.className).not.toContain('bg-gray-100');
  });

  it('隐藏空结果默认开启状态', () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        filter={makeFilter({ hideEmptyToolResults: true })}
        onChange={onChange}
      />
    );

    const btn = screen.getByText('隐藏空结果').closest('button')!;
    expect(btn.className).toContain('bg-amber-100');
  });

  // ======================== 合并连发 ========================

  it('合并连发默认关闭状态', () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        filter={makeFilter({ collapseConsecutive: false })}
        onChange={onChange}
      />
    );

    const btn = screen.getByText('合并连发').closest('button')!;
    // 关闭时 collapseConsecutive=false → 灰色样式
    expect(btn.className).toContain('bg-gray-100');
    expect(btn.className).not.toContain('bg-primary');
  });

  it('合并连发开启状态', () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        filter={makeFilter({ collapseConsecutive: true })}
        onChange={onChange}
      />
    );

    const btn = screen.getByText('合并连发').closest('button')!;
    expect(btn.className).toContain('bg-primary');
    expect(btn.className).not.toContain('bg-gray-100');
  });

  // ======================== 交互测试 ========================

  it('点击思考按钮 → onChange({ showThinking: true })', () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        filter={makeFilter({ showThinking: false })}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByText('思考'));
    expect(onChange).toHaveBeenCalledWith({ showThinking: true });
  });

  it('再次点击思考按钮 → onChange({ showThinking: false })', () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        filter={makeFilter({ showThinking: true })}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByText('思考'));
    expect(onChange).toHaveBeenCalledWith({ showThinking: false });
  });

  it('点击工具调用按钮 → onChange({ showToolCalls: false })', () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        filter={makeFilter({ showToolCalls: true })}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByText('工具调用'));
    expect(onChange).toHaveBeenCalledWith({ showToolCalls: false });
  });

  it('点击工具结果按钮 → onChange({ showToolResults: false })', () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        filter={makeFilter({ showToolResults: true })}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByText('工具结果'));
    expect(onChange).toHaveBeenCalledWith({ showToolResults: false });
  });

  it('点击隐藏空结果按钮 → onChange({ hideEmptyToolResults: false })', () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        filter={makeFilter({ hideEmptyToolResults: true })}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByText('隐藏空结果'));
    expect(onChange).toHaveBeenCalledWith({
      hideEmptyToolResults: false,
    });
  });

  it('点击合并连发按钮 → onChange({ collapseConsecutive: true })', () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        filter={makeFilter({ collapseConsecutive: false })}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByText('合并连发'));
    expect(onChange).toHaveBeenCalledWith({ collapseConsecutive: true });
  });

  it('再次点击合并连发按钮 → onChange({ collapseConsecutive: false })', () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        filter={makeFilter({ collapseConsecutive: true })}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByText('合并连发'));
    expect(onChange).toHaveBeenCalledWith({ collapseConsecutive: false });
  });

  it('连续操作：依次切换 5 个按钮', () => {
    const calls: Partial<FilterConfig>[] = [];
    const onChange = vi.fn().mockImplementation(
      (partial: Partial<FilterConfig>) => calls.push(partial),
    );

    render(<FilterBar filter={makeFilter()} onChange={onChange} />);

    fireEvent.click(screen.getByText('思考'));
    fireEvent.click(screen.getByText('工具调用'));
    fireEvent.click(screen.getByText('工具结果'));
    fireEvent.click(screen.getByText('隐藏空结果'));
    fireEvent.click(screen.getByText('合并连发'));

    expect(calls).toEqual([
      { showThinking: true },
      { showToolCalls: false },
      { showToolResults: false },
      { hideEmptyToolResults: false },
      { collapseConsecutive: true },
    ]);
  });
});
