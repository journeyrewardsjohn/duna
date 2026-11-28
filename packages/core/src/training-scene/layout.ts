/**
 * The deterministic layout engine, ported from the Drill Studio prototype
 * (`src/layout.js`). Turns named spots ("server-right", "queue-right#2") and
 * named areas ("deep-corner-left", "zone5") into metres for a court and side,
 * so a scene names places and never carries guessed coordinates.
 */
import { COURTS, type CourtSpec, isCourtType } from "./model";

/**
 * Side-local coordinates: lx = metres to the player's RIGHT when facing the
 * net, ly = metres BACK from the net. Side A faces +y, side B faces −y.
 */
export function toWorld(side: string, lx: number, ly: number) {
  return side === "B" ? { x: -lx, y: ly } : { x: lx, y: -ly };
}

export function toLocal(side: string, x: number, y: number) {
  return side === "B" ? { lx: -x, ly: y } : { lx: x, ly: -y };
}

interface SpotSpec {
  readonly lx: number;
  readonly ly: number;
  /** Offset added per queue index (#k). */
  readonly step?: { readonly lx: number; readonly ly: number };
  readonly help: string;
}

export const SPOTS: Readonly<
  Record<"beach" | "indoor", Readonly<Record<string, SpotSpec>>>
> = {
  beach: {
    "server-left": {
      lx: -2.5,
      ly: 9.2,
      help: "Server, behind the baseline, left third",
    },
    "server-middle": {
      lx: 0,
      ly: 9.2,
      help: "Server, behind the baseline, middle",
    },
    "server-right": {
      lx: 2.5,
      ly: 9.2,
      help: "Server, behind the baseline, right third",
    },
    "passer-left": {
      lx: -2.0,
      ly: 5.8,
      help: "Left-side passer (doubles receive)",
    },
    "passer-right": {
      lx: 2.0,
      ly: 5.8,
      help: "Right-side passer (doubles receive)",
    },
    "passer-middle": {
      lx: 0,
      ly: 6.0,
      help: "Single passer, middle of the court",
    },
    "set-target": {
      lx: 0.5,
      ly: 1.5,
      help: "Pass target: middle, about 1.5 m off the net",
    },
    blocker: {
      lx: 0,
      ly: 0.6,
      help: "Blocker at the net (add right/left offset to line up)",
    },
    "defender-deep": { lx: 0, ly: 6.0, help: "Defender, deep middle" },
    "defender-line-left": {
      lx: -3.0,
      ly: 5.5,
      help: "Defender covering the left line",
    },
    "defender-line-right": {
      lx: 3.0,
      ly: 5.5,
      help: "Defender covering the right line",
    },
    "approach-left": {
      lx: -2.8,
      ly: 4.2,
      help: "Start of a left-side approach",
    },
    "approach-right": {
      lx: 2.8,
      ly: 4.2,
      help: "Start of a right-side approach",
    },
    "approach-middle": { lx: 0.3, ly: 3.5, help: "Start of a middle approach" },
    "attack-left": {
      lx: -2.6,
      ly: 1.3,
      help: "Contact point for a left-side attack",
    },
    "attack-right": {
      lx: 2.6,
      ly: 1.3,
      help: "Contact point for a right-side attack",
    },
    "attack-middle": {
      lx: 0.3,
      ly: 1.2,
      help: "Contact point for a middle attack",
    },
    "pepper-left": { lx: -2.5, ly: 4.5, help: "Pepper partner, left" },
    "pepper-right": { lx: 2.5, ly: 4.5, help: "Pepper partner, right" },
    "coach-box-net": {
      lx: 1.2,
      ly: 1.0,
      help: "Coach standing on a box at the net",
    },
    "feeder-net": {
      lx: 1.5,
      ly: 1.0,
      help: "Coach or feeder at the net, tossing",
    },
    "coach-sideline-right": {
      lx: 5.2,
      ly: 3.0,
      help: "Coach outside the right sideline",
    },
    "coach-sideline-left": {
      lx: -5.2,
      ly: 3.0,
      help: "Coach outside the left sideline",
    },
    "cart-right": {
      lx: 5.2,
      ly: 8.8,
      help: "Ball cart beyond the right sideline, near the baseline",
    },
    "cart-left": {
      lx: -5.2,
      ly: 8.8,
      help: "Ball cart beyond the left sideline, near the baseline",
    },
    "queue-right": {
      lx: 5.2,
      ly: 5.8,
      step: { lx: 0, ly: 0.9 },
      help: "Queue outside the right sideline; #k = place in line",
    },
    "queue-left": {
      lx: -5.2,
      ly: 5.8,
      step: { lx: 0, ly: 0.9 },
      help: "Queue outside the left sideline; #k = place in line",
    },
    "queue-baseline": {
      lx: 1.5,
      ly: 10.2,
      step: { lx: 0.9, ly: 0 },
      help: "Queue behind the baseline; #k = place in line",
    },
    "line-left": {
      lx: -2.0,
      ly: 7.0,
      step: { lx: 0, ly: 0.9 },
      help: "Front of a line, left lane; #k = place in line",
    },
    "line-middle": {
      lx: 0,
      ly: 7.0,
      step: { lx: 0, ly: 0.9 },
      help: "Front of a line, middle lane",
    },
    "line-right": {
      lx: 2.0,
      ly: 7.0,
      step: { lx: 0, ly: 0.9 },
      help: "Front of a line, right lane",
    },
  },
  indoor: {
    "server-left": {
      lx: -3.0,
      ly: 10.2,
      help: "Server, behind the end line, left third",
    },
    "server-middle": {
      lx: 0,
      ly: 10.2,
      help: "Server, behind the end line, middle",
    },
    "server-right": {
      lx: 3.0,
      ly: 10.2,
      help: "Server, behind the end line, right third (zone 1)",
    },
    "passer-left": {
      lx: -3.0,
      ly: 6.6,
      help: "Left passing lane (three-person receive)",
    },
    "passer-middle": { lx: 0, ly: 7.0, help: "Middle passing lane" },
    "passer-right": { lx: 3.0, ly: 6.6, help: "Right passing lane" },
    "set-target": {
      lx: 1.0,
      ly: 0.9,
      help: "Setter target, between zones 2 and 3, about 1 m off the net",
    },
    "setter-base": {
      lx: 2.6,
      ly: 1.2,
      help: "Setter starting spot at the net, right side",
    },
    "attack-left": {
      lx: -3.8,
      ly: 1.0,
      help: "Outside (zone 4) contact point",
    },
    "attack-right": {
      lx: 3.8,
      ly: 1.0,
      help: "Right-side (zone 2) contact point",
    },
    "attack-middle": { lx: 0.6, ly: 0.9, help: "Middle quick contact point" },
    "approach-left": {
      lx: -4.6,
      ly: 4.0,
      help: "Start of the outside approach, just outside the sideline",
    },
    "approach-right": {
      lx: 4.4,
      ly: 3.8,
      help: "Start of the right-side approach",
    },
    "approach-middle": {
      lx: 0.2,
      ly: 3.2,
      help: "Start of the middle approach",
    },
    "blocker-left": { lx: -3.2, ly: 0.5, help: "Left blocker at the net" },
    "blocker-middle": { lx: 0, ly: 0.5, help: "Middle blocker at the net" },
    "blocker-right": { lx: 3.2, ly: 0.5, help: "Right blocker at the net" },
    "defender-zone1": {
      lx: 3.0,
      ly: 6.5,
      help: "Right-back defender (zone 1)",
    },
    "defender-zone5": {
      lx: -3.0,
      ly: 6.5,
      help: "Left-back defender (zone 5)",
    },
    "defender-zone6": { lx: 0, ly: 7.0, help: "Middle-back defender (zone 6)" },
    "coach-box-net": {
      lx: 1.5,
      ly: 1.0,
      help: "Coach standing on a box at the net",
    },
    "feeder-net": {
      lx: 1.5,
      ly: 1.0,
      help: "Coach or feeder at the net, tossing",
    },
    "coach-sideline-right": {
      lx: 5.8,
      ly: 3.0,
      help: "Coach outside the right sideline",
    },
    "coach-sideline-left": {
      lx: -5.8,
      ly: 3.0,
      help: "Coach outside the left sideline",
    },
    "cart-right": {
      lx: 5.6,
      ly: 9.8,
      help: "Ball cart beyond the right sideline",
    },
    "cart-left": {
      lx: -5.6,
      ly: 9.8,
      help: "Ball cart beyond the left sideline",
    },
    "queue-right": {
      lx: 5.6,
      ly: 6.0,
      step: { lx: 0, ly: 0.9 },
      help: "Queue outside the right sideline",
    },
    "queue-left": {
      lx: -5.6,
      ly: 6.0,
      step: { lx: 0, ly: 0.9 },
      help: "Queue outside the left sideline",
    },
    "queue-baseline": {
      lx: 1.5,
      ly: 10.6,
      step: { lx: 0.9, ly: 0 },
      help: "Queue behind the end line",
    },
    "line-left": {
      lx: -2.2,
      ly: 7.4,
      step: { lx: 0, ly: 0.9 },
      help: "Front of a line, left lane",
    },
    "line-middle": {
      lx: 0,
      ly: 7.4,
      step: { lx: 0, ly: 0.9 },
      help: "Front of a line, middle lane",
    },
    "line-right": {
      lx: 2.2,
      ly: 7.4,
      step: { lx: 0, ly: 0.9 },
      help: "Front of a line, right lane",
    },
  },
};

interface LocalRect {
  readonly lx0: number;
  readonly lx1: number;
  readonly ly0: number;
  readonly ly1: number;
}

/** Areas are rectangles in side-local coordinates for one half court. */
export function areaLocal(name: string, court: CourtSpec): LocalRect | null {
  const w = court.width;
  const d = court.length / 2;
  const hw = w / 2;
  const rect = (
    lxr: readonly [number, number],
    lyr: readonly [number, number],
  ): LocalRect => ({ lx0: lxr[0], lx1: lxr[1], ly0: lyr[0], ly1: lyr[1] });
  const lanes = {
    left: [-hw, -hw / 3],
    middle: [-hw / 3, hw / 3],
    right: [hw / 3, hw],
  } as const;
  const depths = {
    short: [0, d / 3],
    mid: [d / 3, (2 * d) / 3],
    deep: [(2 * d) / 3, d],
  } as const;
  const match = /^(short|mid|deep)-(left|middle|right)$/.exec(name);
  if (match) {
    return rect(
      lanes[match[2] as keyof typeof lanes],
      depths[match[1] as keyof typeof depths],
    );
  }
  switch (name) {
    case "zone1":
      return rect([hw / 3, hw], [3, d]);
    case "zone6":
      return rect([-hw / 3, hw / 3], [3, d]);
    case "zone5":
      return rect([-hw, -hw / 3], [3, d]);
    case "zone2":
      return rect([hw / 3, hw], [0, 3]);
    case "zone3":
      return rect([-hw / 3, hw / 3], [0, 3]);
    case "zone4":
      return rect([-hw, -hw / 3], [0, 3]);
    case "deep-corner-left":
      return rect([-hw, -hw + 1.6], [d - 1.6, d]);
    case "deep-corner-right":
      return rect([hw - 1.6, hw], [d - 1.6, d]);
    case "deep-band":
      return rect([-hw, hw], [d - 2, d]);
    case "seam":
      return rect([-0.8, 0.8], [d / 2 - 1, d / 2 + 1]);
    case "short-band":
      return rect([-hw, hw], [0, 2]);
    case "whole-side":
      return rect([-hw, hw], [0, d]);
    default:
      return null;
  }
}

export const AREA_NAMES = [
  "short-left",
  "short-middle",
  "short-right",
  "mid-left",
  "mid-middle",
  "mid-right",
  "deep-left",
  "deep-middle",
  "deep-right",
  "deep-corner-left",
  "deep-corner-right",
  "deep-band",
  "short-band",
  "seam",
  "whole-side",
  "zone1",
  "zone2",
  "zone3",
  "zone4",
  "zone5",
  "zone6",
] as const;

export interface WorldRect {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly cx: number;
  readonly cy: number;
}

export function areaWorld(
  name: string,
  side: string,
  court: CourtSpec,
): WorldRect | null {
  const r = areaLocal(name, court);
  if (!r) return null;
  const a = toWorld(side, r.lx0, r.ly0);
  const b = toWorld(side, r.lx1, r.ly1);
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  return { x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

function vocabFor(court: CourtSpec) {
  return court.discipline === "indoor" ? SPOTS.indoor : SPOTS.beach;
}

/** A spot name (with optional "#k" queue index) in side-local metres. */
export function spotLocal(name: string, court: CourtSpec) {
  const [base = "", indexRaw] = String(name).split("#");
  const k = indexRaw === undefined ? 0 : Number(indexRaw);
  if (!Number.isInteger(k) || k < 0 || k > 40) return null;
  const vocab = vocabFor(court);
  let spot = Object.hasOwn(vocab, base) ? vocab[base] : undefined;
  let scaled = false;
  if (!spot && Object.hasOwn(SPOTS.beach, base)) {
    // Fallback: scale a beach spot to this court's proportions.
    const beach = SPOTS.beach[base]!;
    spot = {
      ...beach,
      lx: beach.lx * (court.width / 8),
      ly: beach.ly * (court.length / 16),
    };
    scaled = true;
  }
  if (!spot) return null;
  const step = spot.step ?? { lx: 0, ly: 0 };
  return {
    lx: spot.lx + step.lx * k,
    ly: spot.ly + step.ly * k,
    scaled,
    help: spot.help,
  };
}

export interface ResolvedPlace {
  readonly x: number;
  readonly y: number;
  readonly kind: "spot" | "area" | "pinned" | "missing";
  readonly error?: string;
  readonly rect?: WorldRect | null;
  readonly scaled?: boolean;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function offset(value: unknown): number {
  return finite(value) ? value : 0;
}

/**
 * Resolve a place reference to world metres.
 * ref: "spot-name" | "spot#k" | { spot, side?, right?, back? } |
 *      { area, side? } | { x, y } (pinned metres)
 * defaultSide: the side the reference is relative to when it does not say.
 */
export function resolvePlace(
  rawRef: unknown,
  defaultSide: unknown,
  courtOrId: CourtSpec | string,
): ResolvedPlace {
  const court =
    typeof courtOrId === "string"
      ? isCourtType(courtOrId)
        ? COURTS[courtOrId]
        : COURTS.beach
      : courtOrId;
  if (rawRef == null) {
    return { x: 0, y: 0, kind: "missing", error: "No place given" };
  }
  const ref: Record<string, unknown> =
    typeof rawRef === "string"
      ? { spot: rawRef }
      : typeof rawRef === "object" && !Array.isArray(rawRef)
        ? (rawRef as Record<string, unknown>)
        : {};
  if (finite(ref.x) && finite(ref.y)) {
    return { x: ref.x, y: ref.y, kind: "pinned" };
  }
  const sideRaw =
    typeof ref.side === "string"
      ? ref.side
      : typeof defaultSide === "string"
        ? defaultSide
        : "A";
  const orient = sideRaw === "B" ? "B" : "A";
  if (typeof ref.area === "string") {
    const r = areaLocal(ref.area, court);
    if (!r) {
      return {
        x: 0,
        y: 0,
        kind: "area",
        error: `Unknown area "${ref.area.slice(0, 60)}"`,
      };
    }
    const c = toWorld(
      orient,
      (r.lx0 + r.lx1) / 2 + offset(ref.right),
      (r.ly0 + r.ly1) / 2 + offset(ref.back),
    );
    return {
      x: c.x,
      y: c.y,
      kind: "area",
      rect: areaWorld(ref.area, orient, court),
    };
  }
  if (typeof ref.spot === "string") {
    const s = spotLocal(ref.spot, court);
    if (!s) {
      return {
        x: 0,
        y: 0,
        kind: "spot",
        error: `Unknown spot "${ref.spot.slice(0, 60)}"`,
      };
    }
    const w = toWorld(
      orient,
      s.lx + offset(ref.right),
      s.ly + offset(ref.back),
    );
    return { x: w.x, y: w.y, kind: "spot", scaled: s.scaled };
  }
  return {
    x: 0,
    y: 0,
    kind: "missing",
    error: "Place has neither spot, area nor metres",
  };
}

export interface SeparableEntry {
  x: number;
  y: number;
  readonly pinned: boolean;
  nudged?: boolean;
}

/** Nudge unpinned start spots apart so no two players overlap. */
export function separate<T extends SeparableEntry>(
  entries: T[],
  minGap = 0.9,
): T[] {
  for (let iteration = 0; iteration < 4; iteration++) {
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i]!;
        const b = entries[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= minGap) continue;
        const ux = d > 1e-6 ? dx / d : 1;
        const uy = d > 1e-6 ? dy / d : 0;
        const push = (minGap - d) / (a.pinned || b.pinned ? 1 : 2);
        if (!b.pinned) {
          b.x += ux * push;
          b.y += uy * push;
          b.nudged = true;
        }
        if (!a.pinned && !b.pinned) {
          a.x -= ux * push;
          a.y -= uy * push;
          a.nudged = true;
        } else if (!a.pinned && b.pinned) {
          a.x -= ux * push * 2;
          a.y -= uy * push * 2;
          a.nudged = true;
        }
      }
    }
  }
  return entries;
}

/** Is a world point inside the court plus free zone? */
export function inPlayArea(
  p: { readonly x: number; readonly y: number },
  court: CourtSpec,
  margin = 0,
): boolean {
  const hx = court.width / 2 + court.freeZone + margin;
  const hy = court.length / 2 + court.freeZone + margin;
  return Math.abs(p.x) <= hx + 1e-6 && Math.abs(p.y) <= hy + 1e-6;
}

export function inCourt(
  p: { readonly x: number; readonly y: number },
  court: CourtSpec,
  margin = 0,
): boolean {
  return (
    Math.abs(p.x) <= court.width / 2 + margin &&
    Math.abs(p.y) <= court.length / 2 + margin
  );
}
