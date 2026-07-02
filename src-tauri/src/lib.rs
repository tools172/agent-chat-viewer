pub mod commands;
pub mod models;
pub mod providers;
pub mod services;
pub mod utils;

use providers::ProviderRegistry;

/// Main Tauri application entry point
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let registry = ProviderRegistry::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(registry)
        .invoke_handler(tauri::generate_handler![
            commands::browser::list_projects,
            commands::browser::list_sessions,
            commands::browser::get_conversation,
            commands::browser::list_all_sessions,
            commands::browser::polish_sessions,
            commands::browser::search_sessions,
            commands::browser::trigger_native_find,
            commands::export::export_markdown,
            commands::export::export_json,
            commands::export::write_text_file,
            commands::export::open_containing_folder,
            commands::export::open_project_folder,
            commands::settings::get_default_paths,
            commands::settings::load_settings,
            commands::settings::save_settings,
            commands::settings::get_settings_path,
            commands::settings::list_providers,
            commands::settings::get_provider_data_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
