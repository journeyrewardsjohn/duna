import { describe, expect, it } from "vitest";
import {
  PARTICIPATION_EDGES,
  PARTICIPATION_STATES,
  deriveParticipationState,
  initialParticipationMachine,
  lateCancellationCharge,
  participationReservePerPlayer,
  participationTransition,
  perPlayerPrice,
  type ParticipationEvent,
  type ParticipationMachine,
  type ParticipationMachineRule,
  type ParticipationState,
} from "./index";
import { planParticipationSettlement } from "../participation";

/** Deterministic PRNG so property runs are reproducible. */
function prng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

const rules: readonly ParticipationMachineRule[] = [
  { minParticipants: 2, capacity: 2, minimumPolicy: "cancel" },
  { minParticipants: 3, capacity: 6, minimumPolicy: "cancel" },
  { minParticipants: 4, capacity: 12, minimumPolicy: "run" },
  { minParticipants: 1, capacity: 8, minimumPolicy: "cancel" },
];

function randomEvent(next: () => number): ParticipationEvent {
  const roll = next();
  const places = 1 + Math.floor(next() * 3);
  if (roll < 0.35) return { type: "booked", places };
  if (roll < 0.55) return { type: "cancelled", places };
  if (roll < 0.65) return { type: "lock" };
  if (roll < 0.72) return { type: "run-anyway" };
  if (roll < 0.77) return { type: "extend-lock" };
  if (roll < 0.8) return { type: "club-cancel" };
  if (roll < 0.9) return { type: "end" };
  return { type: "attendance-closed" };
}

function walk(seed: number, rule: ParticipationMachineRule, steps = 40) {
  const next = prng(seed);
  let machine: ParticipationMachine = initialParticipationMachine(rule);
  const history: {
    before: ParticipationMachine;
    event: ParticipationEvent;
    after: ParticipationMachine;
    path: readonly ParticipationState[];
    rejected?: string;
  }[] = [];
  for (let step = 0; step < steps; step += 1) {
    const event = randomEvent(next);
    const result = participationTransition(machine, event, rule);
    history.push({
      before: machine,
      event,
      after: result.machine,
      path: result.path,
      rejected: result.rejected,
    });
    machine = result.machine;
  }
  return history;
}

describe("the transition function (property-style)", () => {
  const seeds = Array.from({ length: 250 }, (_, index) => index + 1);

  it("never skips a state: every step follows an edge of the diagram", () => {
    for (const rule of rules) {
      for (const seed of seeds) {
        for (const step of walk(seed, rule)) {
          let from = step.before.state;
          for (const to of step.path) {
            expect(PARTICIPATION_EDGES[from]).toContain(to);
            from = to;
          }
          expect(step.path.at(-1)).toBe(step.after.state);
        }
      }
    }
  });

  it("after the lock, headcount alone never cancels", () => {
    for (const rule of rules) {
      for (const seed of seeds) {
        for (const step of walk(seed, rule)) {
          if (
            step.before.outcome !== undefined &&
            step.before.state !== "cancelled-low" &&
            step.before.state !== "cancelled-club" &&
            (step.event.type === "booked" || step.event.type === "cancelled")
          ) {
            expect(["cancelled-low", "cancelled-club"]).not.toContain(
              step.after.state,
            );
            expect(step.after.outcome).toBe(step.before.outcome);
          }
        }
      }
    }
  });

  it("a session that already started is never cancelled for numbers", () => {
    for (const rule of rules) {
      const machine = initialParticipationMachine(rule, 0);
      const late = participationTransition(
        machine,
        { type: "lock", late: true },
        rule,
      );
      expect(late.machine.state).not.toBe("cancelled-low");
      const ended = participationTransition(machine, { type: "end" }, rule);
      expect(ended.machine.state).toBe("done");
    }
  });

  it("never holds more than the capacity", () => {
    for (const rule of rules) {
      for (const seed of seeds) {
        for (const step of walk(seed, rule)) {
          expect(step.after.booked).toBeLessThanOrEqual(rule.capacity);
          expect(step.after.booked).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("agrees with the derivation readers use", () => {
    const endsAt = new Date("2026-12-10T18:00:00Z");
    for (const rule of rules) {
      for (const seed of seeds) {
        for (const step of walk(seed, rule)) {
          const machine = step.after;
          if (machine.state === "done" || machine.state === "settled") continue;
          expect(
            deriveParticipationState({
              booked: machine.booked,
              minParticipants: rule.minParticipants,
              capacity: rule.capacity,
              outcome: machine.outcome,
              now: new Date("2026-12-09T12:00:00Z"),
              endsAt,
            }),
          ).toBe(machine.state);
        }
      }
    }
  });

  it("reaches every state", () => {
    const seen = new Set<ParticipationState>();
    for (const rule of rules) {
      for (const seed of seeds) {
        for (const step of walk(seed, rule)) seen.add(step.after.state);
      }
    }
    expect([...seen].sort()).toEqual([...PARTICIPATION_STATES].sort());
  });
});

describe("worked example 1: semi-private (2 of 2, cancel)", () => {
  const rule = {
    minParticipants: 2,
    capacity: 2,
    minimumPolicy: "cancel",
  } as const;

  it("Maya alone is cancelled at the lock with everything returned", () => {
    let machine = initialParticipationMachine(rule);
    const booked = participationTransition(
      machine,
      { type: "booked", places: 1 },
      rule,
    );
    expect(booked.machine.state).toBe("needs-players");
    expect(booked.effects).toEqual([
      { type: "notice", kind: "booked-needs-players", audience: "booker" },
    ]);
    machine = booked.machine;
    const locked = participationTransition(machine, { type: "lock" }, rule);
    expect(locked.machine.state).toBe("cancelled-low");
    expect(locked.effects.map((effect) => effect.type)).toContain(
      "return-everything",
    );
  });

  it("Run anyway before the lock makes it run small", () => {
    let machine = participationTransition(
      initialParticipationMachine(rule),
      { type: "booked", places: 1 },
      rule,
    ).machine;
    machine = participationTransition(
      machine,
      { type: "run-anyway" },
      rule,
    ).machine;
    expect(
      participationTransition(machine, { type: "lock" }, rule).machine.state,
    ).toBe("running-small");
  });

  it("a full session offers the waitlist when a place opens", () => {
    const full = participationTransition(
      initialParticipationMachine(rule),
      { type: "booked", places: 2 },
      rule,
    );
    expect(full.machine.state).toBe("full");
    expect(
      participationTransition(
        full.machine,
        { type: "cancelled", places: 1 },
        rule,
      ).effects,
    ).toEqual([{ type: "offer-waitlist" }]);
  });
});

describe("money properties", () => {
  const ladders = [
    [
      { minParticipants: 1, maxParticipants: 1, creditsPerPlayer: 3 },
      { minParticipants: 2, maxParticipants: 6, creditsPerPlayer: 2 },
      { minParticipants: 7, maxParticipants: 12, creditsPerPlayer: 1 },
    ],
    [
      { minParticipants: 4, maxParticipants: 7, creditsPerPlayer: 3 },
      { minParticipants: 8, maxParticipants: 12, creditsPerPlayer: 2 },
    ],
  ];

  it("nobody is charged above the maximum they reserved", () => {
    const next = prng(99);
    for (const tiers of ladders) {
      const reserve = participationReservePerPlayer(tiers)!;
      for (let run = 0; run < 300; run += 1) {
        const groupSize = Math.floor(next() * 14);
        const bookings = Array.from(
          { length: 1 + Math.floor(next() * 5) },
          (_, index) => {
            const quantity = 1 + Math.floor(next() * 3);
            return {
              id: `b${index}`,
              quantity,
              reservedCredits: reserve * quantity,
            };
          },
        );
        for (const line of planParticipationSettlement({
          creditTiers: tiers,
          headcount: groupSize,
          bookings,
        })) {
          const booking = bookings.find((entry) => entry.id === line.id)!;
          expect(line.settledCredits).toBeLessThanOrEqual(
            booking.reservedCredits,
          );
          expect(line.returnedCredits).toBeGreaterThanOrEqual(0);
        }
        for (const booking of bookings) {
          expect(
            lateCancellationCharge({
              tiers,
              finalGroupSize: groupSize,
              quantity: booking.quantity,
              reserved: booking.reservedCredits,
            }),
          ).toBeLessThanOrEqual(booking.reservedCredits);
        }
      }
    }
  });

  it("a bigger group never costs a player more", () => {
    for (const tiers of ladders) {
      for (let size = 2; size <= 12; size += 1) {
        expect(perPlayerPrice(tiers, size)!).toBeLessThanOrEqual(
          perPlayerPrice(tiers, size - 1)!,
        );
      }
    }
  });
});
