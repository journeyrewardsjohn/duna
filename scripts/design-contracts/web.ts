import type { SurfaceContract } from "./types";

/** Signed-in Player web (`apps/web/app/app/**` and its components). Owners: P1, P3–P9. */
const legacy = "legacy: delete when Player web migrates (P1/P3–P9)" as const;

export const web: SurfaceContract = {
  surface: "web",
  owners: "P1, P3, P4, P5, P6, P7, P8, P9",
  migrated: [],
  checks: [
    ...[
      "apps/web/app/app/player-dashboard.module.css",
      "apps/web/components/pickup-edit-form.module.css",
    ].map((path) => ({ kind: "exists", path, legacy }) as const),
    {
      kind: "includes",
      file: "apps/web/app/app/page.tsx",
      values: [
        "futureBookings",
        "nextPersonalEvent",
        "defaultEventMedia",
        "new Date(event.startsAt).getTime() >= now",
        "new Date(booking.startsAt).getTime() >= now",
        'aria-label="Player quick actions"',
      ],
      message:
        "Player web Home must keep future-only Next up and quick actions (re-assert the behaviour in a test when this migrates)",
      legacy: "legacy: delete when Player web Home migrates (P1)",
    },
    {
      kind: "includes",
      file: "apps/web/components/event-card.tsx",
      values: ["defaultEventMedia", "event.media?.find"],
      legacy,
    },
    {
      kind: "excludes",
      file: "apps/web/components/event-card.tsx",
      values: ["event-card__court-lines"],
      message: "event-card must not restore synthetic court artwork",
    },
    {
      kind: "excludes",
      file: "apps/web/app/app/pickup/[slug]/edit/page.tsx",
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
