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

function themeSelector(theme: string): string {
  const selectors =
    theme === DEFAULT_THEME
      ? [TIDELINE_ROOT, `${TIDELINE_ROOT}[data-theme="${theme}"]`]
      : [`${TIDELINE_ROOT}[data-theme="${theme}"]`];
  if (ZONE_THEMES.has(theme)) {
    selectors.push(`${TIDELINE_ROOT}[data-zone="${theme}"]`);
  }
  return selectors.join(",\n");
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

function declarations(lines: Array<[string, string]>): string {
  return lines.map(([name, value]) => `    ${name}: ${value};`).join("\n");
}

/** The generated stylesheet: every token as a `--td-*` custom property. */
export function buildTidelineTokensCss(source: TidelineTokenSource): string {
  const known = knownNames(source);
  const groups = tokenGroups(source);
  const themes = themeIds(source);
  const colors = resolveTidelineColors(source);

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

  for (const [family, stack] of Object.entries(source.type.families)) {
    base.push([cssVar(`font-${family}`), stack]);
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

  const blocks = themes.map((theme) => {
    const ground = colors[theme]?.ground;
    const scheme =
      ground && hexChannels(ground) && relativeLuminance(ground) < 0.2
        ? "dark"
        : "light";
    const lines: Array<[string, string]> = [
      ["color-scheme", scheme],
      ...(themed.get(theme) ?? []),
    ];
    return `  ${themeSelector(theme).replaceAll("\n", "\n  ")} {\n${declarations(lines)}\n  }`;
  });

  // A zone repaints a few roles. Its plain selector serves the default
  // theme; each other theme gets a more specific block that restores (or
  // sets) that theme's value, so the zone never leaks light values into dark.
  for (const [zone, byTheme] of Object.entries(zoneOverrides(source))) {
    for (const theme of themes) {
      const values = byTheme[theme] ?? {};
      const ground = values.ground ?? colors[theme]?.ground;
      const scheme =
        ground && hexChannels(ground) && relativeLuminance(ground) < 0.2
          ? "dark"
          : "light";
      const selector =
        theme === DEFAULT_THEME
          ? `${TIDELINE_ROOT}[data-zone="${zone}"]`
          : `${TIDELINE_ROOT}[data-zone="${zone}"][data-theme="${theme}"]`;
      const lines: Array<[string, string]> = [
        ["color-scheme", scheme],
        ...Object.entries(values).map(
          ([role, value]) => [cssVar(role), value] as [string, string],
        ),
      ];
      blocks.push(`  ${selector} {\n${declarations(lines)}\n  }`);
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
          `  @media (prefers-reduced-motion: reduce) {`,
          `    ${TIDELINE_ROOT} {`,
          ...reduced.map(([name, value]) => `      ${cssVar(name)}: ${value};`),
          `    }`,
          `  }`,
        ]
      : [];

  return [
    `/* Tideline ${source.version} tokens. ${GENERATED_NOTE} */`,
    `@layer tideline {`,
    `  ${TIDELINE_ROOT} {\n${declarations(base)}\n  }`,
    ...blocks,
    ...reducedBlock,
    `}`,
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

/*
 * React Native output (`packages/ui/src/native/tokens/tokens.native.ts`).
 *
 * The same source as the web files, resolved for React Native: colours as
 * `#rrggbb` / `#rrggbbaa` strings (OKLCH converted to sRGB, aliases
 * resolved), lengths and times as numbers, easings as cubic-bezier control
 * points, shadows as `boxShadow` layer objects, type styles in pixels with em
 * tracking resolved against the font size. Group prefixes are dropped
 * (`space-4` is `space["4"]`, `duration-rise` is `motion.duration.rise`).
 */

const OKLCH = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/i;

/** `oklch(L C H)` (L 0..1) to an opaque `#rrggbb`, clipped to sRGB. */
export function oklchToHex(value: string): string {
  const match = OKLCH.exec(value.trim());
  if (!match) throw new Error(`Cannot read OKLCH colour "${value}"`);
  const [l, c, h] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);
  const l1 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m1 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s1 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l1 - 3.3077115913 * m1 + 0.2309699292 * s1,
    -1.2684380046 * l1 + 2.6097574011 * m1 - 0.3413193965 * s1,
    -0.0041960863 * l1 - 0.7034186147 * m1 + 1.707614701 * s1,
  ];
  return `#${linear
    .map((channel) => {
      const clipped = Math.min(1, Math.max(0, channel));
      const encoded =
        clipped <= 0.0031308
          ? 12.92 * clipped
          : 1.055 * clipped ** (1 / 2.4) - 0.055;
      return Math.round(encoded * 255)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}

/** A colour React Native can parse: hex stays, OKLCH becomes hex. */
function nativeColor(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (HEX.test(trimmed)) return trimmed;
  if (OKLCH.test(trimmed)) return oklchToHex(trimmed);
  throw new Error(`Colour "${value}" has no React Native form`);
}

const CUBIC = /^cubic-bezier\(\s*([^)]+)\)$/;

/** `cubic-bezier(.2, .8, .2, 1)` to its four control points. */
export function cubicBezierPoints(
  value: string,
): [number, number, number, number] {
  const match = CUBIC.exec(value.trim());
  const points = match?.[1]?.split(",").map((part) => Number(part.trim()));
  if (!points || points.length !== 4 || points.some(Number.isNaN)) {
    throw new Error(`Easing "${value}" is not a cubic-bezier()`);
  }
  return points as [number, number, number, number];
}

/** One React Native `boxShadow` layer (New Architecture). */
export interface NativeShadowLayer {
  offsetX: number;
  offsetY: number;
  blurRadius: number;
  spreadDistance: number;
  color: string;
  inset?: true;
}

/** A CSS `box-shadow` list (`0 4px 12px -2px #0b122014, …`) as layers. */
export function nativeShadowLayers(value: string): NativeShadowLayer[] {
  return value.split(/,(?![^(]*\))/).map((layer) => {
    const parts = layer.trim().split(/\s+/);
    const inset = parts[0] === "inset";
    const rest = inset ? parts.slice(1) : parts;
    const color = rest.find((part) => !/^-?\d/.test(part));
    const lengths = rest
      .filter((part) => part !== color)
      .map((part) => {
        const px = PX.exec(part) ?? NUMBER.exec(part);
        if (!px) throw new Error(`Shadow length "${part}" in "${value}"`);
        return Number(px[1] ?? px[0]);
      });
    if (!color || lengths.length < 2 || lengths.length > 4) {
      throw new Error(`Cannot read shadow "${layer}"`);
    }
    const [offsetX = 0, offsetY = 0, blurRadius = 0, spreadDistance = 0] =
      lengths;
    return {
      offsetX,
      offsetY,
      blurRadius,
      spreadDistance,
      color: nativeColor(color),
      ...(inset ? { inset: true as const } : {}),
    };
  });
}

/** `space-4` → `4` inside the `space` group; names without the prefix stay. */
function withoutPrefix(name: string, prefix: string): string {
  return name.startsWith(`${prefix}-`) ? name.slice(prefix.length + 1) : name;
}

function groupOf(source: TidelineTokenSource, name: string): TokenGroup {
  const group = source[name];
  if (!isTokenGroup(group)) throw new Error(`The source has no ${name} group`);
  return group;
}

/** Plain (theme-independent) pixel or number tokens of a group, prefix dropped. */
function nativeScale(
  source: TidelineTokenSource,
  group: string,
  prefix: string,
): Record<string, number> {
  return Object.fromEntries(
    groupOf(source, group)
      .tokens.filter((token) => !isThemed(token.value))
      .map((token) => {
        const value = nativeValue(token.value as string);
        if (typeof value !== "number") {
          throw new Error(`Token "${token.name}" is not a number: ${value}`);
        }
        return [withoutPrefix(token.name, prefix), value];
      }),
  );
}

/** The generated React Native token module. */
export function buildTidelineNativeTokensTs(
  source: TidelineTokenSource,
): string {
  const themes = themeIds(source);
  const colors = resolveTidelineColors(source);
  const colorTokens = source.color.tokens;
  const roleNames = colorTokens
    .filter((token) => isThemed(token.value))
    .map((token) => token.name);
  const brand = Object.fromEntries(
    colorTokens
      .filter((token) => token.name.startsWith("brand-"))
      .map((token) => [
        withoutPrefix(token.name, "brand"),
        nativeColor(colors[DEFAULT_THEME]![token.name]!),
      ]),
  );
  const ramp = Object.fromEntries(
    colorTokens
      .filter(
        (token) => !isThemed(token.value) && !token.name.startsWith("brand-"),
      )
      .map((token) => [
        token.name,
        nativeColor(colors[DEFAULT_THEME]![token.name]!),
      ]),
  );
  const roles = (values: Record<string, string>) =>
    Object.fromEntries(
      roleNames.map((role) => [role, nativeColor(values[role]!)]),
    );
  const zones = resolveTidelineZoneColors(source);

  const easing = Object.fromEntries(
    groupOf(source, "easing").tokens.map((token) => [
      withoutPrefix(token.name, "ease"),
      cubicBezierPoints(token.value as string),
    ]),
  );
  const duration = Object.fromEntries(
    groupOf(source, "duration").tokens.map((token) => [
      withoutPrefix(token.name, "duration"),
      nativeValue(token.value as string),
    ]),
  );
  const reduced = Object.fromEntries(
    Object.entries(source.reducedMotion ?? {})
      .filter(([name]) =>
        groupOf(source, "duration").tokens.some((token) => token.name === name),
      )
      .map(([name, value]) => [
        withoutPrefix(name, "duration"),
        nativeValue(value),
      ]),
  );

  const shadow = Object.fromEntries(
    themes.map((theme) => [
      theme,
      Object.fromEntries(
        groupOf(source, "shadow").tokens.map((token) => [
          withoutPrefix(token.name, "shadow"),
          nativeShadowLayers(
            isThemed(token.value)
              ? themedValue(token, theme, token.value)
              : token.value,
          ),
        ]),
      ),
    ]),
  );

  const size = nativeScale(source, "size", "size");
  const icon = Object.fromEntries(
    groupOf(source, "icon").tokens.map((token) => [
      withoutPrefix(token.name, "icon"),
      nativeValue(token.value as string),
    ]),
  );

  const styles = typeStyles(source);
  const weights: Record<string, Set<number>> = {};
  const type = Object.fromEntries(
    styles.map((style) => {
      const resolved = nativeTypeStyle(style);
      (weights[resolved.family] ??= new Set()).add(resolved.fontWeight);
      return [style.name, resolved];
    }),
  );
  const brandType = source.type.brand;
  if (brandType) (weights.brand ??= new Set()).add(brandType.weight);

  const tokens = {
    name: source.name,
    version: source.version,
    themes,
    brand,
    ramp,
    color: Object.fromEntries(
      themes.map((theme) => [theme, roles(colors[theme]!)]),
    ),
    zone: Object.fromEntries(
      Object.entries(zones).map(([zone, byTheme]) => [
        zone,
        Object.fromEntries(
          themes.map((theme) => [theme, roles(byTheme[theme]!)]),
        ),
      ]),
    ),
    space: nativeScale(source, "spacing", "space"),
    radius: nativeScale(source, "radius", "radius"),
    size,
    icon: {
      ...icon,
      size: {
        chip: size["icon-chip"],
        inline: size["icon-inline"],
        control: size["icon-control"],
        nav: size["icon-nav"],
      },
      brandMarkMax: size["brand-mark-max"],
    },
    layer: nativeScale(source, "layer", "z"),
    font: source.type.families,
    fontWeights: Object.fromEntries(
      Object.entries(weights).map(([family, set]) => [
        family,
        [...set].sort((a, b) => a - b),
      ]),
    ),
    type,
    ...(brandType
      ? {
          brandType: {
            family: "brand",
            fontWeight: brandType.weight,
            letterSpacingEm: Number(EM.exec(brandType.tracking)?.[1] ?? 0),
            minFontSize: nativeValue(brandType.min),
          },
        }
      : {}),
    motion: { duration, easing, reduced },
    shadow,
  };

  return [
    `/* Tideline ${source.version} tokens for React Native. ${GENERATED_NOTE} */`,
    ``,
    `export const nativeTokens = ${JSON.stringify(tokens, null, 2)} as const;`,
    ``,
    `export type NativeTokens = typeof nativeTokens;`,
    `export type NativeTheme = NativeTokens["themes"][number];`,
    `export type NativeColorRole = keyof NativeTokens["color"]["${DEFAULT_THEME}"];`,
    `export type NativeColors = Readonly<Record<NativeColorRole, string>>;`,
    `export type NativeZone = "live" | keyof NativeTokens["zone"];`,
    `export type NativeTypeStyle = keyof NativeTokens["type"];`,
    `export type NativeFontFamily = keyof NativeTokens["fontWeights"];`,
    `export type NativeShadow = keyof NativeTokens["shadow"]["${DEFAULT_THEME}"];`,
    `export type NativeEasing = keyof NativeTokens["motion"]["easing"];`,
    `export type NativeDuration = keyof NativeTokens["motion"]["duration"];`,
    ``,
    `/**`,
    ` * The resolved colour roles for a theme and zone. The live zone wins over the`,
    ` * preference; another zone (HQ) repaints its roles on top of the theme.`,
    ` */`,
    `export function nativeColors(`,
    `  theme: NativeTheme = "${DEFAULT_THEME}",`,
    `  zone?: NativeZone | null,`,
    `): NativeColors {`,
    `  if (zone === "live") return nativeTokens.color.live;`,
    `  if (zone && zone in nativeTokens.zone) {`,
    `    return nativeTokens.zone[zone as keyof NativeTokens["zone"]][theme];`,
    `  }`,
    `  return nativeTokens.color[theme];`,
    `}`,
    ``,
  ].join("\n");
}
