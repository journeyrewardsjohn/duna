import { afterEach, describe, expect, it, vi } from "vitest";
import { createDeferredModalTransition } from "./deferred-modal-transition";

afterEach(() => {
  vi.useRealTimers();
});

describe("createDeferredModalTransition", () => {
  it("waits for the current modal to dismiss before opening its destination", () => {
    vi.useFakeTimers();
    const completed: string[] = [];
    const transition = createDeferredModalTransition<string>({
      delayMs: 420,
      onComplete: (value) => completed.push(value),
    });

    transition.schedule("event:golden-hour");
    expect(completed).toEqual([]);

    vi.advanceTimersByTime(419);
    expect(completed).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(completed).toEqual(["event:golden-hour"]);
  });

  it("uses native dismissal when available and completes only once", () => {
    vi.useFakeTimers();
    const completed: string[] = [];
    const transition = createDeferredModalTransition<string>({
      onComplete: (value) => completed.push(value),
    });

    transition.schedule("registration");
    transition.complete();
    vi.runAllTimers();

    expect(completed).toEqual(["registration"]);
  });

  it("cancels a destination when its owning surface unmounts", () => {
    vi.useFakeTimers();
    const completed: string[] = [];
    const transition = createDeferredModalTransition<string>({
      onComplete: (value) => completed.push(value),
    });

    transition.schedule("event");
    transition.cancel();
    vi.runAllTimers();

    expect(completed).toEqual([]);
  });
});
