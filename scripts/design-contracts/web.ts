import type { SurfaceContract } from "./types";

/** Legacy sheets that no design-system document may import (mirrors public.ts). */
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
  ".module.css",
];

/**
 * Signed-in Player web. Rebuilt pages live in `apps/web/app/(next)/(app)`
 * with the shell in `components/app-shell` (docs/design/player-web-shell.md);
 * pages not rebuilt yet stay in `app/(legacy)/app/**`. Owners: P1, P3–P9.
 */
export const web: SurfaceContract = {
  surface: "web",
  owners: "P1, P3, P4, P5, P6, P7, P8, P9",
  migrated: [
    "apps/web/app/(next)/(app)/",
    "apps/web/components/app-shell/",
    "apps/web/lib/app-routes.ts",
    // Find a game (SITE-4): /discover, /venues/[id] and the /app twins.
    "apps/web/components/discover/",
  ],
  checks: [
    // Find a game (SITE-4): the search, results, map and venue pages moved to
    // app/(next) and share components/discover; the old pages are deleted.
    ...[
      "apps/web/app/(legacy)/discover/page.tsx",
      "apps/web/app/(legacy)/venues/[venueId]/page.tsx",
      "apps/web/app/(legacy)/app/discover/page.tsx",
      "apps/web/app/(legacy)/app/venues/[venueId]/page.tsx",
      "apps/web/components/discovery-experience.tsx",
      "apps/web/components/court-booking-panel.tsx",
      "apps/web/components/venue-layout-viewer.tsx",
    ].map(
      (path) =>
        ({
          kind: "absent",
          path,
          message:
            "Find a game lives in app/(next) on components/discover (SITE-4); the old page is deleted",
        }) as const,
    ),
    {
      kind: "treeExcludes",
      root: "apps/web/components/discover",
      values: [...legacySheets, "lucide-react"],
      message:
        "Find a game renders in app/(next): design-system parts only (the map provider's own sheet loads with the map in map-vendor.ts)",
    },
    {
      kind: "includes",
      file: "apps/web/components/discover/results.ts",
      values: ["participationDisplay", "renderParticipationCopy"],
      message:
        "Find a game shows the group state in the shared participation words",
    },
    // The rebuilt Player web app (P1): the shell, Home and the route table.
    {
      kind: "absent",
      path: "apps/web/app/(legacy)/app/page.tsx",
      message:
        "Player web Home lives in app/(next)/(app)/app/page.tsx; the old Home is deleted",
    },
    {
      kind: "absent",
      path: "apps/web/app/(legacy)/app/player-dashboard.module.css",
    },
    {
      kind: "treeExcludes",
      root: "apps/web/app/(next)/(app)",
      values: legacySheets,
      message:
        "app/(next)/(app) imports only the design system (docs/plan/legacy-styles.md)",
    },
    {
      kind: "treeExcludes",
      root: "apps/web/components/app-shell",
      values: [...legacySheets, "lucide-react", "@duna/ui/theme-toggle"],
      message:
        "The Player web shell renders in app/(next): design-system parts and @duna/ui/icons only",
    },
    {
      kind: "excludes",
      file: "apps/web/app/(next)/(app)/app-shell.css",
      values: ["@import", "!important"],
      message:
        "app-shell.css is the app's own token-based sheet: no imports, no !important",
    },
    {
      kind: "includes",
      file: "apps/web/app/(next)/(app)/layout.tsx",
      values: ['import "./app-shell.css"', "<AppShell", "SignedOutRedirect"],
      message:
        "Every rebuilt /app page gets the Player shell, and signed out it sends the person to sign in",
    },
    {
      kind: "includes",
      file: "apps/web/components/app-shell/app-shell.tsx",
      values: [
        'href="#main"',
        'aria-label="Duna Player"',
        'aria-label="Main"',
        "<CommandPalette",
        "<PageTransition",
        "<AskDunaSheet",
        "<PersonMenu",
        "<ActingForBand",
      ],
      message:
        "The Player shell keeps its skip link, rail, phone bar, command palette, page transition, Ask Duna, person menu and acting-for band",
    },
    {
      kind: "includes",
      file: "apps/web/lib/app-routes.ts",
      values: [
        'title: "Find"',
        'title: "Play"',
        'title: "Improve"',
        'title: "Connect"',
      ],
      message: "Player web navigation uses the four verbs (contract R15)",
    },
    {
      kind: "includes",
      file: "apps/web/components/app-shell/person-menu.tsx",
      values: ["Create new organisation", "Whose account", "Sign out of Duna?"],
      message:
        "The person menu keeps the club switcher with Create new organisation, the acting-for switch and a confirmed sign out (contract R21)",
    },
    {
      kind: "includes",
      file: "apps/web/components/app-shell/home/home-model.ts",
      values: ["inFuture(", "renderParticipationCopy"],
      message:
        "Home's Next up is future-only and group-session words come from the shared copy table",
    },
    {
      kind: "excludes",
      file: "apps/web/components/event-card.tsx",
      values: ["event-card__court-lines"],
      message: "event-card must not restore synthetic court artwork",
    },
    {
      kind: "excludes",
      file: "apps/web/app/(legacy)/app/pickup/[slug]/edit/page.tsx",
      values: ["SiteHeader"],
      message:
        "The pickup editor must not nest the public SiteHeader inside PlayerShell",
    },
    {
      kind: "includes",
      file: "apps/web/components/pickup-edit-form.tsx",
      values: [
        "Player preview",
        "locationConfidence",
        "Core details lock",
        "Choose a future start time",
      ],
      legacy:
        "legacy: delete when pickup hosting migrates (keep the guided steps in a test)",
    },
    ...[
      "apps/web/app/qa-font-system/page.tsx",
      "apps/web/app/qa-font-system/directory/page.tsx",
      "apps/web/app/(legacy)/qa-font-system/page.tsx",
      "apps/web/app/(next)/qa-font-system/page.tsx",
    ].map(
      (path) =>
        ({
          kind: "absent",
          path,
          message: "Temporary font-system browser fixtures must not ship",
        }) as const,
    ),
  ],
};
