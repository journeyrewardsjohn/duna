import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  compareDates,
  dayRange,
  daysBetween,
  daysInMonth,
  formatIsoDate,
  formatTime,
  formatTimeLabel,
  isIsoDate,
  isoDateOf,
  parseIsoDate,
  parseTime,
  timeSlots,
  toIsoDate,
  weekdayOf,
} from "./date-utils";

describe("date math", () => {
  it("accepts only real calendar dates", () => {
    expect(parseIsoDate("2026-11-25")).toEqual({
      year: 2026,
      month: 11,
      day: 25,
    });
    expect(isIsoDate("2028-02-29")).toBe(true);
    for (const bad of [
      "2026-02-29",
      "2026-13-01",
      "2026-00-10",
      "2026-1-5",
      "today",
      "",
    ]) {
      expect(isIsoDate(bad), bad).toBe(false);
    }
    expect(toIsoDate({ year: 987, month: 3, day: 4 })).toBe("0987-03-04");
  });

  it("adds days across months, years and leap days", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-11-25", 0)).toBe("2026-11-25");
    expect(() => addDays("2026-02-30", 1)).toThrow(RangeError);
  });

  it("does not drift across a daylight-saving change", () => {
    // Europe moves its clocks on 2026-03-29 and 2026-10-25.
    expect(dayRange("2026-03-28", 3)).toEqual([
      "2026-03-28",
      "2026-03-29",
      "2026-03-30",
    ]);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
  });

  it("adds months and clamps to the last day", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-25", 2)).toBe("2027-01-25");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2026-01-15", -13)).toBe("2024-12-15");
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
  });

  it("compares, measures and names days", () => {
    expect(compareDates("2026-11-25", "2026-11-26")).toBeLessThan(0);
    expect(compareDates("2026-11-25", "2026-11-25")).toBe(0);
    expect(daysBetween("2026-11-25", "2026-11-18")).toBe(-7);
    expect(weekdayOf("2026-11-25")).toBe(3);
    expect(dayRange("2026-11-25", 0)).toEqual([]);
    expect(dayRange("2026-11-25", -2)).toEqual([]);
  });

  it("formats a calendar date the same in every time zone", () => {
    expect(
      formatIsoDate("2026-11-25", "en", { weekday: "short", day: "numeric" }),
    ).toBe("25 Wed");
    expect(formatIsoDate("2026-01-01", "en", { month: "short" })).toBe("Jan");
  });

  it("reads the calendar date of an instant in a given zone", () => {
    const instant = new Date("2026-11-25T23:30:00Z");
    expect(isoDateOf(instant, "UTC")).toBe("2026-11-25");
    expect(isoDateOf(instant, "Europe/Berlin")).toBe("2026-11-26");
    expect(isoDateOf(instant, "America/Los_Angeles")).toBe("2026-11-25");
  });
});

describe("time math", () => {
  it("parses and formats 24-hour times", () => {
    expect(parseTime("18:30")).toBe(1110);
    expect(parseTime("00:00")).toBe(0);
    for (const bad of ["24:00", "12:60", "9:30", "noon"]) {
      expect(parseTime(bad), bad).toBeNull();
    }
    expect(formatTime(1110)).toBe("18:30");
    expect(formatTime(1440 + 5)).toBe("00:05");
    expect(formatTime(-30)).toBe("23:30");
  });

  it("builds slots from start up to, not including, end", () => {
    expect(
      timeSlots({ start: "17:00", end: "19:00", stepMinutes: 30 }),
    ).toEqual(["17:00", "17:30", "18:00", "18:30"]);
    expect(
      timeSlots({ start: "08:00", end: "09:30", stepMinutes: 60 }),
    ).toEqual(["08:00", "09:00"]);
    expect(
      timeSlots({ start: "10:00", end: "10:00", stepMinutes: 30 }),
    ).toEqual([]);
    expect(() =>
      timeSlots({ start: "10:00", end: "12:00", stepMinutes: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      timeSlots({ start: "25:00", end: "12:00", stepMinutes: 30 }),
    ).toThrow(RangeError);
  });

  it("labels a time on a 12 or 24 hour clock", () => {
    expect(formatTimeLabel("18:30", "en", 24)).toBe("18:30");
    expect(formatTimeLabel("18:30", "en", 12)).toMatch(/^6:30\sPM$/);
    expect(formatTimeLabel("00:05", "en", 24)).toBe("00:05");
  });
});
