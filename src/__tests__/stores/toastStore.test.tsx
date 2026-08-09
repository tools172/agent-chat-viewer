import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastContainer, useToastStore } from '../../stores/toastStore';

/**
 * 连同 rAF 一起使用假定时器，避免入场动画的 rAF 回调在 act 之外触发 setState 告警。
 */
function useFakeTimers() {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'Date',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  });
}

describe('ToastContainer', () => {
  beforeEach(() => {
    act(() => {
      useToastStore.getState().dismissAll();
    });
  });

  afterEach(() => {
    // ToastContainer 此时仍挂载，需在 act 中清空以免触发未包裹的 re-render 告警
    act(() => {
      useToastStore.getState().dismissAll();
    });
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('error 变体默认停留 10 秒，info 默认 2.5 秒', () => {
    useFakeTimers();
    render(<ToastContainer />);

    act(() => {
      useToastStore.getState().showToast('错误提示', { variant: 'error' });
    });
    const errorToast = useToastStore.getState().toasts[0];
    expect(errorToast.expiresAt - Date.now()).toBe(10000);

    act(() => {
      useToastStore.getState().showToast('普通提示');
    });
    const infoToast = useToastStore.getState().toasts[1];
    expect(infoToast.expiresAt - Date.now()).toBe(2500);
  });

  it('info 提示到时自动消失', () => {
    useFakeTimers();
    render(<ToastContainer />);
    act(() => {
      useToastStore.getState().showToast('短提示');
    });
    expect(screen.getByText('短提示')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(screen.queryByText('短提示')).not.toBeInTheDocument();
  });

  it('点击 Toast 外部立即隐藏所有提示', () => {
    useFakeTimers();
    render(<ToastContainer />);
    act(() => {
      useToastStore.getState().showToast('提示A');
      useToastStore.getState().showToast('提示B');
    });
    expect(screen.getByText('提示A')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByText('提示A')).not.toBeInTheDocument();
    expect(screen.queryByText('提示B')).not.toBeInTheDocument();
  });

  it('点击 Toast 本身不会触发隐藏', () => {
    useFakeTimers();
    render(<ToastContainer />);
    act(() => {
      useToastStore.getState().showToast('不可隐藏提示', { copyable: true });
    });
    const el = screen.getByTestId('toast-card');

    fireEvent.mouseDown(el);

    expect(screen.getByText('不可隐藏提示')).toBeInTheDocument();
  });

  it('鼠标悬停暂停自动消失计时，移开后立即隐藏（已过期）', () => {
    useFakeTimers();
    render(<ToastContainer />);
    act(() => {
      useToastStore
        .getState()
        .showToast('悬停提示', { variant: 'error', copyable: true });
    });
    const el = screen.getByTestId('toast-card');

    // 悬停 → 即使超过原定 10 秒也不消失
    fireEvent.mouseEnter(el);
    act(() => {
      vi.advanceTimersByTime(12000);
    });
    expect(screen.getByText('悬停提示')).toBeInTheDocument();

    // 移开 → 已过期，立即消失
    act(() => {
      fireEvent.mouseLeave(el);
    });
    expect(screen.queryByText('悬停提示')).not.toBeInTheDocument();
  });

  it('只有点击复制图标才复制，点击文本内容不触发复制', async () => {
    useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText },
    });

    render(<ToastContainer />);
    act(() => {
      useToastStore.getState().showToast('可复制的路径', {
        copyable: true,
      });
    });

    // 点击文本内容 → 不复制
    fireEvent.click(screen.getByText('可复制的路径'));
    expect(writeText).not.toHaveBeenCalled();

    // 点击复制图标 → 复制完整信息
    fireEvent.click(screen.getByText('复制'));
    expect(writeText).toHaveBeenCalledWith('可复制的路径');
  });
});
