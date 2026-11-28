import { hqRoutes } from "@duna/core/hq-routes";
import {
  operatorModules,
  operatorNavigationGroups,
  operatorNavigationItems,
  type OperatorModule,
  type OperatorNavigationGroup,
} from "../navigation";

/**
 * Pure navigation state for the HQ shell (no React, no DOM), so the rules are
 * unit-tested: which sidebar item a path belongs to, the groups in IA order,
 * and the remembered sidebar mode.
 */

export type NavItem = (typeof operatorNavigationItems)[number];

export interface NavGroup {
  readonly name: OperatorNavigationGroup;
  readonly items: readonly NavItem[];
}

/** The sidebar, grouped in the owner's order (docs/design/tideline-4.1.1/ia-hq.md). */
export function navigationGroups(
  items: readonly NavItem[] = operatorNavigationItems,
): readonly NavGroup[] {
  return operatorNavigationGroups
    .map((name) => ({
      name,
      items: items.filter((item) => item.group === name),
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * Paths that belong to an area without starting with its address: Club setup
 * owns places and the first run, Events owns leagues.
 */
const areaPrefixes: readonly (readonly [string, OperatorModule])[] = [
  [hqRoutes.places, "setup"],
  [hqRoutes.setupStart, "setup"],
  [hqRoutes.settings, "settings"],
  [hqRoutes.account, "settings"],
  ["/ask", "ask"],
];

function startsWithSegment(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * The area a path belongs to: the module whose address is the longest prefix
 * of the path. `/` is Today only when it is exactly `/`. Unknown paths have
 * no current item (`undefined`), never a wrong one.
 */
export function activeModuleForPath(
  pathname: string,
): OperatorModule | undefined {
  const path = pathname.split(/[?#]/)[0]?.replace(/\/+$/, "") || "/";
  if (path === "/") return "today";
  for (const [prefix, module] of areaPrefixes) {
    if (startsWithSegment(path, prefix)) return module;
  }
  let best: { module: OperatorModule; length: number } | undefined;
  for (const item of operatorModules) {
    const href = item.href.split("?")[0]!;
    if (href === "/") continue;
    if (startsWithSegment(path, href) && href.length > (best?.length ?? 0)) {
      best = { module: item.slug, length: href.length };
    }
  }
  return best?.module;
}

/** The label for an area, for the top bar and Ask Duna's page context. */
export function moduleLabel(module: OperatorModule | undefined): string {
  if (!module) return "HQ";
  return operatorModules.find((item) => item.slug === module)?.label ?? "HQ";
}

/** Sidebar modes. Narrow is not stored: it follows the window width. */
export type SidebarMode = "expanded" | "collapsed";

/** Where a person's sidebar choice is remembered (per browser profile). */
export const SIDEBAR_STORAGE_KEY = "duna-hq-sidebar";

export function parseSidebarMode(
  value: string | null | undefined,
): SidebarMode | undefined {
  return value === "expanded" || value === "collapsed" ? value : undefined;
}

/**
 * The phone bar keeps the four most used areas; everything else, Ask Duna
 * and the account open from "More" (IA: every function reachable at 375 px).
 */
export const phoneBarModules = [
  "today",
  "schedule",
  "inbox",
  "people",
] as const satisfies readonly OperatorModule[];

export function isPhoneBarModule(module: OperatorModule | undefined): boolean {
  return (phoneBarModules as readonly string[]).includes(module ?? "");
}
