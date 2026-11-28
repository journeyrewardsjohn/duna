/**
 * Theme resolution, pure: the person's preference (Light, Dark, Match device),
 * the device scheme and the zone give the theme and its colours. The live zone
 * wins over the preference (play in progress); HQ repaints its roles on top of
 * the theme. A dark preference is a preference, never a zone.
 */
import {
  nativeColors,
  type NativeColors,
  type NativeTheme,
  type NativeZone,
} from "../tokens";

export type ThemePreference = "light" | "dark" | "system";
export type ColorScheme = "light" | "dark";

/** The three choices, in the order they are offered, with their labels. */
export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export const themePreferenceLabels: Readonly<Record<ThemePreference, string>> =
  {
    light: "Light",
    dark: "Dark",
    system: "Match device",
  };

/** Reads a stored value; anything unknown is `null` (keep the default). */
export function parseThemePreference(value: unknown): ThemePreference | null {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : null;
}

/** The next choice when a single button cycles through the three. */
export function nextThemePreference(
  preference: ThemePreference,
): ThemePreference {
  const index = THEME_PREFERENCES.indexOf(preference);
  return THEME_PREFERENCES[(index + 1) % THEME_PREFERENCES.length]!;
}

export interface ResolvedTheme {
  readonly preference: ThemePreference;
  /** Light or dark, after Match device is applied (the live zone is dark). */
  readonly scheme: ColorScheme;
  /** The token theme: `live` whenever the zone is live. */
  readonly theme: NativeTheme;
  readonly zone: NativeZone | null;
  readonly colors: NativeColors;
  /** The status bar content over the ground. */
  readonly statusBar: "light" | "dark";
}

export function resolveTheme({
  preference,
  deviceScheme,
  zone = null,
}: {
  readonly preference: ThemePreference;
  readonly deviceScheme: ColorScheme | null | undefined;
  readonly zone?: NativeZone | null;
}): ResolvedTheme {
  const chosen: ColorScheme =
    preference === "system" ? (deviceScheme ?? "light") : preference;
  const theme: NativeTheme = zone === "live" ? "live" : chosen;
  const scheme: ColorScheme = theme === "light" ? "light" : "dark";
  return {
    preference,
    scheme,
    theme,
    zone,
    colors: nativeColors(theme, zone),
    statusBar: scheme === "dark" ? "light" : "dark",
  };
}
