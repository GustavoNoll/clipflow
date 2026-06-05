import AppKit
import Foundation

let pid = Int32(CommandLine.arguments[1]) ?? 0
let opts = CGWindowListOption(arrayLiteral: .optionAll)
let info = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] ?? []
let matches = info.filter { ($0[kCGWindowOwnerPID as String] as? Int32) == pid }
print("pid \(pid) windows \(matches.count)")
for w in matches {
    let name = w[kCGWindowName as String] as? String ?? "(none)"
    let onscreen = w[kCGWindowIsOnscreen as String] as? Bool ?? false
    let bounds = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
    print("  \(name) onscreen=\(onscreen) bounds=\(bounds)")
}
