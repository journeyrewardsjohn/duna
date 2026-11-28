/**
 * What "Add a result" can open with (M-P4a): a score from the Watch, or a
 * live match stopped before it reached Duna. Pure.
 */
import type { WatchScoreDraft } from "../../../watch-scoring";
import type { MatchType, TeamSize } from "./formats";
import {
  playedSets,
  type LiveMatch,
  type LiveSide,
  type TeamSide,
} from "./scoring-machine";

export interface ScoreDraft {
  readonly id: string;
  readonly source: "watch" | "live";
  readonly playedAt?: string;
  /** Side A first. */
  readonly sets: readonly { readonly a: number; readonly b: number }[];
  readonly teamSize?: TeamSize;
  readonly matchType?: MatchType;
  readonly teams?: Readonly<Record<TeamSide, LiveSide>>;
  readonly venue?: { readonly id: string; readonly label: string };
  readonly agreed?: boolean;
}

export function draftFromWatch(draft: WatchScoreDraft): ScoreDraft {
  return {
    id: draft.draftId,
    source: "watch",
    playedAt: draft.capturedAt,
    sets: draft.sets
      .filter((set) => set.a + set.b > 0)
      .map((set) => ({ a: set.a, b: set.b })),
  };
}

export function draftFromLive(match: LiveMatch): ScoreDraft {
  return {
    id: match.id,
    source: "live",
    playedAt: match.createdAt,
    sets: playedSets(match),
    teamSize: match.teamSize,
    matchType: match.matchType,
    teams: match.teams,
    ...(match.venue ? { venue: match.venue } : {}),
    agreed: match.agreed,
  };
}
