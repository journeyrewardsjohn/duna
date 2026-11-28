import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "@playwright/test";
import { openRoute, themes } from "./harness";
import { visualRoutes } from "./routes";

/**
 * Records Chromium CSS coverage for every page load in the visual matrix.
 * `scripts/css-usage.ts --runtime` starts this run against the development
 * server and aggregates the fragments it writes; see `pnpm css:coverage:hq`.
 */
const directory = process.env.HQ_CSS_COVERAGE_DIR;

test.skip(!directory, "Run this through `pnpm css:coverage:hq`.");
// The development server compiles each route on first request.
test.setTimeout(180_000);

for (const route of visualRoutes) {
  for (const theme of themes) {
    test(`${route.name} · ${theme}`, async ({ page, baseURL }, testInfo) => {
      const output = directory ?? "";
      await page.coverage.startCSSCoverage({ resetOnNavigation: false });
      await openRoute(page, baseURL, route, theme);
      const entries = await page.coverage.stopCSSCoverage();

      const sheetDirectory = join(output, "sheets");
      const fragmentDirectory = join(output, "fragments");
      mkdirSync(sheetDirectory, { recursive: true });
      mkdirSync(fragmentDirectory, { recursive: true });

      const sheets = [];
      for (const entry of entries) {
        if (!entry.text || !entry.url.startsWith(baseURL ?? "")) continue;
        const hash = createHash("sha256")
          .update(entry.text)
          .digest("hex")
          .slice(0, 16);
        const sheetPath = join(sheetDirectory, `${hash}.css`);
        if (!existsSync(sheetPath)) writeFileSync(sheetPath, entry.text);
        sheets.push({ hash, ranges: entry.ranges });
      }

      writeFileSync(
        join(
          fragmentDirectory,
          `${testInfo.project.name}-${route.name}-${theme}.json`,
        ),
        JSON.stringify({
          route: route.name,
          theme,
          project: testInfo.project.name,
          sheets,
        }),
      );
    });
  }
}
