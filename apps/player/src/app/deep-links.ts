import type { Tab } from "./navigation";

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
  | { readonly kind: "live-activity"; readonly tab: Tab };

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
