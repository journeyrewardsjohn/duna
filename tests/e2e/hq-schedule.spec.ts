import { expect, test, type Page } from "@playwright/test";

/**
 * Schedule on the new shell (H-SCHEDULE), in demo mode: create a booking on
 * an empty slot (a double click books once), a conflict explained in words
 * with a free alternative, a move through its confirmation and Undo, a
 * closure listing what it affects, check-in from "Now and next", the agenda
 * at 375 px, the keyboard path, a coach's limited view, no legacy
 * stylesheet and no horizontal page overflow. Demo changes live in a cookie,
 * so every test starts from the same club day.
 */
const hqBaseUrl =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;
const hq = (path: string) => new URL(path, hqBaseUrl).toString();

/** Demo fixture ids (the demo workspace's courts); not secrets. */
const championship = "10000000-0000-4000-8000-000000000103";
const community = "10000000-0000-4000-8000-000000000104";
const zone = "America/Los_Angeles";

/** A date on the demo club's calendar, `offset` days from today. */
function placeDate(offset: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(
    new Date(Date.now() + offset * 86_400_000),
  );
}

async function signIn(page: Page, persona = "club-owner") {
  await page
    .context()
    .addCookies([
      { name: "duna-demo-persona", value: persona, url: hqBaseUrl },
    ]);
}

async function openSchedule(page: Page, search = "") {
  await page.goto(hq(`/schedule${search}`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Schedule");
}

async function choose(page: Page, label: string, option: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

function actionPosts(page: Page) {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) {
      posts.push(request.url());
    }
  });
  return posts;
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "The spec sets its own widths.",
  );
  await signIn(page);
});

test("creates a booking on an empty slot, and a double click books once", async ({
  page,
}) => {
  const tomorrow = placeDate(1);
  await openSchedule(page, `?date=${tomorrow}&view=day`);
  const grid = page.getByTestId("schedule-grid");
  await expect(grid).toBeVisible();
  // Scroll 2 PM into view and press the empty Community Court slot there.
  await grid.evaluate((element) => {
    element.scrollTop = 420;
  });
  const lane = page.locator(`[data-lane="${community}"]`);
  const box = (await lane.boundingBox())!;
  const top = await lane.evaluate((element) => {
    const hours = [...document.querySelectorAll(".sch-hours span")];
    const two = hours.find((span) => span.textContent === "2 PM");
    return two ? (two as HTMLElement).offsetTop - element.offsetTop : 0;
  });
  await page.mouse.click(box.x + 40, box.y + top + 10);
  const sheet = page.getByRole("dialog", { name: "Add to the schedule" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(/^Community Court is free \d/)).toBeVisible();
  await sheet.getByRole("radio", { name: "A walk-in" }).check();
  await sheet.getByLabel("Walk-in's name").fill("Jamie Stone");
  const posts = actionPosts(page);
  await sheet.getByRole("button", { name: "Book the court" }).dblclick();
  await expect(page.getByText(/Booking added: Community Court/)).toBeVisible();
  expect(posts).toHaveLength(1);
  await expect(
    grid.getByRole("button", {
      name: /Court booking: Court hire, .*Jamie Stone/,
    }),
  ).toBeVisible();
});

test("explains a conflict in words and offers the nearest free time", async ({
  page,
}) => {
  await openSchedule(
    page,
    `?date=${placeDate(1)}&view=day&court=${championship}`,
  );
  await page.getByRole("button", { name: "New booking" }).click();
  const sheet = page.getByRole("dialog", { name: "Add to the schedule" });
  // 9:00 AM on Championship Court is the junior clinic.
  await expect(sheet.getByText("That time isn't free")).toBeVisible();
  await expect(
    sheet.getByText(/Championship Court is booked until \d+:\d\d (AM|PM)\./),
  ).toBeVisible();
  const alternative = sheet.getByRole("button", { name: /^Use / }).first();
  await expect(alternative).toBeVisible();
  await alternative.click();
  await expect(sheet.getByText("That time isn't free")).toHaveCount(0);
  await expect(sheet.getByText(/is free/)).toBeVisible();
});

test("moves a booking after a confirmation naming who is told, then undoes it", async ({
  page,
}) => {
  await openSchedule(page, `?date=${placeDate(1)}&view=day`);
  await page
    .getByTestId("schedule-grid")
    .getByRole("button", { name: /Court booking: Court hire, 8:00/ })
    .click();
  const panel = page.getByRole("dialog", { name: "Court hire" });
  await expect(panel.getByText(/^Paid · /)).toBeVisible();
  await panel.getByRole("button", { name: "Move…" }).click();
  await choose(page, "New start", "2:00 PM");
  await panel.getByRole("button", { name: "Review the move" }).click();
  const question = page.getByRole("alertdialog");
  await expect(question).toContainText("Move Court hire to 2:00 PM?");
  await expect(question).toContainText("1 person booked is sent the new time");
  await question
    .getByRole("button", { name: "Move and tell 1 person" })
    .click();
  await expect(page.getByText("Court hire moved to 2:00 PM")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Court booking: Court hire, 2:00 PM/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    page.getByRole("button", { name: /Court booking: Court hire, 8:00 AM/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Court booking: Court hire, 2:00 PM/ }),
  ).toHaveCount(0);
});

test("a closure lists the sessions it affects and confirms at the strong tier", async ({
  page,
}) => {
  await openSchedule(page, `?date=${placeDate(1)}&view=day`);
  await page.getByRole("button", { name: "Close courts" }).click();
  const sheet = page.getByRole("dialog", { name: "Close courts" });
  await sheet
    .getByLabel("Reason, shown on the calendar and to the people told")
    .fill("Sand replacement");
  const affected = sheet.getByRole("region", { name: "What this affects" });
  await expect(affected).toContainText("Junior clinic");
  await expect(affected).toContainText("Private lesson");
  await sheet.getByRole("button", { name: "Review the closure" }).click();
  await expect(sheet).toContainText("Close 2 courts?");
  await expect(sheet).toContainText(
    /(person|people) in \d+ sessions? (or|and) bookings? (is|are) told/,
  );
  await sheet.getByRole("button", { name: "Close 2 courts" }).click();
  await expect(page.getByText(/2 courts closed/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Blocked time: Closed/ }).first(),
  ).toBeVisible();
});

test("checks a person in from Now and next, with Undo", async ({ page }) => {
  await openSchedule(page, "?view=day");
  const strip = page.getByRole("region", { name: "Not checked in" });
  const count = strip.locator(".sch-now__count");
  const before = Number(await count.textContent());
  const button = strip.getByRole("button", { name: /^Check in / }).first();
  const name = (await button.getAttribute("aria-label"))!.replace(
    /^Check in (.+) for .+$/,
    "$1",
  );
  await button.click();
  await expect(page.getByText(`${name} checked in`)).toBeVisible();
  await expect(count).toHaveText(String(before - 1));
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(count).toHaveText(String(before));
});

test("the keyboard reaches a slot and creates there", async ({ page }) => {
  await openSchedule(page, `?date=${placeDate(2)}&view=day`);
  const grid = page.getByTestId("schedule-grid");
  await grid.focus();
  await page.keyboard.press("ArrowDown"); // shows the cursor at the top
  for (let step = 0; step < 4; step += 1)
    await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByText(/^Community Court, \d+:\d\d (AM|PM), (free|.+)$/),
  ).toBeAttached();
  await page.keyboard.press("PageDown");
  await expect(page).toHaveURL(new RegExp(`date=${placeDate(3)}`));
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`date=${placeDate(2)}`));
  await grid.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Add to the schedule" }),
  ).toBeVisible();
});

test("on a phone the day is an agenda with a day strip, and nothing overflows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const stylesheets: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "stylesheet")
      stylesheets.push(request.url());
  });
  await openSchedule(page);
  await expect(page.getByTestId("schedule-agenda")).toBeVisible();
  await expect(page.getByTestId("schedule-grid")).toBeHidden();
  await expect(page.getByRole("button", { name: "List" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByRole("radiogroup", { name: "Choose a day" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(2);
  expect(
    stylesheets.filter((url) =>
      /globals|design-v3|work-focus|forms\.css|legacy/.test(url),
    ),
  ).toEqual([]);
});

test("filters live in the address, and Back restores the view", async ({
  page,
}) => {
  await openSchedule(page, "?view=day");
  await page.getByRole("button", { name: "Week" }).click();
  await expect(page).toHaveURL(/view=week/);
  await page.getByRole("button", { name: "Lessons", exact: true }).click();
  await expect(page).toHaveURL(/kind=lesson/);
  await page.goBack();
  await expect(page).not.toHaveURL(/kind=lesson/);
  await page.goBack();
  await expect(page).toHaveURL(/view=day/);
  await expect(page.getByRole("button", { name: "Today" })).toBeVisible();
});

test("a coach sees their own day and cannot change other people's bookings", async ({
  page,
}) => {
  await signIn(page, "coach");
  await openSchedule(page, "?view=day");
  await expect(page.getByText("This is your day.")).toBeVisible();
  await expect(page.getByRole("button", { name: "New booking" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Coaches" }).click();
  await page
    .getByRole("button", { name: /Lesson: Private lesson/ })
    .first()
    .click();
  await expect(
    page.getByText(
      "You can see this; changing it is for the club's owner or front desk.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Move…" })).toHaveCount(0);
});

test("an old court reservation address opens Schedule", async ({ page }) => {
  await page.goto(
    hq("/events/court-bookings/00000000-0000-4000-8000-000000000001"),
  );
  await expect(page).toHaveURL(/\/schedule\?open=court-booking/);
  await expect(page.getByText("That isn't on the schedule")).toBeVisible();
});

test("an offering's group session opens the one session panel (Offerings')", async ({
  page,
}) => {
  // The participation fixtures sit in the week of 8 December 2026.
  await openSchedule(page, "?date=2026-12-09&view=day");
  // Placed on its own court's lane (PART-B), not on "No court".
  await expect(page.getByRole("group", { name: "No court" })).toHaveCount(0);
  await page
    .getByRole("group", { name: /^Court 3/ })
    .getByRole("button", { name: /^Group session: Wednesday small group/ })
    .click();
  const panel = page.getByRole("dialog", { name: "Wednesday small group" });
  await expect(panel.getByText("Who's booked")).toBeVisible();
  await expect(page).toHaveURL(/open=catalog-occurrence/);
});
