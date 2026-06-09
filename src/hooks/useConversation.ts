import { useMemo, useState, useCallback } from 'react';
import type { ChatEvent } from '../types';

/**
 * Hook for managing conversation display, filtering, and navigation.
 */
export function useConversation(events: ChatEvent[]) {
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(
    new Set()
  );
  const [expandedToolCalls, setExpandedToolCalls] = useState<Set<string>>(
    new Set()
  );
  const [expandedToolResults, setExpandedToolResults] = useState<Set<string>>(
    new Set()
  );

  // Toggle thinking block expansion
  const toggleThinking = useCallback((uuid: string) => {
    setExpandedThinking((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) {
        next.delete(uuid);
      } else {
        next.add(uuid);
      }
      return next;
    });
  }, []);

  // Toggle tool call block expansion
  const toggleToolCall = useCallback((uuid: string) => {
    setExpandedToolCalls((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) {
        next.delete(uuid);
      } else {
        next.add(uuid);
      }
      return next;
    });
  }, []);

  // Toggle tool result block expansion
  const toggleToolResult = useCallback((uuid: string) => {
    setExpandedToolResults((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) {
        next.delete(uuid);
      } else {
        next.add(uuid);
      }
      return next;
    });
  }, []);

  // Get event statistics
  const stats = useMemo(() => {
    let userCount = 0;
    let assistantCount = 0;
    let thinkingCount = 0;
    let toolCallCount = 0;
    let toolResultCount = 0;

    for (const event of events) {
      if (event.eventType === 'user') userCount++;
      if (event.eventType === 'assistant') assistantCount++;

      for (const block of event.content) {
        if (block.blockType === 'thinking') thinkingCount++;
        if (block.blockType === 'tool_use') toolCallCount++;
        if (block.blockType === 'tool_result') toolResultCount++;
      }
    }

    return {
      userCount,
      assistantCount,
      thinkingCount,
      toolCallCount,
      toolResultCount,
      totalEvents: events.length,
    };
  }, [events]);

  // Generate a unique key for a content block
  const blockKey = useCallback(
    (eventUuid: string, blockIndex: number) =>
      `${eventUuid}-block-${blockIndex}`,
    []
  );

  return {
    expandedThinking,
    expandedToolCalls,
    expandedToolResults,
    toggleThinking,
    toggleToolCall,
    toggleToolResult,
    stats,
    blockKey,
  };
}
