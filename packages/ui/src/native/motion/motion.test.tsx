import { netScoreState, type NetScoreInput } from "@duna/tideline-core/score";
import { createElement, useState } from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it } from "vitest";
import { testAnimations, testEnvironment } from "../test-support/react-native";
import { hapticsFor, HapticsProvider, type HapticsAdapter } from "./haptics";
import { MotionPreference } from "./reduced-motion";
import { Rise } from "./Rise";
import { describeScoreParts, useScoreChange } from "./score";
import { rallyDelay, staysInside, verbTiming } from "./timing";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  testAnimations.length = 0;
  testEnvironment.announcements.length = 0;
});

describe("motion timing", () => {
  it("uses the token durations and the one ease-out curve", () => {
    expect(verbTiming("rise", false)).toMatchObject({
      duration: 600,
      moves: true,
    });
    expect(verbTiming("rally", false)).toMatchObject({
      duration: 600,
      stagger: 120,
    });
    expect(verbTiming("cross", false)).toMatchObject({ duration: 320 });
    expect(staysInside(verbTiming("rise", false).easing)).toBe(true);
    expect(rallyDelay(3, false)).toBe(360);
  });

  it("reduced motion is a 200 ms fade with no stagger", () => {
    for (const verb of ["rise", "rally", "cross"] as const) {
      expect(verbTiming(verb, true)).toMatchObject({
        duration: 200,
        moves: false,
        stagger: 0,
      });
    }
    expect(rallyDelay(3, true)).toBe(0);
  });

  it("Rise animates on the native driver with the token duration, and only fades when reduced", async () => {
    await act(async () => {
      create(createElement(Rise, null, "x"));
    });
    expect(
      testAnimations.find((a) => a.kind === "timing")?.config,
    ).toMatchObject({ duration: 600, useNativeDriver: true });
    testAnimations.length = 0;
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        createElement(
          MotionPreference,
          { reduceMotion: true },
          createElement(Rise, { mode: "grow" }, "x"),
        ),
      );
    });
    expect(
      testAnimations.find((a) => a.kind === "timing")?.config,
    ).toMatchObject({ duration: 200 });
    const view = renderer.root.findByType("Animated.View" as never);
    expect(
      (
        [view.props.style]
          .flat(2)
          .find((s: { transform?: unknown }) => s && "transform" in s) as {
          transform: unknown[];
        }
      ).transform,
    ).toEqual([]);
  });
});

describe("haptics", () => {
  it("pairs the three confirmation tiers and a point scored", () => {
    const calls: string[] = [];
    const adapter: HapticsAdapter = {
      selection: () => calls.push("selection"),
      impact: (w) => calls.push(`impact:${w}`),
      notification: (k) => calls.push(`notification:${k}`),
    };
    const haptics = hapticsFor(adapter);
    haptics.confirmed(0);
    haptics.confirmed(1);
    haptics.confirmed(2);
    haptics.pointScored();
    haptics.refused();
    expect(calls).toEqual([
      "selection",
      "impact:medium",
      "notification:success",
      "impact:light",
      "notification:error",
    ]);
  });
});

describe("score change", () => {
  const base: NetScoreInput = {
    status: "live",
    sets: [{ home: 19, away: 18 }],
    bestOf: 3,
    rules: { pointsToWin: 21, winBy: 2 },
  };

  it("describes scoreAnnouncement parts in plain English", () => {
    const before = netScoreState(base);
    const after = netScoreState({ ...base, sets: [{ home: 20, away: 18 }] });
    expect(
      describeScoreParts(
        [
          { kind: "point", side: "home", setNumber: 1, points: 1 },
          { kind: "set-point", side: "home" },
        ],
        { home: "Duna", away: "Sunset" },
      ),
    ).toBe("Point Duna. Set point Duna");
    expect(before.headline).not.toEqual(after.headline);
    expect(describeScoreParts([{ kind: "correction" }])).toBe(
      "Score corrected",
    );
  });

  it("announces, ticks once per point, and never ticks for a correction", async () => {
    const calls: string[] = [];
    const adapter: HapticsAdapter = {
      selection: () => undefined,
      impact: (w) => calls.push(w),
      notification: () => undefined,
    };
    let setSets: (sets: NetScoreInput["sets"]) => void = () => undefined;
    function Harness() {
      const [sets, set] = useState(base.sets);
      setSets = set;
      useScoreChange(netScoreState({ ...base, sets }), {
        names: { home: "Duna", away: "Sunset" },
      });
      return null;
    }
    await act(async () => {
      create(
        createElement(HapticsProvider, { adapter }, createElement(Harness)),
      );
    });
    await act(async () => setSets([{ home: 20, away: 18 }]));
    expect(testEnvironment.announcements).toEqual([
      "Point Duna. Set point Duna",
    ]);
    expect(calls).toEqual(["light"]);
    await act(async () => setSets([{ home: 19, away: 18 }]));
    expect(testEnvironment.announcements.at(-1)).toBe("Score corrected");
    expect(calls).toEqual(["light"]);
  });
});
