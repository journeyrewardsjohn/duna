import {
  TRAINING_FOCUS_AREAS,
  type TrainingFocusArea,
  type TrainingPracticeBlock,
} from "@duna/api/training-contracts";

export type PracticeBuilderBlock = {
  readonly localId: string;
  readonly groupId: string;
  readonly title: string;
  readonly kind: TrainingPracticeBlock["kind"];
  readonly drillId?: string;
  readonly lane: string;
  readonly durationMinutes: number;
  readonly transitionMinutes: number;
  readonly intensity: number;
  readonly plannedLoad: number;
  readonly focusArea?: TrainingFocusArea;
  readonly tags: string[];
  readonly instructions?: string;
  readonly touchesTypical: number;
  readonly jumpsTypical: number;
  readonly locked: boolean;
};

export type QuickPracticeBlockId =
  | "drill-block"
  | "team-meeting"
  | "warmup"
  | "cool-down"
  | "free-play"
  | "custom";

type QuickPracticeBlockPreset = {
  readonly id: QuickPracticeBlockId;
  readonly label: string;
  readonly summary: string;
  readonly title: string;
  readonly kind: TrainingPracticeBlock["kind"];
  readonly durationMinutes: number;
  readonly transitionMinutes: number;
  readonly intensity: number;
  readonly focusArea?: TrainingFocusArea | "practice-focus";
  readonly tags: readonly string[];
  readonly instructions: string;
  readonly touchesTypical: number;
  readonly jumpsTypical: number;
};

export const QUICK_PRACTICE_BLOCK_PRESETS: readonly QuickPracticeBlockPreset[] =
  [
    {
      id: "drill-block",
      label: "Drill block",
      summary: "Sketch a drill without building a library entry.",
      title: "Name this drill",
      kind: "drill",
      durationMinutes: 12,
      transitionMinutes: 2,
      intensity: 6,
      focusArea: "practice-focus",
      tags: ["Skill Work"],
      instructions: "Add the setup, scoring, or coaching cue the team needs.",
      touchesTypical: 36,
      jumpsTypical: 8,
    },
    {
      id: "team-meeting",
      label: "Team meeting",
      summary: "Align the group before or after court work.",
      title: "Team meeting",
      kind: "meeting",
      durationMinutes: 8,
      transitionMinutes: 1,
      intensity: 1,
      tags: ["Team Culture"],
      instructions:
        "Frame today’s objectives, roles, standards, and one clear takeaway.",
      touchesTypical: 0,
      jumpsTypical: 0,
    },
    {
      id: "warmup",
      label: "Warmup",
      summary: "Raise temperature and prepare volleyball movement.",
      title: "Movement + ball warmup",
      kind: "warmup",
      durationMinutes: 10,
      transitionMinutes: 2,
      intensity: 3,
      focusArea: "Footwork",
      tags: ["Warmup", "Movement"],
      instructions:
        "Build temperature, movement quality, and ball rhythm without early fatigue.",
      touchesTypical: 22,
      jumpsTypical: 4,
    },
    {
      id: "cool-down",
      label: "Cool down",
      summary: "Recover, reflect, and close the session.",
      title: "Cool down + recovery",
      kind: "cool-down",
      durationMinutes: 7,
      transitionMinutes: 0,
      intensity: 1,
      tags: ["Recovery", "Mobility"],
      instructions:
        "Downshift with mobility, breathing, hydration, and a short team reflection.",
      touchesTypical: 0,
      jumpsTypical: 0,
    },
    {
      id: "free-play",
      label: "Free play",
      summary: "Let athletes play with minimal interruption.",
      title: "Free play",
      kind: "free-play",
      durationMinutes: 15,
      transitionMinutes: 2,
      intensity: 7,
      focusArea: "practice-focus",
      tags: ["Game-Like", "Decision Making"],
      instructions:
        "Play continuously. Coach only safety, constraints, and the session’s main intention.",
      touchesTypical: 52,
      jumpsTypical: 14,
    },
    {
      id: "custom",
      label: "Custom",
      summary: "Start with a clean, fully editable block.",
      title: "Name this block",
      kind: "custom",
      durationMinutes: 10,
      transitionMinutes: 1,
      intensity: 5,
      focusArea: "practice-focus",
      tags: [],
      instructions:
        "Describe what happens and what athletes should understand.",
      touchesTypical: 0,
      jumpsTypical: 0,
    },
  ];

const focusAreaByKey = new Map(
  TRAINING_FOCUS_AREAS.map((area) => [area.toLowerCase(), area]),
);

function titleCase(value: string) {
  return value
    .replaceAll(/[-_]+/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) =>
      word.length > 0
        ? `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`
        : word,
    )
    .join(" ");
}

export function normalizePracticeBlockTags(value: string) {
  const seen = new Set<string>();
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => focusAreaByKey.get(tag.toLowerCase()) ?? titleCase(tag))
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

export function createQuickPracticeBlock(
  presetId: QuickPracticeBlockId,
  practiceFocus: TrainingFocusArea,
  id = crypto.randomUUID(),
): PracticeBuilderBlock {
  const preset = QUICK_PRACTICE_BLOCK_PRESETS.find(
    (candidate) => candidate.id === presetId,
  );
  if (!preset) throw new Error(`Unknown quick practice block: ${presetId}`);
  const focusArea =
    preset.focusArea === "practice-focus" ? practiceFocus : preset.focusArea;
  return {
    localId: id,
    groupId: id,
    title: preset.title,
    kind: preset.kind,
    lane: "all",
    durationMinutes: preset.durationMinutes,
    transitionMinutes: preset.transitionMinutes,
    intensity: preset.intensity,
    plannedLoad: Math.min(100, Math.round(preset.intensity * 9.2)),
    ...(focusArea ? { focusArea } : {}),
    tags: [...preset.tags],
    instructions: preset.instructions,
    touchesTypical: preset.touchesTypical,
    jumpsTypical: preset.jumpsTypical,
    locked: false,
  };
}

export function practiceBlockKindLabel(block: PracticeBuilderBlock) {
  if (block.drillId) return "Drill";
  if (block.kind === "drill") return "Drill block";
  if (block.kind === "meeting") return "Team meeting";
  return block.kind.replaceAll("-", " ");
}
