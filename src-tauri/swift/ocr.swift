import AppKit
import Foundation
import Vision

let input = FileHandle.standardInput.readDataToEndOfFile()
guard !input.isEmpty else { exit(1) }

guard let image = NSImage(data: input) else { exit(2) }
var rect = NSRect(origin: .zero, size: image.size)
guard let cgImage = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
    exit(3)
}

var lines: [String] = []
let request = VNRecognizeTextRequest { request, error in
    guard error == nil else { return }
    let observations = request.results as? [VNRecognizedTextObservation] ?? []
    lines = observations.compactMap { observation in
        observation.topCandidates(1).first?.string.trimmingCharacters(in: .whitespacesAndNewlines)
    }.filter { !$0.isEmpty }
}

request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.minimumTextHeight = 0.015
if #available(macOS 13.0, *) {
    request.revision = VNRecognizeTextRequestRevision3
}

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
    try handler.perform([request])
} catch {
    exit(4)
}

let output = lines.joined(separator: "\n")
FileHandle.standardOutput.write(output.data(using: .utf8) ?? Data())
