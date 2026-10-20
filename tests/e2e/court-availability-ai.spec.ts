import { expect, test } from "@playwright/test";
import { installAskDunaFixture } from "../ask-duna-fixture";

const hq =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;
const venueId = "10000000-0000-4000-8000-000000000101";
const courtId = "10000000-0000-4000-8000-000000000103";

test("court availability hands natural language and the selected court to Ask Duna", async ({
  page,
}, testInfo) => {
  const { writes, turns } = await installAskDunaFixture(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${hq}/locations/${venueId}/courts/${courtId}`);
  await page.getByRole("button", { name: "Minimize Ask Duna" }).click();
  await page.getByRole("button", { name: "Availability", exact: true }).click();
  const mondayBefore = await page.getByLabel("Monday start time").inputValue();
  const request = "Block Monday to Friday 9 am to noon for morning sessions";
  const input = page.getByRole("textbox", {
    name: "Describe the court availability change",
  });
  await expect(input).toBeVisible();
  const ask = page.getByRole("button", { name: "Ask Duna to update hours" });
  await expect(ask).toBeDisabled();
  await input.fill(request);
  await ask.click();
  await expect(
    page.getByRole("button", { name: "Approve change" }),
  ).toBeVisible();
  expect(writes.find((row) => row.path === "conversations")?.body.page).toBe(
    `/locations/${venueId}/courts/${courtId}`,
  );
  expect(JSON.stringify(turns)).toContain(request);
  expect(JSON.stringify(turns)).toContain("Championship Court");
  expect(JSON.stringify(turns)).toContain("America/Los_Angeles");
  expect(writes.filter((row) => row.path.endsWith("/review"))).toHaveLength(0);
  await page.getByRole("button", { name: "Minimize Ask Duna" }).click();
  await expect(page.getByLabel("Monday start time")).toHaveValue(mondayBefore);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await input.scrollIntoViewIfNeeded();
  await input.fill(request);
  await page.screenshot({
    path: testInfo.outputPath("court-availability-ai.png"),
  });
  await page.getByRole("button", { name: /Color theme:/ }).click();
  await page.getByRole("button", { name: /Color theme:/ }).click();
  await expect(input).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("court-availability-ai-dark.png"),
  });
});

test("unsaved manual hours stay protected before an AI request", async ({
  page,
}) => {
  await installAskDunaFixture(page);
  await page.goto(`${hq}/locations/${venueId}/courts/${courtId}`);
  await page.getByRole("button", { name: "Minimize Ask Duna" }).click();
  await page.getByRole("button", { name: "Availability", exact: true }).click();
  await page.getByLabel("Monday start time").fill("10:00");
  await page
    .getByRole("textbox", { name: "Describe the court availability change" })
    .fill("Block weekdays 9 am to noon.");
  await expect(
    page.getByRole("button", { name: "Ask Duna to update hours" }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      "Save your manual changes before asking Duna to update hours.",
    ),
  ).toBeVisible();
});
