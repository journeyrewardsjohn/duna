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

/** `#rrggbb` from channels (clamped, rounded). */
export function toHexColor(rgb: Rgb): string {
  const part = (value: number): string =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, "0");
  return `#${part(rgb.r)}${part(rgb.g)}${part(rgb.b)}`.toUpperCase();
}

/** HSL (degrees, 0-1, 0-1) to channels. */
export function hslToRgb(
  hue: number,
  saturation: number,
  lightness: number,
): Rgb {
  const h = (((hue % 360) + 360) % 360) / 360;
  const s = Math.min(1, Math.max(0, saturation));
  const l = Math.min(1, Math.max(0, lightness));
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channelOf = (t0: number): number => {
    let t = t0;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return {
    r: channelOf(h + 1 / 3) * 255,
    g: channelOf(h) * 255,
    b: channelOf(h - 1 / 3) * 255,
  };
}

/** A stable hue (0-359) for a name: FNV-1a over its UTF-16 code units. */
export function hueFor(name: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 360;
}

/**
 * A monogram ground for a club that has not chosen a colour yet, generated
 * from its name: a deep, quiet tone of a stable hue that always passes 4.5:1
 * with Salt. The club's own colour always wins over this; it is never used to
 * recolour a brand.
 */
export function generatedClubColor(nameOrHue: string | number): string {
  const hue = typeof nameOrHue === "number" ? nameOrHue : hueFor(nameOrHue);
  let lightness = 0.32;
  // Darken until Salt reads at 4.5:1 (a handful of steps at most).
  while (lightness > 0.1) {
    const hex = toHexColor(hslToRgb(hue, 0.42, lightness));
    if (foregroundFor(hex).passesText) return hex;
    lightness -= 0.02;
  }
  return toHexColor(hslToRgb(hue, 0.42, 0.1));
}

export type ClubMarkSource = "logo" | "tile" | "monogram";

export interface ClubMarkInput {
  readonly name: string | null | undefined;
  /** The colour the club chose for its mark's ground. */
  readonly color?: string | null;
  /** A logo mark (SVG or transparent PNG) drawn on the colour. */
  readonly logo?: string | null;
  /** A logo variant drawn for dark grounds (a light logo). */
  readonly logoLight?: string | null;
  /** A logo variant drawn for light grounds (a dark logo). */
  readonly logoDark?: string | null;
  /** An uploaded square tile, shown edge to edge. */
  readonly tile?: string | null;
  /** Force one form; otherwise logo, then tile, then monogram. */
  readonly source?: ClubMarkSource;
  /** Size in px. Below 28 a logo or tile becomes the monogram unless it works small. */
  readonly size: number;
  /** The club marked its logo or tile as legible at small sizes. */
  readonly worksSmall?: boolean;
  readonly locale?: string;
}

export interface ClubMarkModel {
  readonly form: ClubMarkSource;
  /** The image to draw (logo or tile); `null` for the monogram. */
  readonly src: string | null;
  /** The ground: the club's colour, or a generated one when it has none. */
  readonly background: string;
  /** True when the ground was generated (the club has not chosen a colour). */
  readonly generatedBackground: boolean;
  /** Night Court or Salt, contrast-checked on `background`. */
  readonly foreground: ForegroundChoice["foreground"];
  readonly contrast: ForegroundChoice;
  /** Two characters; `null` when the name has nothing usable (draw the Duna micro mark). */
  readonly monogram: string | null;
  /** The monogram has a digit: Jost never sets numerals, so the renderer uses Geist. */
  readonly monogramHasNumeral: boolean;
  /** Corner radius in px: 26% of the size. */
  readonly radius: number;
}

/** The smallest size a logo or tile shows at unless the club says it works small. */
export const CLUB_MARK_SMALL_LIMIT = 28;

/**
 * What a club mark draws (contract R13): the club's logo on its colour, its
 * uploaded tile, or its two-character monogram on its colour, with a
 * legible, contrast-checked foreground. Never a white border; never a
 * desaturated or faded state (state is said in a chip beside it).
 */
export function clubMarkModel(input: ClubMarkInput): ClubMarkModel {
  const chosen = input.color ? parseHexColor(input.color) : null;
  const background = chosen
    ? toHexColor(chosen)
    : generatedClubColor(input.name ?? "");
  const contrast = foregroundFor(background);
  const onDarkGround = contrast.foreground === SALT;
  const logo =
    (onDarkGround ? input.logoLight : input.logoDark) ?? input.logo ?? null;
  const small = input.size < CLUB_MARK_SMALL_LIMIT && !input.worksSmall;

  let form: ClubMarkSource;
  if (input.source === "monogram" || small) form = "monogram";
  else if (input.source === "tile") form = input.tile ? "tile" : "monogram";
  else if (input.source === "logo") form = logo ? "logo" : "monogram";
  else if (logo) form = "logo";
  else if (input.tile) form = "tile";
  else form = "monogram";

  const monogram = monogramFor(input.name, input.locale).text;
  return {
    form,
    src: form === "logo" ? logo : form === "tile" ? (input.tile ?? null) : null,
    background,
    generatedBackground: chosen === null,
    foreground: contrast.foreground,
    contrast,
    monogram,
    monogramHasNumeral: monogram !== null && /\p{N}/u.test(monogram),
    radius: Math.round(input.size * 0.26 * 10) / 10,
  };
}

export type MembershipStatus = "active" | "paused" | "expired" | "pending";

export interface MembershipPassInput {
  readonly status: MembershipStatus;
  /** The pass code from the server; never invented on the client. */
  readonly code?: string | null;
  /** When it ended or ends, already formatted ("Nov 30, 2026"). */
  readonly validThrough?: string | null;
}

export type MembershipPassModel =
  | { readonly kind: "code"; readonly code: string }
  | {
      readonly kind: "message";
      readonly reason: "pending" | "paused" | "expired" | "no-pass";
      readonly text: string;
    };

/**
 * What the card's code area can honestly show. A code shows only for an
 * active membership that has one; otherwise a sentence says why not.
 */
export function membershipPassModel(
  input: MembershipPassInput,
): MembershipPassModel {
  switch (input.status) {
    case "pending":
      return {
        kind: "message",
        reason: "pending",
        text: "Your pass appears when the club approves you.",
      };
    case "paused":
      return {
        kind: "message",
        reason: "paused",
        text: "Your membership is paused, so there is no pass to scan. The club can resume it.",
      };
    case "expired":
      return {
        kind: "message",
        reason: "expired",
        text: input.validThrough
          ? `This membership ended ${input.validThrough}. Renew it with the club to get a pass.`
          : "This membership has ended. Renew it with the club to get a pass.",
      };
    case "active":
      return input.code
        ? { kind: "code", code: input.code }
        : {
            kind: "message",
            reason: "no-pass",
            text: "No pass to scan yet. The desk can find you by name.",
          };
  }
}

/** Words for each membership state, for its chip. */
export const MEMBERSHIP_STATUS_TEXT: Readonly<
  Record<MembershipStatus, string>
> = {
  active: "Active",
  paused: "Paused",
  expired: "Expired",
  pending: "Pending",
};
