/**
 * Deterministic ball flight, ported from the Drill Studio prototype
 * (`src/physics.js`). No drag, no spin: a parabola through two contact
 * points, shaped by the verb. Good enough to check the net; not a simulator.
 */
import { BALL_RADIUS, G, LIMITS, VERBS } from "./model";

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface FlightSpec {
  readonly flight: "apex" | "speed";
  readonly apex?: number;
  readonly speed?: number;
}

export interface Flight {
  readonly p0: Point3;
  readonly p1: Point3;
  readonly T: number;
  readonly vz0: number;
  readonly apex: number;
  readonly mode: "apex" | "speed";
  readonly spec: FlightSpec;
  readonly d: number;
}

export function planFlight(p0: Point3, p1: Point3, spec: FlightSpec): Flight {
  const d = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (spec.flight === "speed") {
    const speed = spec.speed && spec.speed > 0 ? spec.speed : 10;
    const T = Math.max(d / speed, 0.25);
    const vz0 = (p1.z - p0.z + 0.5 * G * T * T) / T;
    const tPeak = vz0 / G;
    const apex =
      tPeak > 0 && tPeak < T
        ? p0.z + (vz0 * vz0) / (2 * G)
        : Math.max(p0.z, p1.z);
    return { p0, p1, T, vz0, apex, mode: "speed", spec, d };
  }
  const h = Math.max(spec.apex ?? 4, p0.z + 0.3, p1.z + 0.3);
  const vz0 = Math.sqrt(2 * G * (h - p0.z));
  const T = vz0 / G + Math.sqrt((2 * (h - p1.z)) / G);
  return { p0, p1, T, vz0, apex: h, mode: "apex", spec, d };
}

export function sampleFlight(f: Flight, t: number): Point3 {
  const u = Math.min(Math.max(t / f.T, 0), 1);
  const tt = u * f.T;
  return {
    x: f.p0.x + (f.p1.x - f.p0.x) * u,
    y: f.p0.y + (f.p1.y - f.p0.y) * u,
    z: Math.max(BALL_RADIUS, f.p0.z + f.vz0 * tt - 0.5 * G * tt * tt),
  };
}

/** Where (if anywhere) the flight crosses the plane of the net (y = 0). */
export function netCrossing(f: Flight) {
  const y0 = f.p0.y;
  const y1 = f.p1.y;
  if (y0 === 0 || y1 === 0 || Math.sign(y0) === Math.sign(y1)) return null;
  const u = y0 / (y0 - y1);
  const p = sampleFlight(f, u * f.T);
  return { u, t: u * f.T, x: p.x, z: p.z };
}

export function clearanceNeeded(netHeight: number): number {
  return netHeight + BALL_RADIUS + LIMITS.netClearance;
}

export interface VerbFlight extends Flight {
  readonly adjusted: boolean;
  readonly override: boolean;
  readonly crossing: ReturnType<typeof netCrossing>;
}

/**
 * Plan a flight for a verb; if it crosses the net too low, raise it: lofted
 * contacts get a higher apex, driven contacts get slower (more arc). An
 * explicit override (`arc`) is authoritative and is never adjusted.
 */
export function planVerbFlight(
  p0: Point3,
  p1: Point3,
  verb: string,
  netHeight: number,
  arc?: { readonly apex?: number; readonly speed?: number },
): VerbFlight {
  const v = VERBS[verb];
  let spec: FlightSpec = arc
    ? {
        flight: arc.apex != null ? "apex" : "speed",
        apex: arc.apex,
        speed: arc.speed,
      }
    : { flight: v?.flight ?? "apex", apex: v?.apex, speed: v?.speed };
  let f = planFlight(p0, p1, spec);
  const need = clearanceNeeded(netHeight);
  let guard = 0;
  if (!arc) {
    let c = netCrossing(f);
    while (c && c.z < need && guard < 30) {
      guard++;
      if (spec.flight === "apex") {
        spec = { ...spec, apex: (spec.apex ?? 4) + 0.25 };
      } else if ((spec.speed ?? 0) > 6) {
        spec = { ...spec, speed: (spec.speed ?? 10) * 0.9 };
      } else {
        spec = { flight: "apex", apex: need + 1.2 };
      }
      f = planFlight(p0, p1, spec);
      c = netCrossing(f);
    }
  }
  return {
    ...f,
    adjusted: guard > 0,
    override: Boolean(arc),
    crossing: netCrossing(f),
  };
}
