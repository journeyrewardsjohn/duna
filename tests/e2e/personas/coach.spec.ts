import { expect, hq, test } from "./support/fixtures";
import { expectPageReady, openHqArea } from "./support/moves";

/**
 * Coach: journeys CH-1 … CH-8 of docs/plan/persona-journeys.md, on the web
 * surfaces (HQ as staff). The Pro app journeys are listed in the document;
 * they have no device harness yet.
 */
test.use({ persona: "coach" });

test.describe("CH-1 Set availability", () => {
  test.fixme("CH-1.1 Set weekly availability with effective dates [B3a, H5]", async () => {
    // Expected: Team › me › Availability; autosaved draft; conflicts named.
  });
  test.fixme("CH-1.2 Add time off and a blackout, and see what it uncovers [B3a, H5]", async () => {});
});

test.describe("CH-2 See today", () => {
  test("CH-2.1 Today lists the day's sessions", async ({ page }) => {
    await openHqArea(page, "Today");
    await expect(
      page.getByRole("link", { name: /open session operations/ }).first(),
    ).toBeVisible();
  });
  test("CH-2.2 Schedule shows the day by coach", async ({ page }) => {
    await openHqArea(page, "Schedule");
    await page.getByRole("button", { name: "Coaches" }).click();
    await expect(page.getByRole("button", { name: "Coaches" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

test.describe("CH-3 Run and check in a session", () => {
  test("CH-3.1 Open the session from Today", async ({ page }) => {
    await openHqArea(page, "Today");
    await page
      .getByRole("link", {
        name: /Sunset doubles training.*open session operations/,
      })
      .click();
    await expect(page).toHaveURL(/\/events\/[^/]+$/);
    await expect(
      page.getByRole("heading", { name: "Sunset doubles training" }).first(),
    ).toBeVisible();
  });
  test.fixme("CH-3.2 Check players in, with Undo for a mistaken tap [H2]", async () => {
    // Expected: tier 0 (reversible) with an Undo toast; the roster count
    // Rallies on change.
  });
});

test.describe("CH-4 Score a match", () => {
  test.fixme("CH-4.1 Score a match point by point from the session, offline-tolerant [H2, C1]", async () => {
    // Expected: NetScore with one state per match_status; a score change
    // Rallies the changed digit; reduced motion shows the end state.
  });
  test.fixme("CH-4.2 Finish the match and publish the result after a confirm [H9]", async () => {});
});

test.describe("CH-5 Notes and messages", () => {
  test.fixme("CH-5.1 Write an after-practice note for the program [H6]", async () => {});
  test.fixme("CH-5.2 Message a player or a parent about a session [H3]", async () => {});
});

test.describe("CH-6 Get paid", () => {
  test.fixme("CH-6.1 See my sessions, pay period and expected pay [H5, B3b]", async () => {});
  test.fixme("CH-6.2 Receive contractor payouts to my own account [B3c]", async () => {});
  test("CH-6.3 A coach who opens Money sees 'You need access', not an error page", async ({
    page,
  }) => {
    for (const path of ["/payments", "/payments/transactions"]) {
      const response = await page.goto(hq(path));
      expect(response?.status()).toBe(200);
      await expectPageReady(page, "Money");
      await expect(
        page.getByText("You don't have access to Money"),
      ).toBeVisible();
      await expect(page.getByText(/Ask .* to give you access/)).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Back to HQ" }),
      ).toBeVisible();
      await expect(page.getByText("This page didn’t load")).toHaveCount(0);
    }
  });
});

test.describe("CH-7 Plan practice", () => {
  test("CH-7.1 Open the practice plan builder", async ({ page }) => {
    await page.goto(hq("/training/practice-plans/create"));
    await expectPageReady(page, "Compose the practice.");
  });
  test("CH-7.2 Start a drill from a description", async ({ page }) => {
    await page.goto(hq("/training/drills/create"));
    await expectPageReady(page, /Describe the drill/);
  });
  test.fixme("CH-7.3 Build a plan with totals, diagrams and coach mode, then print it [H7, B6b]", async () => {});
  test.fixme("CH-7.4 Create a drill with AI placing the players, then edit and version it [B6d, H8]", async () => {});
});

test.describe("CH-8 Training programs", () => {
  test("CH-8.1 Training opens on the coach's programs", async ({ page }) => {
    await openHqArea(page, "Training");
  });
  test.fixme("CH-8.2 Open a program's roster and schedule tabs [H6, S3]", async () => {});
});
