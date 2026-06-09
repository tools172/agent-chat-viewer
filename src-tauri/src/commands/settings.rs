use std::collections::HashMap;

use crate::models::AppSettings;
use crate::providers::ProviderRegistry;
use crate::services::settings as settings_service;

/// Get default paths for all registered providers
#[tauri::command]
pub fn get_default_paths(registry: tauri::State<'_, ProviderRegistry>) -> HashMap<String, String> {
    registry.default_paths()
}

/// Load application settings
#[tauri::command]
pub fn load_settings() -> Result<AppSettings, String> {
    settings_service::load_settings()
}

/// Save application settings
#[tauri::command]
pub fn save_settings(settings: AppSettings) -> Result<(), String> {
    settings_service::save_settings(&settings)
}

/// Get the path to the settings file
#[tauri::command]
pub fn get_settings_path() -> String {
    settings_service::settings_path()
        .to_string_lossy()
        .to_string()
}

/// List available providers
#[tauri::command]
pub fn list_providers(registry: tauri::State<'_, ProviderRegistry>) -> Vec<ProviderInfo> {
    registry
        .provider_names()
        .iter()
        .map(|name| {
            let provider = registry.get(name).unwrap();
            ProviderInfo {
                name: name.clone(),
                display_name: provider.display_name().to_string(),
                default_path: provider.default_base_dir().to_string_lossy().to_string(),
            }
        })
        .collect()
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfo {
    pub name: String,
    pub display_name: String,
    pub default_path: String,
}
