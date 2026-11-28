import { expect, test, type Page } from "@playwright/test";

/**
 * Visual checks of the NetScore / RatingRing and club identity gallery
 * sections, in light, dark and live, on desktop and at 375 px. Like the
 * other gallery spec it needs HQ running with TIDELINE_GALLERY=1:
 *
 *   TIDELINE_GALLERY=1 pnpm exec playwright test tests/e2e/tideline-score-identity.spec.ts
 *
 * Set TIDELINE_SHOTS_DIR to also write full-section screenshots there.
 */
const base =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;

test.skip(
  process.env.TIDELINE_GALLERY !== "1",
  "Needs HQ running with TIDELINE_GALLERY=1",
);

const themes = ["light", "dark", "live"] as const;
const sections = ["score", "identity"] as const;

async function open(page: Page, theme: (typeof themes)[number]) {
  await page.goto(`${base}/tideline?theme=${theme}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Tideline gallery" }),
  ).toBeVisible();
  // Wait for hydration: the live demo's buttons respond once React is in.
  await expect(page.locator("#identity .td-clubmark").first()).toBeVisible();
  await page.waitForLoadState("load");
  await page.emulateMedia({ reducedMotion: "reduce" });
}

for (const theme of themes) {
  for (const id of sections) {
    test(`${id} section, ${theme}: nothing overflows its card`, async ({
      page,
    }, testInfo) => {
      test.skip(
        testInfo.project.name === "personas",
        "Gallery checks run on the device projects",
      );
      await open(page, theme);
      const section = page.locator(`#${id}`);
      await section.scrollIntoViewIfNeeded();
      await expect(section).toBeVisible();

      // Nothing in these sections reaches past the viewport at any width.
      const past = await section.evaluate((root) => {
        const width = document.documentElement.clientWidth;
        return [...root.querySelectorAll<HTMLElement>("*")]
          .filter((node) => {
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.right > width + 1;
          })
          .filter((node) => !node.closest("[style*='width']"))
          .map((node) => node.className.toString());
      });
      expect(past).toEqual([]);

      // Every score card, club lockup and membership card stays inside its example.
      const escapes = await section.evaluate((root) => {
        const bad: string[] = [];
        for (const node of root.querySelectorAll<HTMLElement>(
          ".td-ns, .td-clublockup, .td-mcard, .td-ring, .td-wallet",
        )) {
          const card = node.closest<HTMLElement>("[class*='example']");
          if (!card) continue;
          const a = node.getBoundingClientRect();
          const b = card.getBoundingClientRect();
          if (a.right > b.right + 1 || a.left < b.left - 1)
            bad.push(node.className);
        }
        return bad;
      });
      expect(escapes).toEqual([]);

      const shots = process.env.TIDELINE_SHOTS_DIR;
      if (shots) {
        await section.screenshot({
          path: `${shots}/${id}-${theme}-${testInfo.project.name}.png`,
        });
      }
    });
  }
}

test("only a live score wears Solar; a finished card does not", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Runs once, on desktop");
  await open(page, "light");
  const colours = await page.locator("#score").evaluate((root) => {
    const solar = ["rgb(242, 84, 45)", "rgb(184, 58, 23)"];
    const found: string[] = [];
    for (const node of root.querySelectorAll<HTMLElement>("*")) {
      const style = getComputedStyle(node);
      const paints = [
        style.color,
        style.backgroundColor,
        style.borderColor,
        style.stroke,
        style.fill,
        getComputedStyle(node, "::before").backgroundColor,
      ];
      if (paints.some((paint) => solar.includes(paint))) {
        const card = node.closest(".td-ns");
        found.push(card?.getAttribute("data-status") ?? "outside a score");
      }
    }
    return [...new Set(found)];
  });
  expect(colours).toEqual(["live"]);
});

test("a live point is announced politely, once", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Runs once, on desktop");
  await open(page, "light");
  const demo = page
    .locator("#score")
    .locator("section.td-ns[data-status='live']")
    .filter({ has: page.locator("[aria-live='polite']") })
    .last();
  const region = demo.locator("[aria-live='polite']");
  await expect(region).toHaveText("");
  await page.getByRole("button", { name: "Point Williams / Lewis" }).click();
  await expect(region).toHaveText(/^Point Williams \/ Lewis\. Set 3, 10–11\./);
  // A burst is held: the region still says the first point right away.
  await page.getByRole("button", { name: "Point Williams / Lewis" }).click();
  await expect(region).toHaveText(/Set 3, 10–11/);
  // ...and the latest score after the quiet window.
  await expect(region).toHaveText(/Set 3, 11–11/, { timeout: 4000 });
});

test("the score card reads as one sentence", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Runs once, on desktop");
  await open(page, "light");
  await expect(
    page
      .locator("#score p.td-sr")
      .filter({ hasText: "Williams / Lewis beat Park / Stone 2 sets to 1" })
      .first(),
  ).toHaveText(
    "Williams / Lewis beat Park / Stone 2 sets to 1, 21–18, 19–21, 15–12. Verified.",
  );
});

test("a broken club logo falls back to the monogram", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Runs once, on desktop");
  await open(page, "light");
  const mark = page.getByRole("img", { name: "Broken Logo Club" });
  await expect(mark).toContainText("BL");
});
