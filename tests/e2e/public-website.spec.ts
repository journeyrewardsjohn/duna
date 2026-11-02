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

test("product previews support keyboard selection and reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const path of ["/", "/players"]) {
    await page.goto(path);
    const tabs = page.getByRole("tablist", {
      name: /Explore (club|player) capabilities/,
    });
    await tabs.getByRole("tab").first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.getByRole("tab").nth(1)).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(tabs.getByRole("tab").nth(1)).toBeFocused();
    await expect(page.getByRole("tabpanel")).toContainText(
      path === "/" ? "Memberships" : "Your match history",
    );
    await page.keyboard.press("End");
    await expect(page.getByRole("tabpanel")).toContainText("Practice review");
    await expect(
      page.getByRole("button", { name: "Replay product preview" }),
    ).toHaveCount(0);
    expect(
      await page
        .getByRole("tabpanel")
        .evaluate((panel) => panel.getAnimations({ subtree: true }).length),
    ).toBe(0);
    await page.keyboard.press("Home");
    await expect(page.getByRole("tabpanel")).toContainText(
      path === "/" ? "Club calendar" : "Your next session",
    );
    for (const width of [360, 390, 820, 973, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const control of await tabs.getByRole("tab").all()) {
        const bounds = await control.boundingBox();
        expect(bounds!.height).toBeGreaterThanOrEqual(48);
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(2);
    }
  }
});

test("product motion is finite, replayable, and disabled for data saving", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const panel = page.getByRole("tabpanel");
  await panel.scrollIntoViewIfNeeded();
  const replay = page.getByRole("button", { name: "Replay product preview" });
  await expect(replay).toBeVisible();
  await replay.click();
  const timings = await panel.evaluate((element) =>
    element
      .getAnimations({ subtree: true })
      .map((animation) => animation.effect!.getComputedTiming()),
  );
  expect(timings.length).toBeGreaterThan(0);
  for (const timing of timings) {
    expect(timing.iterations).toBe(1);
    expect(timing.endTime).toBeLessThanOrEqual(3000);
  }
  await expect
    .poll(() =>
      panel.evaluate(
        (element) =>
          element
            .getAnimations({ subtree: true })
            .filter((animation) => animation.playState === "running").length,
      ),
    )
    .toBe(0);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: {
        saveData: true,
        addEventListener() {},
        removeEventListener() {},
      },
    }),
  );
  await page.reload();
  await page.getByRole("tabpanel").scrollIntoViewIfNeeded();
  await expect(page.locator('[data-motion="off"]')).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Replay product preview" }),
  ).toHaveCount(0);
  expect(
    await page
      .getByRole("tabpanel")
      .evaluate((element) => element.getAnimations({ subtree: true }).length),
  ).toBe(0);
});
