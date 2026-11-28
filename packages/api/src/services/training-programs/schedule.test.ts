/**
 * Training programs (B4): the pure schedule maths — weekly slots to
 * practices across time zones and daylight-saving changes, intervals,
 * exceptions, and regeneration that never touches a booked session.
 */
import { describe, expect, it } from "vitest";
import {
  currentWeekNumber,
  generateOccurrences,
  planRegeneration,
  programWeeks,
  sessionKey,
  weeksOff,
} from "./schedule";

const monWed = [
  { weekday: 1, startsAt: "16:00", endsAt: "18:00", intervalWeeks: 1 },
  { weekday: 3, startsAt: "16:00", endsAt: "18:00", intervalWeeks: 1 },
];

/** mulberry32: a seeded generator so property runs are reproducible. */
function prng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

describe("generateOccurrences", () => {
  it("keeps 4 PM local across the end of daylight saving (Los Angeles)", () => {
    const occurrences = generateOccurrences({
      startDate: "2026-10-26",
      endDate: "2026-11-08",
      timezone: "America/Los_Angeles",
      slots: [monWed[0]!],
      exceptions: [],
    });
    expect(occurrences.map((item) => item.startsAt.toISOString())).toEqual([
      "2026-10-26T23:00:00.000Z", // PDT, UTC−7
      "2026-11-03T00:00:00.000Z", // PST, UTC−8: still 4 PM local
    ]);
    expect(occurrences.every((item) => item.endMinute - item.startMinute === 120)).toBe(true);
  });

  it("keeps wall-clock time across the start of summer time (London)", () => {
    const occurrences = generateOccurrences({
      startDate: "2027-03-22",
      endDate: "2027-04-02",
      timezone: "Europe/London",
      slots: [{ weekday: 1, startsAt: "09:00", endsAt: "10:30", intervalWeeks: 1 }],
      exceptions: [],
    });
    expect(occurrences.map((item) => item.startsAt.toISOString())).toEqual([
      "2027-03-22T09:00:00.000Z",
      "2027-03-29T08:00:00.000Z",
    ]);
  });

  it("skips exception dates and honours every-other-week slots", () => {
    const occurrences = generateOccurrences({
      startDate: "2026-11-23",
      endDate: "2026-12-20",
      timezone: "UTC",
      slots: [
        monWed[0]!,
        { weekday: 6, startsAt: "09:00", endsAt: "11:00", intervalWeeks: 2 },
      ],
      exceptions: [{ startsOn: "2026-11-30", endsOn: "2026-12-06" }],
    });
    expect(occurrences.map((item) => item.key)).toEqual([
      "2026-11-23|16:00",
      "2026-11-28|09:00",
      "2026-12-07|16:00",
      "2026-12-12|09:00",
      "2026-12-14|16:00",
    ]);
  });

  it("returns nothing for an inverted or over-long range", () => {
    const base = { timezone: "UTC", slots: monWed, exceptions: [] };
    expect(generateOccurrences({ ...base, startDate: "2027-01-02", endDate: "2027-01-01" })).toEqual([]);
    expect(generateOccurrences({ ...base, startDate: "2026-01-01", endDate: "2029-01-01" })).toEqual([]);
  });

  it("property: every practice is inside the range, on its weekday, outside exceptions, unique and sorted", () => {
    const zones = ["UTC", "America/Los_Angeles", "Europe/London", "Australia/Sydney", "Asia/Kolkata"];
    const random = prng(20261128);
    for (let run = 0; run < 150; run += 1) {
      const start = new Date(Date.UTC(2026, 0, 1) + Math.floor(random() * 700) * 86_400_000);
      const startDate = start.toISOString().slice(0, 10);
      const endDate = new Date(start.getTime() + Math.floor(random() * 120) * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const timezone = zones[Math.floor(random() * zones.length)]!;
      const slots = Array.from({ length: 1 + Math.floor(random() * 4) }, () => {
        const startMinute = Math.floor(random() * 20) * 60 + (random() < 0.5 ? 0 : 30);
        const end = Math.min(startMinute + 30 + Math.floor(random() * 4) * 30, 23 * 60 + 30);
        const time = (minute: number) =>
          `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
        return {
          weekday: Math.floor(random() * 7),
          startsAt: time(startMinute),
          endsAt: time(end),
          intervalWeeks: 1 + Math.floor(random() * 3),
        };
      });
      const exceptionStart = new Date(start.getTime() + Math.floor(random() * 60) * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const exceptions = [{ startsOn: exceptionStart, endsOn: exceptionStart }];
      const occurrences = generateOccurrences({ startDate, endDate, timezone, slots, exceptions });
      const keys = new Set<string>();
      for (const [index, occurrence] of occurrences.entries()) {
        expect(occurrence.localDate >= startDate && occurrence.localDate <= endDate).toBe(true);
        expect(occurrence.localDate).not.toBe(exceptionStart);
        expect(new Date(`${occurrence.localDate}T00:00:00Z`).getUTCDay()).toBe(
          slots[occurrence.slotIndex]!.weekday,
        );
        // The instant reads back as the same local date and time.
        expect(sessionKey(occurrence.startsAt, timezone)).toBe(occurrence.key);
        expect(occurrence.endsAt > occurrence.startsAt).toBe(true);
        expect(keys.has(occurrence.key)).toBe(false);
        keys.add(occurrence.key);
        if (index > 0) {
          expect(occurrence.startsAt >= occurrences[index - 1]!.startsAt).toBe(true);
        }
      }
    }
  });
});

describe("planRegeneration", () => {
  const now = new Date("2026-12-01T00:00:00.000Z");
  const desired = generateOccurrences({
    startDate: "2026-11-23",
    endDate: "2026-12-20",
    timezone: "UTC",
    slots: [monWed[0]!],
    exceptions: [],
  });

  it("creates future practices and is idempotent", () => {
    const first = planRegeneration({ desired, existing: [], now });
    expect(first.create.map((item) => item.localDate)).toEqual([
      "2026-12-07",
      "2026-12-14",
    ]);
    const existing = first.create.map((occurrence, index) => ({
      id: `e${index}`,
      key: occurrence.key,
      startsAt: occurrence.startsAt,
      status: "planned",
      source: "program",
      touched: false,
    }));
    const second = planRegeneration({ desired, existing, now });
    expect(second).toEqual({ create: [], remove: [], keep: ["e0", "e1"], needsReview: [] });
  });

  it("never removes a booked session or a manual, past or cancelled one", () => {
    const at = (date: string) => new Date(`${date}T16:00:00.000Z`);
    const existing = [
      { id: "booked", key: "2026-12-09|16:00", startsAt: at("2026-12-09"), status: "planned", source: "program", touched: true },
      { id: "free", key: "2026-12-10|16:00", startsAt: at("2026-12-10"), status: "planned", source: "program", touched: false },
      { id: "manual", key: "2026-12-11|16:00", startsAt: at("2026-12-11"), status: "planned", source: "manual", touched: false },
      { id: "past", key: "2026-11-25|16:00", startsAt: at("2026-11-25"), status: "planned", source: "program", touched: false },
      { id: "cancelled", key: "2026-12-07|16:00", startsAt: at("2026-12-07"), status: "cancelled", source: "program", touched: false },
    ];
    const plan = planRegeneration({ desired, existing, now });
    expect(plan.remove).toEqual(["free"]);
    expect(plan.needsReview).toEqual(["booked"]);
    expect(plan.keep).toEqual(expect.arrayContaining(["manual", "past", "cancelled"]));
    // The cancelled Monday keeps its slot: it is not re-created.
    expect(plan.create.map((item) => item.localDate)).toEqual(["2026-12-14"]);
  });
});

describe("weeks", () => {
  it("numbers weeks, finds the current one and counts full weeks off", () => {
    const weeks = programWeeks("2026-11-23", "2027-02-14");
    expect(weeks).toHaveLength(12);
    expect(weeks[4]).toEqual({ weekNumber: 5, startsOn: "2026-12-21" });
    expect(currentWeekNumber("2026-12-02", "2026-11-23", "2027-02-14")).toBe(2);
    expect(currentWeekNumber("2026-11-22", "2026-11-23", "2027-02-14")).toBeUndefined();
    expect(
      weeksOff(weeks, "2027-02-14", [{ startsOn: "2026-12-21", endsOn: "2027-01-03" }]),
    ).toBe(2);
  });
});
