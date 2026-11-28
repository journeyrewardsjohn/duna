import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./personas/support/a11y";

/**
 * Add a score without an account (SITE-3, docs/design/website.md 2.5,
 * docs/product/add-score.md): the whole flow at 375 px and desktop with the
 * place search mocked, adding a place nobody knows, resuming a draft, the
 * quiet message when place search is busy, no legacy stylesheet, the
 * accessibility scan and reduced motion. In demo mode the draft lives in the
 * server's memory and the desktop project is signed in as the demo player,
 * so the claim lands on the match in the app.
 */

/** Selectors that exist only in the legacy sheets (app/(legacy)). */
const LEGACY_MARKERS = [".site-loading", ".site-audience-bar", ".duna-loader"];

/**
 * Each test is its own visitor on its own address: the anonymous draft
 * budget (12 new drafts an hour per address) never leaks between tests.
 */
async function asNewVisitor(page: Page) {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `10.${octet()}.${octet()}.${octet()}`,
  });
}

async function mockPlaces(page: Page) {
  await page.route("**/api/places/autocomplete**", (route) =>
    route.fulfill({
      json: {
        suggestions: [
          {
            placeId: "ChIJdockside-test-01",
            text: "Dockside Sand Courts, Harbor Way",
            mainText: "Dockside Sand Courts",
            secondaryText: "Harbor Way",
          },
        ],
      },
    }),
  );
  await page.route("**/api/places/details**", (route) =>
    route.fulfill({
      json: {
        placeId: "ChIJdockside-test-01",
        name: "Dockside Sand Courts",
        address: "1 Harbor Way",
        latitude: 33.9,
        longitude: -118.42,
      },
    }),
  );
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(2);
}

async function choosePlace(page: Page) {
  const where = page.getByRole("combobox", { name: "Where did you play" });
  await where.fill("Docks");
  await page
    .getByRole("option", { name: /Dockside Sand Courts\s*Harbor Way/ })
    .click();
  await expect(page.getByText("Dockside Sand Courts").first()).toBeVisible();
  await page.getByRole("button", { name: "Next: the score" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "What was the score?" }),
  ).toBeFocused();
}

async function enterPlayers(page: Page) {
  await page.getByRole("button", { name: "Next: who played" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Who played?" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Your partner", exact: true })
    .fill("Ana");
  await page.getByRole("textbox", { name: "Player 1", exact: true }).fill("Bo");
  // The agreement is required, and said in place.
  await page.getByRole("button", { name: "See what it would do" }).click();
  await expect(
    page.getByText(
      "Everyone on court needs to agree before a match is recorded.",
    ),
  ).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: "Everyone on court agreed to record this match.",
    })
    .click();
  await page.getByRole("button", { name: "See what it would do" }).click();
}

test.describe("Add a score without an account", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "Runs once; sets its own viewports",
    );
    await asNewVisitor(page);
  });

  for (const viewport of [
    { width: 375, height: 812 },
    { width: 1440, height: 900 },
  ]) {
    test(`the whole flow at ${viewport.width} px, then saved to the account`, async ({
      page,
    }) => {
      await mockPlaces(page);
      await page.setViewportSize(viewport);
      await page.goto("/add-score");
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Add a score. See where you start.",
      );
      await expect(
        page.getByText(/No account needed\. We keep this score/),
      ).toBeVisible();
      await expect(page.getByText("Powered by Google")).toBeHidden();
      await choosePlace(page);

      // The score: a live NetScore of what is entered.
      await page.getByRole("radio", { name: "2 v 2" }).click();
      const live = page.locator(".as-live");
      await expect(live).toContainText("21");
      await expect(live).toContainText("Awaiting confirmation");
      await page.getByRole("button", { name: "Add a set" }).click();
      await expect(
        page.getByText(/One set doesn’t look finished/),
      ).toBeVisible();
      await page.getByRole("button", { name: "Remove set 4" }).click();
      await expect(
        page.getByText(/One set doesn’t look finished/),
      ).toBeHidden();
      await enterPlayers(page);

      // What this result would do: never a rating.
      const result = page.getByRole("region", {
        name: "Here’s what this result would do.",
      });
      await expect(result).toContainText("What this result would do");
      await expect(result).toContainText(
        /a win like this moves a player new to Duna from 3\.00 to 3\.\d\d \(\+0\.\d\d\)/,
      );
      await expect(result).not.toContainText("~");
      await expect(result).toContainText("Dockside Sand Courts");
      await expect(result).toContainText("New court");
      await expectNoHorizontalOverflow(page);

      // Signed in (the demo player): save it and land on the match.
      await page.getByRole("link", { name: "Save to my account" }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Save your score." }),
      ).toBeVisible();
      const lastNames = page.getByRole("textbox", {
        name: "Last name or initial",
      });
      await expect(lastNames).toHaveCount(3);
      await page.getByRole("button", { name: "Save to my account" }).click();
      await expect(
        page.getByText("Add a last name or an initial.").first(),
      ).toBeVisible();
      await lastNames.nth(0).fill("K");
      await lastNames.nth(1).fill("R");
      await page.getByRole("textbox", { name: "First name" }).nth(2).fill("Cy");
      await lastNames.nth(2).fill("Lee");
      await page
        .getByRole("textbox", { name: /Phone or email/ })
        .nth(1)
        .fill("310 555 0100");
      await page.getByRole("button", { name: "Save to my account" }).click();
      await expect(
        page.getByText(/full number with its country code/),
      ).toBeVisible();
      await page
        .getByRole("textbox", { name: /Phone or email/ })
        .nth(1)
        .fill("+1 310 555 0100");
      await page.getByRole("button", { name: "Save to my account" }).click();
      await page.waitForURL(/\/app\/matches\/[0-9a-f-]{36}$/);

      // The draft is gone from this browser: a fresh start.
      await page.goto("/add-score");
      await expect(
        page.getByRole("heading", { level: 2, name: "Where did you play?" }),
      ).toBeVisible();
      await expect(page.getByText("Welcome back")).toBeHidden();
    });
  }

  test("a place nobody knows becomes a new court, from the home search's text", async ({
    page,
  }) => {
    await page.route("**/api/places/autocomplete**", (route) =>
      route.fulfill({ json: { suggestions: [] } }),
    );
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/add-score?where=Qzxv%20Lagoon");
    await expect(
      page.getByText(/We couldn’t find “Qzxv Lagoon”/),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Add “Qzxv Lagoon” as a new court" })
      .click();
    await expect(page.getByRole("textbox", { name: "Court name" })).toHaveValue(
      "Qzxv Lagoon",
    );
    await page.getByRole("button", { name: "Next: the score" }).click();
    // An address or a pin is needed to find the court: said in place.
    const address = page.getByRole("textbox", { name: "Address or area" });
    await expect(address).toBeFocused();
    await expect(
      page.getByText(/Add an address or use where you are now/),
    ).toBeVisible();
    await address.fill("End of the lagoon path");
    await expect(
      page.getByText(/We check new courts before they’re listed for everyone/),
    ).toBeVisible();
    await page.getByRole("button", { name: "Next: the score" }).click();
    await expect(
      page.getByRole("heading", { level: 2, name: "What was the score?" }),
    ).toBeVisible();
  });

  test("coming back resumes the draft, and Start over deletes it", async ({
    page,
  }) => {
    await mockPlaces(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/add-score");
    await choosePlace(page);
    await page.reload();
    await expect(page.getByText("Welcome back")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "What was the score?" }),
    ).toBeVisible();
    await page
      .locator(".td-notice")
      .getByRole("button", { name: "Start over" })
      .click();
    await page.getByRole("button", { name: "Delete and start over" }).click();
    await expect(
      page.getByText("Deleted. Start a new score whenever you like."),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByText("Welcome back")).toBeHidden();
    await expect(
      page.getByRole("heading", { level: 2, name: "Where did you play?" }),
    ).toBeVisible();
  });

  test("busy place search says so quietly; Duna's own courts still show", async ({
    page,
  }) => {
    await page.route("**/api/places/autocomplete**", (route) =>
      route.fulfill({
        status: 429,
        headers: { "Retry-After": "5" },
        json: {
          error: "Lots of searches just now. Try again in a few seconds.",
        },
      }),
    );
    await page.goto("/add-score");
    await page
      .getByRole("combobox", { name: "Where did you play" })
      .fill("Manhatan");
    await expect(
      page.getByText(
        /Lots of searches just now\. Try again in a few seconds\./,
      ),
    ).toBeVisible();
    // Duna's own clubs and courts are listed first, with their marks.
    await expect(page.getByRole("option").first()).toBeVisible();
  });

  test("no legacy stylesheet, an accessible page, and end states under reduced motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/add-score");
    await expect(
      page.getByRole("heading", { level: 2, name: "Where did you play?" }),
    ).toBeVisible();
    for (const marker of LEGACY_MARKERS) {
      await expect(page.locator(marker)).toHaveCount(0);
    }
    const sheets = await page.evaluate(() =>
      [...document.styleSheets].map((sheet) => sheet.href ?? "inline"),
    );
    expect(sheets.join(" ")).not.toMatch(
      /globals|design-v3|design-v4|public-website|player-focus/,
    );
    await expectAccessible(page);
    // The panel shows at its end state (no Rise left half-way).
    await expect
      .poll(() =>
        page
          .locator(".as-panel")
          .first()
          .evaluate((element) => Number(getComputedStyle(element).opacity)),
      )
      .toBe(1);
    // Reduced motion: a short fade, never a Rise from below.
    const transform = await page
      .locator(".as-panel")
      .first()
      .evaluate((element) => getComputedStyle(element).transform);
    expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(transform);
    await expect(page.locator(".site-thumb")).toHaveCount(0);
  });
});
