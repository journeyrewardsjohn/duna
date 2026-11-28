import { describe, expect, it } from "vitest";
import { conditionsFreshness, windOnCourtSentence } from "./conditions-view";
import { windOnCourt, mphToKph } from "./conditions";
import { dayStrip } from "./day-strip";
import {
  dayLightMinutes,
  daypartAt,
  daypartBounds,
  daypartGlyph,
  groupByDaypart,
  LIGHT_MARK_GLYPH,
  lightMarkAtMinute,
} from "./dayparts";
import { sunTimes } from "./light";
import {
  durationCrests,
  durationOptions,
  slotChip,
  staleStarts,
} from "./slot-state";
import { formatSpan, sunArcModel } from "./sun-arc";
import { railModel } from "./time-rail";
import { timeSlots } from "./time-slots";
import {
  dstTransition,
  timeZoneLabel,
  timeZoneNote,
  timeZonesDiffer,
  wallClockMinutes,
} from "./time-zone";
import { zonedTimeToInstant } from "./zoned-time";

const LA = "America/Los_Angeles";
const NY = "America/New_York";
const SANTA_MONICA = { lat: 34.0195, lon: -118.4912 };
const NOV_28 = { year: 2026, month: 11, day: 28 };

describe("time zones", () => {
  const noon = zonedTimeToInstant(NOV_28, 720, LA);

  it("says when the venue's clock differs from the viewer's", () => {
    expect(timeZonesDiffer(noon, LA, LA)).toBe(false);
    expect(timeZonesDiffer(noon, LA, "America/Tijuana")).toBe(false);
    expect(timeZonesDiffer(noon, LA, NY)).toBe(true);
    const note = timeZoneNote({
      at: noon,
      timeZone: LA,
      viewerTimeZone: NY,
      locale: "en-US",
    });
    expect(note).toEqual({ differs: true, label: "PST", offsetMinutes: -180 });
    expect(timeZoneLabel(noon, { timeZone: NY, locale: "en-US" })).toBe("EST");
  });

  it("reads wall-clock minutes on the venue's day, past midnight too", () => {
    expect(wallClockMinutes(noon, NOV_28, LA)).toBe(720);
    const oneAm = zonedTimeToInstant({ ...NOV_28, day: 29 }, 60, LA);
    expect(wallClockMinutes(oneAm, NOV_28, LA)).toBe(1500);
    const lastNight = zonedTimeToInstant({ ...NOV_28, day: 27 }, 1380, LA);
    expect(wallClockMinutes(lastNight, NOV_28, LA)).toBe(-60);
    const weekAgo = noon - 7 * 86_400_000;
    expect(wallClockMinutes(weekAgo, NOV_28, LA)).toBe(720 - 7 * 1440);
  });

  it("finds the spring-forward change: a 23-hour day", () => {
    const t = dstTransition({ year: 2026, month: 3, day: 8 }, LA);
    expect(t).toEqual({
      kind: "spring-forward",
      atMinute: 120,
      shiftMinutes: 60,
      lengthMinutes: 1380,
    });
  });

  it("finds the fall-back change: a 25-hour day", () => {
    const t = dstTransition({ year: 2026, month: 11, day: 1 }, LA);
    expect(t).toEqual({
      kind: "fall-back",
      atMinute: 120,
      shiftMinutes: 60,
      lengthMinutes: 1500,
    });
  });

  it("finds a half-hour change (Lord Howe) and none on an ordinary day", () => {
    const t = dstTransition(
      { year: 2026, month: 4, day: 5 },
      "Australia/Lord_Howe",
    );
    expect(t?.kind).toBe("fall-back");
    expect(t?.shiftMinutes).toBe(30);
    expect(dstTransition(NOV_28, LA)).toBeNull();
  });
});

describe("day strip months", () => {
  it("labels the first day and the 1st of a month", () => {
    const strip = dayStrip({
      items: [],
      timeZone: LA,
      now: zonedTimeToInstant({ year: 2026, month: 11, day: 28 }, 600, LA),
      days: 7,
    });
    expect(strip.days.filter((d) => d.startsMonth).map((d) => d.date)).toEqual([
      "2026-11-28",
      "2026-12-01",
    ]);
    expect(strip.days.map((d) => d.month)).toEqual([
      11, 11, 11, 12, 12, 12, 12,
    ]);
  });

  it("keeps each date on 23- and 25-hour days", () => {
    const spring = dayStrip({
      items: [
        {
          startsAt: zonedTimeToInstant(
            { year: 2026, month: 3, day: 8 },
            23 * 60 + 30,
            LA,
          ),
        },
      ],
      timeZone: LA,
      now: zonedTimeToInstant({ year: 2026, month: 3, day: 7 }, 600, LA),
      days: 3,
    });
    expect(spring.days.map((d) => [d.date, d.count, d.lengthMinutes])).toEqual([
      ["2026-03-07", 0, 1440],
      ["2026-03-08", 1, 1380],
      ["2026-03-09", 0, 1440],
    ]);
  });
});

describe("dayparts", () => {
  const sun = sunTimes(SANTA_MONICA.lat, SANTA_MONICA.lon, NOV_28);
  const light = dayLightMinutes(sun, NOV_28, LA);

  it("matches the brand book sample in wall-clock minutes", () => {
    expect(light.sunriseMinute).toBe(6 * 60 + 38);
    expect(light.goldenHourMinute).toBe(15 * 60 + 45);
    expect(light.sunsetMinute).toBe(16 * 60 + 45);
  });

  it("splits the day into five dayparts by the venue's light", () => {
    expect(daypartAt(9 * 60, light)).toBe("morning");
    expect(daypartAt(12 * 60, light)).toBe("midday");
    expect(daypartAt(14 * 60 + 30, light)).toBe("afternoon");
    expect(daypartAt(16 * 60, light)).toBe("golden-hour");
    expect(daypartAt(19 * 60, light)).toBe("evening");
    expect(daypartAt(1500, light)).toBe("evening");
  });

  it("squeezes the afternoon out when golden hour comes first", () => {
    const winter = {
      sunriseMinute: 540,
      goldenHourMinute: 13 * 60,
      sunsetMinute: 14 * 60,
      civilDawnMinute: 480,
      civilDuskMinute: 870,
    };
    const afternoon = daypartBounds(winter).find(
      (b) => b.daypart === "afternoon",
    );
    expect(afternoon?.fromMinute).toBe(afternoon?.toMinute);
    expect(daypartAt(13 * 60 + 30, winter)).toBe("golden-hour");
    expect(daypartAt(12 * 60, winter)).toBe("midday");
  });

  it("falls back to a 6 PM evening without a sunset", () => {
    const polar = {
      sunriseMinute: null,
      goldenHourMinute: null,
      sunsetMinute: null,
      civilDawnMinute: null,
      civilDuskMinute: null,
    };
    expect(daypartAt(17 * 60, polar)).toBe("afternoon");
    expect(daypartAt(18 * 60, polar)).toBe("evening");
  });

  it("groups slots, leaving out empty dayparts", () => {
    const model = timeSlots({
      availability: { openMinute: 14 * 60, closeMinute: 21 * 60, blocks: [] },
      duration: 60,
      locale: "en-US",
    });
    const groups = groupByDaypart(model.slots, light);
    expect(groups.map((g) => [g.daypart, g.items.length])).toEqual([
      ["afternoon", 4],
      ["golden-hour", 2],
      ["evening", 8],
    ]);
  });

  it("gives each slot its light, and an unlit court goes too dark", () => {
    const at = (minute: number, courtIsLit: boolean) =>
      LIGHT_MARK_GLYPH[
        lightMarkAtMinute(minute, {
          date: NOV_28,
          timeZone: LA,
          sun,
          courtIsLit,
        })
      ];
    expect(at(12 * 60, true)).toBe("full-sun");
    expect(at(16 * 60, true)).toBe("golden-hour");
    expect(at(18 * 60, true)).toBe("under-lights");
    expect(at(18 * 60, false)).toBe("too-dark");
    expect(daypartGlyph("evening", false)).toBe("too-dark");
    expect(daypartGlyph("morning", true)).toBe("first-light");
  });

  it("keeps wall-clock light minutes on a 25-hour day", () => {
    const nov1 = { year: 2026, month: 11, day: 1 };
    const s = sunTimes(SANTA_MONICA.lat, SANTA_MONICA.lon, nov1);
    const l = dayLightMinutes(s, nov1, LA);
    // PST after the change at 2 AM: sunrise about 6:15 AM, sunset about 5:00 PM.
    expect(l.sunriseMinute).toBeGreaterThan(6 * 60);
    expect(l.sunriseMinute).toBeLessThan(6 * 60 + 30);
    expect(l.sunsetMinute).toBeGreaterThan(16 * 60 + 50);
    expect(l.sunsetMinute).toBeLessThan(17 * 60 + 10);
  });
});

describe("slot chips", () => {
  it("covers every state, and only open ones are selectable", () => {
    expect(slotChip({ available: true })).toEqual({
      state: "available",
      selectable: true,
      words: null,
    });
    expect(slotChip({ available: true, selected: true }).state).toBe(
      "selected",
    );
    expect(slotChip({ available: true, remaining: 2 })).toEqual({
      state: "few-left",
      selectable: true,
      words: "2 left",
    });
    expect(slotChip({ available: true, remaining: 1 }).words).toBe("1 left");
    expect(slotChip({ available: true, remaining: 5 }).state).toBe("available");
    expect(slotChip({ available: true, remaining: 0 }).state).toBe("taken");
    expect(slotChip({ available: false, reason: "booked" })).toEqual({
      state: "taken",
      selectable: false,
      words: "full",
    });
    expect(slotChip({ available: false, reason: "maintenance" }).words).toBe(
      "closed for maintenance",
    );
    for (const reason of [
      "closed",
      "runs-past-closing",
      "in-the-past",
    ] as const) {
      const chip = slotChip({ available: false, reason });
      expect(chip.state).toBe("outside-hours");
      expect(chip.selectable).toBe(false);
    }
    expect(slotChip({ available: true, light: "dark" }).state).toBe("too-dark");
    expect(slotChip({ available: true, light: "dark" }).selectable).toBe(false);
  });

  it("a stale slot is never bookable, even if it was selected", () => {
    const chip = slotChip({ available: true, selected: true, stale: true });
    expect(chip).toEqual({
      state: "stale",
      selectable: false,
      words: "just taken",
    });
  });

  it("finds slots taken while the person was looking", () => {
    const before = [
      { startMinute: 600, available: true },
      { startMinute: 630, available: true },
      { startMinute: 660, available: false },
    ];
    const after = [
      { startMinute: 600, available: true },
      { startMinute: 630, available: false },
      { startMinute: 660, available: false },
    ];
    expect(staleStarts(before, after)).toEqual([630]);
    expect(staleStarts(after, before)).toEqual([]);
  });

  it("scores durations in crests and splits off longer lengths", () => {
    expect([30, 60, 75, 90, 120, 180].map(durationCrests)).toEqual([
      1, 1, 2, 2, 3, 3,
    ]);
    expect(durationOptions([180, 60, 90, 120, 60])).toEqual({
      crests: [60, 90, 120],
      extra: [180],
    });
  });
});

describe("time rail", () => {
  it("places events, lanes, free windows, now and the sun", () => {
    const model = railModel({
      startMinute: 360,
      endMinute: 1320,
      events: [
        { id: "a", startMinute: 540, endMinute: 630 },
        { id: "b", startMinute: 600, endMinute: 660 },
        { id: "c", startMinute: 900, endMinute: 960 },
        { id: "outside", startMinute: 1400, endMinute: 1440 },
      ],
      nowMinute: 840,
      light: {
        sunriseMinute: 398,
        goldenHourMinute: 945,
        sunsetMinute: 1005,
        civilDawnMinute: 371,
        civilDuskMinute: 1032,
      },
    });
    expect(model.events.map((e) => [e.event.id, e.lane, e.lanes])).toEqual([
      ["a", 0, 2],
      ["b", 1, 2],
      ["c", 0, 1],
    ]);
    expect(model.free.map((f) => [f.startMinute, f.endMinute])).toEqual([
      [360, 540],
      [660, 900],
      [960, 1320],
    ]);
    expect(model.now).toEqual({ minute: 840, at: 0.5 });
    expect(model.sunset?.minute).toBe(1005);
    expect(model.hours[0]).toEqual({ minute: 360, at: 0 });
    expect(model.hours.at(-1)).toEqual({ minute: 1320, at: 1 });
  });

  it("drops a now outside the rail and short gaps", () => {
    const model = railModel({
      startMinute: 600,
      endMinute: 720,
      events: [{ id: "a", startMinute: 610, endMinute: 700 }],
      nowMinute: 900,
    });
    expect(model.now).toBeNull();
    expect(model.free).toEqual([]);
    expect(model.sunrise).toBeNull();
  });
});

describe("sun arc", () => {
  const sun = sunTimes(SANTA_MONICA.lat, SANTA_MONICA.lon, NOV_28);
  const at = (minute: number) => zonedTimeToInstant(NOV_28, minute, LA);

  it("counts light left in daylight and golden hour", () => {
    const day = sunArcModel(sun, at(15 * 60 + 10));
    expect(day.phase).toBe("daylight");
    expect(formatSpan(day.minutesOfLightLeft)).toBe("1 h 35 min");
    expect(day.progress).toBeGreaterThan(0.8);
    expect(day.goldenFrom).toBeGreaterThan(day.progress);
    expect(sunArcModel(sun, at(16 * 60)).phase).toBe("golden-hour");
  });

  it("counts to first light before sunrise and after sunset", () => {
    const early = sunArcModel(sun, at(6 * 60));
    expect(early.phase).toBe("before-sunrise");
    expect(early.minutesUntilFirstLight).toBe(39);
    const late = sunArcModel(sun, at(20 * 60));
    expect(late.phase).toBe("after-sunset");
    expect(late.minutesOfLightLeft).toBe(0);
    expect(formatSpan(late.minutesUntilFirstLight ?? 0)).toBe("10 h 39 min");
  });

  it("handles polar day and polar night", () => {
    const tromso = (month: number) =>
      sunTimes(69.65, 18.96, { year: 2026, month, day: 21 });
    expect(sunArcModel(tromso(6), Date.UTC(2026, 5, 21, 12)).phase).toBe(
      "polar-day",
    );
    expect(sunArcModel(tromso(12), Date.UTC(2026, 11, 21, 12)).phase).toBe(
      "polar-night",
    );
    expect(formatSpan(45)).toBe("45 min");
    expect(formatSpan(120)).toBe("2 h");
  });
});

describe("conditions view", () => {
  it("is stale after the freshness window", () => {
    const now = Date.UTC(2026, 10, 28, 20);
    expect(conditionsFreshness(now - 30 * 60_000, now)).toEqual({
      stale: false,
      ageMinutes: 30,
    });
    expect(conditionsFreshness(now - 61 * 60_000, now).stale).toBe(true);
    expect(conditionsFreshness(now - 20 * 60_000, now, 15).stale).toBe(true);
    expect(conditionsFreshness(now + 60_000, now).ageMinutes).toBe(0);
  });

  it("says which end the wind favours, in words", () => {
    const along = windOnCourt(mphToKph(12), 315, 315);
    expect(windOnCourtSentence(along)).toBe(
      "Wind from the northwest, along the court. The northwest end has the wind at your back.",
    );
    expect(
      windOnCourtSentence(along, { endNames: { NW: "The ocean end" } }),
    ).toContain("The ocean end has the wind at your back.");
    expect(windOnCourtSentence(windOnCourt(mphToKph(12), 45, 315))).toBe(
      "Wind from the northeast, across the court: neither end is favoured.",
    );
    expect(windOnCourtSentence(windOnCourt(mphToKph(1), 45, 315))).toBe(
      "Calm: neither end is favoured.",
    );
  });
});
