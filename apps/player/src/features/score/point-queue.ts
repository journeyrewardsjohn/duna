/**
 * The offline point queue (M-P4a). Pure: every function takes a queue and
 * returns a new one, so ordering, duplicate suppression and restart are
 * unit-tested without a network or storage.
 *
 * The server accepts score events only in uninterrupted device order
 * (`sequence` and `monotonicCounter` continue from its `nextSequence` and
 * `nextMonotonicCounter`), so:
 * - points are numbered as they are queued, in tap order;
 * - a batch keeps its idempotency key until the server answers, so a retry
 *   after a crash or a lost reply is the same request (never a double point);
 * - every answer (or a sequence conflict) rebases the queue on the server's
 *   own state: events it already has are dropped, the rest are renumbered.
 *
 * The server creates the `match-started` event itself, so it is never queued.
 */
import type { ScoreEvent } from "@duna/league-engine/scoring";

export interface QueuedEvent {
  readonly sequence: number;
  readonly monotonicCounter: number;
  readonly event: ScoreEvent;
}

export interface PointQueue {
  /** The server match, once `player.startMatch` has answered. */
  readonly matchId?: string;
  /** The key `player.startMatch` is called with until it answers. */
  readonly startKey: string;
  readonly nextSequence: number;
  readonly nextMonotonicCounter: number;
  /** Waiting to be sent, in order. */
  readonly pending: readonly QueuedEvent[];
  /** Ids the server has (kept so a late duplicate is never queued again). */
  readonly sent: readonly string[];
  /** The batch on its way, with its idempotency key. */
  readonly inflight?: { readonly key: string; readonly ids: readonly string[] };
}

export const MAX_BATCH = 100;

export function emptyQueue(startKey: string): PointQueue {
  return {
    startKey,
    nextSequence: 1,
    nextMonotonicCounter: 1,
    pending: [],
    sent: [],
  };
}

function renumber(
  events: readonly ScoreEvent[],
  nextSequence: number,
  nextMonotonicCounter: number,
): QueuedEvent[] {
  return events.map((event, index) => ({
    sequence: nextSequence + index,
    monotonicCounter: nextMonotonicCounter + index,
    event,
  }));
}

/** Queue an event; a duplicate (pending or already sent) is ignored. */
export function enqueue(queue: PointQueue, event: ScoreEvent): PointQueue {
  if (event.type === "match-started") return queue;
  if (
    queue.sent.includes(event.id) ||
    queue.pending.some((queued) => queued.event.id === event.id)
  ) {
    return queue;
  }
  return {
    ...queue,
    pending: [
      ...queue.pending,
      {
        sequence: queue.nextSequence,
        monotonicCounter: queue.nextMonotonicCounter,
        event,
      },
    ],
    nextSequence: queue.nextSequence + 1,
    nextMonotonicCounter: queue.nextMonotonicCounter + 1,
  };
}

/** Queue every event of a log not yet queued or sent, in log order. */
export function enqueueAll(
  queue: PointQueue,
  events: readonly ScoreEvent[],
): PointQueue {
  return events.reduce(enqueue, queue);
}

export interface ServerScoringFacts {
  readonly matchId: string;
  readonly nextSequence: number;
  readonly nextMonotonicCounter: number;
  /** Every event id the server holds for the match. */
  readonly eventIds: readonly string[];
}

/**
 * Line the queue up with the server: after `startMatch`, after every
 * `appendMatchEvents` answer and after a sequence conflict.
 */
export function rebase(
  queue: PointQueue,
  server: ServerScoringFacts,
): PointQueue {
  const held = new Set(server.eventIds);
  const stillPending = queue.pending
    .map((queued) => queued.event)
    .filter((event) => !held.has(event.id));
  const newlySent = queue.pending
    .map((queued) => queued.event.id)
    .filter((id) => held.has(id));
  const pending = renumber(
    stillPending,
    server.nextSequence,
    server.nextMonotonicCounter,
  );
  return {
    matchId: server.matchId,
    startKey: queue.startKey,
    pending,
    sent: [...new Set([...queue.sent, ...newlySent])],
    nextSequence: server.nextSequence + pending.length,
    nextMonotonicCounter: server.nextMonotonicCounter + pending.length,
  };
}

/**
 * The next batch to send, in order. A batch already on its way is sent
 * again with the same key (an idempotent retry); otherwise a new key.
 */
export function nextBatch(
  queue: PointQueue,
  newKey: () => string,
  max = MAX_BATCH,
): {
  readonly queue: PointQueue;
  readonly key: string;
  readonly events: readonly QueuedEvent[];
} | null {
  if (queue.pending.length === 0) return null;
  if (queue.inflight) {
    const ids = new Set(queue.inflight.ids);
    const events = queue.pending.filter((queued) => ids.has(queued.event.id));
    if (events.length > 0) return { queue, key: queue.inflight.key, events };
  }
  const events = queue.pending.slice(0, max);
  const key = newKey();
  return {
    queue: {
      ...queue,
      inflight: { key, ids: events.map((queued) => queued.event.id) },
    },
    key,
    events,
  };
}

/** How many points are waiting to reach Duna. */
export function queuedCount(queue: PointQueue): number {
  return queue.pending.length;
}

/** Reads a stored queue back; anything malformed starts afresh. Pure. */
export function parseQueue(value: unknown, startKey: string): PointQueue {
  if (!value || typeof value !== "object") return emptyQueue(startKey);
  const candidate = value as Partial<PointQueue>;
  if (
    typeof candidate.startKey !== "string" ||
    typeof candidate.nextSequence !== "number" ||
    typeof candidate.nextMonotonicCounter !== "number" ||
    !Array.isArray(candidate.pending) ||
    !Array.isArray(candidate.sent)
  ) {
    return emptyQueue(startKey);
  }
  return candidate as PointQueue;
}
