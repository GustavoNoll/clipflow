use crate::commands::AppState;
use crate::settings::AppSettings;
use parking_lot::Mutex;
use std::sync::Arc;
use tauri::{
    menu::{AboutMetadata, CheckMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu},
    App, AppHandle, Emitter, Manager, Wry,
};

pub struct MacosMenuState {
    pub pause_capture: Arc<Mutex<Option<CheckMenuItem<Wry>>>>,
}

impl MacosMenuState {
    pub fn new() -> Self {
        Self {
            pause_capture: Arc::new(Mutex::new(None)),
        }
    }
}

pub fn setup(app: &App) -> tauri::Result<()> {
    let handle = app.handle();
    let pkg = handle.package_info();
    let config = handle.config();

    let about_metadata = AboutMetadata {
        name: Some(pkg.name.clone()),
        version: Some(pkg.version.to_string()),
        copyright: config.bundle.copyright.clone(),
        authors: config.bundle.publisher.clone().map(|p| vec![p]),
        ..Default::default()
    };

    let initial_paused = {
        let state = app.state::<AppState>();
        let db = state.db.lock();
        db.get_settings()
            .map(|s| s.capture_paused)
            .unwrap_or(false)
    };

    let settings =
        MenuItem::with_id(handle, "settings", "Settings…", true, Some("Cmd+,"))?;
    let open_library =
        MenuItem::with_id(handle, "open-library", "Open Library", true, Some("Cmd+O"))?;
    let clear_history = MenuItem::with_id(
        handle,
        "clear-history",
        "Clear History…",
        true,
        None::<&str>,
    )?;
    let notch_shelf = MenuItem::with_id(
        handle,
        "notch-shelf",
        "Notch Shelf",
        true,
        Some("Ctrl+Cmd+V"),
    )?;
    let quick_paste = MenuItem::with_id(
        handle,
        "quick-paste",
        "Quick Paste",
        true,
        Some("Ctrl+Shift+Cmd+V"),
    )?;
    let find_library = MenuItem::with_id(
        handle,
        "find-library",
        "Find in Library…",
        true,
        Some("Cmd+F"),
    )?;
    let toggle_sidebar = MenuItem::with_id(
        handle,
        "toggle-sidebar",
        "Toggle Sidebar",
        true,
        Some("Cmd+Ctrl+S"),
    )?;
    let show_shortcuts = MenuItem::with_id(
        handle,
        "show-shortcuts",
        "Keyboard Shortcuts",
        true,
        None::<&str>,
    )?;

    let pause_capture = CheckMenuItem::with_id(
        handle,
        "pause-capture",
        "Pause Capture",
        true,
        initial_paused,
        None::<&str>,
    )?;

    if let Some(menu_state) = handle.try_state::<MacosMenuState>() {
        *menu_state.pause_capture.lock() = Some(pause_capture.clone());
    }

    let app_menu = Submenu::with_id_and_items(
        handle,
        "app",
        pkg.name.clone(),
        true,
        &[
            &PredefinedMenuItem::about(handle, None, Some(about_metadata))?,
            &settings,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::services(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::hide(handle, None)?,
            &PredefinedMenuItem::hide_others(handle, None)?,
            &PredefinedMenuItem::show_all(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::quit(handle, None)?,
        ],
    )?;

    let file_menu = Submenu::with_id_and_items(
        handle,
        "file",
        "File",
        true,
        &[
            &open_library,
            &PredefinedMenuItem::separator(handle)?,
            &pause_capture,
            &clear_history,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::close_window(handle, None)?,
        ],
    )?;

    let edit_menu = Submenu::with_id_and_items(
        handle,
        "edit",
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(handle, None)?,
            &PredefinedMenuItem::redo(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::cut(handle, None)?,
            &PredefinedMenuItem::copy(handle, None)?,
            &PredefinedMenuItem::paste(handle, None)?,
            &PredefinedMenuItem::select_all(handle, None)?,
        ],
    )?;

    let clipflow_menu = Submenu::with_id_and_items(
        handle,
        "clipflow",
        "ClipFlow",
        true,
        &[&notch_shelf, &quick_paste],
    )?;

    let view_menu = Submenu::with_id_and_items(
        handle,
        "view",
        "View",
        true,
        &[
            &find_library,
            &PredefinedMenuItem::separator(handle)?,
            &toggle_sidebar,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::fullscreen(handle, None)?,
        ],
    )?;

    let window_menu = Submenu::with_id_and_items(
        handle,
        "window",
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(handle, None)?,
            &PredefinedMenuItem::maximize(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::close_window(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::bring_all_to_front(handle, None)?,
        ],
    )?;

    let help_menu = Submenu::with_id_and_items(
        handle,
        "help",
        "Help",
        true,
        &[&show_shortcuts],
    )?;

    let menu = Menu::with_items(
        handle,
        &[
            &app_menu,
            &file_menu,
            &edit_menu,
            &clipflow_menu,
            &view_menu,
            &window_menu,
            &help_menu,
        ],
    )?;

    handle.set_menu(menu)?;
    Ok(())
}

pub fn sync_capture_menu(app: &AppHandle, paused: bool) {
    if let Some(menu_state) = app.try_state::<MacosMenuState>() {
        if let Some(item) = menu_state.pause_capture.lock().as_ref() {
            let _ = item.set_checked(paused);
        }
    }
}

pub fn sync_from_settings(app: &AppHandle, settings: &AppSettings) {
    sync_capture_menu(app, settings.capture_paused);
}

pub fn handle_event(app: &AppHandle, event: MenuEvent) {
    match event.id().0.as_str() {
        "settings" | "show-shortcuts" => emit_to_main(app, "menu:open-settings", ()),
        "open-library" => super::show_main_window(app),
        "notch-shelf" => crate::notch::toggle_notch_shelf(app),
        "quick-paste" => super::toggle_quick_paste(app),
        "clear-history" => emit_to_main(app, "menu:clear-history", ()),
        "find-library" => emit_to_main(app, "menu:focus-search", ()),
        "toggle-sidebar" => emit_to_main(app, "menu:toggle-sidebar", ()),
        "pause-capture" => toggle_capture(app),
        _ => {}
    }
}

fn emit_to_main(app: &AppHandle, event: &str, payload: ()) {
    super::show_main_window(app);
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.emit(event, payload);
    }
}

fn toggle_capture(app: &AppHandle) {
    let state = app.state::<AppState>();
    let mut settings = state.db.lock().get_settings().unwrap_or_default();
    settings.capture_paused = !settings.capture_paused;
    state
        .capture_paused
        .store(settings.capture_paused, std::sync::atomic::Ordering::SeqCst);

    {
        let db = state.db.lock();
        let _ = db.save_settings(&settings);
    }

    sync_capture_menu(app, settings.capture_paused);
    let _ = app.emit("settings:changed", &settings);
}
