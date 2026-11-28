/**
 * The pure index over the glyph drawings: sizes, stroke, names and lookup.
 * No JSX and no DOM, so the web `Icon` (`icon.tsx`) and the React Native
 * `Icon` (`packages/ui/src/native/icons`) read the same path data and the
 * same names and cannot drift. `icons.test.tsx` and the native parity test
 * guard both.
 */
import { glyphAliases, glyphGroups, type Glyph } from "./glyphs";

/**
 * Icon sizes by role. Nothing else is allowed: 14 in chips and dense rows,
 * 16 inline with text, 20 in buttons, rows and inputs, 24 in navigation. A
 * brand mark is never above 24 inside a control.
 */
export const iconSizes = {
  chip: 14,
  inline: 16,
  control: 20,
  nav: 24,
} as const;
export type IconSize = keyof typeof iconSizes;

/** The brand stroke, shared by every line glyph. */
export const iconStroke = {
  width: 1.75,
  linecap: "square",
  linejoin: "miter",
} as const;

/** Every canonical glyph by name (the groups merged). */
export const glyphTable: Readonly<Record<string, Glyph>> = Object.assign(
  {},
  ...Object.values(glyphGroups),
) as Record<string, Glyph>;

export type GlyphKey = {
  [G in keyof typeof glyphGroups]: keyof (typeof glyphGroups)[G];
}[keyof typeof glyphGroups];
export type GlyphName = keyof typeof glyphAliases | GlyphKey;

/** The canonical drawn names (aliases excluded), in a stable order. */
export const glyphNames = Object.keys(glyphTable).sort() as GlyphKey[];
/** Older names that resolve to a canonical glyph. */
export const glyphAliasNames = Object.keys(glyphAliases).sort() as Array<
  keyof typeof glyphAliases
>;
/** Which family each canonical name belongs to (for the gallery). */
export const glyphFamilies = Object.fromEntries(
  Object.entries(glyphGroups).map(([group, items]) => [
    group,
    Object.keys(items).sort(),
  ]),
) as Record<keyof typeof glyphGroups, string[]>;

/** Whether a name is drawn here (a canonical name or an alias). */
export function isGlyphName(name: string): name is GlyphName {
  return name in glyphTable || name in glyphAliases;
}

/** The drawing for a name or alias; `undefined` when it is not drawn here. */
export function resolveGlyph(name: string): Glyph | undefined {
  const canonical = (glyphAliases as Record<string, string>)[name] ?? name;
  return glyphTable[canonical];
}
