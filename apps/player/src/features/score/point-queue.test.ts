import { describe, expect, it } from "vitest";
import {
  emptyQueue,
  enqueue,
  enqueueAll,
  MAX_BATCH,
  nextBatch,
  parseQueue,
  queuedCount,
  rebase,
} from "./point-queue";
import type { ScoreEvent } from "./scoring-machine";
import { classifyFailure, startInput } from "./sync-rules";
import { createLiveMatch } from "./scoring-machine";

const at = "2026-11-28T10:00:00.000Z";
const rally = (id: string, winner: "A" | "B" = "A"): ScoreEvent => ({
  id,
  type: "rally-won",
  winner,
  occurredAt: at,
});
let key = 0;
const newKey = () => `key-${++key}`;

describe("offline point queue", () => {
  it("numbers points in tap order and never queues the start", () => {
    let queue = emptyQueue("start-key");
    queue = enqueue(queue, {
      id: "s",
      type: "match-started",
      initialServer: "A",
      occurredAt: at,
    });
    queue = enqueueAll(queue, [rally("p1"), rally("p2", "B"), rally("p3")]);
    expect(queue.pending.map((queued) => queued.event.id)).toEqual([
      "p1",
      "p2",
      "p3",
    ]);
    expect(queue.pending.map((queued) => queued.sequence)).toEqual([1, 2, 3]);
    expect(queuedCount(queue)).toBe(3);
  });

  it("suppresses duplicates, pending or already sent", () => {
    let queue = enqueueAll(emptyQueue("k"), [rally("p1"), rally("p1")]);
    expect(queue.pending).toHaveLength(1);
    queue = rebase(queue, {
      matchId: "m",
      nextSequence: 3,
      nextMonotonicCounter: 3,
      eventIds: ["start", "p1"],
    });
    expect(queue.pending).toHaveLength(0);
    expect(enqueue(queue, rally("p1"))).toBe(queue);
  });

  it("renumbers waiting points onto the server's sequence once the match starts", () => {
    let queue = enqueueAll(emptyQueue("k"), [rally("p1"), rally("p2")]);
    queue = rebase(queue, {
      matchId: "m",
      nextSequence: 2,
      nextMonotonicCounter: 7,
      eventIds: ["server-start"],
    });
    expect(queue.matchId).toBe("m");
    expect(
      queue.pending.map((queued) => [queued.sequence, queued.monotonicCounter]),
    ).toEqual([
      [2, 7],
      [3, 8],
    ]);
    expect(queue.nextSequence).toBe(4);
  });

  it("resends a batch with the same key until the server answers", () => {
    let queue = enqueueAll(emptyQueue("k"), [rally("p1"), rally("p2")]);
    const first = nextBatch(queue, newKey)!;
    queue = first.queue;
    // A crash or a lost reply: the next attempt is the same request.
    const again = nextBatch(
      parseQueue(JSON.parse(JSON.stringify(queue)), "k"),
      newKey,
    )!;
    expect(again.key).toBe(first.key);
    expect(again.events.map((queued) => queued.event.id)).toEqual(["p1", "p2"]);
  });

  it("keeps points tapped while a batch was out, in order, after the answer", () => {
    let queue = enqueueAll(emptyQueue("k"), [rally("p1")]);
    queue = rebase(queue, {
      matchId: "m",
      nextSequence: 2,
      nextMonotonicCounter: 2,
      eventIds: ["start"],
    });
    const batch = nextBatch(queue, newKey)!;
    queue = enqueue(batch.queue, rally("p2"));
    queue = rebase(queue, {
      matchId: "m",
      nextSequence: 3,
      nextMonotonicCounter: 3,
      eventIds: ["start", "p1"],
    });
    expect(queue.inflight).toBeUndefined();
    expect(
      queue.pending.map((queued) => [queued.event.id, queued.sequence]),
    ).toEqual([["p2", 3]]);
    expect(nextBatch(queue, newKey)!.key).not.toBe(batch.key);
  });

  it("sends at most a hundred events a batch", () => {
    const events = Array.from({ length: 130 }, (_, index) =>
      rally(`p${index}`),
    );
    const queue = enqueueAll(emptyQueue("k"), events);
    expect(nextBatch(queue, newKey)!.events).toHaveLength(MAX_BATCH);
  });

  it("starts afresh from a malformed record", () => {
    expect(parseQueue(null, "k")).toEqual(emptyQueue("k"));
    expect(parseQueue({ pending: "x" }, "k").pending).toEqual([]);
  });
});

describe("sync rules", () => {
  it("sorts failures by what to do next", () => {
    expect(classifyFailure(new TypeError("Network request failed"))).toBe(
      "network",
    );
    expect(classifyFailure({ data: { code: "CONFLICT" } })).toBe("conflict");
    expect(
      classifyFailure(
        Object.assign(
          new Error("This device is not authoritative for the match."),
          { data: { code: "FORBIDDEN" } },
        ),
      ),
    ).toBe("other-device");
    expect(classifyFailure({ data: { code: "PRECONDITION_FAILED" } })).toBe(
      "closed",
    );
  });

  it("starts the match with Duna players by id and others by name", () => {
    const match = createLiveMatch({
      id: "local",
      startEventId: "start",
      now: at,
      teamSize: 2,
      matchType: "competitive",
      scoringSystem: "rally",
      initialServer: "B",
      teams: {
        A: {
          people: [
            { personId: "me", name: "Noa Williams" },
            {
              name: "Sam Lee",
              givenName: "Sam",
              familyName: "Lee",
              phoneE164: "+13105550100",
            },
          ],
        },
        B: {
          people: [
            { personId: "p1", name: "Theo Park" },
            { personId: "p2", name: "Jamie Stone" },
          ],
        },
      },
      agreed: true,
    });
    const input = startInput(match, "native-score-device", "key");
    expect(input.teamAIds).toEqual(["me"]);
    expect(input.teamBIds).toEqual(["p1", "p2"]);
    expect(input.provisionalParticipants).toEqual([
      {
        side: "A",
        givenName: "Sam",
        familyName: "Lee",
        phoneE164: "+13105550100",
      },
    ]);
    expect(input.initialServerSide).toBe("B");
    expect(input.initialServerPersonId).toBe("p1");
    expect(input.allPlayersAgreedToRecord).toBe(true);
  });
});
