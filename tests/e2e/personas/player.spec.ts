import { expect, test } from "./support/fixtures";
import {
  expectNoHorizontalOverflow,
  expectNoLayoutShift,
  expectPageReady,
  openPlayerArea,
} from "./support/moves";

/**
 * Adult player: journeys PL-1 … PL-8 of docs/plan/persona-journeys.md on
 * Player web. The Player app journeys are listed in the document.
 */
test.use({ persona: "player" });

test.describe("PL-1 Find a game", () => {
  test("PL-1.1 Home puts direct actions and Next up first", async ({
    page,
  }) => {
    await openPlayerArea(page, "Home");
    const actions = page.getByRole("navigation", {
      name: "Primary actions",
    });
    await expect(
      actions.getByRole("link", { name: /Find a game/ }),
    ).toBeVisible();
    await expect(page.getByText("Next up", { exact: true })).toBeVisible();
    await expectNoLayoutShift(page);
  });
  test("PL-1.2 Search by where, when and what", async ({ page }) => {
    await openPlayerArea(page, "Find");
    await page.getByRole("button", { name: /^WHERE:/ }).click();
    const where = page.getByRole("dialog", {
      name: "Where do you want to play?",
    });
    await expect(where).toBeVisible();
    await where.getByRole("button", { name: "Close search" }).click();
    await expect(where).toBeHidden();
    await expect(page.getByRole("button", { name: /^WHEN:/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^WHAT:/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
  test("PL-1.3 Filter results to courts", async ({ page }) => {
    await openPlayerArea(page, "Find");
    await page.getByRole("button", { name: "Courts", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Courts", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  });
  test.fixme("PL-1.4 See results on the map with pins by zoom and satellite close in [P3, C3]", async () => {});
  test("PL-1.5 Opens a coach's profile and books their next opening", async ({
    page,
  }) => {
    await page.goto("/coaches/theopark");
    await expectPageReady(page, "Theo Park");
    await page
      .getByRole("main")
      .getByRole("link", { name: /^Book / })
      .first()
      .click();
    await expectPageReady(page, "Private lesson with Theo Park");
    // Let the page-change Cross (a 16 px slide) finish before measuring.
    await page.waitForFunction(() =>
      document
        .getAnimations()
        .every((animation) => animation.playState !== "running"),
    );
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("PL-2 Book a court with friends", () => {
  test.fixme("PL-2.1 Open a venue and pick a day, time and duration [P5]", async () => {
    // Evidence on main: venue pages say "Online rental details are coming
    // soon." in demo mode.
  });
  test.fixme("PL-2.2 Add friends to the booking [P5]", async () => {});
  test.fixme("PL-2.3 Split the payment so each friend pays a share [P5, B2]", async () => {
    // Expected: tier 2 confirm restating each share; idempotency key per
    // intent (court-checkout.ts already takes one).
  });
  test.fixme("PL-2.4 The confirmed booking Rises in and appears in Next up [P5]", async () => {});
});

test.describe("PL-3 Play", () => {
  test("PL-3.1 Host a pickup and publish it", async ({ page }) => {
    await page.goto("/app/pickup/new");
    await expectPageReady(page, "Host a match.");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByLabel("Where")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Publish pickup" }).click();
    await expect(
      page.getByRole("heading", { name: /is live\.$/ }),
    ).toBeVisible();
  });
  test("PL-3.2 Join an event through checkout", async ({ page }) => {
    await page.goto("/app/checkout/serve-receive-lab");
    await expectPageReady(page, "Join in a few clear steps.");
    await expect(
      page.getByText("Card details never touch Duna."),
    ).toBeVisible();
  });
});

test.describe("PL-4 Record a result and see the rating", () => {
  test("PL-4.1 Start recording a finished result", async ({ page }) => {
    await page.goto("/app/score");
    await expectPageReady(page, "How did you play?");
    await page
      .getByRole("textbox", { name: "Team A score for set 1" })
      .fill("21");
    await page
      .getByRole("textbox", { name: "Team B score for set 1" })
      .fill("18");
    await expect(
      page.getByRole("button", { name: "Record this match" }),
    ).toBeVisible();
  });
  test.fixme("PL-4.2 Record the match once everyone agreed, and see it in history [P8]", async () => {
    // Expected: single-flight submit; the result card shows per-set scores
    // and the green "Won" check.
  });
  test("PL-4.3 Match history shows the rating change per match", async ({
    page,
  }) => {
    await page.goto("/app/matches");
    await expectPageReady(page, "Your matches.");
    await expect(
      page.getByRole("tab", { name: /Sand Rating/ }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("link", { name: /SandRating/ }).first(),
    ).toBeVisible();
  });
  test.fixme("PL-4.4 The rating ring shows the new rating and progress to the next half point [P8, C1]", async () => {});
});

test.describe("PL-5 Watch film", () => {
  test.fixme("PL-5.1 Open the film library [P9]", async () => {
    // Evidence on main: /app/video renders "This page couldn't load" (a
    // Server Components error) in demo mode.
  });
  test.fixme("PL-5.2 Share a clip with a coach after a confirm [P9]", async () => {});
});

test.describe("PL-6 Membership and wallet", () => {
  test("PL-6.1 The wallet shows money, club credits and activity", async ({
    page,
  }) => {
    await openPlayerArea(page, "Wallet");
    await expect(
      page.getByRole("heading", { level: 1, name: "Wallet" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Your club cards" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Your Duna balance" }),
    ).toBeVisible();
  });
  test("PL-6.2 Premium shows an honest checkout state", async ({ page }) => {
    await openPlayerArea(page, "Settings");
    await expect(
      page.getByRole("heading", { name: "Duna Premium" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Checkout unavailable" }).first(),
    ).toBeDisabled();
  });
  test.fixme("PL-6.3 Club membership cards live in the wallet, with renew and cancel [P6]", async () => {
    // Expected: cancel is tier 1 and states when access ends.
  });
});

test.describe("PL-7 Connect", () => {
  test("PL-7.1 Messages open on the player's conversations", async ({
    page,
  }) => {
    await openPlayerArea(page, "Connect");
  });
  test.fixme("PL-7.2 Concierge threads tied to a booking, match or club [P7, B7]", async () => {});
});

test.describe("PL-8 Health", () => {
  test.fixme("PL-8.1 See health context around my game, only where data exists [P9]", async () => {});
});

test.describe("PL-9 Group sessions", () => {
  test.fixme("PL-9.1 Sees “Needs 2 more · confirms Thu 6:00 PM” on a session and shares the invite link [PART-8, PART-11]", async () => {});
  test.fixme("PL-9.2 Tries to book the same session twice; sees “You’re already booked” with “Add a player” [PART-8]", async () => {});
  test.fixme("PL-9.3 Cancels after the lock, acknowledging the final price; gets it back when the place is taken [PART-4, PART-8]", async () => {});
});
