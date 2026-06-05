use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::OnceLock;

#[cfg(target_os = "macos")]
fn auth_helper_path() -> PathBuf {
    static DEV_HELPER: OnceLock<PathBuf> = OnceLock::new();
    DEV_HELPER
        .get_or_init(|| PathBuf::from(env!("AUTH_HELPER")))
        .clone()
}

#[cfg(target_os = "macos")]
fn resolve_auth_helper() -> Option<PathBuf> {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let bundled = dir.join("auth-helper");
            if bundled.exists() {
                return Some(bundled);
            }
        }
    }

    let dev = auth_helper_path();
    if dev.exists() {
        return Some(dev);
    }

    None
}

#[cfg(target_os = "macos")]
pub fn authenticate_reveal() -> bool {
    let Some(helper) = resolve_auth_helper() else {
        return false;
    };

    Command::new(helper)
        .env(
            "CLIPFLOW_AUTH_REASON",
            "Reveal sensitive clipboard previews in ClipFlow.",
        )
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

#[cfg(not(target_os = "macos"))]
pub fn authenticate_reveal() -> bool {
    false
}
