import { describe, expect, it } from "vitest";
import {
  calendarMonthFromDate,
  calendarMonthDays,
  normalizeDateRange,
  quickDateRange,
  splitLocalDateTime,
} from "./smart-date-range";

describe("smart date range", () => {
  it("opens an empty range on the current calendar month", () => {
    const today = new Date(2026, 7, 19, 12);

    expect(calendarMonthFromDate("", today)).toEqual({
      year: 2026,
      month: 7,
    });
    expect(calendarMonthFromDate("2026-00-19", today)).toEqual({
      year: 2026,
      month: 7,
    });
    expect(calendarMonthFromDate("2027-02-19", today)).toEqual({
      year: 2027,
      month: 1,
    });
  });

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
