"use client";

import { createCursorSyncEngine } from "@duna/messaging-client/delivery";
import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";

/**
 * Keeps the Inbox current: one live stream attempt, then a quiet 15 s poll
 * of the messaging cursor; any change refreshes the page (debounced). Never
 * runs while the tab is hidden.
 */
export function InboxLiveRefresh({
  conversationId,
}: {
  readonly conversationId?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    let disposed = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (disposed || document.visibilityState === "hidden") return;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        startTransition(() => router.refresh());
      }, 250);
    };
    const engine = createCursorSyncEngine({
      asPrincipal: "organization",
      baseUrl: "/api/messaging",
      pollIntervalMs: 15_000,
    });
    const unsubscribe = engine.onWakeUp(refresh);
    // Start on the next tick: a mount that is torn down at once (development's
    // strict mode, a fast navigation) never starts its own sync, so one page
    // marks each conversation delivered once, not twice.
    let started = false;
    const startTimer = setTimeout(() => {
      started = true;
      engine.connect();
      if (conversationId) {
        void engine.syncConversation(conversationId).catch(() => undefined);
      }
    }, 0);
    const onVisibility = () => {
      if (!started || document.visibilityState !== "visible") return;
      void engine.syncAll().catch(() => undefined);
      if (conversationId) {
        void engine.syncConversation(conversationId).catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimeout(startTimer);
      unsubscribe();
      if (started) engine.disconnect();
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [conversationId, router]);

  return null;
}
