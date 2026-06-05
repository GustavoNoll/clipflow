use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::OnceLock;

#[cfg(target_os = "macos")]
fn ocr_helper_path() -> PathBuf {
    static DEV_HELPER: OnceLock<PathBuf> = OnceLock::new();
    DEV_HELPER
        .get_or_init(|| PathBuf::from(env!("OCR_HELPER")))
        .clone()
}

#[cfg(target_os = "macos")]
fn resolve_ocr_helper() -> Option<PathBuf> {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let bundled = dir.join("ocr-helper");
            if bundled.exists() {
                return Some(bundled);
            }
        }
    }

    let dev = ocr_helper_path();
    if dev.exists() {
        return Some(dev);
    }

    None
}

#[cfg(target_os = "macos")]
pub fn extract_text_from_png(png_bytes: &[u8]) -> Option<String> {
    if png_bytes.is_empty() {
        return None;
    }

    let helper = resolve_ocr_helper()?;
    let mut child = Command::new(helper)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;

    if let Some(mut stdin) = child.stdin.take() {
        if stdin.write_all(png_bytes).is_err() {
            let _ = child.kill();
            return None;
        }
    }

    let output = child.wait_with_output().ok()?;
    if !output.status.success() || output.stdout.is_empty() {
        return None;
    }

    let text = String::from_utf8(output.stdout).ok()?;
    let normalized = normalize_ocr_text(&text);
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

#[cfg(not(target_os = "macos"))]
pub fn extract_text_from_png(_png_bytes: &[u8]) -> Option<String> {
    None
}

fn normalize_ocr_text(text: &str) -> String {
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}
