import { expect, test, type Page } from "@playwright/test";

/**
 * People on the new shell (H-PEOPLE), in demo mode: search and segments as
 * addresses, an open person, a plan paused through its strong confirmation
 * (a double click sends one request), a junior added with a guardian, an
 * import dry run with problems then its confirmation, a merge, a coach's
 * limited view (no payments, no health), the health address refused for a
 * role without the permission (without leaking a value), and every People
 * page at 375 px with no horizontal scroll and no legacy stylesheet.
 *
 * Ported access checks from the legacy People pages: "health appears only
 * after a player grants access" (now also: only for owners and managers),
 * and the minor's contact routed to the guardian (legacy showed the
 * guardian's address on the junior's row; the new row shows none).
 */
const hqBaseUrl =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;
const hq = (path: string) => new URL(path, hqBaseUrl).toString();

/** Demo fixtures (`loadDemoOperatorWorkspace`); not secrets. */
const maya = "10000000-0000-4000-8000-000000000201";
const jordan = "10000000-0000-4000-8000-000000000202";
const ava = "10000000-0000-4000-8000-000000000203";

async function signIn(page: Page, persona = "club-owner") {
  await page
    .context()
    .addCookies([
      { name: "duna-demo-persona", value: persona, url: hqBaseUrl },
    ]);
}

async function title(page: Page, text: string | RegExp) {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(text);
}

function countActions(page: Page): string[] {
  const actions: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) {
      actions.push(request.url());
    }
  });
  return actions;
}

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "The spec sets its own widths.",
  );
});

test("search and segments are shareable addresses, and a junior shows no contact", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq("/people"));
  await title(page, "People");
  const list = page.getByRole("list", { name: "People" });
  await expect(list.getByRole("link", { name: "Maya Chen" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search people" }).fill("noah");
  await expect(list.getByRole("link", { name: "Maya Chen" })).toHaveCount(0);
  await expect(list.getByRole("link", { name: "Noah Martinez" })).toBeVisible();
  await expect(page).toHaveURL(/\/people\?q=noah$/);
  await page.getByRole("searchbox", { name: "Search people" }).fill("");
  await page.getByRole("button", { name: /^Juniors, \d+$/ }).click();
  await expect(page).toHaveURL(/segment=juniors/);
  await expect(list.getByRole("link", { name: "Ava Patel" })).toBeVisible();
  await expect(list.getByRole("link", { name: "Maya Chen" })).toHaveCount(0);
  // The junior's row never carries a contact (the guardian is the contact).
  await expect(list).not.toContainText("@");
  // The address opens the same view.
  await page.reload();
  await expect(
    page.getByRole("button", { name: /^Juniors, \d+$/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(list.getByRole("link", { name: "Ava Patel" })).toBeVisible();
});

test("the list moves by keyboard and opens a person with their next action and card", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq("/people"));
  const list = page.getByRole("list", { name: "People" });
  const first = list.getByRole("link").first();
  await first.focus();
  await page.keyboard.press("ArrowDown");
  const second = list.getByRole("link").nth(1);
  await expect(second).toBeFocused();
  await page.goto(hq(`/people/${maya}`));
  await title(page, "Maya Chen");
  const tabs = page.getByRole("navigation", { name: "Maya Chen" });
  for (const tab of [
    "Overview",
    "Memberships and credits",
    "Bookings",
    "Payments",
    "Family",
    "Documents",
  ]) {
    await expect(
      tabs.getByRole("link", { name: new RegExp(`^${tab}`) }),
    ).toHaveCount(1);
  }
  // Maya is up to date: the next best action says so, calmly.
  await expect(
    page.getByRole("region", { name: "Nothing needs you" }),
  ).toContainText("Next best action");
});

test("pausing a plan asks a strong confirmation, and a double click sends one request", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq(`/people/${maya}/memberships`));
  await title(page, "Maya Chen");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(
    "Pause Maya Chen's Performance membership?",
  );
  await expect(dialog).toContainText("Performance membership for Maya Chen");
  const actions = countActions(page);
  await dialog
    .getByRole("button", { name: "Pause Performance membership" })
    .dblclick();
  await expect(dialog).toContainText(/isn't switched on|Nothing was changed/);
  expect(actions).toHaveLength(1);
});

test("adding a junior asks for the guardian, explains duplicates, and sends once", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq("/people/invite"));
  await title(page, "Add a person");
  await page.getByRole("textbox", { name: "Name" }).fill("Ava Patel");
  await page.getByRole("radio", { name: "A junior, under 18" }).check();
  // A junior with the same name is explained before anything is saved.
  await expect(
    page.getByRole("region", { name: "Possible duplicates" }),
  ).toContainText("Ava Patel has the same name (a junior).");
  await page.getByRole("textbox", { name: "Name" }).fill("Lily Park");
  await page.getByRole("button", { name: "Review invitation" }).click();
  await expect(page.getByText("Enter the guardian's name.")).toBeVisible();
  await page.getByRole("textbox", { name: "Guardian name" }).fill("Sam Park");
  await page
    .getByRole("textbox", { name: /Guardian email/ })
    .fill("sam.park@example.com");
  await page.getByRole("button", { name: "Review invitation" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Invite Sam Park to add Lily?");
  await expect(dialog).toContainText("by email to sam.park@example.com");
  await expect(dialog).toContainText("never contacts Lily directly");
  const actions = countActions(page);
  await dialog
    .getByRole("button", { name: "Send the invitation to Sam" })
    .dblclick();
  await expect(
    page.getByText(/isn't set up yet|Invitation sent|is invited/).first(),
  ).toBeVisible();
  expect(actions).toHaveLength(1);
});

test("an import dry run shows each problem, writes nothing, then confirms with counts", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq("/people/import"));
  await title(page, "Import people");
  const actions = countActions(page);
  await page.getByLabel("Spreadsheet file").setInputFiles({
    name: "members.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      [
        "Name,Email,Mobile,Date of birth,Guardian name,Guardian email",
        "Sam Lee,sam@example.com,,,,",
        "Rae Kim,,+13105550190,,,",
        ",nobody@example.com,,,,",
        "Kid One,,,2016-03-02,,",
        "Maya Chen,maya@example.com,,,,",
      ].join("\n"),
    ),
  });
  await expect(page.getByText("members.csv: 5 rows")).toBeVisible();
  await page.getByRole("button", { name: "Check the rows" }).click();
  await expect(
    page.getByText(
      "Nothing is saved yet. 2 ready, 1 duplicate, 2 with problems.",
    ),
  ).toBeVisible();
  const rows = page.getByRole("list", { name: "Rows in the file" });
  await expect(rows).toContainText("No name");
  await expect(rows).toContainText("Junior without a guardian email or mobile");
  await expect(rows).toContainText("Already at the club: Maya Chen");
  // The dry run itself sent nothing to the server.
  expect(actions).toHaveLength(0);
  await page.getByRole("button", { name: "Import 2 people" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Add 2 people to the club?");
  await expect(dialog).toContainText(
    "1 duplicate and 2 rows with problems are left out",
  );
  await expect(dialog).toContainText("No one is messaged.");
  await dialog.getByRole("button", { name: "Add 2 people" }).click();
  await expect(dialog).toContainText("Nothing was changed.");
  expect(actions).toHaveLength(1);
});

test("merging shows both records side by side and says what is kept", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq(`/people/merge?a=${maya}&b=${jordan}`));
  await title(page, "Merge duplicates");
  await expect(
    page.getByRole("region", { name: "Side by side" }),
  ).toContainText("Jordan Smith");
  const kept = page.getByRole("region", { name: "What is kept" });
  await expect(kept).toContainText("Credits");
  await page.getByRole("button", { name: "Review the merge" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Merge Jordan Smith into Maya Chen?");
  await expect(dialog).toContainText("A merge can't be undone.");
  await dialog.getByRole("button", { name: "Merge into Maya Chen" }).click();
  await expect(dialog).toContainText("Nothing was changed.");
  // A junior and an adult are never merged.
  await page.goto(hq(`/people/merge?a=${maya}&b=${ava}`));
  await expect(page.getByText("These can't be merged")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review the merge" }),
  ).toBeDisabled();
});

test("a coach sees people without payments or health, even in the page's data", async ({
  page,
}) => {
  await signIn(page, "coach");
  await page.goto(hq(`/people/${maya}`));
  await title(page, "Maya Chen");
  const tabs = page.getByRole("navigation", { name: "Maya Chen" });
  await expect(tabs.getByRole("link", { name: "Overview" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Payments" })).toHaveCount(0);
  await expect(tabs.getByRole("link", { name: "Health" })).toHaveCount(0);
  // Neither rendered nor serialised into the page for the browser.
  const html = await page.content();
  expect(html).not.toContain("1,485");
  expect(html).not.toContain("heartRateVariabilityMs");
  expect(html).not.toContain("restingHeartRate");
  await page.goto(hq("/people"));
  await expect(page.getByRole("button", { name: "Export" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Add a person" })).toHaveCount(0);
  await page.goto(hq(`/people/${maya}/payments`));
  await expect(
    page.getByText("You don't have access to Payments"),
  ).toBeVisible();
  expect(await page.content()).not.toContain("1,485");
});

test("the health address answers 'You need access' to a role without the permission, leaking nothing", async ({
  page,
}) => {
  await signIn(page, "coach");
  const response = await page.goto(hq(`/people/${maya}/health`));
  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByText("You don't have access to Health")).toBeVisible();
  const html = await page.content();
  for (const leak of ["Resting heart rate", "58 bpm", "restingHeartRate"]) {
    expect(html, leak).not.toContain(leak);
  }
  // An owner sees the summary, with the standing wording.
  await signIn(page, "club-owner");
  await page.goto(hq(`/people/${maya}/health`));
  await expect(page.getByText("58 bpm")).toBeVisible();
  await expect(page.getByText(/not medical advice/).first()).toBeVisible();
  // No one sees a junior's health in HQ, not even the owner.
  await page.goto(hq(`/people/${ava}/health`));
  await expect(page.getByText("You don't have access to Health")).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Ava Patel" })
      .getByRole("link", { name: "Health" }),
  ).toHaveCount(0);
});

test("a junior's page names the guardian at the top and never a contact of their own", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq(`/people/${ava}`));
  await title(page, "Ava Patel");
  await expect(page.getByText(/^Junior\./).first()).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText("elena@example.com");
  await page.goto(hq(`/people/${ava}/family`));
  await expect(page.getByText(/never contacts Ava directly/)).toBeVisible();
});

test("every People page fits a phone and loads no legacy stylesheet", async ({
  page,
}) => {
  await signIn(page);
  await page.setViewportSize({ width: 375, height: 812 });
  const stylesheets: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "stylesheet")
      stylesheets.push(request.url());
  });
  for (const path of [
    "/people",
    "/people?segment=attention",
    "/people/invite",
    "/people/import",
    `/people/merge?a=${maya}&b=${jordan}`,
    `/people/${maya}`,
    `/people/${maya}/memberships`,
    `/people/${maya}/bookings`,
    `/people/${maya}/payments`,
    `/people/${maya}/family`,
    `/people/${maya}/documents`,
    `/people/${maya}/notes`,
    `/people/${maya}/health`,
    `/people/${ava}`,
  ]) {
    await page.goto(hq(path));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForFunction(() =>
      document
        .getAnimations()
        .every(
          (animation) =>
            animation.playState !== "running" ||
            animation.effect?.getTiming().iterations === Infinity,
        ),
    );
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(2);
  }
  expect(
    stylesheets.filter((url) =>
      /globals|design-v3|work-focus|forms\.css|legacy/.test(url),
    ),
  ).toEqual([]);
});
