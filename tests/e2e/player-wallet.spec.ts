import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./personas/support/a11y";

/**
 * The Player web Wallet (`/app/wallet`, WALLET-1, docs/design/wallet.md).
 * Demo mode: `duna-demo-persona` chooses who is signed in and the test-only
 * `duna-demo-wallet=1|5|12` gives them example club cards (never on
 * production; app/(next)/(app)/app/wallet/wallet-data.ts).
 */
const webBaseUrl =
  process.env.PLAYWRIGHT_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_WEB_PORT ?? "3000"}`;

async function signInAs(page: Page, persona: string, cards?: number) {
  await page
    .context()
    .addCookies([
      { name: "duna-demo-persona", value: persona, url: webBaseUrl },
      ...(cards === undefined
        ? []
        : [
            { name: "duna-demo-wallet", value: String(cards), url: webBaseUrl },
          ]),
    ]);
}

const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

test("five cards: a carousel; the card turns over to its pass; the actions go somewhere", async ({
  page,
}) => {
  await signInAs(page, "player", 5);
  await page.goto("/app/wallet");
  await expect(
    page.getByRole("heading", { level: 1, name: "Wallet" }),
  ).toBeVisible();
  const cards = page.getByRole("region", { name: "Your club cards" });
  const tabs = cards.getByRole("tab");
  await expect(tabs).toHaveCount(5);
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("heading", { level: 2, name: "Saltline Beach Club" }),
  ).toBeVisible();
  await expect(page.getByText("Annual member · $460.00 a year")).toBeVisible();

  await tabs.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("heading", { level: 2, name: "Harbor Lights Volleyball" }),
  ).toBeVisible();

  await cards.getByRole("button", { name: "Show pass" }).click();
  await expect(
    cards.getByRole("img", { name: "Check-in code for Mara Lewis" }),
  ).toBeVisible();
  await expect(cards.getByText("Sample pass (demo mode)")).toBeVisible();
  await expect(page.getByText("Show this at the front desk")).toBeVisible();
  await expect(cards.getByRole("link", { name: "Book" })).toHaveAttribute(
    "href",
    "/clubs/harbor-lights-demo",
  );
  await expect(cards.getByRole("link", { name: "Benefits" })).toHaveAttribute(
    "href",
    "#wallet-benefits",
  );
  await expectAccessible(page);
});

test("twelve cards: a stack you draw a card out of", async ({ page }) => {
  await signInAs(page, "player", 12);
  await page.goto("/app/wallet");
  const stack = page.getByRole("listbox", { name: /stacked/ });
  await expect(stack.getByRole("option")).toHaveCount(12);
  await expect(page.getByText("12 cards · draw one out")).toBeVisible();
  await stack.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Back to stack" }),
  ).toBeVisible();
  // Ended cards sort last.
  await expect(stack.getByRole("option").last()).toHaveAttribute(
    "aria-label",
    /^Driftwood BVC, Annual member, ended\. Card 12 of 12$/,
  );
});

test("a card from Home opens on that card", async ({ page }) => {
  await signInAs(page, "player", 5);
  await page.goto("/app/wallet?card=0b7c3f7e-5d1a-4c55-9d33-000000000002");
  await expect(
    page.getByRole("heading", { level: 2, name: "Harbor Lights Volleyball" }),
  ).toBeVisible();
});

test("no cards: the wallet sells the idea and links to find a club", async ({
  page,
}) => {
  await signInAs(page, "player", 0);
  await page.goto("/app/wallet");
  await expect(page.getByText("Your club cards live here")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Find a club" }).first(),
  ).toHaveAttribute("href", "/discover");
  await expect(
    page.getByRole("heading", { name: "Your Duna balance" }),
  ).toBeVisible();
});

test("a guardian acting for a junior sees the junior's wallet", async ({
  page,
}) => {
  test.skip(!wide(page), "The person menu sits in the rail on wide screens.");
  await signInAs(page, "parent");
  await page.goto("/app");
  await page
    .getByRole("navigation", { name: "Duna Player" })
    .getByRole("button", { name: /Account menu for Mara Lewis/ })
    .click();
  await page.getByRole("button", { name: /Remy Lewis/ }).click();
  await expect(page.getByText("Remy’s account ·")).toBeVisible();
  await page.goto("/app/wallet");
  await expect(
    page.getByRole("heading", { level: 1, name: "Remy's wallet" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your Duna balance" }),
  ).toHaveCount(0);
});

test("the wallet never scrolls sideways", async ({ page }) => {
  await signInAs(page, "player", 12);
  await page.goto("/app/wallet");
  await expect(page.getByRole("option").first()).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 1,
  );
  expect(overflow).toBe(false);
});
