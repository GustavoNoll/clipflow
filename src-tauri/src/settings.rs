use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default)]
    pub has_selected_language: bool,
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
    #[serde(default = "default_launcher_shortcut")]
    pub launcher_shortcut: String,
    #[serde(default = "default_quick_paste_shortcut")]
    pub quick_paste_shortcut: String,
}

fn default_hide_sensitive_content() -> bool {
    true
}

fn default_language() -> String {
    "en".to_string()
}

fn default_launcher_shortcut() -> String {
    "Control+Meta+KeyV".to_string()
}

fn default_quick_paste_shortcut() -> String {
    "Control+Shift+Meta+KeyV".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            language: default_language(),
            has_selected_language: false,
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
            launcher_shortcut: default_launcher_shortcut(),
            quick_paste_shortcut: default_quick_paste_shortcut(),
        }
    }
}

pub const SETTINGS_KEY: &str = "app_settings";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_without_language_use_defaults() {
        let settings: AppSettings = serde_json::from_str(
            r##"{
                "theme": "light",
                "accent": "#5b5fc7",
                "autoPaste": true,
                "capturePaused": false,
                "defaultLauncher": "notch",
                "compactGrid": false,
                "showSourceApp": true,
                "historyLimit": 0,
                "notchHoverEnabled": false,
                "hideSensitiveContent": true,
                "skipSensitiveContent": false,
                "hasCompletedOnboarding": true
            }"##,
        )
        .expect("settings should deserialize");

        assert_eq!(settings.language, "en");
        assert!(!settings.has_selected_language);
        assert_eq!(settings.launcher_shortcut, "Control+Meta+KeyV");
        assert_eq!(settings.quick_paste_shortcut, "Control+Shift+Meta+KeyV");
    }
}
