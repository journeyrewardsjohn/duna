import { expect, test, type Page } from "@playwright/test";

const hqBaseUrl =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;

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
    page.getByRole("heading", { name: /Play more.*Know your game/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Find your next game/ }),
  ).toBeVisible();
  await expect(page.locator(".campaign-hero video")).toHaveAttribute(
    "poster",
    "/media/brand/duna-home-hero-v1.webp",
  );
  await expect(
    page.locator('.campaign-hero video source[type="video/mp4"]'),
  ).toHaveAttribute("src", "/media/brand/duna-home-hero-motion-v1.mp4");
  await expect(
    page.getByRole("link", { name: "Duna HQ" }).first(),
  ).toHaveAttribute("href", /.+/);
  await expectNoHorizontalOverflow(page);

  await page.goto("/app/discover");
  await expect(
    page.getByRole("heading", { name: "The whole world of sand." }),
  ).toBeVisible();
  await expect(page.getByLabel("Search Duna")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("public coach profiles stay bookable and responsive", async ({ page }) => {
  await page.goto("/coaches/theopark");
  await expect(
    page.getByRole("heading", { level: 1, name: "Theo Park" }),
  ).toBeVisible();
  await expect(page.getByText("Duna coach")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ways to work together." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Find a time that fits." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "South Bay Volleyball Club" }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("public rankings and rating evidence stay open and responsive", async ({
  page,
}) => {
  await page.goto("/rankings?view=world&gender=women");
  await expect(
    page.getByRole("heading", {
      name: "The players shaping beach volleyball now.",
    }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Ranking system" })
      .getByRole("link", { name: "World ranking", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page
      .getByRole("navigation", { name: "Ranking system" })
      .getByRole("link", { name: /Duna Sand Rating/ }),
  ).toHaveAttribute("href", "/rankings?view=duna&gender=women");
  await expectNoHorizontalOverflow(page);

  await page.goto("/methodology");
  await expect(
    page.getByRole("heading", {
      name: "Predict first. Learn second. Prove every gain.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No look-ahead" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Governed promotion" }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("branded identity entry preserves the secure auth handoff", async ({
  page,
}) => {
  await page.goto("/sign-in?returnTo=%2Fapp%2Fprofile");
  await expect(
    page.getByRole("heading", { name: /Your game.*stays with you/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Continue to Duna" }),
  ).toHaveAttribute("href", "/sign-in/start?returnTo=%2Fapp%2Fprofile");
  await expect(
    page.getByText("Secure authentication · Duna never sees your password"),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto("/sign-up");
  await expect(
    page.getByRole("link", { name: "Create my Duna account" }),
  ).toHaveAttribute("href", "/sign-up/start?returnTo=%2Fapp");
  await expectNoHorizontalOverflow(page);
});

test("light mode starts cleanly and the dark choice persists", async ({
  page,
}) => {
  await page.goto("/");
  const themeToggle = page
    .getByRole("button", { name: /Color theme:/ })
    .first();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme-preference",
    "system",
  );
  await themeToggle.click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme-preference",
    "light",
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await themeToggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expectNoHorizontalOverflow(page);
});

test("paid checkout exposes a secure payment handoff and honest wallet state", async ({
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
    page.getByRole("button", { name: /Continue to payment/ }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "View Premium" })).toBeVisible();
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
  await expect(page.getByText("5%", { exact: true })).toBeVisible();
  await expect(page.getByText(/separate 7.5% service fee/)).toBeVisible();
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
  await page.waitForURL((url) => {
    const expectedOrigin = new URL(hqBaseUrl).origin;
    return (
      url.origin === expectedOrigin &&
      url.pathname === "/events/create" &&
      url.searchParams.get("type") === "league"
    );
  });
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
    page.getByRole("heading", { name: "Find your best fit." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Open", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "AA", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Host approval required")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /players confirmed\./ }),
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
  await partner.fill("Theo Park");
  await page
    .locator(".checkout-team-suggestions article")
    .filter({ hasText: "Theo Park" })
    .getByRole("button", { name: "Add" })
    .click();
  const weatherAgreement = page
    .locator(".checkout-agreement-list article")
    .filter({ hasText: "Weather and event policy" });
  const weatherCheckbox = weatherAgreement.locator('input[type="checkbox"]');
  await weatherAgreement.locator("label").click();
  await expect(weatherCheckbox).toBeChecked();
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
  await waiverAgreement.locator("label").click();
  await expect(waiverCheckbox).toBeChecked();
  await expect(
    page.getByRole("button", { name: /Continue to payment/ }),
  ).toBeEnabled();

  await page.getByRole("tab", { name: /Attend/ }).click();
  await page.getByLabel("Sunset Club").check();
  await expect(page.getByText(/Payment reserves the ticket/)).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("match recorder starts with a completed result and offers live scoring", async ({
  page,
}) => {
  await page.goto("/app/score");
  await expect(
    page.getByRole("heading", { name: "How did you play?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Add a finished result/ }),
  ).toHaveClass(/is-selected/);
  await expect(
    page.getByRole("button", { name: "Record this match" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /3v3/ }).click();
  await expect(page.getByText("Your side · 3 players")).toBeVisible();
  await page.getByRole("button", { name: /Score it live/ }).click();
  await expect(
    page.getByRole("button", { name: "Start live scoring" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sideout" }).click();
  await expect(page.getByRole("button", { name: "Sideout" })).toHaveClass(
    /is-selected/,
  );
  await page
    .getByRole("button", { name: /Add player Search Duna players/ })
    .first()
    .click();
  await expect(
    page.getByRole("dialog", { name: "Add a player" }),
  ).toBeVisible();
  await expect(
    page.getByPlaceholder("Search by name, handle, or home market"),
  ).toBeVisible();
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

test("player planning keeps selection in place and extends its date rail", async ({
  page,
}) => {
  await page.goto("/app/play");
  await expect(
    page.getByRole("heading", { name: "When do you want to play?" }),
  ).toBeVisible();

  const selectedPill = page.locator(
    '.calendar-picker__pill[aria-current="date"]',
  );
  await expect(selectedPill).toHaveCount(1);
  await expect(selectedPill.locator(":scope > span")).toHaveCount(1);
  await expect(selectedPill.locator(":scope > strong")).toHaveCount(1);
  await expect(selectedPill.locator(":scope > small")).toHaveText(
    /^[A-Z][a-z]{2}$/,
  );

  const rail = page.locator(".play-calendar-picker .calendar-picker__rail");
  const pills = rail.locator(".calendar-picker__pill");
  const selectedIndex = await pills.evaluateAll((elements) =>
    elements.findIndex(
      (element) => element.getAttribute("aria-current") === "date",
    ),
  );
  const nextPill = pills.nth(selectedIndex + 1);
  const scrollPosition = await rail.evaluate((element) =>
    Math.round(element.scrollLeft),
  );
  await nextPill.click();
  await expect(nextPill).toHaveAttribute("aria-current", "date");
  await expect
    .poll(() => rail.evaluate((element) => Math.round(element.scrollLeft)))
    .toBe(scrollPosition);

  const initialPillCount = await pills.count();
  expect(initialPillCount).toBeGreaterThanOrEqual(91);
  await rail.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await expect.poll(() => pills.count()).toBeGreaterThan(initialPillCount);

  await page.getByRole("button", { name: "Full calendar" }).click();
  const calendar = page.getByRole("dialog", {
    name: "When do you want to play?",
  });
  await expect(calendar).toBeVisible();
  await expect(calendar.locator(".calendar-month")).toHaveCount(2);
  await expect(calendar.getByText("Your plans", { exact: true })).toBeVisible();
  await expect(
    calendar.getByText("Events to explore", { exact: true }),
  ).toBeVisible();
  await calendar.getByRole("button", { name: "Close full calendar" }).click();
  await expect(calendar).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("player onboarding stays clear and editable on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/onboarding");
  await expect(
    page.getByRole("heading", { name: "Who are we building this for?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Mobile player navigation" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ask Duna" })).toHaveCount(0);
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(
    page.getByRole("heading", { name: "Tell us about Mara Lewis." }),
  ).toBeVisible();
  await expect(
    page.getByText(/Voice is waiting for the LiveKit/),
  ).toBeVisible();
  await page
    .getByLabel("Your editable recap")
    .fill(
      "I played indoor in high school and have played beach for four years.",
    );
  await page.getByRole("button", { name: /Review answers/ }).click();
  await expect(
    page.getByRole("heading", { name: "What is the player's legal name?" }),
  ).toBeVisible();
  await expect(page.getByLabel("Legal first name")).toBeEditable();
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(
    page.getByRole("heading", { name: "What is the highest level reached?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Collegiate/ }).click();
  await expect(page.getByLabel("College or university")).toBeEditable();
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByLabel("Years playing")).toBeEditable();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByLabel("Height in feet").fill("6");
  await page.getByLabel("Additional height in inches").fill("1");
  await page.getByRole("button", { name: "cm" }).click();
  await expect(page.getByLabel("Height in centimeters")).toHaveValue("185");
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByLabel(/Playing story/)).toBeEditable();
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByText("VolleyballLife profile")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("account controls, profile editing, and legal documents stay reachable", async ({
  page,
}) => {
  await page.goto("/app/profile");
  await expect(
    page.getByRole("link", { name: "Edit profile" }),
  ).toHaveAttribute("href", "/app/settings#profile");

  await page.goto("/app/settings");
  await expect(page.getByRole("heading", { name: "Settings." })).toBeVisible();
  const settingsNavigation = page.getByRole("navigation", {
    name: "Settings sections",
  });
  await expect(
    settingsNavigation.getByRole("link", { name: /Profile/ }),
  ).toHaveAttribute("href", "#profile");
  await expect(
    settingsNavigation.getByRole("link", { name: /Player details/ }),
  ).toHaveAttribute("href", "#playing-profile");
  await expect(
    page.getByRole("button", { name: /Delete your account/ }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto("/legal");
  await expect(
    page.getByRole("heading", {
      name: "Clear rules for every side of Duna.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Duna HQ Terms/ })).toBeVisible();
  await page.goto("/legal/terms");
  await expect(
    page.getByRole("heading", { name: "Duna Consumer Terms of Service" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "14. Suspension, termination, and account deletion",
    }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto(`${hqBaseUrl}/account`);
  await expect(
    page.getByRole("heading", { name: "Your Duna identity." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Review deletion requirements/ }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("HQ, admin, and AI changes preserve explicit control", async ({
  page,
}) => {
  await page.goto(`${hqBaseUrl}/`);
  await expect(
    page.getByRole("heading", { name: "Good morning." }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Here’s what is happening across South Bay Volleyball Club.",
    ),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto(`${hqBaseUrl}/locations/create`);
  await expect(
    page.getByRole("heading", { name: "Bring a venue into Duna." }),
  ).toBeVisible();
  await expect(
    page.getByText("Championship Court", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Community Court", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Add a court image").first()).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto(`${hqBaseUrl}/calendar`);
  await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
  await expect(
    page.getByText("Championship Court", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Community Court", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("No courts yet")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await page.goto(`${hqBaseUrl}/events`);
  await expect(page.getByRole("heading", { name: "Events" })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "No drafts awaiting publication",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Every saved draft stays here until you explicitly review it and open registration.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Create event/ })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto(`${hqBaseUrl}/admin`);
  await expect(
    page.getByRole("heading", {
      name: "Platform administration access required.",
    }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto(`${hqBaseUrl}/leagues`);
  await expect(page.getByRole("heading", { name: "Leagues" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Create league/ })).toBeVisible();
  await expect(page.getByText(/1 connected/)).toBeVisible();
  await page.getByRole("link", { name: /Create league/ }).click();
  await expect(
    page.getByRole("heading", { name: "Create something players remember." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "League", exact: true }),
  ).toBeVisible();

  await page.goto(`${hqBaseUrl}/ai`);
  await expect(page.getByText("Grounded read-only analysis")).toBeVisible();
  await expect(page.getByText("Read-only", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Model-generated recommendations remain off/),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
