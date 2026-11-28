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

test.describe("VI-6 Add a score without an account", () => {
  test("VI-6.1 Adds a score and where they played, and sees what it would do", async ({
    page,
  }) => {
    await page.route("**/api/places/autocomplete**", (route) =>
      route.fulfill({ json: { suggestions: [] } }),
    );
    await page.goto("/add-score?where=Persona%20Point%20courts");
    await expectPageReady(page, "Add a score. See where you start.");
    await page
      .getByRole("button", {
        name: "Add “Persona Point courts” as a new court",
      })
      .click();
    await page
      .getByRole("textbox", { name: "Address or area" })
      .fill("North end of the beach path");
    await page.getByRole("button", { name: "Next: the score" }).click();
    await page.getByRole("button", { name: "Next: who played" }).click();
    await page
      .getByRole("textbox", { name: "Player 1", exact: true })
      .fill("Bo");
    await page
      .getByRole("checkbox", {
        name: "Everyone on court agreed to record this match.",
      })
      .click();
    await page.getByRole("button", { name: "See what it would do" }).click();
    await expect(
      page.getByText("What this result would do", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("New court", { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("VI-6.2 Saving it to their name asks them to sign up and comes back to the claim", async ({
    page,
  }) => {
    await page.route("**/api/places/autocomplete**", (route) =>
      route.fulfill({ json: { suggestions: [] } }),
    );
    // VI-6.1's draft is in this persona's browser only if it reused the
    // context; start one here so the step stands alone.
    await page.goto("/add-score?where=Persona%20Cove");
    await page
      .getByRole("button", { name: "Add “Persona Cove” as a new court" })
      .click();
    await page
      .getByRole("textbox", { name: "Address or area" })
      .fill("By the lifeguard tower");
    await page.getByRole("button", { name: "Next: the score" }).click();
    await page.getByRole("button", { name: "Next: who played" }).click();
    await page
      .getByRole("textbox", { name: "Player 1", exact: true })
      .fill("Cy");
    await page
      .getByRole("checkbox", {
        name: "Everyone on court agreed to record this match.",
      })
      .click();
    await page.getByRole("button", { name: "See what it would do" }).click();
    await expect(
      page.getByRole("link", { name: "Create my account" }),
    ).toHaveAttribute("href", "/sign-up?returnTo=%2Fadd-score%2Fclaim");
    await expect(
      page.getByRole("link", { name: "I have an account" }),
    ).toHaveAttribute("href", "/sign-in?returnTo=%2Fadd-score%2Fclaim");
    // Signed out, the claim page sends them to sign in and back.
    await page.goto("/add-score/claim");
    await page.waitForURL(/\/sign-in\?returnTo=%2Fadd-score%2Fclaim/);
  });

  test("VI-6.3 A search that finds nothing offers to add the court and a score", async ({
    page,
  }) => {
    await page.route("**/api/places/autocomplete**", (route) =>
      route.fulfill({ json: { suggestions: [] } }),
    );
    await page.goto("/");
    await page
      .getByRole("button", { name: /^Where/ })
      .first()
      .click();
    await page
      .getByRole("combobox", { name: "Where" })
      .fill("Qzxv Persona Lagoon");
    await expect(
      page.getByRole("link", { name: "Add the court and a score" }),
    ).toHaveAttribute("href", "/add-score?where=Qzxv%20Persona%20Lagoon");
  });
});
