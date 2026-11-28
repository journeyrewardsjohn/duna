import CoreGraphics
import XCTest
import simd

@testable import DunaCaptureEngine

final class CourtFinderTests: XCTestCase {
  /// Set DUNA_COURT_DUMP to a folder to save each rendered scene as a PNG.
  private func dumpURL(_ name: String) -> URL? {
    guard let folder = ProcessInfo.processInfo.environment["DUNA_COURT_DUMP"] else {
      return nil
    }
    return URL(fileURLWithPath: folder).appendingPathComponent("\(name).png")
  }

  private func find(
    _ scene: SyntheticScene,
    name: String,
    knownHeight: Double? = nil
  ) -> CourtEstimate? {
    var finder = CourtFinder()
    finder.options.knownCameraHeight = knownHeight
    return finder.find(
      in: scene.evidenceMap(dumpTo: dumpURL(name)),
      intrinsics: scene.intrinsics,
      gravity: scene.gravity
    )
  }

  /// How far the estimated corners are from the true ones, measured on the
  /// sand in metres, and in pixels for the corners that are inside the frame.
  /// (A corner just behind the camera moves hundreds of pixels for a
  /// centimetre of error, which says nothing about the fit.)
  private func cornerError(
    _ scene: SyntheticScene,
    _ estimate: CourtEstimate
  ) -> (metres: Double, pixels: Double) {
    guard
      let camera = GroundCamera(
        intrinsics: scene.intrinsics,
        gravity: scene.gravity,
        height: estimate.cameraHeight
      )
    else { return (.infinity, .infinity) }
    let truthPixels = scene.trueCorners
    func error(shift: Int) -> (Double, Double) {
      var metres = 0.0
      var pixels = 0.0
      var inFrame = 0.0
      for index in 0..<4 {
        let expected = scene.pose.ground(scene.dimensions.corners[index])
        let found = estimate.pose.ground(
          estimate.dimensions.corners[(index + shift) % 4]
        )
        metres += simd_length(expected - found) / 4
        guard
          let expectedPixel = truthPixels[index],
          expectedPixel.x >= 0, expectedPixel.y >= 0,
          expectedPixel.x < CGFloat(scene.width),
          expectedPixel.y < CGFloat(scene.height),
          let foundPixel = camera.project(found)
        else { continue }
        pixels += hypot(
          Double(expectedPixel.x - foundPixel.x),
          Double(expectedPixel.y - foundPixel.y)
        )
        inFrame += 1
      }
      return (metres, inFrame > 0 ? pixels / inFrame : 0)
    }
    // A court looks the same turned half a turn, so either labelling is right.
    let first = error(shift: 0)
    let second = error(shift: 2)
    return first.0 <= second.0 ? first : second
  }

  private func assertFound(
    _ scene: SyntheticScene,
    name: String,
    knownHeight: Double? = nil,
    maximumMetres: Double = 0.3,
    maximumPixels: Double = 8,
    minimumConfidence: Double = 0.5,
    file: StaticString = #filePath,
    line: UInt = #line
  ) -> CourtEstimate? {
    guard let estimate = find(scene, name: name, knownHeight: knownHeight) else {
      XCTFail("\(name): no court found", file: file, line: line)
      return nil
    }
    let error = cornerError(scene, estimate)
    let detail =
      "\(name): corners off by \(String(format: "%.2f m, %.1f px", error.metres, error.pixels)); yaw \(String(format: "%.1f", estimate.pose.yaw * 180 / .pi)) x \(String(format: "%.2f", estimate.pose.x)) z \(String(format: "%.2f", estimate.pose.z)) height \(String(format: "%.2f", estimate.cameraHeight)) score \(String(format: "%.2f", estimate.score)) confidence \(String(format: "%.2f", estimate.confidence))"
    XCTAssertLessThan(error.metres, maximumMetres, detail, file: file, line: line)
    XCTAssertLessThan(error.pixels, maximumPixels, detail, file: file, line: line)
    XCTAssertEqual(
      estimate.cameraHeight,
      scene.cameraHeight,
      accuracy: scene.cameraHeight * 0.05,
      detail,
      file: file,
      line: line
    )
    XCTAssertGreaterThanOrEqual(
      estimate.confidence,
      minimumConfidence,
      detail,
      file: file,
      line: line
    )
    return estimate
  }

  func testCameraBehindTheEndLine() {
    _ = assertFound(SyntheticScene(), name: "behind-end-line")
  }

  func testCameraOffToOneCornerLookingDiagonally() {
    var scene = SyntheticScene()
    scene.cameraHeight = 2.2
    scene.pitch = 11
    scene.pose = CourtPose(yaw: 32 * .pi / 180, x: 1.5, z: 15)
    scene.seed = 21
    _ = assertFound(scene, name: "diagonal")
  }

  func testCameraAtTheSideLookingAcrossTheNet() {
    var scene = SyntheticScene()
    scene.cameraHeight = 1.9
    scene.pitch = 9
    scene.pose = CourtPose(yaw: 88 * .pi / 180, x: 0.5, z: 15)
    scene.seed = 33
    _ = assertFound(scene, name: "side-on")
  }

  func testLowTripodSlightlyTilted() {
    var scene = SyntheticScene()
    scene.cameraHeight = 1.1
    scene.pitch = 4
    scene.roll = 2.5
    scene.pose = CourtPose(yaw: -6 * .pi / 180, x: -0.8, z: 14)
    scene.seed = 45
    _ = assertFound(scene, name: "low-tilted")
  }

  func testNearEndLineOutOfFrame() {
    var scene = SyntheticScene()
    scene.cameraHeight = 1.7
    scene.pitch = 3
    // The near end line is only about a metre ahead: below the frame.
    scene.pose = CourtPose(yaw: 0, x: 0.3, z: 9)
    scene.seed = 51
    _ = assertFound(scene, name: "near-line-cut")
  }

  func testBuriedSidelineAndCrowdedCourt() {
    var scene = SyntheticScene()
    scene.missing = [.sidelineB]
    scene.players = 9
    scene.seed = 63
    scene.pose = CourtPose(yaw: 4 * .pi / 180, x: 0.6, z: 13.5)
    guard let estimate = assertFound(scene, name: "buried-sideline") else { return }
    XCTAssertFalse(estimate.isDetected(.sidelineB), "the buried line is reported missing")
    XCTAssertTrue(estimate.isDetected(.netTape))
  }

  func testLinesMostlyGoneNetAndPostsCarryTheFit() {
    var scene = SyntheticScene()
    scene.missing = [.sidelineA, .sidelineB, .endLineB]
    scene.seed = 71
    scene.pose = CourtPose(yaw: -3 * .pi / 180, x: -0.4, z: 13)
    // With one ribbon left the scale comes from a measured camera height,
    // and the result is offered as a suggestion to confirm, not a certainty.
    let estimate = assertFound(
      scene,
      name: "net-and-posts",
      knownHeight: scene.cameraHeight,
      maximumMetres: 0.5,
      maximumPixels: 10,
      minimumConfidence: 0.25
    )
    XCTAssertLessThan(estimate?.confidence ?? 1, 0.5, "one line is not certainty")
  }

  func testMeasuredCameraHeightIsUsedAsGiven() {
    var scene = SyntheticScene()
    scene.cameraHeight = 1.45
    scene.pose = CourtPose(yaw: 12 * .pi / 180, x: -1, z: 14)
    scene.seed = 83
    let estimate = assertFound(scene, name: "known-height", knownHeight: 1.45)
    XCTAssertEqual(estimate?.cameraHeight, 1.45)
    XCTAssertEqual(estimate?.cameraHeightSource, .measured)
  }

  func testWomensNetHeightIsRecognised() {
    var scene = SyntheticScene()
    scene.dimensions.netHeight = 2.24
    scene.seed = 91
    let estimate = assertFound(scene, name: "womens-net")
    XCTAssertEqual(estimate?.dimensions.netHeight, 2.24)
    XCTAssertEqual(estimate?.netHeightIdentified, true)
  }

  func testMensNetHeightIsRecognised() {
    var scene = SyntheticScene()
    scene.dimensions.netHeight = 2.43
    scene.seed = 92
    let estimate = assertFound(scene, name: "mens-net")
    XCTAssertEqual(estimate?.dimensions.netHeight, 2.43)
  }

  /// The failure the old detector was known for: calling a patch of ground a
  /// court. Sand, people and a horizon must not be enough.
  func testEmptyBeachIsNotCalledACourt() {
    var scene = SyntheticScene()
    scene.drawCourt = false
    scene.players = 8
    scene.seed = 101
    let estimate = find(scene, name: "empty-beach")
    XCTAssertLessThan(estimate?.confidence ?? 0, 0.3)
  }

  /// Many randomly generated setups, so the detector is measured rather than
  /// shown off on hand-picked cases. Camera height, tilt, distance, angle,
  /// crowding, net height and one buried line all vary.
  func testRandomCameraPlacements() {
    var random = SeededRandom(seed: 2026)
    let trials = 40
    var found = 0
    var netHeightClaimed = 0
    var netHeightRight = 0
    var worstMetres = 0.0
    var misses: [String] = []
    for trial in 0..<trials {
      var scene = SyntheticScene()
      scene.seed = UInt64(1000 + trial)
      scene.cameraHeight = random.range(1.0, 2.8)
      scene.pitch = random.range(3, 13)
      scene.roll = random.range(-3, 3)
      let yaw = random.range(-90, 90)
      scene.pose = CourtPose(
        yaw: yaw * .pi / 180,
        x: random.range(-2, 2),
        z: random.range(11.5, 16.5)
      )
      scene.players = Int(random.range(2, 9))
      scene.dimensions.netHeight =
        CourtDimensions.netHeightPresets[Int(random.range(0, 3.99))]
      if random.next() < 0.35 {
        scene.missing = [
          [.sidelineA, .sidelineB, .endLineA, .endLineB][Int(random.range(0, 3.99))]
        ]
      }
      let known = random.next() < 0.3 ? scene.cameraHeight : nil
      let label =
        "#\(trial) h \(String(format: "%.2f", scene.cameraHeight)) pitch \(String(format: "%.0f", scene.pitch)) yaw \(String(format: "%.0f", yaw)) z \(String(format: "%.1f", scene.pose.z)) missing \(scene.missing.map { "\($0)" })"
      guard let estimate = find(scene, name: "random-\(trial)", knownHeight: known)
      else {
        misses.append(label + " -> nothing")
        continue
      }
      let error = cornerError(scene, estimate)
      if error.metres < 0.4, estimate.confidence >= 0.5 {
        found += 1
        worstMetres = max(worstMetres, error.metres)
        if estimate.netHeightIdentified {
          netHeightClaimed += 1
          if estimate.dimensions.netHeight == scene.dimensions.netHeight {
            netHeightRight += 1
          }
        }
      } else {
        misses.append(
          label
            + " -> \(String(format: "%.2f m, confidence %.2f", error.metres, estimate.confidence))"
        )
      }
    }
    print(
      "COURT-BATCH found \(found)/\(trials); net height claimed in \(netHeightClaimed), right in \(netHeightRight); worst accepted error \(String(format: "%.2f", worstMetres)) m"
    )
    misses.forEach { print("COURT-BATCH miss \($0)") }
    XCTAssertGreaterThanOrEqual(found, Int(Double(trials) * 0.85))
    // A claimed net height must be dependable; "not sure" is always allowed.
    XCTAssertGreaterThanOrEqual(netHeightClaimed, found / 3)
    XCTAssertGreaterThanOrEqual(
      Double(netHeightRight),
      Double(netHeightClaimed) * 0.9
    )
  }

  /// The other half of honesty: beaches with people, buildings and a
  /// horizon but no court must never produce a confident detection.
  func testRandomEmptyBeachesNeverGiveAConfidentCourt() {
    var random = SeededRandom(seed: 77)
    var highest = 0.0
    for trial in 0..<20 {
      var scene = SyntheticScene()
      scene.drawCourt = false
      scene.seed = UInt64(5000 + trial)
      scene.cameraHeight = random.range(1.0, 2.8)
      scene.pitch = random.range(3, 13)
      scene.roll = random.range(-3, 3)
      scene.players = Int(random.range(0, 10))
      let confidence = find(scene, name: "empty-\(trial)")?.confidence ?? 0
      highest = max(highest, confidence)
    }
    print("COURT-BATCH empty beaches: highest confidence \(String(format: "%.2f", highest))")
    XCTAssertLessThan(highest, 0.5)
  }

  func testPriorFromTheSameTripodIsReusedAndStaysAccurate() {
    let scene = SyntheticScene()
    let map = scene.evidenceMap()
    var finder = CourtFinder()
    guard
      let first = finder.find(in: map, intrinsics: scene.intrinsics, gravity: scene.gravity)
    else { return XCTFail("no court found") }
    // Time a fresh search and a tracked one back to back, so the comparison
    // holds however busy the machine is.
    var fresh = CourtFinder()
    let freshStart = Date()
    _ = fresh.find(in: map, intrinsics: scene.intrinsics, gravity: scene.gravity)
    let freshTime = Date().timeIntervalSince(freshStart)
    fresh.options.prior = nil

    finder.options.prior = first
    let started = Date()
    let second = finder.find(in: map, intrinsics: scene.intrinsics, gravity: scene.gravity)
    let elapsed = Date().timeIntervalSince(started)

    XCTAssertNotNil(second)
    XCTAssertLessThan(cornerError(scene, second ?? first).metres, 0.3)
    XCTAssertLessThan(
      elapsed,
      freshTime / 3,
      "tracking a known court must be much cheaper than finding it"
    )
  }
}

final class CourtGeometryTests: XCTestCase {
  func testGravityIsDownInTheFrameForEveryWayOfHoldingThePhone() {
    // Portrait, upright: gravity runs toward the bottom of the screen.
    XCTAssertEqual(
      DeviceGravity.inCameraFrame(deviceGravity: SIMD3(0, -1, 0), rotationAngle: 90),
      SIMD3(0, 1, 0)
    )
    // Landscape with the Lock button up: the screen's right edge is down.
    XCTAssertEqual(
      DeviceGravity.inCameraFrame(deviceGravity: SIMD3(-1, 0, 0), rotationAngle: 0),
      SIMD3(0, 1, 0)
    )
    // Landscape the other way up.
    XCTAssertEqual(
      DeviceGravity.inCameraFrame(deviceGravity: SIMD3(1, 0, 0), rotationAngle: 180),
      SIMD3(0, 1, 0)
    )
    // Lying on its back, lens toward the ground: gravity is along the view.
    XCTAssertEqual(
      DeviceGravity.inCameraFrame(deviceGravity: SIMD3(0, 0, -1), rotationAngle: 90),
      SIMD3(0, 0, 1)
    )
  }

  func testProjectionAndGroundLookupAreInverses() throws {
    let scene = SyntheticScene()
    let camera = scene.camera
    let point = SIMD3<Double>(2.5, 0, 11)
    let pixel = try XCTUnwrap(camera.project(point))
    let back = try XCTUnwrap(camera.groundPoint(atPixel: pixel))
    XCTAssertEqual(back.x, point.x, accuracy: 1e-6)
    XCTAssertEqual(back.z, point.z, accuracy: 1e-6)
    XCTAssertEqual(camera.pitch, 8 * .pi / 180, accuracy: 1e-9)
  }

  func testPixelsAboveTheHorizonHaveNoGroundPoint() {
    let camera = SyntheticScene().camera
    XCTAssertNil(camera.groundPoint(atPixel: CGPoint(x: 480, y: 5)))
  }

  func testCameraPointingStraightDownIsRejected() {
    let scene = SyntheticScene()
    XCTAssertNil(
      GroundCamera(intrinsics: scene.intrinsics, gravity: SIMD3(0, 0, 1), height: 1.5)
    )
  }

  func testFourHandMarkedCornersGiveCourtPositionAndCameraHeight() throws {
    var scene = SyntheticScene()
    scene.cameraHeight = 2.05
    scene.pitch = 10
    scene.pose = CourtPose(yaw: 24 * .pi / 180, x: -1.2, z: 15)
    // Tapped in a scrambled order.
    let corners = scene.trueCorners.compactMap { $0 }
    let scrambled = [corners[2], corners[0], corners[3], corners[1]]

    let solution = try XCTUnwrap(
      ManualCourtSolver.solve(
        corners: scrambled,
        intrinsics: scene.intrinsics,
        gravity: scene.gravity,
        dimensions: scene.dimensions
      )
    )

    XCTAssertEqual(solution.cameraHeight, 2.05, accuracy: 0.01)
    XCTAssertEqual(solution.pose.x, -1.2, accuracy: 0.02)
    XCTAssertEqual(solution.pose.z, 15, accuracy: 0.02)
    XCTAssertEqual(solution.pose.yaw, 24 * .pi / 180, accuracy: 0.002)
    XCTAssertLessThan(solution.residual, 0.01)
  }

  func testSloppyCornersAreFlaggedByTheirResidual() throws {
    let scene = SyntheticScene()
    var corners = scene.trueCorners.compactMap { $0 }
    corners[2].x += 60
    corners[2].y -= 12
    let solution = try XCTUnwrap(
      ManualCourtSolver.solve(
        corners: corners,
        intrinsics: scene.intrinsics,
        gravity: scene.gravity,
        dimensions: scene.dimensions
      )
    )
    XCTAssertGreaterThan(solution.residual, 0.03)
  }

  /// A LiDAR-style depth frame of flat sand with a bag standing on it.
  func testLidarDepthGivesCameraHeightAndIgnoresObjectsOnTheSand() throws {
    var scene = SyntheticScene()
    scene.width = 256
    scene.height = 192
    scene.cameraHeight = 1.42
    scene.pitch = 22
    let camera = scene.camera
    var depths = [Float](repeating: .nan, count: scene.width * scene.height)
    for row in 0..<scene.height {
      for column in 0..<scene.width {
        guard
          let ground = camera.groundPoint(
            atPixel: CGPoint(x: Double(column), y: Double(row))
          )
        else { continue }
        var depth = camera.cameraPoint(ground).z
        // A bag 0.4 m tall in the lower right of the view.
        if column > 170, row > 120 { depth *= (1.42 - 0.4) / 1.42 }
        if depth < 5 { depths[row * scene.width + column] = Float(depth) }
      }
    }

    let result = try XCTUnwrap(
      GroundHeightEstimator.estimate(
        depths: depths,
        width: scene.width,
        height: scene.height,
        intrinsics: scene.intrinsics,
        gravity: scene.gravity
      )
    )

    XCTAssertEqual(result.cameraHeight, 1.42, accuracy: 0.03)
    XCTAssertGreaterThan(result.support, 0.5)
  }

  func testDepthFrameWithNoGroundInRangeGivesNoHeight() {
    let scene = SyntheticScene()
    let depths = [Float](repeating: .nan, count: 64 * 48)
    XCTAssertNil(
      GroundHeightEstimator.estimate(
        depths: depths,
        width: 64,
        height: 48,
        intrinsics: scene.intrinsics.scaled(toWidth: 64, height: 48),
        gravity: scene.gravity
      )
    )
  }
}
