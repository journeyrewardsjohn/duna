import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * The legal center (/legal): every document in the index is on the hub,
 * each document renders with one h1 and working section links, drafts say
 * so, search finds a heading, nothing scrolls sideways at 375 px, and print
 * gives clean pages.
 */
interface IndexEntry {
  readonly slug: string;
  readonly title: string;
  readonly group: string | null;
  readonly status: "draft" | "in-effect";
}

const index = JSON.parse(
  readFileSync(
    join(process.cwd(), "apps/web/content/legal/index.json"),
    "utf8",
  ),
) as { documents: IndexEntry[] };
const documents = index.documents.filter((entry) => entry.group !== null);
/** Published before the legal center; their 1.0 drafts live at /draft. */
const published = new Set(["terms", "privacy", "hq-terms"]);

async function expectNoHorizontalOverflow(page: Page) {
  const { clientWidth, scrollWidth } = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
}

test.describe("Legal center", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "Runs once; sets its own viewports",
    );
  });

  test("the hub lists every document in the index, with its status", async ({
    page,
  }) => {
    await page.goto("/legal");
    await expect(
      page.getByRole("heading", { level: 1, name: "Duna Legal Center" }),
    ).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    const main = page.getByRole("main");
    for (const entry of documents) {
      const href = `/legal/${entry.slug}`;
      await expect(
        main.locator(`.lc-row a[href="${href}"]`),
        entry.slug,
      ).toHaveCount(1);
    }
    await expect(main.locator('.lc-row a[href="/legal/eula"]')).toHaveCount(1);
    // A draft row says so plainly.
    const cookies = main.locator(".lc-row", {
      has: page.locator('a[href="/legal/cookies"]'),
    });
    await expect(cookies).toContainText("Draft for review. Not yet in effect.");
    // A published document keeps its address, with the revision one step away.
    const terms = main.locator(".lc-row", {
      has: page.locator('a[href="/legal/terms"]'),
    });
    await expect(terms).toContainText("In effect");
    await expect(
      terms.getByRole("link", { name: /read the draft/ }),
    ).toHaveAttribute("href", "/legal/terms/draft");
    // Which terms apply to me?
    await page.getByText("I run a club").click();
    await expect(
      main.getByRole("link", { name: "Duna Pay Terms" }).first(),
    ).toBeVisible();
  });

  test("search finds a heading inside a document", async ({ page }) => {
    await page.goto("/legal");
    await page
      .getByRole("searchbox", { name: "Search terms and policies" })
      .fill("what we do not use");
    const result = page.locator(".lc-search__result", {
      hasText: "4. What we do not use",
    });
    await expect(result).toBeVisible();
    await expect(result).toContainText("Section of Cookie Policy");
    await result.click();
    await expect(page).toHaveURL(/\/legal\/cookies#4-what-we-do-not-use$/);

    await page.goto("/legal");
    await page
      .getByRole("searchbox", { name: "Search terms and policies" })
      .fill("zzqx nothing");
    await expect(
      page.getByText("Nothing matches “zzqx nothing”"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Clear search" }).last().click();
    await expect(
      page.getByRole("searchbox", { name: "Search terms and policies" }),
    ).toHaveValue("");
  });

  for (const entry of documents) {
    const path = published.has(entry.slug)
      ? `/legal/${entry.slug}/draft`
      : `/legal/${entry.slug}`;
    test(`${path} renders one h1, working section links and its status`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(page.locator("h1")).toHaveCount(1);
      if (entry.status === "draft") {
        await expect(
          page.getByText("Draft for review. Not yet in effect."),
        ).toBeVisible();
      }
      const list = page
        .getByRole("navigation", { name: /^Sections of the / })
        .first();
      const links = list.getByRole("link");
      expect(await links.count()).toBeGreaterThan(0);
      const target = links.nth(Math.min(2, (await links.count()) - 1));
      const href = (await target.getAttribute("href")) ?? "";
      await target.click();
      await expect(page).toHaveURL(new RegExp(`${href}$`));
      await expect(page.locator(`[id="${href.slice(1)}"]`)).toBeInViewport();
      // No raw bracketed placeholder reads as final text.
      const text = await page.locator(".td-doc-prose").innerText();
      expect(text).not.toMatch(
        /\[(?:Duna mailing address|State of governing law|confirm legal entity)\]/,
      );
    });
  }

  test("the published Terms stay at their address, with old section links", async ({
    page,
  }) => {
    await page.goto(
      "/legal/terms#14-suspension-termination-and-account-deletion",
    );
    await expect(
      page.getByRole("heading", {
        name: "14. Suspension, termination, and account deletion",
      }),
    ).toBeInViewport();
    await expect(
      page.getByText("A revised version is being reviewed"),
    ).toBeVisible();
  });

  test("placeholders are marked to be confirmed", async ({ page }) => {
    await page.goto("/legal/terms/draft");
    const mark = page
      .locator(".lc-tbc", { hasText: "Duna mailing address" })
      .first();
    await expect(mark).toContainText("To be confirmed");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  });

  test("short addresses redirect and an unknown document offers search", async ({
    page,
  }) => {
    await page.goto("/privacy");
    await expect(page).toHaveURL(/\/legal\/privacy$/);
    await page.goto("/refunds");
    await expect(page).toHaveURL(/\/legal\/booking-and-refunds$/);
    await page.goto("/legal/no-such-document");
    await expect(
      page.getByText("We couldn’t find that document"),
    ).toBeVisible();
    await expect(
      page.getByRole("searchbox", { name: "Search terms and policies" }),
    ).toBeVisible();
  });

  test("the footer has a Legal group", async ({ page }) => {
    await page.goto("/legal");
    const footer = page.locator("footer.site-footer");
    await expect(
      footer.getByRole("link", { name: "Legal center" }),
    ).toHaveAttribute("href", "/legal");
    await expect(
      footer.getByRole("link", { name: "Cookie Policy" }),
    ).toHaveAttribute("href", "/legal/cookies");
  });

  test("skip link, keyboard and copy link", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/legal/cookies");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to the document" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#legal-content")).toBeFocused();
    const copy = page.getByRole("button", {
      name: "Copy link to “4. What we do not use”",
    });
    await copy.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByText(/Link copied|Link is in the address bar/).first(),
    ).toBeVisible();
  });

  test("no horizontal scroll at 375 px, tables scroll inside themselves", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    for (const path of [
      "/legal",
      "/legal/duna-pay",
      "/legal/subprocessors",
      "/legal/terms/draft",
      "/legal/privacy",
    ]) {
      await page.goto(path);
      await expectNoHorizontalOverflow(page);
    }
    await page.goto("/legal/duna-pay");
    const table = page.getByRole("region", { name: "Release by product type" });
    const widths = await table.evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
    }));
    expect(widths.scroll).toBeGreaterThan(widths.client);
    // The phone section list is a disclosure.
    await page.getByText("On this page").last().click();
    await expect(
      page
        .getByRole("navigation", { name: "Sections of the Duna Pay Terms" })
        .last()
        .getByRole("link")
        .first(),
    ).toBeVisible();
  });

  test("dark theme and reduced motion", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.goto("/legal/cookies");
    await expect(page.locator("#legal-scope")).toHaveAttribute(
      "data-theme",
      "dark",
    );
    await expectNoHorizontalOverflow(page);
  });

  test("print renders clean pages", async ({ page }) => {
    await page.goto("/legal/duna-pay");
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".site-header")).toBeHidden();
    await expect(page.locator(".td-doc-toc")).toBeHidden();
    await expect(page.locator(".lc-print-address")).toBeVisible();
    const color = await page
      .locator(".td-doc-prose p")
      .first()
      .evaluate((element) => getComputedStyle(element).color);
    expect(color).toBe("rgb(0, 0, 0)");
    const pdf = await page.pdf({ format: "Letter" });
    expect(pdf.byteLength).toBeGreaterThan(10_000);
  });
});
