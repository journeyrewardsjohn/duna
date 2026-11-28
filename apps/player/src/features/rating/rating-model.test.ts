import { describe, expect, it } from "vitest";
import type { MatchSummary } from "@duna/core";
import { ratingRingLabel, ratingRingModel } from "@duna/tideline-core";
import {
  isProvisional,
  movements,
  ratingRingProps,
  reliabilityOf,
  trendPoints,
  trendSummary,
  WHAT_COUNTS,
} from "./rating-model";

function ratingRingView(props: {
  readonly value: number | null;
  readonly delta?: number | null;
  readonly reliability: number;
  readonly matchesLeft?: number;
  readonly px: number;
  readonly locale: string;
}) {
  const model = ratingRingModel(props);
  return {
    model,
    accessibilityLabel: ratingRingLabel(model, { locale: props.locale }),
  };
}

const rating = (
  confidence: "Provisional" | "Developing" | "Reliable" | "Locked",
  display = 3.42,
  delta?: number,
) => ({
  display,
  mu: 0,
  phi: 0,
  sigma: 0,
  confidence,
  discipline: "beach-2s" as const,
  ...(delta !== undefined ? { delta } : {}),
});

describe("the Sand Rating ring", () => {
  it("is never a number while provisional: an em dash", () => {
    const props = ratingRingProps({ rating: rating("Provisional", 3.18) });
    expect(props.value).toBeNull();
    const view = ratingRingView({ ...props, px: 260, locale: "en-US" });
    expect(view.model.state).toBe("provisional");
    expect(view.model.label.number).toBeNull();
    expect(view.accessibilityLabel).toContain("Sand Rating provisional");
    expect(isProvisional(undefined)).toBe(true);
  });

  it("shows N more matches when the count is known", () => {
    const props = ratingRingProps({
      rating: rating("Provisional"),
      matchesLeft: 3,
    });
    const view = ratingRingView({ ...props, px: 260, locale: "en-US" });
    expect(view.model.label.chip).toEqual({ kind: "matches-left", count: 3 });
  });

  it("an established rating shows its number, change and reliability", () => {
    const props = ratingRingProps({ rating: rating("Developing", 3.42, 0.08) });
    expect(props).toEqual({ value: 3.42, delta: 0.08, reliability: 2 });
    const view = ratingRingView({ ...props, px: 260, locale: "en-US" });
    expect(view.model.label.number).toBe("3.42");
    expect(view.model.state).toBe("up");
  });

  it("shows a just-confirmed match's movement", () => {
    expect(
      ratingRingProps({
        rating: rating("Reliable", 3.42),
        after: 3.38,
        delta: -0.04,
      }),
    ).toEqual({ value: 3.38, delta: -0.04, reliability: 3 });
    expect(reliabilityOf("Locked")).toBe(3);
  });
});

const person = (id: string, displayName: string) => ({
  id,
  displayName,
  handle: id,
  initials: "",
  homeMarket: "",
  roles: [] as const,
  rating: rating("Reliable"),
});

function match(overrides: Partial<MatchSummary>): MatchSummary {
  return {
    id: "m",
    status: "verified",
    playedAt: "2026-11-20T12:00:00Z",
    venueName: "Court",
    teamA: [person("me", "Noa Williams"), person("mara", "Mara Lewis")],
    teamB: [person("theo", "Theo Park"), person("jamie", "Jamie Stone")],
    score: [
      [21, 18],
      [21, 19],
    ],
    winner: "A",
    ratingDelta: 0.08,
    ratingBefore: 3.34,
    ratingAfter: 3.42,
    verification: "both-confirmed",
    ...overrides,
  };
}

describe("recent matches and the trend", () => {
  const list = movements(
    [
      match({
        id: "a",
        playedAt: "2026-11-10T12:00:00Z",
        ratingDelta: 0.04,
        ratingBefore: 3.3,
        ratingAfter: 3.34,
      }),
      match({ id: "b", playedAt: "2026-11-20T12:00:00Z" }),
      match({
        id: "c",
        playedAt: "2026-11-25T12:00:00Z",
        status: "pending-verification",
        ratingDelta: 0,
      }),
      match({
        id: "d",
        playedAt: "2026-11-26T12:00:00Z",
        matchType: "friendly",
        ratingImpact: "history-only",
        ratingDelta: 0,
        winner: "B",
      }),
    ],
    "me",
  );

  it("lists newest first with what each did", () => {
    expect(list.map((movement) => movement.matchId)).toEqual([
      "d",
      "c",
      "b",
      "a",
    ]);
    expect(list[0]).toMatchObject({
      won: false,
      change: null,
      note: "Friendly: history only",
    });
    expect(list[1]).toMatchObject({
      change: null,
      note: "Awaiting confirmation",
    });
    expect(list[2]).toMatchObject({
      won: true,
      change: "+0.08",
      opponents: "Theo / Jamie",
    });
  });

  it("draws no trend until there are two rated matches", () => {
    expect(trendSummary(trendPoints(list.slice(0, 3)))).toBeNull();
    expect(trendPoints(list)).toEqual([3.34, 3.42]);
    expect(trendSummary(trendPoints(list))).toBe(
      "Up 0.08 across 2 rated matches, from 3.34 to 3.42.",
    );
  });

  it("says what counts in two sentences", () => {
    expect(WHAT_COUNTS).toHaveLength(2);
  });
});
