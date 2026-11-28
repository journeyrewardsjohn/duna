import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it } from "vitest";
import { testAnimations } from "../test-support/react-native";
import { MotionPreference } from "../motion/reduced-motion";
import { flipStartsAt, LAUNCH } from "./launch";
import { LaunchSequence } from "./LaunchSequence";
import {
  ButtonLoader,
  CrossingLoader,
  LiveCrest,
  PullToRefreshIndicator,
  RallyLoader,
  ServeLoader,
  SetBySetLoader,
  Skeleton,
  Spinner,
  TideSweep,
} from "./loaders";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  testAnimations.length = 0;
});

const loaders = [
  createElement(RallyLoader, { label: "Loading" }),
  createElement(CrossingLoader),
  createElement(SetBySetLoader, { done: 1 }),
  createElement(PullToRefreshIndicator, { progress: 0.5, refreshing: false }),
  createElement(TideSweep),
  createElement(Skeleton, { kind: "row" }),
  createElement(ButtonLoader),
  createElement(ServeLoader),
  createElement(Spinner),
  createElement(LiveCrest),
];

describe("loaders", () => {
  it("the eight loaders render and name themselves for assistive technology", async () => {
    for (const loader of loaders) {
      let renderer!: ReturnType<typeof create>;
      await act(async () => {
        renderer = create(loader);
      });
      const labelled = renderer.root.findAll(
        (node) => typeof node.props.accessibilityLabel === "string",
      );
      expect(labelled.length, String(loader.type)).toBeGreaterThan(0);
    }
  });

  it("loop under normal motion and rest under reduced motion", async () => {
    await act(async () => {
      create(createElement(RallyLoader));
    });
    expect(testAnimations.some((a) => a.kind === "loop")).toBe(true);
    testAnimations.length = 0;
    await act(async () => {
      create(
        createElement(
          MotionPreference,
          { reduceMotion: true },
          createElement(RallyLoader),
        ),
      );
    });
    expect(testAnimations.some((a) => a.kind === "loop")).toBe(false);
  });
});

describe("first open", () => {
  it("follows the brand book timeline", () => {
    expect(LAUNCH.net).toEqual({ at: 300, duration: 450 });
    expect(LAUNCH.crests).toEqual({ at: 700, duration: 600, stagger: 120 });
    expect(LAUNCH.wordmark.at).toBe(1400);
    expect(LAUNCH.flip).toMatchObject({
      at: 3500,
      duration: 1400,
      toDegrees: -108,
      perspective: 1500,
    });
    expect(LAUNCH.earliestFlip).toBe(1540);
  });

  it("turns the page at 3.5 s without a signal, waits for Home, may go early, and skips at once", () => {
    expect(flipStartsAt({})).toBe(3500);
    expect(flipStartsAt({ readyAt: null })).toBeNull();
    expect(flipStartsAt({ readyAt: 200 })).toBe(1540);
    expect(flipStartsAt({ readyAt: 5000 })).toBe(5000);
    expect(flipStartsAt({ readyAt: null, skippedAt: 900 })).toBe(900);
  });

  it("completes and calls back; reduced motion cross-fades in 200 ms", async () => {
    let completed = 0;
    await act(async () => {
      create(
        createElement(LaunchSequence, { onComplete: () => (completed += 1) }),
      );
    });
    expect(completed).toBe(1);
    const flip = testAnimations.filter((a) => a.kind === "timing").at(-1);
    expect(flip?.config).toMatchObject({
      duration: 1400,
      useNativeDriver: true,
    });
    testAnimations.length = 0;
    await act(async () => {
      create(
        createElement(
          MotionPreference,
          { reduceMotion: true },
          createElement(LaunchSequence, { onComplete: () => (completed += 1) }),
        ),
      );
    });
    expect(
      testAnimations.filter((a) => a.kind === "timing").at(-1)?.config,
    ).toMatchObject({ duration: 200 });
    expect(completed).toBe(2);
  });
});
