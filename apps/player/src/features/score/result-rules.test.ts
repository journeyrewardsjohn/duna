/**
 * The app says what the web `/add-score` flow says, in the same words. The
 * web and API sources are imported directly, so a change on either side
 * fails here until the mirror (or the shared helper) follows.
 */
import { describe, expect, it } from "vitest";
import type { AddScorePreview, MatchSummary } from "@duna/api";
import { resultSentence as webResultSentence } from "../../../../web/app/(next)/(site)/add-score/flow-model";
import {
  scoreShape as apiScoreShape,
  scoreWarnings as apiScoreWarnings,
  SOFT_UNFINISHED_WARNING as API_SOFT_WARNING,
} from "../../../../../packages/api/src/services/add-score/rules";
import { checkAddedPerson } from "./people-rules";
import { dayLabel, playedAtFor, recordInput } from "./add-result-model";
import { resultModel } from "./result-model";
import {
  confirmationMessage,
  looksUnfinished,
  resultSentence,
  resultState,
  scoreShape,
  SOFT_UNFINISHED_WARNING,
  waitingOn,
  whatThisResultWouldDo,
  type EnteredSet,
} from "./result-rules";

const previews: AddScorePreview[] = [
  {
    result: "won",
    setsWon: { you: 2, them: 1 },
    counts: true,
    reason: "competitive-doubles",
    whatItWouldDo: {
      startingPoint: 3,
      afterThisMatch: 3.09,
      change: 0.09,
      matchesUntilShown: 5,
    },
    warnings: [],
  },
  {
    result: "lost",
    setsWon: { you: 0, them: 2 },
    counts: true,
    reason: "competitive-doubles",
    whatItWouldDo: {
      startingPoint: 3,
      afterThisMatch: 2.94,
      change: -0.06,
      matchesUntilShown: 5,
    },
    warnings: [],
  },
  {
    result: "won",
    setsWon: { you: 1, them: 0 },
    counts: false,
    reason: "friendly",
    warnings: [],
  },
  {
    result: "won",
    setsWon: { you: 1, them: 0 },
    counts: false,
    reason: "not-doubles",
    warnings: [],
  },
];

const scores: EnteredSet[][] = [
  [],
  [{ you: 21, them: 21 }],
  [{ you: 21, them: 20 }],
  [{ you: 21, them: 18 }],
  [
    { you: 21, them: 18 },
    { you: 18, them: 21 },
  ],
  [
    { you: 21, them: 18 },
    { you: 21, them: 19 },
    { you: 15, them: 10 },
  ],
  [
    { you: 21, them: 18 },
    { you: 19, them: 21 },
    { you: 15, them: 12 },
  ],
  [{ you: 12, them: 9 }],
  [
    { you: 21, them: 18 },
    { you: 19, them: 21 },
    { you: 12, them: 9 },
  ],
];

describe("the web's words, word for word", () => {
  it("what this result would do", () => {
    for (const preview of previews)
      expect(resultSentence(preview)).toBe(webResultSentence(preview));
    expect(resultSentence(previews[0]!)).toBe(
      "If the other side confirms it, a win like this moves a player new to Duna from 3.00 to 3.09 (+0.09).",
    );
  });

  it("the soft warning, which never blocks", () => {
    expect(SOFT_UNFINISHED_WARNING).toBe(API_SOFT_WARNING);
    for (const sets of scores) {
      const api = apiScoreWarnings(sets);
      expect(looksUnfinished(sets), JSON.stringify(sets)).toBe(api.length > 0);
    }
  });

  it("the hard checks recordCompletedMatch applies", () => {
    for (const sets of scores)
      expect(scoreShape(sets), JSON.stringify(sets)).toEqual(
        apiScoreShape(sets),
      );
  });
});

describe("result states", () => {
  const now = new Date("2026-11-28T12:00:00Z");
  it("maps every status to one state", () => {
    expect(
      resultState({
        status: "pending-verification",
        playedAt: "2026-11-27T12:00:00Z",
        now,
      }),
    ).toBe("awaiting");
    expect(
      resultState({
        status: "verified",
        playedAt: "2026-11-27T12:00:00Z",
        now,
      }),
    ).toBe("confirmed");
    expect(
      resultState({
        status: "disputed",
        playedAt: "2026-11-27T12:00:00Z",
        now,
      }),
    ).toBe("disputed");
    expect(
      resultState({
        status: "pending-verification",
        playedAt: "2026-10-01T12:00:00Z",
        pendingClaims: 1,
        now,
      }),
    ).toBe("expired");
    expect(
      resultState({
        status: "complete",
        playedAt: "2026-11-27T12:00:00Z",
        now,
      }),
    ).toBe("history");
  });

  it("says who still has to confirm", () => {
    expect(waitingOn(["Theo Park", "Jamie Stone"])).toBe(
      "Waiting on Theo or Jamie",
    );
    expect(waitingOn(["Theo Park"])).toBe("Waiting on Theo");
    expect(waitingOn([])).toBeNull();
  });

  it("says what a saved match would do without a preview", () => {
    expect(whatThisResultWouldDo({ teamSize: 2, matchType: "friendly" })).toBe(
      "Nothing to your Sand Rating: friendly matches are kept in your history but don’t move it.",
    );
    expect(
      whatThisResultWouldDo({ teamSize: 4, matchType: "competitive" }),
    ).toBe(
      "Nothing to your Sand Rating yet: only competitive two-on-two matches move it for now. This one is kept in your history.",
    );
    expect(
      whatThisResultWouldDo({ teamSize: 2, matchType: "competitive" }),
    ).toContain("someone on the other side confirms");
  });

  it("drafts a message the person reviews before sharing", () => {
    expect(
      confirmationMessage({
        opponents: ["Theo Park", "Jamie Stone"],
        link: "https://duna.coach/matches/1",
      }),
    ).toBe(
      "I added our match on Duna, Theo and Jamie. Can you confirm the score? https://duna.coach/matches/1",
    );
  });
});

const person = (id: string, displayName: string) => ({
  id,
  displayName,
  handle: id,
  initials: "",
  homeMarket: "",
  roles: [] as const,
  rating: {
    display: 3.3,
    mu: 0,
    phi: 0,
    sigma: 0,
    confidence: "Reliable" as const,
    discipline: "beach-2s" as const,
  },
});

function summary(overrides: Partial<MatchSummary> = {}): MatchSummary {
  return {
    id: "m1",
    status: "pending-verification",
    playedAt: "2026-11-27T12:00:00Z",
    venueName: "Sunset Beach Club",
    teamA: [person("me", "Noa Williams"), person("mara", "Mara Lewis")],
    teamB: [person("theo", "Theo Park"), person("jamie", "Jamie Stone")],
    score: [
      [21, 18],
      [19, 21],
      [15, 12],
    ],
    winner: "A",
    ratingDelta: 0,
    verification: "self-reported",
    teamSize: 2,
    matchType: "competitive",
    ...overrides,
  };
}

describe("the result screen's model", () => {
  const now = new Date("2026-11-28T12:00:00Z");
  it("awaiting, added by me: waiting on the other side, never asks me", () => {
    const model = resultModel({
      summary: summary(),
      scoring: {
        confirmation: { confirmedPersonIds: ["me"], disputedPersonIds: [] },
        reporting: {
          reporters: [],
          lastReporter: {
            personId: "me",
            displayName: "Noa Williams",
            reportedAt: now.toISOString(),
          },
        },
      } as never,
      myId: "me",
      now,
    });
    expect(model.state).toBe("awaiting");
    expect(model.title).toBe("You won");
    expect(model.needsMe).toBe(false);
    expect(model.waiting).toBe("Waiting on Theo or Jamie");
    expect(model.net.winnerProvisional).toBe(true);
  });

  it("awaiting, added by the other side: asks me to confirm", () => {
    const model = resultModel({
      summary: summary(),
      scoring: {
        confirmation: { confirmedPersonIds: ["me"], disputedPersonIds: [] },
        reporting: {
          reporters: [],
          lastReporter: {
            personId: "me",
            displayName: "Noa",
            reportedAt: now.toISOString(),
          },
        },
      } as never,
      myId: "theo",
      now,
    });
    expect(model.needsMe).toBe(true);
    expect(model.title).toBe("You lost");
  });

  it("confirmed: the rating movement, never a provisional number", () => {
    const model = resultModel({
      summary: summary({
        status: "verified",
        ratingBefore: 3.34,
        ratingAfter: 3.42,
        ratingDelta: 0.08,
      }),
      myId: "me",
      now,
    });
    expect(model.state).toBe("confirmed");
    expect(model.rating).toEqual({ before: 3.34, after: 3.42, delta: 0.08 });
    expect(model.net.winnerBadge).toBe("check");
  });

  it("disputed and friendly", () => {
    expect(
      resultModel({ summary: summary({ status: "disputed" }), myId: "me", now })
        .state,
    ).toBe("disputed");
    const friendly = resultModel({
      summary: summary({
        status: "verified",
        matchType: "friendly",
        ratingImpact: "history-only",
      }),
      myId: "me",
      now,
    });
    expect(friendly.rating).toBeNull();
    expect(friendly.whatItWouldDo).toContain("friendly matches");
  });
});

describe("adding a result", () => {
  it("checks a person added by name", () => {
    expect(
      checkAddedPerson({ givenName: "Sam", familyName: "L.", contact: "" }).ok,
    ).toBe(true);
    expect(
      checkAddedPerson({ givenName: "", familyName: "Lee", contact: "" }),
    ).toMatchObject({ ok: false, field: "given" });
    expect(
      checkAddedPerson({ givenName: "Sam", familyName: "www.x", contact: "" }),
    ).toMatchObject({ ok: false, field: "family" });
    expect(
      checkAddedPerson({
        givenName: "Sam",
        familyName: "Lee",
        contact: "310 555",
      }),
    ).toMatchObject({
      ok: false,
      problem: "Use an international mobile number beginning with +.",
    });
    expect(
      checkAddedPerson({
        givenName: "Sam",
        familyName: "Lee",
        contact: "+1 310 555 0100",
      }),
    ).toMatchObject({
      ok: true,
      person: { phoneE164: "+13105550100" },
    });
  });

  it("builds the recordCompletedMatch input", () => {
    const input = recordInput({
      teams: {
        A: {
          people: [
            { personId: "me", name: "Noa" },
            { name: "Sam Lee", givenName: "Sam", familyName: "Lee" },
          ],
        },
        B: {
          people: [
            { personId: "t", name: "Theo" },
            { personId: "j", name: "Jamie" },
          ],
        },
      },
      where: {
        label: "North beach",
        location: { label: "North beach, CA", latitude: 1, longitude: 2 },
      },
      playedAt: "2026-11-27T12:00:00.000Z",
      sets: [
        { you: 21, them: 18 },
        { you: 21, them: 19 },
      ],
      setsToWin: 2,
      matchType: "competitive",
      deviceId: "native-score-1",
      idempotencyKey: "k",
    });
    expect(input.teamAIds).toEqual(["me"]);
    expect(input.provisionalParticipants).toEqual([
      { side: "A", givenName: "Sam", familyName: "Lee" },
    ]);
    expect(input.setScores).toEqual([
      { a: 21, b: 18 },
      { a: 21, b: 19 },
    ]);
    expect(input.location?.label).toBe("North beach, CA");
    expect("venueId" in input).toBe(false);
  });

  it("names the day, never in the future", () => {
    const now = new Date("2026-11-28T15:00:00");
    expect(dayLabel(0, now)).toBe("Today");
    expect(dayLabel(1, now)).toBe("Yesterday");
    expect(dayLabel(3, now)).toBe("Wed, Nov 25");
    expect(new Date(playedAtFor(2, now)).getHours()).toBe(12);
    expect(playedAtFor(0, now)).toBe(now.toISOString());
  });
});
