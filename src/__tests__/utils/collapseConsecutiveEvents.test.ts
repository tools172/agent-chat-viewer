import { describe, it, expect } from "vitest";
import { collapseConsecutiveEvents } from "../../utils/filterEvents";
import type { ChatEvent } from "../../types";

function makeEvent(
  eventType: ChatEvent["eventType"],
  text: string = "Hello",
  overrides: Partial<ChatEvent> = {},
): ChatEvent {
  return {
    uuid: `uuid-${eventType}-${text}`,
    parentUuid: null,
    eventType,
    timestamp: "2026-06-09T10:00:00Z",
    content: [{ blockType: "text", text }],
    ...overrides,
  };
}

describe("collapseConsecutiveEvents", () => {
  it("空列表返回空", () => {
    const result = collapseConsecutiveEvents([]);
    expect(result).toHaveLength(0);
  });

  it("单条事件原样返回", () => {
    const events = [makeEvent("user", "hello")];
    const result = collapseConsecutiveEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0].content).toEqual(events[0].content);
  });

  it("交替角色不折叠", () => {
    const events = [
      makeEvent("user", "msg1"),
      makeEvent("assistant", "reply1"),
      makeEvent("user", "msg2"),
      makeEvent("assistant", "reply2"),
    ];
    const result = collapseConsecutiveEvents(events);
    expect(result).toHaveLength(4);
  });

  it("连续纯文本用户消息：只保留最后一条", () => {
    const events = [
      makeEvent("user", "first"),
      makeEvent("user", "second"),
      makeEvent("user", "third"),
      makeEvent("assistant", "reply"),
    ];
    const result = collapseConsecutiveEvents(events);
    expect(result).toHaveLength(2);
    expect(result[0].content[0]).toMatchObject({ text: "third" });
    expect(result[1].content[0]).toMatchObject({ text: "reply" });
  });

  it("连续纯文本助手消息：只保留最后一条", () => {
    const events = [
      makeEvent("user", "question"),
      makeEvent("assistant", "thinking..."),
      makeEvent("assistant", "checking..."),
      makeEvent("assistant", "final answer"),
    ];
    const result = collapseConsecutiveEvents(events);
    expect(result).toHaveLength(2);
    expect(result[0].content[0]).toMatchObject({ text: "question" });
    expect(result[1].content[0]).toMatchObject({ text: "final answer" });
  });

  it("多组连续纯文本均被折叠", () => {
    const events = [
      makeEvent("user", "u1"),
      makeEvent("user", "u2"),
      makeEvent("assistant", "a1"),
      makeEvent("assistant", "a2"),
      makeEvent("assistant", "a3"),
      makeEvent("user", "u3"),
      makeEvent("user", "u4"),
      makeEvent("assistant", "a4"),
    ];
    const result = collapseConsecutiveEvents(events);
    expect(result).toHaveLength(4);
    expect(result[0].content[0]).toMatchObject({ text: "u2" });
    expect(result[1].content[0]).toMatchObject({ text: "a3" });
    expect(result[2].content[0]).toMatchObject({ text: "u4" });
    expect(result[3].content[0]).toMatchObject({ text: "a4" });
  });

  it("系统消息参与折叠", () => {
    const events = [
      makeEvent("system", "sys1"),
      makeEvent("system", "sys2"),
      makeEvent("user", "hello"),
      makeEvent("user", "world"),
    ];
    const result = collapseConsecutiveEvents(events);
    expect(result).toHaveLength(2);
    expect(result[0].content[0]).toMatchObject({ text: "sys2" });
    expect(result[1].content[0]).toMatchObject({ text: "world" });
  });

  it("系统消息打断折叠链", () => {
    const events = [
      makeEvent("user", "u1"),
      makeEvent("system", "sys"),
      makeEvent("user", "u2"),
    ];
    const result = collapseConsecutiveEvents(events);
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.eventType)).toEqual(["user", "system", "user"]);
  });

  it("交替穿插不折叠", () => {
    const events = [
      makeEvent("user", "hi"),
      makeEvent("assistant", "hello"),
      makeEvent("user", "how are you"),
      makeEvent("assistant", "fine"),
      makeEvent("user", "good"),
    ];
    const result = collapseConsecutiveEvents(events);
    expect(result).toHaveLength(5);
  });

  // ======================== 工具调用保护 ========================

  it("包含 tool_use 的连续 assistant 不折叠，全部保留", () => {
    const events = [
      makeEvent("user", "fix this"),
      makeEvent("assistant", "", {
        content: [
          {
            blockType: "tool_use",
            toolId: "t1",
            toolName: "edit",
            toolInput: {},
          },
        ],
      }),
      makeEvent("assistant", "", {
        content: [
          {
            blockType: "tool_use",
            toolId: "t2",
            toolName: "read",
            toolInput: {},
          },
        ],
      }),
      makeEvent("assistant", "Done!"),
    ];
    const result = collapseConsecutiveEvents(events);
    // All 3 assistants kept because group contains tool_use blocks
    expect(result).toHaveLength(4); // user + 3 assistants
    expect(result[1].content[0]).toMatchObject({
      blockType: "tool_use",
      toolName: "edit",
    });
    expect(result[2].content[0]).toMatchObject({
      blockType: "tool_use",
      toolName: "read",
    });
    expect(result[3].content[0]).toMatchObject({
      blockType: "text",
      text: "Done!",
    });
  });

  it("包含 thinking 的连续 assistant 不折叠", () => {
    const events = [
      makeEvent("assistant", "", {
        content: [{ blockType: "thinking", thinking: "hmm", signature: "" }],
      }),
      makeEvent("assistant", "answer"),
    ];
    const result = collapseConsecutiveEvents(events);
    expect(result).toHaveLength(2);
  });

  it("纯文本组正常折叠，含工具组不折叠（混合场景）", () => {
    const events = [
      makeEvent("user", "u1"),
      makeEvent("user", "u2"), // pure text → collapse
      makeEvent("assistant", "", {
        content: [
          {
            blockType: "tool_use",
            toolId: "t1",
            toolName: "read",
            toolInput: {},
          },
        ],
      }),
      makeEvent("assistant", "", {
        content: [
          {
            blockType: "tool_use",
            toolId: "t2",
            toolName: "edit",
            toolInput: {},
          },
        ],
      }),
      makeEvent("assistant", "Done!"),
    ];
    const result = collapseConsecutiveEvents(events);
    // users → collapsed to 1, assistants (has tool_use) → all 3 kept
    expect(result).toHaveLength(4);
    expect(result[0].content[0]).toMatchObject({ text: "u2" });
    expect(result[1].content[0]).toMatchObject({
      blockType: "tool_use",
      toolName: "read",
    });
    expect(result[2].content[0]).toMatchObject({
      blockType: "tool_use",
      toolName: "edit",
    });
    expect(result[3].content[0]).toMatchObject({
      blockType: "text",
      text: "Done!",
    });
  });

  it("包含 tool_result 的连续 user 不折叠", () => {
    const events = [
      makeEvent("user", "", {
        content: [
          {
            blockType: "tool_result",
            toolUseId: "t1",
            content: "ok",
            isError: false,
          },
        ],
      }),
      makeEvent("user", "", {
        content: [
          {
            blockType: "tool_result",
            toolUseId: "t2",
            content: "done",
            isError: false,
          },
        ],
      }),
    ];
    const result = collapseConsecutiveEvents(events);
    expect(result).toHaveLength(2);
  });

  // ======================== 边界测试 ========================

  it("attachment 事件不参与折叠", () => {
    const events = [
      makeEvent("user", "msg1"),
      makeEvent("attachment", "file1"),
      makeEvent("attachment", "file2"),
      makeEvent("assistant", "reply"),
    ];
    const result = collapseConsecutiveEvents(events);
    expect(result).toHaveLength(4);
    expect(result.map((e) => e.eventType)).toEqual([
      "user",
      "attachment",
      "attachment",
      "assistant",
    ]);
  });

  it("unknown 事件不参与折叠", () => {
    const events = [
      makeEvent("assistant", "reply1"),
      makeEvent("unknown", "weird event"),
      makeEvent("unknown", "another weird"),
      makeEvent("assistant", "reply2"),
    ];
    const result = collapseConsecutiveEvents(events);
    expect(result).toHaveLength(4);
  });

  it("整个纯文本列表全部折叠为一条", () => {
    const events = [
      makeEvent("user", "u1"),
      makeEvent("user", "u2"),
      makeEvent("user", "u3"),
      makeEvent("user", "u4"),
      makeEvent("user", "u5"),
    ];
    const result = collapseConsecutiveEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0].content[0]).toMatchObject({ text: "u5" });
  });

  it("原数组不被修改", () => {
    const events = [
      makeEvent("user", "first"),
      makeEvent("user", "second"),
      makeEvent("assistant", "reply"),
    ];
    const original = [...events];
    collapseConsecutiveEvents(events);
    expect(events).toEqual(original);
    expect(events).toHaveLength(3);
  });

  it("保留最后一条事件的完整属性", () => {
    const events = [
      makeEvent("user", "u1", {
        parentUuid: "parent1",
        timestamp: "2026-01-01T00:00:00Z",
      }),
      makeEvent("user", "u2", {
        parentUuid: "parent2",
        timestamp: "2026-06-09T10:00:00Z",
      }),
      makeEvent("assistant", "reply"),
    ];
    const result = collapseConsecutiveEvents(events);
    expect(result).toHaveLength(2);
    expect(result[0].uuid).toBe("uuid-user-u2");
    expect(result[0].parentUuid).toBe("parent2");
    expect(result[0].timestamp).toBe("2026-06-09T10:00:00Z");
  });

  it("大序列：100 条连续纯文本 user → 折叠为 1 条", () => {
    const events: ChatEvent[] = [];
    for (let i = 0; i < 100; i++) {
      events.push(makeEvent("user", `msg${i}`));
    }
    events.push(makeEvent("assistant", "reply"));
    const result = collapseConsecutiveEvents(events);
    expect(result).toHaveLength(2);
    expect(result[0].content[0]).toMatchObject({ text: "msg99" });
    expect(result[1].content[0]).toMatchObject({ text: "reply" });
  });

  // ======================== originalEvents 参数（隐藏边界回归） ========================

  it("originalEvents：被隐藏的 thinking 事件作为边界，阻止误合并", () => {
    const original = [
      makeEvent("user", "msg1"),
      makeEvent("assistant", "", {
        content: [{ blockType: "thinking", thinking: "hmm", signature: "" }],
      }),
      makeEvent("user", "msg2"),
    ];
    // 过滤后 assistant 被移除，只剩两条 user
    const filtered = [original[0], original[2]];
    const result = collapseConsecutiveEvents(filtered, original);
    expect(result).toHaveLength(2);
    expect(result[0].content[0]).toMatchObject({ text: "msg1" });
    expect(result[1].content[0]).toMatchObject({ text: "msg2" });
  });

  it("originalEvents：被隐藏的 tool_use 事件作为边界，阻止误合并", () => {
    const original = [
      makeEvent("assistant", "reply1"),
      makeEvent("assistant", "", {
        content: [
          {
            blockType: "tool_use",
            toolId: "t1",
            toolName: "read",
            toolInput: {},
          },
        ],
      }),
      makeEvent("assistant", "reply2"),
    ];
    const filtered = [original[0], original[2]];
    const result = collapseConsecutiveEvents(filtered, original);
    expect(result).toHaveLength(2);
    expect(result[0].content[0]).toMatchObject({ text: "reply1" });
    expect(result[1].content[0]).toMatchObject({ text: "reply2" });
  });

  it("originalEvents：中间无隐藏事件的两条同角色消息仍正常折叠", () => {
    const original = [makeEvent("user", "u1"), makeEvent("user", "u2")];
    const result = collapseConsecutiveEvents(original, original);
    expect(result).toHaveLength(1);
    expect(result[0].content[0]).toMatchObject({ text: "u2" });
  });

  it("未提供 originalEvents 时回退到旧行为（过滤后列表相邻即折叠）", () => {
    const events = [makeEvent("user", "u1"), makeEvent("user", "u2")];
    const result = collapseConsecutiveEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0].content[0]).toMatchObject({ text: "u2" });
  });

  it("originalEvents：中间的 System 事件是结构性消息，不阻止合并", () => {
    const original = [
      makeEvent("user", "u1"),
      makeEvent("system", "sys"),
      makeEvent("user", "u2"),
    ];
    // 过滤后 system 被隐藏，只剩两条 user
    const filtered = [original[0], original[2]];
    const result = collapseConsecutiveEvents(filtered, original);
    expect(result).toHaveLength(1);
    expect(result[0].content[0]).toMatchObject({ text: "u2" });
  });

  it("originalEvents：中间的 Developer 事件是结构性消息，不阻止合并", () => {
    const original = [
      makeEvent("user", "u1"),
      makeEvent("developer", "instr"),
      makeEvent("user", "u2"),
    ];
    const filtered = [original[0], original[2]];
    const result = collapseConsecutiveEvents(filtered, original);
    expect(result).toHaveLength(1);
    expect(result[0].content[0]).toMatchObject({ text: "u2" });
  });

  it("originalEvents：中间的 Assistant 事件仍阻止合并", () => {
    const original = [
      makeEvent("user", "u1"),
      makeEvent("assistant", "reply"),
      makeEvent("user", "u2"),
    ];
    const filtered = [original[0], original[2]];
    const result = collapseConsecutiveEvents(filtered, original);
    expect(result).toHaveLength(2);
    expect(result[0].content[0]).toMatchObject({ text: "u1" });
    expect(result[1].content[0]).toMatchObject({ text: "u2" });
  });
});
