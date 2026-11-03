import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MarkdownRenderer } from "../../components/conversation/MarkdownRenderer";
import {
  CodeBlockContext,
  useCodeBlockController,
} from "../../components/conversation/CodeBlockContext";

const LONG_CODE = "```\nline1\nline2\nline3\nline4\nline5\n```";
const SHORT_CODE = "```\nline1\nline2\n```";

describe("MarkdownRenderer", () => {
  beforeEach(() => {
    vi.mocked(navigator.clipboard.writeText).mockClear();
  });

  it("渲染粗体", () => {
    render(<MarkdownRenderer content="**粗体**" />);
    expect(document.querySelector("strong")).not.toBeNull();
  });

  it("渲染行内代码", () => {
    render(<MarkdownRenderer content="`code`" />);
    expect(document.querySelector("code")).not.toBeNull();
  });

  it("渲染代码块", () => {
    render(<MarkdownRenderer content={"```\ncode block\n```"} />);
    expect(
      document.querySelector("pre code") || document.querySelector("code"),
    ).not.toBeNull();
  });

  it("渲染普通文本", () => {
    const text = "这是普通文本";
    render(<MarkdownRenderer content={text} />);
    expect(document.body.textContent).toContain(text);
  });

  it("渲染链接", () => {
    render(<MarkdownRenderer content="[link](https://example.com)" />);
    const a = document.querySelector("a");
    expect(a).not.toBeNull();
    expect(a?.getAttribute("href")).toBe("https://example.com");
  });

  // ======================== 代码块复制 ========================

  it("代码块默认带复制按钮（悬浮显示）", () => {
    render(<MarkdownRenderer content={SHORT_CODE} />);
    const btn = screen.getByTitle("复制代码");
    expect(btn).toBeInTheDocument();
    expect(btn.closest(".code-block-actions")).not.toBeNull();
  });

  it("点击复制按钮复制代码原文", async () => {
    render(<MarkdownRenderer content={LONG_CODE} />);
    fireEvent.click(screen.getByTitle("复制代码"));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "line1\nline2\nline3\nline4\nline5",
      ),
    );
  });

  // ======================== 代码块折叠 ========================

  it("超过 3 行显示折叠按钮", () => {
    render(<MarkdownRenderer content={LONG_CODE} />);
    expect(screen.getByTitle("折叠代码块")).toBeInTheDocument();
  });

  it("不超过 3 行不显示折叠按钮", () => {
    render(<MarkdownRenderer content={SHORT_CODE} />);
    expect(screen.queryByTitle("折叠代码块")).toBeNull();
  });

  it("点击折叠后只剩 3 行并显示展开入口", () => {
    render(<MarkdownRenderer content={LONG_CODE} />);
    const pre = document.querySelector(".code-block pre")!;
    expect(pre.getAttribute("data-collapsed")).toBeNull();

    fireEvent.click(screen.getByTitle("折叠代码块"));

    expect(pre.getAttribute("data-collapsed")).toBe("true");
    expect(pre.className).toContain("code-block-collapsed");
    expect(screen.getByTitle("展开代码块")).toBeInTheDocument();
    expect(screen.getByText("展开（共 5 行）")).toBeInTheDocument();
  });

  it("点击底部展开入口恢复完整代码", () => {
    render(<MarkdownRenderer content={LONG_CODE} />);
    fireEvent.click(screen.getByTitle("折叠代码块"));
    fireEvent.click(screen.getByTitle("展开代码块"));

    expect(
      document.querySelector(".code-block pre")!.getAttribute("data-collapsed"),
    ).toBeNull();
  });

  // ======================== 全局折叠 ========================

  it("全局切换会同步所有代码块，且单块状态可独立覆盖", () => {
    const Harness = () => {
      const { allCollapsed, toggleAll, controls } = useCodeBlockController();
      return (
        <CodeBlockContext.Provider value={controls}>
          <button onClick={toggleAll}>toggle-all</button>
          <span data-testid="all-state">{String(allCollapsed)}</span>
          <MarkdownRenderer content={LONG_CODE} codeBlockIdPrefix="e1" />
        </CodeBlockContext.Provider>
      );
    };

    render(<Harness />);
    const pre = document.querySelector(".code-block pre")!;

    fireEvent.click(screen.getByText("toggle-all"));
    expect(pre.getAttribute("data-collapsed")).toBe("true");

    // 单块手动展开
    fireEvent.click(screen.getByTitle("展开代码块"));
    expect(pre.getAttribute("data-collapsed")).toBeNull();
    expect(screen.getByTestId("all-state").textContent).toBe("true");

    // 再次全局切换：覆盖状态清空，所有块跟随全局展开
    fireEvent.click(screen.getByText("toggle-all"));
    expect(pre.getAttribute("data-collapsed")).toBeNull();
    expect(screen.getByTestId("all-state").textContent).toBe("false");
  });
});
