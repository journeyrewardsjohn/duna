import CoreGraphics
import Foundation
import simd

/// Where the court is, and how sure we are.
struct CourtEstimate: Equatable {
  enum HeightSource: String, Codable {
    /// Measured (LiDAR) or supplied by the caller.
    case measured
    /// Worked out from the court's known size.
    case solved
  }

  var pose: CourtPose
  var cameraHeight: Double
  var cameraHeightSource: HeightSource
  var dimensions: CourtDimensions
  /// True when the tape was seen clearly enough to tell which standard net
  /// height this is. False means `dimensions.netHeight` is only the caller's
  /// default (for example when the tape sits on the horizon).
  var netHeightIdentified: Bool
  /// 0 nothing found, 1 every visible feature clearly matched.
  var confidence: Double
  /// Share of the whole court model the image agrees with, 0 to 1.
  var score: Double
  /// Share of the whole court model that is inside the frame.
  var visibleFraction: Double
  /// Per feature (indexed by `CourtFeature.rawValue`): share of it in frame.
  var featureVisibility: [Double]
  /// Per feature: share of its visible length the image agrees with, 0 to 1.
  var featureEvidence: [Double]

  func isDetected(_ feature: CourtFeature) -> Bool {
    featureVisibility[feature.rawValue] >= 0.3
      && featureEvidence[feature.rawValue] >= CourtFinder.detectedEvidence
  }
}

/// Finds a beach volleyball court in one camera frame.
///
/// The phone's gravity sensor already fixes the horizon and the plane of the
/// sand, so a court of known size has only four unknowns left: how high the
/// camera is, and the court's position and rotation on the sand. The finder
/// tries placements, projects the whole court (four boundary lines, the net
/// tape, both posts) into the frame for each, and keeps the placement the
/// image agrees with most. Because every feature votes together, a line
/// buried in sand or hidden behind a player does not break it, and the net
/// and posts carry the fit when the ribbons are hard to see.
struct CourtFinder {
  struct Options {
    /// Set when the camera height has been measured. The search is then
    /// faster and the scale is exact.
    var knownCameraHeight: Double?
    var cameraHeightCandidates = [
      0.8, 0.95, 1.1, 1.25, 1.4, 1.6, 1.8, 2.0, 2.3, 2.6, 3.0,
    ]
    /// Net heights to try. The best-matching one is reported.
    var netHeights = CourtDimensions.netHeightPresets
    /// How far ahead the court's centre may be, metres.
    var minimumDistance = 3.0
    var maximumDistance = 22.0
    /// A recent result from the same fixed camera. Tried first.
    var prior: CourtEstimate?
  }

  /// A feature counts as found when the image agrees with this share of
  /// what is visible of it.
  static let detectedEvidence = 0.4
  private static let featureCount = CourtFeature.allCases.count
  /// Share of the frame's height, either side of the horizon, that is
  /// ignored. Everything far away piles up there (waterline, fences, tree
  /// lines, buildings), and a net tape at the camera's own height lands
  /// exactly on it, so that strip can make anything look like a net.
  private static let horizonBand = 0.035
  /// Each feature has one vote, however long it is, so a single long line
  /// cannot outvote the net and both posts. The tape gets a little more: it
  /// is the one feature no beach is missing.
  private static let featureVotes: [Double] = [1, 1, 1, 1, 1.5, 1, 1]

  /// Contrast that counts as "clearly on a line" at each blur level. A point
  /// on the model contributes at most 1, so the score is a soft count of how
  /// much of the court the image agrees with, and one very bright object can
  /// never stand in for a whole line.
  private static func saturation(_ level: EvidenceMap.Level) -> Double {
    switch level {
    case .coarse: return 0.8
    case .medium: return 1.5
    case .fine: return 2.0
    }
  }

  var dimensions = CourtDimensions.beach
  var options = Options()

  struct Candidate {
    var pose: CourtPose
    var height: Double
    var score: Double
  }

  struct Evaluation {
    var score: Double
    var visibleFraction: Double
    var featureVisibility: [Double]
    var featureEvidence: [Double]
  }

  private struct Stage {
    var level: EvidenceMap.Level
    var samples: CourtSamples
    var offDistance: Double
  }

  func find(
    in map: EvidenceMap,
    intrinsics: CameraIntrinsics,
    gravity: SIMD3<Double>
  ) -> CourtEstimate? {
    let scaled = intrinsics.scaled(
      toWidth: Double(map.width),
      height: Double(map.height)
    )
    guard
      let camera = GroundCamera(intrinsics: scaled, gravity: gravity, height: 1)
    else { return nil }
    let heightIsKnown = options.knownCameraHeight != nil

    func stages(_ dimensions: CourtDimensions) -> [Stage] {
      [
        Stage(
          level: .coarse,
          samples: CourtSamples(dimensions: dimensions, spacing: 1.0),
          offDistance: 1.6
        ),
        Stage(
          level: .medium,
          samples: CourtSamples(dimensions: dimensions, spacing: 0.5),
          offDistance: 0.8
        ),
        Stage(
          level: .fine,
          samples: CourtSamples(dimensions: dimensions, spacing: 0.25),
          offDistance: 0.4
        ),
      ]
    }
    let base = stages(dimensions)
    var random = Scatter(seed: 0x00C0_FFEE)

    var best: Candidate?
    var bestDimensions = dimensions

    // A fixed camera sees the same court frame after frame: start from the
    // last answer and only search again if it no longer fits.
    if let prior = options.prior {
      let priorStages = stages(prior.dimensions)
      let start = Candidate(
        pose: prior.pose,
        height: options.knownCameraHeight ?? prior.cameraHeight,
        score: 0
      )
      let candidate = polish(
        polish(start, map: map, camera: camera, stage: priorStages[1], scale: 0.5, solveHeight: !heightIsKnown),
        map: map,
        camera: camera,
        stage: priorStages[2],
        scale: 0.25,
        solveHeight: !heightIsKnown
      )
      if candidate.score >= max(0.25, prior.score * 0.75) {
        best = candidate
        bestDimensions = prior.dimensions
      }
    }

    if best == nil {
      let seeds = coarseSearch(map: map, camera: camera, stage: base[0])
      var refined: [Candidate] = []
      for seed in seeds {
        refined.append(
          settle(
            seed,
            map: map,
            camera: camera,
            stages: base,
            spread: 1,
            solveHeight: !heightIsKnown,
            random: &random
          )
        )
      }
      refined.sort { $0.score > $1.score }
      best = refined.first

      // Which net height does the image agree with? Re-fit the strongest
      // few placements with each height and keep the best overall.
      for netHeight in options.netHeights where netHeight != dimensions.netHeight {
        var trial = dimensions
        trial.netHeight = netHeight
        let trialStages = stages(trial)
        for candidate in refined.prefix(3) {
          let fitted = settle(
            candidate,
            map: map,
            camera: camera,
            stages: Array(trialStages[1...]),
            spread: 1.4,
            solveHeight: !heightIsKnown,
            random: &random
          )
          if fitted.score > (best?.score ?? -.infinity) + 0.01 {
            best = fitted
            bestDimensions = trial
          }
        }
      }
    }

    guard let winner = best, winner.score > 0 else { return nil }
    let finalStage = stages(bestDimensions)[2]
    let evaluation = evaluate(winner, map: map, camera: camera, stage: finalStage)

    // Only claim a net height when the tape is plainly at that height and
    // plainly not at any of the others.
    let tape = CourtFeature.netTape.rawValue
    var netHeightIdentified =
      evaluation.featureVisibility[tape] >= 0.5
      && evaluation.featureEvidence[tape] >= 0.5
    if netHeightIdentified {
      for netHeight in options.netHeights where netHeight != bestDimensions.netHeight {
        var other = bestDimensions
        other.netHeight = netHeight
        let rival = evaluate(
          winner,
          map: map,
          camera: camera,
          stage: stages(other)[2]
        )
        if rival.featureEvidence[tape] > evaluation.featureEvidence[tape] - 0.25 {
          netHeightIdentified = false
          break
        }
      }
    }

    return CourtEstimate(
      pose: Self.normalised(winner.pose),
      cameraHeight: winner.height,
      cameraHeightSource: heightIsKnown ? .measured : .solved,
      dimensions: bestDimensions,
      netHeightIdentified: netHeightIdentified,
      confidence: Self.confidence(for: evaluation),
      score: evaluation.score,
      visibleFraction: evaluation.visibleFraction,
      featureVisibility: evaluation.featureVisibility,
      featureEvidence: evaluation.featureEvidence
    )
  }

  /// A court looks the same turned half a turn; report yaw within ±90°.
  private static func normalised(_ pose: CourtPose) -> CourtPose {
    var pose = pose
    while pose.yaw > .pi / 2 { pose.yaw -= .pi }
    while pose.yaw <= -.pi / 2 { pose.yaw += .pi }
    return pose
  }

  /// Confidence is about breadth: how many different parts of the court the
  /// image agrees with. One strong line (a fence, the waterline) is not a
  /// court, however clear it is.
  private static func confidence(for evaluation: Evaluation) -> Double {
    var matched = 0.0
    var visible = 0.0
    for feature in CourtFeature.allCases {
      guard evaluation.featureVisibility[feature.rawValue] >= 0.3 else { continue }
      visible += 1
      if evaluation.featureEvidence[feature.rawValue] >= detectedEvidence {
        matched += 1
      }
    }
    guard visible >= 3 else { return 0 }
    let lines = Double(
      CourtFeature.allCases.filter {
        $0.isBoundaryLine
          && evaluation.featureVisibility[$0.rawValue] >= 0.3
          && evaluation.featureEvidence[$0.rawValue] >= detectedEvidence
      }.count
    )
    // Lines on the sand are what make it a court. Net and posts alone, or
    // with a single line, could be a skyline: that is worth showing as a
    // suggestion to confirm, never as a confident detection.
    let tier: Double
    if lines >= 2, matched >= 4 {
      tier = 1
    } else if lines >= 1, matched >= 4 {
      tier = 0.5
    } else {
      tier = 0.25
    }
    return max(0, min(1, matched / visible * tier))
  }

  // MARK: - Search

  func coarseSearch(
    map: EvidenceMap,
    camera: GroundCamera,
    samples: CourtSamples
  ) -> [Candidate] {
    coarseSearch(
      map: map,
      camera: camera,
      stage: Stage(level: .coarse, samples: samples, offDistance: 1.6)
    )
  }

  private func coarseSearch(
    map: EvidenceMap,
    camera: GroundCamera,
    stage: Stage
  ) -> [Candidate] {
    let heights = options.knownCameraHeight.map { [$0] }
      ?? options.cameraHeightCandidates
    let halfView = atan((Double(map.width) / 2) / camera.intrinsics.fx)
    let widen = tan(min(1.4, halfView * 1.25))
    let yawStep = 6.0 * .pi / 180
    var pool: [Candidate] = []
    pool.reserveCapacity(4096)
    var floor = 0.0

    for height in heights {
      var yaw = -Double.pi / 2
      while yaw < Double.pi / 2 - 1e-9 {
        var z = options.minimumDistance
        while z <= options.maximumDistance {
          let xStep = min(1.0, max(0.4, z / 25))
          let span = z * widen + 2
          var x = -span
          while x <= span {
            let pose = CourtPose(yaw: yaw, x: x, z: z)
            let score = quickScore(
              pose: pose,
              height: height,
              map: map,
              camera: camera,
              stage: stage
            )
            if score > floor {
              pool.append(Candidate(pose: pose, height: height, score: score))
              if pool.count >= 4096 {
                pool.sort { $0.score > $1.score }
                pool.removeLast(pool.count - 1024)
                floor = pool.last?.score ?? floor
              }
            }
            x += xStep
          }
          z += min(2.5, max(0.75, z / 10))
        }
        yaw += yawStep
      }
    }

    pool.sort { $0.score > $1.score }
    // Keep the best few that are genuinely different placements.
    var seeds: [Candidate] = []
    for candidate in pool {
      let distinct = seeds.allSatisfy { other in
        abs(other.pose.yaw - candidate.pose.yaw) > 10 * .pi / 180
          || abs(other.pose.x - candidate.pose.x) > 1.5
          || abs(other.pose.z - candidate.pose.z) > 2.5
          || abs(other.height - candidate.height) / candidate.height > 0.25
      }
      if distinct {
        seeds.append(candidate)
        if seeds.count >= 24 { break }
      }
    }
    return seeds
  }

  /// Small deterministic source of scatter, so the same frame always gives
  /// the same answer.
  private struct Scatter {
    private var state: UInt64

    init(seed: UInt64) {
      state = seed | 1
    }

    private mutating func unit() -> Double {
      state ^= state << 13
      state ^= state >> 7
      state ^= state << 17
      return Double(state % 1_000_003) / 1_000_003
    }

    /// Roughly bell-shaped around zero, about one unit wide.
    mutating func bell() -> Double {
      (unit() + unit() + unit() + unit() - 2) * 1.73
    }
  }

  /// Takes a rough placement to a precise one. At each blur level it tries a
  /// cloud of nearby placements, keeps the best few, and tightens the cloud
  /// around them, moving all four unknowns together. That is what lets it
  /// climb out of "nearly right" placements a one-at-a-time nudge gets stuck
  /// in.
  private func settle(
    _ start: Candidate,
    map: EvidenceMap,
    camera: GroundCamera,
    stages: [Stage],
    spread: Double,
    solveHeight: Bool,
    random: inout Scatter
  ) -> Candidate {
    var centre = start
    var sigma = (
      yaw: 4.0 * .pi / 180 * spread,
      x: 0.6 * spread,
      z: 1.2 * spread,
      height: solveHeight ? 0.08 * spread : 0
    )
    let population = 128
    let keep = 12
    for (index, stage) in stages.enumerated() {
      let rounds = index == stages.count - 1 ? 2 : 3
      for _ in 0..<rounds {
        var cloud: [Candidate] = []
        cloud.reserveCapacity(population + 1)
        centre.score = quickScore(
          pose: centre.pose,
          height: centre.height,
          map: map,
          camera: camera,
          stage: stage
        )
        cloud.append(centre)
        for _ in 0..<population {
          var next = centre
          next.pose.yaw += sigma.yaw * random.bell()
          next.pose.x += sigma.x * random.bell()
          next.pose.z += sigma.z * random.bell()
          if solveHeight {
            // A different camera height rescales the whole scene around the
            // camera. Carry the court with it so this move changes the
            // court's apparent size, not where it sits in the frame.
            let ratio = exp(sigma.height * random.bell())
            next.height *= ratio
            next.pose.x *= ratio
            next.pose.z *= ratio
          }
          next.score = quickScore(
            pose: next.pose,
            height: next.height,
            map: map,
            camera: camera,
            stage: stage
          )
          cloud.append(next)
        }
        cloud.sort { $0.score > $1.score }
        let elite = cloud.prefix(keep)
        guard let top = elite.first, top.score > -.infinity else { break }
        // New centre is the best member; the cloud tightens to the spread
        // of the best few.
        func deviation(_ value: (Candidate) -> Double) -> Double {
          let mean = elite.reduce(0) { $0 + value($1) } / Double(elite.count)
          let variance = elite.reduce(0) { $0 + pow(value($1) - mean, 2) }
            / Double(elite.count)
          return variance.squareRoot()
        }
        centre = top
        sigma.yaw = max(0.15 * .pi / 180, min(sigma.yaw, deviation { $0.pose.yaw } * 1.5))
        sigma.x = max(0.02, min(sigma.x, deviation { $0.pose.x } * 1.5))
        sigma.z = max(0.04, min(sigma.z, deviation { $0.pose.z } * 1.5))
        if solveHeight {
          sigma.height = max(
            0.004,
            min(sigma.height, deviation { log($0.height) } * 1.5)
          )
        }
      }
    }
    guard let last = stages.last else { return centre }
    return polish(
      centre,
      map: map,
      camera: camera,
      stage: last,
      scale: 0.5,
      solveHeight: solveHeight
    )
  }

  /// Final tidy-up: nudge each unknown up and down, keep what improves the
  /// fit, and halve the nudge when nothing does.
  private func polish(
    _ start: Candidate,
    map: EvidenceMap,
    camera: GroundCamera,
    stage: Stage,
    scale startScale: Double,
    solveHeight: Bool
  ) -> Candidate {
    func score(_ candidate: Candidate) -> Double {
      quickScore(
        pose: candidate.pose,
        height: candidate.height,
        map: map,
        camera: camera,
        stage: stage
      )
    }
    let steps = (yaw: 0.6 * .pi / 180, x: 0.1, z: 0.2, height: 0.02)
    var current = start
    current.score = score(current)
    var scale = startScale
    var round = 0
    while round < 4 {
      var improved = false
      for index in 0..<(solveHeight ? 8 : 6) {
        var next = current
        let sign = index % 2 == 0 ? 1.0 : -1.0
        switch index / 2 {
        case 0: next.pose.yaw += sign * steps.yaw * scale
        case 1: next.pose.x += sign * steps.x * scale
        case 2: next.pose.z += sign * steps.z * scale
        default:
          // Changing height rescales the scene around the camera, so carry
          // the court with it to stay on the same pixels.
          let ratio = exp(sign * steps.height * scale)
          next.height *= ratio
          next.pose.x *= ratio
          next.pose.z *= ratio
        }
        next.score = score(next)
        if next.score > current.score + 1e-9 {
          current = next
          improved = true
        }
      }
      if !improved {
        scale /= 2
        round += 1
      }
    }
    return current
  }

  // MARK: - Scoring

  /// Internal for tests: score of one placement at one blur level.
  func quickScore(
    pose: CourtPose,
    height: Double,
    map: EvidenceMap,
    camera: GroundCamera,
    samples: CourtSamples,
    level: EvidenceMap.Level,
    offDistance: Double
  ) -> Double {
    quickScore(
      pose: pose,
      height: height,
      map: map,
      camera: camera,
      stage: Stage(level: level, samples: samples, offDistance: offDistance)
    )
  }

  private func quickScore(
    pose: CourtPose,
    height: Double,
    map: EvidenceMap,
    camera: GroundCamera,
    stage: Stage
  ) -> Double {
    var sums = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
    var seen = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
    var totals = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
    var masked = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
    accumulate(
      pose: pose,
      height: height,
      map: map,
      camera: camera,
      stage: stage,
      sums: &sums,
      seen: &seen,
      totals: &totals,
      masked: &masked
    )
    return Self.combine(sums: sums, seen: seen, totals: totals, masked: masked).score
  }

  private func evaluate(
    _ candidate: Candidate,
    map: EvidenceMap,
    camera: GroundCamera,
    stage: Stage
  ) -> Evaluation {
    var sums = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
    var seen = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
    var totals = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
    var masked = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
    accumulate(
      pose: candidate.pose,
      height: candidate.height,
      map: map,
      camera: camera,
      stage: stage,
      sums: &sums,
      seen: &seen,
      totals: &totals,
      masked: &masked
    )
    let combined = Self.combine(
      sums: sums,
      seen: seen,
      totals: totals,
      masked: masked
    )
    return Evaluation(
      score: combined.score,
      visibleFraction: combined.visibleFraction,
      featureVisibility: combined.visibility,
      featureEvidence: combined.evidence
    )
  }

  private typealias Seven = (Double, Double, Double, Double, Double, Double, Double)

  /// For each feature: the share of its visible points the image agrees
  /// with, times how much of it is in frame. Features then vote.
  ///
  /// Points lost in the horizon strip can be neither confirmed nor denied,
  /// and they earn nothing. Giving them partial credit was tried (0.3): it
  /// found one more court in forty, but two of its wrong answers then came
  /// back confident. A wrong answer that knows it is unsure is the better
  /// trade, so this stays at zero until real footage says otherwise.
  private static let horizonCredit = 0.0

  private static func combine(
    sums: Seven,
    seen: Seven,
    totals: Seven,
    masked: Seven
  ) -> (score: Double, visibleFraction: Double, visibility: [Double], evidence: [Double]) {
    let sumList = [sums.0, sums.1, sums.2, sums.3, sums.4, sums.5, sums.6]
    let seenList = [seen.0, seen.1, seen.2, seen.3, seen.4, seen.5, seen.6]
    let totalList = [
      totals.0, totals.1, totals.2, totals.3, totals.4, totals.5, totals.6,
    ]
    let maskedList = [
      masked.0, masked.1, masked.2, masked.3, masked.4, masked.5, masked.6,
    ]
    var visibility = [Double](repeating: 0, count: featureCount)
    var evidence = [Double](repeating: 0, count: featureCount)
    var votes = 0.0
    var voteTotal = 0.0
    var allInFrame = 0.0
    var allTotal = 0.0
    for index in 0..<featureCount {
      voteTotal += featureVotes[index]
      allInFrame += seenList[index] + maskedList[index]
      allTotal += totalList[index]
      guard totalList[index] > 0 else { continue }
      votes += featureVotes[index] * horizonCredit
        * maskedList[index] / totalList[index]
      guard seenList[index] > 0 else { continue }
      visibility[index] = seenList[index] / totalList[index]
      evidence[index] = sumList[index] / seenList[index]
      votes += featureVotes[index] * visibility[index] * evidence[index]
    }
    let visibleFraction = allTotal > 0 ? allInFrame / allTotal : 0
    // A sliver of court in the corner of the frame is not a detection.
    guard visibleFraction >= 0.4 else {
      return (-.infinity, visibleFraction, visibility, evidence)
    }
    return (votes / voteTotal, visibleFraction, visibility, evidence)
  }

  @inline(__always)
  private func accumulate(
    pose: CourtPose,
    height: Double,
    map: EvidenceMap,
    camera: GroundCamera,
    stage: Stage,
    sums: inout Seven,
    seen: inout Seven,
    totals: inout Seven,
    masked: inout Seven
  ) {
    let samples = stage.samples
    let level = stage.level
    let offDistance = stage.offDistance
    let scale = Self.saturation(level)
    let cosine = cos(pose.yaw)
    let sine = sin(pose.yaw)
    let right = camera.right
    let up = camera.up
    let forward = camera.forward
    let fx = camera.intrinsics.fx
    let fy = camera.intrinsics.fy
    let cx = camera.intrinsics.cx
    let cy = camera.intrinsics.cy
    // Distance of a pixel from the horizon, in pixels: the horizon is where
    // a ray is level, which gravity alone tells us.
    let horizonX = up.x / fx
    let horizonY = up.y / fy
    let horizonNorm = max(
      1e-9,
      (horizonX * horizonX + horizonY * horizonY).squareRoot()
    )
    let band = Self.horizonBand * Double(map.height)

    @inline(__always)
    func pixel(_ court: SIMD3<Double>) -> (x: Double, y: Double, ok: Bool) {
      let gx = pose.x + cosine * court.x + sine * court.z
      let gy = court.y - height
      let gz = pose.z - sine * court.x + cosine * court.z
      let px = gx * right.x + gy * up.x + gz * forward.x
      let py = gx * right.y + gy * up.y + gz * forward.y
      let pz = gx * right.z + gy * up.z + gz * forward.z
      guard pz > 0.05 else { return (0, 0, false) }
      return (fx * px / pz + cx, fy * py / pz + cy, true)
    }

    withUnsafeMutablePointer(to: &sums) { sumsPointer in
      withUnsafeMutablePointer(to: &seen) { seenPointer in
        withUnsafeMutablePointer(to: &totals) { totalsPointer in
          withUnsafeMutablePointer(to: &masked) { maskedPointer in
          let maskedBuffer = UnsafeMutableRawPointer(maskedPointer)
            .assumingMemoryBound(to: Double.self)
          let sumsBuffer = UnsafeMutableRawPointer(sumsPointer)
            .assumingMemoryBound(to: Double.self)
          let seenBuffer = UnsafeMutableRawPointer(seenPointer)
            .assumingMemoryBound(to: Double.self)
          let totalsBuffer = UnsafeMutableRawPointer(totalsPointer)
            .assumingMemoryBound(to: Double.self)
          for index in 0..<samples.count {
            let feature = samples.feature[index].rawValue
            totalsBuffer[feature] += 1
            let position = samples.position[index]
            let on = pixel(position)
            guard on.ok, map.contains(x: on.x, y: on.y) else { continue }
            let fromHorizon =
              ((on.x - cx) * horizonX + (on.y - cy) * horizonY + up.z) / horizonNorm
            guard abs(fromHorizon) > band else {
              maskedBuffer[feature] += 1
              continue
            }
            let step = samples.offDirection[index] * offDistance
            let before = pixel(position - step)
            let after = pixel(position + step)
            let onValue = Double(map.value(level, x: on.x, y: on.y))
            let beforeValue = before.ok
              ? Double(map.value(level, x: before.x, y: before.y))
              : 1
            let afterValue = after.ok
              ? Double(map.value(level, x: after.x, y: after.y))
              : 1
            let contrast = onValue - 0.5 * (beforeValue + afterValue)
            sumsBuffer[feature] += max(-0.25, min(1, contrast / scale))
            seenBuffer[feature] += 1
          }
          }
        }
      }
    }
  }
}

extension CourtEstimate {
  /// Pixel positions of the court's parts in a frame of `intrinsics`' size,
  /// for drawing the overlay and for saving with the recording.
  struct Outline {
    var corners: [CGPoint]
    /// Where the net meets the sand, sideline to sideline.
    var netBase: [CGPoint]
    /// The top tape, end to end.
    var netTop: [CGPoint]
    /// Foot and top of each post.
    var posts: [[CGPoint]]
  }

  func outline(intrinsics: CameraIntrinsics, gravity: SIMD3<Double>) -> Outline? {
    guard
      let camera = GroundCamera(
        intrinsics: intrinsics,
        gravity: gravity,
        height: cameraHeight
      )
    else { return nil }
    func point(_ court: SIMD3<Double>) -> CGPoint? {
      camera.project(pose.ground(court))
    }
    let halfWidth = dimensions.width / 2
    let netHalf = halfWidth + dimensions.netOverhang
    let postX = halfWidth + dimensions.postOffset
    let top = dimensions.netHeight
    let corners = dimensions.corners.compactMap(point)
    let netBase = [SIMD3(-halfWidth, 0, 0), SIMD3(halfWidth, 0, 0)].compactMap(point)
    let netTop = [SIMD3(-netHalf, top, 0), SIMD3(netHalf, top, 0)].compactMap(point)
    let posts = [-postX, postX].map { x in
      [SIMD3(x, 0, 0), SIMD3(x, top, 0)].compactMap(point)
    }
    guard corners.count == 4, netBase.count == 2, netTop.count == 2 else {
      return nil
    }
    return Outline(corners: corners, netBase: netBase, netTop: netTop, posts: posts)
  }
}
