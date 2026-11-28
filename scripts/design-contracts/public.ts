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
  ],
};
