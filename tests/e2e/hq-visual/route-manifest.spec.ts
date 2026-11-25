import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { expect, test } from "@playwright/test";
import { skippedPages, visualRoutes } from "./routes";

const appDirectory = join(__dirname, "..", "..", "..", "apps", "hq", "app");

function pagePatterns(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return pagePatterns(path);
    if (entry.name !== "page.tsx") return [];
    const route = relative(appDirectory, directory).split(sep).join("/");
    return [`/${route}`];
  });
}

test("the route matrix accounts for every HQ page", ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "The manifest check is viewport independent.",
  );
  const pages = pagePatterns(appDirectory).sort();
  const covered = new Set(visualRoutes.map((route) => route.page));
  const skipped = new Set(skippedPages.map((entry) => entry.page));

  const unaccounted = pages.filter(
    (page) => !covered.has(page) && !skipped.has(page),
  );
  expect(
    unaccounted,
    "Add each new page.tsx to visualRoutes, or to skippedPages with a reason",
  ).toEqual([]);

  const stale = [...covered, ...skipped].filter(
    (page) => !pages.includes(page),
  );
  expect(stale, "These manifest entries no longer match a page.tsx").toEqual(
    [],
  );
  expect(
    [...covered].filter((page) => skipped.has(page)),
    "A page cannot be both covered and skipped",
  ).toEqual([]);

  const names = visualRoutes.map((route) => route.name);
  expect(new Set(names).size, "Screenshot names must be unique").toBe(
    names.length,
  );
});
