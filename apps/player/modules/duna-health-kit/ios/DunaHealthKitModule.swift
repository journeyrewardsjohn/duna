import ExpoModulesCore
import Foundation
import HealthKit

private struct HealthTypeDefinition {
  let metric: String
  let category: String
  let sampleType: HKSampleType
  let unit: HKUnit?
  let unitLabel: String?
  let multiplier: Double
}

private struct HealthQueryResult {
  let samples: [[String: Any]]
  let deletedIDs: [String]
  let anchor: HKQueryAnchor?
  let hasMore: Bool
}

private enum DunaHealthKitError: Error {
  case unavailable
  case invalidCategories
  case invalidCursor
  case invalidResponse
}

private final class DunaHealthStore: @unchecked Sendable {
  static let shared = DunaHealthStore()

  let store = HKHealthStore()
  var observers: [HKObserverQuery] = []
  var emitChange: ((String) -> Void)?

  private init() {}

  func definitions() -> [HealthTypeDefinition] {
    var values: [HealthTypeDefinition] = []
    func quantity(
      _ identifier: HKQuantityTypeIdentifier,
      metric: String,
      category: String,
      unit: HKUnit,
      label: String,
      multiplier: Double = 1
    ) {
      guard let type = HKObjectType.quantityType(forIdentifier: identifier)
      else { return }
      values.append(
        HealthTypeDefinition(
          metric: metric,
          category: category,
          sampleType: type,
          unit: unit,
          unitLabel: label,
          multiplier: multiplier
        )
      )
    }

    let countPerMinute = HKUnit.count().unitDivided(by: .minute())
    quantity(.heartRate, metric: "heart-rate", category: "heart", unit: countPerMinute, label: "count/min")
    quantity(.restingHeartRate, metric: "resting-heart-rate", category: "heart", unit: countPerMinute, label: "count/min")
    quantity(.heartRateVariabilitySDNN, metric: "heart-rate-variability", category: "heart", unit: .secondUnit(with: .milli), label: "ms")
    quantity(.walkingHeartRateAverage, metric: "walking-heart-rate", category: "heart", unit: countPerMinute, label: "count/min")
    quantity(.vo2Max, metric: "vo2-max", category: "heart", unit: HKUnit(from: "ml/kg*min"), label: "ml/kg/min")
    quantity(.respiratoryRate, metric: "respiratory-rate", category: "recovery", unit: countPerMinute, label: "count/min")
    quantity(.oxygenSaturation, metric: "oxygen-saturation", category: "recovery", unit: .percent(), label: "%", multiplier: 100)
    quantity(.bodyTemperature, metric: "body-temperature", category: "recovery", unit: .degreeCelsius(), label: "degC")
    quantity(.activeEnergyBurned, metric: "active-energy", category: "activity", unit: .kilocalorie(), label: "kcal")
    quantity(.basalEnergyBurned, metric: "basal-energy", category: "activity", unit: .kilocalorie(), label: "kcal")
    quantity(.stepCount, metric: "steps", category: "activity", unit: .count(), label: "count")
    quantity(.distanceWalkingRunning, metric: "distance", category: "activity", unit: .meterUnit(with: .kilo), label: "km")
    quantity(.appleExerciseTime, metric: "exercise-minutes", category: "activity", unit: .minute(), label: "min")
    quantity(.appleStandTime, metric: "stand-minutes", category: "activity", unit: .minute(), label: "min")
    quantity(.bodyMass, metric: "weight", category: "body", unit: .gramUnit(with: .kilo), label: "kg")
    quantity(.bodyFatPercentage, metric: "body-fat", category: "body", unit: .percent(), label: "%", multiplier: 100)
    quantity(.leanBodyMass, metric: "lean-body-mass", category: "body", unit: .gramUnit(with: .kilo), label: "kg")
    if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
      values.append(
        HealthTypeDefinition(metric: "sleep", category: "recovery", sampleType: sleep, unit: nil, unitLabel: nil, multiplier: 1)
      )
    }
    values.append(
      HealthTypeDefinition(metric: "workout", category: "activity", sampleType: HKObjectType.workoutType(), unit: nil, unitLabel: nil, multiplier: 1)
    )
    return values
  }

  func selectedDefinitions(categoriesJSON: String) throws -> [HealthTypeDefinition] {
    guard
      let data = categoriesJSON.data(using: .utf8),
      let categories = try JSONSerialization.jsonObject(with: data) as? [String],
      !categories.isEmpty
    else { throw DunaHealthKitError.invalidCategories }
    let allowed = Set(["heart", "recovery", "activity", "body"])
    let selected = Set(categories)
    guard selected.isSubset(of: allowed) else {
      throw DunaHealthKitError.invalidCategories
    }
    return definitions().filter { selected.contains($0.category) }
  }

  func decodeAnchor(_ encoded: String?) throws -> HKQueryAnchor? {
    guard let encoded, let data = Data(base64Encoded: encoded) else {
      return nil
    }
    do {
      return try NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
    } catch {
      throw DunaHealthKitError.invalidCursor
    }
  }

  func encodeAnchor(_ anchor: HKQueryAnchor?) throws -> String? {
    guard let anchor else { return nil }
    return try NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true).base64EncodedString()
  }

  func categoryValue(_ sample: HKCategorySample) -> String {
    guard sample.categoryType.identifier == HKCategoryTypeIdentifier.sleepAnalysis.rawValue
    else { return "value-\(sample.value)" }
    switch sample.value {
    case HKCategoryValueSleepAnalysis.inBed.rawValue: return "in-bed"
    case HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue: return "asleep-unspecified"
    case HKCategoryValueSleepAnalysis.awake.rawValue: return "awake"
    case HKCategoryValueSleepAnalysis.asleepCore.rawValue: return "asleep-core"
    case HKCategoryValueSleepAnalysis.asleepDeep.rawValue: return "asleep-deep"
    case HKCategoryValueSleepAnalysis.asleepREM.rawValue: return "asleep-rem"
    default: return "value-\(sample.value)"
    }
  }

  func serialize(sample: HKSample, definition: HealthTypeDefinition) -> [String: Any]? {
    var source: [String: Any] = [
      "bundleIdentifier": sample.sourceRevision.source.bundleIdentifier,
      "name": sample.sourceRevision.source.name,
    ]
    if let version = sample.sourceRevision.version {
      source["version"] = version
    }
    if let productType = sample.sourceRevision.productType {
      source["productType"] = productType
    }
    if let device = sample.device {
      var serializedDevice: [String: String] = [:]
      if let name = device.name { serializedDevice["name"] = name }
      if let manufacturer = device.manufacturer {
        serializedDevice["manufacturer"] = manufacturer
      }
      if let model = device.model { serializedDevice["model"] = model }
      if let hardwareVersion = device.hardwareVersion {
        serializedDevice["hardwareVersion"] = hardwareVersion
      }
      if let softwareVersion = device.softwareVersion {
        serializedDevice["softwareVersion"] = softwareVersion
      }
      if !serializedDevice.isEmpty { source["device"] = serializedDevice }
    }
    var value: [String: Any] = [
      "externalId": sample.uuid.uuidString.lowercased(),
      "metric": definition.metric,
      "startedAt": ISO8601DateFormatter.duna.string(from: sample.startDate),
      "endedAt": ISO8601DateFormatter.duna.string(from: sample.endDate),
      "source": source,
    ]
    if let quantity = sample as? HKQuantitySample, let unit = definition.unit {
      value["kind"] = "quantity"
      value["value"] = quantity.quantity.doubleValue(for: unit) * definition.multiplier
      value["unit"] = definition.unitLabel
      return value
    }
    if let category = sample as? HKCategorySample {
      value["kind"] = "category"
      value["categoryValue"] = categoryValue(category)
      return value
    }
    if let workout = sample as? HKWorkout {
      value["kind"] = "workout"
      var workoutValue: [String: Any] = [
        "activityType": workout.workoutActivityType.rawValue,
        "durationSeconds": workout.duration,
      ]
      if let energy = workout.totalEnergyBurned {
        workoutValue["activeEnergyKcal"] = energy.doubleValue(for: .kilocalorie())
      }
      if let distance = workout.totalDistance {
        workoutValue["distanceKilometers"] = distance.doubleValue(for: .meterUnit(with: .kilo))
      }
      value["workout"] = workoutValue
      return value
    }
    return nil
  }

  func anchoredQuery(definition: HealthTypeDefinition, anchor: HKQueryAnchor?, limit: Int) async throws -> HealthQueryResult {
    try await withCheckedThrowingContinuation { continuation in
      let query = HKAnchoredObjectQuery(type: definition.sampleType, predicate: nil, anchor: anchor, limit: limit) {
        [weak self] _, samples, deletedObjects, newAnchor, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        guard let self else {
          continuation.resume(throwing: DunaHealthKitError.invalidResponse)
          return
        }
        continuation.resume(
          returning: HealthQueryResult(
            samples: (samples ?? []).compactMap { self.serialize(sample: $0, definition: definition) },
            deletedIDs: (deletedObjects ?? []).map { $0.uuid.uuidString.lowercased() },
            anchor: newAnchor,
            hasMore: (samples?.count ?? 0) + (deletedObjects?.count ?? 0) >= limit
          )
        )
      }
      store.execute(query)
    }
  }

  func stopMonitoring() {
    observers.forEach(store.stop)
    observers.removeAll()
  }

  func startMonitoring(definitions: [HealthTypeDefinition]) async -> Bool {
    stopMonitoring()
    for definition in definitions {
      let query = HKObserverQuery(sampleType: definition.sampleType, predicate: nil) {
        [weak self] _, completion, _ in
        self?.emitChange?(definition.metric)
        completion()
      }
      observers.append(query)
      store.execute(query)
      await withCheckedContinuation { continuation in
        store.enableBackgroundDelivery(for: definition.sampleType, frequency: .hourly) { _, _ in
          continuation.resume()
        }
      }
    }
    return !observers.isEmpty
  }
}

private extension ISO8601DateFormatter {
  static let duna: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()
}

public final class DunaHealthKitModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DunaHealthKit")
    Events("onHealthDataChanged")

    OnCreate {
      DunaHealthStore.shared.emitChange = { [weak self] metric in
        self?.sendEvent("onHealthDataChanged", [
          "metric": metric,
          "detectedAt": ISO8601DateFormatter.duna.string(from: Date()),
        ])
      }
    }
    OnDestroy {
      DunaHealthStore.shared.emitChange = nil
      DunaHealthStore.shared.stopMonitoring()
    }

    Function("isAvailable") { HKHealthStore.isHealthDataAvailable() }

    AsyncFunction("requestAuthorization") {
      (categoriesJSON: String) async throws -> [String: Any] in
      guard HKHealthStore.isHealthDataAvailable() else {
        throw DunaHealthKitError.unavailable
      }
      let definitions = try DunaHealthStore.shared.selectedDefinitions(categoriesJSON: categoriesJSON)
      try await DunaHealthStore.shared.store.requestAuthorization(
        toShare: [],
        read: Set(definitions.map(\.sampleType))
      )
      let categories = try JSONSerialization.jsonObject(with: categoriesJSON.data(using: .utf8)!) as? [String] ?? []
      return [
        "requested": true,
        "categories": categories,
        "readStatus": "not-disclosed-by-healthkit",
      ]
    }

    AsyncFunction("readChanges") {
      (categoriesJSON: String, cursorJSON: String?, recordLimit: Int) async throws -> String in
      guard HKHealthStore.isHealthDataAvailable() else {
        throw DunaHealthKitError.unavailable
      }
      let limit = max(1, min(recordLimit, 500))
      var cursors: [String: String] = [:]
      if let cursorJSON, let data = cursorJSON.data(using: .utf8) {
        guard let decoded = try JSONSerialization.jsonObject(with: data) as? [String: String]
        else { throw DunaHealthKitError.invalidCursor }
        cursors = decoded
      }
      var samples: [[String: Any]] = []
      var deletedIDs: [String] = []
      var nextCursors = cursors
      var hasMore = false
      var metricsWithMore: [String] = []
      let selectedDefinitions = try DunaHealthStore.shared.selectedDefinitions(categoriesJSON: categoriesJSON)
      // A single high-volume type (usually heart rate) must never prevent
      // sleep, HRV, workouts, or body history from reaching Duna. Rotate the
      // starting type on every resumable page and reserve a fair share of the
      // remaining page for every type that has not been queried yet.
      let storedRotation = Int(cursors["__dunaRotation"] ?? "0") ?? 0
      let rotation = selectedDefinitions.isEmpty
        ? 0
        : storedRotation % selectedDefinitions.count
      let definitions = selectedDefinitions.isEmpty
        ? []
        : Array(selectedDefinitions[rotation...] + selectedDefinitions[..<rotation])
      for (index, definition) in definitions.enumerated() {
        let consumed = samples.count + deletedIDs.count
        let remaining = limit - consumed
        if remaining <= 0 {
          hasMore = true
          metricsWithMore.append(contentsOf: definitions[index...].map(\.metric))
          break
        }
        let definitionsRemaining = max(1, definitions.count - index)
        let fairLimit = max(1, remaining / definitionsRemaining)
        let anchor = try DunaHealthStore.shared.decodeAnchor(cursors[definition.metric])
        let result = try await DunaHealthStore.shared.anchoredQuery(
          definition: definition,
          anchor: anchor,
          limit: fairLimit
        )
        samples.append(contentsOf: result.samples)
        deletedIDs.append(contentsOf: result.deletedIDs)
        if let next = try DunaHealthStore.shared.encodeAnchor(result.anchor) {
          nextCursors[definition.metric] = next
        }
        if result.hasMore {
          hasMore = true
          metricsWithMore.append(definition.metric)
        }
      }
      if !selectedDefinitions.isEmpty {
        nextCursors["__dunaRotation"] = String((rotation + 1) % selectedDefinitions.count)
      }
      let payload: [String: Any] = [
        "samples": samples,
        "deletedExternalIds": Array(Set(deletedIDs)),
        "cursors": nextCursors,
        "hasMore": hasMore,
        "metricsWithMore": Array(Set(metricsWithMore)).sorted(),
      ]
      guard JSONSerialization.isValidJSONObject(payload) else {
        throw DunaHealthKitError.invalidResponse
      }
      let data = try JSONSerialization.data(withJSONObject: payload)
      guard let json = String(data: data, encoding: .utf8) else {
        throw DunaHealthKitError.invalidResponse
      }
      return json
    }

    AsyncFunction("startMonitoring") {
      (categoriesJSON: String) async throws -> Bool in
      let definitions = try DunaHealthStore.shared.selectedDefinitions(categoriesJSON: categoriesJSON)
      return await DunaHealthStore.shared.startMonitoring(definitions: definitions)
    }

    Function("stopMonitoring") { DunaHealthStore.shared.stopMonitoring() }
  }
}
