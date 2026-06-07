use regex::Regex;
use std::sync::LazyLock;

use crate::types::ItemType;

static URL_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^https?://[^\s]+$").expect("valid url regex"));
static HEX_COLOR_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$").expect("valid hex regex")
});
static CODE_INDICATORS: [&str; 12] = [
    "function ",
    "const ",
    "let ",
    "var ",
    "import ",
    "export ",
    "class ",
    "def ",
    "fn ",
    "public ",
    "private ",
    "SELECT ",
];

pub fn detect_text_type(text: &str) -> ItemType {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return ItemType::Text;
    }
    if URL_RE.is_match(trimmed) {
        return ItemType::Url;
    }
    if HEX_COLOR_RE.is_match(trimmed) {
        return ItemType::Color;
    }
    if looks_like_code(trimmed) {
        return ItemType::Code;
    }
    ItemType::Text
}

fn looks_like_code(text: &str) -> bool {
    if text.contains("```") {
        return true;
    }
    if text.lines().count() >= 2 && (text.contains('{') || text.contains('}')) {
        return true;
    }
    CODE_INDICATORS.iter().any(|ind| text.contains(ind))
}

pub fn category_for_type(item_type: &ItemType) -> &'static str {
    match item_type {
        ItemType::Code => "Code",
        ItemType::Color => "Colors",
        ItemType::Image => "Screenshots",
        ItemType::File => "Assets",
        ItemType::Url => "History",
        ItemType::Text | ItemType::Bundle => "History",
    }
}

pub fn hash_content(data: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(data);
    hex::encode(digest)
}

#[cfg(target_os = "macos")]
pub mod platform {
    use objc2::rc::Retained;
    use objc2::runtime::ProtocolObject;
    use objc2::ClassType;
    use objc2_app_kit::{NSPasteboard, NSPasteboardWriting};
    use objc2_foundation::{NSArray, NSURL};

    pub fn write_file_urls(paths: &[std::path::PathBuf]) -> Result<(), String> {
        if paths.is_empty() {
            return Err("no files to copy".to_string());
        }

        let urls = paths
            .iter()
            .map(|path| {
                NSURL::from_file_path(path)
                    .ok_or_else(|| format!("invalid file URL: {}", path.display()))
            })
            .collect::<Result<Vec<_>, _>>()?;
        let objects: Vec<Retained<ProtocolObject<dyn NSPasteboardWriting>>> = urls
            .into_iter()
            .map(ProtocolObject::from_retained)
            .collect();
        let array = NSArray::from_retained_slice(&objects);
        let pasteboard = NSPasteboard::generalPasteboard();
        pasteboard.clearContents();
        if pasteboard.writeObjects(&array) {
            Ok(())
        } else {
            Err("failed to write file URLs to pasteboard".to_string())
        }
    }

    pub fn read_file_urls() -> Vec<String> {
        let classes = NSArray::from_slice(&[NSURL::class()]);
        let pasteboard = NSPasteboard::generalPasteboard();
        let Some(objects) = (unsafe { pasteboard.readObjectsForClasses_options(&classes, None) })
        else {
            return vec![];
        };
        objects
            .iter()
            .filter_map(|object| {
                object
                    .downcast_ref::<NSURL>()
                    .and_then(|url| url.to_file_path())
            })
            .map(|path| path.to_string_lossy().to_string())
            .collect()
    }

    pub fn open_url(url: &str) -> Result<(), String> {
        let url = url.trim();
        if url.is_empty() {
            return Err("empty url".to_string());
        }
        let status = std::process::Command::new("open")
            .arg(url)
            .status()
            .map_err(|e| e.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("failed to open url: {url}"))
        }
    }

    pub fn simulate_paste_to_target(target_app: Option<&str>) {
        let target = target_app.map(str::to_string);
        std::thread::spawn(move || {
            if let Some(name) = target.as_deref() {
                crate::source_app::activate_app_by_name(name);
                std::thread::sleep(std::time::Duration::from_millis(200));
            }
            std::thread::sleep(std::time::Duration::from_millis(80));
            let _ = std::process::Command::new("osascript")
                .arg("-e")
                .arg("tell application \"System Events\" to keystroke \"v\" using command down")
                .output();
        });
    }
}

#[cfg(not(target_os = "macos"))]
pub mod platform {
    pub fn write_file_urls(_paths: &[std::path::PathBuf]) -> Result<(), String> {
        Err("unsupported platform".to_string())
    }

    pub fn read_file_urls() -> Vec<String> {
        vec![]
    }

    pub fn open_url(_url: &str) -> Result<(), String> {
        Err("unsupported platform".to_string())
    }

    pub fn simulate_paste_to_target(_target_app: Option<&str>) {}
}
