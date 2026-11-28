import { expect, test } from "./support/fixtures";
import {
  expectNoHorizontalOverflow,
  expectNoLayoutShift,
  expectPageReady,
} from "./support/moves";

/**
 * New visitor with no account: journeys VI-1 … VI-5 of
 * docs/plan/persona-journeys.md. The persona has no actor at all.
 */
test.use({ persona: "visitor" });

test.describe("VI-1 Arrive and choose an audience", () => {
  test("VI-1.1 The home page leads with the search and offers the audience choice", async ({
    page,
  }) => {
    await page.goto("/");
    await expectPageReady(page, "Meet you at the net.");
    await expect(
      page.getByRole("search", { name: "Find a game" }),
    ).toBeVisible();
    await expect(
      page.getByRole("group", { name: "I am here to" }).first(),
    ).toBeVisible();
    await expectNoLayoutShift(page);
    await expectNoHorizontalOverflow(page);
  });
  test("VI-1.2 'I run a club' changes the call to action and is remembered", async ({
    page,
  }) => {
    await page.goto("/");
    const header = page.getByRole("banner");
    await header
      .getByRole("group", { name: "I am here to" })
      .getByRole("button", { name: "I run a club" })
      .click();
    await expect(
      header
        .locator(".site-header__cta")
        .getByRole("link", { name: "Start your club", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      header
        .locator(".site-header__cta")
        .getByRole("link", { name: "Start your club", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Meet you at the net.",
    );
  });
});

test.describe("VI-2 Look around without an account", () => {
  test("VI-2.1 Discover play without signing in", async ({ page }) => {
    await page.goto("/discover");
    await expectPageReady(page, "Find your game.");
    await expect(page.getByRole("button", { name: /^WHERE:/ })).toBeVisible();
  });
  test("VI-2.2 Open a public event page", async ({ page }) => {
    await page.goto("/events/sunset-open-qualifier");
    await expectPageReady(page, /Sunset Open/);
  });
  test("VI-2.3 Open a club's public page", async ({ page }) => {
    await page.goto("/clubs/south-bay-volleyball");
    await expectPageReady(page, "South Bay Volleyball Club");
  });
  test("VI-2.4 Read the rankings", async ({ page }) => {
    await page.goto("/rankings");
    await expectPageReady(page);
  });
});

test.describe("VI-3 Decide to book", () => {
  test("VI-3.1 A public checkout explains what happens next", async ({
    page,
  }) => {
    await page.goto("/checkout/serve-receive-lab");
    await expectPageReady(page, "Review your place on the sand.");
  });
  test.fixme("VI-3.2 Booking asks the visitor to sign in and returns them to the same place [P1]", async () => {
    // Evidence on main: with no actor, every /app page renders "This page
    // couldn't load" in demo mode; in production the proxy redirects first.
    // Expected: a designed signed-out state with sign-in and sign-up that
    // keeps returnTo.
  });
});

test.describe("VI-4 Join", () => {
  test("VI-4.1 Sign-up offers a secure account hand-off", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(
      page.getByRole("link", { name: "Create my Duna account" }),
    ).toBeVisible();
  });
  test.fixme("VI-4.2 After sign-up, onboarding asks who the account is for (me, my junior, my club) [P1]", async () => {});
});

test.describe("VI-5 Clubs and machines", () => {
  test("VI-5.1 A club organiser starts an event without an account", async ({
    page,
  }) => {
    await page.goto("/create");
    await expectPageReady(page, "Put your event on Duna.");
  });
  test("VI-5.2 Every public page has a Markdown companion", async ({
    request,
  }) => {
    const response = await request.get("/index.md");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toMatch(/markdown|text\/plain/);
  });
});
