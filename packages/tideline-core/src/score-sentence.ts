/**
 * Words for a score card: the one sentence a screen reader hears for a whole
 * `NetScore`, set-score text, and the polite live announcement built from
 * `scoreAnnouncement` parts. Pure and English; localise the parts if you need
 * another language. The visual card and the sentence read the same
 * `NetScoreState`, so they can never disagree.
 */
import type {
  MatchStatus,
  NetScoreState,
  NetScoreStatus,
  ScoreEventPart,
  SetRow,
  Side,
} from "./score";

/**
 * The values of the `match_status` database enum, in schema order. A test
 * compares this list with `packages/db/src/schema.ts`, so a new enum value
 * fails until a score state is designed for it.
 */
export const MATCH_STATUSES: ReadonlyArray<MatchStatus> = [
  "scheduled",
  "warmup",
  "live",
  "pending-verification",
  "verified",
  "disputed",
  "complete",
  "forfeit",
  "cancelled",
];

/** Every state a score card draws: the enum plus the proposed `not-finished`. */
export const NET_SCORE_STATUSES: ReadonlyArray<NetScoreStatus> = [
  ...MATCH_STATUSES,
  "not-finished",
];

/**
 * Reads a status from data: accepts the enum with hyphens or underscores
 * (`pending_verification`), any case. Unknown values give `null`; never guess.
 */
export function parseNetScoreStatus(
  value: string | null | undefined,
): NetScoreStatus | null {
  const normalised = (value ?? "").trim().toLowerCase().replaceAll("_", "-");
  return (NET_SCORE_STATUSES as ReadonlyArray<string>).includes(normalised)
    ? (normalised as NetScoreStatus)
    : null;
}

/** Short status words for a chip, sentence case. */
export const NET_SCORE_STATUS_TEXT: Readonly<Record<NetScoreStatus, string>> = {
  scheduled: "Scheduled",
  warmup: "Warm-up",
  live: "Live",
  "pending-verification": "Awaiting confirmation",
  verified: "Verified",
  disputed: "Disputed",
  complete: "Final",
  forfeit: "Forfeit",
  cancelled: "Cancelled",
  "not-finished": "Not finished",
};

/** "21–18": an en dash between the two numbers, home first. */
export function formatSetScore(home: number, away: number): string {
  return `${home}–${away}`;
}

/** "21–18, 19–21, 15–12" for the rows given, home first. */
export function formatSetList(rows: ReadonlyArray<SetRow>): string {
  return rows.map((row) => formatSetScore(row.home, row.away)).join(", ");
}

export interface NetScoreSentenceOptions {
  readonly names: { readonly home: string; readonly away: string };
  /** When a scheduled match starts, already formatted ("Sat, Nov 28, 9:00 AM"). */
  readonly start?: string;
  /** Where ("Court 3"). */
  readonly court?: string;
  /** Why a match was cancelled, forfeited or stopped. */
  readonly reason?: string;
  /** A title match ("King of the Beach final"); `true` says "the title". */
  readonly title?: string | boolean;
}

function orderFor(state: NetScoreState, winner: Side): ReadonlyArray<SetRow> {
  return winner === "home"
    ? state.rows
    : state.rows.map((row) => ({ ...row, home: row.away, away: row.home }));
}

function setsWonText(state: NetScoreState, winner: Side): string | null {
  const won = { home: 0, away: 0 };
  for (const row of state.rows) if (row.winningSide) won[row.winningSide] += 1;
  if (won.home + won.away === 0) return null;
  const loser = winner === "home" ? "away" : "home";
  const a = won[winner];
  const b = won[loser];
  return `${a} ${a === 1 ? "set" : "sets"} to ${b}`;
}

function scoresFromWinner(state: NetScoreState, winner: Side): string {
  return formatSetList(orderFor(state, winner));
}

function titleText(title: string | boolean | undefined): string {
  if (!title) return "";
  return typeof title === "string"
    ? `, winning the ${title}`
    : " for the title";
}

function suffix(...parts: Array<string | undefined | false>): string {
  const kept = parts.filter((part): part is string => Boolean(part));
  return kept.length > 0 ? `, ${kept.join(", ")}` : "";
}

/**
 * One sentence for the whole card: who played, who won (or that nobody has
 * yet), the set scores and the state. "Williams / Lewis beat Park / Stone 2
 * sets to 1, 21–18, 19–21, 15–12. Verified."
 *
 * Set scores are read from the winner's side when there is a winner, and
 * home first otherwise. An unfinished set is named as such and never counted.
 */
export function netScoreSentence(
  state: NetScoreState,
  options: NetScoreSentenceOptions,
): string {
  const name = (side: Side): string => options.names[side];
  const versus = `${name("home")} against ${name("away")}`;
  const reason = options.reason ? `: ${options.reason}` : "";
  const finished = state.rows.filter((row) => row.state === "finished");
  const open = state.rows.find((row) => row.state !== "finished");

  switch (state.status) {
    case "scheduled":
      return `${versus}${suffix(
        options.start && `starts ${options.start}`,
        options.court,
      )}. Scheduled, score pending.`;
    case "warmup":
      return `${versus}${suffix(options.court)}. Warming up, score pending.`;
    case "cancelled":
      return `${versus}. Cancelled${reason}.`;
    case "live": {
      const bits: string[] = [];
      if (state.liveLabel?.points && open) {
        bits.push(
          `set ${open.number}, ${name("home")} ${open.home}, ${name("away")} ${open.away}`,
        );
      } else {
        bits.push("no points recorded yet");
      }
      if (state.setsWon && finished.length > 0) {
        bits.push(
          `sets ${formatSetScore(state.setsWon.home, state.setsWon.away)}`,
        );
      }
      if (state.serving) bits.push(`${name(state.serving)} serving`);
      return `${versus}. Live, ${bits.join(", ")}.`;
    }
    case "not-finished": {
      const reached =
        state.rows.length > 0
          ? `, stopped at ${formatSetList(state.rows)}${
              open ? `, set ${open.number} unfinished` : ""
            }`
          : "";
      return `${versus}${reached}. Not finished${reason}.`;
    }
    case "disputed":
      return `${versus}${
        state.rows.length > 0 ? `, ${formatSetList(state.rows)}` : ""
      }. Result disputed, no winner yet.`;
    case "forfeit": {
      if (!state.winner) {
        return `${versus}. Forfeit${reason}.`;
      }
      const loser: Side = state.winner === "home" ? "away" : "home";
      const played =
        state.rows.length > 0
          ? ` after ${scoresFromWinner(state, state.winner)}`
          : "";
      return `${name(state.winner)} won by forfeit against ${name(loser)}${played}${titleText(
        options.title,
      )}. Forfeit${reason}.`;
    }
    case "pending-verification":
    case "verified":
    case "complete": {
      const ending =
        state.status === "verified"
          ? "Verified"
          : state.status === "complete"
            ? "Final"
            : "Waiting for both teams to confirm";
      if (!state.winner) {
        return `${versus}${
          state.rows.length > 0 ? `, ${formatSetList(state.rows)}` : ""
        }. ${ending}.`;
      }
      const loser: Side = state.winner === "home" ? "away" : "home";
      const verb = state.winnerProvisional ? "lead" : "beat";
      const count =
        state.rows.length > 1 ? setsWonText(state, state.winner) : null;
      const scores = scoresFromWinner(state, state.winner);
      return `${name(state.winner)} ${verb} ${name(loser)}${
        count ? ` ${count}` : ""
      }${scores ? `, ${scores}` : ""}${titleText(options.title)}. ${ending}.`;
    }
  }
}

export interface AnnouncementNames {
  readonly home: string;
  readonly away: string;
}

/**
 * The polite live-region text for what changed between two live states, or
 * `null` when there is nothing worth saying. Points are summarised as the
 * new score of the set, not one phrase per point, so a burst of changes
 * reads as one short line.
 */
export function scoreAnnouncementText(
  parts: ReadonlyArray<ScoreEventPart>,
  next: NetScoreState,
  names: AnnouncementNames,
): string | null {
  if (parts.length === 0) return null;
  const name = (side: Side): string => names[side];
  const latestPointSet = [...parts]
    .reverse()
    .find(
      (part): part is Extract<ScoreEventPart, { kind: "point" }> =>
        part.kind === "point",
    );
  const bits: string[] = [];
  if (parts.some((part) => part.kind === "correction")) {
    const open = next.rows[next.rows.length - 1];
    return open
      ? `Score corrected: set ${open.number}, ${name("home")} ${open.home}, ${name("away")} ${open.away}.`
      : "Score corrected.";
  }
  if (latestPointSet) {
    const row = next.rows[latestPointSet.setNumber - 1];
    if (row) {
      bits.push(
        `Point ${name(latestPointSet.side)}. Set ${row.number}, ${row.home}–${row.away}`,
      );
    }
  }
  for (const part of parts) {
    switch (part.kind) {
      case "set-won":
        bits.push(`Set ${part.setNumber} to ${name(part.side)}`);
        break;
      case "match-won":
        bits.push(
          part.provisional
            ? `${name(part.side)} ahead, to be confirmed`
            : `${name(part.side)} won the match`,
        );
        break;
      case "serve-change":
        bits.push(`${name(part.side)} serving`);
        break;
      case "match-point":
        bits.push(`Match point ${name(part.side)}`);
        break;
      case "set-point":
        if (
          !parts.some((p) => p.kind === "match-point" && p.side === part.side)
        )
          bits.push(`Set point ${name(part.side)}`);
        break;
      default:
        break;
    }
  }
  return bits.length > 0 ? `${bits.join(". ")}.` : null;
}

export interface AnnouncementGate {
  /** Offer a message; returns the text to say now, or `null` to wait. */
  offer(text: string, nowMs: number): string | null;
  /** The held message once `nowMs` passes the quiet window, else `null`. */
  flush(nowMs: number): string | null;
  /** When the held message may be said, or `null` when nothing is held. */
  dueAt(): number | null;
}

/**
 * Keeps a live region from spamming: at most one announcement per
 * `quietMs`. A message offered inside the window replaces any held one (the
 * latest score is the only one worth hearing) and is said when the window
 * ends. "Now" is an argument, so this is testable and clock-free.
 */
export function createAnnouncementGate(quietMs = 2000): AnnouncementGate {
  let lastSaidAt = Number.NEGATIVE_INFINITY;
  let held: string | null = null;
  return {
    offer(text, nowMs) {
      if (nowMs - lastSaidAt >= quietMs) {
        lastSaidAt = nowMs;
        held = null;
        return text;
      }
      held = text;
      return null;
    },
    flush(nowMs) {
      if (held === null || nowMs - lastSaidAt < quietMs) return null;
      const text = held;
      held = null;
      lastSaidAt = nowMs;
      return text;
    },
    dueAt() {
      return held === null ? null : lastSaidAt + quietMs;
    },
  };
}
