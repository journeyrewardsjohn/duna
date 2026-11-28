import { expect, test, type Page } from "@playwright/test";

/**
 * The new HQ shell and Today (S1 / H1, docs/design/hq-shell.md), in demo mode
 * as a club owner. Covers the shell at desktop and phone width, the
 * remembered sidebar, the command palette, Ask Duna's shortcut, the theme on
 * a design-system-only document, links between rebuilt and legacy pages, and
 * Today's first-day and populated states.
 */
const hqBaseUrl =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;
const hq = (path: string) => new URL(path, hqBaseUrl).toString();

test.beforeEach(async ({ context }, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "The spec sets its own widths (1440 and 375).",
  );
  await context.addCookies([
    { name: "duna-demo-persona", value: "club-owner", url: hqBaseUrl },
  ]);
});

async function openToday(page: Page) {
  await page.goto(hq("/"));
  await expect(
    page.getByRole("heading", { name: "Today", level: 1 }),
  ).toBeVisible();
}

/** Selectors only the legacy sheets define. */
async function legacyRulesLoaded(page: Page): Promise<number> {
  return page.evaluate(() => {
    let count = 0;
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      const text = Array.from(rules)
        .map((rule) => rule.cssText)
        .join("\n");
      if (
        /\.hq-sidebar\b|\.hq-topbar\b|\.hq-overview|\.ask-duna-floating/.test(
          text,
        )
      ) {
        count += 1;
      }
    }
    return count;
  });
}

test("the shell renders with its landmarks at desktop and phone width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openToday(page);
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
  const sidebar = page.getByRole("navigation", { name: "Duna HQ" });
  await expect(sidebar).toBeVisible();
  await expect(sidebar.locator("a[data-nav-id]")).toHaveCount(13);
  await expect(sidebar.getByRole("link", { name: "Today" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    page.getByRole("button", { name: /Switch club\. Current:/ }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Skip to content" })).toHaveCount(
    1,
  );

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(sidebar).toBeHidden();
  const phoneBar = page.getByRole("navigation", { name: "Quick navigation" });
  await expect(phoneBar).toBeVisible();
  await phoneBar.getByRole("button", { name: "More" }).click();
  const more = page.getByRole("dialog", { name: "Duna HQ" });
  await expect(more.getByRole("link", { name: "Reports" })).toBeVisible();
  await expect(more.getByRole("button", { name: "Ask Duna" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("the sidebar remembers being collapsed", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openToday(page);
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.locator(".hqs")).toHaveAttribute(
    "data-sidebar",
    "collapsed",
  );
  await page.reload();
  await expect(page.locator(".hqs")).toHaveAttribute(
    "data-sidebar",
    "collapsed",
  );
  await expect(
    page.getByRole("button", { name: "Expand sidebar" }),
  ).toBeVisible();
  // Collapsed items keep their names.
  await expect(
    page
      .getByRole("navigation", { name: "Duna HQ" })
      .getByRole("link", { name: "Money" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(page.locator(".hqs")).toHaveAttribute(
    "data-sidebar",
    "expanded",
  );
});

test("the command palette opens with Cmd/Ctrl K and goes to a page", async ({
  page,
}) => {
  await openToday(page);
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Search Duna HQ" });
  await expect(palette).toBeVisible();
  await palette.getByRole("combobox").fill("Club setup");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(hq("/setup"));
});

test("Ask Duna opens with Cmd/Ctrl J and closes with Escape", async ({
  page,
}) => {
  await openToday(page);
  const askButton = page.getByRole("button", { name: "Ask Duna" }).first();
  await expect(askButton).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("ControlOrMeta+j");
  const panel = page.getByRole("complementary", { name: "Ask Duna" });
  await expect(panel).toBeVisible();
  // Demo mode: the honest state, and no request that would fail.
  await expect(panel.getByText("Ask Duna isn't set up yet")).toBeVisible();
  await expect(panel.getByText("Today", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(askButton).toBeFocused();
});

test("the theme switches light and dark on a document with no legacy CSS", async ({
  page,
}) => {
  await openToday(page);
  expect(await legacyRulesLoaded(page)).toBe(0);
  await page.getByRole("button", { name: /^Account and settings for/ }).click();
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  // Set before the first paint, so it is already dark on load.
  await expect(page.locator("body")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: /^Account and settings for/ }).click();
  await page.getByRole("radio", { name: "Light" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-theme", "light");
  expect(await legacyRulesLoaded(page)).toBe(0);
});

test("a page not rebuilt yet opens from the new shell, and Today opens from it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openToday(page);
  await page
    .getByRole("navigation", { name: "Duna HQ" })
    .getByRole("link", { name: "People" })
    .click();
  await expect(page).toHaveURL(hq("/people"));
  await expect(page.locator(".hqs")).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Operator modules" })
    .getByRole("link", { name: "Today" })
    .click();
  await expect(page).toHaveURL(hq("/"));
  await expect(
    page.getByRole("heading", { name: "Today", level: 1 }),
  ).toBeVisible();
});

test("Today shows the demo club's day", async ({ page }) => {
  await openToday(page);
  await expect(page.getByRole("region", { name: "Schedule" })).toBeVisible();
  await expect(page.locator("li.today-row")).not.toHaveCount(0);
  await expect(page.getByRole("region", { name: "At a glance" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Needs you" })).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Suggested next steps" }),
  ).toBeVisible();
});

test("Today on a club's first day says what to do next", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "duna-demo-club", value: "first-day", url: hqBaseUrl },
  ]);
  await openToday(page);
  await expect(page.getByText("Nothing on the schedule today")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create your first session" }),
  ).toHaveAttribute("href", "/events/create");
  await expect(
    page.getByText("Your numbers start with your first booking."),
  ).toBeVisible();
  await expect(
    page.getByText("Online payments isn't set up yet"),
  ).toBeVisible();
  await expect(
    page.getByRole("progressbar", {
      name: /1 of 6 steps done|of \d+ steps done/,
    }),
  ).toBeVisible();
});
