/**
 * Court geometry for the drawing and the player: where things are in words,
 * the visible frame, the projection from metres to the page, the court's
 * lines and simple label placement. Pure functions, no DOM.
 *
 * Metres from the centre of the net on the floor (`@duna/core/training-scene`):
 * x runs along the net (side A's right hand is +x), y across it (side A is
 * y < 0), z up.
 */
import type {
  ResolvedTrainingScene,
  ScenePoint,
} from "@duna/core/training-scene";

export type SceneCourt = ResolvedTrainingScene["court"];
export type Orientation = "landscape" | "portrait";

/** Attack line distance for courts that have one (indoor), metres. */
export function attackLineOf(court: SceneCourt): number | null {
  return court.type.startsWith("indoor") ? 3 : null;
}

/** Side-local metres: to the player's right facing the net, and back from it. */
export function toLocal(side: "A" | "B", point: ScenePoint) {
  return side === "B"
    ? { right: -point.x, back: point.y }
    : { right: point.x, back: -point.y };
}

export interface CourtRegion {
  readonly side: "A" | "B";
  readonly depth: "net" | "front" | "mid" | "deep" | "behind" | "outside";
  readonly lateral: "left" | "middle" | "right";
  /** Indoor rotation zone (1–6) when the point is on the court. */
  readonly zone?: number;
}

/** Where a point is, in a coach's words (side, depth, left / right). */
export function regionOf(court: SceneCourt, point: ScenePoint): CourtRegion {
  const side: "A" | "B" = point.y > 0 ? "B" : "A";
  const local = toLocal(side, point);
  const halfWidth = court.width / 2;
  const halfLength = court.length / 2;
  const third = court.width / 6;
  const lateral =
    local.right < -third ? "left" : local.right > third ? "right" : "middle";
  if (Math.abs(point.x) > halfWidth + 0.05) {
    return { side, depth: "outside", lateral };
  }
  if (local.back > halfLength + 0.05) return { side, depth: "behind", lateral };
  const attack = attackLineOf(court);
  let depth: CourtRegion["depth"];
  if (local.back <= 1.6) depth = "net";
  else if (local.back <= (attack ?? 3.2)) depth = "front";
  else if (local.back >= halfLength - 2.6) depth = "deep";
  else depth = "mid";
  if (attack !== null && !court.noCourt) {
    const front = local.back <= attack;
    const zone = front
      ? lateral === "left"
        ? 4
        : lateral === "middle"
          ? 3
          : 2
      : lateral === "left"
        ? 5
        : lateral === "middle"
          ? 6
          : 1;
    return { side, depth, lateral, zone };
  }
  return { side, depth, lateral };
}

const lateralWords = {
  left: "on the left",
  middle: "in the middle",
  right: "on the right",
} as const;

/** "the deep left of side A", "zone 5 on side A", "behind the end line of side B, on the right". */
export function placePhrase(court: SceneCourt, point: ScenePoint): string {
  const region = regionOf(court, point);
  const side = `side ${region.side}`;
  if (court.noCourt) {
    return `the ${region.side === "A" ? "near" : "far"} half, ${lateralWords[region.lateral]}`;
  }
  switch (region.depth) {
    case "outside":
      return `outside the ${region.lateral === "left" ? "left" : "right"} sideline of ${side}`;
    case "behind":
      return `behind the end line of ${side}, ${lateralWords[region.lateral]}`;
    case "net":
      return region.zone
        ? `zone ${region.zone} at the net on ${side}`
        : `the net on ${side}, ${lateralWords[region.lateral]}`;
    default: {
      if (region.zone) return `zone ${region.zone} on ${side}`;
      const depth = region.depth === "mid" ? "middle" : region.depth;
      const lateral = region.lateral === "middle" ? "centre" : region.lateral;
      return `the ${depth} ${lateral} of ${side}`;
    }
  }
}

export interface Bounds {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

/**
 * The part of the floor worth drawing: the court plus a metre, grown to hold
 * every point given (with room for a dot), never beyond the free zone.
 */
export function frameBounds(
  court: SceneCourt,
  points: readonly ScenePoint[],
): Bounds {
  const freeX = court.width / 2 + court.freeZone;
  const freeY = court.length / 2 + court.freeZone;
  let x0 = -court.width / 2 - 1;
  let x1 = court.width / 2 + 1;
  let y0 = -court.length / 2 - 1;
  let y1 = court.length / 2 + 1;
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    x0 = Math.min(x0, point.x - 0.9);
    x1 = Math.max(x1, point.x + 0.9);
    y0 = Math.min(y0, point.y - 0.9);
    y1 = Math.max(y1, point.y + 0.9);
  }
  x0 = Math.max(x0, -freeX);
  x1 = Math.min(x1, freeX);
  y0 = Math.max(y0, -freeY);
  y1 = Math.min(y1, freeY);
  // A half court shows side A and the net with a strip of the far side.
  if (court.half) y1 = Math.min(Math.max(y1, 1.6), 2.4);
  return { x0, x1, y0, y1 };
}

export interface Projection {
  readonly orientation: Orientation;
  /** Page units per metre. */
  readonly scale: number;
  readonly width: number;
  readonly height: number;
  readonly bounds: Bounds;
  /** Metres on the floor to page units. */
  readonly at: (point: ScenePoint) => { x: number; y: number };
}

/** Page units per metre; the drawing scales to its box. */
export const SCENE_SCALE = 30;

/**
 * Landscape: the net runs top to bottom, side A on the left. Portrait: the
 * net runs across, side A at the bottom. Either way side A's right hand is
 * on the viewer's right when they stand behind side A.
 */
export function project(
  bounds: Bounds,
  orientation: Orientation,
  scale = SCENE_SCALE,
): Projection {
  const spanX = bounds.x1 - bounds.x0;
  const spanY = bounds.y1 - bounds.y0;
  if (orientation === "landscape") {
    return {
      orientation,
      scale,
      bounds,
      width: spanY * scale,
      height: spanX * scale,
      at: (point) => ({
        x: (point.y - bounds.y0) * scale,
        y: (point.x - bounds.x0) * scale,
      }),
    };
  }
  return {
    orientation,
    scale,
    bounds,
    width: spanX * scale,
    height: spanY * scale,
    at: (point) => ({
      x: (point.x - bounds.x0) * scale,
      y: (bounds.y1 - point.y) * scale,
    }),
  };
}

export interface CourtLine {
  readonly a: ScenePoint;
  readonly b: ScenePoint;
  readonly kind: "boundary" | "attack" | "centre" | "extension" | "service";
}

/** Every painted line of the court, in metres. */
export function courtLines(court: SceneCourt): CourtLine[] {
  if (court.noCourt) return [];
  const hw = court.width / 2;
  const hl = court.length / 2;
  const far = court.half ? 0 : hl;
  const lines: CourtLine[] = [
    { a: { x: -hw, y: -hl }, b: { x: hw, y: -hl }, kind: "boundary" },
    { a: { x: -hw, y: -hl }, b: { x: -hw, y: far }, kind: "boundary" },
    { a: { x: hw, y: -hl }, b: { x: hw, y: far }, kind: "boundary" },
  ];
  if (!court.half) {
    lines.push({ a: { x: -hw, y: hl }, b: { x: hw, y: hl }, kind: "boundary" });
  }
  const attack = attackLineOf(court);
  if (attack !== null) {
    lines.push({ a: { x: -hw, y: 0 }, b: { x: hw, y: 0 }, kind: "centre" });
    for (const sign of court.half ? [-1] : [-1, 1]) {
      const y = sign * attack;
      lines.push({ a: { x: -hw, y }, b: { x: hw, y }, kind: "attack" });
      // The broken extension beyond each sideline.
      lines.push({
        a: { x: -hw - 1.75, y },
        b: { x: -hw - 0.2, y },
        kind: "extension",
      });
      lines.push({
        a: { x: hw + 0.2, y },
        b: { x: hw + 1.75, y },
        kind: "extension",
      });
    }
  }
  // Service zone: short marks behind each end line, on the sideline's line.
  for (const sign of court.half ? [-1] : [-1, 1]) {
    for (const x of [-hw, hw]) {
      lines.push({
        a: { x, y: sign * (hl + 0.2) },
        b: { x, y: sign * (hl + 0.65) },
        kind: "service",
      });
    }
  }
  return lines;
}

export interface Vec {
  readonly x: number;
  readonly y: number;
}

/** Control point of a quadratic path from A to C, bowed to the left of travel. */
export function bowControl(a: Vec, c: Vec, bowFraction: number): Vec {
  const dx = c.x - a.x;
  const dy = c.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const bow = length * bowFraction;
  return {
    x: (a.x + c.x) / 2 - (dy / length) * bow,
    y: (a.y + c.y) / 2 + (dx / length) * bow,
  };
}

export function quadPoint(a: Vec, m: Vec, c: Vec, t: number): Vec {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * m.x + t * t * c.x,
    y: u * u * a.y + 2 * u * t * m.y + t * t * c.y,
  };
}

/** Shorten a segment by `start` and `end` page units (to stop short of dots). */
export function trim(a: Vec, c: Vec, start: number, end: number) {
  const dx = c.x - a.x;
  const dy = c.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length <= start + end + 1) return null;
  return {
    a: { x: a.x + (dx / length) * start, y: a.y + (dy / length) * start },
    c: { x: c.x - (dx / length) * end, y: c.y - (dy / length) * end },
  };
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const overlaps = (a: Box, b: Box) =>
  Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;

const hitsPoint = (box: Box, point: Vec, pad: number) =>
  Math.abs(box.x - point.x) * 2 < box.w + pad * 2 &&
  Math.abs(box.y - point.y) * 2 < box.h + pad * 2;

/**
 * Simple collision nudging: each label tries its preferred offsets in order
 * and takes the first that touches no placed box and no obstacle point
 * (samples of the ball paths); if none is free it takes the least crowded.
 * Boxes are centred.
 */
export function placeLabels(
  labels: readonly {
    readonly anchor: Vec;
    readonly w: number;
    readonly h: number;
    readonly offsets: readonly Vec[];
  }[],
  obstacles: {
    readonly boxes: readonly Box[];
    readonly points: readonly Vec[];
  },
  area?: { readonly width: number; readonly height: number },
): Vec[] {
  const placed: Box[] = [...obstacles.boxes];
  return labels.map((label) => {
    let best: { at: Vec; cost: number } | undefined;
    for (const [index, offset] of label.offsets.entries()) {
      const box: Box = {
        x: label.anchor.x + offset.x,
        y: label.anchor.y + offset.y,
        w: label.w,
        h: label.h,
      };
      let cost = index * 0.5;
      for (const other of placed) if (overlaps(box, other)) cost += 10;
      for (const point of obstacles.points) {
        if (hitsPoint(box, point, 2)) cost += 3;
      }
      if (
        area &&
        (box.x - box.w / 2 < 0 ||
          box.x + box.w / 2 > area.width ||
          box.y - box.h / 2 < 0 ||
          box.y + box.h / 2 > area.height)
      ) {
        cost += 20;
      }
      if (!best || cost < best.cost)
        best = { at: { x: box.x, y: box.y }, cost };
      if (cost === index * 0.5) break;
    }
    const at = best!.at;
    placed.push({ x: at.x, y: at.y, w: label.w, h: label.h });
    return at;
  });
}

/** A rough text width for Geist at a size (page units), for placement only. */
export function textWidth(text: string, size: number): number {
  let width = 0;
  for (const char of text) {
    width += /[A-Z0-9]/.test(char)
      ? 0.64
      : /[ il.,'’]/.test(char)
        ? 0.3
        : /[mw]/.test(char)
          ? 0.82
          : 0.54;
  }
  return width * size * 1.08;
}
