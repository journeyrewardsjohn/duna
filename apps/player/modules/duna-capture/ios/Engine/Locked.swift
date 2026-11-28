import Foundation

/// A value several queues may touch. The engine keeps almost all state on one
/// queue; this is only for the few numbers the frame callback shares with it.
final class Locked<Value>: @unchecked Sendable {
  private let lock = NSLock()
  private var value: Value

  init(_ value: Value) {
    self.value = value
  }

  func get() -> Value {
    lock.lock()
    defer { lock.unlock() }
    return value
  }

  func set(_ next: Value) {
    lock.lock()
    value = next
    lock.unlock()
  }

  @discardableResult
  func mutate<Result>(_ body: (inout Value) -> Result) -> Result {
    lock.lock()
    defer { lock.unlock() }
    return body(&value)
  }
}
