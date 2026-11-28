import { expect, type Locator, type Page } from "@playwright/test";
import {
  hqModuleHref,
  hqRoutes,
} from "../../../../packages/core/src/hq-routes";
import { hq } from "./fixtures";

/**
 * The common moves of a persona journey. Steps say what a person does
 * ("open Money", "fill the form", "confirm the refund") and these helpers turn
 * that into the page's accessible names, so a journey survives restyling.
 */

/**
 * HQ areas in the order of docs/design/tideline-4.1.1/ia-hq.md, mapped to
 * their routes through packages/core/src/hq-routes.ts (the single source of
 * truth since S2; old-to-new table in docs/plan/s2-route-map.md).
 */
export const hqAreas = {
  Today: hqRoutes.home,
  Schedule: hqRoutes.schedule,
  Inbox: hqRoutes.inbox,
  People: hqRoutes.people,
  Team: hqRoutes.team,
  Training: hqRoutes.training,
  Events: hqRoutes.events,
  Offerings: hqRoutes.offerings,
  Money: hqRoutes.money,
  "Club setup": hqRoutes.setup,
  Website: hqRoutes.website,
  Marketing: hqModuleHref("marketing"),
  Reports: hqModuleHref("reports"),
  Settings: hqRoutes.settings,
  Account: hqRoutes.account,
} as const;
export type HqArea = keyof typeof hqAreas;

/** Player web verbs (Find / Play / Improve / Connect) and the other homes. */
export const playerAreas = {
  Home: "/app",
  Find: "/app/discover",
  Play: "/app/play",
  Improve: "/app/video",
  Connect: "/app/messages",
  Wallet: "/app/wallet",
  Profile: "/app/profile",
  Settings: "/app/settings",
} as const;
export type PlayerArea = keyof typeof playerAreas;

const navigationTimeout = 30_000;

/** Opens an HQ area by the new information architecture. */
export async function openHqArea(page: Page, area: HqArea) {
  await page.goto(hq(hqAreas[area]), { timeout: navigationTimeout });
  await expectPageReady(page);
}

/** Opens a Player web area by its verb. */
export async function openPlayerArea(page: Page, area: PlayerArea) {
  await page.goto(playerAreas[area], { timeout: navigationTimeout });
  await expectPageReady(page);
}

/** The page has a main landmark with a level-1 heading and no error page. */
export async function expectPageReady(page: Page, heading?: string | RegExp) {
  const main = page.locator("main, [role='main']").first();
  await expect(main).toBeVisible();
  const h1 = page.getByRole("heading", { level: 1 }).first();
  if (heading) await expect(h1).toHaveText(heading);
  else await expect(h1).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /application error|404|not found/i }),
  ).toHaveCount(0);
}

/**
 * Opens one of an open object's tabs (SubNav links or tabs) and checks it is
 * the current one.
 */
export async function openObjectTab(page: Page, name: string | RegExp) {
  const tab = page
    .getByRole("tab", { name })
    .or(page.getByRole("link", { name }).and(page.locator("[data-nav-id]")))
    .first();
  await tab.click();
  await expect(tab).toHaveAttribute(
    (await tab.getAttribute("role")) === "tab"
      ? "aria-selected"
      : "aria-current",
    /true|page/,
  );
}

export type FieldValue = string | boolean | { readonly option: string };

/**
 * Fills a form through its fields' accessible names, the same names the Ask
 * Duna agent uses. Text for inputs, `true`/`false` for checkboxes and
 * switches, `{ option }` for selects and comboboxes.
 */
export async function fillForm(
  scope: Page | Locator,
  fields: Readonly<Record<string, FieldValue>>,
) {
  for (const [label, value] of Object.entries(fields)) {
    const field = scope.getByLabel(label, { exact: true });
    if (typeof value === "boolean") {
      await field.setChecked(value);
    } else if (typeof value === "object") {
      const tag = await field.evaluate((element) => element.tagName);
      if (tag === "SELECT") await field.selectOption({ label: value.option });
      else {
        await field.click();
        await scope
          .getByRole("option", { name: value.option, exact: true })
          .click();
      }
    } else {
      await field.fill(value);
      // Validation runs on blur (definition-of-done.md 5.7).
      await field.blur();
    }
  }
}

export type ConfirmTier = "none" | "confirm" | "strong";

/**
 * Presses an action and handles its confirmation tier
 * (definition-of-done.md section 4):
 * - `none`: no dialog may appear; the result (usually an Undo toast) follows;
 * - `confirm`: one dialog names the action; press its verb button;
 * - `strong`: the dialog must restate every `restates` text (amount with
 *   currency, recipients, consequence); `typed` is entered when given.
 * Fails if a second dialog opens while one is open (never two modals deep).
 */
export async function pressAndConfirm(
  page: Page,
  action: Locator,
  tier: ConfirmTier,
  options: {
    readonly confirmButton?: string | RegExp;
    readonly restates?: readonly (string | RegExp)[];
    readonly typed?: { readonly label: string; readonly value: string };
  } = {},
) {
  await action.click();
  const dialogs = page.getByRole("dialog").or(page.getByRole("alertdialog"));
  if (tier === "none") {
    await page.waitForTimeout(400);
    await expect(dialogs).toHaveCount(0);
    return;
  }
  const dialog = dialogs.last();
  await expect(dialog).toBeVisible();
  await expect(dialogs, "never two modals deep").toHaveCount(1);
  if (tier === "strong") {
    for (const text of options.restates ?? []) {
      await expect(dialog).toContainText(text);
    }
    if (options.typed) {
      await dialog.getByLabel(options.typed.label).fill(options.typed.value);
    }
  }
  const confirm = dialog.getByRole("button", {
    name:
      options.confirmButton ??
      /confirm|send|publish|refund|delete|cancel booking|pay/i,
  });
  await expect(confirm).not.toHaveAccessibleName(/^ok$/i);
  await confirm.click();
  await expect(dialog).toBeHidden();
}

/** Waits for a toast (or live status message) containing the text. */
export async function expectToast(page: Page, text: string | RegExp) {
  await expect(
    page
      .locator("[data-sonner-toast], [role='status'], [role='alert']")
      .filter({ hasText: text })
      .first(),
  ).toBeVisible();
}

/**
 * Asserts the page did not jump while loading: cumulative layout shift (the
 * sum of unexpected layout-shift entries) stays under `max`. 0.1 is the
 * "good" Core Web Vitals threshold.
 */
export async function expectNoLayoutShift(page: Page, max = 0.1) {
  const shift = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let total = 0;
        try {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as unknown as {
              value: number;
              hadRecentInput: boolean;
            }[]) {
              if (!entry.hadRecentInput) total += entry.value;
            }
          });
          observer.observe({ type: "layout-shift", buffered: true });
          setTimeout(() => {
            observer.disconnect();
            resolve(total);
          }, 500);
        } catch {
          resolve(0);
        }
      }),
  );
  expect(shift, `cumulative layout shift on ${page.url()}`).toBeLessThan(max);
}

export async function expectNoHorizontalOverflow(page: Page) {
  const { clientWidth, scrollWidth } = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
}
