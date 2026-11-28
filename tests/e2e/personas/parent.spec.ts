import { expect, test, webBaseUrl } from "./support/fixtures";
import { expectPageReady, openPlayerArea } from "./support/moves";

/**
 * Parent or guardian with a junior: journeys PA-1 … PA-7 of
 * docs/plan/persona-journeys.md. Several steps have no work package yet and
 * are marked GAP for the orchestrator.
 */
test.use({ persona: "parent" });

test.describe("PA-1 Create a family and add a junior", () => {
  test("PA-1.1 Settings offers the household and adding a dependent", async ({
    page,
  }) => {
    await openPlayerArea(page, "Settings");
    await expect(
      page.getByRole("heading", { level: 2, name: "Family" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add a junior" }),
    ).toBeVisible();
  });
  test.fixme("PA-1.2 Add a junior's private profile with consent recorded [FAM]", async () => {
    // Expected: the junior appears as "Pending review" with a toast; demo
    // mode returns the would-be result. FAM owns the household.
  });
  test.fixme("PA-1.3 Invite a second guardian who accepts by link [FAM]", async () => {});
});

test.describe("PA-2 Book and pay for the junior", () => {
  test("PA-2.1 Open a session's checkout", async ({ page }) => {
    await page.goto("/app/checkout/serve-receive-lab");
    await expectPageReady(page, "Join in a few clear steps.");
    await expect(
      page.getByRole("button", { name: /Continue to payment/ }),
    ).toBeVisible();
  });
  test("PA-2.4 A club's clinic says how many have booked, what happens if too few do, and the price all-in", async ({
    page,
  }) => {
    await page.goto(
      "/clubs/south-bay-volleyball/products/serve-receive-clinic",
    );
    await expectPageReady(page, "Serve-receive clinic");
    await expect(
      page.getByRole("list", { name: "Next sessions of Serve-receive clinic" }),
    ).toContainText(/Minimum reached|Needs \d+ more/);
    await expect(page.getByText("If the group is too small")).toBeVisible();
    await expect(page.getByText(/all-in/).first()).toBeVisible();
    await expect(
      page
        .getByRole("main")
        .getByRole("link", { name: "Book a place" })
        .first(),
    ).toHaveAttribute(
      "href",
      "/clubs/south-bay-volleyball/products/serve-receive-clinic/checkout",
    );
  });
  test.fixme("PA-2.2 Choose the junior as the participant [P5, FAM]", async () => {});
  test.fixme("PA-2.3 Pay once, with no double charge on a double tap, and see the booking in Next up [P5, B2]", async () => {
    // Expected: single-flight submit with an idempotency key; the
    // confirmation Rises; the junior's session appears in Next up.
  });
});

test.describe("PA-3 Hear about the junior's sessions", () => {
  test("PA-3.1 Messages open", async ({ page }) => {
    await openPlayerArea(page, "Connect");
  });
  test.fixme("PA-3.2 Receive a coach's message tied to the junior's session and reply [P7, B7]", async () => {});
  test.fixme("PA-3.3 Choose how to be reached per club (app, email, text) [P7]", async () => {});
});

test.describe("PA-4 Health sharing", () => {
  test.fixme("PA-4.1 Approve or decline sharing the junior's health data with the coach [H15]", async () => {
    // Health consent screens (H15). The server part shipped in H1: ages 13
    // and over, guardian approval, US only.
  });
});

test.describe("PA-5 Cancel and get a refund", () => {
  test("PA-5.1 Cancel the junior's booking within the club's policy after a confirm [P5, B2]", async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: "duna-demo-plans", value: `pa5-${Date.now()}`, url: webBaseUrl },
    ]);
    await openPlayerArea(page, "Home");
    await page
      .getByRole("navigation", { name: "Duna Player" })
      .getByRole("button", { name: /Account menu for/ })
      .click();
    await page.getByRole("button", { name: /Remy Lewis/ }).click();
    await expect(page.getByText("You’re acting for Remy Lewis.")).toBeVisible();
    await page.goto("/app/play");
    await expectPageReady(page, "Remy’s plans");
    const plan = page.getByRole("listitem").filter({
      has: page.getByRole("heading", { level: 3, name: "Junior Sand Skills" }),
    });
    await expect(plan.getByText(/^Free cancellation until /)).toBeVisible();
    await plan.getByRole("button", { name: "Cancel Remy’s place" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("2 credits come back to the wallet");
    await dialog.getByRole("button", { name: "Cancel Remy’s place" }).click();
    // PA-5.2: the amount and where it went, from the backend's answer.
    await expect(page.getByText(/2 credits back in your wallet/)).toBeVisible();
  });
  test.fixme("PA-5.2 See the refund, with amount and where it went [P6]", async () => {
    // The cancel answer says it (PA-5.1). Still needed: the refund line in the
    // wallet's activity for a junior's catalog booking (Wallet package).
  });
});

test.describe("PA-6 Waivers", () => {
  test.fixme("PA-6.1 Sign the club's waiver for the junior before the first session [FAM, H11]", async () => {});
});

test.describe("PA-7 The family's week", () => {
  test("PA-7.1 Home shows Next up first", async ({ page }) => {
    await openPlayerArea(page, "Home");
    await expect(page.getByText("Next up", { exact: true })).toBeVisible();
  });
  test("PA-7.2 The guardian acts for the junior and Home shows the junior's week", async ({
    page,
  }) => {
    // Labelling a junior's booking "For Remy" in Next up is unit-tested
    // (components/app-shell/home/home-model.test.ts): demo mode has no junior
    // booking fixture (catalog bookings need a database).
    await openPlayerArea(page, "Home");
    await expect(
      page.getByRole("heading", { name: "Your household" }),
    ).toBeVisible();
    await page
      .getByRole("navigation", { name: "Duna Player" })
      .getByRole("button", { name: /Account menu for/ })
      .click();
    await page.getByRole("button", { name: /Remy Lewis/ }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Remy's week" }),
    ).toBeVisible();
    await expect(page.getByText("You’re acting for Remy Lewis.")).toBeVisible();
    await expect(page.getByText("Nothing booked for Remy yet")).toBeVisible();
    await page.getByRole("button", { name: "Back to my account" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: /, Mara\.$/ }),
    ).toBeVisible();
  });
});

test.describe("PA-8 A junior in a group session", () => {
  test.fixme("PA-8.1 Books a clinic for a child; checkout shows “3 credits now” and the ladder [PART-8]", async () => {});
  test.fixme("PA-8.2 The clinic is cancelled under its minimum; the guardian is told and the credits are back [PART-5, PART-8]", async () => {});
});
