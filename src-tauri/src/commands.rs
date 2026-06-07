use arboard::Clipboard;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::{Emitter, Manager, State};
use uuid::Uuid;

use crate::app_icon::AppIconCache;
use crate::clipboard::{hash_content, platform};
use crate::db::Database;
use crate::monitor::{
    looks_sensitive, paste_item, restore_to_clipboard, should_open_in_browser, ClipboardMonitor,
};
use crate::settings::AppSettings;
use crate::types::{Category, ClipboardItem, ItemType, PaginatedItems, SearchParams, SourceApp};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BundlePayload {
    items: Vec<BundleEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BundleEntry {
    item_type: String,
    content: String,
    file_name: Option<String>,
    mime_type: Option<String>,
    image_data: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CopyFeedbackPayload {
    count: usize,
    labels: Vec<String>,
    first_item_type: String,
    first_source_app: Option<String>,
}

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
            if same_app {
                0
            } else {
                1
            }
        });
    }
    items.truncate(limit as usize);
    Ok(items)
}

#[tauri::command]
pub fn list_recent_downloads(limit: Option<i64>) -> Result<Vec<ClipboardItem>, String> {
    let downloads_dir = downloads_dir()?;
    let limit = limit.unwrap_or(12).clamp(1, 50) as usize;
    let mut entries = std::fs::read_dir(&downloads_dir)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            let metadata = entry.metadata().ok()?;
            let modified = metadata.modified().ok()?;
            Some((path, metadata.len() as i64, modified))
        })
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| right.2.cmp(&left.2));

    Ok(entries
        .into_iter()
        .take(limit)
        .filter_map(|(path, size, modified)| download_item(path, size, modified).ok())
        .collect())
}

#[tauri::command]
pub fn file_items_from_paths(paths: Vec<String>) -> Result<Vec<ClipboardItem>, String> {
    existing_file_paths(paths)?
        .into_iter()
        .map(|path| file_item_from_path(&path))
        .collect()
}

#[tauri::command]
pub fn copy_download_to_clipboard(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<(), String> {
    write_download_paths_to_clipboard(&app, &state.monitor, vec![path]).map(|_| ())
}

#[tauri::command]
pub fn copy_download_paths_to_clipboard(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<usize, String> {
    write_download_paths_to_clipboard(&app, &state.monitor, paths)
}

#[tauri::command]
pub fn copy_file_paths_to_clipboard(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<usize, String> {
    let paths = existing_file_paths(paths)?;
    write_paths_to_clipboard(&app, &state.monitor, paths, "Files")
}

fn write_download_paths_to_clipboard(
    app: &tauri::AppHandle,
    monitor: &ClipboardMonitor,
    paths: Vec<String>,
) -> Result<usize, String> {
    let paths = existing_download_paths(paths)?;
    write_paths_to_clipboard(app, monitor, paths, "Downloads")
}

fn write_paths_to_clipboard(
    app: &tauri::AppHandle,
    monitor: &ClipboardMonitor,
    paths: Vec<PathBuf>,
    source_app: &str,
) -> Result<usize, String> {
    monitor.suppress_next();
    platform::write_file_urls(&paths)?;
    emit_copy_feedback(
        app,
        CopyFeedbackPayload {
            count: paths.len(),
            labels: vec!["File".to_string()],
            first_item_type: "file".to_string(),
            first_source_app: Some(source_app.to_string()),
        },
    );
    Ok(paths.len())
}

#[tauri::command]
pub fn paste_download_by_path(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let path = existing_download_paths(vec![path])?
        .into_iter()
        .next()
        .ok_or_else(|| "Download file not found".to_string())?;
    let item = download_item_from_path(&path)?;
    let settings = state.db.lock().get_settings().unwrap_or_default();
    if settings.auto_paste {
        paste_item(&item, &state.monitor).map_err(|e| e.to_string())
    } else {
        restore_to_clipboard(&item, &state.monitor).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn paste_file_by_path(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let path = existing_file_paths(vec![path])?
        .into_iter()
        .next()
        .ok_or_else(|| "File not found".to_string())?;
    let item = file_item_from_path(&path)?;
    let settings = state.db.lock().get_settings().unwrap_or_default();
    if settings.auto_paste {
        paste_item(&item, &state.monitor).map_err(|e| e.to_string())
    } else {
        restore_to_clipboard(&item, &state.monitor).map_err(|e| e.to_string())
    }
}

fn downloads_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME is unavailable".to_string())?;
    Ok(PathBuf::from(home).join("Downloads"))
}

fn existing_download_paths(paths: Vec<String>) -> Result<Vec<PathBuf>, String> {
    let downloads_dir = downloads_dir()?.canonicalize().map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for path in paths {
        let path = PathBuf::from(path);
        let canonical = path.canonicalize().map_err(|e| e.to_string())?;
        if !canonical.starts_with(&downloads_dir) {
            return Err("File is outside Downloads".to_string());
        }
        result.push(canonical);
    }
    if result.is_empty() {
        return Err("No download files selected".to_string());
    }
    Ok(result)
}

fn existing_file_paths(paths: Vec<String>) -> Result<Vec<PathBuf>, String> {
    let mut result = Vec::new();
    for path in paths {
        let canonical = PathBuf::from(path)
            .canonicalize()
            .map_err(|e| e.to_string())?;
        if !canonical.exists() {
            return Err("File not found".to_string());
        }
        result.push(canonical);
    }
    if result.is_empty() {
        return Err("No files selected".to_string());
    }
    Ok(result)
}

fn download_item_from_path(path: &PathBuf) -> Result<ClipboardItem, String> {
    let metadata = std::fs::metadata(path).map_err(|e| e.to_string())?;
    let modified = metadata.modified().map_err(|e| e.to_string())?;
    download_item(path.clone(), metadata.len() as i64, modified)
}

fn download_item(
    path: PathBuf,
    size: i64,
    modified: std::time::SystemTime,
) -> Result<ClipboardItem, String> {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Download")
        .to_string();
    let created_at = chrono::DateTime::<chrono::Utc>::from(modified).to_rfc3339();
    let content = path.to_string_lossy().to_string();
    Ok(ClipboardItem {
        id: format!("download:{}", hash_content(content.as_bytes())),
        content,
        preview: file_name.clone(),
        item_type: ItemType::File.as_str().to_string(),
        source_app: Some("Downloads".to_string()),
        category_id: -2,
        category_name: "Downloads".to_string(),
        is_favorite: false,
        is_pinned: false,
        pin_shortcut: None,
        file_name: Some(file_name),
        mime_type: Some("application/octet-stream".to_string()),
        thumbnail: None,
        content_size: size,
        created_at,
        tags: vec![],
    })
}

fn file_item_from_path(path: &PathBuf) -> Result<ClipboardItem, String> {
    let metadata = std::fs::metadata(path).map_err(|e| e.to_string())?;
    let modified = metadata.modified().map_err(|e| e.to_string())?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("File")
        .to_string();
    let source_app = path
        .parent()
        .and_then(|parent| parent.file_name())
        .and_then(|name| name.to_str())
        .unwrap_or("Files")
        .to_string();
    let created_at = chrono::DateTime::<chrono::Utc>::from(modified).to_rfc3339();
    let content = path.to_string_lossy().to_string();
    Ok(ClipboardItem {
        id: format!("file:{}", hash_content(content.as_bytes())),
        content,
        preview: file_name.clone(),
        item_type: ItemType::File.as_str().to_string(),
        source_app: Some(source_app),
        category_id: -3,
        category_name: "Bench".to_string(),
        is_favorite: false,
        is_pinned: false,
        pin_shortcut: None,
        file_name: Some(file_name),
        mime_type: Some("application/octet-stream".to_string()),
        thumbnail: None,
        content_size: metadata.len() as i64,
        created_at,
        tags: vec![],
    })
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
    db.set_items_favorite(&ids, favorite)
        .map_err(|e| e.to_string())
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
    db.set_pin_shortcut(&id, shortcut)
        .map_err(|e| e.to_string())
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
    app: tauri::AppHandle,
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
    authorize_sensitive_item(
        &item.content,
        hide_sensitive_content,
        "Copy sensitive clipboard item in ClipFlow.",
    )?;
    if ItemType::from_str(&item.item_type) == ItemType::Bundle {
        restore_bundle_to_clipboard(&item, &state.monitor)?;
    } else {
        restore_to_clipboard(&item, &state.monitor).map_err(|e| e.to_string())?;
    }
    emit_copy_feedback(&app, copy_feedback_for_item(&item));
    Ok(())
}

#[tauri::command]
pub fn copy_items_to_clipboard(
    app: tauri::AppHandle,
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

    if items.len() == 1 {
        if ItemType::from_str(&items[0].item_type) == ItemType::Bundle {
            restore_bundle_to_clipboard(&items[0], &state.monitor)?;
        } else {
            restore_to_clipboard(&items[0], &state.monitor).map_err(|e| e.to_string())?;
        }
        emit_copy_feedback(&app, copy_feedback_for_item(&items[0]));
        return Ok(1);
    }

    let bundle = create_bundle_item(&state, &items)?;
    restore_bundle_to_clipboard(&bundle, &state.monitor)?;
    let _ = app.emit("clipboard:new-item", "bundle");
    emit_copy_feedback(&app, copy_feedback_for_items(&items));
    Ok(items.len())
}

fn emit_copy_feedback(app: &tauri::AppHandle, payload: CopyFeedbackPayload) {
    crate::notch::show_copy_feedback(app);
    let _ = app.emit("clipboard:item-copied", &payload);
    if let Some(win) = app.get_webview_window("notch-shelf") {
        let _ = win.emit("notch-shelf:copy-feedback", payload);
    }
}

fn copy_feedback_for_item(item: &ClipboardItem) -> CopyFeedbackPayload {
    if ItemType::from_str(&item.item_type) == ItemType::Bundle {
        if let Ok(payload) = bundle_payload(item) {
            return copy_feedback_for_bundle_entries(&payload.items, item.source_app.clone());
        }
    }

    CopyFeedbackPayload {
        count: 1,
        labels: vec![copy_feedback_label(&item.item_type)],
        first_item_type: item.item_type.clone(),
        first_source_app: item.source_app.clone(),
    }
}

fn copy_feedback_for_items(items: &[ClipboardItem]) -> CopyFeedbackPayload {
    let first = items.first();
    let mut labels = Vec::new();
    for item in items {
        push_unique_label(&mut labels, copy_feedback_label(&item.item_type));
        if labels.len() >= 3 {
            break;
        }
    }

    CopyFeedbackPayload {
        count: items.len(),
        labels,
        first_item_type: first
            .map(|item| item.item_type.clone())
            .unwrap_or_else(|| "text".to_string()),
        first_source_app: first.and_then(|item| item.source_app.clone()),
    }
}

fn copy_feedback_for_bundle_entries(
    items: &[BundleEntry],
    fallback_source_app: Option<String>,
) -> CopyFeedbackPayload {
    let mut labels = Vec::new();
    for item in items {
        push_unique_label(&mut labels, copy_feedback_label(&item.item_type));
        if labels.len() >= 3 {
            break;
        }
    }

    CopyFeedbackPayload {
        count: items.len(),
        labels,
        first_item_type: items
            .first()
            .map(|item| item.item_type.clone())
            .unwrap_or_else(|| "bundle".to_string()),
        first_source_app: fallback_source_app,
    }
}

fn push_unique_label(labels: &mut Vec<String>, label: String) {
    if !labels.iter().any(|existing| existing == &label) {
        labels.push(label);
    }
}

fn copy_feedback_label(item_type: &str) -> String {
    match ItemType::from_str(item_type) {
        ItemType::Text => "Text",
        ItemType::Url => "Link",
        ItemType::Code => "Code",
        ItemType::Image => "Image",
        ItemType::File => "File",
        ItemType::Color => "Color",
        ItemType::Bundle => "Group",
    }
    .to_string()
}

fn create_bundle_item(
    state: &State<'_, AppState>,
    items: &[ClipboardItem],
) -> Result<ClipboardItem, String> {
    let payload = BundlePayload {
        items: items
            .iter()
            .map(bundle_entry_from_item)
            .collect::<Result<Vec<_>, _>>()?,
    };
    let payload_json = serde_json::to_vec(&payload).map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().timestamp();
    let id = Uuid::new_v4().to_string();
    let title = format!("{} items copied", items.len());
    let summary = items
        .iter()
        .take(6)
        .map(|item| item.preview.trim())
        .filter(|preview| !preview.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    let content = if summary.is_empty() {
        title.clone()
    } else {
        format!("{title}\n\n{summary}")
    };
    let content_hash = hash_content(&payload_json);

    let db = state.db.lock();
    let category_id = db
        .category_id_by_name("History")
        .map_err(|e| e.to_string())?;
    let inserted = db
        .insert_item(
            &id,
            &content,
            &content_hash,
            Some(&payload_json),
            ItemType::Bundle,
            Some("ClipFlow"),
            category_id,
            Some(&format!("{title}.clipflow-bundle")),
            Some("application/vnd.clipflow.bundle+json"),
            now,
        )
        .map_err(|e| e.to_string())?;
    let item_id = inserted.unwrap_or(id);
    db.get_item(&item_id).map_err(|e| e.to_string())
}

fn bundle_entry_from_item(item: &ClipboardItem) -> Result<BundleEntry, String> {
    if ItemType::from_str(&item.item_type) == ItemType::Bundle {
        let payload = bundle_payload(item)?;
        return Ok(BundleEntry {
            item_type: item.item_type.clone(),
            content: serde_json::to_string(&payload).map_err(|e| e.to_string())?,
            file_name: item.file_name.clone(),
            mime_type: item.mime_type.clone(),
            image_data: None,
        });
    }

    Ok(BundleEntry {
        item_type: item.item_type.clone(),
        content: item.content.clone(),
        file_name: item.file_name.clone(),
        mime_type: item.mime_type.clone(),
        image_data: if ItemType::from_str(&item.item_type) == ItemType::Image {
            Some(image_png_base64(item)?)
        } else {
            None
        },
    })
}

fn restore_bundle_to_clipboard(
    bundle: &ClipboardItem,
    monitor: &ClipboardMonitor,
) -> Result<(), String> {
    let payload = bundle_payload(bundle)?;
    if payload.items.iter().any(bundle_entry_has_file_payload) {
        monitor.suppress_next();
        let paths = export_bundle_entries_for_file_clipboard(&payload.items)?;
        platform::write_file_urls(&paths)?;
        return Ok(());
    }

    monitor.suppress_next();
    let text = payload
        .items
        .iter()
        .map(|item| item.content.trim())
        .filter(|content| !content.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())
}

fn bundle_payload(bundle: &ClipboardItem) -> Result<BundlePayload, String> {
    let Some(raw) = &bundle.thumbnail else {
        return Err("Bundle data unavailable".to_string());
    };
    let Some(b64) = raw.strip_prefix("data:application/vnd.clipflow.bundle+json;base64,") else {
        return Err("Bundle data unavailable".to_string());
    };
    use base64::{engine::general_purpose::STANDARD, Engine};
    let bytes = STANDARD.decode(b64).map_err(|e| e.to_string())?;
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}

fn bundle_entry_has_file_payload(item: &BundleEntry) -> bool {
    matches!(
        ItemType::from_str(&item.item_type),
        ItemType::Image | ItemType::File | ItemType::Bundle
    )
}

fn export_bundle_entries_for_file_clipboard(items: &[BundleEntry]) -> Result<Vec<PathBuf>, String> {
    let dir = std::env::temp_dir().join(format!(
        "clipflow-bulk-{}",
        chrono::Utc::now().timestamp_millis()
    ));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let mut paths = Vec::new();
    for (index, item) in items.iter().enumerate() {
        match ItemType::from_str(&item.item_type) {
            ItemType::Image => {
                let bytes = image_png_bytes_from_entry(item)?;
                let file_name = item
                    .file_name
                    .as_deref()
                    .filter(|name| !name.trim().is_empty())
                    .map(safe_file_name)
                    .unwrap_or_else(|| format!("ClipFlow image {}.png", index + 1));
                let path = dir.join(ensure_extension(&file_name, "png"));
                std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
                paths.push(path);
            }
            ItemType::File => {
                paths.extend(
                    item.content
                        .lines()
                        .map(str::trim)
                        .filter(|path| !path.is_empty())
                        .map(PathBuf::from)
                        .filter(|path| path.exists()),
                );
            }
            ItemType::Bundle => {
                let payload: BundlePayload =
                    serde_json::from_str(&item.content).map_err(|e| e.to_string())?;
                paths.extend(export_bundle_entries_for_file_clipboard(&payload.items)?);
            }
            ItemType::Text | ItemType::Url | ItemType::Code | ItemType::Color => {
                let ext = if matches!(ItemType::from_str(&item.item_type), ItemType::Code) {
                    "txt"
                } else {
                    "txt"
                };
                let path = dir.join(format!("ClipFlow clip {}.{ext}", index + 1));
                std::fs::write(&path, &item.content).map_err(|e| e.to_string())?;
                paths.push(path);
            }
        }
    }

    if paths.is_empty() {
        return Err("No files available to copy".to_string());
    }
    Ok(paths)
}

fn image_png_base64(item: &ClipboardItem) -> Result<String, String> {
    let Some(thumbnail) = &item.thumbnail else {
        return Err("Image data unavailable".to_string());
    };
    let Some(b64) = thumbnail.strip_prefix("data:image/png;base64,") else {
        return Err("Image data unavailable".to_string());
    };
    Ok(b64.to_string())
}

fn image_png_bytes_from_entry(item: &BundleEntry) -> Result<Vec<u8>, String> {
    let Some(b64) = item.image_data.as_deref() else {
        return Err("Image data unavailable".to_string());
    };
    use base64::{engine::general_purpose::STANDARD, Engine};
    STANDARD.decode(b64).map_err(|e| e.to_string())
}

fn safe_file_name(name: &str) -> String {
    name.chars()
        .map(|ch| match ch {
            '/' | '\\' | ':' | '\0' => '-',
            _ => ch,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

fn ensure_extension(file_name: &str, extension: &str) -> String {
    if file_name
        .rsplit('.')
        .next()
        .map(|ext| ext.eq_ignore_ascii_case(extension))
        .unwrap_or(false)
    {
        file_name.to_string()
    } else {
        format!("{file_name}.{extension}")
    }
}

#[tauri::command]
pub fn copy_text_to_clipboard(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    text: String,
) -> Result<(), String> {
    state.monitor.suppress_next();
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())?;
    emit_copy_feedback(
        &app,
        CopyFeedbackPayload {
            count: 1,
            labels: vec!["Text".to_string()],
            first_item_type: "text".to_string(),
            first_source_app: Some("ClipFlow".to_string()),
        },
    );
    Ok(())
}

#[tauri::command]
pub fn paste_item_by_id(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let (item, auto_paste, hide_sensitive_content) = {
        let db = state.db.lock();
        let item = db.get_item(&id).map_err(|e| e.to_string())?;
        let settings = db.get_settings().unwrap_or_default();
        (item, settings.auto_paste, settings.hide_sensitive_content)
    };
    authorize_sensitive_item(
        &item.content,
        hide_sensitive_content,
        "Paste sensitive clipboard item from ClipFlow.",
    )?;
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
