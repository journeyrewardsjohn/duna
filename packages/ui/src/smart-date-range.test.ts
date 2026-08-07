import { describe, expect, it } from "vitest";
import {
  calendarMonthDays,
  normalizeDateRange,
  quickDateRange,
  splitLocalDateTime,
} from "./smart-date-range";

describe("smart date range", () => {
  it("builds an inclusive six-week calendar grid", () => {
    const days = calendarMonthDays(2026, 7);
    expect(days).toHaveLength(42);
    expect(days[0]).toEqual({ date: "2026-07-26", day: 26, inMonth: false });
    expect(days[41]).toEqual({ date: "2026-09-05", day: 5, inMonth: false });
  });

  it("offers future operational shortcuts", () => {
    expect(quickDateRange("this-weekend", "2026-08-07")).toEqual({
      start: "2026-08-08",
      end: "2026-08-09",
    });
    expect(quickDateRange("next-7-days", "2026-08-07")).toEqual({
      start: "2026-08-07",
      end: "2026-08-13",
    });
    expect(quickDateRange("this-quarter", "2026-08-07")).toEqual({
      start: "2026-07-01",
      end: "2026-09-30",
    });
  });

  it("normalizes reverse selection and preserves local wall-clock values", () => {
    expect(normalizeDateRange("2026-08-19", "2026-08-07")).toEqual({
      start: "2026-08-07",
      end: "2026-08-19",
    });
    expect(splitLocalDateTime("2026-08-07T12:30")).toEqual({
      date: "2026-08-07",
      time: "12:30",
    });
  });
});
