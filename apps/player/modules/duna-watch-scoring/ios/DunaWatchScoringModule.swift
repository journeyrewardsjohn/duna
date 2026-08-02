import ExpoModulesCore
import Foundation
import WatchConnectivity

private let scoreDraftDefaultsKey = "duna.pendingWatchScoreDraft"

private final class DunaWatchConnectivityCenter: NSObject, WCSessionDelegate {
  static let shared = DunaWatchConnectivityCenter()

  var onScoreDraft: ((String) -> Void)?

  private override init() {
    super.init()
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    session.delegate = self
    session.activate()
  }

  func syncMatch(json: String) -> Bool {
    guard
      WCSession.isSupported(),
      let data = json.data(using: .utf8),
      let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return false
    }
    var context = payload
    context["type"] = "duna.matchContext"
    do {
      try WCSession.default.updateApplicationContext(context)
      return true
    } catch {
      return false
    }
  }

  func pendingDraft() -> String? {
    UserDefaults.standard.string(forKey: scoreDraftDefaultsKey)
  }

  func clearPendingDraft() {
    UserDefaults.standard.removeObject(forKey: scoreDraftDefaultsKey)
  }

  private func receive(_ payload: [String: Any]) {
    guard
      payload["type"] as? String == "duna.scoreDraft",
      JSONSerialization.isValidJSONObject(payload),
      let data = try? JSONSerialization.data(withJSONObject: payload),
      let json = String(data: data, encoding: .utf8)
    else {
      return
    }
    UserDefaults.standard.set(json, forKey: scoreDraftDefaultsKey)
    DispatchQueue.main.async { [weak self] in
      self?.onScoreDraft?(json)
    }
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
    receive(message)
  }

  func session(
    _ session: WCSession,
    didReceiveUserInfo userInfo: [String: Any] = [:]
  ) {
    receive(userInfo)
  }
}

public final class DunaWatchScoringModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DunaWatchScoring")

    Events("onScoreDraft")

    OnCreate {
      _ = DunaWatchConnectivityCenter.shared
      DunaWatchConnectivityCenter.shared.onScoreDraft = { [weak self] json in
        self?.sendEvent("onScoreDraft", ["json": json])
      }
    }

    OnDestroy {
      DunaWatchConnectivityCenter.shared.onScoreDraft = nil
    }

    Function("isSupported") {
      WCSession.isSupported()
    }

    Function("syncMatch") { (json: String) -> Bool in
      DunaWatchConnectivityCenter.shared.syncMatch(json: json)
    }

    Function("getPendingScoreDraft") { () -> String? in
      DunaWatchConnectivityCenter.shared.pendingDraft()
    }

    Function("clearPendingScoreDraft") {
      DunaWatchConnectivityCenter.shared.clearPendingDraft()
    }
  }
}
