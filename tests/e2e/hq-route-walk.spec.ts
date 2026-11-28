import { expect, test, type Page } from "@playwright/test";
import {
  hqLeaguesPath,
  hqRoutes,
  isHqDevOnlyRoute,
} from "../../packages/core/src/hq-routes";
import { knownIssues } from "./personas/support/known-issues";
import { formatIssues, QualityMonitor } from "./personas/support/quality";

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

// Fixed demo-adapter identifiers (not secrets; they exist in no connected
// environment).
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
const missing = "00000000-0000-4000-8000-000000000001";

/** Concrete paths for every dynamic template (static ones walk as written). */
const dynamicPaths: Readonly<Record<string, readonly string[]>> = {
  [hqRoutes.ask]: ["/ask", "/ask/history"],
  [hqRoutes.module]: [
    "/schedule",
    "/people",
    "/team",
    "/events",
    "/offerings",
    "/marketing",
    "/reports",
  ],
  [hqRoutes.member]: [`/people/${member}`],
  [hqRoutes.memberHealth]: [`/people/${member}/health`],
  [hqRoutes.teamMember]: [`/team/${member}`],
  [hqRoutes.trainingPracticePlan]: [`/training/practice-plans/${practicePlan}`],
  [hqRoutes.trainingPracticePlanPrint]: [
    `/training/practice-plans/${practicePlan}/print`,
  ],
  [hqRoutes.trainingPractice]: [`/training/practices/${practice}`],
  [hqRoutes.trainingProgram]: [`/training/programs/${program}`],
  [hqRoutes.event]: [`/events/${clinic}`, `/events/${tournament}`],
  [hqRoutes.eventDivision]: [`/events/${tournament}/divisions/${missing}`],
  [hqRoutes.eventCourtBooking]: [`/events/court-bookings/${missing}`],
  [hqRoutes.eventMatch]: [`/events/matches/${missing}`],
  [hqRoutes.eventType]: [
    "/events/types/tournaments",
    "/events/types/clinics",
    "/events/types/open-play",
    "/events/types/pickup",
  ],
  [hqRoutes.offering]: [`/offerings/${missing}`],
  [hqRoutes.offeringBuilder]: [`/offerings/${missing}/builder`],
  [hqRoutes.offeringDraftReady]: [`/offerings/${missing}/draft-ready`],
  [hqRoutes.offeringType]: [
    "/offerings/types/services",
    "/offerings/types/plans",
    "/offerings/types/goods",
  ],
  [hqRoutes.moneyTransaction]: [`/money/transactions/${transaction}`],
  [hqRoutes.place]: [`/setup/places/${venue}`],
  [hqRoutes.placeLayout]: [`/setup/places/${venue}/layout`],
  [hqRoutes.placeCourtCreate]: [`/setup/places/${venue}/courts/create`],
  [hqRoutes.placeCourt]: [`/setup/places/${venue}/courts/${court}`],
  [hqRoutes.marketingAudience]: [`/marketing/audiences/${audience}`],
  [hqRoutes.adminOrganization]: [`/admin/organizations/${missing}`],
  [hqRoutes.adminModule]: ["/admin/organizations"],
};

const extraPaths = {
  offering: `/offerings/${missing}`,
  offeringBuilder: `/offerings/${missing}/builder`,
  offeringDraftReady: `/offerings/${missing}/draft-ready`,
  teamMember: `/team/${member}`,
  eventDivision: `/events/${tournament}/divisions/${missing}`,
  eventCourtBooking: `/events/court-bookings/${missing}`,
  eventMatch: `/events/matches/${missing}`,
  memberHealth: `/people/${member}/health`,
  stripeReturn: hqRoutes.stripeReturn,
  adminMessagingSafety: hqRoutes.adminMessagingSafety,
  adminSupport: hqRoutes.adminSupport,
  adminOrganization: `/admin/organizations/${missing}`,
} as const;

/**
 * Pages that fail one of the checks in demo mode on `main` before S2, each
 * with the package that fixes it. Keyed by the concrete path walked.
 */
const knownFailures: Readonly<Record<string, string>> = {
  [extraPaths.offering]:
    "H9: the demo catalog is empty, so no offering record resolves (404).",
  [extraPaths.offeringBuilder]:
    "H9: the demo catalog is empty, so no offering record resolves (404).",
  [extraPaths.offeringDraftReady]:
    "H9: the demo catalog is empty, so no offering record resolves (404).",
  [extraPaths.teamMember]: "H5: the demo workspace has no staff records (404).",
  [extraPaths.eventDivision]: "H9: no demo event has an entry division (404).",
  [extraPaths.eventCourtBooking]:
    "H9: operator.activityDetail needs the connected database in demo mode.",
  [extraPaths.eventMatch]:
    "H9: operator.activityDetail needs the connected database in demo mode.",
  [extraPaths.memberHealth]:
    "H4: operator.memberHealthProfile needs the connected database in demo mode.",
  [extraPaths.stripeReturn]:
    "H10: Duna Pay return calls WorkOS withAuth, which is not configured in demo mode.",
  [extraPaths.adminMessagingSafety]:
    "Unassigned (Super Admin access state; no package yet): throws for any actor without the Super Admin role instead of the access-denied state.",
  [extraPaths.adminSupport]:
    "Unassigned (Super Admin access state; no package yet): throws for any actor without the Super Admin role instead of the access-denied state.",
};

/** One or more concrete paths per page template, plus the league filter. */
function walkPaths(): string[] {
  const templates = [...new Set(Object.values(hqRoutes) as string[])].filter(
    (template) => !isHqDevOnlyRoute(template),
  );
  const paths = templates.flatMap((template) => {
    if (template in dynamicPaths) return [...dynamicPaths[template]!];
    if (template.includes("[")) throw new Error(`No walk path for ${template}`);
    return [template];
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
  // Streamed sections (and their error or not-found states) arrive after the
  // load event; the negative checks below are only meaningful once they have.
  // Live-update streams keep a connection open, so idle is best effort.
  await page
    .waitForLoadState("networkidle", { timeout: 15_000 })
    .catch(() => undefined);
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
      "Route health does not depend on the viewport; one width is enough here.",
    );
  });

  test("the sidebar lists the owner's navigation in order", async ({
    page,
  }) => {
    await page.goto(hqBaseUrl);
    const links = page
      .getByRole("navigation", { name: "Operator modules" })
      .locator("[data-nav-id] > a");
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
        .getByRole("navigation", { name: "Operator modules" })
        .locator("[data-nav-id] > a")
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
