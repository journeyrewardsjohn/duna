/**
 * Which pages to read after the home page, and robots.txt. Pure functions.
 *
 * Duna reads a bounded set of pages a club site usually has: about,
 * contact, locations, programs / lessons, pricing, staff, policies. Links
 * come from the home page; anything off-site, a file, or disallowed by
 * robots.txt is never read.
 */
import { setupLimits } from "./limits";
import { isSameSite, normaliseSetupUrl } from "./url-safety";

export const setupPageTopics = [
  "contact",
  "about",
  "locations",
  "programs",
  "pricing",
  "staff",
  "policies",
] as const;
export type SetupPageTopic = (typeof setupPageTopics)[number];

const topicPatterns: Readonly<Record<SetupPageTopic, RegExp>> = {
  contact:
    /(?:^|[/_-])(?:contact|contact-us|find-us|get-in-touch|visit)(?:$|[/_.-])/,
  about:
    /(?:^|[/_-])(?:about|about-us|our-club|our-story|who-we-are|club)(?:$|[/_.-])/,
  locations:
    /(?:^|[/_-])(?:locations?|venues?|facilit(?:y|ies)|courts?|directions|where)(?:$|[/_.-])/,
  programs:
    /(?:^|[/_-])(?:programs?|programmes?|lessons?|coaching|clinics?|camps?|juniors?|youth|adults?|leagues?|classes|training|academy)(?:$|[/_.-])/,
  pricing:
    /(?:^|[/_-])(?:pricing|prices|rates|fees|memberships?|join|book(?:ing)?)(?:$|[/_.-])/,
  staff:
    /(?:^|[/_-])(?:staff|coaches|coach|team|our-team|instructors|people)(?:$|[/_.-])/,
  policies:
    /(?:^|[/_-])(?:polic(?:y|ies)|terms|cancellation|refunds?|waivers?|faq|rules|code-of-conduct|weather)(?:$|[/_.-])/,
};

const fileExtension =
  /\.(?:pdf|jpe?g|png|gif|webp|svg|mp4|mov|zip|docx?|xlsx?|pptx?|ics|xml|json|css|js)$/i;

export interface PlannedPage {
  readonly url: string;
  readonly topic: SetupPageTopic;
}

/**
 * Picks at most one page per topic, in topic order, up to the page cap
 * (minus the home page). Only same-site, safe, non-file links qualify.
 */
export function planPages(
  homeUrl: string,
  links: readonly string[],
  robots?: RobotsRules,
): PlannedPage[] {
  const seen = new Set<string>([stripTrailingSlash(homeUrl)]);
  const byTopic = new Map<SetupPageTopic, string>();
  for (const raw of links) {
    let absolute: string;
    try {
      absolute = new URL(raw, homeUrl).toString();
    } catch {
      continue;
    }
    const checked = normaliseSetupUrl(absolute);
    if (!checked.ok) continue;
    const url = new URL(checked.url);
    url.search = "";
    const candidate = stripTrailingSlash(url.toString());
    if (seen.has(candidate)) continue;
    if (!isSameSite(candidate, homeUrl)) continue;
    if (fileExtension.test(url.pathname)) continue;
    if (robots && !isAllowedByRobots(robots, url.pathname)) continue;
    seen.add(candidate);
    const path = url.pathname.toLowerCase();
    if (path === "/" || path.split("/").length > 4) continue;
    for (const topic of setupPageTopics) {
      if (!byTopic.has(topic) && topicPatterns[topic].test(path)) {
        byTopic.set(topic, candidate);
        break;
      }
    }
  }
  return setupPageTopics
    .flatMap((topic) => {
      const url = byTopic.get(topic);
      return url ? [{ url, topic }] : [];
    })
    .slice(0, setupLimits.maxPages - 1);
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") && new URL(url).pathname !== "/"
    ? url.slice(0, -1)
    : url;
}

export interface RobotsRules {
  readonly allow: readonly string[];
  readonly disallow: readonly string[];
}

/**
 * Reads the rules that apply to Duna: a group naming Duna or the hosted
 * reader, else the `*` group. Unknown or unreadable files allow everything.
 */
export function parseRobots(text: string | undefined): RobotsRules {
  const empty = { allow: [], disallow: [] };
  if (!text) return empty;
  type Group = { agents: string[]; allow: string[]; disallow: string[] };
  const groups: Group[] = [];
  let current: Group | undefined;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/).slice(0, 2_000)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const match = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!match) continue;
    const field = match[1]!.toLowerCase();
    const value = match[2]!.trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === "allow" && value) current.allow.push(value);
    if (field === "disallow" && value) current.disallow.push(value);
  }
  const named = groups.find((group) =>
    group.agents.some((agent) => /duna|firecrawl/.test(agent)),
  );
  const any = groups.find((group) => group.agents.includes("*"));
  const chosen = named ?? any;
  return chosen ? { allow: chosen.allow, disallow: chosen.disallow } : empty;
}

function ruleMatches(rule: string, path: string): boolean {
  const anchored = rule.endsWith("$");
  const body = anchored ? rule.slice(0, -1) : rule;
  const pattern = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(path);
}

/** Longest matching rule wins; Allow wins a tie (RFC 9309). */
export function isAllowedByRobots(rules: RobotsRules, path: string): boolean {
  let best = { length: -1, allow: true };
  for (const rule of rules.disallow) {
    if (ruleMatches(rule, path) && rule.length > best.length) {
      best = { length: rule.length, allow: false };
    }
  }
  for (const rule of rules.allow) {
    if (ruleMatches(rule, path) && rule.length >= best.length) {
      best = { length: rule.length, allow: true };
    }
  }
  return best.allow;
}
