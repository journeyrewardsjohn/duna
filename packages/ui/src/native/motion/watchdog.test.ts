import type { Animated } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runWithWatchdog, settleValues, WATCHDOG_SLACK_MS } from "./watchdog";

type Callback = (result: { finished: boolean }) => void;

/** An animation whose completion callback the test fires (or never fires). */
function fakeAnimation() {
  let callback: Callback | undefined;
  const animation = {
    start: vi.fn((cb?: Callback) => {
      callback = cb;
    }),
    stop: vi.fn(),
    reset: vi.fn(),
  };
  return {
    animation: animation as unknown as Animated.CompositeAnimation,
    spies: animation,
    complete: (finished = true) => callback?.({ finished }),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("runWithWatchdog", () => {
  it("finishes once through the callback and the watchdog does nothing", () => {
    const { animation, complete } = fakeAnimation();
    const settle = vi.fn();
    const onFinish = vi.fn();
    runWithWatchdog(animation, { timeline: 600, settle, onFinish });
    complete();
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(settle).not.toHaveBeenCalled();
  });

  it("settles the values and finishes when the callback never fires", () => {
    const { animation, spies } = fakeAnimation();
    const settle = vi.fn();
    const onFinish = vi.fn();
    runWithWatchdog(animation, { timeline: 600, settle, onFinish });
    vi.advanceTimersByTime(600 + WATCHDOG_SLACK_MS - 1);
    expect(onFinish).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(spies.stop).toHaveBeenCalled();
    expect(settle).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("ignores a callback that arrives after the watchdog", () => {
    const { animation, complete } = fakeAnimation();
    const onFinish = vi.fn();
    runWithWatchdog(animation, { timeline: 100, settle: vi.fn(), onFinish });
    vi.advanceTimersByTime(100 + WATCHDOG_SLACK_MS);
    complete();
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("an interrupted animation (finished: false) does not finish; the watchdog still does", () => {
    const { animation, complete } = fakeAnimation();
    const onFinish = vi.fn();
    runWithWatchdog(animation, { timeline: 100, settle: vi.fn(), onFinish });
    complete(false);
    expect(onFinish).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100 + WATCHDOG_SLACK_MS);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("cancel stops the animation, leaves no timer and finishes nothing", () => {
    const { animation, spies, complete } = fakeAnimation();
    const settle = vi.fn();
    const onFinish = vi.fn();
    const cancel = runWithWatchdog(animation, {
      timeline: 100,
      settle,
      onFinish,
    });
    cancel();
    expect(spies.stop).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    complete();
    vi.advanceTimersByTime(10_000);
    expect(onFinish).not.toHaveBeenCalled();
    expect(settle).not.toHaveBeenCalled();
  });

  it("settleValues puts every value at its end state", () => {
    const a = { setValue: vi.fn() };
    const b = { setValue: vi.fn() };
    settleValues([
      [a as unknown as Animated.Value, 1],
      [b as unknown as Animated.Value, 0],
    ])();
    expect(a.setValue).toHaveBeenCalledWith(1);
    expect(b.setValue).toHaveBeenCalledWith(0);
  });
});
