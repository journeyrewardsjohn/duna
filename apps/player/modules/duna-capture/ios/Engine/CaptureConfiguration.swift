import Foundation

enum CaptureCodec: String, Codable {
  case h264
  case hevc
}

enum CaptureOrientation: String, Codable {
  case landscape
  case portrait
}

/// Everything the engine needs to know before it opens the camera. The
/// recording is always the clean camera original: nothing in here can draw
/// onto it.
struct CaptureConfiguration: Codable, Equatable {
  var audioEnabled = true
  var orientation: CaptureOrientation = .landscape
  /// H.264 plays everywhere today, including straight from storage in a
  /// browser. HEVC roughly halves the upload and can become the default once
  /// every recording gets an adaptive playback copy.
  var codec: CaptureCodec = .h264
  /// Sensor dimensions, always landscape. Portrait swaps them at write time.
  var width = 1920
  var height = 1080
  var framesPerSecond = 30
  /// Nil picks a bitrate suited to the codec.
  var videoBitsPerSecond: Int?
  /// How often the movie file is made self-contained on disk. A crash or a
  /// dead battery loses at most this much video.
  var fragmentSeconds = 4.0
  var minimumFreeBytesToStart: Int64 = 2 * 1024 * 1024 * 1024
  var minimumFreeBytesToContinue: Int64 = 400 * 1024 * 1024

  var resolvedVideoBitsPerSecond: Int {
    if let videoBitsPerSecond, videoBitsPerSecond > 0 { return videoBitsPerSecond }
    return codec == .hevc ? 6_000_000 : 10_000_000
  }

  /// Dimensions of the frames that reach the file.
  var outputSize: (width: Int, height: Int) {
    orientation == .portrait ? (height, width) : (width, height)
  }
}
