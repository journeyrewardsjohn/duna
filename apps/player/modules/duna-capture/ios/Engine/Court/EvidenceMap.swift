import CoreVideo
import Foundation

/// "How much does this pixel look like part of something thin?" for every
/// pixel of a frame: boundary ribbons, the net tape, a post.
///
/// A thin thing differs from the average of its surroundings in brightness
/// or colour, whichever way it runs, so the map needs no idea of direction.
/// Three versions are kept, from sharp to very blurred. The blurred ones let
/// a rough guess at the court still score well, so the search can start
/// coarse and tighten.
struct EvidenceMap {
  enum Level {
    case fine
    case medium
    case coarse
  }

  let width: Int
  let height: Int
  private let fine: [Float]
  private let medium: [Float]
  private let coarse: [Float]

  /// Planes are brightness and the two colour-difference channels, all the
  /// same size, any consistent scale (0...255 or 0...1).
  init(luma: [Float], cb: [Float], cr: [Float], width: Int, height: Int) {
    precondition(luma.count == width * height)
    precondition(cb.count == width * height && cr.count == width * height)
    self.width = width
    self.height = height

    func detail(_ plane: [Float]) -> [Float] {
      let surround = Self.boxBlur(
        Self.boxBlur(plane, width: width, height: height, radius: 4),
        width: width,
        height: height,
        radius: 4
      )
      var out = [Float](repeating: 0, count: plane.count)
      for index in 0..<plane.count {
        out[index] = abs(plane[index] - surround[index])
      }
      return out
    }

    let lumaDetail = detail(luma)
    let cbDetail = detail(cb)
    let crDetail = detail(cr)
    var evidence = [Float](repeating: 0, count: width * height)
    var total: Double = 0
    for index in 0..<evidence.count {
      // Ribbons are chosen to stand out from sand by colour, so colour
      // difference counts for more than brightness.
      let value = lumaDetail[index] + 2 * (cbDetail[index] + crDetail[index])
      evidence[index] = value
      total += Double(value)
    }
    // Scale so an average pixel scores 1. Scores then mean the same thing in
    // harsh noon light and at dusk.
    let mean = Float(total / Double(max(1, evidence.count)))
    let scale = mean > 1e-6 ? 1 / mean : 0
    for index in 0..<evidence.count {
      evidence[index] *= scale
    }
    fine = evidence
    medium = Self.boxBlur(
      Self.boxBlur(evidence, width: width, height: height, radius: 4),
      width: width,
      height: height,
      radius: 4
    )
    coarse = Self.boxBlur(
      Self.boxBlur(evidence, width: width, height: height, radius: 14),
      width: width,
      height: height,
      radius: 14
    )
  }

  /// From a camera frame in the iPhone's native bi-planar YUV format. Works
  /// at half the frame's size, which is the colour planes' own resolution.
  init?(pixelBuffer: CVPixelBuffer) {
    let format = CVPixelBufferGetPixelFormatType(pixelBuffer)
    guard
      format == kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
        || format == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
    else { return nil }
    CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }
    guard
      let lumaBase = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0),
      let chromaBase = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 1)
    else { return nil }
    let width = CVPixelBufferGetWidthOfPlane(pixelBuffer, 1)
    let height = CVPixelBufferGetHeightOfPlane(pixelBuffer, 1)
    guard width >= 64, height >= 64 else { return nil }
    let lumaStride = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0)
    let chromaStride = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 1)
    let lumaBytes = lumaBase.assumingMemoryBound(to: UInt8.self)
    let chromaBytes = chromaBase.assumingMemoryBound(to: UInt8.self)

    var luma = [Float](repeating: 0, count: width * height)
    var cb = [Float](repeating: 0, count: width * height)
    var cr = [Float](repeating: 0, count: width * height)
    for row in 0..<height {
      let top = lumaBytes + (row * 2) * lumaStride
      let bottom = lumaBytes + (row * 2 + 1) * lumaStride
      let chroma = chromaBytes + row * chromaStride
      for column in 0..<width {
        let x = column * 2
        let sum = Int(top[x]) + Int(top[x + 1]) + Int(bottom[x]) + Int(bottom[x + 1])
        let index = row * width + column
        luma[index] = Float(sum) * 0.25
        cb[index] = Float(chroma[x])
        cr[index] = Float(chroma[x + 1])
      }
    }
    self.init(luma: luma, cb: cb, cr: cr, width: width, height: height)
  }

  /// Evidence at a pixel position; 1 (an average pixel) outside the frame.
  @inline(__always)
  func value(_ level: Level, x: Double, y: Double) -> Float {
    guard x >= 0, y >= 0, x < Double(width - 1), y < Double(height - 1) else {
      return 1
    }
    switch level {
    case .coarse:
      return coarse[Int(y + 0.5) * width + Int(x + 0.5)]
    case .medium:
      return Self.bilinear(medium, width: width, x: x, y: y)
    case .fine:
      return Self.bilinear(fine, width: width, x: x, y: y)
    }
  }

  @inline(__always)
  func contains(x: Double, y: Double) -> Bool {
    x >= 0 && y >= 0 && x < Double(width - 1) && y < Double(height - 1)
  }

  @inline(__always)
  private static func bilinear(
    _ plane: [Float],
    width: Int,
    x: Double,
    y: Double
  ) -> Float {
    let column = Int(x)
    let row = Int(y)
    let fx = Float(x - Double(column))
    let fy = Float(y - Double(row))
    let index = row * width + column
    return plane.withUnsafeBufferPointer { buffer -> Float in
      let top = buffer[index] * (1 - fx) + buffer[index + 1] * fx
      let bottom = buffer[index + width] * (1 - fx) + buffer[index + width + 1] * fx
      return top * (1 - fy) + bottom * fy
    }
  }

  /// Mean over a (2·radius+1) square, edges clamped. Two passes of running
  /// sums, so the cost does not grow with the radius.
  static func boxBlur(
    _ source: [Float],
    width: Int,
    height: Int,
    radius: Int
  ) -> [Float] {
    guard radius > 0 else { return source }
    let window = Float(2 * radius + 1)
    var horizontal = [Float](repeating: 0, count: source.count)
    source.withUnsafeBufferPointer { input in
      horizontal.withUnsafeMutableBufferPointer { output in
        for row in 0..<height {
          let base = row * width
          var sum: Float = 0
          for offset in -radius...radius {
            sum += input[base + min(width - 1, max(0, offset))]
          }
          for column in 0..<width {
            output[base + column] = sum / window
            let leaving = base + max(0, column - radius)
            let entering = base + min(width - 1, column + radius + 1)
            sum += input[entering] - input[leaving]
          }
        }
      }
    }
    var result = [Float](repeating: 0, count: source.count)
    horizontal.withUnsafeBufferPointer { input in
      result.withUnsafeMutableBufferPointer { output in
        for column in 0..<width {
          var sum: Float = 0
          for offset in -radius...radius {
            sum += input[min(height - 1, max(0, offset)) * width + column]
          }
          for row in 0..<height {
            output[row * width + column] = sum / window
            let leaving = max(0, row - radius) * width + column
            let entering = min(height - 1, row + radius + 1) * width + column
            sum += input[entering] - input[leaving]
          }
        }
      }
    }
    return result
  }
}
