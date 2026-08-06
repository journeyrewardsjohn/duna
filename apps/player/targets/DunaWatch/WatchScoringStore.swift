import Foundation
import WatchConnectivity
import WatchKit

struct WatchSetScore: Codable, Hashable {
  var a: Int = 0
  var b: Int = 0
}

private struct WatchPointHistory {
  let eventID: String
  let winner: String
  let before: [WatchSetScore]
  let beforeServing: String?
}

@MainActor
final class WatchScoringStore: NSObject, ObservableObject, WCSessionDelegate {
  @Published var sessionID: String?
  @Published var videoID: String?
  @Published var matchID: String?
  @Published var captureMode = "record"
  @Published var teamA = "Team A"
  @Published var teamB = "Team B"
  @Published var sets: [WatchSetScore] = [WatchSetScore()]
  @Published var serving: String?
  @Published var sessionStatus = "setup"
  @Published var sentNotice: String?
  @Published var previewImage: UIImage?
  @Published var previewQuality = "Waiting for camera"
  @Published var previewScore = 0
  @Published var previewAcceptable = false
  @Published var previewPartial = false
  @Published var previewCapturedAt: Date?
  @Published var sideChangeDue = false

  private var recordingStartedAt: Date?
  private var pointHistory: [WatchPointHistory] = []
  private var setsToWin = 2
  private var maximumSets = 3
  private var pointTargets = [21, 21, 15]
  private var winBy = 2
  private var hardCaps = [0, 0, 0]
  private var sideSwitchIntervals = [7, 7, 5]

  private var winsA: Int {
    sets.enumerated().reduce(0) { total, item in
      total +
        (isComplete(item.element, at: item.offset) &&
          item.element.a > item.element.b ? 1 : 0)
    }
  }

  private var winsB: Int {
    sets.enumerated().reduce(0) { total, item in
      total +
        (isComplete(item.element, at: item.offset) &&
          item.element.b > item.element.a ? 1 : 0)
    }
  }

  var currentSetIndex: Int { max(sets.count - 1, 0) }
  var current: WatchSetScore { sets[currentSetIndex] }
  var setsWonA: Int { winsA }
  var setsWonB: Int { winsB }
  var matchComplete: Bool { winsA >= setsToWin || winsB >= setsToWin }
  var currentSetComplete: Bool { isComplete(current, at: currentSetIndex) }
  var canAddSet: Bool {
    currentSetComplete && !matchComplete && sets.count < maximumSets
  }
  var isVisionActive: Bool { sessionID != nil && sessionStatus != "ended" }
  var favoriteCount: Int { favoriteEventIDs.count }

  private var favoriteEventIDs: [String] = []

  override init() {
    super.init()
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    session.delegate = self
    session.activate()
  }

  func addPoint(to side: String) {
    guard side == "A" || side == "B", !matchComplete else { return }
    if currentSetComplete && canAddSet {
      sets.append(WatchSetScore())
    }
    let before = sets
    let beforeServing = serving
    if side == "A" {
      sets[currentSetIndex].a += 1
    } else {
      sets[currentSetIndex].b += 1
    }
    serving = side
    let eventID = UUID().uuidString
    pointHistory.append(
      WatchPointHistory(
        eventID: eventID,
        winner: side,
        before: before,
        beforeServing: beforeServing
      )
    )
    sideChangeDue = shouldSwitchSides()
    sentNotice = side == "A" ? "Point · \(teamA)" : "Point · \(teamB)"
    emitVisionEvent(
      eventID: eventID,
      eventType: "rally-won",
      winnerSide: side
    )
    if sideChangeDue {
      emitVisionEvent(
        eventID: UUID().uuidString,
        eventType: "side-change",
        label: "Side-switch checkpoint"
      )
    }
    WKInterfaceDevice.current().play(.click)
  }

  func undoLastPoint() {
    guard let point = pointHistory.popLast() else { return }
    sets = point.before
    serving = point.beforeServing
    sideChangeDue = shouldSwitchSides()
    sentNotice = "Last point undone"
    emitVisionEvent(
      eventID: UUID().uuidString,
      eventType: "undo",
      targetEventID: point.eventID
    )
    WKInterfaceDevice.current().play(.directionDown)
  }

  func undoPoint(from side: String) {
    guard pointHistory.last?.winner == side else { return }
    undoLastPoint()
  }

  func favoriteMoment() {
    guard isVisionActive else {
      sentNotice = "Start Duna Vision on iPhone"
      WKInterfaceDevice.current().play(.failure)
      return
    }
    let eventID = UUID().uuidString
    favoriteEventIDs.append(eventID)
    sentNotice = "Moment saved"
    emitVisionEvent(
      eventID: eventID,
      eventType: "favorite",
      label: "Favorite moment"
    )
    WKInterfaceDevice.current().play(.success)
  }

  func confirmSideChange() {
    sideChangeDue = false
    sentNotice = "Sides changed"
    emitVisionEvent(
      eventID: UUID().uuidString,
      eventType: "side-change",
      label: "Sides changed"
    )
    WKInterfaceDevice.current().play(.directionUp)
  }

  func addNextSet() {
    guard canAddSet else { return }
    sets.append(WatchSetScore())
    WKInterfaceDevice.current().play(.start)
  }

  @discardableResult
  func endCurrentSet() -> Bool {
    guard canAddSet else { return false }
    let endedSet = currentSetIndex + 1
    sets.append(WatchSetScore())
    sideChangeDue = false
    sentNotice = "Set \(endedSet) complete"
    emitVisionEvent(
      eventID: UUID().uuidString,
      eventType: "set-ended",
      label: "Set \(endedSet) ended"
    )
    WKInterfaceDevice.current().play(.success)
    return true
  }

  func reset() {
    if !isVisionActive {
      sessionID = nil
      videoID = nil
      matchID = nil
      teamA = "Team A"
      teamB = "Team B"
      sessionStatus = "setup"
      captureMode = "record"
      recordingStartedAt = nil
    }
    sets = [WatchSetScore()]
    serving = nil
    sentNotice = nil
    pointHistory = []
    favoriteEventIDs = []
    sideChangeDue = false
  }

  func elapsedSeconds(at date: Date = Date()) -> Int {
    elapsedMilliseconds(at: date) / 1_000
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
      "capturedAt": formatter.string(from: Date())
    ]
    if let matchID {
      payload["matchId"] = matchID
    }
    send(payload)
    sentNotice = WCSession.default.isReachable
      ? "Sent to iPhone" : "Queued for iPhone"
    WKInterfaceDevice.current().play(.success)
  }

  private func emitVisionEvent(
    eventID: String,
    eventType: String,
    winnerSide: String? = nil,
    targetEventID: String? = nil,
    label: String? = nil
  ) {
    guard let sessionID else { return }
    let now = Date()
    var payload: [String: Any] = [
      "type": "duna.visionEvent",
      "eventId": eventID,
      "sessionId": sessionID,
      "source": "apple-watch",
      "eventType": eventType,
      "elapsedMs": min(43_200_000, elapsedMilliseconds(at: now)),
      "occurredAt": ISO8601DateFormatter().string(from: now),
      "score": scorePayload()
    ]
    if let matchID { payload["matchId"] = matchID }
    if let winnerSide { payload["winnerSide"] = winnerSide }
    if let targetEventID { payload["targetEventId"] = targetEventID }
    if let label { payload["label"] = label }
    send(payload)
  }

  private func scorePayload() -> [String: Any] {
    var payload: [String: Any] = [
      "setIndex": currentSetIndex,
      "sets": sets.map { ["a": $0.a, "b": $0.b] },
      "status": matchComplete ? "complete" : "live"
    ]
    if let serving { payload["serving"] = serving }
    return payload
  }

  private func send(_ payload: [String: Any]) {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    if session.isReachable {
      session.sendMessage(payload, replyHandler: nil) { _ in
        session.transferUserInfo(payload)
      }
    } else {
      session.transferUserInfo(payload)
    }
  }

  private func shouldSwitchSides() -> Bool {
    guard !matchComplete else { return false }
    let interval = value(in: sideSwitchIntervals, at: currentSetIndex) ?? 0
    guard interval > 0 else { return false }
    let total = current.a + current.b
    return total > 0 && total % interval == 0
  }

  private func elapsedMilliseconds(at date: Date) -> Int {
    guard let recordingStartedAt else { return 0 }
    return max(0, Int(date.timeIntervalSince(recordingStartedAt) * 1_000))
  }

  private func isComplete(_ set: WatchSetScore, at setIndex: Int) -> Bool {
    let target = value(in: pointTargets, at: setIndex) ?? 21
    let hardCap = value(in: hardCaps, at: setIndex) ?? 0
    let leading = max(set.a, set.b)
    return (leading >= target && abs(set.a - set.b) >= winBy) ||
      (hardCap > 0 && leading >= hardCap)
  }

  private func value<Element>(in values: [Element], at index: Int) -> Element? {
    if values.indices.contains(index) { return values[index] }
    return values.last
  }

  private func parseDate(_ value: String?) -> Date? {
    guard let value else { return nil }
    let precise = ISO8601DateFormatter()
    precise.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return precise.date(from: value) ?? ISO8601DateFormatter().date(from: value)
  }

  private func applyContext(_ applicationContext: [String: Any]) {
    let type = applicationContext["type"] as? String
    guard type == "duna.visionContext" || type == "duna.matchContext" else {
      return
    }
    let incomingSessionID = applicationContext["sessionId"] as? String
    let isNewSession = incomingSessionID != nil && incomingSessionID != sessionID
    if isNewSession {
      pointHistory = []
      favoriteEventIDs = []
      sets = [WatchSetScore()]
      serving = nil
      videoID = nil
      matchID = nil
    }
    if type == "duna.matchContext" {
      sessionID = nil
      videoID = nil
      sessionStatus = "setup"
      captureMode = "record"
      recordingStartedAt = nil
    } else {
      sessionID = incomingSessionID ?? sessionID
      videoID = applicationContext["videoId"] as? String ?? videoID
    }
    matchID = applicationContext["matchId"] as? String ?? matchID
    teamA = applicationContext["teamA"] as? String ?? teamA
    teamB = applicationContext["teamB"] as? String ?? teamB
    sessionStatus = applicationContext["status"] as? String ?? sessionStatus
    captureMode = applicationContext["captureMode"] as? String ?? captureMode
    if let startedAt = applicationContext["recordingStartedAt"] as? String {
      recordingStartedAt = parseDate(startedAt)
    }
    if
      let score = applicationContext["score"] as? [String: Any],
      let rows = score["sets"] as? [[String: Any]]
    {
      let next = rows.compactMap { row -> WatchSetScore? in
        guard let a = row["a"] as? Int, let b = row["b"] as? Int else {
          return nil
        }
        return WatchSetScore(a: a, b: b)
      }
      if !next.isEmpty { sets = next }
      serving = score["serving"] as? String ?? serving
    }
    if let format = applicationContext["format"] as? [String: Any] {
      setsToWin = format["setsToWin"] as? Int ?? setsToWin
      maximumSets = format["maximumSets"] as? Int ?? maximumSets
      pointTargets = format["pointTargets"] as? [Int] ?? pointTargets
      winBy = format["winBy"] as? Int ?? winBy
      sideSwitchIntervals =
        format["sideSwitchIntervals"] as? [Int] ?? sideSwitchIntervals
      hardCaps = format["hardCaps"] as? [Int] ?? hardCaps
    }
    if let data = applicationContext["previewJPEG"] as? Data {
      previewImage = UIImage(data: data)
    }
    if let capturedAt = applicationContext["previewCapturedAt"] as? String {
      previewCapturedAt = parseDate(capturedAt)
    }
    if let guidance = applicationContext["guidance"] as? [String: Any] {
      previewScore = guidance["qualityScore"] as? Int ?? previewScore
      previewAcceptable = guidance["acceptable"] as? Bool ?? false
      previewPartial = guidance["partialCourt"] as? Bool ?? false
      if let warnings = guidance["warnings"] as? [String], let first = warnings.first {
        previewQuality = first
      } else if previewPartial {
        previewQuality = "Partial court calibrated"
      } else {
        previewQuality = previewAcceptable ? "Court is in frame" : "Adjust camera"
      }
    }
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
    Task { @MainActor [weak self] in
      self?.applyContext(applicationContext)
    }
  }
}
