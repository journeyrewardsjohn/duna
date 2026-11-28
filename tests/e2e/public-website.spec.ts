import { expect, test } from "@playwright/test";

test("public event navigation spans the viewport and keeps anchors clear", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/events/golden-hour-fours");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Golden Hour 4s",
  );
  for (const width of [390, 820, 1440, 2280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/events/golden-hour-fours");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const header = await page.locator(".site-header").boundingBox();
    expect(header!.x).toBe(0);
    expect(header!.width).toBe(width);
    const inner = await page.locator(".site-header__inner").boundingBox();
    expect(inner!.width).toBeLessThanOrEqual(1264);
    expect(Math.abs(inner!.x - (width - inner!.width) / 2)).toBeLessThan(2);
    const hero = await page.locator(".event-public__hero").boundingBox();
    expect(hero!.y).toBeGreaterThanOrEqual(header!.height);
    expect(hero!.width).toBeLessThanOrEqual(1216);
    const image = await page.locator(".event-public__visual").boundingBox();
    expect(image!.height).toBeLessThanOrEqual(width <= 720 ? 240 : 400);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(2);
  }

  const nav = page.getByRole("navigation", { name: "On this event page" });
  await nav.getByRole("link", { name: "Location", exact: true }).click();
  await expect(page).toHaveURL(/#event-location$/);
  await expect(async () => {
    const navBox = await nav.boundingBox();
    const target = await page.locator("#event-location").boundingBox();
    expect(target!.y).toBeGreaterThanOrEqual(navBox!.y + navBox!.height);
    expect(target!.y).toBeLessThan(300);
  }).toPass();
  await expect(page.locator(".event-public__availability")).not.toContainText(
    "player spots",
  );
  await expect(
    page.getByRole("link", { name: "Results", exact: true }),
  ).toHaveAttribute("href", "/app/matches");
});

test("quiet public navigation preserves menus, keyboard access and dark mode", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("duna-theme", "light"));
  await page.setViewportSize({ width: 1440, height: 900 });
  // A page still on the legacy header (the home page moved to app/(next)).
  await page.goto("/discover");
  const play = page.locator('.site-experience-menu[data-experience="play"]');
  await play.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(play).toHaveAttribute("open", "");
  await expect(play.getByRole("link", { name: /Overview/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(play).not.toHaveAttribute("open", "");
  await expect(play.locator("summary")).toBeFocused();
  await expect(page.getByRole("link", { name: "Open Duna HQ" })).toBeVisible();
  await expect(
    page
      .locator(".site-header")
      .getByRole("link", { name: "Open Duna Player" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Color theme: Light/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".site-header")).toHaveCSS(
    "background-color",
    "rgb(14, 26, 34)",
  );
  await expect(page.locator(".site-header")).toHaveCSS(
    "color",
    "rgb(244, 242, 236)",
  );
});

test("club feature explanations stay clear of product previews at every width", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const feature of [
    "venues",
    "events",
    "products/plans",
    "people",
    "messaging",
    "coach-video",
  ]) {
    await page.goto(`/run-your-club/features/${feature}`);
    for (const width of [390, 820, 973, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      // Resize and font substitution can settle on different frames in CI.
      // Measure both regions in one layout read, then require a clear layout.
      await expect(async () => {
        const layout = await page
          .locator("[data-feature-hero]")
          .evaluate((hero) => {
            const copy = hero
              .querySelector('[class*="heroCopy"]')!
              .getBoundingClientRect();
            const preview = hero
              .querySelector('[aria-label$="product preview"]')!
              .getBoundingClientRect();
            return {
              overlaps:
                copy.x < preview.right &&
                copy.right > preview.x &&
                copy.y < preview.bottom &&
                copy.bottom > preview.y,
              overflow:
                document.documentElement.scrollWidth - window.innerWidth,
            };
          });
        expect(layout.overlaps, `${feature} at ${width}px`).toBe(false);
        expect(layout.overflow).toBeLessThanOrEqual(2);
      }).toPass({ timeout: 5000 });
    }
  }
});
