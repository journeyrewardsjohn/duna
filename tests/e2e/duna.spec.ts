import { expect, test, type Locator, type Page } from "@playwright/test";

const hqBaseUrl =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;
const navigationTimeout = process.env.CI ? 30_000 : 15_000;

async function clickAndWaitForUrl(
  page: Page,
  locator: Locator,
  expected: RegExp | string,
) {
  await Promise.all([
    page.waitForURL(expected, { timeout: navigationTimeout }),
    locator.click(),
  ]);
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(
    dimensions.clientWidth + 2,
  );
}

async function getBox(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

test("marketing and player discovery stay usable", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(
    page.getByRole("heading", {
      name: /Everything that happens on sand.*One living game/,
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Find a game/ })).toBeVisible();
  const sandCanvas = page.getByTestId("homepage-sand-world").locator("canvas");
  await expect(sandCanvas).toBeVisible();
  await expect(sandCanvas).toHaveAttribute(
    "data-renderer",
    /^(webgl|fallback)$/,
  );
  if ((await sandCanvas.getAttribute("data-renderer")) === "webgl") {
    await expect(sandCanvas).toHaveAttribute(
      "data-quality",
      /^(hardware|software)$/,
    );
    if ((await sandCanvas.getAttribute("data-quality")) === "software") {
      await expect(sandCanvas).toHaveAttribute("data-motion", "static");
    }
  }
  await expect(
    page.getByRole("link", { name: "Duna HQ" }).first(),
  ).toHaveAttribute("href", /.+/);
  await expectNoHorizontalOverflow(page);

  await page.goto("/app/discover");
  await expect(page).toHaveURL(/\/discover(?:\?|$)/);
  await expect(
    page.getByRole("heading", { name: "Find your game." }),
  ).toBeVisible();
  await expect(page.getByLabel("Search Duna")).toBeVisible();
  await expect(page.getByRole("button", { name: /^WHERE:/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^WHEN:/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^WHAT:/ })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("public discovery carries Where, When, and What into the map sheet", async ({
  page,
}) => {
  await page.goto("/discover");

  await page.getByRole("button", { name: /^WHERE:/ }).click();
  const whereDialog = page.getByRole("dialog", {
    name: "Where do you want to play?",
  });
  await whereDialog
    .getByRole("button", { name: /Manhattan Beach, CA Manhattan Beach Pier/ })
    .click();
  await whereDialog.getByRole("button", { name: "Close search" }).click();

  await page.getByRole("button", { name: /^WHEN:/ }).click();
  const whenDialog = page.getByRole("dialog", { name: "When works for you?" });
  await whenDialog.getByRole("button", { name: /Next 7 Days/ }).click();
  await whenDialog.getByRole("button", { name: "Close search" }).click();

  await page.getByRole("button", { name: /^WHAT:/ }).click();
  const whatDialog = page.getByRole("dialog", {
    name: "What are you looking for?",
  });
  await whatDialog.getByRole("button", { name: /Court Rentals/ }).click();
  await clickAndWaitForUrl(
    page,
    whatDialog.getByRole("button", { name: /^Show \d+ results$/ }),
    /\/discover\/map\?.*where=place.*when=next-7-days.*what=court-rentals/,
  );
  const sheet = page.locator(".discover-v2-sheet");
  await expect(
    sheet.getByText(/\d+ results (?:within [\d,]+ mi|· expanded worldwide)/),
  ).toBeVisible();
  const handle = page.locator(".discover-v2-sheet__handle");
  const handleBox = await getBox(handle);
  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y - 80, {
    steps: 6,
  });
  await page.mouse.up();
  await expect(sheet).toHaveClass(/is-full/);

  await clickAndWaitForUrl(
    page,
    sheet.locator("a[href^='/venues/']").first(),
    /\/venues\/[^/]+$/,
  );
  await expect(
    page.getByRole("heading", { name: "Manhattan Beach Pier" }),
  ).toBeVisible({ timeout: navigationTimeout });
  await expectNoHorizontalOverflow(page);
});

test("wide, short homepages keep the hero clear of fixed navigation", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1374, height: 741 },
    { width: 1832, height: 988 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const header = page.locator(".site-header");
    const eyebrow = page.getByText("Beach volleyball, connected", {
      exact: true,
    });
    const primaryAction = page.getByRole("link", { name: /Find a game/ });
    const scrollCue = page.getByText("Scroll through the sand", {
      exact: true,
    });

    await expect(eyebrow).toBeVisible();
    await expect(primaryAction).toBeVisible();
    await expect(scrollCue).toBeVisible();

    const [headerBox, eyebrowBox, actionBox, cueBox] = await Promise.all([
      getBox(header),
      getBox(eyebrow),
      getBox(primaryAction),
      getBox(scrollCue),
    ]);

    expect(eyebrowBox.y).toBeGreaterThanOrEqual(
      headerBox.y + headerBox.height + 8,
    );
    expect(actionBox.y + actionBox.height + 8).toBeLessThanOrEqual(cueBox.y);
    expect(cueBox.y + cueBox.height).toBeLessThanOrEqual(viewport.height);
    await expectNoHorizontalOverflow(page);
  }
});

test("mobile public navigation opens as a full-screen product sheet", async ({
  page,
}) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "Open navigation menu" }).click();

    const sheet = page.getByRole("dialog", {
      name: "Where do you want to go?",
    });
    await expect(sheet).toBeVisible();
    await expect(
      sheet.getByRole("link", { name: /Duna Player/ }),
    ).toBeVisible();
    await expect(sheet.getByRole("link", { name: /Duna HQ/ })).toBeVisible();
    await expect(
      sheet.getByRole("navigation", { name: "Mobile navigation" }),
    ).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: /Color theme/ }),
    ).toBeVisible();

    const bounds = await sheet.boundingBox();
    expect(bounds?.x).toBeLessThanOrEqual(1);
    expect(bounds?.y).toBeLessThanOrEqual(1);
    expect(bounds?.width).toBeGreaterThanOrEqual(viewport.width - 2);
    expect(bounds?.height).toBeGreaterThanOrEqual(viewport.height - 2);
    await expectNoHorizontalOverflow(page);

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  }
});

test("club and coach marketing keeps both operating paths clear", async ({
  page,
}) => {
  await page.goto("/run-your-club");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Run the business. Keep the game human.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Run every court like one connected club.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Your coaching business. In your hand.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Assistance proposes. Operators decide.",
    }),
  ).toBeVisible();
  await expect(page.getByText("Player-controlled summaries")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("player home puts useful actions and the personal calendar first", async ({
  page,
}) => {
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: /Ready to play/ }),
  ).toBeVisible();
  const quickActions = page.getByRole("navigation", {
    name: "Player quick actions",
  });
  await expect(
    quickActions.getByRole("link", { name: /Find play/ }),
  ).toBeVisible();
  await expect(
    quickActions.getByRole("link", { name: /Host pickup/ }),
  ).toBeVisible();
  await expect(page.getByText("Next up", { exact: true })).toBeVisible();
  const nextUpDate = page
    .getByRole("region", { name: "Your day" })
    .locator("time")
    .first();
  await expect(nextUpDate).toBeVisible();
  await expect(nextUpDate).not.toContainText(":");
  await expect(page.locator('img[src*="duna-campaign-rally"]')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("public pickup pages keep their story and booking rail contained", async ({
  page,
}) => {
  await page.goto("/events/golden-hour-fours");
  await expect(
    page.getByRole("heading", { level: 1, name: "Golden Hour 4s" }),
  ).toBeVisible();
  await expect(page.getByText("Ready to play?")).toBeVisible();
  await expect(
    page.getByText("6:00 PM–7:30 PM PDT", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Golden Hour 4s event poster" }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("homepage sand motion respects the reduced-motion preference", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const sandCanvas = page.getByTestId("homepage-sand-world").locator("canvas");
  await expect(sandCanvas).toHaveAttribute(
    "data-renderer",
    /^(webgl|fallback)$/,
  );

  if ((await sandCanvas.getAttribute("data-renderer")) === "webgl") {
    await expect(sandCanvas).toHaveAttribute("data-motion", "static");
  }

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
  const mobileMenu = page.getByRole("button", {
    name: "Open navigation menu",
  });
  const usesMobileNavigation = (page.viewportSize()?.width ?? 1_281) <= 1_180;
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme-preference",
    "system",
  );
  if (usesMobileNavigation) {
    await expect(mobileMenu).toBeVisible();
    await mobileMenu.click();
  }
  const themeToggle = usesMobileNavigation
    ? page
        .getByRole("dialog", { name: "Where do you want to go?" })
        .getByRole("button", { name: /Color theme:/ })
    : page.getByRole("button", { name: /Color theme:/ }).first();
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
  const expectedHqUrl = new URL(hqBaseUrl);
  const acceptableHqHosts = new Set([expectedHqUrl.hostname]);
  // A local dev server can resolve either loopback spelling while CI keeps the
  // configured host. They are the same local Duna HQ destination.
  if (expectedHqUrl.hostname === "127.0.0.1") {
    acceptableHqHosts.add("localhost");
  }
  await page.waitForURL((url) => {
    return (
      acceptableHqHosts.has(url.hostname) &&
      url.port === expectedHqUrl.port &&
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
  await page.getByRole("button", { name: /Divisions$/ }).click();
  await expect(page.getByText("Price basis", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /Pricing$/ }).click();
  await expect(
    page.getByRole("heading", { name: "Price the event in one place." }),
  ).toBeVisible();
  await expect(
    page.getByRole("spinbutton", { name: /Gross price/ }),
  ).toBeVisible();
  await expect(
    page.getByText("No paid registrations need grandfathering."),
  ).toBeVisible();
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
  await expect(
    page.getByRole("link", { name: "Reserve VIP access" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /players in the field\./ }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto(
    "/checkout/sunset-open-qualifier?division=20000000-0000-4000-8000-000000000001",
  );
  await expect(
    page.getByRole("heading", { name: "Review your place on the sand." }),
  ).toBeVisible();
  await expect(
    page.getByText("No account wall before this point."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Create free account/ }),
  ).toHaveAttribute(
    "href",
    /\/sign-up\?returnTo=%2Fapp%2Fcheckout%2Fsunset-open-qualifier/,
  );
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
  await expect(page.getByText("Add players now")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Search Duna player profiles" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /View .*'s profile/ }).first(),
  ).toBeVisible();
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
  // The selected day is centered after hydration. Wait for that initial
  // positioning before asserting that changing days does not move the rail.
  await expect
    .poll(() => rail.evaluate((element) => Math.round(element.scrollLeft)))
    .toBeGreaterThan(0);
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
  await expect(
    page.getByRole("heading", { name: "Matches on your courts" }),
  ).toHaveCount(0);
  const aiAnalyst = page.locator(".hq-ai-analyst");
  await expect(aiAnalyst).toBeVisible();
  const aiAnalystColors = await aiAnalyst.evaluate((rail) => {
    const color = (selector: string) => {
      const element = rail.querySelector(selector);
      return element ? getComputedStyle(element).color : null;
    };

    return {
      action: color(".hq-ai-signal a"),
      heading: color(".hq-ai-analyst__intro h2"),
      signalHeading: color(".hq-ai-signal h3"),
    };
  });
  expect(aiAnalystColors).toEqual({
    action: "rgb(169, 196, 99)",
    heading: "rgb(232, 242, 212)",
    signalHeading: "rgb(232, 242, 212)",
  });
  await expect(page.getByText("Payments are connected.")).toHaveCount(0);
  await expect(
    page
      .locator(".hq-analytics-metrics")
      .getByText("Payments", { exact: true }),
  ).toHaveCount(0);

  const schedule = page.locator(".hq-schedule-list");
  await expect(schedule).toBeVisible();
  await expect(schedule.locator("a.hq-schedule-row")).toHaveCount(5);
  await expect(schedule.locator(".hq-schedule-row__roster")).toHaveCount(5);
  await expect(schedule.getByText(/^scheduled$/i)).toHaveCount(0);
  await expect(
    schedule.getByRole("button", { name: /More options/ }),
  ).toHaveCount(0);
  const firstSession = schedule.getByRole("link", {
    name: /Sunset doubles training.*open session operations/,
  });
  await expect(firstSession).toHaveAttribute(
    "href",
    "/events/10000000-0000-4000-8000-000000000301",
  );
  await expect(firstSession.getByText("6 of 8 joined")).toBeVisible();
  await expect(
    firstSession.locator(".hq-schedule-row__avatars > span"),
  ).toHaveCount(5);
  const playerView = schedule.getByRole("link", {
    name: /Golden Hour 4s.*open player view/,
  });
  await expect(playerView).toHaveAttribute(
    "href",
    /\/events\/golden-hour-fours$/,
  );
  await expect(playerView).toHaveAttribute("target", "_blank");
  await expectNoHorizontalOverflow(page);

  await clickAndWaitForUrl(
    page,
    firstSession,
    /\/events\/10000000-0000-4000-8000-000000000301$/,
  );
  await expect(
    page.getByRole("heading", { name: "Sunset doubles training" }),
  ).toBeVisible({ timeout: navigationTimeout });
  await page.goto(`${hqBaseUrl}/`);

  await page.goto(`${hqBaseUrl}/locations`);
  await expect(page.getByRole("heading", { name: "Venues" })).toBeVisible();
  const venueWorkspace = page.getByRole("link", {
    name: "Open venue workspace",
  });
  await expect(venueWorkspace).toBeVisible();
  await clickAndWaitForUrl(
    page,
    venueWorkspace,
    /\/locations\/10000000-0000-4000-8000-000000000101$/,
  );
  await expect(
    page.getByRole("heading", { name: "Beach Elite Training Center" }).first(),
  ).toBeVisible({ timeout: navigationTimeout });
  const venueDetails = page.getByRole("button", {
    name: "Venue details",
    exact: true,
  });
  await expect(venueDetails).toBeVisible({ timeout: navigationTimeout });
  await venueDetails.click();
  await expect(
    page.getByRole("radio", { name: /Public location/ }),
  ).toBeVisible({ timeout: navigationTimeout });
  await expect(
    page.getByRole("radio", { name: /Private venue/ }),
  ).toBeChecked();
  const exactPin = page.getByRole("button", { name: /Exact venue pin/ });
  await expect(exactPin).toBeVisible();
  const longitudeBefore = await page
    .locator('input[name="longitude"]')
    .inputValue();
  await exactPin.press("ArrowRight");
  await expect(page.locator('input[name="longitude"]')).not.toHaveValue(
    longitudeBefore,
  );
  await expect(
    page.getByRole("radio", { name: "Free parking on-site" }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Paid parking on-site" }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Public restrooms" }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Private restrooms" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Courts & rates/ }).click();
  await expect(
    page.getByText("Championship Court", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Community Court", { exact: true }),
  ).toBeVisible();
  await clickAndWaitForUrl(
    page,
    page.getByRole("link", { name: /Championship Court/ }),
    /\/locations\/10000000-0000-4000-8000-000000000101\/courts\/10000000-0000-4000-8000-000000000103$/,
  );
  await expect(
    page.getByRole("heading", { name: "Championship Court" }),
  ).toBeVisible({ timeout: navigationTimeout });
  await expect(
    page.getByRole("button", { name: "Availability", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pricing & rules", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Availability", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Set recurring court hours." }),
  ).toBeVisible();
  await expect(page.getByLabel("Monday start time")).toHaveValue("07:00");
  await page
    .getByRole("button", { name: "Pricing & rules", exact: true })
    .click();
  await expect(page.getByLabel("Rate plan")).toHaveValue(
    "10000000-0000-4000-8000-000000000102",
  );
  await expectNoHorizontalOverflow(page);

  await page.goto(
    `${hqBaseUrl}/locations/10000000-0000-4000-8000-000000000101/layout`,
  );
  await expect(page.getByText("Venue layout studio")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Player preview" }),
  ).toBeVisible();
  const addToLayout = page.getByRole("button", { name: "Add to layout" });
  await expect(addToLayout).toBeVisible();
  await addToLayout.click();
  await page
    .getByRole("button", { name: /Duna short court 16 × 8 m court/ })
    .click();
  const courtLayoutDialog = page.getByRole("dialog", {
    name: "Add Duna short court",
  });
  await expect(courtLayoutDialog).toBeVisible();
  await expect(
    courtLayoutDialog.getByText("Visual court → real court"),
  ).toBeVisible();
  await courtLayoutDialog.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Publish & automation" }).click();
  await expect(
    page.getByRole("heading", { name: "AI Court Assignment" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Publish event map" }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto(`${hqBaseUrl}/locations/create`);
  await expect(
    page.getByRole("heading", { name: "Create a place players can find." }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: /Public location/ }),
  ).toBeChecked();
  await expect(
    page.getByRole("radio", { name: /Private venue/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  await expectNoHorizontalOverflow(page);

  await page.goto(`${hqBaseUrl}/calendar`);
  await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
  await expect(
    page.getByText("Championship Court", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Community Court", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No matches ready to score" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Review sessions/ }),
  ).toHaveAttribute("href", "/events");
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
  await expect(page.getByText("Context-aware co-pilot")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "See what matters. Act with control." }),
  ).toBeVisible();
  await expect(page.getByText("Consequential work")).toBeVisible();
  await expect(
    page.getByText("Fresh approval, execution result, audit trail"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Web research off" }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
