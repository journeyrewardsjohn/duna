import {
  dunaThemeStorageKey,
  resolveThemePreference,
  type DunaTheme,
  type DunaThemePreference,
} from "@duna/ui/theme";

export type { DunaThemePreference };

/**
 * The three appearance choices, in the order the person menu shows them. The
 * same key and options as the public site's boot script (`siteBootScript`
 * in the shared `(next)` root layout) and the rest of Duna.
 */
export const themePreferences = [
  { value: "system", label: "Match device" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const satisfies readonly {
  value: DunaThemePreference;
  label: string;
}[];

export function parseThemePreference(
  value: string | null | undefined,
): DunaThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

/**
 * Applies a choice to the document (`<html>` and the `<body class="td">`
 * scope, which does not inherit a theme) and remembers it. Browser only.
 */
export function applyThemePreference(
  preference: DunaThemePreference,
): DunaTheme {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = resolveThemePreference(preference, systemDark);
  const root = document.documentElement;
  root.dataset.themePreference = preference;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document.body.dataset.theme = theme;
  try {
    window.localStorage.setItem(dunaThemeStorageKey, preference);
  } catch {
    // A private window may refuse storage; the choice still applies now.
  }
  window.dispatchEvent(
    new CustomEvent("duna-theme-change", { detail: { preference, theme } }),
  );
  return theme;
}

export function storedThemePreference(): DunaThemePreference {
  try {
    return parseThemePreference(
      window.localStorage.getItem(dunaThemeStorageKey),
    );
  } catch {
    return "system";
  }
}
