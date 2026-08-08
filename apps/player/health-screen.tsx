import type {
  HealthCategory,
  HealthCheckInInput,
  HealthDashboard,
  HealthSharingScope,
  HealthTimelineEntry,
} from "@duna/api";
import * as Crypto from "expo-crypto";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  Linking,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  clearAppleHealthCursor,
  getAppleHealthSyncState,
  healthCategoryDetails,
  isAppleHealthSyncActive,
  requestAppleHealthAccess,
  startAppleHealthMonitoring,
  syncAppleHealth,
} from "./health-kit";
import {
  healthSyncErrorMessage,
  type AppleHealthSyncState,
} from "./health-sync-utils";
import {
  FellixText as Text,
  FellixTextInput as TextInput,
} from "./fellix-text";
import { usePlayerRuntime } from "./runtime";

type HealthTheme = "light" | "dark";
const AnimatedSvgPath = Animated.createAnimatedComponent(Path);

function useHealthReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => subscription.remove();
  }, []);
  return reduced;
}

type HealthImportPhase =
  "permission" | "reading" | "protecting" | "processing" | "complete";

type HealthImportStatus = {
  readonly phase: HealthImportPhase;
  readonly imported: number;
  readonly deleted: number;
  readonly recordsFound: number;
  readonly pages?: number;
  readonly totalRecordsProcessed?: number;
  readonly remainingMetrics?: readonly string[];
  readonly complete?: boolean;
};

const healthImportProgress: Readonly<Record<HealthImportPhase, number>> = {
  permission: 0.12,
  reading: 0.34,
  protecting: 0.64,
  processing: 0.86,
  complete: 1,
};

const demoPersonId = "41a181e8-8103-49f4-bdeb-a71e693295f2";
const demoCoachId = "41a181e8-8103-49f4-bdeb-a71e693295f3";
const demoGrantId = "41a181e8-8103-49f4-bdeb-a71e693295f4";

function daysAgo(days: number, hour = 8): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

const demoResearch: HealthDashboard["intelligence"]["citations"] = [
  {
    id: "plews-2013-hrv",
    section: "hrv",
    title: "Evaluating training adaptation with heart-rate measures",
    authors: "Plews et al.",
    year: 2013,
    url: "https://pubmed.ncbi.nlm.nih.gov/23479420/",
    takeaway:
      "Rolling HRV and resting-heart-rate trends carry more context than one isolated reading.",
  },
  {
    id: "roberts-2024-sleep",
    section: "sleep",
    title: "Consumer sleep trackers compared with polysomnography",
    authors: "Roberts et al.",
    year: 2024,
    url: "https://pubmed.ncbi.nlm.nih.gov/39460013/",
    takeaway:
      "Wearable sleep-wake estimates can be useful, but stage accuracy varies.",
    caveat: "Duna labels stages as wearable estimates, not clinical staging.",
  },
  {
    id: "dugan-2022-beach-load",
    section: "strain",
    title: "Session RPE training load in Division I beach volleyball",
    authors: "Dugan et al.",
    year: 2022,
    url: "https://pubmed.ncbi.nlm.nih.gov/35916748/",
    takeaway:
      "Session effort was a practical load measure in collegiate beach volleyball.",
  },
];

const demoHealth: HealthDashboard = {
  subject: { id: demoPersonId, displayName: "Maya Rivera" },
  access: {
    owner: true,
    categories: ["heart", "recovery", "activity", "body"],
    scopes: ["summary", "timeline", "video-overlay"],
  },
  connection: {
    provider: "apple-health",
    status: "active",
    enabledCategories: ["heart", "recovery", "activity", "body"],
    consentVersion: "duna-health-v1",
    timezone: "America/New_York",
    lastSyncedAt: new Date().toISOString(),
  },
  summary: {
    latestHeartRate: 92,
    restingHeartRate: 54,
    heartRateVariabilityMs: 58,
    lastSleepHours: 7.7,
    sevenDayActiveEnergyKcal: 4_182,
    weightKilograms: 66.4,
    recoveryContext: {
      score: 78,
      label: "above-baseline",
      inputs: [
        "recent sleep duration",
        "resting heart rate versus recent baseline",
        "heart-rate variability versus recent baseline",
      ],
    },
  },
  daily: [
    {
      date: daysAgo(0).slice(0, 10),
      sleepHours: 7.7,
      restingHeartRate: 54,
      heartRateVariabilityMs: 58,
      activeEnergyKcal: 642,
      steps: 9_842,
      weightKilograms: 66.4,
    },
    {
      date: daysAgo(1).slice(0, 10),
      sleepHours: 6.9,
      restingHeartRate: 57,
      heartRateVariabilityMs: 51,
      activeEnergyKcal: 814,
      steps: 12_104,
    },
    {
      date: daysAgo(2).slice(0, 10),
      sleepHours: 8.1,
      restingHeartRate: 53,
      heartRateVariabilityMs: 62,
      activeEnergyKcal: 488,
      steps: 7_506,
    },
  ],
  timeline: [
    {
      id: "41a181e8-8103-49f4-bdeb-a71e69329501",
      metric: "heart-rate",
      category: "heart",
      kind: "quantity",
      startedAt: daysAgo(0, 10),
      endedAt: daysAgo(0, 10),
      value: 92,
      unit: "count/min",
    },
    {
      id: "41a181e8-8103-49f4-bdeb-a71e69329502",
      metric: "heart-rate-variability",
      category: "heart",
      kind: "quantity",
      startedAt: daysAgo(0, 7),
      endedAt: daysAgo(0, 7),
      value: 58,
      unit: "ms",
    },
    {
      id: "41a181e8-8103-49f4-bdeb-a71e69329503",
      metric: "resting-heart-rate",
      category: "heart",
      kind: "quantity",
      startedAt: daysAgo(0, 7),
      endedAt: daysAgo(0, 7),
      value: 54,
      unit: "count/min",
    },
    {
      id: "41a181e8-8103-49f4-bdeb-a71e69329504",
      metric: "sleep",
      category: "recovery",
      kind: "category",
      startedAt: daysAgo(1, 23),
      endedAt: daysAgo(0, 7),
      categoryValue: "asleep-core",
    },
    {
      id: "41a181e8-8103-49f4-bdeb-a71e69329505",
      metric: "active-energy",
      category: "activity",
      kind: "quantity",
      startedAt: daysAgo(1, 18),
      endedAt: daysAgo(1, 19),
      value: 814,
      unit: "kcal",
    },
    {
      id: "41a181e8-8103-49f4-bdeb-a71e69329506",
      metric: "weight",
      category: "body",
      kind: "quantity",
      startedAt: daysAgo(2, 8),
      endedAt: daysAgo(2, 8),
      value: 66.4,
      unit: "kg",
    },
  ],
  matches: [
    {
      matchId: "41a181e8-8103-49f4-bdeb-a71e69329510",
      label: "Rivera / Park vs Lee / Santos",
      occurredAt: daysAgo(2, 14),
      result: "won",
      sleepHours: 8.1,
      activeEnergyKcalBefore: 286,
      restingHeartRate: 53,
      heartRateVariabilityMs: 62,
      averageMatchHeartRate: 146,
      weightKilograms: 66.4,
    },
    {
      matchId: "41a181e8-8103-49f4-bdeb-a71e69329511",
      label: "Rivera / Park vs Kim / Evans",
      occurredAt: daysAgo(8, 12),
      result: "lost",
      sleepHours: 5.8,
      activeEnergyKcalBefore: 710,
      restingHeartRate: 61,
      heartRateVariabilityMs: 43,
      averageMatchHeartRate: 158,
      weightKilograms: 66.1,
    },
  ],
  correlations: [
    {
      metric: "sleep-hours",
      coefficient: 0.46,
      sampleSize: 8,
      interpretation:
        "Your sleep was associated with more wins in this 8-match sample. This is an association, not a cause or medical conclusion.",
    },
  ],
  intelligence: {
    generatedAt: new Date().toISOString(),
    modelVersion: "duna-readiness-personal-v1.0.0",
    analysisWindowDays: 90,
    sourceNote:
      "Duna compares encrypted HealthKit signals with your own recent history. Raw Health data is not sent to a generative-AI provider.",
    readiness: {
      date: new Date().toISOString().slice(0, 10),
      score: 8.4,
      label: "balanced",
      confidence: "high",
      dataDays: 62,
      summary:
        "Your HRV balance is supporting you, sleep continuity is inside your usual range, and yesterday’s load was meaningful without being unusual for you.",
      recommendation:
        "Experiment: keep today’s warm-up easy for ten minutes and note whether your energy catches up before adding intensity.",
      factors: [
        {
          id: "hrv-balance",
          label: "HRV balance",
          score: 8.8,
          weight: 0.3,
          status: "supporting",
          summary:
            "Your seven-day SDNN median is 9% above your prior baseline.",
          referenceIds: ["plews-2013-hrv"],
        },
        {
          id: "sleep-quality",
          label: "Sleep continuity",
          score: 7.9,
          weight: 0.3,
          status: "supporting",
          summary: "7.7 hours asleep with timing close to your usual window.",
          referenceIds: ["roberts-2024-sleep"],
        },
        {
          id: "resting-heart-rate",
          label: "Resting heart rate",
          score: 8.1,
          weight: 0.15,
          status: "supporting",
          summary: "54 bpm versus your 56 bpm recent baseline.",
          referenceIds: ["plews-2013-hrv"],
        },
        {
          id: "strain-balance",
          label: "Recent load",
          score: 6.8,
          weight: 0.15,
          status: "typical",
          summary: "Your three-day load is 106% of your prior daily average.",
          referenceIds: ["dugan-2022-beach-load"],
        },
        {
          id: "self-report",
          label: "How you feel",
          score: 7.5,
          weight: 0.1,
          status: "typical",
          summary: "Energy 4/5 · stress 2/5 · soreness 3/5.",
          referenceIds: [],
        },
      ],
    },
    sleep: {
      date: daysAgo(0).slice(0, 10),
      durationHours: 7.7,
      awakeMinutes: 31,
      coreMinutes: 253,
      deepMinutes: 82,
      remMinutes: 96,
      efficiencyPercent: 93,
      interruptions: 3,
      regularityMinutes: 18,
      label: "restorative",
      summary: "7.7 hours asleep with timing close to your usual window.",
      estimateNote:
        "Apple Watch estimated these stages. Duna uses their trend, not clinical sleep staging.",
      referenceIds: ["roberts-2024-sleep"],
    },
    strain: {
      date: daysAgo(0).slice(0, 10),
      score: 6.7,
      label: "high",
      load: 328,
      recentThreeDayAverage: 281,
      baselineTwentyEightDayAverage: 265,
      source: "heart-rate",
      summary:
        "High for you, based on workout heart rate. Duna does not turn this into an injury-risk prediction.",
      referenceIds: ["dugan-2022-beach-load"],
    },
    trends: [
      {
        metric: "readiness",
        label: "Readiness",
        unit: "score",
        description: "Your score with a personal typical band.",
        average: 7.6,
        latest: 8.4,
        typicalLow: 6.8,
        typicalHigh: 8.2,
        points: [7.1, 7.6, 6.9, 7.8, 8.1, 7.7, 8.4].map((value, index) => ({
          date: daysAgo(6 - index).slice(0, 10),
          value,
          typicalLow: 6.8,
          typicalHigh: 8.2,
          anomaly: value > 8.2 ? ("high" as const) : undefined,
        })),
        referenceIds: ["plews-2013-hrv"],
      },
      {
        metric: "hrv-sdnn",
        label: "HRV balance",
        unit: "ms SDNN",
        description: "Daily median versus your personal range.",
        average: 53,
        latest: 58,
        typicalLow: 48,
        typicalHigh: 57,
        points: [49, 52, 51, 54, 56, 55, 58].map((value, index) => ({
          date: daysAgo(6 - index).slice(0, 10),
          value,
          typicalLow: 48,
          typicalHigh: 57,
          anomaly: value > 57 ? ("high" as const) : undefined,
        })),
        referenceIds: ["plews-2013-hrv"],
      },
      {
        metric: "sleep-duration",
        label: "Sleep duration",
        unit: "hours",
        description: "Compared with your history—not a fixed target.",
        average: 7.3,
        latest: 7.7,
        typicalLow: 6.8,
        typicalHigh: 7.9,
        points: [7.1, 6.9, 7.8, 7.4, 6.6, 7.2, 7.7].map((value, index) => ({
          date: daysAgo(6 - index).slice(0, 10),
          value,
          typicalLow: 6.8,
          typicalHigh: 7.9,
          anomaly: value < 6.8 ? ("low" as const) : undefined,
        })),
        referenceIds: ["roberts-2024-sleep"],
      },
    ],
    citations: demoResearch,
  },
  latestCheckIn: {
    date: daysAgo(0).slice(0, 10),
    perceivedRecovery: 4,
    energy: 4,
    stress: 2,
    soreness: 3,
    practiceRpe: 7,
    practiceMinutes: 75,
    updatedAt: new Date().toISOString(),
  },
  grants: [
    {
      id: demoGrantId,
      audience: {
        id: `coach:${demoCoachId}`,
        kind: "coach",
        label: "Coach Lena Ortiz",
        detail: "Coach · @lenaortiz",
        personId: demoCoachId,
      },
      categories: ["heart", "recovery"],
      scopes: ["summary", "timeline"],
      expiresAt: daysAgo(-72),
      createdAt: daysAgo(18),
    },
  ],
  candidates: [
    {
      id: `coach:${demoCoachId}`,
      kind: "coach",
      label: "Coach Lena Ortiz",
      detail: "Coach · @lenaortiz",
      personId: demoCoachId,
    },
    {
      id: "player:41a181e8-8103-49f4-bdeb-a71e693295f5",
      kind: "player",
      label: "Theo Park",
      detail: "Duna player · @theopark",
      personId: "41a181e8-8103-49f4-bdeb-a71e693295f5",
    },
    {
      id: "organization:41a181e8-8103-49f4-bdeb-a71e693295f6",
      kind: "organization",
      label: "South Beach Volleyball Club",
      detail: "Authorized owner, manager, and coach staff",
      organizationId: "41a181e8-8103-49f4-bdeb-a71e693295f6",
    },
  ],
  disclaimer:
    "Duna shows descriptive performance context, not medical advice or a diagnosis. Correlations describe this player's available sample and do not establish cause.",
};

const metricNames: Readonly<Record<string, string>> = {
  "heart-rate": "Heart rate",
  "resting-heart-rate": "Resting heart rate",
  "heart-rate-variability": "Heart-rate variability",
  "walking-heart-rate": "Walking heart rate",
  "vo2-max": "VO₂ max",
  "respiratory-rate": "Respiratory rate",
  "oxygen-saturation": "Oxygen saturation",
  "body-temperature": "Body temperature",
  sleep: "Sleep",
  "active-energy": "Active energy",
  "basal-energy": "Basal energy",
  steps: "Steps",
  distance: "Distance",
  "exercise-minutes": "Exercise",
  "stand-minutes": "Stand time",
  workout: "Workout",
  weight: "Weight",
  "body-fat": "Body fat",
  "lean-body-mass": "Lean body mass",
};

function valueLabel(sample: HealthTimelineEntry): string {
  if (sample.metric === "sleep") {
    const hours =
      (new Date(sample.endedAt).getTime() -
        new Date(sample.startedAt).getTime()) /
      3_600_000;
    return `${hours.toFixed(1)} hr`;
  }
  if (sample.kind === "workout") {
    return `${Math.round((sample.workout?.durationSeconds ?? 0) / 60)} min`;
  }
  const value = sample.value;
  if (value === undefined)
    return sample.categoryValue?.replaceAll("-", " ") ?? "—";
  if (sample.unit === "count/min") return `${Math.round(value)} bpm`;
  if (sample.unit === "kg") return `${value.toFixed(1)} kg`;
  return `${Math.round(value * 10) / 10}${sample.unit ? ` ${sample.unit}` : ""}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function HealthScreen({
  onBack,
  theme,
}: {
  readonly onBack: () => void;
  readonly theme: HealthTheme;
}) {
  const runtime = usePlayerRuntime();
  const { client, mode } = runtime;
  const palette = theme === "dark" ? darkPalette : lightPalette;
  const styles = useMemo(() => createHealthStyles(palette), [palette]);
  const [dashboard, setDashboard] = useState<HealthDashboard | undefined>(
    mode === "preview" ? demoHealth : undefined,
  );
  const [loading, setLoading] = useState(mode !== "preview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [importStatus, setImportStatus] = useState<HealthImportStatus>();
  const [importOverlayHidden, setImportOverlayHidden] = useState(false);
  const [syncState, setSyncState] = useState<AppleHealthSyncState>();
  const [historySyncQueued, setHistorySyncQueued] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkIn, setCheckIn] = useState<HealthCheckInInput>({
    date: new Date().toISOString().slice(0, 10),
    perceivedRecovery: 3,
    energy: 3,
    stress: 3,
    soreness: 3,
  });
  const [selectedCategories, setSelectedCategories] = useState<
    HealthCategory[]
  >(["heart", "recovery", "activity", "body"]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>();
  const [shareCategories, setShareCategories] = useState<HealthCategory[]>([
    "heart",
    "recovery",
  ]);
  const [shareScopes, setShareScopes] = useState<HealthSharingScope[]>([
    "summary",
    "timeline",
  ]);
  const syncInFlight = useRef(false);

  useEffect(() => {
    if (mode === "preview") return;
    void getAppleHealthSyncState().then((state) => {
      setSyncState(state);
      if (state && !state.complete) setHistorySyncQueued(true);
    });
  }, [mode]);

  const reload = useCallback(async () => {
    if (!client || mode === "preview") {
      setDashboard(demoHealth);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setDashboard(await client.player.healthDashboard.query());
      setError(undefined);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Duna Health could not load.",
      );
    } finally {
      setLoading(false);
    }
  }, [client, mode]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const enabledCategories = dashboard?.connection?.enabledCategories;
  useEffect(() => {
    if (!dashboard?.latestCheckIn) return;
    const saved = dashboard.latestCheckIn;
    setCheckIn({
      date: saved.date,
      perceivedRecovery: saved.perceivedRecovery,
      energy: saved.energy,
      stress: saved.stress,
      soreness: saved.soreness,
      practiceRpe: saved.practiceRpe,
      practiceMinutes: saved.practiceMinutes,
      note: saved.note,
    });
  }, [dashboard?.latestCheckIn]);
  useEffect(() => {
    if (!enabledCategories?.length || mode === "preview") return;
    let stop: (() => void) | undefined;
    void startAppleHealthMonitoring(enabledCategories).then((cleanup) => {
      stop = cleanup;
    });
    return () => stop?.();
  }, [enabledCategories, mode]);

  const performSync = useCallback(
    async (categories: readonly HealthCategory[], announce = true) => {
      if (!client || mode === "preview") {
        if (announce) setNotice("Preview data refreshed.");
        return false;
      }
      if (syncInFlight.current) return false;
      if (isAppleHealthSyncActive()) {
        if (announce) {
          setNotice(
            "Your Apple Health history is already continuing securely in the background.",
          );
        }
        return false;
      }
      syncInFlight.current = true;
      setBusy(true);
      setError(undefined);
      setNotice(undefined);
      if (announce) {
        setImportOverlayHidden(false);
        setImportStatus({
          phase: "reading",
          imported: 0,
          deleted: 0,
          recordsFound: 0,
        });
      }
      try {
        const result = await syncAppleHealth({
          client,
          categories,
          maxPages: announce ? undefined : 15,
          onProgress: announce
            ? (progress) =>
                setImportStatus({
                  phase:
                    progress.phase === "reading" && progress.recordsFound === 0
                      ? "reading"
                      : "protecting",
                  imported: progress.imported,
                  deleted: progress.deleted,
                  recordsFound: progress.recordsFound,
                  pages: progress.pages,
                  totalRecordsProcessed: progress.totalRecordsProcessed,
                  remainingMetrics: progress.remainingMetrics,
                })
            : undefined,
        });
        if (announce) {
          setImportStatus({
            phase: "processing",
            imported: result.imported,
            deleted: result.deleted,
            recordsFound: result.recordsFound,
            pages: result.pages,
            totalRecordsProcessed: result.state.recordsProcessed,
            remainingMetrics: result.state.remainingMetrics,
            complete: result.complete,
          });
        }
        setSyncState(result.state);
        if (!result.complete) setHistorySyncQueued(true);
        await reload();
        if (announce) {
          setNotice(
            result.imported > 0 || result.deleted > 0
              ? result.complete
                ? `Apple Health history is up to date · ${result.state.recordsProcessed.toLocaleString()} records processed`
                : `${result.state.recordsProcessed.toLocaleString()} records processed · older history will keep importing automatically`
              : "Apple Health is connected. No new records were shared.",
          );
          setImportStatus({
            phase: "complete",
            imported: result.imported,
            deleted: result.deleted,
            recordsFound: result.recordsFound,
            pages: result.pages,
            totalRecordsProcessed: result.state.recordsProcessed,
            remainingMetrics: result.state.remainingMetrics,
            complete: result.complete,
          });
          await new Promise((resolve) => setTimeout(resolve, 800));
          setImportStatus(undefined);
        } else if (result.complete) {
          setNotice(
            `Apple Health history is up to date · ${result.state.recordsProcessed.toLocaleString()} records processed`,
          );
        }
        return true;
      } catch (reason) {
        if (announce) {
          setImportStatus(undefined);
          setError(healthSyncErrorMessage(reason));
        } else {
          setHistorySyncQueued(true);
        }
        return false;
      } finally {
        syncInFlight.current = false;
        setBusy(false);
      }
    },
    [client, mode, reload],
  );

  useEffect(() => {
    if (
      !historySyncQueued ||
      busy ||
      !enabledCategories?.length ||
      mode === "preview"
    ) {
      return;
    }
    const timer = setTimeout(() => {
      setHistorySyncQueued(false);
      void performSync(enabledCategories, false);
    }, 60_000);
    return () => clearTimeout(timer);
  }, [busy, enabledCategories, historySyncQueued, mode, performSync]);

  useEffect(() => {
    if (!enabledCategories?.length || mode === "preview") return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void performSync(enabledCategories, false);
    });
    return () => subscription.remove();
  }, [enabledCategories, mode, performSync]);

  async function connect() {
    if (selectedCategories.length === 0) {
      setError("Choose at least one Apple Health category.");
      return;
    }
    if (mode === "preview") {
      setConnectOpen(false);
      setNotice(
        "Preview only · Apple’s permission sheet opens on an installed iPhone build.",
      );
      return;
    }
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    setImportStatus({
      phase: "permission",
      imported: 0,
      deleted: 0,
      recordsFound: 0,
    });
    try {
      setConnectOpen(false);
      await requestAppleHealthAccess(selectedCategories);
      await performSync(selectedCategories);
    } catch (reason) {
      setImportStatus(undefined);
      setError(
        reason instanceof Error
          ? reason.message
          : "Apple Health access could not be requested.",
      );
    } finally {
      setBusy(false);
    }
  }

  function toggleCategory(
    category: HealthCategory,
    setter: (categories: HealthCategory[]) => void,
    current: readonly HealthCategory[],
  ) {
    const next = current.includes(category)
      ? current.filter((value) => value !== category)
      : [...current, category];
    setter(next);
    if (category === "heart" && current.includes(category)) {
      setShareScopes((scopes) =>
        scopes.filter((scope) => scope !== "video-overlay"),
      );
    }
  }

  async function share() {
    const candidate = dashboard?.candidates.find(
      (item) => item.id === selectedCandidateId,
    );
    if (
      !candidate ||
      shareCategories.length === 0 ||
      shareScopes.length === 0
    ) {
      setError("Choose a recipient, categories, and viewing access.");
      return;
    }
    if (mode === "preview" || !client) {
      setShareOpen(false);
      setNotice("Preview only · no Health access was shared.");
      return;
    }
    setBusy(true);
    try {
      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1_000);
      await client.player.createHealthSharingGrant.mutate({
        kind: candidate.kind,
        personId: candidate.personId,
        organizationId: candidate.organizationId,
        categories: [...shareCategories],
        scopes: [...shareScopes],
        expiresAt: expiresAt.toISOString(),
        idempotencyKey: Crypto.randomUUID(),
      });
      setShareOpen(false);
      setSelectedCandidateId(undefined);
      setNotice(`Health access shared with ${candidate.label} for 90 days.`);
      await reload();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Health access could not be shared.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveCheckIn() {
    if (mode === "preview" || !client) {
      setCheckInOpen(false);
      setNotice("Preview only · your check-in was not saved.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await client.player.saveHealthCheckIn.mutate({
        checkIn,
        idempotencyKey: Crypto.randomUUID(),
      });
      setCheckInOpen(false);
      setNotice(
        "Today’s private check-in is now part of your readiness context.",
      );
      await reload();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Your Health check-in could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  function revoke(grantId: string, label: string) {
    if (mode === "preview" || !client) {
      setNotice("Preview only · sharing was not changed.");
      return;
    }
    Alert.alert(
      "Stop sharing Health data?",
      `${label} will lose access immediately.`,
      [
        { text: "Keep sharing", style: "cancel" },
        {
          text: "Stop sharing",
          style: "destructive",
          onPress: () => {
            setBusy(true);
            void client.player.revokeHealthSharingGrant
              .mutate({ grantId, idempotencyKey: Crypto.randomUUID() })
              .then(reload)
              .catch((reason: unknown) =>
                setError(
                  reason instanceof Error
                    ? reason.message
                    : "Sharing could not be revoked.",
                ),
              )
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  }

  function disconnect() {
    if (mode === "preview" || !client) {
      setNotice("Preview only · imported Health data was not changed.");
      return;
    }
    Alert.alert(
      "Disconnect Apple Health?",
      "Duna will delete every imported Health record and revoke every Duna sharing grant. Apple Health permissions are managed separately in Settings.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete imported data",
          style: "destructive",
          onPress: () => {
            setBusy(true);
            void client.player.disconnectHealth
              .mutate({ idempotencyKey: Crypto.randomUUID() })
              .then(clearAppleHealthCursor)
              .then(() => setSyncState(undefined))
              .then(reload)
              .catch((reason: unknown) =>
                setError(
                  reason instanceof Error
                    ? reason.message
                    : "Duna Health could not disconnect.",
                ),
              )
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  }

  const summary = dashboard?.summary;
  const intelligence = dashboard?.intelligence;
  const connected = dashboard?.connection?.status === "active";
  const confirmedSampleCount = dashboard?.connection?.importedSampleCount;
  const historyRecordCount = Math.max(
    confirmedSampleCount ?? 0,
    syncState?.recordsProcessed ?? 0,
  );
  const earliestSampleLabel = dashboard?.connection?.earliestSampleAt
    ? new Date(dashboard.connection.earliestSampleAt).toLocaleDateString(
        "en-US",
        { month: "short", year: "numeric" },
      )
    : undefined;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.navRow}>
          <Pressable
            accessibilityLabel="Back to profile"
            onPress={onBack}
            style={styles.backButton}
          >
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <View style={styles.navCopy}>
            <Text style={styles.eyebrow}>HEALTH · PRIVATE BY DEFAULT</Text>
            <Text style={styles.navTitle}>Your body, in context.</Text>
          </View>
          {busy ? (
            <ActivityIndicator color={palette.aqua} />
          ) : (
            <View
              style={[styles.statusDot, connected && styles.statusDotActive]}
            />
          )}
        </View>

        {mode === "preview" && (
          <View style={styles.previewBanner}>
            <Text style={styles.previewText}>
              ILLUSTRATIVE HEALTH DATA · NO APPLE HEALTH DATA READ
            </Text>
          </View>
        )}
        {error && (
          <View style={styles.errorCard}>
            <View style={styles.errorCopy}>
              <Text style={styles.errorTitle}>Health sync paused</Text>
              <Text style={styles.error}>{error}</Text>
            </View>
            <Pressable
              disabled={busy}
              onPress={() =>
                void performSync(
                  enabledCategories?.length
                    ? enabledCategories
                    : selectedCategories,
                )
              }
              style={styles.errorAction}
            >
              <Text style={styles.errorActionText}>Try again</Text>
            </Pressable>
          </View>
        )}
        {notice && <Text style={styles.notice}>{notice}</Text>}

        {!connected && !loading ? (
          <View style={styles.connectHero}>
            <Text style={styles.connectMark}>♥</Text>
            <Text style={styles.heroTitle}>
              See what sets up your best volleyball.
            </Text>
            <Text style={styles.heroBody}>
              Bring selected Apple Health data into a private Duna timeline.
              Compare recovery with matches and align heart rate with Duna
              Vision.
            </Text>
            <View style={styles.benefitRow}>
              {[
                ["01", "Recovery + results"],
                ["02", "Heart rate on video"],
                ["03", "Training-load context"],
              ].map(([number, label]) => (
                <View key={number} style={styles.benefit}>
                  <Text style={styles.benefitNumber}>{number}</Text>
                  <Text style={styles.benefitLabel}>{label}</Text>
                </View>
              ))}
            </View>
            <Pressable
              onPress={() => setConnectOpen(true)}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>
                Choose Apple Health data
              </Text>
            </Pressable>
            <Text style={styles.finePrint}>
              Duna never writes to Apple Health. You choose each category, and
              Apple shows the final system permission sheet.
            </Text>
          </View>
        ) : (
          <>
            <ReadinessHero intelligence={intelligence} styles={styles} />

            <View style={styles.factorCard}>
              <View style={styles.factorHeading}>
                <View>
                  <Text style={styles.eyebrow}>YOUR SIGNALS</Text>
                  <Text style={styles.sectionTitle}>
                    Why today feels this way.
                  </Text>
                </View>
                <Text style={styles.confidencePill}>
                  {intelligence?.readiness.confidence.toUpperCase() ?? "LOW"}{" "}
                  CONFIDENCE
                </Text>
              </View>
              {(intelligence?.readiness.factors ?? []).map((factor) => (
                <View key={factor.id} style={styles.factorRow}>
                  <View style={styles.factorCopy}>
                    <View style={styles.factorLabelRow}>
                      <Text style={styles.factorLabel}>{factor.label}</Text>
                      <Text style={styles.factorValue}>
                        {factor.score?.toFixed(1) ?? "—"}
                      </Text>
                    </View>
                    <View style={styles.factorTrack}>
                      <View
                        style={[
                          styles.factorFill,
                          {
                            width: `${Math.max(0, Math.min(100, (factor.score ?? 0) * 10))}%`,
                          },
                          factor.status === "watch" && styles.factorFillWatch,
                        ]}
                      />
                    </View>
                    <Text style={styles.factorSummary}>{factor.summary}</Text>
                  </View>
                </View>
              ))}
            </View>

            <Pressable
              onPress={() => setCheckInOpen(true)}
              style={styles.checkInCard}
            >
              <View style={styles.checkInMark}>
                <Text style={styles.checkInMarkText}>✦</Text>
              </View>
              <View style={styles.checkInCopy}>
                <Text style={styles.eyebrow}>10-SECOND CHECK-IN</Text>
                <Text style={styles.checkInTitle}>
                  {dashboard?.latestCheckIn
                    ? "Update how you feel today"
                    : "Give the sensors your context"}
                </Text>
                <Text style={styles.checkInBody}>
                  Raw answers and notes stay private. Only their derived factor
                  can join a summary you explicitly share.
                </Text>
              </View>
              <Text style={styles.checkInArrow}>›</Text>
            </Pressable>

            {intelligence?.readiness.recommendation && (
              <View style={styles.recommendationCard}>
                <Text style={styles.recommendationMark}>↗</Text>
                <View style={styles.checkInCopy}>
                  <Text style={styles.recommendationEyebrow}>
                    ONE SMALL EXPERIMENT
                  </Text>
                  <Text style={styles.recommendationText}>
                    {intelligence.readiness.recommendation}
                  </Text>
                </View>
              </View>
            )}

            {syncState && (
              <View
                style={[
                  styles.historySyncCard,
                  syncState.complete && styles.historySyncCardComplete,
                ]}
              >
                <View
                  style={[
                    styles.historySyncIcon,
                    syncState.complete && styles.historySyncIconComplete,
                  ]}
                >
                  <Text style={styles.historySyncIconText}>
                    {syncState.complete ? "✓" : "↙"}
                  </Text>
                </View>
                <View style={styles.historySyncCopy}>
                  <Text style={styles.historySyncEyebrow}>
                    {syncState.complete
                      ? "HISTORY UP TO DATE"
                      : "HISTORICAL IMPORT IN PROGRESS"}
                  </Text>
                  <Text style={styles.historySyncTitle}>
                    {historyRecordCount.toLocaleString()} records{" "}
                    {confirmedSampleCount !== undefined
                      ? "securely stored"
                      : "processed"}
                  </Text>
                  <Text style={styles.historySyncBody}>
                    {syncState.complete
                      ? `Duna has reached the end of the selected Apple Health history${earliestSampleLabel ? ` back to ${earliestSampleLabel}` : ""}. New records continue incrementally.`
                      : `Older history will resume automatically while Duna is open and whenever you return${syncState.remainingMetrics.length ? ` · ${syncState.remainingMetrics.length} data types still backfilling` : ""}.`}
                  </Text>
                  <Text style={styles.historySyncSourceNote}>
                    Supported samples written to Apple Health by Apple Watch,
                    WHOOP, and other connected apps keep their source
                    attribution.
                  </Text>
                </View>
                {!syncState.complete && (
                  <Pressable
                    disabled={busy}
                    onPress={() =>
                      void performSync(
                        enabledCategories?.length
                          ? enabledCategories
                          : selectedCategories,
                      )
                    }
                    style={styles.historySyncAction}
                  >
                    <Text style={styles.historySyncActionText}>
                      {busy ? "Importing" : "Continue"}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}

            <View style={styles.statGrid}>
              <Stat
                label="SLEEP"
                value={summary?.lastSleepHours?.toFixed(1) ?? "—"}
                unit="hr"
                styles={styles}
              />
              <Stat
                label="RESTING"
                value={summary?.restingHeartRate?.toFixed(0) ?? "—"}
                unit="bpm"
                styles={styles}
              />
              <Stat
                label="HRV"
                value={summary?.heartRateVariabilityMs?.toFixed(0) ?? "—"}
                unit="ms"
                styles={styles}
              />
              <Stat
                label="7D ENERGY"
                value={
                  summary?.sevenDayActiveEnergyKcal?.toLocaleString() ?? "—"
                }
                unit="kcal"
                styles={styles}
              />
            </View>

            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.eyebrow}>PERSONAL BANDS</Text>
                <Text style={styles.sectionTitle}>Trend, range, anomaly.</Text>
              </View>
            </View>
            {(intelligence?.trends ?? []).slice(0, 3).map((trend) => (
              <HealthTrendCard
                palette={palette}
                key={trend.metric}
                styles={styles}
                trend={trend}
              />
            ))}

            {intelligence?.sleep && (
              <SleepIntelligenceCard
                sleep={intelligence.sleep}
                styles={styles}
              />
            )}
            <StrainIntelligenceCard
              strain={intelligence?.strain}
              styles={styles}
            />

            {!loading && (dashboard?.timeline.length ?? 0) === 0 && (
              <View style={styles.emptyHealthCard}>
                <View style={styles.emptyHealthMark}>
                  <Text style={styles.emptyHealthMarkText}>↙</Text>
                </View>
                <View style={styles.emptyHealthCopy}>
                  <Text style={styles.emptyHealthTitle}>
                    Connected. Waiting for Health data.
                  </Text>
                  <Text style={styles.emptyHealthBody}>
                    Apple does not tell Duna which categories you declined. Make
                    sure at least one selected category contains data, then sync
                    again.
                  </Text>
                  <View style={styles.emptyHealthActions}>
                    <Pressable
                      onPress={() => setConnectOpen(true)}
                      style={styles.emptyHealthButton}
                    >
                      <Text style={styles.emptyHealthButtonText}>
                        Review access
                      </Text>
                    </Pressable>
                    <Pressable
                      disabled={busy}
                      onPress={() =>
                        void performSync(
                          enabledCategories?.length
                            ? enabledCategories
                            : selectedCategories,
                        )
                      }
                    >
                      <Text style={styles.linkText}>Sync again</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.eyebrow}>DAILY RHYTHM</Text>
                <Text style={styles.sectionTitle}>The last few days.</Text>
              </View>
              <Pressable
                disabled={busy}
                onPress={() =>
                  void performSync(enabledCategories ?? ["heart", "recovery"])
                }
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Sync now</Text>
              </Pressable>
            </View>
            <View style={styles.card}>
              {(dashboard?.daily ?? []).slice(0, 7).map((day) => (
                <View key={day.date} style={styles.dayRow}>
                  <Text style={styles.dayDate}>
                    {formatDate(`${day.date}T12:00:00Z`)}
                  </Text>
                  <View style={styles.dayMetric}>
                    <Text style={styles.dayValue}>
                      {day.sleepHours?.toFixed(1) ?? "—"}
                    </Text>
                    <Text style={styles.dayLabel}>sleep</Text>
                  </View>
                  <View style={styles.dayMetric}>
                    <Text style={styles.dayValue}>
                      {day.restingHeartRate ?? "—"}
                    </Text>
                    <Text style={styles.dayLabel}>resting</Text>
                  </View>
                  <View style={styles.dayMetric}>
                    <Text style={styles.dayValue}>
                      {day.steps ? `${Math.round(day.steps / 100) / 10}k` : "—"}
                    </Text>
                    <Text style={styles.dayLabel}>steps</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.eyebrow}>MATCH CONTEXT</Text>
                <Text style={styles.sectionTitle}>
                  What surrounded your game.
                </Text>
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.horizontalBleed}
            >
              <View style={styles.matchRow}>
                {(dashboard?.matches ?? []).map((match) => (
                  <View key={match.matchId} style={styles.matchCard}>
                    <View style={styles.matchTop}>
                      <Text style={styles.matchDate}>
                        {formatDate(match.occurredAt)}
                      </Text>
                      <Text
                        style={[
                          styles.result,
                          match.result === "won" ? styles.win : styles.loss,
                        ]}
                      >
                        {match.result.toUpperCase()}
                      </Text>
                    </View>
                    <Text numberOfLines={2} style={styles.matchTitle}>
                      {match.label}
                    </Text>
                    <View style={styles.matchSignals}>
                      <Text style={styles.matchSignal}>
                        ☾ {match.sleepHours?.toFixed(1) ?? "—"} hr
                      </Text>
                      <Text style={styles.matchSignal}>
                        ♥ {match.averageMatchHeartRate ?? "—"} avg
                      </Text>
                      <Text style={styles.matchSignal}>
                        ↗ {match.activeEnergyKcalBefore ?? "—"} kcal pre
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>

            {(dashboard?.correlations.length ?? 0) > 0 && (
              <View style={styles.insightCard}>
                <Text style={styles.insightMark}>✦</Text>
                <View style={styles.insightCopy}>
                  <Text style={styles.eyebrow}>
                    EARLY PATTERN · NOT CAUSATION
                  </Text>
                  <Text style={styles.insightTitle}>
                    {dashboard!.correlations[0]!.interpretation}
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.eyebrow}>DETAILED TIMELINE</Text>
                <Text style={styles.sectionTitle}>Every available signal.</Text>
              </View>
            </View>
            <View style={styles.card}>
              {(dashboard?.timeline ?? []).slice(0, 20).map((sample, index) => (
                <View
                  key={sample.id}
                  style={[styles.timelineRow, index > 0 && styles.rowDivider]}
                >
                  <View style={styles.timelineIcon}>
                    <Text style={styles.timelineIconText}>
                      {healthCategoryDetails[sample.category].icon}
                    </Text>
                  </View>
                  <View style={styles.timelineCopy}>
                    <Text style={styles.timelineTitle}>
                      {metricNames[sample.metric] ?? sample.metric}
                    </Text>
                    <Text style={styles.timelineMeta}>
                      {new Date(sample.startedAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {sample.source?.name ? ` · ${sample.source.name}` : ""}
                    </Text>
                  </View>
                  <Text style={styles.timelineValue}>{valueLabel(sample)}</Text>
                </View>
              ))}
            </View>

            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.eyebrow}>WHO CAN SEE THIS</Text>
                <Text style={styles.sectionTitle}>You stay in control.</Text>
              </View>
              <Pressable
                onPress={() => setShareOpen(true)}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Share</Text>
              </Pressable>
            </View>
            <View style={styles.privacyCard}>
              <View style={styles.lockRow}>
                <View style={styles.lockIcon}>
                  <Text style={styles.lockText}>◇</Text>
                </View>
                <View style={styles.timelineCopy}>
                  <Text style={styles.timelineTitle}>
                    Private unless you choose otherwise
                  </Text>
                  <Text style={styles.timelineMeta}>
                    Profile visibility never exposes Health data.
                  </Text>
                </View>
              </View>
              {(dashboard?.grants ?? []).map((grant) => (
                <View key={grant.id} style={styles.grantRow}>
                  <View style={styles.timelineCopy}>
                    <Text style={styles.timelineTitle}>
                      {grant.audience.label}
                    </Text>
                    <Text style={styles.timelineMeta}>
                      {grant.categories.join(" + ")} · expires{" "}
                      {formatDate(grant.expiresAt)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => revoke(grant.id, grant.audience.label)}
                  >
                    <Text style={styles.revokeText}>Revoke</Text>
                  </Pressable>
                </View>
              ))}
            </View>

            <View style={styles.systemNote}>
              <Text style={styles.systemNoteTitle}>Two separate controls</Text>
              <Text style={styles.systemNoteBody}>
                Apple Health and Settings control what Duna may read. This
                screen controls who inside Duna may see imported data. Duna
                sharing never changes Apple’s permission settings.
              </Text>
              <Pressable onPress={() => setConnectOpen(true)}>
                <Text style={styles.linkText}>
                  Review Apple Health categories →
                </Text>
              </Pressable>
              <Pressable onPress={disconnect}>
                <Text style={styles.deleteText}>
                  Disconnect and delete imported Health data
                </Text>
              </Pressable>
            </View>
            <View style={styles.researchCard}>
              <Text style={styles.eyebrow}>METHOD + RESEARCH</Text>
              <Text style={styles.researchTitle}>
                Transparent enough to challenge.
              </Text>
              <Text style={styles.researchBody}>
                Duna uses explainable personal baselines, not a population
                wellness target. Open the evidence behind each signal.
              </Text>
              {(intelligence?.citations ?? []).map((citation) => (
                <Pressable
                  key={citation.id}
                  onPress={() => void Linking.openURL(citation.url)}
                  style={styles.researchRow}
                >
                  <View style={styles.checkInCopy}>
                    <Text style={styles.researchCitationTitle}>
                      {citation.title}
                    </Text>
                    <Text style={styles.timelineMeta}>
                      {citation.authors} · {citation.year} · {citation.section}
                    </Text>
                  </View>
                  <Text style={styles.checkInArrow}>↗</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.disclaimer}>{dashboard?.disclaimer}</Text>
          </>
        )}
      </ScrollView>

      <HealthImportOverlay
        onMinimize={() => setImportOverlayHidden(true)}
        palette={palette}
        status={importOverlayHidden ? undefined : importStatus}
        styles={styles}
      />
      <ConnectModal
        busy={busy}
        categories={selectedCategories}
        onClose={() => setConnectOpen(false)}
        onConnect={() => void connect()}
        onToggle={(category) =>
          toggleCategory(category, setSelectedCategories, selectedCategories)
        }
        palette={palette}
        styles={styles}
        visible={connectOpen}
      />
      <ShareModal
        busy={busy}
        candidates={dashboard?.candidates ?? []}
        categories={shareCategories}
        onClose={() => setShareOpen(false)}
        onShare={() => void share()}
        onToggleCategory={(category) =>
          toggleCategory(category, setShareCategories, shareCategories)
        }
        onToggleScope={(scope) =>
          setShareScopes((current) =>
            current.includes(scope)
              ? current.filter((item) => item !== scope)
              : [...current, scope],
          )
        }
        onSelectCandidate={setSelectedCandidateId}
        palette={palette}
        scopes={shareScopes}
        selectedCandidateId={selectedCandidateId}
        styles={styles}
        visible={shareOpen}
      />
      <CheckInModal
        busy={busy}
        checkIn={checkIn}
        onChange={setCheckIn}
        onClose={() => setCheckInOpen(false)}
        onSave={() => void saveCheckIn()}
        styles={styles}
        visible={checkInOpen}
      />
    </View>
  );
}

function ReadinessHero({
  intelligence,
  styles,
}: {
  readonly intelligence?: HealthDashboard["intelligence"];
  readonly styles: ReturnType<typeof createHealthStyles>;
}) {
  const readiness = intelligence?.readiness;
  const status = readiness?.label.replace("-", " ") ?? "building baseline";
  const today = new Date().toISOString().slice(0, 10);
  const readinessWhen =
    !readiness || readiness.date === today
      ? "TODAY"
      : `AS OF ${new Date(`${readiness.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()}`;
  return (
    <View style={styles.readinessHero}>
      <View style={styles.readinessGlowA} />
      <View style={styles.readinessGlowB} />
      <Text style={styles.readinessEyebrow}>
        DUNA READINESS · {readinessWhen}
      </Text>
      <View style={styles.readinessScoreRow}>
        <Text style={styles.readinessNumber}>
          {readiness?.score?.toFixed(1) ?? "—"}
        </Text>
        <Text style={styles.readinessScale}>/ 10.0</Text>
      </View>
      <View style={styles.readinessStatusRow}>
        <View style={styles.readinessStatusDot} />
        <Text style={styles.readinessStatus}>{status}</Text>
      </View>
      <Text style={styles.readinessSummary}>{readiness?.summary}</Text>
      <Text style={styles.readinessMeta}>
        {readiness?.dataDays ?? 0} personal data days ·{" "}
        {readiness?.confidence ?? "low"} confidence · model{" "}
        {intelligence?.modelVersion ?? "forming"}
      </Text>
    </View>
  );
}

function HealthTrendCard({
  palette,
  styles,
  trend,
}: {
  readonly palette: HealthPalette;
  readonly styles: ReturnType<typeof createHealthStyles>;
  readonly trend: HealthDashboard["intelligence"]["trends"][number];
}) {
  const reduceMotion = useHealthReducedMotion();
  const [selectedIndex, setSelectedIndex] = useState<number>();
  const drawProgress = useRef(new Animated.Value(0)).current;
  const width = 330;
  const height = 138;
  const inset = 12;
  const available = trend.points.map((point) => point.value);
  const rangeValues = [
    ...available,
    ...(trend.typicalLow === undefined ? [] : [trend.typicalLow]),
    ...(trend.typicalHigh === undefined ? [] : [trend.typicalHigh]),
  ];
  const minimum = Math.min(...rangeValues, 0);
  const maximum = Math.max(...rangeValues, 1);
  const padding = Math.max((maximum - minimum) * 0.15, 0.5);
  const floor = minimum - padding;
  const ceiling = maximum + padding;
  const x = (index: number) =>
    inset +
    (index / Math.max(1, trend.points.length - 1)) * (width - inset * 2);
  const y = (value: number) =>
    inset +
    ((ceiling - value) / Math.max(0.001, ceiling - floor)) *
      (height - inset * 2);
  const path = trend.points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(point.value).toFixed(1)}`,
    )
    .join(" ");
  const plottedPoints = trend.points.map((point, index) => ({
    x: x(index),
    y: y(point.value),
  }));
  const pathLength = Math.max(
    1,
    plottedPoints.slice(1).reduce((total, point, index) => {
      const previous = plottedPoints[index];
      return previous
        ? total + Math.hypot(point.x - previous.x, point.y - previous.y)
        : total;
    }, 0),
  );
  const fillPath = path
    ? `${path} L ${x(trend.points.length - 1).toFixed(1)} ${height - inset} L ${inset} ${height - inset} Z`
    : "";
  const bandTop =
    trend.typicalHigh === undefined ? undefined : y(trend.typicalHigh);
  const bandBottom =
    trend.typicalLow === undefined ? undefined : y(trend.typicalLow);
  const selectedPoint =
    selectedIndex === undefined ? undefined : trend.points[selectedIndex];

  useEffect(() => {
    drawProgress.stopAnimation();
    if (reduceMotion || !path) {
      drawProgress.setValue(1);
      return;
    }
    drawProgress.setValue(0);
    Animated.timing(drawProgress, {
      duration: 850,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: false,
    }).start();
  }, [drawProgress, path, reduceMotion]);

  const strokeOffset = drawProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [pathLength, 0],
  });
  return (
    <View style={styles.trendCard}>
      <View style={styles.trendHeader}>
        <View>
          <Text style={styles.trendLabel}>{trend.label}</Text>
          <Text style={styles.trendDescription}>{trend.description}</Text>
        </View>
        <View style={styles.trendLatest}>
          <Text style={styles.trendLatestValue}>
            {(selectedPoint?.value ?? trend.latest)?.toFixed(
              trend.unit === "score" ? 1 : 0,
            ) ?? "—"}
          </Text>
          <Text style={styles.trendUnit}>
            {selectedPoint
              ? new Date(`${selectedPoint.date}T12:00:00`).toLocaleDateString(
                  "en-US",
                  { month: "short", day: "numeric" },
                )
              : trend.unit}
          </Text>
        </View>
      </View>
      {trend.points.length > 1 ? (
        <Svg height={height} viewBox={`0 0 ${width} ${height}`} width="100%">
          <Defs>
            <LinearGradient
              id={`trend-${trend.metric}`}
              x1="0"
              x2="0"
              y1="0"
              y2="1"
            >
              <Stop offset="0" stopColor={palette.aqua} stopOpacity="0.3" />
              <Stop offset="1" stopColor={palette.amber} stopOpacity="0.03" />
            </LinearGradient>
          </Defs>
          {bandTop !== undefined && bandBottom !== undefined && (
            <Rect
              fill={palette.aqua}
              height={Math.max(2, bandBottom - bandTop)}
              opacity={0.13}
              rx={5}
              width={width - inset * 2}
              x={inset}
              y={bandTop}
            />
          )}
          <AnimatedSvgPath
            d={fillPath}
            fill={`url(#trend-${trend.metric})`}
            opacity={drawProgress}
          />
          <AnimatedSvgPath
            d={path}
            fill="none"
            stroke={palette.ink}
            strokeDasharray={`${pathLength} ${pathLength}`}
            strokeDashoffset={strokeOffset}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.3}
          />
          {trend.points.map((point, index) => (
            <Circle
              cx={x(index)}
              cy={y(point.value)}
              fill={point.anomaly ? palette.coral : palette.surface}
              key={`${point.date}-${index}`}
              onPress={() => setSelectedIndex(index)}
              r={selectedIndex === index ? 6.2 : point.anomaly ? 4.2 : 2.8}
              stroke={palette.ink}
              strokeWidth={selectedIndex === index ? 2.4 : 1.5}
            />
          ))}
          {trend.points.map((point, index) => {
            const segment = (width - inset * 2) / trend.points.length;
            return (
              <Rect
                fill="transparent"
                height={height}
                key={`target-${point.date}-${index}`}
                onPress={() => setSelectedIndex(index)}
                width={segment}
                x={Math.max(0, x(index) - segment / 2)}
                y={0}
              />
            );
          })}
        </Svg>
      ) : (
        <Text style={styles.trendEmpty}>
          More days will reveal your personal band.
        </Text>
      )}
      {selectedPoint && (
        <Pressable
          accessibilityLabel="Clear selected health data point"
          onPress={() => setSelectedIndex(undefined)}
          style={styles.trendSelected}
        >
          <Text style={styles.trendSelectedDate}>
            {new Date(`${selectedPoint.date}T12:00:00`).toLocaleDateString(
              "en-US",
              { weekday: "short", month: "short", day: "numeric" },
            )}
          </Text>
          <Text style={styles.trendSelectedValue}>
            {selectedPoint.value.toFixed(trend.unit === "score" ? 1 : 0)}{" "}
            {trend.unit}
            {selectedPoint.anomaly ? " · outside your usual band" : ""}
          </Text>
          <Text style={styles.trendSelectedClose}>×</Text>
        </Pressable>
      )}
      <View style={styles.trendFooter}>
        <Text style={styles.trendBandLabel}>TYPICAL BAND</Text>
        <Text style={styles.trendBandValue}>
          avg {trend.average?.toFixed(1) ?? "—"} ·{" "}
          {trend.typicalLow?.toFixed(1) ?? "—"}–
          {trend.typicalHigh?.toFixed(1) ?? "—"} {trend.unit}
        </Text>
      </View>
    </View>
  );
}

function SleepIntelligenceCard({
  sleep,
  styles,
}: {
  readonly sleep: NonNullable<HealthDashboard["intelligence"]["sleep"]>;
  readonly styles: ReturnType<typeof createHealthStyles>;
}) {
  const stageTotal =
    (sleep.coreMinutes ?? 0) +
    (sleep.deepMinutes ?? 0) +
    (sleep.remMinutes ?? 0) +
    (sleep.awakeMinutes ?? 0);
  const stages = [
    ["Awake", sleep.awakeMinutes, "#ffb39f"],
    ["Core", sleep.coreMinutes, "#7fded5"],
    ["Deep", sleep.deepMinutes, "#736dff"],
    ["REM", sleep.remMinutes, "#e889dd"],
  ] as const;
  return (
    <View style={styles.sleepCard}>
      <View style={styles.sleepHeader}>
        <View>
          <Text style={styles.eyebrow}>SLEEP · WEARABLE ESTIMATE</Text>
          <Text style={styles.sleepTitle}>
            {sleep.durationHours.toFixed(1)} hours asleep
          </Text>
        </View>
        <Text style={styles.sleepBadge}>{sleep.label.replace("-", " ")}</Text>
      </View>
      {stageTotal > 0 && (
        <View style={styles.sleepStageTrack}>
          {stages.map(([label, minutes, color]) =>
            minutes === undefined || minutes <= 0 ? null : (
              <View
                accessibilityLabel={`${label} ${Math.round(minutes)} minutes`}
                key={label}
                style={{
                  backgroundColor: color,
                  flex: minutes / stageTotal,
                  minWidth: 4,
                }}
              />
            ),
          )}
        </View>
      )}
      <View style={styles.sleepStageLegend}>
        {stages.map(([label, minutes, color]) => (
          <View key={label} style={styles.sleepStageItem}>
            <View style={[styles.sleepStageDot, { backgroundColor: color }]} />
            <Text style={styles.sleepStageName}>{label}</Text>
            <Text style={styles.sleepStageValue}>
              {minutes === undefined ? "—" : `${Math.round(minutes)}m`}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.sleepStats}>
        <View>
          <Text style={styles.sleepStatValue}>
            {sleep.efficiencyPercent ?? "—"}%
          </Text>
          <Text style={styles.sleepStatLabel}>continuity</Text>
        </View>
        <View>
          <Text style={styles.sleepStatValue}>
            {sleep.interruptions ?? "—"}
          </Text>
          <Text style={styles.sleepStatLabel}>interruptions</Text>
        </View>
        <View>
          <Text style={styles.sleepStatValue}>
            {sleep.regularityMinutes ?? "—"}m
          </Text>
          <Text style={styles.sleepStatLabel}>from usual</Text>
        </View>
      </View>
      <Text style={styles.sleepSummary}>{sleep.summary}</Text>
      <Text style={styles.sleepEstimate}>{sleep.estimateNote}</Text>
    </View>
  );
}

function StrainIntelligenceCard({
  strain,
  styles,
}: {
  readonly strain?: HealthDashboard["intelligence"]["strain"];
  readonly styles: ReturnType<typeof createHealthStyles>;
}) {
  const score = strain?.score ?? 0;
  return (
    <View style={styles.strainCard}>
      <View style={styles.strainTop}>
        <View>
          <Text style={styles.eyebrow}>DUNA STRAIN</Text>
          <View style={styles.strainScoreRow}>
            <Text style={styles.strainNumber}>
              {strain?.score?.toFixed(1) ?? "—"}
            </Text>
            <Text style={styles.strainScale}>/ 10.0</Text>
          </View>
        </View>
        <View style={styles.strainArc}>
          <View style={[styles.strainArcFill, { width: `${score * 10}%` }]} />
        </View>
      </View>
      <Text style={styles.strainSummary}>{strain?.summary}</Text>
      <View style={styles.strainCompare}>
        <View>
          <Text style={styles.strainCompareValue}>
            {strain?.recentThreeDayAverage ?? "—"}
          </Text>
          <Text style={styles.strainCompareLabel}>3-day load</Text>
        </View>
        <Text style={styles.strainVersus}>vs</Text>
        <View>
          <Text style={styles.strainCompareValue}>
            {strain?.baselineTwentyEightDayAverage ?? "—"}
          </Text>
          <Text style={styles.strainCompareLabel}>28-day average</Text>
        </View>
      </View>
    </View>
  );
}

function CheckInModal({
  busy,
  checkIn,
  onChange,
  onClose,
  onSave,
  styles,
  visible,
}: {
  readonly busy: boolean;
  readonly checkIn: HealthCheckInInput;
  readonly onChange: (value: HealthCheckInInput) => void;
  readonly onClose: () => void;
  readonly onSave: () => void;
  readonly styles: ReturnType<typeof createHealthStyles>;
  readonly visible: boolean;
}) {
  const questions = [
    ["perceivedRecovery", "How recovered do you feel?", "Low", "Great"],
    ["energy", "Energy right now", "Flat", "High"],
    ["stress", "Stress today", "Low", "High"],
    ["soreness", "Body soreness", "None", "High"],
  ] as const;
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.modalBackdrop}>
        <SafeAreaView edges={["bottom"]} style={styles.checkInSheet}>
          <View style={styles.modalHeader}>
            <Pressable onPress={onClose}>
              <Text style={styles.modalClose}>Close</Text>
            </Pressable>
            <Text style={styles.modalEyebrow}>PRIVATE CHECK-IN</Text>
            <View style={styles.modalSpacer} />
          </View>
          <ScrollView contentContainerStyle={styles.checkInContent}>
            <Text style={styles.modalTitle}>
              Add the part sensors cannot know.
            </Text>
            <Text style={styles.modalBody}>
              This takes about ten seconds. Duna encrypts the answers and uses
              them only as context for your personal trend.
            </Text>
            {questions.map(([key, label, low, high]) => (
              <View key={key} style={styles.checkInQuestion}>
                <Text style={styles.checkInQuestionLabel}>{label}</Text>
                <View style={styles.ratingRow}>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ selected: checkIn[key] === value }}
                      key={value}
                      onPress={() => onChange({ ...checkIn, [key]: value })}
                      style={[
                        styles.ratingButton,
                        checkIn[key] === value && styles.ratingButtonActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.ratingText,
                          checkIn[key] === value && styles.ratingTextActive,
                        ]}
                      >
                        {value}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.ratingEnds}>
                  <Text style={styles.ratingEnd}>{low}</Text>
                  <Text style={styles.ratingEnd}>{high}</Text>
                </View>
              </View>
            ))}
            <View style={styles.checkInQuestion}>
              <Text style={styles.checkInQuestionLabel}>
                Practice effort today
              </Text>
              <View style={styles.effortRow}>
                {[
                  ["None", undefined],
                  ["Easy", 3],
                  ["Solid", 6],
                  ["Hard", 9],
                ].map(([label, value]) => (
                  <Pressable
                    key={label}
                    onPress={() =>
                      onChange({
                        ...checkIn,
                        practiceRpe: value as number | undefined,
                        practiceMinutes:
                          value === undefined
                            ? undefined
                            : (checkIn.practiceMinutes ?? 75),
                      })
                    }
                    style={[
                      styles.effortButton,
                      checkIn.practiceRpe === value &&
                        styles.effortButtonActive,
                    ]}
                  >
                    <Text style={styles.effortText}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              {checkIn.practiceRpe !== undefined && (
                <View style={styles.durationRow}>
                  {[45, 75, 105].map((minutes) => (
                    <Pressable
                      key={minutes}
                      onPress={() =>
                        onChange({ ...checkIn, practiceMinutes: minutes })
                      }
                      style={[
                        styles.durationButton,
                        checkIn.practiceMinutes === minutes &&
                          styles.durationButtonActive,
                      ]}
                    >
                      <Text style={styles.durationText}>{minutes} min</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
            <TextInput
              maxLength={280}
              multiline
              onChangeText={(note) => onChange({ ...checkIn, note })}
              placeholder="Anything worth remembering? Optional."
              placeholderTextColor="#7b8584"
              style={styles.checkInNote}
              value={checkIn.note}
            />
            <Pressable
              disabled={busy}
              onPress={onSave}
              style={[styles.primaryButton, busy && styles.disabled]}
            >
              <Text style={styles.primaryButtonText}>
                {busy ? "Saving securely…" : "Save private check-in"}
              </Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function HealthImportOverlay({
  onMinimize,
  palette,
  status,
  styles,
}: {
  readonly onMinimize: () => void;
  readonly palette: HealthPalette;
  readonly status?: HealthImportStatus;
  readonly styles: ReturnType<typeof createHealthStyles>;
}) {
  const spin = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const visible = Boolean(status);
  const shouldSpin = Boolean(
    status &&
    (status.phase === "permission" ||
      (status.phase === "reading" && status.recordsFound === 0)),
  );

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!visible || !shouldSpin || reduceMotion) {
      spin.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 2_200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => {
      animation.stop();
      spin.setValue(0);
    };
  }, [reduceMotion, shouldSpin, spin, visible]);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: status ? healthImportProgress[status.phase] : 0,
      duration: reduceMotion ? 0 : 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, reduceMotion, status?.phase]);

  if (!status) return null;

  const copy =
    status.phase === "permission"
      ? {
          eyebrow: "APPLE HEALTH",
          title: "Choose what Duna may read.",
          body: "Apple’s private permission sheet is opening. Duna never receives categories you do not approve.",
        }
      : status.phase === "reading"
        ? {
            eyebrow: "BRINGING IT IN",
            title:
              status.recordsFound > 0
                ? "Importing your Health history."
                : "Reading your selected signals.",
            body:
              status.recordsFound > 0
                ? "Your imported data is usable now. Older records continue in resumable secure pages, so years of history never have to finish in one blocking session."
                : "Duna is collecting the Health records you chose directly from this iPhone.",
          }
        : status.phase === "protecting"
          ? {
              eyebrow: "PROTECTING YOUR DATA",
              title: "Protecting a secure page.",
              body: "Every record is encrypted and source-aware before it enters your private Duna timeline. You can keep using Duna while history continues.",
            }
          : status.phase === "processing"
            ? {
                eyebrow: "BUILDING CONTEXT",
                title: "Finding the rhythm around your game.",
                body: "Duna is organizing recovery, heart, activity and body signals around your matches and videos.",
              }
            : {
                eyebrow: "READY",
                title:
                  status.imported > 0
                    ? "Your Health timeline is ready."
                    : "Apple Health is connected.",
                body:
                  status.imported > 0
                    ? status.complete === false
                      ? "Your timeline is ready. Older history will continue automatically while Duna is open and resume when you return."
                      : "Your private performance context is ready to explore."
                    : "No new records were shared. You can review Apple Health access or sync again at any time.",
              };
  const stageIndex =
    status.phase === "permission" || status.phase === "reading"
      ? 0
      : status.phase === "protecting"
        ? 1
        : status.phase === "processing"
          ? 2
          : 3;
  const recordLabel =
    status.phase === "permission"
      ? "Private by default"
      : status.phase === "reading"
        ? status.recordsFound > 0
          ? `${(status.totalRecordsProcessed ?? status.recordsFound).toLocaleString()} records processed · page ${(status.pages ?? 0) + 1}`
          : "Scanning selected categories"
        : status.imported > 0
          ? `${(status.totalRecordsProcessed ?? status.imported).toLocaleString()} total records processed`
          : "Secure connection confirmed";

  return (
    <Modal animationType="fade" statusBarTranslucent transparent visible>
      <View accessibilityViewIsModal style={styles.importBackdrop}>
        <View style={styles.importCard}>
          <View style={styles.importMark}>
            <Animated.View
              style={[
                styles.importOrbit,
                {
                  transform: [
                    {
                      rotate: spin.interpolate({
                        inputRange: [0, 1],
                        outputRange: ["0deg", "360deg"],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={styles.importOrbitDot} />
            </Animated.View>
            <View style={styles.importHeart}>
              <Text style={styles.importHeartText}>♥</Text>
            </View>
          </View>
          <Text style={styles.importEyebrow}>{copy.eyebrow}</Text>
          <Text style={styles.importTitle}>{copy.title}</Text>
          <Text style={styles.importBody}>{copy.body}</Text>
          <Text style={styles.importCount}>{recordLabel}</Text>
          {status.phase !== "permission" && status.phase !== "complete" && (
            <Pressable onPress={onMinimize} style={styles.importMinimizeButton}>
              <Text style={styles.importMinimizeButtonText}>
                Keep using Duna
              </Text>
            </Pressable>
          )}
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{
              max: 100,
              min: 0,
              now: Math.round(healthImportProgress[status.phase] * 100),
            }}
            style={styles.importProgressTrack}
          >
            <Animated.View
              style={[
                styles.importProgressFill,
                {
                  width: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0%", "100%"],
                  }),
                },
              ]}
            />
          </View>
          <View style={styles.importStages}>
            {["Read", "Protect", "Organize"].map((label, index) => {
              const active = index <= Math.min(stageIndex, 2);
              return (
                <View key={label} style={styles.importStage}>
                  <View
                    style={[
                      styles.importStageDot,
                      active && { backgroundColor: palette.aqua },
                    ]}
                  />
                  <Text
                    style={[
                      styles.importStageText,
                      active && { color: palette.ink },
                    ]}
                  >
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Stat({
  label,
  value,
  unit,
  styles,
}: {
  readonly label: string;
  readonly value: string;
  readonly unit: string;
  readonly styles: ReturnType<typeof createHealthStyles>;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statUnit}>{unit}</Text>
    </View>
  );
}

type HealthPalette = {
  readonly [Key in keyof typeof lightPalette]: string;
};

function ConnectModal({
  busy,
  categories,
  onClose,
  onConnect,
  onToggle,
  palette,
  styles,
  visible,
}: {
  readonly busy: boolean;
  readonly categories: readonly HealthCategory[];
  readonly onClose: () => void;
  readonly onConnect: () => void;
  readonly onToggle: (category: HealthCategory) => void;
  readonly palette: HealthPalette;
  readonly styles: ReturnType<typeof createHealthStyles>;
  readonly visible: boolean;
}) {
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.modalBackdrop}>
        <SafeAreaView edges={["top", "bottom"]} style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Pressable onPress={onClose}>
              <Text style={styles.modalClose}>Close</Text>
            </Pressable>
            <Text style={styles.modalEyebrow}>APPLE HEALTH</Text>
            <View style={styles.modalSpacer} />
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Choose what powers your performance view.
            </Text>
            <Text style={styles.modalBody}>
              Select only the categories you want Duna to read. Apple will show
              its official permission sheet next; Duna cannot see which read
              permissions you deny. Your choices can unlock a personal 0–10
              Readiness score, estimated sleep continuity, Duna Strain,
              match-pattern insights, and timestamp-aligned heart rate on Duna
              Vision.
            </Text>
            <View style={styles.categoryList}>
              {(Object.keys(healthCategoryDetails) as HealthCategory[]).map(
                (category) => {
                  const detail = healthCategoryDetails[category];
                  const selected = categories.includes(category);
                  return (
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      key={category}
                      onPress={() => onToggle(category)}
                      style={[
                        styles.categoryRow,
                        selected && styles.categorySelected,
                      ]}
                    >
                      <View
                        style={[
                          styles.categoryIcon,
                          selected && { backgroundColor: palette.aqua },
                        ]}
                      >
                        <Text
                          style={[
                            styles.categoryIconText,
                            selected && { color: palette.onAccent },
                          ]}
                        >
                          {detail.icon}
                        </Text>
                      </View>
                      <View style={styles.timelineCopy}>
                        <Text style={styles.timelineTitle}>{detail.label}</Text>
                        <Text style={styles.timelineMeta}>
                          {detail.description}
                        </Text>
                      </View>
                      <Text style={styles.checkText}>
                        {selected ? "✓" : "○"}
                      </Text>
                    </Pressable>
                  );
                },
              )}
            </View>
            <View style={styles.promiseCard}>
              <Text style={styles.promiseTitle}>Duna’s Health promise</Text>
              <Text style={styles.promiseBody}>
                No ads. No sale. No medical diagnosis. No Apple Health writes.
                Imported values are encrypted before database storage, and raw
                Health data is not sent to a generative-AI provider.
              </Text>
            </View>
            <Pressable
              disabled={busy || categories.length === 0}
              onPress={onConnect}
              style={[
                styles.primaryButton,
                (busy || categories.length === 0) && styles.disabled,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {busy ? "Connecting…" : "Continue to Apple permissions"}
              </Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function ShareModal({
  busy,
  candidates,
  categories,
  onClose,
  onSelectCandidate,
  onShare,
  onToggleCategory,
  onToggleScope,
  scopes,
  selectedCandidateId,
  styles,
  visible,
}: {
  readonly busy: boolean;
  readonly candidates: HealthDashboard["candidates"];
  readonly categories: readonly HealthCategory[];
  readonly onClose: () => void;
  readonly onSelectCandidate: (id: string) => void;
  readonly onShare: () => void;
  readonly onToggleCategory: (category: HealthCategory) => void;
  readonly onToggleScope: (scope: HealthSharingScope) => void;
  readonly palette: HealthPalette;
  readonly scopes: readonly HealthSharingScope[];
  readonly selectedCandidateId?: string;
  readonly styles: ReturnType<typeof createHealthStyles>;
  readonly visible: boolean;
}) {
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.modalBackdrop}>
        <SafeAreaView edges={["top", "bottom"]} style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Pressable onPress={onClose}>
              <Text style={styles.modalClose}>Close</Text>
            </Pressable>
            <Text style={styles.modalEyebrow}>DUNA SHARING</Text>
            <View style={styles.modalSpacer} />
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Share a precise view—not your whole profile.
            </Text>
            <Text style={styles.modalBody}>
              Every grant expires in 90 days. Current player, coach, and club
              relationships are rechecked on every view.
            </Text>
            <Text style={styles.formLabel}>1 · RECIPIENT</Text>
            {candidates.map((candidate) => (
              <Pressable
                key={candidate.id}
                onPress={() => onSelectCandidate(candidate.id)}
                style={[
                  styles.candidateRow,
                  selectedCandidateId === candidate.id &&
                    styles.categorySelected,
                ]}
              >
                <View style={styles.timelineCopy}>
                  <Text style={styles.timelineTitle}>{candidate.label}</Text>
                  <Text style={styles.timelineMeta}>{candidate.detail}</Text>
                </View>
                <Text style={styles.checkText}>
                  {selectedCandidateId === candidate.id ? "✓" : "○"}
                </Text>
              </Pressable>
            ))}
            <Text style={styles.formLabel}>2 · CATEGORIES</Text>
            <View style={styles.chipWrap}>
              {(Object.keys(healthCategoryDetails) as HealthCategory[]).map(
                (category) => (
                  <Pressable
                    key={category}
                    onPress={() => onToggleCategory(category)}
                    style={[
                      styles.choiceChip,
                      categories.includes(category) && styles.choiceChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.choiceChipText,
                        categories.includes(category) &&
                          styles.choiceChipTextActive,
                      ]}
                    >
                      {healthCategoryDetails[category].label}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>
            <Text style={styles.formLabel}>3 · ALLOWED VIEW</Text>
            <View style={styles.scopeList}>
              {(
                [
                  [
                    "summary",
                    "Summary",
                    "Readiness factors + headline values + match context",
                  ],
                  [
                    "timeline",
                    "Detailed timeline",
                    "Individual imported readings",
                  ],
                  [
                    "video-overlay",
                    "Heart rate on Duna Vision",
                    "Timestamp-aligned heart-rate points",
                  ],
                ] as const
              ).map(([scope, label, detail]) => {
                const disabled =
                  scope === "video-overlay" && !categories.includes("heart");
                return (
                  <Pressable
                    disabled={disabled}
                    key={scope}
                    onPress={() => onToggleScope(scope)}
                    style={[styles.scopeRow, disabled && styles.disabled]}
                  >
                    <View style={styles.timelineCopy}>
                      <Text style={styles.timelineTitle}>{label}</Text>
                      <Text style={styles.timelineMeta}>{detail}</Text>
                    </View>
                    <Text style={styles.checkText}>
                      {scopes.includes(scope) ? "✓" : "○"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.promiseCard}>
              <Text style={styles.promiseTitle}>Explicit consent</Text>
              <Text style={styles.promiseBody}>
                By tapping below, you direct Duna to display only the selected
                categories and uses to this recipient until the grant expires.
                Private check-in answers and notes are excluded. You can revoke
                access immediately here.
              </Text>
            </View>
            <Pressable
              disabled={
                busy ||
                !selectedCandidateId ||
                categories.length === 0 ||
                scopes.length === 0
              }
              onPress={onShare}
              style={[
                styles.primaryButton,
                (busy ||
                  !selectedCandidateId ||
                  categories.length === 0 ||
                  scopes.length === 0) &&
                  styles.disabled,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {busy ? "Saving…" : "Share for 90 days"}
              </Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const lightPalette = {
  canvas: "#F6F5F1",
  surface: "#FFFFFF",
  surfaceSoft: "#EDECE6",
  ink: "#1B1B19",
  muted: "#766F61",
  line: "#DEDBD3",
  aqua: "#3D6672",
  aquaSoft: "#DFE5E4",
  lime: "#6BAE78",
  coral: "#E8683A",
  amber: "#C9A96A",
  performance: "#141A1E",
  performanceText: "#EDF1F2",
  performanceMuted: "#A9B4B8",
  performanceAccent: "#D4B77C",
  onAccent: "#FFFFFF",
  overlay: "rgba(8,14,17,0.58)",
} as const;

const darkPalette: HealthPalette = {
  canvas: "#0D1114",
  surface: "#141A1E",
  surfaceSoft: "#1B2429",
  ink: "#EDF1F2",
  muted: "#A9B4B8",
  line: "#2A363B",
  aqua: "#B5CCD3",
  aquaSoft: "#22343B",
  lime: "#6BAE78",
  coral: "#F4794C",
  amber: "#D4B77C",
  performance: "#101A20",
  performanceText: "#EDF1F2",
  performanceMuted: "#A9B4B8",
  performanceAccent: "#D4B77C",
  onAccent: "#0D1114",
  overlay: "rgba(0,0,0,0.72)",
};

function createHealthStyles(colors: HealthPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.canvas },
    content: { paddingHorizontal: 18, paddingBottom: 132, gap: 14 },
    navRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingTop: 10,
      paddingBottom: 4,
    },
    backButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    backText: {
      color: colors.ink,
      fontSize: 34,
      lineHeight: 36,
      marginTop: -3,
    },
    navCopy: { flex: 1 },
    navTitle: {
      color: colors.ink,
      fontSize: 22,
      fontWeight: "800",
      letterSpacing: -0.5,
    },
    eyebrow: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1.3,
      marginBottom: 4,
    },
    statusDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.line,
    },
    statusDotActive: {
      backgroundColor: colors.lime,
      shadowColor: colors.lime,
      shadowOpacity: 0.8,
      shadowRadius: 8,
    },
    previewBanner: {
      backgroundColor: colors.aquaSoft,
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    previewText: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.1,
      textAlign: "center",
    },
    errorCard: {
      backgroundColor: `${colors.coral}14`,
      borderRadius: 16,
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderColor: `${colors.coral}35`,
    },
    errorCopy: { flex: 1 },
    errorTitle: {
      color: colors.ink,
      fontSize: 13,
      fontWeight: "800",
      marginBottom: 3,
    },
    error: {
      color: colors.coral,
      fontSize: 12,
      lineHeight: 18,
    },
    errorAction: {
      minHeight: 38,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: colors.coral,
      alignItems: "center",
      justifyContent: "center",
    },
    errorActionText: {
      color: colors.onAccent,
      fontSize: 11,
      fontWeight: "900",
    },
    notice: {
      color: colors.aqua,
      backgroundColor: colors.aquaSoft,
      borderRadius: 12,
      padding: 12,
      fontSize: 12,
      lineHeight: 18,
    },
    connectHero: {
      backgroundColor: colors.surface,
      borderRadius: 28,
      padding: 24,
      gap: 16,
      borderWidth: 1,
      borderColor: colors.line,
    },
    connectMark: { color: colors.coral, fontSize: 36 },
    heroTitle: {
      color: colors.ink,
      fontSize: 24,
      lineHeight: 28,
      fontWeight: "800",
      letterSpacing: -0.7,
    },
    heroBody: { color: colors.muted, fontSize: 13, lineHeight: 20 },
    benefitRow: { flexDirection: "row", gap: 8 },
    benefit: {
      flex: 1,
      borderTopWidth: 2,
      borderTopColor: colors.aqua,
      paddingTop: 9,
    },
    benefitNumber: { color: colors.aqua, fontSize: 10, fontWeight: "900" },
    benefitLabel: {
      color: colors.ink,
      fontSize: 11,
      fontWeight: "700",
      lineHeight: 15,
      marginTop: 4,
    },
    primaryButton: {
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: colors.aqua,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 18,
    },
    primaryButtonText: {
      color: colors.onAccent,
      fontSize: 14,
      fontWeight: "800",
    },
    finePrint: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 15,
      textAlign: "center",
    },
    importBackdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      alignItems: "center",
      justifyContent: "center",
      padding: 22,
    },
    importCard: {
      width: "100%",
      maxWidth: 420,
      borderRadius: 30,
      backgroundColor: colors.surface,
      paddingHorizontal: 24,
      paddingVertical: 28,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.line,
    },
    importMark: {
      width: 108,
      height: 108,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 22,
    },
    importOrbit: {
      position: "absolute",
      width: 106,
      height: 106,
      borderRadius: 53,
      borderWidth: 2,
      borderColor: colors.aquaSoft,
    },
    importOrbitDot: {
      position: "absolute",
      width: 13,
      height: 13,
      borderRadius: 7,
      backgroundColor: colors.lime,
      top: -7,
      left: 46,
      shadowColor: colors.lime,
      shadowOpacity: 0.8,
      shadowRadius: 8,
    },
    importHeart: {
      width: 70,
      height: 70,
      borderRadius: 24,
      backgroundColor: colors.aquaSoft,
      alignItems: "center",
      justifyContent: "center",
      transform: [{ rotate: "-8deg" }],
    },
    importHeartText: {
      color: colors.coral,
      fontSize: 34,
      transform: [{ rotate: "8deg" }],
    },
    importEyebrow: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.5,
      marginBottom: 8,
    },
    importTitle: {
      color: colors.ink,
      fontSize: 26,
      lineHeight: 31,
      fontWeight: "900",
      letterSpacing: -0.7,
      textAlign: "center",
    },
    importBody: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 20,
      textAlign: "center",
      marginTop: 10,
      maxWidth: 330,
    },
    importCount: {
      color: colors.ink,
      fontSize: 12,
      fontWeight: "800",
      marginTop: 22,
    },
    importMinimizeButton: {
      backgroundColor: colors.aquaSoft,
      borderColor: colors.aqua,
      borderRadius: 999,
      borderWidth: 1,
      marginTop: 13,
      paddingHorizontal: 18,
      paddingVertical: 10,
    },
    importMinimizeButtonText: {
      color: colors.aqua,
      fontSize: 11,
      fontWeight: "900",
    },
    importProgressTrack: {
      width: "100%",
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.surfaceSoft,
      overflow: "hidden",
      marginTop: 12,
    },
    importProgressFill: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.aqua,
    },
    importStages: {
      width: "100%",
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 14,
    },
    importStage: { flexDirection: "row", alignItems: "center", gap: 6 },
    importStageDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.line,
    },
    importStageText: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "800",
    },
    readinessHero: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: 30,
      borderWidth: 1,
      minHeight: 390,
      overflow: "hidden",
      padding: 24,
      position: "relative",
    },
    readinessGlowA: {
      backgroundColor: `${colors.aqua}52`,
      borderRadius: 140,
      height: 250,
      position: "absolute",
      right: -58,
      top: -28,
      transform: [{ rotate: "-18deg" }],
      width: 210,
    },
    readinessGlowB: {
      backgroundColor: `${colors.amber}52`,
      borderRadius: 105,
      bottom: 74,
      height: 150,
      position: "absolute",
      right: 54,
      transform: [{ rotate: "22deg" }],
      width: 175,
    },
    readinessEyebrow: {
      color: colors.ink,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.4,
    },
    readinessScoreRow: {
      alignItems: "flex-end",
      flexDirection: "row",
      marginTop: 42,
    },
    readinessNumber: {
      color: colors.ink,
      fontFamily: "Archivo-Hero",
      fontSize: 48,
      fontWeight: "800",
      letterSpacing: -6,
      lineHeight: 52,
    },
    readinessScale: {
      color: colors.muted,
      fontFamily: "Archivo-Chip",
      fontSize: 14,
      fontWeight: "700",
      marginBottom: 15,
      marginLeft: 10,
    },
    readinessStatusRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 7,
      marginTop: 4,
    },
    readinessStatusDot: {
      backgroundColor: colors.lime,
      borderRadius: 5,
      height: 9,
      width: 9,
    },
    readinessStatus: {
      color: colors.ink,
      fontSize: 12,
      fontWeight: "800",
      textTransform: "capitalize",
    },
    readinessSummary: {
      color: colors.ink,
      fontSize: 17,
      fontWeight: "700",
      lineHeight: 24,
      marginTop: 38,
      maxWidth: 315,
    },
    readinessMeta: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 15,
      marginTop: 13,
    },
    factorCard: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: 24,
      borderWidth: 1,
      padding: 18,
    },
    factorHeading: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
      marginBottom: 8,
    },
    confidencePill: {
      backgroundColor: colors.aquaSoft,
      borderRadius: 999,
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      overflow: "hidden",
      paddingHorizontal: 9,
      paddingVertical: 6,
    },
    factorRow: {
      borderTopColor: colors.line,
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingVertical: 13,
    },
    factorCopy: { flex: 1 },
    factorLabelRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    factorLabel: { color: colors.ink, fontSize: 13, fontWeight: "800" },
    factorValue: {
      color: colors.ink,
      fontFamily: "Archivo-Table",
      fontSize: 15,
      fontWeight: "900",
    },
    factorTrack: {
      backgroundColor: colors.surfaceSoft,
      borderRadius: 4,
      height: 6,
      marginTop: 8,
      overflow: "hidden",
    },
    factorFill: {
      backgroundColor: colors.aqua,
      borderRadius: 4,
      height: 6,
    },
    factorFillWatch: { backgroundColor: colors.coral },
    factorSummary: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 15,
      marginTop: 7,
    },
    checkInCard: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: 20,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      padding: 15,
    },
    checkInMark: {
      alignItems: "center",
      backgroundColor: colors.aquaSoft,
      borderRadius: 15,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    checkInMarkText: { color: colors.aqua, fontSize: 22, fontWeight: "900" },
    checkInCopy: { flex: 1, minWidth: 0 },
    checkInTitle: { color: colors.ink, fontSize: 14, fontWeight: "900" },
    checkInBody: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 15,
      marginTop: 4,
    },
    checkInArrow: { color: colors.ink, fontSize: 24, fontWeight: "500" },
    recommendationCard: {
      backgroundColor: colors.performance,
      borderRadius: 22,
      flexDirection: "row",
      gap: 13,
      padding: 18,
    },
    recommendationMark: { color: colors.performanceAccent, fontSize: 23 },
    recommendationEyebrow: {
      color: colors.performanceAccent,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.2,
      marginBottom: 5,
    },
    recommendationText: {
      color: colors.performanceText,
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 19,
    },
    trendCard: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: 22,
      borderWidth: 1,
      overflow: "hidden",
      padding: 17,
    },
    trendHeader: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
    },
    trendLabel: { color: colors.ink, fontSize: 16, fontWeight: "900" },
    trendDescription: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 13,
      marginTop: 4,
      maxWidth: 210,
    },
    trendLatest: { alignItems: "flex-end" },
    trendLatestValue: {
      color: colors.ink,
      fontFamily: "Archivo-Block",
      fontSize: 32,
      fontWeight: "800",
      letterSpacing: -1,
    },
    trendUnit: { color: colors.muted, fontSize: 10, fontWeight: "700" },
    trendEmpty: { color: colors.muted, fontSize: 11, marginVertical: 36 },
    trendSelected: {
      alignItems: "center",
      backgroundColor: colors.surfaceSoft,
      borderRadius: 13,
      flexDirection: "row",
      gap: 8,
      marginBottom: 10,
      paddingHorizontal: 11,
      paddingVertical: 9,
    },
    trendSelectedDate: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.7,
      textTransform: "uppercase",
    },
    trendSelectedValue: {
      color: colors.ink,
      flex: 1,
      fontSize: 10,
      fontWeight: "800",
    },
    trendSelectedClose: { color: colors.muted, fontSize: 16 },
    trendFooter: {
      alignItems: "center",
      borderTopColor: colors.line,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      justifyContent: "space-between",
      paddingTop: 10,
    },
    trendBandLabel: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1,
    },
    trendBandValue: {
      color: colors.ink,
      fontFamily: "Archivo-Chip",
      fontSize: 10,
      fontWeight: "800",
    },
    sleepCard: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: 24,
      borderWidth: 1,
      padding: 18,
    },
    sleepHeader: {
      alignItems: "flex-start",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    sleepTitle: { color: colors.ink, fontSize: 24, fontWeight: "800" },
    sleepBadge: {
      backgroundColor: colors.aquaSoft,
      borderRadius: 999,
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      overflow: "hidden",
      paddingHorizontal: 9,
      paddingVertical: 6,
      textTransform: "capitalize",
    },
    sleepStageTrack: {
      borderRadius: 7,
      flexDirection: "row",
      height: 14,
      marginTop: 22,
      overflow: "hidden",
    },
    sleepStageLegend: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 12,
    },
    sleepStageItem: {
      alignItems: "center",
      flexDirection: "row",
      gap: 4,
      width: "47%",
    },
    sleepStageDot: { borderRadius: 4, height: 7, width: 7 },
    sleepStageName: { color: colors.muted, flex: 1, fontSize: 10 },
    sleepStageValue: { color: colors.ink, fontSize: 10, fontWeight: "800" },
    sleepStats: {
      borderBottomColor: colors.line,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 17,
      paddingVertical: 14,
    },
    sleepStatValue: { color: colors.ink, fontSize: 17, fontWeight: "900" },
    sleepStatLabel: { color: colors.muted, fontSize: 10, marginTop: 2 },
    sleepSummary: {
      color: colors.ink,
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 19,
      marginTop: 14,
    },
    sleepEstimate: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 14,
      marginTop: 7,
    },
    strainCard: {
      backgroundColor: "#111A1A",
      borderRadius: 24,
      padding: 19,
    },
    strainTop: {
      alignItems: "center",
      flexDirection: "row",
      gap: 18,
      justifyContent: "space-between",
    },
    strainScoreRow: { alignItems: "flex-end", flexDirection: "row" },
    strainNumber: {
      color: "#F8F6EF",
      fontSize: 50,
      fontWeight: "300",
      letterSpacing: -3,
    },
    strainScale: { color: "#A8B4B1", fontSize: 10, marginBottom: 9 },
    strainArc: {
      backgroundColor: "#263433",
      borderRadius: 5,
      height: 10,
      overflow: "hidden",
      width: 125,
    },
    strainArcFill: {
      backgroundColor: "#BEEB71",
      borderRadius: 5,
      height: 10,
    },
    strainSummary: {
      color: "#DCE3DF",
      fontSize: 12,
      lineHeight: 18,
      marginTop: 10,
    },
    strainCompare: {
      alignItems: "center",
      borderTopColor: "#2C3C3A",
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      justifyContent: "space-around",
      marginTop: 15,
      paddingTop: 14,
    },
    strainCompareValue: { color: "#F8F6EF", fontSize: 17, fontWeight: "900" },
    strainCompareLabel: { color: "#97A6A2", fontSize: 10, marginTop: 2 },
    strainVersus: { color: "#657572", fontSize: 10, fontWeight: "900" },
    researchCard: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: 20,
      borderWidth: 1,
      padding: 17,
    },
    researchTitle: { color: colors.ink, fontSize: 19, fontWeight: "900" },
    researchBody: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 17,
      marginBottom: 8,
      marginTop: 6,
    },
    researchRow: {
      alignItems: "center",
      borderTopColor: colors.line,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: 10,
      paddingVertical: 12,
    },
    researchCitationTitle: {
      color: colors.ink,
      fontSize: 11,
      fontWeight: "800",
      lineHeight: 15,
    },
    checkInSheet: {
      backgroundColor: colors.canvas,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      maxHeight: "94%",
      overflow: "hidden",
    },
    checkInContent: { gap: 15, padding: 22, paddingBottom: 44 },
    checkInQuestion: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: 17,
      borderWidth: 1,
      padding: 14,
    },
    checkInQuestionLabel: {
      color: colors.ink,
      fontSize: 13,
      fontWeight: "900",
      marginBottom: 11,
    },
    ratingRow: { flexDirection: "row", gap: 7 },
    ratingButton: {
      alignItems: "center",
      backgroundColor: colors.surfaceSoft,
      borderRadius: 12,
      flex: 1,
      height: 42,
      justifyContent: "center",
    },
    ratingButtonActive: { backgroundColor: colors.aqua },
    ratingText: { color: colors.ink, fontSize: 13, fontWeight: "800" },
    ratingTextActive: { color: colors.onAccent },
    ratingEnds: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 6,
    },
    ratingEnd: { color: colors.muted, fontSize: 10 },
    effortRow: { flexDirection: "row", gap: 7 },
    effortButton: {
      alignItems: "center",
      backgroundColor: colors.surfaceSoft,
      borderRadius: 11,
      flex: 1,
      paddingVertical: 10,
    },
    effortButtonActive: { backgroundColor: colors.aquaSoft },
    effortText: { color: colors.ink, fontSize: 10, fontWeight: "800" },
    durationRow: { flexDirection: "row", gap: 7, marginTop: 9 },
    durationButton: {
      alignItems: "center",
      borderColor: colors.line,
      borderRadius: 999,
      borderWidth: 1,
      flex: 1,
      paddingVertical: 8,
    },
    durationButtonActive: { borderColor: colors.aqua },
    durationText: { color: colors.muted, fontSize: 10, fontWeight: "800" },
    checkInNote: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: 16,
      borderWidth: 1,
      color: colors.ink,
      fontSize: 12,
      minHeight: 82,
      padding: 14,
      textAlignVertical: "top",
    },
    recoveryCard: {
      backgroundColor: colors.surface,
      borderRadius: 26,
      padding: 20,
      flexDirection: "row",
      alignItems: "center",
      gap: 18,
      borderWidth: 1,
      borderColor: colors.line,
    },
    recoveryScore: {
      width: 112,
      height: 112,
      borderRadius: 56,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 10,
      borderColor: colors.aquaSoft,
      position: "relative",
    },
    scoreArc: {
      position: "absolute",
      width: 112,
      height: 112,
      borderRadius: 56,
      borderWidth: 10,
      borderColor: colors.aqua,
      borderLeftColor: "transparent",
      transform: [{ rotate: "25deg" }],
    },
    scoreNumber: {
      color: colors.ink,
      fontSize: 36,
      fontWeight: "900",
      letterSpacing: -2,
    },
    scoreLabel: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1,
    },
    recoveryCopy: { flex: 1 },
    historySyncCard: {
      alignItems: "flex-start",
      backgroundColor: colors.aquaSoft,
      borderColor: colors.aqua,
      borderRadius: 20,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      padding: 15,
    },
    historySyncCardComplete: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
    },
    historySyncIcon: {
      alignItems: "center",
      backgroundColor: colors.aqua,
      borderRadius: 14,
      height: 42,
      justifyContent: "center",
      width: 42,
    },
    historySyncIconComplete: { backgroundColor: colors.lime },
    historySyncIconText: {
      color: colors.onAccent,
      fontSize: 19,
      fontWeight: "900",
    },
    historySyncCopy: { flex: 1, minWidth: 0 },
    historySyncEyebrow: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.75,
    },
    historySyncTitle: {
      color: colors.ink,
      fontSize: 16,
      fontWeight: "900",
      letterSpacing: -0.35,
      marginTop: 4,
    },
    historySyncBody: {
      color: colors.muted,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 5,
    },
    historySyncSourceNote: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 14,
      marginTop: 7,
    },
    historySyncAction: {
      borderColor: colors.aqua,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    historySyncActionText: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
    },
    statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    statCard: {
      width: "48.7%",
      minHeight: 114,
      backgroundColor: colors.surface,
      borderRadius: 19,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.line,
    },
    statLabel: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1.1,
    },
    statValue: {
      color: colors.ink,
      fontSize: 32,
      fontWeight: "900",
      letterSpacing: -1,
      marginTop: 10,
    },
    statUnit: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "800",
      marginTop: 2,
    },
    emptyHealthCard: {
      backgroundColor: colors.aquaSoft,
      borderRadius: 20,
      padding: 16,
      flexDirection: "row",
      gap: 13,
      borderWidth: 1,
      borderColor: `${colors.aqua}35`,
    },
    emptyHealthMark: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    emptyHealthMarkText: {
      color: colors.aqua,
      fontSize: 22,
      fontWeight: "900",
    },
    emptyHealthCopy: { flex: 1 },
    emptyHealthTitle: {
      color: colors.ink,
      fontSize: 14,
      fontWeight: "900",
    },
    emptyHealthBody: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 5,
    },
    emptyHealthActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
      marginTop: 12,
    },
    emptyHealthButton: {
      backgroundColor: colors.aqua,
      borderRadius: 11,
      paddingVertical: 8,
      paddingHorizontal: 11,
    },
    emptyHealthButtonText: {
      color: colors.onAccent,
      fontSize: 10,
      fontWeight: "900",
    },
    sectionHeader: {
      marginTop: 8,
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: 12,
    },
    sectionTitle: {
      color: colors.ink,
      fontSize: 22,
      fontWeight: "800",
      letterSpacing: -0.5,
    },
    secondaryButton: {
      backgroundColor: colors.aquaSoft,
      paddingVertical: 9,
      paddingHorizontal: 13,
      borderRadius: 12,
    },
    secondaryButtonText: {
      color: colors.aqua,
      fontSize: 11,
      fontWeight: "800",
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      paddingHorizontal: 15,
      borderWidth: 1,
      borderColor: colors.line,
    },
    dayRow: {
      minHeight: 62,
      flexDirection: "row",
      alignItems: "center",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line,
    },
    dayDate: { color: colors.ink, fontSize: 12, fontWeight: "800", width: 72 },
    dayMetric: { flex: 1, alignItems: "flex-end" },
    dayValue: { color: colors.ink, fontSize: 15, fontWeight: "800" },
    dayLabel: { color: colors.muted, fontSize: 10, marginTop: 2 },
    horizontalBleed: { marginHorizontal: -18, paddingLeft: 18 },
    matchRow: { flexDirection: "row", gap: 10, paddingRight: 36 },
    matchCard: {
      width: 245,
      backgroundColor: colors.surface,
      borderRadius: 21,
      padding: 17,
      borderWidth: 1,
      borderColor: colors.line,
    },
    matchTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    matchDate: { color: colors.muted, fontSize: 10, fontWeight: "700" },
    result: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    win: { color: colors.aqua },
    loss: { color: colors.coral },
    matchTitle: {
      color: colors.ink,
      fontSize: 16,
      lineHeight: 21,
      fontWeight: "800",
      marginVertical: 12,
    },
    matchSignals: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    matchSignal: {
      color: colors.muted,
      backgroundColor: colors.surfaceSoft,
      borderRadius: 9,
      paddingVertical: 5,
      paddingHorizontal: 7,
      fontSize: 10,
      fontWeight: "700",
    },
    insightCard: {
      backgroundColor: colors.aquaSoft,
      borderRadius: 20,
      padding: 17,
      flexDirection: "row",
      gap: 13,
    },
    insightMark: { color: colors.aqua, fontSize: 24 },
    insightCopy: { flex: 1 },
    insightTitle: {
      color: colors.ink,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: "700",
    },
    timelineRow: {
      minHeight: 66,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
    },
    timelineIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      backgroundColor: colors.aquaSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    timelineIconText: { color: colors.aqua, fontSize: 16, fontWeight: "800" },
    timelineCopy: { flex: 1, minWidth: 0 },
    timelineTitle: { color: colors.ink, fontSize: 12, fontWeight: "800" },
    timelineMeta: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 14,
      marginTop: 3,
    },
    timelineValue: { color: colors.ink, fontSize: 13, fontWeight: "800" },
    privacyCard: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.line,
    },
    lockRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      paddingBottom: 14,
    },
    lockIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.aquaSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    lockText: { color: colors.aqua, fontSize: 18, fontWeight: "900" },
    grantRow: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
      paddingTop: 13,
      marginTop: 2,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    revokeText: { color: colors.coral, fontSize: 11, fontWeight: "800" },
    systemNote: {
      borderRadius: 20,
      backgroundColor: colors.surfaceSoft,
      padding: 18,
      gap: 9,
    },
    systemNoteTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
    systemNoteBody: { color: colors.muted, fontSize: 11, lineHeight: 17 },
    linkText: {
      color: colors.aqua,
      fontSize: 11,
      fontWeight: "800",
      marginTop: 4,
    },
    deleteText: {
      color: colors.coral,
      fontSize: 11,
      fontWeight: "800",
      marginTop: 10,
    },
    disclaimer: {
      color: colors.muted,
      fontSize: 10,
      lineHeight: 15,
      textAlign: "center",
      paddingHorizontal: 20,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: "flex-end",
    },
    modalSheet: {
      backgroundColor: colors.canvas,
      height: "94%",
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      overflow: "hidden",
    },
    modalHeader: {
      height: 55,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 18,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line,
    },
    modalClose: { color: colors.aqua, fontSize: 12, fontWeight: "800" },
    modalEyebrow: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.3,
    },
    modalSpacer: { width: 35 },
    modalContent: { padding: 22, paddingBottom: 44, gap: 16 },
    modalTitle: {
      color: colors.ink,
      fontSize: 28,
      lineHeight: 32,
      fontWeight: "900",
      letterSpacing: -1,
    },
    modalBody: { color: colors.muted, fontSize: 13, lineHeight: 20 },
    categoryList: { gap: 8 },
    categoryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      borderRadius: 17,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 13,
    },
    categorySelected: {
      borderColor: colors.aqua,
      backgroundColor: colors.aquaSoft,
    },
    categoryIcon: {
      width: 42,
      height: 42,
      borderRadius: 13,
      backgroundColor: colors.surfaceSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    categoryIconText: { color: colors.ink, fontSize: 18, fontWeight: "800" },
    checkText: { color: colors.aqua, fontSize: 19, fontWeight: "900" },
    promiseCard: {
      backgroundColor: colors.surfaceSoft,
      borderRadius: 17,
      padding: 16,
    },
    promiseTitle: {
      color: colors.ink,
      fontSize: 12,
      fontWeight: "800",
      marginBottom: 5,
    },
    promiseBody: { color: colors.muted, fontSize: 10, lineHeight: 16 },
    disabled: { opacity: 0.42 },
    formLabel: {
      color: colors.aqua,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.2,
      marginTop: 8,
    },
    candidateRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderRadius: 15,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 14,
    },
    chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    choiceChip: {
      borderRadius: 20,
      paddingHorizontal: 13,
      paddingVertical: 9,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    choiceChipActive: {
      backgroundColor: colors.aqua,
      borderColor: colors.aqua,
    },
    choiceChipText: { color: colors.ink, fontSize: 11, fontWeight: "800" },
    choiceChipTextActive: { color: colors.onAccent },
    scopeList: { gap: 8 },
    scopeRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 15,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.line,
    },
  });
}
