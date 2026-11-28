import { teamAvailabilityDemoCoverageRequests } from "@duna/core/demo/team-availability";
import type { StaffAvailabilityInputs } from "@duna/scheduling";
import { describe, expect, it } from "vitest";
import {
  coverLists,
  coverReasonLine,
  coverStateCopy,
  type CoverageRequest,
} from "./cover-model";

const zone = "America/Los_Angeles";
const now = "2026-11-28T18:00:00.000Z";
const me = {
  staffProfileId: "me",
  personId: "p-me",
  displayName: "Me",
  initials: "ME",
};
const noa = {
  staffProfileId: "noa",
  personId: "p-noa",
  displayName: "Noa Lee",
  initials: "NL",
};

const request = (
  id: string,
  startsAt: string,
  endsAt: string,
  overrides: Partial<CoverageRequest> = {},
): CoverageRequest => ({
  id,
  target: { kind: "session", sessionId: `session-${id}` },
  title: `Session ${id}`,
  startsAt,
  endsAt,
  originalStaff: noa,
  reason: "time-off",
  status: "open",
  offers: [],
  ...overrides,
});

/** Me: Mondays 15:00–20:00 in Los Angeles, one booking on Monday 30 Nov at 17:00. */
const myInputs = (
  extra: Partial<StaffAvailabilityInputs> = {},
): StaffAvailabilityInputs => ({
  schedules: [
    {
      id: "s",
      status: "active",
      effectiveFrom: "2026-11-01",
      timezone: zone,
      windows: [{ weekday: 1, startMinute: 900, endMinute: 1200 }],
    },
  ],
  blackouts: [],
  timeOff: [],
  commitments: [
    {
      id: "mine",
      kind: "session",
      startsAt: "2026-12-01T01:00:00.000Z",
      endsAt: "2026-12-01T02:00:00.000Z",
    },
  ],
  ...extra,
});

describe("cover I could give, by the shared rule", () => {
  // Monday 30 Nov in Los Angeles.
  const fits = request(
    "fits",
    "2026-11-30T23:00:00.000Z",
    "2026-12-01T00:30:00.000Z",
  );
  const clashes = request(
    "clash",
    "2026-12-01T01:30:00.000Z",
    "2026-12-01T02:30:00.000Z",
  );
  const outside = request(
    "outside",
    "2026-12-01T16:00:00.000Z",
    "2026-12-01T17:00:00.000Z",
  );
  const covered = request(
    "covered",
    "2026-11-30T23:00:00.000Z",
    "2026-12-01T00:00:00.000Z",
    {
      status: "covered",
    },
  );
  const mine = request(
    "mine",
    "2026-12-02T01:00:00.000Z",
    "2026-12-02T02:00:00.000Z",
    {
      originalStaff: me,
    },
  );
  const past = request(
    "past",
    "2026-11-20T23:00:00.000Z",
    "2026-11-21T00:00:00.000Z",
  );

  it("offers only open needs of others I'm free for the whole of", () => {
    const lists = coverLists({
      requests: [clashes, outside, fits, covered, mine, past],
      staffProfileId: "me",
      myInputs: myInputs(),
      now,
    });
    expect(lists.couldCover.map((r) => r.id)).toEqual(["fits"]);
    expect(lists.mine.map((r) => r.id)).toEqual(["mine"]);
  });

  it("time away I've marked takes me out", () => {
    const lists = coverLists({
      requests: [fits],
      staffProfileId: "me",
      myInputs: myInputs({
        blackouts: [
          {
            id: "b",
            startsAt: "2026-11-30T08:00:00.000Z",
            endsAt: "2026-12-01T08:00:00.000Z",
          },
        ],
      }),
      now,
    });
    expect(lists.couldCover).toEqual([]);
  });

  it("keeps needs where the club named me apart, with my side of the state", () => {
    const asked = request("asked", fits.startsAt, fits.endsAt, {
      status: "asking",
      offers: [
        {
          id: "o1",
          staff: me,
          rank: 0,
          status: "asked",
        },
      ],
    });
    const lists = coverLists({
      requests: [asked],
      staffProfileId: "me",
      myInputs: myInputs(),
      now,
    });
    expect(lists.offered.map((r) => r.id)).toEqual(["asked"]);
    expect(lists.couldCover).toEqual([]);
    expect(coverStateCopy(asked, "me").label).toBe("You were asked");
    const assigned = {
      ...asked,
      status: "covered" as const,
      coveredBy: me,
      offers: [{ ...asked.offers[0]!, status: "assigned" as const }],
    };
    expect(coverStateCopy(assigned, "me").label).toBe("You're covering");
    expect(coverReasonLine(assigned, "me")).toBe(
      "Noa Lee has time off. Covered by you.",
    );
    const withdrawn = {
      ...asked,
      offers: [{ ...asked.offers[0]!, status: "withdrawn" as const }],
    };
    expect(coverStateCopy(withdrawn, "me").label).toBe("No longer needed");
  });

  it("speaks to me about my own needs", () => {
    expect(coverReasonLine(mine, "me")).toBe("You have time off.");
    expect(coverStateCopy(mine, "me").label).toBe("Needs cover");
  });

  it("reads the demo requests without throwing", () => {
    const lists = coverLists({
      requests: teamAvailabilityDemoCoverageRequests,
      staffProfileId: "nobody",
      myInputs: myInputs(),
      now,
    });
    expect(lists.mine).toEqual([]);
  });
});
