import AppKit
import CoreGraphics
import Foundation

struct Layout: Codable {
    let screenX: Double
    let screenY: Double
    let screenWidth: Double
    let globalMaxY: Double
}

let proc = Process()
proc.executableURL = URL(fileURLWithPath: "/Applications/ClipFlow.app/Contents/MacOS/notch-layout-helper")
let pipe = Pipe()
proc.standardOutput = pipe
try! proc.run()
proc.waitUntilExit()
let data = pipe.fileHandleForReading.readDataToEndOfFile()
let layout = try! JSONDecoder().decode(Layout.self, from: data)

let cx = layout.screenX + layout.screenWidth / 2
let topY = layout.screenY + 8
let cgY = layout.globalMaxY - topY

CGWarpMouseCursorPosition(CGPoint(x: cx, y: cgY))
Thread.sleep(forTimeInterval: 1.5)

let check = Process()
check.executableURL = URL(fileURLWithPath: "/usr/bin/pgrep")
check.arguments = ["-x", "clipflow"]
let out = Pipe()
check.standardOutput = out
try! check.run()
check.waitUntilExit()
let running = !out.fileHandleForReading.readDataToEndOfFile().isEmpty
print(running ? "HOVER_OK" : "CRASHED")
