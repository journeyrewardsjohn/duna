import { nativeTokens } from "./native/tokens/tokens.native";
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

const light = nativeTokens.color.light;

/**
 * Product-app colour names from the earlier mobile system, re-pointed at the
 * Tideline 4.1.1 light roles (M-F0/M-F1) so unmigrated screens take the new
 * palette at once. Values come from the generated tokens; new screens use
 * `@duna/ui/native` and its theme instead.
 */
export const dunaAppColors = {
  page: light.ground,
  card: light.surface,
  subtle: light["surface-sunken"],
  subtleStrong: light["action-soft"],
  ink: light.text,
  inkPressed: light["action-hover"],
  textSecondary: light["text-2"],
  textTertiary: light["text-3"],
  textFaint: light["text-disabled"],
  hairline: light.line,
  border: light["line-strong"],
  navy: light.action,
  navyLift: light["action-hover"],
  mist: light["text-3"],
  sky: light.selected,
  blush: light["sun-wash"],
  sand: light.sun,
  cream: light["surface-subtle"],
  gold: light["sun-ink"],
  positive: light.positive,
  positiveWash: light["positive-wash"],
  danger: light.danger,
} as const;

export const dunaAppShape = {
  actionTileRadius: 18,
  cardRadius: 20,
  compactRadius: 16,
  sectionRadius: 28,
  pillRadius: 999,
} as const;

/** The supplied launch film is 10.042 seconds; this guard leaves its final
 * frame visible instead of cutting the animation off on a timer boundary. */
export const dunaLaunchFilmMinimumMs = 10_100;

export function resolveDunaMobileTokens(
  theme: DunaTheme,
  zone: DunaZone = "editorial",
  contrast: DunaContrast = "ambient",
) {
  const semantic = resolveDunaTokens(theme, zone, contrast);
  const dark = theme === "dark" || zone === "live";
  const role = nativeTokens.color[zone === "live" ? "live" : theme];

  // The Salt ground replaces the old white canvas; glass and underlays map to
  // the Tideline glass, selection and warm-wash roles.
  return {
    ...semantic,
    glass: role["glass-fill-light"],
    glassStrong: role.surface,
    glassEdge: role["glass-edge"],
    blueUnderlay: role.selected,
    sandUnderlay: role["sun-wash"],
    selectedFill: dark ? semantic.surface3 : role.surface,
    inactiveFill: role["surface-sunken"],
  } as const;
}
