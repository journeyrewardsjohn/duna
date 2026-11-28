import { expect, type Page } from "@playwright/test";
import type { VisualRoute } from "./routes";

/**
 * The instant both clocks are pinned to: 09:30 on Thursday 30 July 2026 in
 * the demo organization's timezone, inside the demo adapter's schedule.
 * `playwright.hq-visual.config.ts` hands the same value to the HQ server.
 */
export const visualNow = "2026-07-30T16:30:00.000Z";
export const visualTimezone = "America/Los_Angeles";

export const themes = ["light", "dark"] as const;
export type VisualTheme = (typeof themes)[number];

const fontHost = /^https:\/\/(?:api|cdn)\.fontshare\.com\//;

/**
 * Regions that never render the same pixels twice, masked on every route:
 * WebGL and 2D canvases, media elements, and embedded documents.
 */
export const globalMasks = ["canvas", "video", "iframe"] as const;

/**
 * Loads one route in one theme and waits until it can no longer change:
 * clock pinned, motion reduced, third-party requests blocked, Satoshi
 * loaded, images decoded.
 */
export async function openRoute(
  page: Page,
  baseURL: string | undefined,
  route: VisualRoute,
  theme: VisualTheme,
): Promise<void> {
  if (!baseURL) throw new Error("The HQ visual suite needs a baseURL");
  const origin = new URL(baseURL).origin;
  await page.clock.setFixedTime(new Date(visualNow));
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });

  await page.route(
    (url) => url.origin !== origin,
    async (request) => {
      const url = request.request().url();
      if (!fontHost.test(url)) return request.abort();
      // Satoshi is the one third-party asset the page cannot render without.
      const headers = request.request().headers();
      delete headers["x-forwarded-for"];
      return request.continue({ headers });
    },
  );

  await page.goto(route.path, { waitUntil: "load" });
  if (route.landsOn) await expect(page).toHaveURL(origin + route.landsOn);
  await page.waitForLoadState("networkidle");

  // No scroll pass: HQ has no intersection-driven content, and scrolling
  // promotes sticky panels to their own layers, which shifts the
  // antialiasing of their rounded corners from one run to the next.
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images, (image) =>
        image.complete
          ? undefined
          : new Promise<void>((resolve) => {
              image.addEventListener("load", () => resolve(), { once: true });
              image.addEventListener("error", () => resolve(), { once: true });
            }),
      ),
    );
    await document.fonts.ready;
  });
  await page.waitForLoadState("networkidle");

  await fitViewportToContent(page);

  // Rebuild every paint layer from the settled DOM. A sticky panel at a
  // fractional offset keeps whichever pixel snapping it was first rasterized
  // with, and that depends on how far loading had progressed at the time.
  await page.evaluate(async () => {
    const root = document.documentElement;
    const focused = document.activeElement;
    // At scroll offset zero a sticky box that sits in its flow position
    // paints exactly where a static one would, without a layer of its own.
    for (const element of document.querySelectorAll<HTMLElement>("body *")) {
      if (getComputedStyle(element).position !== "sticky") continue;
      const before = element.getBoundingClientRect();
      const inline = element.style.position;
      element.style.position = "static";
      const after = element.getBoundingClientRect();
      if (before.x !== after.x || before.y !== after.y) {
        element.style.position = inline;
      }
    }
    const display = root.style.display;
    root.style.display = "none";
    void root.offsetHeight;
    root.style.display = display;
    if (focused instanceof HTMLElement && focused !== document.body) {
      focused.focus({ preventScroll: true });
    }
    // Rebuilt layers draw images again; wait for full-quality decodes.
    await Promise.all(
      Array.from(document.images, (image) => image.decode().catch(() => {})),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });

  const satoshiLoaded = await page.evaluate(() =>
    Array.from(document.fonts).some(
      (face) =>
        face.family.replace(/["']/g, "") === "Satoshi" &&
        face.status === "loaded",
    ),
  );
  expect(
    satoshiLoaded,
    "Satoshi did not load from Fontshare; a screenshot would capture the fallback font",
  ).toBe(true);

  await expect(
    page.locator("html"),
    `HQ should resolve the ${theme} theme`,
  ).toHaveAttribute("data-theme", theme);
  if (route.name !== "not-found") {
    await expect(
      page.getByText("This page couldn’t load"),
      `${route.path} rendered the error boundary`,
    ).toHaveCount(0);
  }
}

/** Tallest viewport the suite will grow to, in CSS pixels. */
const maxViewportHeight = 12_000;

/**
 * Grows the viewport until neither the document nor the workspace's own
 * scroll container overflows, so one viewport screenshot holds the whole
 * page. HQ scrolls some workspaces inside the shell, where a full-page
 * capture would stop at the fold; and a full-page capture of a tall phone
 * page rasterizes fixed bars differently from run to run.
 */
async function fitViewportToContent(page: Page): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("The HQ visual suite needs a fixed viewport");
  let height = viewport.height;
  for (let pass = 0; pass < 4; pass += 1) {
    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      let extra = root.scrollHeight - window.innerHeight;
      // The workspace scroller: a vertical scroll container that spans most
      // of the viewport. Bounded lists and menus keep their own scrolling.
      for (const element of document.querySelectorAll<HTMLElement>("body *")) {
        if (element.scrollHeight <= element.clientHeight) continue;
        if (!/auto|scroll/.test(getComputedStyle(element).overflowY)) continue;
        if (element.clientHeight < window.innerHeight * 0.6) continue;
        if (element.clientWidth < window.innerWidth * 0.5) continue;
        extra = Math.max(extra, element.scrollHeight - element.clientHeight);
      }
      return Math.ceil(extra);
    });
    if (overflow <= 0 || height >= maxViewportHeight) return;
    height = Math.min(maxViewportHeight, height + overflow);
    await page.setViewportSize({ width: viewport.width, height });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
  }
}

export function masksFor(page: Page, route: VisualRoute) {
  return [...globalMasks, ...(route.mask ?? [])].map((selector) =>
    page.locator(selector),
  );
}
