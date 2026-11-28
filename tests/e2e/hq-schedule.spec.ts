import { expect, test, type Page } from "@playwright/test";

/**
 * Schedule on the new shell (H-SCHEDULE, H-SCHEDULE-2), in demo mode: book
 * a court on an empty slot at the court's price (a double click books
 * once), a conflict explained in words with a free alternative, a booking
 * moved through its preview with a message prepared in Inbox and Undo, a
 * cancellation listing who gets what back, a desk payment, removing a
 * closure with its acknowledgement, a closure listing what it affects, check-in from "Now and next", the agenda
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
  // The court's own price, from the server's preview.
  await expect(sheet.getByTestId("booking-price")).toContainText(
    /\$\d+\.\d\d: Court hire/,
  );
  // A payment link needs Duna Pay: offered only when it can work.
  await expect(
    sheet.getByRole("radio", { name: /Send a payment link/ }),
  ).toBeDisabled();
  // Review waits (disabled) until the preview answers for these choices.
  await sheet.getByRole("button", { name: "Review the booking" }).click();
  await expect(sheet).toContainText("Book Community Court for Jamie Stone?");
  await expect(sheet).toContainText("Nothing is sent to anyone from here.");
  const posts = actionPosts(page);
  await sheet.getByRole("button", { name: /^Book for \$/ }).dblclick();
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

test("moves a booking after its preview, prepares a message in Inbox, then undoes it", async ({
  page,
}) => {
  await openSchedule(page, `?date=${placeDate(1)}&view=day`);
  await page
    .getByTestId("schedule-grid")
    .getByRole("button", { name: /Court booking: Court hire, 8:00/ })
    .click();
  const panel = page.getByRole("dialog", { name: "Court hire" });
  await expect(panel.getByText(/^Paid$/)).toBeVisible();
  await panel.getByRole("button", { name: "Move…" }).click();
  await choose(page, "New start", "2:00 PM");
  await expect(
    panel.getByRole("checkbox", { name: /Prepare a message for/ }),
  ).toBeChecked();
  await panel.getByRole("button", { name: "Review the move" }).click();
  const question = page.getByRole("alertdialog");
  await expect(question).toContainText("Move Court hire to 2:00 PM?");
  await expect(question).toContainText("The price stays as booked.");
  await expect(question).toContainText("may ask for a full refund");
  await expect(question).toContainText(/is prepared in Inbox/);
  await expect(question).toContainText("Nothing is sent from here.");
  await question.getByRole("button", { name: "Move to 2:00 PM" }).click();
  await expect(
    page.getByText("Court hire moved to 2:00 PM", { exact: true }),
  ).toBeVisible();
  const handoff = page.getByTestId("draft-handoff");
  await expect(handoff).toContainText("A message draft is ready in Inbox");
  await expect(
    handoff.getByRole("link", { name: "Open in Inbox" }),
  ).toHaveAttribute("href", /\/inbox/);
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

test("cancels a booking after listing who gets what back, at the strong tier", async ({
  page,
}) => {
  await openSchedule(page, `?date=${placeDate(1)}&view=day`);
  await page
    .getByTestId("schedule-grid")
    .getByRole("button", { name: /Court booking: Court hire, 8:00/ })
    .click();
  const panel = page.getByRole("dialog", { name: "Court hire" });
  await panel.getByRole("button", { name: "Cancel…" }).click();
  const lines = panel.getByTestId("cancel-lines");
  await expect(lines).toContainText("Refunded to the card they paid with");
  await expect(lines).toContainText(/\$\d+\.\d\d back/);
  await panel.getByRole("radio", { name: "No refund" }).check();
  await expect(lines).toContainText("Keeps what they paid");
  await panel.getByRole("radio", { name: "By the policy" }).check();
  await panel
    .getByLabel("Reason, for the record and the message draft")
    .fill("Asked to cancel at the desk");
  await panel.getByRole("button", { name: "Review the cancellation" }).click();
  await expect(panel).toContainText("A refund cannot be undone.");
  await expect(panel).toContainText(/opens in Inbox for you to review/);
  await panel.getByRole("button", { name: /^Cancel and refund \$/ }).click();
  await expect(
    page.getByText("Court hire cancelled", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("draft-handoff")).toContainText(
    "A message draft is ready in Inbox",
  );
});

test("records a desk payment from the Unpaid strip, saying no card is charged", async ({
  page,
}) => {
  await openSchedule(page, "?view=day");
  const unpaid = page.getByRole("region", { name: "Unpaid" });
  await unpaid.locator(".sch-link").first().click();
  const panel = page.getByRole("dialog");
  await panel.getByRole("button", { name: "Record desk payment…" }).click();
  await expect(panel).toContainText(
    "Only the whole amount due can be recorded.",
  );
  await panel.getByRole("radio", { name: "Cash" }).check();
  await panel.getByRole("button", { name: "Review the payment" }).click();
  await expect(panel).toContainText("No card is charged");
  await expect(panel).toContainText(
    "Money shows the booking as paid with no processor payment.",
  );
  const posts = actionPosts(page);
  await panel
    .getByRole("button", { name: /^Record \$[\d.]+ paid$/ })
    .dblclick();
  await expect(page.getByText(/recorded as paid at the desk/)).toBeVisible();
  expect(posts).toHaveLength(1);
});

test("removing a closure asks to acknowledge what stays cancelled under it", async ({
  page,
}) => {
  await openSchedule(page, `?date=${placeDate(1)}&view=day`);
  await page.getByRole("button", { name: "Close courts" }).click();
  const sheet = page.getByRole("dialog", { name: "Close courts" });
  await sheet
    .getByLabel("Reason, shown on the calendar and to the people told")
    .fill("Sand replacement");
  await sheet.getByRole("button", { name: "Review the closure" }).click();
  await sheet.getByRole("button", { name: "Close 2 courts" }).click();
  await expect(page.getByText(/2 courts closed/)).toBeVisible();
  await page
    .getByRole("button", { name: /Blocked time: Closed/ })
    .first()
    .click();
  const panel = page.getByRole("dialog", { name: "Closed" });
  await panel.getByRole("button", { name: "Remove block…" }).click();
  await expect(panel).toContainText("Cancelled under this closure");
  await panel.getByLabel("Why it is removed").fill("Sand arrived early");
  const review = panel.getByRole("button", { name: "Review the removal" });
  await expect(review).toBeDisabled();
  await panel
    .getByRole("checkbox", { name: /does not bring them back/ })
    .check();
  await review.click();
  await expect(panel).toContainText(/stays? cancelled/);
  await panel.getByRole("button", { name: "Remove block" }).click();
  await expect(page.getByText("Block removed")).toBeVisible();
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
