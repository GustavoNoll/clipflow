use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::Duration;
use tauri::{Emitter, Manager, WebviewWindow};

use crate::notch_layout::{self, NotchLayout};

fn expanded_size(layout: &NotchLayout) -> (f64, f64) {
    let width = (layout.screen_width * 0.64).clamp(760.0, 980.0);
    let content_height = (layout.screen_height * 0.30).clamp(280.0, 330.0);
    (width, layout.collapsed_height + content_height)
}

fn hover_size(layout: &NotchLayout) -> (f64, f64) {
    expanded_size(layout)
}

fn notch_dimensions(layout: &NotchLayout, expanded: bool, hover_preview: bool) -> (f64, f64) {
    if expanded {
        expanded_size(layout)
    } else if hover_preview {
        hover_size(layout)
    } else {
        (layout.collapsed_width, layout.collapsed_height)
    }
}

#[cfg(target_os = "macos")]
extern "C" {
    fn clipflow_place_notch_window(
        window: *mut std::ffi::c_void,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    );
    fn clipflow_cursor_inside_rect(
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        margin: f64,
    ) -> bool;
}

#[cfg(target_os = "macos")]
fn place_notch_window_native(win: &WebviewWindow, layout: &NotchLayout, width: f64, height: f64) {
    let frame_origin_x =
        layout.screen_frame_origin_x + (layout.screen_width - width) / 2.0;
    let frame_origin_y = layout.screen_frame_max_y - height;

    let _ = win.with_webview(move |webview| {
        unsafe {
            clipflow_place_notch_window(
                webview.ns_window(),
                frame_origin_x,
                frame_origin_y,
                width,
                height,
            );
        }
    });
}

#[cfg(not(target_os = "macos"))]
fn place_notch_window_native(
    win: &WebviewWindow,
    _layout: &NotchLayout,
    width: f64,
    height: f64,
) {
    use tauri::{LogicalPosition, LogicalSize, Size};
    let _ = win.set_always_on_top(true);
    let _ = win.set_size(Size::Logical(LogicalSize::new(width, height)));
    let _ = win.set_position(tauri::Position::Logical(LogicalPosition::new(0.0, 0.0)));
}

fn apply_notch_window(win: &WebviewWindow, layout: &NotchLayout, expanded: bool, hover_preview: bool) {
    let (width, height) = notch_dimensions(layout, expanded, hover_preview);
    place_notch_window_native(win, layout, width, height);
    let _ = win.show();
}

#[cfg(target_os = "macos")]
fn cursor_inside_notch_rect(layout: &NotchLayout, width: f64, height: f64, margin: f64) -> bool {
    let frame_origin_x =
        layout.screen_frame_origin_x + (layout.screen_width - width) / 2.0;
    let frame_origin_y = layout.screen_frame_max_y - height;
    unsafe {
        clipflow_cursor_inside_rect(frame_origin_x, frame_origin_y, width, height, margin)
    }
}

#[cfg(not(target_os = "macos"))]
fn cursor_inside_notch_rect(
    _layout: &NotchLayout,
    _width: f64,
    _height: f64,
    _margin: f64,
) -> bool {
    true
}

static SHELF_EXPANDED: OnceLock<Mutex<bool>> = OnceLock::new();
static HOVER_PREVIEW: AtomicBool = AtomicBool::new(false);
static HOVER_MONITOR_RUNNING: AtomicBool = AtomicBool::new(false);
static LEAVE_MONITOR_RUNNING: AtomicBool = AtomicBool::new(false);

fn shelf_expanded() -> &'static Mutex<bool> {
    SHELF_EXPANDED.get_or_init(|| Mutex::new(false))
}

fn set_shelf_expanded(expanded: bool) {
    *shelf_expanded().lock() = expanded;
}

pub fn is_shelf_expanded() -> bool {
    *shelf_expanded().lock()
}

pub fn is_hover_preview_active() -> bool {
    HOVER_PREVIEW.load(Ordering::SeqCst)
}

pub fn is_notch_interaction_active() -> bool {
    is_shelf_expanded() || is_hover_preview_active()
}

pub fn is_notch_click_mode(app: &tauri::AppHandle) -> bool {
    use crate::commands::AppState;

    let state = app.state::<AppState>();
    state.notch_hover_enabled.load(Ordering::SeqCst)
}

fn start_expanded_leave_monitor(app: &tauri::AppHandle) {
    if LEAVE_MONITOR_RUNNING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }

    let app = app.clone();
    std::thread::spawn(move || {
        let mut outside_ticks = 0;

        loop {
            std::thread::sleep(Duration::from_millis(120));

            if !is_shelf_expanded() {
                break;
            }

            let layout = notch_layout::current_layout();
            let (width, height) = expanded_size(&layout);
            if cursor_inside_notch_rect(&layout, width, height, 10.0) {
                outside_ticks = 0;
                continue;
            }

            outside_ticks += 1;
            if outside_ticks >= 2 {
                if is_shelf_expanded() {
                    collapse_shelf(&app);
                }
                break;
            }
        }

        LEAVE_MONITOR_RUNNING.store(false, Ordering::SeqCst);
    });
}

fn apply_hover_preview(app: &tauri::AppHandle, hovered: bool) {
    if HOVER_PREVIEW.swap(hovered, Ordering::SeqCst) == hovered {
        return;
    }

    let Some(win) = app.get_webview_window("notch-shelf") else {
        return;
    };

    let layout = notch_layout::current_layout();
    apply_notch_window(&win, &layout, false, hovered);
    let _ = win.emit("notch-shelf:hover-preview", hovered);
}

fn start_collapsed_hover_monitor(app: &tauri::AppHandle) {
    if HOVER_MONITOR_RUNNING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }

    let app = app.clone();
    std::thread::spawn(move || {
        let mut enter_ticks = 0;
        let mut leave_ticks = 0;

        loop {
            std::thread::sleep(Duration::from_millis(50));

            if is_shelf_expanded() {
                enter_ticks = 0;
                leave_ticks = 0;
                continue;
            }

            let layout = notch_layout::current_layout();
            let hovered = HOVER_PREVIEW.load(Ordering::SeqCst);
            let (width, height) = if hovered {
                hover_size(&layout)
            } else {
                (layout.collapsed_width, layout.collapsed_height)
            };

            let margin = if hovered { 18.0 } else { 8.0 };
            let inside = cursor_inside_notch_rect(&layout, width, height, margin);
            if inside && !hovered {
                enter_ticks += 1;
                leave_ticks = 0;
                if enter_ticks >= 2 {
                    apply_hover_preview(&app, true);
                    enter_ticks = 0;
                }
            } else if !inside && hovered {
                leave_ticks += 1;
                enter_ticks = 0;
                if leave_ticks >= 5 {
                    apply_hover_preview(&app, false);
                    leave_ticks = 0;
                }
            } else {
                enter_ticks = 0;
                leave_ticks = 0;
            }
        }
    });
}

fn show_collapsed_on_main(app: &tauri::AppHandle) {
    let Some(win) = app.get_webview_window("notch-shelf") else {
        return;
    };

    let layout = notch_layout::current_layout();
    let hover = HOVER_PREVIEW.load(Ordering::SeqCst);
    apply_notch_window(&win, &layout, false, hover);
    let _ = win.emit("notch-shelf:expanded", false);
    set_shelf_expanded(false);
}

/// Shows a collapsed notch window that receives hover and click.
pub fn show_notch_trigger(app: &tauri::AppHandle) {
    HOVER_PREVIEW.store(false, Ordering::SeqCst);
    set_shelf_expanded(false);

    let app = app.clone();
    let monitor_app = app.clone();
    std::thread::spawn(move || {
        notch_layout::refresh_layout();
        let main_app = app.clone();
        let _ = app.run_on_main_thread(move || {
            show_collapsed_on_main(&main_app);
        });
    });
    start_collapsed_hover_monitor(&monitor_app);
}

pub fn set_notch_expanded(app: &tauri::AppHandle, expanded: bool) {
    let Some(win) = app.get_webview_window("notch-shelf") else {
        return;
    };

    if !expanded {
        collapse_shelf(app);
        return;
    }

    HOVER_PREVIEW.store(false, Ordering::SeqCst);
    set_shelf_expanded(true);
    let layout = notch_layout::current_layout();
    apply_notch_window(&win, &layout, true, false);
    let _ = win.set_focus();
    let _ = win.emit("notch-shelf:expanded", true);
    let _ = win.emit("notch-shelf:open", ());
    start_expanded_leave_monitor(app);
}

pub fn set_notch_hover_preview(app: &tauri::AppHandle, hovered: bool) {
    if !is_notch_click_mode(app) || is_shelf_expanded() {
        return;
    }

    apply_hover_preview(app, hovered);
}

pub fn apply_notch_click_setting(app: &tauri::AppHandle, enabled: bool) {
    if enabled {
        show_notch_trigger(app);
    } else {
        HOVER_PREVIEW.store(false, Ordering::SeqCst);
        set_shelf_expanded(false);
        if let Some(win) = app.get_webview_window("notch-shelf") {
            let _ = win.hide();
            let _ = win.emit("notch-shelf:expanded", false);
        }
    }
}

pub fn collapse_shelf(app: &tauri::AppHandle) {
    HOVER_PREVIEW.store(false, Ordering::SeqCst);
    set_shelf_expanded(false);

    if let Some(win) = app.get_webview_window("notch-shelf") {
        let _ = win.emit("notch-shelf:expanded", false);
        if is_notch_click_mode(app) {
            let layout = notch_layout::current_layout();
            apply_notch_window(&win, &layout, false, false);
        } else {
            let _ = win.hide();
        }
    }
}

pub fn hide_notch_shelf(app: &tauri::AppHandle) {
    HOVER_PREVIEW.store(false, Ordering::SeqCst);
    set_shelf_expanded(false);
    if let Some(win) = app.get_webview_window("notch-shelf") {
        let _ = win.hide();
    }
}

pub fn toggle_notch_shelf(app: &tauri::AppHandle) {
    if is_notch_click_mode(app) {
        if is_shelf_expanded() {
            collapse_shelf(app);
        } else {
            set_notch_expanded(app, true);
        }
        return;
    }

    let Some(win) = app.get_webview_window("notch-shelf") else {
        return;
    };

    if win.is_visible().unwrap_or(false) && is_shelf_expanded() {
        let _ = win.hide();
        set_shelf_expanded(false);
        return;
    }

    set_notch_expanded(app, true);
}

pub fn start_layout_refresh_poller(enabled: std::sync::Arc<AtomicBool>) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_secs(5));
            if enabled.load(Ordering::SeqCst) {
                notch_layout::refresh_layout();
            }
        }
    });
}

pub fn sync_hover_collapsed() {
    set_shelf_expanded(false);
}
