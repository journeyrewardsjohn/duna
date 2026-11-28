/**
 * The results page's model (`/app/matches`): history by month with each
 * result's state and what it did to the Sand Rating, the form line, the
 * record and the partner played with most. Pure.
 */
import type { MatchSummary } from "@duna/core";
import {
  movementChange,
  movementNote,
  RESULT_STATE_COPY,
  resultState,
} from "../result-copy";

export interface HistoryRow {
  readonly id: string;
  readonly href: string;
  readonly day: string;
  readonly opponents: string;
  readonly partners: string;
  readonly won: boolean | null;
  readonly sets: readonly (readonly [number, number])[];
  readonly venue: string;
  readonly chip: string;
  readonly state: ReturnType<typeof resultState>;
  /** "+0.08" when it moved the rating. */
  readonly change: string | null;
  /** Why it did not: "Awaiting confirmation", "Friendly: history only". */
  readonly note: string | null;
  /** On my side for `teamA` (the score reads mine first). */
  readonly mine: "A" | "B" | null;
}

export interface HistoryMonth {
  readonly key: string;
  readonly label: string;
  readonly rows: readonly HistoryRow[];
}

export interface HistoryModel {
  readonly months: readonly HistoryMonth[];
  readonly form: readonly ("W" | "L")[];
  readonly wins: number;
  readonly losses: number;
  readonly needsMe: readonly HistoryRow[];
  readonly partner: {
    readonly name: string;
    readonly matches: number;
    readonly wins: number;
  } | null;
  readonly count: number;
}

const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;

function monthParts(iso: string, timeZone: string, locale: string) {
  const date = new Date(iso);
  const key = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone,
  }).format(date);
  return {
    key,
    label: new Intl.DateTimeFormat(locale, {
      month: "long",
      year: "numeric",
      timeZone,
    }).format(date),
    day: new Intl.DateTimeFormat(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone,
    }).format(date),
  };
}

export function historyModel(input: {
  readonly matches: readonly MatchSummary[];
  readonly myId: string;
  readonly now: Date;
  readonly timeZone: string;
  readonly locale?: string;
  /** `YYYY-MM-DD`: only that day. */
  readonly onDay?: string;
}): HistoryModel {
  const locale = input.locale ?? "en-US";
  const sorted = [...input.matches]
    .filter(
      (match) =>
        !input.onDay ||
        new Intl.DateTimeFormat("en-CA", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          timeZone: input.timeZone,
        }).format(new Date(match.playedAt)) === input.onDay,
    )
    .sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt));
  const rows = sorted.map((match): HistoryRow => {
    const mine = match.teamA.some((person) => person.id === input.myId)
      ? "A"
      : match.teamB.some((person) => person.id === input.myId)
        ? "B"
        : null;
    const others = mine === "B" ? match.teamA : match.teamB;
    const team = mine === "B" ? match.teamB : match.teamA;
    const state = resultState({
      status:
        match.status ??
        (match.verification === "self-reported" ? undefined : "verified"),
      playedAt: match.playedAt,
      now: input.now,
    });
    const parts = monthParts(match.playedAt, input.timeZone, locale);
    return {
      id: match.id,
      href: `/app/matches/${match.id}`,
      day: parts.day,
      opponents: others.map((person) => first(person.displayName)).join(" / "),
      partners: team
        .filter((person) => person.id !== input.myId)
        .map((person) => first(person.displayName))
        .join(" / "),
      won: mine ? match.winner === mine : null,
      sets:
        mine === "B"
          ? match.score.map(([a, b]) => [b, a] as const)
          : match.score,
      venue: match.venueName,
      chip: RESULT_STATE_COPY[state].chip,
      state,
      change: movementChange(match),
      note: movementNote(match),
      mine,
    };
  });
  const months: HistoryMonth[] = [];
  sorted.forEach((match, index) => {
    const parts = monthParts(match.playedAt, input.timeZone, locale);
    const month = months.find((candidate) => candidate.key === parts.key);
    if (month) (month.rows as HistoryRow[]).push(rows[index]!);
    else
      months.push({ key: parts.key, label: parts.label, rows: [rows[index]!] });
  });
  const decided = rows.filter((row) => row.won !== null);
  const partners = new Map<
    string,
    { name: string; matches: number; wins: number }
  >();
  sorted.forEach((match, index) => {
    const row = rows[index]!;
    if (!row.mine) return;
    for (const person of row.mine === "A" ? match.teamA : match.teamB) {
      if (person.id === input.myId) continue;
      const entry = partners.get(person.id) ?? {
        name: person.displayName,
        matches: 0,
        wins: 0,
      };
      entry.matches += 1;
      if (row.won) entry.wins += 1;
      partners.set(person.id, entry);
    }
  });
  const partner =
    [...partners.values()].sort(
      (a, b) => b.matches - a.matches || b.wins - a.wins,
    )[0] ?? null;
  return {
    months,
    form: decided.slice(0, 10).map((row) => (row.won ? "W" : "L")),
    wins: decided.filter((row) => row.won).length,
    losses: decided.filter((row) => row.won === false).length,
    needsMe: rows.filter(
      (row, index) =>
        row.state === "awaiting" &&
        sorted[index]!.confirmationRequired === true,
    ),
    partner,
    count: rows.length,
  };
}
