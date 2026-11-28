import XCTest

@testable import DunaCaptureEngine

final class CaptureHealthPolicyTests: XCTestCase {
  private let configuration = CaptureConfiguration()

  private func directive(_ conditions: CaptureConditions) -> CaptureDirective {
    CaptureHealthPolicy.directive(for: conditions, configuration: configuration)
  }

  func testNormalConditionsChangeNothing() {
    let result = directive(
      CaptureConditions(
        thermal: .fair,
        batteryPercent: 60,
        batteryCharging: false,
        freeBytes: 50_000_000_000
      )
    )

    XCTAssertTrue(result.nonEssentialTapsAllowed)
    XCTAssertEqual(result.framesPerSecond, 30)
    XCTAssertFalse(result.shouldFinalizeRecording)
    XCTAssertTrue(result.warnings.isEmpty)
  }

  func testHotPhoneShedsExtrasButKeepsFullFrameRate() {
    let result = directive(CaptureConditions(thermal: .serious))

    XCTAssertFalse(result.nonEssentialTapsAllowed)
    XCTAssertEqual(result.framesPerSecond, 30)
    XCTAssertFalse(result.shouldFinalizeRecording)
    XCTAssertEqual(result.warnings, [.hot])
  }

  func testVeryHotPhoneLowersFrameRateAndKeepsRecording() {
    let result = directive(CaptureConditions(thermal: .critical))

    XCTAssertFalse(result.nonEssentialTapsAllowed)
    XCTAssertEqual(result.framesPerSecond, 24)
    XCTAssertFalse(result.shouldFinalizeRecording)
    XCTAssertEqual(result.warnings, [.veryHot])
  }

  func testFrameRateIsNeverRaisedAboveTheConfiguredRate() {
    var slow = CaptureConfiguration()
    slow.framesPerSecond = 20
    let result = CaptureHealthPolicy.directive(
      for: CaptureConditions(thermal: .critical),
      configuration: slow
    )

    XCTAssertEqual(result.framesPerSecond, 20)
  }

  func testCriticalBatteryWarnsOnlyWhenUnplugged() {
    XCTAssertEqual(
      directive(CaptureConditions(batteryPercent: 3, batteryCharging: false)).warnings,
      [.batteryCritical]
    )
    XCTAssertTrue(
      directive(CaptureConditions(batteryPercent: 3, batteryCharging: true))
        .warnings.isEmpty
    )
    XCTAssertTrue(
      directive(CaptureConditions(batteryPercent: -1, batteryCharging: false))
        .warnings.isEmpty
    )
  }

  func testLowStorageWarnsThenSavesBeforeRunningOut() {
    let floor = configuration.minimumFreeBytesToContinue

    let low = directive(CaptureConditions(freeBytes: floor * 2))
    XCTAssertFalse(low.shouldFinalizeRecording)
    XCTAssertEqual(low.warnings, [.storageLow])

    let full = directive(CaptureConditions(freeBytes: floor - 1))
    XCTAssertTrue(full.shouldFinalizeRecording)
    XCTAssertEqual(full.warnings, [.storageFull])

    let unknown = directive(CaptureConditions(freeBytes: nil))
    XCTAssertFalse(unknown.shouldFinalizeRecording)
    XCTAssertTrue(unknown.warnings.isEmpty)
  }

  func testEveryWarningHasPlainLanguageCopy() {
    for warning in CaptureWarning.allCases {
      let message = CaptureHealthPolicy.message(for: warning, batteryPercent: 2)
      XCTAssertFalse(message.isEmpty)
    }
    XCTAssertTrue(
      CaptureHealthPolicy.message(for: .batteryCritical, batteryPercent: 2)
        .contains("2%")
    )
  }

  func testDefaultBitrateFollowsTheCodec() {
    var hevc = CaptureConfiguration()
    hevc.codec = .hevc
    XCTAssertEqual(CaptureConfiguration().resolvedVideoBitsPerSecond, 10_000_000)
    XCTAssertEqual(hevc.resolvedVideoBitsPerSecond, 6_000_000)
    hevc.videoBitsPerSecond = 4_000_000
    XCTAssertEqual(hevc.resolvedVideoBitsPerSecond, 4_000_000)
  }
}
