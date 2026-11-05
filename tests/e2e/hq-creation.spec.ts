import { expect, test, type Page } from "@playwright/test";
import { installAskDunaFixture } from "../ask-duna-fixture";

const base =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;

async function contained(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await page.route(
    /^https:\/\/(?:api|cdn)\.fontshare\.com\//,
    async (route) => {
      const headers = route.request().headers();
      delete headers["x-forwarded-for"];
      await route.continue({ headers });
    },
  );
});

// These are UI contract checks with a mocked assistant. They do not establish
// model capability, resource creation, provider transactions or production data.
test("creation examples wait for explicit AI submission and preserve review", async ({
  page,
}, info) => {
  const { writes, turns } = await installAskDunaFixture(page);
  await page.goto(`${base}/events/create`);
  const brief = page.getByRole("textbox", {
    name: "What would you like to create?",
  });
  const submit = page.getByRole("button", { name: "Continue with Duna" });
  await expect(submit).toBeDisabled();
  const example = page.getByRole("button", {
    name: "Plan a doubles tournament with two divisions and a waitlist.",
    exact: true,
  });
  await example.click();
  await expect(brief).toHaveValue(await example.innerText());
  await expect(brief).toBeFocused();
  expect(writes).toHaveLength(0);
  expect(turns).toHaveLength(0);
  await expect(
    page.getByRole("region", { name: "Floating Ask Duna" }),
  ).toBeHidden();
  await contained(page);
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: info.outputPath("creation-ai-entry.png"),
    fullPage: true,
  });
  await submit.click();
  const floating = page.getByRole("region", { name: "Floating Ask Duna" });
  await expect(floating).toBeVisible();
  await expect(
    floating.getByText("Ready for your review", { exact: true }),
  ).toBeVisible();
  expect(writes.filter((row) => row.path === "conversations")).toHaveLength(1);
  expect(turns).toHaveLength(1);
  expect(JSON.stringify(turns[0])).toContain("two divisions and a waitlist");
  expect(writes.filter((row) => row.path.endsWith("/review"))).toHaveLength(0);
  await expect(page).toHaveURL(`${base}/events/create`);
});

for (const [path, heading, builder] of [
  ["/events/create", "Create event", ".event-builder"],
  ["/products/create", "Create offer", ".guided-product-builder"],
  ["/locations/create", "Add venue", ".venue-create-studio"],
] as const) {
  test(`manual ${path} remains available with keyboard focus and dark containment`, async ({
    page,
  }, info) => {
    await page.addInitScript(() => localStorage.setItem("duna-theme", "dark"));
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.goto(`${base}${path}`);
    const manual = page.getByRole("button", {
      name: "Create manually",
      exact: false,
    });
    await manual.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: heading, level: 1, exact: true }),
    ).toBeFocused();
    await expect(page.locator(builder)).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "What would you like to create?" }),
    ).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await contained(page);
    const outside = await page
      .locator(
        `${builder} input:not([type=hidden]), ${builder} select, ${builder} textarea`,
      )
      .evaluateAll((nodes) =>
        nodes
          .filter((node) => {
            const bounds = node.getBoundingClientRect();
            return (
              bounds.width > 0 &&
              bounds.height > 0 &&
              (bounds.left < -1 || bounds.right > window.innerWidth + 1)
            );
          })
          .map((node) => node.getAttribute("name") ?? node.tagName),
      );
    expect(outside).toEqual([]);
    await page.evaluate(async () => {
      await document.fonts.ready;
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: info.outputPath("manual-form-dark.png"),
      fullPage: true,
    });
  });
}

test("event prefills bypass AI and remain available in the manual builder", async ({
  page,
}) => {
  await page.goto(
    `${base}/events/create?title=QA%20junior%20league&type=league`,
  );
  await expect(page.locator(".event-builder")).toBeVisible();
  await expect(page.locator(".hq-creation")).toHaveCount(0);
  await page
    .locator(".event-builder__steps")
    .getByRole("button", { name: /Basics/ })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Event name", exact: true }),
  ).toHaveValue("QA junior league");
});

test("Team directory preserves filters, layouts, pagination and keyboard profile access", async ({
  page,
}, info) => {
  await page.goto(`${base}/team`);
  const table = page.getByRole("table", {
    name: "Staff directory",
    exact: true,
  });
  await expect(table).toBeVisible();
  await expect(table.getByRole("columnheader")).toHaveCount(6);
  const search = page.getByRole("searchbox", {
    name: "Search staff",
    exact: true,
  });
  await search.fill("no-staff-matches-this-qa-query");
  await expect(
    page.getByText("No team members match this view.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next staff page" }),
  ).toBeDisabled();
  await search.clear();
  const filters = page.getByRole("group", { name: "Filter team" });
  for (const name of ["Coaches", "Active", "Needs setup", "Everyone"]) {
    const button = filters.getByRole("button", { name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }
  await page.getByRole("button", { name: "Cards", exact: true }).click();
  await expect(table).toHaveCount(0);
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(table).toBeVisible();
  await page
    .getByRole("combobox", { name: "Staff rows per page" })
    .selectOption("50");
  await expect(
    page.getByRole("button", { name: "Previous staff page" }),
  ).toBeDisabled();
  const region = page.getByRole("region", {
    name: "Staff directory",
    exact: true,
  });
  await region.focus();
  await expect(region).toBeFocused();
  await contained(page);
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: info.outputPath("team-directory.png"),
    fullPage: true,
  });
  const profile = table.getByRole("rowheader").first().getByRole("link");
  const href = await profile.getAttribute("href");
  expect(href).toMatch(/^\/team\//);
  await profile.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`${base}${href}`);
});
