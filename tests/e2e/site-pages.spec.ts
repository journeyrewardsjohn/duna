import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
  type Request,
  type TestInfo,
} from "@playwright/test";
import {
  DUNA_SERVICE_FEE_BPS,
  MEMBERSHIP_PLANS,
} from "../../packages/core/src/membership-plans";
import { ORGANIZATION_PLANS } from "../../packages/core/src/organization-plans";
import { expectAccessible } from "./personas/support/a11y";

/**
 * The marketing pages on the Duna Design System (SITE-2,
 * docs/design/website.md §2.6–2.8, §3.4–3.7): clubs, coaches, pricing, the
 * apps, Sand Rating and the Pro Tour. Each renders with one h1 at desktop and
 * 375 px with no sideways scroll and no legacy stylesheet; reduced motion
 * shows end states; the pricing page prints exactly the plan tables; every
 * Pro Tour address still resolves; moved addresses answer 301.
 *
 * Delivery (SITE-PERF-1, docs/design/website-performance.md): a page is
 * ready when a person can use it (the document, the one h1, the primary call
 * to action), never "when every byte of media has arrived". Each first screen
 * must settle: nothing still open 5 s after the h1 except deliberately
 * deferred video, no video playing off screen, no full-size poster, the
 * largest visible photograph eager and high priority, and the transfer under
 * the stated budget.
 */

const PHONE = { width: 375, height: 812 } as const;
const DESKTOP = { width: 1440, height: 900 } as const;

type Viewport = typeof PHONE | typeof DESKTOP;

interface FirstScreen {
  readonly path: string;
  /** The page's one h1. */
  readonly h1: string;
  /** The primary call to action a person needs on the first screen. */
  readonly cta: (page: Page, viewport: Viewport) => Locator;
}

const PAGES: readonly FirstScreen[] = [
  {
    path: "/run-your-club",
    h1: "Run the whole club from one place.",
    cta: (page: Page) =>
      page
        .getByRole("main")
        .getByRole("link", { name: "Start your club free" }),
  },
  {
    path: "/coaches",
    h1: "Your coaching day, in your pocket.",
    cta: (page: Page) =>
      page
        .getByRole("main")
        .getByRole("link", { name: "Start coaching on Duna" }),
  },
  {
    path: "/pricing",
    h1: "Simple to start. Clear as you grow.",
    cta: (page: Page) => page.getByRole("radio", { name: "Yearly" }),
  },
  {
    path: "/apps",
    h1: "Two apps. One game.",
    // The store links are "Link coming" marks until the owner adds them, so
    // the way on is the header.
    cta: (page: Page, viewport: Viewport) =>
      viewport === PHONE
        ? page.getByRole("banner").getByRole("button", { name: "Open menu" })
        : page
            .getByRole("banner")
            .getByRole("link", { name: "Find a game", exact: true }),
  },
  {
    path: "/sand-rating",
    h1: "One number for your level, earned on the sand.",
    cta: (page: Page) =>
      page.getByRole("main").getByRole("link", { name: "Add a score" }).first(),
  },
  {
    path: "/pro",
    h1: "The world’s game, point by point.",
    cta: (page: Page) =>
      page.getByRole("main").getByRole("link", { name: "Today’s matches" }),
  },
];

/** The home page is measured here too: it is the one page with video. */
const FIRST_SCREENS: readonly FirstScreen[] = [
  {
    path: "/",
    h1: "Meet you at the net.",
    cta: (page: Page) =>
      page
        .getByRole("search", { name: "Find a game" })
        .getByRole("button", { name: "Search" }),
  },
  ...PAGES,
];

/**
 * What one first screen may transfer, in KiB, on the CI server (`next start`,
 * gzip). The design target (docs/design/website.md §6) is far lower: these
 * are a ratchet at today's size plus headroom, so a heavier photograph, a
 * full-size poster or a new bundle on a marketing page fails here first.
 * Lower them as the targets in docs/design/website-performance.md land.
 */
const BUDGET_KIB = {
  document: 64,
  /** Stylesheets the document applies (a prefetched sheet is not counted). */
  css: 96,
  /** Scripts in the document. Target 90 KiB; today ~720 KiB. */
  js: 900,
  font: 128,
  /** Photographs requested by the first screen (hero plus near-fold lazy). */
  image: 320,
  /** Video bytes in the first 5 s (only the home hero loop plays, 120 KiB). */
  media: 200,
  total: 1_400,
} as const;

/** How long a first screen has to settle after its h1 is visible. */
const SETTLE_MS = 5_000;

/** Selectors that exist only in the legacy sheets (app/(legacy)). */
const LEGACY_MARKERS = [
  ".site-loading",
  ".site-audience-bar",
  ".duna-loader",
  ".pro-event-card",
];

function dollars(minor: number) {
  const value = minor / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Every request a page has started and not yet finished or failed. */
function watchRequests(page: Page) {
  const open = new Set<Request>();
  page.on("request", (request) => open.add(request));
  page.on("requestfinished", (request) => open.delete(request));
  page.on("requestfailed", (request) => open.delete(request));
  return open;
}

const openRequests = new WeakMap<Page, Set<Request>>();

/** A new page with its own cache, sized before it loads anything. */
async function freshPage(
  browser: Browser,
  testInfo: TestInfo,
  viewport: Viewport,
) {
  const { baseURL, extraHTTPHeaders } = testInfo.project.use;
  const context = await browser.newContext({
    baseURL,
    extraHTTPHeaders,
    viewport,
  });
  const page = await context.newPage();
  openRequests.set(page, watchRequests(page));
  return page;
}

/**
 * Waits (at most `ms`) until the page has nothing but video still loading,
 * so leaving it does not abandon a half-started photograph. An abandoned
 * first request for an image can leave `next start`'s optimiser waiting on
 * that address for the life of the server (website-performance.md, "Why
 * `load` hung in CI"), which is how these specs used to hang each other.
 */
async function settle(page: Page, ms = SETTLE_MS) {
  const open = openRequests.get(page);
  if (!open) return;
  const deadline = Date.now() + ms;
  while (
    Date.now() < deadline &&
    [...open].some((request) => request.resourceType() !== "media")
  ) {
    await page.waitForTimeout(100);
  }
}

/**
 * Opens a page the way a person uses it: the document, then the one h1. It
 * does not wait for `load`, which waits for every photograph.
 */
async function open(page: Page, path: string) {
  if (!openRequests.has(page)) openRequests.set(page, watchRequests(page));
  else await settle(page);
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status(), path).toBeLessThan(400);
  await expect(page.locator("h1"), path).toHaveCount(1);
  await expect(page.locator("h1"), path).toBeVisible();
  return response;
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(2);
}

async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  });
  await settle(page);
}

/**
 * The requests still open after the settle window that the page is
 * responsible for. Video is excluded here and checked by its attributes. A
 * photograph that the server itself cannot answer either is the optimiser
 * stall described in website-performance.md, not a page defect: it is
 * recorded on the test, not failed.
 */
async function stuckRequests(page: Page, testInfo: TestInfo) {
  const open = [...(openRequests.get(page) ?? [])].filter(
    (request) => request.resourceType() !== "media",
  );
  const stuck: string[] = [];
  for (const request of open) {
    const url = request.url();
    if (url.includes("/_next/image")) {
      const answered = await page.request
        .get(url, {
          headers: { accept: "image/avif,image/webp,*/*" },
          timeout: 5_000,
        })
        .then(() => true)
        .catch(() => false);
      if (!answered) {
        testInfo.annotations.push({
          type: "image optimiser stall",
          description: url,
        });
        continue;
      }
      // The server answers: give the page's own request a moment to land.
      const pending = openRequests.get(page);
      for (let tries = 0; tries < 20 && pending?.has(request); tries += 1)
        await page.waitForTimeout(100);
      if (!pending?.has(request)) continue;
    }
    stuck.push(`${request.resourceType()} ${url}`);
  }
  return stuck;
}

/** Transfer by kind, in KiB, from the page's own resource timing. */
async function firstScreenTransfer(page: Page) {
  return page.evaluate(() => {
    const scripts = new Set(
      [...document.querySelectorAll<HTMLScriptElement>("script[src]")].map(
        (script) => script.src,
      ),
    );
    const sheets = new Set(
      [
        ...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
      ].map((link) => link.href),
    );
    const kib = { document: 0, css: 0, js: 0, font: 0, image: 0, media: 0 };
    const navigation = performance.getEntriesByType("navigation")[0] as
      PerformanceNavigationTiming | undefined;
    kib.document = navigation?.transferSize ?? 0;
    for (const entry of performance.getEntriesByType(
      "resource",
    ) as PerformanceResourceTiming[]) {
      const { name, initiatorType, transferSize } = entry;
      if (scripts.has(name)) kib.js += transferSize;
      else if (sheets.has(name)) kib.css += transferSize;
      else if (/\.woff2?(\?|$)/.test(name)) kib.font += transferSize;
      else if (initiatorType === "video" || /\.(mp4|webm|m4v)(\?|$)/.test(name))
        kib.media += transferSize;
      else if (
        initiatorType === "img" ||
        name.includes("/_next/image") ||
        /\.(avif|webp|png|jpe?g)(\?|$)/.test(name)
      )
        kib.image += transferSize;
    }
    const result = Object.fromEntries(
      Object.entries(kib).map(([key, bytes]) => [
        key,
        Math.round(bytes / 1024),
      ]),
    ) as Record<keyof typeof kib, number>;
    return {
      ...result,
      total: Object.values(result).reduce((sum, value) => sum + value, 0),
    };
  });
}

/** Video and the largest visible photograph, read from the live DOM. */
async function firstScreenMedia(page: Page) {
  return page.evaluate(() => {
    const inView = (element: Element) => {
      const box = element.getBoundingClientRect();
      return (
        box.width > 0 &&
        box.height > 0 &&
        box.bottom > 0 &&
        box.top < window.innerHeight
      );
    };
    const videos = [...document.querySelectorAll("video")].map((video) => ({
      preload: video.getAttribute("preload"),
      poster: video.getAttribute("poster"),
      playing: !video.paused,
      inView: inView(video),
    }));
    const visible = [...document.images]
      .filter(inView)
      .map((image) => {
        const box = image.getBoundingClientRect();
        const width =
          Math.min(box.right, window.innerWidth) - Math.max(box.left, 0);
        const height =
          Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0);
        return {
          area: width * height,
          alt: image.alt,
          loading: image.loading,
          fetchPriority: image.fetchPriority,
        };
      })
      .sort((a, b) => b.area - a.area);
    return { videos, largest: visible[0] };
  });
}

test.describe("Marketing pages in the new shell", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "Runs once; sets its own viewports",
    );
  });

  for (const { path, h1 } of PAGES) {
    test(`${path} renders with one h1 at desktop and 375 px`, async ({
      browser,
    }, testInfo) => {
      for (const viewport of [DESKTOP, PHONE]) {
        // A fresh page per width: resizing a loaded page swaps its
        // photographs' sources, and navigating straight away abandons them.
        const page = await freshPage(browser, testInfo, viewport);
        await open(page, path);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(h1);
        await expect(page.getByRole("banner")).toBeVisible();
        await expect(page.locator("footer.site-footer")).toBeVisible();
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
          "href",
          new RegExp(`${path.replace("/", "\\/")}$`),
        );
        await expectNoHorizontalOverflow(page);
        await scrollThrough(page);
        await expectNoHorizontalOverflow(page);
        await page.context().close();
      }
    });
  }

  for (const { path, h1, cta } of FIRST_SCREENS) {
    test(`${path} first screen settles within its budget`, async ({
      browser,
    }, testInfo) => {
      for (const viewport of [PHONE, DESKTOP]) {
        const page = await freshPage(browser, testInfo, viewport);
        const sockets: string[] = [];
        page.on("websocket", (socket) => sockets.push(socket.url()));
        await open(page, path);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(h1);
        const action = cta(page, viewport);
        await expect(action).toBeVisible();
        await expect(action).toBeEnabled();

        // The defined window: what is still open 5 s after the h1 shows is
        // a long-lived request (a stream, a poll, an image that never ends).
        await page.waitForTimeout(SETTLE_MS);
        const where = `${path} at ${viewport.width} px`;
        expect(await stuckRequests(page, testInfo), where).toEqual([]);
        expect(sockets, `${where}: no socket on a marketing page`).toEqual([]);

        const media = await firstScreenMedia(page);
        for (const video of media.videos) {
          expect(["none", "metadata"], `${where}: video preload`).toContain(
            video.preload,
          );
          expect(
            video.poster === null || video.poster.includes("/_next/image"),
            `${where}: a video poster is the full-size original (${video.poster})`,
          ).toBe(true);
          if (video.playing)
            expect(video.inView, `${where}: a video plays off screen`).toBe(
              true,
            );
        }
        if (media.largest) {
          expect(
            media.largest,
            `${where}: the largest visible photograph loads first`,
          ).toMatchObject({ loading: "eager", fetchPriority: "high" });
        }

        const transfer = await firstScreenTransfer(page);
        testInfo.annotations.push({
          type: "first-screen transfer (KiB)",
          description: `${where}: ${JSON.stringify(transfer)}`,
        });
        for (const key of Object.keys(BUDGET_KIB) as Array<
          keyof typeof BUDGET_KIB
        >) {
          expect(
            transfer[key],
            `${where}: ${key} transfer ${transfer[key]} KiB over ${BUDGET_KIB[key]} KiB`,
          ).toBeLessThanOrEqual(BUDGET_KIB[key]);
        }
        await settle(page);
        await page.context().close();
      }
    });
  }

  test("no page loads a legacy stylesheet", async ({ page }) => {
    for (const { path } of PAGES) {
      await open(page, path);
      // The rules the document applies (a prefetched sheet for another
      // route is never applied, so it does not count).
      const css = await page.evaluate(() =>
        [...document.styleSheets]
          .map((sheet) => {
            try {
              return [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
            } catch {
              return "";
            }
          })
          .join("\n"),
      );
      expect(css.length, path).toBeGreaterThan(0);
      for (const marker of LEGACY_MARKERS) {
        expect(css.includes(`${marker} {`), `${path} ${marker}`).toBe(false);
      }
    }
  });

  test("reduced motion shows every concept at its end state", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(DESKTOP);
    for (const { path } of PAGES) {
      await open(page, path);
      await scrollThrough(page);
      await expect(
        page.locator('[data-phase="armed"], [data-phase="play"]'),
        path,
      ).toHaveCount(0);
      await expect(page.locator(".site-photo__video"), path).toHaveCount(0);
      const longest = await page.evaluate(() =>
        Math.max(
          0,
          ...document
            .getAnimations()
            .filter((animation) => animation.playState === "running")
            .map((animation) => {
              const timing = animation.effect?.getComputedTiming();
              return timing?.iterations === Infinity
                ? 0
                : Number(timing?.duration ?? 0);
            }),
        ),
      );
      expect(longest, path).toBeLessThanOrEqual(200);
    }
    // The Sand Rating story rests on its last step: the rating has moved.
    await open(page, "/sand-rating");
    await expect(
      page.getByText("Confirmed by both sides. Counted."),
    ).toBeVisible();
  });

  test("pricing prints exactly the plan tables", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await open(page, "/pricing");
    for (const plan of Object.values(ORGANIZATION_PLANS)) {
      await expect(page.getByTestId(`price-${plan.id}`)).toHaveText(
        dollars(plan.monthlyPriceMinor),
      );
      await expect(page.getByTestId(`fee-${plan.id}`)).toHaveText(
        plan.defaultCommissionBps === 0
          ? "No Duna fee on sales"
          : `${plan.defaultCommissionBps / 100}% fee on sales`,
      );
    }
    for (const plan of Object.values(MEMBERSHIP_PLANS)) {
      await expect(page.getByTestId(`price-${plan.id}`)).toHaveText(
        dollars(plan.monthlyPriceMinor),
      );
    }
    await page.getByRole("radio", { name: "Yearly" }).click();
    for (const plan of [
      ...Object.values(ORGANIZATION_PLANS),
      ...Object.values(MEMBERSHIP_PLANS),
    ]) {
      await expect(page.getByTestId(`price-${plan.id}`)).toHaveText(
        dollars(plan.annualPriceMinor),
      );
    }
    // The calculator's example: a $40 card booking on the Free plan.
    const serviceFee = Math.round((4_000 * DUNA_SERVICE_FEE_BPS) / 10_000);
    const planFee = Math.round(
      (4_000 * ORGANIZATION_PLANS.coach.defaultCommissionBps) / 10_000,
    );
    await expect(page.getByTestId("calc-service")).toHaveText(
      `$${(serviceFee / 100).toFixed(2)}`,
    );
    await expect(page.getByTestId("calc-pays")).toHaveText(
      `$${((4_000 + serviceFee) / 100).toFixed(2)}`,
    );
    await expect(page.getByTestId("calc-org")).toHaveText(
      `−$${(planFee / 100).toFixed(2)}`,
    );
    // Premium removes the player's service fee.
    await page.getByRole("radio", { name: "Yes" }).click();
    await expect(page.getByTestId("calc-service")).toHaveText("$0.00");
    await expect(page.getByTestId("calc-pays")).toHaveText("$40.00");
    // The FAQ answers are on the page and open with a click.
    await page.getByText("Who pays card processing?").click();
    await expect(page.getByText(/out of the booking price/)).toBeVisible();
  });

  test("every Pro Tour address still resolves in the new shell", async ({
    page,
    request,
  }) => {
    for (const path of [
      "/pro",
      "/pro?tour=elite",
      "/pro?tour=avp&date=2026-07-04",
      "/pro/onboarding-complete",
      "/pro/onboarding-complete?billing=success",
    ]) {
      await open(page, path);
      await expect(page.getByRole("banner"), path).toBeVisible();
    }
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Your club is ready to run.",
    );
    // A team page answers (a team the feed knows, or the site's not-found).
    const team = await request.get("/pro/teams/1", { maxRedirects: 0 });
    expect(team.status()).toBeLessThan(500);
    await open(page, "/pro?tour=elite");
    await expect(
      page
        .getByRole("navigation", { name: "Filter by tour" })
        .getByRole("link", { name: "Elite" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("moved addresses answer with a permanent redirect", async ({
    request,
  }) => {
    for (const [from, to] of [
      ["/methodology", "/sand-rating"],
      ["/run-your-club/training", "/coaches"],
      ["/run-your-club/training-os", "/coaches"],
      ["/run-your-club/features", "/run-your-club"],
      ["/apps/apple-watch", "/apps"],
    ] as const) {
      const response = await request.get(from, { maxRedirects: 0 });
      expect(response.status(), from).toBe(301);
      expect(
        new URL(response.headers().location!, "http://localhost").pathname,
        from,
      ).toBe(to);
    }
  });

  test("the header's For coaches link opens Duna Pro for coaches", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await open(page, "/run-your-club");
    await page
      .getByRole("banner")
      .getByRole("link", { name: "For coaches", exact: true })
      .click();
    await expect(page).toHaveURL(/\/coaches$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Your coaching day, in your pocket.",
    );
  });

  test("each page passes the accessibility scan", async ({
    browser,
  }, testInfo) => {
    for (const viewport of [DESKTOP, PHONE]) {
      // One page per width, never a resize and reload (see freshPage).
      const page = await freshPage(browser, testInfo, viewport);
      for (const { path } of PAGES) {
        await open(page, path);
        await expectAccessible(page);
      }
      await settle(page);
      await page.context().close();
    }
  });
});
