import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Line, Rect } from "react-native-svg";
import { SatoshiText as Text } from "./satoshi-text";
import { usePlayerRuntime, type PlayerTrainingWorkspace } from "./runtime";

type TrainingEvent = PlayerTrainingWorkspace["upcomingEvents"][number];
type AthletePracticeBlock = NonNullable<
  TrainingEvent["practice"]
>["blocks"][number];

const DAY = 86_400_000;

function isoAt(offset: number, hour: number, minutes = 0): string {
  const date = new Date(Date.now() + offset * DAY);
  date.setHours(hour, minutes, 0, 0);
  return date.toISOString();
}

function previewTraining(): PlayerTrainingWorkspace {
  const programId = "33000000-0000-4000-8000-000000000401";
  const practiceId = "33000000-0000-4000-8000-000000000600";
  const nextPractice: TrainingEvent = {
    id: practiceId,
    programId,
    programTitle: "Fall Competition Build",
    kind: "practice",
    title: "Sideout Under Pressure",
    startsAt: isoAt(0, 17),
    endsAt: isoAt(0, 18, 30),
    timezone: "America/New_York",
    status: "ready",
    focusArea: "Ball Control",
    plannedLoad: 68,
    plannedIntensity: 7,
    practice: {
      title: "Sideout Under Pressure",
      purpose:
        "Carry first-contact quality through attack choice, transition, and late-practice serving pressure.",
      durationMinutes: 90,
      focusArea: "Ball Control",
      totalTouchesTypical: 118,
      totalJumpsTypical: 22,
      blocks: [
        {
          id: "33000000-0000-4000-8000-000000000701",
          sequence: 1,
          lane: "Together",
          title: "Move, see, connect",
          kind: "warmup",
          startsAtMinute: 0,
          durationMinutes: 10,
          intensity: 3,
          focusArea: "Footwork",
          touchesTypical: 24,
          jumpsTypical: 4,
        },
        {
          id: "33000000-0000-4000-8000-000000000702",
          sequence: 2,
          lane: "Court 1",
          title: "First-Ball Sideout Lab",
          kind: "drill",
          startsAtMinute: 10,
          durationMinutes: 16,
          intensity: 7,
          focusArea: "Ball Control",
          touchesTypical: 21,
          jumpsTypical: 5,
        },
        {
          id: "33000000-0000-4000-8000-000000000703",
          sequence: 3,
          lane: "Court 2",
          title: "High Hands, Deep Corners",
          kind: "drill",
          startsAtMinute: 10,
          durationMinutes: 16,
          intensity: 8,
          focusArea: "Attack Location",
          touchesTypical: 14,
          jumpsTypical: 3,
        },
        {
          id: "33000000-0000-4000-8000-000000000704",
          sequence: 4,
          lane: "Together",
          title: "Five-Point Wash",
          kind: "drill",
          startsAtMinute: 30,
          durationMinutes: 22,
          intensity: 9,
          focusArea: "Offensive Systems",
          touchesTypical: 36,
          jumpsTypical: 8,
        },
        {
          id: "33000000-0000-4000-8000-000000000705",
          sequence: 5,
          lane: "Together",
          title: "Serve under consequence",
          kind: "drill",
          startsAtMinute: 56,
          durationMinutes: 12,
          intensity: 6,
          focusArea: "Serving",
          touchesTypical: 14,
          jumpsTypical: 2,
        },
        {
          id: "33000000-0000-4000-8000-000000000706",
          sequence: 6,
          lane: "Together",
          title: "Downshift + reflect",
          kind: "cool-down",
          startsAtMinute: 72,
          durationMinutes: 8,
          intensity: 1,
          focusArea: "Footwork",
          touchesTypical: 0,
          jumpsTypical: 0,
        },
      ],
    },
  };
  return {
    generatedAt: new Date().toISOString(),
    programs: [
      {
        id: programId,
        title: "Fall Competition Build",
        purpose:
          "Build a reliable sideout identity while arriving fresh for the Atlantic Coast Open.",
        startDate: new Date(Date.now() - 21 * DAY).toISOString().slice(0, 10),
        endDate: new Date(Date.now() + 35 * DAY).toISOString().slice(0, 10),
        currentPhase: "Pressure + transfer",
        completedSessionCount: 7,
        scheduledSessionCount: 16,
        nextMilestone: {
          title: "Atlantic Coast Open",
          startsOn: new Date(Date.now() + 17 * DAY).toISOString().slice(0, 10),
          kind: "tournament",
        },
      },
    ],
    nextPractice,
    upcomingEvents: [
      nextPractice,
      {
        id: "33000000-0000-4000-8000-000000000601",
        programId,
        programTitle: "Fall Competition Build",
        kind: "recovery",
        title: "Mobility + video reset",
        startsAt: isoAt(2, 17),
        endsAt: isoAt(2, 17, 45),
        timezone: "America/New_York",
        status: "planned",
        focusArea: "Footwork",
        plannedLoad: 28,
        plannedIntensity: 3,
      },
      {
        id: "33000000-0000-4000-8000-000000000602",
        programId,
        programTitle: "Fall Competition Build",
        kind: "practice",
        title: "Block-Defense Connection",
        startsAt: isoAt(5, 17),
        endsAt: isoAt(5, 18, 30),
        timezone: "America/New_York",
        status: "planned",
        focusArea: "Team Defense",
        plannedLoad: 74,
        plannedIntensity: 8,
      },
      {
        id: "33000000-0000-4000-8000-000000000604",
        programId,
        programTitle: "Fall Competition Build",
        kind: "tournament",
        title: "Atlantic Coast Open",
        startsAt: isoAt(17, 8),
        endsAt: isoAt(18, 17),
        timezone: "America/New_York",
        status: "planned",
        plannedLoad: 90,
        plannedIntensity: 9,
      },
    ],
    recentSessions: [
      {
        id: "33000000-0000-4000-8000-000000000690",
        programId,
        programTitle: "Fall Competition Build",
        kind: "practice",
        title: "Defend, Convert, Repeat",
        startsAt: isoAt(-2, 17),
        endsAt: isoAt(-2, 18, 28),
        timezone: "America/New_York",
        status: "completed",
        focusArea: "Team Defense",
        plannedLoad: 72,
        plannedIntensity: 8,
      },
    ],
    weeklyLoad: [
      { week: "Aug 10", planned: 63, tournament: false },
      { week: "Aug 17", planned: 72, tournament: false },
      { week: "Aug 24", planned: 68, tournament: false },
      { week: "Aug 31", planned: 42, tournament: true },
      { week: "Sep 7", planned: 58, tournament: false },
      { week: "Sep 14", planned: 64, tournament: false },
    ],
  };
}

function formatDate(value: string, timezone: string, includeTime = false) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone: timezone,
  }).format(new Date(value));
}

function eventGlyph(kind: TrainingEvent["kind"]): string {
  if (kind === "tournament") return "◇";
  if (kind === "travel") return "↗";
  if (kind === "recovery" || kind === "rest") return "○";
  return "●";
}

function TrainingCourt({ dark }: { readonly dark: boolean }) {
  const ink = dark ? "#E8F0F0" : "#122D3A";
  return (
    <Svg height={146} viewBox="0 0 240 146" width="100%">
      <Rect
        fill={dark ? "#183B47" : "#E7F4F1"}
        height="132"
        rx="12"
        stroke={ink}
        strokeWidth="2"
        width="226"
        x="7"
        y="7"
      />
      <Line stroke="#19B69D" strokeWidth="4" x1="7" x2="233" y1="73" y2="73" />
      {[
        [67, 105, "#19B69D"],
        [170, 92, "#19B69D"],
        [73, 43, "#7A6BE8"],
        [169, 29, "#7A6BE8"],
      ].map(([x, y, color], index) => (
        <Circle
          cx={Number(x)}
          cy={Number(y)}
          fill={dark ? "#102B35" : "#FFFFFF"}
          key={index}
          r="10"
          stroke={String(color)}
          strokeWidth="3"
        />
      ))}
      <Circle cx="121" cy="60" fill="#F1B44C" r="5" />
      <Line
        stroke="#F1B44C"
        strokeDasharray="6 6"
        strokeWidth="2"
        x1="120"
        x2="166"
        y1="60"
        y2="35"
      />
    </Svg>
  );
}

export function PlayerTrainingScreen({
  onBack,
}: {
  readonly onBack: () => void;
}) {
  const runtime = usePlayerRuntime();
  const dark = useColorScheme() === "dark";
  const palette = dark ? darkPalette : lightPalette;
  const workspace = runtime.training ?? previewTraining();
  const program = workspace.programs[0];
  const practice = workspace.nextPractice;
  const responseSession = workspace.recentSessions.find(
    (session) => !session.response?.submittedAt,
  );
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [sessionRpe, setSessionRpe] = useState<number>();
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string>();
  const progress = program?.scheduledSessionCount
    ? program.completedSessionCount / program.scheduledSessionCount
    : 0;
  const groups = useMemo(() => {
    const result = new Map<number, AthletePracticeBlock[]>();
    for (const block of practice?.practice?.blocks ?? []) {
      const current = result.get(block.startsAtMinute) ?? [];
      result.set(block.startsAtMinute, [...current, block]);
    }
    return [...result.entries()].sort(([first], [second]) => first - second);
  }, [practice]);

  const submitResponse = async () => {
    if (!responseSession || !sessionRpe) return;
    setSaving(true);
    setNotice(undefined);
    try {
      if (runtime.mode === "live" && runtime.client) {
        await runtime.client.player.submitTrainingResponse.mutate({
          trainingEventId: responseSession.id,
          attendanceStatus: "attended",
          sessionRpe,
          ...(feedback.trim() ? { feedback: feedback.trim() } : {}),
          idempotencyKey: Crypto.randomUUID(),
        });
        await runtime.refresh();
      }
      if (Platform.OS !== "web") {
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => undefined);
      }
      setCheckInOpen(false);
      setNotice(
        "Your response is in. Your coach sees the session signal, not a public score.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Duna could not save your response.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (!program || !practice) {
    return (
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { backgroundColor: palette.canvas },
        ]}
      >
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={{ color: palette.text }}>‹ Plans</Text>
        </Pressable>
        <Text style={[styles.eyebrow, { color: palette.accent }]}>
          DUNA TRAINING
        </Text>
        <Text style={[styles.emptyTitle, { color: palette.text }]}>
          Your next chapter will appear here.
        </Text>
        <Text style={[styles.body, { color: palette.muted }]}>
          Once a coach assigns you to a Program, you’ll see the practice intent,
          schedule, load path, and private check-ins in one place.
        </Text>
      </ScrollView>
    );
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { backgroundColor: palette.canvas },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topline}>
          <Pressable
            accessibilityRole="button"
            onPress={onBack}
            style={styles.backButton}
          >
            <Text style={{ color: palette.text }}>‹ Plans</Text>
          </Pressable>
          <Text style={[styles.eyebrow, { color: palette.accent }]}>
            DUNA TRAINING
          </Text>
          <Text style={[styles.phase, { color: palette.muted }]}>
            {program.currentPhase}
          </Text>
        </View>

        <View style={[styles.programCard, { backgroundColor: palette.deep }]}>
          <Text style={styles.programKicker}>
            YOUR PROGRAM · {program.completedSessionCount + 1} OF{" "}
            {program.scheduledSessionCount}
          </Text>
          <Text style={styles.programTitle}>{program.title}</Text>
          <Text style={styles.programPurpose}>{program.purpose}</Text>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.max(4, progress * 100)}%` },
              ]}
            />
          </View>
          <View style={styles.programFooter}>
            <Text style={styles.programMeta}>
              {Math.round(progress * 100)}% complete
            </Text>
            {program.nextMilestone && (
              <Text style={styles.programMeta}>
                ◇ {program.nextMilestone.title} ·{" "}
                {program.nextMilestone.startsOn.slice(5).replace("-", "/")}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={[styles.eyebrow, { color: palette.accent }]}>
              NEXT PRACTICE
            </Text>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>
              {practice.title}
            </Text>
          </View>
          <View style={[styles.dateBadge, { borderColor: palette.line }]}>
            <Text style={[styles.dateBadgeDay, { color: palette.text }]}>
              {formatDate(practice.startsAt, practice.timezone).split(",")[0]}
            </Text>
            <Text style={[styles.dateBadgeTime, { color: palette.muted }]}>
              {formatDate(practice.startsAt, practice.timezone, true)
                .split(", ")
                .at(-1)}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.practiceCard,
            { backgroundColor: palette.surface, borderColor: palette.line },
          ]}
        >
          <TrainingCourt dark={dark} />
          <Text style={[styles.practicePurpose, { color: palette.text }]}>
            {practice.practice?.purpose}
          </Text>
          <View style={styles.signalRow}>
            <View>
              <Text style={[styles.signalLabel, { color: palette.muted }]}>
                FOCUS
              </Text>
              <Text style={[styles.signalValue, { color: palette.text }]}>
                {practice.focusArea ?? practice.practice?.focusArea}
              </Text>
            </View>
            <View>
              <Text style={[styles.signalLabel, { color: palette.muted }]}>
                LOAD
              </Text>
              <Text style={[styles.signalValue, { color: palette.text }]}>
                {practice.plannedLoad}/100
              </Text>
            </View>
            <View>
              <Text style={[styles.signalLabel, { color: palette.muted }]}>
                TIME
              </Text>
              <Text style={[styles.signalValue, { color: palette.text }]}>
                {practice.practice?.durationMinutes ?? 0}m
              </Text>
            </View>
          </View>
          <View style={[styles.opportunity, { backgroundColor: palette.soft }]}>
            <Text style={[styles.opportunityValue, { color: palette.text }]}>
              ~{practice.practice?.totalTouchesTypical ?? 0}
            </Text>
            <Text style={[styles.opportunityLabel, { color: palette.muted }]}>
              typical touch opportunities · estimate, not a promise
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={[styles.eyebrow, { color: palette.accent }]}>
              THE WORK
            </Text>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>
              Know the shape. Stay present.
            </Text>
          </View>
        </View>
        <View style={[styles.timeline, { borderColor: palette.line }]}>
          {groups.map(([minute, blocks], groupIndex) => (
            <View key={minute} style={styles.timelineRow}>
              <View style={styles.timelineRail}>
                <View
                  style={[
                    styles.timelineDot,
                    {
                      backgroundColor:
                        groupIndex === 0 ? palette.accent : palette.deep,
                    },
                  ]}
                />
                {groupIndex < groups.length - 1 && (
                  <View
                    style={[
                      styles.timelineLine,
                      { backgroundColor: palette.line },
                    ]}
                  />
                )}
              </View>
              <View style={styles.timelineCopy}>
                <Text style={[styles.timelineTime, { color: palette.muted }]}>
                  +{minute} MIN
                </Text>
                {blocks.map((block) => (
                  <View
                    key={block.id}
                    style={[
                      styles.blockRow,
                      {
                        backgroundColor: palette.surface,
                        borderColor: palette.line,
                      },
                    ]}
                  >
                    <View style={styles.flex}>
                      <Text
                        style={[styles.blockTitle, { color: palette.text }]}
                      >
                        {block.title}
                      </Text>
                      <Text
                        style={[styles.blockMeta, { color: palette.muted }]}
                      >
                        {block.lane} ·{" "}
                        {block.focusArea ?? block.kind.replace("-", " ")}
                      </Text>
                    </View>
                    <Text
                      style={[styles.blockMinutes, { color: palette.text }]}
                    >
                      {block.durationMinutes}m
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>

        {responseSession && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setCheckInOpen(true)}
            style={[styles.checkInCard, { backgroundColor: palette.accent }]}
          >
            <View style={styles.flex}>
              <Text style={styles.checkInKicker}>
                PRIVATE POST-PRACTICE CHECK-IN
              </Text>
              <Text style={styles.checkInTitle}>
                How did {responseSession.title} feel?
              </Text>
              <Text style={styles.checkInBody}>
                About 20 seconds. Your answer helps the next practice fit the
                group.
              </Text>
            </View>
            <Text style={styles.checkInArrow}>→</Text>
          </Pressable>
        )}
        {notice && (
          <Text
            style={[
              styles.notice,
              { color: palette.text, backgroundColor: palette.soft },
            ]}
          >
            {notice}
          </Text>
        )}

        <View style={styles.sectionHeading}>
          <View>
            <Text style={[styles.eyebrow, { color: palette.accent }]}>
              LOAD PATH
            </Text>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>
              Build. Absorb. Arrive ready.
            </Text>
          </View>
        </View>
        <View
          style={[
            styles.loadCard,
            { backgroundColor: palette.surface, borderColor: palette.line },
          ]}
        >
          {workspace.weeklyLoad.map((week) => (
            <View key={week.week} style={styles.loadColumn}>
              <View style={styles.loadBarArea}>
                {week.tournament && (
                  <View
                    style={[
                      styles.tournamentMarker,
                      { borderColor: palette.flare },
                    ]}
                  />
                )}
                <View
                  style={[
                    styles.loadBar,
                    {
                      backgroundColor: week.tournament
                        ? palette.flare
                        : palette.accent,
                      height: Math.max(8, week.planned * 0.9),
                    },
                  ]}
                />
              </View>
              <Text style={[styles.loadValue, { color: palette.text }]}>
                {week.planned}
              </Text>
              <Text style={[styles.loadWeek, { color: palette.muted }]}>
                {week.week}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={[styles.eyebrow, { color: palette.accent }]}>
              AHEAD
            </Text>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>
              The calendar around the work.
            </Text>
          </View>
        </View>
        <View
          style={[
            styles.upcomingCard,
            { backgroundColor: palette.surface, borderColor: palette.line },
          ]}
        >
          {workspace.upcomingEvents.slice(0, 5).map((event, index) => (
            <View
              key={event.id}
              style={[
                styles.eventRow,
                index > 0 && {
                  borderTopColor: palette.line,
                  borderTopWidth: StyleSheet.hairlineWidth,
                },
              ]}
            >
              <Text
                style={[
                  styles.eventGlyph,
                  {
                    color:
                      event.kind === "tournament"
                        ? palette.flare
                        : palette.accent,
                  },
                ]}
              >
                {eventGlyph(event.kind)}
              </Text>
              <View style={styles.flex}>
                <Text style={[styles.eventTitle, { color: palette.text }]}>
                  {event.title}
                </Text>
                <Text style={[styles.eventMeta, { color: palette.muted }]}>
                  {formatDate(event.startsAt, event.timezone, true)} ·{" "}
                  {event.kind.replace("-", " ")}
                </Text>
              </View>
              <Text style={[styles.eventLoad, { color: palette.text }]}>
                {event.plannedLoad}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <Modal
        animationType="slide"
        onRequestClose={() => setCheckInOpen(false)}
        presentationStyle="pageSheet"
        visible={checkInOpen}
      >
        <SafeAreaView
          style={[styles.modal, { backgroundColor: palette.canvas }]}
        >
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.modalTopline}>
              <Text style={[styles.eyebrow, { color: palette.accent }]}>
                YOUR RESPONSE
              </Text>
              <Pressable onPress={() => setCheckInOpen(false)}>
                <Text style={[styles.modalClose, { color: palette.text }]}>
                  ×
                </Text>
              </Pressable>
            </View>
            <Text style={[styles.modalTitle, { color: palette.text }]}>
              How hard did the whole session feel?
            </Text>
            <Text style={[styles.body, { color: palette.muted }]}>
              Choose your session RPE: 1 is very easy; 10 is your maximum. This
              is your perception, not a grade.
            </Text>
            <View style={styles.rpeGrid}>
              {Array.from({ length: 10 }, (_, index) => index + 1).map(
                (value) => (
                  <Pressable
                    key={value}
                    onPress={() => setSessionRpe(value)}
                    style={[
                      styles.rpeButton,
                      {
                        borderColor:
                          sessionRpe === value ? palette.accent : palette.line,
                        backgroundColor:
                          sessionRpe === value ? palette.soft : palette.surface,
                      },
                    ]}
                  >
                    <Text style={[styles.rpeValue, { color: palette.text }]}>
                      {value}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>
            <View style={styles.rpeLegend}>
              <Text style={{ color: palette.muted }}>Very easy</Text>
              <Text style={{ color: palette.muted }}>Maximum</Text>
            </View>
            <Text style={[styles.inputLabel, { color: palette.text }]}>
              Anything your coach should know? · optional
            </Text>
            <TextInput
              maxLength={1_000}
              multiline
              onChangeText={setFeedback}
              placeholder="What felt sharp, heavy, confusing, or worth repeating?"
              placeholderTextColor={palette.muted}
              style={[
                styles.feedbackInput,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.line,
                  color: palette.text,
                },
              ]}
              value={feedback}
            />
            <Text style={[styles.privacy, { color: palette.muted }]}>
              Private to you and the authorized coaching team. Duna does not
              publish this to teammates or your profile.
            </Text>
            <Pressable
              disabled={!sessionRpe || saving}
              onPress={() => void submitResponse()}
              style={[
                styles.submitButton,
                { backgroundColor: palette.accent },
                (!sessionRpe || saving) && styles.disabled,
              ]}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitText}>Send my response</Text>
              )}
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const lightPalette = {
  canvas: "#F4F6F4",
  surface: "#FFFFFF",
  soft: "#E3F4EF",
  text: "#102B35",
  muted: "#60747C",
  line: "#D6DFDE",
  deep: "#103846",
  accent: "#0AA68D",
  flare: "#E09A35",
};

const darkPalette = {
  canvas: "#081C24",
  surface: "#102C36",
  soft: "#173D45",
  text: "#EFF7F5",
  muted: "#9CB1B3",
  line: "#264650",
  deep: "#102B35",
  accent: "#28C7AB",
  flare: "#F0B45A",
};

const styles = StyleSheet.create({
  content: {
    gap: 18,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 150,
  },
  flex: { flex: 1 },
  topline: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 38,
  },
  backButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 60,
  },
  eyebrow: { fontSize: 12, fontWeight: "800", letterSpacing: 1.6 },
  phase: { fontSize: 12, fontWeight: "700" },
  programCard: { borderRadius: 26, gap: 12, overflow: "hidden", padding: 22 },
  programKicker: {
    color: "#68DAC4",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  programTitle: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -1.2,
    lineHeight: 33,
  },
  programPurpose: { color: "#C4D7D8", fontSize: 14, lineHeight: 21 },
  progressTrack: {
    backgroundColor: "#284F59",
    borderRadius: 99,
    height: 7,
    marginTop: 6,
    overflow: "hidden",
  },
  progressFill: {
    backgroundColor: "#28C7AB",
    borderRadius: 99,
    height: "100%",
  },
  programFooter: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  programMeta: { color: "#B8CCCD", fontSize: 12, fontWeight: "700" },
  sectionHeading: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.8,
    lineHeight: 29,
    marginTop: 3,
  },
  dateBadge: { alignItems: "flex-end", borderLeftWidth: 1, paddingLeft: 12 },
  dateBadgeDay: { fontSize: 15, fontWeight: "800" },
  dateBadgeTime: { fontSize: 12, marginTop: 2 },
  practiceCard: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 14,
    padding: 16,
  },
  practicePurpose: { fontSize: 17, fontWeight: "600", lineHeight: 24 },
  signalRow: { flexDirection: "row", justifyContent: "space-between" },
  signalLabel: { fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  signalValue: { fontSize: 15, fontWeight: "800", marginTop: 3 },
  opportunity: {
    alignItems: "center",
    borderRadius: 14,
    flexDirection: "row",
    gap: 9,
    padding: 12,
  },
  opportunityValue: { fontSize: 22, fontWeight: "900" },
  opportunityLabel: { flex: 1, fontSize: 12, lineHeight: 16 },
  timeline: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  timelineRow: { flexDirection: "row", minHeight: 82 },
  timelineRail: { alignItems: "center", width: 28 },
  timelineDot: { borderRadius: 99, height: 10, marginTop: 5, width: 10 },
  timelineLine: { flex: 1, width: 1 },
  timelineCopy: { flex: 1, gap: 6, paddingBottom: 12 },
  timelineTime: { fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  blockRow: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    minHeight: 62,
    padding: 12,
  },
  blockTitle: { fontSize: 15, fontWeight: "800" },
  blockMeta: { fontSize: 12, marginTop: 3, textTransform: "capitalize" },
  blockMinutes: { fontSize: 15, fontWeight: "900" },
  checkInCard: {
    alignItems: "center",
    borderRadius: 22,
    flexDirection: "row",
    gap: 12,
    padding: 19,
  },
  checkInKicker: {
    color: "#D9FFF7",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  checkInTitle: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "800",
    marginTop: 4,
  },
  checkInBody: { color: "#DBFFF7", fontSize: 12, lineHeight: 17, marginTop: 4 },
  checkInArrow: { color: "#FFFFFF", fontSize: 26, fontWeight: "600" },
  notice: { borderRadius: 14, fontSize: 13, lineHeight: 19, padding: 14 },
  loadCard: {
    alignItems: "flex-end",
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    height: 180,
    justifyContent: "space-between",
    padding: 15,
  },
  loadColumn: { alignItems: "center", flex: 1 },
  loadBarArea: {
    alignItems: "center",
    height: 98,
    justifyContent: "flex-end",
    position: "relative",
    width: "100%",
  },
  loadBar: { borderRadius: 7, maxWidth: 24, width: "45%" },
  tournamentMarker: {
    borderRadius: 7,
    borderWidth: 1,
    height: 94,
    position: "absolute",
    width: "68%",
  },
  loadValue: { fontSize: 12, fontWeight: "900", marginTop: 6 },
  loadWeek: { fontSize: 12, marginTop: 3 },
  upcomingCard: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    paddingHorizontal: 14,
  },
  eventRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 74,
    paddingVertical: 11,
  },
  eventGlyph: { fontSize: 20, width: 23 },
  eventTitle: { fontSize: 15, fontWeight: "800" },
  eventMeta: { fontSize: 12, marginTop: 3, textTransform: "capitalize" },
  eventLoad: { fontSize: 14, fontWeight: "900" },
  emptyTitle: {
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -1.2,
    lineHeight: 38,
    marginTop: 40,
  },
  body: { fontSize: 15, lineHeight: 22 },
  modal: { flex: 1 },
  modalContent: { gap: 18, padding: 22, paddingBottom: 44 },
  modalTopline: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  modalClose: { fontSize: 34, fontWeight: "300", lineHeight: 40 },
  modalTitle: {
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -1.2,
    lineHeight: 39,
  },
  rpeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  rpeButton: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    height: 54,
    justifyContent: "center",
    width: "17.5%",
  },
  rpeValue: { fontSize: 18, fontWeight: "900" },
  rpeLegend: { flexDirection: "row", justifyContent: "space-between" },
  inputLabel: { fontSize: 13, fontWeight: "800", marginTop: 8 },
  feedbackInput: {
    borderRadius: 16,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 130,
    padding: 14,
    textAlignVertical: "top",
  },
  privacy: { fontSize: 12, lineHeight: 17 },
  submitButton: {
    alignItems: "center",
    borderRadius: 16,
    justifyContent: "center",
    minHeight: 56,
  },
  submitText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  disabled: { opacity: 0.42 },
});
