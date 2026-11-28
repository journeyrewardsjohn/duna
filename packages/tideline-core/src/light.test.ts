import { describe, expect, it } from "vitest";
import { formatTime } from "./format";
import {
  dayLineParts,
  GOLDEN_HOUR_LEAD_MINUTES,
  lightMarkFor,
  sunTimes,
  type SunTimes,
} from "./light";

const MIN = 60_000;
const iso = (ms: number | null) =>
  ms === null ? null : new Date(ms).toISOString();
const near = (actual: number | null, expectedIso: string, toleranceMin = 2) => {
  expect(actual).not.toBeNull();
  const diff = Math.abs((actual as number) - Date.parse(expectedIso)) / MIN;
  expect(diff, `${iso(actual)} vs ${expectedIso}`).toBeLessThanOrEqual(
    toleranceMin,
  );
};

/**
 * Reference values are the sunrise-sunset.org API (formatted=0, UTC, civil
 * twilight) checked on 27 November 2026. The NOAA algorithm is accurate to
 * about a minute away from the poles, so the tolerance is two minutes.
 */
describe("sunTimes: published values", () => {
  it("Santa Monica, 28 Nov 2026 (matches the brand book sample: 6:38 AM / 4:45 PM)", () => {
    const s = sunTimes(34.0195, -118.4912, { year: 2026, month: 11, day: 28 });
    near(s.sunrise, "2026-11-28T14:38:49Z");
    near(s.sunset, "2026-11-29T00:45:12Z");
    near(s.civilDawn, "2026-11-28T14:11:42Z");
    near(s.civilDusk, "2026-11-29T01:12:20Z");
    near(s.solarNoon, "2026-11-28T19:42:01Z");
    expect(s.daylight).toBe("normal");
    expect(s.whiteNight).toBe(false);
    expect(s.goldenHourStart).toBeGreaterThan(s.solarNoon);
    expect(s.goldenHourStart).toBeLessThan(s.sunset as number);
  });

  it("London, summer solstice 2026 (BST day)", () => {
    const s = sunTimes(51.5074, -0.1278, { year: 2026, month: 6, day: 21 });
    near(s.sunrise, "2026-06-21T03:43:04Z");
    near(s.sunset, "2026-06-21T20:21:36Z");
    near(s.civilDawn, "2026-06-21T02:55:24Z");
    near(s.civilDusk, "2026-06-21T21:09:15Z");
  });

  it("New York, 8 March 2026: the day clocks spring forward", () => {
    const s = sunTimes(40.7128, -74.006, { year: 2026, month: 3, day: 8 });
    near(s.sunrise, "2026-03-08T11:18:24Z");
    near(s.sunset, "2026-03-08T22:55:03Z");
    near(s.civilDawn, "2026-03-08T10:51:11Z");
    near(s.civilDusk, "2026-03-08T23:22:16Z");
  });

  it("Sydney, 5 April 2026: the day clocks fall back; local sunrise is the 4th in UTC", () => {
    const s = sunTimes(-33.8688, 151.2093, { year: 2026, month: 4, day: 5 });
    near(s.sunrise, "2026-04-04T20:10:06Z");
    near(s.sunset, "2026-04-05T07:45:50Z");
    near(s.civilDawn, "2026-04-04T19:45:11Z");
    near(s.civilDusk, "2026-04-05T08:10:45Z");
  });

  it("Tromso (69.6N), 20 March 2026: a high latitude", () => {
    const s = sunTimes(69.6492, 18.9553, { year: 2026, month: 3, day: 20 });
    near(s.sunrise, "2026-03-20T04:42:32Z");
    near(s.sunset, "2026-03-20T17:00:45Z");
    near(s.civilDawn, "2026-03-20T03:42:23Z");
    near(s.civilDusk, "2026-03-20T18:00:54Z");
  });

  it("Reykjavik (64.1N), solstice: the sun sets but never gets 6 degrees below", () => {
    const s = sunTimes(64.1466, -21.9426, { year: 2026, month: 6, day: 21 });
    near(s.sunrise, "2026-06-21T02:54:57Z");
    near(s.sunset, "2026-06-22T00:04:15Z");
    expect(s.civilDawn).toBeNull();
    expect(s.civilDusk).toBeNull();
    expect(s.whiteNight).toBe(true);
    expect(s.daylight).toBe("normal");
  });

  it("polar day and polar night inside the Arctic Circle", () => {
    const day = sunTimes(69.6492, 18.9553, { year: 2026, month: 6, day: 21 });
    expect(day.daylight).toBe("polar-day");
    expect(day.sunrise).toBeNull();
    expect(day.sunset).toBeNull();
    const night = sunTimes(69.6492, 18.9553, {
      year: 2026,
      month: 12,
      day: 21,
    });
    expect(night.daylight).toBe("polar-night");
    expect(night.sunrise).toBeNull();
    expect(night.goldenHourStart).toBeNull();
    expect(night.whiteNight).toBe(false);
  });

  it("golden hour defaults to 60 minutes before sunset: Santa Monica shows 3:45 PM and 4:45 PM", () => {
    expect(GOLDEN_HOUR_LEAD_MINUTES).toBe(60);
    const s = sunTimes(34.0195, -118.4912, { year: 2026, month: 11, day: 28 });
    expect((s.sunset as number) - (s.goldenHourStart as number)).toBe(60 * MIN);
    const zone = { locale: "en-US", timeZone: "America/Los_Angeles" };
    expect(formatTime(s.sunrise as number, zone)).toBe("6:38 AM");
    expect(formatTime(s.goldenHourStart as number, zone)).toBe("3:45 PM");
    expect(formatTime(s.sunset as number, zone)).toBe("4:45 PM");
  });

  it("lets the golden hour be set by sun elevation instead", () => {
    const date = { year: 2026, month: 11, day: 28 };
    const six = sunTimes(34.0195, -118.4912, date, {
      goldenHourElevationDeg: 6,
    });
    // 6 degrees above the horizon: about 4:07 PM in Santa Monica.
    near(six.goldenHourStart, "2026-11-29T00:07:38Z");
    const ten = sunTimes(34.0195, -118.4912, date, {
      goldenHourElevationDeg: 10,
    });
    expect(ten.goldenHourStart as number).toBeLessThan(
      six.goldenHourStart as number,
    );
    // A sun that never gets that high has no golden hour.
    const night = sunTimes(
      69.6492,
      18.9553,
      { year: 2026, month: 12, day: 21 },
      { goldenHourElevationDeg: 6 },
    );
    expect(night.goldenHourStart).toBeNull();
  });
});

describe("lightMarkFor", () => {
  const sun = sunTimes(34.0195, -118.4912, { year: 2026, month: 11, day: 28 });
  const at = (offsetMin: number, anchor: number | null) =>
    (anchor as number) + offsetMin * MIN;

  it("walks the day for an unlit court", () => {
    const c = { sun, courtIsLit: false };
    expect(lightMarkFor(at(-120, sun.civilDawn), c)).toBe("dark");
    expect(lightMarkFor(at(5, sun.civilDawn), c)).toBe("first-light");
    expect(lightMarkFor(at(-1, sun.sunrise), c)).toBe("first-light");
    expect(lightMarkFor(at(1, sun.sunrise), c)).toBe("daylight");
    expect(lightMarkFor(sun.solarNoon, c)).toBe("daylight");
    expect(lightMarkFor(at(1, sun.goldenHourStart), c)).toBe("golden-hour");
    expect(lightMarkFor(at(-1, sun.sunset), c)).toBe("golden-hour");
    expect(lightMarkFor(at(1, sun.sunset), c)).toBe("dark");
  });

  it("a lit court is under lights whenever the sun is down", () => {
    const c = { sun, courtIsLit: true };
    expect(lightMarkFor(at(-120, sun.civilDawn), c)).toBe("under-lights");
    expect(lightMarkFor(at(-1, sun.sunrise), c)).toBe("under-lights");
    expect(lightMarkFor(sun.solarNoon, c)).toBe("daylight");
    expect(lightMarkFor(at(-1, sun.sunset), c)).toBe("golden-hour");
    expect(lightMarkFor(at(1, sun.sunset), c)).toBe("under-lights");
  });

  it("boundaries: sunrise is daylight, sunset is already dark", () => {
    const c = { sun, courtIsLit: false };
    expect(lightMarkFor(sun.sunrise as number, c)).toBe("daylight");
    expect(lightMarkFor(sun.sunset as number, c)).toBe("dark");
    expect(lightMarkFor(sun.goldenHourStart as number, c)).toBe("golden-hour");
  });

  it("white night is twilight before sunrise", () => {
    const rey = sunTimes(64.1466, -21.9426, { year: 2026, month: 6, day: 21 });
    expect(
      lightMarkFor((rey.sunrise as number) - 30 * MIN, {
        sun: rey,
        courtIsLit: false,
      }),
    ).toBe("first-light");
  });

  it("daylight when there is no golden hour that day", () => {
    const noGolden: SunTimes = { ...sun, goldenHourStart: null };
    expect(
      lightMarkFor((sun.sunset as number) - MIN, {
        sun: noGolden,
        courtIsLit: false,
      }),
    ).toBe("daylight");
  });

  it("no civil dawn but not a white night means dark before sunrise", () => {
    const odd: SunTimes = { ...sun, civilDawn: null, whiteNight: false };
    expect(
      lightMarkFor((sun.sunrise as number) - MIN, {
        sun: odd,
        courtIsLit: false,
      }),
    ).toBe("dark");
  });

  it("polar day is daylight; polar night is dark or under lights", () => {
    const polarDay = sunTimes(69.6492, 18.9553, {
      year: 2026,
      month: 6,
      day: 21,
    });
    expect(
      lightMarkFor(polarDay.solarNoon, { sun: polarDay, courtIsLit: true }),
    ).toBe("daylight");
    const polarNight = sunTimes(69.6492, 18.9553, {
      year: 2026,
      month: 12,
      day: 21,
    });
    expect(
      lightMarkFor(polarNight.solarNoon, {
        sun: polarNight,
        courtIsLit: false,
      }),
    ).toBe("dark");
    expect(
      lightMarkFor(polarNight.solarNoon, { sun: polarNight, courtIsLit: true }),
    ).toBe("under-lights");
  });

  it("treats a half-filled sun record as sun-down", () => {
    const broken: SunTimes = { ...sun, sunrise: null };
    expect(
      lightMarkFor(sun.solarNoon, { sun: broken, courtIsLit: false }),
    ).toBe("dark");
    const broken2: SunTimes = { ...sun, sunset: null };
    expect(
      lightMarkFor(sun.solarNoon, { sun: broken2, courtIsLit: true }),
    ).toBe("under-lights");
  });
});

describe("dayLineParts", () => {
  const sun = sunTimes(34.0195, -118.4912, { year: 2026, month: 11, day: 28 });
  it("lists golden hour, sunset, last light and which courts are lit", () => {
    const parts = dayLineParts(sun, [
      { id: "c1", isLit: true },
      { id: "c2", isLit: false },
      { id: "c3", isLit: true },
    ]);
    expect(parts.goldenHourAt).toBe(sun.goldenHourStart);
    expect(parts.sunsetAt).toBe(sun.sunset);
    expect(parts.lastLightAt).toBe(sun.civilDusk);
    expect(parts.lightsOnAt).toBe(sun.sunset);
    expect(parts.courts).toEqual({
      total: 3,
      litIds: ["c1", "c3"],
      unlitIds: ["c2"],
      allLit: false,
      noneLit: false,
    });
    expect(parts.daylight).toBe("normal");
  });
  it("all lit, none lit and no courts", () => {
    expect(dayLineParts(sun, [{ id: "a", isLit: true }]).courts.allLit).toBe(
      true,
    );
    const none = dayLineParts(sun, [{ id: "a", isLit: false }]);
    expect(none.courts.noneLit).toBe(true);
    expect(none.lightsOnAt).toBeNull();
    expect(dayLineParts(sun, []).courts).toMatchObject({
      total: 0,
      allLit: false,
      noneLit: true,
    });
  });
});
