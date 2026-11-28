import { expect, test, type Page } from "@playwright/test";

/**
 * Team on the new shell (H-TEAM), in demo mode: inviting someone through a
 * review (a double click sends one request), editing availability at phone
 * width, resolving a coverage gap, a pay run computed, adjusted, approved
 * and exported through its confirmations, a coach's limited view (their
 * own availability and pay only), and every Team page at 375 px with no
 * horizontal scroll and no legacy stylesheet.
 */
const hqBaseUrl =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;
const hq = (path: string) => new URL(path, hqBaseUrl).toString();

/**
 * Demo fixtures (`@duna/core/demo`, `demo/team-pay`); not secrets. The
 * fixtures' first staff profile is the demo person, Mara Lewis.
 */
const mara = "10000000-0000-4000-8000-000000000010";
const theo = "10000000-0000-4000-8000-000000000011";
const payRun = "d0040000-0000-4000-8000-000000000201";

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

test("the roster shows each member with availability in words", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq("/team"));
  await title(page, "Team");
  const list = page.getByRole("list", { name: "Team members" });
  await expect(list.getByRole("link", { name: "Theo Park" })).toBeVisible();
  await expect(list).toContainText("Available Mon afternoons and evenings");
  await page.getByRole("searchbox", { name: "Search the team" }).fill("noa");
  await expect(list.getByRole("link", { name: "Theo Park" })).toHaveCount(0);
  await expect(list.getByRole("link", { name: "Noa Williams" })).toBeVisible();
  await page.getByRole("button", { name: /^Coaches/ }).click();
  await expect(list.getByRole("link", { name: "Noa Williams" })).toBeVisible();
});

test("inviting someone goes through a review, and a double click sends once", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq("/team/invite"));
  await title(page, "Invite someone");
  await page.getByRole("textbox", { name: "Name" }).fill("Jordan Cruz");
  await page
    .getByRole("textbox", { name: /Email or mobile/ })
    .fill("jordan@example.com");
  await page.getByRole("radio", { name: /Coach/ }).check();
  await expect(
    page.getByText(/You decide whether someone is an employee/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review invitation" }).click();
  const review = page.getByRole("region", { name: "Check before it goes" });
  await expect(review).toContainText("by email to jordan@example.com");
  await expect(review).toContainText("Contractor (1099)");
  const actions = countActions(page);
  await review
    .getByRole("button", { name: "Send invitation to Jordan" })
    .dblclick();
  // Demo has no connected database: the honest answer, nothing sent twice.
  await expect(
    page
      .getByText(/isn't configured yet|Invitation sent|Invitation created/)
      .first(),
  ).toBeVisible();
  expect(actions).toHaveLength(1);
});

test("a coach edits their own week at phone width", async ({ page }) => {
  await signIn(page, "coach");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(hq(`/team/${mara}/availability`));
  await title(page, "Mara Lewis");
  await expect(page.getByRole("region", { name: "In words" })).toContainText(
    "Available",
  );
  await page.getByRole("button", { name: "New schedule" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Holiday weeks");
  await page.getByRole("button", { name: "Add Monday evening" }).click();
  const week = page.getByRole("list", { name: "The week" });
  await expect(week).toContainText("5:00–9:00 PM");
  await page.getByRole("button", { name: "Copy Monday to other days" }).click();
  await page
    .getByRole("group", { name: "Days to copy Monday to" })
    .getByRole("button", { name: "Wed" })
    .click();
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(
    week.getByRole("button", { name: "Remove Wednesday 5:00–9:00 PM" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save as a draft" }).click();
  await expect(
    page.getByText("Holiday weeks is saved as a draft"),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(2);
});

test("a coverage gap is resolved from the people the rule says are free", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq("/team/coverage"));
  await title(page, "Coverage");
  const needs = page.getByRole("list", { name: "Sessions needing cover" });
  const juniors = needs.getByRole("listitem").filter({
    hasText: "Juniors practice",
  });
  await expect(juniors).toContainText("Needs cover");
  await juniors.getByRole("button", { name: "Give it to Theo" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Theo becomes the coach");
  await dialog.getByRole("button", { name: "Give it to Theo" }).click();
  await expect(juniors).toContainText("Theo Park is covering it.");
  await expect(juniors).toContainText("Covered");
});

test("a pay run is worked out, adjusted, approved and exported through its confirmations", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq("/team/pay"));
  await title(page, "Team pay");
  await expect(page.getByText(/doesn't pay anyone/).first()).toBeVisible();
  await page.getByRole("button", { name: "Work out pay" }).first().click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Work out pay" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/team/pay/${payRun}$`));
  // The run renders on the server after the client navigation; CI is slow.
  await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(
    "Pay run",
    { timeout: 20_000 },
  );

  await page.getByRole("button", { name: "Adjust Theo's pay" }).click();
  const adjust = page.getByRole("dialog", { name: "Adjust Theo's pay" });
  await adjust.getByRole("textbox", { name: "Amount" }).fill("25");
  await adjust
    .getByRole("textbox", { name: "Why" })
    .fill("Covered the Saturday clinic");
  await adjust.getByRole("button", { name: "Review the adjustment" }).click();
  // The strong confirmation replaces the dialog's content (never two deep).
  await expect(page.getByText("+$25.00 (USD)")).toBeVisible();
  await page.getByRole("button", { name: "Add to the line" }).click();
  await expect(
    page.getByRole("list", { name: "Adjustments" }).filter({
      hasText: "Covered the Saturday clinic",
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Approve the pay run" }).click();
  const approve = page.getByRole("alertdialog");
  await expect(approve).toContainText("Approval is final");
  await expect(approve).toContainText("Theo Park");
  const actions = countActions(page);
  await approve.getByRole("button", { name: "Approve the pay run" }).dblclick();
  await expect(
    page.getByLabel("Totals").getByText("Approved", { exact: true }),
  ).toBeVisible();
  expect(actions).toHaveLength(1);

  await page.getByRole("button", { name: "Create the file" }).click();
  const exporting = page.getByRole("alertdialog");
  await expect(exporting).toContainText("Nothing is sent and no one is paid");
  await exporting.getByRole("button", { name: "Create the file" }).click();
  await expect(
    page.getByRole("link", { name: /Download the file/ }),
  ).toBeVisible();
  await expect(page.getByText(/Exported by Mara Lewis/)).toBeVisible();
});

test("a coach sees their own availability and pay, not anyone else's pay", async ({
  page,
}) => {
  await signIn(page, "coach");
  await page.goto(hq("/team/pay"));
  await title(page, "Team");
  await expect(
    page.getByText("You don't have access to the team's pay"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "See your own pay" }),
  ).toBeVisible();

  await page.goto(hq(`/team/${theo}/pay`));
  await expect(
    page.getByText("You don't have access to Theo's pay"),
  ).toBeVisible();

  await page.goto(hq(`/team/${theo}/availability`));
  await title(page, "Theo Park");
  await expect(page.getByRole("button", { name: "New schedule" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Add the days" })).toHaveCount(
    0,
  );

  await page.goto(hq(`/team/${mara}/pay`));
  await expect(
    page.getByRole("heading", { name: "How you are paid" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Change how/ })).toHaveCount(0);
});

test("every Team page fits a phone and loads no legacy stylesheet", async ({
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
    "/team",
    "/team/invite",
    "/team/coverage",
    "/team/pay",
    `/team/pay/${payRun}`,
    `/team/${theo}`,
    `/team/${theo}/availability`,
    `/team/${theo}/sessions`,
    `/team/${theo}/pay`,
    `/team/${theo}/access`,
  ]) {
    await page.goto(hq(path));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // The page Crosses in from the side; measure once it has arrived.
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
