import { describe, expect, it } from "vitest";
import {
  attendanceToMark,
  buildDayModel,
  conditionsAt,
  entryState,
  groupAgenda,
  needsMoreLabel,
  type DayEntryInput,
  type DayVenueInput,
} from "./day-model";
import { previewAtRisk, previewDayEntries, previewVenue } from "./preview-day";

const zone = "America/Los_Angeles";
// Wed 25 Nov 2026, 3:50 PM in Los Angeles.
const now = Date.parse("2026-11-25T23:50:00Z");
const at = (iso: string) => new Date(iso).toISOString();

const venue: DayVenueInput = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Sunset Beach Club",
  latitude: 34.0,
  longitude: -118.5,
  weather: {
    fetchedAt: at("2026-11-25T23:30:00Z"),
    hourly: [
      {
        startsAt: at("2026-11-25T23:00:00Z"),
        temperatureC: 19,
        windSpeedKph: 14,
        windGustKph: 18,
        windFromDeg: 270,
      },
      {
        startsAt: at("2026-11-26T00:00:00Z"),
        temperatureC: 18,
        windSpeedKph: 13,
        windGustKph: 16,
        windFromDeg: 270,
      },
    ],
  },
  courts: [
    { id: "c1", lit: false },
    { id: "c3", lit: true },
  ],
};

function entry(
  overrides: Partial<DayEntryInput> & { id: string },
): DayEntryInput {
  return {
    sourceType: "session",
    title: "Group clinic",
    startsAt: at("2026-11-26T00:30:00Z"),
    endsAt: at("2026-11-26T02:00:00Z"),
    status: "scheduled",
    venueId: venue.id,
    venueName: venue.name,
    courtId: "c1",
    courtName: "Courts 1–2",
    coachName: "Jordan Cruz",
    participantCount: 7,
    capacity: 9,
    attendees: [],
    ...overrides,
  };
}

describe("entry state", () => {
  it("live, later, done, busy and cancelled", () => {
    expect(entryState(entry({ id: "a" }), now)).toBe("later");
    expect(
      entryState(entry({ id: "b", startsAt: at("2026-11-25T23:00:00Z") }), now),
    ).toBe("live");
    expect(
      entryState(
        entry({
          id: "c",
          startsAt: at("2026-11-25T20:00:00Z"),
          endsAt: at("2026-11-25T21:00:00Z"),
        }),
        now,
      ),
    ).toBe("done");
    expect(entryState(entry({ id: "d", sourceType: "busy-block" }), now)).toBe(
      "busy",
    );
    expect(entryState(entry({ id: "e", status: "cancelled" }), now)).toBe(
      "cancelled",
    );
  });

  it("counts attendance still to mark only after the session ends", () => {
    const roster = [
      {
        displayName: "A",
        status: "confirmed",
        attendanceStatus: "scheduled" as const,
      },
      { displayName: "B", status: "confirmed" },
      {
        displayName: "C",
        status: "confirmed",
        attendanceStatus: "attended" as const,
      },
      { displayName: "D", status: "cancelled" },
    ];
    const ended = entry({
      id: "x",
      startsAt: at("2026-11-25T20:00:00Z"),
      endsAt: at("2026-11-25T21:00:00Z"),
      attendees: roster,
    });
    expect(attendanceToMark(ended, now)).toBe(2);
    expect(attendanceToMark(entry({ id: "y", attendees: roster }), now)).toBe(
      0,
    );
  });

  it("says a group's shortfall in the shared participation words", () => {
    expect(needsMoreLabel(2, 4)).toBe("Needs 2 more");
    expect(needsMoreLabel(3, 4)).toBe("Needs 1 more");
    expect(needsMoreLabel(4, 4)).toBeNull();
  });
});

describe("the day model", () => {
  const entries = [
    entry({
      id: "earlier",
      title: "U14 training",
      startsAt: at("2026-11-25T17:00:00Z"),
      endsAt: at("2026-11-25T18:00:00Z"),
      attendees: [{ displayName: "A", status: "confirmed" }],
    }),
    entry({
      id: "live",
      title: "Group clinic",
      startsAt: at("2026-11-25T23:30:00Z"),
      endsAt: at("2026-11-26T01:00:00Z"),
    }),
    entry({
      id: "private",
      title: "Private · Noa Williams",
      startsAt: at("2026-11-26T02:00:00Z"),
      endsAt: at("2026-11-26T03:00:00Z"),
      courtId: "c3",
      courtName: "Court 3",
      participantCount: 1,
      capacity: 1,
    }),
    entry({
      id: "tomorrow",
      startsAt: at("2026-11-26T18:00:00Z"),
      endsAt: at("2026-11-26T19:00:00Z"),
    }),
    entry({
      id: "busy",
      sourceType: "busy-block",
      title: "",
      startsAt: at("2026-11-25T15:00:00Z"),
      endsAt: at("2026-11-25T16:00:00Z"),
      participantCount: 0,
      capacity: 0,
    }),
  ];
  const model = buildDayModel({
    entries,
    venues: [venue],
    matches: [
      {
        id: "m-later",
        status: "scheduled",
        scheduledAt: at("2026-11-26T01:00:00Z"),
        courtName: "Court 6",
        teamA: { name: "Park / Chen" },
        teamB: { name: "K.R. / T.M." },
      },
      {
        id: "m-live",
        status: "live",
        scheduledAt: at("2026-11-25T23:15:00Z"),
        courtName: "Court 2",
        teamA: { name: "Maya / Zoe" },
        teamB: { name: "Ari / Liv" },
      },
      {
        id: "m-done",
        status: "completed",
        courtName: "Court 1",
        teamA: { name: "X" },
        teamB: { name: "Y" },
      },
    ],
    atRisk: [
      {
        subjectId: "private",
        title: "Private · Noa Williams",
        startsAt: at("2026-11-26T02:00:00Z"),
        booked: 2,
        min: 4,
        capacity: 6,
        lockAt: at("2026-11-26T01:00:00Z"),
        displayState: "needs-players",
      },
    ],
    now,
    timeZone: zone,
  });

  it("is today's local day, in the venue's zone", () => {
    expect(model.dateKey).toBe("2026-11-25");
    expect(model.dateLine).toBe("Wednesday, November 25");
    // 6 PM local on the 25th is the 26th in UTC and still today.
    expect(model.agenda.map((item) => item.id)).toEqual([
      "busy",
      "earlier",
      "live",
      "private",
    ]);
    expect(model.sessionCount).toBe(3);
  });

  it("focuses the live session and lists what is next and later", () => {
    expect(model.focusReason).toBe("live");
    expect(model.focus?.id).toBe("live");
    expect(model.focus?.coming).toBe("7 of 9 coming");
    expect(model.later.map((item) => item.id)).toEqual(["private"]);
    expect(model.later[0]?.state).toBe("next");
  });

  it("marks light on the time rail (lit courts are under lights after sunset)", () => {
    const privateLesson = model.agenda.find((item) => item.id === "private");
    expect(privateLesson?.light).toBe("under-lights");
    const clinic = model.agenda.find((item) => item.id === "live");
    // 3:30 PM in late November is before golden hour (about 3:50 PM).
    expect(clinic?.light).toBe("daylight");
  });

  it("puts what needs the coach in Needs you, with the participation words", () => {
    expect(model.needsYou.map((item) => item.kind)).toEqual([
      "minimum",
      "attendance",
    ]);
    expect(model.needsYou[0]?.title).toBe(
      "Private · Noa Williams: needs 2 more",
    );
    expect(
      model.agenda.find((item) => item.id === "private")?.needs[0]?.label,
    ).toBe("Needs 2 more");
    expect(model.needsYou[1]?.entryId).toBe("earlier");
  });

  it("lists matches on the coach's courts, live first, never finished ones", () => {
    expect(model.matches.map((match) => match.id)).toEqual([
      "m-live",
      "m-later",
    ]);
    expect(model.matches[0]).toMatchObject({ live: true, when: "Live" });
    expect(model.matches[1]?.when).toBe("5:00 PM");
  });

  it("is not complete while sessions remain; complete when none are left", () => {
    expect(model.complete).toBeNull();
    const evening = buildDayModel({
      entries,
      venues: [venue],
      matches: [],
      atRisk: [],
      now: Date.parse("2026-11-26T05:30:00Z"),
      timeZone: zone,
    });
    expect(evening.focus).toBeNull();
    expect(evening.complete).toEqual({ sessions: 3, checkedIn: 0, toMark: 1 });
  });

  it("an empty day has no focus, no complete card and an empty agenda", () => {
    const empty = buildDayModel({
      entries: [],
      venues: [],
      matches: [],
      atRisk: [],
      now,
      timeZone: zone,
    });
    expect(empty.focus).toBeNull();
    expect(empty.complete).toBeNull();
    expect(empty.agenda).toEqual([]);
    expect(empty.conditions).toBeNull();
  });

  it("builds another day for Schedule", () => {
    const tomorrow = buildDayModel({
      entries,
      venues: [venue],
      matches: [],
      atRisk: [],
      now,
      timeZone: zone,
      dateKey: "2026-11-26",
    });
    expect(tomorrow.agenda.map((item) => item.id)).toEqual(["tomorrow"]);
    expect(tomorrow.dateLine).toBe("Thursday, November 26");
    expect(tomorrow.complete).toBeNull();
  });
});

describe("conditions", () => {
  it("takes the forecast hour closest to the time, with sun and lit courts", () => {
    const conditions = conditionsAt(venue, now, zone)!;
    // 3:50 PM: the 4 PM hour is closer than the 3 PM hour.
    expect(conditions.hour).toMatchObject({
      temperatureC: 18,
      windSpeedKph: 13,
      windFromDeg: 270,
    });
    expect(conditions.sun?.sunset).not.toBeNull();
    expect(conditions.courtIsLit).toBe(true);
    expect(conditions.configured).toBe(true);
    expect(conditions.label).toBe("Conditions · Wed, Nov 25");
    expect(conditions.hours.length).toBe(2);
  });

  it("never invents weather: no forecast means not configured, far hours mean no data", () => {
    const bare = conditionsAt({ ...venue, weather: undefined }, now, zone)!;
    expect(bare.configured).toBe(false);
    expect(bare.hour).toBeNull();
    expect(bare.sun).not.toBeNull();
    const later = conditionsAt(venue, now + 6 * 3_600_000, zone)!;
    expect(later.configured).toBe(true);
    expect(later.hour).toBeNull();
    expect(conditionsAt(undefined, now, zone)).toBeNull();
  });
});

describe("schedule views", () => {
  const model = buildDayModel({
    entries: previewDayEntries(now),
    venues: [previewVenue(now)],
    matches: [],
    atRisk: previewAtRisk(now),
    now,
    timeZone: zone,
  });

  it("groups by court and by coach (board P04-Schedule)", () => {
    expect(groupAgenda(model.agenda, "agenda")).toHaveLength(1);
    const byCourt = groupAgenda(model.agenda, "court");
    expect(byCourt.map((group) => group.title)).toEqual([
      "Court 3",
      "Courts 1–2",
      "Courts 5–6",
    ]);
    expect(byCourt[2]?.meta).toBe("2 sessions");
    const byCoach = groupAgenda(model.agenda, "coach");
    expect(byCoach.map((group) => group.title)).toEqual([
      "Jordan Cruz",
      "Theo Park",
    ]);
  });

  it("the preview day shows every state a coach meets", () => {
    const states = new Set(model.agenda.map((item) => item.state));
    expect(states.has("live")).toBe(true);
    expect(model.needsYou.some((item) => item.kind === "minimum")).toBe(true);
    expect(model.needsYou.some((item) => item.kind === "attendance")).toBe(
      true,
    );
  });
});
