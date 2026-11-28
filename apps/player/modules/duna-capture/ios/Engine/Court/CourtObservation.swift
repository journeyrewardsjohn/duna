import CoreGraphics
import CoreMedia
import CoreVideo
import Foundation
import simd

/// What the app shows, and what is saved with a recording, about where the
/// court is. Points are fractions of the frame (0,0 top left to 1,1 bottom
/// right) so they mean the same at any resolution.
struct CourtObservation: Codable, Equatable {
  struct Point: Codable, Equatable {
    var x: Double
    var y: Double
  }

  enum Source: String, Codable {
    case automatic
    /// The player marked the four corners.
    case manual
  }

  var source: Source
  /// 0 to 1. Below about 0.5 it is a suggestion to confirm, not a detection.
  var confidence: Double
  /// The four corners in order around the court. Empty when a corner is
  /// behind the camera.
  var corners: [Point]
  /// Where the net meets the sand, and its top tape.
  var netBase: [Point]
  var netTop: [Point]
  /// Foot and top of each post.
  var posts: [[Point]]
  var cameraHeightMeters: Double
  /// "measured" (LiDAR or supplied) or "solved" (from the court's size).
  var cameraHeightSource: String
  var courtLengthMeters: Double
  var courtWidthMeters: Double
  var netHeightMeters: Double
  /// False when the tape could not be seen well enough to tell the height.
  var netHeightIdentified: Bool
  /// Court centre relative to the camera, on the sand.
  var distanceMeters: Double
  var offsetRightMeters: Double
  var yawDegrees: Double
  /// By feature name: was it seen.
  var featuresFound: [String: Bool]
  /// By feature name: how much of it is in frame, 0 to 1.
  var featuresVisible: [String: Double]
  /// What the fit was made from, so analysis can re-project later.
  var gravity: [Double]
  var focalLengthPixels: Double
  var frameWidth: Double
  var frameHeight: Double

  init(
    estimate: CourtEstimate,
    source: Source,
    intrinsics: CameraIntrinsics,
    gravity: SIMD3<Double>
  ) {
    func points(_ pixels: [CGPoint]) -> [Point] {
      pixels.map {
        Point(
          x: Double($0.x) / intrinsics.width,
          y: Double($0.y) / intrinsics.height
        )
      }
    }
    let outline = estimate.outline(intrinsics: intrinsics, gravity: gravity)
    self.source = source
    confidence = estimate.confidence
    corners = points(outline?.corners ?? [])
    netBase = points(outline?.netBase ?? [])
    netTop = points(outline?.netTop ?? [])
    posts = (outline?.posts ?? []).map(points)
    cameraHeightMeters = estimate.cameraHeight
    cameraHeightSource = estimate.cameraHeightSource.rawValue
    courtLengthMeters = estimate.dimensions.length
    courtWidthMeters = estimate.dimensions.width
    netHeightMeters = estimate.dimensions.netHeight
    netHeightIdentified = estimate.netHeightIdentified
    distanceMeters = estimate.pose.z
    offsetRightMeters = estimate.pose.x
    yawDegrees = estimate.pose.yaw * 180 / .pi
    var found: [String: Bool] = [:]
    var visible: [String: Double] = [:]
    for feature in CourtFeature.allCases {
      found[feature.name] = estimate.isDetected(feature)
      visible[feature.name] = estimate.featureVisibility[feature.rawValue]
    }
    featuresFound = found
    featuresVisible = visible
    self.gravity = [gravity.x, gravity.y, gravity.z]
    focalLengthPixels = intrinsics.fx
    frameWidth = intrinsics.width
    frameHeight = intrinsics.height
  }
}

/// Runs the court finder on live camera frames while the player is setting
/// up. It is a frame tap, so it can never hold up or interrupt a recording,
/// and it is paused automatically when the phone is hot.
final class CourtDetectionTap: CaptureFrameTap {
  struct Inputs {
    /// Gravity in the coordinates of the (already upright) camera frame.
    var gravity: SIMD3<Double>
    /// Focal length divided by the frame's longer side, used when a frame
    /// carries no lens model of its own.
    var fallbackFocalRatio: Double
    var dimensions: CourtDimensions
    var measuredCameraHeight: Double?
  }

  let identifier = "court-finder"
  let minimumInterval: TimeInterval
  let essential = false

  private let inputs: () -> Inputs?
  private let handler: (CourtObservation?) -> Void
  private var prior: CourtEstimate?
  private var priorMisses = 0

  init(
    interval: TimeInterval = 1,
    inputs: @escaping () -> Inputs?,
    handler: @escaping (CourtObservation?) -> Void
  ) {
    minimumInterval = interval
    self.inputs = inputs
    self.handler = handler
  }

  func process(_ sampleBuffer: CMSampleBuffer) {
    guard
      let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer),
      let inputs = inputs(),
      let map = EvidenceMap(pixelBuffer: pixelBuffer)
    else { return }
    let width = Double(CVPixelBufferGetWidth(pixelBuffer))
    let height = Double(CVPixelBufferGetHeight(pixelBuffer))
    let intrinsics =
      Self.intrinsics(from: sampleBuffer, width: width, height: height)
      ?? CameraIntrinsics(
        focalRatio: inputs.fallbackFocalRatio,
        width: width,
        height: height
      )

    var finder = CourtFinder()
    finder.dimensions = inputs.dimensions
    finder.options.knownCameraHeight = inputs.measuredCameraHeight
    finder.options.prior = prior
    let estimate = finder.find(
      in: map,
      intrinsics: intrinsics,
      gravity: inputs.gravity
    )
    if let estimate, estimate.confidence >= 0.5 {
      prior = estimate
      priorMisses = 0
    } else {
      // Give a good earlier answer a few frames before searching from
      // scratch: someone may just be walking through the shot.
      priorMisses += 1
      if priorMisses >= 3 { prior = nil }
    }
    handler(
      estimate.map {
        CourtObservation(
          estimate: $0,
          source: .automatic,
          intrinsics: intrinsics,
          gravity: inputs.gravity
        )
      }
    )
  }

  /// The lens model iOS attaches to a frame when asked to. Ignored if it
  /// does not look like it belongs to this frame size.
  static func intrinsics(
    from sampleBuffer: CMSampleBuffer,
    width: Double,
    height: Double
  ) -> CameraIntrinsics? {
    guard
      let data = CMGetAttachment(
        sampleBuffer,
        key: kCMSampleBufferAttachmentKey_CameraIntrinsicMatrix,
        attachmentModeOut: nil
      ) as? Data,
      data.count >= MemoryLayout<matrix_float3x3>.size
    else { return nil }
    let matrix = data.withUnsafeBytes { $0.loadUnaligned(as: matrix_float3x3.self) }
    let candidate = CameraIntrinsics(
      fx: Double(matrix.columns.0.x),
      fy: Double(matrix.columns.1.y),
      cx: Double(matrix.columns.2.x),
      cy: Double(matrix.columns.2.y),
      width: width,
      height: height
    )
    let plausible =
      candidate.fx > width * 0.3 && candidate.fx < width * 6
      && candidate.fy > height * 0.3 && candidate.fy < height * 10
      && abs(candidate.cx - width / 2) < width * 0.2
      && abs(candidate.cy - height / 2) < height * 0.2
    return plausible ? candidate : nil
  }
}
