/**
 * What the app already knows about a match (M-P4a), so the result opens at
 * once after saving or from a list, then refreshes from the API.
 */
import type { MatchSummary } from "@duna/core";
import type { DunaApiClient } from "../../../mobile-api";

export type MatchScoring = Awaited<
  ReturnType<DunaApiClient["player"]["matchScoringState"]["query"]>
>;

const summaries = new Map<string, MatchSummary>();
const scorings = new Map<string, MatchScoring>();

export function rememberSummary(summary: MatchSummary): void {
  summaries.set(summary.id, summary);
}

export function rememberScoring(scoring: MatchScoring): void {
  scorings.set(scoring.matchId, scoring);
}

export function knownMatch(matchId: string): {
  readonly summary?: MatchSummary;
  readonly scoring?: MatchScoring;
} {
  return { summary: summaries.get(matchId), scoring: scorings.get(matchId) };
}
