use serde::{Deserialize, Serialize};

/// Scope for searching sessions inside one or more projects.
///
/// A project is identified by both its grouping path and provider, because the
/// same path can be produced by different providers (for example, a cwd shared
/// by Codex and another agent).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchScope {
    pub project_path: String,
    pub provider_name: String,
}
