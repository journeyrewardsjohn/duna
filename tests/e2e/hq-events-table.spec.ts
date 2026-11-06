import { expect, test, type Page } from "@playwright/test";
const base =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;
const draftId = "89000000-0000-4000-8000-000000000001";

async function fixture(page: Page) {
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
    throw new Error("Event fixtures are local-only");
  const sessions = Array.from({ length: 30 }, (_, index) => ({
    id: `89000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    title: `QA Event ${String(index + 1).padStart(2, "0")}`,
    slug: `qa-event-${index + 1}`,
    kind: index % 2 ? "clinic" : "tournament",
    status:
      index === 0 ? "draft" : index === 29 ? "completed" : "registration-open",
    startsAt:
      index === 29 ? "2020-07-10T18:00:00.000Z" : "2035-07-10T18:00:00.000Z",
    endsAt:
      index === 29 ? "2020-07-10T20:00:00.000Z" : "2035-07-10T20:00:00.000Z",
    timezone: "America/New_York",
    capacity: 16,
    venueName: "QA Beach Courts",
    media: [],
    priceMinor: 2500,
    currency: "USD",
    analytics: {
      impressions: 0,
      uniqueViewers: 0,
      registrations: 0,
      ticketHolders: 0,
      conversionRateBps: 0,
    },
  }));
  await page.route(`${base}/events**`, async (route) => {
    if (new URL(route.request().url()).pathname !== "/events")
      return route.continue();
    const response = await route.fetch();
    const original = await response.text();
    const body = original.replaceAll(
      '"sessions":[{',
      `"sessions":[${sessions.map((item) => JSON.stringify(item)).join(",")},{`,
    );
    await route.fulfill({ response, body });
  });
  // In-app navigation yields the RSC props; fixture changes no server records.
  await page.goto(`${base}/activities`);
  await page
    .getByRole("link", { name: "Open play & clinics", exact: true })
    .click();
}

test.beforeEach(async ({ page }) => {
  await page.route(
    /^https:\/\/(?:api|cdn)\.fontshare\.com\//,
    async (route) => {
      const headers = route.request().headers();
      delete headers["x-forwarded-for"];
      await route.continue({ headers });
    },
  );
});

test("events table searches, sorts and paginates without stacked empty summaries", async ({
  page,
}, info) => {
  await fixture(page);
  const table = page.getByRole("table", { name: "Events", exact: true });
  await expect(table).toBeVisible();
  expect(await page.evaluate(() => innerWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  );
  await expect(table.getByRole("columnheader")).toHaveCount(7);
  const search = page.getByRole("searchbox", { name: "Search events" });
  await search.fill("QA Event");
  await expect(table.locator("tbody tr")).toHaveCount(25);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(table.locator("tbody tr")).toHaveCount(5);
  await search.fill("QA Event 01");
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Previous", exact: true }),
  ).toBeDisabled();
  await search.fill("no-matching-event");
  await expect(
    page.getByText("No matching events", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .first()
    .click();
  await search.fill("QA Event");
  await page
    .getByRole("combobox", { name: "Events per page" })
    .selectOption("50");
  await expect(table.locator("tbody tr")).toHaveCount(30);
  const completedRow = table
    .getByRole("row")
    .filter({ hasText: "QA Event 30" });
  await expect(completedRow).toContainText("Closed");
  await expect(completedRow).not.toContainText("spots left");
  await page
    .getByRole("button", { name: "Sort by Event", exact: true })
    .click();
  await expect(table.getByRole("columnheader").first()).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  await expect(table.locator("tbody tr").first()).toContainText("QA Event 01");
  await page
    .getByRole("button", { name: "Sort by Event", exact: true })
    .click();
  await expect(table.locator("tbody tr").first()).toContainText("QA Event 30");
  await page
    .getByRole("combobox", { name: "Event type", exact: true })
    .selectOption("clinic");
  await expect(table.locator("tbody tr")).toHaveCount(15);
  await page
    .getByRole("combobox", { name: "Event type", exact: true })
    .selectOption("all");
  for (const [name, count] of [
    ["Upcoming", 28],
    ["Past", 1],
    ["Drafts", 1],
    ["All events", 30],
  ] as const) {
    await page
      .getByRole("group", { name: "Event views" })
      .getByRole("button", { name: new RegExp(`^${name}`) })
      .click();
    await expect(table.locator("tbody tr")).toHaveCount(count);
  }
  await page
    .getByRole("combobox", { name: "Events per page" })
    .selectOption("25");
  await expect(
    page.getByText("Browse by activity type", { exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: info.outputPath("events-table.png"),
    fullPage: true,
  });
  await page.getByRole("region", { name: "Events table", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
});

test("draft review stays explicit and preserves the blocked publication control", async ({
  page,
}) => {
  await fixture(page);
  await page.getByRole("button", { name: /^Drafts/ }).click();
  const row = page
    .getByRole("table", { name: "Events", exact: true })
    .getByRole("row")
    .filter({ hasText: "QA Event 01" });
  await expect(
    row.getByRole("link", { name: "Edit", exact: true }),
  ).toHaveAttribute("href", `/events/create?draft=${draftId}`);
  await row.getByRole("link", { name: "Review", exact: true }).click();
  const review = page.getByRole("region", { name: "Draft publication review" });
  await expect(review).toBeVisible();
  await expect(
    review.getByRole("button", { name: "Publish & open registration" }),
  ).toBeDisabled();
  await expect(review.locator(`article#draft-${draftId}`)).toBeVisible();
  await page.getByRole("link", { name: "Close review", exact: true }).click();
  await expect(review).toHaveCount(0);
});

test("event inventory supports dark theme and keeps real published listings", async ({
  page,
}, info) => {
  await page.addInitScript(() => localStorage.setItem("duna-theme", "dark"));
  await page.goto(`${base}/events`);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const table = page.getByRole("table", { name: "Events", exact: true });
  await expect(table).toBeVisible();
  await expect(table.locator("tbody tr").first()).toBeVisible();
  await expect(
    table.getByRole("link", { name: /Player page/ }).first(),
  ).toHaveAttribute("href", /\/events\/.+/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("events-table-dark.png"),
    fullPage: true,
  });
});
