import Foundation
import WatchConnectivity
import WatchKit

struct WatchSetScore: Codable, Hashable {
  var a: Int = 0
  var b: Int = 0
}

@MainActor
final class WatchScoringStore: NSObject, ObservableObject, WCSessionDelegate {
  @Published var matchID: String?
  @Published var teamA = "Team A"
  @Published var teamB = "Team B"
  @Published var sets: [WatchSetScore] = [WatchSetScore()]
  @Published var sentNotice: String?

  private var winsA: Int {
    sets.enumerated().reduce(0) { total, item in
      total + (isComplete(item.element, at: item.offset) && item.element.a > item.element.b ? 1 : 0)
    }
  }

  private var winsB: Int {
    sets.enumerated().reduce(0) { total, item in
      total + (isComplete(item.element, at: item.offset) && item.element.b > item.element.a ? 1 : 0)
    }
  }

  var currentSetIndex: Int { max(sets.count - 1, 0) }
  var current: WatchSetScore { sets[currentSetIndex] }
  var matchComplete: Bool { winsA >= 2 || winsB >= 2 }
  var currentSetComplete: Bool { isComplete(current, at: currentSetIndex) }
  var canAddSet: Bool { currentSetComplete && !matchComplete && sets.count < 3 }

  override init() {
    super.init()
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    session.delegate = self
    session.activate()
  }

  func addPoint(to side: String) {
    guard !currentSetComplete else { return }
    if side == "A" {
      sets[currentSetIndex].a += 1
    } else {
      sets[currentSetIndex].b += 1
    }
    sentNotice = nil
    WKInterfaceDevice.current().play(.click)
  }

  func undoPoint(from side: String) {
    if side == "A", sets[currentSetIndex].a > 0 {
      sets[currentSetIndex].a -= 1
    } else if side == "B", sets[currentSetIndex].b > 0 {
      sets[currentSetIndex].b -= 1
    }
    sentNotice = nil
    WKInterfaceDevice.current().play(.directionDown)
  }

  func addNextSet() {
    guard canAddSet else { return }
    sets.append(WatchSetScore())
    WKInterfaceDevice.current().play(.start)
  }

  func reset() {
    matchID = nil
    teamA = "Team A"
    teamB = "Team B"
    sets = [WatchSetScore()]
    sentNotice = nil
  }

  func sendForReview() {
    guard matchComplete || currentSetComplete else { return }
    let formatter = ISO8601DateFormatter()
    let scorePayload = sets.map { ["a": $0.a, "b": $0.b] }
    var payload: [String: Any] = [
      "type": "duna.scoreDraft",
      "draftId": UUID().uuidString,
      "source": "apple-watch",
      "teamA": teamA,
      "teamB": teamB,
      "sets": scorePayload,
      "capturedAt": formatter.string(from: Date()),
    ]
    if let matchID {
      payload["matchId"] = matchID
    }

    guard WCSession.isSupported() else {
      sentNotice = "Open Duna on iPhone"
      return
    }
    let session = WCSession.default
    if session.isReachable {
      session.sendMessage(payload, replyHandler: nil) { [weak self] _ in
        session.transferUserInfo(payload)
        Task { @MainActor in self?.sentNotice = "Queued for iPhone" }
      }
    } else {
      session.transferUserInfo(payload)
    }
    sentNotice = session.isReachable ? "Sent to iPhone" : "Queued for iPhone"
    WKInterfaceDevice.current().play(.success)
  }

  private func isComplete(_ set: WatchSetScore, at setIndex: Int) -> Bool {
    let target = setIndex >= 2 ? 15 : 21
    let leading = max(set.a, set.b)
    return leading >= target && abs(set.a - set.b) >= 2
  }

  nonisolated func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {}

  nonisolated func session(
    _ session: WCSession,
    didReceiveApplicationContext applicationContext: [String: Any]
  ) {
    guard applicationContext["type"] as? String == "duna.matchContext" else {
      return
    }
    Task { @MainActor [weak self] in
      guard let self else { return }
      self.matchID = applicationContext["matchId"] as? String
      self.teamA = applicationContext["teamA"] as? String ?? "Team A"
      self.teamB = applicationContext["teamB"] as? String ?? "Team B"
      self.sets = [WatchSetScore()]
      self.sentNotice = nil
    }
  }
}
