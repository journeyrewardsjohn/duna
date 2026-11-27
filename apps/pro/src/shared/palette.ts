export const lightColors = {
  canvas: "#eef4f8",
  ink: "#173b65",
  depth: "#ffffff",
  navy: "#d8e8f2",
  navyLift: "#f4f8fb",
  bone: "#173b65",
  muted: "#687b8e",
  aqua: "#214b7a",
  aquaDeep: "#173b65",
  sand: "#d6a874",
  flare: "#f0a06d",
  positive: "#3c7a5b",
  warning: "#d9955f",
  danger: "#a64b43",
  onAccent: "#ffffff",
  overlayRgb: "23,59,101",
  accentRgb: "33,75,122",
  warningRgb: "217,149,95",
  positiveRgb: "60,122,91",
  dangerRgb: "166,75,67",
  flareRgb: "240,160,109",
  inkRgb: "23,59,101",
  depthRgb: "255,255,255",
} as const;

export type Palette = {
  readonly [Key in keyof typeof lightColors]: string;
};

export const darkColors: Palette = {
  canvas: "#0d1114",
  ink: "#0d1114",
  depth: "#141a1e",
  navy: "#101a20",
  navyLift: "#1b2429",
  bone: "#edf1f2",
  muted: "#a9b4b8",
  aqua: "#b5ccd3",
  aquaDeep: "#8fb0bc",
  sand: "#d4b77c",
  flare: "#f4794c",
  positive: "#6bae78",
  warning: "#d4b77c",
  danger: "#c4785c",
  onAccent: "#0d1114",
  overlayRgb: "237,241,242",
  accentRgb: "181,204,211",
  warningRgb: "212,183,124",
  positiveRgb: "107,174,120",
  dangerRgb: "196,120,92",
  flareRgb: "244,121,76",
  inkRgb: "13,17,20",
  depthRgb: "20,26,30",
};

export type ThemeName = "light" | "dark";

export type ThemePreference = ThemeName | "system";

let activePalette: Palette = lightColors;

export function setActivePalette(palette: Palette) {
  activePalette = palette;
}

export const colors = new Proxy(lightColors, {
  get(_target, property: keyof Palette) {
    return activePalette[property];
  },
}) as Palette;

export function rgba(rgb: string, alpha: number) {
  return `rgba(${rgb},${alpha})`;
}
