/**
 * Practice plans (B4): the pure timeline maths behind PP-Builder. No
 * database, no clock.
 *
 * - Block load is `intensity × 9.2`, rounded, capped at 100 (w3-contracts).
 * - Plan load is the duration-weighted mean of block loads.
 * - Work is a minute of the timeline on which at least one block runs at
 *   intensity 5 or more; everything else on the timeline (transitions,
 *   talks, easy blocks, gaps) is rest. The ratio is written "1:1.5".
 * - Focus mix is the share of drill and game minutes by focus (or title).
 * - `checkTimeline` separates errors (the plan cannot be stored) from
 *   warnings (the coach should look: overlaps in a lane, a plan longer or
 *   shorter than the session, a gap). Warnings never block a save.
 */

export const BLOCK_KINDS = [
  "drill",
  "warmup",
  "meeting",
  "cool-down",
  "free-play",
  "custom",
] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

export interface TimelineBlock {
  readonly sequence: number;
  readonly lane: string;
  readonly title: string;
  readonly kind: BlockKind;
  readonly startsAtMinute: number;
  readonly durationMinutes: number;
  readonly transitionMinutes: number;
  readonly intensity: number;
  readonly focus?: string;
  readonly estimatedTouches?: number;
  readonly estimatedJumps?: number;
  readonly estimatedMetres?: number;
}

export interface PlanTotals {
  readonly minutes: number;
  readonly plannedMinutes: number;
  readonly load: number;
  readonly targetLoad?: number;
  readonly touches: number;
  readonly jumps: number;
  readonly metres: number;
  readonly workRestRatio: string;
  readonly focusMix: { focus: string; percent: number }[];
}

export const MAX_PLAN_MINUTES = 720;
const WORK_INTENSITY = 5;

export function blockLoad(intensity: number): number {
  return Math.min(100, Math.max(0, Math.round(intensity * 9.2)));
}

/** Where the timeline ends: the last block plus its transition. */
export function timelineMinutes(blocks: readonly TimelineBlock[]): number {
  return blocks.reduce(
    (end, block) =>
      Math.max(
        end,
        block.startsAtMinute + block.durationMinutes + block.transitionMinutes,
      ),
    0,
  );
}

function ratio(work: number, rest: number): string {
  if (work <= 0) return "0:1";
  const value = Math.round((rest / work) * 10) / 10;
  return `1:${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}`;
}

export function planTotals(input: {
  readonly blocks: readonly TimelineBlock[];
  readonly plannedMinutes: number;
  readonly targetLoad?: number;
}): PlanTotals {
  const blocks = input.blocks;
  const minutes = timelineMinutes(blocks);
  const weighted = blocks.reduce(
    (sum, block) => sum + blockLoad(block.intensity) * block.durationMinutes,
    0,
  );
  const blockMinutes = blocks.reduce(
    (sum, block) => sum + block.durationMinutes,
    0,
  );
  const load = blockMinutes > 0 ? Math.round(weighted / blockMinutes) : 0;
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
  const focusTotal = [...focusMinutes.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  const focusMix = [...focusMinutes.entries()]
    .map(([focus, value]) => ({
      focus,
      percent: focusTotal > 0 ? Math.round((value / focusTotal) * 100) : 0,
    }))
    .sort(
      (left, right) =>
        right.percent - left.percent || left.focus.localeCompare(right.focus),
    );
  return {
    minutes,
    plannedMinutes: Math.max(1, input.plannedMinutes),
    load: Math.min(100, load),
    ...(input.targetLoad === undefined ? {} : { targetLoad: input.targetLoad }),
    touches: blocks.reduce(
      (sum, block) => sum + (block.estimatedTouches ?? 0),
      0,
    ),
    jumps: blocks.reduce((sum, block) => sum + (block.estimatedJumps ?? 0), 0),
    metres: blocks.reduce(
      (sum, block) => sum + (block.estimatedMetres ?? 0),
      0,
    ),
    workRestRatio: ratio(work, Math.max(0, minutes - work)),
    focusMix,
  };
}

export interface TimelineCheck {
  readonly errors: string[];
  readonly warnings: string[];
}

/**
 * Hard errors stop a save; warnings are for the coach. `sessionMinutes` is
 * the session the plan is attached to, when there is one.
 */
export function checkTimeline(
  blocks: readonly TimelineBlock[],
  sessionMinutes?: number,
): TimelineCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sequences = new Set<string>();
  for (const block of blocks) {
    const key = `${block.lane}\u0000${block.sequence}`;
    if (sequences.has(key)) {
      errors.push(
        `Two blocks in "${block.lane}" share position ${block.sequence + 1}.`,
      );
    }
    sequences.add(key);
    if (
      block.startsAtMinute + block.durationMinutes + block.transitionMinutes >
      MAX_PLAN_MINUTES
    ) {
      errors.push(`"${block.title}" runs past ${MAX_PLAN_MINUTES} minutes.`);
    }
  }
  const lanes = new Map<string, TimelineBlock[]>();
  for (const block of blocks) {
    lanes.set(block.lane, [...(lanes.get(block.lane) ?? []), block]);
  }
  for (const [lane, laneBlocks] of lanes) {
    const sorted = [...laneBlocks].sort(
      (left, right) => left.startsAtMinute - right.startsAtMinute,
    );
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1]!;
      const current = sorted[index]!;
      const previousEnd = previous.startsAtMinute + previous.durationMinutes;
      if (current.startsAtMinute < previousEnd) {
        warnings.push(
          `"${current.title}" starts before "${previous.title}" ends in ${lane}.`,
        );
      }
    }
  }
  const total = timelineMinutes(blocks);
  if (sessionMinutes !== undefined) {
    if (total > sessionMinutes) {
      warnings.push(
        `The plan runs ${total} minutes; the session is ${sessionMinutes}.`,
      );
    } else if (total < sessionMinutes - 10) {
      warnings.push(
        `The plan fills ${total} of the session's ${sessionMinutes} minutes.`,
      );
    }
  }
  return { errors, warnings };
}

export interface ProposalDrill {
  readonly drillId: string;
  readonly drillVersionId: string;
  readonly title: string;
  readonly focus: string;
  readonly durationMinutes: number;
  readonly intensity: number;
  readonly minPlayers: number;
  readonly touches: number;
  readonly jumps: number;
  readonly fromScene: boolean;
}

export interface ProposedBlock extends TimelineBlock {
  readonly plannedLoad: number;
  readonly drillId?: string;
  readonly drillVersionId?: string;
  readonly estimateSource: "assumed" | "derived-from-scene";
  readonly locked: boolean;
}

/**
 * A first draft a coach edits: warm-up, drills that match the focus (from
 * the club's own and Duna's drills), games to fill, cool-down. Nothing here
 * is saved. Estimates scale with the athletes the coach planned for.
 */
export function proposeBlocks(input: {
  readonly durationMinutes: number;
  readonly athletes: number;
  readonly focus?: string;
  readonly drills: readonly ProposalDrill[];
}): ProposedBlock[] {
  const total = Math.max(10, Math.min(360, input.durationMinutes));
  const warmup = Math.max(5, Math.round(total * 0.15));
  const coolDown = total >= 45 ? 5 : 0;
  const focus = input.focus?.trim().toLowerCase();
  const candidates = input.drills
    .filter((drill) => drill.minPlayers <= Math.max(1, input.athletes))
    .sort((left, right) => {
      const leftMatch =
        focus && left.focus.toLowerCase().includes(focus) ? 0 : 1;
      const rightMatch =
        focus && right.focus.toLowerCase().includes(focus) ? 0 : 1;
      return leftMatch - rightMatch || left.title.localeCompare(right.title);
    });
  const blocks: ProposedBlock[] = [];
  let minute = 0;
  const push = (
    block: Omit<
      ProposedBlock,
      | "sequence"
      | "startsAtMinute"
      | "lane"
      | "transitionMinutes"
      | "plannedLoad"
      | "locked"
    >,
  ) => {
    blocks.push({
      ...block,
      sequence: blocks.length,
      lane: "all",
      startsAtMinute: minute,
      transitionMinutes: 0,
      plannedLoad: blockLoad(block.intensity),
      locked: false,
    });
    minute += block.durationMinutes;
  };
  push({
    title: "Warm-up",
    kind: "warmup",
    durationMinutes: warmup,
    intensity: 3,
    estimatedTouches: input.athletes * 2,
    estimatedJumps: input.athletes,
    estimateSource: "assumed",
  });
  const drillBudget = total - warmup - coolDown;
  let used = 0;
  for (const drill of candidates) {
    if (used + drill.durationMinutes > drillBudget * 0.75) continue;
    push({
      title: drill.title,
      kind: "drill",
      durationMinutes: drill.durationMinutes,
      intensity: Math.min(10, Math.max(1, drill.intensity)),
      focus: drill.focus,
      drillId: drill.drillId,
      drillVersionId: drill.drillVersionId,
      estimatedTouches: drill.touches,
      estimatedJumps: drill.jumps,
      estimateSource: drill.fromScene ? "derived-from-scene" : "assumed",
    });
    used += drill.durationMinutes;
    if (blocks.length >= 6) break;
  }
  const games = drillBudget - used;
  if (games > 0) {
    push({
      title: "Games",
      kind: "free-play",
      durationMinutes: games,
      intensity: 7,
      focus: input.focus?.trim() || "Games",
      estimatedTouches: Math.round(games * input.athletes * 0.8),
      estimatedJumps: Math.round(games * input.athletes * 0.2),
      estimateSource: "assumed",
    });
  }
  if (coolDown > 0) {
    push({
      title: "Cool down",
      kind: "cool-down",
      durationMinutes: coolDown,
      intensity: 2,
      estimateSource: "assumed",
    });
  }
  return blocks;
}
