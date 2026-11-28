import XCTest

@testable import DunaCaptureEngine

final class RecordingJournalTests: XCTestCase {
  private func makeJournal() throws -> RecordingJournal {
    try RecordingJournal(root: TestFrames.temporaryDirectory("journal"))
  }

  func testNewRecordingIsDiscoverableBeforeAnyFrameIsWritten() throws {
    let journal = try makeJournal()
    let manifest = try journal.create(
      configuration: CaptureConfiguration(),
      hasAudio: true,
      codec: .h264
    )

    XCTAssertEqual(journal.unfinished().map(\.id), [manifest.id])
    XCTAssertEqual(journal.read(id: manifest.id), manifest)
    XCTAssertEqual(manifest.fileName, "duna-\(manifest.id).mov")
    XCTAssertEqual(manifest.width, 1920)
    XCTAssertEqual(manifest.height, 1080)
  }

  func testPortraitRecordingSwapsDimensions() throws {
    let journal = try makeJournal()
    var configuration = CaptureConfiguration()
    configuration.orientation = .portrait
    let manifest = try journal.create(
      configuration: configuration,
      hasAudio: false,
      codec: .hevc
    )

    XCTAssertEqual(manifest.width, 1080)
    XCTAssertEqual(manifest.height, 1920)
    XCTAssertEqual(manifest.codec, .hevc)
  }

  func testFinalizedRecordingIsNoLongerUnfinished() throws {
    let journal = try makeJournal()
    var manifest = try journal.create(
      configuration: CaptureConfiguration(),
      hasAudio: true,
      codec: .h264
    )
    manifest.state = .finalized
    manifest.endReason = .userStopped
    manifest.durationSeconds = 12.5
    manifest.interruptions = [
      RecordingInterruption(
        reason: "audio-in-use",
        beganAt: Date(timeIntervalSince1970: 100),
        endedAt: Date(timeIntervalSince1970: 120)
      )
    ]
    try journal.write(manifest)

    XCTAssertTrue(journal.unfinished().isEmpty)
    XCTAssertEqual(journal.read(id: manifest.id), manifest)
  }

  func testRecordingInProgressIsNotOfferedForRecovery() throws {
    let journal = try makeJournal()
    let crashed = try journal.create(
      configuration: CaptureConfiguration(),
      hasAudio: true,
      codec: .h264,
      now: Date(timeIntervalSince1970: 10)
    )
    let active = try journal.create(
      configuration: CaptureConfiguration(),
      hasAudio: true,
      codec: .h264,
      now: Date(timeIntervalSince1970: 20)
    )

    XCTAssertEqual(journal.unfinished(excluding: active.id).map(\.id), [crashed.id])
  }

  func testRemoveDeletesTheWholeRecordingFolder() throws {
    let journal = try makeJournal()
    let manifest = try journal.create(
      configuration: CaptureConfiguration(),
      hasAudio: true,
      codec: .h264
    )
    try Data([1, 2, 3]).write(to: journal.movieURL(for: manifest))
    XCTAssertEqual(journal.fileSize(of: manifest), 3)

    try journal.remove(id: manifest.id)

    XCTAssertNil(journal.read(id: manifest.id))
    XCTAssertFalse(
      FileManager.default.fileExists(atPath: journal.directory(for: manifest.id).path)
    )
    // Removing twice is not an error.
    XCTAssertNoThrow(try journal.remove(id: manifest.id))
  }

  func testHealthLogKeepsEntriesInOrder() throws {
    let journal = try makeJournal()
    let manifest = try journal.create(
      configuration: CaptureConfiguration(),
      hasAudio: true,
      codec: .h264
    )
    journal.appendHealth(
      id: manifest.id,
      kind: "thermal",
      detail: ["level": "serious"],
      at: Date(timeIntervalSince1970: 1)
    )
    journal.appendHealth(
      id: manifest.id,
      kind: "interruption-began",
      detail: ["reason": "audio-in-use"],
      at: Date(timeIntervalSince1970: 2)
    )

    let log = journal.healthLog(id: manifest.id)

    XCTAssertEqual(log.map(\.kind), ["thermal", "interruption-began"])
    XCTAssertEqual(log.first?.detail["level"], "serious")
  }

  func testFreeSpaceIsReported() throws {
    let journal = try makeJournal()
    XCTAssertGreaterThan(journal.freeBytes() ?? 0, 0)
  }
}
