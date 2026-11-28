import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Training on the new shell (H-TRAIN), in demo mode: a new program from
 * one sentence, corrected and saved as a draft, then activated behind its
 * confirmation (a double click sends one request); a pattern change with
 * its preview; a practice cancelled with the honest notification state; a
 * plan built from quick blocks and two drills, saved as a version and
 * attached; Duna's draft accepted after an edit; the drill library, a
 * drill shared with the club and submitted to the store with a failing
 * check explained; a coach's limited view; and every Training page at 375
 * and 1024 px with no horizontal scroll and no legacy stylesheet.
 */
const hqBaseUrl =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;
const hq = (path: string) => new URL(path, hqBaseUrl).toString();

/** Demo fixtures (`@duna/core/demo/training-programs`, `training-drills`); not secrets. */
const program = "d0060000-0000-4000-8000-000000000001";
const draftProgram = "d0060000-0000-4000-8000-000000000002";
const plan = "d0060000-0000-4000-8000-000000000300";
const completedPractice = "d0060000-0000-4000-8000-000000000100";
const readyPractice = "d0060000-0000-4000-8000-000000000101";
const strengthSession = "d0060000-0000-4000-8000-000000000104";
const clubDrill = "d0070000-0000-4000-8000-000000000001";
const personalDrill = "d0070000-0000-4000-8000-000000000002";

async function signIn(page: Page, persona = "club-owner") {
  await page
    .context()
    .addCookies([
      { name: "duna-demo-persona", value: persona, url: hqBaseUrl },
    ]);
}

async function title(page: Page, text: string | RegExp) {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(text);
}

function actions(page: Page): string[] {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) {
      posts.push(request.url());
    }
  });
  return posts;
}

function option(scope: Page | Locator, name: string): Locator {
  return scope
    .getByRole("radio", { name, exact: true })
    .or(scope.getByRole("tab", { name, exact: true }))
    .first();
}

async function toast(page: Page, text: string | RegExp) {
  await expect(
    page
      .locator("[data-sonner-toast], [role='status'], [role='alert']")
      .filter({ hasText: text })
      .first(),
  ).toBeVisible();
}

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "The spec sets its own widths.",
  );
});

test("a new program from one sentence: correct a weekday, save a draft, activate once", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq("/training/programs/create"));
  await title(page, "New program");
  await page
    .getByRole("textbox", { name: "Describe the season in one sentence" })
    .fill(
      "U16 girls, Tuesdays and Thursdays 5 to 7 and Saturdays 9 to 11, 6 January to 28 March, no practice 14 February",
    );
  await page.getByRole("button", { name: "Read it" }).click();
  const read = page.getByRole("region", { name: "What Duna read" });
  await expect(read).toBeVisible();
  await expect(
    read.getByRole("list", { name: "Read from the sentence" }),
  ).toContainText("Mon · Wed");
  // Each weekday has its own times: move Saturday an hour later.
  const saturday = page.getByLabel("Saturday starts");
  await saturday.fill("10:00");
  await page.getByLabel("Saturday ends").fill("12:00");
  await expect(page.getByRole("region", { name: "In short" })).toContainText(
    "Sat 10:00 AM–12:00 PM",
  );
  await expect(page.getByText("Saving creates a draft only")).toBeVisible();
  await page.getByRole("button", { name: "Save as a draft" }).click();
  await page.waitForURL(`**/training/programs/${draftProgram}`);
  await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();

  const posts = actions(page);
  await page.getByRole("button", { name: "Activate", exact: true }).click();
  const dialog = page.getByRole("dialog").or(page.getByRole("alertdialog"));
  await expect(dialog).toContainText(/Creates \d+ practices/);
  await expect(dialog).toContainText("Athletes are not notified automatically");
  await dialog.getByRole("button", { name: /^Activate and create/ }).dblclick();
  await toast(page, "is active");
  expect(posts).toHaveLength(1);
});

test("changing the pattern shows exactly what is added, removed or kept", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq(`/training/programs/${program}/settings`), {
    waitUntil: "networkidle",
  });
  await title(page, "Fall competition build");
  const preview = page.getByRole("region", { name: "What saving changes" });
  await expect(async () => {
    await page.getByLabel("Monday starts").fill("17:00");
    await expect(preview).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(preview).toContainText(/adds|removes|Nothing changes/);
  await expect(preview).toContainText(/Added \(\d+\)/);
  await expect(preview).toContainText(/Kept for you to review \(\d+\)/);
  await preview.getByRole("button", { name: "Save the changes" }).click();
  const dialog = page.getByRole("dialog").or(page.getByRole("alertdialog"));
  await expect(dialog).toContainText("never moved or removed");
  await dialog.getByRole("button", { name: "Save the changes" }).click();
  await toast(page, "Changes saved");
});

test("cancelling a practice says plainly that athletes are not told yet", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq(`/training/practices/${readyPractice}`));
  await page.getByRole("button", { name: "Cancel this practice" }).click();
  const form = page.getByRole("form", { name: "Cancel this practice" });
  await form.getByLabel("Why it's cancelled").fill("Rain");
  await form.getByRole("button", { name: "Cancel the practice" }).click();
  const dialog = page.getByRole("dialog").or(page.getByRole("alertdialog"));
  await expect(dialog).toContainText(
    "Athletes are not notified automatically yet",
  );
  await dialog.getByRole("button", { name: "Cancel the practice" }).click();
  await toast(page, "Practice cancelled");
  const draft = page.getByRole("region", { name: "Tell the athletes" });
  await expect(draft).toContainText("Nothing is sent from here");
  await expect(
    draft.getByRole("textbox", { name: "Message draft" }),
  ).toHaveValue(/cancelled: Rain/);
  await expect(
    draft.getByRole("link", { name: "Review in Inbox" }),
  ).toHaveAttribute("href", /\/inbox\?compose=new/);
});

test("a plan from quick blocks and two drills: totals, a saved version, attached", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(
    hq(`/training/practice-plans/create?session=${strengthSession}`),
  );
  await title(page, "New practice plan");
  const add = page.getByRole("region", { name: "Add to the plan" });
  await add.getByRole("button", { name: /^Add Warm-up/ }).click();
  await add.getByRole("button", { name: /^Add Serve-receive/ }).click();
  await option(add, "Drills").click();
  await add
    .getByRole("button", { name: /^Add Serve-receive triangle/ })
    .click();
  await toast(page, "Serve-receive triangle added");
  await add.getByRole("button", { name: /^Add Warm-up ladder/ }).click();
  await toast(page, "Warm-up ladder added");
  await option(add, "Quick blocks").click();
  await add.getByRole("button", { name: /^Add Cool-down/ }).click();
  const blocks = page.getByRole("region", { name: "Blocks in order" });
  await expect(blocks.getByRole("article")).toHaveCount(5);
  await expect(
    blocks.getByRole("article", { name: "Serve-receive triangle" }),
  ).toContainText("Version 3");
  const totals = page.getByRole("region", { name: "Practice totals" });
  await expect(totals).toContainText("Load (estimate)");
  await expect(totals).toContainText(/of 120 min/);
  await expect(totals).toContainText("not medical");
  await page.getByRole("button", { name: "Save the plan" }).click();
  await toast(page, /Saved as version \d+/);
  await page.waitForURL(`**/training/practice-plans/${plan}?session=*`);
  await page.getByRole("button", { name: /^Attach to / }).click();
  await toast(page, /^Attached to /);
});

test("Duna's draft is reviewed, edited and only then saved", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq("/training/practice-plans/create"));
  await page
    .getByRole("textbox", { name: /^Focus/ })
    .first()
    .fill("Serve-receive");
  const posts = actions(page);
  await page
    .getByRole("button", { name: "Draft this practice with Duna" })
    .click();
  await expect(
    page.getByText("Duna's draft: review it before you save"),
  ).toBeVisible();
  await expect(page.getByText(/Based on focus "Serve-receive"/)).toBeVisible();
  // Proposing saved nothing: only the proposal was asked for.
  expect(posts).toHaveLength(1);
  const warmup = page.getByRole("article", { name: "Warm-up" });
  await warmup.getByLabel("Minutes").fill("12");
  await warmup.getByLabel("Minutes").blur();
  await page
    .getByRole("textbox", { name: "Plan name" })
    .fill("Serve-receive Tuesday");
  await page.getByRole("button", { name: "Save the plan" }).click();
  await toast(page, /Saved as version \d+/);
});

test("the drill library: open a drill, share it, and submit with a failing check explained", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq("/training/drills"));
  await title(page, "Drill library");
  await expect(
    page.getByRole("list", { name: "My club drills" }).getByRole("link", {
      name: "Serve-receive triangle",
    }),
  ).toBeVisible();
  await page.getByRole("searchbox", { name: "Search drills" }).fill("triangle");
  await page.getByRole("link", { name: "Mine", exact: true }).click();
  await expect(page).toHaveURL(/tab=personal/);
  await page.getByRole("link", { name: "Poke and recover" }).click();
  await page.waitForURL(`**/training/drills/${personalDrill}`);
  await title(page, "Poke and recover");
  await expect(page.getByRole("figure", { name: /the drawing/ })).toBeVisible();
  await page.getByRole("button", { name: "Share with my club" }).click();
  const dialog = page.getByRole("dialog").or(page.getByRole("alertdialog"));
  await dialog.getByRole("button", { name: "Share with my club" }).click();
  await toast(page, "Shared with your club");
  await page
    .getByRole("button", { name: /^Submit version \d+ to the store/ })
    .click();
  const checks = page.getByRole("list", { name: "Store checks" });
  await expect(checks).toContainText("Drawing check: Failed");
  await expect(checks).toContainText("save a new version and submit again");
  await expect(checks).toContainText("There is no decision yet");
  await expect(
    page.getByText("Fix what failed, then submit again"),
  ).toBeVisible();

  await page.goto(hq(`/training/drills/${clubDrill}`));
  await expect(page.getByText(/Used in 4 plans/)).toBeVisible();
  await expect(page.getByRole("list", { name: "Versions" })).toContainText(
    "Scene redrawn",
  );
});

test("a coach runs their program's practices but doesn't create or reschedule programs", async ({
  page,
}) => {
  await signIn(page, "coach");
  await page.goto(hq("/training"));
  await title(page, "Training");
  await expect(page.getByRole("link", { name: "New program" })).toHaveCount(0);
  await page.goto(hq("/training/programs/create"));
  await expect(page.getByText(/You don.t have access/)).toBeVisible();
  await page.goto(hq(`/training/programs/${program}/settings`));
  await expect(
    page.getByText("Owners and managers change a program's schedule"),
  ).toBeVisible();
  await expect(page.getByLabel("Monday starts")).toBeDisabled();
  // The demo coach leads this program, so they run its practices…
  await page.goto(hq(`/training/practices/${readyPractice}`));
  await expect(
    page.getByRole("button", { name: "Cancel this practice" }),
  ).toBeVisible();
  // …but only owners and managers activate a program.
  await page.goto(hq(`/training/programs/${draftProgram}`));
  await expect(
    page.getByRole("button", { name: "Activate", exact: true }),
  ).toHaveCount(0);
  await page.goto(hq("/training/practice-plans"));
  await expect(page.getByRole("link", { name: "New plan" })).toBeVisible();
});

test("every Training page fits 375 and 1024 px and loads no legacy stylesheet", async ({
  page,
}) => {
  await signIn(page);
  const stylesheets: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "stylesheet")
      stylesheets.push(request.url());
  });
  const paths = [
    "/training",
    "/training/programs/create",
    `/training/programs/${program}`,
    `/training/programs/${program}/calendar`,
    `/training/programs/${program}/athletes`,
    `/training/programs/${program}/plans`,
    `/training/programs/${program}/settings`,
    `/training/practices/${completedPractice}`,
    "/training/practice-plans",
    "/training/practice-plans/create",
    `/training/practice-plans/${plan}`,
    `/training/practice-plans/${plan}/print`,
    "/training/drills",
    "/training/drills?tab=store",
    "/training/drills/create",
    `/training/drills/${clubDrill}`,
  ];
  for (const width of [375, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of paths) {
      await page.goto(hq(path));
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await page.waitForFunction(() =>
        document
          .getAnimations()
          .every(
            (animation) =>
              animation.playState !== "running" ||
              animation.effect?.getTiming().iterations === Infinity,
          ),
      );
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(2);
    }
  }
  expect(
    stylesheets.filter((url) =>
      /globals|design-v3|work-focus|forms\.css|legacy/.test(url),
    ),
  ).toEqual([]);
});

test("old addresses keep resolving", async ({ page }) => {
  await signIn(page);
  await page.goto(hq("/programs"));
  await expect(page).toHaveURL(/\/training$/);
  await page.goto(hq("/training?view=drills"));
  await expect(page).toHaveURL(/\/training\/drills$/);
  await page.goto(hq("/training/drills/create/advanced"));
  await expect(page).toHaveURL(/\/training\/drills\/create$/);
  await page.goto(hq("/activities"));
  await expect(page).toHaveURL(/\/offerings$/);
});
