import { dunaAppColors } from "../../mobile";

/**
 * The only visual values the layout primitives use. They are structural
 * (separators, scrims, sheet grounds) and neutral; the native design-system
 * layer passes its own theme so it can restyle without changing these APIs.
 */
export interface LayoutTheme {
  /** Behind panes and around the fold band. */
  readonly ground: string;
  /** Hairline between panes. */
  readonly separator: string;
  /** Dims content behind a modal sheet. */
  readonly scrim: string;
  /** Sheet and side-panel ground. */
  readonly sheet: string;
  /** Text and icons in structural controls (Back, Done, sheet grabber). */
  readonly control: string;
}

export const neutralLayoutTheme: LayoutTheme = Object.freeze({
  ground: "transparent",
  separator: dunaAppColors.hairline,
  scrim: "rgba(0,0,0,0.32)",
  sheet: dunaAppColors.card,
  control: dunaAppColors.ink,
});

export function layoutTheme(overrides?: Partial<LayoutTheme>): LayoutTheme {
  return overrides
    ? { ...neutralLayoutTheme, ...overrides }
    : neutralLayoutTheme;
}
