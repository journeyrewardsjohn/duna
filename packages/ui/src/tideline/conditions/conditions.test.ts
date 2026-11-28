import { fahrenheitToCelsius, mphToKph } from "@duna/tideline-core";
import { describe, expect, it } from "vitest";
import {
  freshness,
  lineParts,
  playCallView,
  readings,
  temperatureText,
  windChip,
  windStrength,
  windText,
} from "./conditions-logic";

const at = Date.UTC(2026, 10, 28, 22);
const hour = (overrides: Record<string, number> = {}) => ({
  at,
  temperatureC: fahrenheitToCelsius(68),
  windSpeedKph: mphToKph(9),
  windFromDeg: 270,
  precipChancePct: 0,
  uvIndex: 3,
  ...overrides,
});

describe("play call", () => {
  it("is quiet when good, and names the reason for caution and stop", () => {
    expect(playCallView(hour())).toMatchObject({
      call: "good",
      words: "Good to play",
      reason: null,
      crests: 3,
      icon: "success",
    });
    expect(playCallView(hour({ windGustKph: mphToKph(32) }))).toMatchObject({
      call: "caution",
      words: "Caution",
      reason: "Gusty",
      icon: "alert",
    });
    expect(playCallView(hour({ precipChancePct: 85 }))).toMatchObject({
      call: "stop",
      words: "Stop play",
      reason: "Rain likely",
      crests: 0,
      icon: "lightning",
    });
  });

  it("lets the service's own call win (lightning)", () => {
    expect(
      playCallView(hour(), { call: "stop", reason: "Lightning 8 mi away" }),
    ).toMatchObject({ call: "stop", reason: "Lightning 8 mi away" });
  });
});

describe("readings and units", () => {
  it("defaults to US units: °F and mph, compass point first", () => {
    expect(temperatureText(fahrenheitToCelsius(68), "us")).toBe("68°F");
    expect(temperatureText(20, "metric")).toBe("20°C");
    expect(windText(hour(), "us")).toBe("W 9 mph");
    expect(
      readings(hour({ windGustKph: mphToKph(14) }), "us").map((r) => [
        r.label,
        r.value,
      ]),
    ).toEqual([
      ["Wind", "W 9 mph"],
      ["Gusts", "14 mph"],
      ["UV", "3"],
      ["Rain", "0%"],
    ]);
  });

  it("chips at steady 12 mph or gusts 14 mph, from the core's thresholds", () => {
    expect(windChip(hour(), "us")).toBeNull();
    expect(windChip(hour({ windSpeedKph: mphToKph(11.9) }), "us")).toBeNull();
    expect(windChip(hour({ windSpeedKph: mphToKph(12) }), "us")).toBe(
      "Windy 12 mph",
    );
    expect(windChip(hour({ windGustKph: mphToKph(14) }), "us")).toBe(
      "Gusty 14 mph",
    );
    expect(windChip(hour({ windGustKph: mphToKph(13.9) }), "us")).toBeNull();
  });

  it("scores wind strength in crests", () => {
    expect(windStrength(mphToKph(9))).toEqual({ word: "Light", crests: 1 });
    expect(windStrength(mphToKph(12))).toEqual({ word: "Steady", crests: 2 });
    expect(windStrength(mphToKph(20))).toEqual({ word: "Strong", crests: 3 });
  });

  it("orders the line parts by the core's priority", () => {
    const { call, parts } = lineParts(hour({ windGustKph: mphToKph(32) }), {
      units: "us",
      sunsetAt: at + 3_600_000,
    });
    expect(call).toBe("caution");
    expect(parts.map((p) => p.kind)).toEqual([
      "reason",
      "wind",
      "temp",
      "sunset",
    ]);
  });
});

describe("freshness", () => {
  it("says how old a stale reading is", () => {
    expect(freshness(at - 30 * 60_000, at)).toEqual({
      stale: false,
      ago: "30 min ago",
    });
    expect(freshness(at - 125 * 60_000, at)).toEqual({
      stale: true,
      ago: "2 h 5 min ago",
    });
    expect(freshness(at, at)).toEqual({ stale: false, ago: "just now" });
    expect(freshness(undefined, at)).toBeNull();
  });
});
