import { expect, test } from "@playwright/test";

/**
 * Production safety for the Tideline gallery: without TIDELINE_GALLERY=1,
 * `/tideline` and everything under it is a plain 404 that search engines are
 * told to ignore. Runs in the normal suite, against HQ's production server
 * (the gallery specs themselves only run with the flag, in `gallery-e2e`).
 */
const base =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;

test.skip(
  process.env.TIDELINE_GALLERY === "1",
  "The gallery is enabled for this run",
);

for (const path of [
  "/tideline",
  "/tideline?theme=dark",
  "/tideline/book-lesson",
  "/tideline/time-and-light",
]) {
  test(`${path} is a 404 without the flag`, async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Runs once, on desktop");
    const response = await request.get(`${base}${path}`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(404);
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
    expect(await response.text()).not.toContain("Tideline gallery");
  });
}
