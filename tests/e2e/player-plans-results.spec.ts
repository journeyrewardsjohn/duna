import { expect, test, type Page } from "@playwright/test";

/**
 * Play, hosting, results, a result's confirmation, profile and settings for
 * players on the web (P-WEB-1). Demo mode: `duna-demo-persona` chooses who
 * is signed in; the test-only `duna-demo-plans=<scope>` gives sample plans
 * dated from today (what a test cancels is remembered for its scope only) and
 * `duna-demo-side=opponent` looks at a demo result as the other side. Neither
 * switch exists on production (components/player/demo.ts).
 */
const webBaseUrl =
  process.env.PLAYWRIGHT_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_WEB_PORT ?? "3000"}`;

/** Selectors and files that exist only in the legacy sheets (app/(legacy)). */
const LEGACY_SHEETS = /globals|design-v3|design-v4|player-focus|public-website/;

async function signIn(
  page: Page,
  persona = "player",
  extra: Record<string, string> = {},
) {
  const scope = `t${Math.random().toString(36).slice(2, 10)}`;
  await page.context().addCookies([
    { name: "duna-demo-persona", value: persona, url: webBaseUrl },
    { name: "duna-demo-plans", value: scope, url: webBaseUrl },
    ...Object.entries(extra).map(([name, value]) => ({
      name,
      value,
      url: webBaseUrl,
    })),
  ]);
  // Each test is its own client: the place search and score budgets never leak.
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `10.${octet()}.${octet()}.${octet()}`,
  });
}

async function expectCleanPage(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(2);
  const sheets = await page.evaluate(() =>
    [...document.querySelectorAll("link[rel='stylesheet']")].map(
      (link) => (link as HTMLLinkElement).href,
    ),
  );
  expect(sheets.filter((href) => LEGACY_SHEETS.test(href))).toEqual([]);
}

async function mockPlaces(page: Page) {
  await page.route("**/api/places/autocomplete**", (route) =>
    route.fulfill({
      json: {
        suggestions: [
          {
            placeId: "ChIJdockside-test-01",
            text: "Dockside Sand Courts, Harbor Way",
            mainText: "Dockside Sand Courts",
            secondaryText: "Harbor Way",
          },
        ],
      },
    }),
  );
  await page.route("**/api/places/details**", (route) =>
    route.fulfill({
      json: {
        placeId: "ChIJdockside-test-01",
        name: "Dockside Sand Courts",
        address: "1 Harbor Way",
        latitude: 33.9,
        longitude: -118.42,
      },
    }),
  );
}

async function choosePlace(page: Page, label: string) {
  await page.getByRole("combobox", { name: label }).fill("Docks");
  await page
    .getByRole("option", { name: /Dockside Sand Courts\s*Harbor Way/ })
    .click();
  await expect(page.getByText("Dockside Sand Courts").first()).toBeVisible();
}

function plan(page: Page, title: string) {
  return page.getByRole("listitem").filter({
    has: page.getByRole("heading", { level: 3, name: title }),
  });
}

test.describe("Plans", () => {
  test("an upcoming plan: its group state, price and free-cancellation line, then cancel through a confirmation (one request on a double click)", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/play");
    await expect(
      page.getByRole("heading", { level: 1, name: "Your plans" }),
    ).toBeVisible();
    const clinic = plan(page, "Serve + Receive Lab");
    await expect(clinic.getByText("Needs 2 more")).toBeVisible();
    await expect(clinic.getByText("3 credits now.")).toBeVisible();
    await expect(clinic.getByText(/^Free cancellation until /)).toBeVisible();
    await expectCleanPage(page);

    const actions: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.headers()["next-action"])
        actions.push(request.url());
    });
    await clinic.getByRole("button", { name: "Cancel my place" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("3 credits come back to the wallet");
    await dialog.getByRole("button", { name: "Cancel my place" }).dblclick();
    await expect(page.getByText(/Demo: nothing was changed\./)).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: "Serve + Receive Lab" }),
    ).toHaveCount(0);
    expect(actions).toHaveLength(1);
  });

  test("leave a waitlist after a confirmation, then join it again", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/play");
    const waitlist = plan(page, "Sunset Open · Women's AA");
    await expect(waitlist.getByText("On the waitlist")).toBeVisible();
    await waitlist.getByRole("button", { name: "Leave the waitlist" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("lose your place in line");
    await dialog.getByRole("button", { name: "Leave the waitlist" }).click();
    await expect(
      page.getByText("You left the waitlist for Sunset Open · Women's AA"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Join the waitlist again" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Join the waitlist" })
      .click();
    await expect(
      page.getByText("You’re number 2 on the waitlist"),
    ).toBeVisible();
  });

  test("invite a friend: a link to share yourself, nothing is sent", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/play");
    await plan(page, "Golden Hour 4s")
      .getByRole("button", { name: "Invite a friend" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Invite a friend" });
    await expect(dialog).toContainText("Duna doesn’t send anything for you.");
    await expect(dialog.getByRole("textbox")).toHaveValue(/\/i\/demoInvite12$/);
  });

  test("keyboard: tab to a plan's action, open its confirmation, Escape keeps the plan", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/play");
    const cancel = plan(page, "Serve + Receive Lab").getByRole("button", {
      name: "Cancel my place",
    });
    await cancel.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(
      page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Keep the place" }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toBeHidden();
    await expect(
      page.getByRole("heading", { level: 3, name: "Serve + Receive Lab" }),
    ).toBeVisible();
  });

  test("a guardian acting for a junior sees the junior's plans and acts for them", async ({
    page,
  }) => {
    await signIn(page, "parent");
    await page.goto("/app");
    const menu =
      (page.viewportSize()?.width ?? 0) >= 1024
        ? page
            .getByRole("navigation", { name: "Duna Player" })
            .getByRole("button", { name: /Account menu for/ })
        : page.getByRole("button", { name: /Account menu for/ }).first();
    await menu.click();
    await page.getByRole("button", { name: /Remy Lewis/ }).click();
    await expect(page.getByText("You’re acting for Remy Lewis.")).toBeVisible();
    await page.goto("/app/play");
    await expect(
      page.getByRole("heading", { level: 1, name: "Remy’s plans" }),
    ).toBeVisible();
    const junior = plan(page, "Junior Sand Skills");
    await expect(junior.getByText("For Remy")).toBeVisible();
    await expect(
      junior.getByRole("button", { name: "Cancel Remy’s place" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: "Serve + Receive Lab" }),
    ).toHaveCount(0);
  });
});

test("host a pickup: the form, the player preview, then publish after a confirmation", async ({
  page,
}) => {
  await signIn(page);
  await mockPlaces(page);
  await page.goto("/app/pickup/new");
  await expect(
    page.getByRole("heading", { level: 1, name: "Host a pickup" }),
  ).toBeVisible();
  await choosePlace(page, "Where");
  await expect(
    page.getByText("No minimum, up to 8 players. Keeps a waitlist."),
  ).toBeVisible();
  await expectCleanPage(page);
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByText("Player preview")).toBeVisible();
  await expect(
    page.getByText("Core details lock at the start time."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Publish pickup" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Publish pickup" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Golden Hour 4s is live." }),
  ).toBeVisible();
});

async function addResult(page: Page): Promise<string> {
  await mockPlaces(page);
  await page.goto("/app/score");
  await choosePlace(page, "Where did you play");
  await expect(page.getByRole("region", { name: "Your side" })).toBeVisible();
  await page.getByRole("button", { name: "Add Theo Park" }).first().click();
  await page.getByRole("button", { name: "Add Noa Williams" }).last().click();
  await page.getByRole("button", { name: "Add Elena Torres" }).last().click();
  await page
    .getByRole("checkbox", {
      name: "Everyone on court agreed to record this match.",
    })
    .check();
  await expect(
    page.getByText(
      "It moves only when someone on the other side confirms, and everyone in the match has a Duna profile.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save result" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Save result" })
    .click();
  await page.waitForURL(/\/app\/matches\/[0-9a-f-]{36}$/);
  return page.url();
}

test.describe("Results", () => {
  test("add a result, land on it, the other side confirms, and the rating moves", async ({
    page,
  }) => {
    await signIn(page);
    const resultUrl = await addResult(page);
    await expect(page.getByText("Awaiting confirmation").first()).toBeVisible();
    await expect(page.getByText("Waiting on Noa or Elena")).toBeVisible();

    // "Ask them to confirm" is a message the person edits and sends themselves.
    await page.getByRole("button", { name: "Ask them to confirm" }).click();
    const ask = page.getByRole("dialog", { name: "Your message" });
    await expect(ask.getByRole("textbox", { name: "Message" })).toHaveValue(
      /^I added our match on Duna, Noa and Elena\. Can you confirm the score\?/,
    );
    await page.keyboard.press("Escape");
    await expect(ask).toBeHidden();

    // The other side confirms.
    await page
      .context()
      .addCookies([
        { name: "duna-demo-side", value: "opponent", url: webBaseUrl },
      ]);
    await page.goto(resultUrl);
    await expect(page.getByText("Waiting on you")).toBeVisible();
    await page.getByRole("button", { name: "Confirm result" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Confirm result" })
      .click();
    await expect(page.getByText("Confirmed.", { exact: true })).toBeVisible();

    // Back as the person who added it: the movement.
    await page.context().clearCookies({ name: "duna-demo-side" });
    await page.goto(resultUrl);
    await expect(page.getByText("Confirmed by both sides.")).toBeVisible();
    await expect(page.getByText("4.62 → 4.68")).toBeVisible();
    await expectCleanPage(page);
  });

  test("the other side disputes with a reason; it no longer counts", async ({
    page,
  }) => {
    await signIn(page);
    const resultUrl = await addResult(page);
    await page
      .context()
      .addCookies([
        { name: "duna-demo-side", value: "opponent", url: webBaseUrl },
      ]);
    await page.goto(resultUrl);
    await page.getByRole("button", { name: "Something’s wrong" }).click();
    const sheet = page.getByRole("dialog", { name: "What’s wrong?" });
    await sheet
      .getByRole("textbox", { name: "What happened" })
      .fill("Set 3 ended 15–13.");
    await sheet.getByRole("button", { name: "Send to the other side" }).click();
    await sheet.getByRole("button", { name: "Send", exact: true }).click();
    await expect(
      page.getByText("Sent. The result doesn’t count until you agree."),
    ).toBeVisible();
    await expect(page.getByText("Disputed").first()).toBeVisible();
  });

  test("history shows each result's state and what it did", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/matches");
    await expect(
      page.getByRole("heading", { level: 1, name: "Your results" }),
    ).toBeVisible();
    await expect(page.getByText("+0.08").first()).toBeVisible();
    await expectCleanPage(page);
  });
});

test("profile: change who can see you and the public preview follows", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/app/profile");
  const preview = page.getByLabel("Public preview");
  await expect(preview).toContainText("Your Sand Rating");
  await page.getByRole("radio", { name: /^Private/ }).check();
  await expect(preview).toContainText("No public page");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("radio", { name: /^Private/ })).toBeChecked();
  await page.getByRole("radio", { name: /^Public/ }).check();
  await expect(preview).toContainText("Open your public page");
  await expectCleanPage(page);
});

test("settings: download my data after a confirmation", async ({ page }) => {
  await signIn(page);
  await page.goto("/app/settings");
  await expect(
    page.getByRole("heading", { level: 2, name: "Duna Premium" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Download my data" }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Download my data" })
    .click();
  expect((await download).suggestedFilename()).toMatch(
    /^duna-data-export-\d{4}-\d{2}-\d{2}\.json$/,
  );
  await expectCleanPage(page);
});

test("a court invitation: what, by whom, the price line, accept after a confirmation", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/app/booking-invite/demo-court-invite");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Theo Park invited you to play",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Paid by Theo Park. Nothing to pay."),
  ).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: "I’ve read and accept this cancellation policy",
    })
    .check();
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Accept invitation" })
    .click();
  await expect(page.getByText("It’s in your plans")).toBeVisible();
});

test("an unknown team link says so and how to get a new one", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/app/team/claim/not-a-real-token");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "We couldn’t open this team link",
    }),
  ).toBeVisible();
});

test("reduced motion: the pages still arrive and every action works", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  await page.goto("/app/play");
  await plan(page, "Serve + Receive Lab")
    .getByRole("button", { name: "Cancel my place" })
    .click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.keyboard.press("Escape");
  for (const path of [
    "/app/matches",
    "/app/score",
    "/app/settings",
    "/app/onboarding",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectCleanPage(page);
  }
});
