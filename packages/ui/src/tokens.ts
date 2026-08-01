export const lightColors = {
  ink: "#101828",
  depth: "#ffffff",
  navy: "#f1ece2",
  navyLift: "#e8eef7",
  bone: "#101828",
  boneMuted: "#667085",
  sand: "#d7bd91",
  sandLight: "#f3eadb",
  aqua: "#235a96",
  aquaDeep: "#173a67",
  flare: "#de6842",
  positive: "#2f7d57",
  warning: "#a86f18",
  danger: "#b84444",
  white: "#ffffff",
} as const;

export const darkColors = {
  ink: "#070b0d",
  depth: "#0c1418",
  navy: "#10242b",
  navyLift: "#17343d",
  bone: "#f3efe5",
  boneMuted: "#d8d2c4",
  sand: "#c9a96c",
  sandLight: "#ead9b5",
  aqua: "#63e3db",
  aquaDeep: "#1b9f9a",
  flare: "#ff6a3d",
  positive: "#85d49b",
  warning: "#f7c86b",
  danger: "#f27878",
  white: "#ffffff",
} as const;

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
  small: 10,
  medium: 16,
  large: 24,
  pill: 999,
} as const;

export const typography = {
  display: "Archivo",
  body: "Instrument Sans",
  mono: "JetBrains Mono",
} as const;

export const motion = {
  fast: 140,
  standard: 220,
  ratingMoment: 600,
} as const;

export const nativeTokens = {
  colors,
  lightColors,
  darkColors,
  spacing,
  radii,
  typography,
  motion,
  minimumTarget: 44,
  proMinimumTarget: 56,
} as const;
