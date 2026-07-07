use serde::de;
use serde::{Deserialize, Deserializer, Serialize};

/// Configuration for filtering events in a session view
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterConfig {
    pub show_thinking: bool,
    pub show_tool_calls: bool,
    pub show_tool_results: bool,
    pub hide_empty_tool_results: bool,
    pub show_system_messages: bool,
    pub show_file_snapshots: bool,
    /// 合并连发：折叠同一角色的连续消息，只显示最后一条
    #[serde(default)]
    pub collapse_consecutive: bool,
}

impl Default for FilterConfig {
    fn default() -> Self {
        Self {
            show_thinking: false,
            show_tool_calls: true,
            show_tool_results: true,
            hide_empty_tool_results: true,
            show_system_messages: false,
            show_file_snapshots: false,
            collapse_consecutive: false,
        }
    }
}

/// Search highlight color configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchColors {
    #[serde(default = "default_search_color")]
    pub search: String,
    #[serde(default = "default_find_color")]
    pub find: String,
}

fn default_search_color() -> String {
    "#fef08a".to_string()
}
fn default_find_color() -> String {
    "#fed7aa".to_string()
}

impl Default for SearchColors {
    fn default() -> Self {
        Self {
            search: default_search_color(),
            find: default_find_color(),
        }
    }
}

/// A monitored directory entry with its enabled state
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchDirectory {
    pub path: String,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

fn default_enabled() -> bool {
    true
}

/// A saved tab entry for session restore
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TabSnapshotEntry {
    pub session_path: String,
    pub provider_name: String,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub working_dir: Option<String>,
    #[serde(default)]
    pub title: String,
}

/// Application settings persisted to disk
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default, deserialize_with = "deserialize_watch_dirs")]
    pub watch_directories: Vec<WatchDirectory>,
    #[serde(default)]
    pub default_filter: FilterConfig,
    #[serde(default)]
    pub provider_enabled: std::collections::HashMap<String, bool>,
    #[serde(default)]
    pub search_colors: SearchColors,
    /// 左侧侧边栏宽度（px），默认 320
    #[serde(default = "default_sidebar_width")]
    pub sidebar_width: u32,
    /// 右侧轮次导航宽度（px），默认 256
    #[serde(default = "default_navigator_width")]
    pub navigator_width: u32,
    /// 主题模式：light | dark | eyecare | system，默认 system
    #[serde(default = "default_theme")]
    pub theme: String,
    /// 渐进 polish 每批文件数，默认 5
    #[serde(default = "default_polish_batch_size")]
    pub polish_batch_size: u32,
    /// 启动时恢复上次打开的标签页
    #[serde(default = "default_restore_tabs")]
    pub restore_tabs_on_startup: bool,
    /// 最大可钉住标签数，默认 4
    #[serde(default = "default_max_pinned_tabs")]
    pub max_pinned_tabs: u32,
    /// 保存的标签页快照
    #[serde(default)]
    pub tab_snapshots: Vec<TabSnapshotEntry>,
    /// 上次活跃的标签页索引
    #[serde(default)]
    pub active_tab_index: usize,
    /// 会话列表标题显示第一条用户消息 (true) 还是最后一条 (false)
    #[serde(default = "default_true")]
    pub display_first_user_message: bool,
    /// 会话列表时间基准：created | modified，默认 created
    #[serde(default = "default_time_base")]
    pub time_base: String,
}

fn default_time_base() -> String {
    "modified".to_string()
}

fn default_theme() -> String {
    "system".to_string()
}

fn default_sidebar_width() -> u32 {
    320
}

fn default_navigator_width() -> u32 {
    256
}

fn default_polish_batch_size() -> u32 {
    5
}

fn default_restore_tabs() -> bool {
    true
}

fn default_max_pinned_tabs() -> u32 {
    4
}

fn default_true() -> bool {
    true
}

impl Default for AppSettings {
    fn default() -> Self {
        let mut provider_enabled = std::collections::HashMap::new();
        provider_enabled.insert("claude_code".to_string(), true);
        provider_enabled.insert("codex".to_string(), true);
        provider_enabled.insert("cursor".to_string(), true);
        provider_enabled.insert("openclaw".to_string(), false);

        Self {
            watch_directories: Vec::new(),
            default_filter: FilterConfig::default(),
            provider_enabled,
            search_colors: SearchColors::default(),
            sidebar_width: 320,
            navigator_width: 256,
            theme: "system".to_string(),
            polish_batch_size: 5,
            restore_tabs_on_startup: true,
            max_pinned_tabs: 4,
            tab_snapshots: Vec::new(),
            active_tab_index: 0,
            display_first_user_message: true,
            time_base: "modified".to_string(),
        }
    }
}

/// 自定义反序列化：兼容旧格式 `["path1", "path2"]` 和新格式
/// `[{"path": "...", "enabled": true}]`
fn deserialize_watch_dirs<'de, D>(d: D) -> Result<Vec<WatchDirectory>, D::Error>
where
    D: Deserializer<'de>,
{
    let raw: Vec<serde_json::Value> = Vec::deserialize(d)?;
    let mut dirs = Vec::new();
    for item in raw {
        match item {
            // 旧格式：纯字符串 → 默认启用
            serde_json::Value::String(path) => {
                dirs.push(WatchDirectory {
                    path,
                    enabled: true,
                });
            }
            // 新格式：对象
            serde_json::Value::Object(_) => {
                let wd: WatchDirectory = serde_json::from_value(item)
                    .map_err(|e| de::Error::custom(format!("invalid watch dir: {}", e)))?;
                dirs.push(wd);
            }
            other => {
                return Err(de::Error::custom(format!(
                    "expected string or object for watch dir, got {}",
                    other
                )));
            }
        }
    }
    Ok(dirs)
}

impl AppSettings {
    /// 检查指定 provider 是否已启用。
    /// 未在配置中的 provider 默认视为启用（向后兼容）。
    pub fn is_provider_enabled(&self, name: &str) -> bool {
        self.provider_enabled
            .get(name)
            .copied()
            .unwrap_or(true)
    }
}
