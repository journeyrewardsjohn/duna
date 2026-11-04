import { expect, test, type Page } from "@playwright/test";
const base = process.env.PLAYWRIGHT_HQ_BASE_URL ?? "http://127.0.0.1:3001";
const one = "10000000-0000-4000-8000-000000000001",
  two = "10000000-0000-4000-8000-000000000002";
const newest = "20000000-0000-4000-8000-000000000001",
  older = "20000000-0000-4000-8000-000000000002";
function detail(id = one, credits = 1000, hosting = true, active = true) {
  return {
    site: {
      id,
      name: id === one ? "Review Club" : "Second Club",
      brief: "Lead with junior programs",
      sourceUrl: "https://club.example.org",
      inspirationUrls: [],
      domain: null,
      publishedRevisionId: older,
      provisioningStatus: "ready",
      vercelProjectId: "project-1",
    },
    revisions: [
      {
        id: newest,
        brief: "Make the homepage welcoming",
        status: "draft",
        error: null,
        createdAt: "2026-11-04T12:00:00Z",
        deploymentUrl: null,
        document: {
          changeSummary: "Welcoming new headline",
          pages: [
            { slug: "home", title: "Home" },
            { slug: "about", title: "About" },
          ],
        },
      },
      {
        id: older,
        brief: "Build my website",
        status: "published",
        error: null,
        createdAt: "2026-11-03T12:00:00Z",
        deploymentUrl: "https://club.example.org",
        document: {
          changeSummary: "Original club design",
          pages: [{ slug: "home", title: "Home" }],
        },
      },
    ],
    billing: {
      active,
      status: "active",
      creditsAvailable: credits,
      monthlyCredits: 1000,
      checkoutConfigured: true,
      cancelAtPeriodEnd: false,
      periodEndsAt: "2026-12-04T12:00:00Z",
    },
    editCredits: 25,
    generationAvailable: true,
    hostingAvailable: hosting,
  };
}
/** UI-only fixture: changes the client component's serialized demo prop in the
 * intercepted local response. Server authorization is unchanged and every website API
 * request is mocked. This deliberately does not qualify connected functionality. */
async function install(
  page: Page,
  credits = 1000,
  hosting = true,
  active = true,
) {
  if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
    throw new Error("Website fixture is local-only");
  await page
    .context()
    .grantPermissions(["local-network-access"], { origin: base });
  const writes: Record<string, unknown>[] = [];
  let failPublish = false;
  let slowOne = false;
  await page.route(`${base}/website**`, async (route) => {
    const response = await route.fetch();
    const original = await response.text();
    const html = original.replaceAll(
      '\\"demo\\":true,\\"canManageBilling\\":false',
      '\\"demo\\":false,\\"canManageBilling\\":true',
    );
    expect(html).not.toEqual(original);
    await route.fulfill({ response, body: html });
  });
  await page.route(`${base}/api/websites**`, async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      writes.push(body);
      if (body.action === "publish" && failPublish) {
        await route.fulfill({
          status: 400,
          json: { error: "Hosting is temporarily unavailable. Try again." },
        });
        return;
      }
      await route.fulfill({ json: { ok: true } });
      return;
    }
    if (url.searchParams.has("preview")) {
      await route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><body><h1>Fixture preview ${url.searchParams.get("preview")}</h1></body></html>`,
      });
      return;
    }
    const id = url.searchParams.get("siteId");
    if (id === one && slowOne)
      await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({
      json: id
        ? detail(id, credits, hosting, active)
        : { sites: [detail(one).site, detail(two).site] },
    });
  });
  return {
    writes,
    setFailure: () => {
      failPublish = true;
    },
    setSlow: () => {
      slowOne = true;
    },
  };
}
test("website UI fixture: selected version, modal keyboard/error, and responsive preview", async ({
  page,
}, info) => {
  const fixture = await install(page);
  await page.goto(`${base}/website`);
  await expect(
    page.getByRole("heading", { name: "Build with Duna" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Versions", exact: true }).click();
  await page
    .getByRole("button", { name: /Live version Original club design/ })
    .click();
  await expect(page.locator('iframe[title$="preview"]')).toHaveAttribute(
    "src",
    new RegExp(`preview=${older}`),
  );
  await page.getByRole("button", { name: "Review & publish" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Back to preview" }),
  ).toBeFocused();
  await dialog.press("Escape");
  await expect(dialog).not.toBeVisible();
  expect(fixture.writes).toHaveLength(0);
  await page.getByRole("button", { name: "Review & publish" }).click();
  fixture.setFailure();
  await dialog.getByRole("button", { name: "Publish this version" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Hosting is temporarily unavailable",
  );
  expect(fixture.writes.at(-1)).toMatchObject({
    action: "publish",
    siteId: one,
    revisionId: older,
  });
  await dialog.getByRole("button", { name: "Back to preview" }).click();
  await page
    .getByRole("button", { name: "Mobile preview", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Mobile preview", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("website-studio-fixture.png"),
    fullPage: true,
  });
});
test("website UI fixture: exhausted credits preserve publishing, references and live site", async ({
  page,
}) => {
  const { writes } = await install(page, 0);
  await page.goto(`${base}/website`);
  await expect(
    page.getByRole("button", { name: "Generate website preview" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Review & publish" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("link", { name: "View live site" }),
  ).toHaveAttribute("href", "https://club.example.org");
  await page.getByText("Website brief & references", { exact: true }).click();
  await page.getByLabel("Website direction").fill("Lead with our summer camps");
  await page.getByLabel("Your existing website", { exact: true }).fill("");
  await page.getByRole("button", { name: "Save references" }).click();
  await expect(page.getByRole("status")).toContainText("References saved");
  expect(writes.at(-1)).toMatchObject({
    action: "references",
    siteId: one,
    brief: "Lead with our summer camps",
    inspirationUrls: [],
  });
  expect(writes.at(-1)).not.toHaveProperty("sourceUrl");
});
test("website UI fixture: delayed old-site response cannot overwrite selected site", async ({
  page,
}) => {
  const fixture = await install(page);
  await page.goto(`${base}/website`);
  await expect(
    page.getByRole("heading", { name: "Build with Duna" }),
  ).toBeVisible();
  await page.getByLabel("Choose website").selectOption(two);
  await expect(page.locator("main")).toContainText("Second Club");
  fixture.setSlow();
  await page.getByLabel("Choose website").selectOption(one);
  await page.getByLabel("Choose website").selectOption(two);
  await expect(
    page.getByRole("heading", { name: "Build with Duna" }),
  ).toBeVisible();
  await page.waitForTimeout(900);
  await expect(page.getByLabel("Choose website")).toHaveValue(two);
  await expect(
    page.locator("main strong").filter({ hasText: "Second Club" }),
  ).toBeVisible();
});

test("website UI fixture: disconnected hosting blocks subscription and publishing", async ({
  page,
}) => {
  await install(page, 1000, false, false);
  await page.goto(`${base}/website`);
  await expect(
    page.getByRole("button", { name: "Review & publish" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Subscribe · $200/month" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Hosting setup is in progress.", { exact: false }),
  ).toBeVisible();
});
