/**
 * The pin a map draws, pure: `pinModel` from `@duna/tideline-core` decides
 * the zoom tier; this file sizes it and picks its glyph.
 */
import { pinModel, type PinKind, type PinTier } from "@duna/tideline-core";
import type { GlyphName } from "../icons/Icon";

export interface PinVisualInput {
  readonly kind: PinKind;
  readonly zoom: number;
  readonly selected?: boolean;
  readonly yours?: boolean;
  readonly live?: boolean;
  /** Pins this one stands for; more than 1 is a cluster at low zoom. */
  readonly clusterCount?: number;
}

export interface PinVisual {
  readonly tier: PinTier;
  /** The disc's diameter in points (0 when hidden). */
  readonly diameter: number;
  readonly showIcon: boolean;
  readonly showLabel: boolean;
  /** The club's mark replaces the generic icon. */
  readonly showClubMark: boolean;
  /** "Yours": action fill, on-action glyph. */
  readonly inverted: boolean;
  /** A live ring (Solar, the only live colour on a map) wins over the selected ring. */
  readonly ring: "live" | "selected" | null;
  readonly clusterCount: number | null;
}

/** Disc sizes by tier, in points. */
export const PIN_DIAMETERS: Readonly<Record<PinTier, number>> = {
  hidden: 0,
  dot: 12,
  icon: 28,
  "icon-label": 28,
  "club-mark": 32,
  court: 24,
  cluster: 32,
};

/** The category glyph for each kind of pin. */
export const PIN_KIND_GLYPH: Readonly<Record<PinKind, GlyphName>> = {
  club: "venue",
  public: "court",
  court: "court",
  tournament: "tournament",
  league: "league",
  match: "ball",
  pickup: "users",
  lesson: "lesson",
};

export function pinVisual(input: PinVisualInput): PinVisual {
  const model = pinModel({
    zoom: input.zoom,
    kind: input.kind,
    clusterCount: input.clusterCount,
    yours: input.yours,
    live: input.live,
  });
  return {
    tier: model.tier,
    diameter: PIN_DIAMETERS[model.tier],
    showIcon: model.showIcon,
    showLabel: model.showLabel,
    showClubMark: model.showClubMark,
    inverted: model.inverted,
    ring: model.solar ? "live" : input.selected ? "selected" : null,
    clusterCount: model.clusterCount,
  };
}
