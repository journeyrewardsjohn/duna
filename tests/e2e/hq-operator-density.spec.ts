import { expect, test, type Page } from "@playwright/test";

const base =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;

// The synthetic local client IP belongs to localhost, not font providers.
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

async function clearAssistant(page: Page) {
  const minimize = page.getByRole("button", {
    name: "Minimize Ask Duna",
    exact: true,
  });
  if (await minimize.isVisible()) await minimize.click();
}

/**
 * A rebuilt screen on the HQ shell: no sideways scroll, and exactly one title
 * in the shell's display role (Jost, at least 22 px, at most the shell's
 * 32 px; docs/design/hq-shell.md).
 */
async function expectShellPage(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  const title = page.locator("main h1");
  await expect(title).toHaveCount(1);
  const size = await title.evaluate((node) =>
    parseFloat(getComputedStyle(node).fontSize),
  );
  expect(size).toBeGreaterThanOrEqual(22);
  expect(size).toBeLessThanOrEqual(32);
}

// Runs under the configured desktop, tablet and mobile projects. These checks
// cover navigation and local UI state; they do not prove provider transactions.
test("compact Money navigation remains usable in dark mode and narrow layouts", async ({
  page,
}, info) => {
  await page.addInitScript(() => localStorage.setItem("duna-theme", "dark"));
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto(`${base}/money`);
  await clearAssistant(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  // Money's S3 SubNav: eight tabs; on a wide row five links and "More", on
  // a narrow container all eight in one scrolling row.
  const nav = page.getByRole("navigation", { name: "Money" });
  const links = nav.locator("a[data-nav-id]:visible");
  const more = nav.getByRole("button", { name: "More" });
  if (await more.isVisible()) {
    await expect(links).toHaveCount(5);
    await more.click();
    await expect(
      page.getByRole("link", { name: "Duna Pay setup", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  } else {
    await expect(links).toHaveCount(8);
  }
  await expect(
    nav.getByRole("link", { name: "Overview", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const refunds = nav.getByRole("link", { name: "Refunds", exact: true });
  await refunds.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`${base}/money/refund-policies`);
  await expect(refunds).toHaveAttribute("aria-current", "page");
  await expectShellPage(page);
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: info.outputPath("money-compact-dark.png"),
    fullPage: true,
  });
});
