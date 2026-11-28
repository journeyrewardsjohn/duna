/**
 * NetScore state: everything a renderer needs to draw a score card for any
 * `match_status`, so web and native agree on what a score means.
 *
 * Rules (contract R16 and the components table):
 * - Only FINISHED sets count as won. In a live match the last set is the one
 *   in progress: its points are the headline and sets won are shown small.
 * - A winner is known only in verified, complete and forfeit. In
 *   pending-verification it is provisional. In disputed, cancelled, scheduled,
 *   warmup, live and not-finished there is none.
 * - Missing data is "Pending", never 0-0: a match with nothing to show gets
 *   `headline.kind === "none"`.
 */

/** The values of the `match_status` database enum. */
export type MatchStatus =
  | "scheduled"
  | "warmup"
  | "live"
  | "pending-verification"
  | "verified"
  | "disputed"
  | "complete"
  | "forfeit"
  | "cancelled";

/**
 * PROPOSED, not in the `match_status` enum yet: a match stopped part-way
 * (rain, injury, curfew). Accepted here so renderers can be built ahead of
 * the schema change; remove this note when the enum gains the value.
 */
export type NotFinishedStatus = "not-finished";

export type NetScoreStatus = MatchStatus | NotFinishedStatus;

export type Side = "home" | "away";

export interface SetInput {
  readonly home: number;
  readonly away: number;
  /**
   * Whether the set is over. Defaults by status: the last set of a `live` or
   * `not-finished` match is unfinished, every other set is finished.
   */
  readonly finished?: boolean;
}

/**
 * How a set is won, so set point and match point can be known. Clubs vary;
 * pass the rules of the event.
 */
export interface SetRules {
  /** Points to win a set. */
  readonly pointsToWin: number;
  /** Points to win the deciding set (the last of `bestOf`); defaults to `pointsToWin`. */
  readonly decidingSetPointsToWin?: number;
  /** Lead needed to win a set; default 2. */
  readonly winBy?: number;
  /** A hard cap: the first side to reach it wins. Default none. */
  readonly cap?: number;
}

/** Beach volleyball: sets to 21, a decider to 15, win by two, no cap. */
export const BEACH_VOLLEYBALL_RULES: SetRules = {
  pointsToWin: 21,
  decidingSetPointsToWin: 15,
  winBy: 2,
};

export interface NetScoreInput {
  readonly status: NetScoreStatus;
  /** Sets in play order. May be empty. */
  readonly sets: ReadonlyArray<SetInput>;
  /** Sets the format is played over: 1 for a single set, otherwise 3 or 5. */
  readonly bestOf?: number;
  /** Set rules; needed for set point and match point. */
  readonly rules?: SetRules;
  /** Which side is serving; shown only while live. */
  readonly serving?: Side | null;
  /** A final (trophy badge instead of a check). */
  readonly isTitle?: boolean;
  /** Required to name a winner of a forfeit that has no sets. */
  readonly forfeitedBy?: Side;
  /** Server-declared winner; wins over the derived one when a winner is known. */
  readonly winner?: Side;
  /** Names for the accessible summary. */
  readonly names?: { readonly home: string; readonly away: string };
}

export type SetState = "finished" | "in-progress" | "unfinished";

export interface SetRow {
  /** 1-based. */
  readonly number: number;
  readonly home: number;
  readonly away: number;
  readonly state: SetState;
  /** The side whose number is drawn as the winning one; `null` if none. */
  readonly winningSide: Side | null;
}

export type Headline =
  | { readonly kind: "none" }
  /** Points of the set in progress, or the only set of a single-set match. */
  | { readonly kind: "points"; readonly home: number; readonly away: number }
  /** Sets won. */
  | { readonly kind: "sets"; readonly home: number; readonly away: number };

export type LiveLabelParts = {
  readonly kind: "live";
  /** 1-based; `null` for a single-set match. */
  readonly setNumber: number | null;
  /** `null` before the first point is recorded. */
  readonly points: { readonly home: number; readonly away: number } | null;
};

export interface NetScoreState {
  readonly status: NetScoreStatus;
  /** i18n key: `netScore.status.<status>`. */
  readonly statusLabelKey: string;
  readonly headline: Headline;
  /** Sets won, shown small beside a live headline; `null` when not shown. */
  readonly setsWon: { readonly home: number; readonly away: number } | null;
  readonly rows: ReadonlyArray<SetRow>;
  readonly winner: Side | null;
  /** True in pending-verification: the winner may still change. */
  readonly winnerProvisional: boolean;
  /** Badge beside the winner: check, or trophy for a title match. */
  readonly winnerBadge: "check" | "trophy" | null;
  readonly serving: Side | null;
  /** Sides that would win the set in progress with the next point (live only; needs `rules`). */
  readonly setPoint: ReadonlyArray<Side>;
  /** Sides that would win the MATCH with the next point (live only; needs `rules` and `bestOf`). */
  readonly matchPoint: ReadonlyArray<Side>;
  readonly liveLabel: LiveLabelParts | null;
  /** English, for screen readers; localise the parts if you need another language. */
  readonly accessibleSummary: string;
}

const WINNER_KNOWN: ReadonlySet<NetScoreStatus> = new Set([
  "verified",
  "complete",
  "forfeit",
]);

function leader(home: number, away: number): Side | null {
  if (home > away) return "home";
  if (away > home) return "away";
  return null;
}

function other(side: Side): Side {
  return side === "home" ? "away" : "home";
}

function buildRows(input: NetScoreInput): SetRow[] {
  const lastIsOpen = input.status === "live" || input.status === "not-finished";
  return input.sets.map((set, index) => {
    const isLast = index === input.sets.length - 1;
    const finished = set.finished ?? !(lastIsOpen && isLast);
    const state: SetState = finished
      ? "finished"
      : input.status === "live"
        ? "in-progress"
        : "unfinished";
    return {
      number: index + 1,
      home: set.home,
      away: set.away,
      state,
      winningSide: finished ? leader(set.home, set.away) : null,
    };
  });
}

export function netScoreState(input: NetScoreInput): NetScoreState {
  const { status } = input;
  const singleSet = input.bestOf === 1;
  // Scheduled, warmup and cancelled matches show no numbers even if rows exist.
  const showsNumbers = !(
    status === "scheduled" ||
    status === "warmup" ||
    status === "cancelled"
  );
  const rows = showsNumbers ? buildRows(input) : [];

  const setsWon = { home: 0, away: 0 };
  for (const row of rows) {
    if (row.winningSide) setsWon[row.winningSide] += 1;
  }

  const openRow = rows.find((row) => row.state === "in-progress");

  let headline: Headline = { kind: "none" };
  if (rows.length > 0) {
    if (status === "live" && openRow) {
      headline = { kind: "points", home: openRow.home, away: openRow.away };
    } else if (singleSet) {
      const only = rows[0] as SetRow;
      headline = { kind: "points", home: only.home, away: only.away };
    } else {
      headline = { kind: "sets", home: setsWon.home, away: setsWon.away };
    }
  }

  let winner: Side | null = null;
  if (WINNER_KNOWN.has(status) || status === "pending-verification") {
    if (input.winner) winner = input.winner;
    else if (status === "forfeit" && input.forfeitedBy) {
      winner = other(input.forfeitedBy);
    } else if (rows.length > 0) {
      winner = leader(setsWon.home, setsWon.away);
    }
  }
  const winnerProvisional =
    status === "pending-verification" && winner !== null;
  const winnerBadge =
    winner !== null && !winnerProvisional
      ? input.isTitle
        ? "trophy"
        : "check"
      : null;

  const serving = status === "live" ? (input.serving ?? null) : null;

  const liveLabel: LiveLabelParts | null =
    status === "live"
      ? {
          kind: "live",
          setNumber: singleSet
            ? null
            : (openRow?.number ?? (rows.length > 0 ? rows.length : 1)),
          points: openRow ? { home: openRow.home, away: openRow.away } : null,
        }
      : null;

  const { setPoint, matchPoint } = pointStatus(input, openRow, setsWon);

  const showSetsWon = status === "live" && !singleSet && rows.length > 0;

  return {
    status,
    statusLabelKey: `netScore.status.${status}`,
    headline,
    setsWon: showSetsWon ? setsWon : null,
    rows,
    winner,
    winnerProvisional,
    winnerBadge,
    serving,
    setPoint,
    matchPoint,
    liveLabel,
    accessibleSummary: summarise({
      input,
      rows,
      headline,
      setsWon,
      winner,
      winnerProvisional,
      serving,
    }),
  };
}

function pointStatus(
  input: NetScoreInput,
  openRow: SetRow | undefined,
  setsWon: { home: number; away: number },
): { setPoint: Side[]; matchPoint: Side[] } {
  const none = { setPoint: [], matchPoint: [] };
  if (input.status !== "live" || !openRow || !input.rules) return none;
  const { rules } = input;
  const decider =
    input.bestOf !== undefined &&
    input.bestOf > 1 &&
    openRow.number === input.bestOf;
  const target = decider
    ? (rules.decidingSetPointsToWin ?? rules.pointsToWin)
    : rules.pointsToWin;
  const winBy = rules.winBy ?? 2;
  const setsToWin =
    input.bestOf === undefined ? null : Math.ceil(input.bestOf / 2);
  const setPoint: Side[] = [];
  const matchPoint: Side[] = [];
  for (const side of ["home", "away"] as const) {
    const mine = openRow[side] + 1;
    const theirs = openRow[other(side)];
    const wins =
      (rules.cap !== undefined && mine >= rules.cap) ||
      (mine >= target && mine - theirs >= winBy);
    if (!wins) continue;
    setPoint.push(side);
    if (setsToWin !== null && setsWon[side] + 1 >= setsToWin)
      matchPoint.push(side);
  }
  return { setPoint, matchPoint };
}

export type ScoreEventPart =
  /** A side scored `points` (usually 1) in a set. */
  | {
      readonly kind: "point";
      readonly side: Side;
      readonly setNumber: number;
      readonly points: number;
    }
  | {
      readonly kind: "set-won";
      readonly side: Side;
      readonly setNumber: number;
    }
  | { readonly kind: "set-point"; readonly side: Side }
  | { readonly kind: "match-point"; readonly side: Side }
  | {
      readonly kind: "match-won";
      readonly side: Side;
      readonly provisional: boolean;
    }
  | { readonly kind: "serve-change"; readonly side: Side }
  /** A score went DOWN (an undo or a correction): announce it as a correction, not a point. */
  | { readonly kind: "correction" };

/**
 * What changed between two successive score states, as structured parts in
 * the order to announce them: points, sets won, match won, serve change,
 * then newly arisen set point and match point. An unchanged pair returns an
 * empty list. One event, three consumers: a Live Activity, a screen-reader
 * announcement and an animation can all key off the same parts.
 *
 * Match point implies set point; both are listed.
 */
export function scoreAnnouncement(
  prev: NetScoreState,
  next: NetScoreState,
): ScoreEventPart[] {
  const parts: ScoreEventPart[] = [];

  let corrected = false;
  for (const row of next.rows) {
    const before = prev.rows[row.number - 1];
    const dh = row.home - (before?.home ?? 0);
    const da = row.away - (before?.away ?? 0);
    if (dh < 0 || da < 0) corrected = true;
    if (dh > 0)
      parts.push({
        kind: "point",
        side: "home",
        setNumber: row.number,
        points: dh,
      });
    if (da > 0)
      parts.push({
        kind: "point",
        side: "away",
        setNumber: row.number,
        points: da,
      });
  }
  if (corrected) return [{ kind: "correction" }];

  for (const row of next.rows) {
    const before = prev.rows[row.number - 1];
    if (row.winningSide !== null && before?.winningSide !== row.winningSide) {
      parts.push({
        kind: "set-won",
        side: row.winningSide,
        setNumber: row.number,
      });
    }
  }

  if (
    next.winner !== null &&
    (prev.winner !== next.winner ||
      prev.winnerProvisional !== next.winnerProvisional)
  ) {
    parts.push({
      kind: "match-won",
      side: next.winner,
      provisional: next.winnerProvisional,
    });
  }

  if (next.serving !== null && next.serving !== prev.serving) {
    parts.push({ kind: "serve-change", side: next.serving });
  }

  for (const side of next.matchPoint) {
    if (!prev.matchPoint.includes(side))
      parts.push({ kind: "match-point", side });
  }
  for (const side of next.setPoint) {
    if (!prev.setPoint.includes(side)) parts.push({ kind: "set-point", side });
  }
  return parts;
}

function summarise(args: {
  input: NetScoreInput;
  rows: ReadonlyArray<SetRow>;
  headline: Headline;
  setsWon: { home: number; away: number };
  winner: Side | null;
  winnerProvisional: boolean;
  serving: Side | null;
}): string {
  const { input, rows, headline, setsWon, winner, winnerProvisional, serving } =
    args;
  const name = (side: Side): string =>
    input.names?.[side] ?? (side === "home" ? "Home" : "Away");
  const setText = rows
    .map((row) => `set ${row.number} ${row.home} to ${row.away}`)
    .join(", ");
  const pair = (home: number, away: number): string =>
    `${name("home")} ${home}, ${name("away")} ${away}`;

  const status = input.status;
  const bits: string[] = [];
  switch (status) {
    case "scheduled":
      bits.push("Scheduled. Score pending.");
      break;
    case "warmup":
      bits.push("Warm-up. Score pending.");
      break;
    case "cancelled":
      bits.push("Cancelled.");
      break;
    case "live":
      bits.push(
        headline.kind === "none"
          ? "Live. No points recorded yet."
          : `Live. ${pair(
              headline.kind === "points" ? headline.home : setsWon.home,
              headline.kind === "points" ? headline.away : setsWon.away,
            )}.`,
      );
      if (rows.length > 1)
        bits.push(`Sets won ${pair(setsWon.home, setsWon.away)}.`);
      if (serving) bits.push(`${name(serving)} serving.`);
      break;
    case "pending-verification":
      bits.push("Result pending verification.");
      break;
    case "verified":
      bits.push("Result verified.");
      break;
    case "complete":
      bits.push("Match complete.");
      break;
    case "disputed":
      bits.push("Result disputed.");
      break;
    case "forfeit":
      bits.push("Forfeit.");
      break;
    case "not-finished":
      bits.push("Not finished. The match was stopped before the end.");
      break;
  }
  if (status !== "live") {
    if (setText) bits.push(`${setText}.`);
    if (headline.kind === "sets") {
      bits.push(`Sets won ${pair(headline.home, headline.away)}.`);
    }
  }
  if (winner) {
    bits.push(
      winnerProvisional
        ? `${name(winner)} ahead, to be confirmed.`
        : `${name(winner)} won${input.isTitle ? " the title" : ""}.`,
    );
  }
  return bits.join(" ");
}
