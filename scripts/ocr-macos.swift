import Foundation
import Vision
import AppKit

guard CommandLine.arguments.count > 1 else {
    fputs("Usage: ocr-macos <image-path>\n", stderr)
    exit(1)
}

let imagePath = CommandLine.arguments[1]
guard let image = NSImage(contentsOfFile: imagePath),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fputs("Failed to load image: \(imagePath)\n", stderr)
    exit(1)
}

let imageWidth = Double(cgImage.width)
let imageHeight = Double(cgImage.height)

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = [
    "en", "zh-Hans", "zh-Hant", "ja", "ko",
    "fr", "de", "es", "pt", "it", "ru", "ar", "th", "vi"
]
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

do {
    try handler.perform([request])
} catch {
    fputs("OCR failed: \(error.localizedDescription)\n", stderr)
    exit(1)
}

guard let observations = request.results, !observations.isEmpty else {
    print("[]")
    exit(0)
}

var results: [[String: Any]] = []

for observation in observations {
    guard let candidate = observation.topCandidates(1).first else { continue }

    let box = observation.boundingBox
    // Vision: origin = bottom-left, normalized [0,1]
    // Convert to: origin = top-left, pixel coordinates
    let x = box.origin.x * imageWidth
    let y = (1.0 - box.origin.y - box.height) * imageHeight
    let w = box.width * imageWidth
    let h = box.height * imageHeight

    results.append([
        "text": candidate.string,
        "confidence": candidate.confidence,
        "x": round(x),
        "y": round(y),
        "width": round(w),
        "height": round(h)
    ])
}

let jsonData = try! JSONSerialization.data(withJSONObject: results, options: [])
print(String(data: jsonData, encoding: .utf8)!)
