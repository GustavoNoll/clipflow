import Foundation
import LocalAuthentication

let reason =
    ProcessInfo.processInfo.environment["CLIPFLOW_AUTH_REASON"]
    ?? "Reveal sensitive clipboard previews in ClipFlow."

let context = LAContext()
var error: NSError?

guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
    exit(2)
}

let semaphore = DispatchSemaphore(value: 0)
var success = false

context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { ok, _ in
    success = ok
    semaphore.signal()
}

_ = semaphore.wait(timeout: .now() + 30)
exit(success ? 0 : 1)
