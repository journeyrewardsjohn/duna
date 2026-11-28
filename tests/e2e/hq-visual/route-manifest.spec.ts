import { expect, test } from "@playwright/test";
import {
  hqRoutes,
  isHqDevOnlyRoute,
} from "../../../packages/core/src/hq-routes";
import { skippedPages, visualRoutes } from "./routes";

/**
 * Every page template in the central HQ route map (`@duna/core/hq-routes`),
 * minus development-only surfaces such as the Tideline gallery, which is a
 * 404 in production. `packages/core/src/hq-routes.test.ts` keeps the map in
 * step with the `page.tsx` files on disk.
 */
const mappedPages = (): string[] =>
  [...new Set(Object.values(hqRoutes))]
    .filter((page) => !isHqDevOnlyRoute(page))
    .sort();

test("the route matrix accounts for every HQ page", ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "The manifest check is viewport independent.",
  );
  const pages = mappedPages();
  const covered = new Set(visualRoutes.map((route) => route.page));
  const skipped = new Set(skippedPages.map((entry) => entry.page));

  const unaccounted = pages.filter(
    (page) => !covered.has(page) && !skipped.has(page),
  );
  expect(
    unaccounted,
    "Add each new route in hq-routes.ts to visualRoutes, or to skippedPages with a reason",
  ).toEqual([]);

  const stale = [...covered, ...skipped].filter(
    (page) => !pages.includes(page),
  );
  expect(
    stale,
    "These manifest entries no longer match a route in hq-routes.ts",
  ).toEqual([]);
  expect(
    [...covered].filter((page) => skipped.has(page)),
    "A page cannot be both covered and skipped",
  ).toEqual([]);

  const names = visualRoutes.map((route) => route.name);
  expect(new Set(names).size, "Screenshot names must be unique").toBe(
    names.length,
  );
});
