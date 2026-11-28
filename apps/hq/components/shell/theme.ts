import {
  dunaThemeStorageKey,
  resolveThemePreference,
  type DunaTheme,
  type DunaThemePreference,
} from "@duna/ui/theme";

export { dunaThemeStorageKey };
export type { DunaTheme, DunaThemePreference };

/** The three choices a person has, in the order the account menu shows them. */
export const themePreferences = [
  { value: "system", label: "Match device" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const satisfies readonly {
  value: DunaThemePreference;
  label: string;
}[];

/** Reads a stored value; anything unknown is "system". */
export function parseThemePreference(
  value: string | null | undefined,
): DunaThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

/**
 * The design system's scope does not inherit a theme (a `.td` element states
 * its own), so the new HQ document sets `data-theme` on `<html>` AND on the
 * `<body class="td">`. This runs as the first child of `<body>`, before
 * anything paints, so there is no flash of the wrong theme. Same storage key
 * and the same three options as the legacy layout's script.
 */
export const hqThemeBootScript = `(()=>{var d=document,r=d.documentElement,b=d.body,p="system",t="light";try{var s=localStorage.getItem(${JSON.stringify(dunaThemeStorageKey)});p=s==="light"||s==="dark"?s:"system"}catch(e){}try{t=p==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):p}catch(e){t=p==="dark"?"dark":"light"}r.dataset.themePreference=p;r.dataset.theme=t;r.style.colorScheme=t;if(b){b.dataset.theme=t}})();`;

/** Applies a preference to the document and remembers it. Browser only. */
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
    // Private windows may refuse storage; the choice still applies now.
  }
  window.dispatchEvent(
    new CustomEvent("duna-theme-change", { detail: { preference, theme } }),
  );
  return theme;
}

/** The stored preference. Browser only. */
export function storedThemePreference(): DunaThemePreference {
  try {
    return parseThemePreference(
      window.localStorage.getItem(dunaThemeStorageKey),
    );
  } catch {
    return "system";
  }
}
