/**
 * The formats a player can score (M-P4a). Live matches are folded with the
 * server's own rules (`standardBeachFormat` from `@duna/league-engine`, the
 * format `player.startMatch` stores): best of three, sets to 21, 21 and 15,
 * won by two, side switches every 7, 7 and 5 points, one timeout a side per
 * set and a technical timeout at 21 points. Only the team size, the scoring
 * system and the match type are the person's to choose today; other set
 * lengths and caps need the API to accept a format (listed in the PR).
 */
import {
  standardBeachFormat,
  type MatchFormat,
  type ScoringSystem,
} from "@duna/league-engine/scoring";

export type TeamSize = 2 | 3 | 4 | 6;
export type MatchType = "competitive" | "friendly";

/** The four sizes `recordCompletedMatch` accepts, in the web flow's words. */
export const TEAM_SIZES: readonly { value: TeamSize; label: string }[] = [
  { value: 2, label: "2 v 2" },
  { value: 3, label: "3 v 3" },
  { value: 4, label: "4 v 4" },
  { value: 6, label: "6 v 6" },
];

export const SCORING_SYSTEMS: readonly {
  value: ScoringSystem;
  label: string;
  summary: string;
}[] = [
  {
    value: "rally",
    label: "Rally",
    summary: "Every rally scores a point",
  },
  {
    value: "sideout",
    label: "Side-out",
    summary: "Only the serving side scores",
  },
];

/** The format a live match is folded with: exactly what the server stores. */
export function liveFormat(input: {
  readonly teamSize: TeamSize;
  readonly scoringSystem: ScoringSystem;
  readonly matchType: MatchType;
}): MatchFormat {
  return {
    ...standardBeachFormat,
    scoringSystem: input.scoringSystem,
    teamSize: input.teamSize,
    matchType: input.matchType,
    recordingMode: "live",
  };
}

const WORDS = ["one", "two", "three", "four", "five"] as const;

/** "Best of three: 21, 21, 15 · win by two". Pure. */
export function describeFormat(format: MatchFormat): string {
  const targets = format.pointTargets.slice(0, format.maximumSets).join(", ");
  const sets =
    format.maximumSets === 1
      ? "One set"
      : `Best of ${WORDS[format.maximumSets - 1] ?? format.maximumSets}`;
  const winBy = format.winBy === 2 ? "win by two" : "first to the target";
  const caps = format.hardCaps.some((cap) => cap !== null)
    ? ` · capped at ${format.hardCaps.filter((cap) => cap !== null).join(", ")}`
    : "";
  return `${sets}: ${targets} · ${winBy}${caps}`;
}

/** Only competitive two-on-two matches move a Sand Rating (rating engine). */
export function movesSandRating(input: {
  readonly teamSize: number;
  readonly matchType: MatchType;
}): boolean {
  return input.matchType === "competitive" && input.teamSize === 2;
}
