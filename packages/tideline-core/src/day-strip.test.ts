import { describe, expect, it } from "vitest";
import { dayStrip } from "./day-strip";
import { zonedTimeToInstant } from "./zoned-time";

const LA = "America/Los_Angeles";
const at = (y: number, m: number, d: number, minutes: number) =>
  zonedTimeToInstant({ year: y, month: m, day: d }, minutes, LA);

describe("dayStrip", () => {
  // Saturday 28 Nov 2026, 9:00 AM in Los Angeles.
  const now = at(2026, 11, 28, 9 * 60);

  it("shows seven days from today with counts, today and empty days", () => {
    const strip = dayStrip({
      timeZone: LA,
      now,
      items: [
        { startsAt: at(2026, 11, 28, 18 * 60) },
        { startsAt: at(2026, 11, 28, 20 * 60) },
        { startsAt: at(2026, 11, 30, 10 * 60) },
        { startsAt: at(2026, 12, 20, 10 * 60) }, // outside the strip
      ],
    });
    expect(strip.days).toHaveLength(7);
    expect(strip.days.map((d) => d.date)[0]).toBe("2026-11-28");
    expect(strip.days.map((d) => d.count)).toEqual([2, 0, 1, 0, 0, 0, 0]);
    expect(strip.days.map((d) => d.isEmpty)).toEqual([
      false,
      true,
      false,
      true,
      true,
      true,
      true,
    ]);
    expect(strip.todayIndex).toBe(0);
    expect(strip.days[0]).toMatchObject({
      isToday: true,
      isPast: false,
      weekday: 6,
      dayOfMonth: 28,
    });
    expect(strip.total).toBe(3);
  });

  it("buckets an evening item by the venue's day, not UTC", () => {
    // 11:30 PM Pacific on the 28th is already the 29th in UTC.
    const strip = dayStrip({
      timeZone: LA,
      now,
      items: [{ startsAt: at(2026, 11, 28, 23 * 60 + 30) }],
    });
    expect(strip.days[0]?.count).toBe(1);
    expect(strip.days[1]?.count).toBe(0);
  });

  it("week mode aligns to the week start and marks boundaries", () => {
    const sunday = dayStrip({
      timeZone: LA,
      now,
      items: [],
      mode: "week",
      days: 14,
    });
    expect(sunday.days[0]?.date).toBe("2026-11-22"); // Sunday
    expect(sunday.days.filter((d) => d.startsWeek).map((d) => d.date)).toEqual([
      "2026-11-22",
      "2026-11-29",
    ]);
    expect(sunday.todayIndex).toBe(6);
    expect(sunday.days[0]?.isPast).toBe(true);
    const monday = dayStrip({
      timeZone: LA,
      now,
      items: [],
      mode: "week",
      weekStartsOn: 1,
    });
    expect(monday.days[0]?.date).toBe("2026-11-23");
    expect(monday.todayIndex).toBe(5);
    // Negative or large values wrap.
    const wrapped = dayStrip({
      timeZone: LA,
      now,
      items: [],
      mode: "week",
      weekStartsOn: -6,
    });
    expect(wrapped.days[0]?.date).toBe("2026-11-23");
  });

  it("rolling mode can start on a given date and reports today outside the strip", () => {
    const strip = dayStrip({
      timeZone: LA,
      now,
      items: [],
      startDate: "2026-12-01",
      days: 3,
    });
    expect(strip.days.map((d) => d.date)).toEqual([
      "2026-12-01",
      "2026-12-02",
      "2026-12-03",
    ]);
    expect(strip.todayIndex).toBe(-1);
    expect(strip.days[0]?.isPast).toBe(false);
  });

  it("falls back to today for a bad start date and at least one day", () => {
    const strip = dayStrip({
      timeZone: LA,
      now,
      items: [],
      startDate: "garbage",
      days: 0,
    });
    expect(strip.days).toHaveLength(1);
    expect(strip.days[0]?.date).toBe("2026-11-28");
  });

  it("flags daylight-saving days and keeps counts right across them", () => {
    const springNow = at(2026, 3, 7, 12 * 60);
    const spring = dayStrip({
      timeZone: LA,
      now: springNow,
      days: 3,
      items: [
        { startsAt: at(2026, 3, 8, 15 * 60) },
        { startsAt: at(2026, 3, 9, 0) },
      ],
    });
    expect(spring.days.map((d) => d.dst)).toEqual([
      "none",
      "spring-forward",
      "none",
    ]);
    expect(spring.days[1]).toMatchObject({ lengthMinutes: 1380, count: 1 });
    expect(spring.days[2]?.count).toBe(1);

    const fall = dayStrip({
      timeZone: LA,
      now: at(2026, 10, 31, 12 * 60),
      days: 3,
      items: [],
    });
    expect(fall.days.map((d) => d.dst)).toEqual(["none", "fall-back", "none"]);
    expect(fall.days[1]?.lengthMinutes).toBe(1500);
  });

  it("flags a half-hour daylight-saving shift", () => {
    const strip = dayStrip({
      timeZone: "Australia/Lord_Howe",
      now: Date.UTC(2026, 3, 4, 0, 0),
      days: 3,
      items: [],
    });
    expect(strip.days.some((d) => d.dst === "fall-back")).toBe(true);
  });
});
