use std::path::PathBuf;

use crate::models::FilterConfig;
use crate::services::{export_to_markdown, filter_events, parse_session_detail};
use crate::providers::ProviderRegistry;

/// 导出会话为 Markdown（异步）
#[tauri::command]
pub async fn export_markdown(
    session_path: String,
    filter: FilterConfig,
    provider_name: String,
    registry: tauri::State<'_, ProviderRegistry>,
) -> Result<String, String> {
    let provider = registry
        .get(&provider_name)
        .cloned()
        .ok_or_else(|| format!("Provider '{}' not found", provider_name))?;

    tauri::async_runtime::spawn_blocking(move || {
        let file_path = PathBuf::from(&session_path);
        if !file_path.is_file() {
            return Err(format!("File not found: {}", session_path));
        }
        let detail = parse_session_detail(&file_path, &provider)?;
        let project_name = file_path
            .parent()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let title = detail
            .events
            .iter()
            .find_map(|e| {
                e.content.iter().find_map(|b| match b {
                    crate::models::ContentBlock::Text { text } => {
                        Some(text.chars().take(80).collect::<String>())
                    }
                    _ => None,
                })
            })
            .unwrap_or_else(|| "Untitled Session".to_string());
        let filtered_events = filter_events(&detail.events, &filter);
        Ok(export_to_markdown(&filtered_events, &title, &project_name))
    })
    .await
    .map_err(|e| format!("导出失败: {}", e))?
}

/// 导出会话为 JSON（异步）
#[tauri::command]
pub async fn export_json(
    session_path: String,
    provider_name: String,
    registry: tauri::State<'_, ProviderRegistry>,
) -> Result<String, String> {
    let provider = registry
        .get(&provider_name)
        .cloned()
        .ok_or_else(|| format!("Provider '{}' not found", provider_name))?;

    tauri::async_runtime::spawn_blocking(move || {
        let file_path = PathBuf::from(&session_path);
        if !file_path.is_file() {
            return Err(format!("File not found: {}", session_path));
        }
        let detail = parse_session_detail(&file_path, &provider)?;
        serde_json::to_string_pretty(&detail)
            .map_err(|e| format!("序列化失败: {}", e))
    })
    .await
    .map_err(|e| format!("导出失败: {}", e))?
}
