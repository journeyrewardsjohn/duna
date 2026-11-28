#if os(iOS)
import AVFoundation
import CoreMotion
import UIKit
import simd

enum CapturePhase: String {
  case idle
  case preview
  /// Record was pressed; waiting for the first frame to reach the file.
  case starting
  case recording
  /// iOS has taken the camera for a moment (a call, system pressure).
  case interrupted
  /// Frames stopped without an interruption; the camera is being restarted.
  case recovering
  case finishing
  case failed
}

enum CaptureEngineError: Error {
  case cameraUnavailable
  case cameraNotAuthorized
  case notPrepared
  case alreadyRecording
  case notRecording
  case storageLow(freeBytes: Int64)
  case startTimedOut
  case configuration(String)
  case writer(String)

  var code: String {
    switch self {
    case .cameraUnavailable: return "ERR_DUNA_CAMERA_UNAVAILABLE"
    case .cameraNotAuthorized: return "ERR_DUNA_CAMERA_PERMISSION"
    case .notPrepared: return "ERR_DUNA_CAMERA_NOT_READY"
    case .alreadyRecording: return "ERR_DUNA_ALREADY_RECORDING"
    case .notRecording: return "ERR_DUNA_NOT_RECORDING"
    case .storageLow: return "ERR_DUNA_STORAGE_LOW"
    case .startTimedOut: return "ERR_DUNA_CAMERA_NO_VIDEO"
    case .configuration: return "ERR_DUNA_CAMERA_SETUP"
    case .writer: return "ERR_DUNA_RECORDING"
    }
  }

  var message: String {
    switch self {
    case .cameraUnavailable:
      return "A rear camera is unavailable."
    case .cameraNotAuthorized:
      return "Duna needs camera access to record. Allow it in Settings."
    case .notPrepared:
      return "The camera is not ready yet."
    case .alreadyRecording:
      return "A recording is already running."
    case .notRecording:
      return "No Duna recording is active."
    case .storageLow:
      return "There is not enough free space on this iPhone to start a recording."
    case .startTimedOut:
      return "The camera did not deliver video, so Duna did not start a black recording. Reopen the camera and try again."
    case .configuration(let detail):
      return "The camera could not be set up: \(detail)"
    case .writer(let detail):
      return detail
    }
  }
}

struct CaptureStatus: Equatable {
  var phase: CapturePhase
  var cameraActive: Bool
  var lensObscured: Bool
  var recordingId: String?
  var startedAt: Date?
  var thermal: ThermalLevel
  var batteryPercent: Int
  var batteryCharging: Bool
  var framesPerSecond: Int
  var droppedFrames: Int
  var deviceOrientation: String
  var orientationMatches: Bool
  var warnings: [CaptureWarning]
  var message: String?
}

struct FinalizedRecording {
  let manifest: RecordingManifest
  let fileURL: URL
  let healthLogURL: URL
}

/// Every method is called on the main queue.
protocol CaptureEngineDelegate: AnyObject {
  func captureEngine(_ engine: CaptureEngine, didUpdate status: CaptureStatus)
  func captureEngine(_ engine: CaptureEngine, didFinalize recording: FinalizedRecording)
  func captureEngine(_ engine: CaptureEngine, didProducePreview jpeg: Data, at date: Date)
  func captureEngine(_ engine: CaptureEngine, didChangeRotation angle: CGFloat)
  /// Nil when no court is in view.
  func captureEngine(_ engine: CaptureEngine, didUpdateCourt court: CourtObservation?)
}

/// Owns the camera and the recording.
///
/// Rules this class exists to keep:
/// - One camera session, started once. Nothing outside the camera itself
///   (network, a broadcast, a preview consumer) can restart it.
/// - The recording is the clean camera original. Score, sponsor and heart
///   rate are timeline data drawn by players, never pixels in this file.
/// - Losing focus does not end a recording. Only a real move to the
///   background does, because iOS takes the camera away there.
/// - Video time equals wall-clock time since the first frame, including any
///   gap, so events recorded elsewhere line up without bookkeeping.
///
/// Threading: `sessionQueue` owns all engine state and the capture session.
/// `outputQueue` receives frames and owns the writer. The two share only the
/// `Locked` values below.
final class CaptureEngine: NSObject, @unchecked Sendable {
  typealias FinishCompletion = (Result<FinalizedRecording, CaptureEngineError>) -> Void

  let session = AVCaptureSession()
  weak var delegate: CaptureEngineDelegate?

  private let journal: RecordingJournal
  private let sessionQueue = DispatchQueue(label: "co.duna.capture.session")
  private let outputQueue = DispatchQueue(
    label: "co.duna.capture.output",
    qos: .userInitiated
  )
  private let tapHub = FrameTapHub()
  private let conditions = DeviceConditionsMonitor()
  private let videoOutput = AVCaptureVideoDataOutput()
  private let audioOutput = AVCaptureAudioDataOutput()
  private let depthOutput = AVCaptureDepthDataOutput()
  private let motion = CMMotionManager()
  private let depthQueue = DispatchQueue(label: "co.duna.capture.depth", qos: .utility)

  // MARK: sessionQueue state
  private var configuration = CaptureConfiguration()
  private var phase: CapturePhase = .idle
  private var configured = false
  private var shouldRun = false
  private var interrupted = false
  private var videoDevice: AVCaptureDevice?
  private var hasAudioInput = false
  private var manifest: RecordingManifest?
  private var pendingStart: ((Result<RecordingManifest, CaptureEngineError>) -> Void)?
  private var startTimeout: DispatchWorkItem?
  private var finishing = false
  private var finishWaiters: [FinishCompletion] = []
  private var watchdog: DispatchSourceTimer?
  private var watchdogTicks = 0
  private var restartAttempts = 0
  private var runStartedAt: TimeInterval = 0
  private var directive: CaptureDirective
  private var lockedRotation: CGFloat?
  private var appliedRotation: CGFloat?
  private var lensObscured = false
  private var lastStatus: CaptureStatus?
  private var statusMessage: String?
  private var court: CourtObservation?
  private var courtIsManual = false
  private var courtDetectionEnabled = false
  private var heightSamples: [Double] = []
  private var heightCompletion: ((Double?) -> Void)?
  private var heightTimeout: DispatchWorkItem?

  // MARK: outputQueue state
  private var activeWriter: MasterWriter?

  // MARK: shared
  private let lastVideoFrameAt = Locked<TimeInterval>(0)
  private let cameraDelivering = Locked(false)
  private let nonEssentialTapsAllowed = Locked(true)
  private let droppedFrames = Locked(0)
  /// What the court finder needs each time it runs, readable from its queue.
  private let courtDimensions = Locked(CourtDimensions.beach)
  private let measuredCameraHeight = Locked<Double?>(nil)
  private let appliedRotationAngle = Locked(0)
  /// Focal length over the frame's longer side, from the camera format.
  private let focalRatio = Locked(0.73)

  private let startTimeoutSeconds = 5.0
  private let stallSeconds = 3.5
  private let maximumRestartAttempts = 3

  init(journal: RecordingJournal) {
    self.journal = journal
    directive = CaptureHealthPolicy.directive(
      for: CaptureConditions(),
      configuration: CaptureConfiguration()
    )
    super.init()

    let center = NotificationCenter.default
    center.addObserver(
      self,
      selector: #selector(sessionWasInterrupted(_:)),
      name: AVCaptureSession.wasInterruptedNotification,
      object: session
    )
    center.addObserver(
      self,
      selector: #selector(sessionInterruptionEnded(_:)),
      name: AVCaptureSession.interruptionEndedNotification,
      object: session
    )
    center.addObserver(
      self,
      selector: #selector(sessionRuntimeError(_:)),
      name: AVCaptureSession.runtimeErrorNotification,
      object: session
    )

    conditions.onChange = { [weak self] in
      guard let self else { return }
      self.sessionQueue.async { self.conditionsChanged() }
    }
    conditions.onEnterBackground = { [weak self] in
      self?.handleEnterBackground()
    }

    tapHub.add(
      LensObstructionTap { [weak self] obscured in
        guard let self else { return }
        self.sessionQueue.async { self.lensObstructionChanged(obscured) }
      }
    )
    tapHub.add(
      PreviewSnapshotTap { [weak self] jpeg, date in
        DispatchQueue.main.async {
          guard let self else { return }
          self.delegate?.captureEngine(self, didProducePreview: jpeg, at: date)
        }
      }
    )
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  // MARK: - Public API (callable from any queue)

  /// Opens the camera and shows the preview. Safe to call again with a new
  /// configuration; while a recording is running it changes nothing.
  func prepare(
    _ next: CaptureConfiguration,
    completion: @escaping (Result<Void, CaptureEngineError>) -> Void
  ) {
    DispatchQueue.main.async { self.conditions.start() }
    sessionQueue.async {
      guard self.manifest == nil else {
        completion(.success(()))
        return
      }
      do {
        try self.configureSession(next)
        self.shouldRun = true
        if !self.session.isRunning {
          self.cameraDelivering.set(false)
          self.lastVideoFrameAt.set(0)
          self.runStartedAt = ProcessInfo.processInfo.systemUptime
          self.session.startRunning()
        }
        self.restartAttempts = 0
        self.startWatchdog()
        self.startMotion()
        self.evaluateConditions()
        self.setPhase(.preview)
        completion(.success(()))
      } catch let error as CaptureEngineError {
        self.setPhase(.failed, message: error.message)
        completion(.failure(error))
      } catch {
        let wrapped = CaptureEngineError.configuration(error.localizedDescription)
        self.setPhase(.failed, message: wrapped.message)
        completion(.failure(wrapped))
      }
    }
  }

  /// Completes once the first frame is in the file, so a recording that
  /// reports "started" always has video in it.
  func startRecording(
    completion: @escaping (Result<RecordingManifest, CaptureEngineError>) -> Void
  ) {
    sessionQueue.async {
      guard self.configured, self.shouldRun else {
        completion(.failure(.notPrepared))
        return
      }
      guard self.manifest == nil, self.pendingStart == nil else {
        completion(.failure(.alreadyRecording))
        return
      }
      guard self.heightCompletion == nil else {
        completion(.failure(.notPrepared))
        return
      }
      if let free = self.journal.freeBytes(),
        free < self.configuration.minimumFreeBytesToStart
      {
        completion(.failure(.storageLow(freeBytes: free)))
        return
      }

      // The way the phone is held now is how the whole recording is written.
      let angle = self.desiredRotation()
      self.lockedRotation = angle
      self.applyRotation(angle)

      let codec = self.resolvedCodec()
      var created: RecordingManifest?
      do {
        var manifest = try self.journal.create(
          configuration: self.configuration,
          hasAudio: self.hasAudioInput,
          codec: codec
        )
        created = manifest
        let writer = try MasterWriter(
          url: self.journal.movieURL(for: manifest),
          videoSettings: MasterWriter.videoSettings(
            recommended: self.recommendedVideoSettings(for: codec),
            configuration: self.configuration,
            codec: codec
          ),
          audioSettings: self.hasAudioInput ? self.recommendedAudioSettings() : nil,
          fragmentSeconds: self.configuration.fragmentSeconds
        )
        manifest.hasAudio = writer.hasAudioTrack
        // The court as it stood when recording began travels with the file.
        // The finder is paused for the recording itself.
        manifest.court = self.court
        self.tapHub.remove(identifier: "court-finder")
        try self.journal.write(manifest)

        self.manifest = manifest
        self.pendingStart = completion
        self.finishing = false
        self.droppedFrames.set(0)
        self.setPhase(.starting)
        self.outputQueue.async { self.activeWriter = writer }

        let timeout = DispatchWorkItem { self.abortStart(.startTimedOut) }
        self.startTimeout = timeout
        self.sessionQueue.asyncAfter(
          deadline: .now() + self.startTimeoutSeconds,
          execute: timeout
        )
      } catch {
        if let created { try? self.journal.remove(id: created.id) }
        self.lockedRotation = nil
        let failure: CaptureEngineError
        if let writerFailure = error as? MasterWriter.Failure {
          failure = .writer(writerFailure.message)
        } else {
          failure = .writer(
            "The recording could not start: \(error.localizedDescription)"
          )
        }
        completion(.failure(failure))
      }
    }
  }

  func stopRecording(completion: @escaping FinishCompletion) {
    sessionQueue.async {
      guard self.manifest != nil else {
        completion(.failure(.notRecording))
        return
      }
      if self.pendingStart != nil {
        // Stopped before the first frame arrived: there is nothing to save.
        self.abortStart(.notRecording)
        completion(.failure(.notRecording))
        return
      }
      self.finish(reason: .userStopped, completion: completion)
    }
  }

  /// Closes the camera. Ignored while a recording is running.
  func release() {
    sessionQueue.async {
      guard self.manifest == nil else { return }
      self.shouldRun = false
      self.stopWatchdog()
      if self.session.isRunning { self.session.stopRunning() }
      self.cameraDelivering.set(false)
      self.interrupted = false
      self.motion.stopDeviceMotionUpdates()
      self.setPhase(.idle)
      DispatchQueue.main.async { self.conditions.stop() }
    }
  }

  /// Recordings the app never got to close (a crash, a dead battery). Each
  /// playable one is repaired and returned once.
  func recoverUnfinishedRecordings(
    completion: @escaping ([FinalizedRecording]) -> Void
  ) {
    sessionQueue.async {
      let candidates = self.journal.unfinished(excluding: self.manifest?.id)
      let journal = self.journal
      Task {
        var recovered: [FinalizedRecording] = []
        for var manifest in candidates {
          let url = journal.movieURL(for: manifest)
          if let seconds = await Self.playableSeconds(of: url), seconds >= 1 {
            manifest.state = .recovered
            manifest.durationSeconds = seconds
            manifest.bytes = journal.fileSize(of: manifest)
            manifest.endReason = .recoveredAfterCrash
            manifest.endedAt = (manifest.startedAt ?? manifest.createdAt)
              .addingTimeInterval(seconds)
            try? journal.write(manifest)
            journal.appendHealth(id: manifest.id, kind: "recovered")
            recovered.append(
              FinalizedRecording(
                manifest: manifest,
                fileURL: url,
                healthLogURL: journal.healthLogURL(for: manifest.id)
              )
            )
          } else {
            try? journal.remove(id: manifest.id)
          }
        }
        completion(recovered)
      }
    }
  }

  /// Saved recordings still on this iPhone, oldest first.
  func savedRecordings() -> [FinalizedRecording] {
    journal.all()
      .filter { $0.state == .finalized || $0.state == .recovered }
      .map {
        FinalizedRecording(
          manifest: $0,
          fileURL: journal.movieURL(for: $0),
          healthLogURL: journal.healthLogURL(for: $0.id)
        )
      }
  }

  /// Deletes a saved recording, normally after its upload is confirmed.
  func discardRecording(id: String, completion: @escaping (Bool) -> Void) {
    sessionQueue.async {
      guard self.manifest?.id != id else {
        completion(false)
        return
      }
      do {
        try self.journal.remove(id: id)
        completion(true)
      } catch {
        completion(false)
      }
    }
  }

  // MARK: Court

  /// Turns the live court finder on or off. It runs while setting up and is
  /// paused during a recording.
  func setCourtDetection(enabled: Bool, dimensions: CourtDimensions? = nil) {
    sessionQueue.async {
      if let dimensions { self.courtDimensions.set(dimensions) }
      self.courtDetectionEnabled = enabled
      if enabled {
        self.courtIsManual = false
        if self.manifest == nil { self.installCourtTap() }
      } else {
        self.tapHub.remove(identifier: "court-finder")
      }
    }
  }

  /// The player marked the four corners by hand. Points are fractions of the
  /// frame. Replaces any automatic result until detection is turned on again.
  func setManualCourt(
    corners: [CGPoint],
    completion: @escaping (CourtObservation?) -> Void
  ) {
    sessionQueue.async {
      guard corners.count == 4, let gravity = self.currentGravity() else {
        completion(nil)
        return
      }
      let size = self.configuration.outputSize
      let intrinsics = CameraIntrinsics(
        focalRatio: self.focalRatio.get(),
        width: Double(size.width),
        height: Double(size.height)
      )
      let dimensions = self.courtDimensions.get()
      let pixels = corners.map {
        CGPoint(x: $0.x * CGFloat(size.width), y: $0.y * CGFloat(size.height))
      }
      guard
        let solution = ManualCourtSolver.solve(
          corners: pixels,
          intrinsics: intrinsics,
          gravity: gravity,
          dimensions: dimensions
        )
      else {
        completion(nil)
        return
      }
      let features = CourtFeature.allCases.count
      let estimate = CourtEstimate(
        pose: solution.pose,
        cameraHeight: solution.cameraHeight,
        cameraHeightSource: .solved,
        dimensions: dimensions,
        netHeightIdentified: false,
        // A shape that is not court-proportioned was marked carelessly.
        confidence: max(0, min(1, 1 - solution.residual * 4)),
        score: 0,
        visibleFraction: 0,
        featureVisibility: [Double](repeating: 0, count: features),
        featureEvidence: [Double](repeating: 0, count: features)
      )
      let observation = CourtObservation(
        estimate: estimate,
        source: .manual,
        intrinsics: intrinsics,
        gravity: gravity
      )
      self.courtIsManual = true
      self.tapHub.remove(identifier: "court-finder")
      self.publishCourt(observation)
      completion(observation)
    }
  }

  /// Measures the camera's height above the sand with LiDAR, on iPhones
  /// that have it. Takes about a second and briefly restarts the preview,
  /// so it is only allowed before recording. Completes with nil when there
  /// is no LiDAR or the sand in front of the tripod is out of its range.
  func measureCameraHeight(completion: @escaping (Double?) -> Void) {
    sessionQueue.async { self.beginHeightMeasurement(completion) }
  }

  func addTap(_ tap: CaptureFrameTap) {
    tapHub.add(tap)
  }

  func removeTap(identifier: String) {
    tapHub.remove(identifier: identifier)
  }

  // MARK: - Session setup (sessionQueue)

  private func configureSession(_ next: CaptureConfiguration) throws {
    guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
      throw CaptureEngineError.cameraNotAuthorized
    }
    let wantsAudio =
      next.audioEnabled
      && AVCaptureDevice.authorizationStatus(for: .audio) == .authorized
    let needsRebuild =
      !configured
      || wantsAudio != hasAudioInput
      || next.width != configuration.width
      || next.height != configuration.height
      || next.framesPerSecond != configuration.framesPerSecond
    configuration = next
    guard needsRebuild else {
      applyRotation(desiredRotation())
      return
    }

    session.beginConfiguration()
    defer { session.commitConfiguration() }
    session.inputs.forEach { session.removeInput($0) }
    session.outputs.forEach { session.removeOutput($0) }
    configured = false
    hasAudioInput = false

    guard
      let device = AVCaptureDevice.default(
        .builtInWideAngleCamera,
        for: .video,
        position: .back
      )
    else { throw CaptureEngineError.cameraUnavailable }
    let videoInput: AVCaptureDeviceInput
    do {
      videoInput = try AVCaptureDeviceInput(device: device)
    } catch {
      throw CaptureEngineError.configuration(error.localizedDescription)
    }
    guard session.canAddInput(videoInput) else {
      throw CaptureEngineError.configuration("the camera input was rejected")
    }
    session.addInput(videoInput)
    try selectFormat(on: device)

    if wantsAudio,
      let microphone = AVCaptureDevice.default(for: .audio),
      let audioInput = try? AVCaptureDeviceInput(device: microphone),
      session.canAddInput(audioInput)
    {
      session.addInput(audioInput)
      hasAudioInput = true
    }

    videoOutput.videoSettings = [
      kCVPixelBufferPixelFormatTypeKey as String:
        kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
    ]
    // If the encoder ever falls behind, miss a frame rather than build a
    // backlog that ends in memory pressure.
    videoOutput.alwaysDiscardsLateVideoFrames = true
    videoOutput.setSampleBufferDelegate(self, queue: outputQueue)
    guard session.canAddOutput(videoOutput) else {
      throw CaptureEngineError.configuration("the video output was rejected")
    }
    session.addOutput(videoOutput)

    if hasAudioInput {
      audioOutput.setSampleBufferDelegate(self, queue: outputQueue)
      if session.canAddOutput(audioOutput) {
        session.addOutput(audioOutput)
      } else {
        hasAudioInput = false
      }
    }

    videoDevice = device
    configured = true
    focalRatio.set(
      CameraIntrinsics.fromFieldOfView(
        degrees: Double(device.activeFormat.videoFieldOfView),
        width: Double(configuration.width),
        height: Double(configuration.height)
      ).focalRatio
    )
    configureVideoConnection()
  }

  /// Connection settings are lost whenever the session's inputs change, so
  /// this is run again after any such change.
  private func configureVideoConnection() {
    if let connection = videoOutput.connection(with: .video) {
      if connection.isVideoStabilizationSupported {
        // The phone is on a tripod. Stabilisation would crop the court and
        // move it under any calibration.
        connection.preferredVideoStabilizationMode = .off
      }
      if connection.isCameraIntrinsicMatrixDeliverySupported {
        // Each frame then carries the lens model the court finder needs.
        connection.isCameraIntrinsicMatrixDeliveryEnabled = true
      }
    }
    appliedRotation = nil
    applyRotation(desiredRotation())
  }

  private func selectFormat(on device: AVCaptureDevice) throws {
    let framesPerSecond = Double(configuration.framesPerSecond)
    let candidates = device.formats.filter { format in
      let size = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
      guard
        Int(size.width) == configuration.width,
        Int(size.height) == configuration.height
      else { return false }
      return format.videoSupportedFrameRateRanges.contains {
        $0.minFrameRate <= framesPerSecond && framesPerSecond <= $0.maxFrameRate
      }
    }
    // Prefer the plain 8-bit format with the lowest top speed: high-speed
    // formats give up image quality the analysis needs.
    func rank(_ format: AVCaptureDevice.Format) -> (Int, Double) {
      let subtype = CMFormatDescriptionGetMediaSubType(format.formatDescription)
      let preferred = subtype == kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
      let topSpeed = format.videoSupportedFrameRateRanges
        .map(\.maxFrameRate).max() ?? 0
      return (preferred ? 0 : 1, topSpeed)
    }
    guard let format = candidates.min(by: { rank($0) < rank($1) }) else {
      throw CaptureEngineError.configuration(
        "this camera has no \(configuration.width)x\(configuration.height) mode at \(configuration.framesPerSecond) frames per second"
      )
    }
    do {
      try device.lockForConfiguration()
    } catch {
      throw CaptureEngineError.configuration(error.localizedDescription)
    }
    device.activeFormat = format
    let frame = CMTime(value: 1, timescale: CMTimeScale(configuration.framesPerSecond))
    device.activeVideoMinFrameDuration = frame
    device.activeVideoMaxFrameDuration = frame
    if device.isFocusModeSupported(.continuousAutoFocus) {
      device.focusMode = .continuousAutoFocus
    }
    if device.isExposureModeSupported(.continuousAutoExposure) {
      device.exposureMode = .continuousAutoExposure
    }
    device.unlockForConfiguration()
  }

  private func applyFrameRate(_ framesPerSecond: Int) {
    guard let device = videoDevice, framesPerSecond > 0 else { return }
    let supported = device.activeFormat.videoSupportedFrameRateRanges.contains {
      $0.minFrameRate <= Double(framesPerSecond)
        && Double(framesPerSecond) <= $0.maxFrameRate
    }
    guard supported, (try? device.lockForConfiguration()) != nil else { return }
    let frame = CMTime(value: 1, timescale: CMTimeScale(framesPerSecond))
    device.activeVideoMinFrameDuration = frame
    device.activeVideoMaxFrameDuration = frame
    device.unlockForConfiguration()
  }

  private func resolvedCodec() -> CaptureCodec {
    guard configuration.codec == .hevc else { return .h264 }
    let available = videoOutput.availableVideoCodecTypesForAssetWriter(
      writingTo: .mov
    )
    return available.contains(.hevc) ? .hevc : .h264
  }

  private func recommendedVideoSettings(for codec: CaptureCodec) -> [String: Any]? {
    let type: AVVideoCodecType = codec == .hevc ? .hevc : .h264
    return videoOutput.recommendedVideoSettings(
      forVideoCodecType: type,
      assetWriterOutputFileType: .mov
    )
  }

  private func recommendedAudioSettings() -> [String: Any] {
    return audioOutput.recommendedAudioSettingsForAssetWriter(writingTo: .mov)
      ?? MasterWriter.fallbackAudioSettings()
  }

  // MARK: - Rotation (sessionQueue)

  /// Upright for the way the phone is held, as long as that agrees with the
  /// orientation the player chose; otherwise the default for their choice.
  private func desiredRotation() -> CGFloat {
    if let lockedRotation { return lockedRotation }
    let snapshot = conditions.snapshot
    if let held = snapshot.rotationAngle,
      snapshot.deviceOrientation == configuration.orientation.rawValue
    {
      return held
    }
    return configuration.orientation == .portrait ? 90 : 0
  }

  private func applyRotation(_ angle: CGFloat) {
    guard configured, appliedRotation != angle else { return }
    guard let connection = videoOutput.connection(with: .video) else { return }
    guard connection.isVideoRotationAngleSupported(angle) else { return }
    connection.videoRotationAngle = angle
    appliedRotation = angle
    appliedRotationAngle.set(Int(angle))
    DispatchQueue.main.async {
      self.delegate?.captureEngine(self, didChangeRotation: angle)
    }
  }

  // MARK: - Court (sessionQueue)

  private func startMotion() {
    guard motion.isDeviceMotionAvailable, !motion.isDeviceMotionActive else { return }
    motion.deviceMotionUpdateInterval = 0.1
    motion.startDeviceMotionUpdates()
  }

  /// Gravity in the coordinates of the upright camera frame. Safe to call
  /// from any queue.
  private func currentGravity(rotationAngle: Int? = nil) -> SIMD3<Double>? {
    guard let gravity = motion.deviceMotion?.gravity else { return nil }
    return DeviceGravity.inCameraFrame(
      deviceGravity: SIMD3(gravity.x, gravity.y, gravity.z),
      rotationAngle: rotationAngle ?? appliedRotationAngle.get()
    )
  }

  private func installCourtTap() {
    tapHub.add(
      CourtDetectionTap(
        inputs: { [weak self] in
          guard let self, let gravity = self.currentGravity() else { return nil }
          return CourtDetectionTap.Inputs(
            gravity: gravity,
            fallbackFocalRatio: self.focalRatio.get(),
            dimensions: self.courtDimensions.get(),
            measuredCameraHeight: self.measuredCameraHeight.get()
          )
        },
        handler: { [weak self] observation in
          guard let self else { return }
          self.sessionQueue.async {
            guard
              self.courtDetectionEnabled,
              !self.courtIsManual,
              self.manifest == nil
            else { return }
            self.publishCourt(observation)
          }
        }
      )
    )
  }

  private func publishCourt(_ observation: CourtObservation?) {
    guard observation != court else { return }
    court = observation
    DispatchQueue.main.async {
      self.delegate?.captureEngine(self, didUpdateCourt: observation)
    }
  }

  private func beginHeightMeasurement(_ completion: @escaping (Double?) -> Void) {
    guard
      configured, shouldRun, manifest == nil, heightCompletion == nil,
      let lidar = AVCaptureDevice.default(
        .builtInLiDARDepthCamera,
        for: .video,
        position: .back
      ),
      let lidarInput = try? AVCaptureDeviceInput(device: lidar),
      let currentInput = session.inputs
        .compactMap({ $0 as? AVCaptureDeviceInput })
        .first(where: { $0.device.hasMediaType(.video) })
    else {
      completion(nil)
      return
    }
    session.beginConfiguration()
    session.removeInput(currentInput)
    guard session.canAddInput(lidarInput) else {
      session.addInput(currentInput)
      session.commitConfiguration()
      configureVideoConnection()
      completion(nil)
      return
    }
    session.addInput(lidarInput)
    if let format = lidar.formats.last(where: { !$0.supportedDepthDataFormats.isEmpty }),
      let depthFormat = format.supportedDepthDataFormats.last(where: {
        CMFormatDescriptionGetMediaSubType($0.formatDescription)
          == kCVPixelFormatType_DepthFloat32
      }) ?? format.supportedDepthDataFormats.last,
      (try? lidar.lockForConfiguration()) != nil
    {
      lidar.activeFormat = format
      lidar.activeDepthDataFormat = depthFormat
      lidar.unlockForConfiguration()
    }
    guard session.canAddOutput(depthOutput) else {
      session.removeInput(lidarInput)
      session.addInput(currentInput)
      session.commitConfiguration()
      configureVideoConnection()
      completion(nil)
      return
    }
    session.addOutput(depthOutput)
    depthOutput.isFilteringEnabled = true
    depthOutput.setDelegate(self, callbackQueue: depthQueue)
    session.commitConfiguration()
    configureVideoConnection()

    heightSamples = []
    heightCompletion = completion
    lastVideoFrameAt.set(0)
    runStartedAt = ProcessInfo.processInfo.systemUptime
    let timeout = DispatchWorkItem { [weak self] in self?.finishHeightMeasurement() }
    heightTimeout = timeout
    sessionQueue.asyncAfter(deadline: .now() + 2.5, execute: timeout)
  }

  /// Puts the normal camera back and reports the middle of the readings.
  private func finishHeightMeasurement() {
    guard let completion = heightCompletion else { return }
    heightCompletion = nil
    heightTimeout?.cancel()
    heightTimeout = nil

    session.beginConfiguration()
    depthOutput.setDelegate(nil, callbackQueue: nil)
    session.removeOutput(depthOutput)
    for input in session.inputs.compactMap({ $0 as? AVCaptureDeviceInput })
    where input.device.hasMediaType(.video) {
      session.removeInput(input)
    }
    if let device = videoDevice,
      let input = try? AVCaptureDeviceInput(device: device),
      session.canAddInput(input)
    {
      session.addInput(input)
      try? selectFormat(on: device)
    }
    session.commitConfiguration()
    configureVideoConnection()
    lastVideoFrameAt.set(0)
    runStartedAt = ProcessInfo.processInfo.systemUptime

    let readings = heightSamples.sorted()
    heightSamples = []
    guard readings.count >= 3 else {
      completion(nil)
      return
    }
    let height = readings[readings.count / 2]
    measuredCameraHeight.set(height)
    completion(height)
  }

  // MARK: - Recording lifecycle (sessionQueue)

  private func recordingDidStart(at startedAt: Date) {
    guard var manifest, let completion = pendingStart else { return }
    startTimeout?.cancel()
    startTimeout = nil
    pendingStart = nil
    manifest.startedAt = startedAt
    self.manifest = manifest
    try? journal.write(manifest)
    journal.appendHealth(
      id: manifest.id,
      kind: "started",
      detail: [
        "codec": manifest.codec.rawValue,
        "size": "\(manifest.width)x\(manifest.height)",
        "audio": manifest.hasAudio ? "yes" : "no",
      ],
      at: startedAt
    )
    setPhase(interrupted ? .interrupted : .recording)
    completion(.success(manifest))
  }

  private func abortStart(_ error: CaptureEngineError) {
    guard let manifest, let completion = pendingStart else { return }
    startTimeout?.cancel()
    startTimeout = nil
    pendingStart = nil
    self.manifest = nil
    lockedRotation = nil
    outputQueue.async {
      let writer = self.activeWriter
      self.activeWriter = nil
      writer?.cancel()
      self.sessionQueue.async { try? self.journal.remove(id: manifest.id) }
    }
    setPhase(shouldRun ? .preview : .idle, message: error.message)
    if courtDetectionEnabled, !courtIsManual { installCourtTap() }
    completion(.failure(error))
  }

  private func finish(
    reason: RecordingEndReason,
    message: String? = nil,
    completion: FinishCompletion? = nil
  ) {
    guard let manifest else {
      completion?(.failure(.notRecording))
      return
    }
    if let completion { finishWaiters.append(completion) }
    guard !finishing else { return }
    finishing = true
    closeOpenInterruption()
    journal.appendHealth(
      id: manifest.id,
      kind: "finishing",
      detail: ["reason": reason.rawValue]
    )
    setPhase(.finishing, message: message)
    let endedAt = Date()
    outputQueue.async {
      guard let writer = self.activeWriter else {
        self.sessionQueue.async {
          self.completeFinish(
            .failure(.writer("the recorder had already stopped")),
            reason: reason,
            endedAt: endedAt,
            message: message
          )
        }
        return
      }
      self.activeWriter = nil
      writer.finish { result in
        self.sessionQueue.async {
          self.completeFinish(
            result,
            reason: reason,
            endedAt: endedAt,
            message: message
          )
        }
      }
    }
  }

  private func completeFinish(
    _ result: Result<Double, MasterWriter.Failure>,
    reason: RecordingEndReason,
    endedAt: Date,
    message: String?
  ) {
    guard var manifest else { return }
    switch result {
    case .success(let seconds):
      manifest.state = .finalized
      manifest.durationSeconds = seconds
      manifest.bytes = journal.fileSize(of: manifest)
      manifest.endedAt = endedAt
      manifest.endReason = reason
      manifest.droppedFrames = droppedFrames.get()
      try? journal.write(manifest)
      journal.appendHealth(
        id: manifest.id,
        kind: "finalized",
        detail: [
          "seconds": String(format: "%.1f", seconds),
          "dropped": String(manifest.droppedFrames),
        ]
      )
      deliverFinished(
        .success(
          FinalizedRecording(
            manifest: manifest,
            fileURL: journal.movieURL(for: manifest),
            healthLogURL: journal.healthLogURL(for: manifest.id)
          )
        ),
        message: message
      )
    case .failure(.noFrames):
      try? journal.remove(id: manifest.id)
      deliverFinished(
        .failure(.writer(MasterWriter.Failure.noFrames.message)),
        message: MasterWriter.Failure.noFrames.message
      )
    case .failure(let failure):
      // The writer broke, but everything up to the last fragment is on disk.
      // Hand back what is playable instead of nothing.
      let url = journal.movieURL(for: manifest)
      let journal = self.journal
      let dropped = droppedFrames.get()
      Task {
        let seconds = await Self.playableSeconds(of: url)
        self.sessionQueue.async {
          guard var manifest = self.manifest else { return }
          if let seconds, seconds >= 1 {
            manifest.state = .recovered
            manifest.durationSeconds = seconds
            manifest.bytes = journal.fileSize(of: manifest)
            manifest.endedAt = endedAt
            manifest.endReason = .writerFailed
            manifest.droppedFrames = dropped
            try? journal.write(manifest)
            journal.appendHealth(
              id: manifest.id,
              kind: "salvaged",
              detail: ["error": failure.message]
            )
            self.deliverFinished(
              .success(
                FinalizedRecording(
                  manifest: manifest,
                  fileURL: url,
                  healthLogURL: journal.healthLogURL(for: manifest.id)
                )
              ),
              message: "The recorder stopped early. Duna saved the video up to that point."
            )
          } else {
            try? journal.remove(id: manifest.id)
            self.deliverFinished(
              .failure(.writer(failure.message)),
              message: failure.message
            )
          }
        }
      }
    }
  }

  private func deliverFinished(
    _ result: Result<FinalizedRecording, CaptureEngineError>,
    message: String?
  ) {
    manifest = nil
    finishing = false
    lockedRotation = nil
    let waiters = finishWaiters
    finishWaiters = []
    let running = shouldRun && session.isRunning
    setPhase(interrupted ? .interrupted : (running ? .preview : .idle), message: message)
    applyRotation(desiredRotation())
    if courtDetectionEnabled, !courtIsManual { installCourtTap() }
    waiters.forEach { $0(result) }
    if case .success(let recording) = result {
      DispatchQueue.main.async {
        self.delegate?.captureEngine(self, didFinalize: recording)
      }
    }
  }

  private func writerDidFail(_ writer: MasterWriter, reason: String) {
    guard let manifest, !finishing else { return }
    journal.appendHealth(id: manifest.id, kind: "writer-failed", detail: ["error": reason])
    if pendingStart != nil {
      abortStart(.writer("The recording could not start: \(reason)"))
      return
    }
    finishing = true
    closeOpenInterruption()
    setPhase(.finishing)
    completeFinish(
      .failure(.writer(reason)),
      reason: .writerFailed,
      endedAt: Date(),
      message: nil
    )
  }

  private static func playableSeconds(of url: URL) async -> Double? {
    guard FileManager.default.fileExists(atPath: url.path) else { return nil }
    let asset = AVURLAsset(url: url)
    guard
      let playable = try? await asset.load(.isPlayable),
      playable,
      let duration = try? await asset.load(.duration)
    else { return nil }
    let seconds = CMTimeGetSeconds(duration)
    return seconds.isFinite && seconds > 0 ? seconds : nil
  }

  // MARK: - Interruptions and recovery (sessionQueue)

  @objc
  private func sessionWasInterrupted(_ notification: Notification) {
    let raw = (notification.userInfo?[AVCaptureSessionInterruptionReasonKey]
      as? NSNumber)?.intValue
    let reason = raw.flatMap { AVCaptureSession.InterruptionReason(rawValue: $0) }
    sessionQueue.async { self.interruptionBegan(reason) }
  }

  @objc
  private func sessionInterruptionEnded(_ notification: Notification) {
    sessionQueue.async { self.interruptionEnded() }
  }

  @objc
  private func sessionRuntimeError(_ notification: Notification) {
    let error = notification.userInfo?[AVCaptureSessionErrorKey] as? NSError
    sessionQueue.async {
      if let manifest = self.manifest {
        self.journal.appendHealth(
          id: manifest.id,
          kind: "runtime-error",
          detail: ["error": error?.localizedDescription ?? "unknown"]
        )
      }
      guard self.shouldRun, !self.conditions.snapshot.inBackground else { return }
      self.restartSession()
    }
  }

  private func interruptionBegan(_ reason: AVCaptureSession.InterruptionReason?) {
    interrupted = true
    cameraDelivering.set(false)
    let label = Self.label(for: reason)
    if var manifest, !finishing {
      manifest.interruptions.append(
        RecordingInterruption(reason: label, beganAt: Date(), endedAt: nil)
      )
      self.manifest = manifest
      try? journal.write(manifest)
      journal.appendHealth(
        id: manifest.id,
        kind: "interruption-began",
        detail: ["reason": label]
      )
    }
    if phase != .finishing {
      setPhase(.interrupted, message: Self.message(for: reason, recording: manifest != nil))
    }
  }

  private func interruptionEnded() {
    guard interrupted else { return }
    interrupted = false
    closeOpenInterruption()
    lastVideoFrameAt.set(0)
    runStartedAt = ProcessInfo.processInfo.systemUptime
    if phase == .interrupted {
      setPhase(restingPhase())
    }
  }

  private func closeOpenInterruption() {
    guard var manifest,
      let index = manifest.interruptions.lastIndex(where: { $0.endedAt == nil })
    else { return }
    manifest.interruptions[index].endedAt = Date()
    self.manifest = manifest
    try? journal.write(manifest)
    journal.appendHealth(id: manifest.id, kind: "interruption-ended")
  }

  private func restingPhase() -> CapturePhase {
    if finishing { return .finishing }
    if manifest != nil { return pendingStart != nil ? .starting : .recording }
    return shouldRun ? .preview : .idle
  }

  private func restartSession() {
    restartAttempts += 1
    if let manifest {
      journal.appendHealth(
        id: manifest.id,
        kind: "camera-restart",
        detail: ["attempt": String(restartAttempts)]
      )
    }
    cameraDelivering.set(false)
    lastVideoFrameAt.set(0)
    if session.isRunning { session.stopRunning() }
    session.startRunning()
    runStartedAt = ProcessInfo.processInfo.systemUptime
  }

  private func cameraBecameActive() {
    restartAttempts = 0
    if phase == .recovering || phase == .failed {
      setPhase(restingPhase())
    } else {
      publishStatus()
    }
  }

  private func lensObstructionChanged(_ obscured: Bool) {
    guard lensObscured != obscured else { return }
    lensObscured = obscured
    if let manifest {
      journal.appendHealth(
        id: manifest.id,
        kind: obscured ? "lens-obscured" : "lens-clear"
      )
    }
    statusMessage = obscured
      ? "The camera image is dark or covered. Check the lens before continuing."
      : nil
    publishStatus()
  }

  private func handleEnterBackground() {
    dispatchPrecondition(condition: .onQueue(.main))
    // iOS takes the camera in the background. Ask for the few seconds needed
    // to close the file properly.
    var task = UIBackgroundTaskIdentifier.invalid
    let end = {
      DispatchQueue.main.async {
        guard task != .invalid else { return }
        UIApplication.shared.endBackgroundTask(task)
        task = .invalid
      }
    }
    task = UIApplication.shared.beginBackgroundTask(
      withName: "co.duna.capture.finalize",
      expirationHandler: end
    )
    sessionQueue.async {
      guard self.manifest != nil else {
        end()
        return
      }
      if self.pendingStart != nil {
        self.abortStart(.startTimedOut)
        end()
        return
      }
      self.finish(
        reason: .enteredBackground,
        message: "Duna left the screen, so the recording was saved."
      ) { _ in end() }
    }
  }

  // MARK: - Watchdog and conditions (sessionQueue)

  private func startWatchdog() {
    guard watchdog == nil else { return }
    let timer = DispatchSource.makeTimerSource(queue: sessionQueue)
    timer.schedule(deadline: .now() + 1, repeating: 1)
    timer.setEventHandler { [weak self] in self?.watchdogTick() }
    watchdog = timer
    timer.resume()
  }

  private func stopWatchdog() {
    watchdog?.cancel()
    watchdog = nil
    watchdogTicks = 0
  }

  private func watchdogTick() {
    guard shouldRun else { return }
    watchdogTicks += 1
    let snapshot = conditions.snapshot
    let watching =
      !interrupted && !snapshot.inBackground && !finishing
      && (phase == .preview || phase == .starting || phase == .recording
        || phase == .recovering)
    if watching {
      let now = ProcessInfo.processInfo.systemUptime
      let lastFrame = lastVideoFrameAt.get()
      let stalled =
        lastFrame > 0
        ? now - lastFrame > stallSeconds
        : now - runStartedAt > stallSeconds + 1.5
      if stalled {
        if restartAttempts >= maximumRestartAttempts {
          if manifest != nil, pendingStart == nil {
            finish(
              reason: .cameraLost,
              message: "Camera video stopped, so Duna saved the recording."
            )
          } else if phase != .failed {
            setPhase(
              .failed,
              message: "The camera stopped delivering video. Close and reopen the camera."
            )
          }
        } else {
          setPhase(
            .recovering,
            message: "Camera video stopped. Duna is restarting the camera."
          )
          restartSession()
        }
      }
    }
    if watchdogTicks % 5 == 0 {
      evaluateConditions()
    }
  }

  private func conditionsChanged() {
    if lockedRotation == nil {
      applyRotation(desiredRotation())
    }
    evaluateConditions()
  }

  private func evaluateConditions() {
    let snapshot = conditions.snapshot
    let next = CaptureHealthPolicy.directive(
      for: CaptureConditions(
        thermal: snapshot.thermal,
        batteryPercent: snapshot.batteryPercent,
        batteryCharging: snapshot.batteryCharging,
        freeBytes: manifest != nil ? journal.freeBytes() : nil
      ),
      configuration: configuration
    )
    if next != directive {
      if next.framesPerSecond != directive.framesPerSecond {
        applyFrameRate(next.framesPerSecond)
      }
      nonEssentialTapsAllowed.set(next.nonEssentialTapsAllowed)
      if let manifest, next.warnings != directive.warnings {
        journal.appendHealth(
          id: manifest.id,
          kind: "conditions",
          detail: [
            "thermal": snapshot.thermal.label,
            "battery": String(snapshot.batteryPercent),
            "fps": String(next.framesPerSecond),
            "warnings": next.warnings.map(\.rawValue).joined(separator: ","),
          ]
        )
      }
      directive = next
    }
    if next.shouldFinalizeRecording, manifest != nil, pendingStart == nil, !finishing {
      finish(
        reason: .storageFull,
        message: CaptureHealthPolicy.message(
          for: .storageFull,
          batteryPercent: snapshot.batteryPercent
        )
      )
      return
    }
    publishStatus()
  }

  // MARK: - Status (sessionQueue)

  private func setPhase(_ next: CapturePhase, message: String? = nil) {
    phase = next
    statusMessage = message
    publishStatus()
  }

  private func publishStatus() {
    let snapshot = conditions.snapshot
    let warningMessage = directive.warnings.first.map {
      CaptureHealthPolicy.message(for: $0, batteryPercent: snapshot.batteryPercent)
    }
    let status = CaptureStatus(
      phase: phase,
      cameraActive: cameraDelivering.get(),
      lensObscured: lensObscured,
      recordingId: manifest?.id,
      startedAt: manifest?.startedAt,
      thermal: snapshot.thermal,
      batteryPercent: snapshot.batteryPercent,
      batteryCharging: snapshot.batteryCharging,
      framesPerSecond: directive.framesPerSecond,
      droppedFrames: droppedFrames.get(),
      deviceOrientation: snapshot.deviceOrientation,
      orientationMatches: snapshot.deviceOrientation == "unknown"
        || snapshot.deviceOrientation == configuration.orientation.rawValue,
      warnings: directive.warnings,
      message: statusMessage ?? warningMessage
    )
    guard status != lastStatus else { return }
    lastStatus = status
    DispatchQueue.main.async {
      self.delegate?.captureEngine(self, didUpdate: status)
    }
  }

  // MARK: - Copy

  private static func label(for reason: AVCaptureSession.InterruptionReason?) -> String {
    switch reason {
    case .videoDeviceNotAvailableInBackground: return "app-in-background"
    case .audioDeviceInUseByAnotherClient: return "audio-in-use"
    case .videoDeviceInUseByAnotherClient: return "camera-in-use"
    case .videoDeviceNotAvailableWithMultipleForegroundApps: return "multiple-apps"
    case .videoDeviceNotAvailableDueToSystemPressure: return "system-pressure"
    default: return "unknown"
    }
  }

  private static func message(
    for reason: AVCaptureSession.InterruptionReason?,
    recording: Bool
  ) -> String {
    let tail = recording
      ? " Recording continues when it returns."
      : " The camera returns when it is free."
    switch reason {
    case .audioDeviceInUseByAnotherClient:
      return "A call or another app is using the microphone." + tail
    case .videoDeviceInUseByAnotherClient:
      return "Another app is using the camera." + tail
    case .videoDeviceNotAvailableDueToSystemPressure:
      return "The iPhone paused the camera to cool down." + tail
    default:
      return "The camera was interrupted." + tail
    }
  }
}

// MARK: - Frames (outputQueue)

extension CaptureEngine: AVCaptureVideoDataOutputSampleBufferDelegate,
  AVCaptureAudioDataOutputSampleBufferDelegate
{
  func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    guard output === videoOutput else {
      activeWriter?.appendAudio(sampleBuffer)
      return
    }

    lastVideoFrameAt.set(ProcessInfo.processInfo.systemUptime)
    let wasDelivering = cameraDelivering.mutate { delivering -> Bool in
      let previous = delivering
      delivering = true
      return previous
    }
    if !wasDelivering {
      sessionQueue.async { self.cameraBecameActive() }
    }

    if let writer = activeWriter {
      switch writer.appendVideo(sampleBuffer) {
      case .started:
        let startedAt = wallClock(
          for: CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        )
        sessionQueue.async { self.recordingDidStart(at: startedAt) }
      case .appended:
        break
      case .skipped:
        droppedFrames.mutate { $0 += 1 }
      case .failed:
        let reason = writer.failureDescription ?? "unknown writer error"
        activeWriter = nil
        sessionQueue.async { self.writerDidFail(writer, reason: reason) }
      }
    }

    tapHub.deliver(
      sampleBuffer,
      allowNonEssential: nonEssentialTapsAllowed.get()
    )
  }

  func captureOutput(
    _ output: AVCaptureOutput,
    didDrop sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    guard output === videoOutput, activeWriter != nil else { return }
    droppedFrames.mutate { $0 += 1 }
  }

  /// When the frame was actually captured, on the wall clock. This is the
  /// recording's zero for score events and heart-rate samples.
  private func wallClock(for presentationTime: CMTime) -> Date {
    let clock = session.synchronizationClock ?? CMClockGetHostTimeClock()
    let age = CMTimeGetSeconds(
      CMTimeSubtract(CMClockGetTime(clock), presentationTime)
    )
    let bounded = age.isFinite ? min(max(age, 0), 5) : 0
    return Date().addingTimeInterval(-bounded)
  }
}
// MARK: - LiDAR depth (depthQueue)

extension CaptureEngine: AVCaptureDepthDataOutputDelegate {
  func depthDataOutput(
    _ output: AVCaptureDepthDataOutput,
    didOutput depthData: AVDepthData,
    timestamp: CMTime,
    connection: AVCaptureConnection
  ) {
    let converted = depthData.converting(
      toDepthDataType: kCVPixelFormatType_DepthFloat32
    )
    let map = converted.depthDataMap
    let width = CVPixelBufferGetWidth(map)
    let height = CVPixelBufferGetHeight(map)
    guard width > 0, height > 0 else { return }
    CVPixelBufferLockBaseAddress(map, .readOnly)
    var depths = [Float](repeating: .nan, count: width * height)
    if let base = CVPixelBufferGetBaseAddress(map) {
      let rowBytes = CVPixelBufferGetBytesPerRow(map)
      for row in 0..<height {
        let source = (base + row * rowBytes).assumingMemoryBound(to: Float32.self)
        for column in 0..<width {
          depths[row * width + column] = source[column]
        }
      }
    }
    CVPixelBufferUnlockBaseAddress(map, .readOnly)

    let intrinsics: CameraIntrinsics
    if let calibration = converted.cameraCalibrationData {
      let matrix = calibration.intrinsicMatrix
      let reference = calibration.intrinsicMatrixReferenceDimensions
      intrinsics = CameraIntrinsics(
        fx: Double(matrix.columns.0.x),
        fy: Double(matrix.columns.1.y),
        cx: Double(matrix.columns.2.x),
        cy: Double(matrix.columns.2.y),
        width: Double(reference.width),
        height: Double(reference.height)
      ).scaled(toWidth: Double(width), height: Double(height))
    } else {
      intrinsics = CameraIntrinsics(
        focalRatio: focalRatio.get(),
        width: Double(width),
        height: Double(height)
      )
    }
    // Depth frames arrive in the sensor's own orientation, not rotated.
    guard
      let gravity = currentGravity(rotationAngle: 0),
      let result = GroundHeightEstimator.estimate(
        depths: depths,
        width: width,
        height: height,
        intrinsics: intrinsics,
        gravity: gravity
      ),
      result.support >= 0.3
    else { return }
    sessionQueue.async {
      guard self.heightCompletion != nil else { return }
      self.heightSamples.append(result.cameraHeight)
      if self.heightSamples.count >= 9 {
        self.finishHeightMeasurement()
      }
    }
  }
}
#endif
