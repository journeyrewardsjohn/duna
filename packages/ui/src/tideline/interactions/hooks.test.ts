import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `packages/ui` has no DOM test environment, so these tests run the hooks
 * on a small stand-in for React's hook runtime: state, refs, memo and
 * effects with dependency checks and cleanups, in React's order (render,
 * then the previous effect's cleanup, then the effect). It is enough to
 * prove what the hooks promise; the gallery's Playwright spec covers them in
 * a real browser.
 */
const runtime = vi.hoisted(() => {
  interface Cell {
    value?: unknown;
    deps?: ReadonlyArray<unknown>;
    cleanup?: () => void;
    setter?: (next: unknown) => void;
  }
  let cells: Cell[] = [];
  let cursor = 0;
  let effects: Array<() => void> = [];
  let render: (() => void) | null = null;
  let rendering = false;
  let dirty = false;

  const changed = (
    previous: ReadonlyArray<unknown> | undefined,
    next: ReadonlyArray<unknown> | undefined,
  ) =>
    !previous ||
    !next ||
    previous.length !== next.length ||
    previous.some((value, index) => !Object.is(value, next[index]));

  const cell = (): { cell: Cell; fresh: boolean } => {
    const fresh = cursor >= cells.length;
    if (fresh) cells.push({});
    return { cell: cells[cursor++]!, fresh };
  };

  const requestRender = () => {
    if (rendering) {
      dirty = true;
      return;
    }
    render?.();
  };

  return {
    react: {
      useRef<Value>(initial: Value) {
        const { cell: current, fresh } = cell();
        if (fresh) current.value = { current: initial };
        return current.value as { current: Value };
      },
      useMemo<Value>(factory: () => Value, deps: ReadonlyArray<unknown>) {
        const { cell: current } = cell();
        if (changed(current.deps, deps)) {
          current.value = factory();
          current.deps = deps;
        }
        return current.value as Value;
      },
      useState<Value>(initial: Value) {
        const { cell: current, fresh } = cell();
        if (fresh) {
          current.value = initial;
          current.setter = (update) => {
            const next =
              typeof update === "function"
                ? (update as (previous: unknown) => unknown)(current.value)
                : update;
            if (Object.is(next, current.value)) return;
            current.value = next;
            requestRender();
          };
        }
        return [current.value as Value, current.setter!] as const;
      },
      useEffect(
        create: () => void | (() => void),
        deps?: ReadonlyArray<unknown>,
      ) {
        const { cell: current } = cell();
        if (!changed(current.deps, deps)) return;
        current.deps = deps;
        effects.push(() => {
          current.cleanup?.();
          current.cleanup = create() ?? undefined;
        });
      },
    },
    mount<Props, Result>(
      hook: (props: Props) => Result,
      initial: NoInfer<Props>,
    ) {
      cells = [];
      let props = initial;
      const result = { current: undefined as Result };
      render = () => {
        do {
          dirty = false;
          rendering = true;
          cursor = 0;
          effects = [];
          result.current = hook(props);
          const pending = effects;
          for (const effect of pending) effect();
          rendering = false;
        } while (dirty);
      };
      render();
      return {
        result,
        rerender(next: Props) {
          props = next;
          render?.();
        },
        unmount() {
          render = null;
          for (const current of cells) current.cleanup?.();
        },
      };
    },
  };
});

const toastMock = vi.hoisted(() => {
  const toast = Object.assign(vi.fn(), { error: vi.fn() });
  return { toast };
});

vi.mock("react", () => runtime.react);
vi.mock("@ui-sdk/react/toast", () => toastMock);

import { useDebouncedCallback, useDebouncedValue } from "./debounce";
import { createDebouncer } from "./debouncer";
import {
  useAsyncSearch,
  useDelayedLoading,
  useOptimisticAction,
} from "./interactions";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createDebouncer", () => {
  it("calls once, on the trailing edge, with the latest arguments", () => {
    const spy = vi.fn();
    const debouncer = createDebouncer(spy, 300);
    debouncer.call("s");
    vi.advanceTimersByTime(200);
    debouncer.call("sa");
    vi.advanceTimersByTime(299);
    expect(spy).not.toHaveBeenCalled();
    expect(debouncer.pending()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(spy).toHaveBeenCalledExactlyOnceWith("sa");
    expect(debouncer.pending()).toBe(false);
  });

  it("does not call on the leading edge", () => {
    const spy = vi.fn();
    createDebouncer(spy, 100).call();
    expect(spy).not.toHaveBeenCalled();
  });

  it("cancel drops the waiting call", () => {
    const spy = vi.fn();
    const debouncer = createDebouncer(spy, 100);
    debouncer.call(1);
    debouncer.cancel();
    vi.advanceTimersByTime(500);
    expect(spy).not.toHaveBeenCalled();
    expect(debouncer.pending()).toBe(false);
  });

  it("flush runs the waiting call now, once", () => {
    const spy = vi.fn();
    const debouncer = createDebouncer(spy, 100);
    debouncer.flush();
    expect(spy).not.toHaveBeenCalled();
    debouncer.call("go");
    debouncer.flush();
    expect(spy).toHaveBeenCalledExactlyOnceWith("go");
    vi.advanceTimersByTime(500);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("can be used again after a call, a cancel or a flush", () => {
    const spy = vi.fn();
    const debouncer = createDebouncer(spy, 50);
    debouncer.call("a");
    vi.advanceTimersByTime(50);
    debouncer.call("b");
    debouncer.cancel();
    debouncer.call("c");
    vi.advanceTimersByTime(50);
    expect(spy.mock.calls).toEqual([["a"], ["c"]]);
  });

  it("calls straight away with no delay", () => {
    const spy = vi.fn();
    createDebouncer(spy, 0).call("now");
    expect(spy).toHaveBeenCalledExactlyOnceWith("now");
  });
});

describe("useDebouncedCallback", () => {
  it("makes one trailing call with the latest arguments", () => {
    const spy = vi.fn();
    const hook = runtime.mount(() => useDebouncedCallback(spy, 300), null);
    hook.result.current("s");
    hook.result.current("sa");
    hook.result.current("sam");
    expect(hook.result.current.isPending()).toBe(true);
    vi.advanceTimersByTime(299);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(spy).toHaveBeenCalledExactlyOnceWith("sam");
    expect(hook.result.current.isPending()).toBe(false);
  });

  it("cancels the waiting call on unmount", () => {
    const spy = vi.fn();
    const hook = runtime.mount(() => useDebouncedCallback(spy, 300), null);
    hook.result.current("late");
    hook.unmount();
    vi.advanceTimersByTime(1000);
    expect(spy).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the same function between renders and runs the newest callback", () => {
    const first = vi.fn();
    const second = vi.fn();
    const hook = runtime.mount(
      (callback: (value: string) => void) =>
        useDebouncedCallback(callback, 100),
      first,
    );
    const debounced = hook.result.current;
    debounced("x");
    hook.rerender(second);
    expect(hook.result.current).toBe(debounced);
    vi.advanceTimersByTime(100);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledExactlyOnceWith("x");
  });

  it("cancel and flush work through the hook", () => {
    const spy = vi.fn();
    const hook = runtime.mount(() => useDebouncedCallback(spy, 100), null);
    hook.result.current("a");
    hook.result.current.cancel();
    vi.advanceTimersByTime(100);
    expect(spy).not.toHaveBeenCalled();
    hook.result.current("b");
    hook.result.current.flush();
    expect(spy).toHaveBeenCalledExactlyOnceWith("b");
  });

  it("drops the waiting call when the delay changes", () => {
    const spy = vi.fn();
    const hook = runtime.mount(
      (delay: number) => useDebouncedCallback(spy, delay),
      100,
    );
    hook.result.current("old");
    hook.rerender(500);
    vi.advanceTimersByTime(1000);
    expect(spy).not.toHaveBeenCalled();
    hook.result.current("new");
    vi.advanceTimersByTime(500);
    expect(spy).toHaveBeenCalledExactlyOnceWith("new");
  });
});

describe("useDebouncedValue", () => {
  it("returns the first value at once, then follows after the delay", () => {
    const hook = runtime.mount(
      (value: string) => useDebouncedValue(value, 200),
      "a",
    );
    expect(hook.result.current).toBe("a");
    hook.rerender("ab");
    expect(hook.result.current).toBe("a");
    vi.advanceTimersByTime(199);
    expect(hook.result.current).toBe("a");
    vi.advanceTimersByTime(1);
    expect(hook.result.current).toBe("ab");
  });

  it("only takes the last of several quick changes", () => {
    const hook = runtime.mount(
      (value: string) => useDebouncedValue(value, 200),
      "",
    );
    hook.rerender("s");
    vi.advanceTimersByTime(150);
    hook.rerender("sa");
    vi.advanceTimersByTime(150);
    expect(hook.result.current).toBe("");
    vi.advanceTimersByTime(50);
    expect(hook.result.current).toBe("sa");
  });

  it("clears its timer on unmount", () => {
    const hook = runtime.mount(
      (value: string) => useDebouncedValue(value, 200),
      "a",
    );
    hook.rerender("b");
    hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("passes the value straight through with no delay", () => {
    const hook = runtime.mount(
      (value: string) => useDebouncedValue(value, 0),
      "a",
    );
    hook.rerender("b");
    expect(hook.result.current).toBe("b");
  });
});

describe("useDelayedLoading", () => {
  it("stays false for work shorter than 250ms", () => {
    const hook = runtime.mount(
      (loading: boolean) => useDelayedLoading(loading),
      true,
    );
    vi.advanceTimersByTime(249);
    hook.rerender(false);
    vi.advanceTimersByTime(1000);
    expect(hook.result.current).toBe(false);
  });

  it("turns true at 250ms and holds for 400ms after that", () => {
    const hook = runtime.mount(
      (loading: boolean) => useDelayedLoading(loading),
      true,
    );
    vi.advanceTimersByTime(250);
    expect(hook.result.current).toBe(true);
    hook.rerender(false);
    vi.advanceTimersByTime(399);
    expect(hook.result.current).toBe(true);
    vi.advanceTimersByTime(1);
    expect(hook.result.current).toBe(false);
  });

  it("leaves no timer behind on unmount", () => {
    const hook = runtime.mount(
      (loading: boolean) => useDelayedLoading(loading),
      true,
    );
    hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("useAsyncSearch", () => {
  it("debounces, reports results, and aborts on unmount", async () => {
    const signals: AbortSignal[] = [];
    const search = vi.fn((query: string, signal: AbortSignal) => {
      signals.push(signal);
      return Promise.resolve([`${query}-1`]);
    });
    const hook = runtime.mount(
      () => useAsyncSearch<string>({ search, debounceMs: 200 }),
      null,
    );
    expect(hook.result.current.status).toBe("idle");
    hook.result.current.setQuery("s");
    hook.result.current.setQuery("sa");
    expect(hook.result.current).toMatchObject({
      status: "loading",
      query: "sa",
    });
    expect(search).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(search).toHaveBeenCalledExactlyOnceWith("sa", signals[0]);
    expect(hook.result.current).toMatchObject({
      status: "success",
      results: ["sa-1"],
    });

    hook.result.current.setQuery("sam");
    hook.result.current.submit();
    expect(search).toHaveBeenCalledTimes(2);
    hook.unmount();
    expect(signals[1]!.aborted).toBe(true);
  });
});

describe("useOptimisticAction", () => {
  beforeEach(() => {
    toastMock.toast.mockClear();
    toastMock.toast.error.mockClear();
  });

  it("applies at once, then offers Undo in a toast once saved", async () => {
    let items = ["a"];
    const undoCommit = vi.fn(() => Promise.resolve());
    const hook = runtime.mount(
      () =>
        useOptimisticAction<[string]>({
          apply: (item) => {
            const before = items;
            items = [...items, item];
            return () => {
              items = before;
            };
          },
          commit: () => Promise.resolve(),
          undo: undoCommit,
          messages: {
            success: (item) => `${item} added`,
            error: (item) => `Could not add ${item}`,
          },
        }),
      null,
    );
    const saving = hook.result.current.run("b");
    expect(items).toEqual(["a", "b"]);
    expect(hook.result.current.pending).toBe(1);
    await expect(saving).resolves.toBe(true);
    expect(hook.result.current.pending).toBe(0);
    expect(toastMock.toast).toHaveBeenCalledExactlyOnceWith(
      "b added",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Undo" }),
      }),
    );

    const { action } = toastMock.toast.mock.calls[0]![1] as {
      action: { onAction: () => void };
    };
    action.onAction();
    await vi.advanceTimersByTimeAsync(0);
    expect(items).toEqual(["a"]);
    expect(undoCommit).toHaveBeenCalledExactlyOnceWith("b");
  });

  it("rolls back and raises an error toast when the save fails", async () => {
    let on = false;
    const hook = runtime.mount(
      () =>
        useOptimisticAction<[boolean]>({
          apply: (next) => {
            const before = on;
            on = next;
            return () => {
              on = before;
            };
          },
          commit: () => Promise.reject(new Error("offline")),
          messages: { error: () => "Could not save. Put back." },
        }),
      null,
    );
    const saving = hook.result.current.run(true);
    expect(on).toBe(true);
    await expect(saving).resolves.toBe(false);
    expect(on).toBe(false);
    expect(toastMock.toast.error).toHaveBeenCalledExactlyOnceWith(
      "Could not save. Put back.",
    );
    expect(toastMock.toast).not.toHaveBeenCalled();
  });
});
