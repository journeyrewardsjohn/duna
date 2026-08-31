import AVFoundation
import CoreImage
import ARKit
import CoreMotion
import ExpoModulesCore
import HaishinKit
import PhotosUI
import SceneKit
import SRTHaishinKit
import UIKit
import UniformTypeIdentifiers
import Vision

private struct DunaProgramState: Codable {
  let teamA: String
  let teamB: String
  let scoreA: Int
  let scoreB: Int
  let setLabel: String
  let scoreboardVisible: Bool
  let sponsorHeadline: String?
  let sponsorBody: String?
  let sponsorVisible: Bool
}

private final class DunaVideoCaptureController: NSObject {
  static let shared = DunaVideoCaptureController()

  private var rtmpConnection: RTMPConnection?
  private var srtConnection: SRTConnection?
  private(set) var stream: IOStream
  private var activeTransport = "rtmps"
  private var fallbackRtmpsUrl: String?
  private var fallbackRtmpsKey: String?
  private var fallingBack = false
  private var srtWasLive = false
  private let scoreboardScreenObject = ImageScreenObject()
  private let sponsorScreenObject = ImageScreenObject()
  private let replayBadgeScreenObject = ImageScreenObject()
  private var replayScreenObject: AssetScreenObject?
  private var activeReplayUrls: [URL] = []
  private var replayRemovalWorkItem: DispatchWorkItem?
  private var replayRotationWorkItem: DispatchWorkItem?
  private var lastReplayBufferUrl: URL?
  private var programState = DunaProgramState(
    teamA: "Team A",
    teamB: "Team B",
    scoreA: 0,
    scoreB: 0,
    setLabel: "SET 1",
    scoreboardVisible: true,
    sponsorHeadline: nil,
    sponsorBody: nil,
    sponsorVisible: false
  )
  private var replayRecorder: IOStreamRecorder?
  private weak var replayRecorderStream: IOStream?
  private var replayBufferStartedAt: CFAbsoluteTime?
  private var pendingReplayDuration: Int?
  private var discardReplayBuffer = false
  private var restartReplayAfterStreamReplacement = false
  private let motionManager = CMMotionManager()
  let arSession = ARSession()
  private let visionQueue = DispatchQueue(
    label: "co.duna.video.vision",
    qos: .userInitiated
  )
  // Vision requests are much slower than 30/60 fps camera delivery. Queueing
  // every frame retains buffers faster than they can be released and can
  // exhaust memory during a recording. Keep one current frame at most.
  private let visionScheduleLock = NSLock()
  private var visionWorkInFlight = false
  private var lastVisionScheduledAt = CFAbsoluteTimeGetCurrent()
  private let previewContext = CIContext(options: [.useSoftwareRenderer: false])

  weak var activeView: DunaVideoCaptureView?
  private var camera: AVCaptureDevice?
  private var prepared = false
  var audioEnabled = true
  private var pendingStreamKey: String?
  private var lastPreviewAt = CFAbsoluteTimeGetCurrent()
  private var lastARAt = CFAbsoluteTimeGetCurrent()
  private var recorder: IOStreamRecorder?
  private var recordingPromise: Promise?
  private var recorderWasInterrupted = false
  private var latestGuidance: [String: Any]?
  private var usesGroundTracking = false
  private var lidarAvailable = false
  private var latestGroundCorners: [CGPoint]?
  private var latestGroundCourtHypotheses: [[CGPoint]] = []
  private var latestCameraHeight: Double?
  private var latestHorizonY = 0.16
  private var latestTrackingState = "initializing"
  private var smoothedScore: Double?
  private var pendingSuggestion: String?
  private var pendingSuggestionSince = CFAbsoluteTimeGetCurrent()
  private var stableSuggestion: String?
  private var lockedCaptureOrientation: AVCaptureVideoOrientation?
  private var currentDeviceOrientation = "unknown"
  private var stableCourtCorners: [CGPoint]?
  private var stableNetTopLine: [CGPoint]?
  private var courtEvidenceFrames = 0
  private var netEvidenceFrames = 0
  private var lastCourtEvidenceAt = CFAbsoluteTimeGetCurrent()
  private var lastNetEvidenceAt = CFAbsoluteTimeGetCurrent()
  private var stableCourtProjectionSource = "estimated"

  var courtWidthMeters = 8.0
  var courtLengthMeters = 16.0
  var netHeightMeters = 2.43
  var preferredOrientation = "landscape" {
    didSet {
      stream.screen.size = programOutputSize()
      renderProgramState()
    }
  }

  private override init() {
    let connection = RTMPConnection()
    rtmpConnection = connection
    stream = RTMPStream(connection: connection)
    super.init()
    configureStream(stream)
    arSession.delegate = self
    observeRTMPConnection(connection)
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleOrientationChange),
      name: UIDevice.orientationDidChangeNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleApplicationWillResignActive),
      name: UIApplication.willResignActiveNotification,
      object: nil
    )
    UIDevice.current.beginGeneratingDeviceOrientationNotifications()
  }

  deinit {
    if let rtmpConnection {
      stopObservingRTMPConnection(rtmpConnection)
    }
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

  private func observeRTMPConnection(_ connection: RTMPConnection) {
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
  }

  private func stopObservingRTMPConnection(_ connection: RTMPConnection) {
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
  }

  private func programOutputSize() -> CGSize {
    preferredOrientation == "portrait"
      ? CGSize(width: 720, height: 1280)
      : CGSize(width: 1280, height: 720)
  }

  private func configureStream(_ target: IOStream) {
    target.delegate = self
    target.frameRate = 30
    target.videoSettings.bitRate = 5_000_000
    target.audioSettings.bitRate = 128_000
    target.bitrateStrategy = IOStreamVideoAdaptiveBitRateStrategy(
      mamimumVideoBitrate: 5_000_000
    )
    target.videoMixerSettings.mode = .offscreen
    target.screen.size = programOutputSize()
    target.screen.backgroundColor = UIColor.black.cgColor
    try? target.screen.addChild(scoreboardScreenObject)
    try? target.screen.addChild(sponsorScreenObject)
    try? target.screen.addChild(replayBadgeScreenObject)
    target.screen.startRunning()
    renderProgramState()
  }

  private func replaceStream(_ next: IOStream, transport: String) {
    let previous = stream
    previous.screen.removeChild(scoreboardScreenObject)
    previous.screen.removeChild(sponsorScreenObject)
    previous.screen.removeChild(replayBadgeScreenObject)
    if let replayScreenObject {
      previous.screen.removeChild(replayScreenObject)
      replayScreenObject.cancelReading()
      self.replayScreenObject = nil
    }
    replayRemovalWorkItem?.cancel()
    replayRemovalWorkItem = nil
    for url in activeReplayUrls {
      try? FileManager.default.removeItem(at: url)
    }
    activeReplayUrls = []
    previous.attachCamera(nil)
    previous.attachAudio(nil)
    previous.screen.stopRunning()
    stream = next
    activeTransport = transport
    configureStream(next)
    activeView?.preview.attachStream(next)
    if prepared && !usesGroundTracking {
      attachCaptureDevices(audioEnabled: audioEnabled)
    }
  }

  private func makeRTMPStream() -> RTMPStream {
    if let current = rtmpConnection {
      stopObservingRTMPConnection(current)
      current.close()
    }
    let connection = RTMPConnection()
    rtmpConnection = connection
    observeRTMPConnection(connection)
    return RTMPStream(connection: connection)
  }

  private func makeSRTStream() -> SRTStream {
    let connection = SRTConnection()
    srtConnection = connection
    return SRTStream(connection: connection)
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
    latestGroundCourtHypotheses = []
    latestCameraHeight = nil
    smoothedScore = nil
    stableSuggestion = nil
    pendingSuggestion = nil
    stableCourtCorners = nil
    stableNetTopLine = nil
    courtEvidenceFrames = 0
    netEvidenceFrames = 0
    stableCourtProjectionSource = "estimated"
    showGroundPreview(false)
    motionManager.stopDeviceMotionUpdates()
    prepared = false
    camera = nil
  }

  func startStream(
    url: String,
    key: String,
    audioEnabled: Bool,
    transport: String,
    srtPassphrase: String?,
    fallbackUrl: String?,
    fallbackKey: String?
  ) throws {
    try prepare(audioEnabled: audioEnabled)
    fallbackRtmpsUrl = fallbackUrl
    fallbackRtmpsKey = fallbackKey
    fallingBack = false
    srtWasLive = false
    restartReplayAfterStreamReplacement = false
    if transport == "srt" {
      if let rtmpConnection {
        stopObservingRTMPConnection(rtmpConnection)
        rtmpConnection.close()
        self.rtmpConnection = nil
      }
      replaceStream(makeSRTStream(), transport: "srt")
    } else {
      replaceStream(makeRTMPStream(), transport: "rtmps")
    }
    transitionToCapture(audioEnabled: audioEnabled)
    pendingStreamKey = key
    UIApplication.shared.isIdleTimerDisabled = true
    emitState("connecting")
    if transport == "srt" {
      guard
        let passphrase = srtPassphrase,
        passphrase.count >= 10,
        let srtUrl = srtConnectionUrl(
          baseUrl: url,
          streamId: key,
          passphrase: passphrase
        ),
        let connection = srtConnection,
        let srtStream = stream as? SRTStream
      else {
        throw NSError(
          domain: "DunaVideoCapture",
          code: 4,
          userInfo: [NSLocalizedDescriptionKey: "The secure SRT session is invalid."]
        )
      }
      Task { [weak self, weak connection, weak srtStream] in
        guard let connection, let srtStream else { return }
        do {
          try await connection.open(srtUrl)
          guard self?.pendingStreamKey == key else { return }
          srtStream.publish()
        } catch {
          DispatchQueue.main.async { [weak self] in
            self?.fallbackToRTMPS(
              reason: "SRT could not connect; Duna switched to RTMPS."
            )
          }
        }
      }
      return
    }
    rtmpConnection?.connect(url)
  }

  func stopStream() {
    discardReplayBuffer = true
    replayRecorder?.stopRunning()
    replayBufferStartedAt = nil
    replayRotationWorkItem?.cancel()
    replayRotationWorkItem = nil
    if let lastReplayBufferUrl {
      try? FileManager.default.removeItem(at: lastReplayBufferUrl)
      self.lastReplayBufferUrl = nil
    }
    replayRemovalWorkItem?.cancel()
    replayRemovalWorkItem = nil
    if let replayScreenObject {
      stream.screen.removeChild(replayScreenObject)
      replayScreenObject.cancelReading()
      self.replayScreenObject = nil
    }
    for url in activeReplayUrls {
      try? FileManager.default.removeItem(at: url)
    }
    activeReplayUrls = []
    pendingStreamKey = nil
    (stream as? RTMPStream)?.close()
    (stream as? SRTStream)?.close()
    rtmpConnection?.close()
    if let srtConnection {
      Task { await srtConnection.close() }
    }
    fallbackRtmpsUrl = nil
    fallbackRtmpsKey = nil
    fallingBack = false
    srtWasLive = false
    restartReplayAfterStreamReplacement = false
    lockedCaptureOrientation = nil
    UIApplication.shared.isIdleTimerDisabled = recorder != nil
    emitState("stopped")
  }

  private func srtConnectionUrl(
    baseUrl: String,
    streamId: String,
    passphrase: String
  ) -> URL? {
    guard var components = URLComponents(string: baseUrl) else { return nil }
    var query = components.queryItems ?? []
    query.removeAll {
      ["streamid", "passphrase", "latency", "oheadbw", "transtype"]
        .contains($0.name.lowercased())
    }
    query.append(contentsOf: [
      URLQueryItem(name: "streamid", value: streamId),
      URLQueryItem(name: "passphrase", value: passphrase),
      URLQueryItem(name: "latency", value: "500"),
      URLQueryItem(name: "oheadbw", value: "25"),
      URLQueryItem(name: "transtype", value: "live")
    ])
    components.queryItems = query
    return components.url
  }

  private func fallbackToRTMPS(reason: String) {
    guard
      !fallingBack,
      pendingStreamKey != nil,
      let fallbackRtmpsUrl,
      let fallbackRtmpsKey
    else {
      emitError("The live stream could not connect. Check your connection.")
      emitState("stopped")
      return
    }
    fallingBack = true
    if let replayRecorder {
      restartReplayAfterStreamReplacement = true
      discardReplayBuffer = true
      replayRotationWorkItem?.cancel()
      replayRotationWorkItem = nil
      replayRecorder.stopRunning()
    }
    if let srtConnection {
      Task { await srtConnection.close() }
    }
    replaceStream(makeRTMPStream(), transport: "rtmps")
    pendingStreamKey = fallbackRtmpsKey
    transitionToCapture(audioEnabled: audioEnabled)
    emitError(reason)
    emitState("connecting")
    rtmpConnection?.connect(fallbackRtmpsUrl)
  }

  func updateProgramState(json: String) throws {
    guard let data = json.data(using: .utf8) else { return }
    programState = try JSONDecoder().decode(DunaProgramState.self, from: data)
    renderProgramState()
  }

  private func drawText(
    _ text: String,
    in rect: CGRect,
    font: UIFont,
    color: UIColor,
    alignment: NSTextAlignment = .left
  ) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = alignment
    paragraph.lineBreakMode = .byTruncatingTail
    (text as NSString).draw(
      in: rect,
      withAttributes: [
        .font: font,
        .foregroundColor: color,
        .paragraphStyle: paragraph
      ]
    )
  }

  private func scoreboardImage() -> CGImage? {
    let size = CGSize(width: 650, height: 112)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = false
    return UIGraphicsImageRenderer(size: size, format: format).image { context in
      let bounds = CGRect(origin: .zero, size: size)
      UIColor(red: 0.025, green: 0.09, blue: 0.14, alpha: 0.94).setFill()
      UIBezierPath(roundedRect: bounds, cornerRadius: 18).fill()
      UIColor(red: 0.15, green: 0.84, blue: 0.79, alpha: 1).setFill()
      UIBezierPath(
        roundedRect: CGRect(x: 0, y: 0, width: 12, height: size.height),
        cornerRadius: 6
      ).fill()
      drawText(
        programState.setLabel.uppercased(),
        in: CGRect(x: 30, y: 13, width: 86, height: 26),
        font: .boldSystemFont(ofSize: 18),
        color: UIColor(red: 0.15, green: 0.84, blue: 0.79, alpha: 1)
      )
      drawText(
        programState.teamA,
        in: CGRect(x: 126, y: 12, width: 405, height: 38),
        font: .boldSystemFont(ofSize: 26),
        color: .white
      )
      drawText(
        programState.teamB,
        in: CGRect(x: 126, y: 63, width: 405, height: 38),
        font: .boldSystemFont(ofSize: 26),
        color: .white
      )
      drawText(
        String(programState.scoreA),
        in: CGRect(x: 548, y: 6, width: 76, height: 48),
        font: .monospacedDigitSystemFont(ofSize: 40, weight: .black),
        color: .white,
        alignment: .right
      )
      drawText(
        String(programState.scoreB),
        in: CGRect(x: 548, y: 57, width: 76, height: 48),
        font: .monospacedDigitSystemFont(ofSize: 40, weight: .black),
        color: .white,
        alignment: .right
      )
      UIColor(white: 1, alpha: 0.18).setStroke()
      context.cgContext.setLineWidth(1)
      context.cgContext.move(to: CGPoint(x: 126, y: 56))
      context.cgContext.addLine(to: CGPoint(x: 624, y: 56))
      context.cgContext.strokePath()
    }.cgImage
  }

  private func sponsorImage() -> CGImage? {
    guard let headline = programState.sponsorHeadline else { return nil }
    let size = CGSize(
      width: preferredOrientation == "portrait" ? 650 : 820,
      height: 118
    )
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = false
    return UIGraphicsImageRenderer(size: size, format: format).image { _ in
      let bounds = CGRect(origin: .zero, size: size)
      UIColor(red: 0.96, green: 0.91, blue: 0.79, alpha: 0.96).setFill()
      UIBezierPath(roundedRect: bounds, cornerRadius: 22).fill()
      drawText(
        "SPONSOR",
        in: CGRect(x: 28, y: 19, width: 112, height: 24),
        font: .boldSystemFont(ofSize: 17),
        color: UIColor(red: 0.05, green: 0.26, blue: 0.3, alpha: 1)
      )
      drawText(
        headline,
        in: CGRect(x: 154, y: 15, width: size.width - 182, height: 39),
        font: .boldSystemFont(ofSize: 30),
        color: UIColor(red: 0.03, green: 0.09, blue: 0.13, alpha: 1)
      )
      if let body = programState.sponsorBody, !body.isEmpty {
        drawText(
          body,
          in: CGRect(x: 154, y: 61, width: size.width - 182, height: 35),
          font: .systemFont(ofSize: 22, weight: .medium),
          color: UIColor(red: 0.17, green: 0.23, blue: 0.26, alpha: 1)
        )
      }
    }.cgImage
  }

  private func replayBadgeImage() -> CGImage? {
    let size = CGSize(width: 182, height: 58)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = false
    return UIGraphicsImageRenderer(size: size, format: format).image { _ in
      UIColor(red: 0.91, green: 0.31, blue: 0.18, alpha: 0.96).setFill()
      UIBezierPath(
        roundedRect: CGRect(origin: .zero, size: size),
        cornerRadius: 16
      ).fill()
      drawText(
        "↶  REPLAY",
        in: CGRect(x: 18, y: 13, width: 146, height: 34),
        font: .boldSystemFont(ofSize: 23),
        color: .white,
        alignment: .center
      )
    }.cgImage
  }

  private func renderProgramState() {
    scoreboardScreenObject.horizontalAlignment = .left
    scoreboardScreenObject.verticalAlignment = .top
    scoreboardScreenObject.layoutMargin = UIEdgeInsets(
      top: 28,
      left: 28,
      bottom: 0,
      right: 0
    )
    scoreboardScreenObject.cgImage = scoreboardImage()
    scoreboardScreenObject.isVisible = programState.scoreboardVisible

    sponsorScreenObject.horizontalAlignment = .center
    sponsorScreenObject.verticalAlignment = .bottom
    sponsorScreenObject.layoutMargin = UIEdgeInsets(
      top: 0,
      left: 0,
      bottom: 34,
      right: 0
    )
    sponsorScreenObject.cgImage = sponsorImage()
    sponsorScreenObject.isVisible =
      programState.sponsorVisible && programState.sponsorHeadline != nil

    replayBadgeScreenObject.horizontalAlignment = .right
    replayBadgeScreenObject.verticalAlignment = .top
    replayBadgeScreenObject.layoutMargin = UIEdgeInsets(
      top: 28,
      left: 0,
      bottom: 0,
      right: 28
    )
    replayBadgeScreenObject.cgImage = replayBadgeImage()
    replayBadgeScreenObject.isVisible = replayScreenObject != nil
  }

  private func startReplayBuffer() {
    guard replayRecorder == nil, pendingStreamKey != nil || recorder != nil else {
      return
    }
    discardReplayBuffer = false
    let next = IOStreamRecorder()
    next.delegate = self
    next.fileName = "duna-replay-\(UUID().uuidString)"
    next.movieFragmentInterval = 10
    stream.addObserver(next)
    replayRecorderStream = stream
    replayRecorder = next
    replayBufferStartedAt = CFAbsoluteTimeGetCurrent()
    restartReplayAfterStreamReplacement = false
    next.startRunning()
    let rotation = DispatchWorkItem { [weak self, weak next] in
      guard
        let self,
        let next,
        self.replayRecorder === next,
        self.pendingReplayDuration == nil
      else {
        return
      }
      next.stopRunning()
    }
    replayRotationWorkItem?.cancel()
    replayRotationWorkItem = rotation
    DispatchQueue.main.asyncAfter(deadline: .now() + 15, execute: rotation)
  }

  func insertReplay(durationSeconds: Int) -> [String: Any] {
    let duration = min(15, max(4, durationSeconds))
    let bufferedSeconds = replayBufferStartedAt.map {
      CFAbsoluteTimeGetCurrent() - $0
    } ?? 0
    guard
      let replayRecorder,
      replayRecorder.isRunning.value,
      lastReplayBufferUrl != nil || bufferedSeconds >= Double(duration)
    else {
      return ["accepted": false, "durationSeconds": 0]
    }
    pendingReplayDuration = duration
    replayRecorder.stopRunning()
    return ["accepted": true, "durationSeconds": duration]
  }

  private func playReplay(sourceUrls: [URL], requestedDuration: Int) {
    if let replayScreenObject {
      stream.screen.removeChild(replayScreenObject)
      replayScreenObject.cancelReading()
      self.replayScreenObject = nil
    }
    replayRemovalWorkItem?.cancel()
    replayRemovalWorkItem = nil
    for url in activeReplayUrls {
      try? FileManager.default.removeItem(at: url)
    }
    activeReplayUrls = []
    let sources: [(track: AVAssetTrack, duration: Double)] = sourceUrls.compactMap {
      url in
      let asset = AVURLAsset(url: url)
      let duration = max(0, CMTimeGetSeconds(asset.duration))
      guard duration.isFinite,
        duration > 0,
        let track = asset.tracks(withMediaType: .video).first
      else {
        return nil
      }
      return (track, duration)
    }
    let totalDuration = sources.reduce(0) { $0 + $1.duration }
    guard totalDuration >= 1 else {
      sourceUrls.forEach { try? FileManager.default.removeItem(at: $0) }
      return
    }
    let replayDuration = min(Double(requestedDuration), totalDuration)
    let composition = AVMutableComposition()
    guard
      let track = composition.addMutableTrack(
        withMediaType: .video,
        preferredTrackID: kCMPersistentTrackID_Invalid
      )
    else {
      sourceUrls.forEach { try? FileManager.default.removeItem(at: $0) }
      return
    }
    do {
      var skipSeconds = max(0, totalDuration - replayDuration)
      var insertedSeconds = 0.0
      var appliedTransform = false
      for source in sources where insertedSeconds < replayDuration {
        if skipSeconds >= source.duration {
          skipSeconds -= source.duration
          continue
        }
        let startSeconds = skipSeconds
        skipSeconds = 0
        let segmentSeconds = min(
          source.duration - startSeconds,
          replayDuration - insertedSeconds
        )
        guard segmentSeconds > 0 else { continue }
        try track.insertTimeRange(
          CMTimeRange(
            start: CMTime(seconds: startSeconds, preferredTimescale: 600),
            duration: CMTime(seconds: segmentSeconds, preferredTimescale: 600)
          ),
          of: source.track,
          at: CMTime(seconds: insertedSeconds, preferredTimescale: 600)
        )
        if !appliedTransform {
          track.preferredTransform = source.track.preferredTransform
          appliedTransform = true
        }
        insertedSeconds += segmentSeconds
      }
      guard insertedSeconds >= 1 else {
        sourceUrls.forEach { try? FileManager.default.removeItem(at: $0) }
        return
      }
      let replay = AssetScreenObject()
      replay.size = programOutputSize()
      replay.videoGravity = .resizeAspectFill
      try replay.startReading(composition)
      stream.screen.removeChild(scoreboardScreenObject)
      stream.screen.removeChild(sponsorScreenObject)
      stream.screen.removeChild(replayBadgeScreenObject)
      try stream.screen.addChild(replay)
      try stream.screen.addChild(scoreboardScreenObject)
      try stream.screen.addChild(sponsorScreenObject)
      try stream.screen.addChild(replayBadgeScreenObject)
      replayScreenObject = replay
      activeReplayUrls = sourceUrls
      renderProgramState()
      let work = DispatchWorkItem { [weak self] in
        guard let self else { return }
        self.stream.screen.removeChild(replay)
        replay.cancelReading()
        if self.replayScreenObject === replay {
          self.replayScreenObject = nil
          self.activeReplayUrls = []
        }
        self.replayBadgeScreenObject.isVisible = false
        sourceUrls.forEach { try? FileManager.default.removeItem(at: $0) }
      }
      replayRemovalWorkItem = work
      DispatchQueue.main.asyncAfter(
        deadline: .now() + insertedSeconds + 0.15,
        execute: work
      )
    } catch {
      sourceUrls.forEach { try? FileManager.default.removeItem(at: $0) }
      emitError("The instant replay could not be inserted.")
    }
  }

  func startRecording(audioEnabled: Bool) throws {
    try prepare(audioEnabled: audioEnabled)
    // A prior broadcast may have left the singleton on a closed RTMP or SRT
    // stream. Local recording needs a fresh mixer even though it does not open
    // a network connection.
    replaceStream(makeRTMPStream(), transport: "rtmps")
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
    recorderWasInterrupted = false
    UIApplication.shared.isIdleTimerDisabled = true
    nextRecorder.startRunning()
    startReplayBuffer()
  }

  func stopRecording(promise: Promise) {
    guard let recorder else {
      promise.reject(
        "ERR_DUNA_RECORDING",
        "No Duna recording is active."
      )
      return
    }
    discardReplayBuffer = true
    replayRotationWorkItem?.cancel()
    replayRotationWorkItem = nil
    if let lastReplayBufferUrl {
      try? FileManager.default.removeItem(at: lastReplayBufferUrl)
      self.lastReplayBufferUrl = nil
    }
    replayRecorder?.stopRunning()
    replayBufferStartedAt = nil
    recorderWasInterrupted = false
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
    latestGroundCorners = nil
    latestGroundCourtHypotheses = []
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
        (stream as? RTMPStream)?.publish(pendingStreamKey)
      }
    case RTMPStream.Code.publishStart.rawValue:
      fallingBack = false
      startReplayBuffer()
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
      guard let self else { return }
      self.activeView?.onStreamState([
        "state": state,
        "transport": self.activeTransport
      ])
    }
  }

  private func emitError(_ message: String) {
    DispatchQueue.main.async { [weak self] in
      self?.activeView?.onCaptureError(["message": message])
    }
  }

  @objc
  private func handleApplicationWillResignActive() {
    // iOS can revoke camera access immediately for a phone call, lock screen,
    // Control Center, or an app switch. Finish the movie while the capture
    // session is still valid instead of allowing the writer to be torn down
    // under an active recorder. The recorder delegate clears all state.
    guard let recorder, recordingPromise == nil else { return }
    discardReplayBuffer = true
    replayRotationWorkItem?.cancel()
    replayRotationWorkItem = nil
    if let lastReplayBufferUrl {
      try? FileManager.default.removeItem(at: lastReplayBufferUrl)
      self.lastReplayBufferUrl = nil
    }
    replayRecorder?.stopRunning()
    replayBufferStartedAt = nil
    recorderWasInterrupted = true
    recorder.stopRunning()
    emitState("stopped")
    emitError(
      "Recording paused because Duna left the foreground. Your saved video is being finalized."
    )
  }

  private func reserveVisionWork() -> Bool {
    visionScheduleLock.lock()
    defer { visionScheduleLock.unlock() }
    let now = CFAbsoluteTimeGetCurrent()
    guard !visionWorkInFlight, now - lastVisionScheduledAt >= 0.45 else {
      return false
    }
    visionWorkInFlight = true
    lastVisionScheduledAt = now
    return true
  }

  private func finishVisionWork() {
    visionScheduleLock.lock()
    visionWorkInFlight = false
    visionScheduleLock.unlock()
  }

  private func scheduleAnalysis(
    _ sampleBuffer: CMSampleBuffer,
    orientation: CGImagePropertyOrientation
  ) {
    guard reserveVisionWork() else { return }
    var copiedBuffer: CMSampleBuffer?
    let copyResult = CMSampleBufferCreateCopy(
      allocator: kCFAllocatorDefault,
      sampleBuffer: sampleBuffer,
      sampleBufferOut: &copiedBuffer
    )
    guard copyResult == noErr, let copiedBuffer else {
      finishVisionWork()
      return
    }
    visionQueue.async { [weak self] in
      guard let self else { return }
      defer { self.finishVisionWork() }
      self.analyze(copiedBuffer, orientation: orientation)
    }
  }

  private func scheduleAnalysis(
    _ pixelBuffer: CVPixelBuffer,
    orientation: CGImagePropertyOrientation
  ) {
    guard reserveVisionWork() else { return }
    visionQueue.async { [weak self] in
      guard let self else { return }
      defer {
        self.finishVisionWork()
      }
      self.analyze(pixelBuffer, orientation: orientation)
    }
  }

  private func analyze(
    _ sampleBuffer: CMSampleBuffer,
    orientation: CGImagePropertyOrientation
  ) {
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
      return
    }
    analyze(pixelBuffer, orientation: orientation)
  }

  private func elongatedLine(
    _ observation: VNRectangleObservation
  ) -> (start: CGPoint, end: CGPoint, length: CGFloat, thickness: CGFloat) {
    let topLeft = CGPoint(x: observation.topLeft.x, y: 1 - observation.topLeft.y)
    let topRight = CGPoint(x: observation.topRight.x, y: 1 - observation.topRight.y)
    let bottomRight = CGPoint(
      x: observation.bottomRight.x,
      y: 1 - observation.bottomRight.y
    )
    let bottomLeft = CGPoint(
      x: observation.bottomLeft.x,
      y: 1 - observation.bottomLeft.y
    )
    func midpoint(_ left: CGPoint, _ right: CGPoint) -> CGPoint {
      CGPoint(x: (left.x + right.x) / 2, y: (left.y + right.y) / 2)
    }
    let horizontalStart = midpoint(topLeft, bottomLeft)
    let horizontalEnd = midpoint(topRight, bottomRight)
    let verticalStart = midpoint(topLeft, topRight)
    let verticalEnd = midpoint(bottomLeft, bottomRight)
    let horizontalLength = hypot(
      horizontalEnd.x - horizontalStart.x,
      horizontalEnd.y - horizontalStart.y
    )
    let verticalLength = hypot(
      verticalEnd.x - verticalStart.x,
      verticalEnd.y - verticalStart.y
    )
    if horizontalLength >= verticalLength {
      return (horizontalStart, horizontalEnd, horizontalLength, verticalLength)
    }
    return (verticalStart, verticalEnd, verticalLength, horizontalLength)
  }

  private func isNetLike(_ observation: VNRectangleObservation) -> Bool {
    let line = elongatedLine(observation)
    let centerY = (line.start.y + line.end.y) / 2
    return line.length >= 0.26 &&
      line.thickness <= 0.18 &&
      line.length >= line.thickness * 2.1 &&
      centerY >= 0.08 && centerY <= 0.9
  }

  private func netObservationScore(
    _ observation: VNRectangleObservation
  ) -> CGFloat {
    let line = elongatedLine(observation)
    let centerY = (line.start.y + line.end.y) / 2
    return line.length * CGFloat(observation.confidence) *
      (1.05 - abs(centerY - 0.5) * 0.28)
  }

  private func analyze(
    _ pixelBuffer: CVPixelBuffer,
    orientation: CGImagePropertyOrientation
  ) {
    let now = CFAbsoluteTimeGetCurrent()
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
      let netCandidate = landmarkRequest.results?
        .filter(isNetLike)
        .max { netObservationScore($0) < netObservationScore($1) }
      let rectangle = rectangleRequest.results?
        .filter {
          let box = $0.boundingBox
          return box.width * box.height >= 0.045 && box.minY < 0.72
        }
        .max {
          let leftBox = $0.boundingBox
          let rightBox = $1.boundingBox
          let leftScore = leftBox.width * leftBox.height *
            CGFloat($0.confidence) * (1.25 - leftBox.midY * 0.35) *
            courtNetCompatibility(court: leftBox, net: netCandidate?.boundingBox)
          let rightScore = rightBox.width * rightBox.height *
            CGFloat($1.confidence) * (1.25 - rightBox.midY * 0.35) *
            courtNetCompatibility(court: rightBox, net: netCandidate?.boundingBox)
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

  private func courtNetCompatibility(court: CGRect, net: CGRect?) -> CGFloat {
    guard let net else { return 0.72 }
    let horizontalOverlap = max(
      0,
      min(court.maxX + 0.08, net.maxX) - max(court.minX - 0.08, net.minX)
    )
    let overlapRatio = horizontalOverlap / max(0.01, net.width)
    let verticalFit = net.midY >= court.minY - 0.12 &&
      net.midY <= court.maxY + 0.22
    if overlapRatio >= 0.72 && verticalFit { return 1.7 }
    if overlapRatio >= 0.4 && verticalFit { return 1.15 }
    return 0.45
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

  private func stabilizedCourtEvidence(
    corners: [CGPoint]?,
    netTopLine: [CGPoint]?
  ) -> (corners: [CGPoint]?, netTopLine: [CGPoint]?) {
    let now = CFAbsoluteTimeGetCurrent()
    func averageDistance(_ left: [CGPoint], _ right: [CGPoint]) -> CGFloat {
      guard left.count == right.count, !left.isEmpty else { return 1 }
      return zip(left, right).reduce(CGFloat.zero) { total, pair in
        total + hypot(pair.0.x - pair.1.x, pair.0.y - pair.1.y)
      } / CGFloat(left.count)
    }
    func smooth(_ previous: [CGPoint], _ next: [CGPoint]) -> [CGPoint] {
      zip(previous, next).map {
        CGPoint(
          x: $0.0.x * 0.68 + $0.1.x * 0.32,
          y: $0.0.y * 0.68 + $0.1.y * 0.32
        )
      }
    }

    if let corners {
      if let previous = stableCourtCorners,
        averageDistance(previous, corners) < 0.09
      {
        stableCourtCorners = smooth(previous, corners)
        courtEvidenceFrames = min(12, courtEvidenceFrames + 1)
      } else {
        stableCourtCorners = corners
        courtEvidenceFrames = 1
      }
      lastCourtEvidenceAt = now
    } else if now - lastCourtEvidenceAt > 1.8 {
      stableCourtCorners = nil
      courtEvidenceFrames = 0
    }

    if let netTopLine {
      if let previous = stableNetTopLine,
        averageDistance(previous, netTopLine) < 0.08
      {
        stableNetTopLine = smooth(previous, netTopLine)
        netEvidenceFrames = min(12, netEvidenceFrames + 1)
      } else {
        stableNetTopLine = netTopLine
        netEvidenceFrames = 1
      }
      lastNetEvidenceAt = now
    } else if now - lastNetEvidenceAt > 1.8 {
      stableNetTopLine = nil
      netEvidenceFrames = 0
    }

    return (
      courtEvidenceFrames >= 3 ? stableCourtCorners : nil,
      netEvidenceFrames >= 2 ? stableNetTopLine : nil
    )
  }

  private func netCourtCompatibility(
    _ net: [CGPoint],
    corners: [CGPoint]
  ) -> Double {
    guard net.count == 2, corners.count == 4 else { return -.infinity }
    func midpoint(_ left: CGPoint, _ right: CGPoint) -> CGPoint {
      CGPoint(x: (left.x + right.x) / 2, y: (left.y + right.y) / 2)
    }
    // Corner order is far-left, far-right, near-right, near-left. A beach
    // volleyball net spans the court width at its longitudinal midpoint.
    let expectedNet = [
      midpoint(corners[0], corners[3]),
      midpoint(corners[1], corners[2])
    ]
    let netDx = net[1].x - net[0].x
    let netDy = net[1].y - net[0].y
    let expectedDx = expectedNet[1].x - expectedNet[0].x
    let expectedDy = expectedNet[1].y - expectedNet[0].y
    let netLength = max(0.001, hypot(netDx, netDy))
    let expectedLength = max(0.001, hypot(expectedDx, expectedDy))
    let parallel = abs(netDx * expectedDx + netDy * expectedDy) /
      (netLength * expectedLength)
    let netCenter = midpoint(net[0], net[1])
    let expectedCenter = midpoint(expectedNet[0], expectedNet[1])
    let centerDistance = hypot(
      netCenter.x - expectedCenter.x,
      netCenter.y - expectedCenter.y
    )
    let scalePenalty = min(
      0.45,
      abs(log(Double(netLength / expectedLength))) * 0.1
    )
    let minX = (corners.map(\.x).min() ?? 0) - 0.22
    let maxX = (corners.map(\.x).max() ?? 1) + 0.22
    let minY = (corners.map(\.y).min() ?? 0) - 0.34
    let maxY = (corners.map(\.y).max() ?? 1) + 0.2
    guard
      netCenter.x >= minX && netCenter.x <= maxX &&
      netCenter.y >= minY && netCenter.y <= maxY
    else {
      return -.infinity
    }
    return Double(parallel) - Double(centerDistance) * 1.35 - scalePenalty
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

    let rawVisionCorners: [CGPoint]? = rectangle.map {
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
      let farWidth = hypot(
        $0.topRight.x - $0.topLeft.x,
        $0.topRight.y - $0.topLeft.y
      )
      let nearWidth = hypot(
        $0.bottomRight.x - $0.bottomLeft.x,
        $0.bottomRight.y - $0.bottomLeft.y
      )
      let perspectiveRatio = max(farWidth, nearWidth) /
        max(0.01, min(farWidth, nearWidth))
      return $0.confidence >= 0.6 &&
        box.width * box.height >= 0.075 &&
        box.width >= 0.28 &&
        aspect >= 0.42 && aspect <= 5.4 &&
        perspectiveRatio <= 4.2 &&
        box.minY < 0.72
    } ?? false
    let groundHypotheses = latestGroundCourtHypotheses.isEmpty
      ? latestGroundCorners.map { [$0] } ?? []
      : latestGroundCourtHypotheses
    let groundDetected = !groundHypotheses.isEmpty || courtCandidate

    let netObservation = landmarks
      .filter(isNetLike)
      .max { netObservationScore($0) < netObservationScore($1) }
    let rawNetTopLine: [CGPoint]? = netObservation.map {
      let line = elongatedLine($0)
      return [line.start, line.end]
    }

    // Score a physically projected 16×8m court and a Vision-only rectangle
    // against the same observed net. LiDAR gets a small tie-break because it
    // supplies real ground scale; it never bypasses the requirement for court
    // evidence in the image. Multiple ground hypotheses cover baseline,
    // sideline, and oblique camera placements.
    var selectedCorners: [CGPoint]?
    var selectedSource: String?
    var selectedCompatibility = -Double.infinity
    var alignmentCorners = latestGroundCorners
    if let rawNetTopLine {
      if let bestGround = groundHypotheses.max(by: {
        netCourtCompatibility(rawNetTopLine, corners: $0) <
          netCourtCompatibility(rawNetTopLine, corners: $1)
      }) {
        alignmentCorners = bestGround
      }
      if courtCandidate, let rawVisionCorners {
        let compatibility = netCourtCompatibility(
          rawNetTopLine,
          corners: rawVisionCorners
        )
        if compatibility >= 0.18 {
          selectedCorners = rawVisionCorners
          selectedSource = "vision"
          selectedCompatibility = compatibility
        }
      }
      for groundCorners in groundHypotheses {
        let compatibility = netCourtCompatibility(
          rawNetTopLine,
          corners: groundCorners
        )
        let minimumCompatibility = lidarAvailable ? 0.1 : 0.15
        let spatialTieBreak = lidarAvailable ? 0.07 : 0.03
        if compatibility >= minimumCompatibility &&
          compatibility + spatialTieBreak > selectedCompatibility
        {
          selectedCorners = groundCorners
          selectedSource = lidarAvailable ? "lidar" : "arkit"
          selectedCompatibility = compatibility + spatialTieBreak
        }
      }
    }
    let pairedNetTopLine = selectedCorners == nil ? nil : rawNetTopLine
    if let selectedSource {
      stableCourtProjectionSource = selectedSource
    }
    let evidence = stabilizedCourtEvidence(
      corners: selectedCorners,
      netTopLine: pairedNetTopLine
    )
    let visionCorners = evidence.corners
    let netTopLine = evidence.netTopLine ?? pairedNetTopLine
    let netDetected = rawNetTopLine != nil || evidence.netTopLine != nil
    let courtDetected = visionCorners != nil && evidence.netTopLine != nil
    let projectedCorners: [CGPoint]? = courtDetected ? visionCorners : nil

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
    } else if !courtDetected && rawNetTopLine != nil {
      score -= 12
      warnings.append(
        "Net found—pan slowly until the faint NET guide sits on the real net"
      )
    } else if !courtDetected && !netDetected {
      score -= 30
      warnings.append(
        "Aim at the net and include both sidelines"
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
    let confidence: Double
    if courtDetected {
      switch stableCourtProjectionSource {
      case "lidar": confidence = 0.9
      case "arkit": confidence = 0.84
      default: confidence = 0.78
      }
    } else if netDetected {
      confidence = 0.42
    } else if groundDetected {
      confidence = 0.22
    } else {
      confidence = 0.18
    }
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
      "projectionSource": courtDetected
        ? stableCourtProjectionSource
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
      "modelVersion": "court-v4-spatial-2026-08-30",
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
    if let alignmentCorners {
      payload["alignmentCorners"] = alignmentCorners.map(pointPayload)
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
        let courtLength = Float(courtLengthMeters)
        let courtWidth = Float(courtWidthMeters)
        let hypothesisAngles: [Float] = [-70, -45, -25, 0, 25, 45, 70, 90]
        let worldHypotheses = hypothesisAngles.map { degrees -> [SIMD3<Float>] in
          let radians = degrees * .pi / 180
          let lengthAxis = simd_normalize(
            forward * cos(radians) + right * sin(radians)
          )
          let widthAxis = simd_normalize(
            right * cos(radians) - forward * sin(radians)
          )
          let depthFromCamera =
            abs(simd_dot(lengthAxis, forward)) * courtLength / 2 +
            abs(simd_dot(widthAxis, forward)) * courtWidth / 2
          var center = cameraPosition + forward * (nearDistance + depthFromCamera)
          center.y = groundY
          let halfLength = courtLength / 2
          let halfWidth = courtWidth / 2
          return [
            center + lengthAxis * halfLength - widthAxis * halfWidth,
            center + lengthAxis * halfLength + widthAxis * halfWidth,
            center - lengthAxis * halfLength + widthAxis * halfWidth,
            center - lengthAxis * halfLength - widthAxis * halfWidth
          ]
        }
        DispatchQueue.main.async { [weak self, weak view] in
          guard
            let self,
            let view,
            view.bounds.width > 0,
            view.bounds.height > 0
          else {
            return
          }
          func project(_ worldCorners: [SIMD3<Float>]) -> [CGPoint]? {
            let projected = worldCorners.map { point -> CGPoint in
              let screen = view.arPreview.projectPoint(
                SCNVector3(point.x, point.y, point.z)
              )
              return CGPoint(
                x: CGFloat(screen.x) / view.bounds.width,
                y: CGFloat(screen.y) / view.bounds.height
              )
            }
            guard projected.allSatisfy({ point in
              point.x.isFinite && point.y.isFinite &&
                point.x >= -3 && point.x <= 4 &&
                point.y >= -3 && point.y <= 4
            }) else {
              return nil
            }
            return projected
          }
          let projectedHypotheses = worldHypotheses.compactMap(project)
          let projectedBaseline = worldHypotheses.indices.contains(3)
            ? project(worldHypotheses[3])
            : nil
          if !projectedHypotheses.isEmpty {
            if self.latestGroundCourtHypotheses.count == projectedHypotheses.count {
              self.latestGroundCourtHypotheses = zip(
                self.latestGroundCourtHypotheses,
                projectedHypotheses
              ).map { previous, next in
                zip(previous, next).map {
                  CGPoint(
                    x: $0.0.x * 0.72 + $0.1.x * 0.28,
                    y: $0.0.y * 0.72 + $0.1.y * 0.28
                  )
                }
              }
            } else {
              self.latestGroundCourtHypotheses = projectedHypotheses
            }
            let baseline = projectedBaseline ??
              self.latestGroundCourtHypotheses[
                min(3, self.latestGroundCourtHypotheses.count - 1)
              ]
            if let previous = self.latestGroundCorners,
              previous.count == baseline.count
            {
              self.latestGroundCorners = zip(previous, baseline).map {
                CGPoint(
                  x: $0.0.x * 0.72 + $0.1.x * 0.28,
                  y: $0.0.y * 0.72 + $0.1.y * 0.28
                )
              }
            } else {
              self.latestGroundCorners = baseline
            }
            self.latestCameraHeight = Double(cameraHeight)
            let pitch = Double(frame.camera.eulerAngles.x)
            self.latestHorizonY = max(0.08, min(0.42, 0.5 + pitch * 0.55))
          }
        }
      }
    } else {
      latestGroundCorners = nil
      latestGroundCourtHypotheses = []
      latestCameraHeight = nil
    }

    let pixelBuffer = frame.capturedImage
    let orientation = visionOrientation()
    scheduleAnalysis(pixelBuffer, orientation: orientation)
  }

  func session(_ session: ARSession, didFailWithError error: Error) {
    guard usesGroundTracking else { return }
    usesGroundTracking = false
    latestTrackingState = "unavailable"
    latestGroundCorners = nil
    latestGroundCourtHypotheses = []
    latestCameraHeight = nil
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
    scheduleAnalysis(buffer, orientation: visionOrientation())
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
  ) {
    guard stream === self.stream, activeTransport == "srt" else { return }
    let becameLive: Bool
    let becameOpen: Bool
    switch state {
    case .publishing:
      becameLive = true
      becameOpen = false
    case .open:
      becameLive = false
      becameOpen = true
    default:
      becameLive = false
      becameOpen = false
    }
    DispatchQueue.main.async { [weak self, weak stream] in
      guard let self, let stream, stream === self.stream else { return }
      if becameLive {
        self.srtWasLive = true
        self.fallingBack = false
        self.startReplayBuffer()
        self.emitState("live")
      } else if becameOpen && self.srtWasLive && self.pendingStreamKey != nil {
        self.fallbackToRTMPS(
          reason: "The SRT connection dropped; Duna kept the stream moving over RTMPS."
        )
      }
    }
  }

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
    if recorder === replayRecorder {
      let shouldRestart = restartReplayAfterStreamReplacement ||
        (!discardReplayBuffer && (pendingStreamKey != nil || self.recorder != nil))
      replayRotationWorkItem?.cancel()
      replayRotationWorkItem = nil
      replayRecorderStream?.removeObserver(recorder)
      replayRecorder = nil
      replayRecorderStream = nil
      replayBufferStartedAt = nil
      pendingReplayDuration = nil
      if shouldRestart {
        DispatchQueue.main.async { [weak self] in
          self?.discardReplayBuffer = false
          self?.restartReplayAfterStreamReplacement = false
          self?.startReplayBuffer()
        }
      }
      return
    }
    stream.removeObserver(recorder)
    self.recorder = nil
    recorderWasInterrupted = false
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
    if recorder === replayRecorder {
      replayRotationWorkItem?.cancel()
      replayRotationWorkItem = nil
      replayRecorderStream?.removeObserver(recorder)
      replayRecorder = nil
      replayRecorderStream = nil
      replayBufferStartedAt = nil
      let url = writer.outputURL
      let duration = max(
        0,
        CMTimeGetSeconds(AVURLAsset(url: url).duration)
      )
      let requestedDuration = pendingReplayDuration
      pendingReplayDuration = nil
      let shouldRestart =
        restartReplayAfterStreamReplacement ||
        (!discardReplayBuffer && (pendingStreamKey != nil || self.recorder != nil))
      DispatchQueue.main.async { [weak self] in
        guard let self else { return }
        if self.discardReplayBuffer {
          try? FileManager.default.removeItem(at: url)
          if let previous = self.lastReplayBufferUrl {
            try? FileManager.default.removeItem(at: previous)
            self.lastReplayBufferUrl = nil
          }
        } else if let requestedDuration {
          var sources: [URL] = []
          if let previous = self.lastReplayBufferUrl {
            sources.append(previous)
            self.lastReplayBufferUrl = nil
          }
          if duration > 0 {
            sources.append(url)
          } else {
            try? FileManager.default.removeItem(at: url)
          }
          if sources.isEmpty {
            self.emitError("Replay is warming up. Try again after the next rally.")
          } else {
            self.playReplay(
              sourceUrls: sources,
              requestedDuration: requestedDuration
            )
          }
        } else {
          if let previous = self.lastReplayBufferUrl {
            try? FileManager.default.removeItem(at: previous)
          }
          self.lastReplayBufferUrl = url
        }
        if shouldRestart {
          self.discardReplayBuffer = false
          self.restartReplayAfterStreamReplacement = false
          self.startReplayBuffer()
        }
      }
      return
    }
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
    let payload: [String: Any] = [
      "fileUri": url.absoluteString,
      "fileName": url.lastPathComponent,
      "mimeType": "video/mp4",
      "bytes": bytes,
      "durationSeconds": duration
    ]
    let interrupted = recorderWasInterrupted
    recorderWasInterrupted = false
    recordingPromise?.resolve(payload)
    recordingPromise = nil
    if interrupted {
      DispatchQueue.main.async { [weak self] in
        self?.activeView?.onRecordingFinalized(payload)
      }
    }
  }
}

public final class DunaVideoCaptureView: ExpoView {
  let arPreview = ARSCNView(frame: .zero)
  let preview = MTHKView(frame: .zero)
  let onGuidance = ExpoModulesCore.EventDispatcher()
  let onStreamState = ExpoModulesCore.EventDispatcher()
  let onCaptureError = ExpoModulesCore.EventDispatcher()
  let onPreview = ExpoModulesCore.EventDispatcher()
  let onRecordingFinalized = ExpoModulesCore.EventDispatcher()

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
      (
        streamUrl: String,
        streamKey: String,
        audioEnabled: Bool,
        transport: String,
        srtPassphrase: String?,
        fallbackUrl: String?,
        fallbackKey: String?
      ) in
      guard
        let url = URL(string: streamUrl),
        ["rtmp", "rtmps", "srt"].contains(url.scheme?.lowercased() ?? ""),
        ["srt", "rtmps"].contains(transport),
        (transport == "srt") == (url.scheme?.lowercased() == "srt"),
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
        audioEnabled: audioEnabled,
        transport: transport,
        srtPassphrase: srtPassphrase,
        fallbackUrl: fallbackUrl,
        fallbackKey: fallbackKey
      )
    }.runOnQueue(.main)

    AsyncFunction("stopStream") {
      DunaVideoCaptureController.shared.stopStream()
    }.runOnQueue(.main)

    AsyncFunction("updateProgramState") { (payloadJson: String) in
      try DunaVideoCaptureController.shared.updateProgramState(json: payloadJson)
    }.runOnQueue(.main)

    AsyncFunction("insertReplay") { (durationSeconds: Int) in
      DunaVideoCaptureController.shared.insertReplay(
        durationSeconds: durationSeconds
      )
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

    Function("lockCalibration") {
      DunaVideoCaptureController.shared.lockCalibration()
    }

    Function("releasePreview") {
      DunaVideoCaptureController.shared.releasePreview()
    }

    View(DunaVideoCaptureView.self) {
      Events(
        "onGuidance",
        "onStreamState",
        "onCaptureError",
        "onPreview",
        "onRecordingFinalized"
      )

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
