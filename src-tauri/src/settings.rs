use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: String,
    pub accent: String,
    pub auto_paste: bool,
    pub capture_paused: bool,
    pub default_launcher: String,
    pub compact_grid: bool,
    pub show_source_app: bool,
    pub history_limit: i64,
    pub notch_hover_enabled: bool,
    #[serde(default)]
    pub capture_paused_until: Option<i64>,
    #[serde(default)]
    pub ignored_source_apps: Vec<String>,
    #[serde(default = "default_hide_sensitive_content")]
    pub hide_sensitive_content: bool,
    #[serde(default)]
    pub skip_sensitive_content: bool,
    #[serde(default)]
    pub has_completed_onboarding: bool,
}

fn default_hide_sensitive_content() -> bool {
    true
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "light".to_string(),
            accent: "#5b5fc7".to_string(),
            auto_paste: true,
            capture_paused: false,
            default_launcher: "notch".to_string(),
            compact_grid: false,
            show_source_app: true,
            history_limit: 0,
            notch_hover_enabled: false,
            capture_paused_until: None,
            ignored_source_apps: Vec::new(),
            hide_sensitive_content: true,
            skip_sensitive_content: false,
            has_completed_onboarding: false,
        }
    }
}

pub const SETTINGS_KEY: &str = "app_settings";
