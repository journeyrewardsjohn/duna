import { nativeColors, nativeTokens } from "@duna/ui/native/tokens";

/**
 * The Player's legacy palette names, re-pointed at Tideline 4.1.1 light roles
 * (M-F0/M-F1) by meaning, so unmigrated screens take the new palette. The
 * retired flare orange is the warm signal's ink here (no screen in this
 * palette is a live state); live screens use `@duna/ui/native`'s live zone.
 */
const role = nativeColors("light");

/** "r,g,b" for the legacy `rgba(rgb, alpha)` helper. */
function rgbOf(hex: string): string {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  return `${(value >> 16) & 255},${(value >> 8) & 255},${value & 255}`;
}

const lightColors = {
  canvas: role.ground,
  ink: role.text,
  depth: role.surface,
  navy: role["surface-sunken"],
  navyLift: role["surface-sunken"],
  bone: role.text,
  muted: role["text-3"],
  aqua: role.action,
  aquaDeep: role["action-hover"],
  sand: role.sun,
  flare: role["sun-ink"],
  resultWin: role["sun-wash"],
  resultWinBorder: role.sun,
  resultLoss: role["surface-sunken"],
  resultLossBorder: role["line-strong"],
  signal: role.energy,
  signalInk: role["on-energy"],
  positive: role.positive,
  warning: role.warning,
  danger: role.danger,
  onAccent: role["on-action"],
  white: nativeTokens.ramp["haze-0"],
  overlayRgb: rgbOf(role.text),
  accentRgb: rgbOf(role.action),
  warningRgb: rgbOf(role.warning),
  positiveRgb: rgbOf(role.positive),
  dangerRgb: rgbOf(role.danger),
  flareRgb: rgbOf(role["sun-ink"]),
  inkRgb: rgbOf(role.text),
  depthRgb: rgbOf(role.surface),
  navyRgb: rgbOf(role["surface-sunken"]),
  boneRgb: rgbOf(role.text),
  whiteRgb: rgbOf(nativeTokens.ramp["haze-0"]),
} as const;

type Palette = {
  readonly [Key in keyof typeof lightColors]: string;
};

export type ThemeName = "light" | "dark";
export const colors: Palette = lightColors;

export function rgba(rgb: string, alpha: number) {
  return `rgba(${rgb},${alpha})`;
}
