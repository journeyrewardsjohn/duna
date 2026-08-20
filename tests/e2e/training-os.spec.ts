import { expect, test, type Locator, type Page } from "@playwright/test";

const trainingPath = "/run-your-club/training";

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(
    dimensions.clientWidth + 2,
  );
}

async function getBox(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

test("training feature page explains each planning layer", async ({ page }) => {
  await page.goto(trainingPath);

  await expect(
    page.getByRole("heading", { level: 1, name: /Describe the drill/ }),
  ).toBeVisible();

  for (const name of [
    "Tell Duna what you want. Review what it builds.",
    "Stack drills into a session. See the load before you start.",
    "Plan the season. Duna phases the work.",
    "A plan is only worth what happens on the sand.",
    "Keep it private, share it free, or sell it.",
  ]) {
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }

  await expect(page.getByText("Seam-to-Transition Wash").first()).toBeVisible();
  await expect(page.getByText("Sideout Under Pressure")).toBeVisible();
  await expect(page.getByText("Fall Competition Build")).toBeVisible();

  await expectNoHorizontalOverflow(page);
});

test("parallel courts are labelled rather than only tinted", async ({
  page,
}) => {
  await page.goto(trainingPath);

  // A background tint alone cannot carry meaning, so the lane has to be named.
  await expect(page.getByText("Court 1 + Court 2")).toBeVisible();
});

test("planning estimates are not presented as athlete measurement", async ({
  page,
}) => {
  await page.goto(trainingPath);

  const body = (await page.locator("main").innerText()).toLowerCase();

  expect(body).toContain("planning estimates");
  expect(body).toContain("not a health prediction");

  // Natural language produces drills only. Practices are assembled by the
  // coach and programs come from the structured designer.
  expect(body).not.toContain("describe a practice");
  expect(body).not.toContain("describe a program");

  // Only drills are listed on the marketplace.
  expect(body).toContain("the marketplace lists drills only");
});

test("training page anchors clear the fixed product nav", async ({ page }) => {
  await page.goto(trainingPath);

  const nav = page.getByRole("navigation", { name: "Training OS navigation" });
  const navLinksVisible = await nav
    .getByRole("link", { name: "Drills" })
    .isVisible();

  // The middle links collapse on narrow viewports by design.
  test.skip(!navLinksVisible, "product nav links are hidden at this width");

  const targets = [
    ["Drills", "Tell Duna what you want. Review what it builds."],
    [
      "Practices",
      "Stack drills into a session. See the load before you start.",
    ],
    ["Programs", "Plan the season. Duna phases the work."],
    ["Courtside", "A plan is only worth what happens on the sand."],
    ["Marketplace", "Keep it private, share it free, or sell it."],
  ] as const;

  for (const [linkName, headingName] of targets) {
    await nav.getByRole("link", { name: linkName }).click();
    await page.waitForTimeout(600);

    const heading = page.getByRole("heading", { name: headingName });
    await expect(heading).toBeVisible();

    const navBox = await getBox(nav);
    const headingBox = await getBox(heading);

    expect(headingBox.y).toBeGreaterThanOrEqual(navBox.y + navBox.height - 1);
  }
});

// HQ identity tokens are theme-invariant, so any pairing this page builds on
// top of a theme-dependent surface has to be checked in both grounds.
async function contrastRatio(page: Page, selector: string) {
  return page.evaluate((target) => {
    const channel = (value: number) => {
      const ratio = value / 255;
      return ratio <= 0.03928
        ? ratio / 12.92
        : Math.pow((ratio + 0.055) / 1.055, 2.4);
    };
    // Let the browser resolve whatever colour syntax it computed to, so
    // color-mix() and color(srgb ...) are measured rather than mis-parsed.
    const surface = document.createElement("canvas");
    surface.width = 1;
    surface.height = 1;
    const context = surface.getContext("2d");
    const parse = (value: string) => {
      if (!context || !value) return null;
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = "#000";
      context.fillStyle = value;
      if (
        context.fillStyle === "#000" &&
        !/^(#000|black|rgb\(0, 0, 0\))/.test(value)
      ) {
        return null;
      }
      context.clearRect(0, 0, 1, 1);
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: a / 255 };
    };
    const luminance = (rgb: { r: number; g: number; b: number }) =>
      0.2126 * channel(rgb.r) +
      0.7152 * channel(rgb.g) +
      0.0722 * channel(rgb.b);

    const element = document.querySelector(target);
    if (!element) return null;

    const foreground = parse(getComputedStyle(element).color);
    if (!foreground) return null;

    let node: Element | null = element;
    let background: { r: number; g: number; b: number } | null = null;
    while (node) {
      const parsed = parse(getComputedStyle(node).backgroundColor);
      if (parsed && parsed.a > 0.95) {
        background = parsed;
        break;
      }
      node = node.parentElement;
    }
    if (!background) return null;

    const light = Math.max(luminance(foreground), luminance(background));
    const dark = Math.min(luminance(foreground), luminance(background));
    return (light + 0.05) / (dark + 0.05);
  }, selector);
}

test("training page stays readable in both grounds", async ({ page }) => {
  const probes = [
    '[class*="parallelBlock"] strong',
    '[class*="blockLanes"]',
    '[class*="drillCard"] header span',
    '[class*="programPhases"] article > div em',
    '[class*="estimateNote"] p',
    '[class*="runItFeatures"] p',
    '[class*="milestonePriority"]',
  ];

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto(trainingPath);
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      colorScheme,
    );

    for (const probe of probes) {
      const ratio = await contrastRatio(page, probe);
      expect(ratio, `${probe} in ${colorScheme}`).not.toBeNull();
      expect(ratio!, `${probe} in ${colorScheme}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test("run-your-club links into the training feature page", async ({ page }) => {
  await page.goto("/run-your-club");

  const promo = page.getByRole("link", { name: /Explore Training OS/ });
  await expect(promo).toBeVisible();
  await expect(promo).toHaveAttribute("href", trainingPath);
});

test("training markdown companion agrees with the page", async ({
  request,
}) => {
  const response = await request.get(`${trainingPath}.md`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("markdown");

  const markdown = await response.text();

  expect(markdown).toContain(`https://duna.coach${trainingPath}`);
  expect(markdown).toContain(`https://duna.coach${trainingPath}.md`);
  expect(markdown).toContain("Drill Studio");
  expect(markdown).toContain("Practice Builder");
  expect(markdown).toContain("Program Designer");
  expect(markdown).toContain("not a health prediction");
  expect(markdown).toContain(
    "Practice plans and programs are not listed on the marketplace",
  );
});

test("training page is discoverable through the public indexes", async ({
  request,
}) => {
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain(
    `https://duna.coach${trainingPath}</loc>`,
  );

  const sitemapMarkdown = await request.get("/sitemap.md");
  expect(sitemapMarkdown.status()).toBe(200);
  const listing = await sitemapMarkdown.text();
  expect(listing).toContain(`https://duna.coach${trainingPath}`);
  expect(listing).toContain(`https://duna.coach${trainingPath}.md`);
});
