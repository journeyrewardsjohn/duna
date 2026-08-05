import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import {
  getAppleHealthSyncState,
  hasPendingAppleHealthChanges,
  isAppleHealthSyncActive,
  startAppleHealthMonitoring,
  syncAppleHealth,
} from "./health-kit";
import type { PlayerRuntime } from "./runtime";

const HISTORY_RESUME_INTERVAL_MS = 60_000;
const INITIAL_RESUME_DELAY_MS = 12_000;
const FOREGROUND_RESUME_DELAY_MS = 3_000;
// Health history is durable and resumable, so interactive app work wins over
// throughput. Three bounded pages per minute keeps a large backfill moving
// without monopolizing the phone radio or the shared API connection.
const BACKGROUND_PAGE_BUDGET = 3;

export function HealthHistorySyncAgent({
  paused,
  runtime,
}: {
  readonly paused: boolean;
  readonly runtime: PlayerRuntime;
}) {
  const runActive = useRef(false);

  useEffect(() => {
    if (paused || runtime.mode === "preview" || !runtime.client) return;
    const client = runtime.client;
    let cancelled = false;
    let stopMonitoring: (() => void) | undefined;
    let resumeTimer: ReturnType<typeof setTimeout> | undefined;

    async function resumeHistory(forceIncrementalCheck = false) {
      if (
        cancelled ||
        runActive.current ||
        isAppleHealthSyncActive() ||
        AppState.currentState !== "active"
      ) {
        return;
      }
      const state = await getAppleHealthSyncState();
      if (!state?.categories.length || cancelled) return;
      const pendingChanges = await hasPendingAppleHealthChanges();
      if (state.complete && !pendingChanges && !forceIncrementalCheck) return;

      runActive.current = true;
      try {
        await syncAppleHealth({
          client,
          categories: state.categories,
          maxPages: BACKGROUND_PAGE_BUDGET,
        });
      } catch {
        // The encrypted cursor is committed after every acknowledged page.
        // A later interval or foreground event safely retries from that point.
      } finally {
        runActive.current = false;
      }
    }

    function scheduleResume(forceIncrementalCheck: boolean, delay: number) {
      if (cancelled) return;
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        resumeTimer = undefined;
        void resumeHistory(forceIncrementalCheck);
      }, delay);
    }

    void (async () => {
      const state = await getAppleHealthSyncState();
      if (state?.categories.length && !cancelled) {
        const cleanup = await startAppleHealthMonitoring(state.categories);
        if (cancelled) cleanup?.();
        else stopMonitoring = cleanup;
      }
      scheduleResume(true, INITIAL_RESUME_DELAY_MS);
    })();

    const interval = setInterval(() => {
      scheduleResume(false, 0);
    }, HISTORY_RESUME_INTERVAL_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        scheduleResume(true, FOREGROUND_RESUME_DELAY_MS);
      }
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (resumeTimer) clearTimeout(resumeTimer);
      subscription.remove();
      stopMonitoring?.();
    };
  }, [paused, runtime.client, runtime.mode]);

  return null;
}
