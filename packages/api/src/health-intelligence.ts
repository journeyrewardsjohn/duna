import type {
  HealthCheckIn,
  HealthIntelligence,
  HealthTimelineEntry,
} from "./contracts";

export const HEALTH_INTELLIGENCE_MODEL_VERSION =
  "duna-readiness-personal-v1.0.0";

const DAY_MS = 86_400_000;
const ANALYSIS_WINDOW_DAYS = 90;

type DailySignal = {
  readonly date: string;
  readonly hrv?: number;
  readonly restingHeartRate?: number;
  readonly strainLoad: number;
  readonly strainSource:
    "heart-rate" | "workout" | "session-rpe" | "mixed" | "limited";
};

type SleepNight = {
  readonly date: string;
  readonly startedAt: Date;
  readonly durationHours: number;
  readonly awakeMinutes?: number;
  readonly coreMinutes?: number;
  readonly deepMinutes?: number;
  readonly remMinutes?: number;
  readonly efficiencyPercent?: number;
  readonly interruptions?: number;
  readonly sourceName?: string;
  readonly staged: boolean;
};

type Factor = HealthIntelligence["readiness"]["factors"][number];

const research: HealthIntelligence["citations"] = [
  {
    id: "plews-2013-hrv",
    section: "hrv",
    title:
      "Evaluating training adaptation with heart-rate measures: a methodological comparison",
    authors: "Plews et al.",
    year: 2013,
    url: "https://pubmed.ncbi.nlm.nih.gov/23479420/",
    takeaway:
      "Weekly HRV and resting-heart-rate trends were more useful than isolated daily values when describing endurance adaptation.",
    caveat:
      "The paper studied endurance athletes and RMSSD; Apple Health exposes SDNN, so Duna applies the trend principle without treating the metrics as interchangeable.",
  },
  {
    id: "flatt-2020-hrv-band",
    section: "hrv",
    title:
      "Heart rate variability stabilization in athletes: towards more convenient data acquisition",
    authors: "Flatt and Esco",
    year: 2020,
    url: "https://pubmed.ncbi.nlm.nih.gov/32678200/",
    takeaway:
      "Athlete-specific rolling averages and smallest-worthwhile-change bands help distinguish normal variation from a meaningful shift.",
  },
  {
    id: "apple-healthkit-hrv",
    section: "hrv",
    title: "Heart rate variability SDNN",
    authors: "Apple HealthKit Documentation",
    year: 2026,
    url: "https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/heartratevariabilitysdnn",
    takeaway:
      "Apple Health stores heart-rate variability as SDNN. Duna preserves that definition and source attribution.",
  },
  {
    id: "roberts-2024-sleep",
    section: "sleep",
    title:
      "Performance of seven consumer sleep-tracking devices compared with polysomnography",
    authors: "Roberts et al.",
    year: 2024,
    url: "https://pubmed.ncbi.nlm.nih.gov/39460013/",
    takeaway:
      "Consumer wearables can estimate sleep-wake reasonably well, while stage-level performance varies by device and stage.",
    caveat:
      "Duna presents Core, Deep, and REM as device estimates—not clinical sleep staging.",
  },
  {
    id: "apple-sleep-stages",
    section: "sleep",
    title: "Sleep analysis values",
    authors: "Apple HealthKit Documentation",
    year: 2026,
    url: "https://developer.apple.com/documentation/healthkit/hkcategoryvaluesleepanalysis",
    takeaway:
      "HealthKit can provide in-bed, awake, Core, Deep, REM, and unspecified-asleep intervals when a source records them.",
  },
  {
    id: "halson-2022-sleep-regularity",
    section: "sleep",
    title:
      "Sleep regularity and predictors of sleep efficiency and sleep duration in elite team sport athletes",
    authors: "Halson et al.",
    year: 2022,
    url: "https://pubmed.ncbi.nlm.nih.gov/35713743/",
    takeaway:
      "In elite team-sport athletes, more regular sleep timing was associated with higher and less variable sleep efficiency even when total sleep time was similar.",
  },
  {
    id: "buchheit-2014-monitoring",
    section: "readiness",
    title:
      "Monitoring training status with HR measures: do all roads lead to Rome?",
    authors: "Buchheit",
    year: 2014,
    url: "https://pubmed.ncbi.nlm.nih.gov/24578692/",
    takeaway:
      "Heart-rate signals should be interpreted with measurement error, meaningful-change bands, training context, and athlete-reported measures rather than alone.",
  },
  {
    id: "rothschild-2024-recovery-ml",
    section: "readiness",
    title:
      "Predicting daily recovery during long-term endurance training using machine learning analysis",
    authors: "Rothschild et al.",
    year: 2024,
    url: "https://pubmed.ncbi.nlm.nih.gov/38900201/",
    takeaway:
      "Recovery prediction improved over a baseline model, but the most useful variables and accuracy varied substantially by athlete.",
    caveat:
      "Duna therefore keeps v1 personalized and explainable instead of transferring a black-box endurance model to beach volleyball.",
  },
  {
    id: "duignan-2020-self-report",
    section: "readiness",
    title:
      "Single-item self-report measures of team-sport athlete wellbeing and their relationship with training load",
    authors: "Duignan et al.",
    year: 2020,
    url: "https://pubmed.ncbi.nlm.nih.gov/32991706/",
    takeaway:
      "Soreness, fatigue, sleep quality, stress, and mood are commonly monitored, but their relationship with load varies—supporting context rather than rigid conclusions.",
  },
  {
    id: "bourdon-2017-monitoring",
    section: "readiness",
    title: "Monitoring athlete training loads: consensus statement",
    authors: "Bourdon et al.",
    year: 2017,
    url: "https://pubmed.ncbi.nlm.nih.gov/28461957/",
    takeaway:
      "Training decisions are strongest when internal load, external load, and athlete-reported context are interpreted together.",
  },
  {
    id: "dugan-2022-beach-load",
    section: "strain",
    title:
      "Validity of session rating of perceived exertion for quantifying training load in NCAA Division I beach volleyball players",
    authors: "Dugan et al.",
    year: 2022,
    url: "https://pubmed.ncbi.nlm.nih.gov/35916748/",
    takeaway:
      "In collegiate beach volleyball, session RPE tracked heart-rate-derived load and distance well enough to be a practical load measure.",
  },
  {
    id: "wang-2020-acwr",
    section: "strain",
    title:
      "The acute:chronic workload ratio is an invalid predictor of injury risk",
    authors: "Wang et al.",
    year: 2020,
    url: "https://pubmed.ncbi.nlm.nih.gov/33332011/",
    takeaway:
      "Rigid acute-to-chronic workload thresholds should not be presented as injury predictions.",
    caveat:
      "Duna shows a personal load trend and does not estimate injury risk.",
  },
  {
    id: "apple-health-privacy",
    section: "privacy",
    title: "Protecting user privacy",
    authors: "Apple HealthKit Documentation",
    year: 2026,
    url: "https://developer.apple.com/documentation/healthkit/protecting-user-privacy",
    takeaway:
      "Health access should be purpose-specific, clearly explained, minimized, and shared only with the user’s express permission.",
  },
];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function rounded(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function quantile(
  values: readonly number[],
  percentile: number,
): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const fraction = index - lower;
  return sorted[lower]! * (1 - fraction) + sorted[upper]! * fraction;
}

function median(values: readonly number[]): number | undefined {
  return quantile(values, 0.5);
}

function robustZ(
  current: number,
  baseline: readonly number[],
  logarithmic = false,
): number | undefined {
  if (baseline.length < 4) return undefined;
  const transform = (value: number) =>
    logarithmic ? Math.log(Math.max(0.001, value)) : value;
  const values = baseline.map(transform);
  const center = median(values)!;
  const absoluteDeviations = values.map((value) => Math.abs(value - center));
  const robustDeviation = median(absoluteDeviations)! * 1.4826;
  const fallback = Math.max(Math.abs(center) * 0.05, logarithmic ? 0.04 : 0.5);
  return (transform(current) - center) / Math.max(robustDeviation, fallback);
}

function localDate(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateOffset(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function durationMinutes(sample: HealthTimelineEntry): number {
  return Math.max(
    0,
    (new Date(sample.endedAt).getTime() -
      new Date(sample.startedAt).getTime()) /
      60_000,
  );
}

function unionMinutes(samples: readonly HealthTimelineEntry[]): number {
  const intervals = samples
    .map((sample) => ({
      start: new Date(sample.startedAt).getTime(),
      end: new Date(sample.endedAt).getTime(),
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((left, right) => left.start - right.start);
  let total = 0;
  let start: number | undefined;
  let end: number | undefined;
  for (const interval of intervals) {
    if (start === undefined || end === undefined) {
      start = interval.start;
      end = interval.end;
    } else if (interval.start <= end) {
      end = Math.max(end, interval.end);
    } else {
      total += end - start;
      start = interval.start;
      end = interval.end;
    }
  }
  if (start !== undefined && end !== undefined) total += end - start;
  return total / 60_000;
}

function sleepSourceKey(sample: HealthTimelineEntry): string {
  return [
    sample.source?.bundleIdentifier ?? "unknown",
    sample.source?.device?.model ?? sample.source?.productType ?? "device",
  ].join(":");
}

function dominantMetricSource(
  samples: readonly HealthTimelineEntry[],
  metric: HealthTimelineEntry["metric"],
  timezone: string,
): string | undefined {
  const metricSamples = samples.filter((sample) => sample.metric === metric);
  const latestDate = metricSamples
    .map((sample) => localDate(new Date(sample.startedAt), timezone))
    .sort()
    .at(-1);
  if (!latestDate) return undefined;
  const recentCutoff = dateOffset(latestDate, -59);
  const globalLatestAt = Math.max(
    ...metricSamples.map((sample) => new Date(sample.startedAt).getTime()),
  );
  const sources = new Map<
    string,
    { dates: Set<string>; recentDates: Set<string>; latestAt: number }
  >();
  for (const sample of metricSamples) {
    const key = sleepSourceKey(sample);
    const date = localDate(new Date(sample.startedAt), timezone);
    const current = sources.get(key) ?? {
      dates: new Set<string>(),
      recentDates: new Set<string>(),
      latestAt: 0,
    };
    current.dates.add(date);
    if (date >= recentCutoff) current.recentDates.add(date);
    current.latestAt = Math.max(
      current.latestAt,
      new Date(sample.startedAt).getTime(),
    );
    sources.set(key, current);
  }
  const entries = [...sources.entries()];
  const currentlyActive = entries.filter(
    ([, source]) => globalLatestAt - source.latestAt <= 14 * DAY_MS,
  );
  return (currentlyActive.length > 0 ? currentlyActive : entries).sort(
    (left, right) => {
      const recentDifference =
        right[1].recentDates.size - left[1].recentDates.size;
      if (recentDifference !== 0) return recentDifference;
      const recencyDifference = right[1].latestAt - left[1].latestAt;
      if (recencyDifference !== 0) return recencyDifference;
      const coverageDifference = right[1].dates.size - left[1].dates.size;
      return coverageDifference || left[0].localeCompare(right[0]);
    },
  )[0]?.[0];
}

function parseSleepNight(
  date: string,
  sourceSamples: readonly HealthTimelineEntry[],
): SleepNight | undefined {
  const detailed = sourceSamples.filter((sample) =>
    ["asleep-core", "asleep-deep", "asleep-rem"].includes(
      sample.categoryValue ?? "",
    ),
  );
  const asleep =
    detailed.length > 0
      ? detailed
      : sourceSamples.filter((sample) =>
          sample.categoryValue?.startsWith("asleep"),
        );
  if (asleep.length === 0) return undefined;
  const awake = sourceSamples.filter(
    (sample) => sample.categoryValue === "awake",
  );
  const inBed = sourceSamples.filter(
    (sample) => sample.categoryValue === "in-bed",
  );
  const asleepMinutes = unionMinutes(asleep);
  const awakeMinutes = unionMinutes(awake);
  const inBedMinutes = unionMinutes(inBed);
  const denominator = Math.max(inBedMinutes, asleepMinutes + awakeMinutes);
  return {
    date,
    startedAt: new Date(
      Math.min(...asleep.map((sample) => new Date(sample.startedAt).getTime())),
    ),
    durationHours: asleepMinutes / 60,
    awakeMinutes: awake.length > 0 ? awakeMinutes : undefined,
    coreMinutes:
      detailed.length > 0
        ? unionMinutes(
            detailed.filter((sample) => sample.categoryValue === "asleep-core"),
          )
        : undefined,
    deepMinutes:
      detailed.length > 0
        ? unionMinutes(
            detailed.filter((sample) => sample.categoryValue === "asleep-deep"),
          )
        : undefined,
    remMinutes:
      detailed.length > 0
        ? unionMinutes(
            detailed.filter((sample) => sample.categoryValue === "asleep-rem"),
          )
        : undefined,
    efficiencyPercent:
      denominator > 0 ? (asleepMinutes / denominator) * 100 : undefined,
    interruptions:
      awake.length > 0
        ? awake.filter((sample) => durationMinutes(sample) >= 1).length
        : undefined,
    sourceName: sourceSamples[0]?.source?.name,
    staged: detailed.length > 0,
  };
}

function buildSleepNights(
  samples: readonly HealthTimelineEntry[],
  timezone: string,
): SleepNight[] {
  const byDate = new Map<string, HealthTimelineEntry[]>();
  const sleepSamples = samples.filter((sample) => sample.metric === "sleep");
  const preferredSource = dominantMetricSource(samples, "sleep", timezone);
  for (const sample of sleepSamples) {
    const date = localDate(new Date(sample.endedAt), timezone);
    byDate.set(date, [...(byDate.get(date) ?? []), sample]);
  }
  return [...byDate.entries()]
    .flatMap(([date, daySamples]) => {
      const bySource = new Map<string, HealthTimelineEntry[]>();
      for (const sample of daySamples) {
        const key = sleepSourceKey(sample);
        bySource.set(key, [...(bySource.get(key) ?? []), sample]);
      }
      const candidates = [...bySource.entries()]
        .flatMap(([sourceKey, sourceSamples]) => {
          const night = parseSleepNight(date, sourceSamples);
          return night ? [{ sourceKey, night }] : [];
        })
        .sort((left, right) => {
          if (
            left.sourceKey === preferredSource &&
            right.sourceKey !== preferredSource
          ) {
            return -1;
          }
          if (
            right.sourceKey === preferredSource &&
            left.sourceKey !== preferredSource
          ) {
            return 1;
          }
          if (left.night.staged !== right.night.staged) {
            return left.night.staged ? -1 : 1;
          }
          return right.night.durationHours - left.night.durationHours;
        });
      return candidates[0] ? [candidates[0].night] : [];
    })
    .sort((left, right) => left.date.localeCompare(right.date));
}

function minuteOfNight(value: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? 0,
  );
  const raw = hour * 60 + minute;
  return raw < 12 * 60 ? raw + 24 * 60 : raw;
}

function sleepContinuity(night: SleepNight): number | undefined {
  if (night.efficiencyPercent !== undefined) {
    return clamp(
      night.efficiencyPercent - Math.max(0, (night.interruptions ?? 0) - 2) * 2,
      0,
      100,
    );
  }
  if (night.interruptions !== undefined) {
    return clamp(100 - night.interruptions * 4, 0, 100);
  }
  return undefined;
}

function valuesForDates(
  daily: ReadonlyMap<string, DailySignal>,
  date: string,
  startDaysAgo: number,
  endDaysAgo: number,
  selector: (signal: DailySignal) => number | undefined,
): number[] {
  const values: number[] = [];
  for (let offset = startDaysAgo; offset <= endDaysAgo; offset += 1) {
    const signal = daily.get(dateOffset(date, -offset));
    const value = signal ? selector(signal) : undefined;
    if (value !== undefined && Number.isFinite(value)) values.push(value);
  }
  return values;
}

function factorStatus(score: number | undefined): Factor["status"] {
  if (score === undefined) return "insufficient";
  if (score >= 7.8) return "supporting";
  if (score >= 5.4) return "typical";
  return "watch";
}

function strainLabel(score: number | undefined) {
  if (score === undefined) return "limited-data" as const;
  if (score < 3) return "light" as const;
  if (score < 6) return "moderate" as const;
  if (score < 8.5) return "high" as const;
  return "very-high" as const;
}

function dailyStrainScore(
  load: number,
  baselineLoads: readonly number[],
): number | undefined {
  if (load <= 0 && baselineLoads.length === 0) return undefined;
  const upper = quantile(
    baselineLoads.filter((value) => value > 0),
    0.9,
  );
  const reference = Math.max(upper ?? 250, 50);
  return clamp((Math.log1p(load) / Math.log1p(reference * 1.35)) * 9, 0, 10);
}

function buildDailySignals(input: {
  readonly samples: readonly HealthTimelineEntry[];
  readonly checkIns: readonly HealthCheckIn[];
  readonly timezone: string;
}): Map<string, DailySignal> {
  const hrvSource = dominantMetricSource(
    input.samples,
    "heart-rate-variability",
    input.timezone,
  );
  const restingSource = dominantMetricSource(
    input.samples,
    "resting-heart-rate",
    input.timezone,
  );
  const grouped = new Map<string, HealthTimelineEntry[]>();
  for (const sample of input.samples) {
    const date = localDate(new Date(sample.startedAt), input.timezone);
    grouped.set(date, [...(grouped.get(date) ?? []), sample]);
  }
  const allHeartRates = input.samples
    .filter(
      (sample) => sample.metric === "heart-rate" && sample.value !== undefined,
    )
    .map((sample) => sample.value!);
  const allResting = input.samples
    .filter(
      (sample) =>
        sample.metric === "resting-heart-rate" && sample.value !== undefined,
    )
    .map((sample) => sample.value!);
  const observedResting = quantile(allResting, 0.25);
  const observedMaximum = quantile(allHeartRates, 0.99);
  const checkIns = new Map(
    input.checkIns.map((checkIn) => [checkIn.date, checkIn]),
  );
  const dates = new Set([...grouped.keys(), ...checkIns.keys()]);
  const result = new Map<string, DailySignal>();
  for (const date of dates) {
    const samples = grouped.get(date) ?? [];
    const values = (metric: HealthTimelineEntry["metric"]) =>
      samples
        .filter((sample) => {
          if (sample.metric !== metric) return false;
          const preferredSource =
            metric === "heart-rate-variability"
              ? hrvSource
              : metric === "resting-heart-rate"
                ? restingSource
                : undefined;
          return !preferredSource || sleepSourceKey(sample) === preferredSource;
        })
        .flatMap((sample) =>
          sample.value === undefined ? [] : [sample.value],
        );
    const workouts = samples.filter((sample) => sample.metric === "workout");
    let workoutLoad = 0;
    let heartRateDriven = false;
    for (const workout of workouts) {
      const startedAt = new Date(workout.startedAt).getTime();
      const endedAt = new Date(workout.endedAt).getTime();
      const duration = Math.max(
        0,
        (workout.workout?.durationSeconds ?? (endedAt - startedAt) / 1_000) /
          60,
      );
      const workoutHeartRates = samples
        .filter((sample) => {
          const timestamp = new Date(sample.startedAt).getTime();
          return (
            sample.metric === "heart-rate" &&
            sample.value !== undefined &&
            timestamp >= startedAt &&
            timestamp <= endedAt
          );
        })
        .map((sample) => sample.value!);
      if (
        workoutHeartRates.length >= 4 &&
        observedResting !== undefined &&
        observedMaximum !== undefined &&
        observedMaximum > observedResting + 30
      ) {
        const zoneWeight = average(
          workoutHeartRates.map((heartRate) => {
            const reserve =
              (heartRate - observedResting) /
              (observedMaximum - observedResting);
            if (reserve < 0.6) return 1;
            if (reserve < 0.7) return 2;
            if (reserve < 0.8) return 3;
            if (reserve < 0.9) return 4;
            return 5;
          }),
        )!;
        workoutLoad += duration * zoneWeight;
        heartRateDriven = true;
      } else {
        const energyPerMinute =
          duration > 0
            ? (workout.workout?.activeEnergyKcal ?? 0) / duration
            : 0;
        workoutLoad += duration * clamp(1 + energyPerMinute / 8, 1, 3);
      }
    }
    const checkIn = checkIns.get(date);
    const sessionLoad =
      checkIn?.practiceRpe !== undefined &&
      checkIn.practiceMinutes !== undefined
        ? checkIn.practiceRpe * checkIn.practiceMinutes
        : 0;
    const strainLoad = Math.max(workoutLoad, sessionLoad);
    const strainSource =
      workoutLoad > 0 && sessionLoad > 0
        ? ("mixed" as const)
        : sessionLoad > 0
          ? ("session-rpe" as const)
          : workoutLoad > 0 && heartRateDriven
            ? ("heart-rate" as const)
            : workoutLoad > 0
              ? ("workout" as const)
              : ("limited" as const);
    result.set(date, {
      date,
      hrv: median(values("heart-rate-variability")),
      restingHeartRate: median(values("resting-heart-rate")),
      strainLoad,
      strainSource,
    });
  }
  return result;
}

function readinessFactors(input: {
  readonly date: string;
  readonly daily: ReadonlyMap<string, DailySignal>;
  readonly sleeps: ReadonlyMap<string, SleepNight>;
  readonly checkIns: ReadonlyMap<string, HealthCheckIn>;
  readonly timezone: string;
}): Factor[] {
  const recentHrv = valuesForDates(
    input.daily,
    input.date,
    0,
    6,
    (signal) => signal.hrv,
  );
  const baselineHrv = valuesForDates(
    input.daily,
    input.date,
    7,
    34,
    (signal) => signal.hrv,
  );
  const hrvCurrent = median(recentHrv);
  const hrvZ =
    hrvCurrent === undefined
      ? undefined
      : robustZ(hrvCurrent, baselineHrv, true);
  const hrvScore =
    hrvCurrent === undefined
      ? undefined
      : hrvZ === undefined
        ? recentHrv.length >= 2
          ? 6.5
          : undefined
        : clamp(7 + hrvZ * 1.15, 1, 9.5);
  const hrvBaseline = median(baselineHrv);
  const hrvChange =
    hrvCurrent !== undefined && hrvBaseline
      ? ((hrvCurrent - hrvBaseline) / hrvBaseline) * 100
      : undefined;

  const recentResting = valuesForDates(
    input.daily,
    input.date,
    0,
    2,
    (signal) => signal.restingHeartRate,
  );
  const baselineResting = valuesForDates(
    input.daily,
    input.date,
    3,
    30,
    (signal) => signal.restingHeartRate,
  );
  const restingCurrent = median(recentResting);
  const restingZ =
    restingCurrent === undefined
      ? undefined
      : robustZ(restingCurrent, baselineResting);
  const restingScore =
    restingCurrent === undefined
      ? undefined
      : restingZ === undefined
        ? recentResting.length >= 1
          ? 6.5
          : undefined
        : clamp(7 - restingZ * 1.2, 1, 9.5);
  const restingBaseline = median(baselineResting);

  const latestSleep = input.sleeps.get(input.date);
  const baselineSleep = Array.from({ length: 28 }, (_, index) =>
    input.sleeps.get(dateOffset(input.date, -(index + 1))),
  ).filter((night): night is SleepNight => Boolean(night));
  let sleepScore: number | undefined;
  let regularityMinutes: number | undefined;
  if (latestSleep) {
    const baselineDurations = baselineSleep.map((night) => night.durationHours);
    const lowDuration = quantile(baselineDurations, 0.25);
    const middleDuration = median(baselineDurations);
    const durationScore =
      lowDuration === undefined || middleDuration === undefined
        ? 6.5
        : latestSleep.durationHours < lowDuration
          ? clamp(
              6 -
                ((lowDuration - latestSleep.durationHours) /
                  Math.max(lowDuration, 1)) *
                  12,
              1,
              6,
            )
          : latestSleep.durationHours >= middleDuration
            ? 8
            : 7;
    const continuity = sleepContinuity(latestSleep);
    const continuityBaseline = baselineSleep
      .map(sleepContinuity)
      .filter((value): value is number => value !== undefined);
    const continuityZ =
      continuity === undefined
        ? undefined
        : robustZ(continuity, continuityBaseline);
    const continuityScore =
      continuity === undefined
        ? undefined
        : continuityZ === undefined
          ? 6.5
          : clamp(7 + continuityZ, 2, 9);
    const baselineBedtimes = baselineSleep.map((night) =>
      minuteOfNight(night.startedAt, input.timezone),
    );
    const typicalBedtime = median(baselineBedtimes);
    regularityMinutes =
      typicalBedtime === undefined
        ? undefined
        : Math.abs(
            minuteOfNight(latestSleep.startedAt, input.timezone) -
              typicalBedtime,
          );
    const regularityScore =
      regularityMinutes === undefined
        ? undefined
        : clamp(9 - regularityMinutes / 20, 2, 9);
    const weighted = [
      { score: durationScore, weight: 0.55 },
      ...(continuityScore === undefined
        ? []
        : [{ score: continuityScore, weight: 0.3 }]),
      ...(regularityScore === undefined
        ? []
        : [{ score: regularityScore, weight: 0.15 }]),
    ];
    sleepScore =
      weighted.reduce((sum, item) => sum + item.score * item.weight, 0) /
      weighted.reduce((sum, item) => sum + item.weight, 0);
  }

  const recentLoads = valuesForDates(
    input.daily,
    input.date,
    0,
    2,
    (signal) => signal.strainLoad,
  );
  const baselineLoads = valuesForDates(
    input.daily,
    input.date,
    3,
    30,
    (signal) => signal.strainLoad,
  );
  const recentLoad = average(recentLoads);
  const baselineLoad = average(baselineLoads);
  const loadRatio =
    recentLoad !== undefined && baselineLoad !== undefined && baselineLoad > 5
      ? recentLoad / baselineLoad
      : undefined;
  const strainBalanceScore =
    loadRatio === undefined
      ? undefined
      : loadRatio <= 1.15
        ? 7.5
        : loadRatio <= 1.4
          ? 6
          : loadRatio <= 1.8
            ? 4
            : 2.5;

  const checkIn = input.checkIns.get(input.date);
  const selfReportScore = checkIn
    ? (((checkIn.perceivedRecovery +
        checkIn.energy +
        (6 - checkIn.stress) +
        (6 - checkIn.soreness)) /
        4 -
        1) /
        4) *
      10
    : undefined;

  const percent = (value: number) =>
    `${Math.abs(Math.round(value))}% ${value >= 0 ? "above" : "below"}`;
  return [
    {
      id: "hrv-balance",
      label: "HRV balance",
      score: hrvScore === undefined ? undefined : rounded(hrvScore),
      weight: 0.3,
      status: factorStatus(hrvScore),
      summary:
        hrvCurrent === undefined
          ? "No recent SDNN readings are available yet."
          : hrvChange === undefined
            ? `Your recent SDNN median is ${Math.round(hrvCurrent)} ms; Duna is still learning its normal range.`
            : `Your seven-day SDNN median is ${percent(hrvChange)} your prior personal baseline.`,
      referenceIds: [
        "plews-2013-hrv",
        "flatt-2020-hrv-band",
        "apple-healthkit-hrv",
        "buchheit-2014-monitoring",
      ],
    },
    {
      id: "resting-heart-rate",
      label: "Resting heart rate",
      score: restingScore === undefined ? undefined : rounded(restingScore),
      weight: 0.15,
      status: factorStatus(restingScore),
      summary:
        restingCurrent === undefined
          ? "No recent resting-heart-rate reading is available."
          : restingBaseline === undefined
            ? `Your recent resting heart rate is ${Math.round(restingCurrent)} bpm; the baseline is still forming.`
            : `Your recent resting heart rate is ${Math.round(restingCurrent)} bpm versus a ${Math.round(restingBaseline)} bpm personal baseline.`,
      referenceIds: [
        "plews-2013-hrv",
        "buchheit-2014-monitoring",
        "bourdon-2017-monitoring",
      ],
    },
    {
      id: "sleep-quality",
      label: "Sleep continuity",
      score: sleepScore === undefined ? undefined : rounded(sleepScore),
      weight: 0.3,
      status: factorStatus(sleepScore),
      summary: latestSleep
        ? `${latestSleep.durationHours.toFixed(1)} hours asleep${regularityMinutes === undefined ? "" : ` with bedtime ${Math.round(regularityMinutes)} minutes from your usual timing`}.`
        : "No complete recent sleep interval is available.",
      referenceIds: [
        "roberts-2024-sleep",
        "apple-sleep-stages",
        "halson-2022-sleep-regularity",
      ],
    },
    {
      id: "strain-balance",
      label: "Recent load",
      score:
        strainBalanceScore === undefined
          ? undefined
          : rounded(strainBalanceScore),
      weight: 0.15,
      status: factorStatus(strainBalanceScore),
      summary:
        loadRatio === undefined
          ? "Duna needs more workout or session-effort history to compare recent load."
          : `Your three-day load is ${Math.round(loadRatio * 100)}% of your own prior 28-day daily average.`,
      referenceIds: ["dugan-2022-beach-load", "wang-2020-acwr"],
    },
    {
      id: "self-report",
      label: "How you feel",
      score:
        selfReportScore === undefined ? undefined : rounded(selfReportScore),
      weight: 0.1,
      status: factorStatus(selfReportScore),
      summary: checkIn
        ? `Energy ${checkIn.energy}/5 · stress ${checkIn.stress}/5 · soreness ${checkIn.soreness}/5.`
        : "Add a 10-second check-in to give your wearable signals human context.",
      referenceIds: [
        "bourdon-2017-monitoring",
        "duignan-2020-self-report",
        "rothschild-2024-recovery-ml",
      ],
    },
  ];
}

function weightedReadiness(factors: readonly Factor[]): number | undefined {
  const available = factors.filter(
    (factor): factor is Factor & { readonly score: number } =>
      factor.score !== undefined,
  );
  if (available.length === 0) return undefined;
  const weight = available.reduce((sum, factor) => sum + factor.weight, 0);
  return available.reduce(
    (sum, factor) => sum + factor.score * (factor.weight / weight),
    0,
  );
}

function buildTrend(input: {
  readonly metric: HealthIntelligence["trends"][number]["metric"];
  readonly label: string;
  readonly unit: string;
  readonly description: string;
  readonly values: readonly { readonly date: string; readonly value: number }[];
  readonly referenceIds: readonly string[];
}): HealthIntelligence["trends"][number] {
  const values = input.values.slice(-42);
  const baseline = values.slice(0, Math.max(0, values.length - 3));
  const baselineValues = (baseline.length >= 7 ? baseline : values).map(
    (point) => point.value,
  );
  const low = quantile(baselineValues, 0.2);
  const high = quantile(baselineValues, 0.8);
  return {
    metric: input.metric,
    label: input.label,
    unit: input.unit,
    description: input.description,
    average:
      average(baselineValues) === undefined
        ? undefined
        : rounded(average(baselineValues)!, input.unit === "score" ? 1 : 0),
    latest: values.at(-1)?.value,
    typicalLow: low === undefined ? undefined : rounded(low, 1),
    typicalHigh: high === undefined ? undefined : rounded(high, 1),
    points: values.map((point) => ({
      ...point,
      typicalLow: low === undefined ? undefined : rounded(low, 1),
      typicalHigh: high === undefined ? undefined : rounded(high, 1),
      anomaly:
        low !== undefined && point.value < low
          ? ("low" as const)
          : high !== undefined && point.value > high
            ? ("high" as const)
            : undefined,
    })),
    referenceIds: [...input.referenceIds],
  };
}

export function buildHealthIntelligence(input: {
  readonly samples: readonly HealthTimelineEntry[];
  readonly checkIns?: readonly HealthCheckIn[];
  readonly timezone: string;
  readonly now: Date;
}): HealthIntelligence {
  const checkIns = input.checkIns ?? [];
  const daily = buildDailySignals({
    samples: input.samples,
    checkIns,
    timezone: input.timezone,
  });
  const sleeps = buildSleepNights(input.samples, input.timezone);
  const sleepByDate = new Map(sleeps.map((night) => [night.date, night]));
  const checkInByDate = new Map(
    checkIns.map((checkIn) => [checkIn.date, checkIn]),
  );
  const today = localDate(input.now, input.timezone);
  const latestSignalDate = [
    ...new Set([...daily.keys(), ...sleeps.map((night) => night.date)]),
  ]
    .filter((date) => date <= today)
    .sort()
    .at(-1);
  const scoreDate = latestSignalDate ?? today;
  const factors = readinessFactors({
    date: scoreDate,
    daily,
    sleeps: sleepByDate,
    checkIns: checkInByDate,
    timezone: input.timezone,
  });
  const rawReadinessScore = weightedReadiness(factors);
  const availableFactorCount = factors.filter(
    (factor) => factor.score !== undefined,
  ).length;
  const signalDates = new Set([
    ...daily.keys(),
    ...sleeps.map((night) => night.date),
  ]);
  const cutoff = input.now.getTime() - ANALYSIS_WINDOW_DAYS * DAY_MS;
  const dataDays = [...signalDates].filter(
    (date) => new Date(`${date}T12:00:00.000Z`).getTime() >= cutoff,
  ).length;
  const scoreAgeDays = Math.max(
    0,
    Math.round(
      (new Date(`${today}T12:00:00.000Z`).getTime() -
        new Date(`${scoreDate}T12:00:00.000Z`).getTime()) /
        DAY_MS,
    ),
  );
  const readinessScore =
    scoreAgeDays <= 2 && dataDays >= 2 && availableFactorCount >= 2
      ? rawReadinessScore
      : undefined;
  const confidence =
    scoreAgeDays > 2 || readinessScore === undefined
      ? ("low" as const)
      : dataDays >= 21 && availableFactorCount >= 4
        ? ("high" as const)
        : dataDays >= 7 && availableFactorCount >= 3
          ? ("medium" as const)
          : ("low" as const);
  const label =
    readinessScore === undefined || dataDays < 2
      ? ("limited-data" as const)
      : readinessScore >= 8.5
        ? ("primed" as const)
        : readinessScore >= 6.5
          ? ("balanced" as const)
          : readinessScore >= 4.5
            ? ("building" as const)
            : ("recovery-favored" as const);
  const supporting = factors.filter((factor) => factor.status === "supporting");
  const watching = factors.filter((factor) => factor.status === "watch");
  const summary =
    scoreAgeDays > 2
      ? `Your latest usable Health data is from ${scoreDate}. Duna is preserving the history, but it will not present an old reading as today's readiness.`
      : readinessScore === undefined
        ? "Duna is securely gathering enough of your own history to form a personal baseline. No population target has been substituted."
        : watching.length > 0
          ? `${watching[0]!.label} is the clearest signal to watch today${supporting.length ? `, while ${supporting[0]!.label.toLowerCase()} is supporting you` : ""}. This score describes your pattern; it does not diagnose recovery or prescribe training.`
          : supporting.length > 0
            ? `${supporting[0]!.label} is running above your usual band and the other available signals are broadly within your pattern.`
            : "Your available signals are close to the ranges Duna has learned from you. The pattern matters more than any single reading.";
  const recommendation =
    confidence === "low" || watching.length === 0
      ? undefined
      : watching[0]!.id === "sleep-quality"
        ? "Experiment: keep tonight’s wind-down and wake time within 30 minutes of your recent best-continuity nights, then compare the next three mornings."
        : watching[0]!.id === "strain-balance"
          ? "Experiment: make the next session intentionally easy or technique-led, record its RPE, and see whether your three-day load and morning signals settle."
          : watching[0]!.id === "hrv-balance"
            ? "Experiment: treat today as a check—not a verdict. Repeat a similar morning measurement and compare the rolling trend before changing training."
            : watching[0]!.id === "self-report"
              ? "Experiment: note one controllable stressor today and reassess energy, stress, and soreness tomorrow morning."
              : "Experiment: keep today’s routine consistent and watch whether this signal returns toward your personal band over the next two mornings.";

  const latestSleep = [...sleeps]
    .reverse()
    .find((night) => night.date <= today);
  const latestSleepFactor = factors.find(
    (factor) => factor.id === "sleep-quality",
  );
  const priorBedtimes = sleeps
    .filter((night) => night.date < (latestSleep?.date ?? today))
    .slice(-28)
    .map((night) => minuteOfNight(night.startedAt, input.timezone));
  const regularityMinutes = latestSleep
    ? median(priorBedtimes) === undefined
      ? undefined
      : Math.abs(
          minuteOfNight(latestSleep.startedAt, input.timezone) -
            median(priorBedtimes)!,
        )
    : undefined;
  const sleep = latestSleep
    ? {
        date: latestSleep.date,
        durationHours: rounded(latestSleep.durationHours, 1),
        awakeMinutes:
          latestSleep.awakeMinutes === undefined
            ? undefined
            : rounded(latestSleep.awakeMinutes, 0),
        coreMinutes:
          latestSleep.coreMinutes === undefined
            ? undefined
            : rounded(latestSleep.coreMinutes, 0),
        deepMinutes:
          latestSleep.deepMinutes === undefined
            ? undefined
            : rounded(latestSleep.deepMinutes, 0),
        remMinutes:
          latestSleep.remMinutes === undefined
            ? undefined
            : rounded(latestSleep.remMinutes, 0),
        efficiencyPercent:
          latestSleep.efficiencyPercent === undefined
            ? undefined
            : rounded(latestSleep.efficiencyPercent, 0),
        interruptions: latestSleep.interruptions,
        regularityMinutes:
          regularityMinutes === undefined
            ? undefined
            : rounded(regularityMinutes, 0),
        label:
          latestSleepFactor?.score === undefined
            ? ("limited-data" as const)
            : latestSleepFactor.score >= 7.8
              ? ("restorative" as const)
              : latestSleepFactor.score >= 5.4
                ? ("typical" as const)
                : ("restless" as const),
        summary: latestSleepFactor?.summary ?? "A sleep baseline is forming.",
        estimateNote: latestSleep.staged
          ? `${latestSleep.sourceName ?? "Your wearable"} estimated the stage intervals. Duna uses continuity and your own trend; these are not clinical sleep stages.`
          : "This source provided asleep intervals without detailed stages. Duna will not invent Deep or REM sleep from duration alone.",
        referenceIds: [
          "roberts-2024-sleep",
          "apple-sleep-stages",
          "halson-2022-sleep-regularity",
        ],
      }
    : undefined;

  const currentSignal = daily.get(scoreDate);
  const baselineLoads = valuesForDates(
    daily,
    scoreDate,
    1,
    28,
    (signal) => signal.strainLoad,
  );
  const strainScore = currentSignal
    ? dailyStrainScore(currentSignal.strainLoad, baselineLoads)
    : undefined;
  const recentThreeDayAverage = average(
    valuesForDates(daily, scoreDate, 0, 2, (signal) => signal.strainLoad),
  );
  const baselineTwentyEightDayAverage = average(baselineLoads);
  const strain: HealthIntelligence["strain"] = {
    date: scoreDate,
    score: strainScore === undefined ? undefined : rounded(strainScore),
    label: strainLabel(strainScore),
    load:
      currentSignal?.strainLoad === undefined
        ? undefined
        : rounded(currentSignal.strainLoad, 0),
    recentThreeDayAverage:
      recentThreeDayAverage === undefined
        ? undefined
        : rounded(recentThreeDayAverage, 0),
    baselineTwentyEightDayAverage:
      baselineTwentyEightDayAverage === undefined
        ? undefined
        : rounded(baselineTwentyEightDayAverage, 0),
    source: currentSignal?.strainSource ?? "limited",
    summary:
      strainScore === undefined
        ? "Record a workout or a session effort to begin your personal load range."
        : `${strainLabel(strainScore).replace("very-high", "very high")} for you, based on ${currentSignal?.strainSource.replace("session-rpe", "session effort").replace("heart-rate", "workout heart rate") ?? "available load"}. Duna does not convert this into an injury-risk prediction.`,
    referenceIds: ["dugan-2022-beach-load", "wang-2020-acwr"],
  };

  const dates = [...signalDates].filter((date) => date <= today).sort();
  const readinessPoints = dates.flatMap((date) => {
    const score = weightedReadiness(
      readinessFactors({
        date,
        daily,
        sleeps: sleepByDate,
        checkIns: checkInByDate,
        timezone: input.timezone,
      }),
    );
    return score === undefined ? [] : [{ date, value: rounded(score) }];
  });
  const dailyPoints = <Key extends "hrv" | "restingHeartRate" | "strainLoad">(
    key: Key,
  ) =>
    [...daily.values()]
      .filter((signal) => signal.date <= today)
      .sort((left, right) => left.date.localeCompare(right.date))
      .flatMap((signal) => {
        const value = signal[key];
        return typeof value === "number" ? [{ date: signal.date, value }] : [];
      });
  const sleepPoints = sleeps
    .filter((night) => night.date <= today)
    .map((night) => ({
      date: night.date,
      value: rounded(night.durationHours, 1),
    }));
  const continuityPoints = sleeps.flatMap((night) => {
    const value = sleepContinuity(night);
    return value === undefined
      ? []
      : [{ date: night.date, value: rounded(value, 0) }];
  });
  const trends = [
    buildTrend({
      metric: "readiness",
      label: "Readiness",
      unit: "score",
      description:
        "A personal 0–10 synthesis; the shaded band is your own recent typical range.",
      values: readinessPoints,
      referenceIds: [
        "bourdon-2017-monitoring",
        "plews-2013-hrv",
        "rothschild-2024-recovery-ml",
      ],
    }),
    buildTrend({
      metric: "hrv-sdnn",
      label: "HRV balance",
      unit: "ms SDNN",
      description:
        "Daily median SDNN with a rolling personal band; direction matters only in context.",
      values: dailyPoints("hrv"),
      referenceIds: [
        "plews-2013-hrv",
        "flatt-2020-hrv-band",
        "apple-healthkit-hrv",
      ],
    }),
    buildTrend({
      metric: "resting-heart-rate",
      label: "Resting heart rate",
      unit: "bpm",
      description:
        "Your daily resting-heart-rate value compared with your own typical band.",
      values: dailyPoints("restingHeartRate"),
      referenceIds: ["plews-2013-hrv", "bourdon-2017-monitoring"],
    }),
    buildTrend({
      metric: "sleep-duration",
      label: "Sleep duration",
      unit: "hours",
      description:
        "Time asleep compared with your history—not a fixed eight-hour rule.",
      values: sleepPoints,
      referenceIds: [
        "roberts-2024-sleep",
        "apple-sleep-stages",
        "halson-2022-sleep-regularity",
      ],
    }),
    buildTrend({
      metric: "sleep-continuity",
      label: "Sleep continuity",
      unit: "%",
      description:
        "An estimated continuity signal from asleep, awake, and interruption intervals.",
      values: continuityPoints,
      referenceIds: [
        "roberts-2024-sleep",
        "apple-sleep-stages",
        "halson-2022-sleep-regularity",
      ],
    }),
    buildTrend({
      metric: "strain",
      label: "Duna Strain",
      unit: "score",
      description:
        "A personal load score from workout heart rate, workout duration, or session effort.",
      values: dailyPoints("strainLoad").map((point, index, points) => ({
        date: point.date,
        value:
          dailyStrainScore(
            point.value,
            points
              .slice(Math.max(0, index - 28), index)
              .map((item) => item.value),
          ) ?? 0,
      })),
      referenceIds: ["dugan-2022-beach-load", "wang-2020-acwr"],
    }),
  ];

  return {
    generatedAt: input.now.toISOString(),
    modelVersion: HEALTH_INTELLIGENCE_MODEL_VERSION,
    analysisWindowDays: ANALYSIS_WINDOW_DAYS,
    sourceNote:
      "Duna analyzes encrypted HealthKit imports after secure server-side decryption, preserves the contributing app or wearable, keeps HRV and resting-heart-rate baselines on a consistent dominant source, and compares you with your own recent history. Raw Health data is not sent to a generative-AI provider.",
    readiness: {
      date: scoreDate,
      score:
        readinessScore === undefined ? undefined : rounded(readinessScore, 1),
      label,
      confidence,
      dataDays,
      summary,
      recommendation,
      factors,
    },
    sleep,
    strain,
    trends,
    citations: research,
  };
}
