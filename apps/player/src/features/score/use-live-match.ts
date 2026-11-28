/**
 * The live match on this phone (M-P4a): the event log, its storage, and the
 * sync to Duna. Every tap changes the log in memory, is written to the
 * phone at once (`live-store.ts`), then queued; the queue is sent in order
 * whenever the app is signed in and online, with backoff while offline.
 *
 * A match can start before anyone is named (a pickup game starts in two
 * taps): it is scored on the phone, and reaches Duna as soon as every place
 * has a person and everyone has agreed to record it.
 */
import { AppState } from "react-native";
import { report } from "@duna/observability";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DunaApiClient } from "../../../mobile-api";
import { usePlayerRuntime } from "../../../runtime";
import {
  enqueueAll,
  emptyQueue,
  nextBatch,
  queuedCount,
  rebase,
  type PointQueue,
  type ServerScoringFacts,
} from "./point-queue";
import {
  loadLiveMatch,
  newId,
  saveLiveMatch,
  scoringDeviceId,
  type StoredLiveMatch,
} from "./live-store";
import {
  applyExternalEvent,
  callTimeout,
  completeTechnicalTimeout,
  endMatch,
  liveView,
  readyToSave,
  scorePoint,
  undoLast,
  type LiveMatch,
  type LiveView,
  type ScoreEvent,
  type TeamSide,
} from "./scoring-machine";
import { useWatchBridge } from "./watch-bridge";
import { useKeepScreenOn } from "./keep-awake";
import { classifyFailure, startInput } from "./sync-rules";

export type SyncStatus =
  /** Preview build or signed out: kept on this phone. */
  | { readonly kind: "local" }
  /** Waiting for names or the agreement before it can reach Duna. */
  | { readonly kind: "needs-players" }
  | { readonly kind: "syncing" }
  | { readonly kind: "synced" }
  | { readonly kind: "offline"; readonly queued: number }
  /** Another phone is the scorer of record for this match. */
  | { readonly kind: "other-device" }
  | {
      readonly kind: "error";
      readonly reference: string;
      readonly message: string;
    };

type Scoring = Awaited<
  ReturnType<DunaApiClient["player"]["startMatch"]["mutate"]>
>;

function facts(scoring: Scoring): ServerScoringFacts {
  return {
    matchId: scoring.matchId,
    nextSequence: scoring.nextSequence,
    nextMonotonicCounter: scoring.nextMonotonicCounter,
    eventIds: scoring.events.map((event) => event.id),
  };
}

const BACKOFF_MS = [2_000, 5_000, 10_000, 30_000];

export interface LiveMatchController {
  readonly ready: boolean;
  readonly record: StoredLiveMatch | null;
  readonly view: LiveView | null;
  readonly sync: SyncStatus;
  readonly queued: number;
  readonly start: (match: LiveMatch) => void;
  readonly point: (side: TeamSide) => void;
  readonly undo: () => void;
  readonly timeout: (side: TeamSide) => void;
  readonly resumePlay: () => void;
  readonly update: (change: (match: LiveMatch) => LiveMatch) => void;
  readonly end: () => void;
  readonly discard: () => void;
  readonly retry: () => void;
}

export function useLiveMatch(options: {
  readonly active: boolean;
}): LiveMatchController {
  const runtime = usePlayerRuntime();
  const client = runtime.mode === "live" ? runtime.client : undefined;
  const [record, setRecord] = useState<StoredLiveMatch | null>(null);
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState<SyncStatus>({ kind: "local" });
  const [updatedAt, setUpdatedAt] = useState<string>();
  const recordRef = useRef<StoredLiveMatch | null>(null);
  const syncing = useRef(false);
  const attempt = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const deviceId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([loadLiveMatch(), scoringDeviceId()]).then(
      ([stored, device]) => {
        if (!active) return;
        deviceId.current = device;
        recordRef.current = stored;
        setRecord(stored);
        setReady(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const commit = useCallback((next: StoredLiveMatch | null) => {
    recordRef.current = next;
    setRecord(next);
    void saveLiveMatch(next);
  }, []);

  /** Change the match, store it, and queue whatever is new. */
  const update = useCallback(
    (change: (match: LiveMatch) => LiveMatch) => {
      const current = recordRef.current;
      if (!current) return;
      const match = change(current.match);
      if (match === current.match) return;
      const queue = enqueueAll(current.queue, match.events);
      commit({ match, queue });
      setUpdatedAt(new Date().toISOString());
    },
    [commit],
  );

  const flush = useCallback(async () => {
    const current = recordRef.current;
    if (!current || syncing.current) return;
    if (!client) {
      setSync({ kind: "local" });
      return;
    }
    if (!readyToSave(current.match)) {
      setSync({ kind: "needs-players" });
      return;
    }
    const device = deviceId.current ?? (await scoringDeviceId());
    deviceId.current = device;
    syncing.current = true;
    setSync({ kind: "syncing" });
    const store = (queue: PointQueue) => {
      const latest = recordRef.current;
      if (!latest || latest.match.id !== current.match.id) return;
      // Points tapped while a request was out are re-queued on top.
      commit({
        match: latest.match,
        queue: enqueueAll(queue, latest.match.events),
      });
    };
    try {
      let queue = recordRef.current!.queue;
      if (!queue.matchId) {
        const started = await client.player.startMatch.mutate(
          startInput(current.match, device, queue.startKey),
        );
        queue = rebase(queue, facts(started));
        store(queue);
      }
      for (;;) {
        queue = recordRef.current?.queue ?? queue;
        const batch = nextBatch(queue, newId);
        if (!batch || !queue.matchId) break;
        store(batch.queue);
        const answer = await client.player.appendMatchEvents.mutate({
          matchId: queue.matchId,
          deviceId: device,
          events: batch.events.map((queued) => ({
            sequence: queued.sequence,
            monotonicCounter: queued.monotonicCounter,
            event: queued.event,
          })),
          idempotencyKey: batch.key,
        });
        queue = rebase(
          recordRef.current?.queue ?? batch.queue,
          facts(answer.scoring),
        );
        store(queue);
      }
      attempt.current = 0;
      setSync({ kind: "synced" });
    } catch (reason) {
      const kind = classifyFailure(reason);
      const latest = recordRef.current;
      if (kind === "conflict" && latest?.queue.matchId) {
        try {
          const server = await client.player.matchScoringState.query({
            matchId: latest.queue.matchId,
          });
          store(rebase(latest.queue, facts(server)));
        } catch {
          // Retried below.
        }
      }
      if (kind === "other-device") {
        setSync({ kind: "other-device" });
      } else if (kind === "network" || kind === "conflict") {
        setSync({
          kind: "offline",
          queued: queuedCount(recordRef.current?.queue ?? current.queue),
        });
        const wait =
          BACKOFF_MS[Math.min(attempt.current, BACKOFF_MS.length - 1)]!;
        attempt.current += 1;
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => void flush(), wait);
      } else {
        const message = reason instanceof Error ? reason.message : "Try again.";
        setSync({
          kind: "error",
          message,
          reference: report(reason, { event: "player.score.live_sync_failed" }),
        });
      }
    } finally {
      syncing.current = false;
    }
  }, [client, commit]);

  // Send after every change, and when the app comes back to the front.
  useEffect(() => {
    if (!record) return;
    const timer = setTimeout(() => void flush(), 250);
    return () => clearTimeout(timer);
  }, [flush, record]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        attempt.current = 0;
        void flush();
      }
    });
    return () => {
      subscription.remove();
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [flush]);

  const view = useMemo(
    () => (record ? liveView(record.match) : null),
    [record],
  );
  const live = Boolean(record && !record.match.endedAt);
  useKeepScreenOn(options.active && live);

  const applyExternal = useCallback(
    async (events: readonly ScoreEvent[]) => {
      update((match) =>
        events.reduce((next, event) => {
          // The Watch undoes its last point; if that point was scored on
          // the phone the Watch never knew its id: undo the last point.
          if (
            event.type === "undo" &&
            !next.events.some((existing) => existing.id === event.targetEventId)
          ) {
            return undoLast(next, event.id, event.occurredAt);
          }
          return applyExternalEvent(next, event);
        }, match),
      );
      await saveLiveMatch(recordRef.current);
    },
    [update],
  );
  useWatchBridge({
    match: options.active ? (record?.match ?? null) : null,
    view: options.active ? view : null,
    matchId: record?.queue.matchId,
    updatedAt,
    apply: applyExternal,
  });

  const now = () => new Date().toISOString();
  return {
    ready,
    record,
    view,
    sync,
    queued: record ? queuedCount(record.queue) : 0,
    start: (match) => {
      attempt.current = 0;
      commit({ match, queue: emptyQueue(newId()) });
    },
    point: (side) => update((match) => scorePoint(match, side, newId(), now())),
    undo: () => update((match) => undoLast(match, newId(), now())),
    timeout: (side) =>
      update((match) => callTimeout(match, side, newId(), now())),
    resumePlay: () =>
      update((match) => completeTechnicalTimeout(match, newId(), now())),
    update,
    end: () => update((match) => endMatch(match, now())),
    discard: () => {
      commit(null);
      setSync({ kind: "local" });
    },
    retry: () => {
      attempt.current = 0;
      void flush();
    },
  };
}
