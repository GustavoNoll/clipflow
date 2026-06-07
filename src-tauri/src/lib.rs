mod app_icon;
mod clipboard;
mod commands;
mod db;
mod monitor;
mod notch;
mod notch_layout;
mod ocr;
mod privacy_auth;
mod settings;
mod source_app;
mod types;

#[cfg(target_os = "macos")]
mod macos_menu;

use app_icon::AppIconCache;
use commands::AppState;
use db::Database;
use monitor::ClipboardMonitor;
use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, RunEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const QUICK_PASTE_WIDTH: f64 = 520.0;
const QUICK_PASTE_HEIGHT: f64 = 420.0;

#[cfg(target_os = "macos")]
extern "C" {
    fn clipflow_place_quick_paste_near_cursor(
        window: *mut std::ffi::c_void,
        width: f64,
        height: f64,
    );
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db = Arc::new(Mutex::new(
        Database::open().expect("failed to open database"),
    ));
    let monitor = Arc::new(ClipboardMonitor::new());
    let capture_paused = Arc::new(AtomicBool::new(false));
    let notch_hover_enabled = Arc::new(AtomicBool::new(false));
    let notch_hover_for_setup = Arc::clone(&notch_hover_enabled);
    let startup_shown = Arc::new(AtomicBool::new(false));

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let app_for_thread = app.clone();
            let app_for_closure = app.clone();
            let _ = app_for_thread.run_on_main_thread(move || {
                if !notch::is_notch_click_mode(&app_for_closure) {
                    show_main_window(&app_for_closure);
                }
            });
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState {
            db: Arc::clone(&db),
            monitor: Arc::clone(&monitor),
            capture_paused: Arc::clone(&capture_paused),
            notch_hover_enabled: Arc::clone(&notch_hover_enabled),
            app_icons: Arc::new(AppIconCache::new()),
        })
        .setup(move |app| {
            #[cfg(target_os = "macos")]
            {
                app.manage(macos_menu::MacosMenuState::new());
            }
            #[cfg(target_os = "macos")]
            {
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                let _ = app.set_dock_visibility(false);
            }

            let handle = app.handle().clone();
            monitor.start(handle.clone(), Arc::clone(&db), Arc::clone(&capture_paused));

            {
                let settings = db.lock().get_settings().unwrap_or_default();
                capture_paused.store(settings.capture_paused, Ordering::SeqCst);
                notch_hover_for_setup.store(settings.notch_hover_enabled, Ordering::SeqCst);
                if settings.notch_hover_enabled {
                    notch::apply_notch_click_setting(app.handle(), true);
                }
            }

            if !notch::is_notch_click_mode(app.handle()) {
                hide_auxiliary_windows(app.handle());
            } else if let Some(win) = app.get_webview_window("main") {
                let _ = win.hide();
            }
            notch::start_layout_refresh_poller(Arc::clone(&notch_hover_for_setup));
            std::thread::spawn(|| {
                notch_layout::refresh_layout();
            });

            setup_tray(app)?;

            #[cfg(target_os = "macos")]
            {
                if let Err(err) = macos_menu::setup(app) {
                    eprintln!("ClipFlow: native menu unavailable ({err})");
                } else {
                    let settings = app
                        .state::<AppState>()
                        .db
                        .lock()
                        .get_settings()
                        .unwrap_or_default();
                    macos_menu::sync_from_settings(app.handle(), &settings);
                }
            }

            if let Err(err) = register_shortcuts(app.handle()) {
                eprintln!("ClipFlow: global shortcuts unavailable ({err})");
            }

            if !notch::is_notch_click_mode(app.handle()) {
                show_main_window(app.handle());
            }
            Ok(())
        })
        .on_menu_event(|app, event| {
            #[cfg(target_os = "macos")]
            macos_menu::handle_event(app, event);
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_items,
            commands::get_recent,
            commands::get_contextual_recent,
            commands::list_recent_downloads,
            commands::file_items_from_paths,
            commands::get_item,
            commands::delete_item,
            commands::delete_items,
            commands::clear_history,
            commands::toggle_favorite,
            commands::set_items_favorite,
            commands::set_items_pinned,
            commands::set_pin_shortcut,
            commands::set_item_category,
            commands::list_categories,
            commands::create_category,
            commands::rename_category,
            commands::delete_category,
            commands::list_source_apps,
            commands::copy_item_to_clipboard,
            commands::copy_items_to_clipboard,
            commands::copy_download_to_clipboard,
            commands::copy_download_paths_to_clipboard,
            commands::copy_file_paths_to_clipboard,
            commands::copy_text_to_clipboard,
            commands::paste_item_by_id,
            commands::paste_download_by_path,
            commands::paste_file_by_path,
            commands::paste_recent_by_index,
            commands::get_settings,
            commands::save_settings,
            commands::set_notch_expanded,
            commands::set_notch_hover_preview,
            commands::open_library_window,
            commands::get_app_icon,
            commands::seed_demo_data,
            commands::authenticate_privacy_reveal,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run({
            let startup_shown = Arc::clone(&startup_shown);
            move |app, event| match event {
                RunEvent::Ready => {
                    if !startup_shown.swap(true, Ordering::SeqCst)
                        && !notch::is_notch_click_mode(app)
                    {
                        show_main_window(app);
                    }
                }
                RunEvent::Reopen {
                    has_visible_windows,
                    ..
                } => {
                    if !notch::is_notch_click_mode(app)
                        && !has_visible_windows
                        && !has_visible_auxiliary_window(app)
                        && !notch::is_notch_interaction_active()
                    {
                        show_main_window(app);
                    }
                }
                RunEvent::ExitRequested { api, .. } => {
                    api.prevent_exit();
                }
                RunEvent::WindowEvent { label, event, .. } => {
                    if label == "main" {
                        if let tauri::WindowEvent::CloseRequested { ref api, .. } = event {
                            api.prevent_close();
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.hide();
                            }
                            if notch::is_notch_click_mode(app) {
                                notch::show_notch_trigger(app);
                            }
                        }
                    }
                    if label == "quick-paste" {
                        if let tauri::WindowEvent::Focused(false) = event {
                            if let Some(win) = app.get_webview_window("quick-paste") {
                                let _ = win.hide();
                            }
                        }
                    }
                    if label == "notch-shelf" {
                        if let tauri::WindowEvent::Focused(false) = event {
                            if notch::is_notch_click_mode(app) && notch::is_shelf_expanded() {
                                notch::collapse_shelf(app);
                            } else if !notch::is_notch_click_mode(app) {
                                if let Some(win) = app.get_webview_window("notch-shelf") {
                                    let _ = win.hide();
                                }
                            }
                        }
                    }
                }
                _ => {}
            }
        });
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Open Library", true, None::<&str>)?;
    let shelf = MenuItem::with_id(app, "shelf", "Notch Shelf", true, None::<&str>)?;
    let quick = MenuItem::with_id(app, "quick", "Quick Paste", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &shelf, &quick, &quit])?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .tooltip("ClipFlow")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "shelf" => notch::toggle_notch_shelf(app),
            "quick" => toggle_quick_paste(app),
            "quit" => {
                app.state::<AppState>().monitor.stop();
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn toggle_launcher(app: &tauri::AppHandle) {
    let launcher = {
        let state = app.state::<AppState>();
        let db = state.db.lock();
        db.get_settings()
            .map(|s| s.default_launcher)
            .unwrap_or_else(|_| "notch".to_string())
    };
    if launcher == "quick-paste" {
        toggle_quick_paste(app);
    } else {
        notch::toggle_notch_shelf(app);
    }
}

pub(crate) fn register_shortcuts(
    handle: &tauri::AppHandle,
) -> Result<(), Box<dyn std::error::Error>> {
    let gs = handle.global_shortcut();
    let settings = {
        let state = handle.state::<AppState>();
        let settings = state.db.lock().get_settings().unwrap_or_default();
        settings
    };
    let _ = gs.unregister_all();

    let notch_shortcut = parse_shortcut(&settings.launcher_shortcut)
        .unwrap_or_else(|| Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SUPER), Code::KeyV));
    gs.on_shortcut(notch_shortcut, |app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            toggle_launcher(app);
        }
    })?;

    let quick_paste = parse_shortcut(&settings.quick_paste_shortcut).unwrap_or_else(|| {
        Shortcut::new(
            Some(Modifiers::CONTROL | Modifiers::SHIFT | Modifiers::SUPER),
            Code::KeyV,
        )
    });
    gs.on_shortcut(quick_paste, |app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            toggle_quick_paste(app);
        }
    })?;

    for (i, code) in [
        Code::Digit0,
        Code::Digit1,
        Code::Digit2,
        Code::Digit3,
        Code::Digit4,
        Code::Digit5,
        Code::Digit6,
        Code::Digit7,
        Code::Digit8,
        Code::Digit9,
    ]
    .iter()
    .enumerate()
    {
        let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SUPER), *code);
        let index = i as u8;
        gs.on_shortcut(shortcut, move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                paste_recent(app, index);
            }
        })?;
    }

    Ok(())
}

fn parse_shortcut(raw: &str) -> Option<Shortcut> {
    let mut modifiers = Modifiers::empty();
    let mut code = None;

    for part in raw
        .split('+')
        .map(str::trim)
        .filter(|part| !part.is_empty())
    {
        match part.to_ascii_lowercase().as_str() {
            "control" | "ctrl" => modifiers |= Modifiers::CONTROL,
            "shift" => modifiers |= Modifiers::SHIFT,
            "alt" | "option" => modifiers |= Modifiers::ALT,
            "meta" | "cmd" | "command" | "super" => modifiers |= Modifiers::SUPER,
            key => code = parse_key_code(key),
        }
    }

    code.map(|code| {
        let modifiers = if modifiers.is_empty() {
            None
        } else {
            Some(modifiers)
        };
        Shortcut::new(modifiers, code)
    })
}

fn parse_key_code(key: &str) -> Option<Code> {
    match key {
        "keya" | "a" => Some(Code::KeyA),
        "keyb" | "b" => Some(Code::KeyB),
        "keyc" | "c" => Some(Code::KeyC),
        "keyd" | "d" => Some(Code::KeyD),
        "keye" | "e" => Some(Code::KeyE),
        "keyf" | "f" => Some(Code::KeyF),
        "keyg" | "g" => Some(Code::KeyG),
        "keyh" | "h" => Some(Code::KeyH),
        "keyi" | "i" => Some(Code::KeyI),
        "keyj" | "j" => Some(Code::KeyJ),
        "keyk" | "k" => Some(Code::KeyK),
        "keyl" | "l" => Some(Code::KeyL),
        "keym" | "m" => Some(Code::KeyM),
        "keyn" | "n" => Some(Code::KeyN),
        "keyo" | "o" => Some(Code::KeyO),
        "keyp" | "p" => Some(Code::KeyP),
        "keyq" | "q" => Some(Code::KeyQ),
        "keyr" | "r" => Some(Code::KeyR),
        "keys" | "s" => Some(Code::KeyS),
        "keyt" | "t" => Some(Code::KeyT),
        "keyu" | "u" => Some(Code::KeyU),
        "keyv" | "v" => Some(Code::KeyV),
        "keyw" | "w" => Some(Code::KeyW),
        "keyx" | "x" => Some(Code::KeyX),
        "keyy" | "y" => Some(Code::KeyY),
        "keyz" | "z" => Some(Code::KeyZ),
        "digit0" | "0" => Some(Code::Digit0),
        "digit1" | "1" => Some(Code::Digit1),
        "digit2" | "2" => Some(Code::Digit2),
        "digit3" | "3" => Some(Code::Digit3),
        "digit4" | "4" => Some(Code::Digit4),
        "digit5" | "5" => Some(Code::Digit5),
        "digit6" | "6" => Some(Code::Digit6),
        "digit7" | "7" => Some(Code::Digit7),
        "digit8" | "8" => Some(Code::Digit8),
        "digit9" | "9" => Some(Code::Digit9),
        "space" => Some(Code::Space),
        _ => None,
    }
}

fn hide_auxiliary_windows(app: &tauri::AppHandle) {
    for label in ["notch-shelf", "quick-paste"] {
        if let Some(win) = app.get_webview_window(label) {
            let _ = win.hide();
        }
    }
    if notch::is_notch_click_mode(app) {
        notch::sync_hover_collapsed();
    }
}

fn prepare_auxiliary_windows_for_main(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("quick-paste") {
        let _ = win.hide();
    }
    if notch::is_notch_click_mode(app) {
        notch::collapse_shelf(app);
    } else if let Some(win) = app.get_webview_window("notch-shelf") {
        let _ = win.hide();
    }
}

fn has_visible_auxiliary_window(app: &tauri::AppHandle) -> bool {
    ["notch-shelf", "quick-paste"].iter().any(|label| {
        app.get_webview_window(label)
            .and_then(|win| win.is_visible().ok())
            .unwrap_or(false)
    })
}

pub(crate) fn show_main_window(app: &tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    {
        let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
        let _ = app.set_dock_visibility(false);
    }

    let _ = app.show();
    prepare_auxiliary_windows_for_main(app);

    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize::new(1200.0, 800.0)));
        let _ = win.center();
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

pub(crate) fn toggle_quick_paste(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("quick-paste") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            notch::hide_notch_shelf(app);
            place_quick_paste_window(&win);
            let _ = win.show();
            let _ = win.set_focus();
            let _ = win.emit("quick-paste:open", ());
        }
    }
}

#[cfg(target_os = "macos")]
fn place_quick_paste_window(win: &tauri::WebviewWindow) {
    let _ = win.with_webview(|webview| unsafe {
        clipflow_place_quick_paste_near_cursor(
            webview.ns_window(),
            QUICK_PASTE_WIDTH,
            QUICK_PASTE_HEIGHT,
        );
    });
}

#[cfg(not(target_os = "macos"))]
fn place_quick_paste_window(win: &tauri::WebviewWindow) {
    let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize::new(
        QUICK_PASTE_WIDTH,
        QUICK_PASTE_HEIGHT,
    )));
    let _ = win.center();
}

fn paste_recent(app: &tauri::AppHandle, index: u8) {
    let state = app.state::<AppState>();
    let _ = commands::paste_recent_by_index(state, index);
    notch::hide_notch_shelf(app);
    if let Some(win) = app.get_webview_window("quick-paste") {
        let _ = win.hide();
    }
}
