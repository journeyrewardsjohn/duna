import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  hqAdminModuleSlugs,
  hqHref,
  hqLeaguesPath,
  hqModuleHref,
  hqOperatorModuleSlugs,
  hqRoutes,
  isHqDevOnlyRoute,
} from "./hq-routes";

const hqApp = resolve(import.meta.dirname, "../../../apps/hq/app");
// HQ has two root layouts (docs/design/hq-shell.md): rebuilt pages live in
// (next), pages not yet rebuilt in (legacy). Neither group is in the URL.
const hqRootGroups = ["(legacy)", "(next)"] as const;
const servedBy = (...path: string[]) =>
  hqRootGroups.some((group) => existsSync(join(hqApp, group, ...path)));

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
  // The Tideline gallery (/tideline) is a flag-gated development surface,
  // served as a 404 in production and deliberately absent from the product
  // route map. Every other page.tsx must still be mapped.
  const filesystem = new Set(
    pageTemplates(hqApp).filter((template) => !isHqDevOnlyRoute(template)),
  );
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
      readFileSync(join(hqApp, "(legacy)/[module]/page.tsx"), "utf8"),
      readFileSync(join(hqApp, "(legacy)/admin/[module]/page.tsx"), "utf8"),
    ].join("\n");
    for (const slug of [...hqOperatorModuleSlugs, ...hqAdminModuleSlugs]) {
      expect(sources, slug).toContain(`"${slug}"`);
    }
    for (const slug of hqOperatorModuleSlugs) {
      expect(servedBy(slug, "page.tsx"), slug).toBe(false);
    }
    for (const slug of hqAdminModuleSlugs) {
      expect(servedBy("admin", slug, "page.tsx"), slug).toBe(false);
    }
  });

  it("fails for an entry whose page.tsx does not exist", () => {
    // The first check above is what keeps entries honest; prove it bites.
    const withGhost = [...templates, "/no-such-hq-page"];
    expect(withGhost.filter((template) => !filesystem.has(template))).toEqual([
      "/no-such-hq-page",
    ]);
  });

  it("keeps no address the IA retired (docs/plan/s2-route-map.md)", () => {
    // Old prefixes moved without aliases. /activities and /programs stay
    // until package B4 removes them; /stripe/return is a provider address.
    const retired = [
      "/audiences",
      "/calendar",
      "/leagues",
      "/locations",
      "/members",
      "/messages",
      "/onboarding",
      "/payments",
      "/products",
      "/promo-codes",
      "/settings/theme",
    ];
    const concrete = [
      ...templates,
      ...hqOperatorModuleSlugs.map((slug) => hqModuleHref(slug)),
      hqLeaguesPath,
    ];
    for (const path of concrete) {
      for (const prefix of retired) {
        expect(
          path === prefix || path.startsWith(`${prefix}/`),
          `${path} uses the retired ${prefix}`,
        ).toBe(false);
      }
    }
    expect(hqLeaguesPath.split("?")[0]).toBe(hqModuleHref("events"));
  });

  it("treats only the gallery as development-only", () => {
    expect(isHqDevOnlyRoute("/tideline")).toBe(true);
    expect(isHqDevOnlyRoute("/tideline/book-lesson")).toBe(true);
    expect(isHqDevOnlyRoute("/tidelines")).toBe(false);
    expect(isHqDevOnlyRoute("/settings")).toBe(false);
    expect(templates.some(isHqDevOnlyRoute)).toBe(false);
  });

  it("builds encoded concrete paths", () => {
    expect(hqHref("home")).toBe("/");
    expect(hqHref("money")).toBe("/money");
    expect(
      hqHref("eventDivision", { sessionId: "s 1", divisionId: "d/2" }),
    ).toBe("/events/s%201/divisions/d%2F2");
    expect(hqHref("ask")).toBe("/ask");
    expect(hqHref("ask", { conversation: "abc" })).toBe("/ask/abc");
    expect(hqModuleHref("schedule")).toBe("/schedule");
    expect(hqHref("place", { venueId: "v1" })).toBe("/setup/places/v1");
    expect(() =>
      hqHref("member", { personId: "" } as { personId: string }),
    ).toThrow(TypeError);
  });
});
