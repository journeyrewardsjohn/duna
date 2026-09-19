import { sandColors } from "./sand";
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

/**
 * Product-app color roles from the current Duna mobile design system.
 *
 * Keep these semantic instead of reaching for the broader environmental
 * palette. The app uses warm sand and charcoal; Duna color belongs in
 * small brand, status, data, and section moments.
 */
export const dunaAppColors = {
  page: sandColors.canvas,
  card: sandColors.surface,
  subtle: sandColors.inset,
  subtleStrong: sandColors.inset,
  ink: sandColors.ink,
  inkPressed: "#464649",
  textSecondary: sandColors.muted,
  textTertiary: sandColors.muted,
  textFaint: "#B9B9BE",
  hairline: sandColors.line,
  border: sandColors.line,
  navy: "#142335",
  navyLift: "#2B385C",
  mist: "#7C95AB",
  sky: "#D3E3F0",
  blush: "#FECFC0",
  sand: "#E6B48C",
  cream: "#FAF6F2",
  gold: "#D6B143",
  positive: "#1E7A46",
  positiveWash: "#E8F2EC",
  danger: "#C94443",
} as const;

export const dunaAppShape = {
  actionTileRadius: 18,
  cardRadius: 20,
  compactRadius: 16,
  sectionRadius: 28,
  pillRadius: 999,
} as const;

export function resolveDunaMobileTokens(
  theme: DunaTheme,
  zone: DunaZone = "editorial",
  contrast: DunaContrast = "ambient",
) {
  const semantic = resolveDunaTokens(theme, zone, contrast);
  const dark = theme === "dark" || zone === "live";
  const sandCanvas = !dark && contrast === "ambient";

  return {
    ...semantic,
    ground: sandCanvas ? sandColors.canvas : semantic.ground,
    groundWarm: sandCanvas ? sandColors.canvas : semantic.groundWarm,
    groundCool: sandCanvas ? sandColors.inset : semantic.groundCool,
    surface2: sandCanvas ? sandColors.inset : semantic.surface2,
    surface1: sandCanvas ? sandColors.surface : semantic.surface1,
    text1: sandCanvas ? sandColors.ink : semantic.text1,
    text2: sandCanvas ? sandColors.muted : semantic.text2,
    hairline: sandCanvas ? sandColors.line : semantic.hairline,
    glass: dark ? "rgba(20,26,30,0.82)" : "rgba(255,255,255,0.82)",
    glassStrong: dark ? "rgba(20,26,30,0.94)" : "rgba(255,255,255,0.94)",
    glassEdge: dark ? "rgba(181,204,211,0.18)" : "rgba(255,255,255,0.72)",
    blueUnderlay: dark ? "rgba(34,52,59,0.78)" : "rgba(181,204,211,0.30)",
    sandUnderlay: dark ? "rgba(201,169,106,0.18)" : "rgba(239,230,211,0.58)",
    selectedFill: dark ? semantic.surface3 : "rgba(255,255,255,0.76)",
    inactiveFill: dark ? semantic.surface1 : sandColors.inset,
  } as const;
}
