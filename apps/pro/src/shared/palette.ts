import { nativeColors, type NativeColors } from "@duna/ui/native/tokens";

/** "r,g,b" for the legacy `rgba(rgb, alpha)` helper. */
function rgbOf(hex: string): string {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  return `${(value >> 16) & 255},${(value >> 8) & 255},${value & 255}`;
}

/**
 * Pro's legacy palette names, re-pointed at Tideline 4.1.1 roles by meaning
 * (M-F0/M-F1) for light and dark.
 *
 * The retired flare orange is split by meaning (M-P0): every `flare` call
 * site in Pro today marks something live (a live court dot, the live
 * schedule line and state, the Watch pulse, the live pill, the live now-card
 * edge), so `flare` is the `live` role (Solar). Controls that used flare take
 * `flareAction`, the `action` role (Night Court on light, Dune on dark): the
 * two flare-filled controls (`venueMatchActionLive`, the profile `dot`) use
 * it since the Pro shell (M-R0).
 */
function legacyPalette(role: NativeColors, dark: boolean) {
  const flare = role.live;
  const flareAction = role.action;
  return {
    canvas: role.ground,
    ink: dark ? role.ground : role.text,
    depth: role.surface,
    navy: role["surface-sunken"],
    navyLift: dark ? role["surface-raised"] : role["surface-subtle"],
    bone: role.text,
    muted: role["text-2"],
    aqua: role.action,
    aquaDeep: role["action-hover"],
    sand: role.sun,
    flare,
    flareAction,
    onFlareAction: role["on-action"],
    positive: role.positive,
    warning: role.warning,
    danger: role.danger,
    onAccent: role["on-action"],
    overlayRgb: rgbOf(role.text),
    accentRgb: rgbOf(role.action),
    warningRgb: rgbOf(role.warning),
    positiveRgb: rgbOf(role.positive),
    dangerRgb: rgbOf(role.danger),
    flareRgb: rgbOf(flare),
    flareActionRgb: rgbOf(flareAction),
    inkRgb: rgbOf(dark ? role.ground : role.text),
    depthRgb: rgbOf(role.surface),
  };
}

export const lightColors = legacyPalette(nativeColors("light"), false);

export type Palette = {
  readonly [Key in keyof typeof lightColors]: string;
};

export const darkColors: Palette = legacyPalette(nativeColors("dark"), true);

export type ThemeName = "light" | "dark";

export type ThemePreference = ThemeName | "system";

let activePalette: Palette = lightColors;

export function setActivePalette(palette: Palette) {
  activePalette = palette;
}

export const colors = new Proxy(lightColors, {
  get(_target, property: keyof Palette) {
    return activePalette[property];
  },
}) as Palette;

export function rgba(rgb: string, alpha: number) {
  return `rgba(${rgb},${alpha})`;
}
