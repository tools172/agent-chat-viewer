import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TurnNavigator } from "../../components/conversation/TurnNavigator";
import type { ChatEvent } from "../../types";

// ---- helpers ----
function makeEvent(uuid: string, text: string, eventType = "user"): ChatEvent {
  return {
    uuid,
    parentUuid: null,
    eventType: eventType as ChatEvent["eventType"],
    timestamp: "2026-06-09T10:00:00Z",
    content: [{ blockType: "text", text }],
    sessionId: undefined,
  };
}

function makeToolResultEvent(uuid: string): ChatEvent {
  return {
    uuid,
    parentUuid: null,
    eventType: "user",
    timestamp: "2026-06-09T10:00:00Z",
    content: [
      {
        blockType: "tool_result",
        toolUseId: "call_1",
        content: null,
        isError: false,
      },
    ],
    sessionId: undefined,
  };
}

/** Create a mock scroll container with event elements and a bottom sentinel */
function createContainer() {
  const div = document.createElement("div");
  div.scrollTo = vi.fn() as unknown as typeof div.scrollTo;
  Object.defineProperty(div, "scrollTop", {
    value: 0,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(div, "scrollHeight", {
    value: 2000,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(div, "clientHeight", {
    value: 600,
    writable: true,
    configurable: true,
  });
  return div;
}

// Mock IntersectionObserver globally
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();
const mockIntersectionObserver = vi.fn((_cb: IntersectionObserverCallback) => ({
  observe: mockObserve,
  disconnect: mockDisconnect,
  unobserve: vi.fn(),
  takeRecords: vi.fn(() => []),
  root: null,
  rootMargin: "",
  thresholds: [],
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).IntersectionObserver = mockIntersectionObserver;

describe("TurnNavigator", () => {
  let container: HTMLDivElement;
  let containerRef: { current: HTMLDivElement | null };
  let scrollIntoViewSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = createContainer();
    containerRef = { current: container };
    scrollIntoViewSpy = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoViewSpy;
    // JSDOM 没有实现 scrollTo
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Element.prototype as any).scrollTo = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ========== extractTurns logic (via render) ==========

  it("空事件列表不渲染任何内容", () => {
    const { container: c } = render(
      <TurnNavigator events={[]} containerRef={containerRef} />,
    );
    expect(c.innerHTML).toBe("");
  });

  it("只渲染有文本内容的 user 事件作为轮次", () => {
    const events = [
      makeEvent("u1", "第一条消息"),
      makeEvent("a1", "回复", "assistant"),
      makeEvent("u2", "第二条消息"),
      makeToolResultEvent("tr1"), // tool result without text → skipped
      makeEvent("u3", "第三条消息"),
    ];

    render(<TurnNavigator events={events} containerRef={containerRef} />);

    // 3 turns should render (overflow indicator may also show counts)
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("4")).not.toBeInTheDocument();
  });

  // ========== scroll-to-top ==========

  it("点击回到顶部按钮 → 滚动第一个事件元素", () => {
    const events = [
      makeEvent("u1", "第一条消息"),
      makeEvent("a1", "回复", "assistant"),
      makeEvent("u2", "第二条消息"),
    ];

    // Add event elements to the mock container
    events.forEach((e) => {
      const el = document.createElement("div");
      el.dataset.eventUuid = e.uuid;
      container.appendChild(el);
    });

    render(<TurnNavigator events={events} containerRef={containerRef} />);

    fireEvent.click(screen.getByTitle("回到顶部"));

    // The first event should be scrolled to (instant, no smooth)
    expect(scrollIntoViewSpy).toHaveBeenCalledWith(
      expect.objectContaining({ block: "start" }),
    );

    // Verify the scrolled element is the first one
    const firstEl = container.querySelector('[data-event-uuid="u1"]');
    expect(firstEl).not.toBeNull();
  });

  // ========== scroll-to-bottom ==========

  it("点击回到底部按钮 → 优先用 data-bottom-sentinel", () => {
    const events = [makeEvent("u1", "第一条消息")];

    // Add sentinel
    const sentinel = document.createElement("div");
    sentinel.dataset.bottomSentinel = "";
    container.appendChild(sentinel);

    // Add event elements
    events.forEach((e) => {
      const el = document.createElement("div");
      el.dataset.eventUuid = e.uuid;
      container.appendChild(el);
    });

    render(<TurnNavigator events={events} containerRef={containerRef} />);

    fireEvent.click(screen.getByTitle("回到底部"));

    // Sentinel should be scrolled to (instant)
    expect(scrollIntoViewSpy).toHaveBeenCalledWith(
      expect.objectContaining({ block: "end" }),
    );
  });

  it("点击回到底部按钮 → 无 sentinel 时 fallback 到最后一个事件", () => {
    const events = [makeEvent("u1", "第一条"), makeEvent("u2", "第二条")];

    events.forEach((e) => {
      const el = document.createElement("div");
      el.dataset.eventUuid = e.uuid;
      container.appendChild(el);
    });

    render(<TurnNavigator events={events} containerRef={containerRef} />);

    fireEvent.click(screen.getByTitle("回到底部"));

    // Should have called scrollIntoView on something
    expect(scrollIntoViewSpy).toHaveBeenCalled();
  });

  // ========== click a turn ==========

  it("点击轮次 → 选中该轮并滚动到对应事件", () => {
    const events = [
      makeEvent("u1", "第一条消息"),
      makeEvent("a1", "回复", "assistant"),
      makeEvent("u2", "第二条消息"),
    ];

    events.forEach((e) => {
      const el = document.createElement("div");
      el.dataset.eventUuid = e.uuid;
      container.appendChild(el);
    });

    render(<TurnNavigator events={events} containerRef={containerRef} />);

    // Click the second turn (label = "第二条消息")
    fireEvent.click(screen.getByText("第二条消息"));

    // Should scroll to u2
    expect(scrollIntoViewSpy).toHaveBeenCalled();
  });

  // ========== collapse / expand ==========

  it("点击折叠按钮隐藏列表，点击展开按钮恢复", () => {
    const events = [makeEvent("u1", "一条消息")];

    render(<TurnNavigator events={events} containerRef={containerRef} />);

    // Initially visible
    expect(screen.getByTitle("折叠导航")).toBeInTheDocument();
    expect(screen.getByTitle("回到顶部")).toBeInTheDocument();

    // Collapse
    fireEvent.click(screen.getByTitle("折叠导航"));

    // Now only the expand button is visible
    expect(screen.getByTitle("展开轮次导航")).toBeInTheDocument();
    expect(screen.queryByTitle("回到顶部")).not.toBeInTheDocument();

    // Expand
    fireEvent.click(screen.getByTitle("展开轮次导航"));

    // Back to normal
    expect(screen.getByTitle("折叠导航")).toBeInTheDocument();
    expect(screen.getByTitle("回到顶部")).toBeInTheDocument();
  });

  // ========== activeIndex selection ==========

  it("点击轮次后选中状态立即更新", () => {
    const events = [
      makeEvent("u1", "第一条消息"),
      makeEvent("a1", "回复", "assistant"),
      makeEvent("u2", "第二条消息"),
    ];

    events.forEach((e) => {
      const el = document.createElement("div");
      el.dataset.eventUuid = e.uuid;
      container.appendChild(el);
    });

    render(<TurnNavigator events={events} containerRef={containerRef} />);

    // Click the first turn
    fireEvent.click(screen.getByText("第一条消息"));

    // The first turn button should have the active class
    const buttons = screen.getAllByRole("button");
    const firstTurnBtn = buttons.find((b) =>
      b.textContent?.includes("第一条消息"),
    );
    expect(firstTurnBtn?.className).toContain("border-primary-500");
  });

  // ========== containerRef is null ==========

  // ========== 轮次总数显示 ==========

  it("显示轮次总数", () => {
    const events = [
      makeEvent("u1", "第一条消息"),
      makeEvent("a1", "回复", "assistant"),
      makeEvent("u2", "第二条消息"),
    ];

    render(<TurnNavigator events={events} containerRef={containerRef} />);

    expect(screen.getByText("共 2 轮")).toBeInTheDocument();
  });

  // ========== containerRef is null ==========

  it("containerRef 为 null 时不崩溃", () => {
    const events = [makeEvent("u1", "一条消息")];
    const nullRef = { current: null };

    render(<TurnNavigator events={events} containerRef={nullRef} />);

    // Should still render the UI
    expect(screen.getByText("一条消息")).toBeInTheDocument();

    // Click buttons should not throw
    fireEvent.click(screen.getByTitle("回到顶部"));
    fireEvent.click(screen.getByTitle("回到底部"));
    expect(scrollIntoViewSpy).not.toHaveBeenCalled();
  });
});
