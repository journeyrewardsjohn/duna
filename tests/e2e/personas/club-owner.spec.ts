import { expect, hq, test } from "./support/fixtures";
import {
  expectNoLayoutShift,
  expectPageReady,
  fillForm,
  openHqArea,
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
    await expectPageReady(page, "Start your Duna workspace.");
    await expectNoLayoutShift(page);
  });
});

test.describe("CO-2 Set up the club from its website", () => {
  test.fixme("CO-2.1 Enter the club's website and Duna reads it [B1, H11]", async () => {
    // Expected: "Your club's website" field; a Rally loader while Duna reads;
    // proposals for name, hours, places, offerings and socials.
  });
  test.fixme("CO-2.2 Review each proposal with Keep, Edit or Skip [H11]", async () => {
    // Expected: nothing is applied until the person confirms; Edit opens the
    // same SpecForm the agent filled.
  });
  test("CO-2.3 Club setup shows what is left, one decision at a time", async ({
    page,
  }) => {
    await openHqArea(page, "Club setup");
    await expect(
      page.getByRole("heading", { name: "One decision at a time." }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Set up payments" }),
    ).toBeVisible();
  });
});

test.describe("CO-3 Connect payments (Duna Pay)", () => {
  test("CO-3.1 Money leads to Duna Pay setup", async ({ page }) => {
    await page.goto(hq("/money/setup"));
    await expectPageReady(page, "Configure money once.");
    await expect(
      page.getByRole("button", { name: "Prepare secure Stripe link" }),
    ).toBeVisible();
  });
  test.fixme("CO-3.2 Complete verification in the embedded onboarding and see the account status [B2, H10]", async () => {
    // Expected: one of the six derived statuses; "not configured yet" without
    // provider keys; a "Test mode" label with test keys.
  });
  test.fixme("CO-3.3 Choose the payout schedule and the refund policy [H10]", async () => {
    // Expected: SectionNav under Money; saved inline with a toast; policy text
    // uses [club policy] placeholders until the club writes its own.
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
  test.fixme("CO-4.2 Save the venue and add its courts [H11]", async () => {
    // Expected: Club setup › Places and courts; the venue's Courts tab lists
    // the new courts with surface and lights.
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
    const session = page.getByRole("link", {
      name: /Sunset doubles training.*open session operations/,
    });
    await expect(session).toBeVisible();
    await expect(session.getByText(/\d+ of \d+ joined/)).toBeVisible();
  });
  test("CO-7.2 Schedule shows the day by court and by coach", async ({
    page,
  }) => {
    await openHqArea(page, "Schedule");
    await expect(page.getByRole("button", { name: "Courts" })).toBeVisible();
    await page.getByRole("button", { name: "Coaches" }).click();
    await expect(page.getByRole("button", { name: "Coaches" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
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
      page.getByRole("table", {
        name: "Sortable, filterable organization transactions",
      }),
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
  test.fixme("CO-9.3 Refund it with a strong confirm that restates amount, person and consequence [H10, B2]", async () => {
    // Expected: tier 2 dialog "Refund $48.00 to <name>. <name> is emailed.";
    // idempotency key on the refund; toast and refunded state.
  });
  test.fixme("CO-9.4 The person is told, and the refund shows in their wallet [B7, P6]", async () => {});
});

test.describe("CO-10 See a payout", () => {
  test("CO-10.1 Money shows the balance and the payout rhythm", async ({
    page,
  }) => {
    await openHqArea(page, "Money");
    await expect(
      page.getByRole("heading", { name: "Keep the rhythm you prefer." }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Request a payout" }),
    ).toBeVisible();
  });
  test.fixme("CO-10.2 Open a payout and see its arrival date and the payments in it [H10, B2]", async () => {});
});

test.describe("CO-11 Ask Duna to do it", () => {
  test("CO-11.1 Today offers Ask Duna for a task", async ({ page }) => {
    await openHqArea(page, "Today");
    await expect(
      page.getByRole("textbox", { name: "What would you like Duna to do?" }),
    ).toBeVisible();
  });
  test.fixme("CO-11.2 Ask Duna opens as a docked panel from the top bar or Cmd+J [S1]", async () => {});
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
  test.fixme("CO-13.1 Switch organisation and create a new one from the switcher [S1]", async () => {});
  test.fixme("CO-13.2 A coach or player who opens an owner page sees 'You need access', not an error page [S1]", async () => {});
});

test.describe("CO-14 Pay the team", () => {
  test.fixme("CO-14.1 Run a pay period for coaches and export it [B3b, H5]", async () => {});
});
