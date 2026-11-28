import Foundation

enum ThermalLevel: Int, Codable, Comparable {
  case nominal = 0
  case fair = 1
  case serious = 2
  case critical = 3

  static func < (left: ThermalLevel, right: ThermalLevel) -> Bool {
    left.rawValue < right.rawValue
  }

  var label: String {
    switch self {
    case .nominal: return "nominal"
    case .fair: return "fair"
    case .serious: return "serious"
    case .critical: return "critical"
    }
  }
}

enum CaptureWarning: String, Codable, CaseIterable {
  case hot
  case veryHot = "very-hot"
  case batteryCritical = "battery-critical"
  case storageLow = "storage-low"
  case storageFull = "storage-full"
}

struct CaptureConditions: Equatable {
  var thermal: ThermalLevel = .nominal
  /// -1 until iOS reports a level.
  var batteryPercent = -1
  var batteryCharging = false
  /// Nil when the volume will not report free space.
  var freeBytes: Int64?
}

/// What the engine should do about the current conditions. The recording is
/// the last thing to give anything up: extras go first, then frame rate.
struct CaptureDirective: Equatable {
  /// Optional frame consumers (Watch preview, a live broadcast's extras).
  var nonEssentialTapsAllowed: Bool
  var framesPerSecond: Int
  /// Stop and save now, while there is still room to close the file.
  var shouldFinalizeRecording: Bool
  var warnings: [CaptureWarning]
}

enum CaptureHealthPolicy {
  /// Frame rate used when the phone is at its thermal limit. Lower sensor
  /// rate is the largest single heat saving available without stopping.
  static let reducedFramesPerSecond = 24

  static func directive(
    for conditions: CaptureConditions,
    configuration: CaptureConfiguration
  ) -> CaptureDirective {
    var warnings: [CaptureWarning] = []
    var tapsAllowed = true
    var framesPerSecond = configuration.framesPerSecond
    var finalize = false

    switch conditions.thermal {
    case .nominal, .fair:
      break
    case .serious:
      tapsAllowed = false
      warnings.append(.hot)
    case .critical:
      tapsAllowed = false
      framesPerSecond = min(framesPerSecond, reducedFramesPerSecond)
      warnings.append(.veryHot)
    }

    if conditions.batteryPercent >= 0,
      conditions.batteryPercent <= 3,
      !conditions.batteryCharging
    {
      warnings.append(.batteryCritical)
    }

    if let free = conditions.freeBytes {
      if free < configuration.minimumFreeBytesToContinue {
        finalize = true
        warnings.append(.storageFull)
      } else if free < configuration.minimumFreeBytesToContinue * 3 {
        warnings.append(.storageLow)
      }
    }

    return CaptureDirective(
      nonEssentialTapsAllowed: tapsAllowed,
      framesPerSecond: framesPerSecond,
      shouldFinalizeRecording: finalize,
      warnings: warnings
    )
  }

  static func message(for warning: CaptureWarning, batteryPercent: Int) -> String {
    switch warning {
    case .hot:
      return "The iPhone is getting hot. Duna paused extras to protect the recording. Shade the phone if you can."
    case .veryHot:
      return "The iPhone is very hot. Duna lowered the frame rate to keep recording. Move it into shade."
    case .batteryCritical:
      return "iPhone battery is at \(batteryPercent)%. Connect power now to protect this video."
    case .storageLow:
      return "iPhone storage is running low. Duna will save the recording before it runs out."
    case .storageFull:
      return "iPhone storage is almost full, so Duna saved the recording."
    }
  }
}
