import type { SurfaceContract } from "./types";

/**
 * Public web (`apps/web` marketing, discovery, events, rankings, pro tour).
 * Owners: P2 (chrome and marketing pages), F6a–d (cascade), P3/P4 for
 * discovery and club pages.
 */
const legacy = "legacy: delete when the public web migrates (P2/F6a)" as const;

export const publicWeb: SurfaceContract = {
  surface: "public",
  owners: "P2, F6a–d, P3, P4",
  migrated: [],
  checks: [
    { kind: "noFontPackages", app: "web" },
    // Audience routes and canonical URLs are behaviour (AGENTS.md), not legacy.
    {
      kind: "includes",
      file: "apps/web/app/page.tsx",
      values: ['audience="clubs"', 'canonical: "/"'],
    },
    {
      kind: "includes",
      file: "apps/web/app/players/page.tsx",
      values: ['audience="players"', 'canonical: "/players"'],
    },
    {
      kind: "includes",
      file: "apps/web/components/site-audience-header.tsx",
      values: [
        "For Clubs",
        "For Players",
        'aria-label="Choose your Duna experience"',
      ],
    },
    {
      kind: "includes",
      file: "apps/web/components/audience-home.tsx",
      values: [
        'data-zone="editorial"',
        'id="features"',
        "clubFeatureGroups",
        "SiteFooter",
      ],
      legacy,
    },
    {
      kind: "maxBytes",
      path: "apps/web/public/media/brand/duna-home-hero-motion-v1.mp4",
      bytes: 6 * 1024 * 1024,
      message: "The ambient hero motion plate must stay below 6 MiB",
    },
    ...[
      "apps/web/app/design-v3.css",
      "apps/web/app/design-v4.css",
      "apps/web/app/homepage.module.css",
      "apps/web/app/not-found.tsx",
      "apps/web/components/home-sand-world.tsx",
      "apps/web/public/brand/duna-mark.svg",
      "apps/web/public/media/brand/imagery-log.json",
      "apps/web/public/media/brand/duna-home-hero-motion-v1.mp4",
      "apps/web/public/media/brand/duna-home-rally-v3.avif",
      "apps/web/public/media/brand/duna-home-rally-v3.webp",
      "apps/web/public/media/brand/duna-pro-hero-v3.avif",
      "apps/web/public/media/brand/duna-pro-hero-v3.webp",
      "apps/web/public/media/brand/duna-event-venue-hamburg-v1.avif",
      "apps/web/public/media/brand/duna-event-venue-hamburg-v1.webp",
    ].map((path) => ({ kind: "exists", path, legacy }) as const),
    {
      kind: "includes",
      file: "apps/web/app/design-v4.css",
      values: [
        // F2b points the public palette at Duna Design System roles.
        "--duna-web-snow: var(--td-ground)",
        "--duna-web-charcoal: var(--td-text)",
        "--duna-web-navy: var(--td-action)",
        "--duna-web-sky: var(--td-info-wash)",
        "--duna-web-blush: var(--td-energy)",
        "--duna-web-radius-band: 48px",
        "--duna-web-font-mono: var(",
      ],
      legacy,
    },
    {
      kind: "includes",
      file: "apps/web/app/layout.tsx",
      values: [
        'import { dunaFontClassName } from "./fonts"',
        "dunaFontClassName",
      ],
      message:
        "apps/web/app/layout.tsx must load Jost, Geist and Geist Mono through the brand font module (app/fonts.ts)",
    },
    {
      kind: "includes",
      file: "apps/web/app/fonts.ts",
      values: [
        "next/font/google",
        "Jost({",
        "Geist({",
        "Geist_Mono({",
        '"--td-font-brand"',
        '"--td-font-ui"',
        '"--td-font-mono"',
        'weight: "500"',
        'display: "swap"',
      ],
      message:
        "apps/web/app/fonts.ts must expose Jost 500, Geist and Geist Mono as the Tideline font variables",
    },
    {
      kind: "includes",
      file: "apps/web/app/design-v3.css",
      values: [
        "--campaign-hero-ink",
        ':root[data-theme="dark"] .pro-tour-hero__veil',
        ".athlete-hero-card--result .duna-badge",
        ".athlete-stage > .athlete-stat-deck article > small",
        ".duna-numeric:not(.match-history-card__sets)",
        ".club-marketing-secondary",
        ".event-public__booking > a:not(.secondary)",
        ".not-found-v3",
        ".athlete-hero-card--result .duna-badge {\n  color: var(--text-2);",
      ],
      legacy,
    },
    {
      kind: "cssRule",
      file: "apps/web/app/design-v3.css",
      selector: ".duna-numeric[data-numeric-tier].duna-numeric--monument",
      values: [
        'font-feature-settings: "pnum" 1',
        "font-variant-numeric: proportional-nums",
      ],
      message:
        "apps/web/app/design-v3.css must override the tabular base with proportional Monument spacing",
      legacy,
    },
    {
      kind: "cssRule",
      file: "apps/web/app/design-v3.css",
      selector: ".pro-live-stats__metric > .duna-numeric--block",
      values: ["font-size: clamp(2rem, 2vw, 2.25rem)"],
      legacy,
    },
    {
      kind: "cssRule",
      file: "apps/web/app/design-v3.css",
      selector: ".pro-live-stats__player dd .duna-numeric--block",
      values: ["font-size: clamp(2rem, 1.8vw, 2.125rem)"],
      legacy,
    },
    {
      kind: "includes",
      file: "apps/web/app/globals.css",
      values: [
        ".pro-live-scoreboard__team--winner .pro-live-scoreboard__match-points {\n  background: color-mix(in srgb, var(--gain) 14%, var(--surface-2));\n  color: var(--text-1);",
        "font-size: clamp(2rem, 3vw, 2.875rem);",
        ".campaign-operator__metric--hero strong .duna-numeric {",
        ".rating-orbit--compact .rating-orbit__content > .duna-numeric {",
      ],
      legacy,
    },
    ...[".rankings-v2__list-header > span", ".rankings-list-header > span"].map(
      (selector) =>
        ({
          kind: "cssRule",
          file: "apps/web/app/globals.css",
          selector,
          values: ["font-size: 0.8125rem"],
          message: `apps/web/app/globals.css must keep ${selector} at the 13px Table minimum`,
          legacy,
        }) as const,
    ),
    {
      kind: "includes",
      file: "apps/web/components/pro-live-match-scoreboard.tsx",
      values: [
        '<Numeric tier="block">{stat.total}</Numeric>',
        '<Numeric tier="block">{stat.a}</Numeric>',
        '<Numeric tier="block">{stat.b}</Numeric>',
        'tier="score"',
      ],
      legacy: "legacy: delete when live scores move to NetScore (P8)",
    },
    {
      kind: "includes",
      file: "apps/web/components/pro-match-detail.tsx",
      values: ["match.liveScore?.status ?? match.status"],
      message:
        "pro-match-detail must derive its live state from the live score feed",
      legacy:
        "legacy: delete when live scores move to NetScore (P8); keep the behaviour in a test",
    },
    {
      kind: "includes",
      file: "apps/web/components/pro-player-discovery.tsx",
      values: ['tier="monument"'],
      legacy,
    },
    {
      kind: "includes",
      file: "apps/web/app/rankings/page.tsx",
      values: ['<Numeric tier="monument">#{row.rank}</Numeric>'],
      legacy,
    },
    {
      kind: "includes",
      file: "apps/web/app/players/[handle]/page.tsx",
      values: ['className="athlete-hero__rank-mark"'],
      legacy,
    },
    {
      kind: "includes",
      file: "apps/web/components/rating-orbit.tsx",
      values: ['tier={compact ? "block" : "hero"}'],
      legacy: "legacy: delete when the Sand Rating moves to RatingRing (C1/P8)",
    },
    {
      kind: "excludes",
      file: "apps/web/components/pro-event-detail.tsx",
      values: ["pro-event-venue-plate"],
      message:
        "pro-event-detail must not restore the decorative full-page venue plate",
    },
    {
      kind: "excludes",
      file: "apps/web/app/app/page.tsx",
      values: ["duna-campaign-rally"],
      message:
        "apps/web/app/app/page.tsx must not restore the decorative campaign hero",
    },
  ],
};
