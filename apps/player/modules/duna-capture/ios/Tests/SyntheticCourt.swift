import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers
import simd

@testable import DunaCaptureEngine

/// Small deterministic random source so every test run sees the same scene.
struct SeededRandom {
  private var state: UInt64

  init(seed: UInt64) {
    state = seed &* 0x9E37_79B9_7F4A_7C15 | 1
  }

  mutating func next() -> Double {
    state ^= state << 13
    state ^= state >> 7
    state ^= state << 17
    return Double(state % 1_000_000) / 1_000_000
  }

  mutating func range(_ low: Double, _ high: Double) -> Double {
    low + (high - low) * next()
  }
}

/// Draws a beach court the way a phone on a tripod would see it: sand with
/// texture, sky, a far tree line, boundary ribbons, net with tape and posts,
/// players standing in the way, and sensor noise. The true camera and court
/// position are known, so a detector's answer can be checked exactly.
struct SyntheticScene {
  var width = 960
  var height = 540
  /// iPhone main camera, roughly.
  var fieldOfView = 69.0
  var cameraHeight = 1.6
  /// Degrees the lens looks down.
  var pitch = 8.0
  var roll = 0.0
  var pose = CourtPose(yaw: 0, x: 0, z: 13)
  var dimensions = CourtDimensions.beach
  var drawCourt = true
  /// Features left out, as if buried in sand or taken down.
  var missing: Set<CourtFeature> = []
  var players = 4
  var seed: UInt64 = 7
  var noise = 5.0
  var ribbonWidth = 0.06

  var intrinsics: CameraIntrinsics {
    .fromFieldOfView(
      degrees: fieldOfView,
      width: Double(width),
      height: Double(height)
    )
  }

  /// Gravity as the camera sees it for this tilt.
  var gravity: SIMD3<Double> {
    let pitchRadians = pitch * .pi / 180
    let rollRadians = roll * .pi / 180
    return SIMD3(
      sin(rollRadians) * cos(pitchRadians),
      cos(rollRadians) * cos(pitchRadians),
      sin(pitchRadians)
    )
  }

  var camera: GroundCamera {
    GroundCamera(intrinsics: intrinsics, gravity: gravity, height: cameraHeight)!
  }

  /// True pixel positions of the four corners (nil for any behind the lens).
  var trueCorners: [CGPoint?] {
    dimensions.corners.map { camera.project(pose.ground($0)) }
  }

  func evidenceMap(dumpTo url: URL? = nil) -> EvidenceMap {
    var pixels = renderRGBA()
    var random = SeededRandom(seed: seed &+ 99)
    var luma = [Float](repeating: 0, count: width * height)
    var cb = [Float](repeating: 0, count: width * height)
    var cr = [Float](repeating: 0, count: width * height)
    for index in 0..<(width * height) {
      let grain = (random.next() + random.next() + random.next() - 1.5) * noise * 2
      let red = Double(pixels[index * 4]) + grain
      let green = Double(pixels[index * 4 + 1]) + grain
      let blue = Double(pixels[index * 4 + 2]) + grain
      // The saved picture carries the same sensor grain the detector sees.
      pixels[index * 4] = UInt8(max(0, min(255, red.rounded())))
      pixels[index * 4 + 1] = UInt8(max(0, min(255, green.rounded())))
      pixels[index * 4 + 2] = UInt8(max(0, min(255, blue.rounded())))
      let brightness = 0.299 * red + 0.587 * green + 0.114 * blue
      luma[index] = Float(brightness)
      cb[index] = Float(128 + (blue - brightness) * 0.564)
      cr[index] = Float(128 + (red - brightness) * 0.713)
    }
    if let url { Self.writePNG(pixels, width: width, height: height, to: url) }
    return EvidenceMap(luma: luma, cb: cb, cr: cr, width: width, height: height)
  }

  // MARK: - Drawing

  private func renderRGBA() -> [UInt8] {
    var pixels = [UInt8](repeating: 0, count: width * height * 4)
    let camera = self.camera
    var random = SeededRandom(seed: seed)
    pixels.withUnsafeMutableBytes { buffer in
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
      else { return }
      // Pixel coordinates with y down, like a camera frame.
      context.translateBy(x: 0, y: CGFloat(height))
      context.scaleBy(x: 1, y: -1)
      context.setShouldAntialias(true)

      func fill(_ points: [CGPoint?], _ r: Double, _ g: Double, _ b: Double, _ a: Double = 1) {
        let visible = points.compactMap { $0 }
        guard visible.count == points.count, visible.count >= 3 else { return }
        context.setFillColor(red: r, green: g, blue: b, alpha: a)
        context.beginPath()
        context.addLines(between: visible)
        context.closePath()
        context.fillPath()
      }
      func ground(_ x: Double, _ y: Double, _ z: Double) -> CGPoint? {
        camera.project(SIMD3(x, y, z))
      }
      func court(_ x: Double, _ y: Double, _ z: Double) -> CGPoint? {
        camera.project(pose.ground(SIMD3(x, y, z)))
      }

      // Sand everywhere, then sky above the horizon.
      context.setFillColor(red: 0.84, green: 0.76, blue: 0.60, alpha: 1)
      context.fill(CGRect(x: 0, y: 0, width: width, height: height))
      if let left = ground(-200_000, 0, 200_000),
        let right = ground(200_000, 0, 200_000)
      {
        let slope = (right.y - left.y) / (right.x - left.x)
        let atLeft = left.y + slope * (0 - left.x)
        let atRight = left.y + slope * (CGFloat(width) - left.x)
        fill(
          [
            CGPoint(x: 0, y: -10), CGPoint(x: CGFloat(width), y: -10),
            CGPoint(x: CGFloat(width), y: atRight), CGPoint(x: 0, y: atLeft),
          ],
          0.55, 0.74, 0.92
        )
        // A far tree line and buildings sitting on the horizon.
        fill(
          [
            CGPoint(x: 0, y: atLeft - 14), CGPoint(x: CGFloat(width), y: atRight - 14),
            CGPoint(x: CGFloat(width), y: atRight), CGPoint(x: 0, y: atLeft),
          ],
          0.22, 0.36, 0.24
        )
        for _ in 0..<6 {
          let x = random.range(0, Double(width))
          let w = random.range(20, 70)
          let h = random.range(10, 34)
          let base = Double(atLeft) + Double(slope) * x
          fill(
            [
              CGPoint(x: x, y: base - h), CGPoint(x: x + w, y: base - h),
              CGPoint(x: x + w, y: base), CGPoint(x: x, y: base),
            ],
            random.range(0.5, 0.9), random.range(0.5, 0.9), random.range(0.5, 0.9)
          )
        }
      }

      // Footprints and raked patches: sand is never one flat colour.
      for _ in 0..<420 {
        let x = random.range(-18, 18)
        let z = random.range(1.5, 40)
        let size = random.range(0.15, 0.7)
        let shade = random.range(-0.07, 0.05)
        // Rounded and randomly turned: sand has no straight edges.
        let turn = random.range(0, .pi)
        let stretch = random.range(0.4, 1)
        var outline: [CGPoint?] = []
        for step in 0..<10 {
          let angle = Double(step) / 10 * 2 * .pi
          let along = cos(angle) * size
          let across = sin(angle) * size * stretch
          outline.append(
            ground(
              x + along * cos(turn) - across * sin(turn),
              0,
              z + along * sin(turn) + across * cos(turn)
            )
          )
        }
        fill(outline, 0.84 + shade, 0.76 + shade, 0.60 + shade)
      }

      if drawCourt {
        let halfWidth = dimensions.width / 2
        let halfLength = dimensions.length / 2
        let half = ribbonWidth / 2
        func ribbonAlongX(_ z: Double) {
          var x = -halfWidth
          while x < halfWidth {
            let end = min(halfWidth, x + 0.5)
            fill(
              [
                court(x, 0, z - half), court(end, 0, z - half),
                court(end, 0, z + half), court(x, 0, z + half),
              ],
              0.10, 0.24, 0.78
            )
            x = end
          }
        }
        func ribbonAlongZ(_ x: Double) {
          var z = -halfLength
          while z < halfLength {
            let end = min(halfLength, z + 0.5)
            fill(
              [
                court(x - half, 0, z), court(x + half, 0, z),
                court(x + half, 0, end), court(x - half, 0, end),
              ],
              0.10, 0.24, 0.78
            )
            z = end
          }
        }
        if !missing.contains(.endLineA) { ribbonAlongX(-halfLength) }
        if !missing.contains(.endLineB) { ribbonAlongX(halfLength) }
        if !missing.contains(.sidelineA) { ribbonAlongZ(-halfWidth) }
        if !missing.contains(.sidelineB) { ribbonAlongZ(halfWidth) }

        let top = dimensions.netHeight
        let netHalf = halfWidth + dimensions.netOverhang
        let postX = halfWidth + dimensions.postOffset
        if !missing.contains(.netTape) {
          // Mesh, then the white bands along the top and bottom.
          fill(
            [
              court(-netHalf, top - 1, 0), court(netHalf, top - 1, 0),
              court(netHalf, top, 0), court(-netHalf, top, 0),
            ],
            0.08, 0.08, 0.10, 0.30
          )
          fill(
            [
              court(-netHalf, top - 0.08, 0), court(netHalf, top - 0.08, 0),
              court(netHalf, top, 0), court(-netHalf, top, 0),
            ],
            0.97, 0.97, 0.95
          )
          fill(
            [
              court(-netHalf, top - 1, 0), court(netHalf, top - 1, 0),
              court(netHalf, top - 0.95, 0), court(-netHalf, top - 0.95, 0),
            ],
            0.97, 0.97, 0.95
          )
        }
        for (feature, x) in [(CourtFeature.postA, -postX), (CourtFeature.postB, postX)]
        where !missing.contains(feature) {
          fill(
            [
              court(x - 0.06, 0, 0), court(x + 0.06, 0, 0),
              court(x + 0.06, top + 0.05, 0), court(x - 0.06, top + 0.05, 0),
            ],
            0.12, 0.14, 0.42
          )
        }
      }

      // Players: upright shapes standing on the sand, some in front of lines.
      for _ in 0..<players {
        let x = random.range(-4.5, 4.5)
        let z = random.range(-7.5, 7.5)
        let tall = random.range(1.65, 1.95)
        guard
          let feet = court(x, 0, z),
          let head = court(x, tall, z),
          let side = court(x + 0.28, tall / 2, z)
        else { continue }
        let halfWide = max(1.5, abs(side.x - (feet.x + head.x) / 2))
        context.setFillColor(
          red: random.range(0.15, 0.9),
          green: random.range(0.15, 0.6),
          blue: random.range(0.15, 0.6),
          alpha: 1
        )
        context.fillEllipse(
          in: CGRect(
            x: min(feet.x, head.x) - halfWide,
            y: min(feet.y, head.y),
            width: halfWide * 2 + abs(feet.x - head.x),
            height: abs(feet.y - head.y)
          )
        )
      }
    }
    return pixels
  }

  private static func writePNG(_ pixels: [UInt8], width: Int, height: Int, to url: URL) {
    guard
      let provider = CGDataProvider(data: Data(pixels) as CFData),
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
        url as CFURL,
        UTType.png.identifier as CFString,
        1,
        nil
      )
    else { return }
    CGImageDestinationAddImage(destination, image, nil)
    CGImageDestinationFinalize(destination)
  }
}
