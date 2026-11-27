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

    // Opening highlights the first option; one step down is the second.
    await expect(
      list.getByRole("option", { name: "Beginner" }),
    ).toHaveAttribute("data-highlighted");
    await page.keyboard.press("ArrowDown");
    await expect(
      list.getByRole("option", { name: "Intermediate" }),
    ).toHaveAttribute("data-highlighted");

    // Typeahead jumps to the option that starts with the letter.
    await page.keyboard.press("a");
    await expect(
      list.getByRole("option", { name: "Advanced" }),
    ).toHaveAttribute("data-highlighted");
    await page.keyboard.press("End");
    // The disabled last option is skipped.
    await expect(list.getByRole("option", { name: "Open" })).toHaveAttribute(
      "data-highlighted",
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

    // Nothing matches: the empty message shows, and Escape restores the label.
    await input.fill("zzz");
    await expect(page.getByText("No matches", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText("No matches", { exact: true })).toBeHidden();
    await expect(output).toHaveText("Court: court-2");
  });

  test("DatePicker: arrow keys move through the grid and Enter selects", async ({
    page,
  }) => {
    const input = page.getByRole("textbox", { name: "Match date" });
    const output = page.getByTestId("datepicker-output");
    const popup = page.getByRole("dialog", { name: "Choose date" });
    await expect(output).toHaveText("Date: 2026-11-25");

    await input.focus();
    await page.keyboard.press("Alt+ArrowDown");
    await expect(
      popup.getByRole("grid", { name: "November 2026" }),
    ).toBeVisible();
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
      popup.getByRole("grid", { name: "December 2026" }),
    ).toBeVisible();

    await page.keyboard.press("Enter");
    await expect(popup).toBeHidden();
    await expect(output).toHaveText("Date: 2026-12-02");

    // Escape closes the popup and keeps the value.
    await page
      .getByRole("button", { name: "Choose date", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(
      popup.getByRole("grid", { name: "December 2026" }),
    ).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Escape");
    await expect(popup).toBeHidden();
    await expect(output).toHaveText("Date: 2026-12-02");
  });

  test("Switch: Space toggles, Enter does not", async ({ page }) => {
    const section = page.locator("section#controls");
    const control = section.getByRole("switch", { name: "Match reminders" });
    const output = section.getByTestId("switch-output");
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
      section.getByRole("switch", { name: "Disabled, on" }),
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

  test("Search: one debounced request, cancelled when the text changes", async ({
    page,
  }) => {
    const lab = page.locator("section#interactions");
    const field = lab.locator(".td-search").first();
    const input = field.getByRole("searchbox", { name: "Search players" });
    const count = lab.getByTestId("search-count");
    await expect(count).toHaveText("Requests sent: 0 · cancelled: 0");

    // Three quick keystrokes become one request; loaded players show at once.
    await input.pressSequentially("sam", { delay: 30 });
    await expect(field.getByText("Sam Rivera")).toBeVisible();
    await expect(field).toHaveAttribute("data-state", "success");
    await expect(count).toHaveText("Requests sent: 1 · cancelled: 0");
    await expect(field.getByRole("status")).toHaveText("1 result.");

    // Typing again while a request is in flight aborts it; the list stays.
    await input.fill("no");
    await expect(count).toHaveText("Requests sent: 2 · cancelled: 0");
    await input.pressSequentially("o");
    await expect(count).toHaveText(/cancelled: 1/);
    await expect(field.locator(".td-listrow").first()).toBeVisible();
    await expect(field).toHaveAttribute("data-state", "success");
    await expect(field.getByText("Noor Haddad")).toBeVisible();

    // Enter searches at once; clearing goes back to idle and keeps focus.
    await input.fill("zz");
    await page.keyboard.press("Enter");
    await expect(field).toHaveAttribute("data-state", "empty");
    await field.getByRole("button", { name: "Clear search" }).click();
    await expect(field).toHaveAttribute("data-state", "idle");
    await expect(input).toBeFocused();
  });

  test("Loaders wait 250ms, so fast work shows none", async ({ page }) => {
    const lab = page.locator("section#interactions");
    const shown = lab.getByTestId("loader-shown");
    const refresh = lab.getByRole("button", { name: "Refresh list" });

    await lab.getByRole("radio", { name: "150ms" }).click();
    await refresh.click();
    const seen = await page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          const element = document.querySelector(
            '[data-testid="loader-shown"]',
          );
          let showed = false;
          const timer = setInterval(() => {
            if (element?.textContent?.includes("showing")) showed = true;
          }, 16);
          setTimeout(() => {
            clearInterval(timer);
            resolve(showed);
          }, 700);
        }),
    );
    expect(seen).toBe(false);

    await lab.getByRole("radio", { name: "600ms" }).click();
    await refresh.click();
    await expect(shown).toHaveText("Loader: showing");
    await expect(lab.getByText("Loading players")).toBeAttached();
    await expect(shown).toHaveText("Loader: hidden");
  });

  test("A loading button keeps its width and ignores a second press", async ({
    page,
  }) => {
    const lab = page.locator("section#interactions");
    const save = lab.getByRole("button", { name: "Save result" });
    const width = (await save.boundingBox())!.width;
    await save.click();
    await save.click({ force: true });
    await expect(save).toHaveAttribute("aria-busy", "true");
    await expect
      .poll(async () => (await save.boundingBox())!.width)
      .toBe(width);
    await expect(lab.getByTestId("save-count")).toHaveText("Saved 1 time");
    await expect(save).not.toHaveAttribute("aria-busy", "true");
    await page.waitForTimeout(700);
    await expect(lab.getByTestId("save-count")).toHaveText("Saved 1 time");
  });

  test("Optimistic changes apply at once, undo, and roll back on failure", async ({
    page,
  }) => {
    const lab = page.locator("section#interactions");
    const root = lab.locator(".td-addp");
    const count = root.locator(".td-addp__count");
    await lab.getByRole("radio", { name: "2s" }).click();

    // The slot fills before the two-second save finishes.
    await root.getByRole("button", { name: "Add Noor Haddad" }).click();
    await expect(count).toHaveText("3 of 4 spots filled", { timeout: 500 });
    await expect(
      root.getByRole("button", { name: "Added Noor Haddad" }),
    ).toHaveAttribute("aria-pressed", "true");

    // Once saved, the toast offers Undo.
    const saved = page
      .locator(".td-toast")
      .filter({ hasText: "Noor Haddad added" });
    await expect(saved).toBeVisible();
    await saved.getByRole("button", { name: "Undo" }).click();
    await expect(count).toHaveText("2 of 4 spots filled");

    // A failed save puts the switch back and says so.
    await lab.getByRole("radio", { name: "150ms" }).click();
    await lab.getByRole("switch", { name: "Fail next request" }).click();
    const reminders = lab.getByRole("switch", { name: "Match reminders" });
    await reminders.click();
    await expect(lab.getByTestId("optimistic-switch")).toHaveText(
      "Reminders are on.",
    );
    await expect(lab.getByTestId("optimistic-switch")).toHaveText(
      "Reminders are off.",
    );
    await expect(reminders).toHaveAttribute("aria-checked", "false");
    await expect(
      page.getByText("Could not turn reminders on. Put back."),
    ).toBeVisible();
  });

  test("AddPlayers caps the slots and recovers focus after a remove", async ({
    page,
  }) => {
    const lab = page.locator("section#interactions");
    await lab.getByRole("radio", { name: "0ms", exact: true }).click();
    const root = lab.locator(".td-addp");
    const count = root.locator(".td-addp__count");
    await expect(count).toHaveText("2 of 4 spots filled");

    await root.getByRole("button", { name: "Add Noor Haddad" }).focus();
    await page.keyboard.press("Space");
    await expect(count).toHaveText("3 of 4 spots filled");
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

  test("Command palette opens with Ctrl or Cmd K, runs a command, returns focus", async ({
    page,
  }) => {
    const lab = page.locator("section#interactions");
    await lab.getByRole("radio", { name: "0ms", exact: true }).click();
    const trigger = lab.getByRole("button", {
      name: /Search or run a command/,
    });
    await trigger.focus();
    await page.keyboard.press("ControlOrMeta+k");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();
    await expect(palette.getByRole("combobox")).toBeFocused();

    await page.keyboard.type("book");
    await expect(palette.getByRole("option")).toHaveCount(1);
    await page.keyboard.press("Enter");
    await expect(palette).toBeHidden();
    await expect(lab.getByTestId("command-output")).toHaveText(
      "Last command: book-court",
    );
    await expect(trigger).toBeFocused();

    await page.keyboard.press("ControlOrMeta+k");
    await expect(palette).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
    await expect(trigger).toBeFocused();
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

test.describe("Tideline gallery, Book a lesson", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Runs once, on desktop");
    await page.goto(`${base}/tideline/book-lesson`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Book a lesson." }),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.getByRole("radio", { name: "0ms", exact: true }).click();
  });

  test("books a lesson with the keyboard only", async ({ page }) => {
    const summary = page.getByRole("complementary", { name: "Summary" });
    const action = summary.getByRole("button", { name: "Continue" });
    const formats = page.getByRole("radiogroup", { name: "Choose a format." });
    const coaches = page.getByRole("radiogroup", {
      name: "Choose your coach.",
    });
    const days = page.getByRole("radiogroup", { name: "Pick a day." });

    // Nothing chosen yet: the action is disabled and says why.
    await expect(action).toHaveAttribute("aria-disabled", "true");
    await expect(action).toHaveAccessibleDescription(
      "Choose a time to continue.",
    );
    await expect(summary).toContainText("$250.00");

    // A booked session stays visible and cannot be chosen.
    await expect(page.getByRole("radio", { name: /Booked/ })).toHaveCount(1);
    await expect(page.getByRole("radio", { name: /Booked/ })).toBeDisabled();

    // Format: arrow keys move and select; the price follows at once.
    await formats.getByRole("radio", { name: /Private/ }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(formats.getByRole("radio", { name: /^Group/ })).toBeChecked();
    await expect(summary).toContainText("Group lesson");
    await expect(summary).toContainText("$200.00");
    await page.keyboard.press("ArrowLeft");
    await expect(summary).toContainText("$250.00");

    // Add-on off: the total drops.
    await summary.getByRole("switch", { name: /Add club membership/ }).focus();
    await page.keyboard.press("Space");
    await expect(summary).toContainText("$150.00");
    await expect(summary).not.toContainText("$250.00");

    // Coach: choosing one filters the day's sessions.
    await coaches.getByRole("radio", { name: /Any coach/ }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(
      coaches.getByRole("radio", { name: /Coach Rowan/ }),
    ).toBeChecked();
    const slots = page.getByRole("radiogroup", { name: /\./ }).last();
    await expect(slots.getByRole("radio", { name: /Coach Imani/ })).toHaveCount(
      0,
    );
    await page.keyboard.press("ArrowUp");
    await expect(
      coaches.getByRole("radio", { name: /Any coach/ }),
    ).toBeChecked();

    // Day: Sunday has nothing open. It takes focus and is announced, but
    // cannot be chosen; the next arrow moves on to Monday.
    await days.getByRole("radio", { name: /November 26/ }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      days.getByRole("radio", { name: /November 27/ }),
    ).toBeChecked();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    const sunday = days.getByRole("radio", { name: /November 29/ });
    await expect(sunday).toBeFocused();
    await expect(sunday).toHaveAccessibleName(/no open sessions/);
    await expect(sunday).toHaveAttribute("aria-disabled", "true");
    await expect(sunday).not.toBeChecked();
    await expect(
      days.getByRole("radio", { name: /November 28/ }),
    ).toBeChecked();
    await page.keyboard.press("ArrowRight");
    await expect(
      days.getByRole("radio", { name: /November 30/ }),
    ).toBeChecked();
    await expect(page.getByTestId("slots-heading")).toHaveText(
      "Monday, Nov 30.",
    );
    // Monday's sessions replace Saturday's once their request settles; until
    // then the page refuses Saturday's, so wait before choosing.
    await expect(page.locator('[data-loaded-day="2026-11-30"]')).toBeVisible();

    // Slot: choosing an open one enables the action.
    const open = page.getByRole("radio", { name: /3:00–4:00pm/ });
    await open.focus();
    await page.keyboard.press("Space");
    await expect(open).toBeChecked();
    await expect(summary).toContainText(
      "Mon, Nov 30 · 3:00–4:00pm · Coach Imani",
    );
    await expect(action).not.toHaveAttribute("aria-disabled", "true");

    // Changing the format to one this slot is not offered in clears it.
    await formats.getByRole("radio", { name: /Private/ }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(action).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("ArrowLeft");
    await expect(formats.getByRole("radio", { name: /Private/ })).toBeChecked();
    // Group has nothing on Monday, so the day moved to the first open one
    // (Friday) and stays there; wait for Friday's sessions to load.
    await expect(page.getByTestId("slots-heading")).toHaveText(
      "Friday, Nov 27.",
    );
    await expect(page.locator('[data-loaded-day="2026-11-27"]')).toBeVisible();
    const again = page.getByRole("radio", { name: /3:00–4:00pm/ });
    await expect(again).not.toBeChecked();
    await again.focus();
    await page.keyboard.press("Space");
    await expect(again).toBeChecked();
    await expect(action).not.toHaveAttribute("aria-disabled", "true");

    await action.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Lesson held. Next: payment.")).toBeVisible();
  });

  test("loads a day with skeleton cards and rolls back a slot that fails", async ({
    page,
  }) => {
    await page.getByRole("radio", { name: "600ms" }).click();
    await page.getByRole("radio", { name: /November 27/ }).click();
    await expect(page.getByText("Loading sessions")).toBeAttached();
    await expect(page.getByText("Loading sessions")).not.toBeAttached();
    await expect(page.getByTestId("slots-heading")).toHaveText(
      "Friday, Nov 27.",
    );

    await page.getByRole("radio", { name: "150ms" }).click();
    await page.getByRole("switch", { name: "Fail next request" }).click();
    const slot = page.getByRole("radio", { name: /3:00–4:00pm/ });
    await slot.click();
    await expect(slot).toBeChecked();
    await expect(
      page.getByText("That time was just taken. Pick another."),
    ).toBeVisible();
    await expect(slot).not.toBeChecked();
    await expect(
      page.getByRole("button", { name: "Continue" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  for (const theme of ["light", "dark", "live"]) {
    test(`the primary label is white in ${theme}, whatever the page does to links`, async ({
      page,
    }) => {
      await page.goto(`${base}/tideline?theme=${theme}`);
      await page.waitForLoadState("networkidle");
      // A hostile host page: every trick short of an inline style.
      await page.addStyleTag({
        content: `a, a:link, a:visited, html body .td a, #__next a, button,
          html body div a.td-btn { color: rgb(0, 0, 128) !important;
          -webkit-text-fill-color: rgb(0, 0, 128) !important; }`,
      });
      const white = "rgb(255, 255, 255)";
      for (const name of [
        "Primary link",
        "Save result",
        "Full width",
        "Disabled",
      ]) {
        const button = page
          .locator("section#controls .td-btn--primary")
          .filter({ hasText: name })
          .first();
        await expect(button).toHaveCSS("color", white);
        await expect(button).toHaveCSS("-webkit-text-fill-color", white);
      }
      const link = page.locator("section#controls a.td-btn--primary").first();
      await link.hover();
      await expect(link.locator(".td-btn__label")).toHaveCSS("color", white);
    });
  }
});
