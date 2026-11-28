import { expect, test, type Page } from "@playwright/test";

/**
 * Club setup on the new shell (H-SETUP), in demo mode: the first run with a
 * website through review and apply (a double click sends one request),
 * every failure reason, the no-website path, resuming after a reload, a
 * re-read that shows only differences, editing identity by hand, the
 * website reader not set up, a coach without access, and phone width with
 * no legacy stylesheet. Scenarios come from the `duna-demo-setup` cookie
 * (apps/hq/components/setup/setup-demo.ts).
 */
const hqBaseUrl =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;
const hq = (path: string) => new URL(path, hqBaseUrl).toString();

const failureTitles = {
  "no-response": "Your website did not answer",
  "no-such-host": "That address does not exist",
  "address-not-allowed": "Duna can't read that address",
  "blocked-by-site": "Your website asked not to be read",
  "nothing-readable": "Nothing readable on your website",
  "too-large": "Your website's pages are too large",
  "timed-out": "Reading took too long",
} as const;

async function signIn(
  page: Page,
  persona = "club-owner",
  extra: Record<string, string> = {},
) {
  await page
    .context()
    .addCookies(
      Object.entries({ "duna-demo-persona": persona, ...extra }).map(
        ([name, value]) => ({ name, value, url: hqBaseUrl }),
      ),
    );
}

async function title(page: Page, text: string | RegExp) {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(text);
}

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "The spec sets its own widths.",
  );
});

test("first run: read the website, watch it, review, keep and apply once", async ({
  page,
}) => {
  test.slow();
  await signIn(page, "club-owner", { "duna-demo-setup": "fresh" });
  await page.goto(hq("/setup/start"));
  await title(page, /^Let.s set up /);
  await expect(
    page.getByRole("heading", { name: "Do you have a website?" }),
  ).toBeVisible();
  await page.getByLabel("Your club's website").fill("club.example");
  await page.getByRole("button", { name: "Read my website" }).click();

  // Honest progress: the pages by name, and a way to stop.
  await expect(
    page.getByText(/Getting ready to read|Reading club\.example/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Stop reading" }),
  ).toBeVisible();
  await expect(page.getByRole("list", { name: "Pages" })).toContainText(
    "Home page",
    {
      timeout: 15_000,
    },
  );
  await page
    .getByRole("button", { name: "Review what Duna found" })
    .click({ timeout: 20_000 });

  await title(page, "Website read");
  await expect(
    page.getByRole("heading", { name: "Contact and hours" }),
  ).toBeVisible();
  // Nothing is confirmed until a person keeps it.
  await expect(page.locator("article[data-decision='applied']")).toHaveCount(0);

  // Keep all leaves the conflicting phone for the person, and says why.
  const contact = page.locator("section", {
    has: page.getByRole("heading", { name: "Contact and hours" }),
  });
  await contact.getByRole("button", { name: "Keep all in this group" }).click();
  await expect(contact.getByText(/more than one value/)).toBeVisible();
  await contact.getByRole("radio", { name: "+13105550199" }).check();
  await contact.getByRole("button", { name: "Keep my choice" }).click();

  // A price makes it the strong confirmation.
  const lesson = page.locator("article", { hasText: "Private lesson" });
  await lesson.getByRole("button", { name: "Keep" }).click();
  const summary = page.getByRole("complementary", {
    name: "What Apply will do",
  });
  await expect(summary).toContainText("private draft offering");
  await expect(summary).toContainText("Sets your opening hours");

  await page.getByRole("button", { name: /^Apply \d+$/ }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("nothing goes on sale");
  await expect(dialog).toContainText("nobody is invited");

  const actions: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) {
      actions.push(request.url());
    }
  });
  await dialog.getByRole("button", { name: /^Add \d+ to my club$/ }).dblclick();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /added to/ })
      .first(),
  ).toBeVisible();
  expect(actions).toHaveLength(1);
  await expect(
    page.getByRole("link", { name: "Open the draft offering" }).first(),
  ).toBeVisible();
  await page.getByRole("link", { name: "See what's next" }).click();
  await title(page, "Club setup");
  await expect(page.getByText("What you kept is in your club")).toBeVisible();
});

test("every failure reason has its own words and a way forward", async ({
  page,
}) => {
  test.slow();
  for (const [reason, heading] of Object.entries(failureTitles)) {
    await page.context().clearCookies();
    await signIn(page, "club-owner", {
      "duna-demo-setup": `fail:${reason}`,
    });
    await page.goto(hq("/setup/start?path=website"));
    await page.getByLabel("Your club's website").fill("club.example");
    await page.getByRole("button", { name: "Read my website" }).click();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Fill it in by hand" }),
    ).toBeVisible();
  }
});

test("no website: the same facts by hand, checked, then saved", async ({
  page,
}) => {
  await signIn(page, "club-owner", { "duna-demo-setup": "fresh" });
  await page.goto(hq("/setup/start"));
  await page.getByRole("button", { name: "No website" }).click();
  await page.getByRole("button", { name: /Fill it in step by step/ }).click();
  await expect(
    page.getByRole("heading", { name: "What is your club called?" }),
  ).toBeVisible();
  await page.getByLabel("Club name").fill("Sunset Sand Club");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("checkbox", { name: "Beach volleyball" }).check();
  for (let step = 0; step < 3; step += 1) {
    await page.getByRole("button", { name: "Next", exact: true }).click();
  }
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Check my answers" }).click();
  await expect(
    page.getByRole("heading", { name: "Check what you wrote" }),
  ).toBeVisible();
  await expect(page.getByText("Sunset Sand Club")).toBeVisible();
  await page.getByRole("button", { name: "Save to my club" }).click();
  await page.waitForURL(/\/setup\?welcome=identity/);
  await expect(page.getByText("Your club's identity is in")).toBeVisible();
});

test("a read carries on after a reload", async ({ page }) => {
  await signIn(page, "club-owner", { "duna-demo-setup": "fresh" });
  await page.goto(hq("/setup/start?path=website"));
  await page.getByLabel("Your club's website").fill("club.example");
  await page.getByRole("button", { name: "Read my website" }).click();
  await expect(
    page.getByRole("button", { name: "Stop reading" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page
      .getByRole("button", { name: "Stop reading" })
      .or(page.getByRole("link", { name: "Continue reviewing" }))
      .or(page.getByRole("button", { name: "Review what Duna found" })),
  ).toBeVisible();
  await page.goto(hq("/setup/review"));
  await expect(
    page.getByRole("heading", { name: "Contact and hours" }),
  ).toBeVisible({
    timeout: 15_000,
  });
});

test("reading the website again shows only what differs, next to what is there", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq("/setup/identity"));
  await title(page, "Club identity");
  await page.getByRole("button", { name: "Read my website again" }).click();
  await page.waitForURL(/\/setup\/review\?run=/);
  await expect(page.getByText("Your website says").first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("[new tagline]")).toBeVisible();
  await expect(page.getByText("You set this yourself").first()).toBeVisible();
  // Only the differences: places and offerings are not proposed again.
  await expect(
    page.getByRole("heading", { name: "Offerings and prices" }),
  ).toHaveCount(0);
});

test("identity is edited by hand and says where each value came from", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(hq("/setup/identity"));
  await expect(page.getByText("From your website on").first()).toBeVisible();
  await page.getByLabel("In one line").fill("Sand, sun and good volleyball");
  await page.getByRole("button", { name: "Save identity" }).click();
  await expect(page.getByText("Your club's identity is saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("In one line")).toHaveValue(
    "Sand, sun and good volleyball",
  );
  // The brand previews the mark in light and dark with its contrast.
  await expect(page.getByText(/:1/).first()).toBeVisible();
});

test("without the website reader the page says so and the by-hand path works", async ({
  page,
}) => {
  await signIn(page, "club-owner", { "duna-demo-setup": "no-reader" });
  await page.goto(hq("/setup/start"));
  await expect(
    page.getByText("Duna's website reader isn't set up here yet"),
  ).toBeVisible();
  await expect(page.getByLabel("Your club's website")).toHaveCount(0);
  await page.getByRole("button", { name: /Fill it in step by step/ }).click();
  await expect(
    page.getByRole("heading", { name: "What is your club called?" }),
  ).toBeVisible();
});

test("a coach sees that Club setup needs an owner", async ({ page }) => {
  await signIn(page, "coach");
  for (const path of ["/setup", "/setup/identity", "/setup/review"]) {
    await page.goto(hq(path));
    await expect(
      page.getByText(/an owner or manager of/).first(),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Apply" })).toHaveCount(0);
  }
});

test("every setup screen fits a phone and loads no legacy stylesheet", async ({
  page,
}) => {
  await signIn(page);
  await page.setViewportSize({ width: 375, height: 812 });
  const stylesheets: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "stylesheet")
      stylesheets.push(request.url());
  });
  for (const path of [
    "/setup",
    "/setup/identity",
    "/setup/review",
    "/setup/places",
    "/setup/places/10000000-0000-4000-8000-000000000101",
    "/setup/start",
  ]) {
    await page.goto(hq(path));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Let the page's entrance (Cross, Rise) finish before measuring.
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
    expect(overflow, path).toBeLessThanOrEqual(2);
  }
  expect(
    stylesheets.filter((url) =>
      /globals|design-v3|work-focus|forms\.css|legacy/.test(url),
    ),
  ).toEqual([]);
});
