/**
 * A result says the same thing on the web as in the Player app and on
 * `/add-score`. Needs core: until the table moves to a shared package, this
 * test imports the Player app's own module and `/add-score`'s helper and
 * fails when any side changes a word.
 */
import type { AddScorePreview } from "@duna/api";
import type { MatchSummary, PersonSummary } from "@duna/core";
import { describe, expect, it } from "vitest";
import * as app from "../../../player/src/features/score/result-rules";
import { resultSentence as addScoreSentence } from "../../app/(next)/(site)/add-score/flow-model";
import {
  AGREEMENT_LABEL,
  AGREEMENT_REQUIRED,
  CONFIRM_OUTCOME,
  confirmationMessage,
  countsReason,
  looksUnfinished,
  movementChange,
  movementNote,
  NOT_COUNTED,
  RESULT_STATE_COPY,
  resultModel,
  resultSentence,
  resultState,
  ringProps,
  scoreShape,
  SOFT_UNFINISHED_WARNING,
  UNDER_13_MESSAGE,
  waitingOn,
  whatThisResultWouldDo,
  WHAT_COUNTS,
} from "./result-copy";

const NOW = new Date("2026-11-28T18:00:00.000Z");

function person(
  id: string,
  name: string,
  over: Partial<PersonSummary> = {},
): PersonSummary {
  return {
    id,
    displayName: name,
    handle: id,
    initials: name.slice(0, 2).toUpperCase(),
    homeMarket: "",
    roles: ["player"],
    rating: {
      display: 4.2,
      mu: 0,
      phi: 0,
      sigma: 0,
      confidence: "Reliable",
      discipline: "beach-2s",
    },
    ...over,
  };
}

const mara = person("mara", "Mara Lewis");
const elena = person("elena", "Elena Torres");
const theo = person("theo", "Theo Park");
const noa = person("noa", "Noa Williams");

function match(over: Partial<MatchSummary> = {}): MatchSummary {
  return {
    id: "m1",
    status: "pending-verification",
    playedAt: "2026-11-27T18:00:00.000Z",
    venueName: "Dockside",
    teamA: [mara, elena],
    teamB: [theo, noa],
    score: [
      [21, 18],
      [19, 21],
      [15, 12],
    ],
    winner: "A",
    ratingDelta: 0,
    verification: "self-reported",
    matchType: "competitive",
    teamSize: 2,
    canRemove: true,
    ...over,
  };
}

describe("parity with the Player app (word for word)", () => {
  it("holds the same sentences as the app", () => {
    expect(SOFT_UNFINISHED_WARNING).toBe(app.SOFT_UNFINISHED_WARNING);
    expect(AGREEMENT_LABEL).toBe(app.AGREEMENT_LABEL);
    expect(AGREEMENT_REQUIRED).toBe(app.AGREEMENT_REQUIRED);
    expect(UNDER_13_MESSAGE).toBe(app.UNDER_13_MESSAGE);
    expect(RESULT_STATE_COPY).toEqual(app.RESULT_STATE_COPY);
  });

  it("maps every result state to the app's chip and line", () => {
    const statuses = [
      "pending-verification",
      "verified",
      "disputed",
      undefined,
    ] as const;
    for (const status of statuses) {
      for (const claims of [0, 2]) {
        for (const playedAt of [
          "2026-11-27T18:00:00.000Z",
          "2026-09-01T18:00:00.000Z",
        ]) {
          const input = { status, playedAt, pendingClaims: claims, now: NOW };
          expect(resultState(input)).toBe(app.resultState(input));
        }
      }
    }
    expect(
      resultState({
        status: "pending-verification",
        playedAt: "2026-09-01T18:00:00.000Z",
        pendingClaims: 1,
        now: NOW,
      }),
    ).toBe("expired");
  });

  it("gives the same score checks, waiting line, message and what-it-would-do", () => {
    const cases = [
      [],
      [{ you: 21, them: 21 }],
      [{ you: 21, them: 20 }],
      [
        { you: 21, them: 18 },
        { you: 18, them: 21 },
      ],
      [
        { you: 21, them: 18 },
        { you: 21, them: 15 },
        { you: 15, them: 10 },
      ],
      [
        { you: 19, them: 17 },
        { you: 21, them: 15 },
      ],
    ];
    for (const sets of cases) {
      expect(scoreShape(sets)).toEqual(app.scoreShape(sets));
      expect(looksUnfinished(sets)).toBe(app.looksUnfinished(sets));
    }
    for (const names of [
      [],
      ["Theo Park"],
      ["Theo Park", "Noa Williams", "Sam Rivera"],
    ]) {
      expect(waitingOn(names)).toBe(app.waitingOn(names));
    }
    const ask = {
      opponents: ["Theo Park", "Noa Williams"],
      link: "https://duna.coach/matches/m1",
    };
    expect(confirmationMessage(ask)).toBe(app.confirmationMessage(ask));
    for (const input of [
      { teamSize: 2, matchType: "competitive" as const },
      { teamSize: 2, matchType: "friendly" as const },
      { teamSize: 4, matchType: "competitive" as const },
    ]) {
      expect(whatThisResultWouldDo(input)).toBe(
        app.whatThisResultWouldDo(input),
      );
      expect(countsReason(input)).toBe(app.countsReason(input));
    }
  });

  it("says what a result would do exactly as /add-score does", () => {
    const previews: AddScorePreview[] = [
      {
        counts: true,
        reason: "competitive-doubles",
        result: "won",
        whatItWouldDo: {
          startingPoint: 3,
          afterThisMatch: 3.09,
          change: 0.09,
          matchesUntilShown: 4,
        },
      } as AddScorePreview,
      { counts: false, reason: "friendly", result: "lost" } as AddScorePreview,
      {
        counts: false,
        reason: "not-doubles",
        result: "won",
      } as AddScorePreview,
    ];
    for (const preview of previews) {
      expect(resultSentence(preview)).toBe(addScoreSentence(preview));
      expect(resultSentence(preview)).toBe(app.resultSentence(preview));
    }
    expect(resultSentence(previews[0]!)).toBe(
      "If the other side confirms it, a win like this moves a player new to Duna from 3.00 to 3.09 (+0.09).",
    );
    expect(NOT_COUNTED.friendly).toBe(
      "Nothing to your Sand Rating: friendly matches are kept in your history but don’t move it.",
    );
  });
});

describe("the result page's model", () => {
  it("awaiting: names only the other side as the ones who can confirm", () => {
    const model = resultModel({
      summary: match(),
      scoring: { confirmedPersonIds: ["mara"], pendingClaims: [] },
      myId: "mara",
      now: NOW,
    });
    expect(model.state).toBe("awaiting");
    expect(model.chip).toBe("Awaiting confirmation");
    expect(model.needsMe).toBe(false);
    expect(model.waiting).toBe("Waiting on Theo or Noa");
    expect(model.confirmers).toEqual(["Theo Park", "Noa Williams"]);
    expect(model.title).toBe("You won");
    expect(model.whatItWouldDo).toBe(
      "It moves only when someone on the other side confirms, and everyone in the match has a Duna profile.",
    );
  });

  it("awaiting, seen by the other side: it needs them", () => {
    const model = resultModel({
      summary: match(),
      scoring: { confirmedPersonIds: ["mara"], pendingClaims: [] },
      myId: "theo",
      now: NOW,
    });
    expect(model.needsMe).toBe(true);
    expect(model.waiting).toBe("Waiting on you");
    expect(model.title).toBe("You lost");
  });

  it("people added by name cannot confirm until they join", () => {
    const model = resultModel({
      summary: match({
        teamB: [
          person("x", "Jamie Rivera", { profileClaimStatus: "unclaimed" }),
          person("y", "Cy Lee", { profileClaimStatus: "unclaimed" }),
        ],
      }),
      scoring: {
        confirmedPersonIds: ["mara"],
        pendingClaims: [{ personId: "x", displayName: "Jamie Rivera" }],
      },
      myId: "mara",
      now: NOW,
    });
    expect(model.waitingFor).toBe("no-profile");
    expect(model.waiting).toBe(
      "Nobody on the other side has a Duna profile yet",
    );
    expect(model.pendingClaims).toEqual(["Jamie Rivera"]);
  });

  it("confirmed: the rating movement, and history rows say what moved", () => {
    const confirmed = match({
      status: "verified",
      ratingImpact: "sand-rating",
      ratingDelta: 0.06,
      ratingBefore: 4.62,
      ratingAfter: 4.68,
    });
    const model = resultModel({ summary: confirmed, myId: "mara", now: NOW });
    expect(model.state).toBe("confirmed");
    expect(model.rating).toEqual({ before: 4.62, after: 4.68, delta: 0.06 });
    expect(movementChange(confirmed)).toBe("+0.06");
    expect(movementNote(confirmed)).toBeNull();
    expect(movementChange(match())).toBeNull();
    expect(movementNote(match())).toBe("Awaiting confirmation");
    expect(
      movementNote(
        match({
          status: "verified",
          ratingImpact: "history-only",
          matchType: "friendly",
        }),
      ),
    ).toBe("Friendly: history only");
  });

  it("disputed and the outcome words match the app", () => {
    expect(
      resultModel({
        summary: match({ status: "disputed" }),
        myId: "mara",
        now: NOW,
      }).chip,
    ).toBe("Disputed");
    expect(CONFIRM_OUTCOME.disputed).toBe(
      "Sent. The result doesn’t count until you agree.",
    );
    expect(WHAT_COUNTS).toHaveLength(2);
  });

  it("never shows a provisional rating as a number", () => {
    expect(
      ringProps({
        rating: {
          display: 3.2,
          mu: 0,
          phi: 0,
          sigma: 0,
          confidence: "Provisional",
          discipline: "beach-2s",
        },
      }),
    ).toEqual({ value: null, reliability: 1 });
    expect(ringProps({ rating: mara.rating, after: 4.3, delta: 0.1 })).toEqual({
      value: 4.3,
      delta: 0.1,
      reliability: 3,
    });
  });
});
