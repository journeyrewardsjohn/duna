import { expect, test } from "@playwright/test";

const hqBaseUrl =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;

test("HQ Home hands a task to the governed assistant without approving it", async ({
  page,
}, testInfo) => {
  const requests: {
    mode: string;
    message?: string;
    attachments?: unknown[];
    surface?: string;
  }[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/duna-ai", async (route) => {
    const request = route.request().postDataJSON();
    requests.push(request);
    await route.fulfill({
      json:
        request.mode === "ask"
          ? {
              reply: "Here is the draft for your review.",
              cards: [
                {
                  kind: "approval",
                  title: "Review event draft",
                  detail: "Nothing has been published.",
                  changes: ["Create the proposed event"],
                  draft: {
                    id: "review-only",
                    riskTier: "confirm-always",
                    confirmationNonce: "test-only",
                  },
                },
              ],
            }
          : { suggestions: [] },
    });
  });
  await page.goto(hqBaseUrl);
  await expect(
    page.getByRole("heading", { name: "What would you like to get done?" }),
  ).toBeVisible();
  await expect(page.locator(".hq-shell--focused")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.screenshot({
    path: testInfo.outputPath("hq-home.png"),
    style: "nextjs-portal { display: none; }",
  });

  const input = page.getByRole("textbox", {
    name: "What would you like Duna to do?",
  });
  await page
    .getByRole("button", { name: "Plan an event", exact: true })
    .click();
  await expect(input).toHaveValue(
    "Help me plan a new event. Ask me what you need before preparing a draft.",
  );
  expect(requests).toHaveLength(0);
  await input.fill("Prepare a draft clinic for next week.");
  await input.press("Enter");
  const assistant = page.getByRole("region", { name: "Duna AI assistant" });
  await expect(assistant).toBeVisible();
  await expect(
    assistant.getByRole("textbox", { name: "Ask Duna AI a question" }),
  ).toBeFocused();
  await expect(
    assistant.getByRole("button", { name: "Approve changes" }),
  ).toBeVisible();
  await expect(
    assistant.getByText("Nothing has been published."),
  ).toBeVisible();
  expect(requests.filter((request) => request.mode === "ask")).toEqual([
    expect.objectContaining({
      message: "Prepare a draft clinic for next week.",
      surface: "hq",
      attachments: [],
    }),
  ]);
  expect(requests.filter((request) => request.mode === "confirm")).toHaveLength(
    0,
  );
  await page.screenshot({
    path: testInfo.outputPath("hq-ai-review.png"),
    style: "nextjs-portal { display: none; }",
  });
  await assistant.getByRole("button", { name: "Close Duna AI" }).click();

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
  expect(errors).toEqual([]);
});

test("HQ page tasks retain context and secondary navigation stays reachable", async ({
  page,
}) => {
  let sent: { page?: string; message?: string } | undefined;
  await page.route("**/api/duna-ai", async (route) => {
    const body = route.request().postDataJSON();
    if (body.mode === "ask") sent = body;
    await route.fulfill({
      json: { reply: "Duna is unavailable. Nothing changed." },
    });
  });
  await page.goto(`${hqBaseUrl}/members`);
  const prompt = page.getByRole("textbox", { name: "Ask Duna about people" });
  await prompt.fill("Find the people who need a follow-up.");
  await prompt.press("Enter");
  const assistant = page.getByRole("region", { name: "Duna AI assistant" });
  await expect(
    assistant.getByText("Duna is unavailable. Nothing changed."),
  ).toBeVisible();
  expect(sent).toMatchObject({
    page: "/members",
    message: "Find the people who need a follow-up.",
  });
  await assistant.getByRole("button", { name: "Close Duna AI" }).click();
  const more = page.locator(".hq-work-navigation-more");
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
