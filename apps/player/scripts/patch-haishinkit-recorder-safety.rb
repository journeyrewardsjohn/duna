# frozen_string_literal: true

# HaishinKit 1.9.8 delivers audio and video on different queues while keeping
# its observer collection as an unprotected Swift Array. Duna uses a primary
# recorder and a rolling replay recorder on the same stream, so removing either
# recorder while frames are being delivered can race with Array iteration.
#
# The pinned recorder also keeps accepting frames while AVAssetWriter is being
# finalized. Patch both boundaries until Duna can move to the actor-based
# recorder in a newer HaishinKit release.
module DunaHaishinKitRecorderSafetyPatch
  IO_STREAM_PATH = File.join(
    "HaishinKit",
    "Sources",
    "IO",
    "IOStream.swift"
  ).freeze
  RECORDER_PATH = File.join(
    "HaishinKit",
    "Sources",
    "IO",
    "IOStreamRecorder.swift"
  ).freeze

  OBSERVERS_ORIGINAL =
    "    private var observers: [any IOStreamObserver] = []".freeze
  OBSERVERS_PATCHED = [
    "    private let observersLock = NSLock()",
    "    private var observers: [any IOStreamObserver] = []",
    "    private var observerSnapshot: [any IOStreamObserver] {",
    "        observersLock.lock()",
    "        defer { observersLock.unlock() }",
    "        return observers",
    "    }"
  ].join("\n").freeze

  DEINIT_ORIGINAL = [
    "    deinit {",
    "        observers.removeAll()",
    "    }"
  ].join("\n").freeze
  DEINIT_PATCHED = [
    "    deinit {",
    "        observersLock.lock()",
    "        observers.removeAll()",
    "        observersLock.unlock()",
    "    }"
  ].join("\n").freeze

  ADD_OBSERVER_ORIGINAL = [
    "    public func addObserver(_ observer: any IOStreamObserver) {",
    "        guard !observers.contains(where: { $0 === observer }) else {",
    "            return",
    "        }",
    "        observers.append(observer)",
    "    }"
  ].join("\n").freeze
  ADD_OBSERVER_PATCHED = [
    "    public func addObserver(_ observer: any IOStreamObserver) {",
    "        observersLock.lock()",
    "        defer { observersLock.unlock() }",
    "        guard !observers.contains(where: { $0 === observer }) else {",
    "            return",
    "        }",
    "        observers.append(observer)",
    "    }"
  ].join("\n").freeze

  REMOVE_OBSERVER_ORIGINAL = [
    "    public func removeObserver(_ observer: any IOStreamObserver) {",
    "        if let index = observers.firstIndex(where: { $0 === observer }) {",
    "            observers.remove(at: index)",
    "        }",
    "    }"
  ].join("\n").freeze
  REMOVE_OBSERVER_PATCHED = [
    "    public func removeObserver(_ observer: any IOStreamObserver) {",
    "        observersLock.lock()",
    "        defer { observersLock.unlock() }",
    "        if let index = observers.firstIndex(where: { $0 === observer }) {",
    "            observers.remove(at: index)",
    "        }",
    "    }"
  ].join("\n").freeze

  STOP_ORIGINAL = [
    "    public func stopRunning() {",
    "        lockQueue.async {",
    "            guard self.isRunning.value else {",
    "                return",
    "            }",
    "            self.finishWriting()",
    "            self.isRunning.mutate { $0 = false }",
    "        }",
    "    }"
  ].join("\n").freeze
  STOP_PATCHED = [
    "    public func stopRunning() {",
    "        lockQueue.async {",
    "            guard self.isRunning.value else {",
    "                return",
    "            }",
    "            self.isRunning.mutate { $0 = false }",
    "            self.finishWriting()",
    "        }",
    "    }"
  ].join("\n").freeze

  def self.apply!(pods_root)
    patch_stream!(File.join(pods_root, IO_STREAM_PATH))
    patch_recorder!(File.join(pods_root, RECORDER_PATH))
  end

  def self.patch_stream!(path)
    source = read_source!(path, "IOStream.swift")
    patched = replace_exact!(
      source,
      OBSERVERS_ORIGINAL,
      OBSERVERS_PATCHED,
      "observer storage"
    )
    patched = replace_exact!(
      patched,
      DEINIT_ORIGINAL,
      DEINIT_PATCHED,
      "observer cleanup"
    )
    patched = replace_exact!(
      patched,
      ADD_OBSERVER_ORIGINAL,
      ADD_OBSERVER_PATCHED,
      "addObserver"
    )
    patched = replace_exact!(
      patched,
      REMOVE_OBSERVER_ORIGINAL,
      REMOVE_OBSERVER_PATCHED,
      "removeObserver"
    )

    if patched.include?("observers.forEach")
      count = patched.scan("observers.forEach").length
      unless count == 3
        raise(
          "Duna's HaishinKit observer delivery patch expected 3 call sites " \
          "but found #{count}. Review the pinned dependency before building."
        )
      end
      patched = patched.gsub("observers.forEach", "observerSnapshot.forEach")
    elsif patched.scan("observerSnapshot.forEach").length != 3
      raise(
        "Duna's HaishinKit observer delivery patch no longer matches the " \
        "installed source. Review the pinned dependency before building."
      )
    end

    write_source(path, source, patched)
  end
  private_class_method :patch_stream!

  def self.patch_recorder!(path)
    source = read_source!(path, "IOStreamRecorder.swift")
    patched = replace_exact!(
      source,
      STOP_ORIGINAL,
      STOP_PATCHED,
      "recorder shutdown"
    )
    write_source(path, source, patched)
  end
  private_class_method :patch_recorder!

  def self.read_source!(path, label)
    unless File.file?(path)
      raise "Duna could not locate HaishinKit #{label} at #{path}."
    end
    File.read(path)
  end
  private_class_method :read_source!

  def self.write_source(path, original, patched)
    return if patched == original

    original_mode = File.stat(path).mode
    File.chmod(original_mode | 0o200, path)
    File.write(path, patched)
  ensure
    File.chmod(original_mode, path) if original_mode
  end
  private_class_method :write_source

  def self.replace_exact!(source, original, patched, boundary)
    return source if source.include?(patched)

    unless source.include?(original)
      raise(
        "Duna's HaishinKit #{boundary} patch no longer matches the installed " \
        "source. Review the pinned dependency before building."
      )
    end

    source.sub(original, patched)
  end
  private_class_method :replace_exact!
end
