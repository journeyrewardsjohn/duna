import type { TournamentCompetitionSnapshot } from "@duna/api";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { DunaApiClient } from "./mobile-api";
import { DunaNumericText, SatoshiText as Text } from "./satoshi-text";

type Division = TournamentCompetitionSnapshot["divisions"][number];
type Round = Division["rounds"][number];
type Match = Division["matches"][number];

function matchScore(match: Match): string {
  if (match.heat) {
    return match.status === "complete"
      ? "Round final"
      : `${match.heat.durationMinutes} min · ${match.heat.advanceCount} advance`;
  }
  if (!match.score?.sets.length) {
    return match.scheduledAt ? "Scheduled" : "Awaiting teams";
  }
  return match.score.sets
    .map(([left, right]) => `${left}–${right}`)
    .join(" · ");
}

function LocalMatchCard({ match }: { readonly match: Match }) {
  const complete = Boolean(match.completedAt || match.winnerTeamId);
  const live = match.status === "live" || match.score?.status === "live";
  return (
    <View
      style={[
        styles.match,
        complete && styles.matchComplete,
        live && styles.matchLive,
      ]}
    >
      <View style={styles.matchHeader}>
        <Text style={[styles.matchStatus, live && styles.matchStatusLive]}>
          {live ? "LIVE" : complete ? "FINAL" : (match.courtName ?? "UP NEXT")}
        </Text>
        <Text style={styles.matchScore}>{matchScore(match)}</Text>
      </View>
      {match.heat ? (
        match.heat.participants.length ? (
          match.heat.participants.map((participant) => (
            <View key={participant.team.id} style={styles.teamRow}>
              <DunaNumericText tier="table" style={styles.seed}>
                {participant.rank}
              </DunaNumericText>
              <Text
                numberOfLines={1}
                style={[
                  styles.teamName,
                  participant.advances && styles.winnerName,
                ]}
              >
                {participant.team.name}
              </Text>
              <DunaNumericText tier="block" style={styles.heatPoints}>
                {participant.points}
              </DunaNumericText>
            </View>
          ))
        ) : (
          <Text style={styles.awaitingQualifiers}>
            Qualifiers appear when the prior round closes.
          </Text>
        )
      ) : (
        <>
          <View style={styles.teamRow}>
            <Text style={styles.seed}>{match.teamA?.seed ?? "–"}</Text>
            <Text
              numberOfLines={1}
              style={[
                styles.teamName,
                match.winnerTeamId === match.teamA?.id && styles.winnerName,
              ]}
            >
              {match.teamA?.name ?? "To be decided"}
            </Text>
          </View>
          <View style={styles.teamRow}>
            <Text style={styles.seed}>{match.teamB?.seed ?? "–"}</Text>
            <Text
              numberOfLines={1}
              style={[
                styles.teamName,
                match.winnerTeamId === match.teamB?.id && styles.winnerName,
              ]}
            >
              {match.teamB?.name ?? "To be decided"}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

function roundLabel(round: Round): string {
  return round.label.replace(" · round ", " R");
}

export function LocalTournamentPanel({
  client,
  sessionId,
}: {
  readonly client?: DunaApiClient;
  readonly sessionId: string;
}) {
  const [snapshot, setSnapshot] = useState<TournamentCompetitionSnapshot>();
  const [error, setError] = useState(false);
  const [divisionId, setDivisionId] = useState<string>();
  const [roundKey, setRoundKey] = useState<string>();

  useEffect(() => {
    if (!client) return;
    let active = true;
    const refresh = () =>
      client.player.tournamentCompetition
        .query({ sessionId })
        .then((next) => {
          if (!active) return;
          setSnapshot(next);
          setDivisionId((current) => current ?? next.divisions[0]?.id);
          setError(false);
        })
        .catch(() => {
          if (active) setError(true);
        });
    void refresh();
    const interval = setInterval(() => void refresh(), 30_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [client, sessionId]);

  const division =
    snapshot?.divisions.find((candidate) => candidate.id === divisionId) ??
    snapshot?.divisions[0];
  const competitionRounds = useMemo(
    () =>
      division?.format.startsWith("kob-")
        ? division.rounds
        : (division?.rounds.filter((round) => round.bracket !== "pool") ?? []),
    [division],
  );
  const activeRound =
    competitionRounds.find((round) => round.key === roundKey) ??
    competitionRounds[0];

  if (!client || (!snapshot && !error)) return null;
  if (error || !snapshot || !division) {
    return (
      <View style={styles.unavailable}>
        <Text style={styles.unavailableTitle}>
          Tournament updates reconnecting
        </Text>
        <Text style={styles.unavailableBody}>
          Pull down or reopen this event when you have signal. Your event
          details stay in the app.
        </Text>
      </View>
    );
  }
  if (!snapshot.divisions.length) return null;

  return (
    <View style={styles.root}>
      <View style={styles.titleRow}>
        <View>
          <Text style={styles.eyebrow}>TOURNAMENT DESK</Text>
          <Text style={styles.title}>Your day on the sand</Text>
        </View>
        <View style={styles.liveChip}>
          <Text style={styles.liveChipText}>
            {division.liveAt ? "LIVE" : `DRAW V${division.competitionVersion}`}
          </Text>
        </View>
      </View>

      {snapshot.myNextMatch && (
        <View style={styles.nextCard}>
          <Text style={styles.nextEyebrow}>YOUR NEXT MATCH</Text>
          <Text style={styles.nextTitle}>
            {snapshot.myNextMatch.heat
              ? snapshot.myNextMatch.label
              : `${snapshot.myNextMatch.teamA?.name ?? "Your team"} vs ${snapshot.myNextMatch.teamB?.name ?? "Opponent pending"}`}
          </Text>
          <Text style={styles.nextMeta}>
            {snapshot.myNextMatch.courtName ?? "Court assignment coming"} ·{" "}
            {matchScore(snapshot.myNextMatch)}
          </Text>
        </View>
      )}

      {snapshot.divisions.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabs}
        >
          {snapshot.divisions.map((candidate) => (
            <Pressable
              key={candidate.id}
              onPress={() => {
                setDivisionId(candidate.id);
                setRoundKey(
                  candidate.format.startsWith("kob-")
                    ? candidate.rounds[0]?.key
                    : candidate.rounds.find((round) => round.bracket !== "pool")
                        ?.key,
                );
              }}
              style={[
                styles.tab,
                candidate.id === division.id && styles.tabActive,
              ]}
            >
              <Text
                style={
                  candidate.id === division.id
                    ? styles.tabTextActive
                    : styles.tabText
                }
              >
                {candidate.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {division.kobStandings?.length ? (
        <View style={styles.kobBoard}>
          <View style={styles.poolHeader}>
            <View>
              <Text style={styles.poolTitle}>INDIVIDUAL POINTS</Text>
              <Text style={styles.poolNote}>
                {division.kobStandings.at(-1)!.name} · points stay with the
                athlete across partner rotations
              </Text>
            </View>
            <Text style={styles.poolProgress}>
              {division.kobStandings.at(-1)!.complete ? "FINAL" : "LIVE"}
            </Text>
          </View>
          {division.kobStandings.at(-1)!.players.map((player) => (
            <View key={player.personId} style={styles.standing}>
              <DunaNumericText tier="table" style={styles.rank}>
                {player.rank}
              </DunaNumericText>
              <Text numberOfLines={1} style={styles.standingName}>
                {player.name}
              </Text>
              <Text style={styles.kobRecord}>{player.wins} wins</Text>
              <DunaNumericText tier="block" style={styles.kobPoints}>
                {player.points}
              </DunaNumericText>
            </View>
          ))}
        </View>
      ) : null}

      {division.pools.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pools}
        >
          {division.pools.map((pool) => (
            <View key={pool.key} style={styles.pool}>
              <View style={styles.poolHeader}>
                <Text style={styles.poolTitle}>POOL {pool.key}</Text>
                <Text style={styles.poolProgress}>
                  {pool.completedMatches}/{pool.matchCount}
                </Text>
              </View>
              {pool.standings.map((standing, index) => (
                <View key={standing.team.id} style={styles.standing}>
                  <Text style={styles.rank}>{index + 1}</Text>
                  <Text numberOfLines={1} style={styles.standingName}>
                    {standing.team.name}
                  </Text>
                  <Text style={styles.record}>
                    {standing.wins}–{standing.losses}
                  </Text>
                </View>
              ))}
              <Text style={styles.poolNote}>
                Live table · director confirms ties
              </Text>
            </View>
          ))}
        </ScrollView>
      )}

      {competitionRounds.length > 0 && activeRound && (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabs}
          >
            {competitionRounds.map((round) => (
              <Pressable
                key={round.key}
                onPress={() => setRoundKey(round.key)}
                style={[
                  styles.tab,
                  round.key === activeRound.key && styles.tabActive,
                ]}
              >
                <Text
                  style={
                    round.key === activeRound.key
                      ? styles.tabTextActive
                      : styles.tabText
                  }
                >
                  {roundLabel(round)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.bracket}>
            {activeRound.matches.map((match) => (
              <LocalMatchCard key={match.id} match={match} />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14, marginTop: 20 },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  eyebrow: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  title: { color: "#172B4D", fontSize: 22, fontWeight: "800", marginTop: 3 },
  liveChip: {
    backgroundColor: "#E8F8F2",
    borderColor: "#69C49E",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  liveChipText: {
    color: "#166B4A",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
  },
  nextCard: { backgroundColor: "#122B4D", borderRadius: 18, padding: 16 },
  nextEyebrow: {
    color: "#7FE4C1",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
  },
  nextTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 22,
    marginTop: 7,
  },
  nextMeta: { color: "#C4D3E5", fontSize: 13, marginTop: 5 },
  tabs: { flexGrow: 0 },
  tab: {
    backgroundColor: "#F3F6F9",
    borderColor: "#DDE4EC",
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
    minHeight: 48,
    paddingHorizontal: 15,
    justifyContent: "center",
  },
  tabActive: { backgroundColor: "#172B4D", borderColor: "#172B4D" },
  tabText: { color: "#56647A", fontSize: 13, fontWeight: "700" },
  tabTextActive: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  pools: { flexGrow: 0 },
  pool: {
    backgroundColor: "#F7F9FB",
    borderColor: "#DDE4EC",
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 10,
    padding: 13,
    width: 260,
  },
  kobBoard: {
    backgroundColor: "#F7F9FB",
    borderColor: "#DDE4EC",
    borderRadius: 18,
    borderWidth: 1,
    gap: 3,
    padding: 14,
  },
  poolHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 7,
  },
  poolTitle: {
    color: "#172B4D",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  poolProgress: {
    color: "#667085",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  standing: {
    alignItems: "center",
    borderTopColor: "#DDE4EC",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 35,
  },
  rank: {
    color: "#667085",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    width: 13,
  },
  standingName: { color: "#253858", flex: 1, fontSize: 13, fontWeight: "700" },
  record: {
    color: "#667085",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  kobRecord: { color: "#667085", fontSize: 12 },
  kobPoints: {
    color: "#172B4D",
    fontSize: 22,
    minWidth: 42,
    textAlign: "right",
  },
  poolNote: { color: "#667085", fontSize: 12, lineHeight: 15, marginTop: 8 },
  bracket: { gap: 10 },
  match: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DDE4EC",
    borderRadius: 15,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  matchComplete: { borderColor: "#69C49E" },
  matchLive: {
    borderColor: "#26B58A",
    shadowColor: "#26B58A",
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  matchHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  matchStatus: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  matchStatusLive: { color: "#168B66" },
  matchScore: {
    color: "#667085",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  teamRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 23,
  },
  seed: {
    backgroundColor: "#EEF2F6",
    borderRadius: 10,
    color: "#667085",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  teamName: { color: "#253858", flex: 1, fontSize: 14, fontWeight: "700" },
  winnerName: { color: "#168B66" },
  heatPoints: { color: "#172B4D", fontSize: 23, textAlign: "right" },
  awaitingQualifiers: { color: "#667085", fontSize: 14, lineHeight: 20 },
  unavailable: {
    backgroundColor: "#F7F9FB",
    borderColor: "#DDE4EC",
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 20,
    padding: 16,
  },
  unavailableTitle: { color: "#253858", fontSize: 15, fontWeight: "800" },
  unavailableBody: {
    color: "#667085",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
});
