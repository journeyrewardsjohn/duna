import AVFoundation
import XCTest

@testable import DunaCaptureEngine

final class MasterWriterTests: XCTestCase {
  private var configuration: CaptureConfiguration {
    var configuration = CaptureConfiguration()
    configuration.width = 640
    configuration.height = 360
    configuration.videoBitsPerSecond = 1_000_000
    configuration.fragmentSeconds = 1
    return configuration
  }

  private func makeWriter(_ name: String) throws -> MasterWriter {
    let url = TestFrames.temporaryDirectory(name).appendingPathComponent("movie.mov")
    return try MasterWriter(
      url: url,
      videoSettings: MasterWriter.videoSettings(
        recommended: nil,
        configuration: configuration,
        codec: .h264
      ),
      audioSettings: nil,
      fragmentSeconds: configuration.fragmentSeconds
    )
  }

  /// Feeds frames the way the camera does: one at a time, in real time order.
  /// Returns how many the encoder accepted.
  @discardableResult
  private func feed(
    _ writer: MasterWriter,
    from start: Double,
    seconds: Double,
    luma: UInt8 = 120
  ) -> Int {
    let buffer = TestFrames.pixelBuffer(width: 640, height: 360, luma: luma)
    var accepted = 0
    let frames = Int(seconds * 30)
    for index in 0..<frames {
      let sample = TestFrames.videoSample(
        buffer,
        seconds: start + Double(index) / 30
      )
      // Generous wait: the encoder may be slow when the machine is busy.
      for _ in 0..<2_000 {
        let result = writer.appendVideo(sample)
        if result == .started || result == .appended {
          accepted += 1
          break
        }
        if result == .failed { return accepted }
        usleep(2_000)
      }
    }
    return accepted
  }

  private func finish(_ writer: MasterWriter) -> Result<Double, MasterWriter.Failure> {
    let done = expectation(description: "writer finished")
    var outcome: Result<Double, MasterWriter.Failure> = .failure(.noFrames)
    writer.finish { result in
      outcome = result
      done.fulfill()
    }
    wait(for: [done], timeout: 20)
    return outcome
  }

  func testFirstFrameStartsTheRecordingClock() throws {
    let writer = try makeWriter("first-frame")
    let buffer = TestFrames.pixelBuffer(width: 640, height: 360, luma: 120)

    XCTAssertNil(writer.sessionStartTime)
    XCTAssertEqual(
      writer.appendVideo(TestFrames.videoSample(buffer, seconds: 1_000)),
      .started
    )
    XCTAssertEqual(writer.sessionStartTime?.seconds ?? 0, 1_000, accuracy: 0.001)
    writer.cancel()
  }

  func testFinishedMovieIsPlayableAndReportsItsLength() async throws {
    let writer = try makeWriter("finished")
    XCTAssertEqual(feed(writer, from: 50, seconds: 3), 90)

    let duration = try finish(writer).get()
    XCTAssertEqual(duration, 3, accuracy: 0.1)

    let asset = AVURLAsset(url: writer.url)
    let playable = try await asset.load(.isPlayable)
    let assetSeconds = try await asset.load(.duration).seconds
    XCTAssertTrue(playable)
    XCTAssertEqual(assetSeconds, 3, accuracy: 0.2)
  }

  /// A phone call or a camera restart stops frames for a while. The file must
  /// keep that time, so the video stays in step with the score timeline.
  func testInterruptionGapIsKeptInTheTimeline() async throws {
    let writer = try makeWriter("gap")
    feed(writer, from: 0, seconds: 2)
    feed(writer, from: 12, seconds: 2)

    let duration = try finish(writer).get()
    XCTAssertEqual(duration, 14, accuracy: 0.1)

    let asset = AVURLAsset(url: writer.url)
    let assetSeconds = try await asset.load(.duration).seconds
    XCTAssertEqual(assetSeconds, 14, accuracy: 0.3)
  }

  /// The crash-safety promise: a copy of the file taken while recording is
  /// still in progress, exactly what a killed app leaves behind, plays back.
  /// The encoder writes fragments a moment behind the frames it is given, so
  /// the test allows it time to catch up rather than assuming it has.
  func testFileIsRecoverableWithoutEverBeingFinished() async throws {
    let writer = try makeWriter("unfinished")
    feed(writer, from: 0, seconds: 8)

    let snapshot = writer.url.deletingLastPathComponent()
      .appendingPathComponent("as-left-by-a-crash.mov")
    var playable = false
    var recoveredSeconds = 0.0
    for _ in 0..<50 {
      try? FileManager.default.removeItem(at: snapshot)
      try FileManager.default.copyItem(at: writer.url, to: snapshot)
      let asset = AVURLAsset(url: snapshot)
      playable = (try? await asset.load(.isPlayable)) ?? false
      recoveredSeconds = (try? await asset.load(.duration).seconds) ?? 0
      if playable, recoveredSeconds > 5 { break }
      try await Task.sleep(nanoseconds: 200_000_000)
    }

    XCTAssertTrue(playable, "an unfinished recording must still open")
    XCTAssertGreaterThan(
      recoveredSeconds,
      5,
      "all but the last fragment survives"
    )
    writer.cancel()
  }

  func testFinishingWithNoFramesFailsCleanly() throws {
    let writer = try makeWriter("empty")

    XCTAssertEqual(finish(writer), .failure(.noFrames))
  }

  func testSettingsCarryCodecBitrateAndKeyframeSpacing() {
    var configuration = CaptureConfiguration()
    configuration.orientation = .portrait
    configuration.codec = .hevc

    let settings = MasterWriter.videoSettings(
      recommended: nil,
      configuration: configuration,
      codec: .hevc
    )
    let compression = settings[AVVideoCompressionPropertiesKey] as? [String: Any]

    XCTAssertEqual(settings[AVVideoCodecKey] as? AVVideoCodecType, .hevc)
    XCTAssertEqual(settings[AVVideoWidthKey] as? Int, 1080)
    XCTAssertEqual(settings[AVVideoHeightKey] as? Int, 1920)
    XCTAssertEqual(compression?[AVVideoAverageBitRateKey] as? Int, 6_000_000)
    XCTAssertEqual(compression?[AVVideoMaxKeyFrameIntervalDurationKey] as? Int, 2)
  }

  func testRecommendedSettingsFromTheCameraAreKept() {
    let recommended: [String: Any] = [
      AVVideoWidthKey: 1920,
      AVVideoHeightKey: 1080,
      AVVideoCompressionPropertiesKey: ["ExistingKey": 7],
    ]

    let settings = MasterWriter.videoSettings(
      recommended: recommended,
      configuration: CaptureConfiguration(),
      codec: .h264
    )
    let compression = settings[AVVideoCompressionPropertiesKey] as? [String: Any]

    XCTAssertEqual(compression?["ExistingKey"] as? Int, 7)
    XCTAssertEqual(compression?[AVVideoAverageBitRateKey] as? Int, 10_000_000)
  }
}
