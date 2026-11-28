/**
 * Everything the court drawing needs, as plain shapes in page units: the
 * court, the people and their labels, the ball paths with their numbers,
 * the movement arrows, equipment and the rotation. Built from the timeline,
 * so the drawing and the animation always agree. Pure and testable; the SVG
 * component only maps these shapes to elements.
 */
import type { ScenePoint } from "@duna/core/training-scene";
import { type ContactKind, pathBow } from "./flight";
import {
  bowControl,
  type Box,
  courtLines,
  type CourtLine,
  frameBounds,
  type Orientation,
  placeLabels,
  project,
  type Projection,
  quadPoint,
  textWidth,
  trim,
  type Vec,
} from "./geometry";
import { lookOf, type PersonLook } from "./marks";
import { shortRole } from "./sentences";
import {
  type Frame,
  sampleTimeline,
  type Timeline,
  type TimelineItem,
} from "./timeline";

/** Where the drawing is in the drill: the whole rep, or one step of it. */
export type StepState = "all" | "done" | "now" | "next";

export interface DrawingSizes {
  readonly dot: number;
  readonly label: number;
  readonly role: number;
  readonly badge: number;
  readonly ball: number;
}

export const DRAWING_SIZES: Record<Orientation, DrawingSizes> = {
  // Portrait is the phone layout: bigger marks so they read at 320 px.
  portrait: { dot: 16, label: 15, role: 13, badge: 11, ball: 6.5 },
  landscape: { dot: 14, label: 13, role: 12, badge: 10, ball: 6 },
};

export interface DrawnPerson {
  readonly person: string;
  readonly slot: string;
  readonly look: PersonLook;
  readonly waiting: boolean;
  readonly label: string;
  readonly role: string;
  readonly at: Vec;
  readonly roleAt?: Vec;
}

export interface DrawnPath {
  readonly id: string;
  readonly kind: ContactKind;
  readonly verb: string;
  readonly number: number;
  readonly d: string;
  readonly badge: Vec;
  readonly state: StepState;
  readonly crossesNet: boolean;
}

export interface DrawnMove {
  readonly id: string;
  readonly d: string;
  readonly state: StepState;
}

export interface DrawnText {
  readonly text: string;
  readonly at: Vec;
  readonly anchor: "start" | "middle" | "end";
}

export interface Drawing {
  readonly projection: Projection;
  readonly sizes: DrawingSizes;
  readonly surface: "sand" | "hard";
  readonly noCourt: boolean;
  /** Free zone (the whole frame) and the court rectangle. */
  readonly frame: Box;
  readonly court?: Box;
  readonly lines: readonly {
    readonly a: Vec;
    readonly b: Vec;
    readonly kind: CourtLine["kind"];
  }[];
  readonly net?: {
    readonly a: Vec;
    readonly b: Vec;
    readonly posts: readonly Vec[];
  };
  readonly netLabel?: DrawnText;
  readonly sideLabels: readonly DrawnText[];
  readonly zones: readonly {
    readonly id: string;
    readonly box: Box;
    readonly label?: DrawnText;
  }[];
  readonly equipment: readonly {
    readonly id: string;
    readonly kind: string;
    readonly at: Vec;
    readonly label?: DrawnText;
  }[];
  readonly supply: readonly {
    readonly id: string;
    readonly at: Vec;
    readonly label: DrawnText;
  }[];
  readonly people: readonly DrawnPerson[];
  readonly balls: readonly { readonly id: string; readonly at: Vec }[];
  readonly paths: readonly DrawnPath[];
  readonly moves: readonly DrawnMove[];
  readonly rotation: readonly { readonly id: string; readonly d: string }[];
  /** Which item the drawing shows, if one. */
  readonly item?: TimelineItem;
}

const r1 = (value: number) => Math.round(value * 10) / 10;

/**
 * A ball at a person's dot would hide their label: near a dot it slides to
 * the dot's upper-right edge, smoothly, so it never jumps when it leaves.
 */
export function ballScreenPoint(
  at: Vec,
  people: readonly Vec[],
  sizes: DrawingSizes,
): Vec {
  const reach = sizes.dot * 1.7;
  let nearest: Vec | undefined;
  let gap = reach;
  for (const person of people) {
    const d = Math.hypot(person.x - at.x, person.y - at.y);
    if (d < gap) {
      gap = d;
      nearest = person;
    }
  }
  if (!nearest) return at;
  const weight = 1 - gap / reach;
  const u = weight * weight * (3 - 2 * weight);
  const edge = {
    x: nearest.x + sizes.dot * 0.9,
    y: nearest.y - sizes.dot * 0.9,
  };
  return { x: at.x + (edge.x - at.x) * u, y: at.y + (edge.y - at.y) * u };
}

function boxOf(
  projection: Projection,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Box {
  const a = projection.at({ x: x0, y: y0 });
  const c = projection.at({ x: x1, y: y1 });
  const left = Math.min(a.x, c.x);
  const top = Math.min(a.y, c.y);
  const w = Math.abs(c.x - a.x);
  const h = Math.abs(c.y - a.y);
  return { x: left + w / 2, y: top + h / 2, w, h };
}

/** Every point worth keeping in the frame. */
function pointsOf(timeline: Timeline): ScenePoint[] {
  const { resolved } = timeline.scene;
  const points: ScenePoint[] = [...resolved.slots];
  for (const thing of [...resolved.supply, ...resolved.equipment])
    points.push(thing);
  for (const zone of resolved.zones) {
    if (zone.rect) {
      points.push(
        { x: zone.rect.x0, y: zone.rect.y0 },
        { x: zone.rect.x1, y: zone.rect.y1 },
      );
    }
  }
  for (const rep of timeline.reps) {
    for (const contact of rep.contacts) points.push(contact.from, contact.to);
    for (const move of rep.moves) points.push(move.to);
  }
  return points;
}

/** The step state of an action in step `index`, given the focus. */
export function stepState(index: number, focus: number | undefined): StepState {
  if (focus === undefined) return "all";
  if (index < focus) return "done";
  if (index === focus) return "now";
  return "next";
}

export interface DrawingOptions {
  readonly orientation: Orientation;
  /** Item index in the timeline to show; undefined is the whole first rep. */
  readonly item?: number;
  /** Draw the rotation arrows (whole-rep view). */
  readonly rotation?: boolean;
  /** People and balls at this frame instead of the item's start. */
  readonly frame?: Frame;
}

export function buildDrawing(
  timeline: Timeline,
  options: DrawingOptions,
): Drawing {
  const { resolved } = timeline.scene;
  const court = resolved.court;
  const projection = project(
    frameBounds(court, pointsOf(timeline)),
    options.orientation,
  );
  const at = projection.at;
  const sizes = DRAWING_SIZES[options.orientation];
  const item =
    options.item === undefined ? undefined : timeline.items[options.item];
  const repIndex = item?.rep ?? (item?.kind === "rotation" ? 0 : 0);
  const rep = timeline.reps[repIndex] ?? timeline.reps[0]!;
  const focus = item?.kind === "step" ? item.stepIndex : undefined;
  const inRotation = item?.kind === "rotation";
  const hw = court.width / 2;
  const hl = court.length / 2;
  const b = projection.bounds;

  const frame = boxOf(projection, b.x0, b.y0, b.x1, b.y1);
  const courtBox = court.noCourt
    ? undefined
    : boxOf(projection, -hw, -hl, hw, court.half ? Math.min(hl, b.y1) : hl);
  const lines = courtLines(court)
    .filter((line) => !(court.half && line.a.y > b.y1 && line.b.y > b.y1))
    .map((line) => ({
      a: at({ x: line.a.x, y: Math.min(line.a.y, b.y1) }),
      b: at({ x: line.b.x, y: Math.min(line.b.y, b.y1) }),
      kind: line.kind,
    }));
  const netHalf = court.netLength / 2;
  const net = court.noCourt
    ? undefined
    : {
        a: at({ x: -netHalf, y: 0 }),
        b: at({ x: netHalf, y: 0 }),
        posts: [at({ x: -netHalf, y: 0 }), at({ x: netHalf, y: 0 })],
      };

  // ---- ball paths ----
  const paths: DrawnPath[] = [];
  const obstaclePoints: Vec[] = [];
  const badgeBoxes: Box[] = [];
  const contacts = inRotation ? [] : rep.contacts;
  // Paths between the same two places, in the same direction, fan out: each
  // keeps its own bow but sits at least a step wider than the one before.
  const bows = new Map<string, number>();
  const groups = new Map<string, (typeof contacts)[number][]>();
  for (const contact of contacts) {
    const key = [contact.from, contact.to]
      .map((p) => `${Math.round(p.x * 2)},${Math.round(p.y * 2)}`)
      .join(">");
    const list = groups.get(key) ?? [];
    list.push(contact);
    groups.set(key, list);
  }
  const pairs = new Map<string, number>();
  for (const key of groups.keys()) {
    const pair = key.split(">").sort().join("|");
    pairs.set(pair, (pairs.get(pair) ?? 0) + (groups.get(key)?.length ?? 0));
  }
  for (const [key, list] of groups) {
    const shared = (pairs.get(key.split(">").sort().join("|")) ?? 0) > 1;
    const sorted = [...list].sort(
      (a, b) => pathBow(a.verb, a.flight.apex) - pathBow(b.verb, b.flight.apex),
    );
    let previous = -1;
    for (const contact of sorted) {
      const natural = pathBow(contact.verb, contact.flight.apex);
      // Back-and-forth paths never sit on the straight line between two
      // people, so the two directions stay apart.
      const base = shared ? Math.max(natural, 0.09) : natural;
      const bow = previous < 0 ? base : Math.max(base, previous + 0.13);
      bows.set(contact.id, bow);
      previous = bow;
    }
  }
  for (const contact of contacts) {
    const a = at(contact.from);
    const c = at(contact.to);
    const trimmed = trim(a, c, 4, sizes.ball + 3) ?? { a, c };
    const control = bowControl(
      trimmed.a,
      trimmed.c,
      bows.get(contact.id) ?? pathBow(contact.verb, contact.flight.apex),
    );
    for (let k = 0; k <= 16; k++) {
      obstaclePoints.push(quadPoint(trimmed.a, control, trimmed.c, k / 16));
    }
    const radius = sizes.badge * 0.9;
    // Along the path first; if every spot is taken, step off it sideways.
    const mid = quadPoint(trimmed.a, control, trimmed.c, 0.5);
    const tangent = {
      x: trimmed.c.x - trimmed.a.x,
      y: trimmed.c.y - trimmed.a.y,
    };
    const span = Math.hypot(tangent.x, tangent.y) || 1;
    const normal = { x: -tangent.y / span, y: tangent.x / span };
    const candidates = [
      ...[0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.2, 0.8].map((t) =>
        quadPoint(trimmed.a, control, trimmed.c, t),
      ),
      ...[1, -1, 2, -2, 3, -3].map((k) => ({
        x: mid.x + normal.x * radius * 2.4 * k,
        y: mid.y + normal.y * radius * 2.4 * k,
      })),
    ];
    let badge = mid;
    let fewest = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const box = {
        x: candidate.x,
        y: candidate.y,
        w: radius * 2.2,
        h: radius * 2.2,
      };
      const clashes = badgeBoxes.filter(
        (other) =>
          Math.abs(other.x - box.x) * 2 < other.w + box.w &&
          Math.abs(other.y - box.y) * 2 < other.h + box.h,
      ).length;
      if (clashes < fewest) {
        fewest = clashes;
        badge = candidate;
      }
      if (clashes === 0) break;
    }
    badgeBoxes.push({
      x: badge.x,
      y: badge.y,
      w: radius * 2.2,
      h: radius * 2.2,
    });
    paths.push({
      id: contact.id,
      kind: contact.kind,
      verb: contact.verb,
      number: contact.number,
      d: `M${r1(trimmed.a.x)},${r1(trimmed.a.y)} Q${r1(control.x)},${r1(control.y)} ${r1(trimmed.c.x)},${r1(trimmed.c.y)}`,
      badge: { x: r1(badge.x), y: r1(badge.y) },
      state: stepState(contact.stepIndex, focus),
      crossesNet: contact.flight.crossing !== null,
    });
  }

  // ---- player moves ----
  const moves: DrawnMove[] = [];
  if (!inRotation) {
    for (const move of rep.moves) {
      const a = at(move.from);
      const c = at(move.to);
      if (Math.hypot(c.x - a.x, c.y - a.y) < 0.9 * projection.scale) continue;
      const trimmed = trim(a, c, sizes.dot + 3, 5);
      if (!trimmed) continue;
      for (let k = 0; k <= 8; k++) {
        obstaclePoints.push({
          x: trimmed.a.x + ((trimmed.c.x - trimmed.a.x) * k) / 8,
          y: trimmed.a.y + ((trimmed.c.y - trimmed.a.y) * k) / 8,
        });
      }
      moves.push({
        id: move.id,
        d: `M${r1(trimmed.a.x)},${r1(trimmed.a.y)} L${r1(trimmed.c.x)},${r1(trimmed.c.y)}`,
        state: stepState(move.stepIndex, focus),
      });
    }
  }

  // ---- rotation arrows ----
  const rotation: { id: string; d: string }[] = [];
  if ((options.rotation || inRotation) && timeline.rotation) {
    for (const move of timeline.rotation.moves) {
      if (move.from === move.to) continue;
      const points = move.path.map(at);
      const first = trim(points[0]!, points[1]!, sizes.dot + 3, 0);
      const last = trim(
        points[points.length - 2]!,
        points[points.length - 1]!,
        0,
        sizes.dot + 5,
      );
      if (!first || !last) continue;
      const route = [first.a, ...points.slice(1, -1), last.c];
      rotation.push({
        id: `${move.person}:${move.from}`,
        d: `M${route.map((p) => `${r1(p.x)},${r1(p.y)}`).join(" L")}`,
      });
    }
  }

  // ---- people and balls, where they are at the item's start ----
  const frameAt =
    options.frame ??
    (item
      ? sampleTimeline(timeline, item.t + 1e-3)
      : sampleTimeline(timeline, 0));
  const slots = new Map(resolved.slots.map((slot) => [slot.id, slot]));
  const people = frameAt.people.map((person) => {
    const slot = slots.get(person.slot);
    return {
      person: person.person,
      slot: person.slot,
      look: lookOf(person),
      waiting: person.waiting,
      label: person.label,
      role: shortRole(slot?.role ?? ""),
      at: at(person),
    };
  });
  const balls = frameAt.balls
    .filter((ball) => ball.visible)
    .map((ball) => ({
      id: ball.id,
      at: ballScreenPoint(
        at(ball),
        people.map((person) => person.at),
        sizes,
      ),
    }));

  // ---- labels, nudged clear of dots, paths and each other ----
  const dotBoxes: Box[] = people.map((person) => ({
    x: person.at.x,
    y: person.at.y,
    w: sizes.dot * 2.3,
    h: sizes.dot * 2.3,
  }));
  const thingBoxes: Box[] = [
    ...resolved.equipment.map((thing) => ({ ...at(thing), w: 28, h: 28 })),
    ...resolved.supply.map((thing) => ({ ...at(thing), w: 34, h: 22 })),
  ];
  const area = { width: projection.width, height: projection.height };
  const roleH = sizes.role * 1.25;
  const roleCandidates = people.map((person) => {
    const w = textWidth(person.role, sizes.role) + 6;
    const gap = sizes.dot + roleH / 2 + 3;
    return {
      anchor: person.at,
      w,
      h: roleH,
      offsets: [
        { x: 0, y: gap },
        { x: 0, y: -gap },
        { x: sizes.dot + 4 + w / 2, y: 0 },
        { x: -(sizes.dot + 4 + w / 2), y: 0 },
        { x: 0, y: gap + roleH },
        { x: 0, y: -gap - roleH },
      ],
    };
  });
  const showRoles = !options.frame;
  const roleSpots = showRoles
    ? placeLabels(
        roleCandidates.filter((_, index) => people[index]!.role),
        {
          boxes: [...dotBoxes, ...thingBoxes, ...badgeBoxes],
          points: obstaclePoints,
        },
        area,
      )
    : [];
  let roleCursor = 0;
  const drawnPeople: DrawnPerson[] = people.map((person) => {
    if (!showRoles || !person.role) return person;
    const roleAt = roleSpots[roleCursor++]!;
    return { ...person, roleAt: { x: r1(roleAt.x), y: r1(roleAt.y) } };
  });
  const placedRoles: Box[] = drawnPeople
    .filter((person) => person.roleAt)
    .map((person) => ({
      ...person.roleAt!,
      w: textWidth(person.role, sizes.role) + 6,
      h: roleH,
    }));

  const smallText = sizes.role;
  const placedThings: Box[] = [];
  const thingLabel = (text: string, anchor: Vec, below: number): DrawnText => {
    const w = textWidth(text, smallText) + 6;
    const [spot] = placeLabels(
      [
        {
          anchor,
          w,
          h: smallText * 1.25,
          offsets: [
            { x: 0, y: below },
            { x: 0, y: -below },
            { x: below + w / 2, y: 0 },
            { x: -(below + w / 2), y: 0 },
          ],
        },
      ],
      {
        boxes: [...dotBoxes, ...placedRoles, ...badgeBoxes, ...placedThings],
        points: obstaclePoints,
      },
      area,
    );
    placedThings.push({ ...spot!, w, h: smallText * 1.25 });
    return { text, at: { x: r1(spot!.x), y: r1(spot!.y) }, anchor: "middle" };
  };

  const zoneLabel = (text: string, box: Box): DrawnText => {
    const w = textWidth(text, smallText) + 6;
    const h = smallText * 1.25;
    const inset = Math.max(box.h / 2 - h, 0);
    const [spot] = placeLabels(
      [
        {
          anchor: { x: box.x, y: box.y },
          w,
          h,
          offsets: [
            { x: 0, y: 0 },
            { x: 0, y: -inset },
            { x: 0, y: inset },
            { x: 0, y: -box.h / 2 - h / 2 - 2 },
            { x: 0, y: box.h / 2 + h / 2 + 2 },
          ],
        },
      ],
      {
        boxes: [...dotBoxes, ...placedRoles, ...badgeBoxes, ...placedThings],
        points: obstaclePoints,
      },
      area,
    );
    placedThings.push({ ...spot!, w, h });
    return { text, at: { x: r1(spot!.x), y: r1(spot!.y) }, anchor: "middle" };
  };
  const zones = resolved.zones
    .filter((zone) => zone.rect)
    .map((zone) => {
      const box = boxOf(
        projection,
        zone.rect!.x0,
        zone.rect!.y0,
        zone.rect!.x1,
        zone.rect!.y1,
      );
      return {
        id: zone.id,
        box,
        ...(zone.label ? { label: zoneLabel(zone.label, box) } : {}),
      };
    });
  const equipment = resolved.equipment.map((thing) => ({
    id: thing.id,
    kind: thing.kind,
    at: at(thing),
    ...(thing.label && thing.kind !== "cone"
      ? { label: thingLabel(thing.label, at(thing), 22) }
      : {}),
  }));
  const supply = resolved.supply.map((thing) => ({
    id: thing.id,
    at: at(thing),
    label: thingLabel(thing.label ?? "Balls", at(thing), 20),
  }));

  // ---- the net's height and the side names ----
  let netLabel: DrawnText | undefined;
  if (net) {
    const post =
      options.orientation === "landscape" ? net.posts[0]! : net.posts[1]!;
    const text = `Net ${court.netHeight.toFixed(2)} m`;
    const w = textWidth(text, smallText) + 6;
    const [spot] = placeLabels(
      [
        {
          anchor: post,
          w,
          h: smallText * 1.25,
          offsets:
            options.orientation === "landscape"
              ? [
                  { x: w / 2 + 6, y: -10 },
                  { x: -w / 2 - 6, y: -10 },
                  { x: w / 2 + 6, y: 12 },
                ]
              : [
                  { x: -w / 2 - 4, y: -12 },
                  { x: -w / 2 - 4, y: 12 },
                  {
                    x: net.posts[0]!.x - post.x + w / 2 + 4,
                    y: -12,
                  },
                  {
                    x: net.posts[0]!.x - post.x + w / 2 + 4,
                    y: 12,
                  },
                ],
        },
      ],
      {
        boxes: [...dotBoxes, ...placedRoles, ...placedThings],
        points: obstaclePoints,
      },
      area,
    );
    netLabel = {
      text,
      at: { x: r1(spot!.x), y: r1(spot!.y) },
      anchor: "middle",
    };
    placedThings.push({ ...spot!, w, h: smallText * 1.25 });
  }
  const sideLabels: DrawnText[] = [];
  if (!court.noCourt) {
    for (const side of court.half ? (["A"] as const) : (["A", "B"] as const)) {
      const sign = side === "A" ? -1 : 1;
      const text = `Side ${side}`;
      const w = textWidth(text.toUpperCase(), smallText) + 8;
      const candidates = [
        { x: 0, y: sign * (hl - 0.7) },
        { x: sign * -(hw - 1.1), y: sign * (hl - 0.6) },
        { x: sign * (hw - 1.1), y: sign * (hl - 0.6) },
        { x: 0, y: sign * (hl * 0.55) },
      ].map((point) => at(point));
      const [spot] = placeLabels(
        [
          {
            anchor: { x: 0, y: 0 },
            w,
            h: smallText * 1.3,
            offsets: candidates,
          },
        ],
        {
          boxes: [...dotBoxes, ...placedRoles, ...placedThings, ...badgeBoxes],
          points: obstaclePoints,
        },
        area,
      );
      sideLabels.push({
        text,
        at: { x: r1(spot!.x), y: r1(spot!.y) },
        anchor: "middle",
      });
    }
  }

  return {
    projection,
    sizes,
    surface: court.surface,
    noCourt: court.noCourt,
    frame,
    ...(courtBox ? { court: courtBox } : {}),
    lines,
    ...(net ? { net } : {}),
    ...(netLabel ? { netLabel } : {}),
    sideLabels,
    zones,
    equipment,
    supply,
    people: drawnPeople,
    balls,
    paths,
    moves,
    rotation,
    ...(item ? { item } : {}),
  };
}
