import AppKit
import CoreGraphics
import Foundation

struct Layout: Codable {
    let screenX: Double
    let screenY: Double
    let screenWidth: Double
    let globalMaxY: Double
    let safeAreaTop: Double
    let screenCgX: Double
    let screenCgY: Double
}

func shelfBounds(pid: Int32) -> (width: Double, height: Double)? {
    let opts = CGWindowListOption(arrayLiteral: .optionOnScreenOnly, .excludeDesktopElements)
    let info = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] ?? []
    let shelf = info.first { w in
        guard (w[kCGWindowOwnerPID as String] as? Int32) == pid else { return false }
        guard w[kCGWindowIsOnscreen as String] as? Bool == true else { return false }
        guard (w[kCGWindowName as String] as? String)?.contains("Shelf") == true else { return false }
        let bounds = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
        let width = bounds["Width"] as? Double ?? 0
        let height = bounds["Height"] as? Double ?? 0
        return width > 80 && height > 20
    }
    guard let shelf else { return nil }
    let bounds = shelf[kCGWindowBounds as String] as? [String: Any] ?? [:]
    return (
        bounds["Width"] as? Double ?? 0,
        bounds["Height"] as? Double ?? 0
    )
}

func waitForBounds(
    pid: Int32,
    timeout: TimeInterval,
    interval: TimeInterval = 0.2,
    matches: ((width: Double, height: Double)) -> Bool
) -> (width: Double, height: Double) {
    let deadline = Date().addingTimeInterval(timeout)
    var last = shelfBounds(pid: pid) ?? (0, 0)
    while Date() < deadline {
        if matches(last) {
            return last
        }
        Thread.sleep(forTimeInterval: interval)
        last = shelfBounds(pid: pid) ?? (0, 0)
    }
    return last
}

func moveCursor(to point: CGPoint) {
    CGWarpMouseCursorPosition(point)
    CGAssociateMouseAndMouseCursorPosition(boolean_t(1))
    let source = CGEventSource(stateID: .hidSystemState)
    CGEvent(
        mouseEventSource: source,
        mouseType: .mouseMoved,
        mouseCursorPosition: point,
        mouseButton: .left
    )?.post(tap: .cghidEventTap)
}

let clipflowPid = Int32(CommandLine.arguments[1]) ?? 0
guard clipflowPid > 0 else {
    fputs("usage: test-notch-hover-extended.swift <clipflow-pid>\n", stderr)
    exit(2)
}

let proc = Process()
proc.executableURL = URL(fileURLWithPath: "/Applications/ClipFlow.app/Contents/MacOS/notch-layout-helper")
let pipe = Pipe()
proc.standardOutput = pipe
try! proc.run()
proc.waitUntilExit()
let layout = try! JSONDecoder().decode(Layout.self, from: pipe.fileHandleForReading.readDataToEndOfFile())

let cx = layout.screenCgX + layout.screenWidth / 2
moveCursor(to: CGPoint(x: layout.screenCgX + 40, y: layout.screenCgY + 500))
let baseline = waitForBounds(pid: clipflowPid, timeout: 4.0) { bounds in
    bounds.width > 80 && bounds.width < 260 && bounds.height > 20 && bounds.height < 80
}
print("baseline shelf: width=\(Int(baseline.width)) height=\(Int(baseline.height))")

for y in [4.0, 8.0, 16.0, 24.0, 32.0] {
    let cgY = layout.screenCgY + y
    moveCursor(to: CGPoint(x: cx, y: cgY))
    let bounds = waitForBounds(pid: clipflowPid, timeout: 3.0) { bounds in
        bounds.width - baseline.width > 50 || bounds.height - baseline.height > 50
    }
    print(
        "y=\(y) width=\(Int(bounds.width)) height=\(Int(bounds.height)) widthDelta=\(Int(bounds.width - baseline.width)) heightDelta=\(Int(bounds.height - baseline.height))"
    )
}
