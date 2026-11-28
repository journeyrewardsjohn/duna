import { expect, test, type Locator, type Page } from "@playwright/test";
import { waitForHydration } from "./gallery-hydration";

/**
 * Time and conditions components (C4, C5) on the gallery page
 * /tideline/time-and-light. Like the rest of the gallery it needs HQ running
 * with TIDELINE_GALLERY=1, so the spec skips itself otherwise:
 *
 *   TIDELINE_GALLERY=1 pnpm exec playwright test tests/e2e/tideline-time-conditions.spec.ts --project=desktop
 */
const base =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;

test.skip(
  process.env.TIDELINE_GALLERY !== "1",
  "Needs HQ running with TIDELINE_GALLERY=1",
);

async function open(page: Page, width = 1280, query = "") {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${base}/tideline/time-and-light${query}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Time and light" }),
  ).toBeVisible();
  await waitForHydration(page);
}

const example = (page: Page, id: string): Locator =>
  page.locator(`[data-example="${id}"]`);

/** Every chip's content sits inside the chip with at least `pad` px each side. */
async function chipOverflow(page: Page, pad: number) {
  return page.locator(".td-tchip").evaluateAll((chips, padding) => {
    const bad: string[] = [];
    for (const chip of chips) {
      const box = chip.getBoundingClientRect();
      if (box.width === 0) continue;
      for (const part of chip.querySelectorAll(
        ".td-tchip__inner, .td-tchip__note",
      )) {
        const inner = part.getBoundingClientRect();
        const left = inner.left - box.left;
        const right = box.right - inner.right;
        if (left < padding || right < padding || inner.height > box.height) {
          bad.push(
            `${chip.textContent} (left ${left.toFixed(1)}, right ${right.toFixed(1)})`,
          );
        }
        if ((part as HTMLElement).scrollWidth > inner.width + 0.5) {
          bad.push(`${chip.textContent} overflows its own box`);
        }
      }
    }
    return bad;
  }, pad);
}

test.describe("Tideline time and conditions", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "Runs once, on desktop, at the widths it sets itself",
    );
  });

  test("every chip contains its content at the longest label, at 375 px, 320 px and 200 % zoom", async ({
    page,
  }) => {
    // 375 px is a phone; 640 px is a 1280 px window at 200 % browser zoom;
    // 320 px is the reflow floor (WCAG 1.4.10).
    for (const width of [1280, 640, 375, 320]) {
      await open(page, width);
      await expect(page.getByText("10:30 PM").first()).toBeVisible();
      expect(await chipOverflow(page, 11), `at ${width} px`).toEqual([]);
      // Nothing scrolls the page sideways.
      const sideways = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1,
      );
      expect(sideways, `horizontal scroll at ${width} px`).toBe(false);
    }
  });

  test("slot states: available, few left, full, outside hours, too dark, selected", async ({
    page,
  }) => {
    await open(page);
    const lit = example(page, "slots");
    const state = (name: RegExp) => lit.getByRole("radio", { name });
    await expect(state(/^4:00 PM/)).toHaveAttribute("data-state", "selected");
    await expect(state(/^4:00 PM/)).toBeChecked();
    await expect(state(/^3:30 PM.*1 left/)).toHaveAttribute(
      "data-state",
      "few-left",
    );
    await expect(state(/^7:00 PM.*2 left/)).toBeEnabled();
    await expect(state(/^11:00 AM.*full/)).toBeDisabled();
    await expect(state(/^11:00 AM/)).toHaveAttribute("data-state", "taken");
    await expect(state(/^9:00 AM.*already started/)).toHaveAttribute(
      "data-state",
      "outside-hours",
    );
    await expect(state(/^11:00 PM.*runs past closing/)).toBeDisabled();
    await expect(state(/^6:30 PM.*under lights/)).toBeEnabled();
    await expect(state(/^6:00 PM.*full/)).toBeDisabled();
    await expect(lit).toContainText("Starts from 4:45 PM are under lights.");

    const unlit = example(page, "slots-unlit");
    const dark = unlit.getByRole("radio", { name: /^6:30 PM.*too dark/ });
    await expect(dark).toHaveAttribute("data-state", "too-dark");
    await expect(dark).toBeDisabled();
    await expect(unlit).toContainText(
      "This court has no lights. Starts from 4:45 PM are too dark to play.",
    );

    // Daypart headings with their light.
    await expect(lit).toContainText("Golden hour");
    await expect(lit).toContainText("Evening");
  });

  test("a slot taken while the person looks changes, is never bookable, and drops the selection", async ({
    page,
  }) => {
    await open(page);
    const lit = example(page, "slots");
    const four = lit.getByRole("radio", { name: /^4:00 PM/ });
    await expect(four).toBeChecked();
    await lit
      .getByRole("button", { name: "Someone else books 4:00 PM" })
      .click();
    await expect(four).toHaveAttribute("data-state", "stale");
    await expect(four).toBeDisabled();
    await expect(four).not.toBeChecked();
    await expect(four).toHaveAccessibleName(/just taken/);
    await expect(four).toContainText("Just taken");
    await expect(lit.getByTestId("slot-value")).toHaveText(
      "Start: none · just taken: 960",
    );
    await expect(lit.getByRole("status").last()).toHaveText(
      "4:00 PM was just taken. Choose another time.",
    );
    // Arrow keys never land on it.
    await lit.getByRole("radio", { name: /^3:30 PM/ }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(lit.getByRole("radio", { name: /^4:30 PM/ })).toBeFocused();
  });

  test("keyboard: day strip, slots and durations", async ({ page }) => {
    await open(page);
    const strip = example(page, "daystrip");
    const days = strip.getByRole("radiogroup", { name: "Day" });
    const first = days.getByRole("radio").first();
    await expect(first).toHaveAccessibleName(/today, 3 games/);
    await expect(first).toHaveAttribute("aria-current", "date");
    await first.focus();
    await page.keyboard.press("ArrowRight");
    const second = days.getByRole("radio").nth(1);
    await expect(second).toBeChecked();
    await expect(second).toHaveAttribute("aria-current", "date");
    await expect(first).not.toHaveAttribute("aria-current", "date");
    // Day five has no games: focusable, announced, never chosen.
    for (let step = 0; step < 3; step += 1)
      await page.keyboard.press("ArrowRight");
    const empty = days.getByRole("radio").nth(4);
    await expect(empty).toBeFocused();
    await expect(empty).toHaveAccessibleName(/no games/);
    await expect(empty).not.toBeChecked();
    await expect(empty).toContainText("—");
    // The month boundary is labelled.
    await expect(strip.locator("[data-month-start]")).toHaveCount(2);
    await expect(strip.locator("[data-month-start]").nth(1)).toContainText(
      "Dec",
    );
    // The ninth day is outside the booking window: skipped.
    await expect(days.getByRole("radio").nth(8)).toBeDisabled();

    const durations = example(page, "duration").getByRole("radiogroup", {
      name: "Booking length",
      exact: true,
    });
    await durations.getByRole("radio", { name: /^90 min/ }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(durations.getByRole("radio", { name: /^2 h/ })).toBeChecked();
    await page.keyboard.press("ArrowRight");
    await expect(
      durations.getByRole("radio", { name: /^3 h, Enabled by this club/ }),
    ).toBeChecked();
    await expect(
      example(page, "duration").getByTestId("duration-value"),
    ).toHaveText("Length: 180");
    await expect(
      example(page, "duration").getByRole("radio", {
        name: /^2 h, Full session, no times left/,
      }),
    ).toBeDisabled();

    const dayparts = example(page, "dayparts");
    const morning = dayparts.getByRole("button", { name: /^Morning/ });
    await morning.focus();
    await page.keyboard.press("Space");
    await expect(morning).toHaveAttribute("aria-pressed", "true");
  });

  test("time zones and daylight-saving days", async ({ page }) => {
    await open(page);
    await expect(
      example(page, "slots-longest").getByText("Times in PST"),
    ).toBeVisible();
    // Same zone as the venue: no note.
    await expect(example(page, "slots").getByText(/Times in/)).toHaveCount(0);
    const dst = example(page, "slots-dst");
    await expect(dst).toContainText(
      "Clocks go forward an hour at 2:00 AM on this day.",
    );
    await expect(dst).toContainText(
      "Clocks go back an hour at 2:00 AM on this day.",
    );
    // 23- and 25-hour days still read on the club's clock.
    await expect(
      dst.getByRole("radio", { name: /^5:00 PM/ }).first(),
    ).toBeVisible();
    await expect(example(page, "rail-dst")).toContainText("Clocks go back 1 h");
    const rail = example(page, "rail");
    await expect(rail).toContainText("Now 3:10 PM");
    await expect(rail).toContainText("Sunset4:45 PM");
    await expect(
      rail.getByRole("button", { name: /^Free/ }).first(),
    ).toBeVisible();
  });

  test("ConditionsLine stays on one line at 375 px", async ({ page }) => {
    await open(page, 375);
    const lines = page.locator(
      '[data-testid="condline-case"] .td-condline, [data-example="schedule"] .td-condline',
    );
    const count = await lines.count();
    expect(count).toBeGreaterThan(8);
    const report = await lines.evaluateAll((elements) =>
      elements.map((element) => {
        const parts = element.querySelector(".td-condline__parts");
        return {
          text: element.textContent,
          height: element.getBoundingClientRect().height,
          overflow: parts ? parts.scrollWidth > parts.clientWidth + 1 : false,
        };
      }),
    );
    for (const line of report) {
      expect(line.height, line.text ?? "").toBeLessThanOrEqual(48);
      expect(line.overflow, line.text ?? "").toBe(false);
    }
    // The play call is never dropped, and is announced when it is a stop.
    await expect(
      page.getByRole("alert").filter({ hasText: "Lightning" }).first(),
    ).toHaveText("Stop play: Lightning 8 mi away");
  });

  test("ConditionsLine opens the full conditions: popover on desktop, sheet on a phone", async ({
    page,
  }) => {
    await open(page);
    const line = example(page, "schedule").getByRole("button", {
      name: /Light and weather/,
    });
    await line.click();
    const popover = page.getByRole("dialog", {
      name: "Conditions · Sat, Nov 28",
    });
    await expect(popover).toBeVisible();
    await expect(popover).toContainText("Good to play");
    await expect(popover.locator(".td-rise")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
    await expect(line).toBeFocused();

    await open(page, 375);
    await example(page, "schedule")
      .getByRole("button", { name: /Light and weather/ })
      .click();
    const sheet = page.getByRole("dialog", {
      name: "Conditions · Sat, Nov 28",
    });
    await expect(sheet).toBeVisible();
    await expect(
      sheet.locator(".td-sheet__grabber, .td-sheet").first(),
    ).toBeAttached();
  });

  test("conditions states: stale, not configured, no data, loading", async ({
    page,
  }) => {
    await open(page);
    const panels = example(page, "conditions");
    await expect(panels).toContainText(
      "2 h 5 min ago. Conditions may have changed.",
    );
    await expect(panels).toContainText("Weather isn't set up yet");
    await expect(panels).toContainText("No weather for this location yet.");
    await expect(panels.locator('[aria-busy="true"]')).toHaveCount(1);
    const lines = example(page, "lines");
    await expect(lines).toContainText("Weather isn’t set up yet");
    await expect(lines).toContainText("No weather for this location");
    await expect(lines).toContainText("2 h 5 min ago");
    // Colour is never the only signal: caution and stop carry an icon and words.
    for (const call of ["caution", "stop"]) {
      const marked = lines.locator(`.td-condline[data-call="${call}"]`);
      expect(await marked.count()).toBeGreaterThan(0);
      await expect(
        marked.first().locator(".td-condline__call svg"),
      ).toHaveCount(1);
      await expect(
        marked.first().locator(".td-condline__call b"),
      ).not.toBeEmpty();
    }
  });

  test("reduced motion: changes become a short fade", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    await example(page, "slots")
      .getByRole("button", { name: "Someone else books 4:00 PM" })
      .click();
    const stale = example(page, "slots").locator(
      '.td-tchip[data-state="stale"]',
    );
    await expect(stale).toHaveCount(1);
    const durations = await page.evaluate(() => {
      const read = (selector: string) => {
        const element = document.querySelector(selector);
        return element ? getComputedStyle(element).animationDuration : null;
      };
      return {
        chip: read('.td-tchip[data-state="stale"]'),
        arc: read(".td-sunarc__done"),
        wind: read(".td-woc__flow"),
      };
    });
    // Under reduced motion every change is at most the 200 ms fade.
    for (const value of Object.values(durations)) {
      expect(value).not.toBeNull();
      expect(Number.parseFloat(value as string)).toBeLessThanOrEqual(0.2);
    }
  });
});
