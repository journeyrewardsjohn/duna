import AVFoundation
import ExpoModulesCore
import UIKit

/// The one camera engine for the app, and the bridge from it to JavaScript
/// and to the Watch. Lives for the life of the process so a recording never
/// depends on a screen or a native view staying mounted.
final class DunaCaptureHost: CaptureEngineDelegate {
  static let shared = DunaCaptureHost()

  /// Created the first time something actually needs the camera. Until a
  /// screen uses this module it costs the app nothing at launch: no camera
  /// objects, no folders, no sensors.
  private(set) lazy var engine: CaptureEngine? = {
    guard
      let root = try? RecordingJournal.defaultRoot(),
      let journal = try? RecordingJournal(root: root)
    else { return nil }
    let engine = CaptureEngine(journal: journal)
    engine.delegate = self
    return engine
  }()
  weak var module: DunaCaptureModule?

  private let views = NSHashTable<DunaCaptureView>.weakObjects()
  private var originalBrightness: CGFloat?
  private let timestamps: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()

  private init() {}

  // MARK: - Views (main thread)

  func register(_ view: DunaCaptureView) {
    views.add(view)
    if let engine {
      view.attach(session: engine.session)
    }
  }

  func setPreviewDimmed(_ dimmed: Bool) {
    // Dims the screen the preview is on during a long recording, to save
    // battery and heat. The camera is unaffected.
    guard let screen = views.allObjects.compactMap(\.hostScreen).first else {
      return
    }
    if dimmed {
      if originalBrightness == nil {
        originalBrightness = screen.brightness
      }
      screen.brightness = min(screen.brightness, 0.05)
    } else if let originalBrightness {
      screen.brightness = originalBrightness
      self.originalBrightness = nil
    }
  }

  // MARK: - Payloads

  func payload(for status: CaptureStatus) -> [String: Any] {
    var payload: [String: Any] = [
      "phase": status.phase.rawValue,
      "healthState": Self.healthState(for: status),
      "cameraActive": status.cameraActive,
      "lensObscured": status.lensObscured,
      "thermal": status.thermal.label,
      "batteryPercent": status.batteryPercent,
      "batteryCharging": status.batteryCharging,
      "framesPerSecond": status.framesPerSecond,
      "droppedFrames": status.droppedFrames,
      "deviceOrientation": status.deviceOrientation,
      "orientationMatches": status.orientationMatches,
      "warnings": status.warnings.map(\.rawValue),
    ]
    if let recordingId = status.recordingId { payload["recordingId"] = recordingId }
    if let startedAt = status.startedAt {
      payload["startedAt"] = timestamps.string(from: startedAt)
    }
    if let message = status.message { payload["message"] = message }
    return payload
  }

  func payload(for recording: FinalizedRecording) -> [String: Any] {
    let manifest = recording.manifest
    let seconds = manifest.durationSeconds ?? 0
    var payload: [String: Any] = [
      "recordingId": manifest.id,
      "state": manifest.state.rawValue,
      "fileUri": recording.fileURL.absoluteString,
      "fileName": manifest.fileName,
      "mimeType": "video/quicktime",
      "bytes": Double(manifest.bytes ?? 0),
      "durationSeconds": max(1, Int(seconds.rounded())),
      "exactDurationSeconds": seconds,
      "hasAudio": manifest.hasAudio,
      "codec": manifest.codec.rawValue,
      "orientation": manifest.orientation.rawValue,
      "width": manifest.width,
      "height": manifest.height,
      "framesPerSecond": manifest.framesPerSecond,
      "droppedFrames": manifest.droppedFrames,
      "healthLogUri": recording.healthLogURL.absoluteString,
      "interruptions": manifest.interruptions.map { interruption -> [String: Any] in
        var entry: [String: Any] = [
          "reason": interruption.reason,
          "beganAt": timestamps.string(from: interruption.beganAt),
        ]
        if let endedAt = interruption.endedAt {
          entry["endedAt"] = timestamps.string(from: endedAt)
        }
        return entry
      },
    ]
    if let startedAt = manifest.startedAt {
      payload["startedAt"] = timestamps.string(from: startedAt)
    }
    if let endedAt = manifest.endedAt {
      payload["endedAt"] = timestamps.string(from: endedAt)
    }
    if let endReason = manifest.endReason {
      payload["endReason"] = endReason.rawValue
    }
    if let court = manifest.court, let encoded = self.payload(for: court) {
      payload["court"] = encoded
    }
    return payload
  }

  func payload(for court: CourtObservation) -> [String: Any]? {
    guard
      let data = try? JSONEncoder().encode(court),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return nil }
    return object
  }

  /// The state names the Watch app and the existing capture screens already
  /// understand.
  private static func healthState(for status: CaptureStatus) -> String {
    switch status.phase {
    case .idle, .finishing: return "stopped"
    case .preview: return "preview"
    case .starting: return "preparing"
    case .recording: return status.lensObscured ? "obscured" : "active"
    case .interrupted: return "interrupted"
    case .recovering: return "recovering"
    case .failed: return "failed"
    }
  }

  // MARK: - CaptureEngineDelegate (main thread)

  func captureEngine(_ engine: CaptureEngine, didUpdate status: CaptureStatus) {
    let payload = payload(for: status)
    module?.sendEvent("onStatus", payload)
    var watch: [String: Any] = [
      "state": payload["healthState"] ?? "stopped",
      "cameraActive": status.cameraActive,
      "batteryPercent": status.batteryPercent,
      "batteryCharging": status.batteryCharging,
    ]
    if let message = status.message { watch["message"] = message }
    NotificationCenter.default.post(
      name: Notification.Name("co.duna.watch.capture-status"),
      object: nil,
      userInfo: watch
    )
  }

  func captureEngine(
    _ engine: CaptureEngine,
    didFinalize recording: FinalizedRecording
  ) {
    module?.sendEvent("onRecordingFinalized", payload(for: recording))
  }

  func captureEngine(
    _ engine: CaptureEngine,
    didProducePreview jpeg: Data,
    at date: Date
  ) {
    let capturedAt = timestamps.string(from: date)
    module?.sendEvent(
      "onPreview",
      ["jpegBase64": jpeg.base64EncodedString(), "capturedAt": capturedAt]
    )
    NotificationCenter.default.post(
      name: Notification.Name("co.duna.watch.camera-preview"),
      object: nil,
      userInfo: ["jpeg": jpeg, "capturedAt": capturedAt]
    )
  }

  func captureEngine(_ engine: CaptureEngine, didChangeRotation angle: CGFloat) {
    views.allObjects.forEach { $0.updatePreviewRotation() }
  }

  func captureEngine(
    _ engine: CaptureEngine,
    didUpdateCourt court: CourtObservation?
  ) {
    var event: [String: Any] = ["found": court != nil]
    if let court, let encoded = payload(for: court) {
      event["court"] = encoded
    }
    module?.sendEvent("onCourt", event)
  }
}
