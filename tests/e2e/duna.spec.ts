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
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(
    page.getByRole("heading", { name: "Where your game comes together." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Find a game" })).toBeVisible();
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

test("light mode starts cleanly and the dark choice persists", async ({
  page,
}) => {
  await page.goto("/");
  const themeToggle = page
    .getByRole("button", { name: /Toggle color theme/ })
    .first();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await themeToggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expectNoHorizontalOverflow(page);
});

test("paid checkout exposes a real Stripe handoff and honest wallet state", async ({
  page,
}) => {
  await page.goto("/app/checkout/serve-receive-lab");
  await expect(
    page.getByRole("heading", { name: "Join in a few clear steps." }),
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

test("public event creation carries a clean starter into guided HQ", async ({
  page,
}) => {
  await page.goto("/create");
  await expect(
    page.getByRole("heading", { name: "Put your event on Duna." }),
  ).toBeVisible();
  await expect(page.getByText("$0")).toBeVisible();
  await expect(page.getByText("15%")).toBeVisible();
  await page.getByRole("button", { name: /League/ }).click();
  await page.getByLabel("Name").fill("Hermosa Moonlight League");
  await page
    .getByLabel("One-line summary")
    .fill("Six weeks of balanced teams and live standings.");
  await page.getByLabel(/Venue or city/).fill("Hermosa Beach");
  const continueButton = page.getByRole("button", {
    name: /Continue the guided setup/,
  });
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
  await page.waitForURL(/:3001\/events\/create\?.*type=league/);
  await expect(
    page.getByRole("heading", {
      name: "Create something players remember.",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByLabel("Event name")).toHaveValue(
    "Hermosa Moonlight League",
  );
  await expectNoHorizontalOverflow(page);
});

test("tournament pages and checkout expose divisions, tickets, teams, and waivers", async ({
  page,
}) => {
  await page.goto("/events/sunset-open-qualifier");
  await expect(
    page.getByRole("heading", { name: "Sunset Open — Qualifier" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Find your division." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Open", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "AA", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Host approval required")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "The field is taking shape." }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto(
    "/app/checkout/sunset-open-qualifier?division=20000000-0000-4000-8000-000000000001",
  );
  await expect(page.getByRole("tab", { name: /Play/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Attend/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Complete your team" }),
  ).toBeVisible();
  const partner = page.getByLabel("Search Duna players");
  await partner.selectOption({ index: 1 });
  const weatherAgreement = page
    .locator(".checkout-agreement-list article")
    .filter({ hasText: "Weather and event policy" });
  await weatherAgreement.locator('input[type="checkbox"]').check();
  const waiverAgreement = page
    .locator(".checkout-agreement-list article")
    .filter({ hasText: "Participation waiver" });
  const waiverCheckbox = waiverAgreement.locator('input[type="checkbox"]');
  await expect(waiverCheckbox).toBeDisabled();
  await waiverAgreement
    .locator(".checkout-agreement-scroll")
    .evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
  await expect(waiverCheckbox).toBeEnabled();
  await waiverCheckbox.check();
  await expect(
    page.getByRole("button", { name: /Continue to Stripe/ }),
  ).toBeEnabled();

  await page.getByRole("tab", { name: /Attend/ }).click();
  await page.getByLabel("Sunset Club").check();
  await expect(page.getByText(/Payment reserves the ticket/)).toBeVisible();
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
    page.getByRole("heading", { name: "Host a match." }),
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
    page.getByRole("heading", { name: "Good morning." }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Here’s what is happening across South Bay Volleyball Club.",
    ),
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
    page.getByRole("link", { name: /Open guided flow/ }),
  ).toBeVisible();
  await expect(
    page.getByText(/Build a league without fighting a wall of settings/),
  ).toBeVisible();

  await page.goto("http://127.0.0.1:3001/ai");
  await expect(page.getByText("Grounded read-only analysis")).toBeVisible();
  await expect(page.getByText("Read-only", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Model-generated recommendations remain off/),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
