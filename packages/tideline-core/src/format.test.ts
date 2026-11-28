import { describe, expect, it } from "vitest";
import {
  countdownParts,
  formatCountdown,
  formatMoney,
  formatTime,
  formatTimeRange,
  moneyParts,
  timePartsFromMinutes,
  timePartsOf,
} from "./format";

const LA = { locale: "en-US", timeZone: "America/Los_Angeles" };
// 2026-11-28 23:45 UTC = 3:45 PM in Los Angeles.
const AT = Date.UTC(2026, 10, 28, 23, 45);

describe("time", () => {
  it("formats 3:45 PM with ordinary spaces", () => {
    expect(formatTime(AT, LA)).toBe("3:45 PM");
    const parts = timePartsOf(AT, LA);
    expect(parts).toMatchObject({ hour: "3", minute: "45", dayPeriod: "PM" });
    expect(parts.text).not.toMatch(/\u202f/);
  });

  it("is time-zone explicit", () => {
    expect(formatTime(AT, { locale: "en-US", timeZone: "UTC" })).toBe(
      "11:45 PM",
    );
    expect(formatTime(AT, { locale: "en-GB", timeZone: "Europe/London" })).toBe(
      "23:45",
    );
    expect(
      timePartsOf(AT, { locale: "en-GB", timeZone: "UTC" }).dayPeriod,
    ).toBeNull();
  });

  it("fits the longest label, 10:30 PM", () => {
    expect(timePartsFromMinutes(22 * 60 + 30, "en-US").text).toBe("10:30 PM");
    expect(timePartsFromMinutes(0, "en-US").text).toBe("12:00 AM");
    expect(timePartsFromMinutes(25 * 60, "en-US").text).toBe("1:00 AM");
  });

  it("ranges share the period when they can", () => {
    const end = AT + 90 * 60_000;
    expect(formatTimeRange(AT, end, LA).text).toBe("3:45 – 5:15 PM");
    const across = formatTimeRange(Date.UTC(2026, 10, 28, 19, 45), AT, LA);
    expect(across.text).toBe("11:45 AM – 3:45 PM");
    expect(
      formatTimeRange(AT, end, { locale: "en-GB", timeZone: "UTC" }).text,
    ).toBe("23:45 – 1:15");
  });
});

describe("countdown", () => {
  const now = Date.UTC(2026, 10, 28, 12, 0);
  it("breaks a gap into days, hours and minutes", () => {
    expect(countdownParts(now + (2 * 60 + 5) * 60_000, now)).toEqual({
      direction: "in",
      days: 0,
      hours: 2,
      minutes: 5,
    });
    expect(countdownParts(now + (26 * 60 + 3) * 60_000, now)).toMatchObject({
      days: 1,
      hours: 2,
    });
  });
  it("formats in, ago and now", () => {
    expect(formatCountdown(countdownParts(now + 125 * 60_000, now))).toBe(
      "in 2h 05m",
    );
    expect(formatCountdown(countdownParts(now + 12 * 60_000, now))).toBe(
      "in 12m",
    );
    expect(formatCountdown(countdownParts(now + 27 * 3_600_000, now))).toBe(
      "in 1d 3h",
    );
    expect(formatCountdown(countdownParts(now - 5 * 60_000, now))).toBe(
      "5m ago",
    );
    expect(formatCountdown(countdownParts(now + 30_000, now))).toBe("now");
    expect(formatCountdown(countdownParts(now - 30_000, now))).toBe("now");
  });
});

describe("money", () => {
  it("formats integer minor units", () => {
    expect(formatMoney(4500, { currency: "USD", locale: "en-US" })).toBe(
      "$45.00",
    );
    expect(formatMoney(-1250, { currency: "USD", locale: "en-US" })).toBe(
      "-$12.50",
    );
    expect(formatMoney(0, { currency: "USD", locale: "en-US" })).toBe("$0.00");
  });
  it("uses the currency's own minor-unit digits", () => {
    expect(
      moneyParts(5000, { currency: "JPY", locale: "ja-JP" }).fractionDigits,
    ).toBe(0);
    expect(
      moneyParts(5000, { currency: "KWD", locale: "en-US" }).fractionDigits,
    ).toBe(3);
    expect(formatMoney(2500, { currency: "EUR", locale: "de-DE" })).toBe(
      "25,00 €",
    );
  });
  it("returns parts", () => {
    const parts = moneyParts(4500, { currency: "USD", locale: "en-US" });
    expect(parts.parts.map((p) => p.type)).toEqual([
      "currency",
      "integer",
      "decimal",
      "fraction",
    ]);
    expect(parts.minorUnits).toBe(4500);
  });
  it("rejects non-integers", () => {
    expect(() =>
      formatMoney(45.5, { currency: "USD", locale: "en-US" }),
    ).toThrow(RangeError);
    expect(() =>
      formatMoney(Number.NaN, { currency: "USD", locale: "en-US" }),
    ).toThrow(RangeError);
  });
});
