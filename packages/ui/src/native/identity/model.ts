/**
 * The native wallet's pure model (WALLET-2, docs/design/wallet.md): card
 * geometry from the pane, the carousel's neighbour transform, the face's
 * parts for a card's state, the accessible names and announcements, the
 * pass's text, and the native art layers drawn from the shared palettes.
 * Everything here reads `@duna/tideline-core` (the same helpers the web
 * card uses) and never re-derives a rule; no React, so it is unit-tested.
 */
import {
  CARD_RATIO,
  CARD_STATUS_WORDS,
  carouselScale,
  cardAccessibleName,
  cardArtPalette,
  cardMetaLine,
  cardPassBack,
  cardStateChip,
  CLUB_COLOUR_ART,
  dunaArtPiece,
  estimateCardContrast,
  type CardArtSource,
  type CardContrast,
  type CardFact,
  type CardKind,
  type CardPalette,
  type CardPassBack,
  type CardStateChip,
  type MembershipPassData,
  type MembershipStatus,
  NIGHT_COURT,
} from "@duna/tideline-core";

/** One card in the native wallet: the card plus a stable id. */
export interface NativeWalletCard {
  readonly id: string;
  readonly club: {
    readonly name: string;
    /** The club's colour (ClubMark ground); generated when absent. */
    readonly color?: string | null;
    readonly logo?: string | null;
    readonly logoLight?: string | null;
    readonly logoDark?: string | null;
    readonly tile?: string | null;
  };
  /** The member's name as the club knows it (a junior's own name). */
  readonly member: string;
  /** The guardian holding a junior's card. */
  readonly heldBy?: string;
  /** "Annual member": said on the pass and to screen readers. */
  readonly plan?: string;
  /** The plan chip top right ("Annual", "Junior", "Pack"). */
  readonly chip?: string;
  readonly kind?: CardKind;
  readonly status: MembershipStatus;
  readonly statusText?: string;
  /** Formatted pause end or end date ("Jan 4"). */
  readonly until?: string;
  readonly number?: string | null;
  readonly since?: string;
  /** Formatted, for the pass ("Nov 30, 2027"). */
  readonly validThrough?: string;
  readonly fact?: CardFact | null;
  readonly art: CardArtSource;
  /** The measured scrim stored with a design; estimated when absent. */
  readonly contrast?: CardContrast;
  readonly face?: {
    readonly chip?: boolean;
    readonly number?: boolean;
    readonly since?: boolean;
  };
  /** The back. `null` or absent: the honest "no pass yet" back. */
  readonly pass?: MembershipPassData | null;
  /** The pass was read from this phone's secure store, not the server. */
  readonly passSaved?: boolean;
}

// ---------------------------------------------------------------- geometry

export type CardSize = "card" | "hero" | "strip";

/** Widths from the spec (§1): phone ≤ 372, regular panes 396, hero 420. */
export const CARD_WIDTHS = { phone: 372, regular: 396, hero: 420 } as const;
/** The carousel leaves 52 pt: neighbours peek about 14 pt each side. */
export const CAROUSEL_MARGIN = 52;
export const CAROUSEL_GAP = 12;
const SMALLEST_CARD = 220;

export interface CardGeometry {
  readonly width: number;
  readonly height: number;
  /** 5.2 % of the width. */
  readonly radius: number;
  /** The keyline sits 7 pt inside the edge. */
  readonly keyline: number;
  /** Safe area: 5 % of the width left and right, 8.5 % of the height top and bottom. */
  readonly padX: number;
  readonly padY: number;
}

/** The card's size for the pane it is in (never the screen). */
export function cardGeometry(paneWidth: number, size: CardSize = "card") {
  const max =
    size === "hero"
      ? CARD_WIDTHS.hero
      : paneWidth >= 560
        ? CARD_WIDTHS.regular
        : CARD_WIDTHS.phone;
  const width = Math.max(
    SMALLEST_CARD,
    Math.min(max, Math.floor(paneWidth - CAROUSEL_MARGIN)),
  );
  return geometryForWidth(width);
}

export function geometryForWidth(width: number): CardGeometry {
  return {
    width,
    height: Math.round(width / CARD_RATIO),
    radius: Math.round(width * 0.052),
    keyline: 7,
    padX: Math.round(width * 0.05),
    padY: Math.round((width / CARD_RATIO) * 0.085),
  };
}

export interface CarouselGeometry {
  readonly card: CardGeometry;
  /** Distance between two card origins: the snap interval. */
  readonly interval: number;
  /** Padding before the first and after the last card, so each centres. */
  readonly inset: number;
  /** How much of each neighbour shows. */
  readonly peek: number;
}

export function carouselGeometry(paneWidth: number): CarouselGeometry {
  const card = cardGeometry(paneWidth);
  const inset = Math.max(0, Math.round((paneWidth - card.width) / 2));
  return {
    card,
    interval: card.width + CAROUSEL_GAP,
    inset,
    peek: Math.max(0, inset - CAROUSEL_GAP),
  };
}

/**
 * A neighbour's transform as the carousel scrolls: 94 % one card away,
 * scaled from its inner edge (so the gap to the centred card holds). For
 * `Animated` `interpolate` on the scroll offset, on the native driver.
 */
export function carouselInterpolation(
  index: number,
  interval: number,
  cardWidth: number,
) {
  const shift = ((1 - carouselScale(1)) * cardWidth) / 2;
  return {
    inputRange: [
      (index - 1) * interval,
      index * interval,
      (index + 1) * interval,
    ],
    scale: [carouselScale(1), carouselScale(0), carouselScale(1)],
    translateX: [-shift, 0, shift],
  };
}

/** The card nearest a scroll offset. */
export function carouselIndexAt(
  offset: number,
  interval: number,
  count: number,
): number {
  if (count <= 0 || interval <= 0) return 0;
  return Math.max(0, Math.min(count - 1, Math.round(offset / interval)));
}

// ---------------------------------------------------------------- the face

export interface CardFaceParts {
  /** Top right: the plan chip, or the solid Salt state chip. */
  readonly corner:
    | { readonly kind: "plan"; readonly text: string }
    | ({ readonly kind: "state" } & CardStateChip)
    | null;
  /** "Held by Sam Rivera, guardian" for a junior. */
  readonly held: string | null;
  /** "No. 0412 · Since Mar 2024" (the plan joins it when a state chip took its place). */
  readonly meta: string;
  /** The one live fact, bottom right; pending and ended cards show none. */
  readonly fact: CardFact | null;
}

/** What the face shows for a card's state, through the shared helpers. */
export function cardFaceParts(card: NativeWalletCard): CardFaceParts {
  const state = cardStateChip({
    status: card.status,
    ...(card.statusText ? { statusText: card.statusText } : {}),
    ...(card.until ? { until: card.until } : {}),
  });
  const corner: CardFaceParts["corner"] = state
    ? { kind: "state", ...state }
    : card.chip && card.face?.chip !== false
      ? { kind: "plan", text: card.chip }
      : null;
  return {
    corner,
    held: card.heldBy ? `Held by ${card.heldBy}, guardian` : null,
    meta: cardMetaLine({
      status: card.status,
      ...(card.number !== undefined ? { number: card.number } : {}),
      ...(card.since ? { since: card.since } : {}),
      ...(card.face ? { face: card.face } : {}),
      ...(card.chip ? { chip: card.chip } : {}),
    }),
    fact:
      card.fact && card.status !== "pending" && card.status !== "expired"
        ? card.fact
        : null,
  };
}

/** "{club}, {plan}, {state}, {fact}", and whose card a junior's is. */
export function cardLabel(card: NativeWalletCard): string {
  return cardAccessibleName({
    club: card.club.name,
    ...(card.plan ? { plan: card.plan } : {}),
    member: card.member,
    ...(card.heldBy ? { heldBy: card.heldBy } : {}),
    status: card.status,
    ...(card.statusText ? { statusText: card.statusText } : {}),
    fact: card.fact ?? null,
  });
}

/**
 * The carousel is one adjustable element; its value is the selected card:
 * "Card 2 of 5, Saltline Beach Club, Annual member, active, 8 credits".
 */
export function carouselValue(
  cards: readonly NativeWalletCard[],
  index: number,
): string {
  const card = cards[index];
  if (!card) return "No cards";
  return `Card ${index + 1} of ${cards.length}, ${cardLabel(card)}`;
}

/** What VoiceOver says when the card turns over (or back). */
export function flipAnnouncement(
  card: NativeWalletCard,
  flipped: boolean,
): string {
  if (!flipped) return `${card.club.name} card`;
  const detail =
    card.status === "pending"
      ? "No pass yet."
      : card.status === "expired"
        ? "Membership ended."
        : `${card.member}, ${CARD_STATUS_WORDS[card.status].toLowerCase()}${
            card.number ? `, number ${card.number}` : ""
          }.`;
  return `Showing ${card.club.name} pass. ${detail}`;
}

// ---------------------------------------------------------------- the pass

export interface PassText {
  readonly back: CardPassBack;
  /** The lines under the member's name, in order; each wraps, none truncates. */
  readonly lines: readonly string[];
  /** The note at the foot ("Duna member credential · Duna ID 7K2Q9D"). */
  readonly note: string | null;
  /** The code image's name. */
  readonly codeLabel: string;
}

/** The pass's words (spec §4): text first, the code from the server's payload. */
export function passText(card: NativeWalletCard): PassText {
  const back = cardPassBack({
    club: card.club.name,
    status: card.status,
    ...(card.kind ? { kind: card.kind } : {}),
    ...(card.pass !== undefined ? { pass: card.pass } : {}),
    ...(card.until ? { until: card.until } : {}),
  });
  if (back.kind !== "code")
    return { back, lines: [], note: null, codeLabel: "" };
  const lines = [
    card.plan,
    card.number ? `No. ${card.number}` : back.reference,
    card.validThrough && card.kind !== "day"
      ? `Valid to ${card.validThrough}`
      : null,
    card.heldBy ? `Guardian ${card.heldBy}` : null,
  ].filter((line): line is string => Boolean(line));
  const note =
    back.rotation === "rotating"
      ? "Code changes every 30 seconds"
      : `${back.label}${card.passSaved ? " · saved on this phone" : ""}`;
  return {
    back,
    lines,
    note,
    codeLabel: `Check-in code for ${card.member}`,
  };
}

// ---------------------------------------------------------------- the art

/** Uploads before measurement: a strong dark scrim errs on the side of reading. */
export const UPLOAD_CONTRAST: CardContrast = {
  text: "salt",
  scrim: "#0A1218",
  top: 0.72,
  bottom: 0.78,
  ratio: 5,
  glow: "#1A2A33",
};

/** The scrim a card uses: the stored measurement, or the palette's estimate. */
export function cardContrast(card: Pick<NativeWalletCard, "art" | "contrast">) {
  if (card.contrast) return card.contrast;
  const palette = cardArtPalette(card.art);
  return palette ? estimateCardContrast(palette) : UPLOAD_CONTRAST;
}

export type ArtRecipe = "field" | "caustics" | "dune" | "lights" | "grass";

/** A gradient stop: offset 0–1, a palette colour, opacity 0–1. */
export interface ArtStop {
  readonly offset: number;
  readonly color: string;
  readonly opacity: number;
}

/** One painted layer, in card fractions (0–1 across, 0–1 down). */
export type ArtLayer =
  | {
      readonly kind: "linear";
      readonly from: readonly [number, number];
      readonly to: readonly [number, number];
      readonly stops: readonly ArtStop[];
    }
  | {
      readonly kind: "radial";
      readonly center: readonly [number, number];
      readonly radius: readonly [number, number];
      readonly stops: readonly ArtStop[];
    }
  | {
      /** A soft shape (ridge, cone, blade, caustic line), filled or stroked. */
      readonly kind: "path";
      readonly d: string;
      readonly fill?: { readonly color: string; readonly opacity: number };
      readonly fade?: {
        readonly from: readonly [number, number];
        readonly to: readonly [number, number];
        readonly stops: readonly ArtStop[];
      };
      readonly stroke?: {
        readonly color: string;
        readonly opacity: number;
        readonly width: number;
      };
    };

export interface ArtPainting {
  readonly recipe: ArtRecipe;
  readonly palette: CardPalette;
  readonly layers: readonly ArtLayer[];
  /** Where the light sits (it drifts on the selected card). */
  readonly light: readonly [number, number];
  /** Seconds for one breath of the light (the piece's loop period). */
  readonly period: number;
}

/** A small seeded random (the same piece always paints the same). */
function seeded(seed: number) {
  let state = Math.floor(seed * 1000) % 2147483647 || 1;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

const round = (value: number) => Math.round(value * 1000) / 1000;
const stop = (offset: number, color: string, opacity = 1): ArtStop => ({
  offset,
  color,
  opacity,
});

/**
 * The native art: the shared recipe drawn as layered native gradients and
 * soft shapes from the shared palette (the web paints the same recipe with a
 * shader; the app ships no GPU drawing library). Every layer keeps calm tone
 * top left and along the bottom, and its light upper right, as the set does.
 * `null` for an upload (its poster is the art).
 */
export function artPainting(art: CardArtSource): ArtPainting | null {
  const palette = cardArtPalette(art);
  if (!palette) return null;
  const piece =
    art.source === "set" ? dunaArtPiece(art.key) : { ...CLUB_COLOUR_ART };
  const recipe = piece.recipe as ArtRecipe;
  const [shadow, body, lit, high] = palette;
  const random = seeded(piece.seed);
  const base: ArtLayer[] = [
    {
      kind: "linear",
      from: [0.1, 1],
      to: [0.9, 0],
      stops: [
        stop(0, shadow),
        stop(0.38, body),
        stop(0.78, lit),
        stop(1, high),
      ],
    },
  ];
  const light: [number, number] = [0.82, 0.24];
  const layers: ArtLayer[] = [];
  switch (recipe) {
    case "field": {
      // A painted light field: soft blooms of the lit tone, folded clouds.
      for (let i = 0; i < 5; i += 1) {
        const x = 0.35 + random() * 0.65;
        const y = random() * 0.7;
        layers.push({
          kind: "radial",
          center: [round(x), round(y)],
          radius: [round(0.25 + random() * 0.3), round(0.3 + random() * 0.35)],
          stops: [
            stop(0, i % 2 ? lit : high, 0.55),
            stop(0.55, i % 2 ? body : lit, 0.22),
            stop(1, body, 0),
          ],
        });
      }
      for (let i = 0; i < 3; i += 1) {
        const y = 0.3 + i * 0.22 + random() * 0.08;
        layers.push({
          kind: "path",
          d: `M0 ${round(y + 0.12)} C0.3 ${round(y - 0.08)} 0.6 ${round(y + 0.18)} 1 ${round(y - 0.1)} L1 ${round(y + 0.06)} C0.62 ${round(y + 0.3)} 0.3 ${round(y + 0.06)} 0 ${round(y + 0.26)} Z`,
          fade: {
            from: [0, 0],
            to: [1, 0],
            stops: [stop(0, body, 0), stop(0.6, lit, 0.2), stop(1, high, 0.32)],
          },
        });
      }
      break;
    }
    case "caustics": {
      // Sunlit shallows: a net of bright wavering lines over deep water.
      layers.push({
        kind: "radial",
        center: [0.75, 0.8],
        radius: [0.7, 0.6],
        stops: [stop(0, lit, 0.5), stop(1, body, 0)],
      });
      // Few, soft lines: a wide faint glow under a thin bright core.
      for (let i = 0; i < 5; i += 1) {
        const y = 0.1 + random() * 0.85;
        const a = 0.05 + random() * 0.1;
        const d = `M-0.05 ${round(y)} Q0.22 ${round(y - a)} 0.45 ${round(y + a * 0.7)} T0.9 ${round(y - a * 0.5)} T1.1 ${round(y + a * 0.4)}`;
        layers.push({
          kind: "path",
          d,
          stroke: { color: high, opacity: 0.08, width: 10 },
        });
        layers.push({
          kind: "path",
          d,
          stroke: {
            color: high,
            opacity: round(0.12 + random() * 0.12),
            width: 1.6,
          },
        });
      }
      for (let i = 0; i < 3; i += 1) {
        layers.push({
          kind: "radial",
          center: [round(0.3 + random() * 0.7), round(random())],
          radius: [round(0.2 + random() * 0.2), round(0.25 + random() * 0.2)],
          stops: [stop(0, high, 0.28), stop(1, lit, 0)],
        });
      }
      break;
    }
    case "dune": {
      // Ridges at golden hour: lit faces and slip-face shadows, upper right lit.
      for (let i = 0; i < 6; i += 1) {
        const t = i / 6;
        const y = -0.1 + t * 1.15;
        const sway = 0.05 + random() * 0.08;
        layers.push({
          kind: "path",
          d: `M-0.05 ${round(y + 0.3)} C0.25 ${round(y + 0.1 - sway)} 0.55 ${round(y + 0.22 + sway)} 1.05 ${round(y - 0.12)} L1.05 ${round(y + 0.02)} C0.6 ${round(y + 0.34 + sway)} 0.3 ${round(y + 0.22)} -0.05 ${round(y + 0.44)} Z`,
          fade: {
            from: [0, 0],
            to: [1, 0],
            stops: [
              stop(0, shadow, 0.5),
              stop(0.55, lit, 0.45),
              stop(1, high, 0.6),
            ],
          },
        });
        layers.push({
          kind: "path",
          d: `M-0.05 ${round(y + 0.3)} C0.25 ${round(y + 0.1 - sway)} 0.55 ${round(y + 0.22 + sway)} 1.05 ${round(y - 0.12)}`,
          stroke: { color: high, opacity: 0.35, width: 1.2 },
        });
      }
      break;
    }
    case "lights": {
      // A night court: two floodlight cones through drifting sea haze.
      for (const [x, spread] of [
        [0.3, 0.32],
        [0.8, 0.36],
      ] as const) {
        layers.push({
          kind: "path",
          d: `M${x - 0.02} -0.05 L${x + 0.02} -0.05 L${round(x + spread)} 1.05 L${round(x - spread)} 1.05 Z`,
          fade: {
            from: [0, 0],
            to: [0, 1],
            stops: [stop(0, high, 0.42), stop(0.5, lit, 0.16), stop(1, lit, 0)],
          },
        });
        layers.push({
          kind: "radial",
          center: [x, -0.02],
          radius: [0.2, 0.28],
          stops: [stop(0, high, 0.95), stop(0.35, lit, 0.5), stop(1, lit, 0)],
        });
      }
      for (let i = 0; i < 3; i += 1) {
        layers.push({
          kind: "radial",
          center: [round(random()), round(0.4 + random() * 0.5)],
          radius: [round(0.4 + random() * 0.3), 0.18],
          stops: [stop(0, lit, 0.18), stop(1, lit, 0)],
        });
      }
      light[0] = 0.8;
      light[1] = 0.02;
      break;
    }
    case "grass": {
      // Marram grass backlit by a low sun: a gold haze, dark blades below.
      layers.push({
        kind: "radial",
        center: [0.7, 0.45],
        radius: [0.7, 0.6],
        stops: [stop(0, high, 0.7), stop(0.5, lit, 0.35), stop(1, lit, 0)],
      });
      for (let i = 0; i < 46; i += 1) {
        const x = random() * 1.05;
        const top = 0.3 + random() * 0.45;
        const lean = (random() - 0.4) * 0.16;
        layers.push({
          kind: "path",
          d: `M${round(x)} 1.02 Q${round(x + lean * 0.4)} ${round((1 + top) / 2)} ${round(x + lean)} ${round(top)}`,
          stroke: {
            color: i % 5 === 0 ? lit : i % 2 ? body : shadow,
            opacity: round(0.45 + random() * 0.4),
            width: 1 + random() * 1.6,
          },
        });
      }
      break;
    }
  }
  return {
    recipe,
    palette,
    light,
    period: piece.period,
    layers: [
      ...base,
      ...layers,
      // The light source upper right, then a soft vignette.
      {
        kind: "radial",
        center: light,
        radius: [0.7, 0.9],
        stops: [stop(0, high, 0.55), stop(0.62, high, 0), stop(1, high, 0)],
      },
      {
        kind: "radial",
        center: [0.6, 0.45],
        radius: [0.85, 0.95],
        stops: [stop(0.6, shadow, 0), stop(1, shadow, 0.3)],
      },
    ],
  };
}

/** The art's glow under the card (its average tone). */
export function artGlow(art: CardArtSource): string {
  const palette = cardArtPalette(art);
  return palette ? estimateCardContrast(palette).glow : UPLOAD_CONTRAST.glow;
}

/** The glyph for a state chip's icon (as the web card draws it). */
export function stateIconName(icon: CardStateChip["icon"]) {
  return icon === "pause" ? "timeout" : icon === "clock" ? "clock" : "alert";
}

/** "#0A1218" at 50 % → "#0A121880" (a scrim or glow tone with alpha). */
export function alphaHex(hex: string, alpha: number): string {
  const base = /^#[0-9a-f]{6}$/i.test(hex) ? hex : NIGHT_COURT;
  const byte = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${base}${byte}`;
}
