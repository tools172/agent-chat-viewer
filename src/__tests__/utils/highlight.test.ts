import { describe, it, expect } from "vitest";
import React from "react";
import { highlightText, highlightDual } from "../../utils/highlight";

const COLORS = { search: "#fef08a", find: "#fed7aa" };

describe("highlightText", () => {
  it("匹配词被包裹为 React 元素", () => {
    const result = highlightText("登录工具", "工具", COLORS.search);
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      expect(result.length).toBe(3);
      expect(React.isValidElement(result[1])).toBe(true);
    }
  });

  it("无匹配返回原文字符串", () => {
    expect(highlightText("普通文本", "不存在", COLORS.search)).toBe("普通文本");
  });

  it("空查询返回原文", () => {
    expect(highlightText("文本", "", COLORS.search)).toBe("文本");
  });
});

describe("highlightDual", () => {
  it("仅搜索词", () => {
    const result = highlightDual("登录工具", "登录", undefined, COLORS);
    expect(Array.isArray(result)).toBe(true);
  });

  it("仅查找词", () => {
    const result = highlightDual("登录工具", undefined, "工具", COLORS);
    expect(Array.isArray(result)).toBe(true);
  });

  it("两者都没有返回原文", () => {
    expect(highlightDual("文本", undefined, undefined, COLORS)).toBe("文本");
  });

  it("两者都有", () => {
    const result = highlightDual("登录工具", "登录", "工具", COLORS);
    expect(Array.isArray(result)).toBe(true);
  });

  it("activeFindOccurrence 不传时正常高亮（向后兼容）", () => {
    const result = highlightDual(
      "hello world hello",
      undefined,
      "hello",
      COLORS,
    );
    expect(Array.isArray(result)).toBe(true);
    // 两个 "hello" 都被普通高亮
    if (Array.isArray(result)) {
      // 结构为 ['', <mark>hello</mark>, ' world ', <mark>hello</mark>, '']
      expect(result.length).toBe(5);
    }
  });

  it("activeFindOccurrence=0 时第一个匹配带激活样式", () => {
    const result = highlightDual(
      "hello world hello",
      undefined,
      "hello",
      COLORS,
      0,
    );
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      // 第一个 <mark> 应有 outline 样式
      const firstMark = result[1];
      expect(React.isValidElement(firstMark)).toBe(true);
      if (React.isValidElement(firstMark)) {
        const style = (firstMark.props as { style?: React.CSSProperties })
          .style;
        expect(style?.outline).toBeDefined();
      }
      // 第二个 <mark> 不应有 outline
      const secondMark = result[3];
      expect(React.isValidElement(secondMark)).toBe(true);
      if (React.isValidElement(secondMark)) {
        const style = (secondMark.props as { style?: React.CSSProperties })
          .style;
        expect(style?.outline).toBeUndefined();
      }
    }
  });

  it("activeFindOccurrence=1 时第二个匹配带激活样式", () => {
    const result = highlightDual(
      "hello world hello",
      undefined,
      "hello",
      COLORS,
      1,
    );
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      const secondMark = result[3];
      expect(React.isValidElement(secondMark)).toBe(true);
      if (React.isValidElement(secondMark)) {
        const style = (secondMark.props as { style?: React.CSSProperties })
          .style;
        expect(style?.outline).toBeDefined();
      }
    }
  });
});
