import { describe, expect, it } from "vitest";
import {
  CALM_WIND_KPH,
  celsiusToFahrenheit,
  CHIP_GUST_MPH,
  CHIP_WIND_MPH,
  compassPoint,
  conditionsLine,
  DEFAULT_CONDITION_THRESHOLDS,
  DEFAULT_CONDITION_THRESHOLDS_US,
  fahrenheitToCelsius,
  kphToMph,
  mphToKph,
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

describe("units", () => {
  it("converts both ways", () => {
    expect(mphToKph(10)).toBeCloseTo(16.0934, 3);
    expect(kphToMph(mphToKph(7.5))).toBeCloseTo(7.5, 9);
    expect(celsiusToFahrenheit(0)).toBe(32);
    expect(fahrenheitToCelsius(212)).toBe(100);
  });

  it("the metric thresholds are converted from the mph / F table", () => {
    const us = DEFAULT_CONDITION_THRESHOLDS_US;
    const metric = DEFAULT_CONDITION_THRESHOLDS;
    expect(metric.cautionWindKph).toBeCloseTo(us.cautionWindMph * 1.609344, 9);
    expect(metric.stopGustKph).toBeCloseTo(us.stopGustMph * 1.609344, 9);
    expect(metric.stopHeatC).toBeCloseTo(((us.stopHeatF - 32) * 5) / 9, 9);
    expect(metric.cautionColdC).toBeCloseTo(
      ((us.cautionColdF - 32) * 5) / 9,
      9,
    );
    expect(us).toEqual({
      cautionWindMph: 20,
      stopWindMph: 30,
      cautionGustMph: 30,
      stopGustMph: 40,
      cautionPrecipPct: 40,
      stopPrecipPct: 80,
      cautionHeatF: 90,
      stopHeatF: 100,
      cautionColdF: 40,
      stopColdF: 30,
      cautionUv: 8,
      stopUv: 11,
    });
  });

  it("the mph / F thresholds give the calls the owner reads", () => {
    const call = (extra: object) => playCall({ at: 0, ...extra }).call;
    expect(call({ windSpeedKph: mphToKph(19) })).toBe("good");
    expect(call({ windSpeedKph: mphToKph(20) })).toBe("caution");
    expect(call({ windSpeedKph: mphToKph(30) })).toBe("stop");
    expect(call({ windGustKph: mphToKph(30) })).toBe("caution");
    expect(call({ windGustKph: mphToKph(40) })).toBe("stop");
    expect(call({ temperatureC: fahrenheitToCelsius(90) })).toBe("caution");
    expect(call({ temperatureC: fahrenheitToCelsius(100) })).toBe("stop");
    expect(call({ temperatureC: fahrenheitToCelsius(40) })).toBe("caution");
    expect(call({ temperatureC: fahrenheitToCelsius(30) })).toBe("stop");
    expect(call({ temperatureC: fahrenheitToCelsius(60) })).toBe("good");
  });
});

describe("needsWeatherChip", () => {
  it("only when it changes what people do", () => {
    expect(needsWeatherChip(calm)).toBe(false);
    expect(needsWeatherChip({ ...calm, precipChancePct: 60 })).toBe(true);
    expect(needsWeatherChip({ ...calm, uvIndex: 12 })).toBe(true);
    expect(needsWeatherChip({ at: 0 })).toBe(false);
    expect(
      needsWeatherChip({ ...calm, windSpeedKph: 25 }, { cautionWindKph: 22 }),
    ).toBe(true);
  });

  it("a steady 9 mph westerly shows no chip", () => {
    const steady = { at: 0, windSpeedKph: mphToKph(9), windFromDeg: 270 };
    expect(needsWeatherChip(steady)).toBe(false);
    expect(needsWeatherChip({ ...steady, windGustKph: mphToKph(11) })).toBe(
      false,
    );
  });

  it('"Gusty 14 mph" shows a chip, whether 14 is the gust or the steady wind', () => {
    expect(
      needsWeatherChip({
        at: 0,
        windSpeedKph: mphToKph(9),
        windGustKph: mphToKph(CHIP_GUST_MPH),
      }),
    ).toBe(true);
    expect(
      needsWeatherChip({
        at: 0,
        windSpeedKph: mphToKph(14),
        windGustKph: mphToKph(20),
      }),
    ).toBe(true);
    expect(
      needsWeatherChip({ at: 0, windSpeedKph: mphToKph(CHIP_WIND_MPH) }),
    ).toBe(true);
    expect(needsWeatherChip({ at: 0, windSpeedKph: mphToKph(11.9) })).toBe(
      false,
    );
    expect(needsWeatherChip({ at: 0, windGustKph: mphToKph(13.9) })).toBe(
      false,
    );
  });
});

describe("conditionsLine", () => {
  it("defaults to US units: a steady 9 mph westerly reads W 9 mph", () => {
    const line = conditionsLine(
      { at: 0, windSpeedKph: mphToKph(9), windFromDeg: 270, temperatureC: 22 },
      { sunsetAt: 1234 },
    );
    expect(line.units).toBe("us");
    expect(line.call).toBe("good");
    expect(line.parts.map((p) => p.kind)).toEqual(["wind", "temp", "sunset"]);
    expect(line.parts.map((p) => p.priority)).toEqual([1, 2, 3]);
    expect(line.parts[0]).toMatchObject({
      text: "W 9 mph",
      windSpeed: 9,
      gusty: false,
      windFromCompass: "W",
    });
    expect(line.parts[1]).toMatchObject({ text: "72\u00b0F", temperature: 72 });
    expect(line.parts[2]).toMatchObject({ sunsetAt: 1234 });
  });

  it('shows "Gusty 14 mph" with the gust speed when gusts reach the chip threshold', () => {
    const line = conditionsLine({
      at: 0,
      windSpeedKph: mphToKph(9),
      windGustKph: mphToKph(14),
      windFromDeg: 270,
    });
    expect(line.parts[0]).toMatchObject({
      text: "Gusty 14 mph",
      gusty: true,
      windGust: 14,
      windSpeed: 9,
      windFromCompass: "W",
    });
  });

  it("metric on request, never inferred", () => {
    const line = conditionsLine(
      {
        at: 0,
        windSpeedKph: 15,
        windFromDeg: 270,
        temperatureC: 22,
        windGustKph: 30,
      },
      { units: "metric" },
    );
    expect(line.units).toBe("metric");
    expect(line.parts[0]).toMatchObject({ text: "Gusty 30 km/h" });
    expect(line.parts[1]).toMatchObject({ text: "22\u00b0C", temperature: 22 });
    const steady = conditionsLine(
      { at: 0, windSpeedKph: 15, windFromDeg: 270 },
      { units: "metric" },
    );
    expect(steady.parts[0]).toMatchObject({ text: "W 15 km/h" });
  });

  it("leads with the reason when not good, then rain and UV when notable", () => {
    const line = conditionsLine(
      {
        ...calm,
        windSpeedKph: mphToKph(22),
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
    expect(line.parts[1]).toMatchObject({ windSpeed: 22, text: "W 22 mph" });
    expect(line.parts[2]).toMatchObject({ text: "92\u00b0F" });
    expect(line.parts[3]).toMatchObject({
      precipChancePct: 45,
      text: "45% rain",
    });
    expect(line.parts[4]).toMatchObject({ uvIndex: 8, text: "UV 8" });
  });

  it("omits what it does not know and calm winds have no direction", () => {
    const line = conditionsLine({
      at: 0,
      windSpeedKph: CALM_WIND_KPH - 1,
      windFromDeg: 90,
    });
    expect(line.parts).toHaveLength(1);
    expect(line.parts[0]).toMatchObject({
      kind: "wind",
      text: "2 mph",
      gusty: false,
    });
    expect(line.parts[0]?.windFromCompass).toBeUndefined();
    const noDirection = conditionsLine({ at: 0, windSpeedKph: mphToKph(12) });
    expect(noDirection.parts[0]).toMatchObject({ text: "12 mph" });
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
