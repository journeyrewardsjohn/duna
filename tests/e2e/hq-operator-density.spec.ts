import { expect, test, type Page } from "@playwright/test";

const base =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;

async function expectContainedPage(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  const title = page.locator("main h1");
  await expect(title).toHaveCount(1);
  expect(
    await title.evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
  ).toBeLessThanOrEqual(28);
}

// Runs under the configured desktop, tablet and mobile projects. These checks
// cover navigation and local UI state; they do not prove provider transactions.
test("compact Activities keeps every operational destination and accessible table headers", async ({
  page,
}, info) => {
  await page.goto(`${base}/activities`);
  const table = page.getByRole("table", {
    name: "Activity workspaces",
    exact: true,
  });
  await expect(table).toBeVisible();
  await expect(table.getByRole("columnheader")).toHaveCount(3);
  await expect(table.getByRole("rowheader")).toHaveCount(8);
  const destinations = [
    ["Programs & camps", "/programs"],
    ["Tournaments", "/events/types/tournaments"],
    ["Leagues", "/leagues"],
    ["Courts & rentals", "/calendar"],
    ["Lessons & coaching", "/products/types/services"],
    ["Open play & clinics", "/events"],
    ["Memberships & packs", "/products/types/plans"],
    ["Shop & equipment", "/products/types/goods"],
  ];
  for (const [name, href] of destinations)
    await expect(
      table.getByRole("link", { name, exact: true }),
    ).toHaveAttribute("href", href!);
  const region = page.getByRole("region", {
    name: "Activity workspaces",
    exact: true,
  });
  await region.focus();
  await expect(region).toBeFocused();
  if ((page.viewportSize()?.width ?? 0) >= 1000) {
    const box = await table.boundingBox();
    expect(box!.height).toBeLessThan(750);
    expect(box!.y).toBeLessThan(360);
  }
  await expectContainedPage(page);
  await page.screenshot({
    path: info.outputPath("activities-compact.png"),
    fullPage: true,
  });
  await table
    .getByRole("link", { name: "Courts & rentals", exact: true })
    .click();
  await expect(page).toHaveURL(`${base}/calendar`);
  await expect(
    page.getByRole("link", { name: "New session", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Block time", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Coaches", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Coaches", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Courts", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Courts", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("compact People retains search, family filters and keyboard profile access", async ({
  page,
}, info) => {
  await page.goto(`${base}/members`);
  const table = page.getByRole("table", {
    name: "People directory",
    exact: true,
  });
  await expect(table).toBeVisible();
  await expect(table.getByRole("columnheader")).toHaveCount(6);
  const search = page.getByRole("searchbox", {
    name: "Search people",
    exact: true,
  });
  await search.fill("no-person-matches-this-qa-query");
  await expect(table.getByRole("rowheader")).toHaveCount(0);
  await search.clear();
  for (const name of ["Junior players", "Parents & guardians", "Everyone"]) {
    const filter = page.getByRole("button", { name, exact: true });
    await filter.click();
    await expect(filter).toHaveAttribute("aria-pressed", "true");
  }
  const region = page.getByRole("region", {
    name: "People directory",
    exact: true,
  });
  await region.focus();
  await expect(region).toBeFocused();
  await expectContainedPage(page);
  await page.screenshot({
    path: info.outputPath("people-compact.png"),
    fullPage: true,
  });
  const profile = table.getByRole("rowheader").first().getByRole("link");
  await expect(profile).toHaveAttribute("href", /^\/members\/.+/);
  await profile.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/members\/[^/]+$/);
});

test("compact Money navigation remains usable in dark mode and narrow layouts", async ({
  page,
}, info) => {
  await page.addInitScript(() => localStorage.setItem("duna-theme", "dark"));
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto(`${base}/payments`);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const nav = page.getByRole("navigation", { name: "Money sections" });
  await expect(nav.getByRole("link")).toHaveCount(5);
  await expect(
    nav.getByRole("link", { name: "Balance", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const refunds = nav.getByRole("link", {
    name: "Refund Policies",
    exact: true,
  });
  await refunds.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`${base}/payments/refund-policies`);
  await expect(refunds).toHaveAttribute("aria-current", "page");
  await expectContainedPage(page);
  await page.screenshot({
    path: info.outputPath("money-compact-dark.png"),
    fullPage: true,
  });
});
