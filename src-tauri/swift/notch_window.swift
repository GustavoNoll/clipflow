import AppKit
import Foundation
import ObjectiveC
import QuartzCore

/// Allows positioning flush with the top edge (inside the physical notch).
@objc(ClipFlowNotchWindow)
final class ClipFlowNotchWindow: NSWindow {
    override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect {
        frameRect
    }
}

@_cdecl("clipflow_place_notch_window")
public func clipflow_place_notch_window(
    _ windowPtr: UnsafeMutableRawPointer,
    _ x: Double,
    _ y: Double,
    _ width: Double,
    _ height: Double
) {
    let window: NSWindow = Unmanaged<NSWindow>.fromOpaque(windowPtr).takeUnretainedValue()

    if object_getClass(window) !== object_getClass(ClipFlowNotchWindow.self) {
        object_setClass(window, ClipFlowNotchWindow.self)
    }

    window.level = .screenSaver
    window.styleMask = [.borderless]
    window.hasShadow = false
    window.isOpaque = false
    window.backgroundColor = .clear
    window.acceptsMouseMovedEvents = true
    window.ignoresMouseEvents = false
    window.collectionBehavior = [
        .canJoinAllSpaces,
        .stationary,
        .ignoresCycle,
        .fullScreenAuxiliary,
    ]

    let frame = NSRect(x: x, y: y, width: width, height: height)
    let shouldAnimate =
        window.isVisible
        && !window.frame.isEmpty
        && abs(window.frame.width - frame.width) + abs(window.frame.height - frame.height) > 1

    if shouldAnimate {
        let isShrinking = frame.width < window.frame.width || frame.height < window.frame.height
        NSAnimationContext.runAnimationGroup { context in
            context.duration = isShrinking ? 0.26 : 0.34
            context.allowsImplicitAnimation = true
            context.timingFunction = CAMediaTimingFunction(
                controlPoints: isShrinking ? 0.25 : 0.22,
                isShrinking ? 0.1 : 1.0,
                isShrinking ? 0.25 : 0.36,
                isShrinking ? 1.0 : 1.0
            )
            window.animator().setFrame(frame, display: true)
        } completionHandler: {
            window.setFrame(frame, display: true)
        }
    } else {
        window.setFrame(frame, display: true)
    }

    window.orderFrontRegardless()
}

@_cdecl("clipflow_cursor_inside_notch_window")
public func clipflow_cursor_inside_notch_window(
    _ windowPtr: UnsafeMutableRawPointer,
    _ margin: Double
) -> Bool {
    let window: NSWindow = Unmanaged<NSWindow>.fromOpaque(windowPtr).takeUnretainedValue()
    let frame = window.frame.insetBy(dx: -margin, dy: -margin)
    return frame.contains(NSEvent.mouseLocation)
}

@_cdecl("clipflow_cursor_inside_rect")
public func clipflow_cursor_inside_rect(
    _ x: Double,
    _ y: Double,
    _ width: Double,
    _ height: Double,
    _ margin: Double
) -> Bool {
    let frame = NSRect(x: x, y: y, width: width, height: height)
        .insetBy(dx: -margin, dy: -margin)
    return frame.contains(NSEvent.mouseLocation)
}

@_cdecl("clipflow_place_quick_paste_near_cursor")
public func clipflow_place_quick_paste_near_cursor(
    _ windowPtr: UnsafeMutableRawPointer,
    _ width: Double,
    _ height: Double
) {
    let window: NSWindow = Unmanaged<NSWindow>.fromOpaque(windowPtr).takeUnretainedValue()
    let cursor = NSEvent.mouseLocation
    let screens = NSScreen.screens
    let screen =
        screens.first(where: { $0.frame.contains(cursor) })
        ?? NSScreen.main
        ?? screens.first

    let visibleFrame = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: width, height: height)
    let margin = 18.0
    let cursorGap = 14.0

    var x = cursor.x - width * 0.42
    var y = cursor.y - height - cursorGap

    if y < visibleFrame.minY + margin {
        y = cursor.y + cursorGap
    }

    x = min(max(x, visibleFrame.minX + margin), visibleFrame.maxX - width - margin)
    y = min(max(y, visibleFrame.minY + margin), visibleFrame.maxY - height - margin)

    window.level = .floating
    window.styleMask = [.borderless]
    window.hasShadow = true
    window.isOpaque = false
    window.backgroundColor = .clear
    window.collectionBehavior = [
        .canJoinAllSpaces,
        .stationary,
        .ignoresCycle,
        .fullScreenAuxiliary,
    ]
    window.setFrame(NSRect(x: x, y: y, width: width, height: height), display: true)
    window.orderFrontRegardless()
}
