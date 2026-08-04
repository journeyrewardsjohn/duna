import AVFoundation
import CoreMotion
import ExpoModulesCore
import HaishinKit
import PhotosUI
import UIKit
import UniformTypeIdentifiers
import Vision

private final class DunaVideoCaptureController: NSObject {
  static let shared = DunaVideoCaptureController()

  private let connection = RTMPConnection()
  let stream: RTMPStream
  private let motionManager = CMMotionManager()
  private let visionQueue = DispatchQueue(
    label: "co.duna.video.vision",
    qos: .userInitiated
  )

  weak var activeView: DunaVideoCaptureView?
  private var camera: AVCaptureDevice?
  private var prepared = false
  var audioEnabled = true
  private var pendingStreamKey: String?
  private var lastVisionAt = CFAbsoluteTimeGetCurrent()
  private var recorder: IOStreamRecorder?
  private var recordingPromise: Promise?
  private var latestGuidance: [String: Any]?

  var courtWidthMeters = 8.0
  var courtLengthMeters = 16.0
  var netHeightMeters = 2.43

  private override init() {
    stream = RTMPStream(connection: connection)
    super.init()
    stream.delegate = self
    stream.frameRate = 30
    stream.videoSettings.bitRate = 5_000_000
    stream.audioSettings.bitRate = 128_000
    stream.bitrateStrategy = IOStreamVideoAdaptiveBitRateStrategy(
      mamimumVideoBitrate: 5_000_000
    )
    connection.addEventListener(
      .rtmpStatus,
      selector: #selector(handleRTMPStatus(_:)),
      observer: self
    )
    connection.addEventListener(
      .ioError,
      selector: #selector(handleRTMPError(_:)),
      observer: self
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleOrientationChange),
      name: UIDevice.orientationDidChangeNotification,
      object: nil
    )
    UIDevice.current.beginGeneratingDeviceOrientationNotifications()
  }

  deinit {
    connection.removeEventListener(
      .rtmpStatus,
      selector: #selector(handleRTMPStatus(_:)),
      observer: self
    )
    connection.removeEventListener(
      .ioError,
      selector: #selector(handleRTMPError(_:)),
      observer: self
    )
    NotificationCenter.default.removeObserver(self)
    UIDevice.current.endGeneratingDeviceOrientationNotifications()
  }

  func attach(view: DunaVideoCaptureView) {
    activeView = view
    view.preview.attachStream(stream)
    handleOrientationChange()
  }

  func detach(view: DunaVideoCaptureView) {
    if activeView === view {
      activeView = nil
    }
  }

  func prepare(audioEnabled: Bool) throws {
    self.audioEnabled = audioEnabled
    try configureAudioSession(audioEnabled: audioEnabled)
    if !prepared {
      guard
        let captureDevice = AVCaptureDevice.default(
          .builtInWideAngleCamera,
          for: .video,
          position: .back
        )
      else {
        throw NSError(
          domain: "DunaVideoCapture",
          code: 1,
          userInfo: [NSLocalizedDescriptionKey: "A rear camera is unavailable."]
        )
      }
      camera = captureDevice
      stream.attachCamera(captureDevice) { [weak self] unit, error in
        unit?.isVideoMirrored = false
        if let error {
          self?.emitError("Camera setup failed: \(error.localizedDescription)")
        }
      }
      prepared = true
      startMotion()
    }
    if audioEnabled {
      stream.attachAudio(AVCaptureDevice.default(for: .audio)) {
        [weak self] _,
        error in
        if let error {
          self?.emitError(
            "Microphone setup failed: \(error.localizedDescription)"
          )
        }
      }
    } else {
      stream.attachAudio(nil)
    }
    emitState("preview")
  }

  func releasePreview() {
    guard pendingStreamKey == nil, recorder == nil else { return }
    stream.attachCamera(nil)
    stream.attachAudio(nil)
    motionManager.stopDeviceMotionUpdates()
    prepared = false
    camera = nil
  }

  func startStream(url: String, key: String, audioEnabled: Bool) throws {
    try prepare(audioEnabled: audioEnabled)
    pendingStreamKey = key
    UIApplication.shared.isIdleTimerDisabled = true
    emitState("connecting")
    connection.connect(url)
  }

  func stopStream() {
    pendingStreamKey = nil
    stream.close()
    connection.close()
    UIApplication.shared.isIdleTimerDisabled = recorder != nil
    emitState("stopped")
  }

  func startRecording(audioEnabled: Bool) throws {
    try prepare(audioEnabled: audioEnabled)
    guard recorder == nil else {
      throw NSError(
        domain: "DunaVideoCapture",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "A recording is already running."]
      )
    }
    let nextRecorder = IOStreamRecorder()
    nextRecorder.delegate = self
    nextRecorder.fileName = "duna-\(UUID().uuidString)"
    nextRecorder.movieFragmentInterval = 10
    if !audioEnabled {
      nextRecorder.settings = [
        .video: [
          AVVideoCodecKey: AVVideoCodecType.h264,
          AVVideoHeightKey: 0,
          AVVideoWidthKey: 0
        ]
      ]
    }
    stream.addObserver(nextRecorder)
    recorder = nextRecorder
    UIApplication.shared.isIdleTimerDisabled = true
    nextRecorder.startRunning()
  }

  func stopRecording(promise: Promise) {
    guard let recorder else {
      promise.reject(
        "ERR_DUNA_RECORDING",
        "No Duna recording is active."
      )
      return
    }
    recordingPromise = promise
    recorder.stopRunning()
  }

  func lockCalibration() -> [String: Any]? {
    if let camera {
      do {
        try camera.lockForConfiguration()
        if camera.isFocusModeSupported(.locked) {
          camera.focusMode = .locked
        }
        if camera.isExposureModeSupported(.locked) {
          camera.exposureMode = .locked
        }
        if camera.isWhiteBalanceModeSupported(.locked) {
          camera.whiteBalanceMode = .locked
        }
        camera.unlockForConfiguration()
      } catch {
        emitError("Focus and exposure could not be locked.")
      }
    }
    guard var calibration = latestGuidance else { return nil }
    calibration["courtWidthMeters"] = courtWidthMeters
    calibration["courtLengthMeters"] = courtLengthMeters
    calibration["netHeightMeters"] = netHeightMeters
    return calibration
  }

  private func configureAudioSession(audioEnabled: Bool) throws {
    let session = AVAudioSession.sharedInstance()
    if audioEnabled {
      try session.setCategory(
        .playAndRecord,
        mode: .videoRecording,
        options: [.defaultToSpeaker, .allowBluetoothHFP]
      )
    } else {
      try session.setCategory(.record, mode: .videoRecording)
    }
    try session.setActive(true)
  }

  private func startMotion() {
    guard motionManager.isDeviceMotionAvailable else { return }
    motionManager.deviceMotionUpdateInterval = 0.1
    motionManager.startDeviceMotionUpdates(
      using: .xArbitraryCorrectedZVertical
    )
  }

  @objc
  private func handleOrientationChange() {
    let orientation: AVCaptureVideoOrientation
    switch UIDevice.current.orientation {
    case .landscapeLeft:
      orientation = .landscapeRight
    case .landscapeRight:
      orientation = .landscapeLeft
    case .portraitUpsideDown:
      orientation = .portraitUpsideDown
    default:
      orientation = .portrait
    }
    stream.videoOrientation = orientation
    activeView?.preview.videoOrientation = orientation
  }

  @objc
  private func handleRTMPStatus(_ notification: Notification) {
    let event = Event.from(notification)
    guard
      let data = event.data as? ASObject,
      let code = data["code"] as? String
    else {
      return
    }
    switch code {
    case RTMPConnection.Code.connectSuccess.rawValue:
      if let pendingStreamKey {
        stream.publish(pendingStreamKey)
      }
    case RTMPStream.Code.publishStart.rawValue:
      emitState("live")
    case RTMPConnection.Code.connectFailed.rawValue,
      RTMPConnection.Code.connectRejected.rawValue,
      RTMPStream.Code.publishBadName.rawValue,
      RTMPStream.Code.failed.rawValue:
      emitError("The live stream could not connect. Check your connection.")
      emitState("stopped")
    case RTMPConnection.Code.connectClosed.rawValue:
      if pendingStreamKey != nil {
        emitError("The live stream connection closed.")
      }
    default:
      break
    }
  }

  @objc
  private func handleRTMPError(_ notification: Notification) {
    emitError("The live stream encountered a network error.")
  }

  private func emitState(_ state: String) {
    DispatchQueue.main.async { [weak self] in
      self?.activeView?.onStreamState(["state": state])
    }
  }

  private func emitError(_ message: String) {
    DispatchQueue.main.async { [weak self] in
      self?.activeView?.onCaptureError(["message": message])
    }
  }

  private func analyze(_ sampleBuffer: CMSampleBuffer) {
    let now = CFAbsoluteTimeGetCurrent()
    guard now - lastVisionAt >= 0.45 else { return }
    lastVisionAt = now
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
      return
    }
    let rectangleRequest = VNDetectRectanglesRequest()
    rectangleRequest.maximumObservations = 2
    rectangleRequest.minimumConfidence = 0.42
    rectangleRequest.minimumAspectRatio = 0.28
    rectangleRequest.maximumAspectRatio = 1.0
    rectangleRequest.quadratureTolerance = 35
    let poseRequest = VNDetectHumanBodyPoseRequest()
    let handler = VNImageRequestHandler(
      cvPixelBuffer: pixelBuffer,
      orientation: .right,
      options: [:]
    )
    do {
      try handler.perform([rectangleRequest, poseRequest])
      let rectangle = rectangleRequest.results?.max {
        $0.boundingBox.width * $0.boundingBox.height <
          $1.boundingBox.width * $1.boundingBox.height
      }
      let pose = poseRequest.results?.first
      publishGuidance(rectangle: rectangle, pose: pose)
    } catch {
      // A missed Vision frame is normal while the capture pipeline is busy.
    }
  }

  private func publishGuidance(
    rectangle: VNRectangleObservation?,
    pose: VNHumanBodyPoseObservation?
  ) {
    var score = 100
    var warnings: [String] = []
    var corners: [[String: Double]]?
    var confidence = 0.15

    if let rectangle {
      let box = rectangle.boundingBox
      confidence = Double(rectangle.confidence)
      corners = [
        ["x": Double(rectangle.topLeft.x), "y": Double(rectangle.topLeft.y)],
        ["x": Double(rectangle.topRight.x), "y": Double(rectangle.topRight.y)],
        [
          "x": Double(rectangle.bottomRight.x),
          "y": Double(rectangle.bottomRight.y)
        ],
        [
          "x": Double(rectangle.bottomLeft.x),
          "y": Double(rectangle.bottomLeft.y)
        ]
      ]
      if box.width > 0.93 || box.height > 0.88 {
        score -= 22
        warnings.append("Move farther back")
      }
      if box.maxX > 0.98 {
        score -= 16
        warnings.append("The far-right service area is outside the frame")
      }
      if box.minX < 0.02 {
        score -= 12
        warnings.append("Rotate slightly left")
      } else if box.midX > 0.59 {
        score -= 9
        warnings.append("Rotate slightly right")
      }
      if box.maxY < 0.7 {
        score -= 10
        warnings.append("Raise the phone")
      }
    } else {
      score -= 38
      warnings.append("Keep all four outside court corners visible")
    }

    if let pose, let points = try? pose.recognizedPoints(.all) {
      let visible = points.values.filter { $0.confidence > 0.3 }
      if !visible.isEmpty {
        let minY = visible.map(\.location.y).min() ?? 0
        let maxY = visible.map(\.location.y).max() ?? 0
        if maxY - minY < 0.12 {
          score -= 12
          warnings.append("Players may be too small for advanced analytics")
        }
        confidence = max(confidence, 0.55)
      }
    }

    let motion = motionManager.deviceMotion
    let rotationMagnitude = motion.map {
      abs($0.rotationRate.x) +
        abs($0.rotationRate.y) +
        abs($0.rotationRate.z)
    } ?? 0
    let accelerationMagnitude = motion.map {
      abs($0.userAcceleration.x) +
        abs($0.userAcceleration.y) +
        abs($0.userAcceleration.z)
    } ?? 0
    if rotationMagnitude > 0.35 || accelerationMagnitude > 0.08 {
      score -= 20
      warnings.append("Camera is moving—use a tripod")
    }

    if let camera, camera.iso > min(camera.activeFormat.maxISO * 0.7, 900) {
      score -= 14
      warnings.append("Lighting is too low for ball tracking")
    }

    let attitude: [String: Double]? = motion.map {
      let degrees = 180.0 / Double.pi
      return [
        "pitch": $0.attitude.pitch * degrees,
        "roll": $0.attitude.roll * degrees,
        "yaw": $0.attitude.yaw * degrees
      ]
    }
    if let roll = attitude?["roll"], abs(roll) > 6 {
      score -= 9
      warnings.append("Level the phone with the recommended horizon")
    }

    score = max(0, min(100, score))
    let grade: String
    if score >= 84 {
      grade = "excellent"
    } else if score >= 67 {
      grade = "good"
    } else if score >= 44 {
      grade = "limited"
    } else {
      grade = "poor"
    }
    let timestamp = ISO8601DateFormatter().string(from: Date())
    var payload: [String: Any] = [
      "qualityGrade": grade,
      "qualityScore": score,
      "confidence": confidence,
      "acceptable": score >= 67,
      "warnings": Array(warnings.prefix(8)),
      "calibratedAt": timestamp
    ]
    if let corners {
      payload["corners"] = corners
    }
    if let attitude {
      payload["deviceAttitude"] = attitude
    }
    if let camera {
      payload["lens"] = camera.localizedName
      payload["zoomFactor"] = Double(camera.videoZoomFactor)
    }
    latestGuidance = payload
    DispatchQueue.main.async { [weak self] in
      self?.activeView?.onGuidance(payload)
    }
  }
}

extension DunaVideoCaptureController: IOStreamDelegate {
  func stream(
    _ stream: IOStream,
    track: UInt8,
    didInput buffer: AVAudioBuffer,
    when: AVAudioTime
  ) {}

  func stream(
    _ stream: IOStream,
    track: UInt8,
    didInput buffer: CMSampleBuffer
  ) {
    guard track == 0 else { return }
    visionQueue.async { [weak self] in
      self?.analyze(buffer)
    }
  }

  func stream(
    _ stream: IOStream,
    videoErrorOccurred error: IOVideoUnitError
  ) {
    emitError("Camera capture failed.")
  }

  func stream(
    _ stream: IOStream,
    audioErrorOccurred error: IOAudioUnitError
  ) {
    if audioEnabled {
      emitError("Audio capture failed.")
    }
  }

  func stream(
    _ stream: IOStream,
    willChangeReadyState state: IOStream.ReadyState
  ) {}

  func stream(
    _ stream: IOStream,
    didChangeReadyState state: IOStream.ReadyState
  ) {}

  @available(tvOS 17.0, *)
  func stream(
    _ stream: IOStream,
    sessionWasInterrupted session: AVCaptureSession,
    reason: AVCaptureSession.InterruptionReason?
  ) {
    emitError("Camera capture was interrupted.")
  }

  @available(tvOS 17.0, *)
  func stream(
    _ stream: IOStream,
    sessionInterruptionEnded session: AVCaptureSession
  ) {
    emitState("preview")
  }
}

extension DunaVideoCaptureController: IOStreamRecorderDelegate {
  func recorder(
    _ recorder: IOStreamRecorder,
    errorOccured error: IOStreamRecorder.Error
  ) {
    stream.removeObserver(recorder)
    self.recorder = nil
    UIApplication.shared.isIdleTimerDisabled = pendingStreamKey != nil
    recordingPromise?.reject(
      "ERR_DUNA_RECORDING",
      "The local video could not be saved."
    )
    recordingPromise = nil
  }

  func recorder(
    _ recorder: IOStreamRecorder,
    finishWriting writer: AVAssetWriter
  ) {
    stream.removeObserver(recorder)
    self.recorder = nil
    UIApplication.shared.isIdleTimerDisabled = pendingStreamKey != nil
    let url = writer.outputURL
    let asset = AVURLAsset(url: url)
    let duration = max(1, Int(CMTimeGetSeconds(asset.duration).rounded()))
    let attributes = try? FileManager.default.attributesOfItem(
      atPath: url.path
    )
    let bytes = (attributes?[.size] as? NSNumber)?.intValue ?? 0
    recordingPromise?.resolve([
      "fileUri": url.absoluteString,
      "fileName": url.lastPathComponent,
      "mimeType": "video/mp4",
      "bytes": bytes,
      "durationSeconds": duration
    ])
    recordingPromise = nil
  }
}

public final class DunaVideoCaptureView: ExpoView {
  let preview = MTHKView(frame: .zero)
  let onGuidance = ExpoModulesCore.EventDispatcher()
  let onStreamState = ExpoModulesCore.EventDispatcher()
  let onCaptureError = ExpoModulesCore.EventDispatcher()

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    preview.videoGravity = .resizeAspectFill
    preview.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(preview)
    DunaVideoCaptureController.shared.attach(view: self)
  }

  public override var bounds: CGRect {
    didSet {
      preview.frame = bounds
    }
  }

  deinit {
    DunaVideoCaptureController.shared.detach(view: self)
  }
}

private final class DunaVideoPicker: NSObject, PHPickerViewControllerDelegate {
  private let promise: Promise
  private weak var picker: PHPickerViewController?

  init(promise: Promise) {
    self.promise = promise
  }

  func attach(_ picker: PHPickerViewController) {
    self.picker = picker
  }

  func picker(
    _ picker: PHPickerViewController,
    didFinishPicking results: [PHPickerResult]
  ) {
    picker.dismiss(animated: true)
    guard let provider = results.first?.itemProvider else {
      promise.resolve(nil)
      return
    }
    provider.loadFileRepresentation(
      forTypeIdentifier: UTType.movie.identifier
    ) { [promise] url, error in
      if let error {
        promise.reject(
          "ERR_DUNA_VIDEO_PICKER",
          "The selected video could not be opened: \(error.localizedDescription)"
        )
        return
      }
      guard let url else {
        promise.reject(
          "ERR_DUNA_VIDEO_PICKER",
          "The selected video could not be opened."
        )
        return
      }
      let source = FileManager.default.temporaryDirectory
        .appendingPathComponent("duna-source-\(UUID().uuidString)")
        .appendingPathExtension(url.pathExtension)
      do {
        try FileManager.default.copyItem(at: url, to: source)
        Self.transcode(source: source, promise: promise)
      } catch {
        promise.reject(
          "ERR_DUNA_VIDEO_PICKER",
          "The selected video could not be prepared."
        )
      }
    }
  }

  private static func transcode(source: URL, promise: Promise) {
    let asset = AVURLAsset(url: source)
    let presets = AVAssetExportSession.exportPresets(compatibleWith: asset)
    let preset = presets.contains(AVAssetExportPreset1920x1080)
      ? AVAssetExportPreset1920x1080
      : AVAssetExportPresetHighestQuality
    guard let exporter = AVAssetExportSession(asset: asset, presetName: preset)
    else {
      promise.reject(
        "ERR_DUNA_VIDEO_EXPORT",
        "The selected video format is not supported."
      )
      return
    }
    let output = FileManager.default.temporaryDirectory
      .appendingPathComponent("duna-upload-\(UUID().uuidString).mp4")
    exporter.outputURL = output
    exporter.outputFileType = .mp4
    exporter.shouldOptimizeForNetworkUse = true
    exporter.exportAsynchronously {
      try? FileManager.default.removeItem(at: source)
      guard exporter.status == .completed else {
        promise.reject(
          "ERR_DUNA_VIDEO_EXPORT",
          exporter.error?.localizedDescription ??
            "The selected video could not be converted to MP4."
        )
        return
      }
      let duration = max(
        1,
        Int(CMTimeGetSeconds(asset.duration).rounded())
      )
      let attributes = try? FileManager.default.attributesOfItem(
        atPath: output.path
      )
      let bytes = (attributes?[.size] as? NSNumber)?.intValue ?? 0
      promise.resolve([
        "fileUri": output.absoluteString,
        "fileName": output.lastPathComponent,
        "mimeType": "video/mp4",
        "bytes": bytes,
        "durationSeconds": duration
      ])
    }
  }
}

public final class DunaVideoCaptureModule: Module {
  private var pickerDelegate: DunaVideoPicker?

  public func definition() -> ModuleDefinition {
    Name("DunaVideoCapture")

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

    AsyncFunction("preparePreview") { (audioEnabled: Bool) in
      try DunaVideoCaptureController.shared.prepare(
        audioEnabled: audioEnabled
      )
    }.runOnQueue(.main)

    AsyncFunction("startStream") {
      (streamUrl: String, streamKey: String, audioEnabled: Bool) in
      guard
        let url = URL(string: streamUrl),
        ["rtmp", "rtmps"].contains(url.scheme?.lowercased() ?? ""),
        streamKey.count >= 8
      else {
        throw NSError(
          domain: "DunaVideoCapture",
          code: 3,
          userInfo: [NSLocalizedDescriptionKey: "The stream session is invalid."]
        )
      }
      try DunaVideoCaptureController.shared.startStream(
        url: streamUrl,
        key: streamKey,
        audioEnabled: audioEnabled
      )
    }.runOnQueue(.main)

    AsyncFunction("stopStream") {
      DunaVideoCaptureController.shared.stopStream()
    }.runOnQueue(.main)

    AsyncFunction("startRecording") { (audioEnabled: Bool) in
      try DunaVideoCaptureController.shared.startRecording(
        audioEnabled: audioEnabled
      )
    }.runOnQueue(.main)

    AsyncFunction("stopRecording") { (promise: Promise) in
      DunaVideoCaptureController.shared.stopRecording(promise: promise)
    }.runOnQueue(.main)

    AsyncFunction("pickVideo") { (promise: Promise) in
      guard let parent = appContext?.utilities?.currentViewController() else {
        promise.reject(
          "ERR_DUNA_VIDEO_PICKER",
          "The video library is not available."
        )
        return
      }
      var configuration = PHPickerConfiguration(photoLibrary: .shared())
      configuration.filter = .videos
      configuration.selectionLimit = 1
      configuration.preferredAssetRepresentationMode = .current
      let picker = PHPickerViewController(configuration: configuration)
      let delegate = DunaVideoPicker(promise: promise)
      delegate.attach(picker)
      picker.delegate = delegate
      pickerDelegate = delegate
      parent.present(picker, animated: true)
    }.runOnQueue(.main)

    AsyncFunction("uploadPart") {
      (
        fileUri: String,
        uploadUrl: String,
        offset: Double,
        length: Int,
        promise: Promise
      ) in
      guard
        let destination = URL(string: uploadUrl),
        destination.scheme == "https",
        length > 0,
        length <= 64 * 1024 * 1024
      else {
        promise.reject(
          "ERR_DUNA_VIDEO_UPLOAD",
          "The upload part is invalid."
        )
        return
      }
      let source = URL(string: fileUri) ??
        URL(fileURLWithPath: fileUri)
      do {
        let handle = try FileHandle(forReadingFrom: source)
        try handle.seek(toOffset: UInt64(offset))
        let data = try handle.read(upToCount: length) ?? Data()
        try handle.close()
        guard data.count == length else {
          promise.reject(
            "ERR_DUNA_VIDEO_UPLOAD",
            "The upload part could not be read."
          )
          return
        }
        var request = URLRequest(url: destination)
        request.httpMethod = "PUT"
        request.setValue(
          "application/octet-stream",
          forHTTPHeaderField: "Content-Type"
        )
        URLSession.shared.uploadTask(with: request, from: data) {
          _,
          response,
          error in
          if let error {
            promise.reject(
              "ERR_DUNA_VIDEO_UPLOAD",
              error.localizedDescription
            )
            return
          }
          guard
            let response = response as? HTTPURLResponse,
            (200...299).contains(response.statusCode),
            let etag = response.value(forHTTPHeaderField: "ETag")
          else {
            promise.reject(
              "ERR_DUNA_VIDEO_UPLOAD",
              "Cloudflare R2 rejected an upload part."
            )
            return
          }
          promise.resolve(["etag": etag, "sizeBytes": data.count])
        }.resume()
      } catch {
        promise.reject(
          "ERR_DUNA_VIDEO_UPLOAD",
          "The local video could not be read."
        )
      }
    }

    Function("lockCalibration") {
      DunaVideoCaptureController.shared.lockCalibration()
    }

    Function("releasePreview") {
      DunaVideoCaptureController.shared.releasePreview()
    }

    View(DunaVideoCaptureView.self) {
      Events("onGuidance", "onStreamState", "onCaptureError")

      Prop("audioEnabled") {
        (_: DunaVideoCaptureView, enabled: Bool) in
        DunaVideoCaptureController.shared.audioEnabled = enabled
      }

      Prop("courtWidthMeters") {
        (_: DunaVideoCaptureView, value: Double) in
        DunaVideoCaptureController.shared.courtWidthMeters = value
      }

      Prop("courtLengthMeters") {
        (_: DunaVideoCaptureView, value: Double) in
        DunaVideoCaptureController.shared.courtLengthMeters = value
      }

      Prop("netHeightMeters") {
        (_: DunaVideoCaptureView, value: Double) in
        DunaVideoCaptureController.shared.netHeightMeters = value
      }
    }
  }
}
