import AVFoundation
import CoreMedia

/// Writes the clean camera original to disk.
///
/// The file is a QuickTime movie written in fragments, so everything up to
/// the last fragment stays playable if the app is killed, the battery dies or
/// iOS takes the camera away. All calls must come from one serial queue.
final class MasterWriter {
  enum Failure: Error, Equatable {
    case cannotStart(String)
    case noFrames
    case writer(String)

    var message: String {
      switch self {
      case .cannotStart(let detail): return "The recording could not start: \(detail)"
      case .noFrames: return "The camera did not deliver any video."
      case .writer(let detail): return "The recording could not be saved: \(detail)"
      }
    }
  }

  enum VideoAppendResult: Equatable {
    /// First frame in the file. Its timestamp is the recording's zero.
    case started
    case appended
    /// The encoder was not ready; the frame was left out.
    case skipped
    case failed
  }

  let url: URL
  private let writer: AVAssetWriter
  private let videoInput: AVAssetWriterInput
  private let audioInput: AVAssetWriterInput?
  private(set) var sessionStartTime: CMTime?
  private(set) var lastVideoTime: CMTime?
  private(set) var videoFramesWritten = 0
  private(set) var videoFramesSkipped = 0
  private(set) var failureDescription: String?

  init(
    url: URL,
    videoSettings: [String: Any],
    audioSettings: [String: Any]?,
    fragmentSeconds: Double
  ) throws {
    let writer: AVAssetWriter
    do {
      writer = try AVAssetWriter(outputURL: url, fileType: .mov)
    } catch {
      throw Failure.cannotStart(error.localizedDescription)
    }
    // Movie fragments are what make an unfinished file recoverable.
    writer.movieFragmentInterval = CMTime(
      seconds: max(1, fragmentSeconds),
      preferredTimescale: 600
    )
    writer.shouldOptimizeForNetworkUse = false

    guard writer.canApply(outputSettings: videoSettings, forMediaType: .video) else {
      throw Failure.cannotStart("unsupported video settings")
    }
    let videoInput = AVAssetWriterInput(
      mediaType: .video,
      outputSettings: videoSettings
    )
    videoInput.expectsMediaDataInRealTime = true
    guard writer.canAdd(videoInput) else {
      throw Failure.cannotStart("video track rejected")
    }
    writer.add(videoInput)

    var audioInput: AVAssetWriterInput?
    if let audioSettings,
      writer.canApply(outputSettings: audioSettings, forMediaType: .audio)
    {
      let input = AVAssetWriterInput(
        mediaType: .audio,
        outputSettings: audioSettings
      )
      input.expectsMediaDataInRealTime = true
      if writer.canAdd(input) {
        writer.add(input)
        audioInput = input
      }
    }

    guard writer.startWriting() else {
      throw Failure.cannotStart(
        writer.error?.localizedDescription ?? "the file could not be opened"
      )
    }

    self.url = url
    self.writer = writer
    self.videoInput = videoInput
    self.audioInput = audioInput
  }

  var hasAudioTrack: Bool { audioInput != nil }

  func appendVideo(_ sampleBuffer: CMSampleBuffer) -> VideoAppendResult {
    guard writer.status == .writing else {
      noteFailure()
      return .failed
    }
    let time = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
    guard time.isValid else { return .skipped }

    var started = false
    if sessionStartTime == nil {
      writer.startSession(atSourceTime: time)
      sessionStartTime = time
      started = true
    }
    guard videoInput.isReadyForMoreMediaData else {
      videoFramesSkipped += 1
      return started ? .started : .skipped
    }
    guard videoInput.append(sampleBuffer) else {
      noteFailure()
      return .failed
    }
    lastVideoTime = time
    videoFramesWritten += 1
    return started ? .started : .appended
  }

  func appendAudio(_ sampleBuffer: CMSampleBuffer) {
    guard
      let audioInput,
      writer.status == .writing,
      let start = sessionStartTime
    else { return }
    // Audio that predates the first video frame has nothing to sync to.
    let time = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
    guard time.isValid, time >= start, audioInput.isReadyForMoreMediaData else {
      return
    }
    if !audioInput.append(sampleBuffer) {
      noteFailure()
    }
  }

  /// Closes the file. The completion reports the length of the recording in
  /// seconds and may be called on any queue.
  func finish(completion: @escaping (Result<Double, Failure>) -> Void) {
    guard writer.status == .writing else {
      completion(.failure(.writer(failureDescription ?? describeStatus())))
      return
    }
    guard let start = sessionStartTime, let last = lastVideoTime else {
      writer.cancelWriting()
      completion(.failure(.noFrames))
      return
    }
    videoInput.markAsFinished()
    audioInput?.markAsFinished()
    let writer = self.writer
    writer.finishWriting {
      if writer.status == .completed {
        let seconds = CMTimeGetSeconds(CMTimeSubtract(last, start))
        completion(.success(seconds.isFinite ? max(0, seconds) : 0))
      } else {
        completion(
          .failure(
            .writer(writer.error?.localizedDescription ?? "unknown writer error")
          )
        )
      }
    }
  }

  func cancel() {
    if writer.status == .writing {
      writer.cancelWriting()
    }
  }

  private func noteFailure() {
    if failureDescription == nil {
      failureDescription = writer.error?.localizedDescription ?? describeStatus()
    }
  }

  private func describeStatus() -> String {
    switch writer.status {
    case .unknown: return "writer not started"
    case .writing: return "writer busy"
    case .completed: return "writer already finished"
    case .failed: return "writer failed"
    case .cancelled: return "writer cancelled"
    @unknown default: return "writer in an unknown state"
    }
  }

  /// Video settings for the file. `recommended` comes from the camera output
  /// when there is one; the fallback is used by tests and by any device that
  /// offers no recommendation.
  static func videoSettings(
    recommended: [String: Any]?,
    configuration: CaptureConfiguration,
    codec: CaptureCodec
  ) -> [String: Any] {
    let size = configuration.outputSize
    var settings: [String: Any] = recommended ?? [
      AVVideoWidthKey: size.width,
      AVVideoHeightKey: size.height,
    ]
    settings[AVVideoCodecKey] =
      codec == .hevc ? AVVideoCodecType.hevc : AVVideoCodecType.h264
    var compression =
      settings[AVVideoCompressionPropertiesKey] as? [String: Any] ?? [:]
    compression[AVVideoAverageBitRateKey] = configuration.resolvedVideoBitsPerSecond
    compression[AVVideoExpectedSourceFrameRateKey] = configuration.framesPerSecond
    // A keyframe every two seconds keeps seeking and clip cutting precise.
    compression[AVVideoMaxKeyFrameIntervalDurationKey] = 2
    settings[AVVideoCompressionPropertiesKey] = compression
    return settings
  }

  static func fallbackAudioSettings() -> [String: Any] {
    [
      AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVSampleRateKey: 48_000,
      AVNumberOfChannelsKey: 1,
      AVEncoderBitRateKey: 96_000,
    ]
  }
}
