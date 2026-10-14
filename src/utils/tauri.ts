import { invoke, Channel } from "@tauri-apps/api/core";
import type {
  Project,
  SessionSummary,
  SessionDetail,
  FilterConfig,
  AppSettings,
  ProviderInfo,
  UpdateInfo,
  DownloadProgress,
} from "../types";

/**
 * Wrapper for Tauri invoke with type safety.
 * All communication with the Rust backend goes through these functions.
 */

// ===== Browser Commands =====

/** List all projects across configured directories */
export async function listProjects(settings: AppSettings): Promise<Project[]> {
  return invoke<Project[]>("list_projects", { settings });
}

/** List sessions in a project */
export async function listSessions(
  projectPath: string,
  provider: string,
): Promise<SessionSummary[]> {
  return invoke<SessionSummary[]>("list_sessions", {
    projectPath,
    providerName: provider,
  });
}

/** Get a conversation with filters applied */
export async function getConversation(
  sessionPath: string,
  filter: FilterConfig,
  provider: string,
): Promise<SessionDetail> {
  return invoke<SessionDetail>("get_conversation", {
    sessionPath,
    filter,
    providerName: provider,
  });
}

/** List all sessions across all projects and providers */
export async function listAllSessions(
  settings: AppSettings,
): Promise<SessionSummary[]> {
  return invoke<SessionSummary[]>("list_all_sessions", { settings });
}

/** Polish result from progressive loading */
export interface SessionPolish {
  filePath: string;
  display: string;
  lastUserText: string;
  timestamp: string;
  messageCount: number;
  cwd: string;
  clientType: string;
}

/** Progressively polish sessions: clean display titles and detect client types */
export async function polishSessions(
  sessions: [string, string][],
): Promise<SessionPolish[]> {
  return invoke<SessionPolish[]>("polish_sessions", { sessions });
}

/** Search across all sessions */
export async function searchSessions(
  query: string,
  settings: AppSettings,
): Promise<SessionSummary[]> {
  return invoke<SessionSummary[]>("search_sessions", {
    query,
    settings,
  });
}

// ===== Export Commands =====

/** Export a session to markdown */
export async function exportMarkdown(
  sessionPath: string,
  filter: FilterConfig,
  provider: string,
): Promise<string> {
  return invoke<string>("export_markdown", {
    sessionPath,
    filter,
    providerName: provider,
  });
}

/** Export a session to JSON */
export async function exportJson(
  sessionPath: string,
  provider: string,
): Promise<string> {
  return invoke<string>("export_json", {
    sessionPath,
    providerName: provider,
  });
}

// ===== Settings Commands =====

/** Get default paths for all providers */
export async function getDefaultPaths(): Promise<Record<string, string>> {
  return invoke<Record<string, string>>("get_default_paths");
}

/** Load app settings from disk */
export async function loadSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("load_settings");
}

/** Save app settings to disk */
export async function saveSettings(settings: AppSettings): Promise<void> {
  return invoke<void>("save_settings", { settings });
}

/** List available providers */
export async function listProviders(): Promise<ProviderInfo[]> {
  return invoke<ProviderInfo[]>("list_providers");
}

/** Write text content to a file at the given path */
export async function writeTextFile(
  filePath: string,
  content: string,
): Promise<void> {
  return invoke<void>("write_text_file", { filePath, content });
}

/** Get the path to the settings file on disk */
export async function getSettingsPath(): Promise<string> {
  return invoke<string>("get_settings_path");
}

/** Open the containing folder in OS file explorer and select the file */
export async function openContainingFolder(filePath: string): Promise<void> {
  return invoke<void>("open_containing_folder", { filePath });
}

/** Open the project folder directly in OS file explorer */
export async function openProjectFolder(folderPath: string): Promise<void> {
  return invoke<void>("open_project_folder", { folderPath });
}

/** Get the source data directory for a provider (e.g. Cursor's DB dir) */
export async function getProviderDataDir(
  providerName: string,
): Promise<string | null> {
  return invoke<string | null>("get_provider_data_dir", { providerName });
}

/** 触发 WebView 原生查找栏（模拟 Ctrl+F 按键） */
export async function triggerNativeFind(): Promise<void> {
  return invoke<void>("trigger_native_find");
}

// ===== Update Commands =====

/** 检查是否有新版本：有则返回 UpdateInfo，无/出错返回 null */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  return invoke<UpdateInfo | null>("check_for_update");
}

/** 下载安装包到临时目录（经 Channel 推送进度），返回保存路径 */
export async function downloadUpdate(
  assetUrl: string,
  assetName: string,
  onEvent: Channel<DownloadProgress>,
): Promise<string> {
  return invoke<string>("download_update", { assetUrl, assetName, onEvent });
}

/** 启动安装器并退出应用 */
export async function installUpdate(filePath: string): Promise<void> {
  return invoke<void>("install_update", { filePath });
}

/** 在系统默认浏览器打开外部链接 */
export async function openExternal(url: string): Promise<void> {
  return invoke<void>("open_external", { url });
}
