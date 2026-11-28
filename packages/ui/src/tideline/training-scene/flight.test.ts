import {
  resolveTrainingScene,
  trainingSceneExamples,
} from "@duna/core/training-scene";
import { describe, expect, it } from "vitest";
import {
  BALL_RADIUS,
  clearanceNeeded,
  contactKind,
  ease,
  planFlight,
  planVerbFlight,
  sampleFlight,
} from "./flight";
import { prepareTrainingScene } from "./prepare";
import { buildTimeline } from "./timeline";

const timelines = trainingSceneExamples.map((example) => {
  const result = prepareTrainingScene(example);
  if (!result.ok) throw new Error("example does not validate");
  return buildTimeline(result.scene);
});

describe("ball flight", () => {
  it("is a parabola that starts and lands exactly at the contact points", () => {
    const flight = planFlight(
      { x: 0, y: -6, z: 0.8 },
      { x: 0.5, y: -1.5, z: 2.4 },
      { flight: "apex", apex: 4.4 },
    );
    expect(sampleFlight(flight, 0)).toEqual({ x: 0, y: -6, z: 0.8 });
    const end = sampleFlight(flight, flight.duration);
    expect(end.x).toBeCloseTo(0.5, 9);
    expect(end.y).toBeCloseTo(-1.5, 9);
    expect(end.z).toBeCloseTo(2.4, 9);
    // The peak is the apex, never more.
    let peak = 0;
    for (let k = 0; k <= 200; k++) {
      peak = Math.max(
        peak,
        sampleFlight(flight, (k / 200) * flight.duration).z,
      );
    }
    expect(peak).toBeCloseTo(4.4, 2);
    expect(peak).toBeLessThanOrEqual(4.4 + 1e-9);
  });

  it("raises an arc that would hit the net, and keeps an authored override", () => {
    const low = planVerbFlight(
      { x: 0, y: -8, z: 1.0 },
      { x: 0, y: 2, z: BALL_RADIUS },
      "hit",
      2.43,
    );
    expect(low.adjusted).toBe(true);
    expect(low.crossing!.z).toBeGreaterThanOrEqual(clearanceNeeded(2.43));
    const kept = planVerbFlight(
      { x: 0, y: -8, z: 1.0 },
      { x: 0, y: 2, z: BALL_RADIUS },
      "hit",
      2.43,
      { apex: 2.0 },
    );
    expect(kept.override).toBe(true);
    expect(kept.adjusted).toBe(false);
  });

  it("matches the validator's apex for every contact of every example", () => {
    for (const [index, timeline] of timelines.entries()) {
      const resolved = resolveTrainingScene(trainingSceneExamples[index])!;
      const apexById = new Map(
        resolved.steps.flatMap((step) =>
          step.actions.map((action) => [action.id, action.apex] as const),
        ),
      );
      for (const contact of timeline.reps[0]!.contacts) {
        expect(contact.flight.apex, contact.id).toBeCloseTo(
          apexById.get(contact.id)!,
          6,
        );
      }
    }
  });

  it("clears the net whenever a ball crosses it, and lands where the scene says", () => {
    for (const timeline of timelines) {
      const need = clearanceNeeded(timeline.scene.resolved.court.netHeight);
      const actions = new Map(
        timeline.scene.resolved.steps.flatMap((step) =>
          step.actions.map((action) => [action.id, action] as const),
        ),
      );
      for (const rep of timeline.reps) {
        for (const contact of rep.contacts) {
          const action = actions.get(contact.id)!;
          expect(contact.to.x).toBeCloseTo(action.to!.x, 9);
          expect(contact.to.y).toBeCloseTo(action.to!.y, 9);
          expect(contact.flight.crossing !== null).toBe(action.crossesNet);
          if (contact.flight.crossing) {
            expect(contact.flight.crossing.z).toBeGreaterThanOrEqual(
              need - 1e-9,
            );
          }
        }
      }
    }
  });

  it("gives each verb its shape: sets peak above the net, serves clear it, attacks drive down", () => {
    const contacts = timelines.flatMap(
      (timeline) => timeline.reps[0]!.contacts,
    );
    const net = 2.24;
    for (const contact of contacts.filter((c) => c.verb === "set")) {
      expect(contact.flight.apex).toBeGreaterThan(net + 2);
    }
    for (const contact of contacts.filter(
      (c) => c.verb === "serve" || c.verb === "jumpserve",
    )) {
      expect(contact.flight.crossing).not.toBeNull();
      expect(contact.flight.crossing!.z).toBeGreaterThan(net);
    }
    const attacks = contacts.filter((c) => c.verb === "attack");
    expect(attacks.length).toBeGreaterThan(0);
    for (const contact of attacks) {
      // Downward from the contact: never above the hand.
      expect(contact.flight.apex).toBeCloseTo(contact.from.z, 6);
      expect(contact.to.z).toBeLessThan(contact.from.z);
      const early = sampleFlight(contact.flight, contact.flight.duration * 0.1);
      expect(early.z).toBeLessThan(contact.from.z);
    }
  });

  it("names the kind of contact the line shows", () => {
    expect(contactKind("serve")).toBe("driven");
    expect(contactKind("attack")).toBe("driven");
    expect(contactKind("pass")).toBe("lofted");
    expect(contactKind("dig")).toBe("lofted");
    expect(contactKind("set")).toBe("placed");
    expect(contactKind("toss")).toBe("placed");
    expect(contactKind("roll")).toBe("placed");
  });

  it("eases in and out without overshooting", () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBe(0.5);
    for (let k = 0; k <= 100; k++) {
      const value = ease(k / 100);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(ease(-1)).toBe(0);
    expect(ease(2)).toBe(1);
  });
});
