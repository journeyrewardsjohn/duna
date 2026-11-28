/**
 * Ball flight for the player: a parabola between two contact points, shaped
 * by the verb, exactly as `@duna/core/training-scene` plans it when it checks
 * the net (`physics.ts` there is not exported, so the same formulas live here
 * and the tests pin them to the validator's apex). No drag, no spin: it is an
 * illustration of the drill, good enough to read, not a simulation.
 *
 * Units: metres from the centre of the net on the floor, z up; seconds.
 */
import { TRAINING_SCENE_VERBS } from "@duna/core/training-scene";

/** Gravity, m/s². */
export const GRAVITY = 9.81;
/** FIVB ball: about 0.21 m across. */
export const BALL_RADIUS = 0.105;
/** Above the tape, on top of the ball radius (the validator's margin). */
export const NET_CLEARANCE = 0.15;

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface FlightSpec {
  readonly flight: "apex" | "speed";
  readonly apex?: number;
  readonly speed?: number;
}

export interface Flight {
  readonly p0: Point3;
  readonly p1: Point3;
  /** Time in the air, seconds. */
  readonly duration: number;
  /** Initial vertical speed, m/s. */
  readonly vz0: number;
  /** Highest point of the flight, metres. */
  readonly apex: number;
  readonly mode: "apex" | "speed";
  /** Ground distance, metres. */
  readonly distance: number;
}

export interface NetCrossing {
  /** Fraction of the flight at the net. */
  readonly u: number;
  readonly x: number;
  readonly z: number;
}

export interface VerbFlight extends Flight {
  /** The arc was raised to clear the net. */
  readonly adjusted: boolean;
  /** An authored arc override was used as is. */
  readonly override: boolean;
  readonly crossing: NetCrossing | null;
}

/** Contact height for a verb (ball height when it is played), metres. */
export function contactHeight(verb: string, onBox = 0): number {
  const spec = Object.hasOwn(TRAINING_SCENE_VERBS, verb)
    ? TRAINING_SCENE_VERBS[verb]
    : undefined;
  return (spec?.contactZ ?? 1) + onBox;
}

export function planFlight(p0: Point3, p1: Point3, spec: FlightSpec): Flight {
  const distance = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (spec.flight === "speed") {
    const speed = spec.speed && spec.speed > 0 ? spec.speed : 10;
    const duration = Math.max(distance / speed, 0.25);
    const vz0 = (p1.z - p0.z + 0.5 * GRAVITY * duration * duration) / duration;
    const tPeak = vz0 / GRAVITY;
    const apex =
      tPeak > 0 && tPeak < duration
        ? p0.z + (vz0 * vz0) / (2 * GRAVITY)
        : Math.max(p0.z, p1.z);
    return { p0, p1, duration, vz0, apex, mode: "speed", distance };
  }
  const apex = Math.max(spec.apex ?? 4, p0.z + 0.3, p1.z + 0.3);
  const vz0 = Math.sqrt(2 * GRAVITY * (apex - p0.z));
  const duration = vz0 / GRAVITY + Math.sqrt((2 * (apex - p1.z)) / GRAVITY);
  return { p0, p1, duration, vz0, apex, mode: "apex", distance };
}

/** Position `t` seconds into the flight (clamped to the flight). */
export function sampleFlight(flight: Flight, t: number): Point3 {
  const u =
    flight.duration > 0 ? Math.min(Math.max(t / flight.duration, 0), 1) : 1;
  const tt = u * flight.duration;
  return {
    x: flight.p0.x + (flight.p1.x - flight.p0.x) * u,
    y: flight.p0.y + (flight.p1.y - flight.p0.y) * u,
    z: Math.max(
      BALL_RADIUS,
      flight.p0.z + flight.vz0 * tt - 0.5 * GRAVITY * tt * tt,
    ),
  };
}

/** Where the flight crosses the plane of the net (y = 0), if it does. */
export function netCrossing(flight: Flight): NetCrossing | null {
  const y0 = flight.p0.y;
  const y1 = flight.p1.y;
  if (y0 === 0 || y1 === 0 || Math.sign(y0) === Math.sign(y1)) return null;
  const u = y0 / (y0 - y1);
  const point = sampleFlight(flight, u * flight.duration);
  return { u, x: point.x, z: point.z };
}

/** Height the ball must cross the net at, metres. */
export function clearanceNeeded(netHeight: number): number {
  return netHeight + BALL_RADIUS + NET_CLEARANCE;
}

/**
 * The verb's flight; if it would cross the net too low it is raised the way
 * the validator raises it (lofted contacts peak higher, driven contacts slow
 * down). An authored override is kept exactly.
 */
export function planVerbFlight(
  p0: Point3,
  p1: Point3,
  verb: string,
  netHeight: number,
  arc?: { readonly apex?: number; readonly speed?: number },
): VerbFlight {
  const verbSpec = Object.hasOwn(TRAINING_SCENE_VERBS, verb)
    ? TRAINING_SCENE_VERBS[verb]
    : undefined;
  const override = Boolean(
    arc && (arc.apex !== undefined || arc.speed !== undefined),
  );
  let spec: FlightSpec =
    override && arc
      ? {
          flight: arc.apex !== undefined ? "apex" : "speed",
          ...(arc.apex !== undefined ? { apex: arc.apex } : {}),
          ...(arc.speed !== undefined ? { speed: arc.speed } : {}),
        }
      : {
          flight: verbSpec?.flight ?? "apex",
          ...(verbSpec?.apex !== undefined ? { apex: verbSpec.apex } : {}),
          ...(verbSpec?.speed !== undefined ? { speed: verbSpec.speed } : {}),
        };
  let flight = planFlight(p0, p1, spec);
  const need = clearanceNeeded(netHeight);
  let guard = 0;
  if (!override) {
    let crossing = netCrossing(flight);
    while (crossing && crossing.z < need && guard < 30) {
      guard++;
      if (spec.flight === "apex") {
        spec = { ...spec, apex: (spec.apex ?? 4) + 0.25 };
      } else if ((spec.speed ?? 0) > 6) {
        spec = { ...spec, speed: (spec.speed ?? 10) * 0.9 };
      } else {
        spec = { flight: "apex", apex: need + 1.2 };
      }
      flight = planFlight(p0, p1, spec);
      crossing = netCrossing(flight);
    }
  }
  return {
    ...flight,
    adjusted: guard > 0,
    override,
    crossing: netCrossing(flight),
  };
}

/**
 * How a contact is drawn. The kind of contact decides the line: driven balls
 * (serves, attacks, hits) are heavy and nearly straight; lofted balls
 * (passes, digs, free balls) are curved; placed balls (sets, tosses, roll
 * shots) are curved and dotted, so the three read apart in black and white.
 */
export type ContactKind = "driven" | "lofted" | "placed";

export function contactKind(verb: string): ContactKind {
  switch (verb) {
    case "serve":
    case "jumpserve":
    case "attack":
    case "hit":
    case "cut":
      return "driven";
    case "set":
    case "toss":
    case "roll":
      return "placed";
    default:
      return "lofted";
  }
}

/** Sideways bow of a top-down ball path, as a fraction of its length. */
export function pathBow(verb: string, apex: number): number {
  const kind = contactKind(verb);
  // Higher balls bow more, so height reads in a plan view; capped so long
  // paths stay calm.
  const lift = Math.min(Math.max((apex - 2) / 3, 0), 1);
  if (kind === "driven") return 0.04 + 0.06 * lift;
  if (kind === "placed") return 0.12 + 0.12 * lift;
  return 0.1 + 0.1 * lift;
}

/** Ease in and out of a contact: smoothstep, never overshoots. */
export function ease(u: number): number {
  const v = Math.min(Math.max(u, 0), 1);
  return v * v * (3 - 2 * v);
}
