import { describe, expect, it } from "vitest";
import {
  addDays,
  dayLengthMinutes,
  localDateOf,
  parseIsoDate,
  toIsoDate,
  weekdayOf,
  zonedParts,
  zonedTimeToInstant,
  zoneOffsetMs,
} from "./zoned-time";

const LA = "America/Los_Angeles";

describe("zoned-time", () => {
  it("reads wall-clock parts in a zone", () => {
    expect(zonedParts(Date.UTC(2026, 10, 28, 23, 45, 10), LA)).toEqual({
      year: 2026,
      month: 11,
      day: 28,
      hour: 15,
      minute: 45,
      second: 10,
    });
    // Midnight is hour 0, not 24.
    expect(zonedParts(Date.UTC(2026, 10, 28, 8, 0), LA).hour).toBe(0);
  });
  it("finds the zone offset", () => {
    expect(zoneOffsetMs(Date.UTC(2026, 6, 1), LA)).toBe(-7 * 3_600_000);
    expect(zoneOffsetMs(Date.UTC(2026, 11, 1), LA)).toBe(-8 * 3_600_000);
  });
  it("parses and formats dates", () => {
    expect(parseIsoDate("2026-02-29")).toBeNull();
    expect(parseIsoDate("2028-02-29")).toEqual({
      year: 2028,
      month: 2,
      day: 29,
    });
    expect(parseIsoDate("nope")).toBeNull();
    expect(toIsoDate({ year: 2026, month: 3, day: 8 })).toBe("2026-03-08");
  });
  it("adds days across month and year ends", () => {
    expect(addDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({
      year: 2027,
      month: 1,
      day: 1,
    });
    expect(addDays({ year: 2026, month: 3, day: 1 }, -1)).toEqual({
      year: 2026,
      month: 2,
      day: 28,
    });
  });
  it("gives the weekday", () => {
    expect(weekdayOf({ year: 2026, month: 11, day: 27 })).toBe(5);
  });
  it("local date follows the zone", () => {
    expect(localDateOf(Date.UTC(2026, 10, 29, 2, 0), LA)).toBe("2026-11-28");
    expect(localDateOf(Date.UTC(2026, 10, 29, 2, 0), "Pacific/Auckland")).toBe(
      "2026-11-29",
    );
  });
  it("converts wall time to an instant, including the repeated hour", () => {
    expect(
      zonedTimeToInstant({ year: 2026, month: 11, day: 28 }, 15 * 60 + 45, LA),
    ).toBe(Date.UTC(2026, 10, 28, 23, 45));
    // 1:30 AM on 1 Nov 2026 happens twice in Los Angeles; the first is PDT.
    expect(zonedTimeToInstant({ year: 2026, month: 11, day: 1 }, 90, LA)).toBe(
      Date.UTC(2026, 10, 1, 8, 30),
    );
  });
  it("day length shows daylight-saving days", () => {
    expect(dayLengthMinutes({ year: 2026, month: 3, day: 8 }, LA)).toBe(1380);
    expect(dayLengthMinutes({ year: 2026, month: 11, day: 1 }, LA)).toBe(1500);
    expect(dayLengthMinutes({ year: 2026, month: 11, day: 28 }, LA)).toBe(1440);
    expect(dayLengthMinutes({ year: 2026, month: 11, day: 28 }, "UTC")).toBe(
      1440,
    );
  });
});
