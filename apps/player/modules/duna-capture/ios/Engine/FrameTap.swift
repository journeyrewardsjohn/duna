import CoreMedia
import Foundation

/// Something that wants to look at camera frames besides the recorder: the
/// Watch preview, the covered-lens check, and later a live broadcast.
///
/// A tap can never slow or break the recording. It runs on its own queue, is
/// handed at most one frame at a time, and simply misses frames it is too
/// slow for.
protocol CaptureFrameTap: AnyObject {
  var identifier: String { get }
  /// Seconds between frames; 0 asks for every frame.
  var minimumInterval: TimeInterval { get }
  /// Non-essential taps are paused when the phone is under heat pressure.
  var essential: Bool { get }
  func process(_ sampleBuffer: CMSampleBuffer)
}

final class FrameTapHub {
  private struct SlotState {
    var busy = false
    var lastDeliveredAt: TimeInterval = -.greatestFiniteMagnitude
  }

  private final class Slot {
    let tap: CaptureFrameTap
    let queue: DispatchQueue
    let state = Locked(SlotState())

    init(tap: CaptureFrameTap) {
      self.tap = tap
      queue = DispatchQueue(
        label: "co.duna.capture.tap.\(tap.identifier)",
        qos: .utility
      )
    }
  }

  private let slots = Locked<[String: Slot]>([:])

  var isEmpty: Bool { slots.get().isEmpty }

  func add(_ tap: CaptureFrameTap) {
    slots.mutate { $0[tap.identifier] = Slot(tap: tap) }
  }

  func remove(identifier: String) {
    slots.mutate { _ = $0.removeValue(forKey: identifier) }
  }

  /// Offers one frame to every tap that is due and idle. Returns how many
  /// taps accepted it.
  @discardableResult
  func deliver(
    _ sampleBuffer: CMSampleBuffer,
    allowNonEssential: Bool,
    now: TimeInterval = ProcessInfo.processInfo.systemUptime
  ) -> Int {
    var accepted = 0
    for slot in slots.get().values {
      let tap = slot.tap
      if !tap.essential && !allowNonEssential { continue }
      let claimed = slot.state.mutate { state -> Bool in
        if state.busy { return false }
        if now - state.lastDeliveredAt < tap.minimumInterval { return false }
        state.busy = true
        state.lastDeliveredAt = now
        return true
      }
      guard claimed else { continue }
      accepted += 1
      slot.queue.async {
        tap.process(sampleBuffer)
        slot.state.mutate { $0.busy = false }
      }
    }
    return accepted
  }
}
