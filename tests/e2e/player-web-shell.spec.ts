import { expect, test, type Page } from "@playwright/test";
import {
  APP_ROUTES,
  isDynamicRoute,
  type AppRoute,
} from "../../apps/web/lib/app-routes";
import { expectAccessible } from "./personas/support/a11y";

/**
 * The Player web shell and Home (work package P1, docs/design/player-web-shell.md).
 * Runs in the desktop, tablet and mobile projects; checks that need the side
 * rail run on desktop only. Demo mode: the persona cookie chooses who is
 * signed in (packages/api/src/demo-persona.ts).
 */

const webBaseUrl =
  process.env.PLAYWRIGHT_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_WEB_PORT ?? "3000"}`;

async function signInAs(page: Page, persona: string) {
  await page
    .context()
    .addCookies([
      { name: "duna-demo-persona", value: persona, url: webBaseUrl },
    ]);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 1,
  );
  expect(overflow).toBe(false);
}

const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

test("the shell frames Home with the four verbs, landmarks and a skip link", async ({
  page,
}) => {
  await signInAs(page, "player");
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { level: 1, name: /, Mara\.$/ }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
  const nav = wide(page)
    ? page.getByRole("navigation", { name: "Duna Player" })
    : page.getByRole("navigation", { name: "Main" });
  for (const verb of ["Find", "Play", "Improve", "Connect"]) {
    await expect(
      nav.getByRole("link", { name: new RegExp(`^${verb}`) }),
    ).toBeVisible();
  }
  if (!wide(page)) {
    await expect(
      nav.getByRole("button", { name: "New: book, match or result" }),
    ).toBeVisible();
  }
  await expect(page.getByText("Next up", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Primary actions" })
      .getByRole("link", { name: /Find a game/ }),
  ).toHaveAttribute("href", "/discover");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await expectNoHorizontalOverflow(page);
  await expectAccessible(page);
});

test("Home at 375 px keeps the phone bar in thumb reach with no sideways scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signInAs(page, "player");
  await page.goto("/app");
  const dock = page.getByRole("navigation", { name: "Main" });
  await expect(dock).toBeVisible();
  const box = await dock.boundingBox();
  expect(box!.y + box!.height).toBeGreaterThanOrEqual(811);
  await dock
    .getByRole("button", { name: "New: book, match or result" })
    .click();
  const sheet = page.getByRole("dialog", { name: "New" });
  await expect(
    sheet.getByRole("link", { name: /Add a result/ }),
  ).toHaveAttribute("href", "/app/score");
  await page.keyboard.press("Escape");
  await expectNoHorizontalOverflow(page);
});

test("the navigation reaches every page in the route table", async ({
  page,
}) => {
  test.skip(!wide(page), "The side rail is the full map on wide screens.");
  test.setTimeout(240_000);
  await signInAs(page, "player");
  const reachable = (Object.values(APP_ROUTES) as AppRoute[]).filter(
    (route) => route.listed && !isDynamicRoute(route),
  );
  await page.goto("/app");
  const rail = page.getByRole("navigation", { name: "Duna Player" });
  for (const route of reachable) {
    const link = rail.locator(`a[href="${route.path}"]`).first();
    await expect(link, `${route.path} is in the rail`).toHaveCount(1);
  }
  // Rebuilt pages must load; pages still in (legacy) are reached (their own
  // states are their screen package's).
  for (const route of reachable.filter((candidate) => !candidate.external)) {
    const response = await page.goto(route.path);
    if (route.rebuilt) {
      expect(response?.status(), route.path).toBeLessThan(500);
      await expect(page.getByRole("main"), route.path).toBeVisible();
    }
    expect(new URL(page.url()).pathname, route.path).toBe(route.path);
  }
});

test("the command palette goes to a page and opens Ask Duna", async ({
  page,
}) => {
  await signInAs(page, "player");
  await page.goto("/app");
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Search Duna" });
  await expect(palette).toBeVisible();
  await page.keyboard.type("Ask Duna");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: /Ask Duna/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+k");
  await expect(palette).toBeVisible();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Wallet");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/app\/wallet$/);
});

test("a guardian switches to their junior and Home shows whose account it is", async ({
  page,
}) => {
  test.skip(!wide(page), "The person menu sits in the rail on wide screens.");
  await signInAs(page, "parent");
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Your household" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Duna Player" })
    .getByRole("button", { name: /Account menu for Mara Lewis/ })
    .click();
  await page.getByRole("button", { name: /Remy Lewis/ }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Remy's week" }),
  ).toBeVisible();
  await expect(page.getByText("Remy’s account ·")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your household" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Back to my account" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: /, Mara\.$/ }),
  ).toBeVisible();
});

test("an adult player without juniors has no account switch", async ({
  page,
}) => {
  test.skip(!wide(page), "The person menu sits in the rail on wide screens.");
  await signInAs(page, "player");
  await page.goto("/app");
  await page
    .getByRole("navigation", { name: "Duna Player" })
    .getByRole("button", { name: /Account menu for/ })
    .click();
  await expect(page.getByText("Whose account")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Create new organisation" }),
  ).toBeVisible();
});

test("signed out, an app page sends the person to sign in and back", async ({
  page,
}) => {
  await signInAs(page, "visitor");
  await page.goto("/app");
  await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fapp$/);
  await page.goto("/app/wallet");
  await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fapp%2Fwallet$/);
});

test("rebuilt app pages load no legacy stylesheet", async ({ page }) => {
  await signInAs(page, "player");
  await page.goto("/app");
  const legacy = await page.evaluate(() =>
    [...document.styleSheets].some((sheet) => {
      try {
        return [...sheet.cssRules].some((rule) =>
          /\.player-sidebar|\.player-bottom-nav|\.player-shell\b/.test(
            rule.cssText,
          ),
        );
      } catch {
        return false;
      }
    }),
  );
  expect(legacy).toBe(false);
});

test("with reduced motion nothing on Home animates longer than a short fade", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: webBaseUrl,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await signInAs(page, "player");
  await page.goto("/app");
  await page
    .getByRole("link", { name: /Find a game/ })
    .first()
    .hover();
  const long = await page.evaluate(
    () =>
      document
        .getAnimations()
        .map((animation) => animation.effect?.getTiming())
        .filter(
          (timing) =>
            timing &&
            timing.iterations !== Infinity &&
            Number(timing.duration) > 200,
        ).length,
  );
  expect(long).toBe(0);
  await context.close();
});
