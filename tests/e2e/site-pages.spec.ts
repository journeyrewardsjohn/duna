import { expect, test, type Page } from "@playwright/test";
import {
  DUNA_SERVICE_FEE_BPS,
  MEMBERSHIP_PLANS,
} from "../../packages/core/src/membership-plans";
import { ORGANIZATION_PLANS } from "../../packages/core/src/organization-plans";
import { expectAccessible } from "./personas/support/a11y";

/**
 * The marketing pages on the Duna Design System (SITE-2,
 * docs/design/website.md §2.6–2.8, §3.4–3.7): clubs, coaches, pricing, the
 * apps, Sand Rating and the Pro Tour. Each renders with one h1 at desktop and
 * 375 px with no sideways scroll and no legacy stylesheet; reduced motion
 * shows end states; the pricing page prints exactly the plan tables; every
 * Pro Tour address still resolves; moved addresses answer 301.
 */

const PAGES = [
  { path: "/run-your-club", h1: "Run the whole club from one place." },
  { path: "/coaches", h1: "Your coaching day, in your pocket." },
  { path: "/pricing", h1: "Simple to start. Clear as you grow." },
  { path: "/apps", h1: "Two apps. One game." },
  {
    path: "/sand-rating",
    h1: "One number for your level, earned on the sand.",
  },
  { path: "/pro", h1: "The world’s game, point by point." },
] as const;

/** Selectors that exist only in the legacy sheets (app/(legacy)). */
const LEGACY_MARKERS = [
  ".site-loading",
  ".site-audience-bar",
  ".duna-loader",
  ".pro-event-card",
];

function dollars(minor: number) {
  const value = minor / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(2);
}

async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  });
}

test.describe("Marketing pages in the new shell", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "Runs once; sets its own viewports",
    );
  });

  for (const { path, h1 } of PAGES) {
    test(`${path} renders with one h1 at desktop and 375 px`, async ({
      page,
    }) => {
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 375, height: 812 },
      ]) {
        await page.setViewportSize(viewport);
        const response = await page.goto(path);
        expect(response?.status(), path).toBeLessThan(400);
        await expect(page.locator("h1")).toHaveCount(1);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(h1);
        await expect(page.getByRole("banner")).toBeVisible();
        await expect(page.locator("footer.site-footer")).toBeVisible();
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
          "href",
          new RegExp(`${path.replace("/", "\\/")}$`),
        );
        await expectNoHorizontalOverflow(page);
        await scrollThrough(page);
        await expectNoHorizontalOverflow(page);
      }
    });
  }

  test("no page loads a legacy stylesheet", async ({ page }) => {
    for (const { path } of PAGES) {
      await page.goto(path, { waitUntil: "load" });
      // The rules the document applies (a prefetched sheet for another
      // route is never applied, so it does not count).
      const css = await page.evaluate(() =>
        [...document.styleSheets]
          .map((sheet) => {
            try {
              return [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
            } catch {
              return "";
            }
          })
          .join("\n"),
      );
      expect(css.length, path).toBeGreaterThan(0);
      for (const marker of LEGACY_MARKERS) {
        expect(css.includes(`${marker} {`), `${path} ${marker}`).toBe(false);
      }
    }
  });

  test("reduced motion shows every concept at its end state", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const { path } of PAGES) {
      await page.goto(path);
      await scrollThrough(page);
      await expect(
        page.locator('[data-phase="armed"], [data-phase="play"]'),
        path,
      ).toHaveCount(0);
      await expect(page.locator(".site-photo__video"), path).toHaveCount(0);
      const longest = await page.evaluate(() =>
        Math.max(
          0,
          ...document
            .getAnimations()
            .filter((animation) => animation.playState === "running")
            .map((animation) => {
              const timing = animation.effect?.getComputedTiming();
              return timing?.iterations === Infinity
                ? 0
                : Number(timing?.duration ?? 0);
            }),
        ),
      );
      expect(longest, path).toBeLessThanOrEqual(200);
    }
    // The Sand Rating story rests on its last step: the rating has moved.
    await page.goto("/sand-rating");
    await expect(
      page.getByText("Confirmed by both sides. Counted."),
    ).toBeVisible();
  });

  test("pricing prints exactly the plan tables", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/pricing");
    for (const plan of Object.values(ORGANIZATION_PLANS)) {
      await expect(page.getByTestId(`price-${plan.id}`)).toHaveText(
        dollars(plan.monthlyPriceMinor),
      );
      await expect(page.getByTestId(`fee-${plan.id}`)).toHaveText(
        plan.defaultCommissionBps === 0
          ? "No Duna fee on sales"
          : `${plan.defaultCommissionBps / 100}% fee on sales`,
      );
    }
    for (const plan of Object.values(MEMBERSHIP_PLANS)) {
      await expect(page.getByTestId(`price-${plan.id}`)).toHaveText(
        dollars(plan.monthlyPriceMinor),
      );
    }
    await page.getByRole("radio", { name: "Yearly" }).click();
    for (const plan of [
      ...Object.values(ORGANIZATION_PLANS),
      ...Object.values(MEMBERSHIP_PLANS),
    ]) {
      await expect(page.getByTestId(`price-${plan.id}`)).toHaveText(
        dollars(plan.annualPriceMinor),
      );
    }
    // The calculator's example: a $40 card booking on the Free plan.
    const serviceFee = Math.round((4_000 * DUNA_SERVICE_FEE_BPS) / 10_000);
    const planFee = Math.round(
      (4_000 * ORGANIZATION_PLANS.coach.defaultCommissionBps) / 10_000,
    );
    await expect(page.getByTestId("calc-service")).toHaveText(
      `$${(serviceFee / 100).toFixed(2)}`,
    );
    await expect(page.getByTestId("calc-pays")).toHaveText(
      `$${((4_000 + serviceFee) / 100).toFixed(2)}`,
    );
    await expect(page.getByTestId("calc-org")).toHaveText(
      `−$${(planFee / 100).toFixed(2)}`,
    );
    // Premium removes the player's service fee.
    await page.getByRole("radio", { name: "Yes" }).click();
    await expect(page.getByTestId("calc-service")).toHaveText("$0.00");
    await expect(page.getByTestId("calc-pays")).toHaveText("$40.00");
    // The FAQ answers are on the page and open with a click.
    await page.getByText("Who pays card processing?").click();
    await expect(page.getByText(/out of the booking price/)).toBeVisible();
  });

  test("every Pro Tour address still resolves in the new shell", async ({
    page,
    request,
  }) => {
    for (const path of [
      "/pro",
      "/pro?tour=elite",
      "/pro?tour=avp&date=2026-07-04",
      "/pro/onboarding-complete",
      "/pro/onboarding-complete?billing=success",
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBeLessThan(400);
      await expect(page.locator("h1"), path).toHaveCount(1);
      await expect(page.getByRole("banner"), path).toBeVisible();
    }
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Your club is ready to run.",
    );
    // A team page answers (a team the feed knows, or the site's not-found).
    const team = await request.get("/pro/teams/1", { maxRedirects: 0 });
    expect(team.status()).toBeLessThan(500);
    await page.goto("/pro?tour=elite");
    await expect(
      page
        .getByRole("navigation", { name: "Filter by tour" })
        .getByRole("link", { name: "Elite" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("moved addresses answer with a permanent redirect", async ({
    request,
  }) => {
    for (const [from, to] of [
      ["/methodology", "/sand-rating"],
      ["/run-your-club/training", "/coaches"],
      ["/run-your-club/training-os", "/coaches"],
      ["/run-your-club/features", "/run-your-club"],
      ["/apps/apple-watch", "/apps"],
    ] as const) {
      const response = await request.get(from, { maxRedirects: 0 });
      expect(response.status(), from).toBe(301);
      expect(
        new URL(response.headers().location!, "http://localhost").pathname,
        from,
      ).toBe(to);
    }
  });

  test("the header's For coaches link opens Duna Pro for coaches", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/run-your-club");
    await page
      .getByRole("banner")
      .getByRole("link", { name: "For coaches", exact: true })
      .click();
    await expect(page).toHaveURL(/\/coaches$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Your coaching day, in your pocket.",
    );
  });

  test("each page passes the accessibility scan", async ({ page }) => {
    for (const { path } of PAGES) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(path);
      await expectAccessible(page);
      await page.setViewportSize({ width: 375, height: 812 });
      await page.reload();
      await expectAccessible(page);
    }
  });
});
