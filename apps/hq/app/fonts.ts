import { Geist, Geist_Mono, Jost } from "next/font/google";

/**
 * Duna type, loaded once per app through `next/font/google` (Tideline 4.1.1,
 * rule R2; see `docs/typography.md`). `next/font` serves each face under a
 * generated family name and sets it on a `--duna-font-*` variable; the
 * Tideline font-family tokens (`--td-font-*`, generated in
 * `@duna/ui/tideline/tokens`) read those variables, at the root and in every
 * nested `.td` scope, so they always resolve to these self-hosted faces:
 *
 * - `--duna-font-brand` → `--td-font-brand`  Jost Medium 500: marketing
 *   headlines and ONE title per screen, never below 22px, never on a numeral.
 * - `--duna-font-ui`    → `--td-font-ui` (and display, numeric)  Geist: every
 *   other word, and numerals (600, tabular).
 * - `--duna-font-mono`  → `--td-font-mono`  Geist Mono: codes, small
 *   uppercase labels, NetScore.
 *
 * Name a face in CSS through the `--td-font-*` tokens only. The same file
 * lives in `apps/web` and `apps/hq` because `next/font` must be called inside
 * the app that ships the font.
 */
export const jost = Jost({
  display: "swap",
  fallback: ["Geist", "system-ui", "sans-serif"],
  subsets: ["latin"],
  style: "normal",
  variable: "--duna-font-brand",
  weight: "500",
});

export const geist = Geist({
  display: "swap",
  fallback: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
  subsets: ["latin"],
  variable: "--duna-font-ui",
});

export const geistMono = Geist_Mono({
  display: "swap",
  fallback: ["ui-monospace", "SF Mono", "Menlo", "monospace"],
  // Numerals in data and scores only: not needed for first paint.
  preload: false,
  subsets: ["latin"],
  variable: "--duna-font-mono",
});

/** Add to `<html>`: defines the three variables for the whole document. */
export const dunaFontClassName = [
  jost.variable,
  geist.variable,
  geistMono.variable,
].join(" ");
