/**
 * Add a result after the fact (M-P4a, boards P-Result-Players and
 * P-Result-Score), the same steps as the web `/add-score` flow for a
 * signed-in player: where and when, the score (thumb-sized steppers, a live
 * NetScore, the "doesn't look finished" warning that never blocks), who
 * played and "Everyone on court agreed", then the result.
 *
 * Saving calls `player.recordCompletedMatch` once (single flight, one
 * idempotency key per attempt), which applies the server's own checks.
 * Opens pre-filled from a Watch score or a live match stopped early.
 */
import { ScrollView, StyleSheet, View } from "react-native";
import { report } from "@duna/observability";
import { netScoreState } from "@duna/tideline-core";
import {
  Cross,
  PermissionDeniedState,
  Text,
  useHaptics,
  useTheme,
} from "@duna/ui/native";
import { useMemo, useRef, useState } from "react";
import { usePlayerRuntime } from "../../../runtime";
import { useShell } from "../../app/ShellContext";
import { usePaneEdges } from "../../app/ui";
import { ActionButton } from "../find/parts";
import { TEAM_SIZES, type MatchType, type TeamSize } from "./formats";
import { LineupEditor } from "./Lineup";
import { newId, scoringDeviceId } from "./live-store";
import { rememberScoring } from "./match-cache";
import { NetScoreCard } from "./NetScoreCard";
import {
  CheckRow,
  Notice,
  Segmented,
  Stepper,
  useReadableInset,
} from "./parts";
import {
  AGREEMENT_LABEL,
  AGREEMENT_REQUIRED,
  looksUnfinished,
  scoreShape,
  SOFT_UNFINISHED_WARNING,
  whatThisResultWouldDo,
  type EnteredSet,
} from "./result-rules";
import { dayLabel, playedAtFor, recordInput } from "./add-result-model";
import type { ScoreDraft } from "./score-draft";
import type { LiveSide, TeamSide } from "./scoring-machine";
import { fitTeams, useMe } from "./StartMatch";
import { WhereField, type ChosenPlace } from "./WhereField";

const STEPS = ["Where and when", "Score", "Players"] as const;
const MAX_DAYS_BACK = 90;

function daysBackFrom(playedAt: string | undefined, now: Date): number {
  if (!playedAt) return 0;
  const days = Math.floor(
    (now.setHours(0, 0, 0, 0) - new Date(playedAt).setHours(0, 0, 0, 0)) /
      86_400_000,
  );
  return Math.max(0, Math.min(MAX_DAYS_BACK, days));
}

export function AddResultScreen({ draft }: { readonly draft?: ScoreDraft }) {
  const runtime = usePlayerRuntime();
  const shell = useShell();
  const haptics = useHaptics();
  const edges = usePaneEdges();
  const inset = useReadableInset();
  const { tokens } = useTheme();
  const me = useMe();
  const [step, setStep] = useState(0);
  const [where, setWhere] = useState<ChosenPlace | null>(
    draft?.venue ? { venueId: draft.venue.id, label: draft.venue.label } : null,
  );
  const [daysBack, setDaysBack] = useState(() =>
    daysBackFrom(draft?.playedAt, new Date()),
  );
  const [teamSize, setTeamSize] = useState<TeamSize>(draft?.teamSize ?? 2);
  const [matchType, setMatchType] = useState<MatchType>(
    draft?.matchType ?? "competitive",
  );
  const [sets, setSets] = useState<EnteredSet[]>(() =>
    draft?.sets.length
      ? draft.sets.map((set) => ({ you: set.a, them: set.b }))
      : [{ you: 21, them: 18 }],
  );
  const [teams, setTeams] = useState<Readonly<Record<TeamSide, LiveSide>>>(() =>
    fitTeams(
      draft?.teams ?? { A: { people: [] }, B: { people: [] } },
      draft?.teamSize ?? 2,
      me,
    ),
  );
  const [agreed, setAgreed] = useState(Boolean(draft?.agreed));
  const [problem, setProblem] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<{ text: string; reference: string }>();
  const attemptKey = useRef(newId());

  const shape = scoreShape(sets);
  const preview = useMemo(
    () =>
      netScoreState({
        status: "pending-verification",
        sets: sets.map((set) => ({ home: set.you, away: set.them })),
        bestOf: shape.ok ? shape.shape.setsToWin * 2 - 1 : undefined,
      }),
    [sets, shape],
  );
  const names = { home: "Your side", away: "The other side" };
  const missing = teamSize * 2 - teams.A.people.length - teams.B.people.length;

  const previewBuild = runtime.mode === "preview";
  if (!previewBuild && !runtime.client) {
    return (
      <PermissionDeniedState what="Adding a result" who="signed-in players" />
    );
  }
  const client = runtime.client;

  const next = () => {
    if (step === 1 && !shape.ok) {
      haptics.refused();
      setProblem(shape.problem);
      return;
    }
    setProblem(undefined);
    haptics.selection();
    setStep((current) => Math.min(STEPS.length - 1, current + 1));
  };

  const save = async () => {
    if (saving) return;
    if (!shape.ok) {
      setStep(1);
      setProblem(shape.problem);
      return;
    }
    if (missing > 0) {
      setProblem(
        `Add ${missing === 1 ? "one more player" : `${missing} more players`} before saving.`,
      );
      return;
    }
    if (!agreed) {
      haptics.refused();
      setProblem(AGREEMENT_REQUIRED);
      return;
    }
    setProblem(undefined);
    setFailure(undefined);
    if (previewBuild || !client) {
      setProblem("This preview build doesn’t save results.");
      return;
    }
    setSaving(true);
    try {
      const scoring = await client.player.recordCompletedMatch.mutate(
        recordInput({
          teams,
          where,
          playedAt: playedAtFor(daysBack, new Date()),
          sets,
          setsToWin: shape.shape.setsToWin,
          matchType,
          deviceId: await scoringDeviceId(),
          idempotencyKey: attemptKey.current,
        }),
      );
      rememberScoring(scoring);
      haptics.confirmed(2);
      void runtime.refresh().catch(() => undefined);
      shell.open("result", { targetId: scoring.matchId });
    } catch (reason) {
      haptics.refused();
      const network = !(reason as { data?: unknown })?.data;
      setFailure({
        text: network
          ? "You’re offline or Duna can’t be reached. Your result is still here: try again when you’re back online."
          : reason instanceof Error
            ? reason.message
            : "Try again.",
        reference: report(reason, { event: "player.score.record_failed" }),
      });
      // A lost reply is retried with the same key (never twice); a refused
      // result is a new attempt once it is changed.
      if (!network) attemptKey.current = newId();
    } finally {
      setSaving(false);
    }
  };

  const today = new Date();
  return (
    <ScrollView
      contentContainerStyle={{
        padding: tokens.space["4"],
        paddingBottom: edges.bottom + tokens.space["8"],
        paddingLeft: edges.left + inset,
        paddingRight: edges.right + inset,
        gap: tokens.space["4"],
      }}
      keyboardShouldPersistTaps="handled"
      testID="add-result"
    >
      <View style={styles.stepHead}>
        <Text accessibilityRole="header" variant="phone-heading">
          {STEPS[step]}
        </Text>
        <Text tone="text-2" variant="phone-meta">
          {`${step + 1} of ${STEPS.length}`}
        </Text>
      </View>
      {draft?.source === "watch" && step === 0 ? (
        <Notice icon="watch" tone="info" title="Scored on your Apple Watch">
          Add where and who played, confirm everyone agreed, then save it.
        </Notice>
      ) : null}
      <Cross crossKey={step}>
        <View style={{ gap: tokens.space["4"] }}>
          {step === 0 ? (
            <>
              <WhereField onChange={setWhere} value={where} />
              <View style={{ gap: tokens.space["2"] }}>
                <Text tone="text-2" variant="phone-meta" weight={600}>
                  Day
                </Text>
                <View style={styles.dayRow}>
                  <ActionButton
                    accessibilityHint="An earlier day"
                    disabled={daysBack >= MAX_DAYS_BACK}
                    icon="chevron-left"
                    kind="secondary"
                    label="Earlier"
                    onPress={() =>
                      setDaysBack((days) => Math.min(MAX_DAYS_BACK, days + 1))
                    }
                  />
                  <Text
                    accessibilityLiveRegion="polite"
                    style={styles.dayText}
                    variant="phone-body"
                    weight={600}
                  >
                    {dayLabel(daysBack, today)}
                  </Text>
                  <ActionButton
                    accessibilityHint="A later day"
                    disabled={daysBack === 0}
                    icon="chevron-right"
                    kind="secondary"
                    label="Later"
                    onPress={() => setDaysBack((days) => Math.max(0, days - 1))}
                  />
                </View>
                <Text tone="text-2" variant="phone-meta">
                  Results from the last 90 days.
                </Text>
              </View>
            </>
          ) : null}
          {step === 1 ? (
            <>
              <Segmented
                label="Format"
                onChange={(size) => {
                  setTeamSize(size);
                  setTeams((current) => fitTeams(current, size, me));
                }}
                options={TEAM_SIZES}
                value={teamSize}
              />
              <Segmented
                label="Kind of match"
                onChange={setMatchType}
                options={[
                  { value: "competitive", label: "Competitive" },
                  { value: "friendly", label: "Friendly" },
                ]}
                value={matchType}
              />
              {sets.map((set, index) => (
                <View key={index} style={{ gap: tokens.space["2"] }}>
                  <Text tone="text-2" variant="phone-meta" weight={600}>
                    {`Set ${index + 1}`}
                  </Text>
                  <View style={styles.setRow}>
                    <View style={styles.setSide}>
                      <Text variant="phone-meta">Your side</Text>
                      <Stepper
                        label={`Set ${index + 1}, your side`}
                        onChange={(you) =>
                          setSets((current) =>
                            current.map((row, at) =>
                              at === index ? { ...row, you } : row,
                            ),
                          )
                        }
                        value={set.you}
                      />
                    </View>
                    <View style={styles.setSide}>
                      <Text variant="phone-meta">The other side</Text>
                      <Stepper
                        label={`Set ${index + 1}, the other side`}
                        onChange={(them) =>
                          setSets((current) =>
                            current.map((row, at) =>
                              at === index ? { ...row, them } : row,
                            ),
                          )
                        }
                        value={set.them}
                      />
                    </View>
                  </View>
                </View>
              ))}
              <View style={styles.dayRow}>
                {sets.length < 5 ? (
                  <ActionButton
                    icon="plus"
                    kind="secondary"
                    label="Add a set"
                    onPress={() =>
                      setSets((current) => [...current, { you: 0, them: 0 }])
                    }
                  />
                ) : null}
                {sets.length > 1 ? (
                  <ActionButton
                    icon="minus"
                    kind="quiet"
                    label="Remove the last set"
                    onPress={() => setSets((current) => current.slice(0, -1))}
                  />
                ) : null}
              </View>
              <NetScoreCard names={names} state={preview} />
              {looksUnfinished(sets) ? (
                <Notice tone="warning">{SOFT_UNFINISHED_WARNING}</Notice>
              ) : null}
              <Text tone="text-2" variant="phone-meta">
                {whatThisResultWouldDo({ teamSize, matchType })}
              </Text>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <LineupEditor
                me={me}
                onChange={setTeams}
                teamSize={teamSize}
                teams={teams}
              />
              <CheckRow
                checked={agreed}
                error={problem === AGREEMENT_REQUIRED ? problem : undefined}
                label={AGREEMENT_LABEL}
                onChange={setAgreed}
                testID="result-agreed"
              />
            </>
          ) : null}
        </View>
      </Cross>
      {problem && problem !== AGREEMENT_REQUIRED ? (
        <Notice tone="danger">{problem}</Notice>
      ) : null}
      {failure ? (
        <Notice tone="danger" title="Not saved yet">
          {`${failure.text} Reference ${failure.reference}.`}
        </Notice>
      ) : null}
      <View style={[styles.dayRow, { gap: tokens.space["2"] }]}>
        {step > 0 ? (
          <View style={styles.flex}>
            <ActionButton
              kind="secondary"
              label="Back"
              onPress={() => {
                setProblem(undefined);
                setStep((current) => current - 1);
              }}
            />
          </View>
        ) : null}
        <View style={styles.flex}>
          {step < STEPS.length - 1 ? (
            <ActionButton label="Next" onPress={next} testID="result-next" />
          ) : (
            <ActionButton
              busy={saving}
              label="Save result"
              onPress={() => void save()}
              testID="result-save"
            />
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stepHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  dayText: { flex: 1, textAlign: "center", minWidth: 96 },
  setRow: { flexDirection: "row", gap: 16, flexWrap: "wrap" },
  setSide: { gap: 4 },
});
