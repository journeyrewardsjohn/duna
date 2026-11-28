import AVFoundation
import CoreMedia
import CoreVideo
import XCTest

/// Synthetic camera frames, in the same pixel format the iPhone camera uses.
enum TestFrames {
  static func pixelBuffer(width: Int, height: Int, luma: UInt8) -> CVPixelBuffer {
    var buffer: CVPixelBuffer?
    let attributes: [CFString: Any] = [
      kCVPixelBufferIOSurfacePropertiesKey: [:] as [String: Any]
    ]
    let status = CVPixelBufferCreate(
      kCFAllocatorDefault,
      width,
      height,
      kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
      attributes as CFDictionary,
      &buffer
    )
    precondition(status == kCVReturnSuccess, "could not create a pixel buffer")
    let pixelBuffer = buffer!
    CVPixelBufferLockBaseAddress(pixelBuffer, [])
    defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, []) }
    for plane in 0..<2 {
      let base = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, plane)!
      let rows = CVPixelBufferGetHeightOfPlane(pixelBuffer, plane)
      let bytesPerRow = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, plane)
      memset(base, plane == 0 ? Int32(luma) : 128, rows * bytesPerRow)
    }
    return pixelBuffer
  }

  static func videoSample(
    _ pixelBuffer: CVPixelBuffer,
    seconds: Double,
    framesPerSecond: Int32 = 30
  ) -> CMSampleBuffer {
    var format: CMVideoFormatDescription?
    CMVideoFormatDescriptionCreateForImageBuffer(
      allocator: kCFAllocatorDefault,
      imageBuffer: pixelBuffer,
      formatDescriptionOut: &format
    )
    var timing = CMSampleTimingInfo(
      duration: CMTime(value: 1, timescale: framesPerSecond),
      presentationTimeStamp: CMTime(seconds: seconds, preferredTimescale: 600),
      decodeTimeStamp: .invalid
    )
    var sample: CMSampleBuffer?
    CMSampleBufferCreateReadyWithImageBuffer(
      allocator: kCFAllocatorDefault,
      imageBuffer: pixelBuffer,
      formatDescription: format!,
      sampleTiming: &timing,
      sampleBufferOut: &sample
    )
    return sample!
  }

  static func temporaryDirectory(_ name: String) -> URL {
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("duna-capture-tests", isDirectory: true)
      .appendingPathComponent("\(name)-\(UUID().uuidString)", isDirectory: true)
    try? FileManager.default.createDirectory(
      at: url,
      withIntermediateDirectories: true
    )
    return url
  }
}
