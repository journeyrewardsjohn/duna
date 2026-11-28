/**
 * The wallet and the membership card (docs/design/wallet.md): the art
 * registry's data, the colours derived from a club colour, the measured local
 * scrim that keeps type at 5:1 on any art, the face's words, the honest pass
 * back, the presentation (carousel or stack), the stack geometry and the
 * mapping from today's per-club wallet summary. Pure, so the web components
 * and the native wallet draw the same card.
 */
import {
  hslToRgb,
  hueFor,
  NIGHT_COURT,
  parseHexColor,
  relativeLuminance,
  SALT,
  toHexColor,
  type MembershipStatus,
  type Rgb,
} from "./club-mark";

/** ISO/IEC 7810 ID-1: 85.6 × 54 mm. Height = width ÷ ratio. */
export const CARD_RATIO = 1.586;
/** A stacked card shows this much of its height. */
export const STACK_STRIP_RATIO = 0.36;
/** The carousel holds up to six cards; seven or more start as a stack. */
export const WALLET_CAROUSEL_MAX = 6;

export type CardKind =
  "member" | "junior" | "family" | "staff" | "day" | "pack";

// ---------------------------------------------------------------- art set

/** How a piece is painted (the web shader's five recipes). */
export type CardArtRecipe = "field" | "caustics" | "dune" | "lights" | "grass";

export type CardPalette = readonly [string, string, string, string];

export interface CardArtPiece {
  readonly key: string;
  readonly name: string;
  /** What it shows, for the art picker and the docs. */
  readonly subject: string;
  readonly recipe: CardArtRecipe;
  /** Shadow → body → lit → highlight. */
  readonly palette: CardPalette;
  /** Seeds the shader's noise so two pieces on one recipe differ. */
  readonly seed: number;
  /** Seconds for one seamless loop (3–6). */
  readonly period: number;
}

/**
 * The Duna art set as shipped (WALLET-1): eight pieces across the colour
 * wheel. Noon Net and Ember Net (drawn grid lines) were dropped; Under Lights
 * and Marram Gold were reworked without their floating light circles. Each
 * piece can later carry a painted still and loop (`registerCardArtAssets` in
 * the web library); the shader stays as the fallback and for derived art.
 */
export const DUNA_ART_SET = [
  {
    key: "golden-dune",
    name: "Golden Dune",
    subject: "A dune ridge at golden hour, wind ripples on the lit face",
    recipe: "dune",
    palette: ["#2A1006", "#7E3A10", "#E0892E", "#FFD98C"],
    seed: 3.1,
    period: 6,
  },
  {
    key: "coral-dusk",
    name: "Coral Dusk",
    subject: "Dusk sky reflected in wet sand, clouds lit from within",
    recipe: "field",
    palette: ["#2B0F2E", "#9C2F5E", "#F2735A", "#FFD6B8"],
    seed: 11.4,
    period: 6,
  },
  {
    key: "under-lights",
    name: "Under Lights",
    subject: "A night court, floodlight bloom through sea haze",
    recipe: "lights",
    palette: ["#050A22", "#1B2470", "#5565E0", "#FFE9C2"],
    seed: 5.7,
    period: 6,
  },
  {
    key: "ocean-teal",
    name: "Ocean Teal",
    subject: "Deep teal shallows from above, a sunlit caustic net",
    recipe: "caustics",
    palette: ["#03222B", "#0B5563", "#1FA3A6", "#C8FFF2"],
    seed: 2.2,
    period: 5,
  },
  {
    key: "sea-glass",
    name: "Sea Glass",
    subject: "Pale sea-glass shallows over white sand",
    recipe: "caustics",
    palette: ["#14544F", "#3E9C8A", "#9FDCC8", "#EFFFF8"],
    seed: 9.3,
    period: 5,
  },
  {
    key: "storm-swell",
    name: "Storm Swell",
    subject: "Storm-blue swell with silver light on the faces",
    recipe: "field",
    palette: ["#040B14", "#132C46", "#365E82", "#A9C2D6"],
    seed: 21.9,
    period: 5,
  },
  {
    key: "first-light",
    name: "First Light",
    subject: "A cloudscape at first light, lit from within",
    recipe: "field",
    palette: ["#2E2C5C", "#8C5C94", "#E98F79", "#FFDCC0"],
    seed: 31.5,
    period: 6,
  },
  {
    key: "marram-gold",
    name: "Marram Gold",
    subject: "Dune grass backlit by low sun in a gold haze",
    recipe: "grass",
    palette: ["#0B1A0B", "#2E4A1C", "#C9992F", "#FFF1BA"],
    seed: 17.2,
    period: 6,
  },
] as const satisfies readonly CardArtPiece[];

export type DunaArtKey = (typeof DUNA_ART_SET)[number]["key"];

/** Pieces from the WALLET-0 prototype that did not ship, and why. */
export const RETIRED_CARD_ART: readonly {
  readonly key: string;
  readonly name: string;
  readonly reason: string;
}[] = [
  {
    key: "noon-net",
    name: "Noon Net",
    reason: "Drawn grid lines read as computer graphics next to painted art.",
  },
  {
    key: "ember-net",
    name: "Ember Net",
    reason: "Drawn grid lines read as computer graphics next to painted art.",
  },
];

/** The derived piece: a painted light field in the club's own colour. */
export const CLUB_COLOUR_ART = {
  key: "club-colour",
  name: "Club colour",
  subject: "A painted light field in the club's colour",
  recipe: "field",
  seed: 8.8,
  period: 6,
} as const;

/** Where a card's art comes from (spec decision 5). */
export type CardArtSource =
  | { readonly source: "set"; readonly key: DunaArtKey; readonly tint?: string }
  | { readonly source: "colour"; readonly color: string }
  | {
      readonly source: "upload";
      /** A still (JPEG / PNG / AVIF), cropped to the card ratio. */
      readonly poster: string;
      /** A 3–6 s seamless loop, muted. */
      readonly loop?: { readonly mp4: string; readonly av1?: string };
    };

export function isDunaArtKey(key: string): key is DunaArtKey {
  return DUNA_ART_SET.some((piece) => piece.key === key);
}

export function dunaArtPiece(key: DunaArtKey): CardArtPiece {
  return DUNA_ART_SET.find((piece) => piece.key === key)!;
}

interface Hsl {
  readonly h: number;
  readonly s: number;
  readonly l: number;
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

const hex = (hue: number, saturation: number, lightness: number) =>
  toHexColor(hslToRgb(hue, saturation, lightness));

/**
 * Four tones from a club colour: deep shadow (10 % lightness), body (30 %),
 * a lit tone 18° round the wheel (42 %), a highlight 29° round (70 %), as in
 * the approved prototype (the spec's "5° / 8°" was a typo for 0.05 / 0.08 of
 * a turn). The field reads
 * as painted light in that colour, never a flat tint. Grey colours get a
 * minimum saturation so the field still glows.
 */
export function derivedArtPalette(color: string): CardPalette {
  const rgb = parseHexColor(color) ?? (parseHexColor(NIGHT_COURT) as Rgb);
  const { h, s, l } = rgbToHsl(rgb);
  const sat = Math.max(0.35, s);
  return [
    hex(h, sat, Math.min(l, 0.1)),
    hex(h, sat, 0.3),
    hex(h + 18, Math.min(1, sat + 0.1), 0.42),
    hex(h + 29, 0.7, 0.7),
  ];
}

/** Rotates a palette's hue toward `tint` (hue only, never desaturation). */
export function tintPalette(palette: CardPalette, tint: string): CardPalette {
  const target = parseHexColor(tint);
  if (!target) return palette;
  const body = rgbToHsl(parseHexColor(palette[1]) as Rgb);
  const shift = (((rgbToHsl(target).h - body.h + 540) % 360) - 180) * 0.6;
  return palette.map((tone) => {
    const { h, s, l } = rgbToHsl(parseHexColor(tone) as Rgb);
    return hex(h + shift, s, l);
  }) as unknown as CardPalette;
}

/** The four tones a card's art is painted from; `null` for an upload. */
export function cardArtPalette(art: CardArtSource): CardPalette | null {
  if (art.source === "upload") return null;
  if (art.source === "colour") return derivedArtPalette(art.color);
  const palette = dunaArtPiece(art.key).palette;
  return art.tint ? tintPalette(palette, art.tint) : palette;
}

/**
 * The art for a club that has no card design yet (Needs API: card designs).
 * A club that chose a colour gets art derived from it (spec decision 5);
 * otherwise a stable piece from the Duna set, picked by the club's id, so a
 * wallet of five reads as five different clubs.
 */
export function defaultCardArt(club: {
  readonly id: string;
  readonly color?: string | null;
}): CardArtSource {
  if (club.color && parseHexColor(club.color))
    return { source: "colour", color: club.color };
  const piece = DUNA_ART_SET[hueFor(club.id) % DUNA_ART_SET.length]!;
  return { source: "set", key: piece.key };
}

/**
 * Assigns art to a whole wallet: each club keeps its own design or colour;
 * clubs with neither get set pieces, and neighbours never share one while
 * unused pieces remain.
 */
export function assignWalletArt<
  Card extends { readonly id: string; readonly color?: string | null },
>(cards: readonly Card[]): CardArtSource[] {
  const used = new Set<string>();
  return cards.map((card) => {
    const art = defaultCardArt(card);
    if (art.source !== "set") return art;
    let index = DUNA_ART_SET.findIndex((piece) => piece.key === art.key);
    for (let tries = 0; tries < DUNA_ART_SET.length; tries += 1) {
      const key = DUNA_ART_SET[index]!.key;
      if (!used.has(key)) break;
      index = (index + 1) % DUNA_ART_SET.length;
    }
    const key = DUNA_ART_SET[index]!.key;
    used.add(key);
    if (used.size === DUNA_ART_SET.length) used.clear();
    return { source: "set", key };
  });
}

// ---------------------------------------------------------------- contrast

/** What a card's type needs over its art, measured once per art (spec §1). */
export interface CardContrast {
  /** Salt type (default) or Night Court type on genuinely light art. */
  readonly text: "salt" | "night";
  /** The scrim colour: the art's own average mixed 80 % toward the type's opposite. */
  readonly scrim: string;
  /** Scrim strength at the top-left and bottom-left corners (0–0.93). */
  readonly top: number;
  readonly bottom: number;
  /** The worst footprint's contrast with the scrim, for HQ's readout. */
  readonly ratio: number;
  /** The art's average tone: the card's glow on the ground. */
  readonly glow: string;
}

/** Text footprints as fractions of the card: [x0, y0, x1, y1]. */
export const CARD_TEXT_FOOTPRINTS = {
  top: [0, 0.04, 0.68, 0.24],
  bottom: [0, 0.66, 0.64, 0.95],
} as const;

/** The ratio every face reaches. */
export const CARD_TEXT_CONTRAST = 5;
const SCRIM_CAP = 0.93;
const SCRIM_MIN_TOP = 0.12;
const SCRIM_MIN_BOTTOM = 0.18;

/** RGBA pixels (a canvas `ImageData`, or any width × height × 4 array). */
export interface CardPixels {
  readonly width: number;
  readonly height: number;
  readonly data: ArrayLike<number>;
}

interface Footprint {
  readonly avg: Rgb;
  /** 90th percentile luminance (what Salt type must beat). */
  readonly hi: number;
  /** 10th percentile luminance (what Night Court type must beat). */
  readonly lo: number;
}

const DEEP: Rgb = { r: 4, g: 10, b: 14 };
const PALE: Rgb = { r: 252, g: 250, b: 244 };
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => ({
  r: a.r + (b.r - a.r) * t,
  g: a.g + (b.g - a.g) * t,
  b: a.b + (b.b - a.b) * t,
});
const L_SALT = relativeLuminance(parseHexColor(SALT) as Rgb);
const L_NIGHT = relativeLuminance(parseHexColor(NIGHT_COURT) as Rgb);

function footprint(
  pixels: CardPixels,
  [x0, y0, x1, y1]: readonly [number, number, number, number],
): Footprint {
  const { width, height, data } = pixels;
  const left = Math.floor(width * x0);
  const right = Math.max(left + 1, Math.floor(width * x1));
  const top = Math.floor(height * y0);
  const bottom = Math.max(top + 1, Math.floor(height * y1));
  const step = Math.max(
    1,
    Math.round(Math.sqrt(((right - left) * (bottom - top)) / 1600)),
  );
  const lums: number[] = [];
  let r = 0;
  let g = 0;
  let b = 0;
  for (let y = top; y < bottom; y += step) {
    for (let x = left; x < right; x += step) {
      const i = (y * width + x) * 4;
      const px = { r: data[i]!, g: data[i + 1]!, b: data[i + 2]! };
      lums.push(relativeLuminance(px));
      r += px.r;
      g += px.g;
      b += px.b;
    }
  }
  lums.sort((a, z) => a - z);
  const n = Math.max(1, lums.length);
  return {
    avg: { r: r / n, g: g / n, b: b / n },
    hi: lums[Math.floor(lums.length * 0.9)] ?? 0,
    lo: lums[Math.floor(lums.length * 0.1)] ?? 0,
  };
}

function contrastFrom(top: Footprint, bottom: Footprint): CardContrast {
  const base = mixRgb(top.avg, bottom.avg, 0.5);
  const dark = mixRgb(base, DEEP, 0.8);
  const light = mixRgb(base, PALE, 0.8);
  const needSalt = (L_SALT + 0.05) / CARD_TEXT_CONTRAST - 0.05;
  const needNight = CARD_TEXT_CONTRAST * (L_NIGHT + 0.05) - 0.05;
  const lDark = relativeLuminance(dark);
  const lLight = relativeLuminance(light);
  const forSalt = (f: Footprint) =>
    f.hi > needSalt ? (f.hi - needSalt) / (f.hi - lDark) : 0;
  const forNight = (f: Footprint) =>
    f.lo < needNight ? (needNight - f.lo) / (lLight - f.lo) : 0;
  const saltCost = Math.max(forSalt(top), forSalt(bottom));
  const nightCost = Math.max(forNight(top), forNight(bottom));
  const avgL = (relativeLuminance(top.avg) + relativeLuminance(bottom.avg)) / 2;
  const salt = !(avgL > 0.38 && nightCost + 0.2 < saltCost);
  const scrimRgb = salt ? dark : light;
  const clamp = (value: number, min: number) =>
    Math.min(SCRIM_CAP, Math.max(value, min));
  const st = clamp(salt ? forSalt(top) : forNight(top), SCRIM_MIN_TOP);
  const sb = clamp(salt ? forSalt(bottom) : forNight(bottom), SCRIM_MIN_BOTTOM);
  const ls = relativeLuminance(scrimRgb);
  const under = (f: Footprint, a: number) =>
    (salt ? f.hi : f.lo) * (1 - a) + ls * a;
  const lt = under(top, st);
  const lb = under(bottom, sb);
  const ratio = salt
    ? (L_SALT + 0.05) / (Math.max(lt, lb) + 0.05)
    : (Math.min(lt, lb) + 0.05) / (L_NIGHT + 0.05);
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    text: salt ? "salt" : "night",
    scrim: toHexColor(scrimRgb),
    top: round(st),
    bottom: round(sb),
    ratio: round(ratio),
    glow: toHexColor(mixRgb(base, { r: 0, g: 0, b: 0 }, 0.1)),
  };
}

/**
 * The local scrim for a card's art, measured on its poster: the 90th (or
 * 10th) percentile luminance of the two text footprints, the smallest scrim
 * that brings it to 5:1, capped at 93 % and never under 12 % top / 18 %
 * bottom so loops that brighten later still read.
 */
export function measureCardContrast(pixels: CardPixels): CardContrast {
  return contrastFrom(
    footprint(pixels, CARD_TEXT_FOOTPRINTS.top),
    footprint(pixels, CARD_TEXT_FOOTPRINTS.bottom),
  );
}

/** The stronger of two measurements (the poster and frames of a loop). */
export function strongestContrast(
  a: CardContrast,
  b: CardContrast,
): CardContrast {
  if (a.text !== b.text) return a.ratio <= b.ratio ? a : b;
  return {
    ...a,
    top: Math.max(a.top, b.top),
    bottom: Math.max(a.bottom, b.bottom),
    ratio: Math.min(a.ratio, b.ratio),
  };
}

/**
 * A server-safe estimate from the palette alone (no pixels): assumes the lit
 * tone sits under the type, so the scrim errs strong. Replaced by the
 * measurement once the poster has painted.
 */
export function estimateCardContrast(palette: CardPalette): CardContrast {
  const [shadow, body, lit] = palette.map(
    (tone) => parseHexColor(tone) as Rgb,
  ) as [Rgb, Rgb, Rgb, Rgb];
  const avg = mixRgb(mixRgb(shadow, body, 0.5), lit, 0.35);
  const hi = relativeLuminance(mixRgb(body, lit, 0.75));
  const lo = relativeLuminance(mixRgb(shadow, body, 0.5));
  const f: Footprint = { avg, hi, lo };
  return contrastFrom(f, f);
}

// ---------------------------------------------------------------- the face

export type CardFactKind = "credits" | "valid" | "next" | "today" | "staff";

export interface CardFact {
  readonly kind: CardFactKind;
  /** Already formatted: "8 credits", "To Nov 2027", "Thu 7:00 PM". */
  readonly text: string;
}

export interface CardStateChip {
  readonly tone: "paused" | "pending" | "expired";
  readonly icon: "pause" | "clock" | "alert";
  readonly text: string;
}

/** Words for each state on the card and the pass. */
export const CARD_STATUS_WORDS: Readonly<Record<MembershipStatus, string>> = {
  active: "Active",
  paused: "Paused",
  pending: "Pending approval",
  expired: "Ended",
};

/**
 * The state chip that replaces the plan chip (spec decision 4), or `null`
 * for an active card. `until` is the pause end or the end date, formatted.
 */
export function cardStateChip(input: {
  readonly status: MembershipStatus;
  readonly statusText?: string;
  readonly until?: string;
}): CardStateChip | null {
  switch (input.status) {
    case "active":
      return null;
    case "paused":
      return {
        tone: "paused",
        icon: "pause",
        text:
          input.statusText ??
          (input.until ? `Paused to ${input.until}` : "Paused"),
      };
    case "pending":
      return {
        tone: "pending",
        icon: "clock",
        text: input.statusText ?? "Pending approval",
      };
    case "expired":
      return {
        tone: "expired",
        icon: "alert",
        text:
          input.statusText ?? (input.until ? `Ended ${input.until}` : "Ended"),
      };
  }
}

/** The member line under the name: "No. 0412 · Since Mar 2024". */
export function cardMetaLine(input: {
  readonly status: MembershipStatus;
  readonly number?: string | null;
  readonly since?: string;
  readonly face?: { readonly number?: boolean; readonly since?: boolean };
  /** Shown here when a state chip took the plan chip's place. */
  readonly chip?: string;
}): string {
  const parts: string[] = [];
  if (input.status !== "active" && input.chip) parts.push(input.chip);
  if (input.face?.number !== false) {
    if (input.status === "pending") parts.push("No. —");
    else if (input.number) parts.push(`No. ${input.number}`);
  }
  if (input.face?.since !== false && input.since)
    parts.push(`Since ${input.since}`);
  return parts.join(" · ");
}

/**
 * The card's name for screen readers: "{club}, {plan}, {state}, {fact}.
 * Card 2 of 5". A junior's card says whose it is.
 */
export function cardAccessibleName(input: {
  readonly club: string;
  readonly plan?: string;
  readonly member: string;
  readonly heldBy?: string;
  readonly status: MembershipStatus;
  readonly statusText?: string;
  readonly fact?: CardFact | null;
  readonly index?: number;
  readonly total?: number;
}): string {
  const state = (
    input.statusText ?? CARD_STATUS_WORDS[input.status]
  ).toLowerCase();
  const parts = [input.club, input.plan, state];
  if (input.fact && input.status !== "pending") parts.push(input.fact.text);
  if (input.heldBy)
    parts.push(`${input.member}'s card, held by ${input.heldBy}`);
  const name = parts.filter(Boolean).join(", ");
  return input.index !== undefined && input.total !== undefined
    ? `${name}. Card ${input.index + 1} of ${input.total}`
    : name;
}

// ---------------------------------------------------------------- the pass

/**
 * What the server supplies for the back. Today it is one static Duna-wide
 * member credential (`rotation: "static"`); the per-club code that changes
 * every 30 seconds arrives with `player.cardPass` (Needs API) as
 * `rotation: "rotating"` with `refreshesAt`. Never invented on the client.
 */
export interface MembershipPassData {
  /** The exact payload to encode, as the server sent it. */
  readonly code: string;
  readonly rotation: "static" | "rotating";
  /** When a rotating code changes (ISO time). */
  readonly refreshesAt?: string;
  /** What this code is, said on the back ("Duna member credential"). */
  readonly label?: string;
  /** A short reference the desk can type ("No. 7K2Q9D"). */
  readonly reference?: string;
  /** The device holds a seed and derives the code offline. */
  readonly offline?: boolean;
}

export type CardPassBack =
  | {
      readonly kind: "code";
      readonly code: string;
      readonly rotation: "static" | "rotating";
      readonly label: string;
      readonly reference?: string;
      readonly refreshesAt?: string;
      /** "Active member", "Paused until Jan 4, 2027". */
      readonly statusLine: string;
      readonly statusIcon: "check" | "pause";
    }
  | {
      readonly kind: "message";
      readonly reason: "pending" | "expired" | "no-pass";
      readonly title: string;
      readonly text: string;
    };

/**
 * The honest back of a card (spec §4). Paused cards keep their code (booked
 * sessions still check in); pending and ended cards, and cards with no pass
 * from the server, say so and show no code.
 */
export function cardPassBack(input: {
  readonly club: string;
  readonly status: MembershipStatus;
  readonly kind?: CardKind;
  readonly pass?: MembershipPassData | null;
  /** Formatted pause end or end date. */
  readonly until?: string;
}): CardPassBack {
  if (input.status === "pending")
    return {
      kind: "message",
      reason: "pending",
      title: "No pass yet",
      text: `${input.club} approves new members first. Your pass appears here when they do.`,
    };
  if (input.status === "expired")
    return {
      kind: "message",
      reason: "expired",
      title: input.until
        ? `This membership ended ${input.until}`
        : "This membership has ended",
      text: "Renew to get your pass back. Your history and credits stay with the club.",
    };
  if (!input.pass?.code)
    return {
      kind: "message",
      reason: "no-pass",
      title: "No pass yet",
      text: `Passes are not set up for ${input.club} yet. The front desk can find you by name.`,
    };
  const paused = input.status === "paused";
  return {
    kind: "code",
    code: input.pass.code,
    rotation: input.pass.rotation,
    label:
      input.pass.label ??
      (input.pass.rotation === "static"
        ? "Duna member credential"
        : "Check-in code"),
    ...(input.pass.reference ? { reference: input.pass.reference } : {}),
    ...(input.pass.refreshesAt ? { refreshesAt: input.pass.refreshesAt } : {}),
    statusLine: paused
      ? input.until
        ? `Paused until ${input.until}`
        : "Paused"
      : input.kind === "staff"
        ? "Staff"
        : input.kind === "day"
          ? "Valid today"
          : "Active member",
    statusIcon: paused ? "pause" : "check",
  };
}

/** Seconds until a rotating code changes, for "New code in 0:24". */
export function passSecondsLeft(refreshesAt: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(refreshesAt) - now) / 1000));
}

// ---------------------------------------------------------------- the wallet

export type WalletPresentation = "carousel" | "stack";

/**
 * Carousel up to six cards, stack from seven (spec decision 7); the person
 * can switch when there are three or more. One or two cards are always a
 * carousel.
 */
export function walletPresentation(
  count: number,
  preference: "auto" | WalletPresentation = "auto",
): { readonly presentation: WalletPresentation; readonly canSwitch: boolean } {
  if (count <= 2) return { presentation: "carousel", canSwitch: false };
  if (preference !== "auto")
    return { presentation: preference, canSwitch: true };
  return {
    presentation: count > WALLET_CAROUSEL_MAX ? "stack" : "carousel",
    canSwitch: true,
  };
}

const STATUS_ORDER: Readonly<Record<MembershipStatus, number>> = {
  active: 0,
  paused: 0,
  pending: 1,
  expired: 2,
};

/** Ended cards last, pending after active ones; otherwise the given order. */
export function orderWalletCards<
  Card extends { readonly status: MembershipStatus },
>(cards: readonly Card[]): Card[] {
  return cards
    .map((card, index) => ({ card, index }))
    .sort(
      (a, b) =>
        STATUS_ORDER[a.card.status] - STATUS_ORDER[b.card.status] ||
        a.index - b.index,
    )
    .map(({ card }) => card);
}

/** The next selected index for a key, or `null` when the key does nothing. */
export function walletKeyStep(
  key: string,
  index: number,
  count: number,
  orientation: "horizontal" | "vertical",
): number | null {
  const back = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
  const forward = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
  if (key === back) return Math.max(0, index - 1);
  if (key === forward) return Math.min(count - 1, index + 1);
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** A neighbour's scale in the carousel: 0.94 one card away (from its inner edge). */
export function carouselScale(distanceInCards: number): number {
  return 1 - 0.06 * Math.min(1, Math.abs(distanceInCards));
}

export interface StackSlot {
  readonly y: number;
  readonly scale: number;
  readonly z: number;
}

/**
 * Where each card sits in the stack. At rest every card shows a strip (36 %
 * of its height) and the last shows in full. With one drawn out it sits on
 * top and the others collapse into a pile beneath it, 11 px edges, at most
 * five showing.
 */
export function stackLayout(input: {
  readonly count: number;
  readonly cardHeight: number;
  /** The drawn card's index, or null at rest. */
  readonly drawn: number | null;
}): { readonly slots: StackSlot[]; readonly height: number } {
  const { count, cardHeight, drawn } = input;
  const strip = Math.round(cardHeight * STACK_STRIP_RATIO);
  if (drawn === null || drawn < 0 || drawn >= count) {
    return {
      slots: Array.from({ length: count }, (_, i) => ({
        y: i * strip,
        scale: 1,
        z: i,
      })),
      height: count === 0 ? 0 : (count - 1) * strip + cardHeight,
    };
  }
  let pile = 0;
  const slots = Array.from({ length: count }, (_, i): StackSlot => {
    if (i === drawn) return { y: 0, scale: 1, z: 100 };
    const k = Math.min(pile, 4);
    pile += 1;
    return {
      y: cardHeight + 26 + k * 11,
      scale: 0.92 + k * 0.02,
      z: 50 + pile,
    };
  });
  return {
    slots,
    height:
      count > 1
        ? cardHeight +
          26 +
          Math.min(count - 2, 4) * 11 +
          Math.round(cardHeight * 0.3)
        : cardHeight,
  };
}

// ------------------------------------------- today's data → card (Needs API)

/** The per-club wallet summary the API returns today (`player.organizationWallets`). */
export interface ClubWalletSummary {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly credits: number;
  readonly status: "active" | "frozen" | "closed";
  readonly nextExpirationAt?: string;
  readonly nextExpiringCredits?: number;
  readonly membershipName?: string;
  readonly membershipStatus?: string;
  readonly membershipInterval?: "month" | "year";
  readonly membershipCurrentPeriodEndsAt?: string;
  readonly membershipCancelAtPeriodEnd?: boolean;
  readonly membershipCancellationEffectiveAt?: string;
  readonly membershipTrialEndsAt?: string;
}

/** The card state for a club summary (the brand never fades; this is a word). */
export function clubMembershipStatus(
  summary: Pick<ClubWalletSummary, "status" | "membershipStatus">,
): MembershipStatus {
  const status = summary.membershipStatus?.toLowerCase() ?? "";
  if (summary.status === "frozen" || status.includes("pause")) return "paused";
  if (summary.status === "closed" || /cancel|expire|ended/.test(status))
    return "expired";
  if (/pending|incomplete|past/.test(status)) return "pending";
  return "active";
}

/** The plan chip: "Annual", "Monthly", "Trial", "Member" or "Pack" (credits only). */
export function clubCardChip(
  summary: Pick<
    ClubWalletSummary,
    "membershipName" | "membershipInterval" | "membershipStatus"
  >,
): string {
  if (!summary.membershipName) return "Pack";
  if (/trial/i.test(summary.membershipStatus ?? "")) return "Trial";
  if (summary.membershipInterval === "year") return "Annual";
  if (summary.membershipInterval === "month") return "Monthly";
  return "Member";
}

const SHORT_DATE: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
};
const LONG_DATE: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

export function formatCardDate(
  iso: string,
  options: { readonly year?: boolean; readonly timeZone?: string } = {},
): string {
  return new Intl.DateTimeFormat("en-US", {
    ...(options.year ? LONG_DATE : SHORT_DATE),
    timeZone: options.timeZone ?? "UTC",
  }).format(new Date(iso));
}

/** A card from today's per-club summary. Art, number and pass come separately. */
export function clubSummaryCard(
  summary: ClubWalletSummary,
  options: { readonly timeZone?: string } = {},
): {
  readonly id: string;
  readonly plan: string;
  readonly chip: string;
  readonly kind: CardKind;
  readonly status: MembershipStatus;
  readonly statusText?: string;
  readonly validThrough?: string;
  readonly until?: string;
  readonly fact: CardFact | null;
} {
  const status = clubMembershipStatus(summary);
  const chip = clubCardChip(summary);
  const end =
    summary.membershipCancellationEffectiveAt ??
    summary.membershipCurrentPeriodEndsAt;
  const tz = options.timeZone ? { timeZone: options.timeZone } : {};
  const credits =
    summary.credits > 0
      ? {
          kind: "credits" as const,
          text: `${summary.credits} credit${summary.credits === 1 ? "" : "s"}`,
        }
      : null;
  const valid =
    end && status !== "pending"
      ? {
          kind: "valid" as const,
          text: `To ${new Intl.DateTimeFormat("en-US", {
            month: "short",
            year: "numeric",
            timeZone: options.timeZone ?? "UTC",
          }).format(new Date(end))}`,
        }
      : null;
  return {
    id: summary.organizationId,
    plan: summary.membershipName ?? "Credit pack",
    chip,
    kind: summary.membershipName ? "member" : "pack",
    status,
    ...(end
      ? { validThrough: formatCardDate(end, { year: true, ...tz }) }
      : {}),
    ...(end && status !== "active" ? { until: formatCardDate(end, tz) } : {}),
    // Pending and ended cards say their state in the chip; no live fact.
    fact:
      status === "pending" || status === "expired" ? null : (credits ?? valid),
  };
}
