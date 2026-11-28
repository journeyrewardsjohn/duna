/**
 * `@duna/ui/icons`: the Duna icon family behind one API.
 *
 *   <Icon name="schedule" size="control" />          decorative
 *   <Icon name="wind" size="inline" label="Windy" />  an image named "Windy"
 *
 * Web only. This module must not be imported by `mobile.ts`; native screens use
 * the native icon set. The Tideline library re-exports this `Icon`.
 */
export {
  Icon,
  glyphAliasNames,
  glyphFamilies,
  glyphNames,
  iconSizes,
  iconStroke,
  registerIcons,
  type ExternalIcons,
  type GlyphName,
  type IconName,
  type IconProps,
  type IconSize,
  type LegacyIconSize,
} from "./icon";
export type { Glyph, LineGlyph, MarkGlyph, MarkShape } from "./glyphs";
