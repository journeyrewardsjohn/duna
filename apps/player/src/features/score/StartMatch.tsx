/**
 * Start a match (M-P4a): one short sheet. Format, who (you and your side
 * against the other side), where, competitive or friendly, then Start. It
 * opens on the last line-up, so a pickup game starts in two taps (New →
 * Score a match → Start scoring); names and the agreement can come later,
 * before the match is saved to Duna.
 */
import { ScrollView, StyleSheet, View } from "react-native";
import { Text, Title, useTheme } from "@duna/ui/native";
import { useEffect, useState } from "react";
import { usePlayerRuntime } from "../../../runtime";
import { usePaneEdges } from "../../app/ui";
import { ActionButton } from "../find/parts";
import {
  describeFormat,
  liveFormat,
  movesSandRating,
  SCORING_SYSTEMS,
  TEAM_SIZES,
  type MatchType,
  type TeamSize,
} from "./formats";
import { LineupEditor } from "./Lineup";
import { loadLineup, newId, saveLineup } from "./live-store";
import { CheckRow, Notice, Segmented, useReadableInset } from "./parts";
import { AGREEMENT_LABEL, whatThisResultWouldDo } from "./result-rules";
import {
  createLiveMatch,
  type LiveMatch,
  type LivePerson,
  type LiveSide,
  type TeamSide,
} from "./scoring-machine";
import { WhereField, type ChosenPlace } from "./WhereField";

/** The teams trimmed to a size, keeping you in your side's first place. Pure. */
export function fitTeams(
  teams: Readonly<Record<TeamSide, LiveSide>>,
  size: number,
  me?: LivePerson,
): Readonly<Record<TeamSide, LiveSide>> {
  const mine = teams.A.people.filter(
    (person) => !me?.personId || person.personId !== me.personId,
  );
  return {
    A: { people: [...(me ? [me] : []), ...mine].slice(0, size) },
    B: { people: teams.B.people.slice(0, size) },
  };
}

export function useMe(): LivePerson | undefined {
  const runtime = usePlayerRuntime();
  const player = runtime.dashboard?.player;
  return player ? { personId: player.id, name: player.displayName } : undefined;
}

export function StartMatch({
  onStart,
  onClose,
}: {
  readonly onStart: (match: LiveMatch) => void;
  readonly onClose: () => void;
}) {
  const { tokens, colors } = useTheme();
  const edges = usePaneEdges();
  const inset = useReadableInset();
  const me = useMe();
  const [teamSize, setTeamSize] = useState<TeamSize>(2);
  const [matchType, setMatchType] = useState<MatchType>("competitive");
  const [scoringSystem, setScoringSystem] =
    useState<LiveMatch["format"]["scoringSystem"]>("rally");
  const [firstServe, setFirstServe] = useState<TeamSide>("A");
  const [teams, setTeams] = useState<Readonly<Record<TeamSide, LiveSide>>>(() =>
    fitTeams({ A: { people: [] }, B: { people: [] } }, 2, me),
  );
  const [where, setWhere] = useState<ChosenPlace | null>(null);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    void loadLineup().then((lineup) => {
      if (!lineup) return;
      setTeamSize(lineup.teamSize);
      setMatchType(lineup.matchType);
      setScoringSystem(lineup.scoringSystem);
      setTeams(fitTeams(lineup.teams, lineup.teamSize, me));
      if (lineup.venue)
        setWhere({ venueId: lineup.venue.id, label: lineup.venue.label });
    });
    // Only on open.
  }, []);

  const format = liveFormat({ teamSize, scoringSystem, matchType });
  const named =
    teams.A.people.length === teamSize && teams.B.people.length === teamSize;

  const start = () => {
    const venue = where?.venueId
      ? { id: where.venueId, label: where.label }
      : undefined;
    saveLineup({ teamSize, matchType, scoringSystem, teams, venue });
    onStart(
      createLiveMatch({
        id: newId(),
        startEventId: newId(),
        now: new Date().toISOString(),
        teamSize,
        matchType,
        scoringSystem,
        teams,
        initialServer: firstServe,
        ...(venue ? { venue } : {}),
        agreed,
      }),
    );
  };

  return (
    <View style={[styles.fill, { backgroundColor: colors.ground }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: edges.top + tokens.space["4"],
          paddingBottom: tokens.space["6"],
          paddingLeft: edges.left + inset,
          paddingRight: edges.right + inset,
          gap: tokens.space["5"],
        }}
        keyboardShouldPersistTaps="handled"
        testID="start-match"
      >
        <View style={styles.head}>
          <Title size={28}>Score a match</Title>
          <ActionButton kind="quiet" label="Cancel" onPress={onClose} />
        </View>
        <Segmented
          label="Format"
          onChange={(size) => {
            setTeamSize(size);
            setTeams((current) => fitTeams(current, size, me));
          }}
          options={TEAM_SIZES}
          value={teamSize}
        />
        <LineupEditor
          me={me}
          onChange={setTeams}
          teamSize={teamSize}
          teams={teams}
        />
        <WhereField onChange={setWhere} value={where} venuesOnly />
        <Segmented
          label="Kind of match"
          onChange={setMatchType}
          options={[
            { value: "competitive", label: "Competitive" },
            { value: "friendly", label: "Friendly" },
          ]}
          value={matchType}
        />
        <Text tone="text-2" variant="phone-meta">
          {movesSandRating({ teamSize, matchType })
            ? "Counts toward Sand Rating once someone on the other side confirms."
            : whatThisResultWouldDo({ teamSize, matchType })}
        </Text>
        <Segmented
          label="Scoring"
          onChange={setScoringSystem}
          options={SCORING_SYSTEMS}
          value={scoringSystem}
        />
        <Segmented
          label="First serve"
          onChange={setFirstServe}
          options={[
            { value: "A", label: "Your side" },
            { value: "B", label: "The other side" },
          ]}
          value={firstServe}
        />
        <Text tone="text-2" variant="phone-meta">
          {describeFormat(format)}
        </Text>
        <CheckRow
          checked={agreed}
          label={AGREEMENT_LABEL}
          onChange={setAgreed}
          testID="start-agreed"
        />
        {!named || !agreed ? (
          <Notice tone="info" title="Name everyone later if you like">
            The score is kept on this phone from the first point. It reaches
            Duna once every place has a player and everyone agreed.
          </Notice>
        ) : null}
        <ActionButton
          label="Start scoring"
          onPress={start}
          testID="start-scoring"
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
});
