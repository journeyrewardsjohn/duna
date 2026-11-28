/**
 * The brand faces, by family and weight. Files live in
 * `packages/ui/assets/fonts/` (official Geist 1.9.2 and Jost* 3.5 releases,
 * SIL OFL 1.1, see `docs/licenses/`), are embedded in both apps by the
 * `expo-font` config plugin (`apps/{player,pro}/app.json`), and are named by
 * their PostScript names, so the same `fontFamily` string works on iOS
 * (PostScript name) and Android (file name). Never synthesize a weight: ask
 * for one of these.
 */
import type { NativeFontFamily } from "../tokens";

export const TIDELINE_FONT_FACES = {
  /** Geist: every word except the one title. */
  geist: {
    400: "Geist-Regular",
    500: "Geist-Medium",
    600: "Geist-SemiBold",
    700: "Geist-Bold",
  },
  /** Geist Mono: codes, small uppercase labels, score and data numerals. */
  mono: {
    400: "GeistMono-Regular",
    500: "GeistMono-Medium",
    600: "GeistMono-SemiBold",
  },
  /** Jost Medium 500: the one title per screen. */
  brand: { 500: "Jost-Medium" },
} as const;

export type FontStack = keyof typeof TIDELINE_FONT_FACES;
export type FontWeight = 400 | 500 | 600 | 700;

/** The files to embed, relative to `packages/ui/assets/fonts/`. */
export const TIDELINE_FONT_FILES: readonly string[] = Object.values(
  TIDELINE_FONT_FACES,
).flatMap((faces) => Object.values(faces).map((face) => `${face}.ttf`));

/** A token family (`ui`, `display`, `numeric`, `mono`, `brand`) to its stack. */
export function fontStackFor(family: NativeFontFamily | FontStack): FontStack {
  if (family === "mono" || family === "brand") return family;
  return "geist";
}

/**
 * The face for a family and weight. An exact face when one exists; otherwise
 * the nearest shipped weight (300 reads as Regular, 800 and 900 as Bold),
 * never a synthesized one.
 */
export function fontFace(
  family: NativeFontFamily | FontStack,
  weight: number | string | undefined = 400,
): string {
  const faces: Record<number, string> =
    TIDELINE_FONT_FACES[fontStackFor(family)];
  const wanted =
    weight === "bold"
      ? 700
      : weight === "normal" || weight === undefined
        ? 400
        : Number(weight);
  const available = Object.keys(faces)
    .map(Number)
    .sort((a, b) => a - b);
  const target = Number.isFinite(wanted) ? wanted : 400;
  const nearest = available.reduce((best, candidate) =>
    Math.abs(candidate - target) < Math.abs(best - target) ||
    (Math.abs(candidate - target) === Math.abs(best - target) &&
      candidate > best)
      ? candidate
      : best,
  );
  return faces[nearest]!;
}
