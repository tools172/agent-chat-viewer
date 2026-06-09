use serde::{Deserialize, Serialize};

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

/// Application settings persisted to disk
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default)]
    pub watch_directories: Vec<String>,
    #[serde(default)]
    pub default_filter: FilterConfig,
    #[serde(default)]
    pub provider_enabled: std::collections::HashMap<String, bool>,
    #[serde(default)]
    pub search_colors: SearchColors,
}

impl Default for AppSettings {
    fn default() -> Self {
        let mut provider_enabled = std::collections::HashMap::new();
        provider_enabled.insert("claude_code".to_string(), true);
        provider_enabled.insert("openclaw".to_string(), false);

        Self {
            watch_directories: Vec::new(),
            default_filter: FilterConfig::default(),
            provider_enabled,
            search_colors: SearchColors::default(),
        }
    }
}
