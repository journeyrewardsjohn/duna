import AVFoundation
import ExpoModulesCore
import UIKit

/// The live camera picture. It only displays: mounting, unmounting or
/// resizing it never starts, stops or reconfigures the camera.
public final class DunaCaptureView: ExpoView {
  private let previewLayer = AVCaptureVideoPreviewLayer()

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = .black
    previewLayer.videoGravity = .resizeAspectFill
    layer.addSublayer(previewLayer)
    DunaCaptureHost.shared.register(self)
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    previewLayer.frame = bounds
    CATransaction.commit()
    updatePreviewRotation()
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    updatePreviewRotation()
  }

  func attach(session: AVCaptureSession) {
    previewLayer.session = session
    updatePreviewRotation()
  }

  func setFill(_ fill: Bool) {
    previewLayer.videoGravity = fill ? .resizeAspectFill : .resizeAspect
  }

  /// The preview follows the interface, so it is upright however the screen
  /// is laid out. The recording's own orientation is the engine's business.
  func updatePreviewRotation() {
    guard let connection = previewLayer.connection else { return }
    let orientation =
      window?.windowScene?.effectiveGeometry.interfaceOrientation ?? .portrait
    let angle: CGFloat
    switch orientation {
    case .landscapeRight: angle = 0
    case .landscapeLeft: angle = 180
    case .portraitUpsideDown: angle = 270
    default: angle = 90
    }
    if connection.isVideoRotationAngleSupported(angle) {
      connection.videoRotationAngle = angle
    }
  }

  /// The screen this view is on. With resizable windows and more than one
  /// display there is no single "main" screen to ask.
  var hostScreen: UIScreen? {
    window?.windowScene?.screen
  }
}
