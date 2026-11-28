import { expect, test, type Page } from "@playwright/test";

/**
 * Events on the new shell (H-EVENTS), in demo mode: the list opens on what
 * is live, the event workspace's tabs, moving a team to the waitlist with a
 * note and a confirmation, a refund that restates who gets what (owner), a
 * coach who sees no money, the old type pages landing on the filter, and no
 * horizontal overflow. Demo changes live in a cookie, cleared per test.
 */
const hqBaseUrl =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;
const hq = (path: string) => new URL(path, hqBaseUrl).toString();

/** The demo club's live tournament (apps/hq/components/events/events-demo.ts). */
const live = "7e000000-0000-4000-8000-000000000001";

async function as(page: Page, persona: string) {
  await page.context().clearCookies();
  await page
    .context()
    .addCookies([
      { name: "duna-demo-persona", value: persona, url: hqBaseUrl },
    ]);
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
}

test.describe("Events", () => {
  test("the list opens on what is live and filters by type", async ({
    page,
  }) => {
    await as(page, "club-owner");
    await page.goto(hq("/events"));
    await expect(
      page.getByRole("heading", { name: "Events", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Harbor Doubles Classic/ }),
    ).toBeVisible();
    await expect(page.getByText("Live now").first()).toBeVisible();
    await noOverflow(page);

    await page.goto(hq("/events/types/tournaments"));
    await expect(page).toHaveURL(/\/events\?type=tournaments$/);
    await page.goto(hq("/events?type=league&view=drafts"));
    await expect(
      page.getByRole("heading", { name: "Leagues", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Thursday night league/ }),
    ).toBeVisible();
  });

  test("a live tournament's workspace: overview, schedule and brackets", async ({
    page,
  }) => {
    await as(page, "club-owner");
    await page.goto(hq(`/events/${live}`));
    await expect(
      page.getByRole("heading", { name: "Harbor Doubles Classic", level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Live now" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Getting to game day" }),
    ).toBeVisible();
    await noOverflow(page);

    await page.getByRole("link", { name: /Schedule and courts/ }).click();
    await expect(page).toHaveURL(new RegExp(`/events/${live}/schedule$`));
    await expect(
      page.getByRole("heading", { name: "On court now" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Not scheduled yet" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Brackets and results" }).click();
    await expect(page.getByText(/Pool A · \d of 6 played/)).toBeVisible();
    await noOverflow(page);
  });

  test("moving a team to the waitlist asks for a note and a confirmation", async ({
    page,
  }) => {
    await as(page, "club-owner");
    await page.goto(hq(`/events/${live}/entries`));
    await page.getByRole("button", { name: "Change Nguyen / Silva" }).click();
    await page.getByRole("menuitem", { name: "Move to the waitlist" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Why").fill("Payment incomplete at the deadline");
    await dialog.getByRole("button", { name: "Review" }).click();
    await expect(
      dialog.getByText("Move Nguyen / Silva to the waitlist?"),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Move to the waitlist" }).click();
    await expect(
      page.getByRole("list", { name: "Open doubles: the waitlist" }),
    ).toContainText("Nguyen / Silva");
  });

  test("a refund says who gets what before it happens", async ({ page }) => {
    // The club owner holds payments:write in demo mode.
    await as(page, "club-owner");
    await page.goto(hq(`/events/${live}/money`));
    const orders = page.getByRole("region", { name: /^Orders/ });
    const first = orders.getByRole("listitem").first();
    await expect(first).toContainText("to the card they paid with");
    await first.getByRole("button", { name: "Refund" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Reason").fill("Injured before the event");
    await dialog.getByRole("button", { name: "Review refund" }).click();
    // The strong confirmation restates the amount, who gets it and that it is final.
    await expect(dialog.getByRole("definition").first()).toContainText(
      "to the card they paid with",
    );
    await expect(dialog.getByText(/can't be undone/)).toBeVisible();
    await dialog.getByRole("button", { name: "Refund", exact: true }).click();
    await expect(first).toContainText("Refunded");
  });

  test("a coach sees the event but not its money", async ({ page }) => {
    await as(page, "coach");
    await page.goto(hq(`/events/${live}`));
    await expect(
      page.getByRole("heading", { name: "Harbor Doubles Classic", level: 1 }),
    ).toBeVisible();
    const main = page.getByRole("main");
    // No amounts anywhere on the event, and no Money tab.
    await expect(main).not.toContainText("$");
    await expect(
      main.getByRole("link", { name: "Money", exact: true }),
    ).toHaveCount(0);
    await page.goto(hq(`/events/${live}/entries`));
    await expect(main.getByText("Chen / Smith")).toBeVisible();
    await expect(main).not.toContainText("$");
    await page.goto(hq(`/events/${live}/money`));
    await expect(main.getByText(/have access to Event money/)).toBeVisible();
    await expect(main).not.toContainText("$");
  });
});
