/**
 * The clock of a drill: when each contact, move and block happens, where
 * every person and ball is at any moment, and the step and rotation items a
 * coach steps through. One timeline drives the 2D drawing, the 2D animation
 * and the 3D view, so they always agree. Pure: no DOM, no real clock.
 *
 * Time comes from the physics, not from typed seconds: a contact happens
 * when its ball arrives; `after: "previous"` waits for everything before it;
 * `delay` nudges one action. Actions name slots, not people, so after the
 * rotation the same script replays with the people advanced through the
 * slots (`rotationPlan`).
 */
import {
  TRAINING_SCENE_VERBS,
  type ResolvedSceneAction,
  type ResolvedSceneSlot,
  type ScenePoint,
} from "@duna/core/training-scene";
import {
  BALL_RADIUS,
  contactHeight,
  contactKind,
  type ContactKind,
  ease,
  planVerbFlight,
  type Point3,
  sampleFlight,
  type VerbFlight,
} from "./flight";
import type { PreparedScene } from "./prepare";
import {
  fillCaption,
  initialOccupancy,
  type Occupancy,
  rotationPlan,
  rotationSentence,
  stepSentence,
} from "./sentences";

/** Walk back to base after a rep, m/s (the model's recover speed). */
const RECOVER_SPEED = 2.6;
/** Walk between slots in a rotation, m/s. */
const ROTATION_SPEED = 2.4;
/** A player closes on a ball at about this pace, m/s. */
const APPROACH_SPEED = 3.2;
/** Shown jump height, metres (display only). */
export const JUMP_HEIGHT = 0.42;
/** No drill plays longer than this, seconds; later actions are dropped. */
export const MAX_TIMELINE_SECONDS = 600;

const MOVE_VERBS = new Set(["move", "shuffle", "transition", "rotate"]);

export interface TrackKey {
  readonly t: number;
  readonly x: number;
  readonly y: number;
  readonly kind: "base" | "contact" | "move" | "hold" | "block" | "recover";
}

export interface TimedContact {
  readonly id: string;
  readonly stepIndex: number;
  readonly actor: string;
  readonly person: string;
  readonly verb: string;
  readonly kind: ContactKind;
  readonly ball: string;
  /** Order of the contact in the rep, from 1. */
  readonly number: number;
  readonly t0: number;
  readonly t1: number;
  readonly from: Point3;
  readonly to: Point3;
  readonly flight: VerbFlight;
}

export interface TimedMove {
  readonly id: string;
  readonly stepIndex: number;
  readonly actor: string;
  readonly person: string;
  readonly verb: string;
  readonly t0: number;
  readonly t1: number;
  readonly from: ScenePoint;
  readonly to: ScenePoint;
}

export interface TimedBlock {
  readonly id: string;
  readonly stepIndex: number;
  readonly actor: string;
  readonly person: string;
  readonly t0: number;
  readonly t1: number;
  readonly at: ScenePoint;
}

export interface StepTiming {
  readonly index: number;
  readonly id: string;
  readonly t0: number;
  readonly t1: number;
}

export type BallStart =
  | { readonly kind: "held"; readonly slot: string }
  | { readonly kind: "supply"; readonly x: number; readonly y: number };

export interface RepTiming {
  readonly index: number;
  readonly occupancy: Occupancy;
  /** Person id → slot id. */
  readonly personSlot: Readonly<Record<string, string>>;
  readonly tracks: Readonly<Record<string, readonly TrackKey[]>>;
  readonly jumps: Readonly<Record<string, readonly number[]>>;
  readonly contacts: readonly TimedContact[];
  readonly moves: readonly TimedMove[];
  readonly blocks: readonly TimedBlock[];
  readonly steps: readonly StepTiming[];
  readonly balls: Readonly<Record<string, BallStart>>;
  readonly duration: number;
  readonly continuous: boolean;
}

export interface RotationMove {
  readonly person: string;
  readonly from: string;
  readonly to: string;
  readonly path: readonly ScenePoint[];
}

export interface RotationTiming {
  readonly name: string;
  readonly caption?: string;
  readonly every: number;
  readonly from: Occupancy;
  readonly next: Occupancy;
  readonly moves: readonly RotationMove[];
  /** Walking time; the segment holds a moment longer. */
  readonly walk: number;
}

export interface Segment {
  readonly kind: "rep" | "rotation";
  readonly t0: number;
  readonly t1: number;
  readonly rep?: number;
}

export interface TimelineItem {
  readonly kind: "step" | "rotation";
  readonly segment: number;
  readonly rep?: number;
  readonly stepIndex?: number;
  /** "Step 2 of 4", within its rep. */
  readonly number: number;
  readonly of: number;
  /** Global start and end, seconds. */
  readonly t: number;
  readonly end: number;
  /** The coach's caption, with the people of this rep. */
  readonly caption: string;
  /** The generated sentence (the text alternative). */
  readonly sentence: string;
  readonly cue?: string;
}

export interface Timeline {
  readonly scene: PreparedScene;
  readonly reps: readonly RepTiming[];
  readonly rotation?: RotationTiming;
  readonly segments: readonly Segment[];
  readonly items: readonly TimelineItem[];
  readonly duration: number;
}

const dist = (a: ScenePoint, b: ScenePoint) => Math.hypot(a.x - b.x, a.y - b.y);

/** Linear between keys, eased in and out of each key (no overshoot). */
export function trackAt(
  track: readonly TrackKey[],
  t: number,
  eased = true,
): ScenePoint {
  if (track.length === 0) return { x: 0, y: 0 };
  const first = track[0]!;
  if (t <= first.t) return { x: first.x, y: first.y };
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i]!;
    const b = track[i + 1]!;
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t;
      const raw = span > 1e-6 ? (t - a.t) / span : 1;
      const u = eased ? ease(raw) : raw;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    }
  }
  const last = track[track.length - 1]!;
  return { x: last.x, y: last.y };
}

function insertKey(track: TrackKey[], key: TrackKey): void {
  let index = track.length;
  while (index > 0 && track[index - 1]!.t > key.t) index--;
  track.splice(index, 0, key);
}

/** A display jump: up and down around the contact, no overshoot. */
export function jumpAt(jumps: readonly number[], t: number): number {
  let z = 0;
  for (const time of jumps) {
    const start = time - 0.38;
    const end = time + 0.27;
    if (t >= start && t <= end) {
      z = Math.max(
        z,
        JUMP_HEIGHT * Math.sin((Math.PI * (t - start)) / (end - start)),
      );
    }
  }
  return z;
}

function sideOf(slot: ResolvedSceneSlot | undefined, point: ScenePoint) {
  if (slot?.side === "A" || slot?.side === "B") return slot.side;
  return point.y > 0 ? "B" : "A";
}

export function buildRep(
  scene: PreparedScene,
  occupancy: Occupancy,
  index: number,
): RepTiming {
  const { resolved } = scene;
  const slots = new Map(resolved.slots.map((slot) => [slot.id, slot]));
  const personSlot: Record<string, string> = {};
  const tracks: Record<string, TrackKey[]> = {};
  const jumps: Record<string, number[]> = {};
  for (const [slotId, person] of Object.entries(occupancy)) {
    const slot = slots.get(slotId);
    if (!slot) continue;
    personSlot[person] = slotId;
    tracks[person] = [{ t: 0, x: slot.x, y: slot.y, kind: "base" }];
    jumps[person] = [];
  }

  interface BallState {
    holder?: string;
    supply?: ScenePoint;
    at?: Point3;
    arrival?: number;
  }
  const ballState = new Map<string, BallState>();
  const ballStarts: Record<string, BallStart> = {};
  for (const ball of resolved.balls) {
    if (ball.start.slot) {
      ballState.set(ball.id, { holder: ball.start.slot });
      ballStarts[ball.id] = { kind: "held", slot: ball.start.slot };
    } else if (ball.start.supply) {
      const supply = resolved.supply.find(
        (thing) => thing.id === ball.start.supply,
      );
      const at = supply ? { x: supply.x, y: supply.y } : { x: 0, y: 0 };
      ballState.set(ball.id, { supply: at });
      ballStarts[ball.id] = { kind: "supply", ...at };
    }
  }

  const flat: { stepIndex: number; action: ResolvedSceneAction }[] = [];
  resolved.steps.forEach((step, stepIndex) =>
    step.actions.forEach((action) => flat.push({ stepIndex, action })),
  );
  const nextContact = (ball: string, position: number) => {
    const isContact = (entry: (typeof flat)[number]) =>
      entry.action.group === "contact" && entry.action.ball === ball;
    for (let i = position + 1; i < flat.length; i++) {
      if (isContact(flat[i]!)) return flat[i]!.action;
    }
    if (scene.continuous) {
      for (let i = 0; i <= position; i++) {
        if (isContact(flat[i]!)) return flat[i]!.action;
      }
    }
    return undefined;
  };

  const approach = (person: string, t0: number, stand: ScenePoint) => {
    const track = tracks[person]!;
    const here = trackAt(track, t0, false);
    const before = [...track].reverse().find((key) => key.t <= t0);
    const gap = dist(here, stand);
    if (gap > 0.25 && before) {
      const start = t0 - (gap / APPROACH_SPEED + 0.2);
      if (start > before.t + 0.05) {
        insertKey(track, { t: start, x: here.x, y: here.y, kind: "hold" });
      }
    }
    insertKey(track, { t: t0, x: stand.x, y: stand.y, kind: "contact" });
  };

  const contacts: TimedContact[] = [];
  const moves: TimedMove[] = [];
  const blocks: TimedBlock[] = [];
  const steps: StepTiming[] = [];
  let cursor = 0;
  let lastEnd = 0;
  let position = -1;
  let number = 0;
  const netHeight = resolved.court.netHeight;

  resolved.steps.forEach((step, stepIndex) => {
    const extras = scene.steps[stepIndex];
    let base = cursor;
    if (extras?.after) base = Math.max(base, lastEnd + extras.gap);
    for (const action of step.actions) {
      if (action.group !== "contact" || !action.ball) continue;
      const state = ballState.get(action.ball);
      if (
        state &&
        !state.holder &&
        !state.supply &&
        state.arrival !== undefined
      ) {
        base = Math.max(base, state.arrival);
      }
    }
    if (base > MAX_TIMELINE_SECONDS) {
      position += step.actions.length;
      return;
    }
    let stepStart = Number.POSITIVE_INFINITY;
    let stepEnd = base;
    step.actions.forEach((action, actionIndex) => {
      position++;
      const person = occupancy[action.actor];
      const slot = slots.get(action.actor);
      if (!person || !tracks[person] || !slot) return;
      const track = tracks[person]!;
      const delay = Math.min(Math.max(action.delay ?? 0, 0), 10);
      const extra = extras?.actions[actionIndex];
      if (action.group === "contact") {
        const state = action.ball ? ballState.get(action.ball) : undefined;
        if (!state || !action.ball || !action.to) return;
        let t0: number;
        let from: ScenePoint;
        if (state.holder !== undefined || state.supply) {
          t0 = base + delay;
          const here = trackAt(track, t0, false);
          // The validator measured from the holder's slot; an explicit
          // start a metre or more away was authored, so keep it.
          const authored =
            action.from && state.holder === action.actor
              ? dist(action.from, slot) > 0.05
              : false;
          from = authored && action.from ? action.from : here;
        } else {
          t0 = Math.max(state.arrival ?? base, base) + delay;
          from = action.from ?? state.at ?? trackAt(track, t0, false);
        }
        const next = nextContact(action.ball, position);
        const nextSlot = next ? slots.get(next.actor) : undefined;
        const z0 = contactHeight(action.verb, slot.onBox);
        const z1 = next
          ? contactHeight(next.verb, nextSlot?.onBox ?? 0)
          : BALL_RADIUS;
        const flight = planVerbFlight(
          { x: from.x, y: from.y, z: z0 },
          { x: action.to.x, y: action.to.y, z: z1 },
          action.verb,
          netHeight,
          extra?.arc,
        );
        const side = sideOf(slot, from);
        approach(person, t0, {
          x: from.x,
          y: from.y + (side === "B" ? 0.3 : -0.3),
        });
        if (action.jump) jumps[person]!.push(t0);
        number++;
        const t1 = t0 + flight.duration;
        contacts.push({
          id: action.id,
          stepIndex,
          actor: action.actor,
          person,
          verb: action.verb,
          kind: contactKind(action.verb),
          ball: action.ball,
          number,
          t0,
          t1,
          from: flight.p0,
          to: flight.p1,
          flight,
        });
        ballState.set(action.ball, {
          at: flight.p1,
          arrival: t1,
        });
        stepStart = Math.min(stepStart, t0);
        stepEnd = Math.max(stepEnd, t1);
        lastEnd = Math.max(lastEnd, t1);
        return;
      }
      const t0 = base + delay;
      const here = trackAt(track, t0, false);
      if (MOVE_VERBS.has(action.verb)) {
        const to = action.to ?? here;
        const spec = TRAINING_SCENE_VERBS[action.verb];
        const speed = spec?.speed && spec.speed > 0 ? spec.speed : 3;
        const duration =
          extra?.duration ?? Math.max(0.4, dist(here, to) / speed);
        insertKey(track, { t: t0, x: here.x, y: here.y, kind: "hold" });
        insertKey(track, { t: t0 + duration, x: to.x, y: to.y, kind: "move" });
        moves.push({
          id: action.id,
          stepIndex,
          actor: action.actor,
          person,
          verb: action.verb,
          t0,
          t1: t0 + duration,
          from: here,
          to,
        });
        stepEnd = Math.max(stepEnd, t0 + duration);
        lastEnd = Math.max(lastEnd, t0 + duration);
      } else if (action.verb === "block") {
        const at = action.to ?? here;
        if (action.to) approach(person, t0, at);
        jumps[person]!.push(t0 + 0.1);
        blocks.push({
          id: action.id,
          stepIndex,
          actor: action.actor,
          person,
          t0,
          t1: t0 + 0.7,
          at,
        });
        stepEnd = Math.max(stepEnd, t0 + 0.7);
        lastEnd = Math.max(lastEnd, t0 + 0.7);
      } else {
        const duration = extra?.duration ?? 1;
        insertKey(track, { t: t0, x: here.x, y: here.y, kind: "hold" });
        insertKey(track, {
          t: t0 + duration,
          x: here.x,
          y: here.y,
          kind: "hold",
        });
        stepEnd = Math.max(stepEnd, t0 + duration);
        lastEnd = Math.max(lastEnd, t0 + duration);
      }
      stepStart = Math.min(stepStart, t0);
    });
    const t0 = Number.isFinite(stepStart) ? stepStart : base;
    steps.push({
      index: stepIndex,
      id: step.id,
      t0,
      t1: Math.max(stepEnd, t0 + 0.6),
    });
    cursor = base + 0.05;
  });

  let lastT = 0;
  for (const step of steps) lastT = Math.max(lastT, step.t1);
  let duration: number;
  if (scene.continuous) {
    duration = Math.max(lastT, 0.6);
  } else {
    duration = lastT + 0.8;
    for (const [person, track] of Object.entries(tracks)) {
      const last = track[track.length - 1]!;
      const home = slots.get(personSlot[person]!)!;
      const gap = dist(home, last);
      if (gap > 0.3) {
        const start = Math.max(last.t + 0.35, lastT + 0.2);
        const end = start + gap / RECOVER_SPEED;
        track.push(
          { t: start, x: last.x, y: last.y, kind: "hold" },
          { t: end, x: home.x, y: home.y, kind: "recover" },
        );
        duration = Math.max(duration, end + 0.3);
      }
    }
  }
  return {
    index,
    occupancy,
    personSlot,
    tracks,
    jumps,
    contacts,
    moves,
    blocks,
    steps,
    balls: ballStarts,
    duration,
    continuous: scene.continuous,
  };
}

/** Who walks where between reps; across the net means round the post. */
export function buildRotation(
  scene: PreparedScene,
  from: Occupancy,
): RotationTiming | undefined {
  const plan = rotationPlan(scene, from);
  if (!plan) return undefined;
  const { court } = scene.resolved;
  const slots = new Map(scene.resolved.slots.map((slot) => [slot.id, slot]));
  const moves: RotationMove[] = [];
  let longest = 0;
  for (const [slotId, person] of Object.entries(from)) {
    const to = Object.keys(plan.next).find((key) => plan.next[key] === person);
    const a = slots.get(slotId);
    const b = to ? slots.get(to) : undefined;
    if (!a || !b || !to) continue;
    const path: ScenePoint[] = [{ x: a.x, y: a.y }];
    if (
      !court.noCourt &&
      a.y !== 0 &&
      b.y !== 0 &&
      Math.sign(a.y) !== Math.sign(b.y)
    ) {
      const sx = Math.sign(a.x + b.x) || 1;
      path.push({ x: sx * (court.width / 2 + 1.6), y: 0 });
    }
    path.push({ x: b.x, y: b.y });
    let length = 0;
    for (let i = 1; i < path.length; i++)
      length += dist(path[i]!, path[i - 1]!);
    longest = Math.max(longest, length);
    moves.push({ person, from: slotId, to, path });
  }
  return {
    name: plan.name,
    ...(plan.caption ? { caption: plan.caption } : {}),
    every: plan.every,
    from,
    next: plan.next,
    moves,
    walk: Math.min(Math.max(longest / ROTATION_SPEED, 1.6), 7),
  };
}

export function buildTimeline(
  scene: PreparedScene,
  options: { readonly rotation?: boolean } = {},
): Timeline {
  const first = initialOccupancy(scene);
  const reps: RepTiming[] = [buildRep(scene, first, 0)];
  const segments: Segment[] = [
    { kind: "rep", rep: 0, t0: 0, t1: reps[0]!.duration },
  ];
  let rotation: RotationTiming | undefined;
  if (options.rotation !== false) {
    rotation = buildRotation(scene, first);
    if (rotation) {
      const t0 = segments[0]!.t1;
      const t1 = t0 + rotation.walk + 0.6;
      segments.push({ kind: "rotation", t0, t1 });
      const second = buildRep(scene, rotation.next, 1);
      reps.push(second);
      segments.push({ kind: "rep", rep: 1, t0: t1, t1: t1 + second.duration });
    }
  }
  const items: TimelineItem[] = [];
  segments.forEach((segment, segmentIndex) => {
    if (segment.kind === "rep") {
      const rep = reps[segment.rep!]!;
      for (const step of rep.steps) {
        const template = scene.steps[step.index]?.caption ?? "";
        const resolvedCaption = scene.resolved.steps[step.index]?.caption ?? "";
        const caption = template
          ? fillCaption(scene, template, rep.occupancy)
          : resolvedCaption;
        const cue = scene.cues[step.id];
        items.push({
          kind: "step",
          segment: segmentIndex,
          rep: rep.index,
          stepIndex: step.index,
          number: step.index + 1,
          of: scene.resolved.steps.length,
          t: segment.t0 + step.t0,
          end: Math.min(segment.t0 + step.t1, segment.t1),
          caption,
          sentence: stepSentence(scene, step.index, rep.occupancy),
          ...(cue ? { cue } : {}),
        });
      }
    } else if (rotation) {
      const plan = rotationPlan(scene, rotation.from)!;
      items.push({
        kind: "rotation",
        segment: segmentIndex,
        number: 1,
        of: 1,
        t: segment.t0,
        end: segment.t1,
        caption: rotation.caption ?? "Rotation",
        sentence: rotationSentence(scene, rotation.from, plan),
      });
    }
  });
  return {
    scene,
    reps,
    ...(rotation ? { rotation } : {}),
    segments,
    items,
    duration: segments[segments.length - 1]!.t1,
  };
}

/** The item (step or rotation) showing at time T. */
export function itemIndexAt(timeline: Timeline, time: number): number {
  const t = Math.min(Math.max(time, 0), timeline.duration);
  let found = 0;
  for (let i = 0; i < timeline.items.length; i++) {
    if (timeline.items[i]!.t <= t + 1e-6) found = i;
    else break;
  }
  return found;
}

/** The moment that best shows an item as a still: its actions done. */
export function stillTime(timeline: Timeline, itemIndex: number): number {
  const item = timeline.items[itemIndex];
  if (!item) return 0;
  const next = timeline.items[itemIndex + 1];
  const end = next ? Math.min(item.end, next.t - 0.02) : item.end;
  return Math.max(item.t, Math.min(end, timeline.duration));
}

export type PoseKind =
  "neutral" | "platform" | "hands-high" | "arm-up" | "block" | "underhand";

const POSE_OF: Record<string, PoseKind> = {
  pass: "platform",
  dig: "platform",
  set: "hands-high",
  attack: "arm-up",
  hit: "arm-up",
  serve: "arm-up",
  jumpserve: "arm-up",
  roll: "arm-up",
  cut: "arm-up",
  toss: "underhand",
  freeball: "underhand",
};

export interface FramePerson {
  readonly person: string;
  readonly label: string;
  readonly slot: string;
  readonly side: "A" | "B" | "neutral";
  readonly kind: string;
  readonly waiting: boolean;
  readonly x: number;
  readonly y: number;
  /** Feet off the ground (jump), metres. */
  readonly z: number;
  readonly onBox: number;
  /** Heading on the floor, radians: 0 faces +y. */
  readonly facing: number;
  readonly pose: { readonly kind: PoseKind; readonly weight: number };
}

export interface FrameBall {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly visible: boolean;
  readonly alpha: number;
  readonly inFlight: boolean;
}

export interface Frame {
  readonly time: number;
  readonly segment: number;
  readonly item: number;
  readonly rep?: number;
  /** Seconds into the current segment. */
  readonly local: number;
  readonly people: readonly FramePerson[];
  readonly balls: readonly FrameBall[];
}

function poseAt(
  contacts: readonly { t: number; kind: PoseKind }[],
  t: number,
): FramePerson["pose"] {
  let best: FramePerson["pose"] = { kind: "neutral", weight: 0 };
  for (const contact of contacts) {
    const a = contact.t - 0.5;
    const b = contact.t - 0.15;
    const d = contact.t + 0.12;
    const e = contact.t + 0.4;
    let weight = 0;
    if (t >= a && t < b) weight = ease((t - a) / (b - a));
    else if (t >= b && t <= d) weight = 1;
    else if (t > d && t <= e) weight = 1 - ease((t - d) / (e - d));
    if (weight > best.weight) best = { kind: contact.kind, weight };
  }
  return best;
}

function along(path: readonly ScenePoint[], u: number): ScenePoint {
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const length = dist(path[i]!, path[i - 1]!);
    lengths.push(length);
    total += length;
  }
  let d = u * total;
  for (let i = 0; i < lengths.length; i++) {
    if (d <= lengths[i]! || i === lengths.length - 1) {
      const v = lengths[i]! > 0 ? Math.min(d / lengths[i]!, 1) : 1;
      const a = path[i]!;
      const b = path[i + 1]!;
      return { x: a.x + (b.x - a.x) * v, y: a.y + (b.y - a.y) * v };
    }
    d -= lengths[i]!;
  }
  return path[path.length - 1] ?? { x: 0, y: 0 };
}

function headingOf(dx: number, dy: number): number {
  return Math.atan2(dx, dy);
}

/** Every person and ball at time T. */
export function sampleTimeline(timeline: Timeline, time: number): Frame {
  const T = Math.min(Math.max(time, 0), timeline.duration);
  let segmentIndex = timeline.segments.findIndex(
    (segment) => T >= segment.t0 && T < segment.t1,
  );
  if (segmentIndex < 0) segmentIndex = timeline.segments.length - 1;
  const segment = timeline.segments[segmentIndex]!;
  const local = T - segment.t0;
  const item = itemIndexAt(timeline, T);
  const { resolved } = timeline.scene;
  const slots = new Map(resolved.slots.map((slot) => [slot.id, slot]));
  const labelOf = (person: string) =>
    resolved.people.find((entry) => entry.id === person)?.label ?? person;

  if (segment.kind === "rotation" && timeline.rotation) {
    const rotation = timeline.rotation;
    const v = ease(Math.min(local / rotation.walk, 1));
    const people = rotation.moves.map((move): FramePerson => {
      const at = along(move.path, v);
      const ahead = along(move.path, Math.min(v + 0.03, 1));
      const slot = slots.get(v < 0.5 ? move.from : move.to)!;
      const moving = dist(at, ahead) > 1e-3;
      return {
        person: move.person,
        label: labelOf(move.person),
        slot: slot.id,
        side: slot.side,
        kind: slot.kind,
        waiting: slot.waiting,
        x: at.x,
        y: at.y,
        z: 0,
        onBox: v > 0.95 ? slot.onBox : 0,
        facing: moving
          ? headingOf(ahead.x - at.x, ahead.y - at.y)
          : slot.side === "B"
            ? Math.PI
            : 0,
        pose: { kind: "neutral", weight: 0 },
      };
    });
    return { time: T, segment: segmentIndex, item, local, people, balls: [] };
  }

  const rep = timeline.reps[segment.rep ?? 0]!;
  const u = local;
  const balls: FrameBall[] = [];
  for (const ball of resolved.balls) {
    const flights = rep.contacts
      .filter((contact) => contact.ball === ball.id)
      .sort((a, b) => a.t0 - b.t0);
    const current = flights.find((flight) => u >= flight.t0 && u < flight.t1);
    if (current) {
      const at = sampleFlight(current.flight, u - current.t0);
      balls.push({
        id: ball.id,
        ...at,
        visible: true,
        alpha: 1,
        inFlight: true,
      });
      continue;
    }
    const first = flights[0];
    if (!first || u < first.t0) {
      const start = rep.balls[ball.id];
      if (start?.kind === "held") {
        const person = rep.occupancy[start.slot];
        const slot = slots.get(start.slot);
        const track = person ? rep.tracks[person] : undefined;
        const hand = track ? trackAt(track, u) : (slot ?? { x: 0, y: 0 });
        const side = slot?.side === "B" ? -1 : 1;
        balls.push({
          id: ball.id,
          x: hand.x + 0.25,
          y: hand.y + 0.2 * side,
          z: 1 + (slot?.onBox ?? 0),
          visible: true,
          alpha: 1,
          inFlight: false,
        });
      } else if (start?.kind === "supply") {
        balls.push({
          id: ball.id,
          x: start.x,
          y: start.y,
          z: 0.9,
          visible: false,
          alpha: 0,
          inFlight: false,
        });
      }
      continue;
    }
    const done = [...flights].reverse().find((flight) => u >= flight.t1)!;
    const later = flights.some((flight) => flight.t0 > u);
    if (later || rep.continuous) {
      balls.push({
        id: ball.id,
        x: done.to.x,
        y: done.to.y,
        z: done.to.z,
        visible: true,
        alpha: 1,
        inFlight: false,
      });
    } else {
      const fadeStart = Math.max(done.t1 + 0.6, rep.duration - 0.5);
      const alpha = u > fadeStart ? Math.max(0, 1 - (u - fadeStart) / 0.5) : 1;
      balls.push({
        id: ball.id,
        x: done.to.x,
        y: done.to.y,
        z: BALL_RADIUS,
        visible: alpha > 0.02,
        alpha,
        inFlight: false,
      });
    }
  }
  const flying = balls.find((ball) => ball.inFlight);
  const people = Object.entries(rep.tracks).map(
    ([person, track]): FramePerson => {
      const slot = slots.get(rep.personSlot[person]!)!;
      const at = trackAt(track, u);
      const before = trackAt(track, u - 0.08);
      const after = trackAt(track, u + 0.08);
      const vx = (after.x - before.x) / 0.16;
      const vy = (after.y - before.y) / 0.16;
      const contacts = [
        ...rep.contacts
          .filter((contact) => contact.person === person)
          .map((contact) => ({
            t: contact.t0,
            kind: POSE_OF[contact.verb] ?? ("neutral" as PoseKind),
          })),
        ...rep.blocks
          .filter((block) => block.person === person)
          .map((block) => ({ t: block.t0 + 0.1, kind: "block" as PoseKind })),
      ];
      const pose = slot.waiting
        ? { kind: "neutral" as const, weight: 0 }
        : poseAt(contacts, u);
      let facing: number;
      if (Math.hypot(vx, vy) > 0.6) facing = headingOf(vx, vy);
      else if (flying && !slot.waiting && dist(flying, at) > 0.5) {
        facing = headingOf(flying.x - at.x, flying.y - at.y);
      } else facing = slot.side === "B" ? Math.PI : 0;
      return {
        person,
        label: labelOf(person),
        slot: slot.id,
        side: slot.side,
        kind: slot.kind,
        waiting: slot.waiting,
        x: at.x,
        y: at.y,
        z: jumpAt(rep.jumps[person] ?? [], u),
        onBox: slot.onBox,
        facing,
        pose,
      };
    },
  );
  return {
    time: T,
    segment: segmentIndex,
    item,
    rep: rep.index,
    local,
    people,
    balls,
  };
}
