pub mod base;
pub mod claude_code;
pub mod codex;
pub mod cursor;
pub mod openclaw;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use base::ChatProvider;

/// Registry that holds all registered chat providers
pub struct ProviderRegistry {
    providers: HashMap<String, Arc<dyn ChatProvider>>,
}

impl Clone for ProviderRegistry {
    fn clone(&self) -> Self {
        Self {
            providers: self.providers.clone(),
        }
    }
}

impl ProviderRegistry {
    /// Create a new registry with built-in providers
    pub fn new() -> Self {
        let mut registry = Self {
            providers: HashMap::new(),
        };

        // Register built-in providers
        registry.register(Arc::new(claude_code::ClaudeCodeProvider::new()));
        registry.register(Arc::new(codex::CodexProvider::new()));
        registry.register(Arc::new(cursor::CursorProvider::new()));
        registry.register(Arc::new(openclaw::OpenClawProvider::new()));

        registry
    }

    /// Register a provider
    pub fn register(&mut self, provider: Arc<dyn ChatProvider>) {
        self.providers
            .insert(provider.name().to_string(), provider);
    }

    /// Get a provider by name
    pub fn get(&self, name: &str) -> Option<&Arc<dyn ChatProvider>> {
        self.providers.get(name)
    }

    /// List all registered provider names
    pub fn provider_names(&self) -> Vec<String> {
        self.providers.keys().cloned().collect()
    }

    /// Detect which provider handles a given path
    pub fn detect_provider(&self, path: &PathBuf) -> Option<&Arc<dyn ChatProvider>> {
        self.providers
            .values()
            .find(|p| p.detect_format(path))
    }

    /// Detect which provider handles the given file content (first lines of a JSONL file).
    /// Each registered provider's `detect_by_content` is tried; the first match wins.
    pub fn detect_by_content(&self, first_lines: &str) -> Option<&Arc<dyn ChatProvider>> {
        self.providers
            .values()
            .find(|p| p.detect_by_content(first_lines))
    }

    /// Get default paths for all providers
    pub fn default_paths(&self) -> HashMap<String, String> {
        self.providers
            .iter()
            .map(|(name, provider)| {
                (
                    name.clone(),
                    provider
                        .default_base_dir()
                        .to_string_lossy()
                        .to_string(),
                )
            })
            .collect()
    }
}

impl Default for ProviderRegistry {
    fn default() -> Self {
        Self::new()
    }
}
