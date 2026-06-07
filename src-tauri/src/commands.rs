use arboard::Clipboard;
use parking_lot::Mutex;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::{Emitter, State};
use uuid::Uuid;

use crate::app_icon::AppIconCache;
use crate::clipboard::hash_content;
use crate::db::Database;
use crate::monitor::{
    looks_sensitive, paste_item, restore_to_clipboard, should_open_in_browser, ClipboardMonitor,
};
use crate::settings::AppSettings;
use crate::types::{Category, ClipboardItem, ItemType, PaginatedItems, SearchParams, SourceApp};

pub struct AppState {
    pub db: Arc<Mutex<Database>>,
    pub monitor: Arc<ClipboardMonitor>,
    pub capture_paused: Arc<std::sync::atomic::AtomicBool>,
    pub notch_hover_enabled: Arc<std::sync::atomic::AtomicBool>,
    pub app_icons: Arc<AppIconCache>,
}

#[tauri::command]
pub fn get_app_icon(
    state: State<'_, AppState>,
    app_name: String,
) -> Result<Option<String>, String> {
    Ok(crate::app_icon::get_app_icon_cached(
        &state.app_icons,
        &app_name,
    ))
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let db = state.db.lock();
    db.get_settings().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_settings(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    {
        let db = state.db.lock();
        db.save_settings(&settings).map_err(|e| e.to_string())?;
    }
    state
        .capture_paused
        .store(settings.capture_paused, Ordering::SeqCst);
    state
        .notch_hover_enabled
        .store(settings.notch_hover_enabled, Ordering::SeqCst);

    crate::notch::apply_notch_click_setting(&app, settings.notch_hover_enabled);

    #[cfg(target_os = "macos")]
    crate::macos_menu::sync_from_settings(&app, &settings);

    if let Err(err) = crate::register_shortcuts(&app) {
        eprintln!("ClipFlow: global shortcuts unavailable ({err})");
    }

    let _ = app.emit("settings:changed", &settings);
    Ok(settings)
}

#[tauri::command]
pub fn authenticate_privacy_reveal() -> Result<bool, String> {
    Ok(crate::privacy_auth::authenticate_reveal())
}

#[tauri::command]
pub fn set_notch_expanded(app: tauri::AppHandle, expanded: bool) {
    crate::notch::set_notch_expanded(&app, expanded);
}

#[tauri::command]
pub fn set_notch_hover_preview(app: tauri::AppHandle, hovered: bool) {
    crate::notch::set_notch_hover_preview(&app, hovered);
}

#[tauri::command]
pub fn open_library_window(app: tauri::AppHandle) {
    crate::show_main_window(&app);
}

#[tauri::command]
pub fn list_items(
    state: State<'_, AppState>,
    params: SearchParams,
) -> Result<PaginatedItems, String> {
    let db = state.db.lock();
    db.list_items(&params).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_recent(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<ClipboardItem>, String> {
    let db = state.db.lock();
    db.get_recent(limit.unwrap_or(10))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_contextual_recent(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<ClipboardItem>, String> {
    let target_app = state.monitor.paste_target_app();
    let limit = limit.unwrap_or(10).clamp(1, 50);
    let mut items = {
        let db = state.db.lock();
        db.get_recent(limit * 4).map_err(|e| e.to_string())?
    };
    if let Some(target_app) = target_app {
        items.sort_by_key(|item| {
            let same_app = item
                .source_app
                .as_deref()
                .map(|source| source.eq_ignore_ascii_case(&target_app))
                .unwrap_or(false);
            if same_app { 0 } else { 1 }
        });
    }
    items.truncate(limit as usize);
    Ok(items)
}

#[tauri::command]
pub fn get_item(state: State<'_, AppState>, id: String) -> Result<ClipboardItem, String> {
    let db = state.db.lock();
    db.get_item(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_item(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock();
    db.delete_item(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_items(state: State<'_, AppState>, ids: Vec<String>) -> Result<i64, String> {
    let db = state.db.lock();
    db.delete_items(&ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_history(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<i64, String> {
    let db = state.db.lock();
    let changed = db.clear_history().map_err(|e| e.to_string())?;
    state.monitor.suppress_next();
    let _ = app.emit("clipboard:history-cleared", changed);
    Ok(changed)
}

#[tauri::command]
pub fn seed_demo_data(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<i64, String> {
    let now = chrono::Utc::now().timestamp();
    let demos = demo_items(now);
    let db = state.db.lock();
    let mut inserted = 0;

    for demo in demos {
        let category_id = db
            .category_id_by_name(demo.category)
            .map_err(|e| e.to_string())?;
        let content_hash = hash_content(demo.content.as_bytes());
        if db
            .insert_item(
                &Uuid::new_v4().to_string(),
                demo.content,
                &content_hash,
                demo.raw_data.as_deref(),
                demo.item_type,
                Some(demo.source_app),
                category_id,
                demo.file_name,
                Some(demo.mime_type),
                demo.created_at,
            )
            .map_err(|e| e.to_string())?
            .is_some()
        {
            inserted += 1;
        }
    }

    if inserted > 0 {
        let _ = app.emit("clipboard:new-item", "demo");
    }

    Ok(inserted)
}

#[tauri::command]
pub fn toggle_favorite(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let db = state.db.lock();
    db.toggle_favorite(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_items_favorite(
    state: State<'_, AppState>,
    ids: Vec<String>,
    favorite: bool,
) -> Result<i64, String> {
    let db = state.db.lock();
    db.set_items_favorite(&ids, favorite).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_items_pinned(
    state: State<'_, AppState>,
    ids: Vec<String>,
    pinned: bool,
) -> Result<i64, String> {
    let db = state.db.lock();
    db.set_items_pinned(&ids, pinned).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_pin_shortcut(
    state: State<'_, AppState>,
    id: String,
    shortcut: Option<i64>,
) -> Result<(), String> {
    let db = state.db.lock();
    db.set_pin_shortcut(&id, shortcut).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_item_category(
    state: State<'_, AppState>,
    item_id: String,
    category_id: i64,
) -> Result<(), String> {
    let db = state.db.lock();
    db.set_category(&item_id, category_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_categories(state: State<'_, AppState>) -> Result<Vec<Category>, String> {
    let db = state.db.lock();
    db.list_categories().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_category(state: State<'_, AppState>, name: String) -> Result<Category, String> {
    let db = state.db.lock();
    db.create_category(&name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_category(state: State<'_, AppState>, id: i64, name: String) -> Result<(), String> {
    let db = state.db.lock();
    db.rename_category(id, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_category(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock();
    db.delete_category(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_source_apps(state: State<'_, AppState>) -> Result<Vec<SourceApp>, String> {
    let db = state.db.lock();
    db.list_source_apps().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn copy_item_to_clipboard(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let (item, hide_sensitive_content) = {
        let db = state.db.lock();
        let item = db.get_item(&id).map_err(|e| e.to_string())?;
        let hide_sensitive_content = db
            .get_settings()
            .map(|settings| settings.hide_sensitive_content)
            .unwrap_or(true);
        (item, hide_sensitive_content)
    };
    authorize_sensitive_item(&item.content, hide_sensitive_content, "Copy sensitive clipboard item in ClipFlow.")?;
    restore_to_clipboard(&item, &state.monitor).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn copy_items_to_clipboard(
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> Result<usize, String> {
    if ids.is_empty() {
        return Ok(0);
    }

    let (items, hide_sensitive_content) = {
        let db = state.db.lock();
        let items = ids
            .iter()
            .map(|id| db.get_item(id).map_err(|e| e.to_string()))
            .collect::<Result<Vec<_>, _>>()?;
        let hide_sensitive_content = db
            .get_settings()
            .map(|settings| settings.hide_sensitive_content)
            .unwrap_or(true);
        (items, hide_sensitive_content)
    };

    if let Some(item) = items
        .iter()
        .find(|item| hide_sensitive_content && looks_sensitive(&item.content))
    {
        authorize_sensitive_item(
            &item.content,
            hide_sensitive_content,
            "Copy multiple sensitive clipboard items in ClipFlow.",
        )?;
    }

    state.monitor.suppress_next();
    let text = items
        .iter()
        .map(|item| item.content.trim())
        .filter(|content| !content.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())?;
    Ok(items.len())
}

#[tauri::command]
pub fn copy_text_to_clipboard(state: State<'_, AppState>, text: String) -> Result<(), String> {
    state.monitor.suppress_next();
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn paste_item_by_id(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let (item, auto_paste, hide_sensitive_content) = {
        let db = state.db.lock();
        let item = db.get_item(&id).map_err(|e| e.to_string())?;
        let settings = db.get_settings().unwrap_or_default();
        (item, settings.auto_paste, settings.hide_sensitive_content)
    };
    authorize_sensitive_item(&item.content, hide_sensitive_content, "Paste sensitive clipboard item from ClipFlow.")?;
    if should_open_in_browser(&item) || auto_paste {
        paste_item(&item, &state.monitor).map_err(|e| e.to_string())
    } else {
        restore_to_clipboard(&item, &state.monitor).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn paste_recent_by_index(state: State<'_, AppState>, index: u8) -> Result<(), String> {
    let (items, auto_paste, hide_sensitive_content) = {
        let db = state.db.lock();
        let items = if let Some(item) = db
            .get_pinned_by_shortcut(index as i64)
            .map_err(|e| e.to_string())?
        {
            vec![item]
        } else {
            db.get_recent(10).map_err(|e| e.to_string())?
        };
        let settings = db.get_settings().unwrap_or_default();
        (items, settings.auto_paste, settings.hide_sensitive_content)
    };
    let idx = if items.len() == 1 && items[0].pin_shortcut == Some(index as i64) {
        0
    } else {
        index as usize
    };
    if idx >= items.len() {
        return Err("No item at this index".to_string());
    }
    authorize_sensitive_item(
        &items[idx].content,
        hide_sensitive_content,
        "Paste sensitive clipboard item from ClipFlow.",
    )?;
    if should_open_in_browser(&items[idx]) || auto_paste {
        paste_item(&items[idx], &state.monitor).map_err(|e| e.to_string())
    } else {
        restore_to_clipboard(&items[idx], &state.monitor).map_err(|e| e.to_string())
    }
}

fn authorize_sensitive_item(
    content: &str,
    hide_sensitive_content: bool,
    reason: &str,
) -> Result<(), String> {
    if !hide_sensitive_content || !looks_sensitive(content) {
        return Ok(());
    }

    if crate::privacy_auth::authenticate_with_reason(reason) {
        Ok(())
    } else {
        Err("Sensitive item locked".to_string())
    }
}

struct DemoItem {
    content: &'static str,
    item_type: ItemType,
    category: &'static str,
    source_app: &'static str,
    file_name: Option<&'static str>,
    mime_type: &'static str,
    raw_data: Option<Vec<u8>>,
    created_at: i64,
}

fn demo_items(now: i64) -> Vec<DemoItem> {
    vec![
        DemoItem {
            content: "Write a concise launch post for ClipFlow focused on notch access, local OCR, and privacy-first clipboard history.",
            item_type: ItemType::Text,
            category: "Prompts",
            source_app: "ChatGPT",
            file_name: None,
            mime_type: "text/plain",
            raw_data: None,
            created_at: now,
        },
        DemoItem {
            content: "https://www.figma.com/file/clipflow-launch-board?utm_source=twitter&utm_campaign=launch",
            item_type: ItemType::Url,
            category: "Assets",
            source_app: "Arc",
            file_name: None,
            mime_type: "text/plain",
            raw_data: None,
            created_at: now - 90,
        },
        DemoItem {
            content: "const cleanUrl = (url: string) => {\n  const next = new URL(url);\n  ['utm_source', 'utm_campaign', 'gclid'].forEach((key) => next.searchParams.delete(key));\n  return next.toString();\n};",
            item_type: ItemType::Code,
            category: "Code",
            source_app: "Cursor",
            file_name: None,
            mime_type: "text/plain",
            raw_data: None,
            created_at: now - 180,
        },
        DemoItem {
            content: "Screenshot · 1280×720\n\nClipFlow launch metrics\nWaitlist conversion 18%\nTop copied item: pricing page\nDemo task: Copy extracted text from screenshot",
            item_type: ItemType::Image,
            category: "Screenshots",
            source_app: "Shottr",
            file_name: Some("clipflow-launch-metrics.png"),
            mime_type: "image/png",
            raw_data: Some(demo_png([91, 95, 199, 255], [20, 20, 24, 255])),
            created_at: now - 270,
        },
        DemoItem {
            content: "Screenshot · 1280×720\n\nCompetitor research\nPaste: iCloud sync\nSupaste: visual history\nClipFlow: notch-native recall and local OCR",
            item_type: ItemType::Image,
            category: "Screenshots",
            source_app: "CleanShot X",
            file_name: Some("competitor-research.png"),
            mime_type: "image/png",
            raw_data: Some(demo_png([48, 176, 90, 255], [245, 245, 247, 255])),
            created_at: now - 360,
        },
        DemoItem {
            content: "#5B5FC7",
            item_type: ItemType::Color,
            category: "Colors",
            source_app: "Figma",
            file_name: None,
            mime_type: "text/plain",
            raw_data: None,
            created_at: now - 450,
        },
    ]
}

fn demo_png(accent: [u8; 4], background: [u8; 4]) -> Vec<u8> {
    let width = 960usize;
    let height = 540usize;
    let mut rgba = vec![0u8; width * height * 4];
    fill_rect(&mut rgba, width, 0, 0, width, height, background);
    fill_rect(&mut rgba, width, 44, 38, 872, 72, [255, 255, 255, 28]);
    fill_rect(&mut rgba, width, 70, 62, 310, 18, [255, 255, 255, 92]);
    fill_rect(&mut rgba, width, 44, 142, 258, 314, [255, 255, 255, 235]);
    fill_rect(&mut rgba, width, 332, 142, 258, 314, [255, 255, 255, 235]);
    fill_rect(&mut rgba, width, 620, 142, 258, 314, [255, 255, 255, 235]);
    fill_rect(&mut rgba, width, 70, 174, 80, 80, accent);
    fill_rect(&mut rgba, width, 358, 174, 80, 80, [18, 18, 22, 255]);
    fill_rect(&mut rgba, width, 646, 174, 80, 80, accent);
    fill_rect(&mut rgba, width, 70, 286, 180, 16, [32, 32, 38, 170]);
    fill_rect(&mut rgba, width, 70, 318, 132, 12, [32, 32, 38, 95]);
    fill_rect(&mut rgba, width, 358, 286, 180, 16, [32, 32, 38, 170]);
    fill_rect(&mut rgba, width, 358, 318, 132, 12, [32, 32, 38, 95]);
    fill_rect(&mut rgba, width, 646, 286, 180, 16, [32, 32, 38, 170]);
    fill_rect(&mut rgba, width, 646, 318, 132, 12, [32, 32, 38, 95]);

    encode_png(width, height, &rgba)
}

fn fill_rect(
    rgba: &mut [u8],
    width: usize,
    x: usize,
    y: usize,
    rect_width: usize,
    rect_height: usize,
    color: [u8; 4],
) {
    for row in y..(y + rect_height) {
        for col in x..(x + rect_width) {
            let index = (row * width + col) * 4;
            if index + 3 >= rgba.len() {
                continue;
            }
            rgba[index..index + 4].copy_from_slice(&color);
        }
    }
}

fn encode_png(width: usize, height: usize, rgba: &[u8]) -> Vec<u8> {
    let mut png_data = Vec::new();
    let mut encoder = png::Encoder::new(&mut png_data, width as u32, height as u32);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    if let Ok(mut writer) = encoder.write_header() {
        let _ = writer.write_image_data(rgba);
    }
    png_data
}
