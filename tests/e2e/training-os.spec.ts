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

test("training page is one through-line of three plates", async ({ page }) => {
  await page.goto(trainingPath);

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Write the week. Run the court.",
    }),
  ).toBeVisible();

  for (const name of [
    "Say it once. Get a drill back.",
    "Tuesday is ninety minutes.",
    "Tuesday belongs to a season.",
    "One drill is enough to begin.",
  ]) {
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }

  // Exactly one artifact per plate, and nothing more.
  expect(await page.locator("figure").count()).toBe(3);

  await expectNoHorizontalOverflow(page);
});

test("the drill, the session, and the season are the same week", async ({
  page,
}) => {
  await page.goto(trainingPath);

  // The drill named in the first plate is the block in the second.
  await expect(
    page.getByText("Seam Serve to Transition", { exact: false }),
  ).toHaveCount(2);
  await expect(page.getByText("Court 1 + Court 2")).toBeVisible();
  await expect(page.getByText("Regional qualifier")).toBeVisible();
});

test("cut sections stay cut", async ({ page }) => {
  await page.goto(trainingPath);

  const body = (await page.locator("main").innerText()).toLowerCase();

  // Execution and commerce belong to other surfaces.
  for (const phrase of [
    "courtside",
    "coach mode",
    "run sheet",
    "marketplace",
    "organization license",
    "version history",
  ]) {
    expect(body, `page must not mention ${phrase}`).not.toContain(phrase);
  }

  // Internal model naming never reaches a public page. Matched on word
  // boundaries so ordinary coaching words like "solve" are not false hits.
  expect(body).not.toMatch(/\bsol\b/);
  expect(body).not.toMatch(/gpt[\s-]?5/);

  // No chapter nav, and no labelled example inventory.
  await expect(
    page.getByRole("navigation", { name: "Training OS navigation" }),
  ).toHaveCount(0);
  expect(body).not.toContain("example 1");
  expect(body).not.toContain("illustrative example");
});

test("capability claims stay inside what the product does", async ({
  page,
}) => {
  await page.goto(trainingPath);

  const body = (await page.locator("main").innerText()).toLowerCase();

  // Plain language produces a drill. Practices are assembled by the coach.
  expect(body).toContain("you build the session");
  expect(body).toContain("planning estimates");
  expect(body).not.toContain("describe a practice");
  expect(body).not.toContain("describe a program");
});

test("training page borrows the parent type scale", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  const read = async (path: string, selector: string) => {
    await page.goto(path);
    return page.evaluate((target) => {
      const element = document.querySelector(target);
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        fontSize: Number.parseFloat(style.fontSize),
        family: style.fontFamily,
      };
    }, selector);
  };

  const parent = await read("/run-your-club", "h1");
  const training = await read(trainingPath, "h1");

  expect(parent).not.toBeNull();
  expect(training).not.toBeNull();

  // The display h1 must match the sibling rather than a smaller local scale.
  expect(training!.fontSize).toBeCloseTo(parent!.fontSize, 0);
  expect(training!.family).toBe(parent!.family);
  expect(training!.fontSize).toBeGreaterThan(56);
});

test("chapters are left aligned", async ({ page }) => {
  await page.goto(trainingPath);

  const alignments = await page.evaluate(() =>
    [...document.querySelectorAll("main h1, main h2")].map(
      (heading) => getComputedStyle(heading).textAlign,
    ),
  );

  expect(alignments.length).toBeGreaterThan(0);
  for (const alignment of alignments) {
    expect(["start", "left"]).toContain(alignment);
  }
});

test("training page content is server rendered, not motion gated", async ({
  request,
}) => {
  const html = await (await request.get(trainingPath)).text();

  expect(html).toContain("Write the week. Run the court.");
  expect(html).toContain("Seam Serve to Transition");
  expect(html).toContain("Court 1 + Court 2");
  expect(html).toContain("Regional qualifier");

  // The hidden reveal state is opt-in and only ever applied by script.
  expect(html).not.toContain('data-motion="ready"');
});

test("interactive targets meet the documented minimums", async ({ page }) => {
  await page.goto(trainingPath);

  const isNarrow = (page.viewportSize()?.width ?? 1_280) <= 736;
  const controls = [
    page.getByRole("link", { name: /Start free in Duna HQ/ }).first(),
    page.getByRole("link", { name: "See all Duna HQ features" }),
  ];

  for (const control of controls) {
    const box = await getBox(control);
    expect(box.height).toBeGreaterThanOrEqual(isNarrow ? 56 : 48);
  }
});

test("run-your-club links into the training page", async ({ page }) => {
  await page.goto("/run-your-club");

  const promo = page.getByRole("link", { name: /See training planning/ });
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
  const lower = markdown.toLowerCase();

  expect(markdown).toContain(`https://duna.coach${trainingPath}`);
  expect(markdown).toContain(`https://duna.coach${trainingPath}.md`);
  expect(lower).toContain("plain language");
  expect(lower).toContain("assembles a timed session");
  expect(lower).toContain("not a health prediction");

  // The Markdown must lose the cut sections along with the page.
  for (const phrase of [
    "courtside",
    "coach mode",
    "marketplace",
    "run sheet",
  ]) {
    expect(lower, `markdown must not mention ${phrase}`).not.toContain(phrase);
  }
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
