import type {
  ComponentProps,
  ComponentType,
  ReactElement,
  SVGProps,
} from "react";
import {
  glyphAliases,
  glyphGroups,
  type Glyph,
  type MarkShape,
} from "./glyphs";

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

/** Sizes the Tideline `Icon` used before the role names; they still resolve. */
const legacySizes = { sm: "inline", md: "control", lg: "nav" } as const;
export type LegacyIconSize = keyof typeof legacySizes;

/** The brand stroke, shared by every line glyph. */
export const iconStroke = {
  width: 1.75,
  linecap: "square",
  linejoin: "miter",
} as const;

const glyphs: Record<string, Glyph> = Object.assign(
  {},
  ...Object.values(glyphGroups),
) as Record<string, Glyph>;

export type GlyphName = keyof typeof glyphAliases | GlyphKey;
type GlyphKey = {
  [G in keyof typeof glyphGroups]: keyof (typeof glyphGroups)[G];
}[keyof typeof glyphGroups];

/**
 * Names other icon sets add through `registerIcons` (for example the existing
 * lucide icons, once the app that owns that dependency registers them). Merge
 * into this interface to type them.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ExternalIcons {}
export type IconName = GlyphName | Extract<keyof ExternalIcons, string>;

/** The canonical drawn names (aliases excluded), in a stable order. */
export const glyphNames = Object.keys(glyphs).sort() as GlyphKey[];
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

const external = new Map<string, ComponentType<SVGProps<SVGSVGElement>>>();

/**
 * Add icons from another set under kebab-case names. Custom glyphs always win
 * over a registered name; the registered component receives `className`,
 * `width`, `height` and the accessibility attributes. The global `.lucide`
 * stroke rule restyles lucide components, so nothing else is needed.
 */
export function registerIcons(
  set: Record<string, ComponentType<SVGProps<SVGSVGElement>>>,
): void {
  for (const [name, component] of Object.entries(set)) {
    if (!(name in glyphs) && !(name in glyphAliases))
      external.set(name, component);
  }
}

export interface IconProps extends Omit<
  ComponentProps<"svg">,
  "children" | "name" | "role"
> {
  name: IconName;
  /** By role: chip 14, inline 16, control 20 (default), nav 24. */
  size?: IconSize | LegacyIconSize;
  /**
   * Decorative by default: the icon is hidden from assistive technology and the
   * control around it carries the name. Pass a `label` only when the icon
   * stands alone; it then becomes an image with that name.
   */
  label?: string;
}

const sizeClass: Record<IconSize, string | undefined> = {
  chip: "td-icon--chip",
  inline: "td-icon--sm",
  control: undefined,
  nav: "td-icon--lg",
};

function resolveSize(size: IconProps["size"]): IconSize {
  if (!size) return "control";
  return size in legacySizes
    ? legacySizes[size as LegacyIconSize]
    : (size as IconSize);
}

function resolveGlyph(name: string): Glyph | undefined {
  const canonical = (glyphAliases as Record<string, string>)[name] ?? name;
  return glyphs[canonical];
}

function Shape({ shape }: { shape: MarkShape }): ReactElement {
  if (shape.fill === "accent") {
    // Hardwood is the golden-hour signal; outside a token scope it falls back
    // to the ink so the mark never loses its shape.
    return (
      <path
        d={shape.d}
        style={{ fill: "var(--td-hardwood-400, currentColor)" }}
      />
    );
  }
  if (shape.fill === "outline") {
    return (
      <path
        d={shape.d}
        fill="none"
        stroke="currentColor"
        strokeLinecap={iconStroke.linecap}
        strokeLinejoin={iconStroke.linejoin}
        strokeWidth={iconStroke.width}
      />
    );
  }
  return <path d={shape.d} />;
}

/**
 * A Duna icon: 24 grid, 1.75 stroke, square ends, mitred joins, `currentColor`.
 * Fill and stroke are also set inline so a page reset such as
 * `svg { fill: currentColor; stroke: none }` cannot blank the glyph (the cause
 * of the empty map-style button).
 */
export function Icon({
  name,
  size,
  label,
  className,
  style,
  ...props
}: IconProps): ReactElement | null {
  const role = resolveSize(size);
  const px = iconSizes[role];
  const classes = ["td-icon", "duna-icon", sizeClass[role], className]
    .filter(Boolean)
    .join(" ");
  const access = label
    ? ({ role: "img", "aria-label": label } as const)
    : ({ "aria-hidden": true } as const);

  const glyph = resolveGlyph(name);
  if (!glyph) {
    const External = external.get(name);
    if (!External) return null;
    return (
      <External
        className={classes}
        focusable="false"
        height={px}
        width={px}
        {...access}
        {...props}
      />
    );
  }

  const common = {
    className: classes,
    "data-icon": name,
    focusable: "false",
    height: px,
    viewBox: "0 0 24 24",
    width: px,
    ...access,
    ...props,
  } as const;

  if (glyph.kind === "mark") {
    return (
      <svg
        {...common}
        fill="currentColor"
        stroke="none"
        style={{ fill: "currentColor", stroke: "none", ...style }}
      >
        {glyph.shapes.map((shape) => (
          <Shape key={shape.d} shape={shape} />
        ))}
      </svg>
    );
  }

  return (
    <svg
      {...common}
      fill="none"
      stroke="currentColor"
      strokeLinecap={iconStroke.linecap}
      strokeLinejoin={iconStroke.linejoin}
      strokeWidth={iconStroke.width}
      style={{ fill: "none", stroke: "currentColor", ...style }}
    >
      {glyph.paths.map((d) => (
        <path d={d} key={d} />
      ))}
    </svg>
  );
}
