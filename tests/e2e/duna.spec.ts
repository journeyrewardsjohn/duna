import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(
    dimensions.clientWidth + 2,
  );
}

test("marketing and player discovery stay usable", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your game. All of it." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Find your game" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Duna HQ" }).first(),
  ).toHaveAttribute("href", /.+/);
  await expectNoHorizontalOverflow(page);

  await page.goto("/app/discover");
  await expect(
    page.getByRole("heading", { name: "Find your next game." }),
  ).toBeVisible();
  await expect(page.getByLabel("Search Duna")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("Duna+ fee waiver and wallet checkout complete cleanly", async ({
  page,
}) => {
  await page.goto("/app/checkout/serve-receive-lab");
  await expect(
    page.getByRole("heading", { name: "Finish your spot." }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add Duna+" }).click();
  await expect(page.getByText("Duna+ platform-fee waiver")).toBeVisible();
  await page.getByRole("button", { name: "Confirm with Wallet" }).click();

  await expect(page.getByRole("heading", { name: "You’re in." })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("event-sourced scorer handles points, undo, and offline state", async ({
  page,
}) => {
  await page.goto("/app/score");
  const teamA = page.getByRole("button", { name: "Point for Mara and Theo" });
  const teamB = page.getByRole("button", { name: "Point for Noa and Elena" });

  await teamA.click();
  await teamA.click();
  await teamA.click();
  await teamB.click();
  await expect(page.getByText("3–1")).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("3–0")).toBeVisible();

  await page.getByRole("button", { name: "Simulate offline" }).click();
  await expect(page.getByRole("button", { name: "Go online" })).toBeVisible();
  await expect(page.getByText("5 events pending upload")).toHaveCount(1);
  await expectNoHorizontalOverflow(page);
});

test("pickup host flow publishes a complete listing", async ({ page }) => {
  await page.goto("/app/pickup/new");
  await expect(
    page.getByRole("heading", { name: "Host pickup." }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByLabel("Where")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Who can see it")).toBeVisible();
  await page.getByRole("button", { name: "Publish pickup" }).click();

  await expect(
    page.getByRole("heading", { name: "Golden Hour 4s is live." }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("HQ, admin, and AI changes preserve explicit control", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:3001/");
  await expect(
    page.getByRole("heading", { name: "Good morning, Sam." }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto("http://127.0.0.1:3001/admin");
  await expect(
    page.getByRole("heading", { name: "Everything healthy." }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto("http://127.0.0.1:3001/leagues");
  await page.getByRole("button", { name: "Generate proposal" }).click();
  await expect(page.getByText("Proposal ready")).toBeVisible();
  await expect(page.getByText("No changes have been made.")).toBeVisible();

  await page.goto("http://127.0.0.1:3001/ai");
  await expect(page.getByText("Confirmation required")).toBeVisible();
  await page.getByRole("button", { name: "Confirm draft" }).click();
  await expect(
    page.getByText("Draft roster saved. Nothing was published or messaged."),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
