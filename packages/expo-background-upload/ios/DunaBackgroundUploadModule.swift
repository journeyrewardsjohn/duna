import ExpoModulesCore
import Foundation
import UIKit

private struct DunaBackgroundUploadManifest: Codable {
  let sessionIdentifier: String
  let taskIdentifier: Int
  let uploadId: String
  let partNumber: Int
  let stagedPath: String
  let sizeBytes: Int
  var status: String
  var etag: String?
  var error: String?
}

private final class DunaBackgroundUploadCoordinator: NSObject, URLSessionTaskDelegate, URLSessionDelegate {
  static let shared = DunaBackgroundUploadCoordinator()

  private let queue = DispatchQueue(label: "co.duna.background-upload")
  private let manifestKey = "co.duna.background-upload.manifest.v1"
  // Task identifiers restart in each URLSession. Include the session identity
  // so Wi-Fi and cellular queues cannot overwrite each other's persisted state.
  private var manifests: [String: DunaBackgroundUploadManifest] = [:]
  private var promises: [String: Promise] = [:]
  private var completionHandlers: [String: () -> Void] = [:]
  weak var module: DunaBackgroundUploadModule?

  private func backgroundSessionIdentifier(suffix: String) -> String {
    let bundle = Bundle.main.bundleIdentifier ?? "co.duna.app"
    return "\(bundle).duna-video-upload.\(suffix)"
  }

  private var allowedBackgroundSessionIdentifiers: Set<String> {
    [
      backgroundSessionIdentifier(suffix: "wifi"),
      backgroundSessionIdentifier(suffix: "cellular"),
    ]
  }

  private func makeSession(suffix: String, allowsCellular: Bool) -> URLSession {
    let configuration = URLSessionConfiguration.background(
      withIdentifier: backgroundSessionIdentifier(suffix: suffix)
    )
    configuration.sessionSendsLaunchEvents = true
    configuration.waitsForConnectivity = true
    configuration.isDiscretionary = false
    configuration.httpMaximumConnectionsPerHost = 2
    configuration.allowsCellularAccess = allowsCellular
    return URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
  }

  private lazy var wifiSession = makeSession(suffix: "wifi", allowsCellular: false)
  private lazy var cellularSession = makeSession(suffix: "cellular", allowsCellular: true)

  private func session(allowCellular: Bool) -> URLSession {
    allowCellular ? cellularSession : wifiSession
  }

  private func restoreSessions() {
    // Construct only after the app delegate has stored a background completion
    // handler. Creating a URLSession can synchronously drain queued callbacks.
    _ = wifiSession
    _ = cellularSession
  }

  private func validatedOffset(_ value: Any?) -> UInt64? {
    guard let number = value as? NSNumber else { return nil }
    let offset = number.doubleValue
    // JavaScript numbers cannot faithfully represent UInt64.max. Reject the
    // rounded 2^64 sentinel as well as NaN, infinity, fractions, and negatives
    // before Swift's trapping UInt64 conversion.
    guard
      offset.isFinite,
      offset >= 0,
      offset.rounded(.towardZero) == offset,
      offset < 18_446_744_073_709_551_616.0
    else { return nil }
    return UInt64(offset)
  }

  private func taskKey(session: URLSession, task: URLSessionTask) -> String {
    let identifier = session.configuration.identifier ?? "co.duna.background-upload.unknown"
    return "\(identifier)|\(task.taskIdentifier)"
  }

  private override init() {
    super.init()
    loadManifests()
  }

  func register(module: DunaBackgroundUploadModule) {
    self.module = module
  }

  func handleBackgroundEvents(identifier: String, completionHandler: @escaping () -> Void) {
    guard allowedBackgroundSessionIdentifiers.contains(identifier) else {
      completionHandler()
      return
    }
    // Store synchronously before restoring either lazy session. This makes the
    // AppDelegate launch path safe even when URLSession immediately delivers
    // its final delegate callback while restoring outstanding tasks.
    queue.sync {
      self.completionHandlers[identifier] = completionHandler
    }
    restoreSessions()
  }

  func uploadPart(input: [String: Any], promise: Promise) {
    guard
      let uploadId = input["uploadId"] as? String,
      let partNumber = input["partNumber"] as? Int,
      let fileUri = input["fileUri"] as? String,
      let uploadUrl = input["uploadUrl"] as? String,
      let offset = validatedOffset(input["offset"]),
      let length = input["length"] as? Int,
      let contentType = input["contentType"] as? String,
      let allowCellular = input["allowCellular"] as? Bool,
      !uploadId.isEmpty,
      partNumber > 0,
      length > 0,
      length <= 64 * 1024 * 1024,
      let destination = URL(string: uploadUrl),
      destination.scheme?.lowercased() == "https"
    else {
      promise.reject("ERR_DUNA_BACKGROUND_UPLOAD", "The upload part is invalid.")
      return
    }

    do {
      let selectedSession = session(allowCellular: allowCellular)
      let hasInFlightPart = queue.sync {
        manifests.values.contains {
          $0.uploadId == uploadId && $0.partNumber == partNumber && $0.status == "uploading"
        }
      }
      if hasInFlightPart {
        promise.reject(
          "ERR_DUNA_BACKGROUND_UPLOAD_IN_PROGRESS",
          "This upload part is already running in the iOS background session."
        )
        return
      }
      let source = URL(string: fileUri) ?? URL(fileURLWithPath: fileUri)
      let staged = try stage(
        source: source,
        uploadId: uploadId,
        partNumber: partNumber,
        offset: offset,
        length: length
      )
      var request = URLRequest(url: destination)
      request.httpMethod = "PUT"
      request.setValue(contentType, forHTTPHeaderField: "Content-Type")
      let task = selectedSession.uploadTask(with: request, fromFile: staged)
      task.taskDescription = "\(uploadId)|\(partNumber)"
      task.countOfBytesClientExpectsToSend = Int64(length)
      task.earliestBeginDate = nil
      let key = taskKey(session: selectedSession, task: task)
      let manifest = DunaBackgroundUploadManifest(
        sessionIdentifier: selectedSession.configuration.identifier ?? "co.duna.background-upload.unknown",
        taskIdentifier: task.taskIdentifier,
        uploadId: uploadId,
        partNumber: partNumber,
        stagedPath: staged.path,
        sizeBytes: length,
        status: "uploading",
        etag: nil,
        error: nil
      )
      queue.sync {
        manifests[key] = manifest
        promises[key] = promise
        saveManifests()
      }
      emit(manifest)
      task.resume()
    } catch {
      promise.reject(
        "ERR_DUNA_BACKGROUND_UPLOAD",
        "The upload part could not be staged: \(error.localizedDescription)"
      )
    }
  }

  /**
   * Persist and enqueue every missing multipart range before returning to JS.
   * This is intentionally separate from uploadPart: callers of this batch API
   * must reconcile persisted ETags when foregrounded rather than awaiting an
   * individual network transfer and accidentally scheduling only one task.
   */
  func enqueueParts(input: [String: Any]) throws -> [String: Any] {
    guard
      let uploadId = input["uploadId"] as? String,
      let fileUri = input["fileUri"] as? String,
      let allowCellular = input["allowCellular"] as? Bool,
      let parts = input["parts"] as? [[String: Any]],
      !uploadId.isEmpty
    else {
      throw NSError(
        domain: "DunaBackgroundUpload",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "The upload queue is invalid."]
      )
    }
    let selectedSession = session(allowCellular: allowCellular)
    let source = URL(string: fileUri) ?? URL(fileURLWithPath: fileUri)
    var queuedPartNumbers = [Int]()
    var inFlightPartNumbers = [Int]()
    var completedPartNumbers = [Int]()

    for part in parts {
      guard
        let partNumber = part["partNumber"] as? Int,
        let uploadUrl = part["uploadUrl"] as? String,
        let offset = validatedOffset(part["offset"]),
        let length = part["length"] as? Int,
        let contentType = part["contentType"] as? String,
        partNumber > 0,
        length > 0,
        length <= 64 * 1024 * 1024,
        let destination = URL(string: uploadUrl),
        destination.scheme?.lowercased() == "https"
      else {
        throw NSError(
          domain: "DunaBackgroundUpload",
          code: 3,
          userInfo: [NSLocalizedDescriptionKey: "An upload queue part is invalid."]
        )
      }

      let existing = queue.sync {
        manifests.values.first {
          $0.uploadId == uploadId && $0.partNumber == partNumber &&
            ($0.status == "uploading" || $0.status == "completed")
        }
      }
      if let existing {
        if existing.status == "completed" {
          completedPartNumbers.append(partNumber)
        } else {
          inFlightPartNumbers.append(partNumber)
        }
        continue
      }

      let staged = try stage(
        source: source,
        uploadId: uploadId,
        partNumber: partNumber,
        offset: offset,
        length: length
      )
      var request = URLRequest(url: destination)
      request.httpMethod = "PUT"
      request.setValue(contentType, forHTTPHeaderField: "Content-Type")
      let task = selectedSession.uploadTask(with: request, fromFile: staged)
      task.taskDescription = "\(uploadId)|\(partNumber)"
      task.countOfBytesClientExpectsToSend = Int64(length)
      let key = taskKey(session: selectedSession, task: task)
      let manifest = DunaBackgroundUploadManifest(
        sessionIdentifier: selectedSession.configuration.identifier ?? "co.duna.background-upload.unknown",
        taskIdentifier: task.taskIdentifier,
        uploadId: uploadId,
        partNumber: partNumber,
        stagedPath: staged.path,
        sizeBytes: length,
        status: "uploading",
        etag: nil,
        error: nil
      )
      queue.sync {
        manifests[key] = manifest
        saveManifests()
      }
      emit(manifest)
      task.resume()
      queuedPartNumbers.append(partNumber)
    }
    return [
      "queuedPartNumbers": queuedPartNumbers,
      "inFlightPartNumbers": inFlightPartNumbers,
      "completedPartNumbers": completedPartNumbers,
    ]
  }

  func completedParts(uploadId: String) -> [[String: Any]] {
    // A normal foreground relaunch has no AppDelegate completion handler. It
    // is safe to restore here because JavaScript explicitly requested a
    // foreground reconciliation; a background launch restores only after the
    // subscriber synchronously registered its handler above.
    restoreSessions()
    return queue.sync {
      manifests.values
        .filter { $0.uploadId == uploadId && $0.status == "completed" && $0.etag != nil }
        .sorted { $0.partNumber < $1.partNumber }
        .compactMap { manifest -> [String: Any]? in
          guard let etag = manifest.etag else { return nil }
          return [
            "uploadId": manifest.uploadId,
            "partNumber": manifest.partNumber,
            "etag": etag,
            "sizeBytes": manifest.sizeBytes
          ]
        }
    }
  }

  private func tasks(for session: URLSession) async -> [URLSessionTask] {
    await withCheckedContinuation { continuation in
      session.getAllTasks { continuation.resume(returning: $0) }
    }
  }

  /**
   * Local cleanup is invoked only after the caller has explicitly cancelled
   * the server upload (or after server completion). Remove the manifest before
   * cancelling URLSession tasks so their terminal callbacks cannot recreate a
   * retryable state or leave staged files behind.
   */
  func cancelUpload(uploadId: String) async -> [String: Any] {
    let sessions = [wifiSession, cellularSession]
    var allTasks = [URLSessionTask]()
    for session in sessions {
      allTasks.append(contentsOf: await tasks(for: session))
    }
    let matchingTasks = allTasks.filter {
      $0.taskDescription?.hasPrefix("\(uploadId)|") == true
    }
    let removed = queue.sync { () -> [DunaBackgroundUploadManifest] in
      let values = manifests.filter { $0.value.uploadId == uploadId }
      for (key, manifest) in values {
        manifests.removeValue(forKey: key)
        promises.removeValue(forKey: key)?.reject(
          "ERR_DUNA_BACKGROUND_UPLOAD_CANCELLED",
          "The upload was explicitly cancelled."
        )
        try? FileManager.default.removeItem(atPath: manifest.stagedPath)
      }
      saveManifests()
      return Array(values.values)
    }
    matchingTasks.forEach { $0.cancel() }
    if let directory = try? stagingDirectory(uploadId: uploadId) {
      try? FileManager.default.removeItem(at: directory)
    }
    return [
      "cancelledPartNumbers": removed.map(\.partNumber).sorted(),
      "cancelledTaskCount": matchingTasks.count,
    ]
  }

  private func stage(
    source: URL,
    uploadId: String,
    partNumber: Int,
    offset: UInt64,
    length: Int
  ) throws -> URL {
    let directory = try stagingDirectory(uploadId: uploadId)
    try ensureAvailableSpace(for: length, at: directory)
    let destination = directory.appendingPathComponent("part-\(partNumber).bin")
    try? FileManager.default.removeItem(at: destination)
    FileManager.default.createFile(atPath: destination.path, contents: nil)
    try FileManager.default.setAttributes(
      [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
      ofItemAtPath: destination.path
    )
    let input = try FileHandle(forReadingFrom: source)
    let output = try FileHandle(forWritingTo: destination)
    defer {
      try? input.close()
      try? output.close()
    }
    try input.seek(toOffset: offset)
    var remaining = length
    // Deliberately bounded: a 64 MiB part is never read into one Data value.
    while remaining > 0 {
      let chunk = try input.read(upToCount: min(1_048_576, remaining)) ?? Data()
      guard !chunk.isEmpty else {
        throw NSError(domain: "DunaBackgroundUpload", code: 1, userInfo: [NSLocalizedDescriptionKey: "The local video ended before the requested range."])
      }
      try output.write(contentsOf: chunk)
      remaining -= chunk.count
    }
    return destination
  }

  private func stagingDirectory(uploadId: String) throws -> URL {
    let applicationSupport = try FileManager.default.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    var directory = applicationSupport
      .appendingPathComponent("DunaBackgroundUploads", isDirectory: true)
      .appendingPathComponent(uploadId, isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    var resourceValues = URLResourceValues()
    resourceValues.isExcludedFromBackup = true
    try? directory.setResourceValues(resourceValues)
    try? FileManager.default.setAttributes(
      [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
      ofItemAtPath: directory.path
    )
    return directory
  }

  private func ensureAvailableSpace(for length: Int, at directory: URL) throws {
    let values = try directory.resourceValues(forKeys: [
      .volumeAvailableCapacityForImportantUsageKey,
      .volumeAvailableCapacityKey,
    ])
    let available: Int64
    if let importantCapacity = values.volumeAvailableCapacityForImportantUsage {
      available = importantCapacity
    } else if let fallbackCapacity = values.volumeAvailableCapacity {
      available = Int64(fallbackCapacity)
    } else {
      available = 0
    }
    // Leave a modest staging margin so a large multipart part cannot exhaust
    // app storage mid-copy and corrupt a resumable draft.
    let required = Int64(length) + 8 * 1_024 * 1_024
    guard available >= required else {
      throw NSError(
        domain: "DunaBackgroundUpload",
        code: 4,
        userInfo: [
          NSLocalizedDescriptionKey:
            "Not enough device storage to safely stage this video part."
        ]
      )
    }
  }

  private func manifestURL() -> URL? {
    try? FileManager.default.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    ).appendingPathComponent(manifestKey).appendingPathExtension("json")
  }

  private func loadManifests() {
    guard let url = manifestURL(), let data = try? Data(contentsOf: url),
      let loaded = try? JSONDecoder().decode([String: DunaBackgroundUploadManifest].self, from: data)
    else { return }
    manifests = loaded
  }

  private func saveManifests() {
    guard var url = manifestURL(), let data = try? JSONEncoder().encode(manifests) else { return }
    try? data.write(to: url, options: .atomic)
    var resourceValues = URLResourceValues()
    resourceValues.isExcludedFromBackup = true
    try? url.setResourceValues(resourceValues)
  }

  private func emit(_ manifest: DunaBackgroundUploadManifest) {
    module?.sendEvent("onUploadStatusChange", [
      "uploadId": manifest.uploadId,
      "partNumber": manifest.partNumber,
      "status": manifest.status,
      "etag": manifest.etag as Any,
      "sizeBytes": manifest.sizeBytes,
      "error": manifest.error as Any
    ])
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didSendBodyData bytesSent: Int64,
    totalBytesSent: Int64,
    totalBytesExpectedToSend: Int64
  ) {
    queue.async {
      let key = self.taskKey(session: session, task: task)
      guard let manifest = self.manifests[key] else { return }
      let expected = max(1, totalBytesExpectedToSend)
      self.module?.sendEvent("onUploadStatusChange", [
        "uploadId": manifest.uploadId,
        "partNumber": manifest.partNumber,
        "status": "uploading",
        "sizeBytes": manifest.sizeBytes,
        "progress": min(1, Double(totalBytesSent) / Double(expected))
      ])
    }
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didCompleteWithError error: Error?
  ) {
    queue.async {
      let key = self.taskKey(session: session, task: task)
      guard var manifest = self.manifests[key] else { return }
      let response = task.response as? HTTPURLResponse
      let etag = response?.value(forHTTPHeaderField: "ETag")
      if error == nil, let response, (200...299).contains(response.statusCode), let etag {
        manifest.status = "completed"
        manifest.etag = etag
        manifest.error = nil
        try? FileManager.default.removeItem(atPath: manifest.stagedPath)
        self.promises.removeValue(forKey: key)?.resolve([
          "uploadId": manifest.uploadId,
          "partNumber": manifest.partNumber,
          "etag": etag,
          "sizeBytes": manifest.sizeBytes
        ])
      } else {
        manifest.status = "retryable-error"
        manifest.error = error?.localizedDescription ?? "Cloudflare R2 rejected an upload part."
        self.promises.removeValue(forKey: key)?.reject(
          "ERR_DUNA_BACKGROUND_UPLOAD",
          manifest.error ?? "Cloudflare R2 rejected an upload part."
        )
      }
      self.manifests[key] = manifest
      self.saveManifests()
      self.emit(manifest)
    }
  }

  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    guard let identifier = session.configuration.identifier else { return }
    queue.async {
      if let completion = self.completionHandlers.removeValue(forKey: identifier) {
        DispatchQueue.main.async { completion() }
      }
    }
  }
}

public final class DunaBackgroundUploadModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DunaBackgroundUpload")
    Events("onUploadStatusChange")

    OnCreate {
      DunaBackgroundUploadCoordinator.shared.register(module: self)
    }

    Function("isAvailable") { true }

    AsyncFunction("uploadPart") { (input: [String: Any], promise: Promise) in
      DunaBackgroundUploadCoordinator.shared.uploadPart(input: input, promise: promise)
    }

    AsyncFunction("enqueueParts") { (input: [String: Any]) throws -> [String: Any] in
      try DunaBackgroundUploadCoordinator.shared.enqueueParts(input: input)
    }

    AsyncFunction("cancelUpload") { (uploadId: String) async -> [String: Any] in
      await DunaBackgroundUploadCoordinator.shared.cancelUpload(uploadId: uploadId)
    }

    AsyncFunction("completedParts") { (uploadId: String) -> [[String: Any]] in
      DunaBackgroundUploadCoordinator.shared.completedParts(uploadId: uploadId)
    }
  }
}

public final class DunaBackgroundUploadAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    handleEventsForBackgroundURLSession identifier: String,
    completionHandler: @escaping () -> Void
  ) {
    DunaBackgroundUploadCoordinator.shared.handleBackgroundEvents(
      identifier: identifier,
      completionHandler: completionHandler
    )
  }
}
