import { test as base, expect } from "@playwright/test";
import { scanAccessibility } from "./support/a11y";
import { DEMO_PERSONA_COOKIE } from "./support/personas";
import { QualityMonitor } from "./support/quality";
import { test as personaTest, webBaseUrl } from "./support/fixtures";

/**
 * Proves the harness itself: the persona cookie reaches the server, and the
 * automatic checks catch what they promise to catch. These tests drive the
 * monitor directly, so a regression in the harness fails here, not silently.
 */
const origin = new URL(webBaseUrl).origin;
const fakePage = `${origin}/__q0-harness`;

base.describe("persona harness", () => {
  base(
    "the persona cookie chooses who the server sees",
    async ({ request }) => {
      const wallet = (persona: string) =>
        request.get("/api/trpc/player.wallet", {
          headers: { cookie: `${DEMO_PERSONA_COOKIE}=${persona}` },
        });
      expect((await wallet("player")).status()).toBe(200);
      expect((await wallet("visitor")).status()).toBe(401);
    },
  );

  base(
    "the quality monitor catches errors, 5xx, failures and double submits",
    async ({ page, context }) => {
      await QualityMonitor.install(context);
      const monitor = new QualityMonitor([origin]);
      monitor.watch(page);
      await page.route(`${origin}/__q0-api/**`, (route) =>
        route.request().url().endsWith("/fail")
          ? route.fulfill({ status: 503, body: "down" })
          : route.fulfill({ status: 200, body: "{}" }),
      );
      await page.route(fakePage, (route) =>
        route.fulfill({
          contentType: "text/html",
          body: `<!doctype html><html lang="en"><title>Harness</title><main>
          <button id="twice">Book</button>
          <script>
            document.getElementById("twice").addEventListener("click", () => {
              for (let i = 0; i < 2; i += 1)
                fetch("/__q0-api/book", { method: "POST", body: "court=1" });
            });
            console.error("boom from the page");
            Promise.reject(new Error("nobody caught me"));
            fetch("/__q0-api/fail");
            setTimeout(() => { throw new Error("uncaught"); }, 0);
          </script></main></html>`,
        }),
      );
      await page.goto(fakePage);
      await page.getByRole("button", { name: "Book" }).click();
      await expect
        .poll(() => new Set(monitor.issues.map((issue) => issue.kind)).size)
        .toBe(4);
      const kinds = monitor.issues.map((issue) => issue.kind);
      expect(kinds).toContain("console-error");
      expect(kinds).toContain("page-error");
      expect(kinds).toContain("server-error");
      expect(kinds).toContain("duplicate-mutation");
      expect(
        monitor.issues.some((issue) =>
          issue.detail.includes("[unhandledrejection] nobody caught me"),
        ),
      ).toBe(true);
    },
  );

  base(
    "the accessibility scan finds unnamed controls and missing landmarks",
    async ({ page }) => {
      await page.route(fakePage, (route) =>
        route.fulfill({
          contentType: "text/html",
          body: `<!doctype html><html><title>Harness</title>
          <button><svg width="10" height="10"></svg></button>
          <input type="search"></html>`,
        }),
      );
      await page.goto(fakePage);
      const findings = await scanAccessibility(page);
      const rules = findings.map((finding) => finding.rule);
      const unnamed = findings
        .filter((finding) => finding.rule === "unnamed-control")
        .map((finding) => finding.detail);
      expect(unnamed.some((detail) => detail.startsWith("button "))).toBe(true);
      expect(unnamed.some((detail) => detail.startsWith("searchbox "))).toBe(
        true,
      );
      expect(rules).toContain("document-language");
      expect(rules).toContain("main-landmark");
    },
  );
});

// The fixture wiring: a journey that logs a console error fails even though
// its own assertions pass. `test.fail` turns that expected failure green.
personaTest(
  "a journey with a console error fails on its own",
  async ({ page }) => {
    personaTest.fail();
    await page.route(fakePage, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html lang="en"><title>Harness</title><main>
        <h1>Fine</h1><script>console.error("hidden failure")</script>
        </main></html>`,
      }),
    );
    await page.goto(fakePage);
    await expect(page.getByRole("heading", { name: "Fine" })).toBeVisible();
  },
);

// The full WCAG audit (contrast, ARIA rules, landmarks) needs a scanner the
// repository does not have yet. Recommended: @axe-core/playwright (Deque's
// axe-core, MPL-2.0), run on the page each passing journey ends on, from the
// same `accessibilityScan` fixture. Adding it is a dependency change, so the
// lockfile owner adds it; then delete this fixme.
base.fixme(
  "full WCAG scan on every journey page with @axe-core/playwright",
  async () => {},
);
