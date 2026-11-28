"use client";

import { createCursorSyncEngine } from "@duna/messaging-client/delivery";
import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";

export function MessagingLiveRefresh({
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
      baseUrl: "/api/messaging",
      pollIntervalMs: 15_000,
    });
    const unsubscribe = engine.onWakeUp(refresh);
    engine.connect();
    if (conversationId) {
      void engine.syncConversation(conversationId).catch(() => undefined);
    }
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      void engine.syncAll().catch(() => undefined);
      if (conversationId) {
        void engine.syncConversation(conversationId).catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribe();
      engine.disconnect();
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [conversationId, router]);

  return null;
}
