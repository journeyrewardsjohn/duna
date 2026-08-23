import {
  resolveDunaTokens,
  type DunaContrast,
  type DunaTheme,
  type DunaZone,
} from "./tokens";

/**
 * Duna's native rhythm is intentionally based on five-point increments.
 * Screen code should compose these values rather than inventing local gaps.
 */
export const mobileGrid = {
  hairline: 1,
  half: 2.5,
  1: 5,
  2: 10,
  3: 15,
  4: 20,
  5: 25,
  6: 30,
  7: 35,
  8: 40,
  9: 45,
  10: 50,
  11: 55,
  12: 60,
} as const;

export const mobileControl = {
  minimumTarget: mobileGrid[10],
  primaryTarget: mobileGrid[12],
  icon: 22,
  iconButton: mobileGrid[10],
  pageInset: mobileGrid[4],
  sheetRadius: mobileGrid[6],
  cardRadius: mobileGrid[4],
  nestedRadius: mobileGrid[3],
  pillRadius: 999,
} as const;

export const mobileType = {
  micro: { fontSize: 12, lineHeight: 15 },
  label: { fontSize: 14, lineHeight: 20 },
  body: { fontSize: 16, lineHeight: 22 },
  title: { fontSize: 20, lineHeight: 25 },
  display: { fontSize: 38, lineHeight: 42 },
} as const;

export function resolveDunaMobileTokens(
  theme: DunaTheme,
  zone: DunaZone = "editorial",
  contrast: DunaContrast = "ambient",
) {
  const semantic = resolveDunaTokens(theme, zone, contrast);
  const dark = theme === "dark" || zone === "live";

  return {
    ...semantic,
    glass: dark ? "rgba(20,26,30,0.82)" : "rgba(255,255,255,0.82)",
    glassStrong: dark ? "rgba(20,26,30,0.94)" : "rgba(255,255,255,0.94)",
    glassEdge: dark ? "rgba(181,204,211,0.18)" : "rgba(255,255,255,0.72)",
    blueUnderlay: dark ? "rgba(34,52,59,0.78)" : "rgba(181,204,211,0.30)",
    sandUnderlay: dark ? "rgba(201,169,106,0.18)" : "rgba(239,230,211,0.58)",
    selectedFill: dark ? semantic.surface3 : semantic.surface1,
    inactiveFill: dark ? semantic.surface1 : semantic.surface2,
  } as const;
}
