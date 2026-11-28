import AVFoundation
import ExpoModulesCore

struct DunaCourtOptions: Record {
  @Field var courtLengthMeters: Double = 16
  @Field var courtWidthMeters: Double = 8
  @Field var netHeightMeters: Double = 2.43

  var dimensions: CourtDimensions {
    var dimensions = CourtDimensions.beach
    dimensions.length = courtLengthMeters
    dimensions.width = courtWidthMeters
    dimensions.netHeight = netHeightMeters
    return dimensions
  }
}

struct DunaCourtPoint: Record {
  @Field var x: Double = 0
  @Field var y: Double = 0
}

struct DunaCaptureOptions: Record {
  @Field var audioEnabled: Bool = true
  @Field var orientation: String = "landscape"
  @Field var codec: String = "h264"
  @Field var videoBitsPerSecond: Int?

  var configuration: CaptureConfiguration {
    var configuration = CaptureConfiguration()
    configuration.audioEnabled = audioEnabled
    configuration.orientation = orientation == "portrait" ? .portrait : .landscape
    configuration.codec = codec == "hevc" ? .hevc : .h264
    configuration.videoBitsPerSecond = videoBitsPerSecond
    return configuration
  }
}

/// JavaScript surface of the capture engine. Deliberately thin: every rule
/// about the camera and the file lives in Engine/, which has no Expo imports.
public final class DunaCaptureModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DunaCapture")

    Events("onStatus", "onRecordingFinalized", "onPreview", "onCourt")

    OnCreate {
      DunaCaptureHost.shared.module = self
    }

    // Answers without creating the engine, so a feature check at launch
    // stays free.
    Function("isAvailable") {
      true
    }

    AsyncFunction("requestPermissions") {
      (audioEnabled: Bool) async -> [String: Bool] in
      let camera = await AVCaptureDevice.requestAccess(for: .video)
      let audio = audioEnabled
        ? await AVCaptureDevice.requestAccess(for: .audio)
        : true
      return ["camera": camera, "audio": audio]
    }

    AsyncFunction("prepare") { (options: DunaCaptureOptions, promise: Promise) in
      guard let engine = DunaCaptureHost.shared.engine else {
        promise.reject("ERR_DUNA_CAMERA_UNAVAILABLE", "Recording is unavailable on this device.")
        return
      }
      engine.prepare(options.configuration) { result in
        switch result {
        case .success:
          promise.resolve(nil)
        case .failure(let error):
          promise.reject(error.code, error.message)
        }
      }
    }

    AsyncFunction("startRecording") { (promise: Promise) in
      guard let engine = DunaCaptureHost.shared.engine else {
        promise.reject("ERR_DUNA_CAMERA_UNAVAILABLE", "Recording is unavailable on this device.")
        return
      }
      engine.startRecording { result in
        switch result {
        case .success(let manifest):
          var payload: [String: Any] = ["recordingId": manifest.id]
          if let startedAt = manifest.startedAt {
            payload["startedAt"] = ISO8601DateFormatter.dunaCapture.string(
              from: startedAt
            )
          }
          promise.resolve(payload)
        case .failure(let error):
          promise.reject(error.code, error.message)
        }
      }
    }

    AsyncFunction("stopRecording") { (promise: Promise) in
      guard let engine = DunaCaptureHost.shared.engine else {
        promise.reject("ERR_DUNA_NOT_RECORDING", "No Duna recording is active.")
        return
      }
      engine.stopRecording { result in
        switch result {
        case .success(let recording):
          promise.resolve(DunaCaptureHost.shared.payload(for: recording))
        case .failure(let error):
          promise.reject(error.code, error.message)
        }
      }
    }

    AsyncFunction("recoverRecordings") { (promise: Promise) in
      guard let engine = DunaCaptureHost.shared.engine else {
        promise.resolve([[String: Any]]())
        return
      }
      engine.recoverUnfinishedRecordings { recordings in
        promise.resolve(recordings.map { DunaCaptureHost.shared.payload(for: $0) })
      }
    }

    AsyncFunction("savedRecordings") { () -> [[String: Any]] in
      guard let engine = DunaCaptureHost.shared.engine else { return [] }
      return engine.savedRecordings().map {
        DunaCaptureHost.shared.payload(for: $0)
      }
    }

    AsyncFunction("discardRecording") { (recordingId: String, promise: Promise) in
      guard let engine = DunaCaptureHost.shared.engine else {
        promise.resolve(false)
        return
      }
      engine.discardRecording(id: recordingId) { removed in
        promise.resolve(removed)
      }
    }

    Function("setCourtDetection") { (enabled: Bool, options: DunaCourtOptions?) in
      DunaCaptureHost.shared.engine?.setCourtDetection(
        enabled: enabled,
        dimensions: options?.dimensions
      )
    }

    AsyncFunction("setCourtCorners") { (corners: [DunaCourtPoint], promise: Promise) in
      guard let engine = DunaCaptureHost.shared.engine else {
        promise.resolve(nil)
        return
      }
      engine.setManualCourt(
        corners: corners.map { CGPoint(x: $0.x, y: $0.y) }
      ) { observation in
        promise.resolve(observation.flatMap { DunaCaptureHost.shared.payload(for: $0) })
      }
    }

    AsyncFunction("measureCameraHeight") { (promise: Promise) in
      guard let engine = DunaCaptureHost.shared.engine else {
        promise.resolve(nil)
        return
      }
      engine.measureCameraHeight { height in
        promise.resolve(height)
      }
    }

    Function("release") {
      DunaCaptureHost.shared.engine?.release()
    }

    AsyncFunction("setPreviewDimmed") { (dimmed: Bool) in
      DunaCaptureHost.shared.setPreviewDimmed(dimmed)
    }.runOnQueue(.main)

    View(DunaCaptureView.self) {
      Prop("fill") { (view: DunaCaptureView, fill: Bool) in
        view.setFill(fill)
      }
    }
  }
}

extension ISO8601DateFormatter {
  static let dunaCapture: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()
}
