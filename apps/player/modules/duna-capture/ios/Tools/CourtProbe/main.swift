import AVFoundation
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers
import simd

@testable import DunaCaptureEngine

// Runs the court finder on one photo or one frame of a video and writes the
// result drawn over the picture. A clip from the Camera app carries no
// gravity reading, so the camera's tilt is searched for as well; on the
// phone the gravity sensor supplies it directly.

struct Arguments {
  var input = ""
  var output: String?
  var time = 2.0
  /// Angle of view across the longer side. About 69° for the main camera.
  var fieldOfView = 69.0
  var pitch: Double?
  var roll: Double?
  var cameraHeight: Double?
  var netHeight = 2.43
}

func parseArguments() -> Arguments? {
  var arguments = Arguments()
  var items = Array(CommandLine.arguments.dropFirst())
  while !items.isEmpty {
    let item = items.removeFirst()
    func value() -> Double? { items.isEmpty ? nil : Double(items.removeFirst()) }
    switch item {
    case "--out": arguments.output = items.isEmpty ? nil : items.removeFirst()
    case "--time": arguments.time = value() ?? arguments.time
    case "--fov": arguments.fieldOfView = value() ?? arguments.fieldOfView
    case "--pitch": arguments.pitch = value()
    case "--roll": arguments.roll = value()
    case "--height": arguments.cameraHeight = value()
    case "--net": arguments.netHeight = value() ?? arguments.netHeight
    default: arguments.input = item
    }
  }
  return arguments.input.isEmpty ? nil : arguments
}

func loadFrame(_ path: String, time: Double) async -> CGImage? {
  let url = URL(fileURLWithPath: path)
  if let source = CGImageSourceCreateWithURL(url as CFURL, nil),
    CGImageSourceGetCount(source) > 0,
    let type = CGImageSourceGetType(source),
    UTType(type as String)?.conforms(to: .image) == true
  {
    // Honour the photo's orientation tag so the picture is upright.
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: 1920,
    ]
    return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
  }
  let generator = AVAssetImageGenerator(asset: AVURLAsset(url: url))
  generator.appliesPreferredTrackTransform = true
  generator.requestedTimeToleranceBefore = .zero
  generator.requestedTimeToleranceAfter = CMTime(seconds: 0.5, preferredTimescale: 600)
  return try? await generator.image(
    at: CMTime(seconds: time, preferredTimescale: 600)
  ).image
}

/// The frame at the detector's working size, as RGBA bytes.
func rasterise(_ image: CGImage, width: Int) -> (pixels: [UInt8], width: Int, height: Int)? {
  let height = Int((Double(width) * Double(image.height) / Double(image.width)).rounded())
  var pixels = [UInt8](repeating: 0, count: width * height * 4)
  let drawn = pixels.withUnsafeMutableBytes { buffer -> Bool in
    guard
      let context = CGContext(
        data: buffer.baseAddress,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: width * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
      )
    else { return false }
    context.interpolationQuality = .high
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    return true
  }
  return drawn ? (pixels, width, height) : nil
}

func evidenceMap(_ pixels: [UInt8], width: Int, height: Int) -> EvidenceMap {
  var luma = [Float](repeating: 0, count: width * height)
  var cb = [Float](repeating: 0, count: width * height)
  var cr = [Float](repeating: 0, count: width * height)
  for index in 0..<(width * height) {
    let red = Double(pixels[index * 4])
    let green = Double(pixels[index * 4 + 1])
    let blue = Double(pixels[index * 4 + 2])
    let brightness = 0.299 * red + 0.587 * green + 0.114 * blue
    luma[index] = Float(brightness)
    cb[index] = Float(128 + (blue - brightness) * 0.564)
    cr[index] = Float(128 + (red - brightness) * 0.713)
  }
  return EvidenceMap(luma: luma, cb: cb, cr: cr, width: width, height: height)
}

func gravity(pitch: Double, roll: Double) -> SIMD3<Double> {
  let pitchRadians = pitch * .pi / 180
  let rollRadians = roll * .pi / 180
  return SIMD3(
    sin(rollRadians) * cos(pitchRadians),
    cos(rollRadians) * cos(pitchRadians),
    sin(pitchRadians)
  )
}

func writeOverlay(
  pixels: [UInt8],
  width: Int,
  height: Int,
  outline: CourtEstimate.Outline?,
  to path: String
) {
  var canvas = pixels
  canvas.withUnsafeMutableBytes { buffer in
    guard
      let context = CGContext(
        data: buffer.baseAddress,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: width * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
      ),
      let outline
    else { return }
    context.translateBy(x: 0, y: CGFloat(height))
    context.scaleBy(x: 1, y: -1)
    context.setLineWidth(2)
    func stroke(_ points: [CGPoint], closed: Bool, _ r: CGFloat, _ g: CGFloat, _ b: CGFloat) {
      guard points.count >= 2 else { return }
      context.setStrokeColor(red: r, green: g, blue: b, alpha: 1)
      context.beginPath()
      context.addLines(between: points)
      if closed { context.closePath() }
      context.strokePath()
    }
    stroke(outline.corners, closed: true, 1, 0.15, 0.6)
    stroke(outline.netBase, closed: false, 1, 0.85, 0)
    stroke(outline.netTop, closed: false, 0, 1, 0.4)
    outline.posts.forEach { stroke($0, closed: false, 0, 1, 0.4) }
  }
  guard
    let provider = CGDataProvider(data: Data(canvas) as CFData),
    let image = CGImage(
      width: width,
      height: height,
      bitsPerComponent: 8,
      bitsPerPixel: 32,
      bytesPerRow: width * 4,
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
      provider: provider,
      decode: nil,
      shouldInterpolate: false,
      intent: .defaultIntent
    ),
    let destination = CGImageDestinationCreateWithURL(
      URL(fileURLWithPath: path) as CFURL,
      UTType.png.identifier as CFString,
      1,
      nil
    )
  else { return }
  CGImageDestinationAddImage(destination, image, nil)
  CGImageDestinationFinalize(destination)
}

guard let arguments = parseArguments() else {
  print(
    "usage: duna-court-probe <photo or video> [--time s] [--fov deg] [--pitch deg] [--roll deg] [--height m] [--net m] [--out result.png]"
  )
  exit(2)
}
guard
  let frame = await loadFrame(arguments.input, time: arguments.time),
  let raster = rasterise(frame, width: 960)
else {
  print("could not read a frame from \(arguments.input)")
  exit(1)
}

let map = evidenceMap(raster.pixels, width: raster.width, height: raster.height)
let intrinsics = CameraIntrinsics.fromFieldOfView(
  degrees: arguments.fieldOfView,
  width: Double(raster.width),
  height: Double(raster.height)
)
var finder = CourtFinder()
finder.dimensions.netHeight = arguments.netHeight
finder.options.knownCameraHeight = arguments.cameraHeight

/// With the tilt unknown, several placements can score alike. Prefer the one
/// more different parts of the court agree with.
func rank(_ estimate: CourtEstimate) -> Double {
  estimate.score * (0.25 + estimate.confidence)
}

// Try each plausible tilt and keep the one the picture agrees with most.
let pitches = arguments.pitch.map { [$0] } ?? Array(stride(from: -2.0, through: 24.0, by: 2.0))
let rolls = arguments.roll.map { [$0] } ?? [-4.0, -2.0, 0.0, 2.0, 4.0]
var best: (estimate: CourtEstimate, pitch: Double, roll: Double)?
for pitch in pitches {
  for roll in rolls {
    guard
      let estimate = finder.find(
        in: map,
        intrinsics: intrinsics,
        gravity: gravity(pitch: pitch, roll: roll)
      )
    else { continue }
    if rank(estimate) > best.map({ rank($0.estimate) }) ?? -.infinity {
      best = (estimate, pitch, roll)
    }
  }
}
// Tighten the tilt around the best coarse answer.
if var current = best, arguments.pitch == nil || arguments.roll == nil {
  for step in [1.0, 0.5] {
    var improved = true
    while improved {
      improved = false
      for (deltaPitch, deltaRoll) in [(step, 0.0), (-step, 0.0), (0.0, step), (0.0, -step)] {
        if arguments.pitch != nil, deltaPitch != 0 { continue }
        if arguments.roll != nil, deltaRoll != 0 { continue }
        let pitch = current.pitch + deltaPitch
        let roll = current.roll + deltaRoll
        guard
          let estimate = finder.find(
            in: map,
            intrinsics: intrinsics,
            gravity: gravity(pitch: pitch, roll: roll)
          ),
          rank(estimate) > rank(current.estimate) + 0.002
        else { continue }
        current = (estimate, pitch, roll)
        improved = true
      }
    }
  }
  best = current
}

guard let result = best else {
  print("no court found")
  exit(0)
}
let estimate = result.estimate
let tilt = gravity(pitch: result.pitch, roll: result.roll)
print(String(format: "confidence      %.2f  (score %.2f)", estimate.confidence, estimate.score))
print(String(format: "camera tilt     %.1f° down, %.1f° roll (searched)", result.pitch, result.roll))
print(
  String(
    format: "camera height   %.2f m (%@)",
    estimate.cameraHeight,
    estimate.cameraHeightSource.rawValue
  )
)
print(
  String(
    format: "court centre    %.1f m ahead, %.1f m right, turned %.0f°",
    estimate.pose.z,
    estimate.pose.x,
    estimate.pose.yaw * 180 / .pi
  )
)
print(
  String(
    format: "net height      %.2f m (%@)",
    estimate.dimensions.netHeight,
    estimate.netHeightIdentified ? "seen" : "not sure"
  )
)
for feature in CourtFeature.allCases {
  print(
    String(
      format: "  %-10@ in frame %3.0f%%  agreement %3.0f%%  %@",
      feature.name as NSString,
      estimate.featureVisibility[feature.rawValue] * 100,
      max(0, estimate.featureEvidence[feature.rawValue]) * 100,
      estimate.isDetected(feature) ? "found" : "-"
    )
  )
}
if let output = arguments.output {
  writeOverlay(
    pixels: raster.pixels,
    width: raster.width,
    height: raster.height,
    outline: estimate.outline(intrinsics: intrinsics, gravity: tilt),
    to: output
  )
  print("wrote \(output)")
}
