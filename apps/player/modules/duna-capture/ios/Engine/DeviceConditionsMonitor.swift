#if os(iOS)
import Foundation
import UIKit

/// Device facts the engine reacts to, gathered on the main thread where UIKit
/// requires it and readable from any queue.
final class DeviceConditionsMonitor {
  struct Snapshot: Equatable {
    var thermal: ThermalLevel = .nominal
    var batteryPercent = -1
    var batteryCharging = false
    var inBackground = false
    /// Rotation for the capture connection, in degrees, for the way the phone
    /// is held right now. Nil while it is flat or unknown.
    var rotationAngle: CGFloat?
    var deviceOrientation = "unknown"
  }

  private let state = Locked(Snapshot())
  private var observers: [NSObjectProtocol] = []
  private var running = false

  /// Called on the main thread whenever a value changes.
  var onChange: (() -> Void)?
  /// Called on the main thread when the app has really left the foreground
  /// (not for Control Center, the notification shade or a call banner).
  var onEnterBackground: (() -> Void)?

  var snapshot: Snapshot { state.get() }

  /// Must be called on the main thread.
  func start() {
    dispatchPrecondition(condition: .onQueue(.main))
    guard !running else { return }
    running = true
    UIDevice.current.isBatteryMonitoringEnabled = true
    UIDevice.current.beginGeneratingDeviceOrientationNotifications()
    let center = NotificationCenter.default

    func observe(_ name: Notification.Name, _ body: @escaping () -> Void) {
      observers.append(
        center.addObserver(forName: name, object: nil, queue: .main) { _ in
          body()
        }
      )
    }

    observe(ProcessInfo.thermalStateDidChangeNotification) { [weak self] in
      self?.refresh()
    }
    observe(UIDevice.batteryLevelDidChangeNotification) { [weak self] in
      self?.refresh()
    }
    observe(UIDevice.batteryStateDidChangeNotification) { [weak self] in
      self?.refresh()
    }
    observe(UIDevice.orientationDidChangeNotification) { [weak self] in
      self?.refresh()
    }
    // Both the app-level and scene-level notifications are observed so this
    // holds whether or not the app adopts the scene lifecycle.
    for name in [
      UIApplication.didEnterBackgroundNotification,
      UIScene.didEnterBackgroundNotification,
    ] {
      observe(name) { [weak self] in
        guard let self else { return }
        let wasInBackground = self.state.mutate { snapshot -> Bool in
          let previous = snapshot.inBackground
          snapshot.inBackground = true
          return previous
        }
        if !wasInBackground {
          self.onEnterBackground?()
          self.onChange?()
        }
      }
    }
    for name in [
      UIApplication.willEnterForegroundNotification,
      UIScene.willEnterForegroundNotification,
    ] {
      observe(name) { [weak self] in
        guard let self else { return }
        self.state.mutate { $0.inBackground = false }
        self.refresh()
      }
    }
    refresh()
  }

  /// Must be called on the main thread.
  func stop() {
    dispatchPrecondition(condition: .onQueue(.main))
    guard running else { return }
    running = false
    observers.forEach(NotificationCenter.default.removeObserver)
    observers = []
    UIDevice.current.endGeneratingDeviceOrientationNotifications()
    UIDevice.current.isBatteryMonitoringEnabled = false
  }

  private func refresh() {
    let device = UIDevice.current
    let level = device.batteryLevel
    let percent = level < 0 ? -1 : Int((level * 100).rounded())
    let charging = device.batteryState == .charging || device.batteryState == .full
    let thermal = Self.thermalLevel(ProcessInfo.processInfo.thermalState)
    let orientation = device.orientation
    let changed = state.mutate { snapshot -> Bool in
      let before = snapshot
      snapshot.thermal = thermal
      snapshot.batteryPercent = percent
      snapshot.batteryCharging = charging
      if let angle = Self.rotationAngle(for: orientation) {
        snapshot.rotationAngle = angle
        snapshot.deviceOrientation = orientation.isLandscape ? "landscape" : "portrait"
      }
      return snapshot != before
    }
    if changed { onChange?() }
  }

  static func thermalLevel(_ state: ProcessInfo.ThermalState) -> ThermalLevel {
    switch state {
    case .nominal: return .nominal
    case .fair: return .fair
    case .serious: return .serious
    case .critical: return .critical
    @unknown default: return .fair
    }
  }

  /// The rear camera's sensor is landscape with the Lock button up. These are
  /// the rotations that make its frames upright for each way of holding it.
  static func rotationAngle(for orientation: UIDeviceOrientation) -> CGFloat? {
    switch orientation {
    case .portrait: return 90
    case .landscapeLeft: return 0
    case .landscapeRight: return 180
    case .portraitUpsideDown: return 270
    default: return nil
    }
  }
}
#endif
