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
const junior = "10000000-0000-4000-8000-000000000203";
const audience = "00000000-0000-4000-8000-000000000091";
const transaction = "00000000-0000-4000-8000-000000000093";
// Training demo fixtures (@duna/core/demo/training-programs, training-drills).
const practicePlan = "d0060000-0000-4000-8000-000000000300";
const practice = "d0060000-0000-4000-8000-000000000101";
const program = "d0060000-0000-4000-8000-000000000001";
const drill = "d0070000-0000-4000-8000-000000000001";
const missing = "00000000-0000-4000-8000-000000000001";
// Duna Pay demo fixtures (@duna/core/demo/pay) and the demo payout.
const sale = "d0020000-0000-4000-8000-000000000103";
const dispute = "d0020000-0000-4000-8000-000000000800";
const payout = "93000000-0000-4000-8000-000000000001";
// The demo coach Theo (@duna/core/demo) and the demo pay run awaiting
// approval (@duna/core/demo/team-pay).
const coach = "10000000-0000-4000-8000-000000000011";
const payRun = "d0040000-0000-4000-8000-000000000201";
// The demo club's live tournament (apps/hq/components/events/events-demo.ts).
const liveEvent = "7e000000-0000-4000-8000-000000000001";
// The demo club's weekly clinic (apps/hq/components/offerings/offerings-demo.ts).
const offering = "d0130000-0000-4000-8000-000000000102";

/** Concrete paths for every dynamic template (static ones walk as written). */
const dynamicPaths: Readonly<Record<string, readonly string[]>> = {
  [hqRoutes.ask]: ["/ask", "/ask/history"],
  [hqRoutes.module]: ["/events", "/marketing", "/reports"],
  // People (H-PEOPLE): Maya (adult, shares health) and Ava (a junior).
  [hqRoutes.member]: [`/people/${member}`, `/people/${junior}`],
  [hqRoutes.memberMemberships]: [`/people/${member}/memberships`],
  [hqRoutes.memberBookings]: [`/people/${member}/bookings`],
  [hqRoutes.memberPayments]: [`/people/${member}/payments`],
  [hqRoutes.memberFamily]: [
    `/people/${member}/family`,
    `/people/${junior}/family`,
  ],
  [hqRoutes.memberDocuments]: [`/people/${member}/documents`],
  [hqRoutes.memberNotes]: [`/people/${member}/notes`],
  [hqRoutes.memberHealth]: [
    `/people/${member}/health`,
    `/people/${junior}/health`,
  ],
  [hqRoutes.teamMember]: [`/team/${coach}`],
  [hqRoutes.teamMemberAvailability]: [`/team/${coach}/availability`],
  [hqRoutes.teamMemberSessions]: [`/team/${coach}/sessions`],
  [hqRoutes.teamMemberPay]: [`/team/${coach}/pay`],
  [hqRoutes.teamMemberAccess]: [`/team/${coach}/access`],
  [hqRoutes.teamPayRun]: [`/team/pay/${payRun}`],
  [hqRoutes.trainingPracticePlan]: [`/training/practice-plans/${practicePlan}`],
  [hqRoutes.trainingPracticePlanPrint]: [
    `/training/practice-plans/${practicePlan}/print`,
  ],
  [hqRoutes.trainingPractice]: [`/training/practices/${practice}`],
  [hqRoutes.trainingProgram]: [`/training/programs/${program}`],
  [hqRoutes.trainingProgramCalendar]: [
    `/training/programs/${program}/calendar`,
  ],
  [hqRoutes.trainingProgramAthletes]: [
    `/training/programs/${program}/athletes`,
  ],
  [hqRoutes.trainingProgramPlans]: [`/training/programs/${program}/plans`],
  [hqRoutes.trainingProgramSettings]: [
    `/training/programs/${program}/settings`,
  ],
  [hqRoutes.trainingDrill]: [`/training/drills/${drill}`],
  [hqRoutes.trainingDrillEdit]: [`/training/drills/${drill}/edit`],
  [hqRoutes.event]: [
    `/events/${clinic}`,
    `/events/${tournament}`,
    `/events/${liveEvent}`,
  ],
  [hqRoutes.eventEntries]: [
    `/events/${clinic}/entries`,
    `/events/${liveEvent}/entries`,
  ],
  [hqRoutes.eventSchedule]: [`/events/${liveEvent}/schedule`],
  [hqRoutes.eventBrackets]: [`/events/${liveEvent}/brackets`],
  [hqRoutes.eventMoney]: [`/events/${liveEvent}/money`],
  [hqRoutes.eventNotes]: [`/events/${clinic}/notes`],
  [hqRoutes.eventSettings]: [
    `/events/${clinic}/settings`,
    `/events/${liveEvent}/settings`,
  ],
  [hqRoutes.eventDivision]: [`/events/${tournament}/divisions/${missing}`],
  [hqRoutes.eventCourtBooking]: [`/events/court-bookings/${missing}`],
  [hqRoutes.eventMatch]: [`/events/matches/${missing}`],
  [hqRoutes.eventType]: [
    "/events/types/tournaments",
    "/events/types/clinics",
    "/events/types/open-play",
    "/events/types/pickup",
  ],
  [hqRoutes.offering]: [`/offerings/${offering}`],
  [hqRoutes.offeringSchedule]: [`/offerings/${offering}/schedule`],
  [hqRoutes.offeringPrice]: [`/offerings/${offering}/price`],
  [hqRoutes.offeringGroupSize]: [`/offerings/${offering}/group-size`],
  [hqRoutes.offeringPeople]: [`/offerings/${offering}/people`],
  [hqRoutes.offeringSettings]: [`/offerings/${offering}/settings`],
  [hqRoutes.offeringBuilder]: [`/offerings/${offering}/builder`],
  [hqRoutes.offeringDraftReady]: [`/offerings/${offering}/draft-ready`],
  [hqRoutes.offeringType]: [
    "/offerings/types/services",
    "/offerings/types/plans",
    "/offerings/types/goods",
  ],
  [hqRoutes.moneyTransaction]: [
    `/money/transactions/${transaction}`,
    `/money/transactions/${sale}`,
  ],
  [hqRoutes.moneyPayout]: [`/money/payouts/${payout}`],
  [hqRoutes.moneyDispute]: [`/money/disputes/${dispute}`],
  [hqRoutes.place]: [`/setup/places/${venue}`],
  [hqRoutes.placeLayout]: [`/setup/places/${venue}/layout`],
  [hqRoutes.placeDetails]: [`/setup/places/${venue}/details`],
  [hqRoutes.placeCourtCreate]: [`/setup/places/${venue}/courts/create`],
  [hqRoutes.placeCourt]: [`/setup/places/${venue}/courts/${court}`],
  [hqRoutes.marketingAudience]: [`/marketing/audiences/${audience}`],
  [hqRoutes.adminOrganization]: [`/admin/organizations/${missing}`],
  [hqRoutes.adminModule]: ["/admin/organizations"],
};

const extraPaths = {
  eventDivision: `/events/${tournament}/divisions/${missing}`,
  eventCourtBooking: `/events/court-bookings/${missing}`,
  eventMatch: `/events/matches/${missing}`,
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
  [extraPaths.eventDivision]: "H9: no demo event has an entry division (404).",
  [extraPaths.eventMatch]:
    "H9: operator.activityDetail needs the connected database in demo mode.",
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
      .getByRole("navigation", { name: "Duna HQ" })
      .locator("a[data-nav-id]");
    await expect(links).toHaveCount(sidebar.length);
    for (const [index, [label, path]] of sidebar.entries()) {
      // A count badge (Inbox's unread threads) names itself: "Inbox, 3 new".
      await expect(links.nth(index)).toHaveAccessibleName(
        new RegExp(`^${label}(?:, \\d+ new)?$`),
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
