import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DockablePanel } from '../../components/common/DockablePanel';

// jsdom 不提供 PointerEvent，此处补一个最小实现以便 fireEvent.pointer* 生效
if (!window.PointerEvent) {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    pointerType: string;
    isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? 'mouse';
      this.isPrimary = init.isPrimary ?? true;
    }
  }
  // @ts-expect-error 测试环境补丁
  window.PointerEvent = PointerEventPolyfill;
}

describe('DockablePanel', () => {
  const defaultProps = {
    offset: 1 as number | null, // 比例 1 = 停靠右侧（可用空间 1024-384=640 → 640px）
    opacity: 0.85,
    onOffsetChange: vi.fn(),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** 头部手柄：唯一带 cursor-grab 的元素 */
  const getHandle = () => document.querySelector('.cursor-grab') as Element;

  /** 滑板容器：带 panel-glass class */
  const getPanel = () => document.querySelector('.panel-glass') as HTMLElement;

  const renderPanel = () =>
    render(
      <DockablePanel {...defaultProps} title="设置">
        设置内容
      </DockablePanel>
    );

  it('渲染标题与内容，头部可作为拖拽手柄', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: /设置/ })).toBeInTheDocument();
    expect(screen.getByText('设置内容')).toBeInTheDocument();
    expect(getHandle()).not.toBeNull();
  });

  it('点击背景遮罩触发 onClose', () => {
    renderPanel();
    const backdrop = document.querySelector('.fixed.inset-0');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('按 Esc 触发 onClose', () => {
    renderPanel();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  /** 有状态 wrapper：onOffsetChange 真实回写偏移（比例），用于验证松手后停留在任意位置 */
  const renderStateful = (initial = 1) => {
    const Harness = () => {
      const [offset, setOffset] = useState<number | null>(initial);
      return (
        <DockablePanel offset={offset} opacity={0.85} onOffsetChange={setOffset} onClose={() => {}} title="设置">
          设置内容
        </DockablePanel>
      );
    };
    return render(<Harness />);
  };

  it('拖动后停留在任意位置，并把偏移持久化', () => {
    renderStateful();
    // 从右侧(偏移640)向左拖到偏移 240
    fireEvent.pointerDown(getHandle(), { button: 0, pointerId: 1, clientX: 600 });
    fireEvent.pointerMove(getHandle(), { pointerId: 1, clientX: 200 });
    fireEvent.pointerUp(getHandle(), { pointerId: 1 });
    // 松手后 transform 停在 240，而非吸附回某一边
    expect(getPanel().style.transform).toBe('translateX(240px)');
  });

  it('中间位置松手后不吸附（停留原处）', () => {
    renderStateful();
    fireEvent.pointerDown(getHandle(), { button: 0, pointerId: 1, clientX: 600 });
    fireEvent.pointerMove(getHandle(), { pointerId: 1, clientX: 500 }); // 偏移 540，处于中间
    fireEvent.pointerUp(getHandle(), { pointerId: 1 });
    expect(getPanel().style.transform).toBe('translateX(540px)');
  });

  it('超出左右边界时偏移被钳制在 0 ~ (视口-宽度)', () => {
    renderStateful();
    // 向左拖出边界 → 钳制为 0
    fireEvent.pointerDown(getHandle(), { button: 0, pointerId: 1, clientX: 600 });
    fireEvent.pointerMove(getHandle(), { pointerId: 1, clientX: -600 });
    fireEvent.pointerUp(getHandle(), { pointerId: 1 });
    expect(getPanel().style.transform).toBe('translateX(0px)');
  });

  it('窗口缩放后按比例保持位置（最大化不跑到中间）', () => {
    renderStateful(0.5); // 视口 1024，可用空间 640 → 面板在 320px
    const original = window.innerWidth;
    // 模拟最大化：视口宽度 1024 → 1920
    Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
    fireEvent(window, new Event('resize'));
    // 可用空间 1920-384=1536，0.5 比例 → 768px（位置相对比例不变）
    expect(getPanel().style.transform).toBe('translateX(768px)');
    Object.defineProperty(window, 'innerWidth', { value: original, configurable: true });
  });

  it('背景为纯 rgba 真透明（无毛玻璃模糊，拖动与静止外观一致）', () => {
    renderPanel();
    expect(getPanel().className).toContain('panel-glass');
    expect(getPanel().className).not.toContain('panel-glass-blur');

    fireEvent.pointerDown(getHandle(), { button: 0, pointerId: 1, clientX: 600 });
    expect(getPanel().className).not.toContain('panel-glass-blur');

    fireEvent.pointerUp(getHandle(), { pointerId: 1 });
    expect(getPanel().className).not.toContain('panel-glass-blur');
  });

  it('把不透明度注入 CSS 变量', () => {
    render(
      <DockablePanel {...defaultProps} opacity={0.5}>
        x
      </DockablePanel>
    );
    expect(getPanel().style.getPropertyValue('--panel-opacity')).toBe('0.5');
  });

  it('glass 开启时叠加毛玻璃模糊类，默认关闭', () => {
    render(
      <DockablePanel {...defaultProps} glass>
        x
      </DockablePanel>
    );
    expect(getPanel().className).toContain('panel-glass-blur');

    // 默认（未传 glass）不叠加模糊类
    renderPanel();
    const panels = document.querySelectorAll('.panel-glass');
    const last = panels[panels.length - 1] as HTMLElement;
    expect(last.className).not.toContain('panel-glass-blur');
  });

  it('拖动时临时移除毛玻璃并增大透明度，松手恢复', () => {
    render(
      <DockablePanel {...defaultProps} glass opacity={0.8}>
        x
      </DockablePanel>
    );
    const panel = getPanel();
    // 静止：毛玻璃模糊类存在，不透明度为静止值 0.8
    expect(panel.className).toContain('panel-glass-blur');
    expect(panel.style.getPropertyValue('--panel-opacity')).toBe('0.8');

    fireEvent.pointerDown(getHandle(), { button: 0, pointerId: 1, clientX: 600 });
    fireEvent.pointerMove(getHandle(), { pointerId: 1, clientX: 500 });
    // 拖动中：模糊类移除、不透明度变为拖动值 0.4（更透明）
    expect(panel.className).not.toContain('panel-glass-blur');
    expect(panel.style.getPropertyValue('--panel-opacity')).toBe('0.4');

    fireEvent.pointerUp(getHandle(), { pointerId: 1 });
    // 松手：模糊类与静止不透明度恢复
    expect(panel.className).toContain('panel-glass-blur');
    expect(panel.style.getPropertyValue('--panel-opacity')).toBe('0.8');
  });

  it('提供 anchorX 时，上次位置更靠近左侧锚点 → 吸附左侧锚点', () => {
    render(
      <DockablePanel {...defaultProps} offset={0.4} anchorX={320}>
        x
      </DockablePanel>
    );
    // rawX = 0.4×640 = 256；距右侧 640 为 384，距左侧锚点 320 为 64 → 吸附 320
    expect(getPanel().style.transform).toBe('translateX(320px)');
    // 吸附位写回持久化（320/640 = 0.5）
    expect(defaultProps.onOffsetChange).toHaveBeenCalledWith(0.5);
  });

  it('提供 anchorX 时，上次位置更靠近右侧 → 吸附右侧边缘', () => {
    render(
      <DockablePanel {...defaultProps} offset={0.9} anchorX={320}>
        x
      </DockablePanel>
    );
    // rawX = 0.9×640 = 576；距右侧 64，距左侧锚点 320 为 256 → 吸附 640
    expect(getPanel().style.transform).toBe('translateX(640px)');
    expect(defaultProps.onOffsetChange).toHaveBeenCalledWith(1);
  });

  it('不传 anchorX 时保持持久化比例位置，不吸附', () => {
    render(
      <DockablePanel {...defaultProps} offset={0.5}>
        x
      </DockablePanel>
    );
    expect(getPanel().style.transform).toBe('translateX(320px)');
    expect(defaultProps.onOffsetChange).not.toHaveBeenCalled();
  });

  /** 带吸附锚点的有状态 harness：onOffsetChange 真实回写偏移，用于验证「吸附打开后自由停驻」 */
  const renderStatefulWithAnchor = (initial = 0.4) => {
    const Harness = () => {
      const [offset, setOffset] = useState<number | null>(initial);
      return (
        <DockablePanel
          offset={offset}
          opacity={0.85}
          onOffsetChange={setOffset}
          onClose={() => {}}
          title="设置"
          anchorX={320}
        >
          设置内容
        </DockablePanel>
      );
    };
    return render(<Harness />);
  };

  it('吸附打开后仍可自由拖动到任意位置停驻（不被锚点约束）', () => {
    renderStatefulWithAnchor(0.4);
    // 打开时吸附到左侧锚点（0.4×640=256，距 320 更近；挂载持久化写回 0.5）
    expect(getPanel().style.transform).toBe('translateX(320px)');
    // 自由拖到 x=360（非锚点位置），松手停驻，不回跳锚点
    fireEvent.pointerDown(getHandle(), { button: 0, pointerId: 1, clientX: 600 });
    fireEvent.pointerMove(getHandle(), { pointerId: 1, clientX: 640 });
    fireEvent.pointerUp(getHandle(), { pointerId: 1 });
    expect(getPanel().style.transform).toBe('translateX(360px)');
  });

  it('点击头部内的按钮不会触发拖拽', () => {
    render(
      <DockablePanel
        {...defaultProps}
        actions={<button type="button">关闭</button>}
      >
        x
      </DockablePanel>
    );
    fireEvent.pointerDown(screen.getByText('关闭'), {
      button: 0,
      pointerId: 1,
      clientX: 600,
    });
    // 未进入拖拽状态：transform 仍为停靠偏移，而非拖拽偏移
    expect(defaultProps.onOffsetChange).not.toHaveBeenCalled();
  });
});
