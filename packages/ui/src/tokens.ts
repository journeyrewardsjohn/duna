export type DunaTheme = "light" | "dark";
export type DunaThemePreference = DunaTheme | "system";
export type DunaZone = "editorial" | "athletic" | "live";
export type DunaContrast = "ambient" | "bright" | "glare";

export const environmentalColors = {
  sand100: "#EFE6D3",
  sand300: "#E2CFA6",
  sand500: "#C9A96A",
  marine200: "#B5CCD3",
  marine400: "#8FB0BC",
  marine900: "#22343B",
  ink: "#1B1B19",
  inkSoft: "#3A3A36",
  fog50: "#F6F5F1",
  fog100: "#EDECE6",
  white: "#FFFFFF",
  flare: "#E8683A",
  flareDeep: "#B84A20",
  signal: "#C9E265",
  dusk: "#FBF3F4",
  duskDeep: "#EDD3D9",
  gain: "#2F6B3A",
  loss: "#9A4A2E",
  pending: "#8A8578",
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

const resolvedContexts: Record<
  DunaTheme,
  Record<DunaZone, ResolvedDunaTokens>
> = {
  light: {
    editorial: {
      ground: "#F6F5F1",
      groundWarm: "#EFE6D3",
      groundCool: "#B5CCD3",
      surface1: "#FFFFFF",
      surface2: "#EDECE6",
      surface3: "#FFFFFF",
      hairline: "rgba(27,27,25,0.08)",
      hairlineStrong: "rgba(27,27,25,0.18)",
      edgeLight: "transparent",
      scrim: "rgba(27,27,25,0.44)",
      text1: "#1B1B19",
      text2: "#3A3A36",
      text3: "#766F61",
      textOnAccent: "#FFFFFF",
      flare: "#E8683A",
      flareText: "#B84A20",
      flareFill: "rgba(232,104,58,0.13)",
      flareBorder: "rgba(232,104,58,0.26)",
      signal: "#C9E265",
      gold: "#C9A96A",
      gain: "#2F6B3A",
      loss: "#9A4A2E",
      imageVeil: "transparent",
      dissolve: "#F6F5F1",
      buttonPrimaryBackground: "#1B1B19",
      buttonPrimaryForeground: "#F6F5F1",
      buttonGhostBorder: "rgba(27,27,25,0.22)",
      focusRing: "#E8683A",
    },
    athletic: {
      ground: "#F6F5F1",
      groundWarm: "#EFE6D3",
      groundCool: "#B5CCD3",
      surface1: "#FFFFFF",
      surface2: "#EDECE6",
      surface3: "#FFFFFF",
      hairline: "rgba(27,27,25,0.08)",
      hairlineStrong: "rgba(27,27,25,0.18)",
      edgeLight: "transparent",
      scrim: "rgba(27,27,25,0.44)",
      text1: "#1B1B19",
      text2: "#3A3A36",
      text3: "#766F61",
      textOnAccent: "#FFFFFF",
      flare: "#E8683A",
      flareText: "#B84A20",
      flareFill: "rgba(232,104,58,0.13)",
      flareBorder: "rgba(232,104,58,0.26)",
      signal: "#C9E265",
      gold: "#C9A96A",
      gain: "#2F6B3A",
      loss: "#9A4A2E",
      imageVeil: "transparent",
      dissolve: "#F6F5F1",
      buttonPrimaryBackground: "#1B1B19",
      buttonPrimaryForeground: "#F6F5F1",
      buttonGhostBorder: "rgba(27,27,25,0.22)",
      focusRing: "#E8683A",
    },
    live: {
      ground: "#1B1B19",
      groundWarm: "#231F19",
      groundCool: "#22343B",
      surface1: "rgba(246,245,241,0.05)",
      surface2: "rgba(246,245,241,0.08)",
      surface3: "#232320",
      hairline: "rgba(246,245,241,0.10)",
      hairlineStrong: "rgba(246,245,241,0.22)",
      edgeLight: "rgba(246,245,241,0.06)",
      scrim: "rgba(10,10,9,0.62)",
      text1: "#F2F0EA",
      text2: "rgba(242,240,234,0.72)",
      text3: "rgba(242,240,234,0.52)",
      textOnAccent: "#FFFFFF",
      flare: "#E8683A",
      flareText: "#F28A64",
      flareFill: "rgba(232,104,58,0.16)",
      flareBorder: "rgba(232,104,58,0.34)",
      signal: "#C9E265",
      gold: "#C9A96A",
      gain: "#75B982",
      loss: "#D28365",
      imageVeil: "rgba(13,17,20,0.08)",
      dissolve: "#1B1B19",
      buttonPrimaryBackground: "#F2F0EA",
      buttonPrimaryForeground: "#1B1B19",
      buttonGhostBorder: "rgba(242,240,234,0.26)",
      focusRing: "#F4794C",
    },
  },
  dark: {
    editorial: {
      ground: "#141310",
      groundWarm: "#1E1A14",
      groundCool: "#16232A",
      surface1: "#1C1A16",
      surface2: "#24211C",
      surface3: "#2C2823",
      hairline: "rgba(239,230,211,0.10)",
      hairlineStrong: "rgba(239,230,211,0.20)",
      edgeLight: "transparent",
      scrim: "rgba(10,10,9,0.62)",
      text1: "#F2F0EA",
      text2: "#B8B4A8",
      text3: "#918B80",
      textOnAccent: "#141310",
      flare: "#F4794C",
      flareText: "#F4794C",
      flareFill: "rgba(244,121,76,0.16)",
      flareBorder: "rgba(244,121,76,0.34)",
      signal: "#A8C44E",
      gold: "#D4B77C",
      gain: "#6BAE78",
      loss: "#C4785C",
      imageVeil: "rgba(13,17,20,0.16)",
      dissolve: "#141310",
      buttonPrimaryBackground: "#F2F0EA",
      buttonPrimaryForeground: "#141310",
      buttonGhostBorder: "rgba(242,240,234,0.26)",
      focusRing: "#F4794C",
    },
    athletic: {
      ground: "#141310",
      groundWarm: "#1E1A14",
      groundCool: "#16232A",
      surface1: "#1C1A16",
      surface2: "#24211C",
      surface3: "#2C2823",
      hairline: "rgba(239,230,211,0.10)",
      hairlineStrong: "rgba(239,230,211,0.20)",
      edgeLight: "transparent",
      scrim: "rgba(10,10,9,0.62)",
      text1: "#F2F0EA",
      text2: "#B8B4A8",
      text3: "#918B80",
      textOnAccent: "#141310",
      flare: "#F4794C",
      flareText: "#F4794C",
      flareFill: "rgba(244,121,76,0.16)",
      flareBorder: "rgba(244,121,76,0.34)",
      signal: "#A8C44E",
      gold: "#D4B77C",
      gain: "#6BAE78",
      loss: "#C4785C",
      imageVeil: "rgba(13,17,20,0.16)",
      dissolve: "#141310",
      buttonPrimaryBackground: "#F2F0EA",
      buttonPrimaryForeground: "#141310",
      buttonGhostBorder: "rgba(242,240,234,0.26)",
      focusRing: "#F4794C",
    },
    live: {
      ground: "#0D1114",
      groundWarm: "#171410",
      groundCool: "#101A20",
      surface1: "#141A1E",
      surface2: "#1B2429",
      surface3: "#22343B",
      hairline: "rgba(181,204,211,0.12)",
      hairlineStrong: "rgba(181,204,211,0.24)",
      edgeLight: "rgba(181,204,211,0.09)",
      scrim: "rgba(6,8,9,0.70)",
      text1: "#EDF1F2",
      text2: "#A9B4B8",
      text3: "#87959B",
      textOnAccent: "#0D1114",
      flare: "#F4794C",
      flareText: "#F4794C",
      flareFill: "rgba(244,121,76,0.16)",
      flareBorder: "rgba(244,121,76,0.34)",
      signal: "#A8C44E",
      gold: "#D4B77C",
      gain: "#6BAE78",
      loss: "#C4785C",
      imageVeil: "rgba(13,17,20,0.16)",
      dissolve: "#0D1114",
      buttonPrimaryBackground: "#EDF1F2",
      buttonPrimaryForeground: "#0D1114",
      buttonGhostBorder: "rgba(237,241,242,0.26)",
      focusRing: "#F4794C",
    },
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
    ink: theme === "light" ? "#1B1B19" : "#0D1114",
    depth: token.surface1,
    navy: token.groundCool,
    navyLift: token.surface2,
    bone: token.text1,
    boneMuted: token.text2,
    sand: token.gold,
    sandLight: theme === "light" ? "#EFE6D3" : "#1E1A14",
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

export const typography = {
  display: "Fraunces",
  body: "Fellix",
  data: "Archivo",
  mono: "Archivo",
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
