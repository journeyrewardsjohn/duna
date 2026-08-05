import { expect, test } from "@playwright/test";

test("Premium plans show separate live and upload allowances", async ({
  page,
}) => {
  await page.goto("/app/settings");

  await expect(
    page.getByRole("heading", { name: "Duna Premium" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Free includes 4 uploaded-video hours each month/),
  ).toBeVisible();

  const premium = page.locator(".membership-card").filter({
    has: page.getByText("Premium", { exact: true }),
  });
  const premiumPlus = page.locator(".membership-card").filter({
    has: page.getByText("Premium+", { exact: true }),
  });

  await expect(premium.getByText("$99.00", { exact: true })).toBeVisible();
  await expect(
    premium.getByText("8 hours of uploaded video each month"),
  ).toBeVisible();
  await expect(
    premium.getByText("2 hours of live broadcasting each month"),
  ).toBeVisible();
  await expect(premiumPlus.getByText("$299.00", { exact: true })).toBeVisible();
  await expect(
    premiumPlus.getByText("8 hours of live broadcasting each month"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Monthly" }).click();
  await expect(premium.getByText("$9.99", { exact: true })).toBeVisible();
  await expect(premiumPlus.getByText("$29.99", { exact: true })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(
    dimensions.clientWidth + 2,
  );
});
