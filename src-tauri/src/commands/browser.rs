use std::collections::HashMap;
use std::path::PathBuf;

use crate::models::{AppSettings, FilterConfig, Project, SessionDetail, SessionSummary};
use crate::providers::ProviderRegistry;
use crate::services::{filter_events, parse_session_detail};
use crate::utils::path;

/// 收集所有需要扫描的基础路径
fn collect_base_paths(
    settings: &AppSettings,
    registry: &ProviderRegistry,
) -> Vec<(String, PathBuf)> {
    let mut paths: Vec<(String, PathBuf)> = Vec::new();
    for (provider_name, enabled) in &settings.provider_enabled {
        if *enabled {
            if let Some(provider) = registry.get(provider_name) {
                let dir = provider.default_base_dir();
                if dir.exists() {
                    paths.push((provider_name.clone(), dir));
                }
            }
        }
    }
    for dir in &settings.watch_directories {
        let normalized = path::normalize_path(dir);
        if normalized.exists() {
            paths.push(("claude_code".to_string(), normalized));
        }
    }
    paths
}

/// 扫描项目列表（纯同步函数，供 spawn_blocking 调用）
fn scan_projects(base_paths: &[(String, PathBuf)]) -> Vec<Project> {
    let mut projects: HashMap<String, Project> = HashMap::new();
    for (_provider_name, base_path) in base_paths {
        if let Ok(entries) = std::fs::read_dir(base_path) {
            for entry in entries.flatten() {
                let entry_path = entry.path();
                if entry_path.is_dir() {
                    let project_name = entry_path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                    let mut session_count: u32 = 0;
                    let mut last_activity = String::new();
                    if let Ok(session_files) = std::fs::read_dir(&entry_path) {
                        for session_entry in session_files.flatten() {
                            let session_path = session_entry.path();
                            if session_path.is_file()
                                && path::is_jsonl_file(&session_path)
                            {
                                session_count += 1;
                                if let Ok(metadata) = session_path.metadata() {
                                    if let Ok(modified) = metadata.modified() {
                                        let dt: chrono::DateTime<chrono::Utc> =
                                            modified.into();
                                        let ts = dt.to_rfc3339();
                                        if ts > last_activity {
                                            last_activity = ts;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if session_count > 0 {
                        projects.insert(
                            project_name.clone(),
                            Project {
                                name: project_name,
                                path: entry_path
                                    .to_string_lossy()
                                    .to_string(),
                                session_count,
                                last_activity,
                            },
                        );
                    }
                }
            }
        }
    }
    let mut list: Vec<Project> = projects.into_values().collect();
    list.sort_by(|a, b| b.last_activity.cmp(&a.last_activity));
    list
}

// ===== 异步 Tauri 命令 =====

/// 列出所有项目（异步，不阻塞 UI）
#[tauri::command]
pub async fn list_projects(
    settings: AppSettings,
    registry: tauri::State<'_, ProviderRegistry>,
) -> Result<Vec<Project>, String> {
    let base_paths = collect_base_paths(&settings, &registry);
    tauri::async_runtime::spawn_blocking(move || scan_projects(&base_paths))
        .await
        .map_err(|e| format!("扫描项目失败: {}", e))
}

/// 列出项目中的会话（异步）
#[tauri::command]
pub async fn list_sessions(
    project_path: String,
    provider_name: String,
    registry: tauri::State<'_, ProviderRegistry>,
) -> Result<Vec<SessionSummary>, String> {
    let provider = registry
        .get(&provider_name)
        .cloned()
        .ok_or_else(|| format!("Provider '{}' not found", provider_name))?;

    tauri::async_runtime::spawn_blocking(move || {
        let project_dir = PathBuf::from(&project_path);
        if !project_dir.is_dir() {
            return Err(format!("目录不存在: {}", project_path));
        }
        let project_name = project_dir
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let mut sessions = Vec::new();
        if let Ok(entries) = std::fs::read_dir(&project_dir) {
            for entry in entries.flatten() {
                let file_path = entry.path();
                if file_path.is_file() && path::is_jsonl_file(&file_path) {
                    if let Some(s) =
                        crate::services::parser::create_session_summary(
                            &file_path,
                            &project_name,
                            &project_path,
                            &provider,
                            &provider_name,
                        )
                    {
                        sessions.push(s);
                    }
                }
            }
        }
        sessions.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        Ok(sessions)
    })
    .await
    .map_err(|e| format!("加载会话失败: {}", e))?
}

/// 列出全部会话（异步，不阻塞 UI）
#[tauri::command]
pub async fn list_all_sessions(
    settings: AppSettings,
    registry: tauri::State<'_, ProviderRegistry>,
) -> Result<Vec<SessionSummary>, String> {
    let base_paths = collect_base_paths(&settings, &registry);
    let reg = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut all = Vec::new();
        for (provider_name, base_path) in &base_paths {
            let provider = match reg.get(provider_name) {
                Some(p) => p.clone(),
                None => continue,
            };
            if let Ok(project_entries) = std::fs::read_dir(base_path) {
                for project_entry in project_entries.flatten() {
                    let project_path = project_entry.path();
                    if !project_path.is_dir() {
                        continue;
                    }
                    let project_name = project_path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                    if let Ok(session_entries) =
                        std::fs::read_dir(&project_path)
                    {
                        for session_entry in session_entries.flatten() {
                            let file_path = session_entry.path();
                            if file_path.is_file()
                                && path::is_jsonl_file(&file_path)
                            {
                                if let Some(summary) = crate::services::parser::create_session_summary(
                                    &file_path,
                                    &project_name,
                                    &project_path.to_string_lossy(),
                                    &provider,
                                    provider_name,
                                ) {
                                    all.push(summary);
                                }
                            }
                        }
                    }
                }
            }
        }
        all.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        all
    })
    .await
    .map_err(|e| format!("加载全部会话失败: {}", e))
}

/// 获取会话详情（异步，大文件不卡 UI）
#[tauri::command]
pub async fn get_conversation(
    session_path: String,
    filter: FilterConfig,
    provider_name: String,
    registry: tauri::State<'_, ProviderRegistry>,
) -> Result<SessionDetail, String> {
    let provider = registry
        .get(&provider_name)
        .cloned()
        .ok_or_else(|| format!("Provider '{}' not found", provider_name))?;

    tauri::async_runtime::spawn_blocking(move || {
        let file_path = PathBuf::from(&session_path);
        if !file_path.is_file() {
            return Err(format!("文件不存在: {}", session_path));
        }
        let mut detail =
            parse_session_detail(&file_path, &provider)?;
        detail.events = filter_events(&detail.events, &filter);
        Ok(detail)
    })
    .await
    .map_err(|e| format!("加载会话失败: {}", e))?
}

/// 搜索会话（异步）
#[tauri::command]
pub async fn search_sessions(
    query: String,
    settings: AppSettings,
    registry: tauri::State<'_, ProviderRegistry>,
) -> Result<Vec<SessionSummary>, String> {
    let base_paths = collect_base_paths(&settings, &registry);
    let query_lower = query.to_lowercase();
    let reg = registry.inner().clone();

    tauri::async_runtime::spawn_blocking(move || {
        let mut results = Vec::new();
        for (provider_name, base_path) in &base_paths {
            let provider = match reg.get(provider_name) {
                Some(p) => p.clone(),
                None => continue,
            };
            if let Ok(project_entries) = std::fs::read_dir(base_path) {
                for project_entry in project_entries.flatten() {
                    let project_path = project_entry.path();
                    if !project_path.is_dir() {
                        continue;
                    }
                    let project_name = project_path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                    if let Ok(session_entries) =
                        std::fs::read_dir(&project_path)
                    {
                        for session_entry in session_entries.flatten() {
                            let file_path = session_entry.path();
                            if file_path.is_file()
                                && path::is_jsonl_file(&file_path)
                            {
                                if let Ok(content) =
                                    std::fs::read_to_string(&file_path)
                                {
                                    if content
                                        .to_lowercase()
                                        .contains(&query_lower)
                                    {
                                        if let Some(summary) = crate::services::parser::create_session_summary(
                                            &file_path,
                                            &project_name,
                                            &project_path.to_string_lossy(),
                                            &provider,
                                            provider_name,
                                        ) {
                                            results.push(summary);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        results.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        results.truncate(50);
        results
    })
    .await
    .map_err(|e| format!("搜索失败: {}", e))
}
