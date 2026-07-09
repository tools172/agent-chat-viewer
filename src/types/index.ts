// ===== Panel Width Constants =====

export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 600;
export const SIDEBAR_DEFAULT_WIDTH = 320;
export const TURN_NAV_MIN_WIDTH = 160;
export const TURN_NAV_MAX_WIDTH = 600;
export const TURN_NAV_DEFAULT_WIDTH = 256;

// ===== View Modes =====

export type ViewMode = 'flat' | 'by-project' | 'by-time' | 'search' | 'folder' | 'timeline';

// ===== Timeline Time Field =====

/** 时间线分组依据：按创建时间 or 按修改时间 */
export type TimeField = 'created' | 'modified';

// ===== Sort System =====

export type SortField = 'created' | 'modified' | 'path' | 'name' | 'messageCount' | 'agent' | 'size';
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
  providerName: string;
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
  /** 文件修改时间（RFC 3339），用于按修改时间排序 */
  fileMtime: string;
  /** 客户端环境: "vscode" | "cli" | "ui" | "subagent" | "" */
  clientType: string;
  /** 最后一条用户消息文本（用于 hover hint），骨架阶段为空 */
  lastUserText?: string;
  /** 会话文件的实际存储目录（用于 tooltip hint） */
  storagePath: string;
}

export interface SessionDetail {
  id: string;
  filePath: string;
  events: ChatEvent[];
  /** Cleaned first user message (used as tab title) */
  display: string;
  providerName?: string;
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
  | 'developer'
  | 'system'
  | 'attachment'
  | 'mode'
  | 'permission_mode'
  | 'file_history_snapshot'
  | 'last_prompt'
  | 'ai_title'
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
  /** 合并连发：折叠同一角色的连续消息，只显示最后一条 */
  collapseConsecutive?: boolean;
}

export interface SearchColors {
  search: string;
  find: string;
}

export const DEFAULT_SEARCH_COLORS: SearchColors = {
  search: '#fef08a',
  find: '#fed7aa',
};

export interface WatchDirectory {
  path: string;
  enabled: boolean;
}

export type ThemeMode = 'light' | 'dark' | 'eyecare' | 'system';

export interface AppSettings {
  watchDirectories: WatchDirectory[];
  defaultFilter: FilterConfig;
  providerEnabled: Record<string, boolean>;
  searchColors: SearchColors;
  /** 主题模式：light | dark | eyecare | system，默认 system */
  theme?: ThemeMode;
  /** 左侧导航面板是否折叠 */
  navCollapsed?: boolean;
  /** 是否自动保存手动拖拽的侧边栏和轮次导航宽度，默认 true */
  autoSavePanelWidths?: boolean;
  /** 左侧侧边栏默认宽度（px） */
  sidebarWidth?: number;
  /** 右侧轮次导航默认宽度（px） */
  navigatorWidth?: number;
  /** 渐进 polish 每批文件数：5/10/20/30/50，默认 5 */
  polishBatchSize?: number;
  /** 启动时恢复上次打开的标签页 */
  restoreTabsOnStartup?: boolean;
  /** 最大可钉住标签数：1~8，默认 4 */
  maxPinnedTabs?: number;
  /** 保存的标签页快照（用于启动恢复） */
  tabSnapshots?: TabSnapshot[];
  /** 上次活跃的标签页索引 */
  activeTabIndex?: number;
  /** 会话标题显示第一条用户消息 (true) 还是最后一条 (false) */
  displayFirstUserMessage?: boolean;
  /** 时间基准：'created'（创建时间）| 'modified'（修改时间），默认 'modified' */
  timeBase?: 'created' | 'modified';
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

// ===== Tab System =====

/** 单个标签页的完整状态快照 */
export interface TabState {
  /** 唯一标识 */
  id: string;
  /** 会话文件路径（去重依据） */
  sessionPath: string;
  /** Provider 名称 */
  providerName: string;
  /** 会话详情（events 等），加载完成后填充 */
  sessionDetail: SessionDetail | null;
  /** 是否正在加载会话内容 */
  isLoading: boolean;
  /** 加载错误信息 */
  error: string | null;
  /** 该标签页独立的过滤器配置 */
  filter: FilterConfig;
  /** 该标签页独立的查找栏状态 */
  showFindBar: boolean;
  /** 该标签页的搜索高亮词（来自左侧列表搜索） */
  searchHighlight: string | undefined;
  /** 该标签页的滚动位置（scrollTop），切换回来时恢复 */
  scrollTop: number;
  /** 该标签页展开的 thinking block UUID 集合 */
  expandedThinking: string[];
  /** 该标签页展开的 tool call block UUID 集合 */
  expandedToolCalls: string[];
  /** 该标签页展开的 tool result block UUID 集合 */
  expandedToolResults: string[];
  /** 标签页标题 */
  title: string;
  /** 标签页是否被"钉住" */
  pinned: boolean;
  /** 工作目录（cwd），用于 hint 显示 */
  workingDir?: string;
}

/** 标签页的轻量摘要（用于持久化恢复和关闭历史） */
export interface TabSnapshot {
  sessionPath: string;
  providerName: string;
  pinned: boolean;
  /** 工作目录（cwd），用于 hint 显示 */
  workingDir?: string;
  /** 标签页标题（用于恢复时显示骨架） */
  title?: string;
}
