use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::models::{AppSettings, FilterConfig, Project, SessionDetail, SessionSummary};
use crate::providers::ProviderRegistry;
use crate::services::{filter_events, parse_session_detail};

/// 递归扫描的最大深度（覆盖 `<root>/agents/<agent>/sessions/*.jsonl` 三层 + 一层余量）
const MAX_SCAN_DEPTH: u32 = 4;

/// 收集所有需要扫描的基础路径。
///
/// - 已启用 provider 的默认路径：使用已知 provider 扫描
/// - 自定义监控目录：provider 留空，在扫描时通过内容自动检测
pub(crate) fn collect_base_paths(
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

    // 自定义监控目录：始终扫描，provider 由内容检测决定（禁用的目录跳过）
    for wd in &settings.watch_directories {
        if !wd.enabled {
            continue;
        }
        let raw = crate::utils::path::normalize_path(&wd.path);
        if raw.exists() {
            paths.push((String::new(), raw));
        }
    }

    paths
}

/// 递归遍历目录，发现所有 `.jsonl` 会话文件，按项目目录分组。
///
/// - 如果目录下有 `sessions/` 子目录，以该目录作为项目，扫描 `sessions/` 下的文件
/// - 如果目录下直接有 `.jsonl` 文件，以该目录作为项目
/// - 深度限制 `MAX_SCAN_DEPTH`
pub(crate) fn discover_session_files(dir: &Path, depth: u32) -> HashMap<PathBuf, Vec<PathBuf>> {
    let mut projects: HashMap<PathBuf, Vec<PathBuf>> = HashMap::new();

    if depth > MAX_SCAN_DEPTH || !dir.is_dir() {
        return projects;
    }

    let entries: Vec<std::fs::DirEntry> = match std::fs::read_dir(dir) {
        Ok(entries) => entries.flatten().collect(),
        Err(_) => return projects,
    };

    // 检查 sessions/ 子目录（OpenClaw 模式）
    let sessions_dir = dir.join("sessions");
    if sessions_dir.is_dir() {
        if let Ok(session_entries) = std::fs::read_dir(&sessions_dir) {
            let files: Vec<PathBuf> = session_entries
                .flatten()
                .map(|e| e.path())
                .filter(|p| crate::utils::path::is_jsonl_file(p))
                .collect();
            if !files.is_empty() {
                projects.insert(dir.to_path_buf(), files);
            }
        }
    }

    // 检查当前目录下的直接 .jsonl 文件
    let direct_files: Vec<PathBuf> = entries
        .iter()
        .map(|e| e.path())
        .filter(|p| p.is_file() && crate::utils::path::is_jsonl_file(p))
        .collect();
    if !direct_files.is_empty() {
        projects
            .entry(dir.to_path_buf())
            .or_default()
            .extend(direct_files);
    }

    // 递归进入子目录（跳过 sessions 避免重复）
    for entry in entries {
        let path = entry.path();
        if path.is_dir()
            && path
                .file_name()
                .map_or(false, |n| n != "sessions")
        {
            let sub = discover_session_files(&path, depth + 1);
            for (proj_dir, files) in sub {
                projects.entry(proj_dir).or_default().extend(files);
            }
        }
    }

    projects
}

/// 读取文件内容的前几行，通过已注册的 provider 检测其格式。
/// 返回匹配的 provider 名称。
pub(crate) fn detect_provider_from_file(
    file_path: &Path,
    registry: &ProviderRegistry,
) -> Option<String> {
    // 只读文件的前 4KB 足够覆盖第一行 JSON
    if let Ok(content) = std::fs::read_to_string(file_path) {
        if let Some(provider) = registry.detect_by_content(&content) {
            return Some(provider.name().to_string());
        }
    }
    None
}

/// 扫描项目列表（纯同步函数，供 spawn_blocking 调用）
fn scan_projects(
    base_paths: &[(String, PathBuf)],
    registry: &ProviderRegistry,
    settings: &AppSettings,
) -> Vec<Project> {
    let mut projects: HashMap<String, Project> = HashMap::new();

    for (provider_name, base_path) in base_paths {
        if provider_name.is_empty() {
            // 自定义监控目录：递归发现 + 内容检测
            let discovered = discover_session_files(base_path, 0);
            for (project_dir, files) in &discovered {
                let project_name = project_dir
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                let detected_provider = files
                    .first()
                    .and_then(|f| detect_provider_from_file(f, registry))
                    .unwrap_or_else(|| "claude_code".to_string());
                // 内容检测出的 provider 必须在设置中已启用
                if !settings.is_provider_enabled(&detected_provider) {
                    continue;
                }
                let project_key = format!("{}:{}", detected_provider, project_name);
                let session_count = files.len() as u32;
                let mut last_activity = String::new();
                for session_path in files {
                    if let Ok(metadata) = session_path.metadata() {
                        if let Ok(modified) = metadata.modified() {
                            let dt: chrono::DateTime<chrono::Utc> = modified.into();
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
                            path: project_dir.to_string_lossy().to_string(),
                            session_count,
                            last_activity,
                            provider_name: detected_provider,
                        },
                    );
                }
            }
        } else {
            // 已知 provider：单层子目录扫描（保持原有行为）
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
                        let session_files =
                            provider.enumerate_session_files(&entry_path);
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
    tauri::async_runtime::spawn_blocking(move || scan_projects(&base_paths, &reg, &settings))
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
                crate::services::parser::create_skeleton_summary(
                    file_path,
                    &project_name,
                    &project_path,
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
    let provider_enabled = settings.provider_enabled.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let mut all = Vec::new();

        for (provider_name, base_path) in &base_paths {
            if provider_name.is_empty() {
                // 自定义监控目录：递归发现 + 内容检测
                let discovered = discover_session_files(base_path, 0);
                for (project_dir, files) in &discovered {
                    let project_name = project_dir
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                    let project_path_str = project_dir.to_string_lossy().to_string();
                    let detected_provider = files
                        .first()
                        .and_then(|f| detect_provider_from_file(f, &reg))
                        .unwrap_or_else(|| "claude_code".to_string());
                    // 内容检测出的 provider 必须在设置中已启用
                    if !provider_enabled
                        .get(&detected_provider)
                        .copied()
                        .unwrap_or(true)
                    {
                        continue;
                    }
                    for file_path in files {
                        if let Some(summary) =
                            crate::services::parser::create_skeleton_summary(
                                file_path,
                                &project_name,
                                &project_path_str,
                                &detected_provider,
                            )
                        {
                            all.push(summary);
                        }
                    }
                }
            } else {
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
                        for file_path in
                            provider.enumerate_session_files(&project_path)
                        {
                            if let Some(summary) =
                                crate::services::parser::create_skeleton_summary(
                                    &file_path,
                                    &project_name,
                                    &project_path.to_string_lossy(),
                                    provider_name,
                                )
                            {
                                all.push(summary);
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

/// 渐进式 refine：对已快速加载的会话列表执行 display 清洗 + client_type 检测。
/// 输入为 `[(filePath, providerName)]`，返回对应的 `SessionPolish` 列表。
#[tauri::command]
pub async fn polish_sessions(
    sessions: Vec<(String, String)>,
    registry: tauri::State<'_, ProviderRegistry>,
) -> Result<Vec<crate::services::parser::SessionPolish>, String> {
    let reg = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        use std::sync::{Arc, Mutex};
        let results = Arc::new(Mutex::new(Vec::new()));
        let reg = Arc::new(reg);
        let mut handles = Vec::new();
        for chunk in sessions.chunks(5) {
            let results = Arc::clone(&results);
            let reg = Arc::clone(&reg);
            let chunk: Vec<_> = chunk.to_vec();
            handles.push(std::thread::spawn(move || {
                for (file_path, provider_name) in &chunk {
                    if let Some(provider) = reg.get(provider_name) {
                        if let Some(polish) = crate::services::parser::polish_session(
                            Path::new(&file_path),
                            provider,
                        ) {
                            results.lock().unwrap().push(polish);
                        }
                    }
                }
            }));
        }
        for h in handles {
            h.join().ok();
        }
        Arc::try_unwrap(results).unwrap().into_inner().unwrap()
    })
    .await
    .map_err(|e| format!("polish 失败: {}", e))
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
        let mut detail = parse_session_detail(&file_path, &provider)?;
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
    let provider_enabled = settings.provider_enabled.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let mut results = Vec::new();

        for (provider_name, base_path) in &base_paths {
            if provider_name.is_empty() {
                // 自定义监控目录：递归发现 + 内容检测
                let discovered = discover_session_files(base_path, 0);
                for (project_dir, files) in &discovered {
                    let project_name = project_dir
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                    let project_path_str = project_dir.to_string_lossy().to_string();
                    let detected_provider = files
                        .first()
                        .and_then(|f| detect_provider_from_file(f, &reg))
                        .unwrap_or_else(|| "claude_code".to_string());
                    // 内容检测出的 provider 必须在设置中已启用
                    if !provider_enabled
                        .get(&detected_provider)
                        .copied()
                        .unwrap_or(true)
                    {
                        continue;
                    }
                    let provider = match reg.get(&detected_provider) {
                        Some(p) => p.clone(),
                        None => continue,
                    };
                    for file_path in files {
                        if let Ok(content) = std::fs::read_to_string(&file_path) {
                            if content.to_lowercase().contains(&query_lower) {
                                if let Some(summary) =
                                    crate::services::parser::create_session_summary(
                                        &file_path,
                                        &project_name,
                                        &project_path_str,
                                        &provider,
                                        true,
                                    )
                                {
                                    results.push(summary);
                                }
                            }
                        }
                    }
                }
            } else {
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
                        for file_path in
                            provider.enumerate_session_files(&project_path)
                        {
                            if let Ok(content) =
                                std::fs::read_to_string(&file_path)
                            {
                                if content
                                    .to_lowercase()
                                    .contains(&query_lower)
                                {
                                    if let Some(summary) =
                                        crate::services::parser::create_session_summary(
                                            &file_path,
                                            &project_name,
                                            &project_path.to_string_lossy(),
                                            &provider,
                                            true,
                                        )
                                    {
                                        results.push(summary);
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_file(dir: &std::path::Path, name: &str, content: &str) {
        let path = dir.join(name);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        let mut f = std::fs::File::create(&path).unwrap();
        f.write_all(content.as_bytes()).unwrap();
    }

    #[test]
    fn test_discover_flat_directory() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();

        write_file(
            root,
            "001.jsonl",
            r#"{"type":"session","version":3,"id":"abc-123","timestamp":"2026-04-17T04:44:21.996Z","cwd":"/home/user/workspace"}
{"type":"message","id":"u1","message":{"role":"user","content":[{"type":"text","text":"Hello"}]}}"#,
        );
        write_file(
            root,
            "002.jsonl",
            r#"{"type":"session","version":3,"id":"def-456","timestamp":"2026-04-17T04:44:21.996Z","cwd":"/home/user/workspace"}
{"type":"message","id":"u2","message":{"role":"user","content":[{"type":"text","text":"World"}]}}"#,
        );
        write_file(root, "notes.txt", "not a session file");

        let result = discover_session_files(root, 0);
        assert_eq!(result.len(), 1);
        let files = result.get(root).unwrap();
        assert_eq!(files.len(), 2);
    }

    #[test]
    fn test_discover_nested_sessions_directory() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();

        let agent_a = root.join("agent-a");
        write_file(
            &agent_a.join("sessions"),
            "001.jsonl",
            r#"{"type":"session","version":3,"id":"abc-123","timestamp":"2026-04-17T04:44:21.996Z","cwd":"/home/user/workspace"}
{"type":"message","id":"u1","message":{"role":"user","content":[{"type":"text","text":"Hello"}]}}"#,
        );

        let agent_b = root.join("agent-b");
        write_file(
            &agent_b.join("sessions"),
            "002.jsonl",
            r#"{"type":"session","version":3,"id":"def-456","timestamp":"2026-04-17T04:44:21.996Z","cwd":"/home/user/workspace"}
{"type":"message","id":"u2","message":{"role":"user","content":[{"type":"text","text":"World"}]}}"#,
        );

        let result = discover_session_files(root, 0);
        assert_eq!(result.len(), 2);
        assert!(result.contains_key(&agent_a));
        assert!(result.contains_key(&agent_b));
    }

    #[test]
    fn test_discover_mixed_structure() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();

        let agent_a = root.join("agent-a");
        write_file(
            &agent_a.join("sessions"),
            "001.jsonl",
            r#"{"type":"session","version":3,"id":"abc-123","timestamp":"2026-04-17T04:44:21.996Z","cwd":"/home/user/workspace"}
{"type":"message","id":"u1","message":{"role":"user","content":[{"type":"text","text":"Hello"}]}}"#,
        );

        let standalone = root.join("standalone");
        write_file(
            &standalone,
            "002.jsonl",
            r#"{"type":"session","version":3,"id":"def-456","timestamp":"2026-04-17T04:44:21.996Z","cwd":"/home/user/workspace"}
{"type":"message","id":"u2","message":{"role":"user","content":[{"type":"text","text":"World"}]}}"#,
        );

        let result = discover_session_files(root, 0);
        assert_eq!(result.len(), 2);
        assert!(result.contains_key(&agent_a));
        assert!(result.contains_key(&standalone));
    }

    #[test]
    fn test_discover_empty_directory() {
        let tmp = tempfile::tempdir().unwrap();
        let result = discover_session_files(tmp.path(), 0);
        assert!(result.is_empty());
    }

    #[test]
    fn test_discover_respects_max_depth() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();

        let deep = root.join("a").join("b").join("c").join("d").join("e");
        write_file(
            &deep.join("sessions"),
            "deep.jsonl",
            r#"{"type":"session","version":3,"id":"deep-1","timestamp":"2026-04-17T04:44:21.996Z","cwd":"/home/user/workspace"}"#,
        );

        let result = discover_session_files(root, 0);
        assert!(result.is_empty());
    }

    #[test]
    fn test_detect_provider_from_file_openclaw() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("test.jsonl");
        let content = r#"{"type":"session","version":3,"id":"abc-123","timestamp":"2026-04-17T04:44:21.996Z","cwd":"/home/user/workspace"}
{"type":"message","id":"u1","message":{"role":"user","content":[{"type":"text","text":"Hello"}]}}"#;
        std::fs::write(&file_path, content).unwrap();

        let registry = crate::providers::ProviderRegistry::new();
        let name = detect_provider_from_file(&file_path, &registry);
        assert_eq!(name, Some("openclaw".to_string()));
    }

    #[test]
    fn test_detect_provider_from_file_claude_code() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("test.jsonl");
        let content = r#"{"type":"user","message":{"role":"user","content":"Hello"},"uuid":"u-001","timestamp":"2026-06-09T10:00:00Z","sessionId":"s1"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hi"}]},"uuid":"u-002","timestamp":"2026-06-09T10:00:01Z","sessionId":"s1"}"#;
        std::fs::write(&file_path, content).unwrap();

        let registry = crate::providers::ProviderRegistry::new();
        let name = detect_provider_from_file(&file_path, &registry);
        assert_eq!(name, Some("claude_code".to_string()));
    }

    #[test]
    fn test_collect_base_paths_includes_custom_dirs_regardless_of_provider_enabled() {
        use crate::models::{AppSettings, WatchDirectory};
        use std::collections::HashMap;

        let registry = crate::providers::ProviderRegistry::new();

        let mut provider_enabled = HashMap::new();
        provider_enabled.insert("claude_code".to_string(), false);
        provider_enabled.insert("openclaw".to_string(), false);

        let tmp = tempfile::tempdir().unwrap();
        let watch_dir = tmp.path().to_string_lossy().to_string();

        let settings = AppSettings {
            watch_directories: vec![WatchDirectory {
                path: watch_dir,
                enabled: true,
            }],
            provider_enabled,
            ..AppSettings::default()
        };

        let paths = collect_base_paths(&settings, &registry);

        // 自定义目录应被包含（provider 名称为空，表示自动检测）
        let has_custom = paths.iter().any(|(name, _)| name.is_empty());
        assert!(
            has_custom,
            "自定义监控目录不应受 provider_enabled 限制"
        );
    }

    #[test]
    fn test_collect_base_paths_skips_disabled_directories() {
        use crate::models::{AppSettings, WatchDirectory};
        use std::collections::HashMap;

        let registry = crate::providers::ProviderRegistry::new();

        let mut provider_enabled = HashMap::new();
        provider_enabled.insert("claude_code".to_string(), true);

        let tmp = tempfile::tempdir().unwrap();
        let watch_dir = tmp.path().to_string_lossy().to_string();

        let settings = AppSettings {
            watch_directories: vec![WatchDirectory {
                path: watch_dir,
                enabled: false,
            }],
            provider_enabled,
            ..AppSettings::default()
        };

        let paths = collect_base_paths(&settings, &registry);

        // 禁用的目录不应出现在扫描路径中
        assert!(
            paths.iter().all(|(name, _)| !name.is_empty()),
            "禁用的自定义目录应被跳过"
        );
    }
}
