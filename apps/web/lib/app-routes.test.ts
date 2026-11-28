import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP_ROUTES,
  APP_VERBS,
  isDynamicRoute,
  isShellRoute,
  NEW_ACTIONS,
  routeForPath,
  routesForVerb,
  signInHref,
  verbForPath,
  type AppRoute,
} from "./app-routes";

const appDirectory = join(__dirname, "..", "app");
const trees = [
  { root: join(appDirectory, "(legacy)", "app"), rebuilt: false },
  { root: join(appDirectory, "(next)", "(app)", "app"), rebuilt: true },
];

/** Every `page.tsx` under a tree, as the address it serves. */
function pagesUnder(root: string): string[] {
  const found: string[] = [];
  const walk = (directory: string) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name === "page.tsx") {
        const folder = relative(root, directory).split(sep).filter(Boolean);
        const segments = folder.filter(
          (segment) => !(segment.startsWith("(") && segment.endsWith(")")),
        );
        found.push(["/app", ...segments].join("/"));
      }
    }
  };
  try {
    walk(root);
  } catch {
    // A tree that does not exist yet has no pages.
  }
  return found;
}

const table = Object.values(APP_ROUTES as Record<string, AppRoute>);

describe("the Player web route table", () => {
  it("lists every page of the signed-in app, in the tree it lives in", () => {
    for (const tree of trees) {
      for (const page of pagesUnder(tree.root)) {
        const entry = table.find((candidate) => candidate.path === page);
        expect(entry, `${page} is not in lib/app-routes.ts`).toBeDefined();
        expect(
          entry?.rebuilt,
          `${page}: rebuilt must be ${tree.rebuilt} (it lives in ${relative(appDirectory, tree.root)})`,
        ).toBe(tree.rebuilt);
      }
    }
  });

  it("has a page for every /app entry", () => {
    const pages = trees.flatMap((tree) => pagesUnder(tree.root));
    for (const entry of table.filter((candidate) => !candidate.external)) {
      expect(pages, `${entry.path} has no page.tsx`).toContain(entry.path);
    }
  });

  it("gives every verb its root and at least one listed page", () => {
    expect(APP_VERBS.map((verb) => verb.title)).toEqual([
      "Find",
      "Play",
      "Improve",
      "Connect",
    ]);
    for (const verb of APP_VERBS) {
      expect(APP_ROUTES[verb.root].verb).toBe(verb.key);
      expect(routesForVerb(verb.key).length).toBeGreaterThan(0);
    }
  });

  it("never lists a dynamic address in the navigation", () => {
    for (const entry of table.filter((candidate) => candidate.listed)) {
      expect(isDynamicRoute(entry), entry.path).toBe(false);
    }
  });

  it("hides adult-only pages and actions from juniors", () => {
    const junior = APP_VERBS.flatMap((verb) =>
      routesForVerb(verb.key, { junior: true }),
    );
    expect(junior.some((entry) => entry.adultOnly)).toBe(false);
    expect(NEW_ACTIONS.find((action) => action.key === "host-pickup")).toEqual(
      expect.objectContaining({ adultOnly: true }),
    );
  });

  it("resolves addresses, dynamic segments included", () => {
    expect(routeForPath("/app")?.title).toBe("Home");
    expect(routeForPath("/app/matches/0b7c")?.title).toBe("Match");
    expect(routeForPath("/app/pickup/sunset/edit")?.title).toBe("Edit pickup");
    expect(routeForPath("/app/nowhere")).toBeUndefined();
    expect(verbForPath("/app/wallet")).toBe("connect");
    expect(verbForPath("/app/video/abc")).toBe("improve");
    expect(isShellRoute("/app")).toBe(true);
    expect(isShellRoute("/app/wallet")).toBe(false);
  });

  it("keeps the person's place when asking them to sign in", () => {
    expect(signInHref("/app/checkout/serve-receive-lab")).toBe(
      "/sign-in?returnTo=%2Fapp%2Fcheckout%2Fserve-receive-lab",
    );
    expect(signInHref("//evil.example")).toBe("/sign-in?returnTo=%2Fapp");
  });
});
