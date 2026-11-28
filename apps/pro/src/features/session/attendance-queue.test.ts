import { describe, expect, it } from "vitest";
import {
  AttendanceQueue,
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  EMPTY_ATTENDANCE_QUEUE,
  UNDO_MS,
  applySendResult,
  backoffMs,
  enqueueMark,
  nextDueMark,
  parseAttendanceQueue,
  pendingForSession,
  serializeAttendanceQueue,
  undoMark,
  type AttendanceMark,
  type AttendanceSendResult,
  type NewAttendanceMark,
} from "./attendance-queue";

const T0 = Date.parse("2026-12-08T17:00:00.000Z");

function mark(
  id: string,
  bookingId: string,
  status: NewAttendanceMark["status"] = "attended",
  at = T0,
): NewAttendanceMark {
  return {
    id,
    target: "participation",
    sessionId: "session-1",
    bookingId,
    personName: `Player ${bookingId}`,
    status,
    at,
  };
}

/** Storage that keeps one string, like AsyncStorage under one key. */
function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    read: async () => value,
    write: async (next: string) => {
      value = next;
    },
    peek: () => value,
  };
}

/** A clock and a scheduler the test advances by hand. */
function manualClock(start = T0) {
  let now = start;
  const timers: { at: number; run: () => void; cancelled: boolean }[] = [];
  return {
    now: () => now,
    schedule: (delay: number, run: () => void) => {
      const timer = { at: now + delay, run, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    /** Moves the clock and fires timers that came due. */
    advance: async (ms: number) => {
      now += ms;
      for (const timer of timers.splice(0)) {
        if (timer.cancelled) continue;
        if (timer.at <= now) timer.run();
        else timers.push(timer);
      }
      // Let the flush the timer started finish.
      for (let index = 0; index < 10; index += 1) await Promise.resolve();
    },
  };
}

describe("attendance queue (pure)", () => {
  it("waits for the undo window before a mark may be sent", () => {
    const state = enqueueMark(EMPTY_ATTENDANCE_QUEUE, mark("a", "b1"));
    expect(nextDueMark(state, T0 + UNDO_MS - 1)).toBeNull();
    expect(nextDueMark(state, T0 + UNDO_MS)?.id).toBe("a");
    expect(state.marks[0]?.deviceMarkedAt).toBe(new Date(T0).toISOString());
  });

  it("sends in the order the marks were made", () => {
    let state = EMPTY_ATTENDANCE_QUEUE;
    state = enqueueMark(state, mark("a", "b1"));
    state = enqueueMark(state, mark("b", "b2", "absent", T0 + 1));
    state = enqueueMark(state, mark("c", "b3", "attended", T0 + 2));
    const order: string[] = [];
    let now = T0 + UNDO_MS + 10;
    for (;;) {
      const due = nextDueMark(state, now);
      if (!due) break;
      order.push(due.id);
      state = applySendResult(state, due.id, { kind: "sent" }, now);
      now += 1;
    }
    expect(order).toEqual(["a", "b", "c"]);
    expect(state.marks).toEqual([]);
  });

  it("a newer mark for the same person replaces one still on the phone", () => {
    let state = enqueueMark(EMPTY_ATTENDANCE_QUEUE, mark("a", "b1"));
    state = enqueueMark(state, mark("b", "b1", "absent", T0 + 500));
    expect(state.marks.map((m) => [m.id, m.status])).toEqual([["b", "absent"]]);
  });

  it("never replaces the mark that is in flight", () => {
    let state = enqueueMark(EMPTY_ATTENDANCE_QUEUE, mark("a", "b1"));
    state = enqueueMark(state, mark("b", "b1", "absent", T0 + 500), "a");
    expect(state.marks.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("ignores the same idempotency key twice", () => {
    const once = enqueueMark(EMPTY_ATTENDANCE_QUEUE, mark("a", "b1"));
    const twice = enqueueMark(once, mark("a", "b1", "absent"));
    expect(twice).toBe(once);
  });

  it("undo removes a mark that has not left the phone, not one in flight", () => {
    const state = enqueueMark(EMPTY_ATTENDANCE_QUEUE, mark("a", "b1"));
    expect(undoMark(state, "a").undone).toBe(true);
    expect(undoMark(state, "a").state.marks).toEqual([]);
    expect(undoMark(state, "a", "a").undone).toBe(false);
    expect(undoMark(state, "missing").undone).toBe(false);
  });

  it("backs off exponentially on a connection failure and holds the order", () => {
    expect(backoffMs(1)).toBe(BACKOFF_BASE_MS);
    expect(backoffMs(2)).toBe(BACKOFF_BASE_MS * 2);
    expect(backoffMs(3)).toBe(BACKOFF_BASE_MS * 4);
    expect(backoffMs(40)).toBe(BACKOFF_MAX_MS);
    let state = enqueueMark(EMPTY_ATTENDANCE_QUEUE, mark("a", "b1"));
    state = enqueueMark(state, mark("b", "b2", "attended", T0 + 1));
    const now = T0 + UNDO_MS;
    state = applySendResult(state, "a", { kind: "retry" }, now);
    const head = state.marks.find((m) => m.id === "a")!;
    expect(head.attempts).toBe(1);
    expect(head.notBefore).toBe(now + BACKOFF_BASE_MS);
    // "b" is due, but nothing overtakes the failed head.
    expect(nextDueMark(state, now + 1)).toBeNull();
    expect(nextDueMark(state, now + BACKOFF_BASE_MS)?.id).toBe("a");
  });

  it("turns an answer Duna did not apply into a conflict in plain words", () => {
    let state = enqueueMark(EMPTY_ATTENDANCE_QUEUE, mark("a", "b1"));
    state = applySendResult(
      state,
      "a",
      { kind: "ignored", reason: "newer-mark-exists" },
      T0 + UNDO_MS,
    );
    expect(state.marks).toEqual([]);
    expect(state.conflicts[0]?.message).toBe(
      "Someone marked Player b1 more recently, so Duna kept that mark.",
    );
    state = enqueueMark(
      enqueueMark(EMPTY_ATTENDANCE_QUEUE, mark("x", "b2")),
      mark("y", "b3"),
    );
    state = applySendResult(
      state,
      "x",
      { kind: "rejected", message: "Attendance for this session has closed." },
      T0,
    );
    expect(state.conflicts[0]?.message).toBe(
      "Attendance for this session has closed.",
    );
    expect(state.marks.map((m) => m.id)).toEqual(["y"]);
  });

  it("a new mark for the same person clears that person's old conflict", () => {
    let state = enqueueMark(EMPTY_ATTENDANCE_QUEUE, mark("a", "b1"));
    state = applySendResult(
      state,
      "a",
      { kind: "ignored", reason: "cancelled" },
      T0,
    );
    expect(state.conflicts).toHaveLength(1);
    state = enqueueMark(state, mark("b", "b1", "absent", T0 + 1));
    expect(state.conflicts).toEqual([]);
  });

  it("survives a round trip through storage and never crashes on junk", () => {
    let state = enqueueMark(EMPTY_ATTENDANCE_QUEUE, mark("a", "b1"));
    state = enqueueMark(state, mark("b", "b2", "absent", T0 + 1));
    const restored = parseAttendanceQueue(serializeAttendanceQueue(state));
    expect(restored).toEqual(state);
    expect(parseAttendanceQueue("not json")).toBe(EMPTY_ATTENDANCE_QUEUE);
    expect(parseAttendanceQueue(null)).toBe(EMPTY_ATTENDANCE_QUEUE);
    expect(
      parseAttendanceQueue(JSON.stringify({ version: 1, marks: [{ id: 1 }] }))
        .marks,
    ).toEqual([]);
    // A later enqueue never reuses a restored sequence number.
    const next = enqueueMark(restored, mark("c", "b3"));
    expect(next.marks.at(-1)!.seq).toBeGreaterThan(2);
  });

  it("lists what is still on the phone for one session", () => {
    let state = enqueueMark(EMPTY_ATTENDANCE_QUEUE, mark("a", "b1"));
    state = enqueueMark(state, { ...mark("b", "b2"), sessionId: "other" });
    expect(pendingForSession(state, "session-1").map((m) => m.id)).toEqual([
      "a",
    ]);
  });
});

describe("AttendanceQueue runner", () => {
  it("sends due marks in order with their keys and the phone's time", async () => {
    const clock = manualClock();
    const storage = memoryStorage();
    const sent: AttendanceMark[] = [];
    const queue = new AttendanceQueue({
      storage,
      now: clock.now,
      schedule: clock.schedule,
      send: async (item) => {
        sent.push(item);
        return { kind: "sent" };
      },
    });
    await queue.load();
    queue.enqueue(mark("a", "b1"));
    queue.enqueue(mark("b", "b2", "absent", T0 + 1));
    await clock.advance(UNDO_MS - 1);
    expect(sent).toEqual([]);
    await clock.advance(10);
    expect(sent.map((item) => [item.id, item.status])).toEqual([
      ["a", "attended"],
      ["b", "absent"],
    ]);
    expect(sent[0]!.deviceMarkedAt).toBe(new Date(T0).toISOString());
    expect(queue.snapshot().marks).toEqual([]);
  });

  it("retries with backoff until the connection returns", async () => {
    const clock = manualClock();
    const answers: AttendanceSendResult[] = [
      { kind: "retry" },
      { kind: "retry" },
      { kind: "sent" },
    ];
    const attempts: number[] = [];
    const queue = new AttendanceQueue({
      storage: memoryStorage(),
      now: clock.now,
      schedule: clock.schedule,
      send: async () => {
        attempts.push(clock.now());
        return answers.shift() ?? { kind: "sent" };
      },
    });
    await queue.load();
    queue.enqueue(mark("a", "b1"));
    await clock.advance(UNDO_MS);
    expect(attempts).toHaveLength(1);
    expect(queue.snapshot().marks[0]?.attempts).toBe(1);
    await clock.advance(BACKOFF_BASE_MS - 1);
    expect(attempts).toHaveLength(1);
    await clock.advance(1);
    expect(attempts).toHaveLength(2);
    await clock.advance(BACKOFF_BASE_MS * 2);
    expect(attempts).toHaveLength(3);
    expect(queue.snapshot().marks).toEqual([]);
  });

  it("treats a thrown send as a connection failure", async () => {
    const clock = manualClock();
    const queue = new AttendanceQueue({
      storage: memoryStorage(),
      now: clock.now,
      schedule: clock.schedule,
      send: async () => {
        throw new Error("Network request failed");
      },
    });
    await queue.load();
    queue.enqueue(mark("a", "b1"));
    await clock.advance(UNDO_MS);
    expect(queue.snapshot().marks[0]?.attempts).toBe(1);
  });

  it("keeps marks across a restart and sends them with the same key", async () => {
    const storage = memoryStorage();
    const clock = manualClock();
    const first = new AttendanceQueue({
      storage,
      now: clock.now,
      schedule: clock.schedule,
      send: async () => ({ kind: "retry" }),
    });
    await first.load();
    first.enqueue(mark("a", "b1"));
    first.enqueue(mark("b", "b2", "absent", T0 + 1));
    await clock.advance(UNDO_MS);
    await first.settled();
    first.dispose();
    expect(storage.peek()).toContain('"id":"a"');

    // The app starts again later, with a connection.
    const later = manualClock(T0 + 60 * 60_000);
    const sent: string[] = [];
    const second = new AttendanceQueue({
      storage,
      now: later.now,
      schedule: later.schedule,
      send: async (item) => {
        sent.push(item.id);
        return { kind: "sent" };
      },
    });
    await second.flush();
    expect(sent).toEqual(["a", "b"]);
    await second.settled();
    expect(parseAttendanceQueue(storage.peek()).marks).toEqual([]);
  });

  it("a mark made before the saved queue loads goes after it, nothing lost", async () => {
    let state = enqueueMark(EMPTY_ATTENDANCE_QUEUE, mark("old", "b1"));
    const storage = memoryStorage(serializeAttendanceQueue(state));
    const queue = new AttendanceQueue({
      storage,
      now: () => T0,
      schedule: () => () => undefined,
      send: async () => ({ kind: "sent" }),
    });
    queue.enqueue(mark("new", "b2"));
    await queue.load();
    await queue.settled();
    state = queue.snapshot();
    expect(state.marks.map((m) => m.id)).toEqual(["old", "new"]);
    expect(parseAttendanceQueue(storage.peek()).marks).toHaveLength(2);
  });

  it("undo within the window means nothing is ever sent", async () => {
    const clock = manualClock();
    const sent: string[] = [];
    const queue = new AttendanceQueue({
      storage: memoryStorage(),
      now: clock.now,
      schedule: clock.schedule,
      send: async (item) => {
        sent.push(item.id);
        return { kind: "sent" };
      },
    });
    await queue.load();
    queue.enqueue(mark("a", "b1"));
    await clock.advance(UNDO_MS / 2);
    expect(queue.undo("a")).toBe(true);
    await clock.advance(UNDO_MS);
    expect(sent).toEqual([]);
  });
});
