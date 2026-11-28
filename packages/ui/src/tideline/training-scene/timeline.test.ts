import { trainingSceneExamples } from "@duna/core/training-scene";
import { describe, expect, it } from "vitest";
import { sampleFlight } from "./flight";
import { prepareTrainingScene, type PreparedScene } from "./prepare";
import { initialOccupancy, sceneDescription } from "./sentences";
import {
  buildTimeline,
  itemIndexAt,
  JUMP_HEIGHT,
  sampleTimeline,
  stillTime,
  trackAt,
} from "./timeline";

function scene(id: string): PreparedScene {
  const example = trainingSceneExamples.find((entry) => entry.id === id)!;
  const result = prepareTrainingScene(example);
  if (!result.ok) throw new Error(`${id} does not validate`);
  return result.scene;
}

const ids = trainingSceneExamples.map((example) => String(example.id));

describe("timeline", () => {
  it.each(ids)(
    "%s: a contact waits for its ball, and steps run in order",
    (id) => {
      const timeline = buildTimeline(scene(id));
      for (const rep of timeline.reps) {
        const byBall = new Map<string, typeof rep.contacts>();
        for (const contact of rep.contacts) {
          byBall.set(contact.ball, [
            ...(byBall.get(contact.ball) ?? []),
            contact,
          ]);
        }
        for (const contacts of byBall.values()) {
          for (let i = 1; i < contacts.length; i++) {
            expect(contacts[i]!.t0).toBeGreaterThanOrEqual(
              contacts[i - 1]!.t1 - 1e-9,
            );
          }
        }
        for (let i = 1; i < rep.steps.length; i++) {
          expect(rep.steps[i]!.t0).toBeGreaterThanOrEqual(rep.steps[i - 1]!.t0);
        }
      }
      const times = timeline.items.map((item) => item.t);
      expect([...times].sort((a, b) => a - b)).toEqual(times);
      expect(timeline.duration).toBeGreaterThan(0);
      expect(timeline.duration).toBeLessThan(120);
    },
  );

  it("puts the ball in the right place at each contact", () => {
    const timeline = buildTimeline(scene("serve-receive-sideout"));
    const rep = timeline.reps[0]!;
    for (const contact of rep.contacts) {
      const frame = sampleTimeline(timeline, contact.t0 + 1e-6);
      const ball = frame.balls.find((entry) => entry.id === contact.ball)!;
      expect(ball.inFlight).toBe(true);
      expect(ball.x).toBeCloseTo(contact.from.x, 3);
      expect(ball.y).toBeCloseTo(contact.from.y, 3);
      const mid = sampleFlight(contact.flight, contact.flight.duration / 2);
      const middle = sampleTimeline(timeline, (contact.t0 + contact.t1) / 2);
      const flying = middle.balls.find((entry) => entry.id === contact.ball)!;
      expect(flying.z).toBeCloseTo(mid.z, 6);
    }
    // The serve leaves from the server's own spot.
    const start = sampleTimeline(timeline, 0);
    const server = timeline.scene.resolved.slots.find(
      (slot) => slot.id === "srv",
    )!;
    expect(start.balls[0]!.visible).toBe(true);
    expect(
      Math.hypot(start.balls[0]!.x - server.x, start.balls[0]!.y - server.y),
    ).toBeLessThan(0.5);
  });

  it("moves the setter to the target before the set, and walks everyone home", () => {
    const timeline = buildTimeline(scene("serve-receive-sideout"));
    const rep = timeline.reps[0]!;
    const set = rep.contacts.find((contact) => contact.verb === "set")!;
    const setter = rep.tracks[set.person]!;
    const atSet = trackAt(setter, set.t0);
    expect(Math.hypot(atSet.x - set.from.x, atSet.y - set.from.y)).toBeLessThan(
      0.5,
    );
    const home = timeline.scene.resolved.slots.find(
      (slot) => slot.id === rep.personSlot[set.person],
    )!;
    const end = trackAt(setter, rep.duration);
    expect(Math.hypot(end.x - home.x, end.y - home.y)).toBeLessThan(0.05);
    // Jumps for the attack, at display height only.
    const attack = rep.contacts.find((contact) => contact.verb === "attack")!;
    const frame = sampleTimeline(timeline, attack.t0);
    const attacker = frame.people.find(
      (person) => person.person === attack.person,
    )!;
    expect(attacker.z).toBeGreaterThan(0);
    expect(attacker.z).toBeLessThanOrEqual(JUMP_HEIGHT);
  });

  it("replays the same script after the rotation with the people moved on", () => {
    const prepared = scene("serve-receive-sideout");
    const timeline = buildTimeline(prepared);
    expect(timeline.segments.map((segment) => segment.kind)).toEqual([
      "rep",
      "rotation",
      "rep",
    ]);
    const [first, second] = timeline.reps;
    // srv ↔ feed, passL ↔ passR.
    expect(second!.occupancy).toEqual({
      srv: "p4",
      feed: "p1",
      passL: "p3",
      passR: "p2",
    });
    expect(
      second!.contacts.map((contact) => [contact.actor, contact.verb]),
    ).toEqual(first!.contacts.map((contact) => [contact.actor, contact.verb]));
    expect(second!.contacts.map((contact) => contact.person)).toEqual([
      "p4",
      "p3",
      "p2",
      "p3",
    ]);
    const captions = timeline.items
      .filter((item) => item.rep === 1)
      .map((item) => item.caption);
    expect(captions[0]).toBe("P4 serves to P3.");
    // The rotation walks round the post, never through the net.
    const rotation = timeline.rotation!;
    const crossing = rotation.moves.filter((move) => move.path.length === 3);
    for (const move of crossing) {
      expect(Math.abs(move.path[1]!.x)).toBeGreaterThan(
        prepared.resolved.court.width / 2,
      );
    }
    const mid = sampleTimeline(
      timeline,
      (timeline.segments[1]!.t0 + timeline.segments[1]!.t1) / 2,
    );
    expect(mid.balls).toEqual([]);
    expect(mid.people).toHaveLength(
      Object.keys(initialOccupancy(prepared)).length,
    );
  });

  it("shows a winner-stays drill's chosen outcome", () => {
    const timeline = buildTimeline(scene("king-of-the-court"));
    expect(timeline.rotation?.name).toBe("kings-win");
    expect(timeline.reps[1]!.occupancy.c1).toBe("p5");
  });

  it("keeps a pepper ball alive from one rep to the next", () => {
    const timeline = buildTimeline(scene("partner-pepper"));
    const rep = timeline.reps[0]!;
    expect(rep.continuous).toBe(true);
    const last = rep.contacts[rep.contacts.length - 1]!;
    // The last set is aimed at the next rep's first hit, so it arrives at hand height.
    expect(last.to.z).toBeGreaterThan(2);
    expect(rep.duration).toBeCloseTo(last.t1, 6);
  });

  it("waits for everything before an `after: previous` step", () => {
    const timeline = buildTimeline(scene("serving-to-targets"));
    const rep = timeline.reps[0]!;
    expect(rep.steps[1]!.t0).toBeCloseTo(rep.contacts[0]!.t1 + 0.6, 6);
  });

  it("finds the step at a time, and a still for every step", () => {
    const timeline = buildTimeline(scene("indoor-receive-outside"));
    timeline.items.forEach((item, index) => {
      expect(itemIndexAt(timeline, item.t + 1e-6)).toBe(index);
      const still = stillTime(timeline, index);
      expect(still).toBeGreaterThanOrEqual(item.t);
      expect(itemIndexAt(timeline, still)).toBe(index);
    });
    expect(itemIndexAt(timeline, -5)).toBe(0);
    expect(itemIndexAt(timeline, 1e9)).toBe(timeline.items.length - 1);
  });

  it("can leave the rotation out", () => {
    const timeline = buildTimeline(scene("serve-receive-sideout"), {
      rotation: false,
    });
    expect(timeline.reps).toHaveLength(1);
    expect(timeline.items.every((item) => item.kind === "step")).toBe(true);
  });
});

describe("the text alternative", () => {
  it.each(ids)("%s reads as sentences", (id) => {
    expect(sceneDescription(scene(id))).toMatchSnapshot();
  });

  it.each(ids)("%s: one sentence per step, each naming its step", (id) => {
    const timeline = buildTimeline(scene(id));
    for (const item of timeline.items) {
      if (item.kind === "step") {
        expect(
          item.sentence.startsWith(`Step ${item.number} of ${item.of}:`),
        ).toBe(true);
      } else {
        expect(item.sentence.startsWith("Rotation.")).toBe(true);
      }
      expect(item.sentence).not.toMatch(/undefined|NaN|\{|\}/);
    }
  });
});
