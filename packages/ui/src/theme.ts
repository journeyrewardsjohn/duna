import type { DunaTheme, DunaThemePreference } from "./tokens";

export type { DunaTheme, DunaThemePreference } from "./tokens";

export const dunaThemeStorageKey = "duna-theme";

export function resolveThemePreference(
  preference: DunaThemePreference,
  systemDark: boolean,
): DunaTheme {
  if (preference === "system") return systemDark ? "dark" : "light";
  return preference;
}

export const themeBootScript = `
(() => {
  try {
    const stored = localStorage.getItem("${dunaThemeStorageKey}");
    const preference = stored === "light" || stored === "dark" ? stored : "system";
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = preference === "system" ? (systemDark ? "dark" : "light") : preference;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {
    const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
    const theme = systemDark ? "dark" : "light";
    document.documentElement.dataset.themePreference = "system";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }
})();
`;
