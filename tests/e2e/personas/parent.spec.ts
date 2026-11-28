import { expect, test } from "./support/fixtures";
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
      page.getByRole("heading", { name: "Household + guardians" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add dependent" }),
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
  test.fixme("PA-5.1 Cancel the junior's booking within the club's policy after a confirm [P5, B2]", async () => {
    // Expected: tier 1 confirm stating the refund amount the policy gives.
  });
  test.fixme("PA-5.2 See the refund, with amount and where it went [P6]", async () => {});
});

test.describe("PA-6 Waivers", () => {
  test.fixme("PA-6.1 Sign the club's waiver for the junior before the first session [FAM, H11]", async () => {});
});

test.describe("PA-7 The family's week", () => {
  test("PA-7.1 Home shows Next up first", async ({ page }) => {
    await openPlayerArea(page, "Home");
    await expect(page.getByText("Next up", { exact: true })).toBeVisible();
  });
  test.fixme("PA-7.2 Next up includes the junior's sessions, labelled with their name [P1]", async () => {});
});

test.describe("PA-8 A junior in a group session", () => {
  test.fixme("PA-8.1 Books a clinic for a child; checkout shows “3 credits now” and the ladder [PART-8]", async () => {});
  test.fixme("PA-8.2 The clinic is cancelled under its minimum; the guardian is told and the credits are back [PART-5, PART-8]", async () => {});
});
