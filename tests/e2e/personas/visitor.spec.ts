import { expect, test, webBaseUrl } from "./support/fixtures";
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
  test("VI-2.5 Booking from a club's offering asks the visitor to sign in and returns them to its checkout", async ({
    page,
  }) => {
    await page.goto(
      "/clubs/south-bay-volleyball/products/serve-receive-clinic",
    );
    await expectPageReady(page, "Serve-receive clinic");
    const returnTo =
      "/clubs/south-bay-volleyball/products/serve-receive-clinic/checkout";
    const book = page
      .getByRole("main")
      .getByRole("link", { name: "Book a place" })
      .first();
    await expect(book).toHaveAttribute(
      "href",
      new RegExp(`^/sign-in\\?returnTo=${encodeURIComponent(returnTo)}&`),
    );
    await book.click();
    await expect(
      page.getByRole("link", { name: "Sign in and continue" }),
    ).toHaveAttribute(
      "href",
      `/sign-in/start?returnTo=${encodeURIComponent(returnTo)}`,
    );
  });
  test("VI-2.6 A club's membership is shown as its card, and Join leads to the offer", async ({
    page,
  }) => {
    await page.goto("/clubs/south-bay-volleyball");
    await expectPageReady(page, "South Bay Volleyball Club");
    const join = page.locator("#join");
    await expect(
      join.getByRole("article", {
        name: "South Bay Volleyball Club membership card, as it will look in your wallet",
      }),
    ).toBeVisible();
    await expect(join.getByText("Your name", { exact: true })).toBeVisible();
    await join.getByRole("link", { name: /^Join for \$/ }).click();
    await expectPageReady(page, "South Bay membership");
    // Let the page-change Cross (a 16 px slide) finish before measuring.
    await page.waitForFunction(() =>
      document
        .getAnimations()
        .every((animation) => animation.playState !== "running"),
    );
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("VI-3 Decide to book", () => {
  test("VI-3.1 A public checkout explains what happens next", async ({
    page,
  }) => {
    await page.goto("/checkout/serve-receive-lab");
    await expectPageReady(page, "Review your place on the sand.");
  });
  test("VI-3.2 Booking asks the visitor to sign in and returns them to the same place", async ({
    page,
  }) => {
    await page.goto("/app/checkout/serve-receive-lab");
    await expect(page).toHaveURL(
      /\/sign-in\?returnTo=%2Fapp%2Fcheckout%2Fserve-receive-lab$/,
    );
  });
});

test.describe("VI-4 Join", () => {
  test("VI-4.1 Sign-up offers a secure account hand-off", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(
      page.getByRole("link", { name: "Create my Duna account" }),
    ).toBeVisible();
  });
});

test.describe("VI-4 Join (signed up)", () => {
  // Signed in as a player with nothing set up yet (the demo "first day").
  test.use({ persona: "player" });
  test("VI-4.2 After sign-up, onboarding asks who the account is for (me, my junior, my club)", async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: "duna-demo-player", value: "first-day", url: webBaseUrl },
    ]);
    await page.goto("/app");
    await expectPageReady(page);
    const who = page.getByRole("region", { name: "Who is Duna for?" });
    await expect(who.getByRole("link", { name: /^Me/ })).toHaveAttribute(
      "href",
      "/app/onboarding",
    );
    await expect(who.getByRole("link", { name: /My junior/ })).toBeVisible();
    await expect(who.getByRole("link", { name: /My club/ })).toBeVisible();
  });
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
    // The first click can land before the page is interactive: retry it.
    await expect(async () => {
      await page
        .getByRole("button", {
          name: "Add “Persona Point courts” as a new court",
        })
        .click();
      await expect(
        page.getByRole("textbox", { name: "Court name" }),
      ).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
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
    // The first click can land before the page is interactive: retry it.
    await expect(async () => {
      await page
        .getByRole("button", { name: "Add “Persona Cove” as a new court" })
        .click();
      await expect(
        page.getByRole("textbox", { name: "Court name" }),
      ).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
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
