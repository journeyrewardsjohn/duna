export type DunaTheme = "light" | "dark";

export const dunaThemeStorageKey = "duna-theme";

export const themeBootScript = `
(() => {
  try {
    const stored = localStorage.getItem("${dunaThemeStorageKey}");
    const theme = stored === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {
    document.documentElement.dataset.theme = "light";
    document.documentElement.style.colorScheme = "light";
  }
})();
`;
