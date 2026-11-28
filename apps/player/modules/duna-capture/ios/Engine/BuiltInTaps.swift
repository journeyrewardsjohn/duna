import CoreImage
import CoreMedia
import CoreVideo
import Foundation

/// A small JPEG of what the camera sees, every couple of seconds. This is the
/// alignment check shown on the Watch and the second screen; it is not a
/// second video stream.
final class PreviewSnapshotTap: CaptureFrameTap {
  let identifier = "preview-snapshot"
  let minimumInterval: TimeInterval
  let essential = false

  private let maximumWidth: CGFloat
  private let quality: CGFloat
  private let context = CIContext(options: [.useSoftwareRenderer: false])
  private let handler: (Data, Date) -> Void

  init(
    interval: TimeInterval = 2,
    maximumWidth: CGFloat = 320,
    quality: CGFloat = 0.3,
    handler: @escaping (Data, Date) -> Void
  ) {
    minimumInterval = interval
    self.maximumWidth = maximumWidth
    self.quality = quality
    self.handler = handler
  }

  func process(_ sampleBuffer: CMSampleBuffer) {
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
      return
    }
    var image = CIImage(cvPixelBuffer: pixelBuffer)
    let scale = min(1, maximumWidth / max(image.extent.width, 1))
    image = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    guard
      let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
      let jpeg = context.jpegRepresentation(
        of: image,
        colorSpace: colorSpace,
        options: [
          CIImageRepresentationOption(
            rawValue: kCGImageDestinationLossyCompressionQuality as String
          ): quality
        ]
      ),
      jpeg.count <= 220_000
    else { return }
    handler(jpeg, Date())
  }
}

/// Notices a lens that is covered or pointed at nothing, so the player is
/// told during the match instead of finding a black video afterwards.
final class LensObstructionTap: CaptureFrameTap {
  let identifier = "lens-obstruction"
  let minimumInterval: TimeInterval = 0.5
  let essential = true

  /// Consecutive dark samples before the lens counts as covered (3 seconds).
  private let threshold = 6
  private var darkSamples = 0
  private var reportedObscured = false
  private let handler: (Bool) -> Void

  init(handler: @escaping (Bool) -> Void) {
    self.handler = handler
  }

  func process(_ sampleBuffer: CMSampleBuffer) {
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
      return
    }
    if Self.isEffectivelyBlack(pixelBuffer) {
      darkSamples += 1
    } else {
      darkSamples = 0
    }
    let obscured = darkSamples >= threshold
    if obscured != reportedObscured {
      reportedObscured = obscured
      handler(obscured)
    }
  }

  /// Samples a coarse grid of brightness values. Camera frames are bi-planar
  /// YUV, so plane 0 is brightness; BGRA is handled for completeness.
  static func isEffectivelyBlack(_ pixelBuffer: CVPixelBuffer) -> Bool {
    CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }
    let planar = CVPixelBufferIsPlanar(pixelBuffer)
    guard
      let base = planar
        ? CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0)
        : CVPixelBufferGetBaseAddress(pixelBuffer)
    else { return false }
    let width = planar
      ? CVPixelBufferGetWidthOfPlane(pixelBuffer, 0)
      : CVPixelBufferGetWidth(pixelBuffer)
    let height = planar
      ? CVPixelBufferGetHeightOfPlane(pixelBuffer, 0)
      : CVPixelBufferGetHeight(pixelBuffer)
    let bytesPerRow = planar
      ? CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0)
      : CVPixelBufferGetBytesPerRow(pixelBuffer)
    guard width > 0, height > 0 else { return false }
    let bytes = base.assumingMemoryBound(to: UInt8.self)
    let pixelStride = planar ? 1 : 4
    var sum = 0
    var maximum = 0
    var samples = 0
    for y in stride(from: 0, to: height, by: max(1, height / 24)) {
      for x in stride(from: 0, to: width, by: max(1, width / 24)) {
        let offset = y * bytesPerRow + x * pixelStride
        let value: Int
        if planar {
          value = Int(bytes[offset])
        } else {
          value =
            (Int(bytes[offset]) + Int(bytes[offset + 1]) + Int(bytes[offset + 2])) / 3
        }
        sum += value
        maximum = max(maximum, value)
        samples += 1
      }
    }
    guard samples > 0 else { return false }
    return sum / samples < 12 && maximum < 28
  }
}
