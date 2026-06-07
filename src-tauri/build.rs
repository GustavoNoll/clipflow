fn main() {
    #[cfg(target_os = "macos")]
    {
        build_swift_helper("app-icon-helper", "swift/app_icon.swift", "APP_ICON_HELPER");
        build_swift_helper(
            "notch-layout-helper",
            "swift/notch_layout.swift",
            "NOTCH_LAYOUT_HELPER",
        );
        build_swift_helper("ocr-helper", "swift/ocr.swift", "OCR_HELPER");
        build_swift_helper("auth-helper", "swift/auth.swift", "AUTH_HELPER");
        build_notch_window_lib();
    }

    tauri_build::build();
}

#[cfg(target_os = "macos")]
fn build_swift_helper(name: &str, source: &str, env_key: &str) {
    use std::path::PathBuf;
    use std::process::Command;

    let target = std::env::var("TARGET").expect("TARGET not set");
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR not set");
    let dest = PathBuf::from(&manifest_dir).join(format!("bin/{name}-{target}"));

    if let Some(parent) = dest.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    println!("cargo:rerun-if-changed={source}");

    let status = Command::new("swiftc")
        .args(["-O", "-o"])
        .arg(&dest)
        .arg(source)
        .status()
        .expect("failed to run swiftc");

    assert!(status.success(), "swiftc failed to build {name}");

    let abs = dest.canonicalize().unwrap_or(dest);
    println!("cargo:rustc-env={env_key}={}", abs.display());
}

#[cfg(target_os = "macos")]
fn build_notch_window_lib() {
    use std::path::PathBuf;
    use std::process::Command;

    let out_dir = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR not set"));
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR not set");
    let source = PathBuf::from(&manifest_dir).join("swift/notch_window.swift");
    let object = out_dir.join("notch_window.o");
    let archive = out_dir.join("libnotch_window.a");

    println!("cargo:rerun-if-changed=swift/notch_window.swift");

    let swift_status = Command::new("swiftc")
        .args(["-emit-object", "-O", "-o"])
        .arg(&object)
        .arg(&source)
        .status()
        .expect("failed to run swiftc for notch_window");

    assert!(
        swift_status.success(),
        "swiftc failed to build notch_window"
    );

    let ar_status = Command::new("ar")
        .args(["rcs", archive.to_str().unwrap(), object.to_str().unwrap()])
        .status()
        .expect("failed to run ar for notch_window");

    assert!(ar_status.success(), "ar failed to archive notch_window");

    println!("cargo:rustc-link-search=native={}", out_dir.display());
    println!("cargo:rustc-link-lib=static=notch_window");
    println!("cargo:rustc-link-lib=framework=AppKit");
    println!("cargo:rustc-link-lib=framework=Foundation");
}
