/**
 * NetScore's view model: props in, everything the markup draws out. Pure, no
 * React, so it is tested directly. The score rules themselves live in
 * `@duna/tideline-core` (`netScoreState`, `netScoreSentence`); this file only
 * decides how each state LOOKS.
 */
import {
  NET_SCORE_STATUS_TEXT,
  netScoreSentence,
  netScoreState,
  parseNetScoreStatus,
  type NetScoreState,
  type NetScoreStatus,
  type SetInput,
  type SetRules,
  type Side,
} from "@duna/tideline-core";

/** A team: a name ("Williams / Lewis") or the players ("Noa Williams", "Mara Lewis"). */
export type NetScoreTeam =
  string | { readonly name?: string; readonly players?: ReadonlyArray<string> };

/** A set as `{ home, away }` or the board's `[home, away]` pair. */
export type NetScoreSet = SetInput | readonly [number, number];

export type NetScoreSide = Side | 0 | 1;

export interface NetScoreModelInput {
  /** Home (left) then away (right). */
  teams: readonly [NetScoreTeam, NetScoreTeam];
  /** The `match_status` value, hyphens or underscores. */
  status: NetScoreStatus | string;
  sets?: ReadonlyArray<NetScoreSet>;
  /** 1, 3 or 5. Helps name the deciding set and match point. */
  bestOf?: number;
  rules?: SetRules;
  /** Overrides the computed winner (a forfeit with nothing played needs it). */
  winner?: NetScoreSide;
  /** The side that forfeited, when `winner` is not given. */
  forfeitedBy?: NetScoreSide;
  /** A title match: `true` or its name ("King of the Beach final"). Trophy instead of a check. */
  title?: boolean | string;
  serving?: NetScoreSide | null;
  /** Start, already formatted ("Sat, Nov 28 · 9:00 AM"). */
  start?: string;
  court?: string;
  /** Why it was cancelled, forfeited or stopped. */
  reason?: string;
}

/** How a state looks. One entry per status; a test fails if a status has none. */
export interface NetScoreLook {
  /** Chip tone. Only `live` is Solar. */
  tone: "neutral" | "positive" | "warning" | "danger" | "live" | "info";
  /** Draw set numbers. */
  numbers: boolean;
  /** Mute every number (disputed, cancelled): no side reads as the winner. */
  muted: boolean;
  /** The meta line under the score. */
  meta: "start" | "reason" | "none";
}

export const NET_SCORE_LOOK: Readonly<Record<NetScoreStatus, NetScoreLook>> = {
  scheduled: { tone: "neutral", numbers: false, muted: false, meta: "start" },
  warmup: { tone: "info", numbers: false, muted: false, meta: "start" },
  live: { tone: "live", numbers: true, muted: false, meta: "none" },
  "pending-verification": {
    tone: "warning",
    numbers: true,
    muted: false,
    meta: "none",
  },
  verified: { tone: "positive", numbers: true, muted: false, meta: "none" },
  disputed: { tone: "danger", numbers: true, muted: true, meta: "reason" },
  complete: { tone: "neutral", numbers: true, muted: false, meta: "none" },
  forfeit: { tone: "neutral", numbers: true, muted: false, meta: "reason" },
  cancelled: { tone: "neutral", numbers: false, muted: true, meta: "reason" },
  "not-finished": {
    tone: "warning",
    numbers: true,
    muted: false,
    meta: "reason",
  },
};

export function teamName(team: NetScoreTeam): string {
  if (typeof team === "string") return team;
  if (team.players && team.players.length > 0) return team.players.join(" / ");
  return team.name ?? "";
}

function toSide(value: NetScoreSide | null | undefined): Side | undefined {
  if (value === 0 || value === "home") return "home";
  if (value === 1 || value === "away") return "away";
  return undefined;
}

function toSet(set: NetScoreSet): SetInput {
  if (Array.isArray(set)) return { home: set[0], away: set[1] };
  return set as SetInput;
}

export interface NetScoreModel {
  status: NetScoreStatus;
  state: NetScoreState;
  look: NetScoreLook;
  names: { home: string; away: string };
  /** The one sentence a screen reader hears. */
  sentence: string;
  /** Chip words: "Verified", "Live · Set 3". */
  statusText: string;
  /** The deciding set number (the last of `bestOf`), when it was reached. */
  decidingSet: number | null;
  meta: string | null;
  /** The big pair: sets won, or the live set's points, or a single set's points. */
  big: { label: string; home: number; away: number } | null;
}

/**
 * Builds the view model. An unknown status throws: a score card never
 * guesses what a match is doing.
 */
export function netScoreModel(input: NetScoreModelInput): NetScoreModel {
  const status = parseNetScoreStatus(input.status);
  if (status === null) {
    throw new Error(`NetScore: unknown match status "${input.status}"`);
  }
  const names = {
    home: teamName(input.teams[0]),
    away: teamName(input.teams[1]),
  };
  const state = netScoreState({
    status,
    sets: (input.sets ?? []).map(toSet),
    bestOf: input.bestOf,
    rules: input.rules,
    serving: toSide(input.serving) ?? null,
    isTitle: Boolean(input.title),
    winner: toSide(input.winner),
    forfeitedBy: toSide(input.forfeitedBy),
    names,
  });
  const look = NET_SCORE_LOOK[status];
  const sentence = netScoreSentence(state, {
    names,
    start: input.start,
    court: input.court,
    reason: input.reason,
    title: input.title,
  });

  const liveSet = state.liveLabel?.setNumber ?? null;
  const statusText =
    status === "live" && liveSet !== null
      ? `${NET_SCORE_STATUS_TEXT.live} · Set ${liveSet}`
      : NET_SCORE_STATUS_TEXT[status];

  const startBits = [input.start, input.court].filter(Boolean).join(" · ");
  let meta: string | null = null;
  if (look.meta === "start") meta = startBits || null;
  if (look.meta === "reason") meta = input.reason ?? null;
  if (status === "disputed" && !input.reason)
    meta = "Waiting for the club to settle the result";

  const decidingSet =
    input.bestOf !== undefined &&
    input.bestOf > 1 &&
    state.rows.length >= input.bestOf
      ? input.bestOf
      : null;

  let big: NetScoreModel["big"] = null;
  if (look.numbers && state.headline.kind !== "none") {
    big = {
      label:
        state.headline.kind === "sets"
          ? "Sets"
          : status === "live" && liveSet !== null
            ? `Set ${liveSet}`
            : "Points",
      home: state.headline.home,
      away: state.headline.away,
    };
  }

  return {
    status,
    state,
    look,
    names,
    sentence,
    statusText,
    decidingSet,
    meta,
    big,
  };
}
