import { describe, expect, it } from "vitest";
import {
  CLUB_MARK_SMALL_LIMIT,
  clubMarkModel,
  foregroundFor,
  generatedClubColor,
  hslToRgb,
  hueFor,
  MEMBERSHIP_STATUS_TEXT,
  membershipPassModel,
  NIGHT_COURT,
  SALT,
  toHexColor,
} from "./club-mark";
import {
  RATING_RING_GEOMETRY,
  ratingRingArcPath,
  ratingRingLabel,
  ratingRingModel,
  reliabilityBand,
} from "./rating-ring";

describe("ratingRingArcPath", () => {
  it("draws nothing for an empty arc", () => {
    expect(ratingRingArcPath(0, 0, 96)).toBe("");
    expect(ratingRingArcPath(10, 5, 96)).toBe("");
  });
  it("starts at 12 o'clock and uses the large-arc flag past half", () => {
    expect(ratingRingArcPath(0, 90, 96)).toBe("M 110 14 A 96 96 0 0 1 206 110");
    expect(ratingRingArcPath(0, 270, 96)).toBe("M 110 14 A 96 96 0 1 1 14 110");
  });
  it("closes a full turn with two half arcs", () => {
    expect(ratingRingArcPath(0, 360, 96)).toBe(
      "M 110 14 A 96 96 0 1 1 110 206 A 96 96 0 1 1 110 14",
    );
  });
  it("geometry snapshot: track, progress and the three band segments", () => {
    const { track, band } = RATING_RING_GEOMETRY;
    const model = ratingRingModel({
      value: 3.42,
      delta: 0.08,
      reliability: 2,
      locale: "en-US",
    });
    const drawing = {
      progress: ratingRingArcPath(
        model.progress.startDeg,
        model.progress.endDeg,
        track.radius,
      ),
      from: ratingRingArcPath(
        model.progressFrom.startDeg,
        model.progressFrom.endDeg,
        track.radius,
      ),
      band: reliabilityBand(2).map((segment) => ({
        d: ratingRingArcPath(segment.startDeg, segment.endDeg, band.radius),
        filled: segment.filled,
      })),
    };
    expect(drawing).toMatchInlineSnapshot(`
      {
        "band": [
          {
            "d": "M 114 26.1 A 84 84 0 0 1 184.66 148.49",
            "filled": true,
          },
          {
            "d": "M 180.66 155.42 A 84 84 0 0 1 39.34 155.42",
            "filled": true,
          },
          {
            "d": "M 35.34 148.49 A 84 84 0 0 1 106 26.1",
            "filled": false,
          },
        ],
        "from": "M 110 14 A 96 96 0 1 1 23.14 150.87",
        "progress": "M 110 14 A 96 96 0 1 1 28.94 58.56",
      }
    `);
  });
});

describe("ratingRingLabel", () => {
  const locale = "en-US";
  it("says the number, the change, the progress and the reliability", () => {
    const up = ratingRingModel({
      value: 3.42,
      delta: 0.08,
      reliability: 3,
      locale,
    });
    expect(ratingRingLabel(up, { locale })).toBe(
      "Sand Rating 3.42, up 0.08. 84% of the way to 3.50. Reliability 3 of 3.",
    );
    const down = ratingRingModel({
      value: 3.38,
      delta: -0.04,
      reliability: 2,
      locale,
    });
    expect(ratingRingLabel(down, { locale, label: "Rating" })).toBe(
      "Rating 3.38, down 0.04. 76% of the way to 3.50. Reliability 2 of 3.",
    );
    const steady = ratingRingModel({ value: 3.1, reliability: 1, locale });
    expect(ratingRingLabel(steady, { locale })).toBe(
      "Sand Rating 3.10. 20% of the way to 3.50. Reliability 1 of 3.",
    );
  });
  it("reached and provisional", () => {
    const reached = ratingRingModel({
      value: 3.5,
      delta: 0.1,
      reliability: 3,
      locale,
    });
    expect(ratingRingLabel(reached, { locale })).toBe(
      "Sand Rating 3.50, reached 3.50. Reliability 3 of 3.",
    );
    const three = ratingRingModel({
      value: null,
      matchesLeft: 3,
      reliability: 0,
      locale,
    });
    expect(ratingRingLabel(three, { locale })).toBe(
      "Sand Rating provisional. 3 more matches to a rating. Reliability 1 of 3.",
    );
    const one = ratingRingModel({
      value: null,
      matchesLeft: 1,
      reliability: 0,
      locale,
    });
    expect(ratingRingLabel(one, { locale })).toContain(
      "1 more match to a rating",
    );
    const unknown = ratingRingModel({ value: null, reliability: 0, locale });
    expect(ratingRingLabel(unknown, { locale })).toBe(
      "Sand Rating provisional. Reliability 1 of 3.",
    );
  });
});

describe("club colour maths", () => {
  it("round-trips hex and HSL", () => {
    expect(toHexColor({ r: 14, g: 26, b: 34 })).toBe(NIGHT_COURT);
    expect(toHexColor({ r: 300, g: -4, b: 0.4 })).toBe("#FF0000");
    expect(toHexColor(hslToRgb(0, 1, 0.5))).toBe("#FF0000");
    expect(toHexColor(hslToRgb(120, 1, 0.25))).toBe("#008000");
    expect(toHexColor(hslToRgb(240, 1, 0.75))).toBe("#8080FF");
    expect(toHexColor(hslToRgb(-120, 1, 0.5))).toBe("#0000FF");
    expect(toHexColor(hslToRgb(0, 0, 0.5))).toBe("#808080");
  });
  it("hues are stable per name", () => {
    expect(hueFor("Sunset Beach Club")).toBe(hueFor("Sunset Beach Club"));
    expect(hueFor("")).toBeGreaterThanOrEqual(0);
    expect(hueFor("Harbor Sand Club")).not.toBe(hueFor("Sunset Beach Club"));
  });
  it("generated monogram colours pass 4.5:1 across a sweep of every hue", () => {
    for (let hue = 0; hue < 360; hue += 1) {
      const color = generatedClubColor(hue);
      const choice = foregroundFor(color);
      expect(choice.passesText, `hue ${hue}: ${color} ${choice.ratio}`).toBe(
        true,
      );
      expect(choice.foreground).toBe(SALT);
    }
    expect(generatedClubColor("Cove Volley")).toMatch(/^#[0-9A-F]{6}$/);
  });
  it("any club colour gets at least 3:1 (large type and graphics) from the better ink", () => {
    for (let hue = 0; hue < 360; hue += 15) {
      for (const lightness of [0.1, 0.3, 0.45, 0.5, 0.55, 0.7, 0.9]) {
        const color = toHexColor(hslToRgb(hue, 0.8, lightness));
        expect(foregroundFor(color).passesGraphics, color).toBe(true);
      }
    }
  });
});

describe("clubMarkModel", () => {
  const base = { name: "Sunset Beach Club", color: "#1e5aa8", size: 56 };
  it("prefers logo, then tile, then monogram", () => {
    expect(
      clubMarkModel({ ...base, logo: "l.svg", tile: "t.png" }),
    ).toMatchObject({
      form: "logo",
      src: "l.svg",
      background: "#1E5AA8",
      foreground: SALT,
      generatedBackground: false,
      monogram: "SB",
      radius: 14.6,
    });
    expect(clubMarkModel({ ...base, tile: "t.png" }).form).toBe("tile");
    expect(clubMarkModel(base)).toMatchObject({ form: "monogram", src: null });
  });
  it("picks the logo variant drawn for the ground", () => {
    const both = {
      ...base,
      logo: "l.svg",
      logoLight: "light.svg",
      logoDark: "dark.svg",
    };
    expect(clubMarkModel(both).src).toBe("light.svg");
    expect(clubMarkModel({ ...both, color: "#E9D8B4" }).src).toBe("dark.svg");
    expect(clubMarkModel({ ...base, logoLight: "light.svg" }).src).toBe(
      "light.svg",
    );
  });
  it("honours a forced source and falls back to the monogram when it is missing", () => {
    expect(
      clubMarkModel({ ...base, logo: "l.svg", tile: "t.png", source: "tile" })
        .form,
    ).toBe("tile");
    expect(clubMarkModel({ ...base, source: "tile" }).form).toBe("monogram");
    expect(clubMarkModel({ ...base, tile: "t.png", source: "logo" }).form).toBe(
      "monogram",
    );
    expect(clubMarkModel({ ...base, logo: "l.svg", source: "logo" }).form).toBe(
      "logo",
    );
    expect(
      clubMarkModel({ ...base, logo: "l.svg", source: "monogram" }).form,
    ).toBe("monogram");
  });
  it("below 28 px a logo becomes the monogram unless it works small", () => {
    const small = { ...base, logo: "l.svg", size: CLUB_MARK_SMALL_LIMIT - 8 };
    expect(clubMarkModel(small).form).toBe("monogram");
    expect(clubMarkModel({ ...small, worksSmall: true }).form).toBe("logo");
  });
  it("no colour: a generated, legible ground; numerals flagged for Geist", () => {
    const model = clubMarkModel({ name: "24 Beach", size: 40 });
    expect(model.generatedBackground).toBe(true);
    expect(model.contrast.passesText).toBe(true);
    expect(model.monogram).toBe("2B");
    expect(model.monogramHasNumeral).toBe(true);
    expect(clubMarkModel({ name: null, size: 40 }).monogram).toBeNull();
    expect(
      clubMarkModel({ name: "", size: 40, color: "not a colour" })
        .generatedBackground,
    ).toBe(true);
  });
});

describe("membershipPassModel", () => {
  it("shows a code only for an active membership that has one", () => {
    expect(membershipPassModel({ status: "active", code: "SBC-0148" })).toEqual(
      {
        kind: "code",
        code: "SBC-0148",
      },
    );
    expect(membershipPassModel({ status: "active" })).toMatchObject({
      kind: "message",
      reason: "no-pass",
    });
    expect(membershipPassModel({ status: "pending", code: "X" })).toMatchObject(
      {
        reason: "pending",
        text: "Your pass appears when the club approves you.",
      },
    );
    expect(membershipPassModel({ status: "paused", code: "X" }).kind).toBe(
      "message",
    );
    expect(
      membershipPassModel({ status: "expired", validThrough: "Oct 31, 2026" }),
    ).toMatchObject({ text: expect.stringContaining("ended Oct 31, 2026") });
    expect(membershipPassModel({ status: "expired" })).toMatchObject({
      text: "This membership has ended. Renew it with the club to get a pass.",
    });
    expect(Object.keys(MEMBERSHIP_STATUS_TEXT)).toEqual([
      "active",
      "paused",
      "expired",
      "pending",
    ]);
  });
});
