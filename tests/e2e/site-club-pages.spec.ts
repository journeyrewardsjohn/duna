import { expect, test, type Page } from "@playwright/test";

/**
 * The pages a club sends its players to (SITE-5): the club page, an
 * offering, an event and a coach profile, on the design system in
 * app/(next). Demo mode: the demo clubs' storefronts come from
 * @duna/core/demo/storefront, the events and coaches from the demo data.
 * The demo actor is signed in here; the signed-out return path is a
 * visitor persona step (personas/visitor.spec.ts VI-2.5).
 */

const CLUB = "/clubs/south-bay-volleyball";
const PAGES = [
  { path: CLUB, h1: "South Bay Volleyball Club" },
  { path: `${CLUB}/products/serve-receive-clinic`, h1: "Serve-receive clinic" },
  { path: `${CLUB}/products/south-bay-membership`, h1: "South Bay membership" },
  { path: `${CLUB}/products/club-practice-jersey`, h1: "Club practice jersey" },
  { path: "/events/sunset-open-qualifier", h1: "Sunset Open — Qualifier" },
  { path: "/coaches/theopark", h1: "Theo Park" },
] as const;

/** Selectors that exist only in the legacy sheets (app/(legacy)). */
const LEGACY_MARKERS = [".site-loading", ".duna-loader", ".checkout-page"];

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(2);
}

async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  });
}

async function structuredTypes(page: Page): Promise<string[]> {
  const blocks = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  return blocks.flatMap((block) => {
    const value = JSON.parse(block) as { "@graph"?: { "@type": string }[] };
    return (value["@graph"] ?? []).map((node) => node["@type"]);
  });
}

test.describe("Club, offering, event and coach pages", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "Runs once; sets its own viewports",
    );
  });

  for (const { path, h1 } of PAGES) {
    test(`${path} renders with one Jost title at 1440 and 375 px`, async ({
      page,
    }) => {
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 375, height: 812 },
      ]) {
        await page.setViewportSize(viewport);
        const response = await page.goto(path);
        expect(response?.status(), path).toBeLessThan(400);
        await expect(page.locator("h1")).toHaveCount(1);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(h1);
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
          "href",
          new RegExp(`${path.split("?")[0]!.replaceAll("/", "\\/")}$`),
        );
        await expectNoHorizontalOverflow(page);
        await scrollThrough(page);
        await expectNoHorizontalOverflow(page);
      }
    });
  }

  test("no page loads a legacy stylesheet", async ({ page }) => {
    for (const { path } of PAGES) {
      await page.goto(path, { waitUntil: "load" });
      const css = await page.evaluate(() =>
        [...document.styleSheets]
          .map((sheet) => {
            try {
              return [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
            } catch {
              return "";
            }
          })
          .join("\n"),
      );
      expect(css.length, path).toBeGreaterThan(0);
      for (const marker of LEGACY_MARKERS) {
        expect(css.includes(`${marker} {`), `${path} ${marker}`).toBe(false);
      }
    }
  });

  test("the club page: three doors, this week, the card, places, coaches and structured data", async ({
    page,
  }) => {
    await page.goto(CLUB);
    const doors = page.getByRole("navigation", {
      name: "What you can do here",
    });
    for (const door of ["Play", "Train", "Join"]) {
      await expect(doors.getByText(door, { exact: true })).toBeVisible();
    }
    await expect(
      page.getByRole("heading", { name: "This week at a glance" }),
    ).toBeVisible();
    await expect(
      page
        .locator("#train")
        .getByText(/Needs 1 more|Minimum reached/)
        .first(),
    ).toBeVisible();
    await expect(
      page.locator("#join").getByRole("article", {
        name: "South Bay Volleyball Club membership card, as it will look in your wallet",
      }),
    ).toBeVisible();
    await expect(
      page.locator("#coaches").getByRole("link", { name: /Theo Park/ }),
    ).toHaveAttribute("href", "/coaches/theopark");
    await expect(
      page.locator("#places").getByRole("link", { name: /Directions/ }),
    ).toHaveAttribute("href", /^https:\/\/www\.google\.com\/maps\/search\//);
    await expect(
      page
        .locator("#places")
        .getByRole("link", { name: "More to play nearby" }),
    ).toHaveAttribute("href", /^\/discover\?where=place&/);
    await expect(
      page.locator("#places").getByText("Open now").first(),
    ).toBeVisible();
    const types = await structuredTypes(page);
    expect(types).toContain("SportsClub");
    expect(types).toContain("SportsActivityLocation");
    // Nobody who booked is named on a public page (the card carries only
    // the viewer's own name).
    await expect(page.getByText("Noa Williams")).toHaveCount(0);
  });

  test("club page → offering → checkout entry", async ({ page }) => {
    await page.goto(CLUB);
    await page
      .locator("#train")
      .getByRole("link", { name: "Serve-receive clinic" })
      .click();
    await expect(page).toHaveURL(/\/products\/serve-receive-clinic$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Serve-receive clinic" }),
    ).toBeVisible();
    await expect(page.getByText("If the group is too small")).toBeVisible();
    await expect(page.getByText(/all-in/).first()).toBeVisible();
    const book = page
      .getByRole("main")
      .getByRole("link", { name: "Book a place" })
      .first();
    await expect(book).toHaveAttribute(
      "href",
      "/clubs/south-bay-volleyball/products/serve-receive-clinic/checkout",
    );
    await book.click();
    await expect(page).toHaveURL(/\/serve-receive-clinic\/checkout$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Serve-receive clinic" }),
    ).toBeVisible();
    // Checkout is not indexed and claims no offering of its own.
    const checkoutTypes = await structuredTypes(page);
    expect(checkoutTypes).not.toContain("Service");
    expect(checkoutTypes).not.toContain("SportsClub");
  });

  test("membership shown as the club's card → join entry", async ({ page }) => {
    await page.goto(`${CLUB}#join`);
    const join = page.locator("#join");
    await join.getByRole("link", { name: /^Join for \$/ }).click();
    await expect(page).toHaveURL(/\/products\/south-bay-membership#join$/);
    await expect(
      page.getByRole("article", {
        name: "South Bay Volleyball Club membership card, as it will look in your wallet",
      }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Terms" })).toBeVisible();
    await expect(
      page
        .getByRole("main")
        .getByRole("link", { name: /^Join for \$/ })
        .first(),
    ).toHaveAttribute(
      "href",
      "/clubs/south-bay-volleyball/products/south-bay-membership/checkout",
    );
    expect(await structuredTypes(page)).toContain("Product");
  });

  test("goods show their options, sold out per option", async ({ page }) => {
    await page.goto(`${CLUB}/products/club-practice-jersey`);
    const options = page.getByRole("list").filter({ hasText: "Medium" });
    await expect(options.getByText("Sold out")).toBeVisible();
    await expect(options.getByText("4 left")).toBeVisible();
  });

  test("payment and sign-in returns keep landing in checkout", async ({
    page,
  }) => {
    await page.goto(`${CLUB}/products/serve-receive-clinic?checkout=cancelled`);
    await expect(page).toHaveURL(
      /\/serve-receive-clinic\/checkout\?checkout=cancelled$/,
    );
  });

  test("event page: final state, divisions in the shared words, no names", async ({
    page,
  }) => {
    await page.goto("/events/sunset-open-qualifier");
    await expect(
      page.getByText("Final", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Find your division" }),
    ).toBeVisible();
    await expect(
      page
        .locator("#divisions")
        .getByText(/spots? left|Full/)
        .first(),
    ).toBeVisible();
    // A finished event takes no registrations.
    await expect(
      page.locator("#divisions").getByRole("link", { name: "Register" }),
    ).toHaveCount(0);
    // The public field: seeds, then the waitlist; nobody without a public profile.
    const entries = page.locator("#entries");
    await expect(entries.getByText("Theo Park / Noa Williams")).toBeVisible();
    await expect(entries.getByText("Seed 2")).toBeVisible();
    await expect(entries.getByText("W1")).toBeVisible();
    await expect(page.getByText("Junior Private")).toHaveCount(0);
    // Results, and the full desk for the bracket.
    await expect(
      page.locator("#results").getByText("Final").first(),
    ).toBeVisible();
    const desk = page.getByRole("link", { name: "Bracket and results" });
    await expect(desk).toHaveAttribute(
      "href",
      "/events/sunset-open-qualifier/bracket",
    );
    await page.goto("/events/sunset-open-qualifier/bracket");
    await expect(
      page.getByRole("heading", { level: 1, name: /bracket and results/ }),
    ).toBeVisible();
    await expect(page.getByText("Junior Private")).toHaveCount(0);
    await page.goto("/events/sunset-open-qualifier");
    expect(await structuredTypes(page)).toContain("SportsEvent");
    // No live state on a finished event: Solar appears only for live.
    await expect(page.locator(".td-chip--live")).toHaveCount(0);
  });

  test("a pickup game leads into joining it", async ({ page }) => {
    await page.goto("/events/golden-hour-fours");
    await expect(
      page.getByRole("heading", { level: 1, name: "Golden Hour 4s" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("main")
        .getByRole("link", { name: "See the game" })
        .first(),
    ).toHaveAttribute("href", "/events/golden-hour-fours/pickup");
  });

  test("coach profile → booking entry", async ({ page }) => {
    await page.goto("/coaches/theopark");
    await expect(
      page.getByRole("heading", { name: "Next openings" }),
    ).toBeVisible();
    const book = page
      .getByRole("main")
      .getByRole("link", { name: /^Book / })
      .first();
    await expect(book).toHaveAttribute(
      "href",
      "/clubs/south-bay-volleyball/products/private-lesson-theo-park",
    );
    await book.click();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Private lesson with Theo Park",
      }),
    ).toBeVisible();
    await page.goto("/coaches/theopark");
    expect(await structuredTypes(page)).toContain("Person");
    await expect(
      page
        .locator("#clubs")
        .getByRole("link", { name: /South Bay Volleyball Club/ }),
    ).toHaveAttribute("href", CLUB);
  });

  test("a themed club in light and dark; an unthemed club stays Duna's", async ({
    page,
  }) => {
    for (const theme of ["light", "dark"] as const) {
      await page.addInitScript((value) => {
        localStorage.setItem("duna-theme", value);
      }, theme);
      await page.goto(CLUB);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const main = page.locator("main.club-page");
      await expect(main).toHaveAttribute("data-themed", "");
      const accent = await main.evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--club-accent").trim(),
      );
      const expected = await main.evaluate(
        (element, name) =>
          getComputedStyle(element).getPropertyValue(name).trim(),
        theme === "dark" ? "--club-accent-dark" : "--club-accent-light",
      );
      expect(accent.toUpperCase()).toBe(expected.toUpperCase());
      await expect(page.getByRole("heading", { level: 1 })).toHaveCSS(
        "color",
        theme === "dark" ? "rgb(244, 242, 236)" : "rgb(14, 26, 34)",
      );
    }
    await page.goto("/clubs/pier-avenue-sand-club");
    const plain = page.locator("main.club-page");
    await expect(plain).not.toHaveAttribute("data-themed", "");
    expect(
      await plain.evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--club-fill").trim(),
      ),
    ).toBe("");
  });

  test("a club that has not published, and one that does not exist", async ({
    page,
  }) => {
    await page.goto("/clubs/northside-indoor-collective");
    await expect(page.getByText("Not open for booking yet")).toBeVisible();
    // The route streams its loading skeleton first, so the status is sent
    // before the page knows; the not-found page and noindex say it instead.
    await page.goto("/clubs/no-such-club-anywhere");
    await expect(page.getByText("We can't find that club")).toBeVisible();
    await expect(
      page.locator('meta[name="robots"][content*="noindex"]').first(),
    ).toBeAttached();
    await expect(
      page.getByRole("link", { name: "Search clubs near you" }),
    ).toHaveAttribute("href", "/discover");
  });

  test("reduced motion: end states, nothing long-running", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const path of [CLUB, "/coaches/theopark"]) {
      await page.goto(path);
      await scrollThrough(page);
      const longest = await page.evaluate(() =>
        Math.max(
          0,
          ...document
            .getAnimations()
            .filter((animation) => animation.playState === "running")
            .map((animation) => {
              const timing = animation.effect?.getComputedTiming();
              return Number(timing?.duration ?? 0);
            }),
        ),
      );
      expect(longest, path).toBeLessThanOrEqual(250);
      // The page's action comes up at the thumb once the hero scrolls away.
      await expect(page.locator(".club-action")).toHaveAttribute(
        "data-shown",
        "true",
      );
    }
  });
});
