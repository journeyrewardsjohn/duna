import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./personas/support/a11y";

/**
 * The public site shell and home page on the Duna Design System (SITE-1,
 * docs/design/website.md §3.1, docs/design/web-shell.md): one h1 at every
 * width, the Where · When · What search reaching discovery with the
 * parameters it reads, the remembered audience, end states under reduced
 * motion, no legacy stylesheet in the new document, and an accessibility scan.
 */

/** Selectors that exist only in the legacy sheets (app/(legacy)). */
const LEGACY_MARKERS = [
  ".site-loading",
  ".site-audience-bar",
  ".duna-loader",
  ".mapboxgl-map",
];

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(2);
}

async function mockPlaces(page: Page) {
  await page.route("**/api/places/autocomplete**", (route) =>
    route.fulfill({
      json: {
        suggestions: [
          {
            placeId: "ChIJhermosa-beach-test",
            text: "Hermosa Beach, CA, USA",
            mainText: "Hermosa Beach",
            secondaryText: "CA, USA",
          },
        ],
      },
    }),
  );
  await page.route("**/api/places/details**", (route) =>
    route.fulfill({
      json: {
        placeId: "ChIJhermosa-beach-test",
        name: "Hermosa Beach",
        address: "Hermosa Beach, CA, USA",
        latitude: 33.8622,
        longitude: -118.3995,
      },
    }),
  );
}

test.describe("Home page and site shell", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "Runs once; sets its own viewports",
    );
  });

  test("renders with one h1 at desktop and 375 px, with no sideways scroll", async ({
    page,
  }) => {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 375, height: 812 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Meet you at the net.",
      );
      await expect(
        page.getByRole("search", { name: "Find a game" }),
      ).toBeVisible();
      for (const heading of [
        "From finding a game to knowing your level.",
        "Played somewhere we don’t know yet?",
        "The same game, from the other side of the net.",
        "Free to start, on both sides of the net.",
        "Two apps. One game.",
        "Better by the next rally.",
      ]) {
        await expect(
          page.getByRole("heading", { level: 2, name: heading }),
        ).toBeAttached();
      }
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        /^https?:\/\/[^/]+\/?$/,
      );
      await expectNoHorizontalOverflow(page);
      // Scroll the whole page: nothing that plays on view may widen it.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expectNoHorizontalOverflow(page);
    }
  });

  test("the search takes a place, a time and a kind to discovery", async ({
    page,
  }) => {
    await mockPlaces(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: /^Where/ }).click();
    const where = page.getByRole("combobox", { name: "Where" });
    await expect(where).toBeFocused();
    await where.fill("Herm");
    const place = page.getByRole("option", { name: /Hermosa Beach\s*CA, USA/ });
    await expect(place).toBeVisible();
    await place.click();
    // Choosing a place moves on to When.
    await page.getByRole("button", { name: "This weekend" }).click();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("button", { name: /^When/ })).toContainText(
      "This weekend",
    );
    await page.getByRole("button", { name: /^What/ }).click();
    await page.getByRole("button", { name: "Open games" }).click();
    await page.getByRole("button", { name: "Beach", exact: true }).click();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("button", { name: /^Where/ })).toContainText(
      "Hermosa Beach",
    );
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.waitForURL(/\/discover\/results\?/);
    const url = new URL(page.url());
    expect(url.searchParams.get("where")).toBe("place");
    expect(url.searchParams.get("location")).toBe("Hermosa Beach");
    expect(url.searchParams.get("lat")).toBe("33.86220");
    expect(url.searchParams.get("lng")).toBe("-118.39950");
    expect(url.searchParams.get("when")).toBe("custom");
    expect(url.searchParams.get("start")).toBeTruthy();
    expect(url.searchParams.get("what")).toBe("matches");
    expect(url.searchParams.get("surface")).toBe("beach");
    // The recent place is remembered on this device.
    const recent = await page.evaluate(() =>
      localStorage.getItem("duna-site-recent-places"),
    );
    expect(recent).toContain("Hermosa Beach");
  });

  test("a place nobody knows offers to add the court and a score", async ({
    page,
  }) => {
    await page.route("**/api/places/autocomplete**", (route) =>
      route.fulfill({ json: { suggestions: [] } }),
    );
    await page.goto("/");
    await page.getByRole("button", { name: /^Where/ }).click();
    await page.getByRole("combobox", { name: "Where" }).fill("Qzxv Lagoon");
    await expect(
      page.getByText(/We couldn’t find “Qzxv Lagoon”/),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Add the court and a score" }),
    ).toHaveAttribute("href", "/app/score");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: /^Where/ })).toBeFocused();
  });

  test("without a place-search key, Duna's own courts still show", async ({
    page,
  }) => {
    await page.route("**/api/places/autocomplete**", (route) =>
      route.fulfill({ status: 503, json: { error: "not configured" } }),
    );
    await page.goto("/");
    await page.getByRole("button", { name: /^Where/ }).click();
    await page.getByRole("combobox", { name: "Where" }).fill("Manhatan");
    await expect(
      page.getByText(
        "Place search is off right now. Clubs and courts on Duna still show.",
      ),
    ).toBeVisible();
  });

  test("the phone search is a full-screen sheet", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.getByRole("button", { name: /^When/ }).click();
    const sheet = page.getByRole("dialog", { name: "Find a game" });
    await expect(sheet).toBeVisible();
    const box = await sheet.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(800);
    await sheet.getByRole("button", { name: "Tonight" }).click();
    await sheet.getByRole("button", { name: "Search", exact: true }).click();
    await page.waitForURL(/\/discover\/results\?.*when=custom/);
  });

  test("the audience switch changes only the call to action and persists", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const header = page.getByRole("banner");
    const cta = header.locator(".site-header__cta");
    await expect(
      cta.getByRole("link", { name: "Find a game", exact: true }),
    ).toBeVisible();
    await header.getByRole("button", { name: "I run a club" }).click();
    await expect(
      header.getByRole("button", { name: "I run a club" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      cta.getByRole("link", { name: "Start your club", exact: true }),
    ).toBeVisible();
    await expect(
      cta.getByRole("link", { name: "Find a game", exact: true }),
    ).toBeHidden();
    // Nothing on the page is hidden by the choice.
    await expect(
      page.getByRole("search", { name: "Find a game" }),
    ).toBeAttached();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-audience", "run");
    await expect(
      cta.getByRole("link", { name: "Start your club", exact: true }),
    ).toBeVisible();
    await header.getByRole("button", { name: "I play" }).click();
    await expect(
      cta.getByRole("link", { name: "Find a game", exact: true }),
    ).toBeVisible();
  });

  test("the phone menu is a sheet with every page link", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    const menu = page.getByRole("dialog", { name: "Menu" });
    await expect(menu).toBeVisible();
    for (const name of [
      "Find a game",
      "Add a score",
      "For clubs",
      "For coaches",
      "Pro Tour",
      "Pricing",
    ]) {
      await expect(
        menu.getByRole("navigation").getByRole("link", { name, exact: true }),
      ).toBeVisible();
    }
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });

  test("reduced motion shows every concept at its end state", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
    });
    await expect(
      page.locator('[data-phase="armed"], [data-phase="play"]'),
    ).toHaveCount(0);
    await expect(
      page.getByText("Set won by Kai / Rio, 21–17").first(),
    ).toBeAttached();
    await expect(page.locator(".site-photo__video")).toHaveCount(0);
    const longest = await page.evaluate(() =>
      Math.max(
        0,
        ...document
          .getAnimations()
          .filter((animation) => animation.playState === "running")
          .map((animation) => {
            const timing = animation.effect?.getComputedTiming();
            return timing?.iterations === Infinity
              ? 0
              : Number(timing?.duration ?? 0);
          }),
      ),
    );
    expect(longest).toBeLessThanOrEqual(200);
  });

  test("new-shell pages never load a legacy stylesheet", async ({ page }) => {
    for (const path of ["/", "/legal", "/legal/cookies"]) {
      const sheets: string[] = [];
      page.on("response", async (response) => {
        if (response.request().resourceType() !== "stylesheet") return;
        sheets.push(await response.text().catch(() => ""));
      });
      await page.goto(path, { waitUntil: "load" });
      expect(sheets.length, path).toBeGreaterThan(0);
      for (const css of sheets) {
        for (const marker of LEGACY_MARKERS) {
          expect(
            css.includes(`${marker}{`) || css.includes(`${marker} {`),
            `${path} ${marker}`,
          ).toBe(false);
        }
      }
      page.removeAllListeners("response");
    }
  });

  test("the legal center works in the new shell", async ({ page }) => {
    await page.goto("/legal");
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Duna Legal Center" }),
    ).toBeVisible();
    await expect(page.locator("footer.site-footer")).toBeVisible();
    await page.getByRole("link", { name: "Cookie Policy" }).first().click();
    await expect(page).toHaveURL(/\/legal\/cookies$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Cookie Policy",
    );
  });

  test("/players moves home with a permanent redirect", async ({ request }) => {
    const response = await request.get("/players", { maxRedirects: 0 });
    expect(response.status()).toBe(301);
    expect(response.headers().location).toMatch(/\/$/);
  });

  test("passes the accessibility scan", async ({ page }) => {
    await page.goto("/");
    await expectAccessible(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await expectAccessible(page);
  });
});
