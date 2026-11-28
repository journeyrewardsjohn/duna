/**
 * The text alternative of a drill, generated from the scene: who stands
 * where, then what happens in each step in plain sentences ("Step 2 of 4:
 * P2 (left passer) passes to the net on side A, in the middle…"), then the
 * rotation. The same sentences are the drawing's accessible description, the
 * optional visible caption list and the player's announcements. Pure.
 */
import {
  TRAINING_SCENE_VERBS,
  type ResolvedSceneAction,
  type ResolvedSceneSlot,
  type ScenePoint,
} from "@duna/core/training-scene";
import { contactKind } from "./flight";
import { placePhrase, type SceneCourt } from "./geometry";
import type { PreparedScene } from "./prepare";

/** Slot id → person id. */
export type Occupancy = Readonly<Record<string, string>>;

export function initialOccupancy(scene: PreparedScene): Occupancy {
  const occupancy: Record<string, string> = {};
  for (const slot of scene.resolved.slots) {
    if (slot.occupant) occupancy[slot.id] = slot.occupant;
  }
  return occupancy;
}

function labelOf(scene: PreparedScene, person: string | undefined): string {
  if (!person) return "Someone";
  return (
    scene.resolved.people.find((entry) => entry.id === person)?.label ?? person
  );
}

/** "Left passer, then attacks" → "left passer, then attacks" (keeps "P1", "OH"). */
export function roleWords(role: string): string {
  const trimmed = role.trim().slice(0, 48);
  if (!trimmed) return "";
  return /^[A-Z][a-z]/.test(trimmed)
    ? trimmed[0]!.toLowerCase() + trimmed.slice(1)
    : trimmed;
}

/** The first clause of a role, for labels on the drawing ("Left passer"). */
export function shortRole(role: string): string {
  const first = role.split(/[,;(]/)[0]!.trim();
  return first.length > 18 ? `${first.slice(0, 17).trimEnd()}…` : first;
}

/** Fills `{slot}` placeholders with the people in those slots now. */
export function fillCaption(
  scene: PreparedScene,
  template: string,
  occupancy: Occupancy,
): string {
  return template.replace(/\{([^{}]{1,64})\}/g, (whole, slot: string) =>
    occupancy[slot] ? labelOf(scene, occupancy[slot]) : whole,
  );
}

const moveWords: Record<string, string> = {
  move: "moves",
  shuffle: "shuffles",
  transition: "moves",
  rotate: "rotates",
};

function slotById(
  scene: PreparedScene,
  id: string,
): ResolvedSceneSlot | undefined {
  return scene.resolved.slots.find((slot) => slot.id === id);
}

function heightWords(action: ResolvedSceneAction): string {
  if (action.group !== "contact" || action.apex === undefined) return "";
  const kind = contactKind(action.verb);
  if (kind === "driven") return action.crossesNet ? ", over the net" : "";
  const high = `, about ${action.apex.toFixed(1)} m high`;
  return action.crossesNet ? `${high}, over the net` : high;
}

function where(court: SceneCourt, point: ScenePoint | undefined): string {
  return point ? placePhrase(court, point) : "where they stand";
}

/** "to the deep left of side A", but "behind the end line…" stands alone. */
function towards(phrase: string): string {
  return /^(behind|outside)\b/.test(phrase) ? phrase : `to ${phrase}`;
}

/** "at the net…", "in zone 5…", "behind the end line…". */
function at(phrase: string): string {
  if (/^(behind|outside)\b/.test(phrase)) return phrase;
  return /^zone\b/.test(phrase) ? `in ${phrase}` : `at ${phrase}`;
}

/** One sentence per action, in the step's order. */
export function actionSentences(
  scene: PreparedScene,
  stepIndex: number,
  occupancy: Occupancy,
): string[] {
  const step = scene.resolved.steps[stepIndex];
  if (!step) return [];
  const court = scene.resolved.court;
  const named = new Set<string>();
  const who = (slotId: string): string => {
    const person = occupancy[slotId];
    const label = labelOf(scene, person);
    if (named.has(slotId)) return label;
    named.add(slotId);
    const role = roleWords(slotById(scene, slotId)?.role ?? "");
    return role ? `${label} (${role})` : label;
  };
  return step.actions.map((action) => {
    const spec = Object.hasOwn(TRAINING_SCENE_VERBS, action.verb)
      ? TRAINING_SCENE_VERBS[action.verb]
      : undefined;
    const subject = who(action.actor);
    if (action.group === "contact") {
      const read = spec?.read ?? action.verb;
      const targetSlot = scene.targetSlots[action.id];
      const target =
        targetSlot && occupancy[targetSlot]
          ? `to ${who(targetSlot)}`
          : towards(where(court, action.to));
      const from =
        action.verb === "serve" || action.verb === "jumpserve"
          ? ` from ${where(court, action.from)},`
          : "";
      const verbPhrase = action.verb === "freeball" ? read : `${read} the ball`;
      return `${subject} ${verbPhrase}${from} ${target}${heightWords(action)}.`;
    }
    if (action.verb === "block") return `${subject} jumps to block at the net.`;
    if (action.verb === "hold") return `${subject} holds their position.`;
    const verb = moveWords[action.verb] ?? "moves";
    return `${subject} ${verb} ${towards(where(court, action.to))}.`;
  });
}

export function stepSentence(
  scene: PreparedScene,
  stepIndex: number,
  occupancy: Occupancy,
): string {
  const count = scene.resolved.steps.length;
  const body = actionSentences(scene, stepIndex, occupancy).join(" ");
  return `Step ${stepIndex + 1} of ${count}: ${body || "a pause."}`;
}

/** Who starts where, and who holds a ball. */
export function startSentence(
  scene: PreparedScene,
  occupancy: Occupancy,
): string {
  const court = scene.resolved.court;
  const holders = new Map<string, number>();
  for (const ball of scene.resolved.balls) {
    if (ball.start.slot)
      holders.set(ball.start.slot, (holders.get(ball.start.slot) ?? 0) + 1);
  }
  const parts = scene.resolved.slots
    .filter((slot) => occupancy[slot.id])
    .map((slot) => {
      const label = labelOf(scene, occupancy[slot.id]);
      const role = roleWords(slot.role);
      const notes = [
        role,
        slot.kind === "coach" && !/coach|feeder/i.test(role) ? "coach" : "",
        slot.waiting ? "waiting" : "",
      ].filter(Boolean);
      const ball = holders.has(slot.id) ? ", holding a ball" : "";
      const box = slot.onBox > 0 ? `, on a ${slot.onBox.toFixed(1)} m box` : "";
      const who = notes.length ? `${label} (${notes.join(", ")})` : label;
      return `${who} starts ${at(placePhrase(court, slot))}${box}${ball}`;
    });
  return parts.length ? `To start: ${parts.join("; ")}.` : "";
}

export function courtSentence(scene: PreparedScene): string {
  const court = scene.resolved.court;
  const net = `net ${court.netHeight.toFixed(2)} m`;
  if (court.noCourt) return "Open space, no court lines.";
  const surface = court.surface === "sand" ? "Beach" : "Indoor";
  const half = court.half ? " half court (side A in use)" : " court";
  return `${surface}${half}, ${court.length} × ${court.width} m, ${net}.`;
}

export interface RotationPlan {
  readonly name: string;
  readonly caption?: string;
  readonly every: number;
  readonly kind: string;
  readonly next: Occupancy;
}

/** The rotation the player shows (winner-stays shows its chosen outcome). */
export function rotationPlan(
  scene: PreparedScene,
  occupancy: Occupancy,
): RotationPlan | undefined {
  const rotation = scene.resolved.rotation;
  if (!rotation || rotation.maps.length === 0) return undefined;
  const chosen =
    rotation.maps.find((map) => map.name === rotation.shown) ??
    rotation.maps[0]!;
  const next: Record<string, string> = {};
  let valid = true;
  for (const [slot, person] of Object.entries(occupancy)) {
    const to = chosen.map[slot] ?? slot;
    if (next[to] || !slotById(scene, to)) valid = false;
    next[to] = person;
  }
  const caption = chosen.caption ?? rotation.caption;
  return {
    name: chosen.name,
    ...(caption ? { caption } : {}),
    every: rotation.every,
    kind: rotation.kind,
    next: valid ? next : { ...occupancy },
  };
}

export function rotationSentence(
  scene: PreparedScene,
  occupancy: Occupancy,
  plan: RotationPlan,
): string {
  const moves: string[] = [];
  for (const [slot, person] of Object.entries(occupancy)) {
    const to = Object.keys(plan.next).find((key) => plan.next[key] === person);
    if (!to || to === slot) continue;
    const fromRole = roleWords(shortRole(slotById(scene, slot)?.role ?? slot));
    const target = slotById(scene, to);
    const toRole = roleWords(shortRole(target?.role ?? to));
    const label = labelOf(scene, person);
    moves.push(
      fromRole === toRole && target
        ? `${label} moves ${towards(placePhrase(scene.resolved.court, target))}`
        : `${label} goes from ${fromRole} to ${toRole}`,
    );
  }
  const when =
    plan.kind === "winner-stays"
      ? "After the rally"
      : plan.every > 1
        ? `After every ${plan.every} reps`
        : "After each rep";
  const body = moves.length ? `${moves.join("; ")}.` : "nobody moves.";
  return `Rotation. ${when}: ${body} The same steps then repeat with the new people.`;
}

/**
 * The whole drawing in words: the paragraph list a screen reader reads, and
 * the drawing's visible caption list.
 */
export function sceneDescription(scene: PreparedScene): string[] {
  const occupancy = initialOccupancy(scene);
  const lines = [`${scene.resolved.title}. ${courtSentence(scene)}`];
  if (scene.objective) lines.push(`Objective: ${scene.objective}`);
  const start = startSentence(scene, occupancy);
  if (start) lines.push(start);
  scene.resolved.steps.forEach((_, index) =>
    lines.push(stepSentence(scene, index, occupancy)),
  );
  const plan = rotationPlan(scene, occupancy);
  if (plan) lines.push(rotationSentence(scene, occupancy, plan));
  return lines;
}
