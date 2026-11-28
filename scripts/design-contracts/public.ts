import type { SurfaceContract } from "./types";

/**
 * Public web (`apps/web` marketing, discovery, events, rankings, pro tour).
 * Owners: P2 (chrome and marketing pages), F6a–d (cascade), P3/P4 for
 * discovery and club pages.
 */
export const publicWeb: SurfaceContract = {
  surface: "public",
  owners: "P2, F6a–d, P3, P4",
  migrated: [],
  checks: [
    { kind: "noFontPackages", app: "web" },
    // Audience routes and canonical URLs are behaviour (AGENTS.md).
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
      kind: "maxBytes",
      path: "apps/web/public/media/brand/duna-home-hero-motion-v1.mp4",
      bytes: 6 * 1024 * 1024,
      message: "The ambient hero motion plate must stay below 6 MiB",
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
        '"--duna-font-brand"',
        '"--duna-font-ui"',
        '"--duna-font-mono"',
        'weight: "500"',
        'display: "swap"',
      ],
      message:
        "apps/web/app/fonts.ts must expose Jost 500, Geist and Geist Mono as the --duna-font-* variables the Tideline font tokens read",
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
