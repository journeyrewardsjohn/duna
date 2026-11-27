import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  hqAdminModuleSlugs,
  hqHref,
  hqModuleHref,
  hqOperatorModuleSlugs,
  hqRoutes,
} from "./hq-routes";

const hqApp = resolve(import.meta.dirname, "../../../apps/hq/app");

function pageTemplates(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return pageTemplates(path);
    if (name !== "page.tsx") return [];
    const route = relative(hqApp, directory).split(sep).filter(Boolean);
    // Route groups like (tabs) do not appear in the URL.
    const segments = route.filter((s) => !/^\(.+\)$/.test(s));
    return [`/${segments.join("/")}`];
  });
}

describe("HQ route map", () => {
  const filesystem = new Set(pageTemplates(hqApp));
  const templates = Object.values(hqRoutes) as string[];

  it("points every template at a real page.tsx", () => {
    const missing = templates.filter((template) => !filesystem.has(template));
    expect(missing).toEqual([]);
  });

  it("covers every HQ page.tsx (so new pages are added here)", () => {
    const unmapped = [...filesystem].filter((t) => !templates.includes(t));
    expect(unmapped).toEqual([]);
    expect(filesystem.size).toBe(templates.length);
  });

  it("only lists module slugs that HQ still serves and that have no page of their own", () => {
    const sources = [
      readFileSync(join(hqApp, "../components/navigation.ts"), "utf8"),
      readFileSync(join(hqApp, "[module]/page.tsx"), "utf8"),
      readFileSync(join(hqApp, "admin/[module]/page.tsx"), "utf8"),
    ].join("\n");
    for (const slug of [...hqOperatorModuleSlugs, ...hqAdminModuleSlugs]) {
      expect(sources, slug).toContain(`"${slug}"`);
    }
    for (const slug of hqOperatorModuleSlugs) {
      expect(existsSync(join(hqApp, slug, "page.tsx")), slug).toBe(false);
    }
    for (const slug of hqAdminModuleSlugs) {
      expect(existsSync(join(hqApp, "admin", slug, "page.tsx")), slug).toBe(
        false,
      );
    }
  });

  it("builds encoded concrete paths", () => {
    expect(hqHref("home")).toBe("/");
    expect(hqHref("payments")).toBe("/payments");
    expect(
      hqHref("eventDivision", { sessionId: "s 1", divisionId: "d/2" }),
    ).toBe("/events/s%201/divisions/d%2F2");
    expect(hqHref("ask")).toBe("/ask");
    expect(hqHref("ask", { conversation: "abc" })).toBe("/ask/abc");
    expect(hqModuleHref("calendar")).toBe("/calendar");
    expect(() =>
      hqHref("member", { personId: "" } as { personId: string }),
    ).toThrow(TypeError);
  });
});
