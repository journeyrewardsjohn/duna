import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./personas/support/a11y";

/**
 * Find a game (SITE-4): the home search landing on `/discover`, results that
 * update without a reload, filters and the back button, the list / map
 * switch with its sheet at 375 px, no results → add a score with the place
 * carried over, busy place search, the keyboard path, the venue page and its
 * structured data, old addresses, no legacy stylesheet, no sideways scroll
 * and reduced motion. Demo mode: the feed has Duna's three demo venues (the
 * demo sessions are in the past), and there is no map key in CI, so the map
 * shows its honest not-configured state.
 */

const LEGACY_SHEETS = /globals|design-v3|design-v4|public-website|player-focus/;

async function expectNoHorizontalOverflow(page: Page) {
  // Measured once the page's Cross-in (16 to 24 px of travel) has settled.
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    )
    .toBeLessThanOrEqual(2);
}

async function wide(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
}

test.describe("find a game", () => {
  // Each test is its own visitor: the public API's per-address budget is
  // shared by the whole desktop project otherwise.
  test.beforeEach(async ({ page }) => {
    const octet = () => Math.floor(Math.random() * 250) + 1;
    await page.setExtraHTTPHeaders({
      "x-forwarded-for": `10.${octet()}.${octet()}.${octet()}`,
    });
  });

  test("home search → results → venue → how to book", async ({ page }) => {
    await wide(page);
    await page.route("**/api/places/autocomplete**", (route) =>
      route.fulfill({ json: { suggestions: [] } }),
    );
    await page.goto("/");
    await page.getByRole("button", { name: /^Where/ }).click();
    await page.getByRole("combobox", { name: "Where" }).fill("Hermosa");
    await page
      .getByRole("option", { name: /Hermosa Beach — Pier Courts/ })
      .click();
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.waitForURL(/\/discover\?.*venue=/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Games near Hermosa Beach — Pier Courts",
    );
    await expect(
      page.getByRole("status").filter({ hasText: /results? within/ }),
    ).toBeVisible();
    const venue = page
      .getByRole("link", { name: "Hermosa Beach — Pier Courts", exact: true })
      .first();
    await venue.click();
    await page.waitForURL(/\/venues\/[\w-]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Hermosa Beach — Pier Courts",
    );
    await expect(
      page.getByRole("heading", { level: 2, name: "Book a court" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Conditions now" }),
    ).toBeVisible();
    const jsonLd = await page
      .locator('script[type="application/ld+json"]')
      .first()
      .textContent();
    expect(jsonLd).toContain("SportsActivityLocation");
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("filters update the results without a reload, and Back undoes them", async ({
    page,
  }) => {
    await wide(page);
    await page.goto("/discover?where=Hermosa");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Games near Hermosa Beach — Pier Courts",
    );
    await page.evaluate(() => {
      (window as unknown as { dvMarker: boolean }).dvMarker = true;
    });
    const courts = page.getByRole("button", {
      name: "Court time",
      exact: true,
    });
    await courts.click();
    await page.waitForURL(/what=court/);
    await expect(courts).toHaveAttribute("aria-pressed", "true");
    // No full page load happened.
    expect(
      await page.evaluate(
        () => (window as unknown as { dvMarker?: boolean }).dvMarker,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("heading", { name: "Courts, clubs and coaches" }),
    ).toBeVisible();
    await page.goBack();
    await expect(page).not.toHaveURL(/what=court/);
    await expect(courts).toHaveAttribute("aria-pressed", "false");
  });

  test("at 375 px the list and the map switch, with the results in a sheet", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/discover");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Find a game",
    );
    await expectNoHorizontalOverflow(page);
    await page.getByRole("radio", { name: "Map" }).click();
    await page.waitForURL(/view=map/);
    const sheet = page.getByRole("region", { name: /Results sheet/ });
    await expect(sheet).toBeVisible();
    await expect(
      page
        .getByText("The discovery map isn't set up yet")
        .or(page.getByRole("button", { name: "Show satellite" })),
    ).toBeVisible();
    const handle = sheet.getByRole("button", { name: /^Results:/ });
    await expect(handle).toHaveAccessibleName(/half open/);
    await handle.click();
    await expect(handle).toHaveAccessibleName(/open\. Tap/);
    await page.getByRole("radio", { name: "List" }).click();
    await expect(page).not.toHaveURL(/view=map/);
    await expectNoHorizontalOverflow(page);
  });

  test("no results offers wider searches and adds a score for the typed place", async ({
    page,
  }) => {
    await wide(page);
    await page.goto(
      "/discover?where=place&location=Qzxv%20Lagoon&lat=0&lng=0&r=5",
    );
    await expect(
      page.getByRole("heading", { name: /No games match in Qzxv Lagoon/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Widen to 10 mi" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Nearest to Qzxv Lagoon" }),
    ).toBeVisible();
    const add = page
      .getByRole("region", { name: /No games match/ })
      .getByRole("link", { name: "Add a score", exact: true });
    await expect(add).toHaveAttribute("href", "/add-score?where=Qzxv%20Lagoon");
    await add.click();
    await page.waitForURL(/\/add-score\?where=Qzxv/);
  });

  test("busy place search says so quietly and Duna's courts still show", async ({
    page,
  }) => {
    await wide(page);
    await page.route("**/api/places/autocomplete**", (route) =>
      route.fulfill({
        status: 429,
        headers: { "Retry-After": "5" },
        json: {
          error: "Lots of searches just now. Try again in a few seconds.",
        },
      }),
    );
    await page.goto("/discover");
    await page.getByRole("button", { name: /^Where:/ }).click();
    await page
      .getByRole("combobox", { name: "Where do you want to play?" })
      .fill("Manhatan");
    await expect(
      page.getByText(
        /Lots of searches just now\. Try again in a few seconds\./,
      ),
    ).toBeVisible();
    await expect(page.getByRole("option").first()).toBeVisible();
  });

  test("the keyboard alone can search and open a result", async ({ page }) => {
    await wide(page);
    await page.route("**/api/places/autocomplete**", (route) =>
      route.fulfill({ json: { suggestions: [] } }),
    );
    await page.goto("/discover");
    await page.getByRole("button", { name: /^Where:/ }).focus();
    await page.keyboard.press("Enter");
    const where = page.getByRole("combobox", {
      name: "Where do you want to play?",
    });
    await expect(where).toBeFocused();
    await page.keyboard.type("Manhattan Beach Pier");
    await expect(page.getByRole("option").first()).toBeVisible();
    await page.keyboard.press("Enter");
    await page.waitForURL(/venue=/);
    await page.keyboard.press("Escape");
    const first = page.locator(".dv-row__link").first();
    await first.focus();
    await expect(first).toBeFocused();
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/(venues|clubs|coaches|events)\//);
  });

  test("old addresses keep their query string", async ({ page }) => {
    await page.goto("/discover/results?where=anywhere&what=court-rentals");
    await expect(page).toHaveURL(
      /\/discover\?where=anywhere&what=court-rentals$/,
    );
    await expect(
      page.getByRole("button", { name: "Court time", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.goto("/discover/map?when=next-7-days");
    await expect(page).toHaveURL(/\/discover\?when=next-7-days&view=map$/);
  });

  test("no legacy stylesheet, an accessible page, end states under reduced motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await wide(page);
    await page.goto("/discover");
    await expect(page.locator(".dv-row").first()).toBeVisible();
    const sheets = await page.evaluate(() =>
      [...document.styleSheets].map((sheet) => sheet.href ?? "inline"),
    );
    expect(sheets.join(" ")).not.toMatch(LEGACY_SHEETS);
    await expectAccessible(page);
    await expect
      .poll(() =>
        page
          .locator(".dv-row")
          .first()
          .evaluate((element) => Number(getComputedStyle(element).opacity)),
      )
      .toBe(1);
    const transform = await page
      .locator(".dv-row")
      .first()
      .evaluate((element) => getComputedStyle(element).transform);
    expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(transform);
    await expect(page.locator(".site-thumb")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test("the venue page has no legacy stylesheet and no sideways scroll at 375 px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/venues/10000000-0000-4000-8000-000000000002");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Manhattan Beach Pier",
    );
    const sheets = await page.evaluate(() =>
      [...document.styleSheets].map((sheet) => sheet.href ?? "inline"),
    );
    expect(sheets.join(" ")).not.toMatch(LEGACY_SHEETS);
    await expectNoHorizontalOverflow(page);
  });

  test("without a map key the public sees no map panel and no setup message", async ({
    page,
    context,
    baseURL,
  }) => {
    // Demo-only switch: view as a member of the public (no map key in CI).
    await context.addCookies([
      { name: "duna-demo-visitor", value: "public", url: baseURL! },
    ]);
    await wide(page);
    await page.goto("/discover");
    await expect(page.locator(".dv-row").first()).toBeVisible();
    await expect(page.getByText(/map key|isn't set up yet/)).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: /Map of results/ }),
    ).toHaveCount(0);
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByRole("radio", { name: "Map" })).toHaveCount(0);
    await page.goto("/venues/10000000-0000-4000-8000-000000000002");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Manhattan Beach Pier",
    );
    await page.mouse.wheel(0, 2000);
    await expect(page.getByText(/map key|isn't set up yet/)).toHaveCount(0);
    await expect(
      page
        .getByRole("complementary", { name: "Getting there" })
        .getByRole("link", { name: "Get directions" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
