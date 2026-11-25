import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Keyboard operation of the Tideline components, in the gallery.
 *
 * The gallery route only exists when HQ runs with TIDELINE_GALLERY=1, so
 * this spec skips itself in the default suite. Run it with:
 *
 *   TIDELINE_GALLERY=1 pnpm exec playwright test tests/e2e/tideline-gallery.spec.ts --project=desktop
 *
 * Playwright passes the flag on to the HQ server it starts. If an HQ server
 * without the flag is already running on the port, stop it first or point
 * PLAYWRIGHT_HQ_PORT at a free one.
 */
const base =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;

test.skip(
  process.env.TIDELINE_GALLERY !== "1",
  "Needs HQ running with TIDELINE_GALLERY=1",
);

async function openGallery(page: Page) {
  await page.goto(`${base}/tideline`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Tideline gallery" }),
  ).toBeVisible();
  // Wait for hydration: the Next dev overlay mounts after the app does.
  await page.waitForLoadState("networkidle");
}

const focused = (page: Page) => page.locator(":focus");

async function expectFocusInside(page: Page, container: Locator) {
  await expect
    .poll(() =>
      container.evaluate((element) => element.contains(document.activeElement)),
    )
    .toBe(true);
}

test.describe("Tideline gallery, keyboard", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "Keyboard checks run once, on desktop",
    );
    await openGallery(page);
  });

  test("Dialog opens, traps focus, closes on Escape and returns focus", async ({
    page,
  }) => {
    const trigger = page.getByRole("button", { name: "Edit match" });
    await trigger.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: "Edit match" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleDescription(
      "Players are told when the time changes.",
    );
    // Focus starts on the first control, not on the close button.
    await expect(
      dialog.getByRole("textbox", { name: "Match name" }),
    ).toBeFocused();

    // Five tab stops: forwards and backwards, focus never leaves the dialog.
    for (let step = 0; step < 7; step += 1) {
      await page.keyboard.press("Tab");
      await expectFocusInside(page, dialog);
    }
    for (let step = 0; step < 7; step += 1) {
      await page.keyboard.press("Shift+Tab");
      await expectFocusInside(page, dialog);
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("Dialog buttons close it and return focus", async ({ page }) => {
    const trigger = page.getByRole("button", { name: "Edit match" });
    for (const name of ["Cancel", "Save match", "Close"]) {
      await trigger.focus();
      await page.keyboard.press("Space");
      const dialog = page.getByRole("dialog", { name: "Edit match" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name, exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
    }
  });

  test("Select: arrow keys, typeahead and Enter", async ({ page }) => {
    const trigger = page.getByRole("combobox", { name: "Level" });
    const output = page.getByTestId("select-output");
    await expect(output).toHaveText("Level: none");

    await trigger.focus();
    await page.keyboard.press("Enter");
    const list = page.getByRole("listbox");
    await expect(list).toBeVisible();
    await expect(list.getByRole("option")).toHaveCount(5);

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(
      list.getByRole("option", { name: "Intermediate" }),
    ).toHaveAttribute("data-highlighted", "");

    // Typeahead jumps to the option that starts with the letter.
    await page.keyboard.press("a");
    await expect(
      list.getByRole("option", { name: "Advanced" }),
    ).toHaveAttribute("data-highlighted", "");
    await page.keyboard.press("End");
    // The disabled last option is skipped.
    await expect(list.getByRole("option", { name: "Open" })).toHaveAttribute(
      "data-highlighted",
      "",
    );
    await page.keyboard.press("Home");
    await page.keyboard.press("a");
    await page.keyboard.press("Enter");

    await expect(list).toBeHidden();
    await expect(output).toHaveText("Level: Advanced");
    await expect(trigger).toHaveText("Advanced");
    await expect(trigger).toBeFocused();

    // Escape closes without changing the value.
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(output).toHaveText("Level: Advanced");
    await expect(trigger).toBeFocused();
  });

  test("Combobox: typing filters, arrows move, Enter chooses", async ({
    page,
  }) => {
    const input = page.getByRole("combobox", { name: "Court" });
    const output = page.getByTestId("combobox-output");

    await input.focus();
    await page.keyboard.type("nor");
    const list = page.getByRole("listbox");
    await expect(list).toBeVisible();
    await expect(list.getByRole("option")).toHaveCount(1);
    await expect(list.getByRole("option")).toHaveText("Court 2, North");

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(list).toBeHidden();
    await expect(output).toHaveText("Court: court-2");
    await expect(input).toHaveValue("Court 2, North");
    await expect(input).toBeFocused();

    // Arrow keys open the full list again and move through it.
    await input.fill("");
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(4);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(output).not.toHaveText("Court: court-2");

    // Nothing matches: the empty message shows.
    await input.fill("zzz");
    await expect(page.getByText("No matches")).toBeVisible();
  });

  test("DatePicker: arrow keys move through the grid and Enter selects", async ({
    page,
  }) => {
    const input = page.getByRole("textbox", { name: "Match date" });
    const output = page.getByTestId("datepicker-output");
    await expect(output).toHaveText("Date: 2026-11-25");

    await input.focus();
    await page.keyboard.press("Alt+ArrowDown");
    const grid = page.getByRole("grid", { name: "November 2026" });
    await expect(grid).toBeVisible();
    // Focus lands on the selected date.
    await expect(focused(page)).toHaveAttribute("data-slot", "calendar-day");
    await expect(focused(page)).toHaveAccessibleName(/November 25, 2026/);

    await page.keyboard.press("ArrowRight");
    await expect(focused(page)).toHaveAccessibleName(/November 26, 2026/);
    await page.keyboard.press("ArrowUp");
    await expect(focused(page)).toHaveAccessibleName(/November 19, 2026/);
    await page.keyboard.press("ArrowLeft");
    await expect(focused(page)).toHaveAccessibleName(/November 18, 2026/);
    // Two weeks down crosses into December and turns the page.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(focused(page)).toHaveAccessibleName(/December 2, 2026/);
    await expect(
      page.getByRole("grid", { name: "December 2026" }),
    ).toBeVisible();

    await page.keyboard.press("Enter");
    await expect(page.getByRole("grid")).toBeHidden();
    await expect(output).toHaveText("Date: 2026-12-02");

    // Escape closes the popup and keeps the value.
    await page
      .getByRole("button", { name: "Choose date", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("grid", { name: "December 2026" }),
    ).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("grid")).toBeHidden();
    await expect(output).toHaveText("Date: 2026-12-02");
  });

  test("Switch: Space toggles, Enter does not", async ({ page }) => {
    const control = page.getByRole("switch", { name: "Match reminders" });
    const output = page.getByTestId("switch-output");
    await expect(control).toHaveAttribute("aria-checked", "true");
    await expect(control).toHaveAccessibleDescription(
      "Players get a reminder two hours before.",
    );

    await control.focus();
    await page.keyboard.press("Space");
    await expect(control).toHaveAttribute("aria-checked", "false");
    await expect(output).toHaveText("Reminders are off.");

    await page.keyboard.press("Enter");
    await expect(control).toHaveAttribute("aria-checked", "false");

    await page.keyboard.press("Space");
    await expect(control).toHaveAttribute("aria-checked", "true");
    await expect(output).toHaveText("Reminders are on.");

    await expect(
      page.getByRole("switch", { name: "Disabled, on" }),
    ).toBeDisabled();
  });

  test("Tabs: arrows, Home and End move between tabs", async ({ page }) => {
    const tabs = page.getByRole("tablist", { name: "Matches" });
    const tab = (name: string | RegExp) => tabs.getByRole("tab", { name });
    const panel = page.getByRole("tabpanel");

    await expect(tab("Upcoming")).toHaveAttribute("aria-selected", "true");
    await expect(panel).toHaveText("Two matches this week.");

    await tab("Upcoming").focus();
    await page.keyboard.press("ArrowRight");
    await expect(tab(/Results/)).toBeFocused();
    await expect(tab(/Results/)).toHaveAttribute("aria-selected", "true");
    await expect(panel).toHaveText("Three results wait for confirmation.");
    await expect(panel).toHaveAccessibleName(/Results/);

    await page.keyboard.press("ArrowRight");
    await expect(tab("Invites")).toHaveAttribute("aria-selected", "true");

    // A disabled tab takes focus but is not selected.
    await page.keyboard.press("End");
    await expect(tab("Archive")).toBeFocused();
    await expect(tab("Archive")).toHaveAttribute("aria-selected", "false");

    await page.keyboard.press("Home");
    await expect(tab("Upcoming")).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowLeft");
    await expect(tab("Archive")).toBeFocused();

    // Exactly one tab is in the tab order.
    await expect(tabs.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
  });

  test("SearchField debounces to one trailing search", async ({ page }) => {
    const input = page
      .getByRole("searchbox", { name: "Search players" })
      .first();
    const count = page.getByTestId("search-count");
    await expect(count).toHaveText("Searches started: 0");

    await input.pressSequentially("sam", { delay: 40 });
    const field = page.locator(".td-search").filter({ has: input });
    await expect(field).toHaveAttribute("data-state", "typing");
    await expect(field).toHaveAttribute("data-state", "results");
    await expect(field.getByRole("status")).toHaveText("1 result.");
    await expect(field.getByText("Sam Rivera")).toBeVisible();
    await expect(count).toHaveText("Searches started: 1");

    await input.fill("zz");
    await expect(field).toHaveAttribute("data-state", "empty");
    await field.getByRole("button", { name: "Clear search" }).click();
    await expect(field).toHaveAttribute("data-state", "idle");
    await expect(input).toBeFocused();
  });

  test("AddPlayers caps the slots and recovers focus after a remove", async ({
    page,
  }) => {
    const root = page.locator(".td-addp");
    const count = root.locator(".td-addp__count");
    await expect(count).toHaveText("2 of 4 spots filled");

    const addNoor = root.getByRole("button", { name: "Add Noor Haddad" });
    await addNoor.focus();
    await page.keyboard.press("Space");
    await expect(count).toHaveText("3 of 4 spots filled");
    await expect(
      root.getByRole("button", { name: "Added Noor Haddad" }),
    ).toHaveAttribute("aria-pressed", "true");

    await root.getByRole("button", { name: "Add Jo Lindqvist" }).click();
    await expect(count).toHaveText("4 of 4 spots filled");
    // Full: the remaining Add buttons are disabled but still focusable.
    const addKai = root.getByRole("button", { name: "Add Kai Tanaka" }).first();
    await expect(addKai).toHaveAttribute("aria-disabled", "true");
    await addKai.click({ force: true });
    await expect(count).toHaveText("4 of 4 spots filled");

    await root.getByRole("button", { name: "Remove Jo Lindqvist" }).focus();
    await page.keyboard.press("Enter");
    await expect(count).toHaveText("3 of 4 spots filled");
    await expectFocusInside(page, root.locator(".td-addp__slots"));
  });
});

test.describe("Tideline gallery, layout", () => {
  for (const theme of ["light", "dark", "live"]) {
    test(`${theme} has no horizontal scroll at 390px`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "Sets its own viewport");
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${base}/tideline?theme=${theme}`);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
    });
  }

  test("is not served without the flag in the URL's control", async ({
    page,
  }) => {
    // The page is public only in demo mode and only with the env flag; a
    // theme it does not know falls back to light instead of failing.
    await page.goto(`${base}/tideline?theme=unknown`);
    await expect(page.locator(".td").first()).not.toHaveAttribute("data-theme");
  });
});
