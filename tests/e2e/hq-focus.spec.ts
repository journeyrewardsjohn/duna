import { expect, test } from "@playwright/test";
import { installAskDunaFixture } from "../ask-duna-fixture";

const hqBaseUrl =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;

test("HQ Today hands a task to Ask Duna and every change waits for a person", async ({
  page,
}, testInfo) => {
  const { writes } = await installAskDunaFixture(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(hqBaseUrl);
  await expect(
    page.getByRole("heading", { name: "Today", level: 1 }),
  ).toBeVisible();
  const input = page.getByRole("textbox", {
    name: "What would you like Duna to do?",
  });
  expect(writes).toHaveLength(0);
  await input.fill("Prepare a draft clinic for next week.");
  await input.press("Enter");
  await expect(page).toHaveURL(`${hqBaseUrl}/`);
  const panel = page.getByRole("complementary", { name: "Ask Duna" });
  await expect(panel).toBeVisible();
  const approve = panel.getByRole("button", { name: "Approve change" });
  await expect(approve).toBeVisible();
  expect(writes.filter((row) => row.path === "conversations")).toEqual([
    expect.objectContaining({
      body: expect.objectContaining({
        title: "Prepare a draft clinic for next week.",
        page: "/",
      }),
    }),
  ]);
  // Approving asks first (the interaction kit's confirmation tier); saying
  // "Not yet" changes nothing.
  await approve.click();
  const question = page.getByRole("alertdialog");
  await expect(question).toBeVisible();
  await question.getByRole("button", { name: "Not yet" }).click();
  await expect(question).toBeHidden();
  expect(writes.filter((row) => row.path.endsWith("/review"))).toHaveLength(0);
  await page.screenshot({
    path: testInfo.outputPath("hq-ask-duna-review.png"),
    style: "nextjs-portal { display: none; }",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("HQ page tasks retain context and secondary navigation stays reachable", async ({
  page,
}) => {
  const { writes } = await installAskDunaFixture(page);
  await page.goto(`${hqBaseUrl}/people`);
  await page.getByText("Ask Duna about this page", { exact: true }).click();
  const prompt = page.getByRole("textbox", { name: "Ask Duna about people" });
  await prompt.fill("Find the people who need a follow-up.");
  await prompt.press("Enter");
  await expect(
    page.getByRole("button", { name: "Approve change" }),
  ).toBeVisible();
  await expect(page).toHaveURL(`${hqBaseUrl}/people`);
  expect(
    writes.find((row) => row.path === "conversations")?.body,
  ).toMatchObject({
    page: "/people",
    title: "Find the people who need a follow-up.",
  });
  await page.goto(`${hqBaseUrl}/people`);
  // The IA has no "More tools": every area is in the sidebar and Settings is
  // at its foot. The phone keeps a More drawer for the rest.
  const sidebar = page.locator(".hq-sidebar");
  if ((page.viewportSize()?.width ?? 1440) <= 1100) {
    await page.getByRole("button", { name: "Search HQ", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Search Duna HQ" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  }
  const phoneMore = page.locator(".hq-mobile-navigation-more");
  const menu = (await phoneMore.isVisible()) ? phoneMore : sidebar;
  if (menu === phoneMore) await menu.locator("summary").click();
  await expect(
    menu.getByRole("link", { name: "Offerings", exact: true }),
  ).toBeVisible();
  await expect(
    menu.getByRole("link", { name: "Settings", exact: true }),
  ).toBeVisible();
});
