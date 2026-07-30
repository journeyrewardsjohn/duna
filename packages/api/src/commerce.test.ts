import { describe, expect, it } from "vitest";
import { suggestCourtAlternatives } from "./commerce";

describe("connected commerce helpers", () => {
  it("returns the earliest non-overlapping court alternatives", () => {
    expect(
      suggestCourtAlternatives({
        requested: {
          startsAt: "2026-08-01T12:00:00.000Z",
          endsAt: "2026-08-01T13:00:00.000Z",
        },
        busy: [
          {
            startsAt: "2026-08-01T12:30:00.000Z",
            endsAt: "2026-08-01T14:00:00.000Z",
          },
          {
            startsAt: "2026-08-01T14:30:00.000Z",
            endsAt: "2026-08-01T15:30:00.000Z",
          },
        ],
        limit: 3,
      }),
    ).toEqual([
      {
        startsAt: "2026-08-01T15:30:00.000Z",
        endsAt: "2026-08-01T16:30:00.000Z",
      },
      {
        startsAt: "2026-08-01T16:00:00.000Z",
        endsAt: "2026-08-01T17:00:00.000Z",
      },
      {
        startsAt: "2026-08-01T16:30:00.000Z",
        endsAt: "2026-08-01T17:30:00.000Z",
      },
    ]);
  });

  it("rejects malformed and reversed ranges without suggesting times", () => {
    expect(
      suggestCourtAlternatives({
        requested: {
          startsAt: "not-a-date",
          endsAt: "2026-08-01T13:00:00.000Z",
        },
        busy: [],
      }),
    ).toEqual([]);
    expect(
      suggestCourtAlternatives({
        requested: {
          startsAt: "2026-08-01T14:00:00.000Z",
          endsAt: "2026-08-01T13:00:00.000Z",
        },
        busy: [],
      }),
    ).toEqual([]);
  });
});
