use base64::{engine::general_purpose::STANDARD, Engine};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::OnceLock;

pub struct AppIconCache {
    inner: Mutex<HashMap<String, Option<String>>>,
}

impl AppIconCache {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
        }
    }

    pub fn get(&self, app_name: &str) -> Option<String> {
        if app_name.trim().is_empty() {
            return None;
        }
        {
            let cache = self.inner.lock();
            if let Some(cached) = cache.get(app_name) {
                return cached.clone();
            }
        }
        let icon = fetch_app_icon(app_name);
        self.inner.lock().insert(app_name.to_string(), icon.clone());
        icon
    }
}

fn icon_helper_path() -> PathBuf {
    static DEV_HELPER: OnceLock<PathBuf> = OnceLock::new();
    DEV_HELPER
        .get_or_init(|| PathBuf::from(env!("APP_ICON_HELPER")))
        .clone()
}

fn resolve_helper() -> Option<PathBuf> {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let bundled = dir.join("app-icon-helper");
            if bundled.exists() {
                return Some(bundled);
            }
        }
    }

    let dev = icon_helper_path();
    if dev.exists() {
        return Some(dev);
    }

    None
}

#[cfg(target_os = "macos")]
fn fetch_app_icon(app_name: &str) -> Option<String> {
    let helper = resolve_helper()?;

    let output = Command::new(helper)
        .env("CLIPFLOW_APP_NAME", app_name)
        .env("CLIPFLOW_ICON_SIZE", "32")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()?;

    if !output.status.success() || output.stdout.is_empty() {
        return None;
    }

    Some(format!(
        "data:image/png;base64,{}",
        STANDARD.encode(&output.stdout)
    ))
}

#[cfg(not(target_os = "macos"))]
fn fetch_app_icon(_app_name: &str) -> Option<String> {
    None
}

pub fn get_app_icon_cached(cache: &AppIconCache, app_name: &str) -> Option<String> {
    cache.get(app_name)
}
