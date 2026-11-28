import CoreGraphics
import Foundation
import simd

/// Pinhole description of the lens for one frame size, in pixels.
struct CameraIntrinsics: Equatable {
  var fx: Double
  var fy: Double
  var cx: Double
  var cy: Double
  var width: Double
  var height: Double

  /// From the field of view iOS reports for a camera format. `degrees` is the
  /// angle across the longer side of the sensor.
  static func fromFieldOfView(
    degrees: Double,
    width: Double,
    height: Double
  ) -> CameraIntrinsics {
    let longSide = max(width, height)
    let focal = (longSide / 2) / tan(degrees * .pi / 360)
    return CameraIntrinsics(
      fx: focal,
      fy: focal,
      cx: width / 2,
      cy: height / 2,
      width: width,
      height: height
    )
  }

  /// Focal length given as a fraction of the frame's longer side, which
  /// stays the same however the frame is rotated or resized.
  init(focalRatio: Double, width: Double, height: Double) {
    let focal = focalRatio * max(width, height)
    self.init(
      fx: focal,
      fy: focal,
      cx: width / 2,
      cy: height / 2,
      width: width,
      height: height
    )
  }

  init(fx: Double, fy: Double, cx: Double, cy: Double, width: Double, height: Double) {
    self.fx = fx
    self.fy = fy
    self.cx = cx
    self.cy = cy
    self.width = width
    self.height = height
  }

  var focalRatio: Double { fx / max(width, height) }

  func scaled(toWidth newWidth: Double, height newHeight: Double) -> CameraIntrinsics {
    let sx = newWidth / width
    let sy = newHeight / height
    return CameraIntrinsics(
      fx: fx * sx,
      fy: fy * sy,
      cx: cx * sx,
      cy: cy * sy,
      width: newWidth,
      height: newHeight
    )
  }
}

/// A camera whose tilt is known from the phone's gravity sensor.
///
/// Knowing which way is down removes most of the guesswork from finding a
/// court: the horizon is fixed, the sand is a known plane, and the only
/// things left to find are the camera's height and where the court sits.
///
/// Camera coordinates: x right, y down, z forward into the scene.
struct GroundCamera {
  let intrinsics: CameraIntrinsics
  /// The ground frame's axes written in camera coordinates.
  let right: SIMD3<Double>
  let up: SIMD3<Double>
  let forward: SIMD3<Double>
  /// Lens height above the sand, metres.
  var height: Double

  /// Fails when the camera points almost straight up or down, where "ahead
  /// along the ground" has no meaning.
  init?(intrinsics: CameraIntrinsics, gravity: SIMD3<Double>, height: Double) {
    let magnitude = simd_length(gravity)
    guard magnitude > 1e-6, height > 0 else { return nil }
    let up = -gravity / magnitude
    let optical = SIMD3<Double>(0, 0, 1)
    let flattened = optical - simd_dot(optical, up) * up
    guard simd_length(flattened) > 0.08 else { return nil }
    let forward = simd_normalize(flattened)
    self.intrinsics = intrinsics
    self.up = up
    self.forward = forward
    right = simd_cross(forward, up)
    self.height = height
  }

  func cameraPoint(_ ground: SIMD3<Double>) -> SIMD3<Double> {
    ground.x * right + (ground.y - height) * up + ground.z * forward
  }

  /// Pixel position of a ground-frame point, or nil when it is behind the lens.
  func project(_ ground: SIMD3<Double>) -> CGPoint? {
    let point = cameraPoint(ground)
    guard point.z > 0.05 else { return nil }
    return CGPoint(
      x: intrinsics.fx * point.x / point.z + intrinsics.cx,
      y: intrinsics.fy * point.y / point.z + intrinsics.cy
    )
  }

  /// Where the ray through a pixel meets the sand, or nil at or above the
  /// horizon.
  func groundPoint(atPixel pixel: CGPoint) -> SIMD3<Double>? {
    let ray = SIMD3<Double>(
      (Double(pixel.x) - intrinsics.cx) / intrinsics.fx,
      (Double(pixel.y) - intrinsics.cy) / intrinsics.fy,
      1
    )
    let vertical = simd_dot(ray, up)
    guard vertical < -1e-4 else { return nil }
    let distance = height / -vertical
    return SIMD3(
      simd_dot(ray, right) * distance,
      0,
      simd_dot(ray, forward) * distance
    )
  }

  /// Downward tilt of the lens, radians. Positive looks at the sand.
  var pitch: Double {
    asin(max(-1, min(1, -simd_dot(SIMD3<Double>(0, 0, 1), up))))
  }
}

enum DeviceGravity {
  /// Converts Core Motion's gravity (device axes: x toward the right edge of
  /// the screen, y toward the top, z out of the screen) into the coordinates
  /// of a rear-camera frame that has been rotated upright by `rotationAngle`
  /// degrees (0 landscape with the Lock button up, 90 portrait, 180, 270).
  static func inCameraFrame(
    deviceGravity gravity: SIMD3<Double>,
    rotationAngle: Int
  ) -> SIMD3<Double> {
    let xAxis: SIMD3<Double>
    let yAxis: SIMD3<Double>
    switch ((rotationAngle % 360) + 360) % 360 {
    case 90:
      xAxis = SIMD3(1, 0, 0)
      yAxis = SIMD3(0, -1, 0)
    case 180:
      xAxis = SIMD3(0, 1, 0)
      yAxis = SIMD3(1, 0, 0)
    case 270:
      xAxis = SIMD3(-1, 0, 0)
      yAxis = SIMD3(0, 1, 0)
    default:
      xAxis = SIMD3(0, -1, 0)
      yAxis = SIMD3(-1, 0, 0)
    }
    // The rear camera looks out of the back of the phone.
    let zAxis = SIMD3<Double>(0, 0, -1)
    return SIMD3(
      simd_dot(gravity, xAxis),
      simd_dot(gravity, yAxis),
      simd_dot(gravity, zAxis)
    )
  }
}

/// The player marked the four corners by hand. With gravity known, those four
/// points give the court's position and the camera's height directly.
struct ManualCourtSolution: Equatable {
  var pose: CourtPose
  var cameraHeight: Double
  /// 0 when the marked shape is exactly a court; grows as it departs from one.
  var residual: Double
}

enum ManualCourtSolver {
  static func solve(
    corners: [CGPoint],
    intrinsics: CameraIntrinsics,
    gravity: SIMD3<Double>,
    dimensions: CourtDimensions
  ) -> ManualCourtSolution? {
    guard corners.count == 4,
      let camera = GroundCamera(intrinsics: intrinsics, gravity: gravity, height: 1)
    else { return nil }
    var ground: [SIMD3<Double>] = []
    for corner in corners {
      guard let point = camera.groundPoint(atPixel: corner) else { return nil }
      ground.append(point)
    }
    // Walk the corners in order around their centre, whatever order they
    // were tapped in.
    let centre = ground.reduce(SIMD3<Double>.zero, +) / 4
    ground.sort {
      atan2($0.z - centre.z, $0.x - centre.x) < atan2($1.z - centre.z, $1.x - centre.x)
    }
    let sides = (0..<4).map { ground[($0 + 1) % 4] - ground[$0] }
    let lengths = sides.map { simd_length($0) }
    let first = (lengths[0] + lengths[2]) / 2
    let second = (lengths[1] + lengths[3]) / 2
    guard first > 1e-6, second > 1e-6 else { return nil }
    let firstIsLength = first >= second
    let long = max(first, second)
    let short = min(first, second)
    // Everything was measured with a camera height of 1, so the scale that
    // makes the shape court-sized is the true camera height.
    let scale = (dimensions.length / long + dimensions.width / short) / 2
    let expectedRatio = dimensions.length / dimensions.width
    let residual = abs(long / short - expectedRatio) / expectedRatio

    let a = firstIsLength ? sides[0] : sides[1]
    let b = firstIsLength ? sides[2] : sides[3]
    var axis = a - b
    if simd_length(axis) < 1e-9 { axis = a }
    // Yaw is only defined up to a half turn; keep it within ±90°.
    var yaw = atan2(axis.x, axis.z)
    if yaw > .pi / 2 { yaw -= .pi }
    if yaw <= -.pi / 2 { yaw += .pi }

    return ManualCourtSolution(
      pose: CourtPose(yaw: yaw, x: centre.x * scale, z: centre.z * scale),
      cameraHeight: scale,
      residual: residual
    )
  }
}

/// Camera height from a LiDAR depth frame.
///
/// LiDAR reaches about five metres, so it cannot see court lines or the net.
/// What it can measure well is the sand right in front of the tripod, which
/// pins the camera's height and with it the scale of everything else.
enum GroundHeightEstimator {
  struct Result: Equatable {
    var cameraHeight: Double
    /// Share of usable depth points that lie on the ground found.
    var support: Double
  }

  /// `depths` are metres along the lens axis, row by row. `intrinsics` must
  /// describe the depth map's own size.
  static func estimate(
    depths: [Float],
    width: Int,
    height: Int,
    intrinsics: CameraIntrinsics,
    gravity: SIMD3<Double>
  ) -> Result? {
    let magnitude = simd_length(gravity)
    guard magnitude > 1e-6, depths.count == width * height else { return nil }
    let down = gravity / magnitude
    let binSize = 0.02
    let maximumDrop = 5.0
    var histogram = [Int](repeating: 0, count: Int(maximumDrop / binSize) + 1)
    var usable = 0
    let step = max(1, min(width, height) / 90)
    for row in stride(from: 0, to: height, by: step) {
      for column in stride(from: 0, to: width, by: step) {
        let depth = Double(depths[row * width + column])
        guard depth.isFinite, depth > 0.25, depth < 5.5 else { continue }
        let point = SIMD3<Double>(
          (Double(column) - intrinsics.cx) / intrinsics.fx * depth,
          (Double(row) - intrinsics.cy) / intrinsics.fy * depth,
          depth
        )
        let drop = simd_dot(point, down)
        guard drop > 0.3, drop < maximumDrop else { continue }
        histogram[Int(drop / binSize)] += 1
        usable += 1
      }
    }
    guard usable >= 60 else { return nil }
    // The sand is the lowest surface with real support. Things standing on
    // it (bags, feet, a ball cart) sit above it, so prefer the deepest peak
    // that is not just a few stray points.
    guard let tallest = histogram.max(), tallest >= 12 else { return nil }
    var peak = histogram.firstIndex(of: tallest) ?? 0
    for index in stride(from: histogram.count - 1, to: peak, by: -1)
    where histogram[index] * 2 >= tallest {
      peak = index
      break
    }
    var weighted = 0.0
    var total = 0
    for index in max(0, peak - 2)...min(histogram.count - 1, peak + 2) {
      weighted += (Double(index) + 0.5) * binSize * Double(histogram[index])
      total += histogram[index]
    }
    guard total > 0 else { return nil }
    return Result(
      cameraHeight: weighted / Double(total),
      support: Double(total) / Double(usable)
    )
  }
}
