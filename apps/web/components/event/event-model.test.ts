import type { EventSummary, TournamentCompetitionSnapshot } from "@duna/api";
import { demoEvents } from "@duna/core/demo";
import { describe, expect, it } from "vitest";
import {
  directionsHref,
  divisionRows,
  eventPhase,
  eventWhen,
  lowestEntry,
  scheduleRows,
} from "./event-model";

const tournament = demoEvents.find(
  (event) => event.slug === "sunset-open-qualifier",
)! as EventSummary;
const division = tournament.divisions![0]!;

describe("event states: open, waitlist, live, final, cancelled", () => {
  it("open while any division has room", () => {
    expect(
      eventPhase({ ...tournament, live: false, lifecycleStatus: "active" }),
    ).toBe("open");
  });

  it("waitlist when every division is full", () => {
    expect(
      eventPhase({
        ...tournament,
        live: false,
        lifecycleStatus: "active",
        divisions: tournament.divisions!.map((entry) => ({
          ...entry,
          spotsRemaining: 0,
        })),
      }),
    ).toBe("waitlist");
  });

  it("live while a match is on (the one Solar state)", () => {
    expect(
      eventPhase({ ...tournament, live: true, lifecycleStatus: "active" }),
    ).toBe("live");
  });

  it("final once it is over; cancelled wins over everything", () => {
    expect(
      eventPhase({ ...tournament, live: false, lifecycleStatus: "completed" }),
    ).toBe("final");
    expect(
      eventPhase({ ...tournament, live: true, lifecycleStatus: "cancelled" }),
    ).toBe("cancelled");
  });
});

describe("divisions in the shared words, prices all-in", () => {
  it("spots left and a counted waitlist, never a name", () => {
    const rows = divisionRows({
      slug: tournament.slug,
      divisions: [{ ...division, spotsRemaining: 0 }],
      registrationTeams: [
        {
          id: "00000000-0000-4000-8000-000000000101",
          divisionId: division.id,
          divisionName: division.name,
          name: "Private Name / Another",
          status: "waitlisted",
          registeredAt: "2026-07-01T00:00:00.000Z",
          players: [],
        },
      ],
    });
    expect(rows[0]!.spots).toBe("Full");
    expect(rows[0]!.waiting).toBe("1 waiting");
    expect(JSON.stringify(rows)).not.toContain("Private Name");
    expect(rows[0]!.registerHref).toBe(
      `/checkout/${tournament.slug}?division=${division.id}`,
    );
  });

  it("entry prices are all-in (registration fee included)", () => {
    const row = divisionRows(tournament)[0]!;
    expect(row.playerPrice!.allInMinor).toBeGreaterThanOrEqual(
      division.playerPrice.amountMinor,
    );
    const entry = lowestEntry(tournament);
    expect(entry.price.label).toMatch(/^\$|^Free$/);
  });
});

describe("dates in the venue's time zone", () => {
  it("formats day and time in the event's zone, with the zone named", () => {
    const when = eventWhen({
      startsAt: "2026-12-12T17:00:00.000Z",
      endsAt: "2026-12-13T01:00:00.000Z",
      timezone: "America/Los_Angeles",
    });
    expect(when.day).toBe("Saturday, December 12");
    expect(when.time).toBe("9:00 AM – 5:00 PM PST");
    expect(when.multiDay).toBe(false);
  });
});

describe("schedule and results", () => {
  const snapshot = {
    session: {
      id: "00000000-0000-4000-8000-000000000201",
      title: "Open",
      status: "live",
      timezone: "America/Los_Angeles",
      updatedAt: "2026-12-12T17:00:00.000Z",
    },
    divisions: [
      {
        id: "00000000-0000-4000-8000-000000000202",
        name: "Open",
        competitionVersion: 1,
        format: "single-elimination",
        pools: [],
        rounds: [],
        matches: [
          {
            id: "00000000-0000-4000-8000-000000000203",
            logicalId: "W1-1",
            bracket: "winners",
            round: 1,
            position: 1,
            label: "Round 1 · Match 1",
            status: "live",
            teamA: {
              id: "00000000-0000-4000-8000-000000000301",
              name: "Hidden A",
            },
            courtName: "Court 2",
            scheduledAt: "2026-12-12T17:00:00.000Z",
            score: { status: "live", sets: [[12, 10]] },
          },
          {
            id: "00000000-0000-4000-8000-000000000204",
            logicalId: "W1-2",
            bracket: "winners",
            round: 1,
            position: 2,
            label: "Round 1 · Match 2",
            status: "complete",
            scheduledAt: "2026-12-12T16:00:00.000Z",
            score: {
              status: "complete",
              sets: [
                [21, 15],
                [21, 18],
              ],
            },
          },
          {
            id: "00000000-0000-4000-8000-000000000205",
            logicalId: "W2-1",
            bracket: "winners",
            round: 2,
            position: 1,
            label: "Semifinal",
            status: "scheduled",
            scheduledAt: "2026-12-12T19:00:00.000Z",
          },
        ],
      },
    ],
  } as unknown as TournamentCompetitionSnapshot;

  it("sorts by time, links live to the live page and finals to the match page, names no team", () => {
    const rows = scheduleRows(snapshot);
    expect(rows.map((row) => row.status)).toEqual([
      "final",
      "live",
      "scheduled",
    ]);
    expect(rows[1]!.href).toBe("/live/00000000-0000-4000-8000-000000000203");
    expect(rows[0]!.href).toBe("/matches/00000000-0000-4000-8000-000000000204");
    expect(rows[2]!.href).toBeUndefined();
    expect(JSON.stringify(rows)).not.toContain("Hidden A");
  });

  it("no snapshot, no rows", () => {
    expect(scheduleRows(undefined)).toEqual([]);
  });
});

describe("directions", () => {
  it("prefers coordinates and passes the place id", () => {
    expect(
      directionsHref({
        name: "Pier",
        latitude: 33.88,
        longitude: -118.41,
        googlePlaceId: "abc",
      }),
    ).toBe(
      "https://www.google.com/maps/search/?api=1&query=33.88%2C-118.41&query_place_id=abc",
    );
  });
});
