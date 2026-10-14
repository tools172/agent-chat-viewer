use std::fs;
use std::path::PathBuf;

use crate::models::FilterConfig;
use crate::providers::ProviderRegistry;
use crate::services::{export_to_markdown, filter_events, parse_session_detail};

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
        serde_json::to_string_pretty(&detail).map_err(|e| format!("序列化失败: {}", e))
    })
    .await
    .map_err(|e| format!("导出失败: {}", e))?
}

/// 写入文本内容到文件
#[tauri::command]
pub fn write_text_file(file_path: String, content: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    // 确保父目录存在
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
        }
    }
    fs::write(&path, &content).map_err(|e| format!("写入文件失败: {}", e))
}

/// 在文件管理器中打开文件所在文件夹（并选中文件）
#[tauri::command]
pub fn open_containing_folder(file_path: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);

    if !path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }

    #[cfg(target_os = "windows")]
    {
        // Windows: explorer /select,<path> 打开文件夹并选中文件
        let status = std::process::Command::new("explorer")
            .arg("/select,")
            .arg(path.to_string_lossy().as_ref())
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {}", e))?;
        // explorer 进程启动后立即返回，不需要等待
        drop(status);
    }

    #[cfg(target_os = "macos")]
    {
        // macOS: open -R <path> 在 Finder 中显示文件
        std::process::Command::new("open")
            .arg("-R")
            .arg(path.to_string_lossy().as_ref())
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        // Linux: xdg-open 打开文件所在目录
        let dir = path.parent().unwrap_or(&path);
        std::process::Command::new("xdg-open")
            .arg(dir.to_string_lossy().as_ref())
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {}", e))?;
    }

    Ok(())
}

/// 在文件管理器中直接打开项目文件夹（不选中特定文件）
#[tauri::command]
pub fn open_project_folder(folder_path: String) -> Result<(), String> {
    let path = PathBuf::from(&folder_path);

    if !path.is_dir() {
        return Err(format!("文件夹不存在: {}", folder_path));
    }

    #[cfg(target_os = "windows")]
    {
        // Windows: explorer <path> 直接打开文件夹
        std::process::Command::new("explorer")
            .arg(path.to_string_lossy().as_ref())
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        // macOS: open <path> 在 Finder 中打开文件夹
        std::process::Command::new("open")
            .arg(path.to_string_lossy().as_ref())
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        // Linux: xdg-open <path> 打开文件夹
        std::process::Command::new("xdg-open")
            .arg(path.to_string_lossy().as_ref())
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {}", e))?;
    }

    Ok(())
}

/// 在系统默认浏览器中打开外部链接（用于版本说明里的 changelog 等 URL）。
#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // Windows: cmd /C start "" <url> 用默认浏览器打开
        std::process::Command::new("cmd")
            .arg("/C")
            .arg("start")
            .arg("")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("打开链接失败: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("打开链接失败: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("打开链接失败: {}", e))?;
    }

    Ok(())
}
