import Foundation
import simd

/// A beach volleyball court as a physical object, in metres.
///
/// Court frame: origin at the centre of the court on the sand, X along the
/// net, Y up, Z along the length. The net stands in the plane Z = 0.
struct CourtDimensions: Codable, Equatable {
  /// End line to end line.
  var length = 16.0
  /// Sideline to sideline.
  var width = 8.0
  /// Top of the net tape above the sand.
  var netHeight = 2.43
  /// How far outside each sideline the posts stand (0.7 to 1.0 m by rule).
  var postOffset = 0.85
  /// How far the net extends past each sideline (an 8.5 m net on an 8 m court).
  var netOverhang = 0.25

  static let beach = CourtDimensions()
  /// Men, women, and the two common junior heights.
  static let netHeightPresets = [2.43, 2.24, 2.12, 2.0]

  /// Corners in a fixed order around the court.
  var corners: [SIMD3<Double>] {
    let halfWidth = width / 2
    let halfLength = length / 2
    return [
      SIMD3(-halfWidth, 0, -halfLength),
      SIMD3(halfWidth, 0, -halfLength),
      SIMD3(halfWidth, 0, halfLength),
      SIMD3(-halfWidth, 0, halfLength),
    ]
  }
}

enum CourtFeature: Int, CaseIterable, Codable {
  case endLineA
  case endLineB
  case sidelineA
  case sidelineB
  case netTape
  case postA
  case postB

  var isBoundaryLine: Bool { rawValue <= CourtFeature.sidelineB.rawValue }

  var name: String {
    switch self {
    case .endLineA: return "endLineA"
    case .endLineB: return "endLineB"
    case .sidelineA: return "sidelineA"
    case .sidelineB: return "sidelineB"
    case .netTape: return "netTape"
    case .postA: return "postA"
    case .postB: return "postB"
    }
  }
}

/// Where the court sits on the sand relative to the camera.
///
/// Ground frame: origin on the sand directly below the camera, X to the
/// camera's right, Y up, Z straight ahead along the ground.
struct CourtPose: Codable, Equatable {
  /// Rotation of the court's length axis away from straight ahead, radians.
  var yaw: Double
  /// Court centre, metres to the right of the camera.
  var x: Double
  /// Court centre, metres ahead of the camera.
  var z: Double

  func ground(_ court: SIMD3<Double>) -> SIMD3<Double> {
    let cosine = cos(yaw)
    let sine = sin(yaw)
    return SIMD3(
      x + cosine * court.x + sine * court.z,
      court.y,
      z - sine * court.x + cosine * court.z
    )
  }
}

/// The court broken into points to look for in an image. Each point also
/// knows which way is "just beside it", so a real line can be told apart
/// from an evenly textured area.
struct CourtSamples {
  var position: [SIMD3<Double>] = []
  /// Unit direction, in the court frame, to step off the feature.
  var offDirection: [SIMD3<Double>] = []
  var weight: [Double] = []
  var feature: [CourtFeature] = []

  var count: Int { position.count }
  var totalWeight: Double { weight.reduce(0, +) }

  init(dimensions: CourtDimensions, spacing: Double) {
    let halfWidth = dimensions.width / 2
    let halfLength = dimensions.length / 2
    let netHalf = halfWidth + dimensions.netOverhang
    let postX = halfWidth + dimensions.postOffset
    // The net height is measured to the top edge of the tape, which is a
    // band about 8 cm deep. Aim for the middle of the band.
    let top = dimensions.netHeight
    let tape = top - 0.04

    func add(
      _ feature: CourtFeature,
      from start: SIMD3<Double>,
      to end: SIMD3<Double>,
      off: SIMD3<Double>,
      weight: Double
    ) {
      let length = simd_length(end - start)
      let steps = max(2, Int((length / spacing).rounded()))
      for index in 0...steps {
        let t = Double(index) / Double(steps)
        position.append(start + (end - start) * t)
        offDirection.append(off)
        self.weight.append(weight)
        self.feature.append(feature)
      }
    }

    add(
      .endLineA,
      from: SIMD3(-halfWidth, 0, -halfLength),
      to: SIMD3(halfWidth, 0, -halfLength),
      off: SIMD3(0, 0, 1),
      weight: 1
    )
    add(
      .endLineB,
      from: SIMD3(-halfWidth, 0, halfLength),
      to: SIMD3(halfWidth, 0, halfLength),
      off: SIMD3(0, 0, 1),
      weight: 1
    )
    add(
      .sidelineA,
      from: SIMD3(-halfWidth, 0, -halfLength),
      to: SIMD3(-halfWidth, 0, halfLength),
      off: SIMD3(1, 0, 0),
      weight: 1
    )
    add(
      .sidelineB,
      from: SIMD3(halfWidth, 0, -halfLength),
      to: SIMD3(halfWidth, 0, halfLength),
      off: SIMD3(1, 0, 0),
      weight: 1
    )
    // The net and posts stand well clear of the sand and of buried lines, so
    // they count for more per metre than a boundary ribbon does.
    add(
      .netTape,
      from: SIMD3(-netHalf, tape, 0),
      to: SIMD3(netHalf, tape, 0),
      off: SIMD3(0, 1, 0),
      weight: 1.6
    )
    add(
      .postA,
      from: SIMD3(-postX, 0.3, 0),
      to: SIMD3(-postX, top, 0),
      off: SIMD3(1, 0, 0),
      weight: 1.2
    )
    add(
      .postB,
      from: SIMD3(postX, 0.3, 0),
      to: SIMD3(postX, top, 0),
      off: SIMD3(1, 0, 0),
      weight: 1.2
    )
  }
}
