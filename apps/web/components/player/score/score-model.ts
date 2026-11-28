/**
 * The add-a-result page's inputs: the people the person plays with and
 * against most (suggested first), and a score carried in from the watch or
 * from "Change this result". Pure.
 */
import type { MatchSummary, PersonSummary } from "@duna/core";
import type { EnteredSet } from "../result-copy";

export interface Suggestion {
  readonly id: string;
  readonly name: string;
  readonly level?: string;
  readonly detail?: string;
}

function asSuggestion(
  person: PersonSummary,
  times: number,
  relation: "with" | "against",
): Suggestion {
  return {
    id: person.id,
    name: person.displayName,
    ...(person.rating.confidence !== "Provisional"
      ? { level: person.rating.display.toFixed(1) }
      : {}),
    detail: `Played ${relation === "with" ? "together" : "against"} ${times} time${times === 1 ? "" : "s"}`,
  };
}

/** Recent partners and opponents from the person's own history, most first. */
export function recentPeople(
  matches: readonly MatchSummary[],
  myId: string,
): { partners: Suggestion[]; opponents: Suggestion[] } {
  const partners = new Map<string, { person: PersonSummary; times: number }>();
  const opponents = new Map<string, { person: PersonSummary; times: number }>();
  for (const match of matches) {
    const onA = match.teamA.some((person) => person.id === myId);
    const onB = match.teamB.some((person) => person.id === myId);
    if (!onA && !onB) continue;
    const mine = onA ? match.teamA : match.teamB;
    const theirs = onA ? match.teamB : match.teamA;
    for (const [list, map] of [
      [mine, partners],
      [theirs, opponents],
    ] as const) {
      for (const person of list) {
        if (person.id === myId) continue;
        if (
          person.profileClaimStatus === "unclaimed" ||
          person.profileClaimStatus === "claim-pending"
        )
          continue;
        const entry = map.get(person.id) ?? { person, times: 0 };
        entry.times += 1;
        map.set(person.id, entry);
      }
    }
  }
  const sorted = (
    map: Map<string, { person: PersonSummary; times: number }>,
    relation: "with" | "against",
  ) =>
    [...map.values()]
      .sort((a, b) => b.times - a.times)
      .slice(0, 6)
      .map((entry) => asSuggestion(entry.person, entry.times, relation));
  return {
    partners: sorted(partners, "with"),
    opponents: sorted(opponents, "against"),
  };
}

/** `21-18,19-21` from "Change this result". */
export function setsFromQuery(value: string | undefined): EnteredSet[] {
  if (!value) return [];
  return value
    .split(",")
    .slice(0, 5)
    .flatMap((pair) => {
      const match = /^(\d{1,2})-(\d{1,2})$/.exec(pair.trim());
      return match ? [{ you: Number(match[1]), them: Number(match[2]) }] : [];
    });
}

/** Sets from the watch's hand-off (`?watch=`, the old recorder's format). */
export function setsFromWatch(raw: string | undefined): EnteredSet[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as {
      readonly source?: string;
      readonly sets?: readonly { readonly a?: unknown; readonly b?: unknown }[];
    };
    if (value.source !== "apple-watch" || !Array.isArray(value.sets)) return [];
    return value.sets
      .slice(0, 3)
      .filter(
        (set): set is { readonly a: number; readonly b: number } =>
          Number.isInteger(set.a) &&
          Number.isInteger(set.b) &&
          Number(set.a) >= 0 &&
          Number(set.b) >= 0 &&
          Number(set.a) <= 99 &&
          Number(set.b) <= 99,
      )
      .map((set) => ({ you: set.a, them: set.b }));
  } catch {
    return [];
  }
}
