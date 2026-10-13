import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MarkdownRenderer } from "../../components/conversation/MarkdownRenderer";

describe("MarkdownRenderer", () => {
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
});
