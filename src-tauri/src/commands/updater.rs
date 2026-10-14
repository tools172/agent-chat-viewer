//! 版本升级：检测最新版本、下载安装包、启动安装器。
//!
//! 数据源为 GitHub Releases（`releases/latest`），版本比较用 semver，
//! 安装包类型（NSIS `.exe` / WiX `.msi`）通过 Windows 卸载注册表自动匹配。

use std::cmp::Ordering;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};

/// 更新检测目标仓库（owner/repo）
const REPO: &str = "tools172/agent-chat-viewer";

/// GitHub API 要求带 User-Agent，否则返回 403
const USER_AGENT: &str = "agent-chat-viewer-updater";

/// 安装包类型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum InstallerKind {
    /// NSIS 打包的 `.exe` 安装器
    Nsis,
    /// WiX 打包的 `.msi` 安装器
    Msi,
}

/// 传递给前端的新版本信息
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    pub notes: String,
    pub asset_url: String,
    pub asset_name: String,
}

/// GitHub Releases API 返回结构（仅取需要的字段）
#[derive(Debug, Clone, Deserialize)]
struct GithubRelease {
    tag_name: String,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Clone, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

/// 检查是否有新版本。有则返回 `Some(UpdateInfo)`；已是最新 / 网络出错 / 限流时返回 `None`（前端静默）。
#[tauri::command]
pub async fn check_for_update(app: tauri::AppHandle) -> Option<UpdateInfo> {
    let current = app.package_info().version.to_string();
    tauri::async_runtime::spawn_blocking(move || check_latest(&current))
        .await
        .ok()
        .flatten()
}

/// 下载进度（通过 Channel 推送给前端）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub received: u64,
    pub total: u64,
}

/// 下载安装包到临时目录，返回保存路径。下载过程通过 Channel 推送进度。
#[tauri::command]
pub async fn download_update(
    asset_url: String,
    asset_name: String,
    on_event: tauri::ipc::Channel<DownloadProgress>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        download_to_temp(&asset_url, &asset_name, on_event)
    })
    .await
    .map_err(|e| format!("下载任务失败: {}", e))?
}

/// 启动安装器并退出当前应用（让出 exe 锁，便于安装器覆盖）。
#[tauri::command]
pub fn install_update(app: tauri::AppHandle, file_path: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    if !path.is_file() {
        return Err(format!("安装包不存在: {}", file_path));
    }
    launch_installer(&path)?;
    app.exit(0);
    Ok(())
}

/// 阻塞式的检查逻辑（放在 spawn_blocking 中执行，避免卡 UI）
fn check_latest(current: &str) -> Option<UpdateInfo> {
    let current = semver::Version::parse(current).ok()?;
    let release = fetch_latest_release().ok()?;
    let latest = parse_newer_version(&release.tag_name, &current)?;

    let exe_path = std::env::current_exe().ok()?;
    let kind = detect_installer_kind(&exe_path);
    let asset = select_asset(&release.assets, kind)?;

    Some(UpdateInfo {
        version: latest.to_string(),
        current_version: current.to_string(),
        notes: release.body.unwrap_or_default(),
        asset_url: asset.browser_download_url,
        asset_name: asset.name,
    })
}

/// 构建带超时的 HTTP agent（避免连接被墙时长时间挂起）。
fn http_agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(15))
        .timeout_read(Duration::from_secs(60))
        .build()
}

/// 请求 GitHub Releases 的最新版本。
fn fetch_latest_release() -> Result<GithubRelease, String> {
    let url = format!("https://api.github.com/repos/{}/releases/latest", REPO);
    let response = http_agent()
        .get(&url)
        .set("User-Agent", USER_AGENT)
        .set("Accept", "application/vnd.github+json")
        .call()
        .map_err(|e| format!("请求失败: {}", e))?;
    response
        .into_json::<GithubRelease>()
        .map_err(|e| format!("解析失败: {}", e))
}

/// 解析 tag 并比较：仅当 tag 对应的版本严格大于当前版本时才返回该版本。
fn parse_newer_version(tag_name: &str, current: &semver::Version) -> Option<semver::Version> {
    let latest = semver::Version::parse(tag_name.trim_start_matches('v')).ok()?;
    if latest.cmp(current) == Ordering::Greater {
        Some(latest)
    } else {
        None
    }
}

/// 依据检测到的安装包类型选择 release 资产，缺失时回退。
fn select_asset(assets: &[GithubAsset], kind: Option<InstallerKind>) -> Option<GithubAsset> {
    let setup_exe = assets
        .iter()
        .find(|a| a.name.ends_with(".exe") && a.name.contains("x64-setup"))
        .or_else(|| assets.iter().find(|a| a.name.ends_with(".exe")));
    let msi = assets.iter().find(|a| a.name.ends_with(".msi"));

    match kind {
        // MSI 安装：优先 .msi，回退 .exe
        Some(InstallerKind::Msi) => msi.or(setup_exe),
        // NSIS 或未知（dev / 便携运行）：优先 .exe，回退 .msi
        Some(InstallerKind::Nsis) | None => setup_exe.or(msi),
    }
    .cloned()
}

/// 更新安装包所在的临时目录。
fn update_temp_dir() -> PathBuf {
    std::env::temp_dir().join("agent-chat-viewer-update")
}

/// 删除目录内的普通文件（best-effort：删除失败/被占用时忽略）。
fn cleanup_dir(dir: &Path) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let _ = std::fs::remove_file(path);
            }
        }
    }
}

/// 清理升级下载的临时安装包（由新版本启动时调用，旧安装器此时已退出、文件已解锁）。
pub(crate) fn cleanup_update_artifacts() {
    cleanup_dir(&update_temp_dir());
}

/// 下载安装包到临时目录，返回完整路径。边下边通过 Channel 推送进度。
fn download_to_temp(
    asset_url: &str,
    asset_name: &str,
    on_event: tauri::ipc::Channel<DownloadProgress>,
) -> Result<String, String> {
    let dir = update_temp_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建目录失败: {}", e))?;
    // 下载前清空旧安装包，避免堆积
    cleanup_dir(&dir);
    let path = dir.join(asset_name);

    let response = http_agent()
        .get(asset_url)
        .set("User-Agent", USER_AGENT)
        .call()
        .map_err(|e| format!("下载失败: {}", e))?;

    let total: u64 = response
        .header("Content-Length")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);

    let mut reader = response.into_reader();
    let mut file = std::fs::File::create(&path).map_err(|e| format!("创建文件失败: {}", e))?;
    let mut buf = [0u8; 256 * 1024];
    let mut received: u64 = 0;
    loop {
        let n = reader.read(&mut buf).map_err(|e| format!("读取失败: {}", e))?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| format!("写入失败: {}", e))?;
        received += n as u64;
        let _ = on_event.send(DownloadProgress { received, total });
    }
    file.flush().map_err(|e| format!("刷新文件失败: {}", e))?;

    Ok(path.to_string_lossy().to_string())
}

/// 启动安装器（Windows）。
#[cfg(target_os = "windows")]
fn launch_installer(path: &Path) -> Result<(), String> {
    if path.extension().and_then(|e| e.to_str()) == Some("msi") {
        std::process::Command::new("msiexec")
            .arg("/i")
            .arg(path)
            .spawn()
            .map_err(|e| format!("启动 MSI 安装器失败: {}", e))?;
    } else {
        std::process::Command::new(path)
            .spawn()
            .map_err(|e| format!("启动安装器失败: {}", e))?;
    }
    Ok(())
}

/// 非 Windows 平台暂不支持自动安装。
#[cfg(not(target_os = "windows"))]
fn launch_installer(_path: &Path) -> Result<(), String> {
    Err("当前平台暂不支持自动安装升级".to_string())
}

/// 检测当前应用是通过哪种安装包安装的（Windows）。
///
/// 依据：卸载注册表条目中，MSI（WiX）条目带 `WindowsInstaller = 1` 且子键为 GUID，
/// NSIS 条目的 `UninstallString` 指向 `uninstall.exe`。
#[cfg(windows)]
fn detect_installer_kind(current_exe: &Path) -> Option<InstallerKind> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    let exe_dir = current_exe.parent()?.to_string_lossy().to_lowercase();

    let uninstall_paths = [
        (
            HKEY_LOCAL_MACHINE,
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall",
        ),
        (
            HKEY_LOCAL_MACHINE,
            r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        ),
        (
            HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall",
        ),
    ];

    for (hive, path) in uninstall_paths {
        let root = match RegKey::predef(hive).open_subkey_with_flags(path, KEY_READ) {
            Ok(k) => k,
            Err(_) => continue,
        };

        for subkey_name in root.enum_keys().flatten() {
            let subkey = match root.open_subkey_with_flags(&subkey_name, KEY_READ) {
                Ok(k) => k,
                Err(_) => continue,
            };

            let install_location: Option<String> = subkey.get_value("InstallLocation").ok();
            let display_icon: Option<String> = subkey.get_value("DisplayIcon").ok();

            // 通过 InstallLocation / DisplayIcon 是否包含当前 exe 所在目录来判断归属
            let is_ours = [&install_location, &display_icon]
                .into_iter()
                .flatten()
                .any(|p| p.to_lowercase().contains(&exe_dir));

            if !is_ours {
                continue;
            }

            let is_msi = subkey
                .get_value::<u32, _>("WindowsInstaller")
                .map(|v| v == 1)
                .unwrap_or(false);

            return Some(if is_msi {
                InstallerKind::Msi
            } else {
                InstallerKind::Nsis
            });
        }
    }

    None
}

/// 非 Windows 平台：无法检测，交由 select_asset 回退默认。
#[cfg(not(windows))]
fn detect_installer_kind(_current_exe: &Path) -> Option<InstallerKind> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn asset(name: &str) -> GithubAsset {
        GithubAsset {
            name: name.to_string(),
            browser_download_url: format!("https://example.com/{}", name),
        }
    }

    #[test]
    fn test_parse_newer_version() {
        let current = semver::Version::parse("0.2.1").unwrap();

        assert_eq!(
            parse_newer_version("v0.2.2", &current).unwrap().to_string(),
            "0.2.2"
        );
        // 去掉 v 前缀也 OK
        assert_eq!(
            parse_newer_version("0.3.0", &current).unwrap().to_string(),
            "0.3.0"
        );
        // 相等 / 更旧 / 非法 tag → None
        assert!(parse_newer_version("v0.2.1", &current).is_none());
        assert!(parse_newer_version("v0.2.0", &current).is_none());
        assert!(parse_newer_version("not-a-version", &current).is_none());
    }

    #[test]
    fn test_select_asset_prefers_nsis_exe() {
        let assets = vec![
            asset("Agent-Chat-Viewer_0.2.2_x64_en-US.msi"),
            asset("Agent-Chat-Viewer_0.2.2_x64-setup.exe"),
        ];
        let picked = select_asset(&assets, Some(InstallerKind::Nsis)).unwrap();
        assert_eq!(picked.name, "Agent-Chat-Viewer_0.2.2_x64-setup.exe");

        // 未知类型（dev/便携）也默认 NSIS
        let picked = select_asset(&assets, None).unwrap();
        assert_eq!(picked.name, "Agent-Chat-Viewer_0.2.2_x64-setup.exe");
    }

    #[test]
    fn test_select_asset_prefers_msi() {
        let assets = vec![
            asset("Agent-Chat-Viewer_0.2.2_x64-setup.exe"),
            asset("Agent-Chat-Viewer_0.2.2_x64_en-US.msi"),
        ];
        let picked = select_asset(&assets, Some(InstallerKind::Msi)).unwrap();
        assert_eq!(picked.name, "Agent-Chat-Viewer_0.2.2_x64_en-US.msi");
    }

    #[test]
    fn test_select_asset_falls_back_when_type_missing() {
        // 只有 exe，但检测到 MSI → 回退 exe
        let assets = vec![asset("Agent-Chat-Viewer_0.2.2_x64-setup.exe")];
        let picked = select_asset(&assets, Some(InstallerKind::Msi)).unwrap();
        assert_eq!(picked.name, "Agent-Chat-Viewer_0.2.2_x64-setup.exe");

        // 只有 msi，但检测到 NSIS → 回退 msi
        let assets = vec![asset("Agent-Chat-Viewer_0.2.2_x64_en-US.msi")];
        let picked = select_asset(&assets, Some(InstallerKind::Nsis)).unwrap();
        assert_eq!(picked.name, "Agent-Chat-Viewer_0.2.2_x64_en-US.msi");
    }

    #[test]
    fn test_select_asset_empty() {
        assert!(select_asset(&[], None).is_none());
    }

    #[test]
    fn test_cleanup_dir_removes_files_but_keeps_dirs() {
        let tmp = tempfile::tempdir().unwrap();
        let f1 = tmp.path().join("a.exe");
        let f2 = tmp.path().join("b.msi");
        std::fs::write(&f1, "x").unwrap();
        std::fs::write(&f2, "y").unwrap();
        let sub = tmp.path().join("sub");
        std::fs::create_dir_all(&sub).unwrap();

        cleanup_dir(tmp.path());

        assert!(!f1.exists());
        assert!(!f2.exists());
        assert!(sub.exists());
    }
}
