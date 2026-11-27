import { resolveDunaMobileTokens } from "@duna/ui/mobile";

const lightMobileTokens = resolveDunaMobileTokens("light", "editorial");

const lightColors = {
  canvas: lightMobileTokens.ground,
  ink: "#090909",
  depth: lightMobileTokens.surface1,
  navy: lightMobileTokens.inactiveFill,
  navyLift: lightMobileTokens.surface2,
  bone: "#090909",
  muted: "#767773",
  aqua: "#103a63",
  aquaDeep: "#092b4d",
  sand: "#d8b47a",
  flare: "#e8683a",
  resultWin: "#efe5ce",
  resultWinBorder: "#d7bd84",
  resultLoss: "#b5ccd3",
  resultLossBorder: "#87aab5",
  signal: "#c8f04a",
  signalInk: "#17200d",
  positive: "#2f6b3a",
  warning: "#8a6a2f",
  danger: "#9a4a2e",
  onAccent: "#ffffff",
  white: "#ffffff",
  overlayRgb: "9,9,9",
  accentRgb: "16,58,99",
  warningRgb: "138,106,47",
  positiveRgb: "47,107,58",
  dangerRgb: "154,74,46",
  flareRgb: "232,104,58",
  inkRgb: "9,9,9",
  depthRgb: "255,255,255",
  navyRgb: "244,244,242",
  boneRgb: "9,9,9",
  whiteRgb: "255,255,255",
} as const;

type Palette = {
  readonly [Key in keyof typeof lightColors]: string;
};

export type ThemeName = "light" | "dark";
export const colors: Palette = lightColors;

export function rgba(rgb: string, alpha: number) {
  return `rgba(${rgb},${alpha})`;
}
