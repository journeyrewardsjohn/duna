import { expect, test } from "@playwright/test";
import { askConversationId, installAskDunaFixture } from "../ask-duna-fixture";

const hqBaseUrl =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;

test("HQ assistant deep links and launchers use the persistent Ask Duna surface", async ({
  page,
}) => {
  await installAskDunaFixture(page);
  await page.goto(`${hqBaseUrl}/?duna=ask`);
  await expect(page).toHaveURL(`${hqBaseUrl}/ask`);
  await expect(
    page.getByRole("heading", { name: /What can I take off your plate/ }),
  ).toBeVisible();
  await page.goto(`${hqBaseUrl}/members`);
  if ((page.viewportSize()?.width ?? 1440) <= 1100) {
    const more = page.locator(".hq-mobile-navigation-more");
    await more.locator("summary").click();
    await more.getByRole("link", { name: "Ask Duna", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Duna AI", exact: true }).click();
  }
  await expect(page).toHaveURL(`${hqBaseUrl}/ask`);
  await expect(
    page.getByRole("region", { name: "Duna AI assistant" }),
  ).toHaveCount(0);
});

test("Ask Duna composer supports references, files, effort and accessible responsive themes", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installAskDunaFixture(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${hqBaseUrl}/ask`);
  await expect(
    page.getByRole("heading", { name: /What can I take off your plate/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Take care of the details", exact: false })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Ask Duna anything" }),
  ).toHaveValue(/What needs my attention/);
  await page.getByRole("button", { name: "Add files or references" }).click();
  await page.getByRole("button", { name: "Reference a person" }).click();
  await page.getByRole("button", { name: "Devon Parker" }).click();
  await expect(
    page.getByRole("button", { name: "Remove Devon Parker" }),
  ).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "schedule.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Monday: two courts available"),
  });
  await expect(page.getByText("schedule.txt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Duna Medium" }).click();
  await page.getByRole("button", { name: "Ultra", exact: true }).click();
  await expect(
    page.getByRole("slider", { name: "Thinking effort" }),
  ).toHaveValue("4");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("textbox", { name: "Ask Duna anything" }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("ask-duna-light.png"),
    fullPage: true,
    style: "nextjs-portal { display: none; }",
  });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await page.screenshot({
    path: testInfo.outputPath("ask-duna-dark.png"),
    fullPage: true,
    style: "nextjs-portal { display: none; }",
  });
  expect(errors).toEqual([]);
});

test("Ask Duna resumes a thread and only executes a reviewed proposal after an explicit click", async ({
  page,
}, testInfo) => {
  const { writes } = await installAskDunaFixture(page);
  await page.goto(`${hqBaseUrl}/ask/${askConversationId}`);
  await expect(
    page.getByText("I’ve prepared the change for your review.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve change" }),
  ).toBeVisible();
  expect(writes.filter((row) => row.path.endsWith("/review"))).toHaveLength(0);
  await page.getByText("View exact change", { exact: true }).click();
  await expect(page.locator(".ask-duna-review pre").first()).toContainText(
    '"name": "Court 2"',
  );
  await page.screenshot({
    path: testInfo.outputPath("ask-duna-review.png"),
    fullPage: true,
    style: "nextjs-portal { display: none; }",
  });
  await page.getByRole("button", { name: "Approve change" }).click();
  await expect(page.getByText("Action receipt", { exact: true })).toBeVisible();
  expect(writes.filter((row) => row.path.endsWith("/review"))).toHaveLength(1);
  await page.reload();
  await expect(page.getByText("Action receipt", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Archive conversation", exact: true })
    .click();
  await expect(
    page.getByText("This conversation is archived.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Restore conversation", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Ask Duna anything" }),
  ).toBeVisible();
  await page
    .locator(".ask-duna-header")
    .getByRole("link", { name: "New conversation" })
    .click();
  await expect(
    page.getByRole("heading", { name: /What can I take off your plate/ }),
  ).toBeVisible();
});

test("Ask Duna creates a durable thread from a new message", async ({
  page,
}) => {
  const { writes } = await installAskDunaFixture(page);
  await page.goto(`${hqBaseUrl}/ask`);
  await page
    .getByRole("textbox", { name: "Ask Duna anything" })
    .fill("Add a second court for next week");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page).toHaveURL(`${hqBaseUrl}/ask/${askConversationId}`);
  await expect(
    page.getByText("Ready for your review", { exact: true }),
  ).toBeVisible();
  expect(writes.filter((row) => row.path === "conversations")).toHaveLength(1);
  expect(writes.filter((row) => row.path.endsWith("/review"))).toHaveLength(0);
});

test("Ask Duna preserves the draft when its connection fails and searches saved history", async ({
  page,
}) => {
  await installAskDunaFixture(page, { creationFails: true });
  await page.goto(`${hqBaseUrl}/ask`);
  const input = page.getByRole("textbox", { name: "Ask Duna anything" });
  await input.fill("Please keep this draft");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(input).toHaveValue("Please keep this draft");
  await expect(page.getByRole("alert").first()).toContainText(
    "could not start",
  );
  await page.goto(`${hqBaseUrl}/ask/history`);
  await page
    .getByRole("textbox", { name: "Search conversations", exact: true })
    .fill("unmatched search");
  await expect(
    page.getByText("No conversations match your search."),
  ).toBeVisible();
});

test("The real Eve endpoint rejects unsigned traffic and Ask Duna rejects cross-origin writes", async ({
  request,
}) => {
  const eve = await request.post(`${hqBaseUrl}/eve/v1/session`, {
    data: { message: "Do not run" },
  });
  expect(eve.status()).toBe(401);
  const write = await request.post(`${hqBaseUrl}/api/ask-duna/conversations`, {
    headers: { origin: "https://untrusted.example" },
    data: {},
  });
  expect([401, 403]).toContain(write.status());
});
