use arboard::{Clipboard, ImageData};
use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::clipboard::{category_for_type, detect_text_type, hash_content, platform};
use crate::db::Database;
use crate::source_app::SourceAppTracker;
use crate::types::ItemType;

const POLL_INTERVAL: Duration = Duration::from_millis(400);
const STABLE_CLIPBOARD: Duration = Duration::from_millis(600);

pub struct ClipboardMonitor {
    running: Arc<AtomicBool>,
    last_fingerprint: Arc<Mutex<String>>,
    suppress: Arc<AtomicBool>,
    source_apps: SourceAppTracker,
}

struct PendingCapture {
    fingerprint: String,
    since: Instant,
}

struct SnapshotImage {
    width: usize,
    height: usize,
    bytes: Vec<u8>,
}

enum ClipboardPayload {
    Files(Vec<String>),
    Image(SnapshotImage),
    Text(String),
}

struct ClipboardSnapshot {
    fingerprint: String,
    payload: Option<ClipboardPayload>,
}

impl ClipboardMonitor {
    pub fn new() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            last_fingerprint: Arc::new(Mutex::new(String::new())),
            suppress: Arc::new(AtomicBool::new(false)),
            source_apps: SourceAppTracker::new(),
        }
    }

    pub fn suppress_next(&self) {
        self.suppress.store(true, Ordering::SeqCst);
        if let Ok(snapshot) = ClipboardSnapshot::take() {
            *self.last_fingerprint.lock() = snapshot.fingerprint;
        }
    }

    pub fn paste_target_app(&self) -> Option<String> {
        self.source_apps.paste_target()
    }

    pub fn start(&self, app: AppHandle, db: Arc<Mutex<Database>>, capture_paused: Arc<AtomicBool>) {
        if self.running.swap(true, Ordering::SeqCst) {
            return;
        }

        let running = Arc::clone(&self.running);
        let suppress = Arc::clone(&self.suppress);
        let last_fingerprint = Arc::clone(&self.last_fingerprint);
        if let Ok(snapshot) = ClipboardSnapshot::take() {
            *last_fingerprint.lock() = snapshot.fingerprint;
        }

        let source_apps = self.source_apps.clone();
        self.source_apps.start();

        std::thread::spawn(move || {
            let mut pending: Option<PendingCapture> = None;

            while running.load(Ordering::SeqCst) {
                std::thread::sleep(POLL_INTERVAL);

                if capture_paused.load(Ordering::SeqCst) {
                    pending = None;
                    continue;
                }

                if suppress.swap(false, Ordering::SeqCst) {
                    if let Ok(snapshot) = ClipboardSnapshot::take() {
                        *last_fingerprint.lock() = snapshot.fingerprint;
                    }
                    pending = None;
                    continue;
                }

                let snapshot = match ClipboardSnapshot::take() {
                    Ok(snapshot) => snapshot,
                    Err(_) => continue,
                };

                if snapshot.fingerprint.is_empty()
                    || snapshot.fingerprint == *last_fingerprint.lock()
                {
                    pending = None;
                    continue;
                }

                let should_capture = match &mut pending {
                    Some(state) if state.fingerprint == snapshot.fingerprint => {
                        state.since.elapsed() >= STABLE_CLIPBOARD
                    }
                    _ => {
                        pending = Some(PendingCapture {
                            fingerprint: snapshot.fingerprint.clone(),
                            since: Instant::now(),
                        });
                        false
                    }
                };

                if !should_capture {
                    continue;
                }

                *last_fingerprint.lock() = snapshot.fingerprint.clone();
                pending = None;

                if let Some(item_id) = capture_snapshot(&db, &source_apps, snapshot) {
                    let _ = app.emit("clipboard:new-item", &item_id);
                }
            }
        });
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
        self.source_apps.stop();
    }
}

impl ClipboardSnapshot {
    fn take() -> Result<Self, String> {
        let file_paths = platform::read_file_urls();
        let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;

        if !file_paths.is_empty() {
            let fingerprint = format!("files:{}", file_paths.join("|"));
            return Ok(Self {
                fingerprint,
                payload: Some(ClipboardPayload::Files(file_paths)),
            });
        }

        if let Ok(img) = clipboard.get_image() {
            let sample: Vec<u8> = img.bytes.iter().take(512).copied().collect();
            let fingerprint = format!(
                "image:{}x{}:{}",
                img.width,
                img.height,
                hash_content(&sample)
            );
            return Ok(Self {
                fingerprint,
                payload: Some(ClipboardPayload::Image(SnapshotImage {
                    width: img.width,
                    height: img.height,
                    bytes: img.bytes.to_vec(),
                })),
            });
        }

        if let Ok(text) = clipboard.get_text() {
            if !text.trim().is_empty() {
                let fingerprint = format!("text:{}", hash_content(text.as_bytes()));
                return Ok(Self {
                    fingerprint,
                    payload: Some(ClipboardPayload::Text(text)),
                });
            }
        }

        Ok(Self {
            fingerprint: String::new(),
            payload: None,
        })
    }
}

fn capture_snapshot(
    db: &Arc<Mutex<Database>>,
    source_apps: &SourceAppTracker,
    snapshot: ClipboardSnapshot,
) -> Option<String> {
    let payload = snapshot.payload?;
    let now = chrono::Utc::now().timestamp();
    let id = Uuid::new_v4().to_string();

    match payload {
        ClipboardPayload::Files(paths) => {
            let source_app = source_apps.source_for_capture(false);
            if source_app_is_ignored(db, source_app.as_deref()) {
                return None;
            }
            capture_files(db, &id, &paths, source_app.as_deref(), now)
        }
        ClipboardPayload::Image(img) => {
            let source_app = source_apps.source_for_capture(true);
            if source_app_is_ignored(db, source_app.as_deref()) {
                return None;
            }
            let image = ImageData {
                width: img.width,
                height: img.height,
                bytes: img.bytes.into(),
            };
            capture_image(db, &id, image, source_app.as_deref(), now)
        }
        ClipboardPayload::Text(text) => {
            let source_app = source_apps.source_for_capture(false);
            if source_app_is_ignored(db, source_app.as_deref()) {
                return None;
            }
            if should_skip_sensitive_content(db, &text) {
                return None;
            }
            capture_text(db, &id, &text, source_app.as_deref(), now)
        }
    }
}

fn source_app_is_ignored(db: &Arc<Mutex<Database>>, source_app: Option<&str>) -> bool {
    let Some(source_app) = source_app.filter(|name| !name.trim().is_empty()) else {
        return false;
    };
    let settings = db.lock().get_settings().unwrap_or_default();
    settings
        .ignored_source_apps
        .iter()
        .any(|name| name.eq_ignore_ascii_case(source_app))
}

fn should_skip_sensitive_content(db: &Arc<Mutex<Database>>, text: &str) -> bool {
    let settings = db.lock().get_settings().unwrap_or_default();
    settings.skip_sensitive_content && looks_sensitive(text)
}

fn looks_sensitive(text: &str) -> bool {
    let lower = text.to_lowercase();
    let keyword_match = [
        "password",
        "passwd",
        "pwd",
        "secret",
        "token",
        "api_key",
        "apikey",
        "access_key",
        "private_key",
    ]
    .iter()
    .any(|keyword| lower.contains(keyword));
    let bearer_match = lower.contains("bearer ") && text.len() > 24;
    let github_token = text.contains("ghp_")
        || text.contains("gho_")
        || text.contains("ghu_")
        || text.contains("ghs_")
        || text.contains("ghr_");
    let openai_key = text.contains("sk-") && text.len() > 24;
    keyword_match || bearer_match || github_token || openai_key
}

fn capture_text(
    db: &Arc<Mutex<Database>>,
    id: &str,
    text: &str,
    source_app: Option<&str>,
    now: i64,
) -> Option<String> {
    let item_type = detect_text_type(text);
    let category_name = category_for_type(&item_type);
    let content_hash = hash_content(text.as_bytes());

    let db_guard = db.lock();
    let category_id = db_guard.category_id_by_name(category_name).ok()?;
    db_guard
        .insert_item(
            id,
            text,
            &content_hash,
            None,
            item_type,
            source_app,
            category_id,
            None,
            Some("text/plain"),
            now,
        )
        .ok()?
}

fn capture_image(
    db: &Arc<Mutex<Database>>,
    id: &str,
    img: ImageData,
    source_app: Option<&str>,
    now: i64,
) -> Option<String> {
    let png_bytes = image_to_png(&img);
    let content_hash = hash_content(&png_bytes);
    let preview = format!("Screenshot · {}×{}", img.width, img.height);
    let content = match crate::ocr::extract_text_from_png(&png_bytes) {
        Some(text) => format!("{preview}\n\n{text}"),
        None => preview,
    };

    let db_guard = db.lock();
    let category_id = db_guard.category_id_by_name("Screenshots").ok()?;
    db_guard
        .insert_item(
            id,
            &content,
            &content_hash,
            Some(&png_bytes),
            ItemType::Image,
            source_app,
            category_id,
            None,
            Some("image/png"),
            now,
        )
        .ok()?
}

fn capture_files(
    db: &Arc<Mutex<Database>>,
    id: &str,
    paths: &[String],
    source_app: Option<&str>,
    now: i64,
) -> Option<String> {
    let primary = paths.first()?;
    let file_name = std::path::Path::new(primary)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(primary)
        .to_string();
    let content = if paths.len() == 1 {
        primary.clone()
    } else {
        format!("{} (+{} more)", primary, paths.len() - 1)
    };
    let content_hash = hash_content(content.as_bytes());

    let db_guard = db.lock();
    let category_id = db_guard.category_id_by_name("Assets").ok()?;
    db_guard
        .insert_item(
            id,
            &content,
            &content_hash,
            None,
            ItemType::File,
            source_app,
            category_id,
            Some(&file_name),
            Some("application/octet-stream"),
            now,
        )
        .ok()?
}

fn image_to_png(img: &ImageData) -> Vec<u8> {
    let mut png_data = Vec::new();
    let mut encoder = png::Encoder::new(&mut png_data, img.width as u32, img.height as u32);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    if let Ok(mut writer) = encoder.write_header() {
        let _ = writer.write_image_data(&img.bytes);
    }
    if png_data.is_empty() {
        img.bytes.to_vec()
    } else {
        png_data
    }
}

pub fn restore_to_clipboard(
    item: &crate::types::ClipboardItem,
    monitor: &ClipboardMonitor,
) -> Result<(), String> {
    monitor.suppress_next();
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;

    match ItemType::from_str(&item.item_type) {
        ItemType::Image => {
            if let Some(thumb) = &item.thumbnail {
                if let Some(b64) = thumb.strip_prefix("data:image/png;base64,") {
                    use base64::{engine::general_purpose::STANDARD, Engine};
                    if let Ok(bytes) = STANDARD.decode(b64) {
                        if let Ok((width, height, rgba)) = decode_png_rgba(&bytes) {
                            let img = ImageData {
                                width,
                                height,
                                bytes: rgba.into(),
                            };
                            clipboard.set_image(img).map_err(|e| e.to_string())?;
                            return Ok(());
                        }
                    }
                }
            }
            clipboard
                .set_text(&item.content)
                .map_err(|e| e.to_string())?;
        }
        ItemType::File | ItemType::Text | ItemType::Url | ItemType::Code | ItemType::Color => {
            clipboard
                .set_text(&item.content)
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

fn decode_png_rgba(bytes: &[u8]) -> Result<(usize, usize, Vec<u8>), String> {
    use std::io::Cursor;
    let decoder = png::Decoder::new(Cursor::new(bytes));
    let mut reader = decoder.read_info().map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf).map_err(|e| e.to_string())?;
    Ok((
        info.width as usize,
        info.height as usize,
        buf[..info.buffer_size()].to_vec(),
    ))
}

pub fn should_open_in_browser(item: &crate::types::ClipboardItem) -> bool {
    let trimmed = item.content.trim();
    ItemType::from_str(&item.item_type) == ItemType::Url
        || trimmed.starts_with("http://")
        || trimmed.starts_with("https://")
}

pub fn paste_item(
    item: &crate::types::ClipboardItem,
    monitor: &ClipboardMonitor,
) -> Result<(), String> {
    restore_to_clipboard(item, monitor)?;

    if should_open_in_browser(item) {
        return platform::open_url(item.content.trim());
    }

    let target = monitor.paste_target_app();
    platform::simulate_paste_to_target(target.as_deref());
    Ok(())
}
