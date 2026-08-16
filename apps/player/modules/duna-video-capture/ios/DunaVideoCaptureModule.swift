import AVFoundation
import CoreImage
import ARKit
import CoreMotion
import ExpoModulesCore
import HaishinKit
import PhotosUI
import SceneKit
import UIKit
import UniformTypeIdentifiers
import Vision

private final class DunaVideoCaptureController: NSObject {
  static let shared = DunaVideoCaptureController()

  private let connection = RTMPConnection()
  let stream: RTMPStream
  private let motionManager = CMMotionManager()
  let arSession = ARSession()
  private let visionQueue = DispatchQueue(
    label: "co.duna.video.vision",
    qos: .userInitiated
  )
  private let previewContext = CIContext(options: [.useSoftwareRenderer: false])

  weak var activeView: DunaVideoCaptureView?
  private var camera: AVCaptureDevice?
  private var prepared = false
  var audioEnabled = true
  private var pendingStreamKey: String?
  private var lastVisionAt = CFAbsoluteTimeGetCurrent()
  private var lastPreviewAt = CFAbsoluteTimeGetCurrent()
  private var lastARAt = CFAbsoluteTimeGetCurrent()
  private var recorder: IOStreamRecorder?
  private var recordingPromise: Promise?
  private var latestGuidance: [String: Any]?
  private var usesGroundTracking = false
  private var lidarAvailable = false
  private var latestGroundCorners: [CGPoint]?
  private var latestCameraHeight: Double?
  private var latestHorizonY = 0.16
  private var latestTrackingState = "initializing"
  private var smoothedScore: Double?
  private var pendingSuggestion: String?
  private var pendingSuggestionSince = CFAbsoluteTimeGetCurrent()
  private var stableSuggestion: String?
  private var lockedCaptureOrientation: AVCaptureVideoOrientation?
  private var currentDeviceOrientation = "unknown"

  var courtWidthMeters = 8.0
  var courtLengthMeters = 16.0
  var netHeightMeters = 2.43
  var preferredOrientation = "landscape"

  private override init() {
    stream = RTMPStream(connection: connection)
    super.init()
    stream.delegate = self
    arSession.delegate = self
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
    view.arPreview.session = arSession
    showGroundPreview(usesGroundTracking)
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
      prepared = true
      startMotion()
      if ARWorldTrackingConfiguration.isSupported {
        startGroundTracking()
      } else {
        attachCaptureDevices(audioEnabled: audioEnabled)
      }
    }
    if !usesGroundTracking {
      attachAudioDevice(audioEnabled: audioEnabled)
    }
    emitState("preview")
  }

  func releasePreview() {
    guard pendingStreamKey == nil, recorder == nil else { return }
    stream.attachCamera(nil)
    stream.attachAudio(nil)
    arSession.pause()
    usesGroundTracking = false
    latestGroundCorners = nil
    latestCameraHeight = nil
    smoothedScore = nil
    stableSuggestion = nil
    pendingSuggestion = nil
    showGroundPreview(false)
    motionManager.stopDeviceMotionUpdates()
    prepared = false
    camera = nil
  }

  func startStream(url: String, key: String, audioEnabled: Bool) throws {
    try prepare(audioEnabled: audioEnabled)
    transitionToCapture(audioEnabled: audioEnabled)
    pendingStreamKey = key
    UIApplication.shared.isIdleTimerDisabled = true
    emitState("connecting")
    connection.connect(url)
  }

  func stopStream() {
    pendingStreamKey = nil
    stream.close()
    connection.close()
    lockedCaptureOrientation = nil
    UIApplication.shared.isIdleTimerDisabled = recorder != nil
    emitState("stopped")
  }

  func startRecording(audioEnabled: Bool) throws {
    try prepare(audioEnabled: audioEnabled)
    transitionToCapture(audioEnabled: audioEnabled)
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

  private func attachCaptureDevices(audioEnabled: Bool) {
    guard let camera else { return }
    stream.attachCamera(camera) { [weak self] unit, error in
      unit?.isVideoMirrored = false
      if let error {
        self?.emitError("Camera setup failed: \(error.localizedDescription)")
      }
    }
    attachAudioDevice(audioEnabled: audioEnabled)
  }

  private func attachAudioDevice(audioEnabled: Bool) {
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
  }

  private func startGroundTracking() {
    let configuration = ARWorldTrackingConfiguration()
    configuration.planeDetection = [.horizontal]
    lidarAvailable = ARWorldTrackingConfiguration.supportsSceneReconstruction(
      .mesh
    )
    if lidarAvailable {
      configuration.sceneReconstruction = .meshWithClassification
    }
    if ARWorldTrackingConfiguration.supportsFrameSemantics(.smoothedSceneDepth) {
      configuration.frameSemantics.insert(.smoothedSceneDepth)
    } else if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
      configuration.frameSemantics.insert(.sceneDepth)
    }
    usesGroundTracking = true
    latestTrackingState = "initializing"
    showGroundPreview(true)
    arSession.run(configuration, options: [.resetTracking, .removeExistingAnchors])
  }

  private func transitionToCapture(audioEnabled: Bool) {
    if usesGroundTracking {
      arSession.pause()
      usesGroundTracking = false
      showGroundPreview(false)
      attachCaptureDevices(audioEnabled: audioEnabled)
    }
    lockedCaptureOrientation = currentVideoOrientation()
    applyVideoOrientation(lockedCaptureOrientation ?? .portrait)
  }

  private func showGroundPreview(_ enabled: Bool) {
    DispatchQueue.main.async { [weak self] in
      self?.activeView?.arPreview.isHidden = !enabled
      self?.activeView?.preview.isHidden = enabled
    }
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
    let orientation = currentVideoOrientation()
    if lockedCaptureOrientation == nil {
      applyVideoOrientation(orientation)
    }
  }

  private func currentVideoOrientation() -> AVCaptureVideoOrientation {
    switch UIDevice.current.orientation {
    case .landscapeLeft:
      currentDeviceOrientation = "landscape"
      return .landscapeRight
    case .landscapeRight:
      currentDeviceOrientation = "landscape"
      return .landscapeLeft
    case .portraitUpsideDown:
      currentDeviceOrientation = "portrait"
      return .portraitUpsideDown
    case .portrait:
      currentDeviceOrientation = "portrait"
      return .portrait
    default:
      // UIDevice frequently reports `.unknown` while the camera preview is
      // first attaching. The active scene has the actual interface orientation
      // and keeps preview/video metadata aligned when a player rotates during
      // setup or an active recording.
      if let sceneOrientation = activeView?.window?.windowScene?.interfaceOrientation {
        switch sceneOrientation {
        case .landscapeLeft:
          currentDeviceOrientation = "landscape"
          return .landscapeLeft
        case .landscapeRight:
          currentDeviceOrientation = "landscape"
          return .landscapeRight
        case .portraitUpsideDown:
          currentDeviceOrientation = "portrait"
          return .portraitUpsideDown
        default:
          currentDeviceOrientation = "portrait"
          return .portrait
        }
      }
      return lockedCaptureOrientation ?? .portrait
    }
  }

  private func applyVideoOrientation(_ orientation: AVCaptureVideoOrientation) {
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
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
      return
    }
    analyze(pixelBuffer, orientation: visionOrientation())
  }

  private func analyze(
    _ pixelBuffer: CVPixelBuffer,
    orientation: CGImagePropertyOrientation
  ) {
    let now = CFAbsoluteTimeGetCurrent()
    guard now - lastVisionAt >= 0.45 else { return }
    lastVisionAt = now
    let rectangleRequest = VNDetectRectanglesRequest()
    rectangleRequest.maximumObservations = 8
    rectangleRequest.minimumConfidence = 0.42
    rectangleRequest.minimumAspectRatio = 0.14
    rectangleRequest.maximumAspectRatio = 1.0
    rectangleRequest.minimumSize = 0.1
    rectangleRequest.quadratureTolerance = 32
    let landmarkRequest = VNDetectRectanglesRequest()
    landmarkRequest.maximumObservations = 14
    landmarkRequest.minimumConfidence = 0.32
    landmarkRequest.minimumAspectRatio = 0.01
    landmarkRequest.maximumAspectRatio = 0.28
    landmarkRequest.minimumSize = 0.05
    landmarkRequest.quadratureTolerance = 24
    let poseRequest = VNDetectHumanBodyPoseRequest()
    let handler = VNImageRequestHandler(
      cvPixelBuffer: pixelBuffer,
      orientation: orientation,
      options: [:]
    )
    do {
      try handler.perform([rectangleRequest, landmarkRequest, poseRequest])
      let rectangle = rectangleRequest.results?
        .filter {
          let box = $0.boundingBox
          return box.width * box.height >= 0.045 && box.minY < 0.72
        }
        .max {
          let leftBox = $0.boundingBox
          let rightBox = $1.boundingBox
          let leftScore = leftBox.width * leftBox.height *
            CGFloat($0.confidence) * (1.25 - leftBox.midY * 0.35)
          let rightScore = rightBox.width * rightBox.height *
            CGFloat($1.confidence) * (1.25 - rightBox.midY * 0.35)
          return leftScore < rightScore
        }
      let pose = poseRequest.results?.first
      publishGuidance(
        rectangle: rectangle,
        landmarks: landmarkRequest.results ?? [],
        pose: pose
      )
      if now - lastPreviewAt >= 2 {
        lastPreviewAt = now
        publishPreview(pixelBuffer)
      }
    } catch {
      // A missed Vision frame is normal while the capture pipeline is busy.
    }
  }

  private func visionOrientation() -> CGImagePropertyOrientation {
    switch UIDevice.current.orientation {
    case .landscapeLeft:
      return .up
    case .landscapeRight:
      return .down
    case .portraitUpsideDown:
      return .left
    default:
      return .right
    }
  }

  private func stableWarnings(_ warnings: [String]) -> [String] {
    guard let candidate = warnings.first else {
      stableSuggestion = nil
      pendingSuggestion = nil
      return []
    }
    let now = CFAbsoluteTimeGetCurrent()
    if candidate != pendingSuggestion {
      pendingSuggestion = candidate
      pendingSuggestionSince = now
    }
    if stableSuggestion == nil || now - pendingSuggestionSince >= 0.8 {
      stableSuggestion = candidate
    }
    var result = warnings
    if let stableSuggestion {
      result.removeAll { $0 == stableSuggestion }
      result.insert(stableSuggestion, at: 0)
    }
    return Array(result.prefix(8))
  }

  private func publishGuidance(
    rectangle: VNRectangleObservation?,
    landmarks: [VNRectangleObservation],
    pose: VNHumanBodyPoseObservation?
  ) {
    var score = 100
    var warnings: [String] = []
    let orientationMatches = currentDeviceOrientation == preferredOrientation
    if !orientationMatches {
      score -= 38
      warnings.append("Rotate your iPhone to \(preferredOrientation)")
    }

    let visionCorners: [CGPoint]? = rectangle.map {
      [
        CGPoint(x: $0.topLeft.x, y: 1 - $0.topLeft.y),
        CGPoint(x: $0.topRight.x, y: 1 - $0.topRight.y),
        CGPoint(x: $0.bottomRight.x, y: 1 - $0.bottomRight.y),
        CGPoint(x: $0.bottomLeft.x, y: 1 - $0.bottomLeft.y)
      ]
    }
    // A generic Vision rectangle may be a chair, mirror, window, or indoor
    // floor edge. Treat it as only a *candidate* until it has the footprint of
    // a court and a plausible net line. This is intentionally conservative:
    // no automatic court is better than a confidently wrong court.
    let courtCandidate = rectangle.map {
      let box = $0.boundingBox
      let aspect = box.width / max(box.height, 0.001)
      return $0.confidence >= 0.72 &&
        box.width * box.height >= 0.1 &&
        box.width >= 0.32 &&
        aspect >= 0.5 && aspect <= 4.8 &&
        box.minY < 0.68
    } ?? false
    let groundDetected = latestGroundCorners != nil || courtCandidate

    let horizontalLandmarks = landmarks.filter {
      let box = $0.boundingBox
      return box.width >= 0.38 && box.height <= 0.13 &&
        box.width >= box.height * 3.2 &&
        box.midY >= 0.16 && box.midY <= 0.78
    }
    let netObservation = horizontalLandmarks.max {
      let left = $0.boundingBox
      let right = $1.boundingBox
      let leftScore = left.width * CGFloat($0.confidence) *
        (1 - abs(left.midY - 0.5) * 0.35)
      let rightScore = right.width * CGFloat($1.confidence) *
        (1 - abs(right.midY - 0.5) * 0.35)
      return leftScore < rightScore
    }
    let netTopLine: [CGPoint]? = netObservation.map {
      let left = CGPoint(
        x: ($0.topLeft.x + $0.bottomLeft.x) / 2,
        y: 1 - ($0.topLeft.y + $0.bottomLeft.y) / 2
      )
      let right = CGPoint(
        x: ($0.topRight.x + $0.bottomRight.x) / 2,
        y: 1 - ($0.topRight.y + $0.bottomRight.y) / 2
      )
      return [left, right]
    }
    let netDetected = netTopLine != nil
    let courtDetected = courtCandidate && netDetected

    // ARKit can correctly find a floor in a living room, car park, or sand but
    // that is not evidence of a volleyball court. Keep it for horizon and
    // tripod guidance only. A court candidate and a plausible net are both
    // required before a projected court is ever emitted to the UI.
    let projectedCorners = courtDetected
      ? (visionCorners ?? latestGroundCorners)
      : nil

    var antennaPoints: [CGPoint]?
    if let netTopLine {
      let vertical = landmarks.filter {
        let box = $0.boundingBox
        guard
          box.height >= 0.1,
          box.width <= 0.1,
          box.height >= box.width * 2.3
        else {
          return false
        }
        let x = box.midX
        return abs(x - netTopLine[0].x) <= 0.2 ||
          abs(x - netTopLine[1].x) <= 0.2
      }.sorted { $0.boundingBox.midX < $1.boundingBox.midX }
      if let left = vertical.first, let right = vertical.last, left !== right {
        antennaPoints = [
          CGPoint(x: left.boundingBox.midX, y: 1 - left.boundingBox.maxY),
          CGPoint(x: right.boundingBox.midX, y: 1 - right.boundingBox.maxY)
        ]
      }
    }

    func visible(_ point: CGPoint) -> Bool {
      point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1
    }
    let visibleCorners = projectedCorners?.filter(visible).count ?? 0
    let partialCourt = !courtDetected || visibleCorners < 4
    let nearLineVisible = projectedCorners.map {
      visible($0[2]) && visible($0[3])
    } ?? false
    let netLine: [CGPoint]? = projectedCorners.map {
      [
        CGPoint(
          x: ($0[0].x + $0[3].x) / 2,
          y: ($0[0].y + $0[3].y) / 2
        ),
        CGPoint(
          x: ($0[1].x + $0[2].x) / 2,
          y: ($0[1].y + $0[2].y) / 2
        )
      ]
    }

    if !groundDetected {
      score -= 32
      warnings.append("Tilt down slowly so Duna can find the sand")
    } else if !courtDetected && !netDetected {
      score -= 30
      warnings.append(
        "Find the net and both sidelines—Duna is keeping the court guide hidden until it sees real court evidence"
      )
    } else if !courtDetected {
      score -= 9
      warnings.append(
        "A net-like line is visible; include both sidelines before Duna draws a court"
      )
    }

    if let projectedCorners {
      let minX = projectedCorners.map(\.x).min() ?? 0
      let maxX = projectedCorners.map(\.x).max() ?? 1
      let minY = projectedCorners.map(\.y).min() ?? 0
      let maxY = projectedCorners.map(\.y).max() ?? 1
      let width = maxX - minX
      let height = maxY - minY
      let midX = (minX + maxX) / 2

      if visibleCorners < 4 {
        score -= max(4, (4 - visibleCorners) * 4)
        warnings.append(
          "\(4 - visibleCorners) court corner\(visibleCorners == 3 ? " is" : "s are") outside the frame—capture is still available"
        )
      } else if width < 0.36 || height < 0.26 {
        score -= 12
        warnings.append("Players may be small—move closer if the full court stays visible")
      }
      if midX < 0.44 {
        score -= 9
        warnings.append("Rotate gradually left")
      } else if midX > 0.56 {
        score -= 9
        warnings.append("Rotate gradually right")
      }
      if minY > 0.36 {
        score -= 10
        warnings.append("Raise the phone gradually to see more ball flight")
      }
    }

    if let cameraHeight = latestCameraHeight, cameraHeight < 0.38 {
      score -= 10
      warnings.append(
        "Ground-level tripod detected—raise it if space allows for stronger analytics"
      )
    } else if let cameraHeight = latestCameraHeight, cameraHeight < 1.15 {
      score -= 5
      warnings.append("A little more tripod height will improve trajectory coverage")
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
    smoothedScore = smoothedScore.map { $0 * 0.72 + Double(score) * 0.28 }
      ?? Double(score)
    score = Int((smoothedScore ?? Double(score)).rounded())
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
    let confidence: Double = courtDetected
      ? (lidarAvailable ? 0.9 : 0.78)
      : netDetected
        ? 0.42
      : groundDetected
          ? 0.22
        : 0.18
    if warnings.isEmpty {
      warnings.append("Court lock ready—fine-tune the net only if needed")
    }
    let stabilizedWarnings = stableWarnings(warnings)
    let acceptableGeometry = courtDetected
    var payload: [String: Any] = [
      "qualityGrade": grade,
      "qualityScore": score,
      "confidence": confidence,
      "acceptable": score >= 67 && orientationMatches && acceptableGeometry,
      "warnings": stabilizedWarnings,
      "projectionSource": courtDetected && visionCorners != nil
        ? "vision"
        : courtDetected && latestGroundCorners != nil
          ? (lidarAvailable ? "lidar" : "arkit")
          : "estimated",
      "lidarAvailable": lidarAvailable,
      "groundPlaneDetected": groundDetected,
      "courtDetected": courtDetected,
      "netDetected": netDetected,
      "antennaDetected": antennaPoints != nil,
      "visibleCornerCount": visibleCorners,
      "nearLineVisible": nearLineVisible,
      "partialCourt": partialCourt,
      "calibrationMode": "automatic",
      "modelVersion": "court-v2-partial-2026-08-05",
      "preferredOrientation": preferredOrientation,
      "deviceOrientation": currentDeviceOrientation,
      "orientationMatches": orientationMatches,
      "trackingState": latestTrackingState,
      "horizonY": latestHorizonY,
      "calibratedAt": timestamp
    ]
    func bounded(_ value: CGFloat) -> Double {
      max(-1.5, min(2.5, Double(value)))
    }
    func pointPayload(_ point: CGPoint) -> [String: Double] {
      ["x": bounded(point.x), "y": bounded(point.y)]
    }
    if let projectedCorners {
      payload["corners"] = projectedCorners.map(pointPayload)
      payload["edgeVisibility"] = [
        "far": visible(projectedCorners[0]) && visible(projectedCorners[1]),
        "right": visible(projectedCorners[1]) && visible(projectedCorners[2]),
        "near": nearLineVisible,
        "left": visible(projectedCorners[3]) && visible(projectedCorners[0]),
        "net": netTopLine?.allSatisfy(visible) ?? false
      ]
    }
    if let netLine {
      payload["netLine"] = netLine.map(pointPayload)
    }
    if let netTopLine {
      payload["netTopLine"] = netTopLine.map(pointPayload)
    }
    if let antennaPoints {
      payload["antennaPoints"] = antennaPoints.map(pointPayload)
    }
    if let latestCameraHeight {
      payload["cameraHeightMeters"] = latestCameraHeight
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

  private func publishPreview(_ pixelBuffer: CVPixelBuffer) {
    var image = CIImage(cvPixelBuffer: pixelBuffer)
    let sourceWidth = image.extent.width
    let scale = min(1, 320 / max(sourceWidth, 1))
    image = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    guard
      let cgImage = previewContext.createCGImage(image, from: image.extent),
      let jpeg = UIImage(cgImage: cgImage).jpegData(compressionQuality: 0.28),
      jpeg.count <= 220_000
    else {
      return
    }
    let capturedAt = ISO8601DateFormatter().string(from: Date())
    let base64 = jpeg.base64EncodedString()
    let guidance = latestGuidance ?? [:]
    DispatchQueue.main.async { [weak self] in
      self?.activeView?.onPreview([
        "jpegBase64": base64,
        "capturedAt": capturedAt
      ])
      NotificationCenter.default.post(
        name: Notification.Name("co.duna.watch.camera-preview"),
        object: nil,
        userInfo: [
          "jpeg": jpeg,
          "capturedAt": capturedAt,
          "guidance": guidance
        ]
      )
    }
  }
}

extension DunaVideoCaptureController: ARSessionDelegate {
  func session(_ session: ARSession, didUpdate frame: ARFrame) {
    guard usesGroundTracking else { return }
    let now = CFAbsoluteTimeGetCurrent()
    guard now - lastARAt >= 0.2 else { return }
    lastARAt = now

    switch frame.camera.trackingState {
    case .normal:
      latestTrackingState = "normal"
    case .limited:
      latestTrackingState = "limited"
    case .notAvailable:
      latestTrackingState = "unavailable"
    }

    let horizontalPlanes = frame.anchors.compactMap { anchor -> ARPlaneAnchor? in
      guard
        let plane = anchor as? ARPlaneAnchor,
        plane.alignment == .horizontal
      else {
        return nil
      }
      return plane
    }
    let ground = horizontalPlanes.max {
      $0.extent.x * $0.extent.z < $1.extent.x * $1.extent.z
    }

    if let ground, let view = activeView {
      let cameraTransform = frame.camera.transform
      let cameraPosition = SIMD3<Float>(
        cameraTransform.columns.3.x,
        cameraTransform.columns.3.y,
        cameraTransform.columns.3.z
      )
      var forward = SIMD3<Float>(
        -cameraTransform.columns.2.x,
        0,
        -cameraTransform.columns.2.z
      )
      var right = SIMD3<Float>(
        cameraTransform.columns.0.x,
        0,
        cameraTransform.columns.0.z
      )
      if simd_length(forward) > 0.001 && simd_length(right) > 0.001 {
        forward = simd_normalize(forward)
        right = simd_normalize(right)
        let groundY = ground.transform.columns.3.y
        let cameraHeight = max(0, cameraPosition.y - groundY)
        let nearDistance = max(1.5, min(4.5, cameraHeight * 2.2))
        var nearCenter = cameraPosition + forward * nearDistance
        nearCenter.y = groundY
        let farCenter = nearCenter + forward * Float(courtLengthMeters)
        let halfWidth = Float(courtWidthMeters / 2)
        let worldCorners = [
          farCenter - right * halfWidth,
          farCenter + right * halfWidth,
          nearCenter + right * halfWidth,
          nearCenter - right * halfWidth
        ]
        DispatchQueue.main.async { [weak self, weak view] in
          guard
            let self,
            let view,
            view.bounds.width > 0,
            view.bounds.height > 0
          else {
            return
          }
          let projected = worldCorners.map { point -> CGPoint in
            let screen = view.arPreview.projectPoint(
              SCNVector3(point.x, point.y, point.z)
            )
            return CGPoint(
              x: CGFloat(screen.x) / view.bounds.width,
              y: CGFloat(screen.y) / view.bounds.height
            )
          }
          if projected.allSatisfy({ $0.x.isFinite && $0.y.isFinite }) {
            if let previous = self.latestGroundCorners,
              previous.count == projected.count
            {
              self.latestGroundCorners = zip(previous, projected).map {
                CGPoint(
                  x: $0.0.x * 0.72 + $0.1.x * 0.28,
                  y: $0.0.y * 0.72 + $0.1.y * 0.28
                )
              }
            } else {
              self.latestGroundCorners = projected
            }
            self.latestCameraHeight = Double(cameraHeight)
            let pitch = Double(frame.camera.eulerAngles.x)
            self.latestHorizonY = max(0.08, min(0.42, 0.5 + pitch * 0.55))
          }
        }
      }
    } else {
      latestGroundCorners = nil
      latestCameraHeight = nil
    }

    let pixelBuffer = frame.capturedImage
    let orientation = visionOrientation()
    visionQueue.async { [weak self] in
      self?.analyze(pixelBuffer, orientation: orientation)
    }
  }

  func session(_ session: ARSession, didFailWithError error: Error) {
    guard usesGroundTracking else { return }
    usesGroundTracking = false
    latestTrackingState = "unavailable"
    showGroundPreview(false)
    attachCaptureDevices(audioEnabled: audioEnabled)
    emitError(
      "Ground sensing is unavailable, so Duna switched to the Vision court guide."
    )
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
    lockedCaptureOrientation = nil
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
    lockedCaptureOrientation = nil
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
  let arPreview = ARSCNView(frame: .zero)
  let preview = MTHKView(frame: .zero)
  let onGuidance = ExpoModulesCore.EventDispatcher()
  let onStreamState = ExpoModulesCore.EventDispatcher()
  let onCaptureError = ExpoModulesCore.EventDispatcher()
  let onPreview = ExpoModulesCore.EventDispatcher()

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    arPreview.automaticallyUpdatesLighting = true
    arPreview.rendersCameraGrain = false
    arPreview.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(arPreview)
    preview.videoGravity = .resizeAspectFill
    preview.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(preview)
    DunaVideoCaptureController.shared.attach(view: self)
  }

  public override var bounds: CGRect {
    didSet {
      preview.frame = bounds
      arPreview.frame = bounds
    }
  }

  deinit {
    DunaVideoCaptureController.shared.detach(view: self)
  }
}

/**
 * Imported videos do not have the live AR calibration available during a
 * Duna recording. This selector looks across the recording on-device and
 * returns compact stills that are useful for a player to confirm a court and
 * the people in it. Rectangle and human observations only rank candidates;
 * they never create court geometry or identity on their own.
 */
private enum DunaImportedVideoFrameSampler {
  private static func jpegBase64(from image: CGImage) -> String? {
    let source = UIImage(cgImage: image)
    let longestEdge = max(source.size.width, source.size.height)
    let targetSize: CGSize
    if longestEdge > 480 {
      let scale = 480 / longestEdge
      targetSize = CGSize(
        width: max(1, floor(source.size.width * scale)),
        height: max(1, floor(source.size.height * scale))
      )
    } else {
      targetSize = source.size
    }
    let renderer = UIGraphicsImageRenderer(size: targetSize)
    let resized = renderer.image { _ in
      source.draw(in: CGRect(origin: .zero, size: targetSize))
    }
    var quality: CGFloat = 0.46
    var data = resized.jpegData(compressionQuality: quality)
    // The API accepts a 280 KB base64 field. Keep room for base64 expansion
    // and malformed source images without retaining a large second video copy.
    while let current = data, current.count > 175_000, quality > 0.2 {
      quality -= 0.08
      data = resized.jpegData(compressionQuality: quality)
    }
    return data?.base64EncodedString()
  }

  private static func observations(for image: CGImage) -> (
    courtScore: Double,
    playerCount: Int
  ) {
    let rectangles = VNDetectRectanglesRequest()
    rectangles.maximumObservations = 6
    rectangles.minimumConfidence = 0.3
    rectangles.minimumSize = 0.08
    let humans = VNDetectHumanRectanglesRequest()
    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    do {
      try handler.perform([rectangles, humans])
    } catch {
      return (0, 0)
    }
    let rectangleConfidence = rectangles.results?
      .map { Double($0.confidence) }
      .max() ?? 0
    return (rectangleConfidence, humans.results?.count ?? 0)
  }

  static func samples(source: URL, maximumFrames: Int) -> [[String: Any]] {
    let maximumFrames = min(20, max(10, maximumFrames))
    let asset = AVURLAsset(url: source)
    let duration = CMTimeGetSeconds(asset.duration)
    guard duration.isFinite, duration > 0 else { return [] }

    // Scan more moments than we present so the filmstrip favors views with a
    // court-like plane and visible people, including moments minutes into a
    // long recording rather than only its opening setup.
    let candidateCount = min(40, max(20, maximumFrames * 2))
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.maximumSize = CGSize(width: 480, height: 480)
    generator.requestedTimeToleranceBefore = CMTime(seconds: 0.45, preferredTimescale: 600)
    generator.requestedTimeToleranceAfter = CMTime(seconds: 0.45, preferredTimescale: 600)

    var candidates: [[String: Any]] = []
    let edgeMargin = min(0.08, duration / 4)
    for index in 0..<candidateCount {
      let fraction = (Double(index) + 0.5) / Double(candidateCount)
      let seconds = max(
        edgeMargin,
        min(duration - edgeMargin, duration * fraction)
      )
      var actual = CMTime.zero
      guard let image = try? generator.copyCGImage(
        at: CMTime(seconds: seconds, preferredTimescale: 600),
        actualTime: &actual
      ), let jpegBase64 = jpegBase64(from: image) else {
        continue
      }
      let result = observations(for: image)
      candidates.append([
        "id": UUID().uuidString,
        "timestampSeconds": max(0, CMTimeGetSeconds(actual)),
        "jpegBase64": jpegBase64,
        "courtScore": result.courtScore,
        "playerCount": result.playerCount
      ])
    }

    let ranked = candidates.sorted { left, right in
      let leftScore = (left["courtScore"] as? Double ?? 0) * 4 +
        Double(left["playerCount"] as? Int ?? 0) * 0.35
      let rightScore = (right["courtScore"] as? Double ?? 0) * 4 +
        Double(right["playerCount"] as? Int ?? 0) * 0.35
      return leftScore > rightScore
    }
    // Chronological presentation helps a player recognize the point in the
    // game while preserving the CV-ranked candidate set.
    return ranked.prefix(maximumFrames).sorted {
      ($0["timestampSeconds"] as? Double ?? 0) <
        ($1["timestampSeconds"] as? Double ?? 0)
    }
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

    AsyncFunction("sampleVideoFrames") {
      (fileUri: String, maximumFrames: Int) -> [[String: Any]] in
      let source = URL(string: fileUri) ?? URL(fileURLWithPath: fileUri)
      return DunaImportedVideoFrameSampler.samples(
        source: source,
        maximumFrames: maximumFrames
      )
    }

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
      Events("onGuidance", "onStreamState", "onCaptureError", "onPreview")

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

      Prop("preferredOrientation") {
        (_: DunaVideoCaptureView, value: String) in
        DunaVideoCaptureController.shared.preferredOrientation =
          value == "portrait" ? "portrait" : "landscape"
      }
    }
  }
}
