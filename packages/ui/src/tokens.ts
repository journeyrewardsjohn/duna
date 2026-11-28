import {
  nativeColors,
  nativeTokens as generated,
} from "./native/tokens/tokens.native";

export type DunaTheme = "light" | "dark";
export type DunaThemePreference = DunaTheme | "system";
export type DunaZone = "editorial" | "athletic" | "live";
export type DunaContrast = "ambient" | "bright" | "glare";

const role = generated.color.light;
const ramp = generated.ramp;
const brand = generated.brand;

/**
 * The older environmental palette, re-pointed at the 4.1.1 token values by
 * meaning (sand to Dune, marine to the tide ramp, ink to Night Court, fog to
 * Salt). Kept for screens that have not migrated.
 */
export const environmentalColors = {
  sand100: role["sun-wash"],
  sand300: ramp["dune-300"],
  sand500: ramp["dune-500"],
  marine200: ramp["tide-200"],
  marine400: ramp["tide-400"],
  marine900: brand["night-court"],
  ink: brand["night-court"],
  inkSoft: role["text-2"],
  fog50: brand.salt,
  fog100: role["surface-sunken"],
  white: ramp["haze-0"],
  /** Was the retired flare orange: Hardwood (a warm category colour, not live). */
  flare: ramp["hardwood-400"],
  flareDeep: ramp["hardwood-500"],
  signal: ramp["dune-400"],
  dusk: ramp["dusk-100"],
  duskDeep: ramp["dusk-300"],
  gain: role.positive,
  loss: role.danger,
  pending: role["text-3"],
} as const;

export type ResolvedDunaTokens = {
  readonly ground: string;
  readonly groundWarm: string;
  readonly groundCool: string;
  readonly surface1: string;
  readonly surface2: string;
  readonly surface3: string;
  readonly hairline: string;
  readonly hairlineStrong: string;
  readonly edgeLight: string;
  readonly scrim: string;
  readonly text1: string;
  readonly text2: string;
  readonly text3: string;
  readonly textOnAccent: string;
  readonly flare: string;
  readonly flareText: string;
  readonly flareFill: string;
  readonly flareBorder: string;
  readonly signal: string;
  readonly gold: string;
  readonly gain: string;
  readonly loss: string;
  readonly imageVeil: string;
  readonly dissolve: string;
  readonly buttonPrimaryBackground: string;
  readonly buttonPrimaryForeground: string;
  readonly buttonGhostBorder: string;
  readonly focusRing: string;
};

/**
 * The legacy context names, re-pointed at Tideline 4.1.1 roles (work package
 * M-F0/M-F1): every value comes from the generated tokens, never a literal.
 * The retired flare orange maps by meaning: the warm signal (`sun-ink` on
 * light, Dune on dark) everywhere, and Solar (`live`) only in the live zone.
 * Screens move to `@duna/ui/native` as they migrate.
 */
function legacyContext(
  theme: "light" | "dark",
  zone: DunaZone,
): ResolvedDunaTokens {
  const live = zone === "live";
  const role = nativeColors(live ? "live" : theme);
  const dark = live || theme === "dark";
  return {
    ground: role.ground,
    groundWarm: role["sun-wash"],
    groundCool: role["surface-sunken"],
    surface1: role.surface,
    surface2: role["surface-sunken"],
    surface3: role["surface-raised"],
    hairline: role.line,
    hairlineStrong: role["line-strong"],
    edgeLight: "transparent",
    scrim: role.scrim,
    text1: role.text,
    text2: role["text-2"],
    text3: role["text-3"],
    textOnAccent: role["on-action"],
    flare: live ? role.live : dark ? role.sun : role["sun-ink"],
    flareText: live ? role["live-ink"] : role["sun-ink"],
    flareFill: live ? role["live-wash"] : role["sun-wash"],
    flareBorder: live ? role.live : role.sun,
    signal: role.energy,
    gold: dark ? role.sun : role["sun-ink"],
    gain: role.positive,
    loss: role.danger,
    imageVeil: dark ? role.scrim : "transparent",
    dissolve: role.ground,
    buttonPrimaryBackground: role.action,
    buttonPrimaryForeground: role["on-action"],
    buttonGhostBorder: role["line-strong"],
    focusRing: role.focus,
  };
}

const resolvedContexts: Record<
  DunaTheme,
  Record<DunaZone, ResolvedDunaTokens>
> = {
  light: {
    editorial: legacyContext("light", "editorial"),
    athletic: legacyContext("light", "athletic"),
    live: legacyContext("light", "live"),
  },
  dark: {
    editorial: legacyContext("dark", "editorial"),
    athletic: legacyContext("dark", "athletic"),
    live: legacyContext("dark", "live"),
  },
};

export function resolveDunaTokens(
  theme: DunaTheme,
  zone: DunaZone = "editorial",
  contrast: DunaContrast = "ambient",
): ResolvedDunaTokens {
  const base = resolvedContexts[theme][zone];
  if (contrast === "ambient") return base;

  if (contrast === "bright") {
    return {
      ...base,
      surface1: theme === "light" ? "#FFFFFF" : base.surface2,
      surface2: theme === "light" ? "#F3F1EB" : base.surface3,
      hairline: base.hairlineStrong,
      text2: base.text1,
      imageVeil:
        theme === "light" ? "rgba(246,245,241,0.85)" : "rgba(13,17,20,0.32)",
    };
  }

  const darkGlare = theme === "dark" || zone === "live";
  return {
    ...base,
    ground: darkGlare ? "#000000" : "#FFFFFF",
    groundWarm: darkGlare ? "#000000" : "#FFFFFF",
    groundCool: darkGlare ? "#000000" : "#FFFFFF",
    surface1: darkGlare ? "#000000" : "#FFFFFF",
    surface2: darkGlare ? "#0A0A0A" : "#F4F4F4",
    surface3: darkGlare ? "#111111" : "#FFFFFF",
    text1: darkGlare ? "#FFFFFF" : "#000000",
    text2: darkGlare ? "#FFFFFF" : "#000000",
    text3: darkGlare ? "#E8E8E8" : "#181818",
    dissolve: darkGlare ? "#000000" : "#FFFFFF",
    imageVeil: darkGlare ? "rgba(0,0,0,1)" : "rgba(255,255,255,1)",
    buttonPrimaryBackground: darkGlare ? "#FFFFFF" : "#000000",
    buttonPrimaryForeground: darkGlare ? "#000000" : "#FFFFFF",
  };
}

// Compatibility palette for existing native surfaces while they migrate from
// color-role names such as `aqua` and `bone` to semantic tokens.
function legacyPalette(theme: DunaTheme) {
  const token = resolveDunaTokens(theme, "editorial");
  return {
    ink: generated.brand["night-court"],
    depth: token.surface1,
    navy: token.groundCool,
    navyLift: token.surface2,
    bone: token.text1,
    boneMuted: token.text2,
    sand: token.gold,
    sandLight: token.groundWarm,
    aqua: token.buttonPrimaryBackground,
    aquaDeep: token.text2,
    flare: token.flare,
    positive: token.gain,
    warning: token.gold,
    danger: token.loss,
    white: "#FFFFFF",
  } as const;
}

export const lightColors = legacyPalette("light");
export const darkColors = legacyPalette("dark");
export const colors = lightColors;

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
} as const;

export const radii = {
  chip: 12,
  small: 16,
  medium: 18,
  large: 24,
  sheet: 28,
  pill: 999,
} as const;

/** Native font faces (embedded; see `@duna/ui/native/type`). */
export const typography = {
  display: "Jost-Medium",
  body: "Geist-Regular",
  data: "Geist-SemiBold",
  mono: "GeistMono-Regular",
} as const;

export const numericTiers = {
  score: { width: 64, weight: 900, tabular: true },
  monument: { width: 122, weight: 900, tabular: false },
  hero: { width: 108, weight: 800, tabular: true },
  block: { width: 94, weight: 800, tabular: true },
  table: { width: 78, weight: 700, tabular: true },
  chip: { width: 78, weight: 700, tabular: true },
} as const;

export const motion = {
  score: 180,
  fast: 140,
  standard: 220,
  zone: 320,
  ratingMoment: 800,
} as const;

export const nativeTokens = {
  colors,
  lightColors,
  darkColors,
  environmentalColors,
  spacing,
  radii,
  typography,
  numericTiers,
  motion,
  resolve: resolveDunaTokens,
  minimumTarget: 48,
  primaryTarget: 56,
  proMinimumTarget: 56,
} as const;
