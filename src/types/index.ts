// ===== View Modes =====

export type ViewMode = 'flat' | 'by-project' | 'by-time' | 'search' | 'folder' | 'timeline';

// ===== Sort System =====

export type SortField = 'time' | 'path' | 'name' | 'messageCount' | 'agent' | 'size';
export type SortDirection = 'asc' | 'desc';

/** 一级排序条件 */
export interface SortLevel {
  field: SortField;
  direction: SortDirection;
}

/** 多级排序链：[一级, 二级]（最多2级） */
export type SortConfig = SortLevel[];

// ===== Data Models =====

export interface Project {
  name: string;
  path: string;
  sessionCount: number;
  lastActivity: string;
}

export interface SessionSummary {
  id: string;
  projectName: string;
  projectPath: string;
  display: string;
  timestamp: string;
  messageCount: number;
  fileSize: number;
  cwd: string;
  filePath: string;
  providerName: string;
}

export interface SessionDetail {
  id: string;
  filePath: string;
  events: ChatEvent[];
}

export interface ChatEvent {
  uuid: string;
  parentUuid: string | null;
  eventType: EventType;
  timestamp: string;
  content: ContentBlock[];
  sessionId?: string;
}

export type EventType =
  | 'user'
  | 'assistant'
  | 'system'
  | 'attachment'
  | 'unknown';

// ===== Content Blocks =====

export type ContentBlock =
  | TextBlock
  | ThinkingBlock
  | ToolUseBlock
  | ToolResultBlock;

export interface TextBlock { blockType: 'text'; text: string }
export interface ThinkingBlock { blockType: 'thinking'; thinking: string; signature: string }
export interface ToolUseBlock { blockType: 'tool_use'; toolId: string; toolName: string; toolInput: Record<string, unknown> }
export interface ToolResultBlock { blockType: 'tool_result'; toolUseId: string; content: string | null; isError: boolean }

// ===== Filter & Settings =====

export interface FilterConfig {
  showThinking: boolean;
  showToolCalls: boolean;
  showToolResults: boolean;
  hideEmptyToolResults: boolean;
  showSystemMessages: boolean;
  showFileSnapshots: boolean;
}

export interface SearchColors {
  search: string;
  find: string;
}

export const DEFAULT_SEARCH_COLORS: SearchColors = {
  search: '#fef08a',
  find: '#fed7aa',
};

export interface AppSettings {
  watchDirectories: string[];
  defaultFilter: FilterConfig;
  providerEnabled: Record<string, boolean>;
  searchColors: SearchColors;
}

export interface ProviderInfo {
  name: string;
  displayName: string;
  defaultPath: string;
}

// ===== Multi-Agent =====

export interface ProviderMeta {
  label: string;
  color: string;
}

// ===== Export =====

export type ExportFormat = 'markdown' | 'json';

export interface ExportOptions {
  format: ExportFormat;
  includeThinking: boolean;
  includeToolCalls: boolean;
  includeToolResults: boolean;
  excludeEmptyToolResults: boolean;
}
