import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAsyncSearch,
  createDelayedLoading,
  runOptimisticAction,
  withViewTransition,
  type AsyncSearchState,
} from "./interaction-core";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("createDelayedLoading", () => {
  it("shows nothing for work that finishes within the delay", () => {
    const seen: boolean[] = [];
    const loading = createDelayedLoading((visible) => seen.push(visible));
    loading.set(true);
    vi.advanceTimersByTime(249);
    loading.set(false);
    vi.advanceTimersByTime(2000);
    expect(seen).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows after 250ms and then stays at least 400ms", () => {
    const seen: boolean[] = [];
    const loading = createDelayedLoading((visible) => seen.push(visible));
    loading.set(true);
    vi.advanceTimersByTime(250);
    expect(seen).toEqual([true]);
    vi.advanceTimersByTime(50);
    loading.set(false);
    vi.advanceTimersByTime(349);
    expect(loading.isVisible()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual([true, false]);
  });

  it("hides at once when it has already been up long enough", () => {
    const seen: boolean[] = [];
    const loading = createDelayedLoading((visible) => seen.push(visible));
    loading.set(true);
    vi.advanceTimersByTime(250 + 400);
    loading.set(false);
    expect(seen).toEqual([true, false]);
  });

  it("stays up, without a flicker, when work restarts during the minimum", () => {
    const seen: boolean[] = [];
    const loading = createDelayedLoading((visible) => seen.push(visible));
    loading.set(true);
    vi.advanceTimersByTime(260);
    loading.set(false);
    vi.advanceTimersByTime(100);
    loading.set(true);
    vi.advanceTimersByTime(5000);
    expect(seen).toEqual([true]);
    loading.set(false);
    expect(seen).toEqual([true, false]);
  });

  it("takes its thresholds from options and cleans up on dispose", () => {
    const seen: boolean[] = [];
    const loading = createDelayedLoading((visible) => seen.push(visible), {
      delayMs: 0,
      minDurationMs: 100,
    });
    loading.set(true);
    expect(seen).toEqual([true]);
    loading.set(false);
    loading.dispose();
    vi.advanceTimersByTime(1000);
    expect(seen).toEqual([true]);
    expect(vi.getTimerCount()).toBe(0);
  });
});

interface Person {
  id: string;
  name: string;
}
const sam = { id: "1", name: "Sam Rivera" };
const sara = { id: "2", name: "Sara Lund" };
const noor = { id: "3", name: "Noor Haddad" };

function deferredSearch() {
  const calls: Array<{
    query: string;
    signal: AbortSignal;
    resolve: (items: Person[]) => void;
    reject: (error: unknown) => void;
  }> = [];
  const search = (query: string, signal: AbortSignal) =>
    new Promise<Person[]>((resolve, reject) => {
      calls.push({ query, signal, resolve, reject });
    });
  return { calls, search };
}

function setup(
  options: Partial<Parameters<typeof createAsyncSearch<Person>>[0]> = {},
) {
  const { calls, search } = deferredSearch();
  const states: Array<AsyncSearchState<Person>> = [];
  const controller = createAsyncSearch<Person>(
    { search, debounceMs: 220, ...options },
    (state) => states.push(state),
  );
  return { calls, states, controller, last: () => controller.getState() };
}

const settle = () => vi.advanceTimersByTimeAsync(0);

describe("createAsyncSearch", () => {
  it("debounces typing into one request with the trimmed text", async () => {
    const { calls, controller, last } = setup();
    controller.setQuery("s");
    vi.advanceTimersByTime(100);
    controller.setQuery("sa");
    vi.advanceTimersByTime(100);
    controller.setQuery(" sam ");
    expect(calls).toHaveLength(0);
    expect(last().status).toBe("loading");
    vi.advanceTimersByTime(220);
    expect(calls.map((call) => call.query)).toEqual(["sam"]);
    calls[0]!.resolve([sam]);
    await settle();
    expect(last()).toMatchObject({
      status: "success",
      results: [sam],
      stale: false,
    });
  });

  it("filters loaded items at once, before any request", () => {
    const { calls, controller, last } = setup({
      items: [sam, sara, noor],
      filter: (item, query) => item.name.toLowerCase().includes(query),
      getKey: (item) => item.id,
    });
    controller.setQuery("sa");
    expect(calls).toHaveLength(0);
    expect(last()).toMatchObject({
      status: "loading",
      results: [sam, sara],
      stale: false,
    });
  });

  it("merges fetched results after the loaded ones, without duplicates", async () => {
    const { calls, controller, last } = setup({
      items: [sam],
      filter: (item, query) => item.name.toLowerCase().includes(query),
      getKey: (item) => item.id,
    });
    controller.setQuery("sa");
    vi.advanceTimersByTime(220);
    calls[0]!.resolve([sara, sam]);
    await settle();
    expect(last().results).toEqual([sam, sara]);
  });

  it("aborts the request in flight when the query changes", () => {
    const { calls, controller } = setup();
    controller.setQuery("sa");
    vi.advanceTimersByTime(220);
    expect(calls[0]!.signal.aborted).toBe(false);
    controller.setQuery("sam");
    expect(calls[0]!.signal.aborted).toBe(true);
  });

  it("does not abort a request that has already answered", async () => {
    const { calls, controller } = setup();
    controller.setQuery("sa");
    vi.advanceTimersByTime(220);
    calls[0]!.resolve([sam]);
    await settle();
    controller.setQuery("sam");
    expect(calls[0]!.signal.aborted).toBe(false);
  });

  it("ignores a stale response that arrives after a newer query", async () => {
    const { calls, controller, last } = setup();
    controller.setQuery("sa");
    vi.advanceTimersByTime(220);
    controller.setQuery("noor");
    vi.advanceTimersByTime(220);
    calls[1]!.resolve([noor]);
    await settle();
    // The first request answers late and out of order.
    calls[0]!.resolve([sam, sara]);
    await settle();
    expect(last()).toMatchObject({ status: "success", results: [noor] });
  });

  it("never clears results while typing: the old ones stay, marked stale", async () => {
    const { calls, controller, last, states } = setup();
    controller.setQuery("sa");
    vi.advanceTimersByTime(220);
    calls[0]!.resolve([sam, sara]);
    await settle();
    controller.setQuery("sam");
    expect(last()).toMatchObject({
      status: "loading",
      results: [sam, sara],
      stale: true,
    });
    // No state between the two searches ever had an empty list.
    const afterFirst = states.slice(
      states.findIndex((s) => s.results.length > 0),
    );
    expect(afterFirst.every((state) => state.results.length > 0)).toBe(true);
    vi.advanceTimersByTime(220);
    calls[1]!.resolve([sam]);
    await settle();
    expect(last()).toMatchObject({
      status: "success",
      results: [sam],
      stale: false,
    });
  });

  it("reports empty and error, keeping the last good results under an error", async () => {
    const { calls, controller, last } = setup();
    controller.setQuery("zz");
    vi.advanceTimersByTime(220);
    calls[0]!.resolve([]);
    await settle();
    expect(last()).toMatchObject({ status: "empty", results: [] });

    controller.setQuery("sa");
    vi.advanceTimersByTime(220);
    calls[1]!.resolve([sam]);
    await settle();
    controller.setQuery("sam");
    vi.advanceTimersByTime(220);
    const failure = new Error("offline");
    calls[2]!.reject(failure);
    await settle();
    expect(last()).toMatchObject({
      status: "error",
      error: failure,
      results: [sam],
      stale: true,
    });
  });

  it("does not report an aborted request as an error", async () => {
    const { calls, controller, last } = setup();
    controller.setQuery("sa");
    vi.advanceTimersByTime(220);
    controller.setQuery("sam");
    calls[0]!.reject(new DOMException("Aborted", "AbortError"));
    await settle();
    expect(last().status).toBe("loading");
  });

  it("submit searches immediately, and retries after an error", async () => {
    const { calls, controller, last } = setup();
    controller.setQuery("sam");
    controller.submit();
    expect(calls.map((call) => call.query)).toEqual(["sam"]);
    vi.advanceTimersByTime(1000);
    // The debounced request was replaced, not added.
    expect(calls).toHaveLength(1);
    calls[0]!.reject(new Error("offline"));
    await settle();
    expect(last().status).toBe("error");
    controller.submit();
    expect(last().status).toBe("loading");
    calls[1]!.resolve([sam]);
    await settle();
    expect(last()).toMatchObject({ status: "success", results: [sam] });
  });

  it("goes idle, cancels and aborts when the text is cleared or too short", () => {
    const { calls, controller, last } = setup({ minLength: 2 });
    controller.setQuery("s");
    vi.advanceTimersByTime(500);
    expect(calls).toHaveLength(0);
    expect(last().status).toBe("idle");
    controller.setQuery("sa");
    vi.advanceTimersByTime(220);
    controller.setQuery("");
    expect(calls[0]!.signal.aborted).toBe(true);
    expect(last()).toMatchObject({ status: "idle", results: [], stale: false });
    controller.submit();
    expect(calls).toHaveLength(1);
  });

  it("dispose cancels the waiting request and aborts the running one", () => {
    const { calls, controller } = setup();
    controller.setQuery("sa");
    controller.dispose();
    vi.advanceTimersByTime(1000);
    expect(calls).toHaveLength(0);
    controller.setQuery("sam");
    vi.advanceTimersByTime(220);
    controller.dispose();
    expect(calls[0]!.signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("runOptimisticAction", () => {
  function list() {
    let items = ["a"];
    return {
      get: () => items,
      apply: (item: string) => {
        const before = items;
        items = [...items, item];
        return () => {
          items = before;
        };
      },
    };
  }

  it("applies before the save resolves and keeps the change on success", async () => {
    const state = list();
    let finish: () => void = () => undefined;
    const onSuccess = vi.fn();
    const result = runOptimisticAction(
      {
        apply: state.apply,
        commit: () => new Promise<void>((resolve) => (finish = resolve)),
        onSuccess,
      },
      "b",
    );
    expect(state.get()).toEqual(["a", "b"]);
    expect(onSuccess).not.toHaveBeenCalled();
    finish();
    await expect(result).resolves.toBe(true);
    expect(state.get()).toEqual(["a", "b"]);
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it("rolls back and reports when the save fails, without rejecting", async () => {
    const state = list();
    const onError = vi.fn();
    const failure = new Error("nope");
    await expect(
      runOptimisticAction(
        { apply: state.apply, commit: () => Promise.reject(failure), onError },
        "b",
      ),
    ).resolves.toBe(false);
    expect(state.get()).toEqual(["a"]);
    expect(onError).toHaveBeenCalledWith({ args: ["b"], error: failure });
  });

  it("undo reverses the change once, on screen and on the server", async () => {
    const state = list();
    const undoCommit = vi.fn(() => Promise.resolve());
    let undo: () => Promise<boolean> = () => Promise.resolve(false);
    await runOptimisticAction(
      {
        apply: state.apply,
        commit: () => Promise.resolve(),
        undo: undoCommit,
        onSuccess: (context) => {
          undo = context.undo;
        },
      },
      "b",
    );
    await expect(undo()).resolves.toBe(true);
    expect(state.get()).toEqual(["a"]);
    expect(undoCommit).toHaveBeenCalledExactlyOnceWith("b");
    await expect(undo()).resolves.toBe(false);
    expect(undoCommit).toHaveBeenCalledOnce();
  });

  it("puts the change back when the undo cannot be saved", async () => {
    const state = list();
    const onError = vi.fn();
    let undo: () => Promise<boolean> = () => Promise.resolve(false);
    await runOptimisticAction(
      {
        apply: state.apply,
        commit: () => Promise.resolve(),
        undo: () => Promise.reject(new Error("nope")),
        onSuccess: (context) => {
          undo = context.undo;
        },
        onError,
      },
      "b",
    );
    await expect(undo()).resolves.toBe(false);
    expect(state.get()).toEqual(["a", "b"]);
    expect(onError).toHaveBeenCalledOnce();
  });
});

describe("withViewTransition", () => {
  it("just runs the update where view transitions do not exist", () => {
    const update = vi.fn();
    withViewTransition(update);
    expect(update).toHaveBeenCalledOnce();
  });

  it("uses the browser's transition when there is one", () => {
    const start = vi.fn((callback: () => void) => callback());
    vi.stubGlobal("document", { startViewTransition: start });
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const update = vi.fn();
    withViewTransition(update);
    expect(start).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
  });

  it("skips the transition under reduced motion", () => {
    const start = vi.fn();
    vi.stubGlobal("document", { startViewTransition: start });
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const update = vi.fn();
    withViewTransition(update);
    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });
});
