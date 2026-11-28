import { expect, hq, test } from "./support/fixtures";
import {
  expectNoLayoutShift,
  expectPageReady,
  expectToast,
  fillForm,
  openHqArea,
  pressAndConfirm,
} from "./support/moves";

/**
 * Club owner / director: journeys CO-1 … CO-14 of
 * docs/plan/persona-journeys.md. A `test.fixme` names the work package that
 * makes the step pass; that package removes the `fixme`.
 */
test.use({ persona: "club-owner" });

test.describe("CO-1 Sign up and open the club's workspace", () => {
  test("CO-1.1 The club landing page leads to sign-up", async ({ page }) => {
    await page.goto("/run-your-club");
    await expectPageReady(page, /Run the whole club/);
    await page.goto("/sign-up");
    await expect(
      page.getByRole("link", { name: "Create my Duna account" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  });

  test.fixme("CO-1.2 Create the account and name the organisation, landing in the first run [S1]", async () => {
    // Expected: the secure sign-up hand-off returns to HQ's first run with the
    // organisation created and the switcher showing it. Demo mode has no
    // identity provider, so this runs once S1 gives demo a stand-in hand-off.
  });

  test("CO-1.3 HQ's first run opens for the new organisation", async ({
    page,
  }) => {
    await page.goto(hq("/setup/start"));
    await expectPageReady(page, /^Let.s set up /);
    await expect(
      page.getByRole("heading", { name: "Do you have a website?" }),
    ).toBeVisible();
    await expectNoLayoutShift(page);
  });
});

test.describe("CO-2 Set up the club from its website", () => {
  test("CO-2.1 Enter the club's website and Duna reads it", async ({
    page,
  }) => {
    await page
      .context()
      .addCookies([{ name: "duna-demo-setup", value: "fresh", url: hq("/") }]);
    await page.goto(hq("/setup/start"));
    await page.getByLabel("Your club's website").fill("club.example");
    await page.getByRole("button", { name: "Read my website" }).click();
    // A Rally loader and the pages being read, by name.
    await expect(
      page.getByRole("button", { name: "Stop reading" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Review what Duna found" })
      .click({ timeout: 20_000 });
    for (const group of [
      "Identity and brand",
      "Contact and hours",
      "Places and courts",
      "Offerings and prices",
    ]) {
      await expect(page.getByRole("heading", { name: group })).toBeVisible();
    }
  });
  test("CO-2.2 Review each proposal with Keep, Edit or Skip", async ({
    page,
  }) => {
    await page
      .context()
      .addCookies([{ name: "duna-demo-setup", value: "fresh", url: hq("/") }]);
    await page.goto(hq("/setup/start?path=website"));
    await page.getByLabel("Your club's website").fill("club.example");
    await page.getByRole("button", { name: "Read my website" }).click();
    await page
      .getByRole("button", { name: "Review what Duna found" })
      .click({ timeout: 20_000 });
    // Nothing applies until the person confirms.
    await expect(page.locator("article[data-decision='applied']")).toHaveCount(
      0,
    );
    const venue = page.locator("article", {
      has: page.getByRole("heading", { name: "Venue", exact: true }),
    });
    // Edit opens the same form a person fills.
    await venue.getByRole("button", { name: "Edit" }).click();
    await venue.getByLabel("Place name").fill("North beach");
    await venue.getByRole("button", { name: "Keep my edit" }).click();
    await expect(venue).toContainText("You edited this");
    const team = page.locator("article", {
      has: page.getByRole("heading", { name: "Head coach", exact: true }),
    });
    await team.getByRole("button", { name: "Skip" }).click();
    await expect(team).toContainText("Skipped");
    await expect(
      page.getByRole("complementary", { name: "What Apply will do" }),
    ).toContainText("Creates a draft place");
  });
  test("CO-2.3 Club setup shows what is left, one decision at a time", async ({
    page,
  }) => {
    await openHqArea(page, "Club setup");
    await expect(
      page.getByRole("heading", { name: "What's left" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Set up payments" }).first(),
    ).toBeVisible();
  });
});

test.describe("CO-3 Connect payments (Duna Pay)", () => {
  test("CO-3.1 Money leads to Duna Pay setup", async ({ page }) => {
    await page.goto(hq("/money/setup"));
    await expect(page).toHaveURL(/\/money\/duna-pay$/);
    await expectPageReady(page, "Duna Pay");
    await expect(
      page.getByRole("navigation", { name: "Duna Pay setup" }),
    ).toBeVisible();
  });
  test("CO-3.2 See the account status and what verification needs (not configured without keys) [B2, H10]", async ({
    page,
  }) => {
    // Demo has no payment keys: one of the six statuses, what is wrong, and
    // the honest "can't connect here yet" instead of a link that can't open.
    await page.goto(hq("/money/duna-pay"));
    await expectPageReady(page, "Duna Pay");
    const card = page.getByRole("region", { name: "Where you stand" });
    await expect(card).toContainText("Action needed");
    await expect(card).toContainText("Bank account was declined");
    await expect(
      page.getByText("Duna Pay can't connect in this environment yet"),
    ).toBeVisible();
    await page.goto(hq("/money/duna-pay/verify"));
    await expectPageReady(page, "Verify your identity");
    await expect(
      page.getByText("Identity verification isn't set up yet"),
    ).toBeVisible();
  });
  test("CO-3.3 Choose the payout schedule and the refund policy [H10]", async ({
    page,
  }) => {
    await page.goto(hq("/money/payouts"));
    await expectPageReady(page, "Payouts");
    const schedule = page.getByRole("form", { name: "Payout schedule" });
    await schedule.getByLabel("How often").click();
    await page.getByRole("option", { name: "once a week" }).click();
    await pressAndConfirm(
      page,
      schedule.getByRole("button", { name: "Save payout schedule" }),
      "strong",
      {
        confirmButton: "Change payout schedule",
        restates: [/once a week|Every/i, /Takes effect from the next payout/],
      },
    );
    await expectToast(page, /Payout schedule saved/);
    await page.goto(hq("/money/refund-policies"));
    await expectPageReady(page, "Refunds");
    await page.getByRole("button", { name: "Add a refund policy" }).click();
    await expect(page.getByLabel("Terms")).toHaveValue("[club policy]");
  });
});

test.describe("CO-4 Add places and courts", () => {
  test("CO-4.1 Start adding a venue by describing it or by hand", async ({
    page,
  }) => {
    await page.goto(hq("/setup/places/create"));
    await expectPageReady(page, "Add venue");
    await expect(
      page.getByRole("textbox", { name: "What would you like to create?" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create manually →" }),
    ).toBeVisible();
  });
  test("CO-4.2 The place lists its courts with surface and lights", async ({
    page,
  }) => {
    await page.goto(hq("/setup/places"));
    await page
      .getByRole("link", { name: /Beach Elite Training Center/ })
      .click();
    await expectPageReady(page, "Beach Elite Training Center");
    const courts = page.getByRole("region", { name: "Courts" });
    await expect(courts).toContainText("Championship Court");
    await expect(courts).toContainText(/Sand · Lit after dark/);
    await expect(
      courts.getByRole("link", { name: "Add a court" }),
    ).toBeVisible();
  });
  test.fixme("CO-4.3 Set opening hours, layout and court orientation [H11, B11]", async () => {
    // Expected: hours per weekday; orientation feeds wind-on-court.
  });
});

test.describe("CO-5 Publish a lesson and a program", () => {
  test.fixme("CO-5.1 Create a private lesson offering with price and capacity [H9]", async () => {
    // Expected: Offerings › new; price in minor units with currency.
  });
  test.fixme("CO-5.2 Publish it through the payments-ready gate with a confirm [H10, S4]", async () => {
    // Expected: tier 1 confirm "Publish to your club page"; blocked with the
    // reason while Duna Pay is not ready.
  });
  test.fixme("CO-5.3 Create a training program from a sentence and review the proposal [B4, H6]", async () => {
    // Expected: weekdays, times, coaches, blackout dates; nothing saved until
    // the person confirms.
  });
  test.fixme("CO-5.4 Publish the program with its linked offering [H6]", async () => {});
  test.fixme("CO-5.5 The lesson and the program appear on the public club page [P4]", async () => {});
});

test.describe("CO-6 Invite a coach", () => {
  test("CO-6.1 Start a coach's invitation: name, role and how it is delivered", async ({
    page,
  }) => {
    await page.goto(hq("/team/invite"));
    await expectPageReady(page, "Invite the right teammate.");
    await fillForm(page, { "Full name": "Jordan Coach" });
    await expect(page.getByRole("combobox", { name: "Role" })).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "How should they receive it?" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create private link" }),
    ).toBeVisible();
  });
  test.fixme("CO-6.2 Create the link, or send it by email or text after a confirm [H5, B7]", async () => {
    // Expected: tier 1 confirm naming the channel and the recipient; per-
    // person delivery row; "not configured yet" without a channel provider.
  });
  test.fixme("CO-6.3 The coach accepts and shows as active in Team [H5]", async () => {});
});

test.describe("CO-7 See a booking arrive", () => {
  test("CO-7.1 Today lists today's sessions with how full they are", async ({
    page,
  }) => {
    await openHqArea(page, "Today");
    const row = page
      .getByRole("region", { name: "Schedule" })
      .locator("li.today-row")
      .filter({ hasText: "Sunset doubles training" });
    await expect(
      row.getByRole("link", { name: "Sunset doubles training", exact: true }),
    ).toBeVisible();
    await expect(
      row.getByRole("progressbar", { name: /\d+ of \d+ joined/ }),
    ).toBeVisible();
  });
  test("CO-7.2 Schedule shows the day by court and by coach", async ({
    page,
  }) => {
    await openHqArea(page, "Schedule");
    await expect(
      page.getByRole("button", { name: "Courts", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Coaches", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Coaches", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  });
  test.fixme("CO-7.3 A new booking arrives as a notification and lands in Today without a reload [S1, H1]", async () => {});
});

test.describe("CO-8 Message the roster", () => {
  test("CO-8.1 The inbox opens with the club's threads", async ({ page }) => {
    await openHqArea(page, "Inbox");
    await expect(
      page.getByRole("searchbox", { name: "Search conversations" }),
    ).toBeVisible();
  });
  test.fixme("CO-8.2 Write to a session's roster from the Send card, choosing channels per person [H3, B7]", async () => {});
  test.fixme("CO-8.3 Confirm 'Send to N people' and see each person's delivery [H3]", async () => {
    // Expected: tier 1 confirm restating the count; single-flight send with a
    // clientMessageId; per-person delivery rows.
  });
});

test.describe("CO-9 Refund a booking", () => {
  test("CO-9.1 Find the booking's payment in Money › Transactions", async ({
    page,
  }) => {
    await page.goto(hq("/money/transactions"));
    await expectPageReady(page, "Transactions");
    await expect(
      page.getByRole("searchbox", { name: "Search transactions" }),
    ).toBeVisible();
    await expect(
      page.getByRole("table", { name: "Sales and payments" }),
    ).toBeVisible();
  });
  test("CO-9.2 Open the transaction", async ({ page }) => {
    await page.goto(hq("/money/transactions"));
    await page
      .getByRole("link", { name: /^Open .* transaction$/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/money\/transactions\/[^/]+$/);
    await expectPageReady(page);
  });
  test("CO-9.3 Refund it with a strong confirm that restates amount, person and consequence [H10, B2]", async ({
    page,
  }) => {
    await page.goto(hq("/money/transactions"));
    await page
      .getByRole("link", { name: /^Open Junior program .* transaction$/ })
      .click();
    await expectPageReady(page, "Junior program · 8 weeks");
    await page.getByRole("button", { name: "Refund this sale" }).click();
    await page.getByLabel("Reason").fill("Coach was ill for two sessions");
    await page.getByRole("button", { name: "Review refund" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("$240.00 (USD)");
    await expect(dialog).toContainText("Theo Park, to the card they paid with");
    await expect(dialog).toContainText("A refund cannot be undone.");
    await expect(
      dialog.getByRole("button", { name: "Refund $240.00" }),
    ).toHaveAttribute("data-agent-confirm", /Refunds \$240\.00 to Theo Park/);
    // The refund itself needs the connected database (B2); demo has none.
  });
  test.fixme("CO-9.4 The person is told, and the refund shows in their wallet [B7, P6]", async () => {});
});

test.describe("CO-10 See a payout", () => {
  test("CO-10.1 Money shows the balance and the payout rhythm", async ({
    page,
  }) => {
    await openHqArea(page, "Money");
    await expect(
      page.getByRole("group", { name: "Ready to pay out" }),
    ).toContainText("Every business day");
    await expect(
      page.getByRole("button", { name: "Request a payout" }),
    ).toBeVisible();
  });
  test("CO-10.2 Open a payout and see its arrival date and the payments in it [H10, B2]", async ({
    page,
  }) => {
    await page.goto(hq("/money/payouts"));
    await page
      .getByRole("list", { name: "Payouts" })
      .getByRole("link")
      .first()
      .click();
    await expect(page).toHaveURL(/\/money\/payouts\/[^/]+$/);
    await expectPageReady(page, /^Payout to /);
    await expect(page.getByText("Expected", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Sales in this payout" }),
    ).toBeVisible();
  });
});

test.describe("CO-11 Ask Duna to do it", () => {
  test("CO-11.1 Today offers Ask Duna for a task", async ({ page }) => {
    await openHqArea(page, "Today");
    await expect(
      page.getByRole("textbox", { name: "What would you like Duna to do?" }),
    ).toBeVisible();
  });
  test("CO-11.2 Ask Duna opens as a docked panel from the top bar or Cmd+J", async ({
    page,
  }) => {
    await openHqArea(page, "Today");
    const panel = page.getByRole("complementary", { name: "Ask Duna" });
    await page.getByRole("button", { name: "Ask Duna" }).first().click();
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await page.keyboard.press("ControlOrMeta+j");
    await expect(panel).toBeVisible();
    // Demo mode: the honest state instead of a request that would fail.
    await expect(panel.getByText("Ask Duna isn't set up yet")).toBeVisible();
  });
  test.fixme("CO-11.3 Ask Duna fills the same form a person uses and applies only after a confirm [S4]", async () => {});
});

test.describe("CO-12 Grow: reports, marketing and the website", () => {
  test("CO-12.1 Reports open", async ({ page }) => {
    await openHqArea(page, "Reports");
  });
  test.fixme("CO-12.2 Send a campaign to an audience after a confirm [H13]", async () => {});
  test.fixme("CO-12.3 Change the website, preview it and publish after a confirm [B8a, H12]", async () => {});
});

test.describe("CO-13 Identity chrome", () => {
  test("CO-13.1 Switch organisation and create a new one from the switcher", async ({
    page,
  }) => {
    await openHqArea(page, "Today");
    await page.getByRole("button", { name: /Switch club\. Current:/ }).click();
    const menu = page.getByRole("menu");
    await expect(
      menu.getByRole("menuitem", { name: /Current organisation/ }),
    ).toBeVisible();
    await menu
      .getByRole("menuitem", { name: "Create new organisation" })
      .click();
    await expect(page).toHaveURL(/\/setup\/start\?mode=create$/);
    await expectPageReady(page);
  });

  test.describe("as a player", () => {
    test.use({ persona: "player" });
    test("CO-13.2 A coach or player who opens an owner page sees 'You need access', not an error page", async ({
      page,
    }) => {
      await page.goto(hq("/"));
      await expect(
        page.getByText("You don't have access to Duna HQ"),
      ).toBeVisible();
      await expect(
        page.getByText(/This page didn.t load|couldn.t load/),
      ).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Open Duna" })).toBeVisible();
    });
  });
});

test.describe("CO-14 Pay the team", () => {
  test.fixme("CO-14.1 Run a pay period for coaches and export it [B3b, H5]", async () => {});
});

test.describe("CO-15 Group sessions that fill up", () => {
  test.fixme("CO-15.1 Sets the club booking rule as a sentence; offerings without their own rule show “Club default” [PART-6]", async () => {});
  test.fixme("CO-15.2 Picks “Clinic” on an offering and enters a price ladder; sees the cliff warning and the live preview [PART-6]", async () => {});
  test.fixme("CO-15.3 Opens Today; “At risk this week” lists a session with “Needs 2 by Thu 6:00 PM” [PART-7]", async () => {});
  test.fixme("CO-15.4 Cancels a thin session after a strong confirmation restating people and refunds; it shows “Cancelled” [PART-7]", async () => {});
  test.fixme("CO-15.5 Asks Duna to make every clinic need 4 players; a proposal card shows before, after and affected sessions [PART-6]", async () => {});
});
