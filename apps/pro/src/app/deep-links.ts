/**
 * Every Duna Pro link and where it lands in the new shell (M-R0). Pure;
 * `ProApp` applies the result and `deep-links.test.ts` pins every link the
 * app has shipped:
 *
 * - `duna-pro://messages` and `duna-pro://messages/<conversation>`: push
 *   notifications for new messages (`packages/api/src/messaging-notifications.ts`).
 * - `duna-pro://session/<id>`: the coach-day Live Activity
 *   (`live-activities.ts`); opens the session screen (M-R2).
 * - `duna-pro://match/<id>`: Courtside scoring for that match.
 * - `duna-pro://organization/<slug>`: switches to that organisation (when
 *   the person belongs to it) and shows Today.
 * - `duna-pro://ai`, `duna-pro://today`, `duna-pro://schedule`: Ask Duna and
 *   the two home tabs (new in M-R0, for widgets and shortcuts).
 * - Preview builds only: `duna-pro://dev/shell?…`, `duna-pro://dev/layout-lab`
 *   and `duna-pro://dev/foundations?…` drive a simulator without touch.
 */
import { isRouteKey, isTabKey } from "./router";
import type { ShellAction } from "./shell-state";

export type ProDeepLink =
  | { readonly kind: "messages"; readonly conversationId?: string }
  | { readonly kind: "session"; readonly sessionId: string }
  | { readonly kind: "match"; readonly matchId: string }
  | { readonly kind: "organization"; readonly slug: string }
  | { readonly kind: "ai" }
  | { readonly kind: "tab"; readonly tab: "today" | "schedule" };

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Classifies an incoming URL. Captured segments are decoded. An
 * unrecognised or missing URL returns `undefined`; preview-only links are
 * not app links (see `parseDevShellUrl`).
 */
export function parseProDeepLink(url: string | null): ProDeepLink | undefined {
  if (!url?.startsWith("duna-pro://")) return undefined;
  if (url.startsWith("duna-pro://messages")) {
    const conversationId = url.match(/^duna-pro:\/\/messages\/([^/?#]+)/)?.[1];
    return {
      kind: "messages",
      ...(conversationId ? { conversationId: safeDecode(conversationId) } : {}),
    };
  }
  const session = url.match(/^duna-pro:\/\/session\/([^/?#]+)/)?.[1];
  if (session) return { kind: "session", sessionId: safeDecode(session) };
  const match = url.match(/^duna-pro:\/\/match\/([^/?#]+)/)?.[1];
  if (match) return { kind: "match", matchId: safeDecode(match) };
  const organization = url.match(/^duna-pro:\/\/organization\/([^/?#]+)/)?.[1];
  if (organization)
    return { kind: "organization", slug: safeDecode(organization) };
  if (/^duna-pro:\/\/ai(?:[/?#]|$)/.test(url)) return { kind: "ai" };
  const tab = url.match(/^duna-pro:\/\/(today|schedule)(?:[/?#]|$)/)?.[1];
  if (tab === "today" || tab === "schedule") return { kind: "tab", tab };
  return undefined;
}

/** The shell navigation a link causes. */
export function deepLinkNavigation(link: ProDeepLink): ShellAction {
  switch (link.kind) {
    case "messages":
      return {
        type: "open",
        route: "messages",
        ...(link.conversationId ? { conversationId: link.conversationId } : {}),
      };
    case "session":
      return { type: "open", route: "session", entryId: link.sessionId };
    case "match":
      return { type: "open", route: "courtside", matchId: link.matchId };
    case "organization":
      return { type: "select-tab", tab: "today" };
    case "ai":
      return { type: "open", route: "ai" };
    case "tab":
      return { type: "select-tab", tab: link.tab };
  }
}

/** "Sunset Beach Club" → "sunset-beach-club" (the organisation link's slug). */
export function organizationSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A preview-build link that drives the shell on a simulator without touch. */
export interface DevShellLink {
  readonly actions: readonly ShellAction[];
  readonly theme?: "light" | "dark" | "system";
  /** Open the full conditions sheet on Today or Schedule. */
  readonly conditions?: boolean;
}

/**
 * `duna-pro://dev/shell?tab=schedule&route=calendar&entry=…&theme=dark&sheet=new`
 * (preview builds only; ProApp ignores it otherwise). `sheet=conditions`
 * opens the conditions sheet. Unknown values are ignored.
 */
export function parseDevShellUrl(url: string | null): DevShellLink | null {
  if (!url?.startsWith("duna-pro://dev/shell")) return null;
  const query = new URLSearchParams(url.split("?")[1] ?? "");
  const actions: ShellAction[] = [];
  const tab = query.get("tab");
  if (tab && isTabKey(tab)) actions.push({ type: "select-tab", tab });
  const route = query.get("route");
  if (route && isRouteKey(route)) {
    const entryId = query.get("entry");
    const matchId = query.get("match");
    const personId = query.get("person");
    actions.push({
      type: "open",
      route,
      ...(entryId ? { entryId } : {}),
      ...(matchId ? { matchId } : {}),
      ...(personId ? { personId } : {}),
    });
  }
  const sheet = query.get("sheet");
  if (sheet === "new") actions.push({ type: "open-sheet" });
  const theme = query.get("theme");
  return {
    actions,
    ...(theme === "light" || theme === "dark" || theme === "system"
      ? { theme }
      : {}),
    ...(sheet === "conditions" ? { conditions: true } : {}),
  };
}
