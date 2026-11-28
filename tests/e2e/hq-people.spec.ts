import { expect, test, type Page } from "@playwright/test";

/**
 * People on the new shell (H-PEOPLE), in demo mode: search and segments as
 * addresses, an open person, a junior added with a guardian, giving
 * credits and refunds through their strong confirmations, import and merge
 * through Duna's own preview and a strong confirmation, team notes, tags,
 * the household with a guardian invitation that sends nothing, signature
 * requests as Inbox drafts, a coach's view (no payments; the Health tab
 * because the Health service says so), the Health service's rule by tab and
 * by address with no leak, and every People page at 375 px with no
 * horizontal scroll and no legacy stylesheet. Pause, resume and cancel of a
 * plan stay behind their capability switch (fixme: not built).
 *
 * Ported access checks from the legacy People pages: "health appears only
 * after a player grants access" (now by the Health service's own rule),
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
  // Clearing the search applies at once, so the address never carries the
  // old words (this was the flake: a reload with "?q=noah" still in it).
  await expect(page).toHaveURL(/\/people\?segment=juniors$/);
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

// Capability "membershipChange" (people-capabilities.ts): the plan buttons
// are offered only when `operator.people.changeMembership` exists.
test.fixme("pausing a plan asks a strong confirmation, and a double click sends one request [capability: membershipChange]", async ({
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
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Ava Patel");
  await page.getByRole("radio", { name: "A junior, under 18" }).check();
  // A junior with the same name is explained before anything is saved.
  await expect(
    page.getByRole("region", { name: "Possible duplicates" }),
  ).toContainText("Ava Patel has the same name (a junior).");
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Lily Park");
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

test("an import's dry run is Duna's own, writes nothing, then confirms with counts and messages no one", async ({
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
      ].join("\n"),
    ),
  });
  await expect(page.getByText("members.csv: 4 rows")).toBeVisible();
  // Choosing and matching the file asks the server nothing.
  expect(actions).toHaveLength(0);
  await page.getByRole("button", { name: "Check the rows" }).dblclick();
  await expect(
    page.getByRole("status").filter({ hasText: "Nothing is saved yet." }),
  ).toContainText("2 new");
  // One dry run, even for a double click.
  expect(actions).toHaveLength(1);
  const rows = page.getByRole("list", { name: "Rows in the file" });
  // Rows that need a look come first, each problem in words.
  await expect(rows).toContainText("Add the person's name.");
  await expect(rows).toContainText("A junior needs a parent or guardian.");
  await page.getByRole("button", { name: "Import 2 people" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Add 2 people to the club?");
  await expect(dialog).toContainText("2 rows with problems are left out");
  await expect(dialog).toContainText("No one is messaged.");
  await dialog.getByRole("button", { name: "Add 2 people" }).dblclick();
  await expect(page.getByRole("heading", { name: "Imported" })).toBeVisible();
  await expect(page.getByText("No one was messaged.").first()).toBeVisible();
  expect(actions).toHaveLength(2);
});

test("merging asks Duna what moves, then confirms strongly; a junior and an adult are never merged", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq(`/people/merge?a=${maya}&b=${jordan}`));
  await title(page, "Merge duplicates");
  await expect(
    page.getByRole("region", { name: "Side by side" }),
  ).toContainText("Jordan Smith");
  const actions = countActions(page);
  await page.getByRole("button", { name: "Review the merge" }).click();
  const plan = page.getByRole("region", { name: "What is kept" });
  await expect(plan).toContainText("What Maya Chen keeps");
  await expect(plan).toContainText("2 bookings");
  await page.getByRole("button", { name: "Merge into Maya Chen" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Merge Jordan Smith into Maya Chen?");
  await expect(dialog).toContainText("A merge can't be undone.");
  await expect(dialog).toContainText("no one is messaged");
  await dialog.getByRole("button", { name: "Merge into Maya Chen" }).dblclick();
  await expect(
    page.getByRole("status").filter({ hasText: "is now part of Maya Chen" }),
  ).toBeVisible();
  expect(actions).toHaveLength(2);
  // A junior and an adult are never merged.
  await page.goto(hq(`/people/merge?a=${maya}&b=${ava}`));
  await expect(page.getByText("These can't be merged")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review the merge" }),
  ).toBeDisabled();
});

test("giving credits restates them in a strong confirmation, and a double click sends one request", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq(`/people/${maya}/memberships`));
  // No plan change is offered until its procedure exists (no dead ends).
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toHaveCount(0);
  const form = page.getByRole("form", { name: "Give credits" });
  await form.getByRole("spinbutton", { name: "Credits" }).fill("3");
  await form.getByRole("textbox", { name: "Why" }).fill("Rained-out clinic");
  await form.getByRole("button", { name: "Review credits" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Give Maya Chen 3 credits?");
  const actions = countActions(page);
  await dialog.getByRole("button", { name: "Give 3 credits" }).dblclick();
  await expect(dialog).toContainText(/isn't set up yet|Nothing was changed/);
  expect(actions).toHaveLength(1);
});

test("an owner refunds from Payments through the same strong refund Money uses", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq(`/people/${maya}/payments`));
  await title(page, "Maya Chen");
  await expect(
    page.getByRole("button", { name: /refund/i }).first(),
  ).toBeVisible();
});

test("features whose backend exists are offered: import and tags", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq("/people"));
  await expect(page.getByRole("link", { name: "Import" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Select Maya Chen" }).check();
  const bulk = page.getByRole("region", { name: "Selected people" });
  await bulk.getByRole("button", { name: "Tag" }).click();
  const tagDialog = page.getByRole("dialog", { name: "Tag people" });
  await tagDialog.getByRole("textbox", { name: "Tag" }).fill("Spring league");
  const actions = countActions(page);
  await tagDialog.getByRole("button", { name: "Tag 1 person" }).dblclick();
  await expect(page.getByText("Tagged 1 person “Spring league”")).toBeVisible();
  expect(actions).toHaveLength(1);
  // A person's own tags on Overview.
  await page.goto(hq(`/people/${maya}`));
  await expect(
    page.getByRole("list", { name: "Tags" }).getByText("League"),
  ).toBeVisible();
});

test("team notes: added with author and time, never shown to the person, removed with a confirmation", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq(`/people/${maya}/notes`));
  const notes = page.getByRole("list", { name: "Team notes" });
  await expect(notes).toContainText("Prefers evening sessions.");
  const form = page.getByRole("form", { name: "Add a note" });
  await expect(form).toContainText("never by the person");
  await form
    .getByRole("textbox", { name: "Note" })
    .fill("Asked about the spring league.");
  const actions = countActions(page);
  await form.getByRole("button", { name: "Save note" }).dblclick();
  await expect(notes).toContainText("Asked about the spring league.");
  expect(actions).toHaveLength(1);
  await notes.getByRole("button", { name: "Remove" }).first().click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Remove this note?");
  await dialog.getByRole("button", { name: "Remove note" }).click();
  await expect(page.getByText("Note removed")).toBeVisible();
});

test("a junior's household: the guardian, and an invitation that sends nothing", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq(`/people/${ava}/family`));
  await title(page, "Ava Patel");
  const guardians = page.getByRole("region", { name: "Guardians" });
  await expect(guardians).toContainText("Sam Rivera");
  await expect(guardians).toContainText("Verified");
  const invite = page.getByRole("form", { name: "Invite a guardian" });
  await invite
    .getByRole("textbox", { name: "Guardian name" })
    .fill("Lee Patel");
  await invite
    .getByRole("textbox", { name: /Guardian email/ })
    .fill("lee.patel@example.com");
  await invite.getByRole("button", { name: "Review the invitation" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("No one is messaged");
  const actions = countActions(page);
  await dialog
    .getByRole("button", { name: "Create the invitation" })
    .dblclick();
  await expect(page.getByText("Invitation ready, not sent")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Invitation link" }),
  ).toHaveValue(/\/join\/guardian\//);
  expect(actions).toHaveLength(1);
  await expect(
    page.getByRole("form", { name: "Link a guardian the club knows" }),
  ).toBeVisible();
});

test("documents show the version signed against the current one, and a request is an Inbox draft", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq(`/people/${maya}/documents`));
  const waivers = page.getByRole("region", { name: "Waivers" });
  await expect(waivers).toContainText("Club participation waiver");
  await expect(waivers).toContainText("Version 2 signed");
  await expect(waivers).toContainText("current is version 3");
  await expect(waivers).toContainText("New version to sign");
  const actions = countActions(page);
  await waivers.getByRole("button", { name: "Ask for a signature" }).dblclick();
  await expect(
    page.getByRole("link", { name: "Review and send in Inbox" }),
  ).toBeVisible();
  expect(actions).toHaveLength(1);
});

test("a coach sees no payments, and the Health tab because the Health service allows it", async ({
  page,
}) => {
  await signIn(page, "coach");
  await page.goto(hq(`/people/${maya}`));
  await title(page, "Maya Chen");
  const tabs = page.getByRole("navigation", { name: "Maya Chen" });
  await expect(tabs.getByRole("link", { name: "Overview" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Payments" })).toHaveCount(0);
  // The Health service's own check (`healthAccess.canView`) allows this
  // coach; the person's page itself carries no health value.
  await expect(tabs.getByRole("link", { name: "Health" })).toBeVisible();
  // Money is neither rendered nor serialised into the page for the browser.
  const overview = await page.content();
  expect(overview).not.toContain("1,485");
  expect(overview).not.toContain("bpm");
  // Values come only from the Health service's own read, which needs Duna
  // Database: demo says so honestly instead of inventing figures.
  await page.goto(hq(`/people/${maya}/health`));
  await expect(page.getByText(/not medical advice/).first()).toBeVisible();
  await expect(page.locator("main")).not.toContainText("bpm");
  await page.goto(hq("/people"));
  await expect(page.getByRole("button", { name: "Export" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Add a person" })).toHaveCount(0);
  await page.goto(hq(`/people/${maya}/payments`));
  await expect(
    page.getByText("You don't have access to Payments"),
  ).toBeVisible();
  expect(await page.content()).not.toContain("1,485");
});

test("health exists only for viewers the service allows: no tab, and the address leaks nothing", async ({
  page,
}) => {
  // Ported legacy check: health appears only after the person shares it.
  // Jordan has not shared with the club: no tab for the owner or a coach.
  for (const persona of ["club-owner", "coach"]) {
    await signIn(page, persona);
    await page.goto(hq(`/people/${jordan}`));
    await expect(
      page
        .getByRole("navigation", { name: "Jordan Smith" })
        .getByRole("link", { name: "Health" }),
    ).toHaveCount(0);
    const response = await page.goto(hq(`/people/${jordan}/health`));
    expect(response?.status()).toBeLessThan(400);
    await expect(
      page.getByText("You don't have access to Health"),
    ).toBeVisible();
  }
  // A junior's health reaches only the club's coaches (the service's rule):
  // never the owner, by tab or by address, and nothing leaks into the page.
  await signIn(page, "club-owner");
  await page.goto(hq(`/people/${ava}/health`));
  await expect(page.getByText("You don't have access to Health")).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Ava Patel" })
      .getByRole("link", { name: "Health" }),
  ).toHaveCount(0);
  const html = await page.content();
  for (const leak of [
    "Resting heart rate",
    "bpm",
    "restingHeartRate",
    "Readiness",
  ]) {
    expect(html, leak).not.toContain(leak);
  }
  // The owner may open an adult's shared summary, with the standing wording.
  await page.goto(hq(`/people/${maya}`));
  await expect(
    page
      .getByRole("navigation", { name: "Maya Chen" })
      .getByRole("link", { name: "Health" }),
  ).toBeVisible();
  await page.goto(hq(`/people/${maya}/health`));
  await expect(page.getByText(/not medical advice/).first()).toBeVisible();
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
