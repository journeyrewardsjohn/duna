import { expect, test, type Page } from "@playwright/test";

/**
 * Money and Duna Pay on the new shell (H10), in demo mode. Covers the
 * Duna Pay setup flow through every account status (demo fixtures chosen
 * with the `duna-demo-pay` cookie), the overview with data and on a club's
 * first day, a refund through the strong confirmation (a double click sends
 * one request), a dispute, a coach without the payments permission, phone
 * width, and that no legacy stylesheet is loaded.
 */
const hqBaseUrl =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;
const hq = (path: string) => new URL(path, hqBaseUrl).toString();

/** Demo fixture ids (`@duna/core/demo/pay`); not secrets. */
const partlyRefundedSale = "d0020000-0000-4000-8000-000000000106";
const openDispute = "d0020000-0000-4000-8000-000000000800";

async function signIn(
  page: Page,
  persona = "club-owner",
  extra: Record<string, string> = {},
) {
  await page.context().addCookies(
    Object.entries({ "duna-demo-persona": persona, ...extra }).map(
      ([name, value]) => ({
        name,
        value,
        url: hqBaseUrl,
      }),
    ),
  );
}

async function title(page: Page, text: string | RegExp) {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(text);
}

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "The spec sets its own widths.",
  );
});

test("Duna Pay setup says where the club stands, for every status", async ({
  page,
}) => {
  const expected = {
    "not-started": "Not started",
    "in-progress": "In progress",
    verifying: "Being checked",
    "action-needed": "Action needed",
    restricted: "Paused",
    ready: "Ready",
  } as const;
  for (const [status, label] of Object.entries(expected)) {
    await page.context().clearCookies();
    await signIn(page, "club-owner", { "duna-demo-pay": status });
    await page.goto(hq("/money/duna-pay"));
    await title(page, "Duna Pay");
    const card = page.getByRole("region", { name: "Where you stand" });
    await expect(card).toContainText(label);
    // One next thing, or a plain "nothing to do" while it's checked.
    if (status === "ready") {
      await expect(
        card.getByRole("link", { name: "Open Money" }),
      ).toBeVisible();
    } else if (status === "verifying") {
      await expect(card).toContainText(/Nothing to do now|Payout bank|bank/);
    } else {
      await expect(card.getByRole("link").first()).toBeVisible();
    }
    if (status === "action-needed" || status === "restricted") {
      // Exactly what is wrong, in the backend's words.
      await expect(card.getByRole("listitem").first()).toBeVisible();
    }
    // The steps beside, each mark said in words.
    const steps = page.getByRole("navigation", { name: "Duna Pay setup" });
    await expect(steps).toContainText(/of 3 done/);
    // No payment keys in CI: the honest explanation, never a dead link.
    await expect(
      page.getByText("Duna Pay can't connect in this environment yet"),
    ).toBeVisible();
  }
});

test("each setup step opens, with verification explained", async ({ page }) => {
  await signIn(page);
  await page.goto(hq("/money/duna-pay/business"));
  await title(page, "Business details");
  await expect(
    page.getByRole("form", { name: "Business details" }),
  ).toBeVisible();
  await page.goto(hq("/money/duna-pay/verify"));
  await title(page, "Verify your identity");
  await expect(
    page.getByText(/Identity verification is handled by Stripe/),
  ).toBeVisible();
  await page.goto(hq("/money/duna-pay/payouts"));
  await title(page, "Payout bank and schedule");
  await expect(
    page.getByRole("form", { name: "Payout schedule" }),
  ).toBeVisible();
  await page.goto(hq("/money/setup"));
  await expect(page).toHaveURL(/\/money\/duna-pay$/);
});

test("the overview shows what the club is owed, and a first day is intentional", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq("/money"));
  await title(page, "Money");
  const tabs = page.getByRole("navigation", { name: "Money" });
  await expect(tabs.getByRole("link", { name: "Overview" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    page.getByRole("group", { name: "Ready to pay out" }),
  ).toContainText("$");
  await expect(page.getByRole("heading", { name: "Needs you" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Held, and why" }),
  ).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, "club-owner", { "duna-demo-club": "first-day" });
  await page.goto(hq("/money"));
  await expect(page.getByText("No money in or out yet")).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Ready to pay out" }),
  ).toHaveCount(0);
});

test("a refund restates the amount and sends one request on a double click", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq(`/money/transactions/${partlyRefundedSale}`));
  await title(page, "10-session pack");
  await page.getByRole("button", { name: "Refund this sale" }).click();
  await page.getByLabel("Reason").fill("Two sessions were rained out");
  await page.getByRole("button", { name: "Review refund" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("$270.00");
  await expect(dialog).toContainText("USD");
  await expect(dialog).toContainText("Mara Lewis");
  await expect(dialog).toContainText("cannot be undone");
  const actions: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) {
      actions.push(request.url());
    }
  });
  await dialog.getByRole("button", { name: /^Refund \$270\.00$/ }).dblclick();
  // Demo has no connected database: the dialog keeps the honest answer.
  await expect(
    page
      .getByText(
        /isn't set up yet|Nothing was changed|Refund of \$270\.00 sent/,
      )
      .first(),
  ).toBeVisible();
  expect(actions).toHaveLength(1);
});

test("a dispute shows its deadline, what is held and the response form", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq("/money/disputes"));
  await title(page, "Disputes");
  await expect(page.getByRole("list", { name: "Open disputes" })).toBeVisible();
  await page.goto(hq(`/money/disputes/${openDispute}`));
  await title(page, "Dispute from Mara Lewis");
  await expect(page.getByText("Needs your response").first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "What's held" }),
  ).toBeVisible();
  await expect(page.getByLabel("Your explanation")).toBeVisible();
  await expect(
    page.getByText(/Files can't be attached here yet/),
  ).toBeVisible();
});

test("a coach gets the access state, not a crash", async ({ page }) => {
  await signIn(page, "coach");
  for (const path of [
    "/money",
    "/money/payouts",
    "/money/duna-pay",
    `/money/disputes/${openDispute}`,
  ]) {
    const response = await page.goto(hq(path));
    expect(response?.status()).toBe(200);
    await expect(
      page.getByText("You don't have access to Money"),
    ).toBeVisible();
  }
});

test("every Money tab fits a phone and loads no legacy stylesheet", async ({
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
    "/money",
    "/money/transactions",
    "/money/payouts",
    "/money/refund-policies",
    "/money/disputes",
    "/money/holds",
    "/money/duna-pay",
    "/money/tax",
    `/money/transactions/${partlyRefundedSale}`,
  ]) {
    await page.goto(hq(path));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
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
