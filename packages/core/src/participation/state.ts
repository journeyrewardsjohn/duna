/**
 * The session state machine (participation.md §3.2–§3.3) as ONE pure
 * transition function, plus the derivation every reader uses from stored
 * facts. The engine applies the effects; this module only decides them.
 */

export const PARTICIPATION_STATES = [
  "needs-players",
  "minimum-reached",
  "full",
  "confirmed",
  "running-small",
  "cancelled-low",
  "cancelled-club",
  "done",
  "settled",
] as const;
export type ParticipationState = (typeof PARTICIPATION_STATES)[number];

/** Stored on `participation_decisions.outcome`. */
export const PARTICIPATION_OUTCOMES = [
  "minimum-met",
  "run-under-minimum",
  "cancel-under-minimum",
  "cancelled-by-club",
] as const;
export type ParticipationDecisionOutcome =
  (typeof PARTICIPATION_OUTCOMES)[number];

export const PARTICIPATION_CANCEL_REASONS = [
  "minimum-not-met",
  "coach",
  "weather",
  "venue",
  "merged",
  "other",
] as const;
export type ParticipationCancelReason =
  (typeof PARTICIPATION_CANCEL_REASONS)[number];

/** The notice outbox kinds (participation.md §9). */
export const PARTICIPATION_NOTICE_KINDS = [
  "booked-needs-players",
  "needs-players-reminder",
  "confirmed",
  "cancelled-low",
  "cancelled-club",
  "lock-extended",
  "moved",
  "waitlist-offer",
  "place-refilled",
  "staff-at-risk-digest",
  "staff-cancelled",
  "refund-attention",
] as const;
export type ParticipationNoticeKind =
  (typeof PARTICIPATION_NOTICE_KINDS)[number];

export interface ParticipationMachineRule {
  readonly minParticipants: number;
  readonly capacity: number;
  readonly minimumPolicy: "cancel" | "run";
}

export interface ParticipationMachine {
  readonly state: ParticipationState;
  /** Confirmed places (group bookings count their quantity). */
  readonly booked: number;
  /** Set once the lock has decided (or a person at the club cancelled). */
  readonly outcome?: ParticipationDecisionOutcome;
  /** "Run anyway" was pressed before the lock. */
  readonly forcedRun: boolean;
}

export type ParticipationEvent =
  | { readonly type: "booked"; readonly places: number }
  | { readonly type: "cancelled"; readonly places: number }
  /** `late`: the session had already started when it was decided. */
  | { readonly type: "lock"; readonly late?: boolean }
  | { readonly type: "run-anyway" }
  | { readonly type: "extend-lock" }
  | { readonly type: "club-cancel" }
  | { readonly type: "end" }
  | { readonly type: "attendance-closed" };

export type ParticipationEffect =
  | {
      readonly type: "notice";
      readonly kind: ParticipationNoticeKind;
      readonly audience: "booker" | "bookers" | "staff";
    }
  /** Price every booking at the final group's tier, never above its reserve. */
  | { readonly type: "settle-prices" }
  /** Return everything to everyone (credits, card, reservations). */
  | { readonly type: "return-everything" }
  /** A place opened in a full session. */
  | { readonly type: "offer-waitlist" };

export interface ParticipationTransition {
  readonly machine: ParticipationMachine;
  /** Every state passed through, in order, ending with `machine.state`. */
  readonly path: readonly ParticipationState[];
  readonly effects: readonly ParticipationEffect[];
  /** Set when the event is not allowed; the machine is unchanged. */
  readonly rejected?: string;
}

const TERMINAL: readonly ParticipationState[] = [
  "cancelled-low",
  "cancelled-club",
  "settled",
];

/** Every edge the diagram allows (self-loops included). */
export const PARTICIPATION_EDGES: Readonly<
  Record<ParticipationState, readonly ParticipationState[]>
> = {
  "needs-players": [
    "needs-players",
    "minimum-reached",
    "full",
    "running-small",
    "cancelled-low",
    "cancelled-club",
  ],
  "minimum-reached": [
    "minimum-reached",
    "needs-players",
    "full",
    "confirmed",
    "cancelled-club",
  ],
  full: [
    "full",
    "minimum-reached",
    "needs-players",
    "confirmed",
    "running-small",
    "cancelled-club",
    "done",
  ],
  confirmed: ["confirmed", "full", "done", "cancelled-club"],
  "running-small": ["running-small", "full", "done", "cancelled-club"],
  "cancelled-low": ["cancelled-low"],
  "cancelled-club": ["cancelled-club"],
  done: ["done", "settled"],
  settled: ["settled"],
};

/** The state before the lock for a headcount. */
function openState(
  booked: number,
  rule: ParticipationMachineRule,
): ParticipationState {
  if (booked >= rule.capacity) return "full";
  return booked >= rule.minParticipants ? "minimum-reached" : "needs-players";
}

/** The state after the lock: the decision stands; only "full" is about places. */
function decidedState(
  booked: number,
  outcome: ParticipationDecisionOutcome,
  rule: ParticipationMachineRule,
): ParticipationState {
  if (outcome === "cancel-under-minimum") return "cancelled-low";
  if (outcome === "cancelled-by-club") return "cancelled-club";
  if (booked >= rule.capacity) return "full";
  return outcome === "minimum-met" ? "confirmed" : "running-small";
}

export function initialParticipationMachine(
  rule: ParticipationMachineRule,
  booked = 0,
): ParticipationMachine {
  return { state: openState(booked, rule), booked, forcedRun: false };
}

function reject(
  machine: ParticipationMachine,
  reason: string,
): ParticipationTransition {
  return { machine, path: [machine.state], effects: [], rejected: reason };
}

/**
 * The one transition function. Principle 4 is structural: after the lock,
 * `booked` and `cancelled` can only move between "full" and the decided
 * state; nothing but a person (`club-cancel`) cancels a decided session.
 */
export function participationTransition(
  machine: ParticipationMachine,
  event: ParticipationEvent,
  rule: ParticipationMachineRule,
): ParticipationTransition {
  if (TERMINAL.includes(machine.state)) {
    return reject(machine, `The session is ${machine.state}.`);
  }
  const decided = machine.outcome !== undefined;
  const ended = machine.state === "done";
  switch (event.type) {
    case "booked": {
      if (ended) return reject(machine, "The session has ended.");
      if (!Number.isSafeInteger(event.places) || event.places < 1) {
        return reject(machine, "Book at least one place.");
      }
      const booked = machine.booked + event.places;
      if (booked > rule.capacity) {
        return reject(machine, "The session does not have that many places.");
      }
      const state = decided
        ? decidedState(booked, machine.outcome!, rule)
        : openState(booked, rule);
      return {
        machine: { ...machine, booked, state },
        path: [state],
        effects:
          state === "needs-players"
            ? [
                {
                  type: "notice",
                  kind: "booked-needs-players",
                  audience: "booker",
                },
              ]
            : [],
      };
    }
    case "cancelled": {
      if (ended) return reject(machine, "The session has ended.");
      if (!Number.isSafeInteger(event.places) || event.places < 1) {
        return reject(machine, "Cancel at least one place.");
      }
      const booked = Math.max(0, machine.booked - event.places);
      const state = decided
        ? decidedState(booked, machine.outcome!, rule)
        : openState(booked, rule);
      return {
        machine: { ...machine, booked, state },
        path: [state],
        effects:
          machine.state === "full" && state !== "full"
            ? [{ type: "offer-waitlist" }]
            : [],
      };
    }
    case "run-anyway": {
      if (decided)
        return reject(machine, "The group has already been decided.");
      return {
        machine: { ...machine, forcedRun: true },
        path: [machine.state],
        effects: [],
      };
    }
    case "extend-lock": {
      if (decided)
        return reject(machine, "The group has already been decided.");
      return {
        machine,
        path: [machine.state],
        effects: [
          { type: "notice", kind: "lock-extended", audience: "bookers" },
        ],
      };
    }
    case "lock": {
      if (decided)
        return reject(machine, "The group has already been decided.");
      const met = machine.booked >= rule.minParticipants;
      const runs =
        met ||
        machine.forcedRun ||
        rule.minimumPolicy === "run" ||
        // Never cancel a session that already started (§4.2).
        event.late === true;
      const outcome: ParticipationDecisionOutcome = met
        ? "minimum-met"
        : runs
          ? "run-under-minimum"
          : "cancel-under-minimum";
      const state = decidedState(machine.booked, outcome, rule);
      return {
        machine: { ...machine, outcome, state },
        path: [state],
        effects:
          outcome === "cancel-under-minimum"
            ? [
                { type: "return-everything" },
                { type: "notice", kind: "cancelled-low", audience: "bookers" },
                { type: "notice", kind: "staff-cancelled", audience: "staff" },
              ]
            : [
                { type: "settle-prices" },
                { type: "notice", kind: "confirmed", audience: "bookers" },
              ],
      };
    }
    case "club-cancel": {
      if (ended) return reject(machine, "The session has ended.");
      return {
        machine: {
          ...machine,
          outcome: "cancelled-by-club",
          state: "cancelled-club",
        },
        path: ["cancelled-club"],
        effects: [
          { type: "return-everything" },
          { type: "notice", kind: "cancelled-club", audience: "bookers" },
        ],
      };
    }
    case "end": {
      if (ended) return reject(machine, "The session has already ended.");
      if (!decided) {
        // A decision the schedule missed: decide late (never cancels), then end.
        const locked = participationTransition(
          machine,
          { type: "lock", late: true },
          rule,
        );
        const finished = participationTransition(locked.machine, event, rule);
        return {
          machine: finished.machine,
          path: [...locked.path, ...finished.path],
          effects: [...locked.effects, ...finished.effects],
        };
      }
      return {
        machine: { ...machine, state: "done" },
        path: ["done"],
        effects: [],
      };
    }
    case "attendance-closed": {
      if (!ended) return reject(machine, "The session has not ended.");
      return {
        machine: { ...machine, state: "settled" },
        path: ["settled"],
        effects: [],
      };
    }
  }
}

export interface ParticipationStateFacts {
  readonly booked: number;
  readonly minParticipants: number;
  readonly capacity: number;
  readonly outcome?: ParticipationDecisionOutcome | null;
  readonly now: Date;
  readonly endsAt: Date;
  /** Attendance closed: everyone marked, or the 24-hour window passed. */
  readonly attendanceClosed?: boolean;
}

/** The state a reader shows, from stored facts. Agrees with folding the machine. */
export function deriveParticipationState(
  facts: ParticipationStateFacts,
): ParticipationState {
  const rule = {
    minParticipants: facts.minParticipants,
    capacity: facts.capacity,
    minimumPolicy: "run" as const,
  };
  if (facts.outcome === "cancelled-by-club") return "cancelled-club";
  if (facts.outcome === "cancel-under-minimum") return "cancelled-low";
  if (facts.now >= facts.endsAt) {
    return facts.attendanceClosed ? "settled" : "done";
  }
  return facts.outcome
    ? decidedState(facts.booked, facts.outcome, rule)
    : openState(facts.booked, rule);
}

export function participationStateIsTerminal(
  state: ParticipationState,
): boolean {
  return TERMINAL.includes(state);
}

export function participationStateIsCancelled(
  state: ParticipationState,
): boolean {
  return state === "cancelled-low" || state === "cancelled-club";
}
