import { Geist, Geist_Mono, Jost } from "next/font/google";

/**
 * Duna type, loaded once per app through `next/font/google` (Tideline 4.1.1,
 * rule R2; see `docs/typography.md`). Each family sets a CSS variable named
 * exactly like the Tideline font-family token, so the tokens resolve to the
 * self-hosted, size-adjusted faces:
 *
 * - `--td-font-brand`  Jost Medium 500: marketing headlines and ONE title per
 *   screen, never below 22px and never on a numeral.
 * - `--td-font-ui`     Geist: every other word, and numerals (600, tabular).
 * - `--td-font-mono`   Geist Mono: codes, small uppercase labels, NetScore.
 *
 * `--td-font-display` and `--td-font-numeric` alias `--td-font-ui` in
 * `@duna/ui/styles.css`. The same file lives in `apps/web` and `apps/hq`
 * because `next/font` must be called inside the app that ships the font.
 */
export const jost = Jost({
  display: "swap",
  fallback: ["Geist", "system-ui", "sans-serif"],
  subsets: ["latin"],
  style: "normal",
  variable: "--td-font-brand",
  weight: "500",
});

export const geist = Geist({
  display: "swap",
  fallback: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
  subsets: ["latin"],
  variable: "--td-font-ui",
});

export const geistMono = Geist_Mono({
  display: "swap",
  fallback: ["ui-monospace", "SF Mono", "Menlo", "monospace"],
  // Numerals in data and scores only: not needed for first paint.
  preload: false,
  subsets: ["latin"],
  variable: "--td-font-mono",
});

/** Add to `<html>`: defines the three variables for the whole document. */
export const dunaFontClassName = [
  jost.variable,
  geist.variable,
  geistMono.variable,
].join(" ");
