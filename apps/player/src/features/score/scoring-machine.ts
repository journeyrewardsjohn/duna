/**
 * The scorekeeper's state machine (M-P4a). Pure: no React, no clock, no
 * random ids (the caller passes them), so it is unit-tested directly.
 *
 * The phone keeps the match as an append-only event log, exactly the events
 * `player.appendMatchEvents` accepts, and folds it with the server's own
 * `foldScore` (`@duna/league-engine`). So the score on the phone, the score
 * the server folds and the score the Watch shows can never disagree, and
 * undo is an `undo` event (it works across a set boundary because the fold
 * replays from the start).
 */
import {
  createUndoEvent,
  foldScore,
  type MatchFormat,
  type ScoreEvent,
  type ScoreState,
  type TeamSide,
} from "@duna/league-engine/scoring";
import {
  netScoreState,
  type NetScoreState,
  type SetRules,
} from "@duna/tideline-core";
import { liveFormat, type MatchType, type TeamSize } from "./formats";

export type { MatchFormat, ScoreEvent, ScoreState, TeamSide };

/** Someone on a side: a Duna player, or a person added by name. */
export interface LivePerson {
  /** A Duna profile id; absent for someone added by name. */
  readonly personId?: string;
  readonly name: string;
  /** Added by name: the first and last name the API needs. */
  readonly givenName?: string;
  readonly familyName?: string;
  readonly email?: string;
  readonly phoneE164?: string;
}

export interface LiveSide {
  readonly people: readonly LivePerson[];
}

export interface LiveMatch {
  /** The local session id (also the Watch session id). */
  readonly id: string;
  readonly createdAt: string;
  readonly teamSize: TeamSize;
  readonly matchType: MatchType;
  readonly format: MatchFormat;
  readonly teams: Readonly<Record<TeamSide, LiveSide>>;
  readonly initialServer: TeamSide;
  readonly venue?: { readonly id: string; readonly label: string };
  /** "Everyone on court agreed to record this match." */
  readonly agreed: boolean;
  readonly events: readonly ScoreEvent[];
  /** When the scorer ended the match (finished, or stopped early). */
  readonly endedAt?: string;
}

export interface LiveMatchSetup {
  readonly id: string;
  readonly startEventId: string;
  readonly now: string;
  readonly teamSize: TeamSize;
  readonly matchType: MatchType;
  readonly scoringSystem: MatchFormat["scoringSystem"];
  readonly teams: Readonly<Record<TeamSide, LiveSide>>;
  readonly initialServer?: TeamSide;
  readonly venue?: LiveMatch["venue"];
  readonly agreed: boolean;
}

export function createLiveMatch(setup: LiveMatchSetup): LiveMatch {
  const initialServer = setup.initialServer ?? "A";
  return {
    id: setup.id,
    createdAt: setup.now,
    teamSize: setup.teamSize,
    matchType: setup.matchType,
    format: liveFormat(setup),
    teams: setup.teams,
    initialServer,
    ...(setup.venue ? { venue: setup.venue } : {}),
    agreed: setup.agreed,
    events: [
      {
        id: setup.startEventId,
        type: "match-started",
        initialServer,
        occurredAt: setup.now,
      },
    ],
  };
}

export function foldMatch(match: LiveMatch): ScoreState {
  return foldScore(match.events, match.format);
}

function append(match: LiveMatch, event: ScoreEvent): LiveMatch {
  if (match.events.some((existing) => existing.id === event.id)) return match;
  return { ...match, events: [...match.events, event] };
}

/** A point to a side. Nothing happens once the match is decided or ended. */
export function scorePoint(
  match: LiveMatch,
  side: TeamSide,
  id: string,
  now: string,
): LiveMatch {
  if (match.endedAt) return match;
  if (foldMatch(match).status !== "live") return match;
  return append(match, {
    id,
    type: "rally-won",
    winner: side,
    occurredAt: now,
  });
}

/** Undo the last point, timeout or forfeit (one tap, always available). */
export function undoLast(match: LiveMatch, id: string, now: string): LiveMatch {
  if (match.endedAt) return match;
  const undo = createUndoEvent(match.events, { id, occurredAt: now });
  return undo ? append(match, undo) : match;
}

export function canUndo(match: LiveMatch): boolean {
  return (
    !match.endedAt &&
    createUndoEvent(match.events, { id: "probe", occurredAt: "" }) !== undefined
  );
}

/** A timeout for a side, when it has one left in this set. */
export function callTimeout(
  match: LiveMatch,
  side: TeamSide,
  id: string,
  now: string,
): LiveMatch {
  const score = foldMatch(match);
  if (match.endedAt || score.status !== "live") return match;
  if (score.timeouts[side] >= match.format.timeoutsPerTeamPerSet) return match;
  return append(match, { id, type: "timeout", team: side, occurredAt: now });
}

/** The technical timeout at 21 points is done; play resumes. */
export function completeTechnicalTimeout(
  match: LiveMatch,
  id: string,
  now: string,
): LiveMatch {
  const score = foldMatch(match);
  if (!score.technicalTimeoutDue) return match;
  return append(match, {
    id,
    type: "technical-timeout-completed",
    setIndex: score.setIndex,
    occurredAt: now,
  });
}

/** An event from the Watch or another source, deduplicated by id. */
export function applyExternalEvent(
  match: LiveMatch,
  event: ScoreEvent,
): LiveMatch {
  if (match.endedAt || event.type === "match-started") return match;
  if (event.type === "rally-won" && foldMatch(match).status !== "live")
    return match;
  return append(match, event);
}

export function endMatch(match: LiveMatch, now: string): LiveMatch {
  return match.endedAt ? match : { ...match, endedAt: now };
}

/** The NetScore rules for a format (set point and match point). */
export function setRulesFor(format: MatchFormat): SetRules {
  const cap = format.hardCaps[0];
  return {
    pointsToWin: format.pointTargets[0] ?? 21,
    decidingSetPointsToWin:
      format.pointTargets[format.maximumSets - 1] ??
      format.pointTargets[0] ??
      21,
    winBy: format.winBy,
    ...(cap !== null && cap !== undefined ? { cap } : {}),
  };
}

const toSide = (side: TeamSide) => (side === "A" ? "home" : "away");
const fromSide = (side: "home" | "away"): TeamSide =>
  side === "home" ? "A" : "B";

/** "Williams / Lewis", from first names (the server names teams the same way). */
export function sideLabel(side: LiveSide, fallback: string): string {
  const names = side.people
    .map((person) => person.name.trim().split(/\s+/)[0] ?? "")
    .filter(Boolean);
  return names.length > 0 ? names.join(" / ") : fallback;
}

export interface PointLogEntry {
  readonly id: string;
  readonly winner: TeamSide;
  readonly setNumber: number;
  readonly a: number;
  readonly b: number;
  readonly server: TeamSide;
}

export interface LiveView {
  readonly score: ScoreState;
  readonly net: NetScoreState;
  readonly names: { readonly home: string; readonly away: string };
  readonly setNumber: number;
  /** Points the current set is played to. */
  readonly target: number;
  readonly points: Readonly<Record<TeamSide, number>>;
  readonly serving: TeamSide;
  readonly sideSwitchDue: boolean;
  /** The total points at which sides switch next; null when not switching. */
  readonly nextSwitchAt: number | null;
  readonly technicalTimeoutDue: boolean;
  readonly timeoutsLeft: Readonly<Record<TeamSide, number>>;
  readonly setPoint: readonly TeamSide[];
  readonly matchPoint: readonly TeamSide[];
  readonly decided: boolean;
  readonly winner?: TeamSide;
  readonly canUndo: boolean;
  /** Newest first. */
  readonly log: readonly PointLogEntry[];
}

/** Everything the scoreboard draws, folded once. Pure. */
export function liveView(match: LiveMatch, logLimit = 40): LiveView {
  const score = foldMatch(match);
  const names = {
    home: sideLabel(match.teams.A, "Side A"),
    away: sideLabel(match.teams.B, "Side B"),
  };
  const decided = score.status === "complete" || score.status === "forfeit";
  const current = score.sets[score.setIndex] ?? { a: 0, b: 0 };
  // A decided match shows only the sets that were played.
  const sets = score.sets.filter(
    (set, index) => index <= score.setIndex && (set.a + set.b > 0 || !decided),
  );
  const net = netScoreState({
    status: decided ? "pending-verification" : "live",
    sets: sets.map((set) => ({
      home: set.a,
      away: set.b,
      finished: set.winner !== undefined,
    })),
    bestOf: match.format.maximumSets,
    rules: setRulesFor(match.format),
    serving: decided ? null : toSide(score.serving),
    ...(score.winner ? { winner: toSide(score.winner) } : {}),
    names,
  });
  const interval = match.format.sideSwitchIntervals[score.setIndex] ?? 0;
  const total = current.a + current.b;
  const nextSwitchAt =
    interval > 0 && !decided
      ? (Math.floor(total / interval) + 1) * interval
      : null;
  return {
    score,
    net,
    names,
    setNumber: score.setIndex + 1,
    target: match.format.pointTargets[score.setIndex] ?? 21,
    points: { A: current.a, B: current.b },
    serving: score.serving,
    sideSwitchDue: score.sideSwitchDue,
    nextSwitchAt,
    technicalTimeoutDue: score.technicalTimeoutDue,
    timeoutsLeft: {
      A: Math.max(0, match.format.timeoutsPerTeamPerSet - score.timeouts.A),
      B: Math.max(0, match.format.timeoutsPerTeamPerSet - score.timeouts.B),
    },
    setPoint: net.setPoint.map(fromSide),
    matchPoint: net.matchPoint.map(fromSide),
    decided,
    ...(score.winner ? { winner: score.winner } : {}),
    canUndo: canUndo(match),
    log: pointLog(match, logLimit),
  };
}

/** The last points, newest first, with the score after each. Pure. */
export function pointLog(match: LiveMatch, limit = 40): PointLogEntry[] {
  const undone = new Set(
    match.events.flatMap((event) =>
      event.type === "undo" ? [event.targetEventId] : [],
    ),
  );
  const applied = match.events.filter(
    (event) => event.type !== "undo" && !undone.has(event.id),
  );
  const entries: PointLogEntry[] = [];
  for (let index = 0; index < applied.length; index += 1) {
    const event = applied[index]!;
    if (event.type !== "rally-won") continue;
    const before = foldScore(applied.slice(0, index), match.format);
    const after = foldScore(applied.slice(0, index + 1), match.format);
    // The point belongs to the set it was played in (the fold may already
    // have opened the next one).
    const set = after.sets[before.setIndex] ?? { a: 0, b: 0 };
    entries.push({
      id: event.id,
      winner: event.winner,
      setNumber: before.setIndex + 1,
      a: set.a,
      b: set.b,
      server: before.serving,
    });
  }
  return entries.reverse().slice(0, limit);
}

/** The set scores a decided or stopped match records. Pure. */
export function playedSets(
  match: LiveMatch,
): readonly { readonly a: number; readonly b: number }[] {
  const score = foldMatch(match);
  return score.sets.filter((set) => set.a + set.b > 0);
}

/** Who is still unnamed: the API needs a person for every place. */
export function missingPlaces(match: LiveMatch): number {
  return (["A", "B"] as const).reduce(
    (sum, side) =>
      sum + Math.max(0, match.teamSize - match.teams[side].people.length),
    0,
  );
}

/** Ready to save to Duna: every place named and everyone agreed. */
export function readyToSave(match: LiveMatch): boolean {
  return missingPlaces(match) === 0 && match.agreed;
}

const PEOPLE_FIELDS = ["name"] as const;

/** Reads a stored match back; anything malformed is dropped. Pure. */
export function parseLiveMatch(value: unknown): LiveMatch | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<LiveMatch>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.createdAt !== "string" ||
    !Array.isArray(candidate.events) ||
    !candidate.format ||
    !candidate.teams?.A ||
    !candidate.teams?.B ||
    ![2, 3, 4, 6].includes(candidate.teamSize as number)
  ) {
    return null;
  }
  for (const side of ["A", "B"] as const) {
    const people = candidate.teams[side].people;
    if (
      !Array.isArray(people) ||
      people.some((person) =>
        PEOPLE_FIELDS.some((field) => typeof person?.[field] !== "string"),
      )
    )
      return null;
  }
  try {
    foldScore(candidate.events as ScoreEvent[], candidate.format);
  } catch {
    return null;
  }
  return candidate as LiveMatch;
}
