import { expect, hq, test } from "./support/fixtures";
import { openHqArea } from "./support/moves";

/**
 * Facility owner (public courts): journeys FO-1 … FO-4 of
 * docs/plan/persona-journeys.md. Facility access is B9 and H14; today only the
 * club venue tools exist.
 */
test.use({ persona: "facility-owner" });

test.describe("FO-1 List the facility", () => {
  test("FO-1.1 Venues open with a workspace per venue", async ({ page }) => {
    await page.goto(hq("/setup/places"));
    await expect(page.getByRole("heading", { name: "Venues" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open venue workspace" }).first(),
    ).toBeVisible();
  });
  test.fixme("FO-1.2 List public courts as a facility with photos and hours [B9, H14]", async () => {});
});

test.describe("FO-2 Decide who may play", () => {
  test.fixme("FO-2.1 Set access rules: approved players only, by hours or days [B9, H14]", async () => {});
  test.fixme("FO-2.2 Link the facility's waiver to access [H14]", async () => {});
  test.fixme("FO-2.3 Approve or decline access requests, with the player told [H14, B7]", async () => {
    // Expected: approve is tier 0 with Undo; decline is tier 1 because the
    // player is told.
  });
});

test.describe("FO-3 Stop play", () => {
  test.fixme("FO-3.1 Stop play on a court for weather, notifying booked players [H2, B9]", async () => {
    // Expected: tier 2 confirm restating the courts, the time and how many
    // people are told.
  });
  test.fixme("FO-3.2 See conditions (wind on court, light) beside the court schedule [H2, B11]", async () => {});
});

test.describe("FO-4 Players reach the facility", () => {
  test.fixme("FO-4.1 A player finds the facility and requests access on the web [B9, P3]", async () => {});
  test("FO-4.2 Today opens for the facility's operator", async ({ page }) => {
    await openHqArea(page, "Today");
  });
});
