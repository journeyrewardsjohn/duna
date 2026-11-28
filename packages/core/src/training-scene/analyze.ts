/**
 * Static analysis of a drill scene v2 document: resolves every named place to
 * metres, walks one rep's ball chain in step order and checks every rule that
 * does not need the timing resolver.
 *
 * Ported from the Drill Studio prototype (`validator.js`, `resolve.js`).
 * Implemented here: SCHEMA, SIZE / DEPTH / LIMIT caps, REF_* (spot, area,
 * person, actor, ball, slot, supply, target, verb), BALL_NOWHERE, CONTINUITY
 * (an explicit start point more than 1.1 m from where the ball is), BOUNDS,
 * NET (clearance of each flight, arcs raised automatically as info), ANTENNA,
 * SERVE_ZONE, THREE_TOUCHES, OWN_SIDE, SPACING, ROTATION, TEACHING and
 * NET_PRESET.
 *
 * Needs the resolver (B6a follow-up, with the 2D/3D player): TELEPORT and
 * SPEED (player tracks over time), BALL_HELD / BALL_DEAD / BALL_DROPS (ball
 * arrival times), SUPPLY_FAR, and checks over later reps after a rotation.
 *
 * Never throws, never evaluates anything from the document: the input is
 * treated as untrusted JSON.
 */
import {
  BALL_RADIUS,
  CONTACT_VERBS,
  COURTS,
  type CourtSpec,
  courtOf,
  isCourtType,
  isNetPreset,
  LIMITS,
  MOVE_VERBS,
  netHeightOf,
  TRAINING_SCENE_MAX_ACTIONS_PER_STEP,
  TRAINING_SCENE_MAX_BYTES,
  TRAINING_SCENE_MAX_DEPTH,
  TRAINING_SCENE_MAX_PEOPLE,
  TRAINING_SCENE_MAX_SLOTS,
  TRAINING_SCENE_MAX_STEPS,
  TRAINING_SCENE_MAX_THINGS,
  TRAINING_SCENE_SCHEMA_ID,
  VERBS,
} from "./model";
import {
  inPlayArea,
  resolvePlace,
  type ResolvedPlace,
  separate,
  toWorld,
} from "./layout";
import { clearanceNeeded, planVerbFlight } from "./physics";

export type TrainingSceneIssueLevel = "error" | "warning" | "info";

export interface TrainingSceneIssue {
  level: TrainingSceneIssueLevel;
  code: string;
  /** Kebab-case of the code ("REF_SPOT" → "ref-spot"). */
  rule: string;
  message: string;
  ref?: string;
  repair?: string;
}

export interface TrainingSceneValidation {
  ok: boolean;
  errors: number;
  warnings: number;
  issues: TrainingSceneIssue[];
}

export interface ScenePoint {
  readonly x: number;
  readonly y: number;
}

export interface ResolvedSceneSlot extends ScenePoint {
  readonly id: string;
  readonly side: "A" | "B" | "neutral";
  readonly kind: string;
  readonly role: string;
  readonly occupant?: string;
  readonly label: string;
  readonly waiting: boolean;
  readonly pinned: boolean;
  readonly onBox: number;
}

export interface ResolvedSceneThing extends ScenePoint {
  readonly id: string;
  readonly kind: string;
  readonly side: string;
  readonly label?: string;
  readonly rect?: {
    readonly x0: number;
    readonly x1: number;
    readonly y0: number;
    readonly y1: number;
  };
}

export interface ResolvedSceneAction {
  readonly id: string;
  readonly actor: string;
  readonly person?: string;
  readonly verb: string;
  readonly group: "contact" | "player";
  readonly ball?: string;
  readonly from?: ScenePoint;
  readonly to?: ScenePoint;
  readonly delay?: number;
  /** For contacts: peak height (m) and whether it crosses the net. */
  readonly apex?: number;
  readonly crossesNet?: boolean;
  readonly jump: boolean;
}

export interface ResolvedSceneStep {
  readonly id: string;
  readonly caption: string;
  readonly actions: readonly ResolvedSceneAction[];
}

export interface ResolvedTrainingScene {
  readonly schema: typeof TRAINING_SCENE_SCHEMA_ID;
  readonly title: string;
  readonly court: {
    readonly type: string;
    readonly length: number;
    readonly width: number;
    readonly freeZone: number;
    readonly netHeight: number;
    readonly netLength: number;
    readonly surface: "sand" | "hard";
    readonly half: boolean;
    readonly noCourt: boolean;
  };
  readonly people: readonly { readonly id: string; readonly label: string }[];
  readonly slots: readonly ResolvedSceneSlot[];
  readonly equipment: readonly ResolvedSceneThing[];
  readonly supply: readonly ResolvedSceneThing[];
  readonly zones: readonly ResolvedSceneThing[];
  readonly balls: readonly {
    readonly id: string;
    readonly start: { readonly slot?: string; readonly supply?: string };
  }[];
  readonly steps: readonly ResolvedSceneStep[];
  readonly rotation?: {
    readonly kind: string;
    readonly every: number;
    readonly caption?: string;
    /** For winner-stays: the outcome shown. */
    readonly shown?: string;
    readonly maps: readonly {
      readonly name: string;
      readonly caption?: string;
      readonly map: Readonly<Record<string, string>>;
    }[];
  };
  readonly restSeconds?: number;
}

export interface SceneAnalysis {
  readonly validation: TrainingSceneValidation;
  readonly resolved?: ResolvedTrainingScene;
}

type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function records(value: unknown): Rec[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function ruleOf(code: string): string {
  return code.toLowerCase().replaceAll("_", "-");
}

/** Short, never the raw document: messages may be shown and stored. */
function quote(value: unknown): string {
  const text =
    typeof value === "string" ? value : (JSON.stringify(value) ?? "");
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

/** Walks the value iteratively (no recursion limit to blow) to bound depth. */
function exceedsDepth(root: unknown, maxDepth: number): boolean {
  const stack: { value: unknown; depth: number }[] = [
    { value: root, depth: 1 },
  ];
  let visited = 0;
  while (stack.length > 0) {
    const { value, depth } = stack.pop()!;
    if (typeof value !== "object" || value === null) continue;
    if (depth > maxDepth) return true;
    visited++;
    if (visited > 50_000) return true;
    const children = Array.isArray(value) ? value : Object.values(value);
    for (const child of children)
      stack.push({ value: child, depth: depth + 1 });
  }
  return false;
}

function measureBytes(value: unknown): number | undefined {
  try {
    const text = JSON.stringify(value);
    if (text === undefined) return undefined;
    return new TextEncoder().encode(text).length;
  } catch {
    // Cycles or BigInt: not JSON, so not a scene.
    return undefined;
  }
}

class IssueList {
  readonly items: TrainingSceneIssue[] = [];
  readonly #seen = new Set<string>();

  add(
    level: TrainingSceneIssueLevel,
    code: string,
    message: string,
    ref?: string,
    repair?: string,
  ): void {
    const key = `${code}|${ref ?? ""}|${level}|${message.replace(/[-\d.]+/g, "#")}`;
    if (this.#seen.has(key)) return;
    this.#seen.add(key);
    this.items.push({
      level,
      code,
      rule: ruleOf(code),
      // Bounded: messages quote names from the document and are stored.
      message: message.length > 300 ? `${message.slice(0, 297)}...` : message,
      ...(ref === undefined ? {} : { ref }),
      ...(repair === undefined ? {} : { repair: repair.slice(0, 300) }),
    });
  }

  hasError(predicate?: (issue: TrainingSceneIssue) => boolean): boolean {
    return this.items.some(
      (issue) => issue.level === "error" && (!predicate || predicate(issue)),
    );
  }

  finish(): TrainingSceneValidation {
    const order = { error: 0, warning: 1, info: 2 } as const;
    // Stable sort keeps document order inside one level.
    const issues = this.items
      .map((issue, index) => ({ issue, index }))
      .sort(
        (a, b) =>
          order[a.issue.level] - order[b.issue.level] || a.index - b.index,
      )
      .map(({ issue }) => issue);
    const errors = issues.filter((issue) => issue.level === "error").length;
    const warnings = issues.filter((issue) => issue.level === "warning").length;
    return { ok: errors === 0, errors, warnings, issues };
  }
}

function checkShape(doc: Rec, issues: IssueList): void {
  if (doc.schema !== TRAINING_SCENE_SCHEMA_ID) {
    issues.add(
      "error",
      "SCHEMA",
      `Schema must be "${TRAINING_SCENE_SCHEMA_ID}".`,
      "schema",
    );
  }
  if (!str(doc.title)?.trim()) {
    issues.add("error", "SCHEMA", "Drill has no title.", "title");
  }
  const court = doc.court;
  if (!isRecord(court) || !isCourtType(court.type)) {
    issues.add(
      "error",
      "SCHEMA",
      `Unknown court type "${quote(isRecord(court) ? court.type : court)}".`,
      "court",
      `Use one of: ${Object.keys(COURTS).join(", ")}.`,
    );
  }
  const lists: [string, unknown, number][] = [
    ["people", doc.people, TRAINING_SCENE_MAX_PEOPLE],
    ["slots", doc.slots, TRAINING_SCENE_MAX_SLOTS],
    ["balls", doc.balls, TRAINING_SCENE_MAX_THINGS],
    ["equipment", doc.equipment, TRAINING_SCENE_MAX_THINGS],
    ["supply", doc.supply, TRAINING_SCENE_MAX_THINGS],
    ["zones", doc.zones, TRAINING_SCENE_MAX_THINGS],
  ];
  for (const [name, value, max] of lists) {
    if (value === undefined) continue;
    if (!Array.isArray(value)) {
      issues.add("error", "SCHEMA", `"${name}" must be a list.`, name);
      continue;
    }
    if (value.length > max) {
      issues.add(
        "error",
        "LIMIT",
        `"${name}" has ${value.length} entries; the most is ${max}.`,
        name,
      );
    }
    const ids = new Set<string>();
    value.forEach((entry, index) => {
      const id = isRecord(entry) ? str(entry.id) : undefined;
      if (!id || id.length > 64) {
        issues.add(
          "error",
          "SCHEMA",
          `${name}[${index}] needs a short text id.`,
          name,
        );
        return;
      }
      if (ids.has(id)) {
        issues.add(
          "error",
          "SCHEMA",
          `${name} uses the id "${quote(id)}" twice.`,
          id,
        );
      }
      ids.add(id);
    });
  }
  if (!Array.isArray(doc.people) || doc.people.length === 0) {
    issues.add("error", "SCHEMA", "Drill has no people.", "people");
  }
  if (!Array.isArray(doc.slots) || doc.slots.length === 0) {
    issues.add("error", "SCHEMA", "Drill has no slots.", "slots");
  }
  const rep = doc.rep;
  const steps = isRecord(rep) ? rep.steps : undefined;
  if (!Array.isArray(steps) || steps.length === 0) {
    issues.add("error", "SCHEMA", "Drill has no steps.", "rep");
  } else {
    if (steps.length > TRAINING_SCENE_MAX_STEPS) {
      issues.add(
        "error",
        "LIMIT",
        `The rep has ${steps.length} steps; the most is ${TRAINING_SCENE_MAX_STEPS}.`,
        "rep",
      );
    }
    const stepIds = new Set<string>();
    steps.forEach((step, index) => {
      const id = isRecord(step) ? str(step.id) : undefined;
      if (!id || id.length > 64) {
        issues.add(
          "error",
          "SCHEMA",
          `Step ${index + 1} needs a short text id.`,
          "rep",
        );
        return;
      }
      if (stepIds.has(id)) {
        issues.add(
          "error",
          "SCHEMA",
          `Two steps use the id "${quote(id)}".`,
          id,
        );
      }
      stepIds.add(id);
      const actions = (step as Rec).actions;
      if (!Array.isArray(actions)) {
        issues.add(
          "error",
          "SCHEMA",
          `Step "${quote(id)}" needs a list of actions.`,
          id,
        );
      } else if (actions.length > TRAINING_SCENE_MAX_ACTIONS_PER_STEP) {
        issues.add(
          "error",
          "LIMIT",
          `Step "${quote(id)}" has ${actions.length} actions; the most is ${TRAINING_SCENE_MAX_ACTIONS_PER_STEP}.`,
          id,
        );
      } else if (actions.some((action) => !isRecord(action))) {
        issues.add(
          "error",
          "SCHEMA",
          `Every action in step "${quote(id)}" must be an object.`,
          id,
        );
      }
    });
  }
  const teaching = doc.teaching;
  if (!isRecord(teaching) || !str(teaching.objective)?.trim()) {
    issues.add(
      "error",
      "SCHEMA",
      "Drill has no objective.",
      "teaching",
      "Say in one sentence what the drill trains.",
    );
  }
  if (isRecord(court)) {
    if (num(court.netHeight) === undefined && !isNetPreset(court.net)) {
      issues.add(
        "warning",
        "NET_PRESET",
        `Net preset "${quote(court.net)}" is not known; using the women's height.`,
        "court",
      );
    }
    const height = num(court.netHeight);
    if (height !== undefined && (height < 2 || height > 2.5)) {
      issues.add(
        "warning",
        "NET_PRESET",
        `Net height ${height} m is outside 2.0–2.5 m.`,
        "court",
      );
    }
  }
}

function sideOf(value: unknown): "A" | "B" | "neutral" {
  return value === "A" || value === "B" ? value : "neutral";
}

/** Resolve the document; adds every static issue to `issues`. */
export function analyzeTrainingScene(document: unknown): SceneAnalysis {
  const issues = new IssueList();
  try {
    return analyzeInner(document, issues);
  } catch {
    // Defensive: the rules are written not to throw, but a malformed
    // document must never take a request down.
    issues.add("error", "SCHEMA", "The scene could not be read.", "scene");
    return { validation: issues.finish() };
  }
}

function analyzeInner(document: unknown, issues: IssueList): SceneAnalysis {
  if (!isRecord(document)) {
    issues.add("error", "SCHEMA", "A scene must be an object.", "scene");
    return { validation: issues.finish() };
  }
  const bytes = measureBytes(document);
  if (bytes === undefined) {
    issues.add("error", "SCHEMA", "A scene must be plain JSON.", "scene");
    return { validation: issues.finish() };
  }
  if (bytes > TRAINING_SCENE_MAX_BYTES) {
    issues.add(
      "error",
      "SIZE",
      `The scene is ${bytes} bytes; the most is ${TRAINING_SCENE_MAX_BYTES}.`,
      "scene",
      "Remove unused people, steps or notes.",
    );
    return { validation: issues.finish() };
  }
  if (exceedsDepth(document, TRAINING_SCENE_MAX_DEPTH)) {
    issues.add(
      "error",
      "DEPTH",
      `The scene nests deeper than ${TRAINING_SCENE_MAX_DEPTH} levels.`,
      "scene",
    );
    return { validation: issues.finish() };
  }
  const doc = document;
  checkShape(doc, issues);
  if (issues.hasError()) return { validation: issues.finish() };

  const courtDoc = doc.court as Rec;
  const court = courtOf(courtDoc);
  const netHeight = netHeightOf(courtDoc);

  // ---- people and slots ----
  const people = new Map<string, { id: string; label: string }>();
  for (const person of records(doc.people)) {
    const id = str(person.id)!;
    people.set(id, { id, label: str(person.label)?.slice(0, 24) || id });
  }
  const slotDocs = records(doc.slots);
  const entries = slotDocs.map((slot) => {
    const ref = isRecord(slot.pos) ? slot.pos : slot.spot;
    const place = resolvePlace(ref, slot.side, court);
    const id = str(slot.id)!;
    if (place.error) {
      issues.add(
        "error",
        place.kind === "area" ? "REF_AREA" : "REF_SPOT",
        `Slot "${id}": ${place.error}.`,
        id,
        "Use a spot from the vocabulary, or pin the slot in metres.",
      );
    }
    return { id, x: place.x, y: place.y, pinned: isRecord(slot.pos) };
  });
  separate(entries, LIMITS.minSpacing + 0.2);
  const slots = new Map<string, ResolvedSceneSlot>();
  slotDocs.forEach((slot, index) => {
    const entry = entries[index]!;
    const occupant = str(slot.occupant);
    if (occupant !== undefined && !people.has(occupant)) {
      issues.add(
        "error",
        "REF_PERSON",
        `Slot "${entry.id}" is filled by "${quote(occupant)}", who is not in the people list.`,
        entry.id,
      );
    }
    slots.set(entry.id, {
      id: entry.id,
      side: sideOf(slot.side),
      kind: str(slot.kind) ?? "player",
      role: str(slot.role)?.slice(0, 80) ?? entry.id,
      ...(occupant === undefined ? {} : { occupant }),
      label: (occupant && people.get(occupant)?.label) || entry.id,
      waiting: slot.waiting === true,
      pinned: entry.pinned,
      onBox: Math.min(Math.max(num(slot.onBox) ?? 0, 0), 1.5),
      x: entry.x,
      y: entry.y,
    });
  });

  // ---- static things ----
  const placeOf = (thing: Rec, collection: string): ResolvedSceneThing => {
    const ref = isRecord(thing.pos)
      ? thing.pos
      : typeof thing.area === "string"
        ? { area: thing.area, side: thing.side }
        : typeof thing.spot === "string"
          ? { spot: thing.spot, side: thing.side }
          : thing.spot;
    const place: ResolvedPlace = resolvePlace(ref, thing.side, court);
    const id = str(thing.id)!;
    if (place.error) {
      issues.add(
        "error",
        place.kind === "area" ? "REF_AREA" : "REF_SPOT",
        `${collection} "${id}": ${place.error}.`,
        id,
      );
    } else if (!inPlayArea(place, court)) {
      issues.add(
        "error",
        "BOUNDS",
        `"${id}" is outside the court and free zone.`,
        id,
        `Keep it inside the free zone (${court.freeZone} m around the court).`,
      );
    }
    return {
      id,
      kind: str(thing.kind) ?? collection,
      side: str(thing.side) ?? "neutral",
      ...(str(thing.label) ? { label: str(thing.label)!.slice(0, 40) } : {}),
      x: place.x,
      y: place.y,
      ...(place.rect
        ? {
            rect: {
              x0: place.rect.x0,
              x1: place.rect.x1,
              y0: place.rect.y0,
              y1: place.rect.y1,
            },
          }
        : {}),
    };
  };
  const equipment = records(doc.equipment).map((thing) =>
    placeOf(thing, "Equipment"),
  );
  const supply = records(doc.supply).map((thing) => placeOf(thing, "Supply"));
  const zones = records(doc.zones).map((thing) => placeOf(thing, "Zone"));

  // ---- spacing and bounds at the start ----
  const slotList = [...slots.values()];
  for (let i = 0; i < slotList.length; i++) {
    for (let j = i + 1; j < slotList.length; j++) {
      const a = slotList[i]!;
      const b = slotList[j]!;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < LIMITS.minSpacing) {
        issues.add(
          "warning",
          "SPACING",
          `Slots "${a.id}" and "${b.id}" start ${d.toFixed(2)} m apart.`,
          a.id,
        );
      }
    }
  }
  for (const slot of slotList) {
    if (!inPlayArea(slot, court)) {
      issues.add(
        "error",
        "BOUNDS",
        `Slot "${slot.id}" is outside the court and free zone.`,
        slot.id,
        `Keep it inside the free zone (${court.freeZone} m around the court).`,
      );
    }
  }

  // ---- balls ----
  const ballState = new Map<string, ScenePoint>();
  const balls: { id: string; start: { slot?: string; supply?: string } }[] = [];
  for (const ball of records(doc.balls)) {
    const id = str(ball.id)!;
    const start = isRecord(ball.start) ? ball.start : {};
    const slotId = str(start.slot);
    const supplyId = str(start.supply);
    if (slotId !== undefined) {
      const slot = slots.get(slotId);
      if (!slot) {
        issues.add(
          "error",
          "REF_SLOT",
          `Ball "${id}" starts with slot "${quote(slotId)}", which does not exist.`,
          id,
        );
      } else {
        ballState.set(id, { x: slot.x, y: slot.y });
      }
      balls.push({ id, start: { slot: slotId } });
    } else if (supplyId !== undefined) {
      const source = supply.find((thing) => thing.id === supplyId);
      if (!source) {
        issues.add(
          "error",
          "REF_SUPPLY",
          `Ball "${id}" starts in supply "${quote(supplyId)}", which does not exist.`,
          id,
        );
      } else {
        ballState.set(id, { x: source.x, y: source.y });
      }
      balls.push({ id, start: { supply: supplyId } });
    } else {
      issues.add(
        "error",
        "BALL_NOWHERE",
        `Ball "${id}" has no start: give it a slot that holds it or a supply.`,
        id,
      );
      balls.push({ id, start: {} });
    }
  }

  // ---- steps: one rep, in order ----
  const rep = doc.rep as Rec;
  const stepDocs = records(rep.steps);
  const flat: { stepIndex: number; actionIndex: number; action: Rec }[] = [];
  stepDocs.forEach((step, stepIndex) =>
    records(step.actions).forEach((action, actionIndex) =>
      flat.push({ stepIndex, actionIndex, action }),
    ),
  );
  const nextContactOn = (ball: string, position: number): Rec | undefined =>
    flat
      .slice(position + 1)
      .find(
        (entry) =>
          entry.action.ball === ball &&
          CONTACT_VERBS.includes(str(entry.action.verb) ?? ""),
      )?.action;

  const resolveTarget = (
    to: unknown,
    slot: ResolvedSceneSlot,
  ): ResolvedPlace => {
    if (!isRecord(to) && typeof to !== "string") {
      return {
        x: slot.x,
        y: slot.y,
        kind: "missing",
        error: "no target given (use slot, spot, area or metres)",
      };
    }
    if (isRecord(to) && typeof to.slot === "string") {
      const target = slots.get(to.slot);
      if (!target) {
        return {
          x: 0,
          y: 0,
          kind: "missing",
          error: `target slot "${quote(to.slot)}" does not exist`,
        };
      }
      const side = target.side === "B" ? "B" : "A";
      const shift = toWorld(side, num(to.right) ?? 0, num(to.back) ?? 0);
      return { x: target.x + shift.x, y: target.y + shift.y, kind: "spot" };
    }
    const side =
      isRecord(to) && typeof to.side === "string"
        ? to.side
        : slot.side === "neutral"
          ? "A"
          : slot.side;
    return resolvePlace(to, side, court);
  };

  const need = clearanceNeeded(netHeight);
  const contacts: {
    id: string;
    actor: string;
    person?: string;
    verb: string;
    ball: string;
    from: ScenePoint;
    crosses: boolean;
  }[] = [];
  const resolvedSteps: ResolvedSceneStep[] = [];
  let position = -1;
  for (const step of stepDocs) {
    const stepId = str(step.id)!;
    const actions: ResolvedSceneAction[] = [];
    records(step.actions).forEach((action, actionIndex) => {
      position++;
      const id = `${stepId}.${actionIndex + 1}`;
      const verb = str(action.verb) ?? "";
      const spec = Object.hasOwn(VERBS, verb) ? VERBS[verb] : undefined;
      if (!spec) {
        issues.add(
          "error",
          "REF_VERB",
          `Action ${id}: unknown verb "${quote(action.verb)}".`,
          id,
          `Use one of: ${Object.keys(VERBS).join(", ")}.`,
        );
        return;
      }
      const actorId = str(action.actor) ?? "";
      const slot = slots.get(actorId);
      if (!slot) {
        issues.add(
          "error",
          "REF_ACTOR",
          `Action ${id}: actor "${quote(action.actor)}" is not a slot in this drill.`,
          id,
        );
        return;
      }
      if (!slot.occupant || !people.has(slot.occupant)) {
        issues.add(
          "error",
          "REF_ACTOR",
          `Action ${id}: nobody fills slot "${actorId}".`,
          id,
        );
        return;
      }
      const delay = num(action.delay);
      const jump = spec.jump === true || action.jump === true;
      if (spec.group === "contact") {
        const ballId = str(action.ball);
        const ballAt = ballId === undefined ? undefined : ballState.get(ballId);
        if (ballId === undefined || !balls.some((ball) => ball.id === ballId)) {
          issues.add(
            "error",
            "REF_BALL",
            `Action ${id}: "${verb}" needs a ball that exists (got "${quote(action.ball ?? "none")}").`,
            id,
          );
          return;
        }
        if (!ballAt) return; // Its start is already reported.
        let from: ScenePoint = ballAt;
        if (action.from !== undefined) {
          const explicit = resolvePlace(action.from, slot.side, court);
          if (explicit.error) {
            issues.add(
              "error",
              "REF_SPOT",
              `Action ${id}: ${explicit.error}.`,
              id,
            );
          } else {
            const gap = Math.hypot(
              explicit.x - ballAt.x,
              explicit.y - ballAt.y,
            );
            if (gap > LIMITS.reach) {
              issues.add(
                "error",
                "CONTINUITY",
                `Action ${id}: the ${verb} starts at (${explicit.x.toFixed(1)}, ${explicit.y.toFixed(1)}) but ball "${ballId}" is at (${ballAt.x.toFixed(1)}, ${ballAt.y.toFixed(1)}), ${gap.toFixed(1)} m away.`,
                id,
                "Start the contact where the previous one sent the ball, or remove the explicit start.",
              );
            }
            from = { x: explicit.x, y: explicit.y };
          }
        }
        const target = resolveTarget(action.to, slot);
        if (target.error) {
          issues.add(
            "error",
            target.kind === "area" ? "REF_AREA" : "REF_TARGET",
            `Action ${id}: ${target.error}.`,
            id,
          );
          return;
        }
        const next = nextContactOn(ballId, position);
        const nextSpec = next ? VERBS[str(next.verb) ?? ""] : undefined;
        const nextSlot = next ? slots.get(str(next.actor) ?? "") : undefined;
        const z1 = next
          ? (nextSpec?.contactZ ?? 1) + (nextSlot?.onBox ?? 0)
          : BALL_RADIUS;
        const z0 = (spec.contactZ ?? 1) + slot.onBox;
        const arc = isRecord(action.arc)
          ? {
              ...(num(action.arc.apex) === undefined
                ? {}
                : { apex: num(action.arc.apex)! }),
              ...(num(action.arc.speed) === undefined
                ? {}
                : { speed: num(action.arc.speed)! }),
            }
          : undefined;
        const flight = planVerbFlight(
          { x: from.x, y: from.y, z: z0 },
          { x: target.x, y: target.y, z: z1 },
          verb,
          netHeight,
          arc && (arc.apex !== undefined || arc.speed !== undefined)
            ? arc
            : undefined,
        );
        if (!inPlayArea(target, court)) {
          issues.add(
            "error",
            "BOUNDS",
            `Action ${id}: the ${verb} lands outside the play area.`,
            id,
            "Aim the ball at a spot or area on the court.",
          );
        }
        if (flight.crossing) {
          if (flight.crossing.z < need) {
            issues.add(
              "error",
              "NET",
              `Action ${id}: the ${verb} crosses the net at ${flight.crossing.z.toFixed(2)} m; it needs ${need.toFixed(2)} m (net ${netHeight.toFixed(2)} m).`,
              id,
              flight.override
                ? `Remove the arc override on ${id}, or raise its apex / lower its speed.`
                : "Contact higher or aim deeper.",
            );
          }
          if (Math.abs(flight.crossing.x) > court.width / 2 + 0.02) {
            issues.add(
              "error",
              "ANTENNA",
              `Action ${id}: the ${verb} crosses the net outside the antenna (x = ${flight.crossing.x.toFixed(1)} m).`,
              id,
              "Aim so the ball crosses between the sidelines.",
            );
          }
        }
        if (flight.adjusted) {
          issues.add(
            "info",
            "NET",
            `Action ${id}: arc raised automatically to clear the net.`,
            id,
          );
        }
        if (verb === "serve" || verb === "jumpserve") {
          const behind = Math.abs(from.y) >= court.length / 2 - 0.05;
          if (!behind) {
            issues.add(
              "warning",
              "SERVE_ZONE",
              `Action ${id}: the serve starts inside the court.`,
              id,
              "Put the server on a server-* spot.",
            );
          }
          if (!flight.crossing) {
            issues.add(
              "error",
              "SERVE_ZONE",
              `Action ${id}: the serve does not cross the net.`,
              id,
              "Aim the serve at the other side.",
            );
          }
        } else if (slot.kind !== "coach" && slot.side !== "neutral") {
          const own = slot.side === "A" ? from.y <= 0.5 : from.y >= -0.5;
          if (!own) {
            issues.add(
              "warning",
              "OWN_SIDE",
              `Action ${id}: ${actorId} plays the ball on the other side of the net.`,
              id,
            );
          }
        }
        ballState.set(ballId, { x: target.x, y: target.y });
        contacts.push({
          id,
          actor: actorId,
          ...(slot.occupant ? { person: slot.occupant } : {}),
          verb,
          ball: ballId,
          from,
          crosses: Boolean(flight.crossing),
        });
        actions.push({
          id,
          actor: actorId,
          ...(slot.occupant ? { person: slot.occupant } : {}),
          verb,
          group: "contact",
          ball: ballId,
          from,
          to: { x: target.x, y: target.y },
          ...(delay === undefined ? {} : { delay }),
          apex: flight.apex,
          crossesNet: Boolean(flight.crossing),
          jump,
        });
        return;
      }
      // Player verbs: move verbs need a target; block and hold may stay put.
      let to: ScenePoint | undefined;
      if (MOVE_VERBS.includes(verb) || action.to !== undefined) {
        const target = resolveTarget(action.to, slot);
        if (target.error) {
          issues.add(
            "error",
            target.kind === "area" ? "REF_AREA" : "REF_TARGET",
            `Action ${id}: ${target.error}.`,
            id,
          );
          return;
        }
        if (!inPlayArea(target, court)) {
          issues.add(
            "error",
            "BOUNDS",
            `${slot.label} leaves the court and free zone (action ${id}).`,
            id,
            `Keep ${slot.label} inside the free zone (${court.freeZone} m around the court).`,
          );
        }
        to = { x: target.x, y: target.y };
      }
      actions.push({
        id,
        actor: actorId,
        ...(slot.occupant ? { person: slot.occupant } : {}),
        verb,
        group: "player",
        ...(to ? { to } : {}),
        ...(delay === undefined ? {} : { delay }),
        jump,
      });
    });
    resolvedSteps.push({
      id: stepId,
      caption: captionOf(str(step.caption) ?? "", slots),
      actions,
    });
  }

  // ---- three touches per side, no double contact ----
  const rules = isRecord(doc.rules) ? doc.rules : {};
  if (rules.threeTouches !== false) {
    const byBall = new Map<string, typeof contacts>();
    for (const contact of contacts) {
      const list = byBall.get(contact.ball) ?? [];
      list.push(contact);
      byBall.set(contact.ball, list);
    }
    for (const list of byBall.values()) {
      let count = 0;
      let sideNow: string | null = null;
      let previous: (typeof contacts)[number] | undefined;
      for (const contact of list) {
        const side = contact.from.y < 0 ? "A" : "B";
        const coachFeed = slots.get(contact.actor)?.kind === "coach";
        if (side !== sideNow || coachFeed) {
          count = 0;
          sideNow = side;
        }
        if (!coachFeed) count++;
        if (count > 3) {
          issues.add(
            "warning",
            "THREE_TOUCHES",
            `Action ${contact.id}: side ${side} plays the ball ${count} times before it crosses.`,
            contact.id,
          );
        }
        if (
          previous &&
          previous.person === contact.person &&
          previous.verb !== "block"
        ) {
          issues.add(
            "warning",
            "THREE_TOUCHES",
            `Action ${contact.id}: the same player contacts the ball twice in a row.`,
            contact.id,
          );
        }
        previous = contact;
        if (contact.crosses) {
          count = 0;
          sideNow = null;
        }
      }
    }
  }

  // ---- rotation as a permutation, every outcome ----
  const rotationDoc = isRecord(doc.rotation) ? doc.rotation : undefined;
  let rotation: ResolvedTrainingScene["rotation"];
  if (doc.rotation !== undefined && !rotationDoc) {
    issues.add("error", "ROTATION", "Rotation must be an object.", "rotation");
  }
  if (rotationDoc) {
    const kind = str(rotationDoc.kind) ?? "cycle";
    const winnerStays = kind === "winner-stays";
    const outcomes = isRecord(rotationDoc.outcomes) ? rotationDoc.outcomes : {};
    const shown = str(rotationDoc.shown);
    if (winnerStays && (!shown || !isRecord(outcomes[shown]))) {
      issues.add(
        "error",
        "ROTATION",
        `Winner-stays rotation shows outcome "${quote(shown ?? "")}", which is not defined.`,
        "rotation",
      );
    }
    const maps: [string, Rec][] = winnerStays
      ? Object.entries(outcomes).filter((entry): entry is [string, Rec] =>
          isRecord(entry[1]),
        )
      : [["rotation", rotationDoc]];
    if (winnerStays && maps.length === 0) {
      issues.add(
        "error",
        "ROTATION",
        "Winner-stays rotation has no outcomes.",
        "rotation",
      );
    }
    const filled = new Set(
      slotList.filter((slot) => slot.occupant).map((slot) => slot.id),
    );
    const resolvedMaps: {
      name: string;
      caption?: string;
      map: Record<string, string>;
    }[] = [];
    for (const [name, value] of maps) {
      const map = isRecord(value.map) ? value.map : {};
      const clean: Record<string, string> = {};
      const targets = new Map<string, string>();
      for (const [from, toRaw] of Object.entries(map)) {
        const to = str(toRaw);
        if (to === undefined) {
          issues.add(
            "error",
            "ROTATION",
            `Rotation "${name}": "${quote(from)}" is sent nowhere.`,
            "rotation",
          );
          continue;
        }
        if (!filled.has(from)) {
          issues.add(
            "error",
            "ROTATION",
            `Rotation "${name}": "${quote(from)}" is not a filled slot.`,
            "rotation",
            "Use slot ids that have an occupant.",
          );
        }
        if (!slots.has(to)) {
          issues.add(
            "error",
            "ROTATION",
            `Rotation "${name}": "${quote(to)}" is not a slot.`,
            "rotation",
          );
        }
        if (targets.has(to)) {
          issues.add(
            "error",
            "ROTATION",
            `Rotation "${name}": both "${targets.get(to)}" and "${quote(from)}" are sent to "${quote(to)}".`,
            "rotation",
            "Each slot receives exactly one person; write the rotation as cycles.",
          );
        }
        targets.set(to, from);
        clean[from] = to;
      }
      for (const to of targets.keys()) {
        if (!(to in map) && filled.has(to)) {
          issues.add(
            "error",
            "ROTATION",
            `Rotation "${name}": "${to}" receives a person but its own person is never sent anywhere.`,
            "rotation",
            `Add where the person in "${to}" goes.`,
          );
        }
      }
      const caption = str(value.caption);
      if (!caption) {
        issues.add(
          "warning",
          "TEACHING",
          `Rotation "${name}" has no caption.`,
          "rotation",
        );
      }
      resolvedMaps.push({ name, ...(caption ? { caption } : {}), map: clean });
    }
    rotation = {
      kind,
      every: Math.max(1, Math.round(num(rotationDoc.every) ?? 1)),
      ...(str(rotationDoc.caption)
        ? { caption: str(rotationDoc.caption)! }
        : {}),
      ...(shown ? { shown } : {}),
      maps: resolvedMaps,
    };
  }

  // ---- teaching layer ----
  const teaching = doc.teaching as Rec;
  if (
    !Array.isArray(teaching.successCriteria) ||
    teaching.successCriteria.length === 0
  ) {
    issues.add("warning", "TEACHING", "No success criteria.", "teaching");
  }
  const stepIds = new Set(stepDocs.map((step) => str(step.id)));
  for (const step of stepDocs) {
    if (!str(step.caption)?.trim()) {
      issues.add(
        "warning",
        "TEACHING",
        `Step "${str(step.id)}" has no caption.`,
        str(step.id),
      );
    }
  }
  for (const cue of records(teaching.cues)) {
    const stepId = str(cue.step);
    if (stepId !== undefined && !stepIds.has(stepId)) {
      issues.add(
        "warning",
        "TEACHING",
        `Cue "${quote(cue.text ?? "")}" points at step "${quote(stepId)}", which does not exist.`,
        "teaching",
      );
    }
  }

  const validation = issues.finish();
  if (!validation.ok) return { validation };
  const restSeconds = num(rep.restSeconds);
  return {
    validation,
    resolved: {
      schema: TRAINING_SCENE_SCHEMA_ID,
      title: str(doc.title)!,
      court: courtSummary(court, courtDoc, netHeight),
      people: [...people.values()],
      slots: slotList,
      equipment,
      supply,
      zones,
      balls,
      steps: resolvedSteps,
      ...(rotation ? { rotation } : {}),
      ...(restSeconds === undefined ? {} : { restSeconds }),
    },
  };
}

function courtSummary(court: CourtSpec, courtDoc: Rec, netHeight: number) {
  return {
    type: str(courtDoc.type) ?? court.id,
    length: court.length,
    width: court.width,
    freeZone: court.freeZone,
    netHeight,
    netLength: court.netLength,
    surface: court.surface,
    half: court.half === true,
    noCourt: court.noCourt === true,
  };
}

/** "{srv} serves to {passL}." → occupant labels ("P1 serves to P2."). */
function captionOf(
  caption: string,
  slots: ReadonlyMap<string, ResolvedSceneSlot>,
): string {
  return caption
    .slice(0, 500)
    .replace(
      /\{([^{}]{1,64})\}/g,
      (whole, id: string) => slots.get(id)?.label ?? whole,
    );
}
