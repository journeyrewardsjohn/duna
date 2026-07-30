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

test("paid checkout exposes a real Stripe handoff and honest wallet state", async ({
  page,
}) => {
  await page.goto("/app/checkout/serve-receive-lab");
  await expect(
    page.getByRole("heading", { name: "Finish your spot." }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /Use Duna Wallet/ }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /Continue to Stripe/ }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "View Duna+" })).toBeVisible();
  await expect(page.getByText("Card details never touch Duna.")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("connected scorer requires an explicit four-player court setup", async ({
  page,
}) => {
  await page.goto("/app/score");
  await expect(
    page.getByRole("heading", { name: "Set the court." }),
  ).toBeVisible();
  await expect(page.getByLabel("You")).toHaveValue("Mara Lewis");
  await expect(page.getByLabel("Partner")).toHaveValue(
    "10000000-0000-4000-8000-000000000011",
  );
  await expect(
    page.getByRole("button", { name: "Start live scoring" }),
  ).toBeVisible();
  await page.getByLabel("Scoring").selectOption("sideout");
  await expect(page.getByLabel("Scoring")).toHaveValue("sideout");
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
    page.getByRole("heading", { name: "South Bay Volleyball Club." }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto("http://127.0.0.1:3001/admin");
  await expect(
    page.getByRole("heading", {
      name: "Platform administration access required.",
    }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto("http://127.0.0.1:3001/leagues");
  await expect(page.getByRole("heading", { name: "Leagues" })).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /I reviewed the player price/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save session draft" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Publishing is a separate explicit action."),
  ).toBeVisible();

  await page.goto("http://127.0.0.1:3001/ai");
  await expect(page.getByText("Grounded read-only analysis")).toBeVisible();
  await expect(page.getByText("Read-only", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Model-generated recommendations remain off/),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
