import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { DunaApiClient } from "./mobile-api";
import {
  DunaNumericText,
  SatoshiText as Text,
  SatoshiTextInput as TextInput,
} from "./satoshi-text";
import { useProRuntime } from "./runtime";

type TournamentSnapshot = Awaited<
  ReturnType<DunaApiClient["public"]["tournamentCompetition"]["query"]>
>;
type DivisionDetail = Awaited<
  ReturnType<DunaApiClient["operator"]["divisionDetail"]["query"]>
>;

export type TournamentControlPalette = {
  readonly canvas: string;
  readonly surface: string;
  readonly surfaceAlt: string;
  readonly ink: string;
  readonly muted: string;
  readonly accent: string;
  readonly onAccent: string;
  readonly positive: string;
  readonly warning: string;
  readonly danger: string;
  readonly border: string;
};

function time(value: string | undefined, timezone: string) {
  if (!value) return "Unscheduled";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

function score(
  match: TournamentSnapshot["divisions"][number]["matches"][number],
) {
  if (!match.score?.sets.length) return match.status === "live" ? "Live" : "—";
  return match.score.sets.map(([a, b]) => `${a}–${b}`).join("  ");
}

function moneyMinor(value: string) {
  const amount = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
}

export function TournamentControl({
  onClose,
  onScore,
  palette,
}: {
  readonly onClose: () => void;
  readonly onScore: (matchId: string) => void;
  readonly palette: TournamentControlPalette;
}) {
  const { client, refresh, workspace } = useProRuntime();
  const events = useMemo(
    () =>
      (workspace?.sessions ?? []).filter(
        (session) => session.kind === "tournament" || session.kind === "league",
      ),
    [workspace?.sessions],
  );
  const [eventId, setEventId] = useState<string>();
  const event =
    events.find((candidate) => candidate.id === eventId) ?? events[0];
  const [snapshot, setSnapshot] = useState<TournamentSnapshot>();
  const [detail, setDetail] = useState<DivisionDetail>();
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [feedback, setFeedback] = useState<string>();
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryPlayerIds, setEntryPlayerIds] = useState<readonly string[]>([]);
  const [entryPayment, setEntryPayment] = useState<"complimentary" | "cash">(
    "complimentary",
  );
  const [cashAmount, setCashAmount] = useState("");

  const load = useCallback(async () => {
    if (!client || !event) return;
    setLoading(true);
    setFeedback(undefined);
    try {
      const next = await client.public.tournamentCompetition.query({
        slug: event.slug,
      });
      setSnapshot(next);
      const nextDivision =
        next.divisions.find((division) => division.id === selectedDivisionId) ??
        next.divisions[0];
      if (nextDivision) {
        setSelectedDivisionId(nextDivision.id);
        setDetail(
          await client.operator.divisionDetail.query({
            divisionId: nextDivision.id,
          }),
        );
      } else {
        setDetail(undefined);
      }
    } catch (reason) {
      setFeedback(
        reason instanceof Error
          ? reason.message
          : "Tournament control could not load this event.",
      );
    } finally {
      setLoading(false);
    }
  }, [client, event, selectedDivisionId]);

  useEffect(() => {
    if (event) void load();
    else {
      setSnapshot(undefined);
      setDetail(undefined);
    }
  }, [event?.id]); // A fresh event selection is the only automatic refresh.

  const selectDivision = async (divisionId: string) => {
    if (!client) return;
    setSelectedDivisionId(divisionId);
    setLoading(true);
    try {
      setDetail(await client.operator.divisionDetail.query({ divisionId }));
    } catch (reason) {
      setFeedback(
        reason instanceof Error
          ? reason.message
          : "Division details could not load.",
      );
    } finally {
      setLoading(false);
    }
  };

  const perform = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setFeedback(undefined);
    try {
      await action();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh();
      await load();
    } catch (reason) {
      setFeedback(
        reason instanceof Error
          ? reason.message
          : "Duna Pro could not save that tournament change.",
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(undefined);
    }
  };

  const selectedDivision = snapshot?.divisions.find(
    (division) => division.id === selectedDivisionId,
  );
  const teamSize = detail?.division.teamSize ?? 2;
  const people = (workspace?.people ?? []).filter((person) =>
    person.roles.includes("player"),
  );
  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Close tournament control"
          onPress={onClose}
          style={styles.close}
        >
          <Text style={styles.closeText}>‹</Text>
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>EVENT CONTROL</Text>
          <Text numberOfLines={1} style={styles.title}>
            Tournament desk
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Refresh tournament"
          onPress={() => void load()}
          style={styles.refresh}
        >
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {events.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              No tournament is connected to this club.
            </Text>
            <Text style={styles.emptyBody}>
              Create and configure the event in Duna HQ, then use this desk to
              run it courtside.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionLabel}>YOUR EVENTS</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.eventRail}
            >
              {events.map((candidate) => (
                <Pressable
                  accessibilityState={{ selected: candidate.id === event?.id }}
                  key={candidate.id}
                  onPress={() => setEventId(candidate.id)}
                  style={[
                    styles.eventChip,
                    candidate.id === event?.id && styles.eventChipActive,
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.eventChipText,
                      candidate.id === event?.id && styles.eventChipTextActive,
                    ]}
                  >
                    {candidate.title}
                  </Text>
                  <Text
                    style={[
                      styles.eventChipMeta,
                      candidate.id === event?.id && styles.eventChipTextActive,
                    ]}
                  >
                    {candidate.status.replaceAll("-", " ")}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {loading && !snapshot ? (
              <ActivityIndicator
                color={palette.accent}
                style={styles.loading}
              />
            ) : null}
            {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
            {snapshot && event ? (
              <>
                <View style={styles.summary}>
                  <View style={styles.flex}>
                    <Text style={styles.summaryTitle}>
                      {snapshot.session.title}
                    </Text>
                    <Text style={styles.summaryBody}>
                      {snapshot.divisions.length} divisions · Updated{" "}
                      {time(
                        snapshot.session.updatedAt,
                        snapshot.session.timezone,
                      )}
                    </Text>
                  </View>
                  <Text style={styles.liveState}>
                    {snapshot.session.status === "live"
                      ? "LIVE"
                      : snapshot.session.status.toUpperCase()}
                  </Text>
                </View>

                <Text style={styles.sectionLabel}>DIVISIONS</Text>
                {snapshot.divisions.length === 0 ? (
                  <View style={styles.empty}>
                    <Text style={styles.emptyTitle}>No draw is ready yet.</Text>
                    <Text style={styles.emptyBody}>
                      Build and publish pools or a bracket in Duna HQ before the
                      field opens courtside.
                    </Text>
                  </View>
                ) : (
                  snapshot.divisions.map((division) => {
                    const live = division.matches.filter(
                      (match) => match.status === "live",
                    ).length;
                    const complete = division.matches.filter(
                      (match) => match.status === "complete",
                    ).length;
                    const selected = division.id === selectedDivisionId;
                    return (
                      <Pressable
                        key={division.id}
                        onPress={() => void selectDivision(division.id)}
                        style={[
                          styles.division,
                          selected && styles.divisionSelected,
                        ]}
                      >
                        <View style={styles.flex}>
                          <Text style={styles.divisionTitle}>
                            {division.name}
                          </Text>
                          <Text style={styles.divisionMeta}>
                            {division.format.replaceAll("-", " ")} · {complete}/
                            {division.matches.length} matches final
                          </Text>
                        </View>
                        <DunaNumericText
                          tier="table"
                          style={styles.divisionLive}
                        >
                          {live}
                        </DunaNumericText>
                        <Text style={styles.divisionLiveLabel}>live</Text>
                      </Pressable>
                    );
                  })
                )}

                {selectedDivision && detail ? (
                  <>
                    <View style={styles.controlHeader}>
                      <View style={styles.flex}>
                        <Text style={styles.sectionLabel}>
                          RUN {selectedDivision.name.toUpperCase()}
                        </Text>
                        <Text style={styles.controlBody}>
                          {detail.teams.length} teams · {detail.courts.length}{" "}
                          courts · {teamSize} per team
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => setEntryOpen((value) => !value)}
                        style={styles.secondaryButton}
                      >
                        <Text style={styles.secondaryButtonText}>Walk-in</Text>
                      </Pressable>
                    </View>
                    {snapshot.session.status !== "live" && (
                      <Pressable
                        disabled={busy === "launch"}
                        onPress={() =>
                          Alert.alert(
                            "Start this tournament?",
                            "This publishes the existing draw as live. Match scoring can begin immediately.",
                            [
                              { text: "Not yet", style: "cancel" },
                              {
                                text: "Start tournament",
                                style: "default",
                                onPress: () =>
                                  void perform("launch", () =>
                                    client!.operator.launchDivisionTournament.mutate(
                                      {
                                        divisionId: selectedDivision.id,
                                        reason:
                                          "Tournament started by an operator in Duna Pro.",
                                        confirmed: true,
                                        idempotencyKey: Crypto.randomUUID(),
                                      },
                                    ),
                                  ),
                              },
                            ],
                          )
                        }
                        style={[
                          styles.primaryButton,
                          busy === "launch" && styles.disabled,
                        ]}
                      >
                        <Text style={styles.primaryButtonText}>
                          {busy === "launch" ? "Starting…" : "Start tournament"}
                        </Text>
                      </Pressable>
                    )}
                    {entryOpen && (
                      <View style={styles.entryCard}>
                        <Text style={styles.entryTitle}>
                          Add a walk-in team
                        </Text>
                        <Text style={styles.entryBody}>
                          Choose exactly {teamSize} connected players. This
                          creates an auditable confirmed entry.
                        </Text>
                        <View style={styles.personGrid}>
                          {people.slice(0, 24).map((person) => {
                            const selected = entryPlayerIds.includes(
                              person.personId,
                            );
                            return (
                              <Pressable
                                key={person.personId}
                                onPress={() =>
                                  setEntryPlayerIds((current) =>
                                    selected
                                      ? current.filter(
                                          (id) => id !== person.personId,
                                        )
                                      : current.length < teamSize
                                        ? [...current, person.personId]
                                        : current,
                                  )
                                }
                                style={[
                                  styles.person,
                                  selected && styles.personSelected,
                                ]}
                              >
                                <Text
                                  numberOfLines={1}
                                  style={styles.personText}
                                >
                                  {person.displayName}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        <View style={styles.paymentRow}>
                          {(["complimentary", "cash"] as const).map(
                            (payment) => (
                              <Pressable
                                key={payment}
                                onPress={() => setEntryPayment(payment)}
                                style={[
                                  styles.paymentOption,
                                  entryPayment === payment &&
                                    styles.paymentOptionActive,
                                ]}
                              >
                                <Text style={styles.paymentOptionText}>
                                  {payment === "cash"
                                    ? "Cash"
                                    : "Complimentary"}
                                </Text>
                              </Pressable>
                            ),
                          )}
                        </View>
                        {entryPayment === "cash" && (
                          <TextInput
                            keyboardType="decimal-pad"
                            onChangeText={setCashAmount}
                            placeholder="Verified cash amount"
                            placeholderTextColor={palette.muted}
                            style={styles.cashInput}
                            value={cashAmount}
                          />
                        )}
                        <Pressable
                          disabled={
                            busy === "walk-in" ||
                            entryPlayerIds.length !== teamSize ||
                            (entryPayment === "cash" &&
                              moneyMinor(cashAmount) === 0)
                          }
                          onPress={() =>
                            void perform("walk-in", async () => {
                              await client!.operator.addManualDivisionEntry.mutate(
                                {
                                  divisionId: selectedDivision.id,
                                  playerIds: [...entryPlayerIds],
                                  payment: entryPayment,
                                  ...(entryPayment === "cash"
                                    ? {
                                        cashAmountMinor: moneyMinor(cashAmount),
                                        cashReference: "Verified in Duna Pro",
                                      }
                                    : {}),
                                  reason:
                                    "Walk-in team entered by an operator in Duna Pro.",
                                  confirmed: true,
                                  idempotencyKey: Crypto.randomUUID(),
                                },
                              );
                              setEntryOpen(false);
                              setEntryPlayerIds([]);
                              setCashAmount("");
                            })
                          }
                          style={[
                            styles.primaryButton,
                            (entryPlayerIds.length !== teamSize ||
                              (entryPayment === "cash" &&
                                moneyMinor(cashAmount) === 0)) &&
                              styles.disabled,
                          ]}
                        >
                          <Text style={styles.primaryButtonText}>
                            {busy === "walk-in"
                              ? "Adding…"
                              : `Add ${teamSize}-person team`}
                          </Text>
                        </Pressable>
                      </View>
                    )}

                    <Text style={styles.sectionLabel}>MATCHES</Text>
                    {selectedDivision.matches.length === 0 ? (
                      <Text style={styles.emptyBody}>
                        Matches appear here as soon as the draw is generated.
                      </Text>
                    ) : (
                      selectedDivision.matches.map((match) => (
                        <View key={match.id} style={styles.match}>
                          <View style={styles.matchTop}>
                            <Text style={styles.matchLabel}>{match.label}</Text>
                            <Text
                              style={[
                                styles.matchStatus,
                                match.status === "live" && styles.matchLive,
                              ]}
                            >
                              {match.status.replaceAll("-", " ")}
                            </Text>
                          </View>
                          <Text style={styles.matchTeams}>
                            {match.teamA?.name ?? "TBD"}{" "}
                            <Text style={styles.matchVersus}>vs</Text>{" "}
                            {match.teamB?.name ?? "TBD"}
                          </Text>
                          <View style={styles.matchFooter}>
                            <Text style={styles.matchMeta}>
                              {match.courtName ?? "Court TBD"} ·{" "}
                              {time(
                                match.scheduledAt,
                                snapshot.session.timezone,
                              )}
                            </Text>
                            <DunaNumericText
                              tier="table"
                              style={styles.matchScore}
                            >
                              {score(match)}
                            </DunaNumericText>
                          </View>
                          {match.teamA && match.teamB && (
                            <Pressable
                              onPress={() => onScore(match.id)}
                              style={styles.scoreButton}
                            >
                              <Text style={styles.scoreButtonText}>
                                {match.status === "live"
                                  ? "Resume scoring"
                                  : "Score match"}
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      ))
                    )}
                  </>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(palette: TournamentControlPalette) {
  return StyleSheet.create({
    safe: { backgroundColor: palette.canvas, flex: 1 },
    flex: { flex: 1, minWidth: 0 },
    header: {
      alignItems: "center",
      borderBottomColor: palette.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 12,
      padding: 16,
    },
    close: {
      alignItems: "center",
      height: 48,
      justifyContent: "center",
      width: 36,
    },
    closeText: { color: palette.ink, fontSize: 36, lineHeight: 38 },
    eyebrow: {
      color: palette.muted,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1.2,
    },
    title: {
      color: palette.ink,
      fontSize: 25,
      fontWeight: "800",
      letterSpacing: -0.35,
    },
    refresh: { minHeight: 48, justifyContent: "center" },
    refreshText: { color: palette.accent, fontSize: 14, fontWeight: "700" },
    content: { gap: 12, padding: 18, paddingBottom: 44 },
    sectionLabel: {
      color: palette.muted,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 1.1,
      marginTop: 8,
    },
    eventRail: { marginHorizontal: -18 },
    eventChip: {
      backgroundColor: palette.surfaceAlt,
      borderColor: palette.border,
      borderRadius: 16,
      borderWidth: 1,
      marginLeft: 18,
      maxWidth: 190,
      minHeight: 66,
      padding: 12,
      width: 158,
    },
    eventChipActive: {
      backgroundColor: palette.accent,
      borderColor: palette.accent,
    },
    eventChipText: { color: palette.ink, fontSize: 14, fontWeight: "700" },
    eventChipTextActive: { color: palette.onAccent },
    eventChipMeta: {
      color: palette.muted,
      fontSize: 12,
      marginTop: 4,
      textTransform: "capitalize",
    },
    loading: { marginVertical: 16 },
    feedback: {
      backgroundColor: palette.surfaceAlt,
      borderColor: palette.danger,
      borderLeftWidth: 3,
      color: palette.danger,
      fontSize: 14,
      lineHeight: 20,
      padding: 12,
    },
    summary: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 22,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      padding: 16,
    },
    summaryTitle: { color: palette.ink, fontSize: 19, fontWeight: "800" },
    summaryBody: { color: palette.muted, fontSize: 13, marginTop: 5 },
    liveState: {
      color: palette.positive,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.8,
    },
    division: {
      alignItems: "center",
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: "row",
      gap: 7,
      minHeight: 78,
      padding: 14,
    },
    divisionSelected: { borderColor: palette.accent, borderWidth: 2 },
    divisionTitle: { color: palette.ink, fontSize: 16, fontWeight: "700" },
    divisionMeta: {
      color: palette.muted,
      fontSize: 12,
      marginTop: 4,
      textTransform: "capitalize",
    },
    divisionLive: { color: palette.accent, fontSize: 18 },
    divisionLiveLabel: { color: palette.muted, fontSize: 12 },
    controlHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      marginTop: 8,
    },
    controlBody: { color: palette.muted, fontSize: 13, marginTop: 3 },
    secondaryButton: {
      alignItems: "center",
      borderColor: palette.accent,
      borderRadius: 14,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 48,
      paddingHorizontal: 14,
    },
    secondaryButtonText: {
      color: palette.accent,
      fontSize: 13,
      fontWeight: "700",
    },
    primaryButton: {
      alignItems: "center",
      backgroundColor: palette.accent,
      borderRadius: 16,
      justifyContent: "center",
      minHeight: 56,
      paddingHorizontal: 18,
    },
    primaryButtonText: {
      color: palette.onAccent,
      fontSize: 15,
      fontWeight: "800",
    },
    disabled: { opacity: 0.45 },
    entryCard: {
      backgroundColor: palette.surfaceAlt,
      borderColor: palette.border,
      borderRadius: 20,
      borderWidth: 1,
      gap: 12,
      padding: 15,
    },
    entryTitle: { color: palette.ink, fontSize: 18, fontWeight: "800" },
    entryBody: { color: palette.muted, fontSize: 13, lineHeight: 19 },
    personGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    person: {
      borderColor: palette.border,
      borderRadius: 12,
      borderWidth: 1,
      minHeight: 48,
      justifyContent: "center",
      paddingHorizontal: 10,
      width: "47%",
    },
    personSelected: {
      backgroundColor: palette.accent,
      borderColor: palette.accent,
    },
    personText: { color: palette.ink, fontSize: 13, fontWeight: "600" },
    paymentRow: { flexDirection: "row", gap: 8 },
    paymentOption: {
      borderColor: palette.border,
      borderRadius: 12,
      borderWidth: 1,
      flex: 1,
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
    },
    paymentOptionActive: { borderColor: palette.accent, borderWidth: 2 },
    paymentOptionText: { color: palette.ink, fontSize: 13, fontWeight: "700" },
    cashInput: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 12,
      borderWidth: 1,
      color: palette.ink,
      fontSize: 16,
      minHeight: 52,
      paddingHorizontal: 12,
    },
    match: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 18,
      borderWidth: 1,
      gap: 9,
      padding: 14,
    },
    matchTop: { flexDirection: "row", justifyContent: "space-between" },
    matchLabel: {
      color: palette.muted,
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
    },
    matchStatus: {
      color: palette.muted,
      fontSize: 12,
      fontWeight: "800",
      textTransform: "uppercase",
    },
    matchLive: { color: palette.warning },
    matchTeams: { color: palette.ink, fontSize: 15, fontWeight: "700" },
    matchVersus: { color: palette.muted, fontWeight: "400" },
    matchFooter: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    matchMeta: { color: palette.muted, fontSize: 12 },
    matchScore: { color: palette.ink, fontSize: 16 },
    scoreButton: {
      alignItems: "center",
      borderColor: palette.accent,
      borderRadius: 12,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 48,
    },
    scoreButtonText: { color: palette.accent, fontSize: 13, fontWeight: "800" },
    empty: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 20,
      borderWidth: 1,
      gap: 8,
      padding: 18,
    },
    emptyTitle: { color: palette.ink, fontSize: 19, fontWeight: "800" },
    emptyBody: { color: palette.muted, fontSize: 14, lineHeight: 20 },
  });
}
