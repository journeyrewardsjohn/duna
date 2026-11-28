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
