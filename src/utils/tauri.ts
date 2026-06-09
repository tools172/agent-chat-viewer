import { invoke } from '@tauri-apps/api/core';
import type {
  Project,
  SessionSummary,
  SessionDetail,
  FilterConfig,
  AppSettings,
  ProviderInfo,
} from '../types';

/**
 * Wrapper for Tauri invoke with type safety.
 * All communication with the Rust backend goes through these functions.
 */

// ===== Browser Commands =====

/** List all projects across configured directories */
export async function listProjects(settings: AppSettings): Promise<Project[]> {
  return invoke<Project[]>('list_projects', { settings });
}

/** List sessions in a project */
export async function listSessions(
  projectPath: string,
  provider: string
): Promise<SessionSummary[]> {
  return invoke<SessionSummary[]>('list_sessions', {
    projectPath,
    providerName: provider,
  });
}

/** Get a conversation with filters applied */
export async function getConversation(
  sessionPath: string,
  filter: FilterConfig,
  provider: string
): Promise<SessionDetail> {
  return invoke<SessionDetail>('get_conversation', {
    sessionPath,
    filter,
    providerName: provider,
  });
}

/** List all sessions across all projects and providers */
export async function listAllSessions(
  settings: AppSettings
): Promise<SessionSummary[]> {
  return invoke<SessionSummary[]>('list_all_sessions', { settings });
}

/** Search across all sessions */
export async function searchSessions(
  query: string,
  settings: AppSettings
): Promise<SessionSummary[]> {
  return invoke<SessionSummary[]>('search_sessions', {
    query,
    settings,
  });
}

// ===== Export Commands =====

/** Export a session to markdown */
export async function exportMarkdown(
  sessionPath: string,
  filter: FilterConfig,
  provider: string
): Promise<string> {
  return invoke<string>('export_markdown', {
    sessionPath,
    filter,
    providerName: provider,
  });
}

/** Export a session to JSON */
export async function exportJson(
  sessionPath: string,
  provider: string
): Promise<string> {
  return invoke<string>('export_json', {
    sessionPath,
    providerName: provider,
  });
}

// ===== Settings Commands =====

/** Get default paths for all providers */
export async function getDefaultPaths(): Promise<Record<string, string>> {
  return invoke<Record<string, string>>('get_default_paths');
}

/** Load app settings from disk */
export async function loadSettings(): Promise<AppSettings> {
  return invoke<AppSettings>('load_settings');
}

/** Save app settings to disk */
export async function saveSettings(settings: AppSettings): Promise<void> {
  return invoke<void>('save_settings', { settings });
}

/** List available providers */
export async function listProviders(): Promise<ProviderInfo[]> {
  return invoke<ProviderInfo[]>('list_providers');
}
