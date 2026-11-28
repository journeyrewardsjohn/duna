import ExpoModulesCore
import UIKit

/// Reports the iPhone Duo's reserved regions to React Native.
///
/// APIs (confirmed in the Xcode 27.2 iOS 27.2 SDK):
/// - `UIView.reservedRegions(kind:options:)`, `UIView.ReservedRegion` with
///   `.division` and `.occlusion` kinds and the `.includeInactive` query option
///   (`UIKit.framework/Headers/UIViewReservedRegion.h` and the `UIView (ReservedRegion)`
///   category in `UIView.h`; iOS 27.1+).
/// - `UIHingeInteraction` / `UIHinge.Status` (`UIHingeInteraction.h`, `UIHinge.h`; iOS 27.1+),
///   used here only to learn when to re-query the regions and to report the status.
///   The hinge angle comes from `expo-hinge`.
public final class DunaDevicePostureModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DunaDevicePosture")

    Constant("isAvailable") {
      return DunaDevicePostureView.isAvailable
    }

    View(DunaDevicePostureView.self) {
      Events("onRegionsChange")
    }
  }
}

/// A transparent, non-interactive view placed once at the root of the app shell, filling the
/// window. It reads the regions closest to the consumer (its own window) rather than any shared
/// screen or application state, and publishes them whenever its layout, safe area, size class or
/// the hinge changes.
public final class DunaDevicePostureView: ExpoView {
  let onRegionsChange = EventDispatcher()

  private var lastPayload: NSDictionary?
  private var hingeStatus = "unavailable"
  private var hingeInteraction: UIInteraction?

  static var isAvailable: Bool {
    #if canImport(UIKit, _version: 9127.0.85) // iOS 27.1 SDK
    if #available(iOS 27.1, *) {
      return true
    }
    #endif
    return false
  }

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = false
    backgroundColor = .clear
    isAccessibilityElement = false
    accessibilityElementsHidden = true

    #if canImport(UIKit, _version: 9127.0.85)
    if #available(iOS 27.1, *) {
      let interaction = UIHingeInteraction { [weak self] _, update in
        guard let self else { return }
        self.hingeStatus = Self.statusName(update.hinge?.status)
        self.publish()
      }
      addInteraction(interaction)
      hingeInteraction = interaction
    }
    #endif

    registerForTraitChanges(
      [UITraitHorizontalSizeClass.self, UITraitVerticalSizeClass.self]
    ) { (view: DunaDevicePostureView, _: UITraitCollection) in
      view.publish()
    }
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    publish()
  }

  public override func safeAreaInsetsDidChange() {
    super.safeAreaInsetsDidChange()
    publish()
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    publish()
  }

  #if canImport(UIKit, _version: 9127.0.85)
  @available(iOS 27.1, *)
  private static func statusName(_ status: UIHinge.Status?) -> String {
    guard let status else { return "none" }
    switch status {
    case .closed: return "closed"
    case .partiallyOpen: return "partiallyOpen"
    case .fullyOpen: return "fullyOpen"
    default: return "unknown"
    }
  }

  @available(iOS 27.1, *)
  private func serialize(_ region: UIView.ReservedRegion, window: UIWindow) -> [String: Any] {
    // Report in window coordinates: the observer fills the window, but converting keeps the
    // numbers correct even if a parent ever offsets it.
    let frame = convert(region.frame, to: window)
    return [
      "id": String(describing: region.id),
      "x": frame.origin.x,
      "y": frame.origin.y,
      "width": frame.size.width,
      "height": frame.size.height,
      "margins": Self.edges(region.margins),
      "active": region.isActive,
    ]
  }
  #endif

  private static func edges(_ insets: UIEdgeInsets) -> [String: Any] {
    return [
      "top": insets.top,
      "left": insets.left,
      "bottom": insets.bottom,
      "right": insets.right,
    ]
  }

  private func publish() {
    guard let window else { return }
    var division: [[String: Any]] = []
    var occlusion: [[String: Any]] = []
    var available = false

    #if canImport(UIKit, _version: 9127.0.85)
    if #available(iOS 27.1, *) {
      available = true
      division = reservedRegions(kind: .division, options: .includeInactive)
        .map { serialize($0, window: window) }
      occlusion = reservedRegions(kind: .occlusion, options: .includeInactive)
        .map { serialize($0, window: window) }
    }
    #endif

    let payload: [String: Any] = [
      "available": available,
      "hingeStatus": hingeStatus,
      "window": [
        "width": window.bounds.size.width,
        "height": window.bounds.size.height,
      ],
      // The window's own safe area: asymmetric on the Duo, so the JS side never assumes the
      // top inset is the only one that matters.
      "safeArea": Self.edges(window.safeAreaInsets),
      "division": division,
      "occlusion": occlusion,
    ]
    let dictionary = payload as NSDictionary
    if let lastPayload, lastPayload.isEqual(dictionary) {
      return
    }
    lastPayload = dictionary
    onRegionsChange(payload)
  }
}
