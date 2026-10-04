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
  await page.goto("/");
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
    page.getByRole("link", { name: "Open Duna Player" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Color theme: Light/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const colors = await page.locator(".site-header").evaluate((el) => ({
    background: getComputedStyle(el).backgroundColor,
    text: getComputedStyle(el).color,
  }));
  expect(colors.background).toBe("rgb(25, 25, 25)");
  expect(colors.text).toBe("rgb(245, 245, 243)");
});
