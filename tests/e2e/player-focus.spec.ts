import { expect, test } from "@playwright/test";

test("Player Home drafts a task before handing it to the existing assistant", async ({
  page,
}) => {
  const submitted: { message: string; page: string }[] = [];
  await page.route("**/api/duna-ai", async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON().mode === "ask"
    ) {
      submitted.push(route.request().postDataJSON());
      await route.fulfill({
        json: {
          reply: "Your calendar is ready to review.",
          cards: [
            {
              kind: "link",
              title: "Open your calendar",
              detail: "Review upcoming bookings",
              href: "/app/play",
            },
          ],
          suggestions: [],
        },
      });
    } else {
      await route.fulfill({ json: { suggestions: [] } });
    }
  });
  await page.goto("/app");
  const homePrompt = page.getByRole("region", {
    name: "Ask Duna",
    exact: true,
  });
  const input = homePrompt.getByRole("textbox");
  await homePrompt.getByRole("button", { name: "Plan my week" }).click();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(/What is on my calendar/);
  expect(submitted).toHaveLength(0);
  await input.fill("Show my bookings for this weekend");
  await homePrompt
    .getByRole("button", { name: "Send to Duna", exact: true })
    .click();
  const assistant = page.getByRole("region", { name: "Duna AI assistant" });
  await expect(
    assistant.getByText("Your calendar is ready to review."),
  ).toBeVisible();
  const bounds = await assistant.boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(submitted).toHaveLength(1);
  expect(submitted[0]).toMatchObject({
    message: "Show my bookings for this weekend",
    page: "/app",
  });
  await expect(
    assistant.getByRole("link", { name: /Open your calendar/ }),
  ).toHaveAttribute("href", "/app/play");
  await assistant
    .getByRole("button", { name: "Close Duna AI", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open Duna AI", exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    assistant.getByText("Your calendar is ready to review."),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(assistant).toBeHidden();
});

test("Player keeps direct actions, secondary content, and compact page help reachable", async ({
  page,
}) => {
  await page.goto("/app");
  const actions = page.getByRole("navigation", {
    name: "Player quick actions",
  });
  for (const [name, href] of [
    ["Book a court", "/app/play"],
    ["Host pickup", "/app/pickup/new"],
    ["Record a match", "/app/score"],
    ["Videos", "/app/video"],
    ["Messages", "/app/messages"],
  ]) {
    await expect(
      actions.getByRole("link", { name: new RegExp(name!) }),
    ).toHaveAttribute("href", href!);
  }
  await page.getByText("Explore your game", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Play next", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Match history", exact: true }),
  ).toBeVisible();
  await page.goto("/app/play");
  await expect(
    page.getByRole("textbox", { name: "What would you like Duna to do?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open Duna AI", exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Duna AI assistant" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth + 1,
  );
  expect(overflow).toBe(false);
});
