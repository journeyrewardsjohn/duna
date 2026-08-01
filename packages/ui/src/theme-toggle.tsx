"use client";

import { useEffect, useState } from "react";
import { dunaThemeStorageKey, type DunaTheme } from "./theme";

function applyTheme(theme: DunaTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  window.localStorage.setItem(dunaThemeStorageKey, theme);
  const themeColor = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  themeColor?.setAttribute("content", theme === "dark" ? "#070b0d" : "#f8f7f3");
  window.dispatchEvent(
    new CustomEvent("duna-theme-change", { detail: { theme } }),
  );
}

export function ThemeToggle({
  className,
  label = "Toggle color theme",
}: {
  readonly className?: string;
  readonly label?: string;
}) {
  const [theme, setTheme] = useState<DunaTheme>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem(dunaThemeStorageKey);
    const initial: DunaTheme = stored === "dark" ? "dark" : "light";
    setTheme(initial);
    applyTheme(initial);
  }, []);

  const next = theme === "light" ? "dark" : "light";
  return (
    <button
      aria-label={`${label}. Current theme: ${theme}`}
      className={["theme-toggle", className].filter(Boolean).join(" ")}
      onClick={() => {
        setTheme(next);
        applyTheme(next);
      }}
      title={`Use ${next} mode`}
      type="button"
    >
      {theme === "light" ? (
        <svg aria-hidden viewBox="0 0 24 24">
          <path
            d="M20.4 15.6A8.5 8.5 0 0 1 8.4 3.6 8.5 8.5 0 1 0 20.4 15.6Z"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      ) : (
        <svg aria-hidden viewBox="0 0 24 24">
          <circle
            cx="12"
            cy="12"
            fill="none"
            r="4"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.8"
          />
        </svg>
      )}
    </button>
  );
}
