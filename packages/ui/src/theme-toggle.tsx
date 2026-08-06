"use client";

import { useEffect, useState } from "react";
import {
  dunaThemeStorageKey,
  resolveThemePreference,
  type DunaTheme,
  type DunaThemePreference,
} from "./theme";

const preferenceOrder: readonly DunaThemePreference[] = [
  "system",
  "light",
  "dark",
];

const preferenceLabel: Record<DunaThemePreference, string> = {
  system: "Match device",
  light: "Light",
  dark: "Dark",
};

function storedPreference(): DunaThemePreference {
  const value = window.localStorage.getItem(dunaThemeStorageKey);
  return value === "light" || value === "dark" ? value : "system";
}

function applyTheme(preference: DunaThemePreference): DunaTheme {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = resolveThemePreference(preference, systemDark);
  const root = document.documentElement;
  root.dataset.themeSwitching = "true";
  root.dataset.themePreference = preference;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  window.localStorage.setItem(dunaThemeStorageKey, preference);

  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((themeColor) => {
      themeColor.setAttribute(
        "content",
        theme === "dark" ? "#141310" : "#F6F5F1",
      );
    });
  window.dispatchEvent(
    new CustomEvent("duna-theme-change", {
      detail: { preference, theme },
    }),
  );
  window.setTimeout(() => {
    delete root.dataset.themeSwitching;
  }, 240);
  return theme;
}

export function ThemeToggle({
  className,
  label = "Color theme",
}: {
  readonly className?: string;
  readonly label?: string;
}) {
  const [preference, setPreference] = useState<DunaThemePreference>("system");
  const [resolved, setResolved] = useState<DunaTheme>("light");

  useEffect(() => {
    const initial = storedPreference();
    setPreference(initial);
    setResolved(applyTheme(initial));

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemTheme = () => {
      if (storedPreference() === "system") setResolved(applyTheme("system"));
    };
    media.addEventListener("change", onSystemTheme);
    return () => media.removeEventListener("change", onSystemTheme);
  }, []);

  const index = preferenceOrder.indexOf(preference);
  const next = preferenceOrder[(index + 1) % preferenceOrder.length]!;
  return (
    <button
      aria-label={`${label}: ${preferenceLabel[preference]}. Activate for ${preferenceLabel[next]}.`}
      className={["theme-toggle", className].filter(Boolean).join(" ")}
      data-preference={preference}
      onClick={() => {
        setPreference(next);
        setResolved(applyTheme(next));
      }}
      title={`${preferenceLabel[preference]} · switch to ${preferenceLabel[next]}`}
      type="button"
    >
      {preference === "system" ? (
        <svg aria-hidden viewBox="0 0 24 24">
          <rect
            fill="none"
            height="14"
            rx="2.5"
            stroke="currentColor"
            strokeWidth="1.75"
            width="20"
            x="2"
            y="3"
          />
          <path
            d="M8 21h8M12 17v4"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.75"
          />
        </svg>
      ) : resolved === "light" ? (
        <svg aria-hidden viewBox="0 0 24 24">
          <circle
            cx="12"
            cy="12"
            fill="none"
            r="4"
            stroke="currentColor"
            strokeWidth="1.75"
          />
          <path
            d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.75"
          />
        </svg>
      ) : (
        <svg aria-hidden viewBox="0 0 24 24">
          <path
            d="M20.4 15.6A8.5 8.5 0 0 1 8.4 3.6 8.5 8.5 0 1 0 20.4 15.6Z"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.75"
          />
        </svg>
      )}
      <span className="theme-toggle__label">{preferenceLabel[preference]}</span>
    </button>
  );
}
