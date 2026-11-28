import type { SurfaceContract } from "./types";

/** Legacy sheets that no design-system document may import. */
const legacySheets = [
  "@duna/ui/styles.css",
  "@duna/ui/public-website.css",
  "@duna/ui/player-workspace.css",
  "@duna/ui/hq-workspace.css",
  "globals.css",
  "design-v3.css",
  "design-v4.css",
  "public-website.css",
  "player-focus.css",
  "legacy-bridge",
  "flag-icons/css",
  "mapbox-gl/dist/mapbox-gl.css",
  ".module.css",
];

/**
 * Public web (`apps/web` marketing, discovery, events, rankings, pro tour).
 * Owners: SITE-1…SITE-10 (the rebuilt site in `app/(next)`), P3/P4 for
 * discovery and club pages until they move.
 *
 * The web app has two root layouts (docs/design/web-shell.md):
 * `app/(next)` for pages on the design system, `app/(legacy)` for pages not
 * rebuilt yet. Separate documents, separate CSS.
 */
export const publicWeb: SurfaceContract = {
  surface: "public",
  owners: "SITE-1…SITE-10, P3, P4",
  // The rebuilt public site: the (next) root layout, the site shell and
  // home page, and the legal center (L2, moved into the shell by SITE-1).
  migrated: [
    "apps/web/app/(next)/",
    "apps/web/components/site/",
    "apps/web/components/legal/",
  ],
  checks: [
    ...[
      "apps/web/app/(next)/layout.tsx",
      "apps/web/app/(legacy)/layout.tsx",
    ].map((file) => ({
      kind: "includes" as const,
      file,
      values: [
        'import { dunaFontClassName } from "../fonts"',
        "dunaFontClassName",
      ],
      message: `${file} must load Jost, Geist and Geist Mono through the brand font module (app/fonts.ts)`,
    })),
    {
      kind: "includes",
      file: "apps/web/app/(next)/layout.tsx",
      values: [
        'import "@duna/ui/tideline/styles.css"',
        'import "./site.css"',
        'className="td site"',
        "siteBootScript",
      ],
      message:
        "apps/web/app/(next)/layout.tsx must be a design-system document: the Tideline styles, the site's token sheet, the .td body and the theme boot script",
    },
    {
      // Nothing under app/(next), the site components or the legal center
      // may bring a legacy sheet into a rebuilt page.
      kind: "treeExcludes",
      root: "apps/web/app/(next)",
      values: legacySheets,
      message:
        "app/(next) imports only the design system (docs/plan/legacy-styles.md)",
    },
    ...["apps/web/components/site", "apps/web/components/legal"].map(
      (root) => ({
        kind: "treeExcludes" as const,
        root,
        values: legacySheets,
        message: `${root} renders in app/(next): no legacy sheet`,
      }),
    ),
    ...[
      "apps/web/app/global-error.tsx",
      "apps/web/app/global-not-found.tsx",
    ].map((file) => ({
      kind: "excludes" as const,
      file,
      values: legacySheets,
      message: `${file} loads with app/(next) pages, so it imports only the design system`,
    })),
    {
      kind: "excludes",
      file: "apps/web/app/(next)/site.css",
      values: ["@import", "!important"],
      message:
        "apps/web/app/(next)/site.css is the site's own token-based sheet: no imports, no !important",
    },
    { kind: "absent", path: "apps/web/app/layout.tsx" },
    { kind: "absent", path: "apps/web/app/page.tsx" },
    {
      kind: "includes",
      file: "apps/web/app/(next)/(site)/legal/layout.tsx",
      values: ["<Rise", "<LegalScope>"],
      message:
        "The legal center keeps its first-paint Rise and Tideline scope inside the site shell",
    },
    {
      kind: "includes",
      file: "apps/web/components/site/site-shell.tsx",
      values: ['href="#main"', "<SiteHeader", "<SiteFooter", "<ThumbBar"],
      message:
        "The site shell keeps its skip link, header, footer and phone thumb bar",
    },
    {
      kind: "includes",
      file: "apps/web/components/site/site-header.tsx",
      values: ['aria-label="I am here to"', "I play", "I run a club"],
      message:
        "The header keeps the audience switch (it changes the call to action only)",
    },
    {
      kind: "includes",
      file: "apps/web/app/(next)/(site)/page.tsx",
      values: ['canonical: "/"', "SearchAction"],
      message:
        "The home page keeps its canonical address and site search action",
    },
    // SITE-2: the marketing pages moved out of (legacy), at the same
    // addresses, each with its canonical URL and its Markdown companion.
    ...(
      [
        ["run-your-club", "/run-your-club"],
        ["coaches", "/coaches"],
        ["pricing", "/pricing"],
        ["apps", "/apps"],
        ["sand-rating", "/sand-rating"],
        ["pro", "/pro"],
      ] as const
    ).map(([folder, path]) => ({
      kind: "includes" as const,
      file: `apps/web/app/(next)/(site)/${folder}/page.tsx`,
      values: [`canonical: "${path}"`, `"${path}.md"`, 'import "../pages.css"'],
      message: `${path} lives in the new shell with its canonical address and Markdown companion`,
    })),
    ...[
      "apps/web/app/(legacy)/run-your-club/page.tsx",
      "apps/web/app/(legacy)/run-your-club/training/page.tsx",
      "apps/web/app/(legacy)/run-your-club/training-os/page.tsx",
      "apps/web/app/(legacy)/run-your-club/features/page.tsx",
      "apps/web/app/(legacy)/pro/page.tsx",
      "apps/web/app/(legacy)/pro/teams/[teamNo]/page.tsx",
      "apps/web/app/(legacy)/pro/onboarding-complete/page.tsx",
      "apps/web/app/(legacy)/methodology/page.tsx",
      "apps/web/app/(legacy)/apps/apple-watch/page.tsx",
      "apps/web/components/run-your-business-page.tsx",
      "apps/web/components/training-os-page.tsx",
      "apps/web/components/watch-marketing-page.tsx",
      "apps/web/components/pro-tour-browser.tsx",
      "apps/web/components/pro-player-discovery.tsx",
      "apps/web/components/rating-backtest-chart.tsx",
    ].map((path) => ({ kind: "absent" as const, path })),
    {
      kind: "includes",
      file: "apps/web/app/(next)/(site)/pro/teams/[teamNo]/page.tsx",
      values: ["professionalTeamJsonLd", "`/pro/teams/${team.teamNo}`"],
      message:
        "Pro Tour team pages keep their address, JSON-LD and Markdown companion",
    },
    {
      // Prices on the site come from the plan tables, never typed in.
      kind: "includes",
      file: "apps/web/components/site/pricing/pricing-data.ts",
      values: [
        "ORGANIZATION_PLANS",
        "MEMBERSHIP_PLANS",
        "DUNA_SERVICE_FEE_BPS",
        "quoteCheckoutFees",
      ],
      message:
        "Pricing figures derive from @duna/core and @duna/pricing (docs/design/website.md §2.8)",
    },
    {
      kind: "excludes",
      file: "apps/web/app/(next)/(site)/pages.css",
      values: ["@import", "!important"],
      message:
        "apps/web/app/(next)/(site)/pages.css is token-based: no imports, no !important",
    },
    {
      kind: "includes",
      file: "apps/web/proxy.ts",
      values: [
        '"/methodology": "/sand-rating#method"',
        '"/run-your-club/training": "/coaches#plan"',
        '"/apps/apple-watch": "/apps#watch"',
      ],
      message:
        "Moved public pages answer with a 301 to their new home (docs/design/website.md §2.2)",
    },
    {
      kind: "includes",
      file: "apps/web/components/legal/legal-document-view.tsx",
      values: [
        "DocumentSectionList",
        "SectionHeading",
        'className="td-display lc-doc__title"',
        "<DraftNotice",
      ],
      message:
        "Legal documents keep one Jost title, the section list, linkable headings and the draft notice",
    },
    {
      kind: "includes",
      file: "apps/web/components/legal/legal-status.tsx",
      values: ['"Draft for review. Not yet in effect."'],
    },
    {
      kind: "includes",
      file: "apps/web/components/legal/legal-blocks.tsx",
      values: ["To be confirmed"],
      message:
        "A placeholder in a legal draft must render as “To be confirmed”",
    },
    { kind: "noFontPackages", app: "web" },
    {
      kind: "maxBytes",
      path: "apps/web/public/site/coach-portrait.webp",
      bytes: 250 * 1024,
      message:
        "apps/web/public/site/coach-portrait.webp is a single WebP source under 250 KB (next/image serves the widths)",
    },
    ...[
      "apps/web/public/site/hero-loop.mp4",
      "apps/web/public/site/attack-loop.mp4",
    ].map((path) => ({
      kind: "maxBytes" as const,
      path,
      bytes: 500 * 1024,
      message: `${path} must stay under 500 KB (docs/design/website.md §6)`,
    })),
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
      file: "apps/web/app/(legacy)/app/page.tsx",
      values: ["duna-campaign-rally"],
      message:
        "apps/web/app/(legacy)/app/page.tsx must not restore the decorative campaign hero",
    },
  ],
};
