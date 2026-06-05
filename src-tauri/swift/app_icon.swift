import AppKit
import Foundation

let name = ProcessInfo.processInfo.environment["CLIPFLOW_APP_NAME"] ?? ""
guard !name.isEmpty else { exit(1) }

var path = NSWorkspace.shared.fullPath(forApplication: name) ?? ""
if path.isEmpty, let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: name) {
    path = url.path
}
guard !path.isEmpty else { exit(2) }

let icon = NSWorkspace.shared.icon(forFile: path)
let size = Int(Double(ProcessInfo.processInfo.environment["CLIPFLOW_ICON_SIZE"] ?? "32") ?? 32)

guard let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: size,
    pixelsHigh: size,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
) else {
    exit(3)
}

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
icon.draw(in: NSRect(x: 0, y: 0, width: size, height: size))
NSGraphicsContext.restoreGraphicsState()

guard let png = rep.representation(using: .png, properties: [.compressionFactor: 0.85]) else {
    exit(4)
}

FileHandle.standardOutput.write(png)
