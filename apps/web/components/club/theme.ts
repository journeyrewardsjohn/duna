import type { PublicOrganizationStorefront } from "@duna/api";

/**
 * A club's saved theme (HQ Club setup → Identity, `operator.updateTheme`)
 * turned into the tokens its public pages use, inside the design system:
 *
 * - the club's colour is an accent, never the page: it fills the club's
 *   mark and card, draws the line under the club's links and tints quiet
 *   bands. As text it is contrast-guarded (WCAG 4.5:1) separately for the
 *   light ground (Salt, white cards) and the dark ground (Night Court and its
 *   surfaces), by mixing toward Night Court or Salt until it reads;
 * - a colour that would read as Solar (Duna's live colour) is toned down, so
 *   a club's brand can never say "live";
 * - card style (soft, crisp, borderless) and layout (editorial, immersive,
 *   compact) choose among designed variants; the logos, image tile and hero
 *   media are the club's own; its tagline and summary are shown as its words.
 *
 * The club's font choice is not loaded: club fonts never replace Duna chrome,
 * and the only face the Identity screen offers is a retired legacy face.
 * A club that has not published a theme gets Duna's defaults (`themed:
 * false`): no accent, a generated mark colour.
 */
export type StorefrontTheme = PublicOrganizationStorefront["theme"];

/** A club with no published theme (Duna's defaults; never shown as the club's). */
export const UNPUBLISHED_THEME: StorefrontTheme = {
  palette: {
    primary: "#517986",
    accent: "#BDD2D9",
    sand: "#E5F1F5",
    ink: "#2D4D57",
    canvas: "#F6F5F1",
    success: "#2F6B3A",
  },
  typography: { heading: "Satoshi", body: "Satoshi" },
  fontLicenseConfirmed: false,
  safeFallbackFont: "Arial, Helvetica, sans-serif",
  cardStyle: "soft",
  profileLayout: "editorial",
};

export interface ClubThemeView {
  readonly themed: boolean;
  /** The club's colour as a fill (`#RRGGBB`), Solar-guarded; null when unthemed. */
  readonly color: string | null;
  /** True when the submitted colour was toned down because it read as Solar. */
  readonly solarAdjusted: boolean;
  /** CSS custom properties for the page root (`--club-*`). */
  readonly style: Readonly<Record<`--club-${string}`, string>>;
  readonly cardStyle: "soft" | "crisp" | "borderless";
  readonly layout: "editorial" | "immersive" | "compact";
  readonly mark: {
    readonly logo?: string;
    readonly logoLight?: string;
    readonly logoDark?: string;
    readonly tile?: string;
  };
  readonly hero?: {
    readonly kind: "image" | "video";
    readonly url: string;
    readonly poster?: string;
  };
  /** The club's own words, shown as theirs. */
  readonly tagline?: string;
  readonly summary?: string;
  readonly displayName?: string;
  readonly membershipProgramName?: string;
}

interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export const NIGHT_COURT = "#0E1A22";
export const SALT = "#F4F2EC";
export const SOLAR = "#F2542D";
/** The grounds the accent sits on in each theme (tokens.ts values). */
const LIGHT_GROUNDS = [SALT, "#FFFFFF"] as const;
const DARK_GROUNDS = [NIGHT_COURT, "#17262F", "#1C2D38"] as const;
/** WCAG AA for body text. */
export const ACCENT_CONTRAST = 4.5;

export function parseHex(value: string | null | undefined): Rgb | null {
  const match = /^#?([\da-f]{6})$/i.exec(value?.trim() ?? "");
  if (!match) return null;
  const hex = match[1]!;
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

export function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b]
    .map((channel) =>
      Math.round(Math.min(255, Math.max(0, channel)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase()}`;
}

function luminance({ r, g, b }: Rgb): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** The WCAG contrast ratio of two colours (1 to 21). */
export function contrast(a: string, b: string): number {
  const left = parseHex(a);
  const right = parseHex(b);
  if (!left || !right) return 1;
  const [light, dark] = [luminance(left), luminance(right)].sort(
    (x, y) => y - x,
  ) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

function mix(from: Rgb, toward: Rgb, amount: number): Rgb {
  return {
    r: from.r + (toward.r - from.r) * amount,
    g: from.g + (toward.g - from.g) * amount,
    b: from.b + (toward.b - from.b) * amount,
  };
}

/**
 * The club colour as text on every ground in `grounds`: mixed toward
 * `toward` in 4% steps until each ground reaches `minimum`.
 */
export function guardedAccent(
  color: string,
  grounds: readonly string[],
  toward: string,
  minimum = ACCENT_CONTRAST,
): string {
  const start = parseHex(color);
  const target = parseHex(toward);
  if (!start || !target) return toward;
  for (let step = 0; step <= 25; step += 1) {
    const candidate = toHex(mix(start, target, step * 0.04));
    if (grounds.every((ground) => contrast(candidate, ground) >= minimum)) {
      return candidate;
    }
  }
  return toHex(target);
}

function hsl({ r, g, b }: Rgb) {
  const [red, green, blue] = [r / 255, g / 255, b / 255];
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { hue: 0, saturation: 0, lightness };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  const hue =
    max === red
      ? ((green - blue) / delta + (green < blue ? 6 : 0)) * 60
      : max === green
        ? ((blue - red) / delta + 2) * 60
        : ((red - green) / delta + 4) * 60;
  return { hue, saturation, lightness };
}

/** Whether a colour would read as Solar: a saturated red-orange. */
export function readsAsSolar(color: string): boolean {
  const rgb = parseHex(color);
  if (!rgb) return false;
  const { hue, saturation, lightness } = hsl(rgb);
  return (
    hue >= 0 &&
    hue <= 30 &&
    saturation >= 0.6 &&
    lightness >= 0.4 &&
    lightness <= 0.72
  );
}

/** The club's fill colour: its own, toned toward Night Court if it reads as Solar. */
export function clubFill(color: string): {
  readonly fill: string;
  readonly solarAdjusted: boolean;
} {
  const rgb = parseHex(color);
  if (!rgb) return { fill: NIGHT_COURT, solarAdjusted: false };
  if (!readsAsSolar(color)) return { fill: toHex(rgb), solarAdjusted: false };
  return {
    fill: toHex(mix(rgb, parseHex(NIGHT_COURT)!, 0.45)),
    solarAdjusted: true,
  };
}

/** Salt or Night Court, whichever reads better on the fill. */
export function onFill(fill: string): string {
  return contrast(fill, SALT) >= contrast(fill, NIGHT_COURT)
    ? SALT
    : NIGHT_COURT;
}

/** Theme → tokens, with the contrast guard. */
export function clubThemeView(
  theme: StorefrontTheme | undefined,
): ClubThemeView {
  const themed = Boolean(theme?.publishedAt);
  const cardStyle =
    themed && theme?.cardStyle ? theme.cardStyle : ("soft" as const);
  const layout =
    themed &&
    (theme?.profileLayout === "immersive" || theme?.profileLayout === "compact")
      ? theme.profileLayout
      : ("editorial" as const);
  const words = {
    ...(themed && theme?.tagline?.trim()
      ? { tagline: theme.tagline.trim() }
      : {}),
    ...(themed && theme?.profileSummary?.trim()
      ? { summary: theme.profileSummary.trim() }
      : {}),
    ...(themed && theme?.brandDisplayName?.trim()
      ? { displayName: theme.brandDisplayName.trim() }
      : {}),
    ...(themed && theme?.membershipProgramName?.trim()
      ? { membershipProgramName: theme.membershipProgramName.trim() }
      : {}),
  };
  const mark = themed
    ? {
        ...(theme?.logoUrl ? { logo: theme.logoUrl } : {}),
        ...(theme?.logoLightUrl ? { logoLight: theme.logoLightUrl } : {}),
        ...(theme?.logoDarkUrl ? { logoDark: theme.logoDarkUrl } : {}),
        ...(theme?.markUrl ? { tile: theme.markUrl } : {}),
      }
    : {};
  const hero =
    themed &&
    theme?.heroMediaUrl &&
    (theme.heroMediaType === "image" || theme.heroMediaType === "video")
      ? {
          kind: theme.heroMediaType,
          url: theme.heroMediaUrl,
          ...(theme.heroPosterUrl ? { poster: theme.heroPosterUrl } : {}),
        }
      : undefined;
  const submitted = themed ? parseHex(theme?.palette.primary) : null;
  if (!submitted) {
    return {
      themed,
      color: null,
      solarAdjusted: false,
      style: {},
      cardStyle,
      layout,
      mark,
      ...(hero ? { hero } : {}),
      ...words,
    };
  }
  const { fill, solarAdjusted } = clubFill(toHex(submitted));
  return {
    themed,
    color: fill,
    solarAdjusted,
    style: {
      "--club-fill": fill,
      "--club-on-fill": onFill(fill),
      "--club-accent-light": guardedAccent(fill, LIGHT_GROUNDS, NIGHT_COURT),
      "--club-accent-dark": guardedAccent(fill, DARK_GROUNDS, SALT),
    },
    cardStyle,
    layout,
    mark,
    ...(hero ? { hero } : {}),
    ...words,
  };
}
