import type { DiscoverIntentKind } from "../features/find/discover-intent";
import { isRouteKey } from "./router";

const INTENTS: readonly string[] = [
  "find-match",
  "book-court",
  "join-event",
  "watch-pros",
  "search",
];
function isIntent(value: string | null): boolean {
  return value !== null && INTENTS.includes(value);
}
import type { ShellAction } from "./shell-state";

/** Where an old Live Activity link lands (kept for links already on Lock Screens). */
export type LiveActivityDestination = "video" | "home" | "discover";

/**
 * A recognised Player deep link.
 *
 * Captured path segments are returned exactly as they appear in the URL, still
 * percent-encoded. The caller decodes them when it applies the link.
 */
export type PlayerDeepLink =
  | { readonly kind: "vision-remote"; readonly token: string }
  | {
      readonly kind: "match";
      readonly matchId: string;
      readonly shareToken?: string;
    }
  | { readonly kind: "match-claim"; readonly token: string }
  | { readonly kind: "waiver"; readonly query: string }
  | { readonly kind: "ai" }
  | { readonly kind: "messages"; readonly conversationId?: string }
  | { readonly kind: "booking"; readonly bookingId: string }
  | { readonly kind: "session"; readonly sessionId: string }
  | { readonly kind: "court"; readonly venueId: string }
  | { readonly kind: "find" }
  | {
      readonly kind: "live-activity";
      readonly tab: LiveActivityDestination;
    };

/**
 * Classifies an incoming URL. Rules are checked in a fixed order and the first
 * match wins; an unrecognised or missing URL returns `undefined`.
 */
export function parsePlayerDeepLink(
  url: string | null,
): PlayerDeepLink | undefined {
  const visionRemote = url?.match(/^duna:\/\/vision\/remote\/([^/?#]+)/)?.[1];
  if (visionRemote) {
    return { kind: "vision-remote", token: visionRemote };
  }
  const matchDetailId =
    url?.match(/^duna:\/\/matches\/([^/?#]+)/)?.[1] ??
    url?.match(/^https?:\/\/[^/]+\/matches\/([^/?#]+)/)?.[1];
  if (matchDetailId && url) {
    let shareToken: string | undefined;
    try {
      shareToken = new URL(url).searchParams.get("notes") ?? undefined;
    } catch {
      shareToken = undefined;
    }
    return {
      kind: "match",
      matchId: matchDetailId,
      ...(shareToken ? { shareToken } : {}),
    };
  }
  const matchClaimToken = url?.match(/^duna:\/\/join\/match\/([^/?#]+)/)?.[1];
  if (matchClaimToken) {
    return { kind: "match-claim", token: matchClaimToken };
  }
  if (url?.startsWith("duna://waiver/complete")) {
    return { kind: "waiver", query: url.split("?")[1] ?? "" };
  }
  if (url?.startsWith("duna://ai")) {
    return { kind: "ai" };
  }
  if (url?.startsWith("duna://messages")) {
    const conversationId = url.match(/^duna:\/\/messages\/([^/?#]+)/)?.[1];
    return { kind: "messages", ...(conversationId ? { conversationId } : {}) };
  }
  const bookingMatch = url?.match(/^duna:\/\/booking\/([^/?#]+)/);
  if (bookingMatch?.[1]) {
    return { kind: "booking", bookingId: bookingMatch[1] };
  }
  const sessionId = url?.match(/^duna:\/\/sessions\/([^/?#]+)/)?.[1];
  if (sessionId) return { kind: "session", sessionId };
  const courtVenueId = url?.match(/^duna:\/\/courts\/([^/?#]+)/)?.[1];
  if (courtVenueId) return { kind: "court", venueId: courtVenueId };
  if (url === "duna://find" || url?.startsWith("duna://find?")) {
    return { kind: "find" };
  }
  const match = url?.match(/^duna:\/\/live\/([^/]+)\//);
  if (!match) return undefined;
  return {
    kind: "live-activity",
    tab:
      match[1] === "upload"
        ? "video"
        : match[1] === "upcoming"
          ? "home"
          : "discover",
  };
}

/**
 * The shell navigation a link causes, if any. Links that open a sheet or the
 * browser (a match, a claim, a waiver, the Vision remote) return `null`; the
 * shell applies those effects itself. Every link the app has ever shipped
 * resolves to a place in the new navigation (`deep-links.test.ts`).
 */
export function deepLinkNavigation(link: PlayerDeepLink): ShellAction | null {
  switch (link.kind) {
    case "ai":
      return { type: "open", route: "ai" };
    case "messages": {
      const decoded = link.conversationId
        ? safeDecode(link.conversationId)
        : undefined;
      return {
        type: "open",
        route: "messages",
        ...(decoded ? { conversationId: decoded } : {}),
      };
    }
    case "session":
      return {
        type: "open",
        route: "session",
        targetId: safeDecode(link.sessionId),
      };
    case "court":
      return {
        type: "open",
        route: "court",
        targetId: safeDecode(link.venueId),
      };
    case "find":
      return { type: "open", route: "discover" };
    case "booking":
      // The booking opens as a sheet over Plans.
      return { type: "open", route: "plans" };
    case "live-activity":
      if (link.tab === "video") return { type: "open", route: "video" };
      if (link.tab === "home") return { type: "select-tab", tab: "play" };
      return { type: "open", route: "discover" };
    case "vision-remote":
    case "match":
    case "match-claim":
    case "waiver":
      return null;
  }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Where a Duna web path (from Ask Duna or a shared link) opens in the app. */
export type InternalPathTarget =
  | { readonly kind: "event"; readonly identifier: string }
  | { readonly kind: "venue"; readonly venueId: string }
  | { readonly kind: "club"; readonly slug: string }
  | { readonly kind: "booking"; readonly bookingId: string }
  | {
      readonly kind: "match";
      readonly matchId: string;
      readonly shareToken?: string;
    }
  | { readonly kind: "navigate"; readonly action: ShellAction }
  | { readonly kind: "browser" };

/**
 * Classifies a Duna path or URL. Pure; `DunaApp` applies the result. An
 * event path that the app cannot find locally falls back to the browser at
 * the call site.
 */
export function internalPathTarget(href: string): InternalPathTarget {
  let path = href;
  if (/^https?:\/\//i.test(href)) {
    try {
      const url = new URL(href);
      path = `${url.pathname}${url.search}`;
    } catch {
      return { kind: "browser" };
    }
  }
  const event = path.match(/^\/events\/([^/?#]+)/)?.[1];
  if (event) return { kind: "event", identifier: safeDecode(event) };
  const venue = path.match(/^\/venues\/([^/?#]+)/)?.[1];
  if (venue) return { kind: "venue", venueId: safeDecode(venue) };
  const club = path.match(/^\/clubs\/([^/?#]+)/)?.[1];
  if (club) return { kind: "club", slug: safeDecode(club) };
  const booking = path.match(/^\/(?:app\/)?bookings?\/([^/?#]+)/)?.[1];
  if (booking) return { kind: "booking", bookingId: safeDecode(booking) };
  const match = path.match(/^\/(?:app\/)?matches\/([^/?#]+)/)?.[1];
  if (match) {
    const query = path.includes("?") ? path.slice(path.indexOf("?")) : "";
    const shareToken = new URLSearchParams(query).get("notes") ?? undefined;
    return {
      kind: "match",
      matchId: safeDecode(match),
      ...(shareToken ? { shareToken } : {}),
    };
  }
  if (/^\/app\/matches(?:\/|$)/.test(path))
    return { kind: "navigate", action: { type: "open", route: "performance" } };
  if (/^\/(?:app\/)?discover(?:\/|$)/.test(path))
    return { kind: "navigate", action: { type: "open", route: "discover" } };
  if (/^\/app\/play(?:\/|$)/.test(path))
    return { kind: "navigate", action: { type: "open", route: "plans" } };
  if (path === "/app" || path.startsWith("/app?"))
    return { kind: "navigate", action: { type: "select-tab", tab: "play" } };
  return { kind: "browser" };
}

/** A preview-build link that drives the shell on a simulator without touch. */
export interface DevShellLink {
  readonly actions: readonly ShellAction[];
  readonly theme?: "light" | "dark" | "system";
}

/**
 * `duna://dev/shell?tab=find&route=session&id=<occurrence>&theme=dark&sheet=new` (preview
 * builds only; DunaApp ignores it otherwise). Unknown values are ignored.
 */
export function parseDevShellUrl(url: string | null): DevShellLink | null {
  if (!url?.startsWith("duna://dev/shell")) return null;
  const query = new URLSearchParams(url.split("?")[1] ?? "");
  const actions: ShellAction[] = [];
  const tab = query.get("tab");
  if (
    tab === "find" ||
    tab === "play" ||
    tab === "improve" ||
    tab === "connect"
  )
    actions.push({ type: "select-tab", tab });
  const route = query.get("route");
  const id = query.get("id");
  if (route && isRouteKey(route))
    actions.push({
      type: "open",
      route,
      ...(id ? { targetId: id } : {}),
      // A detail's first step, for screenshots ("book", "waitlist").
      ...(query.get("step") ? { prompt: query.get("step")! } : {}),
      ...(isIntent(query.get("intent"))
        ? { intent: query.get("intent") as DiscoverIntentKind }
        : {}),
    });
  if (query.get("sheet") === "new") actions.push({ type: "open-sheet" });
  const theme = query.get("theme");
  return {
    actions,
    ...(theme === "light" || theme === "dark" || theme === "system"
      ? { theme }
      : {}),
  };
}
