use parking_lot::Mutex;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

const OWN_BUNDLE_ID: &str = "com.gustavonoll.clipflow";
const RECENT_TTL: Duration = Duration::from_secs(3);

struct RecentApps {
    entries: Mutex<VecDeque<(Instant, String)>>,
}

impl RecentApps {
    fn new() -> Self {
        Self {
            entries: Mutex::new(VecDeque::new()),
        }
    }

    fn record(&self, name: String) {
        let mut entries = self.entries.lock();
        entries.push_back((Instant::now(), name));
        while entries
            .front()
            .is_some_and(|(time, _)| time.elapsed() > RECENT_TTL)
        {
            entries.pop_front();
        }
    }

    fn most_recent(&self) -> Option<String> {
        let entries = self.entries.lock();
        entries
            .iter()
            .rev()
            .find(|(_, name)| !is_own_app_name(name))
            .map(|(_, name)| name.clone())
    }
}

pub struct SourceAppTracker {
    recent: Arc<RecentApps>,
    running: Arc<AtomicBool>,
}

impl Clone for SourceAppTracker {
    fn clone(&self) -> Self {
        Self {
            recent: Arc::clone(&self.recent),
            running: Arc::clone(&self.running),
        }
    }
}

impl SourceAppTracker {
    pub fn new() -> Self {
        Self {
            recent: Arc::new(RecentApps::new()),
            running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn start(&self) {
        if self.running.swap(true, Ordering::SeqCst) {
            return;
        }

        let recent = Arc::clone(&self.recent);
        let running = Arc::clone(&self.running);

        std::thread::spawn(move || {
            while running.load(Ordering::SeqCst) {
                if let Some((name, bundle_id)) = frontmost_app_info() {
                    if !is_own_app(&name, bundle_id.as_deref()) {
                        recent.record(name);
                    }
                }
                std::thread::sleep(Duration::from_millis(100));
            }
        });
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
    }

    pub fn source_for_capture(&self, is_image: bool) -> Option<String> {
        if let Some(name) = self.recent.most_recent() {
            return Some(name);
        }

        if is_image {
            return Some(screenshot_fallback_name());
        }

        None
    }

    /// Last external app the user interacted with — target for simulated paste.
    pub fn paste_target(&self) -> Option<String> {
        self.recent.most_recent()
    }
}

/// Brings an already-running app to the foreground.
#[cfg(target_os = "macos")]
pub fn activate_app_by_name(name: &str) -> bool {
    use objc2_app_kit::{NSApplicationActivationOptions, NSWorkspace};

    let workspace = NSWorkspace::sharedWorkspace();
    let apps = workspace.runningApplications();
    for app in apps.iter() {
        let Some(app_name) = app.localizedName() else {
            continue;
        };
        if app_name.to_string().eq_ignore_ascii_case(name) {
            return app.activateWithOptions(NSApplicationActivationOptions::empty());
        }
    }
    false
}

#[cfg(not(target_os = "macos"))]
pub fn activate_app_by_name(_name: &str) -> bool {
    false
}

pub fn is_own_app_name(name: &str) -> bool {
    name.eq_ignore_ascii_case("clipflow")
}

pub fn is_own_app(name: &str, bundle_id: Option<&str>) -> bool {
    if is_own_app_name(name) {
        return true;
    }
    bundle_id.is_some_and(|id| id == OWN_BUNDLE_ID)
}

#[cfg(target_os = "macos")]
pub fn frontmost_app_info() -> Option<(String, Option<String>)> {
    use objc2_app_kit::NSWorkspace;

    let workspace = NSWorkspace::sharedWorkspace();
    let app = workspace.frontmostApplication()?;
    let name = app.localizedName()?.to_string();
    let bundle_id = app.bundleIdentifier().map(|id| id.to_string());
    Some((name, bundle_id))
}

#[cfg(not(target_os = "macos"))]
pub fn frontmost_app_info() -> Option<(String, Option<String>)> {
    None
}

#[cfg(target_os = "macos")]
fn screenshot_fallback_name() -> String {
    if let Some((name, bundle_id)) = frontmost_app_info() {
        if is_screenshot_app(&name, bundle_id.as_deref()) {
            return name;
        }
    }
    "Screenshot".to_string()
}

#[cfg(not(target_os = "macos"))]
fn screenshot_fallback_name() -> String {
    "Screenshot".to_string()
}

fn is_screenshot_app(name: &str, bundle_id: Option<&str>) -> bool {
    let lower = name.to_lowercase();
    if lower.contains("screenshot")
        || lower.contains("cleanshot")
        || lower.contains("shottr")
        || lower.contains("snagit")
        || lower.contains("capture")
    {
        return true;
    }

    bundle_id.is_some_and(|id| {
        id.contains("screencapture")
            || id.contains("cleanshot")
            || id.contains("shottr")
            || id.contains("snagit")
    })
}
