import Foundation

enum RecordingState: String, Codable {
  /// The camera is, or was, writing this file. Found at launch, it means the
  /// app died mid-recording and the file needs recovering.
  case recording
  case finalized
  case recovered
  case failed
}

enum RecordingEndReason: String, Codable {
  case userStopped = "user-stopped"
  case enteredBackground = "entered-background"
  case cameraLost = "camera-lost"
  case storageFull = "storage-full"
  case writerFailed = "writer-failed"
  case recoveredAfterCrash = "recovered-after-crash"
}

/// A span where the camera delivered no frames. The file keeps the gap (the
/// last frame holds) so video time stays equal to wall-clock time since the
/// start, which is what score events and heart-rate samples are keyed to.
struct RecordingInterruption: Codable, Equatable {
  var reason: String
  var beganAt: Date
  var endedAt: Date?
}

struct RecordingManifest: Codable, Equatable {
  var id: String
  var state: RecordingState
  var createdAt: Date
  /// Wall-clock time of the first frame in the file.
  var startedAt: Date?
  var endedAt: Date?
  var fileName: String
  var hasAudio: Bool
  var orientation: CaptureOrientation
  var codec: CaptureCodec
  var width: Int
  var height: Int
  var framesPerSecond: Int
  var durationSeconds: Double?
  var bytes: Int64?
  var droppedFrames: Int
  var interruptions: [RecordingInterruption]
  var endReason: RecordingEndReason?
  /// Where the court was when recording started, if it was found or marked.
  var court: CourtObservation?
}

struct HealthLogEntry: Codable, Equatable {
  var at: Date
  var kind: String
  var detail: [String: String]
}

/// One folder per recording: the movie, a small manifest, and a health log.
/// The manifest is written before the first frame, so a recording the app
/// never got to finish is still discoverable on the next launch.
/// Safe to use from any queue: every file operation takes the lock.
final class RecordingJournal: @unchecked Sendable {
  let root: URL
  private let lock = NSLock()
  private let fileManager = FileManager.default
  private let encoder: JSONEncoder
  private let decoder: JSONDecoder

  init(root: URL) throws {
    self.root = root
    encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .millisecondsSince1970
    encoder.outputFormatting = [.sortedKeys]
    decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .millisecondsSince1970
    try fileManager.createDirectory(at: root, withIntermediateDirectories: true)
    // Recordings are large and re-creatable from the server once uploaded.
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    var mutableRoot = root
    try? mutableRoot.setResourceValues(values)
  }

  static func defaultRoot() throws -> URL {
    let base = try FileManager.default.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    return base
      .appendingPathComponent("DunaCapture", isDirectory: true)
      .appendingPathComponent("Recordings", isDirectory: true)
  }

  func directory(for id: String) -> URL {
    root.appendingPathComponent(id, isDirectory: true)
  }

  func movieURL(for manifest: RecordingManifest) -> URL {
    directory(for: manifest.id).appendingPathComponent(manifest.fileName)
  }

  func healthLogURL(for id: String) -> URL {
    directory(for: id).appendingPathComponent("health.jsonl")
  }

  private func manifestURL(for id: String) -> URL {
    directory(for: id).appendingPathComponent("manifest.json")
  }

  func create(
    configuration: CaptureConfiguration,
    hasAudio: Bool,
    codec: CaptureCodec,
    id: String = UUID().uuidString.lowercased(),
    now: Date = Date()
  ) throws -> RecordingManifest {
    let size = configuration.outputSize
    // Stored to the millisecond, so a manifest reads back equal to itself.
    let createdAt = Date(
      timeIntervalSince1970: (now.timeIntervalSince1970 * 1000).rounded() / 1000
    )
    let manifest = RecordingManifest(
      id: id,
      state: .recording,
      createdAt: createdAt,
      startedAt: nil,
      endedAt: nil,
      fileName: "duna-\(id).mov",
      hasAudio: hasAudio,
      orientation: configuration.orientation,
      codec: codec,
      width: size.width,
      height: size.height,
      framesPerSecond: configuration.framesPerSecond,
      durationSeconds: nil,
      bytes: nil,
      droppedFrames: 0,
      interruptions: [],
      endReason: nil
    )
    try fileManager.createDirectory(
      at: directory(for: id),
      withIntermediateDirectories: true
    )
    try write(manifest)
    return manifest
  }

  func write(_ manifest: RecordingManifest) throws {
    let data = try encoder.encode(manifest)
    lock.lock()
    defer { lock.unlock() }
    try data.write(to: manifestURL(for: manifest.id), options: .atomic)
  }

  func read(id: String) -> RecordingManifest? {
    lock.lock()
    defer { lock.unlock() }
    guard let data = try? Data(contentsOf: manifestURL(for: id)) else { return nil }
    return try? decoder.decode(RecordingManifest.self, from: data)
  }

  func all() -> [RecordingManifest] {
    let entries = (try? fileManager.contentsOfDirectory(
      at: root,
      includingPropertiesForKeys: nil
    )) ?? []
    return entries
      .compactMap { read(id: $0.lastPathComponent) }
      .sorted { $0.createdAt < $1.createdAt }
  }

  /// Recordings the app never closed. `excluding` is the one in progress now.
  func unfinished(excluding activeId: String? = nil) -> [RecordingManifest] {
    all().filter { $0.state == .recording && $0.id != activeId }
  }

  func remove(id: String) throws {
    lock.lock()
    defer { lock.unlock() }
    let target = directory(for: id)
    guard fileManager.fileExists(atPath: target.path) else { return }
    try fileManager.removeItem(at: target)
  }

  func fileSize(of manifest: RecordingManifest) -> Int64 {
    let attributes = try? fileManager.attributesOfItem(
      atPath: movieURL(for: manifest).path
    )
    return (attributes?[.size] as? NSNumber)?.int64Value ?? 0
  }

  /// Free space the system will let an app use for something the user asked
  /// for. Nil when the volume will not say.
  func freeBytes() -> Int64? {
    let values = try? root.resourceValues(
      forKeys: [.volumeAvailableCapacityForImportantUsageKey]
    )
    return values?.volumeAvailableCapacityForImportantUsage
  }

  func appendHealth(
    id: String,
    kind: String,
    detail: [String: String] = [:],
    at date: Date = Date()
  ) {
    let entry = HealthLogEntry(at: date, kind: kind, detail: detail)
    guard var line = try? encoder.encode(entry) else { return }
    line.append(0x0A)
    lock.lock()
    defer { lock.unlock() }
    let url = healthLogURL(for: id)
    if let handle = try? FileHandle(forWritingTo: url) {
      defer { try? handle.close() }
      _ = try? handle.seekToEnd()
      try? handle.write(contentsOf: line)
    } else {
      try? line.write(to: url, options: .atomic)
    }
  }

  func healthLog(id: String) -> [HealthLogEntry] {
    lock.lock()
    defer { lock.unlock() }
    guard let data = try? Data(contentsOf: healthLogURL(for: id)) else { return [] }
    return data
      .split(separator: 0x0A)
      .compactMap { try? decoder.decode(HealthLogEntry.self, from: Data($0)) }
  }
}
