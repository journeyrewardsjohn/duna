import { expect, test, type Page } from "@playwright/test";

/**
 * Offerings, group-size rules and sessions on the new shell (H-OFFER), in
 * demo mode. Covers creating from a template and publishing (blocked
 * honestly until Duna Pay is ready), the group rule with its preview on a
 * booked offering, at-risk actions through their confirmations (a double
 * click sends one request), a merge refused because it would raise a price,
 * attendance at phone width, a coach's limited view, the old addresses,
 * no legacy stylesheet and no sideways scrolling.
 */
const hqBaseUrl =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;
const hq = (path: string) => new URL(path, hqBaseUrl).toString();

/** Demo fixture ids (apps/hq/components/offerings/offerings-demo.ts); not secrets. */
const clinic = "d0130000-0000-4000-8000-000000000102";
const smallGroup = "d0130000-0000-4000-8000-000000000103";
const semiPrivateSession = "d0130000-0000-4000-8000-000000000001";
const mondayMorningSession = "d0130000-0000-4000-8000-000000000008";
const fridaySession = "d0130000-0000-4000-8000-000000000011";

async function signIn(
  page: Page,
  persona = "club-owner",
  extra: Record<string, string> = {},
) {
  await page
    .context()
    .addCookies(
      Object.entries({ "duna-demo-persona": persona, ...extra }).map(
        ([name, value]) => ({ name, value, url: hqBaseUrl }),
      ),
    );
}

/** Server actions a page sent (Next marks them with a `next-action` header). */
function countActions(page: Page) {
  const sent: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) {
      sent.push(request.url());
    }
  });
  return sent;
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "The spec sets its own widths.",
  );
});

test("a club with offerings sees them as rows, filtered in the page", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq("/offerings"));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Offerings");
  const rows = page.getByRole("list", { name: "Offerings" });
  await expect(rows.getByText("Weekly clinic")).toBeVisible();
  await expect(
    rows.getByText("4 to 12 players · price by group size"),
  ).toBeVisible();
  await expect(rows.getByText("3 to 6 players · club default")).toBeVisible();
  await page.getByRole("button", { name: "Products" }).click();
  await expect(page).toHaveURL(/kind=goods/);
  await expect(rows.getByText("Club shirt")).toBeVisible();
  await expect(rows.getByText("Weekly clinic")).toHaveCount(0);
  // The old type pages are filters now.
  await page.goto(hq("/offerings/types/plans"));
  await expect(page).toHaveURL(/\/offerings\?kind=plans$/);
  await expect(
    page.getByRole("button", { name: "Memberships and packs" }),
  ).toHaveAttribute("aria-pressed", "true");
  // Search waits for typing to pause, then narrows the list.
  await page.goto(hq("/offerings"));
  await page.getByLabel("Search offerings").fill("shirt");
  await expect(rows.getByText("Club shirt")).toBeVisible();
  await expect(rows.getByText("Weekly clinic")).toHaveCount(0);
});

test("create from a template; publishing waits honestly for Duna Pay", async ({
  page,
}) => {
  await signIn(page, "club-owner", { "duna-demo-pay": "not-started" });
  await page.goto(hq("/offerings/create?kind=services&template=clinic"));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "New offering",
  );
  await expect(page.getByRole("radio", { name: /Clinic/ })).toBeChecked();
  await page.getByLabel("Price per player").fill("45");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/offerings\/[0-9a-f-]{36}\?created=1$/);
  await expect(page.getByText("Your draft is ready")).toBeVisible();

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /Publish Weekly clinic/ });
  await expect(
    dialog.getByText("Duna Pay ready to take card payments"),
  ).toBeVisible();
  await expect(dialog.getByRole("link").first()).toHaveAttribute(
    "href",
    /\/money/,
  );
  await expect(
    dialog.getByRole("button", { name: "Publish now" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Not yet" }).click();

  await signIn(page, "club-owner", { "duna-demo-pay": "ready" });
  await page.reload();
  const sent = countActions(page);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("button", { name: "Publish now" }).click();
  await page
    .getByRole("button", { name: "Publish Weekly clinic", exact: true })
    .dblclick();
  await expect(page.getByText("Weekly clinic is live")).toBeVisible();
  expect(sent).toHaveLength(1);
  await expect(page.locator(".td-objhead__status")).toHaveText("Live");
});

test("the group rule saves after showing what happens to booked sessions", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq(`/offerings/${clinic}/group-size`));
  await expect(page.getByText("What players see")).toBeVisible();
  const fewest = page.getByLabel("Fewest players it runs with");
  await fewest.fill("3");
  await fewest.press("Tab");
  await page.getByRole("button", { name: "Save group size" }).click();
  const question = page.getByRole("dialog", {
    name: "Change the group rule for Weekly clinic?",
  });
  await expect(question).toContainText("Runs with at least 3 players.");
  await expect(question).toContainText("keeps the rule people booked under");
  await expect(
    question.getByRole("checkbox", {
      name: "Also apply it to the booked sessions",
    }),
  ).toBeVisible();
  const sent = countActions(page);
  await question.getByRole("button", { name: "Save the new rule" }).dblclick();
  await expect(page.getByText("Group size saved")).toBeVisible();
  expect(sent.length).toBeLessThanOrEqual(2);
});

test("at-risk actions go through their confirmations; a double click cancels once", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq("/offerings/at-risk"));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "At risk this week",
  );
  await page
    .getByRole("list", { name: "Sessions at risk this week" })
    .getByRole("button", { name: /Saturday semi-private/ })
    .click();
  const panel = page.getByRole("dialog", { name: "Saturday semi-private" });
  await expect(panel.getByText("Needs 1 more")).toBeVisible();
  await expect(panel.getByText("4 credits", { exact: true })).toBeVisible();

  await panel.getByRole("button", { name: "Extend the deadline" }).click();
  await panel.getByRole("button", { name: "Review the new time" }).click();
  await expect(panel.getByText(/booked player will be told/)).toBeVisible();
  await panel.getByRole("button", { name: /^Move decision to / }).click();
  await expect(page.getByText(/^Decision moved to /)).toBeVisible();

  await panel.getByRole("button", { name: "Cancel and refund" }).click();
  await expect(
    panel.getByRole("list", { name: "Who gets what back" }),
  ).toContainText("Mara Lewis");
  await panel.getByRole("button", { name: "Review the cancellation" }).click();
  await expect(panel).toContainText("4 credits back to wallets");
  await expect(panel).toContainText("A cancellation can't be undone.");
  const sent = countActions(page);
  await panel
    .getByRole("button", { name: "Cancel and refund 1 person" })
    .dblclick();
  await expect(page.getByText(/Saturday semi-private cancelled/)).toBeVisible();
  expect(sent).toHaveLength(1);
  await expect(
    page.getByText("Every session this week has enough players."),
  ).toBeVisible();
});

test("a merge is offered with room and refused when it would raise a price", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq(`/offerings/${clinic}/schedule?session=${fridaySession}`));
  const panel = page.getByRole("dialog", { name: "Friday clinic" });
  await panel
    .getByRole("button", { name: "Merge with another session" })
    .click();
  const dearer = panel.getByRole("radio", { name: /Sunday morning clinic/ });
  await expect(dearer).toBeDisabled();
  await expect(panel).toContainText("A merge never makes anyone pay more.");
  await panel.getByRole("radio", { name: /Thursday clinic/ }).check();
  await expect(panel).toContainText("Nobody pays more");
  await panel.getByRole("button", { name: "Review the merge" }).click();
  await expect(panel).toContainText("A merge can't be undone.");
  await panel.getByRole("button", { name: /^Merge and move / }).click();
  await expect(page.getByText(/moved to Thursday clinic/)).toBeVisible();
});

test("attendance is a fast checklist on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);
  await page.goto(
    hq(`/offerings/${clinic}/schedule?session=${mondayMorningSession}`),
  );
  const list = page.getByRole("list", { name: "Attendance" });
  await expect(list).toBeVisible();
  const first = list.getByRole("button").first();
  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  const box = await first.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(48);
  await page.getByRole("button", { name: "Everyone's here" }).click();
  await page.getByRole("button", { name: /^Save \d+ marks?$/ }).click();
  await expect(page.getByText(/^Attendance saved for/)).toBeVisible();
  await noSidewaysScroll(page);
});

test("a coach sees sessions and people, not prices or rules", async ({
  page,
}) => {
  await signIn(page, "coach");
  await page.goto(hq(`/offerings/${clinic}`));
  const tabs = page.getByRole("navigation", { name: "Weekly clinic" });
  await expect(
    tabs.getByRole("link", { name: "Schedule and sessions" }),
  ).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Price" })).toHaveCount(0);
  await expect(tabs.getByRole("link", { name: "Group size" })).toHaveCount(0);
  await page.goto(hq(`/offerings/${clinic}/price`));
  await expect(page.getByText("You don't have access to Prices")).toBeVisible();
  await page.goto(hq(`/offerings/at-risk?session=${semiPrivateSession}`));
  const panel = page.getByRole("dialog", { name: "Saturday semi-private" });
  await expect(
    panel.getByRole("button", { name: "Ask the club to cancel" }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Cancel and refund" }),
  ).toHaveCount(0);
  await expect(panel.getByText("At stake")).toHaveCount(0);
});

test("every offerings screen fits a phone and loads no legacy stylesheet", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);
  const stylesheets: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "stylesheet")
      stylesheets.push(request.url());
  });
  for (const path of [
    "/offerings",
    "/offerings/create",
    "/offerings/at-risk",
    "/offerings/settings",
    `/offerings/${clinic}`,
    `/offerings/${clinic}/schedule`,
    `/offerings/${clinic}/price`,
    `/offerings/${clinic}/group-size`,
    `/offerings/${smallGroup}/people`,
    `/offerings/${clinic}/settings`,
  ]) {
    await page.goto(hq(path));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await noSidewaysScroll(page);
  }
  expect(
    stylesheets.filter((url) =>
      /globals|design-v3|work-focus|forms\.css|legacy/.test(url),
    ),
  ).toEqual([]);
});
