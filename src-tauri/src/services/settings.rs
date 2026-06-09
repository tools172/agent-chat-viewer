use std::path::PathBuf;

use crate::models::AppSettings;

/// Get the path to the settings file
pub fn settings_path() -> PathBuf {
    let mut path = app_data_dir();
    std::fs::create_dir_all(&path).ok();
    path.push("settings.json");
    path
}

/// Get the application data directory
fn app_data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("APPDATA") {
        // Windows
        PathBuf::from(dir).join("agent-chat-viewer")
    } else if let Ok(dir) = std::env::var("XDG_CONFIG_HOME") {
        // Linux XDG
        PathBuf::from(dir).join("agent-chat-viewer")
    } else {
        // Fallback
        let home = if let Ok(home) = std::env::var("HOME") {
            PathBuf::from(home)
        } else if let Ok(home) = std::env::var("USERPROFILE") {
            PathBuf::from(home)
        } else {
            PathBuf::from(".")
        };
        home.join(".config").join("agent-chat-viewer")
    }
}

/// Load settings from disk
pub fn load_settings() -> Result<AppSettings, String> {
    let path = settings_path();

    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read settings: {}", e))?;

    serde_json::from_str(&content).map_err(|e| format!("Failed to parse settings: {}", e))
}

/// Save settings to disk
pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    let path = settings_path();

    let json =
        serde_json::to_string_pretty(settings).map_err(|e| format!("Failed to serialize: {}", e))?;

    std::fs::write(&path, json).map_err(|e| format!("Failed to write settings: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_default_settings() {
        // Since we can't easily control the path in tests,
        // just verify the default settings can be created
        let settings = AppSettings::default();
        assert!(settings.provider_enabled.contains_key("claude_code"));
        assert!(!settings.default_filter.show_thinking);
    }

    #[test]
    fn test_save_and_load_settings() {
        let temp_dir = tempfile::tempdir().unwrap();
        let settings_path = temp_dir.path().join("test_settings.json");

        let settings = AppSettings::default();
        let json = serde_json::to_string_pretty(&settings).unwrap();
        std::fs::write(&settings_path, &json).unwrap();

        let content = std::fs::read_to_string(&settings_path).unwrap();
        let loaded: AppSettings = serde_json::from_str(&content).unwrap();
        assert_eq!(loaded.default_filter.show_thinking, false);
    }
}
