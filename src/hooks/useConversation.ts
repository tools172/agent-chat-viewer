import { useMemo, useState, useCallback } from 'react';
import type { ChatEvent } from '../types';

export interface InitialExpanded {
  thinking?: string[];
  toolCalls?: string[];
  toolResults?: string[];
}

/**
 * Hook for managing conversation display, filtering, and navigation.
 * Accepts optional initial expanded state for tab restoration.
 */
export function useConversation(
  events: ChatEvent[],
  initialExpanded?: InitialExpanded
) {
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(
    new Set(initialExpanded?.thinking ?? [])
  );
  const [expandedToolCalls, setExpandedToolCalls] = useState<Set<string>>(
    new Set(initialExpanded?.toolCalls ?? [])
  );
  const [expandedToolResults, setExpandedToolResults] = useState<Set<string>>(
    new Set(initialExpanded?.toolResults ?? [])
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
    for (const event of events) {
      if (event.eventType === 'user') userCount++;
      if (event.eventType === 'assistant') assistantCount++;

      for (const block of event.content) {
        if (block.blockType === 'thinking') thinkingCount++;
      }
    }

    return {
      userCount,
      assistantCount,
      thinkingCount,
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
