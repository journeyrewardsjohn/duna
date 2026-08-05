import type {
  HealthCategory,
  HealthDashboard,
  HealthSharingScope,
  HealthTimelineEntry,
} from "@duna/api";
import * as Crypto from "expo-crypto";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  clearAppleHealthCursor,
  healthCategoryDetails,
  requestAppleHealthAccess,
  startAppleHealthMonitoring,
  syncAppleHealth,
} from "./health-kit";
import { usePlayerRuntime } from "./runtime";

type HealthTheme = "light" | "dark";

const demoPersonId = "41a181e8-8103-49f4-bdeb-a71e693295f2";
const demoCoachId = "41a181e8-8103-49f4-bdeb-a71e693295f3";
const demoGrantId = "41a181e8-8103-49f4-bdeb-a71e693295f4";

function daysAgo(days: number, hour = 8): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

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
  const [connectOpen, setConnectOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
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
        return;
      }
      setBusy(true);
      setError(undefined);
      try {
        const result = await syncAppleHealth({ client, categories });
        if (announce) {
          setNotice(
            result.imported > 0 || result.deleted > 0
              ? `Apple Health synced · ${result.imported} records updated`
              : "Apple Health is up to date.",
          );
        }
        await reload();
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Apple Health could not sync.",
        );
      } finally {
        setBusy(false);
      }
    },
    [client, mode, reload],
  );

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
    try {
      await requestAppleHealthAccess(selectedCategories);
      await performSync(selectedCategories);
      setConnectOpen(false);
    } catch (reason) {
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
  const recovery = summary?.recoveryContext;
  const connected = dashboard?.connection?.status === "active";

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
        {error && <Text style={styles.error}>{error}</Text>}
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
            <View style={styles.recoveryCard}>
              <View style={styles.recoveryScore}>
                <View style={styles.scoreArc} />
                <Text style={styles.scoreNumber}>{recovery?.score ?? "—"}</Text>
                <Text style={styles.scoreLabel}>CONTEXT</Text>
              </View>
              <View style={styles.recoveryCopy}>
                <Text style={styles.eyebrow}>TODAY</Text>
                <Text style={styles.heroTitle}>
                  {recovery?.label === "above-baseline"
                    ? "You’re trending above baseline."
                    : recovery?.label === "below-baseline"
                      ? "Your signals are below baseline."
                      : "Your recovery signals are taking shape."}
                </Text>
                <Text style={styles.heroBody}>
                  Built from {recovery?.inputs.length ?? 0} available
                  signals—not a diagnosis or readiness order.
                </Text>
              </View>
            </View>

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
            <Text style={styles.disclaimer}>{dashboard?.disclaimer}</Text>
          </>
        )}
      </ScrollView>

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
    </View>
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
              permissions you deny.
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
                Imported values are encrypted before database storage.
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
                    "Current headline values + match context",
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
                You can revoke it immediately here.
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
  canvas: "#F7F5EF",
  surface: "#FFFFFF",
  surfaceSoft: "#ECEBE4",
  ink: "#121A20",
  muted: "#67737B",
  line: "#D9DDD8",
  aqua: "#157F78",
  aquaSoft: "#DDF1ED",
  lime: "#BDEB72",
  coral: "#D55E42",
  amber: "#D99A27",
  onAccent: "#FFFFFF",
  overlay: "rgba(8,14,17,0.58)",
} as const;

const darkPalette: HealthPalette = {
  canvas: "#070B0D",
  surface: "#0E171B",
  surfaceSoft: "#142329",
  ink: "#F2F4EE",
  muted: "#9CA9A8",
  line: "#23353A",
  aqua: "#63E3DB",
  aquaSoft: "#153B3B",
  lime: "#BDEB72",
  coral: "#FF7B5B",
  amber: "#F2B84B",
  onAccent: "#071012",
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
    error: {
      color: colors.coral,
      backgroundColor: `${colors.coral}14`,
      borderRadius: 12,
      padding: 12,
      fontSize: 12,
      lineHeight: 18,
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
