use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::OnceLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotchLayout {
    pub screen_x: f64,
    pub screen_y: f64,
    pub screen_width: f64,
    pub screen_height: f64,
    pub safe_area_top: f64,
    pub has_notch: bool,
    pub collapsed_width: f64,
    pub collapsed_height: f64,
    pub global_max_y: f64,
    pub screen_frame_max_y: f64,
    pub screen_frame_origin_x: f64,
}

impl Default for NotchLayout {
    fn default() -> Self {
        Self {
            screen_x: 0.0,
            screen_y: 0.0,
            screen_width: 1512.0,
            screen_height: 982.0,
            safe_area_top: 32.0,
            has_notch: true,
            collapsed_width: 220.0,
            collapsed_height: 32.0,
            global_max_y: 982.0,
            screen_frame_max_y: 982.0,
            screen_frame_origin_x: 0.0,
        }
    }
}

static LAYOUT: OnceLock<Mutex<NotchLayout>> = OnceLock::new();

pub fn layout_cache() -> &'static Mutex<NotchLayout> {
    LAYOUT.get_or_init(|| Mutex::new(NotchLayout::default()))
}

pub fn current_layout() -> NotchLayout {
    layout_cache().lock().clone()
}

pub fn refresh_layout() -> Option<NotchLayout> {
    let layout = fetch_layout()?;
    *layout_cache().lock() = layout.clone();
    Some(layout)
}

#[cfg(target_os = "macos")]
fn layout_helper_path() -> PathBuf {
    static DEV_HELPER: OnceLock<PathBuf> = OnceLock::new();
    DEV_HELPER
        .get_or_init(|| PathBuf::from(env!("NOTCH_LAYOUT_HELPER")))
        .clone()
}

#[cfg(target_os = "macos")]
fn resolve_layout_helper() -> Option<PathBuf> {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let bundled = dir.join("notch-layout-helper");
            if bundled.exists() {
                return Some(bundled);
            }
        }
    }

    let dev = layout_helper_path();
    if dev.exists() {
        return Some(dev);
    }

    None
}

#[cfg(target_os = "macos")]
fn fetch_layout() -> Option<NotchLayout> {
    let helper = resolve_layout_helper()?;
    let output = Command::new(helper)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .stdin(Stdio::null())
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    serde_json::from_slice(&output.stdout).ok()
}

#[cfg(not(target_os = "macos"))]
fn fetch_layout() -> Option<NotchLayout> {
    None
}
