import { expect, hq, test } from "./support/fixtures";
import {
  expectPageReady,
  expectToast,
  openHqArea,
  openObjectTab,
  pressAndConfirm,
} from "./support/moves";

/**
 * Coach: journeys CH-1 … CH-8 of docs/plan/persona-journeys.md, on the web
 * surfaces (HQ as staff). The Pro app journeys are listed in the document;
 * they have no device harness yet.
 */
test.use({ persona: "coach" });

test.describe("CH-1 Set availability", () => {
  async function openMyAvailability(page: Parameters<typeof openHqArea>[0]) {
    await openHqArea(page, "Team");
    await page
      .getByRole("list", { name: "Team members" })
      .getByRole("link", { name: /\(you\)/ })
      .click();
    await expectPageReady(page, "Mara Lewis");
    await openObjectTab(page, "Availability");
  }

  test("CH-1.1 Set weekly availability with effective dates", async ({
    page,
  }) => {
    await openMyAvailability(page);
    await page.getByRole("button", { name: "New schedule" }).click();
    await page.getByRole("textbox", { name: "Name" }).fill("Winter evenings");
    await page.getByLabel("First day").first().fill("2026-12-01");
    await page.getByRole("button", { name: "Add Tuesday evening" }).click();
    await page.getByRole("button", { name: "Add Thursday evening" }).click();
    await page.getByRole("button", { name: "Save as a draft" }).click();
    await expect(
      page.getByText("Winter evenings is saved as a draft"),
    ).toBeVisible();
    await pressAndConfirm(
      page,
      page.getByRole("button", { name: /^Use it from/ }),
      "confirm",
      { confirmButton: "Use Winter evenings" },
    );
    await expectToast(page, "Winter evenings is in use");
  });
  test("CH-1.2 Add a blackout, and see what it uncovers", async ({ page }) => {
    await openMyAvailability(page);
    await expect(
      page.getByRole("radio", { name: /I can't work/ }),
    ).toBeChecked();
    const form = page.getByRole("form", { name: "Add time away" });
    await form.getByLabel("First day").fill("2026-12-20");
    await pressAndConfirm(
      page,
      form.getByRole("button", { name: "Add the days" }),
      "confirm",
      { confirmButton: "Add the days" },
    );
    await expectToast(page, /booked sessions? needs? cover|No booked sessions/);
  });
});

test.describe("CH-2 See today", () => {
  test("CH-2.1 Today lists the day's sessions", async ({ page }) => {
    await openHqArea(page, "Today");
    await expect(
      page
        .getByRole("region", { name: "Schedule" })
        .locator("li.today-row")
        .first(),
    ).toBeVisible();
  });
  test("CH-2.2 Schedule shows the day by coach", async ({ page }) => {
    await openHqArea(page, "Schedule");
    await page.getByRole("button", { name: "Coaches", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Coaches", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("CH-3 Run and check in a session", () => {
  test("CH-3.1 Open the session from Today", async ({ page }) => {
    await openHqArea(page, "Today");
    await page
      .getByRole("region", { name: "Schedule" })
      .getByRole("link", { name: "Sunset doubles training", exact: true })
      .click();
    await expect(page).toHaveURL(/\/events\/[^/]+$/);
    await expect(
      page.getByRole("heading", { name: "Sunset doubles training" }).first(),
    ).toBeVisible();
  });
  test("CH-3.2 Check players in, with Undo for a mistaken tap [H2]", async ({
    page,
  }) => {
    await openHqArea(page, "Schedule");
    // A coach sees their own day; their lesson's players are listed here.
    const strip = page.getByRole("region", { name: "Not checked in" });
    const count = strip.locator(".sch-now__count");
    const before = Number(await count.textContent());
    const button = strip.getByRole("button", { name: /^Check in / }).first();
    const name = (await button.getAttribute("aria-label"))!.replace(
      /^Check in (.+) for .+$/,
      "$1",
    );
    await button.click();
    await expectToast(page, `${name} checked in`);
    await expect(count).toHaveText(String(before - 1));
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(count).toHaveText(String(before));
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
  test("CH-6.1 See my sessions, pay period and expected pay", async ({
    page,
  }) => {
    await openHqArea(page, "Team");
    await page
      .getByRole("navigation", { name: "Team" })
      .getByRole("link", { name: "Your pay" })
      .click();
    await expectPageReady(page, "Mara Lewis");
    await expect(
      page.getByRole("heading", { name: "How you are paid" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "How you are paid" }),
    ).toContainText("an hour for scheduled time");
    await expect(page.getByText(/earned of/)).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Pay period" }),
    ).toContainText("November");
  });
  test.fixme("CH-6.2 Receive contractor payouts to my own account [B3c]", async () => {});
  test("CH-6.3 A coach who opens Money sees 'You need access', not an error page", async ({
    page,
  }) => {
    for (const path of ["/money", "/money/transactions"]) {
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

test.describe("CH-9 Group sessions that need players", () => {
  test("CH-9.1 Opens a session that needs players; Message the group opens a review with the share link (web step)", async ({
    page,
  }) => {
    await page.goto(hq("/offerings/at-risk"));
    await expectPageReady(page, "At risk this week");
    await page
      .getByRole("list", { name: "Sessions at risk this week" })
      .getByRole("button", { name: /Saturday semi-private/ })
      .click();
    const panel = page.getByRole("dialog", { name: "Saturday semi-private" });
    await panel.getByRole("button", { name: "Message the group" }).click();
    await expect(panel.getByText("Nothing is sent from here")).toBeVisible();
    await expect(
      panel.getByRole("textbox", { name: "Message", exact: true }),
    ).toHaveValue(/clubs\/.+\/products\/.+\?session=/);
    await expect(
      panel.getByRole("button", { name: "Copy the booking link" }),
    ).toBeVisible();
    await expect(
      panel.getByRole("link", { name: "Review in Inbox" }),
    ).toHaveAttribute("href", /\/inbox\?compose=new/);
  });
});
