import { expect, test } from "@playwright/test";
import { askConversationId, installAskDunaFixture } from "../ask-duna-fixture";

const hqBaseUrl =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;

test("HQ Home hands a task to Ask Duna without approving its changes", async ({
  page,
}, testInfo) => {
  const { writes } = await installAskDunaFixture(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(hqBaseUrl);
  await expect(
    page.getByRole("heading", { name: "What would you like to get done?" }),
  ).toBeVisible();
  await expect(page.locator(".hq-shell--focused")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  const input = page.getByRole("textbox", {
    name: "What would you like Duna to do?",
  });
  await page
    .getByRole("button", { name: "Plan an event", exact: true })
    .click();
  await expect(input).toHaveValue(
    "Help me plan a new event. Ask me what you need before preparing a draft.",
  );
  expect(writes).toHaveLength(0);
  await input.fill("Prepare a draft clinic for next week.");
  await input.press("Enter");
  await expect(page).toHaveURL(`${hqBaseUrl}/ask/${askConversationId}`);
  await expect(
    page.getByRole("button", { name: "Approve change" }),
  ).toBeVisible();
  expect(writes.filter((row) => row.path === "conversations")).toEqual([
    expect.objectContaining({
      body: expect.objectContaining({
        title: "Prepare a draft clinic for next week.",
        page: "/",
      }),
    }),
  ]);
  expect(writes.filter((row) => row.path.endsWith("/review"))).toHaveLength(0);
  await page.screenshot({
    path: testInfo.outputPath("hq-ask-duna-review.png"),
    style: "nextjs-portal { display: none; }",
  });
  await page.goto(hqBaseUrl);
  await page
    .locator(".hq-work-details > summary")
    .filter({ hasText: "Business overview" })
    .click();
  await expect(page.locator(".hq-analytics-board")).toBeVisible();
  await page
    .locator(".hq-work-details > summary")
    .filter({ hasText: "More tools" })
    .click();
  await expect(
    page.getByRole("button", { name: "Refresh Duna AI insights" }),
  ).toBeVisible();
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
  await page.goto(`${hqBaseUrl}/members`);
  const prompt = page.getByRole("textbox", { name: "Ask Duna about people" });
  await prompt.fill("Find the people who need a follow-up.");
  await prompt.press("Enter");
  await expect(page).toHaveURL(`${hqBaseUrl}/ask/${askConversationId}`);
  expect(
    writes.find((row) => row.path === "conversations")?.body,
  ).toMatchObject({
    page: "/members",
    title: "Find the people who need a follow-up.",
  });
  await page.goto(`${hqBaseUrl}/members`);
  const more = page.locator(".hq-work-navigation-more");
  if ((page.viewportSize()?.width ?? 1440) <= 1100) {
    await page.getByRole("button", { name: "Search HQ", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Search Duna HQ" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  }
  const menu = (await more.isVisible())
    ? more
    : page.locator(".hq-mobile-navigation-more");
  await menu.locator("summary").click();
  await expect(
    menu.getByRole("link", { name: "Products", exact: true }),
  ).toBeVisible();
  await expect(
    menu.getByRole("link", { name: "Settings", exact: true }),
  ).toBeVisible();
});
