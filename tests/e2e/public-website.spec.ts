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
  await page.goto("/players");
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
    "rgb(25, 25, 25)",
  );
  await expect(page.locator(".site-header")).toHaveCSS(
    "color",
    "rgb(245, 245, 243)",
  );
});

test("audience toggle separates club and player journeys and survives reload", async ({
  page,
}) => {
  await page.goto("/");
  const audience = page.getByRole("navigation", {
    name: "Choose your Duna experience",
  });
  await expect(
    audience.getByRole("link", { name: "For Clubs", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Your club.All together.",
  );
  await expect(
    page.locator('#features a[href^="/run-your-club/features/"]'),
  ).toHaveCount(6);
  await audience
    .getByRole("link", { name: "For Players", exact: true })
    .click();
  await expect(page).toHaveURL(/\/players$/);
  await page.reload();
  await expect(
    audience.getByRole("link", { name: "For Players", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("link", { name: "Find a game", exact: true }),
  ).toHaveAttribute("href", "/discover");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/players$/,
  );
  await audience.getByRole("link", { name: "For Clubs", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /^https?:\/\/[^/]+\/?$/,
  );
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "More play.More possibility.",
  );
});

test("audience landing pages fit mobile, tablet, and wide screens in both themes", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const path of ["/", "/players"]) {
    await page.goto(path);
    for (const width of [390, 820, 1440, 2280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ["light", "dark"]) {
        await page.evaluate(
          (value) => document.documentElement.setAttribute("data-theme", value),
          theme,
        );
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const dimensions = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          viewport: window.innerWidth,
        }));
        expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport + 2);
        const header = await page.locator(".site-header").boundingBox();
        const hero = await page.locator("#audience-heading").boundingBox();
        expect(hero!.y).toBeGreaterThan(header!.y + header!.height);
        for (const link of await page
          .locator(".site-audience-switch a")
          .all()) {
          const bounds = await link.boundingBox();
          expect(bounds!.height).toBeGreaterThanOrEqual(48);
        }
      }
    }
  }
});

test("club feature menu, FAQ, and mobile audience links work with the keyboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const menu = page.locator(".club-feature-menu");
  await menu.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveAttribute("open", "");
  await expect(
    menu.getByRole("link", { name: /Explore every feature/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu.locator("summary")).toBeFocused();
  await page
    .getByRole("link", { name: "Explore the features", exact: true })
    .click();
  const featureTop = await page.locator("#features").boundingBox();
  const header = await page.locator(".site-header").boundingBox();
  expect(featureTop!.y).toBeGreaterThanOrEqual(header!.height);
  const faq = page
    .locator("details")
    .filter({ hasText: "How does pricing work?" });
  await faq.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(faq).toHaveAttribute("open", "");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  const sheet = page.getByRole("dialog", { name: "Where do you want to go?" });
  await sheet.getByRole("link", { name: /For Players Find games/ }).click();
  await expect(page).toHaveURL(/\/players$/);
  await expect(sheet).toBeHidden();
});
