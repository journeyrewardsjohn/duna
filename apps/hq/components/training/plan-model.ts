import type { TrainingProgramsPracticePlan } from "@duna/api";

/**
 * The practice plan builder's maths (H-TRAIN). Pure. Block load is
 * `intensity × 9.2` (capped at 100), the plan's load is the
 * duration-weighted mean, work is any minute with a block at intensity 5+,
 * the focus mix is by drill and game minutes: the same rules the backend's
 * `plan-timeline.ts` applies when it saves (it recomputes the totals; these
 * are only the live preview). Load, contacts and jumps are estimates and
 * every screen labels them so. Nothing here is medical advice.
 */

export type PlanBlock = TrainingProgramsPracticePlan["blocks"][number];
export type PlanAssumptions = TrainingProgramsPracticePlan["assumptions"];
export type PlanTotals = TrainingProgramsPracticePlan["totals"];
export type BlockKind = PlanBlock["kind"];

/** A block while it is being edited: the contract's block without its id. */
export interface DraftBlock extends Omit<PlanBlock, "id"> {
  /** Stable key for the list (the saved block id, or a new one). */
  readonly key: string;
  /** Contacts and jumps per minute, to rescale when the minutes change. */
  readonly ratePerMinute?: { readonly touches: number; readonly jumps: number };
  /** From the drill's drawing, per repetition (deriveTrainingSceneEstimates). */
  readonly perRep?: { readonly touches?: number; readonly jumps?: number };
  /** The drill's version number this block is pinned to, when known. */
  readonly pinnedVersion?: number;
  /** The drill's current version number, when known. */
  readonly currentVersion?: number;
  /** The drill's drawing (scene document), shown as a small diagram. */
  readonly scene?: unknown;
}

export const MAX_PLAN_MINUTES = 720;
const WORK_INTENSITY = 5;

export function blockLoad(intensity: number): number {
  return Math.min(100, Math.max(0, Math.round(intensity * 9.2)));
}

/* ------------------------------------------------------ quick blocks */

export interface QuickBlock {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly title: string;
  readonly kind: BlockKind;
  readonly minutes: number;
  readonly intensity: number;
  readonly focus?: string;
  /** Contacts and jumps per player for the whole block (assumed). */
  readonly touches: number;
  readonly jumps: number;
}

/** One tap each: the blocks most practices are made of. */
export const QUICK_BLOCKS: readonly QuickBlock[] = [
  {
    id: "warmup",
    label: "Warm-up",
    summary: "Movement and ball warm-up, no early fatigue.",
    title: "Warm-up",
    kind: "warmup",
    minutes: 10,
    intensity: 3,
    focus: "Warm-up",
    touches: 22,
    jumps: 4,
  },
  {
    id: "serve-receive",
    label: "Serve-receive",
    summary: "Served balls to a passing target.",
    title: "Serve-receive",
    kind: "drill",
    minutes: 15,
    intensity: 6,
    focus: "Serve-receive",
    touches: 36,
    jumps: 8,
  },
  {
    id: "side-out",
    label: "Side-out",
    summary: "Pass, set and attack to win the point back.",
    title: "Side-out",
    kind: "drill",
    minutes: 15,
    intensity: 7,
    focus: "Side-out",
    touches: 40,
    jumps: 14,
  },
  {
    id: "games",
    label: "Games",
    summary: "Play to points with one constraint.",
    title: "Games",
    kind: "free-play",
    minutes: 20,
    intensity: 7,
    focus: "Games",
    touches: 52,
    jumps: 14,
  },
  {
    id: "team-meeting",
    label: "Team talk",
    summary: "Today's aim, roles and one takeaway.",
    title: "Team talk",
    kind: "meeting",
    minutes: 5,
    intensity: 1,
    touches: 0,
    jumps: 0,
  },
  {
    id: "cool-down",
    label: "Cool-down",
    summary: "Mobility, breathing, water and a short reflection.",
    title: "Cool-down",
    kind: "cool-down",
    minutes: 7,
    intensity: 1,
    touches: 0,
    jumps: 0,
  },
  {
    id: "custom",
    label: "Custom",
    summary: "A clean block you name and describe.",
    title: "New block",
    kind: "custom",
    minutes: 10,
    intensity: 5,
    touches: 0,
    jumps: 0,
  },
];

export const blockKindLabels: Record<BlockKind, string> = {
  drill: "Drill",
  warmup: "Warm-up",
  meeting: "Talk",
  "cool-down": "Cool-down",
  "free-play": "Games",
  custom: "Block",
};

export const planStatusCopy: Record<
  TrainingProgramsPracticePlan["status"],
  { readonly label: string; readonly tone: "info" | "positive" | "neutral" }
> = {
  draft: { label: "Draft", tone: "info" },
  review: { label: "In review", tone: "info" },
  published: { label: "Ready to use", tone: "positive" },
  archived: { label: "Archived", tone: "neutral" },
};

let counter = 0;
export function newKey(prefix = "block"): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

function rate(total: number, minutes: number): number {
  return minutes > 0 ? total / minutes : 0;
}

export function quickBlock(preset: QuickBlock, planFocus?: string): DraftBlock {
  const focus =
    preset.kind === "drill" || preset.kind === "free-play"
      ? (preset.focus ?? planFocus)
      : preset.focus;
  return {
    key: newKey(),
    sequence: 0,
    lane: "all",
    title: preset.title,
    kind: preset.kind,
    startsAtMinute: 0,
    durationMinutes: preset.minutes,
    transitionMinutes: 0,
    intensity: preset.intensity,
    plannedLoad: blockLoad(preset.intensity),
    ...(focus ? { focus } : {}),
    estimatedTouches: preset.touches,
    estimatedJumps: preset.jumps,
    estimateSource: "assumed",
    locked: false,
    ratePerMinute: {
      touches: rate(preset.touches, preset.minutes),
      jumps: rate(preset.touches === 0 ? 0 : preset.jumps, preset.minutes),
    },
  };
}

/** A library drill as a block, pinned to the version it was added at. */
export function drillBlock(drill: {
  readonly id: string;
  readonly title: string;
  readonly focus: string;
  readonly durationMinutes: number;
  readonly load: number;
  readonly touches: number;
  readonly jumps: number;
  readonly currentVersionId?: string;
  readonly version: number;
  readonly perRep?: { readonly touches?: number; readonly jumps?: number };
  readonly scene?: unknown;
}): DraftBlock {
  const intensity = Math.min(10, Math.max(1, Math.round(drill.load / 9.2)));
  return {
    key: newKey(),
    sequence: 0,
    lane: "all",
    title: drill.title,
    kind: "drill",
    startsAtMinute: 0,
    durationMinutes: drill.durationMinutes,
    transitionMinutes: 0,
    intensity,
    plannedLoad: blockLoad(intensity),
    focus: drill.focus,
    drillId: drill.id,
    ...(drill.currentVersionId
      ? { drillVersionId: drill.currentVersionId }
      : {}),
    estimatedTouches: drill.touches,
    estimatedJumps: drill.jumps,
    estimateSource:
      drill.perRep && drill.perRep.touches !== undefined
        ? "derived-from-scene"
        : "assumed",
    locked: false,
    ratePerMinute: {
      touches: rate(drill.touches, drill.durationMinutes),
      jumps: rate(drill.jumps, drill.durationMinutes),
    },
    ...(drill.perRep ? { perRep: drill.perRep } : {}),
    pinnedVersion: drill.version,
    currentVersion: drill.version,
    ...(drill.scene ? { scene: drill.scene } : {}),
  };
}

/** A saved block back into the editor. */
export function fromSaved(block: PlanBlock): DraftBlock {
  const { id, ...rest } = block;
  return {
    ...rest,
    key: id,
    ratePerMinute: {
      touches: rate(block.estimatedTouches ?? 0, block.durationMinutes),
      jumps: rate(block.estimatedJumps ?? 0, block.durationMinutes),
    },
  };
}

/* ---------------------------------------------------------- layout */

/** Blocks in groups: a group's blocks run at the same time on different courts. */
export function groupsOf(blocks: readonly DraftBlock[]): DraftBlock[][] {
  const groups: DraftBlock[][] = [];
  for (const block of blocks) {
    const last = groups.at(-1);
    if (last && last[0]!.sequence === block.sequence) last.push(block);
    else groups.push([block]);
  }
  return groups;
}

/**
 * Puts the blocks on the timeline: each group starts when the longest block
 * of the previous group (plus its change-over) ends; parallel blocks get a
 * court lane each, a block on its own runs on every court ("all").
 */
export function relayout(
  groups: readonly (readonly DraftBlock[])[],
): DraftBlock[] {
  let minute = 0;
  const out: DraftBlock[] = [];
  groups
    .filter((group) => group.length > 0)
    .forEach((group, sequence) => {
      group.forEach((block, index) => {
        out.push({
          ...block,
          sequence,
          lane: group.length === 1 ? "all" : `Court ${index + 1}`,
          startsAtMinute: minute,
        });
      });
      minute += Math.max(
        ...group.map(
          (block) => block.durationMinutes + block.transitionMinutes,
        ),
      );
    });
  return out;
}

export function appendBlock(
  blocks: readonly DraftBlock[],
  block: DraftBlock,
  besidePrevious = false,
): DraftBlock[] {
  const groups = groupsOf(blocks);
  if (besidePrevious && groups.length > 0) {
    groups[groups.length - 1] = [...groups.at(-1)!, block];
  } else {
    groups.push([block]);
  }
  return relayout(groups);
}

export function removeBlock(
  blocks: readonly DraftBlock[],
  key: string,
): DraftBlock[] {
  return relayout(
    groupsOf(blocks).map((group) => group.filter((block) => block.key !== key)),
  );
}

/** Moves the block's group one step earlier (-1) or later (+1). */
export function moveBlock(
  blocks: readonly DraftBlock[],
  key: string,
  step: -1 | 1,
): DraftBlock[] {
  const groups = groupsOf(blocks);
  const index = groups.findIndex((group) =>
    group.some((block) => block.key === key),
  );
  const target = index + step;
  if (index < 0 || target < 0 || target >= groups.length) return [...blocks];
  [groups[index], groups[target]] = [groups[target]!, groups[index]!];
  return relayout(groups);
}

/** Runs a block on its own again, or beside the group before it. */
export function setParallel(
  blocks: readonly DraftBlock[],
  key: string,
  parallel: boolean,
): DraftBlock[] {
  const groups = groupsOf(blocks).map((group) => [...group]);
  const index = groups.findIndex((group) =>
    group.some((block) => block.key === key),
  );
  if (index < 0) return [...blocks];
  const block = groups[index]!.find((row) => row.key === key)!;
  if (parallel) {
    if (index === 0 && groups[index]!.length === 1) return [...blocks];
    groups[index] = groups[index]!.filter((row) => row.key !== key);
    const into = groups[index]!.length === 0 ? index - 1 : index;
    if (groups[index]!.length === 0) groups.splice(index, 1);
    groups[Math.max(0, into)]!.push(block);
  } else {
    groups[index] = groups[index]!.filter((row) => row.key !== key);
    groups.splice(index + 1, 0, [block]);
  }
  return relayout(groups.filter((group) => group.length > 0));
}

/** Changes one block; minutes rescale assumed or drawn estimates. */
export function updateBlock(
  blocks: readonly DraftBlock[],
  key: string,
  change: Partial<
    Pick<
      DraftBlock,
      | "title"
      | "durationMinutes"
      | "transitionMinutes"
      | "intensity"
      | "focus"
      | "estimatedTouches"
      | "estimatedJumps"
      | "instructionsMarkdown"
    >
  >,
): DraftBlock[] {
  const next = blocks.map((block) => {
    if (block.key !== key) return block;
    let updated: DraftBlock = { ...block, ...change };
    if (change.intensity !== undefined) {
      updated = { ...updated, plannedLoad: blockLoad(change.intensity) };
    }
    if (
      change.estimatedTouches !== undefined ||
      change.estimatedJumps !== undefined
    ) {
      updated = { ...updated, estimateSource: "coach-edited" };
    } else if (
      change.durationMinutes !== undefined &&
      block.estimateSource !== "coach-edited" &&
      block.ratePerMinute
    ) {
      updated = {
        ...updated,
        estimatedTouches: Math.round(
          block.ratePerMinute.touches * change.durationMinutes,
        ),
        estimatedJumps: Math.round(
          block.ratePerMinute.jumps * change.durationMinutes,
        ),
      };
    }
    return updated;
  });
  return relayout(groupsOf(next));
}

/* ---------------------------------------------------------- totals */

function ratio(work: number, rest: number): string {
  if (work <= 0) return "0:1";
  const value = Math.round((rest / work) * 10) / 10;
  return `1:${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}`;
}

export function timelineMinutes(blocks: readonly DraftBlock[]): number {
  return blocks.reduce(
    (end, block) =>
      Math.max(
        end,
        block.startsAtMinute + block.durationMinutes + block.transitionMinutes,
      ),
    0,
  );
}

/** Live totals for the builder (the save recomputes them on the server). */
export function planTotals(input: {
  readonly blocks: readonly DraftBlock[];
  readonly plannedMinutes: number;
  readonly targetLoad?: number;
}): PlanTotals {
  const { blocks } = input;
  const minutes = timelineMinutes(blocks);
  const blockMinutes = blocks.reduce((sum, b) => sum + b.durationMinutes, 0);
  const weighted = blocks.reduce(
    (sum, b) => sum + blockLoad(b.intensity) * b.durationMinutes,
    0,
  );
  const busy = new Uint8Array(Math.min(minutes, MAX_PLAN_MINUTES));
  for (const block of blocks) {
    if (block.intensity < WORK_INTENSITY) continue;
    const end = Math.min(
      busy.length,
      block.startsAtMinute + block.durationMinutes,
    );
    for (let minute = block.startsAtMinute; minute < end; minute += 1) {
      busy[minute] = 1;
    }
  }
  const work = busy.reduce((sum, value) => sum + value, 0);
  const focusMinutes = new Map<string, number>();
  for (const block of blocks) {
    if (block.kind !== "drill" && block.kind !== "free-play") continue;
    const focus = (block.focus?.trim() || block.title.trim()).slice(0, 80);
    if (!focus) continue;
    focusMinutes.set(
      focus,
      (focusMinutes.get(focus) ?? 0) + block.durationMinutes,
    );
  }
  const focusTotal = [...focusMinutes.values()].reduce((a, b) => a + b, 0);
  return {
    minutes,
    plannedMinutes: Math.max(1, input.plannedMinutes),
    load: Math.min(
      100,
      blockMinutes > 0 ? Math.round(weighted / blockMinutes) : 0,
    ),
    ...(input.targetLoad === undefined ? {} : { targetLoad: input.targetLoad }),
    touches: blocks.reduce((sum, b) => sum + (b.estimatedTouches ?? 0), 0),
    jumps: blocks.reduce((sum, b) => sum + (b.estimatedJumps ?? 0), 0),
    metres: blocks.reduce((sum, b) => sum + (b.estimatedMetres ?? 0), 0),
    workRestRatio: ratio(work, Math.max(0, minutes - work)),
    focusMix: [...focusMinutes.entries()]
      .map(([focus, value]) => ({
        focus,
        percent: focusTotal > 0 ? Math.round((value / focusTotal) * 100) : 0,
      }))
      .sort((a, b) => b.percent - a.percent || a.focus.localeCompare(b.focus)),
  };
}

/**
 * What the coach should look at. Warnings, never errors: a plan longer than
 * the practice or under its target load still saves.
 */
export function planWarnings(input: {
  readonly blocks: readonly DraftBlock[];
  readonly plannedMinutes: number;
  readonly targetLoad?: number;
}): string[] {
  const { blocks } = input;
  const warnings: string[] = [];
  if (blocks.length === 0) return warnings;
  const totals = planTotals(input);
  if (totals.minutes > input.plannedMinutes) {
    warnings.push(
      `Runs ${totals.minutes - input.plannedMinutes} min over the ${input.plannedMinutes}-minute practice.`,
    );
  } else if (totals.minutes < input.plannedMinutes - 5) {
    warnings.push(
      `${input.plannedMinutes - totals.minutes} min of the ${input.plannedMinutes}-minute practice are not planned yet.`,
    );
  }
  if (input.targetLoad !== undefined) {
    const gap = totals.load - input.targetLoad;
    if (gap <= -8) {
      warnings.push(
        `Load ${totals.load} is ${-gap} under the target ${input.targetLoad} (estimate): lengthen a drill or add game time.`,
      );
    } else if (gap >= 8) {
      warnings.push(
        `Load ${totals.load} is ${gap} over the target ${input.targetLoad} (estimate): shorten the hardest block or add rest.`,
      );
    }
  }
  const first = blocks.find((block) => block.sequence === 0);
  if (first && first.kind !== "warmup" && first.kind !== "meeting") {
    warnings.push("The practice doesn't start with a warm-up.");
  }
  const lastSequence = Math.max(...blocks.map((block) => block.sequence));
  const last = blocks.filter((block) => block.sequence === lastSequence);
  if (
    !last.some(
      (block) => block.kind === "cool-down" || block.kind === "meeting",
    )
  ) {
    warnings.push("The practice doesn't end with a cool-down.");
  }
  return warnings;
}

/** "62 · target 62" style line, and the drawing's per-rep note. */
export function estimateSourceWords(
  block: Pick<DraftBlock, "estimateSource" | "perRep">,
): string {
  if (block.estimateSource === "derived-from-scene" && block.perRep) {
    const touches = block.perRep.touches ?? 0;
    const jumps = block.perRep.jumps ?? 0;
    return `From the drawing: ${touches} ${touches === 1 ? "contact" : "contacts"} and ${jumps} ${jumps === 1 ? "jump" : "jumps"} a repetition`;
  }
  switch (block.estimateSource) {
    case "derived-from-scene":
      return "Estimated from the drill's drawing";
    case "coach-edited":
      return "Coach's estimate";
    case "assumed":
      return "Assumed by Duna";
  }
}

/* --------------------------------------------------------- versions */

/**
 * A block pinned to a drill version: which one, and whether a newer one
 * exists ("Version 2 · version 3 is newer"). Plans keep the version they
 * were given; a coach chooses when to move up.
 */
export function pinWords(input: {
  readonly pinnedVersion?: number;
  readonly currentVersion?: number;
}): { readonly label: string; readonly newer: boolean } | undefined {
  if (input.pinnedVersion === undefined) return undefined;
  const newer =
    input.currentVersion !== undefined &&
    input.currentVersion > input.pinnedVersion;
  return {
    label: newer
      ? `Version ${input.pinnedVersion} · a newer version (${input.currentVersion}) exists`
      : `Version ${input.pinnedVersion}`,
    newer,
  };
}

/** The plan's version line: "Version 3 · saved Nov 27". */
export function versionLine(version: number, updatedAt: string): string {
  const date = new Date(updatedAt);
  const words = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
  return `Version ${version} · saved ${words}`;
}

/* --------------------------------------------------------- proposal */

/** What a Duna proposal is based on, said before the coach edits it. */
export function proposalBasis(input: {
  readonly focus?: string;
  readonly durationMinutes: number;
  readonly assumptions: PlanAssumptions;
}): string {
  const a = input.assumptions;
  return [
    input.focus?.trim() ? `focus "${input.focus.trim()}"` : "no focus given",
    `${input.durationMinutes} minutes`,
    `${a.athletes} athletes on ${a.courts} ${a.courts === 1 ? "court" : "courts"}`,
    `${a.ballsPerCourt} balls a court`,
    `level ${a.level}`,
    a.targetLoad !== undefined ? `target load ${a.targetLoad}` : undefined,
  ]
    .filter(Boolean)
    .join(", ");
}

/** The blocks as the save procedure takes them. */
export function toSaveBlocks(blocks: readonly DraftBlock[]) {
  return blocks.map((block): Omit<PlanBlock, "id"> => ({
    sequence: block.sequence,
    lane: block.lane,
    title: block.title,
    kind: block.kind,
    startsAtMinute: block.startsAtMinute,
    durationMinutes: block.durationMinutes,
    transitionMinutes: block.transitionMinutes,
    intensity: block.intensity,
    plannedLoad: block.plannedLoad,
    ...(block.focus !== undefined ? { focus: block.focus } : {}),
    ...(block.drillId ? { drillId: block.drillId } : {}),
    ...(block.drillVersionId ? { drillVersionId: block.drillVersionId } : {}),
    ...(block.estimatedTouches !== undefined
      ? { estimatedTouches: block.estimatedTouches }
      : {}),
    ...(block.estimatedJumps !== undefined
      ? { estimatedJumps: block.estimatedJumps }
      : {}),
    ...(block.estimatedMetres !== undefined
      ? { estimatedMetres: block.estimatedMetres }
      : {}),
    estimateSource: block.estimateSource,
    locked: block.locked,
    ...(block.instructionsMarkdown
      ? { instructionsMarkdown: block.instructionsMarkdown }
      : {}),
  }));
}

/** "1:30" from 90 minutes after the practice starts, or a clock time. */
export function minuteLabel(minute: number, startsAt?: string): string {
  if (!startsAt)
    return `${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, "0")}`;
  const [h = 0, m = 0] = startsAt.split(":").map(Number);
  const total = h * 60 + m + minute;
  const hour = Math.floor(total / 60) % 24;
  return `${hour % 12 === 0 ? 12 : hour % 12}:${String(total % 60).padStart(2, "0")}`;
}
