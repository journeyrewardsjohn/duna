import { expect, test } from "@playwright/test";

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
