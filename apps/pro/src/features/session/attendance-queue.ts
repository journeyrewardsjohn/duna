/**
 * Courtside attendance that survives no signal (M-R2, PART-12; plan
 * participation.md §7.4 and §8 "Offline coach marks attendance").
 *
 * Every mark is saved on the phone first, with the phone's time and an
 * idempotency key, then sent in the order it was made. Rules:
 *
 * - **Undo window.** A mark waits `UNDO_MS` (6 s) before it may be sent, so
 *   Undo only ever removes a mark from the phone; nothing is taken back
 *   from Duna.
 * - **One answer per person.** A newer mark for the same booking replaces an
 *   older one that has not left the phone (duplicate suppression). Enqueueing
 *   the same idempotency key twice is a no-op.
 * - **In order.** Only the oldest mark is ever in flight. A connection failure
 *   holds the queue and retries with exponential backoff (`backoffMs`);
 *   nothing behind it overtakes it.
 * - **The server decides.** A mark Duna answers but does not apply (a newer
 *   mark exists, the booking was cancelled, attendance has closed) leaves the
 *   queue as a conflict with the server's reason in plain words.
 * - **Restarts.** The queue is JSON in device storage; a mark that was in
 *   flight when the app stopped is sent again with the same key, which Duna
 *   answers from its idempotency record.
 *
 * Pure functions plus a small runner (`AttendanceQueue`); unit-tested in
 * `attendance-queue.test.ts`. No React, no React Native.
 */

/** How long Undo stays on screen; marks wait this long before sending. */
export const UNDO_MS = 6_000;
/** First retry after a connection failure, then doubled. */
export const BACKOFF_BASE_MS = 2_000;
/** Retries never wait longer than this. */
export const BACKOFF_MAX_MS = 5 * 60_000;
/** Conflicts kept for the coach to read (newest first). */
export const MAX_CONFLICTS = 20;
export const ATTENDANCE_QUEUE_VERSION = 1;

/**
 * Where a mark goes:
 * - `participation`: a group session (`operator.participation.recordAttendance`,
 *   booking = catalog fulfillment);
 * - `registration`: a calendar session (`operator.recordSessionAttendance`,
 *   booking = registration).
 */
export type AttendanceTarget = "participation" | "registration";

/** Here, absent, or (calendar sessions only) back to not marked. */
export type AttendanceStatus = "attended" | "absent" | "unmarked";

export interface AttendanceMark {
  /** The idempotency key; also the mark's identity in the queue. */
  readonly id: string;
  readonly target: AttendanceTarget;
  readonly sessionId: string;
  readonly bookingId: string;
  /** For the conflict line only ("Maya"); never logged. */
  readonly personName: string;
  readonly status: AttendanceStatus;
  /** When the coach tapped, on the phone's clock (ISO). */
  readonly deviceMarkedAt: string;
  /** Order of creation; the queue sends lowest first. */
  readonly seq: number;
  readonly attempts: number;
  /** Not sent before this instant (epoch ms): the undo window, then backoff. */
  readonly notBefore: number;
}

export interface AttendanceConflict {
  readonly id: string;
  readonly sessionId: string;
  readonly bookingId: string;
  readonly personName: string;
  readonly status: AttendanceStatus;
  /** Plain words from Duna's answer. */
  readonly message: string;
  readonly at: number;
}

export interface AttendanceQueueState {
  readonly version: typeof ATTENDANCE_QUEUE_VERSION;
  readonly marks: readonly AttendanceMark[];
  readonly conflicts: readonly AttendanceConflict[];
  readonly nextSeq: number;
}

export const EMPTY_ATTENDANCE_QUEUE: AttendanceQueueState = Object.freeze({
  version: ATTENDANCE_QUEUE_VERSION,
  marks: Object.freeze([]) as readonly AttendanceMark[],
  conflicts: Object.freeze([]) as readonly AttendanceConflict[],
  nextSeq: 1,
});

/** What a send returned. */
export type AttendanceSendResult =
  /** Duna applied it. */
  | { readonly kind: "sent" }
  /** Duna answered but kept something else; the reason is shown. */
  | { readonly kind: "ignored"; readonly reason: string }
  /** Duna refused it for good (permission, closed); the message is shown. */
  | { readonly kind: "rejected"; readonly message: string }
  /** No connection, a timeout or a server hiccup: try again later. */
  | { readonly kind: "retry" };

export interface NewAttendanceMark {
  readonly id: string;
  readonly target: AttendanceTarget;
  readonly sessionId: string;
  readonly bookingId: string;
  readonly personName: string;
  readonly status: AttendanceStatus;
  readonly at: number;
}

/** 2 s, 4 s, 8 s … capped at five minutes. */
export function backoffMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** exponent);
}

/**
 * Adds a mark. A mark with the same id is ignored (idempotent); an older
 * mark for the same booking that is not in flight is replaced.
 */
export function enqueueMark(
  state: AttendanceQueueState,
  input: NewAttendanceMark,
  inFlightId: string | null = null,
): AttendanceQueueState {
  if (state.marks.some((mark) => mark.id === input.id)) return state;
  const kept = state.marks.filter(
    (mark) =>
      mark.id === inFlightId ||
      !(
        mark.sessionId === input.sessionId && mark.bookingId === input.bookingId
      ),
  );
  const mark: AttendanceMark = {
    id: input.id,
    target: input.target,
    sessionId: input.sessionId,
    bookingId: input.bookingId,
    personName: input.personName,
    status: input.status,
    deviceMarkedAt: new Date(input.at).toISOString(),
    seq: state.nextSeq,
    attempts: 0,
    notBefore: input.at + UNDO_MS,
  };
  return {
    ...state,
    marks: [...kept, mark],
    // A newer answer about the same person clears an old conflict.
    conflicts: state.conflicts.filter(
      (conflict) =>
        !(
          conflict.sessionId === input.sessionId &&
          conflict.bookingId === input.bookingId
        ),
    ),
    nextSeq: state.nextSeq + 1,
  };
}

/** Undo: removes a mark that has not been sent. False when it already left. */
export function undoMark(
  state: AttendanceQueueState,
  id: string,
  inFlightId: string | null = null,
): { readonly state: AttendanceQueueState; readonly undone: boolean } {
  if (id === inFlightId || !state.marks.some((mark) => mark.id === id)) {
    return { state, undone: false };
  }
  return {
    state: { ...state, marks: state.marks.filter((mark) => mark.id !== id) },
    undone: true,
  };
}

/** The oldest mark, when it may be sent now; otherwise null (order holds). */
export function nextDueMark(
  state: AttendanceQueueState,
  now: number,
): AttendanceMark | null {
  const head = [...state.marks].sort((a, b) => a.seq - b.seq)[0];
  if (!head) return null;
  return head.notBefore <= now ? head : null;
}

/** When the queue next has something to send (epoch ms), or null. */
export function nextWakeAt(state: AttendanceQueueState): number | null {
  const head = [...state.marks].sort((a, b) => a.seq - b.seq)[0];
  return head ? head.notBefore : null;
}

/** Applies Duna's answer to a sent mark. */
export function applySendResult(
  state: AttendanceQueueState,
  id: string,
  result: AttendanceSendResult,
  now: number,
): AttendanceQueueState {
  const mark = state.marks.find((candidate) => candidate.id === id);
  if (!mark) return state;
  if (result.kind === "retry") {
    const attempts = mark.attempts + 1;
    return {
      ...state,
      marks: state.marks.map((candidate) =>
        candidate.id === id
          ? { ...candidate, attempts, notBefore: now + backoffMs(attempts) }
          : candidate,
      ),
    };
  }
  const remaining = state.marks.filter((candidate) => candidate.id !== id);
  if (result.kind === "sent") return { ...state, marks: remaining };
  const conflict: AttendanceConflict = {
    id: mark.id,
    sessionId: mark.sessionId,
    bookingId: mark.bookingId,
    personName: mark.personName,
    status: mark.status,
    message:
      result.kind === "ignored"
        ? conflictMessage(result.reason, mark.personName)
        : result.message,
    at: now,
  };
  return {
    ...state,
    marks: remaining,
    conflicts: [conflict, ...state.conflicts].slice(0, MAX_CONFLICTS),
  };
}

/** Duna's reasons for not applying a mark, in plain words. */
export function conflictMessage(reason: string, personName: string): string {
  switch (reason) {
    case "newer-mark-exists":
      return `Someone marked ${personName} more recently, so Duna kept that mark.`;
    case "cancelled":
      return `${personName}'s booking was cancelled, so the mark was not saved.`;
    case "not-in-session":
      return `${personName} is no longer booked in this session.`;
    default:
      return `Duna did not save the mark for ${personName}.`;
  }
}

/** Drops a conflict once the coach has read it. */
export function dismissConflict(
  state: AttendanceQueueState,
  id: string,
): AttendanceQueueState {
  return {
    ...state,
    conflicts: state.conflicts.filter((conflict) => conflict.id !== id),
  };
}

/** Marks for one session (what is still on the phone), oldest first. */
export function pendingForSession(
  state: AttendanceQueueState,
  sessionId: string,
): readonly AttendanceMark[] {
  return state.marks
    .filter((mark) => mark.sessionId === sessionId)
    .sort((a, b) => a.seq - b.seq);
}

/** Restores saved JSON; anything unreadable starts empty, never crashes. */
export function parseAttendanceQueue(
  raw: string | null | undefined,
): AttendanceQueueState {
  if (!raw) return EMPTY_ATTENDANCE_QUEUE;
  try {
    const value = JSON.parse(raw) as Partial<AttendanceQueueState>;
    if (value.version !== ATTENDANCE_QUEUE_VERSION)
      return EMPTY_ATTENDANCE_QUEUE;
    const marks = Array.isArray(value.marks) ? value.marks.filter(isMark) : [];
    const conflicts = Array.isArray(value.conflicts)
      ? value.conflicts.filter(
          (conflict): conflict is AttendanceConflict =>
            typeof conflict?.id === "string" &&
            typeof conflict.message === "string",
        )
      : [];
    const highest = marks.reduce((max, mark) => Math.max(max, mark.seq), 0);
    return {
      version: ATTENDANCE_QUEUE_VERSION,
      marks,
      conflicts,
      nextSeq: Math.max(
        highest + 1,
        typeof value.nextSeq === "number" ? value.nextSeq : 1,
      ),
    };
  } catch {
    return EMPTY_ATTENDANCE_QUEUE;
  }
}

function isMark(value: unknown): value is AttendanceMark {
  const mark = value as Partial<AttendanceMark> | null;
  return (
    typeof mark?.id === "string" &&
    (mark.target === "participation" || mark.target === "registration") &&
    typeof mark.sessionId === "string" &&
    typeof mark.bookingId === "string" &&
    (mark.status === "attended" ||
      mark.status === "absent" ||
      mark.status === "unmarked") &&
    typeof mark.deviceMarkedAt === "string" &&
    typeof mark.seq === "number" &&
    typeof mark.attempts === "number" &&
    typeof mark.notBefore === "number"
  );
}

export function serializeAttendanceQueue(state: AttendanceQueueState): string {
  return JSON.stringify(state);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export interface AttendanceQueueStorage {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}

export type AttendanceSender = (
  mark: AttendanceMark,
) => Promise<AttendanceSendResult>;

export interface AttendanceQueueOptions {
  readonly storage: AttendanceQueueStorage;
  readonly send: AttendanceSender;
  readonly now?: () => number;
  /** Schedules the next flush; tests pass a fake. Returns a cancel function. */
  readonly schedule?: (delayMs: number, run: () => void) => () => void;
}

/**
 * The queue on the device: load once, enqueue and undo from the screen, and
 * `flush()` whenever the app comes back or a timer fires. Listeners get every
 * change (the screen shows "saved on this phone" from `state.marks`).
 */
export class AttendanceQueue {
  private state: AttendanceQueueState = EMPTY_ATTENDANCE_QUEUE;
  private loaded = false;
  private loading: Promise<void> | null = null;
  private inFlight: string | null = null;
  private flushing: Promise<void> | null = null;
  private cancelTimer: (() => void) | null = null;
  private writes: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<(state: AttendanceQueueState) => void>();
  private readonly now: () => number;
  private readonly schedule: (delayMs: number, run: () => void) => () => void;

  constructor(private readonly options: AttendanceQueueOptions) {
    this.now = options.now ?? Date.now;
    this.schedule =
      options.schedule ??
      ((delay, run) => {
        const timer = setTimeout(run, delay);
        return () => clearTimeout(timer);
      });
  }

  snapshot(): AttendanceQueueState {
    return this.state;
  }

  /** The mark currently being sent, if any. */
  sending(): string | null {
    return this.inFlight;
  }

  subscribe(listener: (state: AttendanceQueueState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  load(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    this.loading ??= this.options.storage
      .read()
      .then((raw) => {
        // Anything enqueued before the saved queue arrived goes after it.
        const saved = parseAttendanceQueue(raw);
        let merged = saved;
        for (const mark of this.state.marks) {
          merged = enqueueMark(merged, {
            id: mark.id,
            target: mark.target,
            sessionId: mark.sessionId,
            bookingId: mark.bookingId,
            personName: mark.personName,
            status: mark.status,
            at: Date.parse(mark.deviceMarkedAt),
          });
        }
        const hadUnsaved = this.state.marks.length > 0;
        this.state = merged;
        this.loaded = true;
        if (hadUnsaved) this.persist();
        this.emit();
      })
      .catch(() => {
        this.loaded = true;
      });
    return this.loading;
  }

  enqueue(input: NewAttendanceMark): void {
    this.commit(enqueueMark(this.state, input, this.inFlight));
  }

  undo(id: string): boolean {
    const result = undoMark(this.state, id, this.inFlight);
    if (result.undone) this.commit(result.state);
    return result.undone;
  }

  dismiss(id: string): void {
    this.commit(dismissConflict(this.state, id));
  }

  /** Sends what is due, in order, until something must wait. */
  flush(): Promise<void> {
    this.flushing ??= this.drain().finally(() => {
      this.flushing = null;
      this.arm();
    });
    return this.flushing;
  }

  /** Stops the timer (the provider unmounting). */
  dispose(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
    this.listeners.clear();
  }

  private async drain(): Promise<void> {
    await this.load();
    for (;;) {
      const due = nextDueMark(this.state, this.now());
      if (!due) return;
      this.inFlight = due.id;
      this.emit();
      let result: AttendanceSendResult;
      try {
        result = await this.options.send(due);
      } catch {
        result = { kind: "retry" };
      }
      this.inFlight = null;
      this.commit(applySendResult(this.state, due.id, result, this.now()));
      if (result.kind === "retry") return;
    }
  }

  private arm(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
    const wake = nextWakeAt(this.state);
    if (wake === null) return;
    const delay = Math.max(0, wake - this.now());
    this.cancelTimer = this.schedule(delay, () => {
      this.cancelTimer = null;
      void this.flush();
    });
  }

  private commit(next: AttendanceQueueState): void {
    if (next === this.state) return;
    this.state = next;
    // Before the saved queue is read, writing would overwrite it; `load`
    // merges and saves instead.
    if (this.loaded) this.persist();
    this.emit();
    if (!this.flushing) this.arm();
  }

  /** Writes in order, so an older snapshot never lands after a newer one. */
  private persist(): void {
    const json = serializeAttendanceQueue(this.state);
    this.writes = this.writes
      .then(() => this.options.storage.write(json))
      .catch(() => undefined);
  }

  /** Resolves when every write so far has finished (tests, background). */
  settled(): Promise<void> {
    return this.writes;
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.state);
  }
}
