import ExpoModulesCore
import Foundation
import WatchConnectivity

private let scoreDraftDefaultsKey = "duna.pendingWatchScoreDraft"
private let visionEventsDefaultsKey = "duna.pendingWatchVisionEvents"
private let cameraPreviewNotification = Notification.Name(
  "co.duna.watch.camera-preview"
)

private final class DunaWatchConnectivityCenter: NSObject, WCSessionDelegate {
  static let shared = DunaWatchConnectivityCenter()

  var onScoreDraft: ((String) -> Void)?
  var onVisionEvent: ((String) -> Void)?

  private var currentContext: [String: Any] = [:]

  private override init() {
    super.init()
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(receiveCameraPreview(_:)),
      name: cameraPreviewNotification,
      object: nil
    )
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    session.delegate = self
    session.activate()
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  func syncContext(json: String, type: String) -> Bool {
    guard
      WCSession.isSupported(),
      let data = json.data(using: .utf8),
      let payload = try? JSONSerialization.jsonObject(with: data)
        as? [String: Any]
    else {
      return false
    }
    let incomingSessionID = payload["sessionId"] as? String
    let currentSessionID = currentContext["sessionId"] as? String
    if type == "duna.matchContext"
      || (incomingSessionID != nil && incomingSessionID != currentSessionID)
    {
      currentContext = payload
    } else {
      currentContext.merge(payload) { _, next in next }
    }
    currentContext["type"] = type
    return publishContext()
  }

  func pendingDraft() -> String? {
    UserDefaults.standard.string(forKey: scoreDraftDefaultsKey)
  }

  func clearPendingDraft() {
    UserDefaults.standard.removeObject(forKey: scoreDraftDefaultsKey)
  }

  func pendingVisionEvents() -> String? {
    UserDefaults.standard.string(forKey: visionEventsDefaultsKey)
  }

  func acknowledgeVisionEvents(eventIdsJson: String) {
    guard
      let idData = eventIdsJson.data(using: .utf8),
      let ids = try? JSONSerialization.jsonObject(with: idData) as? [String]
    else {
      return
    }
    let acknowledged = Set(ids)
    let remaining = storedVisionEvents().filter { payload in
      guard let eventID = payload["eventId"] as? String else { return false }
      return !acknowledged.contains(eventID)
    }
    storeVisionEvents(remaining)
  }

  private func publishContext() -> Bool {
    do {
      try WCSession.default.updateApplicationContext(currentContext)
      return true
    } catch {
      return false
    }
  }

  @objc
  private func receiveCameraPreview(_ notification: Notification) {
    guard
      let jpeg = notification.userInfo?["jpeg"] as? Data,
      jpeg.count <= 220_000
    else {
      return
    }
    currentContext["previewJPEG"] = jpeg
    currentContext["previewCapturedAt"] =
      notification.userInfo?["capturedAt"] as? String
    if let guidance = notification.userInfo?["guidance"] as? [String: Any] {
      currentContext["guidance"] = guidance
    }
    _ = publishContext()
  }

  private func receipt(
    for payload: [String: Any],
    accepted: Bool,
    message: String? = nil
  ) -> [String: Any] {
    var receipt: [String: Any] = [
      "type": "duna.watchReceipt",
      "accepted": accepted,
      "receivedAt": ISO8601DateFormatter().string(from: Date()),
    ]
    for key in ["eventId", "draftId"] {
      if let value = payload[key] as? String {
        receipt[key] = value
      }
    }
    if let message {
      receipt["message"] = message
    }
    return receipt
  }

  private func receive(_ payload: [String: Any]) -> [String: Any] {
    guard JSONSerialization.isValidJSONObject(payload) else {
      return receipt(
        for: payload,
        accepted: false,
        message: "iPhone received an invalid action"
      )
    }
    if payload["type"] as? String == "duna.scoreDraft" {
      guard
        let data = try? JSONSerialization.data(withJSONObject: payload),
        let json = String(data: data, encoding: .utf8)
      else {
        return receipt(
          for: payload,
          accepted: false,
          message: "iPhone could not save the score"
        )
      }
      UserDefaults.standard.set(json, forKey: scoreDraftDefaultsKey)
      DispatchQueue.main.async { [weak self] in
        self?.onScoreDraft?(json)
      }
      return receipt(for: payload, accepted: true)
    }

    guard payload["type"] as? String == "duna.visionEvent" else {
      return receipt(
        for: payload,
        accepted: false,
        message: "iPhone does not recognize this action"
      )
    }
    var events = storedVisionEvents()
    let eventID = payload["eventId"] as? String
    if !events.contains(where: { $0["eventId"] as? String == eventID }) {
      events.append(payload)
      storeVisionEvents(Array(events.suffix(500)))
    }
    guard
      let data = try? JSONSerialization.data(withJSONObject: payload),
      let json = String(data: data, encoding: .utf8)
    else {
      return receipt(
        for: payload,
        accepted: false,
        message: "iPhone could not save the match action"
      )
    }
    DispatchQueue.main.async { [weak self] in
      self?.onVisionEvent?(json)
    }
    return receipt(for: payload, accepted: true)
  }

  private func sendReceipt(_ receipt: [String: Any], through session: WCSession) {
    guard session.activationState == .activated else { return }
    if session.isReachable {
      session.sendMessage(receipt, replyHandler: nil) { _ in
        guard session.activationState == .activated else { return }
        session.transferUserInfo(receipt)
      }
    } else {
      session.transferUserInfo(receipt)
    }
  }

  private func storedVisionEvents() -> [[String: Any]] {
    guard
      let json = UserDefaults.standard.string(forKey: visionEventsDefaultsKey),
      let data = json.data(using: .utf8),
      let events = try? JSONSerialization.jsonObject(with: data)
        as? [[String: Any]]
    else {
      return []
    }
    return events
  }

  private func storeVisionEvents(_ events: [[String: Any]]) {
    guard
      JSONSerialization.isValidJSONObject(events),
      let data = try? JSONSerialization.data(withJSONObject: events),
      let json = String(data: data, encoding: .utf8)
    else {
      return
    }
    UserDefaults.standard.set(json, forKey: visionEventsDefaultsKey)
  }

  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {}

  func sessionDidBecomeInactive(_ session: WCSession) {}

  func sessionDidDeactivate(_ session: WCSession) {
    session.activate()
  }

  func session(
    _ session: WCSession,
    didReceiveMessage message: [String: Any]
  ) {
    sendReceipt(receive(message), through: session)
  }

  func session(
    _ session: WCSession,
    didReceiveMessage message: [String: Any],
    replyHandler: @escaping ([String: Any]) -> Void
  ) {
    replyHandler(receive(message))
  }

  func session(
    _ session: WCSession,
    didReceiveUserInfo userInfo: [String: Any] = [:]
  ) {
    sendReceipt(receive(userInfo), through: session)
  }
}

public final class DunaWatchScoringModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DunaWatchScoring")

    Events("onScoreDraft", "onVisionEvent")

    OnCreate {
      _ = DunaWatchConnectivityCenter.shared
      DunaWatchConnectivityCenter.shared.onScoreDraft = { [weak self] json in
        self?.sendEvent("onScoreDraft", ["json": json])
      }
      DunaWatchConnectivityCenter.shared.onVisionEvent = { [weak self] json in
        self?.sendEvent("onVisionEvent", ["json": json])
      }
    }

    OnDestroy {
      DunaWatchConnectivityCenter.shared.onScoreDraft = nil
      DunaWatchConnectivityCenter.shared.onVisionEvent = nil
    }

    Function("isSupported") {
      WCSession.isSupported()
    }

    Function("syncMatch") { (json: String) -> Bool in
      DunaWatchConnectivityCenter.shared.syncContext(
        json: json,
        type: "duna.matchContext"
      )
    }

    Function("syncVisionSession") { (json: String) -> Bool in
      DunaWatchConnectivityCenter.shared.syncContext(
        json: json,
        type: "duna.visionContext"
      )
    }

    Function("getPendingScoreDraft") { () -> String? in
      DunaWatchConnectivityCenter.shared.pendingDraft()
    }

    Function("clearPendingScoreDraft") {
      DunaWatchConnectivityCenter.shared.clearPendingDraft()
    }

    Function("getPendingVisionEvents") { () -> String? in
      DunaWatchConnectivityCenter.shared.pendingVisionEvents()
    }

    Function("acknowledgeVisionEvents") { (eventIdsJson: String) in
      DunaWatchConnectivityCenter.shared.acknowledgeVisionEvents(
        eventIdsJson: eventIdsJson
      )
    }
  }
}
