use std::collections::HashMap;
use std::path::PathBuf;

use crate::models::{AppSettings, FilterConfig, Project, SessionDetail, SessionSummary};
use crate::providers::ProviderRegistry;
use crate::services::{filter_events, parse_session_detail};

/// 收集所有需要扫描的基础路径
fn collect_base_paths(
    settings: &AppSettings,
    registry: &ProviderRegistry,
) -> Vec<(String, PathBuf)> {
    let mut paths: Vec<(String, PathBuf)> = Vec::new();
    // 已启用 provider 的默认路径
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
    // 自定义监控目录：自动检测 provider 并规范化路径深度
    for dir in &settings.watch_directories {
        let raw = crate::utils::path::normalize_path(dir);
        if !raw.exists() {
            continue;
        }
        if let Some((provider_name, base_path)) = resolve_watch_path(&raw, registry) {
            // 只添加启用了的 provider
            if settings
                .provider_enabled
                .get(&provider_name)
                .copied()
                .unwrap_or(true)
            {
                paths.push((provider_name, base_path));
            }
        }
    }
    paths
}

/// 解析自定义监控目录：自动检测 provider 并确定正确的扫描根路径
///
/// 返回 `(provider_name, base_path)`，其中 `base_path` 是扫描项目的根目录。
///
/// 支持的目录结构：
/// - OpenClaw: `<root>/agents/<agent>/sessions/*.jsonl`
/// - Claude Code: `<root>/projects/<project>/*.jsonl`
fn resolve_watch_path(
    raw: &std::path::Path,
    registry: &ProviderRegistry,
) -> Option<(String, std::path::PathBuf)> {
    let normalized = raw.to_path_buf();

    // 1) 如果直指 sessions 目录，向上走一层到项目/agent 目录
    let project_dir = if normalized
        .file_name()
        .map_or(false, |n| n == "sessions")
    {
        normalized.parent()?.to_path_buf()
    } else {
        normalized.clone()
    };

    // 2) 路径前缀检测（内置 provider 的默认位置）
    if let Some(provider) = registry.detect_provider(&project_dir) {
        return Some((provider.name().to_string(), project_dir));
    }

    // 3) 结构检测：看 project_dir 的父目录名称
    if let Some(parent) = project_dir.parent() {
        let parent_name = parent
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        // `<root>/agents/<project>` → OpenClaw 结构，根基是 agents/
        if parent_name == "agents" {
            return Some(("openclaw".to_string(), parent.to_path_buf()));
        }
        // `<root>/projects/<project>` → Claude Code 结构
        if parent_name == "projects" {
            return Some(("claude_code".to_string(), parent.to_path_buf()));
        }

        // 如果 project_dir 下有 sessions/ 子目录 → OpenClaw 特征
        if project_dir.join("sessions").is_dir() {
            return Some(("openclaw".to_string(), parent.to_path_buf()));
        }
    }

    // 4) 如果 project_dir 下有 sessions/（且没走到上面 parent 逻辑）
    if project_dir.join("sessions").is_dir() {
        let base = project_dir
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| project_dir.clone());
        return Some(("openclaw".to_string(), base));
    }

    // 5) 最终 fallback：project_dir 自身作为扫描根，claude_code 解析
    Some(("claude_code".to_string(), project_dir))
}

/// 扫描项目列表（纯同步函数，供 spawn_blocking 调用）
fn scan_projects(
    base_paths: &[(String, PathBuf)],
    registry: &ProviderRegistry,
) -> Vec<Project> {
    let mut projects: HashMap<String, Project> = HashMap::new();
    for (provider_name, base_path) in base_paths {
        let provider = match registry.get(provider_name) {
            Some(p) => p,
            None => continue,
        };
        if let Ok(entries) = std::fs::read_dir(base_path) {
            for entry in entries.flatten() {
                let entry_path = entry.path();
                if entry_path.is_dir() {
                    let project_name = entry_path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                    let project_key =
                        format!("{}:{}", provider_name, project_name);
                    let session_files = provider.enumerate_session_files(&entry_path);
                    let session_count = session_files.len() as u32;
                    let mut last_activity = String::new();
                    for session_path in &session_files {
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
                    if session_count > 0 {
                        projects.insert(
                            project_key,
                            Project {
                                name: project_name,
                                path: entry_path
                                    .to_string_lossy()
                                    .to_string(),
                                session_count,
                                last_activity,
                                provider_name: provider_name.clone(),
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
    let reg = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || scan_projects(&base_paths, &reg))
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
        let session_files = provider.enumerate_session_files(&project_dir);
        let mut sessions: Vec<SessionSummary> = session_files
            .iter()
            .filter_map(|file_path| {
                crate::services::parser::create_session_summary(
                    file_path,
                    &project_name,
                    &project_path,
                    &provider,
                    &provider_name,
                )
            })
            .collect();
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
                    for file_path in provider.enumerate_session_files(&project_path) {
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
                    for file_path in provider.enumerate_session_files(&project_path) {
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
        results.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        results.truncate(50);
        results
    })
    .await
    .map_err(|e| format!("搜索失败: {}", e))
}
