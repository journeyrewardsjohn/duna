/**
 * The library's `Icon` is the one `@duna/ui/icons` implementation. There is no
 * second icon system: this module only keeps the path every component imports.
 * Add or change a glyph in `packages/ui/src/icons/glyphs.ts`.
 *
 * `size` takes the role names (`chip` 14, `inline` 16, `control` 20, `nav` 24);
 * the older `sm` / `md` / `lg` still resolve to inline / control / nav.
 */
export {
  Icon,
  iconSizes,
  type IconName,
  type IconProps,
  type IconSize,
} from "../../icons";
