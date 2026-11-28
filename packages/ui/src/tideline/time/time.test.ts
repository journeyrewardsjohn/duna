import { describe, expect, it } from "vitest";
import {
  civilDate,
  minuteLabel,
  minuteRangeLabel,
  slotMinWidth,
} from "./time-format";

describe("time format helpers", () => {
  it("labels wall-clock minutes, AM / PM on every time", () => {
    expect(minuteLabel(1350, "en-US")).toBe("10:30 PM");
    expect(minuteLabel(0, "en-US")).toBe("12:00 AM");
    // After midnight reads on the next day's clock.
    expect(minuteLabel(1500, "en-US")).toBe("1:00 AM");
  });

  it("says the period once in a range when both ends share it", () => {
    expect(minuteRangeLabel(945, 1005, "en-US")).toBe("3:45 – 4:45 PM");
    expect(minuteRangeLabel(660, 840, "en-US")).toBe("11:00 AM – 2:00 PM");
  });

  it("sizes chips for the longest label in ch, so they grow with the text", () => {
    expect(slotMinWidth(["9:00 AM", "10:30 PM"], true)).toBe(
      "calc(8ch + 0.25em + 20px + 24px)",
    );
    expect(slotMinWidth(["9:00"], false)).toBe(
      "calc(5ch + 0.25em + 0px + 24px)",
    );
  });

  it("takes ISO or civil dates and rejects impossible ones", () => {
    expect(civilDate("2026-11-28")).toEqual({ year: 2026, month: 11, day: 28 });
    expect(civilDate({ year: 2026, month: 3, day: 8 })).toEqual({
      year: 2026,
      month: 3,
      day: 8,
    });
    expect(() => civilDate("2026-02-30")).toThrow(RangeError);
  });
});
