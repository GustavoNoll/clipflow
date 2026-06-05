import AppKit
import Foundation

struct NotchLayoutPayload: Codable {
    let screenX: Double
    let screenY: Double
    let screenWidth: Double
    let screenHeight: Double
    let safeAreaTop: Double
    let hasNotch: Bool
    let collapsedWidth: Double
    let collapsedHeight: Double
    let globalMaxY: Double
    /// NSScreen.frame in AppKit coordinates (origin bottom-left).
    let screenFrameMaxY: Double
    let screenFrameOriginX: Double
}

let screens = NSScreen.screens
let notchScreen =
    screens.first(where: { $0.safeAreaInsets.top > 0 }) ?? NSScreen.main ?? screens[0]

let frame = notchScreen.frame
let safeTop = notchScreen.safeAreaInsets.top
let menuBar = NSStatusBar.system.thickness
let effectiveTop = safeTop > 0 ? safeTop : menuBar

// Global top-left coordinates (same space as CGEvent / Tauri positioning).
let globalMaxY = screens.map { $0.frame.maxY }.max() ?? frame.maxY
let topLeftY = globalMaxY - frame.maxY
let collapsedWidth =
    safeTop > 0
    ? max(156.0, min(200.0, frame.width * 0.11))
    : max(180.0, min(260.0, frame.width * 0.14))

let payload = NotchLayoutPayload(
    screenX: Double(frame.origin.x),
    screenY: Double(topLeftY),
    screenWidth: Double(frame.width),
    screenHeight: Double(frame.height),
    safeAreaTop: Double(effectiveTop),
    hasNotch: safeTop > 0,
    collapsedWidth: collapsedWidth,
    collapsedHeight: Double(effectiveTop),
    globalMaxY: Double(globalMaxY),
    screenFrameMaxY: Double(frame.maxY),
    screenFrameOriginX: Double(frame.origin.x)
)

let data = try! JSONEncoder().encode(payload)
FileHandle.standardOutput.write(data)
