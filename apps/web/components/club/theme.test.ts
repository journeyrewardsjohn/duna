import { describe, expect, it } from "vitest";
import {
  ACCENT_CONTRAST,
  clubFill,
  clubThemeView,
  contrast,
  guardedAccent,
  NIGHT_COURT,
  onFill,
  readsAsSolar,
  SALT,
  SOLAR,
  UNPUBLISHED_THEME,
} from "./theme";

const published = (overrides: Partial<typeof UNPUBLISHED_THEME> = {}) => ({
  ...UNPUBLISHED_THEME,
  publishedAt: "2026-09-01T16:00:00.000Z",
  ...overrides,
});

describe("club theme → tokens", () => {
  it("an unpublished theme is Duna's defaults: no accent, no club words", () => {
    const view = clubThemeView({
      ...UNPUBLISHED_THEME,
      tagline: "Draft words",
      heroMediaType: "image",
      heroMediaUrl: "https://example.test/draft.jpg",
    });
    expect(view.themed).toBe(false);
    expect(view.color).toBeNull();
    expect(view.style).toEqual({});
    expect(view.tagline).toBeUndefined();
    expect(view.hero).toBeUndefined();
    expect(view.cardStyle).toBe("soft");
    expect(view.layout).toBe("editorial");
  });

  it("honours every saved choice: colour, logos, tile, media, layout, card style, words", () => {
    const view = clubThemeView(
      published({
        palette: { ...UNPUBLISHED_THEME.palette, primary: "#1f6f78" },
        logoUrl: "https://example.test/logo.svg",
        logoLightUrl: "https://example.test/logo-light.svg",
        logoDarkUrl: "https://example.test/logo-dark.svg",
        markUrl: "https://example.test/tile.png",
        heroMediaType: "video",
        heroMediaUrl: "https://example.test/film.mp4",
        heroPosterUrl: "https://example.test/poster.jpg",
        cardStyle: "borderless",
        profileLayout: "immersive",
        tagline: "  Sand every day.  ",
        profileSummary: "Our words.",
        brandDisplayName: "South Bay VC",
        membershipProgramName: "Pier Pass",
      }),
    );
    expect(view.themed).toBe(true);
    expect(view.color).toBe("#1F6F78");
    expect(view.mark).toEqual({
      logo: "https://example.test/logo.svg",
      logoLight: "https://example.test/logo-light.svg",
      logoDark: "https://example.test/logo-dark.svg",
      tile: "https://example.test/tile.png",
    });
    expect(view.hero).toEqual({
      kind: "video",
      url: "https://example.test/film.mp4",
      poster: "https://example.test/poster.jpg",
    });
    expect(view.cardStyle).toBe("borderless");
    expect(view.layout).toBe("immersive");
    expect(view.tagline).toBe("Sand every day.");
    expect(view.summary).toBe("Our words.");
    expect(view.displayName).toBe("South Bay VC");
    expect(view.membershipProgramName).toBe("Pier Pass");
  });

  it("an unknown layout falls back to editorial", () => {
    expect(clubThemeView(published({ profileLayout: "magazine" })).layout).toBe(
      "editorial",
    );
  });

  it.each(["#FFE14D", "#9FCFD3", "#1F6F78", "#0B0B0B", "#FFFFFF", "#2E7D32"])(
    "the accent reads at 4.5:1 on every light and dark ground (%s)",
    (color) => {
      const view = clubThemeView(
        published({
          palette: { ...UNPUBLISHED_THEME.palette, primary: color },
        }),
      );
      const light = view.style["--club-accent-light"]!;
      const dark = view.style["--club-accent-dark"]!;
      for (const ground of [SALT, "#FFFFFF"]) {
        expect(contrast(light, ground)).toBeGreaterThanOrEqual(ACCENT_CONTRAST);
      }
      for (const ground of [NIGHT_COURT, "#17262F", "#1C2D38"]) {
        expect(contrast(dark, ground)).toBeGreaterThanOrEqual(ACCENT_CONTRAST);
      }
    },
  );

  it("a colour that already reads is kept as it is", () => {
    expect(guardedAccent("#1F6F78", [SALT], NIGHT_COURT)).toBe("#1F6F78");
  });

  it("the fill's foreground is whichever of Salt and Night Court reads better", () => {
    expect(onFill("#1F6F78")).toBe(SALT);
    expect(onFill("#FFE14D")).toBe(NIGHT_COURT);
  });

  it("never Solar: a red-orange club colour is toned down", () => {
    expect(readsAsSolar(SOLAR)).toBe(true);
    expect(readsAsSolar("#E9602F")).toBe(true);
    expect(readsAsSolar("#1F6F78")).toBe(false);
    expect(readsAsSolar("#B5814F")).toBe(false);
    const { fill, solarAdjusted } = clubFill(SOLAR);
    expect(solarAdjusted).toBe(true);
    expect(fill).not.toBe(SOLAR.toUpperCase());
    expect(readsAsSolar(fill)).toBe(false);
    const view = clubThemeView(
      published({ palette: { ...UNPUBLISHED_THEME.palette, primary: SOLAR } }),
    );
    expect(view.solarAdjusted).toBe(true);
    expect(view.style["--club-fill"]).toBe(fill);
  });

  it("an invalid colour is ignored, not guessed", () => {
    const view = clubThemeView(
      published({ palette: { ...UNPUBLISHED_THEME.palette, primary: "teal" } }),
    );
    expect(view.color).toBeNull();
    expect(view.style).toEqual({});
  });
});
