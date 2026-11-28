/**
 * The Sand Rating home's data (M-P4a). Pure; tested.
 *
 * Brand book section 4: a provisional rating is never a number. It shows
 * an em dash and "N more matches" (the count needs the API: until then the
 * ring shows the em dash alone). Reliability is the engine's confidence:
 * Provisional 1, Developing 2, Reliable and Locked 3.
 */
import type { MatchSummary, PersonSummary } from "@duna/core";
import type { RatingRingProps } from "@duna/ui/native/score";

type Rating = PersonSummary["rating"];

export function reliabilityOf(confidence: Rating["confidence"]): number {
  switch (confidence) {
    case "Provisional":
      return 1;
    case "Developing":
      return 2;
    default:
      return 3;
  }
}

export function isProvisional(rating: Rating | undefined): boolean {
  return !rating || rating.confidence === "Provisional";
}

/** The ring's props for the signed-in player. Pure. */
export function ratingRingProps(input: {
  readonly rating: Rating | undefined;
  /** A just-confirmed match's figures, when showing its movement. */
  readonly after?: number;
  readonly delta?: number;
  /** Matches before the rating shows, when the API says. */
  readonly matchesLeft?: number;
}): Pick<RatingRingProps, "value" | "delta" | "reliability" | "matchesLeft"> {
  const { rating } = input;
  if (isProvisional(rating)) {
    return {
      value: null,
      reliability: 1,
      ...(input.matchesLeft ? { matchesLeft: input.matchesLeft } : {}),
    };
  }
  return {
    value: input.after ?? rating!.display,
    delta: input.delta ?? rating!.delta ?? null,
    reliability: reliabilityOf(rating!.confidence),
  };
}

export interface Movement {
  readonly matchId: string;
  readonly playedAt: string;
  readonly opponents: string;
  readonly won: boolean;
  /** "+0.08", "−0.04", or null when it did not move the rating. */
  readonly change: string | null;
  readonly before?: number;
  readonly after?: number;
  /** Why it did not move: awaiting, disputed, friendly, other formats. */
  readonly note: string | null;
}

function signed(value: number): string {
  const fixed = Math.abs(value).toFixed(2);
  return value >= 0 ? `+${fixed}` : `−${fixed}`;
}

const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** Recent matches with what each did, newest first. Pure. */
export function movements(
  matches: readonly MatchSummary[],
  myId: string | undefined,
  limit = 12,
): Movement[] {
  return [...matches]
    .sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt))
    .slice(0, limit)
    .map((match) => {
      const mine = myId
        ? match.teamB.some((person) => person.id === myId)
          ? "B"
          : "A"
        : "A";
      const others = mine === "A" ? match.teamB : match.teamA;
      const rated =
        match.status !== "pending-verification" &&
        match.status !== "disputed" &&
        match.ratingImpact !== "history-only" &&
        match.ratingEligibility !== "held";
      const note =
        match.status === "pending-verification"
          ? "Awaiting confirmation"
          : match.status === "disputed"
            ? "Disputed"
            : match.ratingEligibility === "held"
              ? "Held for review"
              : match.ratingImpact === "history-only"
                ? match.matchType === "friendly"
                  ? "Friendly: history only"
                  : "History only"
                : null;
      return {
        matchId: match.id,
        playedAt: match.playedAt,
        opponents: others
          .map((person) => first(person.displayName))
          .join(" / "),
        won: match.winner === mine,
        change:
          rated && match.ratingDelta !== 0 ? signed(match.ratingDelta) : null,
        ...(match.ratingBefore !== undefined
          ? { before: match.ratingBefore }
          : {}),
        ...(match.ratingAfter !== undefined
          ? { after: match.ratingAfter }
          : {}),
        note,
      };
    });
}

/**
 * The trend, oldest first, from matches that moved the rating. Fewer than
 * two points is no trend (the screen says so instead of drawing one).
 */
export function trendPoints(list: readonly Movement[]): number[] {
  return [...list]
    .reverse()
    .flatMap((movement) =>
      movement.change !== null && movement.after !== undefined
        ? [movement.after]
        : [],
    );
}

/** One sentence that sums the trend up for VoiceOver and the list. Pure. */
export function trendSummary(points: readonly number[]): string | null {
  if (points.length < 2) return null;
  const firstPoint = points[0]!;
  const last = points.at(-1)!;
  const change = last - firstPoint;
  const direction = change > 0 ? "up" : change < 0 ? "down" : "level";
  return direction === "level"
    ? `Level at ${last.toFixed(2)} across ${points.length} rated matches.`
    : `${direction === "up" ? "Up" : "Down"} ${Math.abs(change).toFixed(2)} across ${points.length} rated matches, from ${firstPoint.toFixed(2)} to ${last.toFixed(2)}.`;
}

export const WHAT_COUNTS = [
  "Competitive two-on-two matches move your Sand Rating once someone on the other side confirms them and everyone in the match has a Duna profile.",
  "Friendly matches, other formats and results awaiting confirmation are kept in your history without moving it.",
] as const;
