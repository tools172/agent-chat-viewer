import type { ChatEvent, ContentBlock, FilterConfig } from "../types";

/**
 * 前端侧过滤：对已加载的事件应用事件级别 + 内容块级别的过滤。
 *
 * 与 Rust services::filter::filter_events 逻辑一致。
 * 后端 FULL_FILTER 加载全部事件（含 System/FileHistorySnapshot），
 * 前端根据用户切换的过滤配置决定显示/隐藏。
 */
export function filterEvents(
  events: ChatEvent[],
  config: FilterConfig,
): ChatEvent[] {
  return events
    .filter((event) => shouldShowEvent(event, config))
    .map((event) => filterEventContent(event, config))
    .filter((event) => event.content.length > 0);
}

/** 与 Rust filter.rs should_show_event 一致 */
function shouldShowEvent(event: ChatEvent, config: FilterConfig): boolean {
  switch (event.eventType) {
    case "user":
    case "assistant":
      return true; // 始终显示，由 content-block 级别过滤决定可见内容
    case "developer":
    case "system":
      return config.showSystemMessages;
    case "file_history_snapshot":
      return config.showFileSnapshots;
    case "attachment":
    case "unknown":
      return config.showSystemMessages;
    case "mode":
    case "permission_mode":
    case "last_prompt":
    case "ai_title":
      return false; // 始终隐藏的元数据事件
    default:
      return true;
  }
}

/**
 * 合并连发：折叠同一角色的连续纯文本事件，每组只保留最后一条。
 *
 * 可折叠角色：user / assistant / developer / system
 * 其他事件类型（attachment、unknown 等）不参与折叠，直接透传。
 *
 * **重要**：只折叠全部由纯文本块组成的事件组。如果组内任何事件包含
 * 工具调用、思考、工具结果等结构化块，整组不折叠，避免丢失工具调用记录。
 *
 * 应在 content-block 过滤之后调用，此时已移除空事件。
 *
 * @param events 过滤后的事件列表（已按 block 级别过滤，空事件已移除）
 * @param originalEvents 可选：过滤前的完整事件列表，用于判断两条事件在
 *   原始时间线上是否真正相邻。过滤会隐藏中间的 thinking / tool_use /
 *   tool_result / system 等事件，若只按过滤后的列表判断"连续"，会把被
 *   隐藏事件隔开的消息误判为连发而合并、吞掉前面的消息。传入原始列表
 *   后，只有中间没有任何事件的两条同角色消息才会被视为"连发"。
 */
export function collapseConsecutiveEvents(
  events: ChatEvent[],
  originalEvents?: ChatEvent[],
): ChatEvent[] {
  if (events.length === 0) return [];

  // 原始时间线上的序号映射（uuid → index），用于相邻判断。
  // 仅记录首次出现，避免多个缺 uuid 的元数据事件（都映射到 "unknown"）互相覆盖。
  const originalIndex = originalEvents
    ? (() => {
        const map = new Map<string, number>();
        originalEvents.forEach((e, idx) => {
          if (!map.has(e.uuid)) map.set(e.uuid, idx);
        });
        return map;
      })()
    : null;

  const collapsible = new Set(["user", "assistant", "developer", "system"]);
  const result: ChatEvent[] = [];
  let i = 0;

  while (i < events.length) {
    const role = events[i].eventType;

    if (!collapsible.has(role)) {
      result.push(events[i]);
      i++;
      continue;
    }

    // 找到同一角色连续分组的末尾。
    // 只有原始时间线上真正相邻（中间没有被过滤隐藏的事件）才继续分组，
    // 否则在此断开，避免把被隐藏的工具/思考隔开的消息误判为"连发"。
    let j = i;
    while (
      j + 1 < events.length &&
      events[j + 1].eventType === role &&
      isOriginallyAdjacent(events[j], events[j + 1], originalIndex)
    ) {
      j++;
    }

    // 检查组内是否有任何非纯文本事件（含 tool_use / thinking / tool_result）
    const allTextOnly = (function () {
      for (let k = i; k <= j; k++) {
        if (events[k].content.some((b) => b.blockType !== "text")) {
          return false;
        }
      }
      return true;
    })();

    if (allTextOnly) {
      // 纯文本组：只保留最后一条
      result.push(events[j]);
    } else {
      // 包含工具调用/思考等结构化块：全部保留，不折叠
      for (let k = i; k <= j; k++) {
        result.push(events[k]);
      }
    }
    i = j + 1;
  }

  return result;
}

/**
 * 判断两条事件在原始时间线上是否相邻（中间没有任何事件）。
 * 未提供原始序列时（originalIndex 为 null）回退到过滤后列表的相邻判断，
 * 保持对旧调用方的向后兼容。
 */
function isOriginallyAdjacent(
  a: ChatEvent,
  b: ChatEvent,
  originalIndex: Map<string, number> | null,
): boolean {
  if (!originalIndex) return true;
  const ia = originalIndex.get(a.uuid);
  const ib = originalIndex.get(b.uuid);
  // 任一事件在原始序列中找不到时，保守地视为不相邻（不折叠），
  // 避免在异常情况下重新引入"吞消息"问题。
  if (ia === undefined || ib === undefined) return false;
  return ib === ia + 1;
}

function filterEventContent(event: ChatEvent, config: FilterConfig): ChatEvent {
  let blocks = event.content;
  // 「过程」过滤：关闭时隐藏「含工具调用的 assistant 消息」里的 text 叙述，
  // 只保留最终回复（纯 text 的 assistant 事件）；工具调用/结果仍由各自开关控制。
  if (config.showProcess === false) {
    const hasToolUse = event.content.some((b) => b.blockType === "tool_use");
    if (hasToolUse) {
      blocks = event.content.filter((b) => b.blockType !== "text");
    }
  }
  const filteredContent = blocks.filter((block) =>
    shouldShowBlock(block, config),
  );
  return { ...event, content: filteredContent };
}

function shouldShowBlock(block: ContentBlock, config: FilterConfig): boolean {
  switch (block.blockType) {
    case "text":
      return true; // 文本始终显示
    case "thinking":
      return config.showThinking;
    case "tool_use":
      return config.showToolCalls;
    case "tool_result":
      if (!config.showToolResults) return false;
      if (
        config.hideEmptyToolResults &&
        (!block.content || block.content.trim() === "")
      ) {
        return false;
      }
      return true;
    default:
      return true;
  }
}

// ===== 用户消息文本提取 =====

/**
 * 系统注解标签模式：匹配纯 XML 标签块（如 <ide_opened_file>...</ide_opened_file>）。
 *
 * 这是前端安全网 —— 主要清理已在 Rust 后端各 provider 的 parse 阶段完成。
 * 此模式仅处理以下边缘情况：
 * - Claude Code: 独立 content block 形式的纯注解块（parse 阶段会因全空被过滤）
 * - 任何未被后端清理的 XML 格式系统提示
 */
const SYSTEM_ANNOTATION_PATTERN =
  /^<[a-z][a-z0-9_-]*>[\s\S]*<\/[a-z][a-z0-9_-]*>$/;

/** 判断一个 text block 是否为系统注解（如 <ide_opened_file>、<system-reminder> 等） */
function isSystemAnnotation(text: string): boolean {
  return SYSTEM_ANNOTATION_PATTERN.test(text.trim());
}

/**
 * 从 ChatEvent 的 content 中提取"真实"用户消息文本。
 *
 * 主要清理在 Rust 后端完成（各 provider 的 parse 阶段），此处作为安全网：
 * - 跳过纯 XML 系统注解块，取第一个真实用户 text block
 * - 如果所有 text block 都是系统注解，回退到第一个 block
 */
export function extractUserText(event: import("../types").ChatEvent): string {
  const textBlocks = event.content.filter(
    (b) => b.blockType === "text",
  ) as import("../types").TextBlock[];
  if (textBlocks.length === 0) return "";

  // 优先取第一个非系统注解的 text block
  const realBlock = textBlocks.find((b) => !isSystemAnnotation(b.text));
  return realBlock?.text || textBlocks[0].text;
}

/**
 * 判断一条事件是否为「用户手动输入」的聊天内容 —— 即右侧轮次导航列表会收录的消息。
 * 判定与 TurnNavigator.extractTurns 保持一致：user 事件且至少含一个 text 块。
 * （工具结果虽然也解析为 user 事件，但只含 tool_result 块，因此不命中。）
 */
export function isUserTextTurn(event: ChatEvent): boolean {
  return (
    event.eventType === "user" &&
    event.content.some((b) => b.blockType === "text")
  );
}
