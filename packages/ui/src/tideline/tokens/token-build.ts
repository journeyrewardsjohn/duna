/**
 * Pure builders that turn the Tideline token source (`tokens.json`) into the
 * generated `tokens.css` and `tokens.ts`. `scripts/build-tideline-tokens.ts`
 * writes the files; `tokens.test.ts` asserts they are current. Nothing here
 * reads the file system, so the same code runs in the script and the test.
 */

type ThemedValue = Record<string, string>;

interface TokenEntry {
  name: string;
  value: string | ThemedValue;
}

interface TokenGroup {
  tokens: TokenEntry[];
}

interface TypeStyle {
  name: string;
  family?: string;
  fontSize: string;
  lineHeight: string;
  fontWeight: number;
  letterSpacing?: string;
}

/** The brand title role (Jost Medium 500): never below `min`, never on a numeral. */
interface BrandType {
  family: string;
  weight: number;
  tracking: string;
  min: string;
  note?: string;
}

/** Colour roles a zone repaints, per theme (`light` applies when no theme is set). */
type ZoneOverrides = Record<string, Record<string, string>>;

export interface TidelineTokenSource {
  name: string;
  version: number | string;
  color: TokenGroup & { themes: Array<{ id: string; name: string }> };
  type: {
    families: Record<string, string>;
    groups: Array<{ name: string; family: string; styles: TypeStyle[] }>;
    brand?: BrandType;
  };
  /** Zone overrides, selected with `data-zone` on the `.td` scope. */
  zones?: Record<string, ZoneOverrides>;
  /** Token values that replace motion under `prefers-reduced-motion: reduce`. */
  reducedMotion?: Record<string, string>;
  [group: string]: unknown;
}

/**
 * Adds the code-side additions to the design source. A token, type style or
 * reduced-motion value the source already names is left alone: the published
 * file always wins.
 */
export function mergeTidelineAdditions(
  source: TidelineTokenSource,
  additions: Partial<TidelineTokenSource> | undefined,
): TidelineTokenSource {
  if (!additions) return source;
  const merged = structuredClone(source);
  for (const [groupName, group] of Object.entries(additions)) {
    if (!isTokenGroup(group)) continue;
    const target = merged[groupName];
    if (!isTokenGroup(target)) continue;
    const known = new Set(target.tokens.map((token) => token.name));
    target.tokens.push(
      ...group.tokens.filter((token) => !known.has(token.name)),
    );
  }
  const styles = new Set(
    merged.type.groups.flatMap((group) =>
      group.styles.map((style) => style.name),
    ),
  );
  for (const group of additions.type?.groups ?? []) {
    const fresh = group.styles.filter((style) => !styles.has(style.name));
    if (fresh.length > 0) merged.type.groups.push({ ...group, styles: fresh });
  }
  if (additions.reducedMotion) {
    merged.reducedMotion = {
      ...additions.reducedMotion,
      ...merged.reducedMotion,
    };
  }
  return merged;
}

/**
 * The canonical renames (contract `$duna.canonicalNames.rename`). The design
 * file's primitive ramps reuse brand words for other colours: its `salt-*` is
 * a cool grey and its `night-*` a warm brown, while the brand's Salt is
 * #F4F2EC and Night Court #0E1A22. Each ramp keeps its values under a new
 * name; the brand colours keep the brand names (`brand-salt`,
 * `brand-night-court`, ...). Semantic roles never change name.
 */
export const TIDELINE_RAMP_RENAMES = {
  salt: "haze",
  night: "umber",
  flare: "solar",
  sunburst: "hardwood",
  sun: "dune",
} as const;

/** Published tokens the code no longer generates, with the reason. */
export const TIDELINE_RETIRED_TOKENS: Record<string, string> = {
  "size-icon":
    "the 18px icon size; Tideline 4.1.1 icons are 14 / 16 / 20 / 24 (size-icon-chip / -inline / -control / -nav)",
};

/**
 * Published values the code changes to meet a repository floor, with the
 * reason. Each one is reported to design; the contract value returns once
 * design publishes a passing one.
 */
export const TIDELINE_VALUE_ADJUSTMENTS: ReadonlyArray<{
  token: string;
  theme: string;
  from: string;
  to: string;
  reason: string;
}> = [
  {
    token: "border-control",
    theme: "light",
    from: "#8a9399",
    to: "{haze-400}",
    reason:
      "Checkbox, radio and switch edges must reach 3:1 (WCAG 1.4.11) on every light ground; #8a9399 is 2.79:1 on the Salt ground. haze-400 (#7f8a95) is 3.14:1 on Salt and 3.52:1 on white.",
  },
];

const RAMP = new RegExp(
  `^(${Object.keys(TIDELINE_RAMP_RENAMES).join("|")})-(\\d+)$`,
);

function renameRamp(name: string): string {
  const match = RAMP.exec(name);
  if (!match?.[1] || !match[2]) return name;
  const ramp = match[1] as keyof typeof TIDELINE_RAMP_RENAMES;
  return `${TIDELINE_RAMP_RENAMES[ramp]}-${match[2]}`;
}

function renameAliases(value: string): string {
  return value.replaceAll(
    /\{([a-z0-9-]+)\}/g,
    (_match, name: string) => `{${renameRamp(name)}}`,
  );
}

const kebab = (name: string) =>
  name.replaceAll(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

interface ContractDuna {
  zones?: Record<
    string,
    {
      light?: Record<string, string>;
      dark?: Record<string, string>;
      shell?: Record<string, string>;
    }
  >;
  iconScale?: Record<string, string>;
}

/**
 * Turns the published contract (`docs/design/tideline-4.1.1/tokens.json`)
 * into the code token source (`packages/ui/src/tideline/tokens/tokens.json`):
 *
 * - applies the canonical ramp renames to token names and `{alias}` values;
 * - drops the retired tokens;
 * - promotes the `$duna` decisions that carry values into ordinary tokens:
 *   `iconScale` becomes `size-icon-chip` / `-inline` / `-control` / `-nav`,
 *   `size-brand-mark-max` and an `icon` group (grid, stroke, caps, joins);
 *   each zone's `light` / `dark` colours become `zones.<zone>`; each zone
 *   `shell` measurement becomes `<zone>-<name>` in `size`, and a
 *   `<name>-light` / `<name>-dark` pair becomes a themed colour `<zone>-<name>`.
 *
 * Values never change: a renamed token keeps its published value.
 */
export function canonicalTidelineSource(
  contract: TidelineTokenSource & { $duna?: ContractDuna },
): TidelineTokenSource {
  const source = structuredClone(contract) as TidelineTokenSource & {
    $duna?: ContractDuna;
  };
  const themes = source.color.themes.map((theme) => theme.id);
  for (const [, group] of tokenGroups(source)) {
    group.tokens = group.tokens
      .filter((token) => !(token.name in TIDELINE_RETIRED_TOKENS))
      .map((token) => ({
        ...token,
        name: renameRamp(token.name),
        value:
          typeof token.value === "string"
            ? renameAliases(token.value)
            : Object.fromEntries(
                Object.entries(token.value).map(([theme, value]) => [
                  theme,
                  renameAliases(value),
                ]),
              ),
      }));
  }

  for (const adjustment of TIDELINE_VALUE_ADJUSTMENTS) {
    const token = source.color.tokens.find(
      (entry) => entry.name === adjustment.token,
    );
    const current =
      token && typeof token.value === "object"
        ? token.value[adjustment.theme]
        : undefined;
    if (!token || typeof token.value !== "object") {
      throw new Error(`Adjustment for unknown token "${adjustment.token}"`);
    }
    // Apply only over the value it was written for, so a new design value wins.
    if (current?.toLowerCase() === adjustment.from) {
      token.value[adjustment.theme] = adjustment.to;
    }
  }

  const duna = source.$duna ?? {};
  const size = source.size;
  if (!isTokenGroup(size)) throw new Error("The contract has no size group");
  const sizeNames = new Set(size.tokens.map((token) => token.name));
  const addSize = (name: string, value: string, usage: string) => {
    if (sizeNames.has(name)) return;
    sizeNames.add(name);
    size.tokens.push({ name, value, usage } as TokenEntry);
  };

  const icon: TokenEntry[] = [];
  for (const [key, value] of Object.entries(duna.iconScale ?? {})) {
    if (PX.test(value)) {
      const name =
        key === "brandMarkMaxInControl"
          ? "size-brand-mark-max"
          : `size-icon-${kebab(key)}`;
      addSize(name, value, `$duna.iconScale.${key}`);
    } else {
      icon.push({
        name: `icon-${kebab(key)}`,
        value,
        usage: `$duna.iconScale.${key}`,
      } as TokenEntry);
    }
  }
  if (icon.length > 0) source.icon = { note: "$duna.iconScale", tokens: icon };

  // A zone keeps only the values that differ from its theme (the player
  // zone's Salt ground is already the default, so it adds nothing).
  const published = new Map(
    source.color.tokens.map((token) => [token.name, token.value]),
  );
  const zones: Record<string, ZoneOverrides> = {};
  for (const [zone, spec] of Object.entries(duna.zones ?? {})) {
    const overrides: ZoneOverrides = {};
    for (const theme of themes) {
      const values = (spec as Record<string, unknown>)[theme];
      if (!values || typeof values !== "object") continue;
      const changed = Object.entries(values as Record<string, string>).filter(
        ([role, value]) => {
          const current = published.get(role);
          const themeValue =
            current === undefined || typeof current === "string"
              ? current
              : (current[theme] ?? current[DEFAULT_THEME]);
          return themeValue?.toLowerCase() !== value.toLowerCase();
        },
      );
      if (changed.length > 0) overrides[theme] = Object.fromEntries(changed);
    }
    if (Object.keys(overrides).length > 0) zones[zone] = overrides;

    const pairs = new Map<string, Record<string, string>>();
    for (const [key, value] of Object.entries(spec.shell ?? {})) {
      const themed = /^(.+)-(light|dark)$/.exec(key);
      if (themed?.[1] && themed[2] && HEX.test(value)) {
        const entry = pairs.get(themed[1]) ?? {};
        entry[themed[2]] = value;
        pairs.set(themed[1], entry);
      } else if (PX.test(value)) {
        addSize(`${zone}-${key}`, value, `$duna.zones.${zone}.shell.${key}`);
      }
    }
    for (const [key, value] of pairs) {
      const light = value.light ?? value.dark;
      const dark = value.dark ?? value.light;
      if (!light || !dark) continue;
      source.color.tokens.push({
        name: `${zone}-${key}`,
        value: Object.fromEntries(
          themes.map((theme) => [theme, theme === "light" ? light : dark]),
        ),
        usage: `$duna.zones.${zone}.shell.${key}-light / -dark`,
      } as TokenEntry);
    }
  }
  if (Object.keys(zones).length > 0) source.zones = zones;
  return {
    $generated: `Do not edit. \`pnpm tideline:tokens\` writes this file from ${TIDELINE_CONTRACT_TOKENS} with the canonical renames (${Object.entries(
      TIDELINE_RAMP_RENAMES,
    )
      .map(([from, to]) => `${from}-* to ${to}-*`)
      .join(", ")}), the retired tokens removed (${Object.keys(
      TIDELINE_RETIRED_TOKENS,
    ).join(
      ", ",
    )}), the contrast adjustments applied (${TIDELINE_VALUE_ADJUSTMENTS.map(
      (adjustment) =>
        `${adjustment.token} ${adjustment.theme} ${adjustment.from} to ${adjustment.to}`,
    ).join(
      ", ",
    )}; see TIDELINE_VALUE_ADJUSTMENTS) and the $duna zone and icon decisions promoted to tokens.`,
    ...source,
  };
}

/** The design contract's token file, relative to the repository root. */
export const TIDELINE_CONTRACT_TOKENS =
  "docs/design/tideline-4.1.1/tokens.json";

/** Prefix for every generated custom property. */
export const TIDELINE_PREFIX = "td";
/** Root class that scopes tokens and styles. */
export const TIDELINE_ROOT = ".td";
/** Themes that are a zone (a meaning) as well as a `data-theme` value. */
const ZONE_THEMES = new Set(["live"]);
const DEFAULT_THEME = "light";
const GENERATED_NOTE = `Generated by \`pnpm tideline:tokens\` from ${TIDELINE_CONTRACT_TOKENS} (via tokens.json). Do not edit by hand.`;

const cssVar = (name: string) => `--${TIDELINE_PREFIX}-${name}`;

function isThemed(value: string | ThemedValue): value is ThemedValue {
  return typeof value === "object" && value !== null;
}

function isTokenGroup(value: unknown): value is TokenGroup {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { tokens?: unknown }).tokens)
  );
}

/** Every `{ tokens: [...] }` group in file order, so a new group is picked up. */
function tokenGroups(source: TidelineTokenSource): Array<[string, TokenGroup]> {
  return Object.entries(source).filter((entry): entry is [string, TokenGroup] =>
    isTokenGroup(entry[1]),
  );
}

function themeIds(source: TidelineTokenSource): string[] {
  return source.color.themes.map((theme) => theme.id);
}

function themedValue(
  entry: TokenEntry,
  theme: string,
  value: ThemedValue,
): string {
  const resolved = value[theme] ?? value[DEFAULT_THEME];
  if (resolved === undefined) {
    throw new Error(`Token "${entry.name}" has no value for theme "${theme}"`);
  }
  return resolved;
}

/** `{tide-700}` becomes `var(--td-tide-700)`; anything else passes through. */
function aliasToCss(value: string, known: Set<string>): string {
  return value.replaceAll(/\{([a-z0-9-]+)\}/g, (_match, name: string) => {
    if (!known.has(name)) throw new Error(`Unknown token alias "{${name}}"`);
    return `var(${cssVar(name)})`;
  });
}

function knownNames(source: TidelineTokenSource): Set<string> {
  return new Set(
    tokenGroups(source).flatMap(([, group]) =>
      group.tokens.map((token) => token.name),
    ),
  );
}

function hexChannels(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex.trim());
  if (!match?.[1]) return null;
  const int = Number.parseInt(match[1], 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

/** WCAG 2 relative luminance of an opaque `#rrggbb` colour. */
export function relativeLuminance(hex: string): number {
  const channels = hexChannels(hex);
  if (!channels) throw new Error(`Cannot read colour "${hex}"`);
  const [r, g, b] = channels.map((channel) => {
    const unit = channel / 255;
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio between two opaque `#rrggbb` colours. */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** A flat `name → value` map per theme, with aliases resolved to raw values. */
export function resolveTidelineColors(
  source: TidelineTokenSource,
): Record<string, Record<string, string>> {
  const byName = new Map(
    source.color.tokens.map((token) => [token.name, token]),
  );
  const resolve = (name: string, theme: string, depth = 0): string => {
    const token = byName.get(name);
    if (!token) throw new Error(`Unknown colour token "${name}"`);
    if (depth > 8) throw new Error(`Alias loop at colour token "${name}"`);
    const raw = isThemed(token.value)
      ? themedValue(token, theme, token.value)
      : token.value;
    const alias = /^\{([a-z0-9-]+)\}$/.exec(raw);
    return alias?.[1] ? resolve(alias[1], theme, depth + 1) : raw;
  };
  return Object.fromEntries(
    themeIds(source).map((theme) => [
      theme,
      Object.fromEntries(
        source.color.tokens.map((token) => [
          token.name,
          resolve(token.name, theme),
        ]),
      ),
    ]),
  );
}

/**
 * Resolved colours for every zone and theme: the theme's colours with the
 * zone's overrides on top. A zone without a value for a theme keeps the
 * theme's own value (HQ in the live theme keeps the live ground).
 */
export function resolveTidelineZoneColors(
  source: TidelineTokenSource,
): Record<string, Record<string, Record<string, string>>> {
  const colors = resolveTidelineColors(source);
  return Object.fromEntries(
    Object.entries(source.zones ?? {}).map(([zone, overrides]) => [
      zone,
      Object.fromEntries(
        themeIds(source).map((theme) => [
          theme,
          { ...colors[theme], ...overrides[theme] },
        ]),
      ),
    ]),
  );
}

/** Each zone's repainted roles, per theme, as resolved values. */
function zoneOverrides(
  source: TidelineTokenSource,
): Record<string, Record<string, Record<string, string>>> {
  const colors = resolveTidelineColors(source);
  return Object.fromEntries(
    Object.entries(source.zones ?? {}).map(([zone, overrides]) => {
      const roles = [
        ...new Set(Object.values(overrides).flatMap((o) => Object.keys(o))),
      ];
      for (const role of roles) {
        if (!(role in (colors[DEFAULT_THEME] ?? {}))) {
          throw new Error(`Zone "${zone}" repaints unknown role "${role}"`);
        }
      }
      return [
        zone,
        Object.fromEntries(
          themeIds(source).map((theme) => [
            theme,
            Object.fromEntries(
              roles.map((role) => [
                role,
                overrides[theme]?.[role] ?? colors[theme]![role]!,
              ]),
            ),
          ]),
        ),
      ];
    }),
  );
}

/** Duna's readability floor: no product text below 12px. */
export const TYPE_FLOOR_PX = 12;

/**
 * Type styles to generate. A published style below the 12px floor (Tideline
 * 3's 11px `tab-label`) stays in tokens.json but is not generated, so no
 * product code can use it and `verify:readable-type` stays green.
 */
function typeStyles(source: TidelineTokenSource) {
  return source.type.groups.flatMap((group) =>
    group.styles
      .filter((style) => {
        const px = PX.exec(style.fontSize)?.[1];
        return px === undefined || Number(px) >= TYPE_FLOOR_PX;
      })
      .map((style) => ({
        ...style,
        family: style.family ?? group.family,
      })),
  );
}

function declarations(lines: Array<[string, string]>, indent = "  "): string {
  return lines
    .map(([name, value]) => `${indent}  ${name}: ${value};`)
    .join("\n");
}

/**
 * The selectors and wrapping of a generated token stylesheet. The library's
 * `tokens.css` scopes everything to a `.td` wrapper inside `@layer tideline`;
 * the legacy root variant (`tokens.root.css`) puts the same custom properties
 * on `:root`, unlayered, so pre-Tideline stylesheets can alias them without
 * taking any Tideline component style or reset.
 */
interface TokenCssScope {
  /** The plain (light, default) selector, e.g. `.td` or `:root`. */
  readonly root: string;
  /** The selector a zone or theme attribute is appended to. */
  readonly attributeHost: string;
  /** Extra selectors for a zone that may also be set on a descendant. */
  readonly descendantZones: ReadonlySet<string>;
  /** Emit `color-scheme` lines (only the library owns the element's scheme). */
  readonly colorScheme: boolean;
  /**
   * Emit the font-family stacks. The apps define `--td-font-*` on `<html>`
   * through `next/font`, so the root scope must not redeclare them.
   */
  readonly fontFamilies: boolean;
  /** Wrap in this cascade layer, or emit unlayered. */
  readonly layer: string | null;
  readonly title: string;
}

const LIBRARY_SCOPE: TokenCssScope = {
  root: TIDELINE_ROOT,
  attributeHost: TIDELINE_ROOT,
  descendantZones: new Set(),
  colorScheme: true,
  fontFamilies: true,
  layer: "tideline",
  title: "tokens",
};

/**
 * Legacy root scope. Both web apps resolve the theme onto `<html data-theme>`
 * before paint (`themeBootScript`, which also follows the system preference),
 * HQ sets `<html data-zone="hq">`, and a live section may set
 * `data-zone="live"` on any element: the live values are therefore also
 * declared on a descendant zone, so aliases redeclared there resolve live.
 */
const LEGACY_ROOT_SCOPE: TokenCssScope = {
  root: ":root",
  attributeHost: ":root",
  descendantZones: new Set(["live"]),
  colorScheme: false,
  fontFamilies: false,
  layer: null,
  title: "legacy root tokens (custom properties only)",
};

function scopedThemeSelector(theme: string, scope: TokenCssScope): string {
  const host = scope.attributeHost;
  const selectors =
    theme === DEFAULT_THEME
      ? [scope.root, `${host}[data-theme="${theme}"]`]
      : [`${host}[data-theme="${theme}"]`];
  if (ZONE_THEMES.has(theme)) {
    selectors.push(`${host}[data-zone="${theme}"]`);
    if (scope.descendantZones.has(theme)) {
      selectors.push(`${host} [data-zone="${theme}"]`);
    }
  }
  return selectors.join(",\n");
}

/** The generated stylesheet: every token as a `--td-*` custom property. */
export function buildTidelineTokensCss(source: TidelineTokenSource): string {
  return buildScopedTokensCss(source, LIBRARY_SCOPE);
}

/**
 * The same `--td-*` custom properties on `:root` (light),
 * `:root[data-theme="dark"]`, the live zone (on the root or any descendant)
 * and `:root[data-zone="hq"]`, unlayered and with nothing else: no
 * `color-scheme`, no font-family stack (next/font owns those on `<html>`),
 * no component style, no reset. Legacy stylesheets import it
 * and point their own variables at these roles (F2b).
 */
export function buildTidelineRootTokensCss(
  source: TidelineTokenSource,
): string {
  return buildScopedTokensCss(source, LEGACY_ROOT_SCOPE);
}

function buildScopedTokensCss(
  source: TidelineTokenSource,
  scope: TokenCssScope,
): string {
  const known = knownNames(source);
  const groups = tokenGroups(source);
  const themes = themeIds(source);
  const colors = resolveTidelineColors(source);
  const indent = scope.layer ? "  " : "";

  const base: Array<[string, string]> = [];
  const themed = new Map<string, Array<[string, string]>>(
    themes.map((theme) => [theme, []]),
  );

  for (const [, group] of groups) {
    for (const token of group.tokens) {
      if (!isThemed(token.value)) {
        base.push([cssVar(token.name), aliasToCss(token.value, known)]);
        continue;
      }
      for (const theme of themes) {
        themed
          .get(theme)
          ?.push([
            cssVar(token.name),
            aliasToCss(themedValue(token, theme, token.value), known),
          ]);
      }
    }
  }

  if (scope.fontFamilies) {
    for (const [family, stack] of Object.entries(source.type.families)) {
      base.push([cssVar(`font-${family}`), stack]);
    }
  }
  for (const style of typeStyles(source)) {
    const name = `type-${style.name}`;
    base.push([cssVar(`${name}-size`), style.fontSize]);
    base.push([cssVar(`${name}-line`), style.lineHeight]);
    base.push([cssVar(`${name}-weight`), String(style.fontWeight)]);
    base.push([cssVar(`${name}-tracking`), style.letterSpacing ?? "0"]);
    // Shorthand for the `font` property: weight size/line family.
    base.push([
      cssVar(name),
      `${style.fontWeight} ${style.fontSize}/${style.lineHeight} var(${cssVar(`font-${style.family}`)})`,
    ]);
  }

  const schemeLine = (ground: string | undefined): Array<[string, string]> =>
    scope.colorScheme
      ? [
          [
            "color-scheme",
            ground && hexChannels(ground) && relativeLuminance(ground) < 0.2
              ? "dark"
              : "light",
          ],
        ]
      : [];

  const block = (selector: string, lines: Array<[string, string]>) =>
    `${indent}${selector.replaceAll("\n", `\n${indent}`)} {\n${declarations(lines, indent)}\n${indent}}`;

  const blocks = themes.map((theme) =>
    block(scopedThemeSelector(theme, scope), [
      ...schemeLine(colors[theme]?.ground),
      ...(themed.get(theme) ?? []),
    ]),
  );

  // A zone repaints a few roles. Its plain selector serves the default
  // theme; each other theme gets a more specific block that restores (or
  // sets) that theme's value, so the zone never leaks light values into dark.
  for (const [zone, byTheme] of Object.entries(zoneOverrides(source))) {
    for (const theme of themes) {
      const values = byTheme[theme] ?? {};
      const selector =
        theme === DEFAULT_THEME
          ? `${scope.attributeHost}[data-zone="${zone}"]`
          : `${scope.attributeHost}[data-zone="${zone}"][data-theme="${theme}"]`;
      blocks.push(
        block(selector, [
          ...schemeLine(values.ground ?? colors[theme]?.ground),
          ...Object.entries(values).map(
            ([role, value]) => [cssVar(role), value] as [string, string],
          ),
        ]),
      );
    }
  }

  const brand = source.type.brand;
  if (brand) {
    base.push([cssVar("type-brand-weight"), String(brand.weight)]);
    base.push([cssVar("type-brand-tracking"), brand.tracking]);
    base.push([cssVar("type-brand-min"), brand.min]);
  }

  const reduced = Object.entries(source.reducedMotion ?? {});
  for (const [name] of reduced) {
    if (!known.has(name)) {
      throw new Error(`Reduced motion names unknown token "${name}"`);
    }
  }
  const reducedBlock =
    reduced.length > 0
      ? [
          `${indent}@media (prefers-reduced-motion: reduce) {`,
          `${indent}  ${scope.root} {`,
          ...reduced.map(
            ([name, value]) => `${indent}    ${cssVar(name)}: ${value};`,
          ),
          `${indent}  }`,
          `${indent}}`,
        ]
      : [];

  const body = [block(scope.root, base), ...blocks, ...reducedBlock];
  return [
    `/* Tideline ${source.version} ${scope.title}. ${GENERATED_NOTE} */`,
    ...(scope.layer ? [`@layer ${scope.layer} {`, ...body, `}`] : body),
    ``,
  ].join("\n");
}

const PX = /^(-?\d+(?:\.\d+)?)px$/;
const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
const MS = /^(-?\d+(?:\.\d+)?)ms$/;
const EM = /^(-?\d+(?:\.\d+)?)em$/;
const NUMBER = /^-?\d+(?:\.\d+)?$/;

/** `"16px"`, `"240ms"` and `"300"` become numbers; other values stay text. */
function nativeValue(value: string): string | number {
  const match = PX.exec(value) ?? MS.exec(value) ?? NUMBER.exec(value);
  return match ? Number(match[1] ?? match[0]) : value;
}

function nativeTypeStyle(style: ReturnType<typeof typeStyles>[number]) {
  const size = Number(PX.exec(style.fontSize)?.[1] ?? Number.NaN);
  if (Number.isNaN(size)) {
    throw new Error(`Type style "${style.name}" needs a pixel font size`);
  }
  const linePx = PX.exec(style.lineHeight)?.[1];
  // A unitless line height is a ratio of the font size; native wants pixels.
  const lineHeight = linePx
    ? Number(linePx)
    : Math.round(size * Number(style.lineHeight) * 100) / 100;
  const tracking = style.letterSpacing
    ? Number(EM.exec(style.letterSpacing)?.[1] ?? 0)
    : 0;
  return {
    family: style.family,
    fontSize: size,
    lineHeight,
    fontWeight: style.fontWeight,
    // Em tracking resolved against the font size, as React Native expects.
    letterSpacing: Math.round(size * tracking * 1000) / 1000,
  };
}

/** The generated TypeScript module: resolved values for React Native. */
export function buildTidelineTokensTs(source: TidelineTokenSource): string {
  const themes = themeIds(source);
  const colors = resolveTidelineColors(source);
  const scales: Record<string, Record<string, string | number>> = {};
  const themedScales: Record<
    string,
    Record<string, Record<string, string>>
  > = {};

  for (const [groupName, group] of tokenGroups(source)) {
    if (groupName === "color") continue;
    for (const token of group.tokens) {
      if (isThemed(token.value)) {
        const value = token.value;
        const target = (themedScales[groupName] ??= Object.fromEntries(
          themes.map((theme) => [theme, {}]),
        ));
        for (const theme of themes) {
          (target[theme] ??= {})[token.name] = themedValue(token, theme, value);
        }
      } else {
        (scales[groupName] ??= {})[token.name] = nativeValue(token.value);
      }
    }
  }

  const tokens = {
    name: source.name,
    version: source.version,
    themes,
    color: colors,
    ...scales,
    ...Object.fromEntries(
      Object.entries(themedScales).map(([groupName, value]) => [
        groupName in scales ? `${groupName}ByTheme` : groupName,
        value,
      ]),
    ),
    font: source.type.families,
    type: Object.fromEntries(
      typeStyles(source).map((style) => [style.name, nativeTypeStyle(style)]),
    ),
    ...(source.type.brand
      ? {
          brandType: {
            family: "brand",
            fontWeight: source.type.brand.weight,
            letterSpacingEm: Number(
              EM.exec(source.type.brand.tracking)?.[1] ?? 0,
            ),
            minFontSize: nativeValue(source.type.brand.min),
          },
        }
      : {}),
    zone: zoneOverrides(source),
    reducedMotion: Object.fromEntries(
      Object.entries(source.reducedMotion ?? {}).map(([name, value]) => [
        name,
        nativeValue(value),
      ]),
    ),
  };

  return [
    `/* Tideline ${source.version} tokens. ${GENERATED_NOTE} */`,
    ``,
    `export const tidelineTokens = ${JSON.stringify(tokens, null, 2)} as const;`,
    ``,
    `export type TidelineTokens = typeof tidelineTokens;`,
    `export type TidelineTheme = TidelineTokens["themes"][number];`,
    `export type TidelineColorRole = keyof TidelineTokens["color"]["${DEFAULT_THEME}"];`,
    `export type TidelineTypeStyle = keyof TidelineTokens["type"];`,
    ``,
    `export type TidelineZone = "live" | keyof TidelineTokens["zone"];`,
    ``,
    `/**`,
    ` * The resolved colour set for a theme and zone. The live zone wins over the`,
    ` * preference; another zone (HQ) repaints its roles on top of the theme.`,
    ` */`,
    `export function tidelineColors(`,
    `  theme: TidelineTheme = "${DEFAULT_THEME}",`,
    `  zone?: TidelineZone | (string & {}),`,
    `): Record<TidelineColorRole, string> {`,
    `  if (zone === "live") return tidelineTokens.color.live;`,
    `  const overrides =`,
    `    zone && zone in tidelineTokens.zone`,
    `      ? tidelineTokens.zone[zone as keyof TidelineTokens["zone"]][theme]`,
    `      : undefined;`,
    `  const colors = tidelineTokens.color[theme];`,
    `  return overrides ? { ...colors, ...overrides } : colors;`,
    `}`,
    ``,
  ].join("\n");
}
