export interface AskConversation {
  id: string;
  sessionId: string | null;
  title: string;
  preview: string;
  effort: "fast" | "medium" | "high" | "max" | "ultra";
  page: string;
  status: string;
  updatedAt: string;
  archivedAt: string | null;
}
export interface AskAction {
  id: string;
  operation: string;
  summary: string;
  input: Record<string, unknown>;
  status: string;
  expiresAt: string;
  result: Record<string, unknown> | null;
}
/** What a custom proposal renderer can do (see AskDunaThread's renderAction). */
export interface AskActionControls {
  /** Saves the person's decision, then continues the conversation. */
  review: (decision: "approve" | "decline") => Promise<void>;
  /** True while another review, a response or a reconnect is running. */
  disabled: boolean;
  /** True while this action's review is being saved. */
  reviewing: boolean;
}
export async function askDunaFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/ask-duna/${path}`, {
    cache: "no-store",
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const result = await response.json().catch(() => ({
    error:
      response.status === 401
        ? "Sign in again to continue this conversation."
        : "Ask Duna could not complete the request.",
  }));
  if (!response.ok)
    throw new Error(result.error ?? "Ask Duna could not complete the request.");
  return result as T;
}
export function notifyAskDunaHistory() {
  window.dispatchEvent(new Event("ask-duna:history"));
}
