import { describe, expect, it } from "vitest";
import {
  CHIP_WIND_KPH,
  compassPoint,
  conditionsLine,
  DEFAULT_CONDITION_THRESHOLDS,
  fitConditionsLine,
  needsWeatherChip,
  playCall,
  windOnCourt,
  type HourlyConditions,
} from "./conditions";

const calm: HourlyConditions = {
  at: 0,
  temperatureC: 22,
  windSpeedKph: 10,
  windGustKph: 15,
  windFromDeg: 270,
  precipChancePct: 5,
  uvIndex: 3,
};

describe("playCall", () => {
  it("is good when nothing crosses a threshold, and when data is missing", () => {
    expect(playCall(calm)).toEqual({ call: "good", reason: null, reasons: [] });
    expect(playCall({ at: 0 }).call).toBe("good");
  });

  it("caution at each default threshold, with its reason", () => {
    const t = DEFAULT_CONDITION_THRESHOLDS;
    expect(playCall({ ...calm, windSpeedKph: t.cautionWindKph })).toMatchObject(
      { call: "caution", reason: "wind" },
    );
    expect(playCall({ ...calm, windGustKph: t.cautionGustKph })).toMatchObject({
      call: "caution",
      reason: "gusts",
    });
    expect(
      playCall({ ...calm, precipChancePct: t.cautionPrecipPct }),
    ).toMatchObject({ call: "caution", reason: "rain" });
    expect(playCall({ ...calm, temperatureC: t.cautionHeatC })).toMatchObject({
      call: "caution",
      reason: "heat",
    });
    expect(playCall({ ...calm, temperatureC: t.cautionColdC })).toMatchObject({
      call: "caution",
      reason: "cold",
    });
    expect(playCall({ ...calm, uvIndex: t.cautionUv })).toMatchObject({
      call: "caution",
      reason: "uv",
    });
  });

  it("stop at each default threshold", () => {
    const t = DEFAULT_CONDITION_THRESHOLDS;
    expect(playCall({ ...calm, windSpeedKph: t.stopWindKph }).call).toBe(
      "stop",
    );
    expect(playCall({ ...calm, windGustKph: t.stopGustKph }).call).toBe("stop");
    expect(playCall({ ...calm, precipChancePct: t.stopPrecipPct }).call).toBe(
      "stop",
    );
    expect(playCall({ ...calm, temperatureC: t.stopHeatC }).call).toBe("stop");
    expect(playCall({ ...calm, temperatureC: t.stopColdC }).call).toBe("stop");
    expect(playCall({ ...calm, uvIndex: t.stopUv }).call).toBe("stop");
  });

  it("just under a threshold is still good", () => {
    expect(playCall({ ...calm, windSpeedKph: 29 }).call).toBe("good");
    expect(playCall({ ...calm, temperatureC: 6 }).call).toBe("good");
  });

  it("stop beats caution and the reason is the strongest at that level", () => {
    const r = playCall({
      ...calm,
      precipChancePct: 50,
      windGustKph: 70,
      windSpeedKph: 35,
    });
    expect(r.call).toBe("stop");
    expect(r.reason).toBe("gusts");
    expect(r.reasons).toEqual(["gusts"]);
  });

  it("ties at the same level come back in a fixed order", () => {
    const r = playCall({
      ...calm,
      precipChancePct: 50,
      windSpeedKph: 35,
      uvIndex: 9,
    });
    expect(r.call).toBe("caution");
    expect(r.reasons).toEqual(["rain", "wind", "uv"]);
    expect(r.reason).toBe("rain");
  });

  it("a club can change the thresholds", () => {
    expect(
      playCall({ ...calm, windSpeedKph: 20 }, { cautionWindKph: 15 }).call,
    ).toBe("caution");
    expect(
      playCall({ ...calm, windSpeedKph: 40 }, { cautionWindKph: 45 }).call,
    ).toBe("good");
  });
});

describe("compassPoint", () => {
  it("names eight points and wraps", () => {
    expect(compassPoint(0)).toBe("N");
    expect(compassPoint(44)).toBe("NE");
    expect(compassPoint(270)).toBe("W");
    expect(compassPoint(359)).toBe("N");
    expect(compassPoint(-90)).toBe("W");
    expect(compassPoint(405)).toBe("NE");
  });
});

describe("windOnCourt", () => {
  it("wind along the court: the good end is where it comes from", () => {
    // Court runs north-south (0 deg); a north wind comes from the north end.
    const w = windOnCourt(20, 0, 0);
    expect(w.dominant).toBe("along");
    expect(w.alongKph).toBe(20);
    expect(w.crossKph).toBe(0);
    expect(w.goodEndBearingDeg).toBe(0);
    expect(w.goodEndCompass).toBe("N");
    expect(w.windFromCompass).toBe("N");
  });

  it("a south wind on the same court makes the south end good", () => {
    const w = windOnCourt(20, 180, 0);
    expect(w.goodEndBearingDeg).toBe(180);
    expect(w.goodEndCompass).toBe("S");
  });

  it("orientation is the axis, not a direction: 180 equals 0", () => {
    expect(windOnCourt(20, 0, 180).goodEndBearingDeg).toBe(0);
    expect(windOnCourt(20, 10, 190).goodEndBearingDeg).toBe(10);
  });

  it("crosswind has no good end", () => {
    const w = windOnCourt(20, 90, 0);
    expect(w.dominant).toBe("cross");
    expect(w.crossKph).toBe(20);
    expect(w.alongKph).toBe(0);
    expect(w.goodEndBearingDeg).toBeNull();
    expect(w.goodEndCompass).toBeNull();
    expect(w.windFromCompass).toBe("E");
  });

  it("calm wind has no direction at all", () => {
    const w = windOnCourt(3, 90, 0);
    expect(w.dominant).toBe("calm");
    expect(w.goodEndBearingDeg).toBeNull();
    expect(w.windFromCompass).toBeNull();
  });

  it("a diagonal wind resolves to the larger component", () => {
    expect(windOnCourt(20, 30, 0).dominant).toBe("along");
    expect(windOnCourt(20, 60, 0).dominant).toBe("cross");
    expect(windOnCourt(20, 45, 0).dominant).toBe("along"); // tie goes to along
  });
});

describe("needsWeatherChip", () => {
  it("only when it changes what people do", () => {
    expect(needsWeatherChip(calm)).toBe(false);
    expect(needsWeatherChip({ ...calm, windSpeedKph: CHIP_WIND_KPH })).toBe(
      true,
    );
    expect(needsWeatherChip({ ...calm, precipChancePct: 60 })).toBe(true);
    expect(needsWeatherChip({ ...calm, uvIndex: 12 })).toBe(true);
    expect(needsWeatherChip({ at: 0 })).toBe(false);
    expect(
      needsWeatherChip({ ...calm, windSpeedKph: 25 }, { cautionWindKph: 22 }),
    ).toBe(true);
  });
});

describe("conditionsLine", () => {
  it("good weather: wind, temperature, sunset in priority order, no reason", () => {
    const line = conditionsLine(calm, { sunsetAt: 1234 });
    expect(line.call).toBe("good");
    expect(line.parts.map((p) => p.kind)).toEqual(["wind", "temp", "sunset"]);
    expect(line.parts.map((p) => p.priority)).toEqual([1, 2, 3]);
    expect(line.parts[0]).toMatchObject({
      windSpeedKph: 10,
      windFromCompass: "W",
    });
    expect(line.parts[2]).toMatchObject({ sunsetAt: 1234 });
  });

  it("leads with the reason when not good, then rain and UV when notable", () => {
    const line = conditionsLine(
      {
        ...calm,
        windSpeedKph: 34.6,
        precipChancePct: 45.2,
        uvIndex: 8.4,
        temperatureC: 33.4,
      },
      { sunsetAt: 99 },
    );
    expect(line.call).toBe("caution");
    expect(line.parts.map((p) => p.kind)).toEqual([
      "reason",
      "wind",
      "temp",
      "rain",
      "uv",
      "sunset",
    ]);
    expect(line.parts[0]).toMatchObject({ reason: "rain" });
    expect(line.parts[1]).toMatchObject({ windSpeedKph: 35 });
    expect(line.parts[3]).toMatchObject({ precipChancePct: 45 });
    expect(line.parts[4]).toMatchObject({ uvIndex: 8 });
  });

  it("omits what it does not know and calm winds have no direction", () => {
    const line = conditionsLine({ at: 0, windSpeedKph: 2, windFromDeg: 90 });
    expect(line.parts).toEqual([
      { kind: "wind", windSpeedKph: 2, priority: 1 },
    ]);
    expect(conditionsLine({ at: 0, windSpeedKph: 12 }).parts[0]).toEqual({
      kind: "wind",
      windSpeedKph: 12,
      priority: 1,
    });
    expect(conditionsLine({ at: 0 }, { sunsetAt: null }).parts).toEqual([]);
  });

  it("passes thresholds through", () => {
    expect(
      conditionsLine(
        { ...calm, windSpeedKph: 20 },
        { thresholds: { cautionWindKph: 15 } },
      ).call,
    ).toBe("caution");
  });
});

describe("fitConditionsLine", () => {
  const full = conditionsLine(
    { ...calm, windSpeedKph: 34, precipChancePct: 45, uvIndex: 8 },
    { sunsetAt: 99 },
  );
  const kinds = (n: number) => fitConditionsLine(full, n).map((p) => p.kind);

  it("drops the lowest priority first: sunset, UV, rain, temperature, wind", () => {
    expect(kinds(6)).toEqual([
      "reason",
      "wind",
      "temp",
      "rain",
      "uv",
      "sunset",
    ]);
    expect(kinds(5)).toEqual(["reason", "wind", "temp", "rain", "uv"]);
    expect(kinds(4)).toEqual(["reason", "wind", "temp", "rain"]);
    expect(kinds(3)).toEqual(["reason", "wind", "temp"]);
    expect(kinds(2)).toEqual(["reason", "wind"]);
  });

  it("never drops the reason", () => {
    expect(kinds(1)).toEqual(["reason"]);
    expect(kinds(0)).toEqual(["reason"]);
    expect(kinds(-3)).toEqual(["reason"]);
  });

  it("with no reason, zero parts really is zero", () => {
    const good = conditionsLine(calm, { sunsetAt: 1 });
    expect(fitConditionsLine(good, 0)).toEqual([]);
    expect(fitConditionsLine(good, 1).map((p) => p.kind)).toEqual(["wind"]);
    expect(fitConditionsLine(conditionsLine({ at: 0 }), 2)).toEqual([]);
  });
});
