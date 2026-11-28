/**
 * Club identity helpers: the two-character monogram and a contrast-safe
 * foreground for the colour a club chose (contract R13).
 */

const CONNECTORS: ReadonlySet<string> = new Set([
  "the",
  "of",
  "and",
  "at",
  "&",
]);

/** Letters and numbers only: emoji, punctuation and symbols never count. */
const WORD_CHARACTER = /^[\p{L}\p{N}]$/u;
const COMBINING = /^\p{M}$/u;

/** Characters (code points with their combining marks) of a string. */
function characters(text: string): string[] {
  const out: string[] = [];
  for (const codePoint of text) {
    const last = out.length - 1;
    if (COMBINING.test(codePoint) && last >= 0) out[last] += codePoint;
    else out.push(codePoint);
  }
  return out;
}

function significant(word: string): string[] {
  return characters(word).filter((c) => WORD_CHARACTER.test(c[0] ?? ""));
}

export interface Monogram {
  /** Two characters, upper-cased; `null` when the name has no letter or number. */
  readonly text: string | null;
}

/**
 * The monogram for a club name.
 *
 * - Two or more words: the first character of the first two words, skipping
 *   connectors ("The", "of", "and", "at", "&"): "Santa Monica Beach Club" is
 *   "SM"; "The Beach Club" is "BC".
 * - One word: its first two characters: "Dunes" is "DU".
 * - Non-Latin scripts work the same way and are not upper-cased by force:
 *   a name with no spaces gives its first two characters.
 * - Emoji, punctuation and symbols are skipped. A name with nothing usable
 *   (empty, whitespace, only emoji) returns `null`: draw the Duna micro mark.
 */
export function monogramFor(
  name: string | null | undefined,
  locale = "en",
): Monogram {
  const words = (name ?? "")
    .split(/[\s\-–—_/]+/u)
    .filter((word) => significant(word).length > 0);
  const meaningful = words.filter((w) => !CONNECTORS.has(w.toLowerCase()));
  const pool = meaningful.length > 0 ? meaningful : words;

  let picked: string[];
  if (pool.length >= 2) {
    picked = pool.slice(0, 2).map((word) => significant(word)[0] ?? "");
  } else {
    picked = significant(pool[0] ?? "").slice(0, 2);
  }
  const text = picked.join("");
  return { text: text === "" ? null : text.toLocaleUpperCase(locale) };
}

export const NIGHT_COURT = "#0E1A22";
export const SALT = "#F4F2EC";

/** Linear-light channel for the WCAG relative luminance formula. */
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** `#rgb` or `#rrggbb` (case-insensitive) to channels, or `null`. */
export function parseHexColor(value: string): Rgb | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const hex =
    (match[1] as string).length === 3
      ? (match[1] as string).replace(/./g, (c) => c + c)
      : (match[1] as string);
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

export function relativeLuminance(rgb: Rgb): number {
  return (
    0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
  );
}

/** WCAG contrast ratio, 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export interface ForegroundChoice {
  /** Night Court or Salt, whichever reads better on the background. */
  readonly foreground: typeof NIGHT_COURT | typeof SALT;
  readonly ratio: number;
  /** 4.5:1, the text threshold. */
  readonly passesText: boolean;
  /** 3:1, the large-text and graphics threshold. */
  readonly passesGraphics: boolean;
  /** False when the colour could not be read; Night Court is then the background. */
  readonly validBackground: boolean;
}

/** Picks Night Court or Salt, whichever has the higher contrast on a club's colour. */
export function foregroundFor(
  background: string | null | undefined,
): ForegroundChoice {
  const parsed = background ? parseHexColor(background) : null;
  const rgb = parsed ?? (parseHexColor(NIGHT_COURT) as Rgb);
  const onDark = contrastRatio(rgb, parseHexColor(NIGHT_COURT) as Rgb);
  const onLight = contrastRatio(rgb, parseHexColor(SALT) as Rgb);
  const foreground = onLight > onDark ? SALT : NIGHT_COURT;
  const ratio = Math.max(onDark, onLight);
  return {
    foreground,
    ratio: Math.round(ratio * 100) / 100,
    passesText: ratio >= 4.5,
    passesGraphics: ratio >= 3,
    validBackground: parsed !== null,
  };
}
