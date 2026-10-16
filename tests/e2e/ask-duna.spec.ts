import { expect, test } from "@playwright/test";
import { askConversationId, installAskDunaFixture } from "../ask-duna-fixture";

const hqBaseUrl =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;

test("HQ assistant deep links and launchers open the floating Ask Duna surface", async ({
  page,
}) => {
  await installAskDunaFixture(page);
  await page.goto(`${hqBaseUrl}/?duna=ask`);
  await expect(page).toHaveURL(`${hqBaseUrl}/?duna=ask`);
  await expect(
    page.getByRole("region", { name: "Floating Ask Duna" }),
  ).toBeVisible();
  await page.goto(`${hqBaseUrl}/members`);
  await page.getByRole("button", { name: "Minimize Ask Duna" }).click();
  if ((page.viewportSize()?.width ?? 1440) > 1100) {
    await page.getByRole("button", { name: "Duna AI", exact: true }).click();
  } else {
    await page.keyboard.press("Control+j");
  }
  await expect(page).toHaveURL(`${hqBaseUrl}/members`);
  await expect(
    page.getByRole("region", { name: "Floating Ask Duna" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Ask Duna anything" }),
  ).toBeFocused();
  await expect(
    page.getByRole("region", { name: "Duna AI assistant" }),
  ).toHaveCount(0);
});

test("Floating Ask Duna keeps drafts, files and reviewed conversations across HQ pages", async ({
  page,
}, testInfo) => {
  const { writes, turns } = await installAskDunaFixture(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${hqBaseUrl}/members`);
  const floating = page.getByRole("region", { name: "Floating Ask Duna" });
  const input = floating.getByRole("textbox", { name: "Ask Duna anything" });
  await expect(floating).toBeVisible();
  await input.fill("Help plan next week");
  await floating.locator('input[type="file"]').setInputFiles({
    name: "courts.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Two courts available"),
  });
  await page
    .getByRole("link", { name: "Schedule", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(`${hqBaseUrl}/calendar`);
  await expect(input).toHaveValue("Help plan next week");
  await expect(floating.getByText("courts.txt", { exact: true })).toBeVisible();
  await expect(floating.locator(".ask-duna-context")).toContainText("Schedule");
  await page.screenshot({
    path: testInfo.outputPath("floating-ask-duna.png"),
    style: "nextjs-portal { display: none; }",
  });
  const box = await floating.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(box!.y + box!.height).toBeLessThan(page.viewportSize()!.height);
  await floating.getByRole("button", { name: "Send message" }).click();
  await expect(
    floating.getByText("Ready for your review", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(`${hqBaseUrl}/calendar`);
  expect(writes.filter((row) => row.path === "conversations")).toHaveLength(1);
  expect(writes.find((row) => row.path === "conversations")?.body.page).toBe(
    "/calendar",
  );
  expect(writes.filter((row) => row.path.endsWith("/review"))).toHaveLength(0);
  await floating.getByRole("button", { name: "Minimize Ask Duna" }).click();
  await expect(floating).toBeHidden();
  await page.getByRole("link", { name: "People", exact: true }).first().click();
  await expect(page).toHaveURL(`${hqBaseUrl}/members`);
  await page
    .getByRole("button", { name: "Open Ask Duna", exact: true })
    .click();
  await expect(input).toBeEnabled();
  await input.fill("Use the people on this page");
  await floating.getByRole("button", { name: "Send message" }).click();
  await expect
    .poll(() =>
      turns.some((turn) =>
        JSON.stringify(turn.message).includes("Current Duna page: /members"),
      ),
    )
    .toBe(true);
  await floating.getByRole("button", { name: "Approve change" }).click();
  await expect(
    floating.getByText("Action receipt", { exact: true }),
  ).toBeVisible();
  expect(writes.filter((row) => row.path.endsWith("/review"))).toHaveLength(1);
  await floating.getByRole("link", { name: "Expand conversation" }).click();
  await expect(page).toHaveURL(`${hqBaseUrl}/ask/${askConversationId}`);
  await expect(floating).toBeHidden();
  await expect(
    page.locator(".hq-shell--ask").getByText("Action receipt", { exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(floating).toBeVisible();
  await expect(
    floating.getByText("Action receipt", { exact: true }),
  ).toBeVisible();
  expect(writes.filter((row) => row.path === "conversations")).toHaveLength(1);
  await expect(input).toBeEnabled();
  await page
    .getByRole("button", {
      name: "Color theme: Match device. Activate for Light.",
    })
    .click();
  await page
    .getByRole("button", { name: "Color theme: Light. Activate for Dark." })
    .click();
  await expect(floating).toHaveCSS("background-color", "rgb(34, 34, 34)");
  await page.screenshot({
    path: testInfo.outputPath("floating-ask-duna-thread-dark.png"),
    style: "nextjs-portal { display: none; }",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("Floating Ask Duna respects protected pages and its menus dismiss accessibly", async ({
  page,
}) => {
  await installAskDunaFixture(page);
  await page.goto(`${hqBaseUrl}/members`);
  const floating = page.getByRole("region", { name: "Floating Ask Duna" });
  await expect(floating).toBeVisible();
  await expect(floating.locator(".ask-duna-context")).toContainText("People");
  await floating.getByRole("button", { name: "Duna Medium" }).click();
  await page.keyboard.press("Escape");
  await expect(floating.getByRole("dialog")).toHaveCount(0);
  await expect(
    floating.getByRole("textbox", { name: "Ask Duna anything" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(floating).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Open Ask Duna", exact: true }),
  ).toBeFocused();
  if ((page.viewportSize()?.width ?? 1440) > 1100) {
    await page
      .getByRole("link", { name: "Open Duna Admin", exact: true })
      .click();
  } else await page.goto(`${hqBaseUrl}/admin`);
  await expect(
    page.getByRole("heading", {
      name: "Platform administration access required.",
    }),
  ).toBeVisible();
  await expect(floating).toBeHidden();
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
  await page.locator('input[type="file"]').setInputFiles([
    {
      name: "one.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.alloc(1_400_000),
    },
    {
      name: "two.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.alloc(1_400_000),
    },
  ]);
  await expect(page.locator(".ask-duna-dock").getByRole("alert")).toContainText(
    "combined file size under 2.5 MB",
  );
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
  const { writes, turns } = await installAskDunaFixture(page);
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
  await expect
    .poll(() => turns)
    .toEqual([
      expect.objectContaining({
        message: expect.stringContaining("I approved proposal"),
      }),
    ]);
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
  await expect(
    page.getByRole("region", { name: "Floating Ask Duna" }),
  ).toBeVisible();
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
