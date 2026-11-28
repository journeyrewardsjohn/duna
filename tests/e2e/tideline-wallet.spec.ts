import { expect, test, type Page } from "@playwright/test";
import { waitForHydration } from "./gallery-hydration";

/**
 * The wallet family in the gallery (WALLET-1, docs/design/wallet.md): the
 * carousel by keyboard and drag, drawing a card out of the stack, the flip
 * to the pass, type contrast on every art piece measured in the browser,
 * stills under reduced motion, and no sideways scroll at 375 px.
 *
 *   TIDELINE_GALLERY=1 pnpm exec playwright test tests/e2e/tideline-wallet.spec.ts
 */
const base =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;

test.skip(
  process.env.TIDELINE_GALLERY !== "1",
  "Needs HQ running with TIDELINE_GALLERY=1",
);

async function openWallet(page: Page, theme = "light") {
  await page.goto(`${base}/tideline?theme=${theme}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Tideline gallery" }),
  ).toBeVisible();
  await waitForHydration(page);
  await page.locator("#wallet").scrollIntoViewIfNeeded();
}

test("carousel: arrows, Home and End move; Enter shows the pass", async ({
  page,
}) => {
  await openWallet(page);
  const demo = page.locator('[data-wallet-demo="5"]');
  const tabs = demo.getByRole("tab");
  await expect(tabs).toHaveCount(5);
  await tabs.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(tabs.nth(1)).toBeFocused();
  await page.keyboard.press("End");
  await expect(tabs.nth(4)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(demo.getByText("Tap again for the card")).toBeVisible();
  await expect(tabs.first().locator(".td-cardflip[data-flipped]")).toHaveCount(
    1,
  );
  await expect(demo.getByRole("status")).toContainText(
    "Showing Saltline Beach Club pass",
  );
  await expect(demo.getByRole("button", { name: "Hide pass" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("carousel: a mouse drag moves to the next card", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Pointer drag on desktop");
  await openWallet(page);
  const demo = page.locator('[data-wallet-demo="5"]');
  const rail = demo.getByRole("tablist");
  const box = (await rail.boundingBox())!;
  const y = box.y + box.height / 3;
  await page.mouse.move(box.x + box.width * 0.7, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, y, { steps: 6 });
  await page.mouse.move(box.x + box.width * 0.3, y, { steps: 6 });
  await page.mouse.up();
  await expect(demo.getByRole("tab").nth(1)).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("stack: tap a strip to draw it out; Escape puts it back", async ({
  page,
}) => {
  await openWallet(page);
  const demo = page.locator('[data-wallet-demo="12"]');
  const options = demo.getByRole("option");
  await expect(options).toHaveCount(12);
  await expect(demo.getByText("12 cards · draw one out")).toBeVisible();
  await options.nth(3).click({ position: { x: 60, y: 18 } });
  await expect(options.nth(3)).toHaveAttribute("aria-selected", "true");
  await expect(
    demo.getByRole("button", { name: "Back to stack" }),
  ).toBeVisible();
  const listbox = demo.getByRole("listbox");
  await listbox.focus();
  await page.keyboard.press("Escape");
  await expect(demo.getByText("12 cards · draw one out")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(options.nth(4)).toHaveAttribute("aria-selected", "true");
  await expect(
    demo.getByRole("button", { name: "Back to stack" }),
  ).toBeVisible();
});

test("the card turns over to its pass, text first with a named code", async ({
  page,
}) => {
  await openWallet(page);
  const card = page.locator("[data-wallet-flip] .td-mcard");
  await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await expect(card.getByText("Check-in pass")).toBeVisible();
  await expect(card.getByText("Active member")).toBeVisible();
  await expect(
    card.getByRole("img", { name: "Check-in code for Rae Castillo" }),
  ).toBeVisible();
  await expect(card.getByText(/Duna member credential/)).toBeVisible();
});

test("type on every registered art piece reaches 5:1, measured on its poster", async ({
  page,
}) => {
  await openWallet(page);
  const cards = page.locator("[data-wallet-artset] .td-mcard");
  await expect(cards).toHaveCount(10);
  await expect(
    page.locator("[data-wallet-artset] .td-mcard[data-measured]"),
  ).toHaveCount(10, { timeout: 15_000 });
  const ratios = await cards.evaluateAll((nodes) =>
    nodes.map((node) => Number(node.getAttribute("data-contrast"))),
  );
  for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.99);
});

test("under reduced motion the selected card's art is a still", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWallet(page);
  const canvas = page.locator(
    '[data-wallet-demo="5"] [aria-selected="true"] canvas.td-cardart__canvas',
  );
  await expect(canvas).toHaveCount(1);
  const frame = () =>
    canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
  const first = await frame();
  await page.waitForTimeout(700);
  expect(await frame()).toBe(first);
});

test("nothing in the wallet section scrolls sideways at 375 px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openWallet(page, "dark");
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 1,
  );
  expect(overflow).toBe(false);
  const escapes = await page.locator("#wallet").evaluate((root) => {
    const width = document.documentElement.clientWidth;
    return [
      ...root.querySelectorAll<HTMLElement>(
        ".td-mcard, .td-walletv, .td-wactions",
      ),
    ]
      .filter((node) => node.getBoundingClientRect().right > width + 1)
      .filter((node) => !node.closest(".td-wcarousel__rail"))
      .map((node) => node.className);
  });
  expect(escapes).toEqual([]);
});
