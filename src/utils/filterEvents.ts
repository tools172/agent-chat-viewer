import type { ChatEvent, ContentBlock, FilterConfig } from '../types';

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
    case 'user':
    case 'assistant':
      return true; // 始终显示，由 content-block 级别过滤决定可见内容
    case 'developer':
    case 'system':
      return config.showSystemMessages;
    case 'file_history_snapshot':
      return config.showFileSnapshots;
    case 'attachment':
    case 'unknown':
      return config.showSystemMessages;
    case 'mode':
    case 'permission_mode':
    case 'last_prompt':
    case 'ai_title':
      return false; // 始终隐藏的元数据事件
    default:
      return true;
  }
}

/**
 * 合并连发：折叠同一角色的连续事件，每组只保留最后一条。
 *
 * 可折叠角色：user / assistant / developer / system
 * 其他事件类型（attachment、unknown 等）不参与折叠，直接透传。
 *
 * 应在 content-block 过滤之后调用，此时已移除空事件。
 */
export function collapseConsecutiveEvents(events: ChatEvent[]): ChatEvent[] {
  if (events.length === 0) return [];

  const collapsible = new Set(['user', 'assistant', 'developer', 'system']);
  const result: ChatEvent[] = [];
  let i = 0;

  while (i < events.length) {
    const role = events[i].eventType;

    if (!collapsible.has(role)) {
      result.push(events[i]);
      i++;
      continue;
    }

    // 找到同一角色连续分组的末尾
    let j = i;
    while (j + 1 < events.length && events[j + 1].eventType === role) {
      j++;
    }

    // 只保留该组的最后一条
    result.push(events[j]);
    i = j + 1;
  }

  return result;
}

function filterEventContent(
  event: ChatEvent,
  config: FilterConfig,
): ChatEvent {
  const filteredContent = event.content.filter((block) =>
    shouldShowBlock(block, config),
  );
  return { ...event, content: filteredContent };
}

function shouldShowBlock(block: ContentBlock, config: FilterConfig): boolean {
  switch (block.blockType) {
    case 'text':
      return true; // 文本始终显示
    case 'thinking':
      return config.showThinking;
    case 'tool_use':
      return config.showToolCalls;
    case 'tool_result':
      if (!config.showToolResults) return false;
      if (
        config.hideEmptyToolResults &&
        (!block.content || block.content.trim() === '')
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
const SYSTEM_ANNOTATION_PATTERN = /^<[a-z][a-z0-9_-]*>[\s\S]*<\/[a-z][a-z0-9_-]*>$/;

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
export function extractUserText(
  event: import('../types').ChatEvent
): string {
  const textBlocks = event.content.filter(
    (b) => b.blockType === 'text'
  ) as import('../types').TextBlock[];
  if (textBlocks.length === 0) return '';

  // 优先取第一个非系统注解的 text block
  const realBlock = textBlocks.find((b) => !isSystemAnnotation(b.text));
  return realBlock?.text || textBlocks[0].text;
}
