import CoreMedia
import XCTest

@testable import DunaCaptureEngine

private final class RecordingTap: CaptureFrameTap {
  let identifier: String
  let minimumInterval: TimeInterval
  let essential: Bool
  let processed = Locked(0)
  var onProcess: (() -> Void)?
  var gate: DispatchSemaphore?

  init(identifier: String, minimumInterval: TimeInterval = 0, essential: Bool = true) {
    self.identifier = identifier
    self.minimumInterval = minimumInterval
    self.essential = essential
  }

  func process(_ sampleBuffer: CMSampleBuffer) {
    gate?.wait()
    processed.mutate { $0 += 1 }
    onProcess?()
  }
}

final class FrameTapTests: XCTestCase {
  private let frame = TestFrames.videoSample(
    TestFrames.pixelBuffer(width: 64, height: 36, luma: 120),
    seconds: 0
  )

  func testTapOnlyReceivesFramesAtItsOwnPace() {
    let hub = FrameTapHub()
    let tap = RecordingTap(identifier: "slow", minimumInterval: 1)
    hub.add(tap)

    let first = expectation(description: "first frame")
    tap.onProcess = { first.fulfill() }
    XCTAssertEqual(hub.deliver(frame, allowNonEssential: true, now: 10), 1)
    wait(for: [first], timeout: 2)

    // Too soon: the tap is idle but not yet due.
    XCTAssertEqual(hub.deliver(frame, allowNonEssential: true, now: 10.5), 0)

    let second = expectation(description: "second frame")
    tap.onProcess = { second.fulfill() }
    XCTAssertEqual(hub.deliver(frame, allowNonEssential: true, now: 11), 1)
    wait(for: [second], timeout: 2)
    XCTAssertEqual(tap.processed.get(), 2)
  }

  func testBusyTapMissesFramesInsteadOfQueueingThem() {
    let hub = FrameTapHub()
    let tap = RecordingTap(identifier: "busy")
    let gate = DispatchSemaphore(value: 0)
    tap.gate = gate
    hub.add(tap)

    XCTAssertEqual(hub.deliver(frame, allowNonEssential: true, now: 1), 1)
    // Still working on the first frame, so these are dropped, not queued.
    XCTAssertEqual(hub.deliver(frame, allowNonEssential: true, now: 2), 0)
    XCTAssertEqual(hub.deliver(frame, allowNonEssential: true, now: 3), 0)

    let done = expectation(description: "first frame finished")
    tap.onProcess = { done.fulfill() }
    gate.signal()
    wait(for: [done], timeout: 2)
    XCTAssertEqual(tap.processed.get(), 1)
  }

  func testHeatPressurePausesOnlyNonEssentialTaps() {
    let hub = FrameTapHub()
    let essential = RecordingTap(identifier: "lens", essential: true)
    let extra = RecordingTap(identifier: "watch-preview", essential: false)
    hub.add(essential)
    hub.add(extra)

    let done = expectation(description: "essential tap ran")
    essential.onProcess = { done.fulfill() }
    XCTAssertEqual(hub.deliver(frame, allowNonEssential: false, now: 1), 1)
    wait(for: [done], timeout: 2)

    XCTAssertEqual(essential.processed.get(), 1)
    XCTAssertEqual(extra.processed.get(), 0)
  }

  func testRemovedTapStopsReceivingFrames() {
    let hub = FrameTapHub()
    hub.add(RecordingTap(identifier: "gone"))
    hub.remove(identifier: "gone")

    XCTAssertTrue(hub.isEmpty)
    XCTAssertEqual(hub.deliver(frame, allowNonEssential: true, now: 1), 0)
  }

  func testCoveredLensIsReportedAfterThreeSecondsAndClears() {
    var reports: [Bool] = []
    let tap = LensObstructionTap { reports.append($0) }
    let dark = TestFrames.videoSample(
      TestFrames.pixelBuffer(width: 96, height: 54, luma: 2),
      seconds: 0
    )
    let bright = TestFrames.videoSample(
      TestFrames.pixelBuffer(width: 96, height: 54, luma: 140),
      seconds: 0
    )

    for _ in 0..<5 { tap.process(dark) }
    XCTAssertEqual(reports, [], "a brief dark moment is not a covered lens")
    tap.process(dark)
    XCTAssertEqual(reports, [true])
    tap.process(dark)
    XCTAssertEqual(reports, [true], "reported once, not on every frame")
    tap.process(bright)
    XCTAssertEqual(reports, [true, false])
  }

  func testPreviewSnapshotIsASmallJpeg() {
    var snapshot: Data?
    let tap = PreviewSnapshotTap { data, _ in snapshot = data }
    tap.process(
      TestFrames.videoSample(
        TestFrames.pixelBuffer(width: 1280, height: 720, luma: 110),
        seconds: 0
      )
    )

    let data = try? XCTUnwrap(snapshot)
    XCTAssertEqual(data?.prefix(2), Data([0xFF, 0xD8]), "JPEG start marker")
    XCTAssertLessThan(data?.count ?? .max, 220_000)
  }
}
