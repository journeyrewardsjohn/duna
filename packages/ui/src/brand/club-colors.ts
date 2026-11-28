export const hqColors = {
  tint: "#E8F2D4",
  core: "#A9C463",
  ink: "#3F5417",
  deep: "#1E2A0E",
} as const;

export const playerAccents = [
  { id: "dune-gold", label: "Dune gold", color: "#B88A37" },
  { id: "marine", label: "Marine", color: "#527A87" },
  { id: "deep-coral", label: "Deep coral", color: "#B85E49" },
  { id: "moss", label: "Moss", color: "#687A46" },
  { id: "terracotta", label: "Terracotta", color: "#A86143" },
  { id: "slate-blue", label: "Slate blue", color: "#65758B" },
  { id: "ochre", label: "Ochre", color: "#A77A2D" },
  { id: "plum", label: "Plum", color: "#785B72" },
  { id: "sea-green", label: "Sea green", color: "#4F786A" },
  { id: "ink", label: "Ink", color: "#343431" },
] as const;

export type PlayerAccentId = (typeof playerAccents)[number]["id"];

type Oklab = {
  readonly l: number;
  readonly a: number;
  readonly b: number;
};

export type ClubColorSystem = {
  readonly submitted: string;
  readonly hue: number;
  readonly chroma: number;
  readonly tint: string;
  readonly edge: string;
  readonly core: string;
  readonly ink: string;
  readonly conflictsWithFlare: boolean;
};

const flareLab = hexToOklab("#E8683A");

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function channelFromHex(value: string): number {
  return Number.parseInt(value, 16) / 255;
}

function linearize(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function delinearize(value: number): number {
  const clamped = clamp(value, 0, 1);
  return clamped <= 0.0031308
    ? clamped * 12.92
    : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

function normalizedHex(value: string): string {
  const compact = value.trim().replace(/^#/, "");
  if (/^[\da-f]{3}$/i.test(compact)) {
    return `#${compact
      .split("")
      .map((character) => `${character}${character}`)
      .join("")
      .toUpperCase()}`;
  }
  if (/^[\da-f]{6}$/i.test(compact)) return `#${compact.toUpperCase()}`;
  return "#527A87";
}

function hexToOklab(value: string): Oklab {
  const hex = normalizedHex(value);
  const red = linearize(channelFromHex(hex.slice(1, 3)));
  const green = linearize(channelFromHex(hex.slice(3, 5)));
  const blue = linearize(channelFromHex(hex.slice(5, 7)));
  const l = Math.cbrt(
    0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue,
  );
  const m = Math.cbrt(
    0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue,
  );
  const s = Math.cbrt(
    0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue,
  );
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function oklchToHex(lightness: number, chroma: number, hue: number): string {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  const red = delinearize(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
  );
  const green = delinearize(
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
  );
  const blue = delinearize(
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  );
  return `#${[red, green, blue]
    .map((channel) =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase()}`;
}

function deltaE(left: Oklab, right: Oklab): number {
  return Math.hypot(left.l - right.l, left.a - right.a, left.b - right.b) * 100;
}

export function normalizeClubColor(value: string): ClubColorSystem {
  const submitted = normalizedHex(value);
  const lab = hexToOklab(submitted);
  const rawChroma = Math.hypot(lab.a, lab.b);
  const rawHue =
    rawChroma < 0.0001
      ? 82
      : ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360;
  const hue = Number(rawHue.toFixed(2));
  const chroma = Number(clamp(rawChroma, 0.04, 0.15).toFixed(4));
  return {
    submitted,
    hue,
    chroma,
    tint: oklchToHex(0.95, chroma * 0.28, hue),
    edge: oklchToHex(0.85, chroma * 0.5, hue),
    core: oklchToHex(0.55, chroma, hue),
    ink: oklchToHex(0.4, chroma * 0.85, hue),
    conflictsWithFlare: deltaE(lab, flareLab) < 6,
  };
}

export function clubColorCssVariables(
  value: string,
): Readonly<
  Record<`--club-${"h" | "c" | "tint" | "edge" | "core" | "ink"}`, string>
> {
  const color = normalizeClubColor(value);
  return {
    "--club-h": String(color.hue),
    "--club-c": String(color.chroma),
    "--club-tint": color.tint,
    "--club-edge": color.edge,
    "--club-core": color.core,
    "--club-ink": color.ink,
  };
}
