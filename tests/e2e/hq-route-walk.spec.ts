import { expect, test, type Page } from "@playwright/test";
import {
  hqLeaguesPath,
  hqRoutes,
  isHqDevOnlyRoute,
} from "../../packages/core/src/hq-routes";
import { knownIssues } from "./personas/support/known-issues";
import { formatIssues, QualityMonitor } from "./personas/support/quality";

// Fixed demo-adapter record ids (not secrets; absent from connected data).
const venue = "10000000-0000-4000-8000-000000000101";
const court = "10000000-0000-4000-8000-000000000103";
const clinic = "10000000-0000-4000-8000-000000000301";
const tournament = "10000000-0000-4000-8000-000000000303";
const member = "10000000-0000-4000-8000-000000000201";
const audience = "00000000-0000-4000-8000-000000000091";
const transaction = "00000000-0000-4000-8000-000000000093";
const practicePlan = "33000000-0000-4000-8000-000000000300";
const practice = "33000000-0000-4000-8000-000000000600";
const program = "33000000-0000-4000-8000-000000000400";

/** Concrete demo paths per page template (formerly the visual matrix's). */
const demoRoutes: readonly { path: string; page: string }[] = [
  { path: "/", page: "/" },
  { path: "/setup", page: "/setup" },
  { path: "/schedule", page: "/[module]" },
  { path: "/activities", page: "/activities" },
  { path: "/ask", page: "/ask/[[...conversation]]" },
  { path: "/ask/history", page: "/ask/[[...conversation]]" },
  { path: "/setup/places", page: "/setup/places" },
  { path: "/setup/places/create", page: "/setup/places/create" },
  { path: `/setup/places/${venue}`, page: "/setup/places/[venueId]" },
  {
    path: `/setup/places/${venue}/layout`,
    page: "/setup/places/[venueId]/layout",
  },
  {
    path: `/setup/places/${venue}/courts/create`,
    page: "/setup/places/[venueId]/courts/create",
  },
  {
    path: `/setup/places/${venue}/courts/${court}`,
    page: "/setup/places/[venueId]/courts/[courtId]",
  },
  { path: "/people", page: "/[module]" },
  { path: `/people/${member}`, page: "/people/[personId]" },
  { path: "/people/invite", page: "/people/invite" },
  { path: "/team", page: "/[module]" },
  { path: "/team/invite", page: "/team/invite" },
  { path: "/training", page: "/training" },
  { path: "/training/drills/create", page: "/training/drills/create" },
  {
    path: "/training/drills/create/advanced",
    page: "/training/drills/create/advanced",
  },
  {
    path: "/training/practice-plans/create",
    page: "/training/practice-plans/create",
  },
  {
    path: `/training/practice-plans/${practicePlan}`,
    page: "/training/practice-plans/[planId]",
  },
  {
    path: `/training/practice-plans/${practicePlan}/print`,
    page: "/training/practice-plans/[planId]/print",
  },
  {
    path: `/training/practices/${practice}`,
    page: "/training/practices/[eventId]",
  },
  { path: "/training/programs/create", page: "/training/programs/create" },
  {
    path: `/training/programs/${program}`,
    page: "/training/programs/[programId]",
  },
  { path: "/programs", page: "/programs" },
  { path: "/offerings", page: "/[module]" },
  { path: "/offerings/create", page: "/offerings/create" },
  { path: "/offerings/types/services", page: "/offerings/types/[productType]" },
  { path: "/offerings/types/plans", page: "/offerings/types/[productType]" },
  { path: "/offerings/types/goods", page: "/offerings/types/[productType]" },
  { path: "/events", page: "/[module]" },
  { path: "/events/create", page: "/events/create" },
  { path: "/events/types/tournaments", page: "/events/types/[eventType]" },
  { path: "/events/types/clinics", page: "/events/types/[eventType]" },
  { path: "/events/types/open-play", page: "/events/types/[eventType]" },
  { path: "/events/types/pickup", page: "/events/types/[eventType]" },
  { path: `/events/${clinic}`, page: "/events/[sessionId]" },
  { path: `/events/${tournament}`, page: "/events/[sessionId]" },
  { path: "/events?type=league", page: "/[module]" },
  { path: "/inbox", page: "/inbox" },
  { path: "/inbox/create", page: "/inbox/create" },
  { path: "/marketing/audiences", page: "/marketing/audiences" },
  { path: "/marketing/audiences/create", page: "/marketing/audiences/create" },
  {
    path: `/marketing/audiences/${audience}`,
    page: "/marketing/audiences/[audienceId]",
  },
  { path: "/website", page: "/website" },
  { path: "/money", page: "/money" },
  { path: "/money/setup", page: "/money/setup" },
  { path: "/money/transactions", page: "/money/transactions" },
  {
    path: `/money/transactions/${transaction}`,
    page: "/money/transactions/[transactionId]",
  },
  { path: "/money/disputes", page: "/money/disputes" },
  { path: "/money/payouts", page: "/money/payouts" },
  { path: "/money/refund-policies", page: "/money/refund-policies" },
  { path: "/marketing", page: "/[module]" },
  { path: "/marketing/create", page: "/marketing/create" },
  { path: "/reports", page: "/[module]" },
  { path: "/settings", page: "/settings" },
  { path: "/setup/identity", page: "/setup/identity" },
  { path: "/account", page: "/account" },
  { path: "/setup/start", page: "/setup/start" },
  { path: "/setup/start/complete", page: "/setup/start/complete" },
  { path: "/overview", page: "/[module]" },
  { path: "/admin", page: "/admin" },
  { path: "/admin/organizations", page: "/admin/[module]" },
  { path: "/admin/ask-duna", page: "/admin/ask-duna" },
  { path: "/admin/video", page: "/admin/video" },
];

/**
 * Walks HQ in demo mode (work package S2): every sidebar item, and every page
 * template in `@duna/core/hq-routes`, must answer with HTTP success, render
 * exactly one `main` landmark, show no error boundary and log no console
 * error. The old-to-new address table is docs/plan/s2-route-map.md.
 *
 * Pages that fail on `main` today are listed in `knownFailures` with the work
 * package that fixes them. They still run, as expected failures: when the fix
 * lands the test reports an unexpected pass, and the entry must be removed.
 */

const hqBaseUrl =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;

/** The owner's navigation, in order (docs/design/tideline-4.1.1/ia-hq.md). */
const sidebar = [
  ["Today", "/"],
  ["Schedule", "/schedule"],
  ["Inbox", "/inbox"],
  ["People", "/people"],
  ["Team", "/team"],
  ["Training", "/training"],
  ["Events", "/events"],
  ["Offerings", "/offerings"],
  ["Money", "/money"],
  ["Club setup", "/setup"],
  ["Website", "/website"],
  ["Marketing", "/marketing"],
  ["Reports", "/reports"],
] as const;

/** Demo-adapter ids for templates the visual matrix cannot open. */
const extraPaths: Readonly<Record<string, string>> = {
  [hqRoutes.offering]: "/offerings/10000000-0000-4000-8000-000000000401",
  [hqRoutes.offeringBuilder]:
    "/offerings/10000000-0000-4000-8000-000000000401/builder",
  [hqRoutes.offeringDraftReady]:
    "/offerings/10000000-0000-4000-8000-000000000401/draft-ready",
  [hqRoutes.teamMember]: "/team/10000000-0000-4000-8000-000000000201",
  [hqRoutes.eventDivision]:
    "/events/10000000-0000-4000-8000-000000000303/divisions/00000000-0000-4000-8000-000000000001",
  [hqRoutes.eventCourtBooking]:
    "/events/court-bookings/00000000-0000-4000-8000-000000000001",
  [hqRoutes.eventMatch]: "/events/matches/00000000-0000-4000-8000-000000000001",
  [hqRoutes.memberHealth]:
    "/people/10000000-0000-4000-8000-000000000201/health",
  [hqRoutes.marketingPromoCodes]: "/marketing/promo-codes",
  [hqRoutes.stripeReturn]: "/stripe/return?result=return",
  [hqRoutes.adminMessagingSafety]: "/admin/messaging-safety",
  [hqRoutes.adminSupport]: "/admin/support",
  [hqRoutes.adminOrganization]:
    "/admin/organizations/00000000-0000-4000-8000-000000000001",
};

/**
 * Pages that fail one of the checks in demo mode on `main` before S2, each
 * with the package that fixes it. Keyed by the concrete path walked.
 */
const knownFailures: Readonly<Record<string, string>> = {
  "/ask": "S1: /ask renders without a main landmark (persona known issue).",
  "/account":
    "S1: /account renders without a main landmark (persona known issue).",
  "/marketing/promo-codes":
    "Q1: promo codes throw in demo mode (persona-journeys.md, H13).",
  [extraPaths[hqRoutes.offering]!]:
    "H9: the demo catalog is empty, so no offering record resolves (404).",
  [extraPaths[hqRoutes.offeringBuilder]!]:
    "H9: the demo catalog is empty, so no offering record resolves (404).",
  [extraPaths[hqRoutes.offeringDraftReady]!]:
    "H9: the demo catalog is empty, so no offering record resolves (404).",
  [extraPaths[hqRoutes.teamMember]!]:
    "H5: the demo workspace has no staff records (404).",
  [extraPaths[hqRoutes.eventDivision]!]:
    "H9: no demo event has an entry division (404).",
  [extraPaths[hqRoutes.eventCourtBooking]!]:
    "H9: operator.activityDetail needs the connected database in demo mode.",
  [extraPaths[hqRoutes.eventMatch]!]:
    "H9: operator.activityDetail needs the connected database in demo mode.",
  [extraPaths[hqRoutes.memberHealth]!]:
    "H4: operator.memberHealthProfile needs the connected database in demo mode.",
  [extraPaths[hqRoutes.stripeReturn]!]:
    "H10: Duna Pay return calls WorkOS withAuth, which is not configured in demo mode.",
  [extraPaths[hqRoutes.adminMessagingSafety]!]:
    "Unassigned (Super Admin access state; no package yet): throws for any actor without the Super Admin role instead of the access-denied state.",
  [extraPaths[hqRoutes.adminSupport]!]:
    "Unassigned (Super Admin access state; no package yet): throws for any actor without the Super Admin role instead of the access-denied state.",
  [extraPaths[hqRoutes.adminOrganization]!]:
    "Unassigned (Super Admin; no package yet): needs a platform role and a connected organization record.",
};

/** One concrete path per page template, plus the league filter of Events. */
function walkPaths(): string[] {
  const templates = [...new Set(Object.values(hqRoutes) as string[])].filter(
    (template) => !isHqDevOnlyRoute(template),
  );
  const paths = templates.flatMap((template) => {
    const covered = demoRoutes
      .filter((route) => route.page === template)
      .map((route) => route.path)
      .filter((path) => path !== "/overview");
    if (covered.length > 0) return covered;
    const extra = extraPaths[template];
    if (!extra) throw new Error(`No walk path for ${template}`);
    return [extra];
  });
  return [...new Set([...paths, hqLeaguesPath])];
}

async function expectHealthyPage(page: Page, path: string) {
  const monitor = new QualityMonitor([hqBaseUrl]);
  monitor.watch(page);
  const response = await page.goto(new URL(path, hqBaseUrl).toString(), {
    waitUntil: "domcontentloaded",
  });
  expect(response, `${path}: no response`).not.toBeNull();
  expect(response!.status(), `${path}: HTTP status`).toBeLessThan(400);
  await page.waitForLoadState("load");
  await expect(
    page.getByText(
      /This page didn.t load|This page couldn.t load|Application error/,
    ),
    `${path}: error boundary`,
  ).toHaveCount(0);
  await expect(page.getByText("We can’t find that page")).toHaveCount(0);
  await expect(page.getByRole("main"), `${path}: main landmark`).toHaveCount(1);
  const unexpected = monitor
    .unexpected(knownIssues)
    .filter((issue) => issue.kind !== "duplicate-mutation");
  expect(unexpected, formatIssues(unexpected)).toEqual([]);
}

test.describe("HQ route walk (demo mode)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "Route health does not depend on the viewport; the sidebar is checked at every width by hq-shell.spec.ts.",
    );
  });

  test("the sidebar lists the owner's navigation in order", async ({
    page,
  }) => {
    await page.goto(hqBaseUrl);
    const links = page
      .getByRole("navigation", { name: "Duna HQ" })
      .locator("a[data-nav-id]");
    await expect(links).toHaveCount(sidebar.length);
    for (const [index, [label, path]] of sidebar.entries()) {
      // A count badge (unread threads, drafts) may follow the label.
      await expect(links.nth(index)).toHaveAccessibleName(
        new RegExp(`^${label}(?: \\d+)?$`),
      );
      await expect(links.nth(index)).toHaveAttribute("href", path);
    }
    await expect(page.getByText("More tools", { exact: true })).toHaveCount(0);
  });

  for (const [index, [label, path]] of sidebar.entries()) {
    test(`sidebar: ${label} opens ${path}`, async ({ page }) => {
      await page.goto(hqBaseUrl);
      await page
        .getByRole("navigation", { name: "Duna HQ" })
        .locator("a[data-nav-id]")
        .nth(index)
        .click();
      await expect(page).toHaveURL(new URL(path, hqBaseUrl).toString());
      await expectHealthyPage(page, path);
    });
  }

  for (const path of walkPaths()) {
    test(`route ${path}`, async ({ page }) => {
      const owner = knownFailures[path];
      test.fail(Boolean(owner), owner);
      await expectHealthyPage(page, path);
    });
  }
});
