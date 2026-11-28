import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosave } from "./autosave-core";
import { createDebouncer, createThrottler } from "./debouncer";
import {
  createIdempotencyKey,
  errorMessage,
  errorReference,
  fieldErrorsFrom,
} from "./errors";
import { createLatest } from "./latest-core";
import { createAction } from "./submit-core";
import { REPEAT_GUARD_MS, SUCCESS_HOLD_MS } from "./timing";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** A promise the test settles by hand. */
function deferred<Value = void>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("createDebouncer options", () => {
  it("leading runs the first call of a burst at once and the last on the trailing edge", () => {
    const calls: number[] = [];
    const debouncer = createDebouncer(
      (value: number) => calls.push(value),
      100,
      {
        leading: true,
      },
    );
    debouncer.call(1);
    debouncer.call(2);
    debouncer.call(3);
    expect(calls).toEqual([1]);
    vi.advanceTimersByTime(100);
    expect(calls).toEqual([1, 3]);
  });

  it("leading alone runs one call per burst", () => {
    const calls: number[] = [];
    const debouncer = createDebouncer(
      (value: number) => calls.push(value),
      100,
      {
        leading: true,
        trailing: false,
      },
    );
    debouncer.call(1);
    debouncer.call(2);
    vi.advanceTimersByTime(100);
    expect(calls).toEqual([1]);
    debouncer.call(3);
    expect(calls).toEqual([1, 3]);
  });

  it("a single leading call does not run twice", () => {
    const calls: number[] = [];
    const debouncer = createDebouncer(
      (value: number) => calls.push(value),
      100,
      {
        leading: true,
      },
    );
    debouncer.call(1);
    vi.advanceTimersByTime(200);
    expect(calls).toEqual([1]);
  });
});

describe("createThrottler", () => {
  it("runs at most once per interval, then once more when the calls stop", () => {
    const calls: number[] = [];
    const throttler = createThrottler(
      (value: number) => calls.push(value),
      300,
    );
    for (let tick = 0; tick < 10; tick += 1) {
      throttler.call(tick);
      vi.advanceTimersByTime(100);
    }
    // 1 000 ms of calls: the first at once, then the newest every 300 ms.
    expect(calls).toEqual([0, 2, 5, 8]);
    // When the calls stop, the newest one settles.
    vi.advanceTimersByTime(600);
    expect(calls).toEqual([0, 2, 5, 8, 9]);
  });

  it("settles on the newest value", () => {
    const calls: string[] = [];
    const throttler = createThrottler(
      (value: string) => calls.push(value),
      300,
    );
    throttler.call("a");
    throttler.call("b");
    throttler.call("c");
    vi.advanceTimersByTime(300);
    expect(calls).toEqual(["a", "c"]);
  });

  it("cancel drops the waiting call; flush runs it now", () => {
    const calls: string[] = [];
    const throttler = createThrottler(
      (value: string) => calls.push(value),
      300,
    );
    throttler.call("a");
    throttler.call("b");
    throttler.cancel();
    vi.advanceTimersByTime(300);
    expect(calls).toEqual(["a"]);
    throttler.call("c");
    throttler.call("d");
    throttler.flush();
    expect(calls).toEqual(["a", "c", "d"]);
  });
});

describe("createAction (single flight)", () => {
  it("ignores a second activation while the first is pending", async () => {
    const save = deferred<string>();
    const action = vi.fn(() => save.promise);
    const flight = createAction({ action });
    const first = flight.run();
    const second = await flight.run();
    expect(second).toEqual({ status: "ignored" });
    expect(action).toHaveBeenCalledTimes(1);
    save.resolve("saved");
    await expect(first).resolves.toEqual({
      status: "success",
      result: "saved",
    });
  });

  it("a held Enter key (many activations) produces one call", async () => {
    const save = deferred();
    const action = vi.fn(() => save.promise);
    const flight = createAction({ action });
    const runs = Array.from({ length: 12 }, () => flight.run());
    save.resolve();
    const outcomes = await Promise.all(runs);
    expect(action).toHaveBeenCalledTimes(1);
    expect(
      outcomes.filter((outcome) => outcome.status === "ignored"),
    ).toHaveLength(11);
  });

  it("ignores a repeat that lands just after a fast success", async () => {
    const action = vi.fn(async () => "ok");
    const flight = createAction({ action });
    await flight.run();
    expect(await flight.run()).toEqual({ status: "ignored" });
    vi.advanceTimersByTime(REPEAT_GUARD_MS);
    expect((await flight.run()).status).toBe("success");
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("reuses the idempotency key on retry and makes a new one after success", async () => {
    let fail = true;
    const keys: string[] = [];
    let counter = 0;
    const flight = createAction({
      createKey: () => `key-${++counter}`,
      action: async ({ idempotencyKey, attempt }) => {
        keys.push(`${idempotencyKey}#${attempt}`);
        if (fail) throw new Error("offline");
      },
    });
    expect(flight.getState().idempotencyKey).toBe("key-1");
    await flight.run();
    await flight.run();
    fail = false;
    await flight.run();
    vi.advanceTimersByTime(REPEAT_GUARD_MS);
    await flight.run();
    expect(keys).toEqual(["key-1#1", "key-1#2", "key-1#3", "key-2#1"]);
  });

  it("reset starts a new logical attempt", async () => {
    let counter = 0;
    const flight = createAction({
      createKey: () => `key-${++counter}`,
      action: async () => {
        throw new Error("nope");
      },
    });
    await flight.run();
    flight.reset();
    expect(flight.getState()).toMatchObject({
      status: "idle",
      idempotencyKey: "key-2",
      attempt: 0,
      error: null,
    });
  });

  it("holds success, then returns to idle", async () => {
    const states: string[] = [];
    const flight = createAction({ action: async () => 1 }, (state) =>
      states.push(state.status),
    );
    await flight.run();
    expect(states).toEqual(["pending", "success"]);
    vi.advanceTimersByTime(SUCCESS_HOLD_MS);
    expect(states).toEqual(["pending", "success", "idle"]);
    expect(flight.getState().result).toBe(1);
  });

  it("maps server field errors and the reference", async () => {
    const flight = createAction({
      action: async () => {
        throw Object.assign(new Error("Invalid input"), {
          data: {
            requestId: "req_0123456789abcdef01234567",
            zodError: { fieldErrors: { email: ["Enter an email address."] } },
          },
        });
      },
    });
    await flight.run();
    expect(flight.getState()).toMatchObject({
      status: "error",
      fieldErrors: { email: "Enter an email address." },
      reference: "req_0123456789abcdef01234567",
    });
    flight.clearFieldError("email");
    expect(flight.getState().fieldErrors).toEqual({});
  });

  it("passes the arguments and a signal that aborts on dispose", async () => {
    let seen: AbortSignal | undefined;
    const gate = deferred();
    const flight = createAction({
      action: async ({ signal }, a: number, b: string) => {
        seen = signal;
        await gate.promise;
        return `${a}${b}`;
      },
    });
    const run = flight.run(1, "x");
    flight.dispose();
    expect(seen?.aborted).toBe(true);
    gate.resolve();
    await expect(run).resolves.toEqual({ status: "success", result: "1x" });
  });
});

describe("createLatest", () => {
  it("drops an older answer that arrives after a newer one", async () => {
    const latest = createLatest();
    const tuesday = deferred<string>();
    const wednesday = deferred<string>();
    const first = latest.run(() => tuesday.promise);
    const second = latest.run(() => wednesday.promise);
    wednesday.resolve("Wednesday slots");
    tuesday.resolve("Tuesday slots");
    await expect(second).resolves.toEqual({
      status: "ok",
      value: "Wednesday slots",
    });
    await expect(first).resolves.toEqual({ status: "stale" });
  });

  it("aborts the previous request's signal", async () => {
    const latest = createLatest();
    const signals: AbortSignal[] = [];
    void latest.run((signal) => {
      signals.push(signal);
      return new Promise(() => {});
    });
    void latest.run((signal) => {
      signals.push(signal);
      return new Promise(() => {});
    });
    expect(signals.map((signal) => signal.aborted)).toEqual([true, false]);
  });

  it("reports pending and errors of the newest request only", async () => {
    const pending: boolean[] = [];
    const latest = createLatest((value) => pending.push(value));
    const result = await latest.run(async () => {
      throw new Error("down");
    });
    expect(result.status).toBe("error");
    expect(pending).toEqual([true, false]);
  });

  it("an abort rejection counts as stale, not as an error", async () => {
    const latest = createLatest();
    const run = latest.run(
      (signal) =>
        new Promise((_, reject) =>
          signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          ),
        ),
    );
    latest.abort();
    await expect(run).resolves.toEqual({ status: "stale" });
  });
});

describe("createAutosave", () => {
  it("saves once after typing stops, with the newest value", async () => {
    const saved: string[] = [];
    const autosave = createAutosave<string>({
      delayMs: 2000,
      save: async (value) => {
        saved.push(value);
      },
    });
    autosave.change("D");
    autosave.change("Dr");
    autosave.change("Drill");
    expect(autosave.getState()).toMatchObject({ status: "dirty", dirty: true });
    await vi.advanceTimersByTimeAsync(1999);
    expect(saved).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(saved).toEqual(["Drill"]);
    expect(autosave.getState()).toMatchObject({
      status: "saved",
      dirty: false,
    });
  });

  it("flush saves at once (on blur)", async () => {
    const saved: string[] = [];
    const autosave = createAutosave<string>({
      save: async (value) => {
        saved.push(value);
      },
    });
    autosave.change("Serve drill");
    await autosave.flush();
    expect(saved).toEqual(["Serve drill"]);
  });

  it("never overlaps saves; a change during a save is saved after it", async () => {
    const gates: Array<ReturnType<typeof deferred<void>>> = [];
    const saved: string[] = [];
    let running = 0;
    let most = 0;
    const autosave = createAutosave<string>({
      delayMs: 100,
      save: async (value) => {
        running += 1;
        most = Math.max(most, running);
        const gate = deferred();
        gates.push(gate);
        await gate.promise;
        saved.push(value);
        running -= 1;
      },
    });
    autosave.change("a");
    await vi.advanceTimersByTimeAsync(100);
    autosave.change("ab");
    await vi.advanceTimersByTimeAsync(100);
    expect(gates).toHaveLength(1);
    gates[0]!.resolve();
    await vi.advanceTimersByTimeAsync(0);
    // The newer draft's quiet time passed during the first save: it saves next.
    expect(gates).toHaveLength(2);
    expect(autosave.getState()).toMatchObject({
      status: "saving",
      dirty: true,
    });
    gates[1]!.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(saved).toEqual(["a", "ab"]);
    expect(most).toBe(1);
    expect(autosave.getState().status).toBe("saved");
  });

  it("a failed save stays dirty and retries on request", async () => {
    let fail = true;
    const autosave = createAutosave<string>({
      save: async () => {
        if (fail) throw new Error("offline");
      },
    });
    autosave.change("x");
    await autosave.flush();
    expect(autosave.getState()).toMatchObject({ status: "error", dirty: true });
    fail = false;
    await autosave.retry();
    expect(autosave.getState()).toMatchObject({
      status: "saved",
      dirty: false,
    });
  });
});

describe("error helpers", () => {
  it("finds the reference in the API's error shapes", () => {
    expect(errorReference({ data: { requestId: "req_1" } })).toBe("req_1");
    expect(errorReference({ digest: "2034" })).toBe("2034");
    expect(errorReference({ cause: { requestId: "req_2" } })).toBe("req_2");
    expect(errorReference(new Error("x"))).toBeUndefined();
  });

  it("maps field errors from zod, issues and plain records", () => {
    expect(
      fieldErrorsFrom({
        issues: [{ path: ["address", "city"], message: "Enter a city." }],
      }),
    ).toEqual({ "address.city": "Enter a city." });
    expect(fieldErrorsFrom({ fieldErrors: { name: "Required" } })).toEqual({
      name: "Required",
    });
    expect(fieldErrorsFrom(new Error("x"))).toBeNull();
  });

  it("shows API messages without the reference, and a fallback otherwise", () => {
    expect(
      errorMessage(
        {
          message: "Something went wrong on our side. Reference: req_9",
          data: { requestId: "req_9" },
        },
        "Could not save.",
      ),
    ).toBe("Something went wrong on our side.");
    expect(
      errorMessage(new TypeError("Failed to fetch"), "Could not save."),
    ).toBe("Could not save.");
  });

  it("makes v4 UUIDs", () => {
    const key = createIdempotencyKey();
    expect(key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(createIdempotencyKey()).not.toBe(key);
  });
});
