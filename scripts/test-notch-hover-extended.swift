import AppKit
import CoreGraphics
import Foundation

struct Layout: Codable {
    let screenX: Double
    let screenY: Double
    let screenWidth: Double
    let globalMaxY: Double
    let safeAreaTop: Double
}

func visibleWindows(pid: Int32) -> Int {
    let opts = CGWindowListOption(arrayLiteral: .optionOnScreenOnly, .excludeDesktopElements)
    let info = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] ?? []
    return info.filter { w in
        guard (w[kCGWindowOwnerPID as String] as? Int32) == pid else { return false }
        guard w[kCGWindowIsOnscreen as String] as? Bool == true else { return false }
        let bounds = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
        let width = bounds["Width"] as? Double ?? 0
        let height = bounds["Height"] as? Double ?? 0
        return width > 80 && height > 20
    }.count
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

let cx = layout.screenX + layout.screenWidth / 2
let baseline = visibleWindows(pid: clipflowPid)
print("baseline windows: \(baseline)")

for y in [4.0, 8.0, 16.0, 24.0, 32.0] {
    let cgY = layout.globalMaxY - (layout.screenY + y)
    CGWarpMouseCursorPosition(CGPoint(x: cx, y: cgY))
    Thread.sleep(forTimeInterval: 1.0)
    let count = visibleWindows(pid: clipflowPid)
    print("y=\(y) windows=\(count) delta=\(count - baseline)")
}
