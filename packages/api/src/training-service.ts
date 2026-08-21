import { Agent, OpenAIProvider, run, setTracingDisabled } from "@openai/agents";
import { demoOrganization } from "@duna/core/demo";
import {
  auditLog,
  catalogFulfillments,
  catalogItemVersions,
  catalogItems,
  catalogPrices,
  catalogVariants,
  getDatabase,
  getTransactionalDatabase,
  trainingDrills,
  trainingDrillLicenses,
  trainingDrillTags,
  trainingDrillVersions,
  trainingAthleteResponses,
  trainingEvents,
  trainingPracticeOutcomes,
  trainingPracticePlanBlocks,
  trainingPracticePlans,
  trainingPracticePlanTags,
  trainingPracticePlanVersions,
  trainingPrograms,
  trainingProgramVersions,
  trainingProgramParticipants,
  trainingTags,
} from "@duna/db";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { stableHash } from "./canonical";
import type { ApiActor } from "./context";
import {
  archiveTrainingPracticePlanInputSchema,
  archiveTrainingProgramInputSchema,
  assignTrainingPracticePlanInputSchema,
  createTrainingDrillInputSchema,
  createTrainingPracticePlanInputSchema,
  createTrainingProgramInputSchema,
  draftTrainingDrillInputSchema,
  draftTrainingProgramInputSchema,
  drillSceneSchema,
  recordTrainingOutcomeInputSchema,
  removeTrainingProgramEventInputSchema,
  playerTrainingEventSchema,
  playerTrainingWorkspaceSchema,
  restoreTrainingPracticePlanArchiveInputSchema,
  restoreTrainingPracticePlanVersionInputSchema,
  restoreTrainingProgramArchiveInputSchema,
  restoreTrainingProgramVersionInputSchema,
  TRAINING_FOCUS_AREAS,
  trainingContactEstimateSchema,
  trainingDrillSchema,
  trainingDrillInterpretationSchema,
  trainingEventSchema,
  trainingFocusAreaSchema,
  trainingPracticePlanSchema,
  trainingPracticePlanVersionsInputSchema,
  trainingProgramEventsInputSchema,
  submitTrainingAthleteResponseInputSchema,
  trainingProgramDraftSchema,
  trainingProgramSchema,
  trainingProgramVersionSnapshotSchema,
  trainingProgramVersionsInputSchema,
  trainingRecurrenceSchema,
  trainingTagSchema,
  trainingWorkspaceSchema,
  touchEstimateInputSchema,
  updateTrainingProgramEventInputSchema,
  updateTrainingPracticePlanInputSchema,
  type DraftTrainingDrillInput,
  type DraftTrainingProgramInput,
  type TrainingContactEstimate,
  type TrainingDrill,
  type DrillEditorState,
  type TrainingEvent,
  type TrainingFocusArea,
  type TrainingPracticePlan,
  type PlayerTrainingEvent,
  type PlayerTrainingWorkspace,
  type TrainingProgramDraft,
  type TrainingProgramVersionSnapshot,
  type TrainingRecurrence,
  type TrainingVersionHistoryEntry,
  type TrainingWeekday,
  type TrainingWorkspace,
} from "./training-contracts";

// Training briefs can contain proprietary coaching methods. OpenAI tracing is
// disabled and only the bounded brief is sent to the configured Duna gateway.
setTracingDisabled(true);

const DAY_NAMES: readonly TrainingWeekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const STANDARD_TAG_IDS = new Map(
  TRAINING_FOCUS_AREAS.map((label, index) => [
    label,
    `33000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  ]),
);

export class TrainingServiceError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "ORGANIZATION_NOT_FOUND"
      | "RESOURCE_NOT_FOUND"
      | "RESOURCE_WRONG_ORGANIZATION"
      | "INVALID_SCHEDULE"
      | "INVALID_CONFIGURATION"
      | "FORBIDDEN",
    message: string,
  ) {
    super(message);
    this.name = "TrainingServiceError";
  }
}

function demoId(sequence: number): string {
  return `33000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

const BUILT_IN_DUNA_DRILL_IDS = new Set(
  Array.from({ length: 6 }, (_, index) => demoId(101 + index)),
);

const TRAINING_VERSION_RETENTION = 5;

type TrainingProgramRecord = typeof trainingPrograms.$inferSelect;
type TrainingEventRecord = typeof trainingEvents.$inferSelect;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function titleCase(value: string): string {
  return value
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function normalizeTrainingTag(value: string): {
  readonly label: string;
  readonly slug: string;
} {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  const compact = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const aliases: Readonly<Record<string, TrainingFocusArea>> = {
    attacks: "Attacking",
    hitting: "Attacking",
    passing: "Ball Control",
    serveReceive: "Ball Control",
    attackLocations: "Attack Location",
    defense: "Team Defense",
    teamDefense: "Team Defense",
    offense: "Offensive Systems",
    blocks: "Blocking",
    serves: "Serving",
    backrowAttacks: "Back-Row Attack",
    freeballs: "Free-Ball Play",
    outOfSystem: "Out-of-System",
  };
  const normalizedAliases = Object.fromEntries(
    Object.entries(aliases).map(([alias, focus]) => [
      alias.toLowerCase().replace(/[^a-z0-9]/g, ""),
      focus,
    ]),
  ) as Readonly<Record<string, TrainingFocusArea>>;
  const standard =
    normalizedAliases[compact] ??
    TRAINING_FOCUS_AREAS.find((focus) => {
      const focusKey = focus.toLowerCase().replace(/[^a-z0-9]/g, "");
      return (
        focusKey === compact ||
        focusKey.replace(/s$/, "") === compact.replace(/s$/, "")
      );
    });
  return { label: standard ?? titleCase(value), slug };
}

function slugify(value: string): string {
  return normalizeTrainingTag(value).slug || "training-item";
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function estimateTrainingContacts(
  rawInput: Parameters<typeof touchEstimateInputSchema.parse>[0],
): TrainingContactEstimate {
  const input = touchEstimateInputSchema.parse(rawInput);
  const hasRepModel = Boolean(input.contactsPerRep && input.repsOrPoints);
  const liveContactTotal = hasRepModel
    ? input.contactsPerRep! * input.repsOrPoints!
    : input.durationMinutes *
      input.contactsPerMinutePerBall *
      Math.max(1, input.ballCount) *
      input.livePlayRatio;
  const modeFactor =
    input.mode === "competitive"
      ? 0.88
      : input.mode === "individual"
        ? 1.18
        : input.mode === "hybrid"
          ? 0.96
          : 1;
  const totalContactsTypical = Math.max(
    0,
    Math.round(liveContactTotal * modeFactor),
  );
  const roles =
    input.roleWeights?.length &&
    input.roleWeights.reduce((sum, role) => sum + role.players, 0) ===
      input.playerCount
      ? input.roleWeights
      : [{ role: "All athletes", players: input.playerCount, share: 1 }];
  const weightedPlayers = roles.reduce(
    (sum, role) => sum + role.players * role.share,
    0,
  );
  const byRole = roles.map((role) => {
    const typical = Math.max(
      0,
      Math.round((totalContactsTypical * role.share) / weightedPlayers),
    );
    return {
      role: role.role,
      players: role.players,
      touchesLow: Math.round(typical * 0.76),
      touchesTypical: typical,
      touchesHigh: Math.round(typical * 1.27),
      jumpsTypical: Math.round(typical * input.jumpShare),
    };
  });
  const allPlayerAverage =
    byRole.reduce((sum, role) => sum + role.touchesTypical * role.players, 0) /
    input.playerCount;
  const typical = Math.round(allPlayerAverage);
  return trainingContactEstimateSchema.parse({
    touchesLow: Math.round(typical * 0.76),
    touchesTypical: typical,
    touchesHigh: Math.round(typical * 1.27),
    jumpsTypical: Math.round(typical * input.jumpShare),
    totalContactsTypical,
    confidence: hasRepModel
      ? "high"
      : input.ballCount > 0 && input.durationMinutes > 0
        ? "medium"
        : "low",
    basis: hasRepModel
      ? [
          `${input.repsOrPoints} reps or points`,
          `${input.contactsPerRep} contacts per rep`,
        ]
      : [
          `${input.durationMinutes} minutes`,
          `${input.ballCount} ball${input.ballCount === 1 ? "" : "s"} live`,
          `${Math.round(input.livePlayRatio * 100)}% live-play estimate`,
        ],
    assumptions: [
      "Ranges account for interruptions, errors, and unequal rotations.",
      "Touches are planning estimates, not observed athlete measurements.",
    ],
    byRole,
  });
}

function datesBetween(startDate: string, endDate: string): string[] {
  const start = new Date(`${startDate}T12:00:00.000Z`);
  const end = new Date(`${endDate}T12:00:00.000Z`);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) return [];
  const values: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    values.push(isoDate(cursor));
  }
  return values;
}

export interface TrainingOccurrence {
  readonly localDate: string;
  readonly startsAt: string;
  readonly durationMinutes: number;
  readonly weekday: TrainingWeekday;
}

export function generateTrainingOccurrences(input: {
  readonly startDate: string;
  readonly endDate: string;
  readonly recurrence: TrainingRecurrence;
}): readonly TrainingOccurrence[] {
  const recurrence = trainingRecurrenceSchema.parse(input.recurrence);
  const start = new Date(`${input.startDate}T12:00:00.000Z`);
  if (
    Number.isNaN(start.valueOf()) ||
    input.endDate < input.startDate ||
    datesBetween(input.startDate, input.endDate).length > 1_100
  ) {
    return [];
  }
  const exclusions = new Set(recurrence.excludedDates);
  return datesBetween(input.startDate, input.endDate).flatMap((localDate) => {
    if (exclusions.has(localDate)) return [];
    const date = new Date(`${localDate}T12:00:00.000Z`);
    const weekday = DAY_NAMES[date.getUTCDay()]!;
    const weekIndex = Math.floor(
      (date.getTime() - start.getTime()) / (7 * 24 * 60 * 60_000),
    );
    if (weekIndex % recurrence.intervalWeeks !== 0) return [];
    return recurrence.days
      .filter((day) => day.day === weekday)
      .map((day) => ({
        localDate,
        startsAt: day.startsAt,
        durationMinutes: day.durationMinutes,
        weekday,
      }));
  });
}

export function countTrainingSessions(input: {
  readonly startDate: string;
  readonly endDate: string;
  readonly recurrence: TrainingRecurrence;
}): number {
  return generateTrainingOccurrences(input).length;
}

function detectFocusArea(description: string): TrainingFocusArea {
  const value = description.toLowerCase();
  const signals: readonly [RegExp, TrainingFocusArea][] = [
    [/out[ -]?of[ -]?system|oot/, "Out-of-System"],
    [/free[ -]?ball/, "Free-Ball Play"],
    [/back[ -]?row|pipe|bic/, "Back-Row Attack"],
    [/block|read the hitter|hands over/, "Blocking"],
    [/serve|serving|seam target/, "Serving"],
    [/defen[cs]e|digging|perimeter/, "Team Defense"],
    [/system|transition offense|sideout pattern/, "Offensive Systems"],
    [/footwork|approach|shuffle|crossover/, "Footwork"],
    [/location|line|angle|deep corner|shot/, "Attack Location"],
    [/set|setting|setter/, "Setting"],
    [/pass|ball control|platform|pepper/, "Ball Control"],
    [/attack|hit|swing|kill/, "Attacking"],
  ];
  return (
    signals.find(([pattern]) => pattern.test(value))?.[1] ?? "Ball Control"
  );
}

function sentences(value: string): string[] {
  return value
    .split(/(?:\n+|(?<=[.!?])\s+)/)
    .map((part) => part.trim().replace(/^[-*]\s*/, ""))
    .filter((part) => part.length > 3);
}

function sceneForFocus(
  focusArea: TrainingFocusArea,
  playerCount: number,
  ballCount: number,
) {
  const visiblePlayers = Math.min(8, Math.max(2, playerCount));
  const positions = Array.from({ length: visiblePlayers }, (_, index) => {
    const topSide = index < Math.ceil(visiblePlayers / 2);
    const sideIndex = topSide ? index : index - Math.ceil(visiblePlayers / 2);
    const sideCount = topSide
      ? Math.ceil(visiblePlayers / 2)
      : Math.floor(visiblePlayers / 2);
    return {
      id: `p${index + 1}`,
      label: String(index + 1),
      role:
        focusArea === "Setting" && index % 3 === 1
          ? "Setter"
          : focusArea === "Blocking" && index % 2 === 0
            ? "Blocker"
            : topSide
              ? "Working athlete"
              : "Defender",
      team: topSide ? ("a" as const) : ("b" as const),
      x: 18 + ((sideIndex + 1) * 64) / (sideCount + 1),
      y: topSide ? 25 + (index % 2) * 10 : 65 + (index % 2) * 10,
    };
  });
  const movements = positions
    .slice(0, Math.min(6, positions.length))
    .map((position, index) => ({
      id: `m${index + 1}`,
      from: position.id,
      to: positions[(index + 1) % positions.length]!.id,
      kind: index % 3 === 1 ? ("ball" as const) : ("player" as const),
      label: index % 3 === 1 ? "Ball path" : "Rotate",
      order: index + 1,
    }));
  return drillSceneSchema.parse({
    court: "beach-full",
    perspective: "isometric",
    positions,
    movements,
    ballCount,
    loopSeconds: 12,
  });
}

function standardTag(label: TrainingFocusArea) {
  return trainingTagSchema.parse({
    id: STANDARD_TAG_IDS.get(label),
    label,
    slug: slugify(label),
    category: "focus",
    isFocusArea: true,
  });
}

function customTag(label: string, sequence: number) {
  const normalized = normalizeTrainingTag(label);
  return trainingTagSchema.parse({
    id: demoId(800 + sequence),
    label: normalized.label,
    slug: normalized.slug,
    category: "context",
    isFocusArea: false,
  });
}

function fallbackDrillTitle(description: string, focus: TrainingFocusArea) {
  const first = sentences(description)[0];
  if (first && first.length <= 52) return first.replace(/[.!?]$/, "");
  const concepts = description
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 4)
    .slice(0, 3);
  return concepts.length > 1
    ? titleCase(concepts.join(" "))
    : `${focus} Progression`;
}

function sceneFromEditor(
  editor: DrillEditorState,
  fallbackBallCount: number,
): z.infer<typeof drillSceneSchema> {
  const phase = editor.phases[0];
  if (!phase) {
    return sceneForFocus("Ball Control", 4, fallbackBallCount);
  }
  const positions = phase.objects
    .filter((object) => ["player", "coach", "ball"].includes(object.kind))
    .map((object) => ({
      id: object.id,
      label: object.label.slice(0, 12),
      role: object.role || object.kind,
      team:
        object.kind === "coach"
          ? ("coach" as const)
          : object.team === "b"
            ? ("b" as const)
            : object.team === "a"
              ? ("a" as const)
              : ("queue" as const),
      x: object.x,
      y: object.y,
    }));
  const positionIds = new Set(positions.map((position) => position.id));
  const destinationPositions = phase.actions.flatMap((action) => {
    if (action.targetObjectId && positionIds.has(action.targetObjectId)) {
      return [];
    }
    const id = `destination-${action.id}`;
    positionIds.add(id);
    return [
      {
        id,
        label: String(action.order),
        role: "Action destination",
        team: "queue" as const,
        x: action.toX,
        y: action.toY,
      },
    ];
  });
  const allPositions = [...positions, ...destinationPositions].slice(0, 30);
  const validPositionIds = new Set(allPositions.map((position) => position.id));
  const movements = phase.actions.flatMap((action) => {
    const targetId =
      action.targetObjectId && validPositionIds.has(action.targetObjectId)
        ? action.targetObjectId
        : `destination-${action.id}`;
    if (
      !validPositionIds.has(action.actorId) ||
      !validPositionIds.has(targetId)
    ) {
      return [];
    }
    const ballAction = [
      "toss",
      "pass",
      "set",
      "attack",
      "serve",
      "dig",
      "freeball",
      "hold",
    ].includes(action.kind);
    return [
      {
        id: action.id,
        from: action.actorId,
        to: targetId,
        kind:
          action.kind === "rotate"
            ? ("rotation" as const)
            : ballAction
              ? ("ball" as const)
              : ("player" as const),
        label: action.intent || action.kind,
        order: Math.min(99, action.order),
      },
    ];
  });
  return drillSceneSchema.parse({
    court:
      editor.court === "indoor-full"
        ? "indoor-full"
        : editor.court.endsWith("half")
          ? "half-court"
          : "beach-full",
    perspective: "top",
    positions: allPositions,
    movements: movements.slice(0, 50),
    ballCount: Math.max(
      fallbackBallCount,
      phase.objects.filter((object) => object.kind === "ball").length,
    ),
    loopSeconds: Math.min(60, Math.max(2, phase.durationSeconds)),
  });
}

function fallbackInterpretation(input: {
  readonly editor?: DrillEditorState;
  readonly focusArea: TrainingFocusArea;
}) {
  const phases = input.editor?.phases ?? [];
  const phaseSummaries = (
    phases.length ? phases : [{ id: "phase-1", title: "Main drill", notes: "" }]
  ).map((phase) => ({
    phaseId: phase.id,
    purpose:
      phase.notes ||
      `Build repeatable ${input.focusArea.toLowerCase()} decisions before adding pressure.`,
    coachPosition:
      "Stand outside the primary movement and landing lane with a clear view of first contact.",
    successSignal:
      "Athletes repeat the intended contact quality without losing tempo or role clarity.",
  }));
  const objects = phases.flatMap((phase) => phase.objects ?? []);
  const actions = phases.flatMap((phase) =>
    "actions" in phase
      ? phase.actions.map((action) => ({ ...action, phaseId: phase.id }))
      : [],
  );
  return trainingDrillInterpretationSchema.parse({
    phaseSummaries,
    roles: objects
      .filter(
        (object, index, all) =>
          ["player", "coach"].includes(object.kind) &&
          all.findIndex((candidate) => candidate.label === object.label) ===
            index,
      )
      .slice(0, 12)
      .map((object) => ({
        label: object.label,
        responsibility:
          object.role ||
          `Execute the assigned ${input.focusArea.toLowerCase()} role.`,
        touchIntent:
          "Create a controlled, intentional contact for the next player.",
      })),
    contactSequence: actions.slice(0, 40).map((action, index) => ({
      order: index + 1,
      phaseId: action.phaseId,
      actor:
        objects.find((object) => object.id === action.actorId)?.label ??
        "Assigned athlete",
      contact:
        action.kind === "move" || action.kind === "rotate"
          ? "movement"
          : action.kind,
      intent: action.intent || `Complete the ${action.kind} action on time.`,
    })),
    progression: {
      prerequisites: [
        `Athletes can execute the core ${input.focusArea.toLowerCase()} skill in a controlled pattern.`,
      ],
      simplify:
        "Remove the scoring consequence, reduce movement, and allow a controlled coach entry.",
      progress:
        "Add a live read, a second ball, or a wash point after the intended quality is stable.",
      programFit:
        "Use after technical activation and before the most game-like segment of practice.",
      nextDrill:
        "Progress into a live scoring game that preserves the same first decision and role responsibilities.",
    },
    fidelityNotes: [
      "Confirm every ball entry, contact order, and rotation before sharing the animation.",
    ],
  });
}

function buildFallbackDrill(
  rawInput: DraftTrainingDrillInput,
  now: Date,
): TrainingDrill {
  const input = draftTrainingDrillInputSchema.parse(rawInput);
  const focusArea = input.focusArea ?? detectFocusArea(input.description);
  const title =
    input.titleHint || fallbackDrillTitle(input.description, focusArea);
  const descriptionSentences = sentences(input.description);
  const roleWeights = /setter/i.test(input.description)
    ? [
        { role: "Setter", players: 1, share: 1.35 },
        {
          role: "Attackers and passers",
          players: Math.max(1, input.playerCount - 1),
          share: 0.95,
        },
      ]
    : undefined;
  const estimate = estimateTrainingContacts({
    durationMinutes: input.durationMinutes,
    playerCount: input.playerCount,
    ballCount: input.ballCount,
    mode: input.mode,
    contactsPerMinutePerBall:
      input.mode === "competitive" ? 3.8 : input.mode === "individual" ? 6 : 5,
    livePlayRatio: input.mode === "competitive" ? 0.58 : 0.72,
    jumpShare: /attack|hit|block|jump|serve/i.test(input.description)
      ? 0.22
      : 0.07,
    ...(roleWeights ? { roleWeights } : {}),
  });
  const interpretation = fallbackInterpretation({
    editor: input.editor,
    focusArea,
  });
  const steps = descriptionSentences.length
    ? descriptionSentences.slice(0, 8)
    : [
        "Place athletes in balanced working groups.",
        "Start with controlled tempo and confirm the movement pattern.",
        "Add scoring once athletes sustain the intended quality.",
        "Rotate roles on a fixed cadence so opportunity stays balanced.",
      ];
  return trainingDrillSchema.parse({
    id: demoId(901),
    versionId: demoId(902),
    version: 1,
    title,
    slug: slugify(title),
    status: "draft",
    visibility: "organization",
    ownership: "organization",
    activityKind: "drill",
    discipline: input.discipline,
    skillLevel: input.skillLevel,
    mode: input.mode,
    purpose: `Build ${focusArea.toLowerCase()} quality under repeatable, coachable conditions.`,
    targetAudience: `${input.skillLevel} athletes in groups of ${input.minPlayers}–${input.maxPlayers}.`,
    summary: `${input.durationMinutes}-minute ${input.mode} ${focusArea.toLowerCase()} progression with balanced repetitions and a clear competitive finish.`,
    descriptionMarkdown: [
      `## Why this works`,
      `This progression turns the coach's description into a repeatable court pattern while preserving room to adjust tempo and scoring.`,
      `## Flow`,
      ...steps.map((step, index) => `${index + 1}. ${step}`),
    ].join("\n\n"),
    minPlayers: input.minPlayers,
    maxPlayers: Math.max(input.minPlayers, input.maxPlayers),
    recommendedPlayers: clamp(
      input.playerCount,
      input.minPlayers,
      Math.max(input.minPlayers, input.maxPlayers),
    ),
    durationMinutes: input.durationMinutes,
    intensity: input.intensity,
    ballCount: input.ballCount,
    equipment: [
      ...(input.ballCount
        ? [`${input.ballCount} volleyball${input.ballCount === 1 ? "" : "s"}`]
        : []),
      "Court markers",
      "Scoreboard or score cards",
    ],
    focusArea,
    tags: [
      standardTag(focusArea),
      customTag(input.mode, 1),
      customTag(input.skillLevel, 2),
    ],
    steps,
    coachingCues: [
      `Name the ${focusArea.toLowerCase()} quality before each round.`,
      "Keep the next athlete ready before the ball finishes.",
      "Reward the intended decision, not only the point result.",
    ],
    safety: [
      "Keep waiting athletes outside active movement and landing lanes.",
      "Pause when loose balls enter another group's court.",
    ],
    variations: [
      "Reduce court space to increase reading speed.",
      "Add a wash point so teams must confirm quality twice.",
      "Assign role-specific scoring to change the touch distribution.",
    ],
    scoring:
      input.mode === "cooperative"
        ? "Build a shared streak, then finish with a short competitive round."
        : "First side to seven; win by two. Award one bonus point for the stated focus behavior.",
    estimate,
    scene: input.editor
      ? sceneFromEditor(input.editor, input.ballCount)
      : sceneForFocus(focusArea, input.playerCount, input.ballCount),
    ...(input.editor ? { editor: input.editor } : {}),
    interpretation,
    animation: {
      status: "ready",
      kind: "duna-scene",
      reviewed: false,
      altText: `Animated court diagram for ${title}, showing player rotations and ball paths.`,
      renderModel: "gpt_image_2",
      directorBrief:
        "Render the coach-confirmed court, roles, contacts, and movement order without inventing players or ball paths.",
      storyboardPrompt:
        "Clean volleyball coaching storyboard with a readable court, ordered contacts, stable player identities, and one phase per frame.",
      negativePrompt:
        "basketball court, missing net, extra players, duplicate balls, changed uniforms, unreadable labels, impossible ball trajectory",
      qaChecklist: [
        "Every player and coach matches the editor.",
        "Ball contacts appear in the specified order.",
        "The net, court orientation, and phase continuity remain stable.",
      ],
    },
    updatedAt: now.toISOString(),
  });
}

const aiDrillDraftSchema = z.object({
  title: z.string().trim().min(2).max(120),
  purpose: z.string().trim().min(10).max(800),
  targetAudience: z.string().trim().min(3).max(500),
  summary: z.string().trim().min(10).max(500),
  focusArea: trainingFocusAreaSchema,
  steps: z.array(z.string().trim().min(3).max(500)).min(3).max(10),
  coachingCues: z.array(z.string().trim().min(3).max(300)).min(2).max(8),
  safety: z.array(z.string().trim().min(3).max(300)).min(1).max(6),
  variations: z.array(z.string().trim().min(3).max(300)).min(1).max(6),
  scoring: z.string().trim().min(3).max(800),
  equipment: z.array(z.string().trim().min(1).max(120)).max(15),
  contactsPerMinutePerBall: z.number().min(0.5).max(15),
  livePlayRatio: z.number().min(0.1).max(0.95),
  jumpShare: z.number().min(0).max(0.8),
  extraTags: z.array(z.string().trim().min(2).max(60)).max(5),
  scene: drillSceneSchema.superRefine((scene, context) => {
    const positionIds = new Set(scene.positions.map((position) => position.id));
    for (const [index, movement] of scene.movements.entries()) {
      if (!positionIds.has(movement.from)) {
        context.addIssue({
          code: "custom",
          path: ["movements", index, "from"],
          message: "Movement origin must reference a scene position.",
        });
      }
      if (!positionIds.has(movement.to)) {
        context.addIssue({
          code: "custom",
          path: ["movements", index, "to"],
          message: "Movement destination must reference a scene position.",
        });
      }
    }
  }),
  interpretation: trainingDrillInterpretationSchema,
});

const aiAnimationDirectorSchema = z.object({
  directorBrief: z.string().trim().min(20).max(8_000),
  storyboardPrompt: z.string().trim().min(20).max(12_000),
  negativePrompt: z.string().trim().min(10).max(4_000),
  qaChecklist: z.array(z.string().trim().min(3).max(300)).min(4).max(16),
});

function trainingAiRuntime() {
  const apiKey =
    process.env.AI_GATEWAY_API_KEY?.trim() ||
    process.env.VERCEL_OIDC_TOKEN?.trim();
  if (!apiKey) return undefined;
  return {
    modelProvider: new OpenAIProvider({
      apiKey,
      baseURL: "https://ai-gateway.vercel.sh/v1",
      cacheResponsesWebSocketModels: false,
      useResponses: true,
    }),
    model: process.env.DUNA_TRAINING_MODEL?.trim() || "openai/gpt-5.6-sol",
    imageModel: process.env.DUNA_TRAINING_IMAGE_MODEL?.trim() || "gpt_image_2",
  };
}

export async function draftTrainingDrill(
  rawInput: DraftTrainingDrillInput,
  now = new Date(),
): Promise<TrainingDrill> {
  const input = draftTrainingDrillInputSchema.parse(rawInput);
  const fallback = buildFallbackDrill(input, now);
  const runtime = trainingAiRuntime();
  if (!runtime) return fallback;
  const agent = new Agent({
    name: "Duna Volleyball Methodologist",
    model: runtime.model,
    outputType: aiDrillDraftSchema,
    modelSettings: {
      reasoning: { effort: "high" },
      text: { verbosity: "low" },
    },
    instructions: [
      "Turn a volleyball coach's natural-language drill description into a precise, safe, teachable drill draft.",
      "Preserve the coach's intent. Do not invent medical claims or imply that touch estimates are observed measurements.",
      `Use exactly one canonical focus area from: ${TRAINING_FOCUS_AREAS.join(", ")}.`,
      "Steps must explain setup, motion, role rotation, and finish condition. Include concise coaching cues, court safety, scalable variations, equipment, and unambiguous scoring.",
      "Estimate only the pace, live-play ratio, and jump share. Duna computes touch ranges deterministically after your draft.",
      "Create an isometric court scene with stable position IDs, coordinates from 0 to 100, and ordered player, ball, and rotation paths that faithfully explain the coach's motion. Every movement endpoint must reference a position in the scene.",
      "If an editor canvas is supplied, treat its phases, objects, player roles, ball entry type, initiator, ball order, action order, targets, and notes as authoritative. Never invent a contact that contradicts that canvas.",
      "Explain how to run and coach every phase, identify each role and contact intent, and place the drill in a sensible progression with prerequisites, a simplification, a progression, program fit, and a next drill.",
      "Do not copy named third-party drills or source language. Produce original Duna coaching content.",
    ].join("\n"),
  });
  try {
    const result = await run(agent, JSON.stringify(input), {
      maxTurns: 4,
      ...(runtime.modelProvider
        ? { modelProvider: runtime.modelProvider }
        : {}),
    });
    const generated = aiDrillDraftSchema.parse(result.finalOutput);
    const estimate = estimateTrainingContacts({
      durationMinutes: input.durationMinutes,
      playerCount: input.playerCount,
      ballCount: input.ballCount,
      mode: input.mode,
      contactsPerMinutePerBall: generated.contactsPerMinutePerBall,
      livePlayRatio: generated.livePlayRatio,
      jumpShare: generated.jumpShare,
    });
    const interpreted = trainingDrillSchema.parse({
      ...fallback,
      title: input.titleHint || generated.title,
      slug: slugify(input.titleHint || generated.title),
      purpose: generated.purpose,
      targetAudience: generated.targetAudience,
      summary: generated.summary,
      descriptionMarkdown: [
        "## Purpose",
        generated.purpose,
        "## Flow",
        ...generated.steps.map((step, index) => `${index + 1}. ${step}`),
        "## Scoring",
        generated.scoring,
      ].join("\n\n"),
      focusArea: generated.focusArea,
      steps: generated.steps,
      coachingCues: generated.coachingCues,
      safety: generated.safety,
      variations: generated.variations,
      scoring: generated.scoring,
      equipment: generated.equipment,
      tags: [
        standardTag(generated.focusArea),
        ...generated.extraTags
          .slice(0, 4)
          .map((tag, index) => customTag(tag, index + 1)),
      ],
      estimate,
      scene: generated.scene,
      ...(input.editor ? { editor: input.editor } : {}),
      interpretation: generated.interpretation,
      animation: {
        ...fallback.animation,
        altText: `Animated court diagram for ${input.titleHint || generated.title}, showing player rotations and ball paths.`,
      },
    });
    const animationAgent = new Agent({
      name: "Duna Volleyball Animation Director",
      model: runtime.model,
      outputType: aiAnimationDirectorSchema,
      modelSettings: {
        reasoning: { effort: "high" },
        text: { verbosity: "low" },
      },
      instructions: [
        "Direct a technically exact volleyball drill storyboard for an image and animation model.",
        "The supplied editor canvas and methodologist interpretation are authoritative. Preserve the court type, net, player count, coach positions, ball entry, ball ownership, contact order, movement order, roles, targets, and phase continuity.",
        "Write a production-ready visual brief and storyboard prompt. Describe camera, court geometry, stable identities, ordered action beats, timing, labels, and transitions. Prefer a clean elevated three-quarter coaching view unless the canvas requests top-down.",
        "The render must teach the drill at a glance. Do not add spectacle, crowds, text overlays, logos, anatomy closeups, extra athletes, extra balls, basketball markings, or physically impossible trajectories.",
        "End with a concrete QA checklist a coach can use before publication.",
      ].join("\n"),
    });
    try {
      const animationResult = await run(
        animationAgent,
        JSON.stringify({
          renderModel: runtime.imageModel,
          coachBrief: input.description,
          editor: input.editor,
          drill: {
            title: interpreted.title,
            discipline: interpreted.discipline,
            purpose: interpreted.purpose,
            steps: interpreted.steps,
            coachingCues: interpreted.coachingCues,
            scene: interpreted.scene,
            interpretation: interpreted.interpretation,
          },
        }),
        {
          maxTurns: 3,
          ...(runtime.modelProvider
            ? { modelProvider: runtime.modelProvider }
            : {}),
        },
      );
      const direction = aiAnimationDirectorSchema.parse(
        animationResult.finalOutput,
      );
      return trainingDrillSchema.parse({
        ...interpreted,
        animation: {
          ...interpreted.animation,
          renderModel:
            runtime.imageModel === "nano_banana_pro"
              ? "nano_banana_pro"
              : "gpt_image_2",
          ...direction,
        },
      });
    } catch {
      return interpreted;
    }
  } catch {
    return fallback;
  }
}

function dayDifference(left: string, right: string): number {
  const leftDate = new Date(`${left}T12:00:00.000Z`);
  const rightDate = new Date(`${right}T12:00:00.000Z`);
  return Math.round((rightDate.getTime() - leftDate.getTime()) / 86_400_000);
}

function phaseForProgress(progress: number) {
  if (progress < 0.24) {
    return {
      name: "Foundation",
      loadIntent: "build" as const,
      defaultLoad: 58,
      focusAreas: ["Ball Control", "Footwork"] as const,
      objective: "Establish repeatable movement and first-contact quality.",
    };
  }
  if (progress < 0.58) {
    return {
      name: "Build",
      loadIntent: "build" as const,
      defaultLoad: 72,
      focusAreas: ["Attacking", "Setting", "Blocking"] as const,
      objective: "Increase quality repetitions and decision pressure.",
    };
  }
  if (progress < 0.84) {
    return {
      name: "Integrate",
      loadIntent: "maintain" as const,
      defaultLoad: 68,
      focusAreas: [
        "Offensive Systems",
        "Team Defense",
        "Out-of-System",
      ] as const,
      objective: "Connect skills in game-like, opponent-aware sequences.",
    };
  }
  return {
    name: "Sharpen",
    loadIntent: "taper" as const,
    defaultLoad: 46,
    focusAreas: ["Serving", "Attack Location", "Free-Ball Play"] as const,
    objective: "Preserve speed and confidence while reducing fatigue.",
  };
}

function milestoneLoadAdjustment(
  localDate: string,
  milestones: z.infer<typeof draftTrainingProgramInputSchema>["milestones"],
): { readonly load?: number; readonly rationale?: string } {
  const keyTournament = milestones
    .filter((milestone) => ["tournament", "travel"].includes(milestone.kind))
    .map((milestone) => ({
      ...milestone,
      daysAway: dayDifference(localDate, milestone.startsOn),
    }))
    .filter((milestone) => milestone.daysAway >= -1 && milestone.daysAway <= 7)
    .sort((a, b) => a.daysAway - b.daysAway)[0];
  if (!keyTournament) return {};
  if (keyTournament.daysAway <= 0) {
    return {
      load: keyTournament.kind === "travel" ? 20 : 28,
      rationale: `${keyTournament.title} is here; prioritize readiness and concise activation.`,
    };
  }
  if (keyTournament.daysAway <= 2) {
    return {
      load: 38,
      rationale: `Taper ${keyTournament.daysAway} day${keyTournament.daysAway === 1 ? "" : "s"} before ${keyTournament.title}.`,
    };
  }
  if (keyTournament.daysAway <= 4) {
    return {
      load: 52,
      rationale: `Keep intent high while reducing volume before ${keyTournament.title}.`,
    };
  }
  return {
    load: 64,
    rationale: `Final game-like exposure before the ${keyTournament.title} taper.`,
  };
}

function phaseDateRange(
  startDate: string,
  endDate: string,
  startProgress: number,
  endProgress: number,
) {
  const totalDays = Math.max(0, dayDifference(startDate, endDate));
  return {
    startsOn: isoDate(
      addDays(
        new Date(`${startDate}T12:00:00.000Z`),
        Math.floor(totalDays * startProgress),
      ),
    ),
    endsOn: isoDate(
      addDays(
        new Date(`${startDate}T12:00:00.000Z`),
        Math.floor(totalDays * endProgress),
      ),
    ),
  };
}

function fallbackProgramDraft(
  rawInput: DraftTrainingProgramInput,
): TrainingProgramDraft {
  const input = draftTrainingProgramInputSchema.parse(rawInput);
  const baseOccurrences = generateTrainingOccurrences(input);
  const phases = [
    {
      ...phaseForProgress(0),
      ...phaseDateRange(input.startDate, input.endDate, 0, 0.24),
    },
    {
      ...phaseForProgress(0.3),
      ...phaseDateRange(input.startDate, input.endDate, 0.25, 0.58),
    },
    {
      ...phaseForProgress(0.65),
      ...phaseDateRange(input.startDate, input.endDate, 0.59, 0.84),
    },
    {
      ...phaseForProgress(0.9),
      ...phaseDateRange(input.startDate, input.endDate, 0.85, 1),
    },
  ];
  const occurrences = baseOccurrences.map((occurrence, index) => {
    const progress =
      baseOccurrences.length <= 1 ? 0 : index / (baseOccurrences.length - 1);
    const phase = phaseForProgress(progress);
    const focusArea = phase.focusAreas[index % phase.focusAreas.length]!;
    const adjustment = milestoneLoadAdjustment(
      occurrence.localDate,
      input.milestones,
    );
    return {
      localDate: occurrence.localDate,
      startsAt: occurrence.startsAt,
      durationMinutes: occurrence.durationMinutes,
      title: `${phase.name} · ${focusArea}`,
      phase: phase.name,
      focusArea,
      plannedLoad: adjustment.load ?? phase.defaultLoad,
      rationale:
        adjustment.rationale ??
        `${phase.objective} This session emphasizes ${focusArea.toLowerCase()}.`,
    };
  });
  const collisionWarnings = input.milestones.flatMap((milestone) => {
    const collisions = occurrences.filter(
      (occurrence) =>
        occurrence.localDate >= milestone.startsOn &&
        occurrence.localDate <= milestone.endsOn,
    );
    return collisions.length
      ? [
          `${collisions.length} scheduled practice${collisions.length === 1 ? "" : "s"} overlap ${milestone.title}; they are retained for coach review.`,
        ]
      : [];
  });
  return trainingProgramDraftSchema.parse({
    summary: `${input.title} builds from repeatable fundamentals into game-like integration, then lowers volume around key competition and travel dates.`,
    phaseStrategy: phases.map((phase) => ({
      name: phase.name,
      startsOn: phase.startsOn,
      endsOn: phase.endsOn,
      objective: phase.objective,
      loadIntent: phase.loadIntent,
      focusAreas: [...phase.focusAreas],
    })),
    occurrences,
    scheduledSessionCount: occurrences.length,
    plannedMinutes: occurrences.reduce(
      (sum, occurrence) => sum + occurrence.durationMinutes,
      0,
    ),
    assumptions: [
      "Practice dates follow the chosen local weekdays and times.",
      "Load is a coach planning signal from 0–100, not a medical readiness score.",
      "Competition and travel dates reduce nearby practice volume but never silently remove a session.",
    ],
    warnings: collisionWarnings,
    providerAvailable: false,
  });
}

const aiProgramStrategySchema = z.object({
  summary: z.string().trim().min(20).max(1_000),
  phases: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(80),
        objective: z.string().trim().min(10).max(500),
        loadIntent: z.enum(["build", "maintain", "recover", "taper"]),
        focusAreas: z.array(trainingFocusAreaSchema).min(1).max(4),
      }),
    )
    .min(2)
    .max(6),
  assumptions: z.array(z.string().trim().min(5).max(400)).max(8),
  warnings: z.array(z.string().trim().min(5).max(400)).max(8),
});

export async function draftTrainingProgram(
  rawInput: DraftTrainingProgramInput,
): Promise<TrainingProgramDraft> {
  const input = draftTrainingProgramInputSchema.parse(rawInput);
  const fallback = fallbackProgramDraft(input);
  const runtime = trainingAiRuntime();
  if (!runtime) return fallback;
  const agent = new Agent({
    name: "Duna Program Designer",
    model: runtime.model,
    outputType: aiProgramStrategySchema,
    modelSettings: {
      reasoning: { effort: "high" },
      text: { verbosity: "low" },
    },
    instructions: [
      "Design an original volleyball training program strategy from a bounded coach brief.",
      "Respect every supplied date, tournament, travel day, practice frequency, objective, and coaching approach.",
      `Use only these canonical focus areas: ${TRAINING_FOCUS_AREAS.join(", ")}.`,
      "Periodize with understandable phases. Reduce volume around key tournaments and travel without making injury, health, or readiness predictions.",
      "Do not name individual athletes or infer protected traits. Do not copy proprietary programs.",
      "Duna generates and counts the exact calendar separately; provide strategy, assumptions, and conflicts only.",
    ].join("\n"),
  });
  try {
    const result = await run(agent, JSON.stringify(input), {
      maxTurns: 4,
      ...(runtime.modelProvider
        ? { modelProvider: runtime.modelProvider }
        : {}),
    });
    const generated = aiProgramStrategySchema.parse(result.finalOutput);
    const phaseCount = generated.phases.length;
    const occurrences = fallback.occurrences.map((occurrence, index) => {
      const progress =
        fallback.occurrences.length <= 1
          ? 0
          : index / (fallback.occurrences.length - 1);
      const phaseIndex = Math.min(
        phaseCount - 1,
        Math.floor(progress * phaseCount),
      );
      const phase = generated.phases[phaseIndex]!;
      const focusArea = phase.focusAreas[index % phase.focusAreas.length]!;
      const milestoneAdjustment = milestoneLoadAdjustment(
        occurrence.localDate,
        input.milestones,
      );
      const intentLoad = {
        build: 70,
        maintain: 62,
        recover: 34,
        taper: 44,
      }[phase.loadIntent];
      return {
        ...occurrence,
        title: `${phase.name} · ${focusArea}`,
        phase: phase.name,
        focusArea,
        plannedLoad: milestoneAdjustment.load ?? intentLoad,
        rationale: milestoneAdjustment.rationale ?? phase.objective,
      };
    });
    return trainingProgramDraftSchema.parse({
      ...fallback,
      summary: generated.summary,
      phaseStrategy: generated.phases.map((phase, index) => {
        const starts = index / phaseCount;
        const ends = (index + 1) / phaseCount;
        return {
          ...phase,
          ...phaseDateRange(input.startDate, input.endDate, starts, ends),
        };
      }),
      occurrences,
      assumptions: [...fallback.assumptions, ...generated.assumptions].slice(
        0,
        10,
      ),
      warnings: [...fallback.warnings, ...generated.warnings].slice(0, 10),
      providerAvailable: true,
    });
  } catch {
    return fallback;
  }
}

function demoDrill(
  input: {
    readonly sequence: number;
    readonly title: string;
    readonly description: string;
    readonly purpose: string;
    readonly focusArea: TrainingFocusArea;
    readonly mode: "cooperative" | "competitive" | "hybrid" | "individual";
    readonly durationMinutes: number;
    readonly intensity: number;
    readonly ballCount: number;
    readonly playerCount: number;
    readonly minPlayers?: number;
    readonly maxPlayers?: number;
    readonly visibility?: "organization" | "public";
    readonly ownership?: "organization" | "duna" | "shared";
    readonly extraTags: readonly string[];
    readonly steps: readonly string[];
    readonly cues: readonly string[];
    readonly scoring: string;
  },
  now: Date,
): TrainingDrill {
  const base = buildFallbackDrill(
    {
      description: input.description,
      titleHint: input.title,
      discipline: "beach-2s",
      skillLevel: "Intermediate–Advanced",
      mode: input.mode,
      playerCount: input.playerCount,
      minPlayers: input.minPlayers ?? 4,
      maxPlayers: input.maxPlayers ?? 12,
      durationMinutes: input.durationMinutes,
      ballCount: input.ballCount,
      intensity: input.intensity,
      focusArea: input.focusArea,
    },
    now,
  );
  return trainingDrillSchema.parse({
    ...base,
    id: demoId(100 + input.sequence),
    versionId: demoId(200 + input.sequence),
    version: input.sequence % 3 === 0 ? 3 : input.sequence % 2 === 0 ? 2 : 1,
    title: input.title,
    slug: slugify(input.title),
    status: "published",
    visibility: input.visibility ?? "organization",
    ownership: input.ownership ?? "organization",
    purpose: input.purpose,
    summary: input.description,
    descriptionMarkdown: [
      "## Purpose",
      input.purpose,
      "## Setup and flow",
      ...input.steps.map((step, index) => `${index + 1}. ${step}`),
      "## Scoring",
      input.scoring,
    ].join("\n\n"),
    focusArea: input.focusArea,
    tags: [
      standardTag(input.focusArea),
      ...input.extraTags.map((tag, index) =>
        trainingTagSchema.parse({
          ...customTag(tag, input.sequence * 10 + index),
          id: demoId(500 + input.sequence * 10 + index),
        }),
      ),
    ],
    steps: input.steps,
    coachingCues: input.cues,
    scoring: input.scoring,
    animation: {
      status: "ready",
      kind: "duna-scene",
      reviewed: input.sequence < 5,
      altText: `Animated isometric court diagram for ${input.title}.`,
    },
    updatedAt: addDays(now, -input.sequence * 2).toISOString(),
  });
}

function buildDemoDrills(now: Date): readonly TrainingDrill[] {
  return [
    demoDrill(
      {
        sequence: 1,
        title: "First-Ball Sideout Lab",
        description:
          "Pairs earn quality before speed: pass to target, setter releases from the net, and attacker solves line or angle against a live defender.",
        purpose:
          "Connect first contact, setter movement, and an intentional attacking decision in one repeatable sideout pattern.",
        focusArea: "Ball Control",
        mode: "hybrid",
        durationMinutes: 16,
        intensity: 7,
        ballCount: 3,
        playerCount: 8,
        visibility: "public",
        ownership: "duna",
        extraTags: ["Sideout", "Decision Making", "Serve Receive"],
        steps: [
          "Create two working courts with one server, one pair, and one defender on each.",
          "Server initiates; the pair must pass and set before attacking line or angle.",
          "A controlled kill or defender-touchable ball keeps the pair on; an error rotates immediately.",
          "After four initiations, rotate server → defender → working pair.",
        ],
        cues: [
          "Beat the ball to the passing window.",
          "Setter releases before the passer contacts the ball.",
          "See the defender before choosing the finish.",
        ],
        scoring:
          "One point for a three-contact sideout, plus one for attacking the called open space. First pair to eight.",
      },
      now,
    ),
    demoDrill(
      {
        sequence: 2,
        title: "Five-Point Wash",
        description:
          "Two teams play game-like rallies but must win a serve-receive ball and a transition ball to bank the wash point.",
        purpose:
          "Build the ability to repeat quality after a successful rally instead of treating one point as complete.",
        focusArea: "Offensive Systems",
        mode: "competitive",
        durationMinutes: 18,
        intensity: 8,
        ballCount: 2,
        playerCount: 8,
        visibility: "public",
        ownership: "shared",
        extraTags: ["Wash Scoring", "Transition", "Game Like"],
        steps: [
          "Start with a live serve to the receiving team.",
          "The winner immediately receives a coach-initiated transition ball.",
          "Winning both rallies banks one wash point; split rallies and the wash resets.",
          "Rotate waiting teams every three wash attempts.",
        ],
        cues: [
          "Reset your spacing before the second ball enters.",
          "Use the same call system in both serve receive and transition.",
          "Finish with intent; avoid gifting the confirming rally.",
        ],
        scoring: "First team to five wash points; cap each game at 12 minutes.",
      },
      now,
    ),
    demoDrill(
      {
        sequence: 3,
        title: "High Hands, Deep Corners",
        description:
          "Attackers alternate high-hands and deep-corner solutions while defenders show changing block and peel pictures.",
        purpose:
          "Train attackers to read the defensive picture and choose a high-value location rather than predetermine the swing.",
        focusArea: "Attack Location",
        mode: "competitive",
        durationMinutes: 14,
        intensity: 8,
        ballCount: 3,
        playerCount: 6,
        extraTags: ["Attacking", "Vision", "Block Use"],
        steps: [
          "Coach tosses to a setter as the defender chooses block, peel, or late pull.",
          "Attacker calls the picture after takeoff and finishes high hands or deep corner.",
          "Defenders play the rally out when the ball remains live.",
          "Rotate attacker → defender → setter after five balls.",
        ],
        cues: [
          "Stay tall long enough to keep both corners available.",
          "Track the outside hand when using the block.",
          "Use full approach rhythm even on controlled finishes.",
        ],
        scoring:
          "Two points for the correct read and clean finish, one for the correct read kept in play, defender earns two for a controlled dig.",
      },
      now,
    ),
    demoDrill(
      {
        sequence: 4,
        title: "Setter Release Compass",
        description:
          "Setters release from four defensive starting points and deliver a hittable ball after an imperfect pass.",
        purpose:
          "Improve setter footwork, early release, and location consistency from realistic defensive positions.",
        focusArea: "Setting",
        mode: "cooperative",
        durationMinutes: 12,
        intensity: 5,
        ballCount: 4,
        playerCount: 8,
        minPlayers: 4,
        maxPlayers: 16,
        extraTags: ["Footwork", "Location", "Out of System"],
        steps: [
          "Place a setter at each compass cone: short line, deep line, short angle, deep angle.",
          "Coach tosses an off-target pass as the setter releases to the ball.",
          "Setter squares to target and sets to a stationary catching window.",
          "Complete three quality sets, then move clockwise to the next starting point.",
        ],
        cues: [
          "Release on the passer's platform angle, not after the ball peaks.",
          "Finish through the target with quiet hands.",
          "Choose a stable platform set when balance is lost.",
        ],
        scoring:
          "Groups build a shared streak of sets that enter the target window; reset only after two misses in a row.",
      },
      now,
    ),
    demoDrill(
      {
        sequence: 5,
        title: "Serve the Seam Ladder",
        description:
          "Servers climb a pressure ladder by hitting seam zones while receiving pairs score for early calls and target-quality passes.",
        purpose:
          "Develop repeatable serving intent and resilient communication under a visible score.",
        focusArea: "Serving",
        mode: "competitive",
        durationMinutes: 12,
        intensity: 6,
        ballCount: 6,
        playerCount: 10,
        minPlayers: 4,
        maxPlayers: 18,
        visibility: "public",
        ownership: "duna",
        extraTags: ["Serve Receive", "Pressure", "Communication"],
        steps: [
          "Mark three seam targets: short, middle, and deep.",
          "Server names the target before serving and advances one rung for a hit.",
          "Receiving pair earns a counterpoint for an early call and pass inside the setting window.",
          "Rotate after six serves or when the server completes all three rungs.",
        ],
        cues: [
          "Keep the same toss and let the contact shape the location.",
          "Passers solve responsibility before the ball crosses the net.",
          "Reset breath and routine after every miss.",
        ],
        scoring:
          "Server needs short, middle, and deep seam in order. Receiving pair wins the round with four target passes before the ladder is complete.",
      },
      now,
    ),
    demoDrill(
      {
        sequence: 6,
        title: "Block-to-Dig Read Chain",
        description:
          "Blocker and defender read live approach cues, coordinate line or angle, and convert the dig into a transition swing.",
        purpose:
          "Connect blocking decisions to defender starting position and the first transition action.",
        focusArea: "Team Defense",
        mode: "hybrid",
        durationMinutes: 15,
        intensity: 8,
        ballCount: 3,
        playerCount: 8,
        extraTags: ["Blocking", "Reading", "Transition"],
        steps: [
          "Coach initiates to an attacking pair while defenders begin in neutral base.",
          "Blocker calls the scheme before the set peaks; defender confirms responsibility.",
          "Play through one transition opportunity after any controlled dig.",
          "Defending pair rotates out after three balls; attackers switch roles.",
        ],
        cues: [
          "Read approach line before chasing the hitter's arm.",
          "Defender moves from the block call, not from habit.",
          "Turn a dig into offense with the first contact height.",
        ],
        scoring:
          "Defense earns one for a controlled dig and two more for winning the transition rally; attack earns one for a clean sideout.",
      },
      now,
    ),
  ];
}

function buildDemoPracticePlan(
  drills: readonly TrainingDrill[],
  now: Date,
): TrainingPracticePlan {
  const firstBall = drills[0]!;
  const wash = drills[1]!;
  const attacking = drills[2]!;
  const blocks = [
    {
      id: demoId(301),
      sequence: 1,
      lane: "all",
      title: "Move, see, connect",
      kind: "warmup" as const,
      startsAtMinute: 0,
      durationMinutes: 10,
      transitionMinutes: 2,
      intensity: 3,
      plannedLoad: 24,
      focusArea: "Footwork" as const,
      instructions:
        "Dynamic movement into partner ball-control patterns. Finish with two approach rhythms on each side.",
      touchesTypical: 24,
      jumpsTypical: 4,
      locked: true,
    },
    {
      id: demoId(302),
      sequence: 2,
      lane: "all",
      title: firstBall.title,
      kind: "drill" as const,
      drillId: firstBall.id,
      startsAtMinute: 12,
      durationMinutes: 16,
      transitionMinutes: 2,
      intensity: 7,
      plannedLoad: 66,
      focusArea: firstBall.focusArea,
      instructions:
        "Two courts; shorten the first cooperative round to four minutes.",
      touchesTypical: firstBall.estimate.touchesTypical,
      jumpsTypical: firstBall.estimate.jumpsTypical,
      locked: false,
    },
    {
      id: demoId(303),
      sequence: 3,
      lane: "Court 1",
      title: attacking.title,
      kind: "drill" as const,
      drillId: attacking.id,
      startsAtMinute: 30,
      durationMinutes: 14,
      transitionMinutes: 2,
      intensity: 8,
      plannedLoad: 76,
      focusArea: attacking.focusArea,
      touchesTypical: attacking.estimate.touchesTypical,
      jumpsTypical: attacking.estimate.jumpsTypical,
      locked: false,
    },
    {
      id: demoId(304),
      sequence: 3,
      lane: "Court 2",
      title: "Setter Release Compass",
      kind: "drill" as const,
      drillId: drills[3]!.id,
      startsAtMinute: 30,
      durationMinutes: 14,
      transitionMinutes: 2,
      intensity: 5,
      plannedLoad: 48,
      focusArea: "Setting" as const,
      touchesTypical: drills[3]!.estimate.touchesTypical,
      jumpsTypical: drills[3]!.estimate.jumpsTypical,
      locked: false,
    },
    {
      id: demoId(305),
      sequence: 4,
      lane: "all",
      title: wash.title,
      kind: "drill" as const,
      drillId: wash.id,
      startsAtMinute: 46,
      durationMinutes: 22,
      transitionMinutes: 3,
      intensity: 9,
      plannedLoad: 84,
      focusArea: wash.focusArea,
      instructions:
        "Play to three wash points, then switch the receiving side.",
      touchesTypical: Math.round(wash.estimate.touchesTypical * (22 / 18)),
      jumpsTypical: Math.round(wash.estimate.jumpsTypical * (22 / 18)),
      locked: true,
    },
    {
      id: demoId(306),
      sequence: 5,
      lane: "all",
      title: "Serve under consequence",
      kind: "drill" as const,
      drillId: drills[4]!.id,
      startsAtMinute: 71,
      durationMinutes: 12,
      transitionMinutes: 2,
      intensity: 6,
      plannedLoad: 54,
      focusArea: "Serving" as const,
      touchesTypical: drills[4]!.estimate.touchesTypical,
      jumpsTypical: drills[4]!.estimate.jumpsTypical,
      locked: false,
    },
    {
      id: demoId(307),
      sequence: 6,
      lane: "all",
      title: "Downshift + reflect",
      kind: "cool-down" as const,
      startsAtMinute: 85,
      durationMinutes: 5,
      transitionMinutes: 0,
      intensity: 1,
      plannedLoad: 10,
      instructions:
        "Breathing reset, lower-leg mobility, and one athlete-led reflection on first-ball quality.",
      touchesTypical: 0,
      jumpsTypical: 0,
      locked: true,
    },
  ];
  return trainingPracticePlanSchema.parse({
    id: demoId(300),
    versionId: demoId(310),
    version: 4,
    title: "Sideout Under Pressure",
    slug: "sideout-under-pressure",
    purpose:
      "Carry first-contact quality through attack choice, transition, and late-practice serving pressure.",
    targetAudience:
      "Competitive 16U–18U beach athletes; 8–12 players on two courts.",
    status: "published",
    visibility: "organization",
    durationMinutes: 90,
    plannedLoad: 68,
    focusArea: "Offensive Systems",
    tags: [
      standardTag("Offensive Systems"),
      customTag("Sideout", 30),
      customTag("Tournament Prep", 31),
    ],
    blocks,
    totalTouchesTypical: blocks.reduce(
      (sum, block) => sum + block.touchesTypical,
      0,
    ),
    totalJumpsTypical: blocks.reduce(
      (sum, block) => sum + block.jumpsTypical,
      0,
    ),
    updatedAt: addDays(now, -1).toISOString(),
  });
}

function demoProgram(now: Date): z.infer<typeof trainingProgramSchema> {
  const startDate = isoDate(addDays(now, -21));
  const endDate = isoDate(addDays(now, 42));
  const recurrence = trainingRecurrenceSchema.parse({
    intervalWeeks: 1,
    days: [
      { day: "monday", startsAt: "17:00", durationMinutes: 90 },
      { day: "wednesday", startsAt: "17:00", durationMinutes: 90 },
    ],
    excludedDates: [],
  });
  const occurrences = generateTrainingOccurrences({
    startDate,
    endDate,
    recurrence,
  });
  const completed = occurrences.filter(
    (occurrence) => occurrence.localDate < isoDate(now),
  ).length;
  return trainingProgramSchema.parse({
    id: demoId(400),
    catalogItemId: demoId(401),
    title: "Fall Competition Build",
    slug: "fall-competition-build",
    purpose:
      "Prepare the high-performance group to side out reliably and defend with a shared system through the fall tournament block.",
    targetAudience: "16U–18U national and open-division beach athletes.",
    objectives: [
      "Reach target-quality on 65% of serve-receive contacts",
      "Create a shared block-defense call system",
      "Preserve serving intent late in high-load practices",
    ],
    approach:
      "Constraints-led learning, high contacts per hour, competitive wash scoring, and a deliberate taper before key events.",
    status: "active",
    startDate,
    endDate,
    timezone: "America/New_York",
    recurrence,
    milestones: [
      {
        id: demoId(410),
        kind: "tournament",
        title: "Atlantic Coast Open",
        startsOn: isoDate(addDays(now, 17)),
        endsOn: isoDate(addDays(now, 18)),
        priority: "key",
        notes: "First major evaluation point.",
      },
      {
        id: demoId(411),
        kind: "travel",
        title: "Travel to Wilmington",
        startsOn: isoDate(addDays(now, 16)),
        endsOn: isoDate(addDays(now, 16)),
        priority: "standard",
      },
    ],
    scheduledSessionCount: occurrences.length,
    completedSessionCount: completed,
    plannedMinutes: occurrences.reduce(
      (sum, occurrence) => sum + occurrence.durationMinutes,
      0,
    ),
    athleteCount: 12,
    currentPhase: "Build",
    nextEventAt: new Date(now.getTime() + 90 * 60_000).toISOString(),
    readiness: "on-track",
    linkedOffer: {
      title: "Fall High Performance Program",
      priceMinor: 64_000,
      currency: "USD",
      inclusions: [
        `${occurrences.length} coached practices`,
        "Video review library",
        "Duna practice plans and athlete recaps",
      ],
    },
  });
}

export function loadDemoTrainingWorkspace(
  organizationId: string,
  now = new Date(),
): TrainingWorkspace {
  if (organizationId !== demoOrganization.id) {
    throw new TrainingServiceError(
      "ORGANIZATION_NOT_FOUND",
      "The training organization was not found.",
    );
  }
  const drills = buildDemoDrills(now);
  const plan = buildDemoPracticePlan(drills, now);
  const program = demoProgram(now);
  const todayStart = new Date(now.getTime() + 90 * 60_000);
  const todayEnd = new Date(todayStart.getTime() + 90 * 60_000);
  const today = {
    id: demoId(600),
    programId: program.id,
    kind: "practice" as const,
    title: "Sideout Under Pressure",
    startsAt: todayStart.toISOString(),
    endsAt: todayEnd.toISOString(),
    timezone: "America/New_York",
    status: "ready" as const,
    coachName: "Jordan Lee",
    venueName: "Beach Elite Training Center · Courts 1–2",
    practicePlanId: plan.id,
    practicePlanTitle: plan.title,
    focusArea: plan.focusArea,
    plannedLoad: plan.plannedLoad,
    plannedIntensity: 7,
    athleteCount: program.athleteCount,
  };
  const upcomingEvents = [
    today,
    {
      id: demoId(601),
      programId: program.id,
      kind: "recovery" as const,
      title: "Mobility + video reset",
      startsAt: addDays(todayStart, 2).toISOString(),
      endsAt: new Date(
        addDays(todayStart, 2).getTime() + 45 * 60_000,
      ).toISOString(),
      timezone: "America/New_York",
      status: "planned" as const,
      coachName: "Jordan Lee",
      venueName: "Beach Elite Training Center",
      focusArea: "Footwork" as const,
      plannedLoad: 28,
      plannedIntensity: 3,
      athleteCount: 12,
    },
    {
      id: demoId(602),
      programId: program.id,
      kind: "practice" as const,
      title: "Block-Defense Connection",
      startsAt: addDays(todayStart, 5).toISOString(),
      endsAt: new Date(
        addDays(todayStart, 5).getTime() + 90 * 60_000,
      ).toISOString(),
      timezone: "America/New_York",
      status: "planned" as const,
      coachName: "Alex Morgan",
      venueName: "Beach Elite Training Center · Courts 1–2",
      focusArea: "Team Defense" as const,
      plannedLoad: 74,
      plannedIntensity: 8,
      athleteCount: 12,
    },
    {
      id: demoId(603),
      programId: program.id,
      kind: "travel" as const,
      title: "Travel to Wilmington",
      startsAt: addDays(todayStart, 16).toISOString(),
      endsAt: new Date(
        addDays(todayStart, 16).getTime() + 4 * 60 * 60_000,
      ).toISOString(),
      timezone: "America/New_York",
      status: "planned" as const,
      plannedLoad: 12,
      plannedIntensity: 1,
      athleteCount: 12,
    },
    {
      id: demoId(604),
      programId: program.id,
      kind: "tournament" as const,
      title: "Atlantic Coast Open",
      startsAt: addDays(todayStart, 17).toISOString(),
      endsAt: new Date(
        addDays(todayStart, 18).getTime() + 7 * 60 * 60_000,
      ).toISOString(),
      timezone: "America/New_York",
      status: "planned" as const,
      venueName: "Wilmington, NC",
      plannedLoad: 90,
      plannedIntensity: 9,
      athleteCount: 12,
    },
  ];
  const secondPlan = trainingPracticePlanSchema.parse({
    ...plan,
    id: demoId(320),
    versionId: demoId(321),
    version: 2,
    title: "Defend, Convert, Repeat",
    slug: "defend-convert-repeat",
    purpose:
      "Turn coordinated block-defense reads into a high, usable transition contact.",
    focusArea: "Team Defense",
    plannedLoad: 74,
    tags: [standardTag("Team Defense"), customTag("Transition", 33)],
    updatedAt: addDays(now, -4).toISOString(),
  });
  const completedPlan = trainingPracticePlanSchema.parse({
    ...plan,
    id: demoId(330),
    versionId: demoId(331),
    version: 1,
    title: "Serve + First Contact Reset",
    slug: "serve-first-contact-reset",
    purpose:
      "Restore serving routine and early seam communication after competition.",
    focusArea: "Serving",
    plannedLoad: 42,
    durationMinutes: 70,
    tags: [standardTag("Serving"), customTag("Recovery Week", 34)],
    updatedAt: addDays(now, -8).toISOString(),
  });
  return trainingWorkspaceSchema.parse({
    generatedAt: now.toISOString(),
    timezone: "America/New_York",
    focusAreas: TRAINING_FOCUS_AREAS,
    today,
    upcomingEvents,
    programs: [
      program,
      {
        ...program,
        id: demoId(420),
        catalogItemId: undefined,
        title: "Winter Technical Reset",
        slug: "winter-technical-reset",
        status: "active",
        startDate: isoDate(addDays(now, 55)),
        endDate: isoDate(addDays(now, 90)),
        scheduledSessionCount: 10,
        completedSessionCount: 0,
        plannedMinutes: 900,
        athleteCount: 16,
        currentPhase: "Designing",
        nextEventAt: undefined,
        readiness: "building",
        linkedOffer: undefined,
      },
    ],
    practicePlans: [plan, secondPlan, completedPlan],
    drills,
    insights: {
      headline: [
        {
          id: "training-time",
          label: "Training time",
          value: "11.8 hr",
          detail: "Last 28 days · 8 completed practices",
          trend: "up",
          tone: "positive",
        },
        {
          id: "contacts",
          label: "Planned contacts",
          value: "4,860",
          detail: "Typical estimate across assigned practice plans",
          trend: "up",
          tone: "default",
        },
        {
          id: "load",
          label: "7-day load",
          value: "62 / 100",
          detail: "Build week · taper begins in 12 days",
          trend: "steady",
          tone: "positive",
        },
        {
          id: "responses",
          label: "Athlete responses",
          value: "83%",
          detail: "10 of 12 submitted post-practice RPE",
          trend: "up",
          tone: "attention",
        },
      ],
      focusDistribution: [
        { focusArea: "Offensive Systems", minutes: 164, percent: 23 },
        { focusArea: "Ball Control", minutes: 142, percent: 20 },
        { focusArea: "Team Defense", minutes: 126, percent: 18 },
        { focusArea: "Attacking", minutes: 104, percent: 15 },
        { focusArea: "Serving", minutes: 82, percent: 12 },
        { focusArea: "Setting", minutes: 72, percent: 10 },
        { focusArea: "Footwork", minutes: 14, percent: 2 },
      ],
      weeklyLoad: [
        { week: "Jul 27", planned: 48, actual: 52, tournament: false },
        { week: "Aug 3", planned: 58, actual: 56, tournament: false },
        { week: "Aug 10", planned: 66, actual: 63, tournament: false },
        { week: "Aug 17", planned: 72, tournament: false },
        { week: "Aug 24", planned: 68, tournament: false },
        { week: "Aug 31", planned: 42, tournament: true },
      ],
      totalMinutes: 704,
      totalTouchesTypical: 4_860,
      athleteResponseRate: 83,
    },
  });
}

function requireTrainingDatabase(): void {
  if (!process.env.DATABASE_URL) {
    throw new TrainingServiceError(
      "DATABASE_REQUIRED",
      "Saving training work requires the connected Duna database.",
    );
  }
}

function requireOrganization(actor: ApiActor): string {
  if (!actor.organizationId) {
    throw new TrainingServiceError(
      "RESOURCE_WRONG_ORGANIZATION",
      "Choose an organization before working with training content.",
    );
  }
  return actor.organizationId;
}

function hasTrainingWrite(actor: ApiActor): boolean {
  return actor.scopes.includes("*") || actor.scopes.includes("training:write");
}

function offsetForTimezone(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(value.year),
    Number(value.month) - 1,
    Number(value.day),
    Number(value.hour),
    Number(value.minute),
    Number(value.second),
  );
  return asUtc - date.getTime();
}

function localTrainingTimeToUtc(
  localDate: string,
  localTime: string,
  timezone: string,
): Date {
  const [year, month, day] = localDate.split("-").map(Number);
  const [hour, minute] = localTime.split(":").map(Number);
  if (!year || !month || !day || hour === undefined || minute === undefined) {
    throw new TrainingServiceError(
      "INVALID_SCHEDULE",
      "A practice date or time is invalid.",
    );
  }
  const wallClock = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = new Date(wallClock);
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      guess = new Date(wallClock - offsetForTimezone(guess, timezone));
    }
  } catch {
    throw new TrainingServiceError(
      "INVALID_SCHEDULE",
      "The program timezone is not valid.",
    );
  }
  return guess;
}

function focusFromTagLabel(
  value: string | undefined,
): TrainingFocusArea | undefined {
  return TRAINING_FOCUS_AREAS.find((focus) => focus === value);
}

function programReadiness(
  status: "draft" | "active" | "completed" | "archived",
  scheduled: number,
  completed: number,
) {
  if (status === "archived") return "complete" as const;
  if (status === "completed") return "complete" as const;
  if (status === "draft") return "building" as const;
  if (scheduled > 0 && completed / scheduled < 0.25)
    return "attention" as const;
  return "on-track" as const;
}

function programVersionSnapshot(
  program: Pick<
    TrainingProgramRecord,
    | "title"
    | "purpose"
    | "targetAudience"
    | "objectives"
    | "approach"
    | "startDate"
    | "endDate"
    | "timezone"
    | "recurrence"
    | "milestones"
    | "scheduledSessionCount"
    | "defaultPracticeMinutes"
    | "athleteCount"
  >,
  events: readonly Pick<
    TrainingEventRecord,
    | "id"
    | "kind"
    | "title"
    | "startsAt"
    | "endsAt"
    | "timezone"
    | "status"
    | "practicePlanVersionId"
    | "objectives"
    | "plannedLoad"
    | "plannedIntensity"
    | "externalLoad"
    | "source"
  >[],
): TrainingProgramVersionSnapshot {
  return trainingProgramVersionSnapshotSchema.parse({
    program: {
      title: program.title,
      purpose: program.purpose,
      targetAudience: program.targetAudience,
      objectives: program.objectives,
      approach: program.approach,
      startDate: program.startDate,
      endDate: program.endDate,
      timezone: program.timezone,
      recurrence: program.recurrence,
      milestones: program.milestones,
      scheduledSessionCount: program.scheduledSessionCount,
      defaultPracticeMinutes: program.defaultPracticeMinutes,
      athleteCount: program.athleteCount,
    },
    events: events.map(programEventSnapshot),
  });
}

function programEventSnapshot(
  event: Pick<
    TrainingEventRecord,
    | "id"
    | "kind"
    | "title"
    | "startsAt"
    | "endsAt"
    | "timezone"
    | "status"
    | "practicePlanVersionId"
    | "objectives"
    | "plannedLoad"
    | "plannedIntensity"
    | "externalLoad"
    | "source"
  >,
): TrainingProgramVersionSnapshot["events"][number] {
  return {
    id: event.id,
    kind: event.kind,
    title: event.title,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    timezone: event.timezone,
    status: event.status,
    ...(event.practicePlanVersionId
      ? { practicePlanVersionId: event.practicePlanVersionId }
      : {}),
    objectives: event.objectives,
    plannedLoad: event.plannedLoad,
    plannedIntensity: event.plannedIntensity,
    externalLoad: event.externalLoad,
    source:
      event.source === "program" ||
      event.source === "manual" ||
      event.source === "catalog" ||
      event.source === "imported" ||
      event.source === "ai-draft"
        ? event.source
        : "program",
  };
}

function versionEntry(
  row: {
    readonly id: string;
    readonly version: number;
    readonly snapshot: Record<string, unknown>;
    readonly changeNote: string | null;
    readonly createdAt: Date;
  },
  currentVersionId: string | null,
  fallbackTitle: string,
  kind: "program" | "practice-plan",
): TrainingVersionHistoryEntry {
  let title = fallbackTitle;
  if (kind === "program") {
    const snapshot = trainingProgramVersionSnapshotSchema.safeParse(
      row.snapshot,
    );
    if (snapshot.success) title = snapshot.data.program.title;
  } else {
    const snapshot = trainingPracticePlanSchema.safeParse(row.snapshot);
    if (snapshot.success) title = snapshot.data.title;
  }
  return {
    id: row.id,
    version: row.version,
    title,
    createdAt: row.createdAt.toISOString(),
    current: row.id === currentVersionId,
    ...(row.changeNote ? { changeNote: row.changeNote } : {}),
  };
}

function weekLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export async function loadTrainingWorkspace(input: {
  readonly organizationId: string;
  readonly now?: Date;
  readonly demo?: boolean;
}): Promise<TrainingWorkspace> {
  const now = input.now ?? new Date();
  if (input.demo && !process.env.DATABASE_URL) {
    return loadDemoTrainingWorkspace(input.organizationId, now);
  }
  requireTrainingDatabase();
  const database = getDatabase();
  const [drillRows, planRows, programRows, eventRows, availableTagRows] =
    await Promise.all([
      database
        .select()
        .from(trainingDrills)
        .where(
          or(
            eq(trainingDrills.organizationId, input.organizationId),
            and(
              eq(trainingDrills.visibility, "public"),
              eq(trainingDrills.status, "published"),
            ),
          ),
        )
        .orderBy(desc(trainingDrills.updatedAt))
        .limit(250),
      database
        .select()
        .from(trainingPracticePlans)
        .where(eq(trainingPracticePlans.organizationId, input.organizationId))
        .orderBy(desc(trainingPracticePlans.updatedAt))
        .limit(100),
      database
        .select()
        .from(trainingPrograms)
        .where(eq(trainingPrograms.organizationId, input.organizationId))
        .orderBy(desc(trainingPrograms.updatedAt))
        .limit(100),
      database
        .select()
        .from(trainingEvents)
        .where(eq(trainingEvents.organizationId, input.organizationId))
        .orderBy(asc(trainingEvents.startsAt))
        .limit(500),
      database
        .select()
        .from(trainingTags)
        .where(
          or(
            eq(trainingTags.organizationId, input.organizationId),
            isNull(trainingTags.organizationId),
          ),
        )
        .limit(500),
    ]);
  const drillVersionIds = drillRows
    .map((row) => row.currentVersionId)
    .filter((value): value is string => Boolean(value));
  const planVersionIds = planRows
    .map((row) => row.currentVersionId)
    .filter((value): value is string => Boolean(value));
  const [drillVersionRows, planVersionRows] = await Promise.all([
    drillVersionIds.length
      ? database
          .select()
          .from(trainingDrillVersions)
          .where(inArray(trainingDrillVersions.id, drillVersionIds))
      : Promise.resolve([]),
    planVersionIds.length
      ? database
          .select()
          .from(trainingPracticePlanVersions)
          .where(inArray(trainingPracticePlanVersions.id, planVersionIds))
      : Promise.resolve([]),
  ]);
  const activeDrillLicenseRows = drillRows.length
    ? await database
        .select({ drillId: trainingDrillLicenses.drillId })
        .from(trainingDrillLicenses)
        .innerJoin(
          catalogFulfillments,
          eq(
            trainingDrillLicenses.catalogFulfillmentId,
            catalogFulfillments.id,
          ),
        )
        .where(
          and(
            eq(trainingDrillLicenses.buyerOrganizationId, input.organizationId),
            eq(trainingDrillLicenses.status, "active"),
            eq(catalogFulfillments.status, "fulfilled"),
            inArray(
              trainingDrillLicenses.drillId,
              drillRows.map((row) => row.id),
            ),
          ),
        )
    : [];
  const licensedDrillIds = new Set(
    activeDrillLicenseRows.map((row) => row.drillId),
  );
  const drillVersionById = new Map(
    drillVersionRows.map((row) => [row.id, row]),
  );
  const planVersionById = new Map(planVersionRows.map((row) => [row.id, row]));
  const builtInDrills = buildDemoDrills(now).filter(
    (drill) => drill.visibility === "public",
  );
  const storedDrills = drillRows.flatMap((row) => {
    const version = row.currentVersionId
      ? drillVersionById.get(row.currentVersionId)
      : undefined;
    if (!version) return [];
    const snapshot = version.snapshot as Record<string, unknown>;
    const marketplace = snapshot.marketplace;
    const marketplaceTerms =
      marketplace &&
      typeof marketplace === "object" &&
      !Array.isArray(marketplace)
        ? marketplace
        : undefined;
    const offer =
      marketplaceTerms && "offer" in marketplaceTerms
        ? marketplaceTerms.offer
        : undefined;
    const owner = row.organizationId === input.organizationId;
    const access = owner
      ? "owner"
      : offer === "paid"
        ? licensedDrillIds.has(row.id)
          ? "purchased"
          : "purchase-required"
        : "free";
    const locked = access === "purchase-required";
    const parsed = trainingDrillSchema.safeParse({
      ...snapshot,
      id: row.id,
      versionId: version.id,
      version: version.version,
      title: row.title,
      slug: row.slug,
      status: row.status,
      visibility: row.visibility,
      ownership:
        row.organizationId === null
          ? "duna"
          : row.organizationId === input.organizationId
            ? "organization"
            : "shared",
      ...(marketplaceTerms
        ? { marketplace: { ...marketplaceTerms, access } }
        : {}),
      ...(locked
        ? {
            descriptionMarkdown:
              "This paid drill is available to your organization after marketplace checkout.",
            steps: [
              "Purchase the organization license to unlock the complete drill.",
            ],
            coachingCues: [],
            safety: [],
            variations: [],
            scoring: "Available with the organization license.",
            equipment: [],
            interpretation: undefined,
            editor: undefined,
            scene: {
              court: "beach-full",
              perspective: "top",
              positions: [],
              movements: [],
              ballCount: 0,
              loopSeconds: 12,
            },
            animation: {
              status: "draft",
              kind: "duna-scene",
              reviewed: false,
              altText: `Preview for ${row.title}. Purchase to unlock the complete court animation.`,
              renderModel: "duna-scene",
            },
          }
        : {}),
      updatedAt: row.updatedAt.toISOString(),
    });
    return parsed.success ? [parsed.data] : [];
  });
  const drillSlugs = new Set(storedDrills.map((drill) => drill.slug));
  const drills = [
    ...storedDrills,
    ...builtInDrills.filter((drill) => !drillSlugs.has(drill.slug)),
  ];
  const practicePlans = planRows.flatMap((row) => {
    const version = row.currentVersionId
      ? planVersionById.get(row.currentVersionId)
      : undefined;
    if (!version) return [];
    const parsed = trainingPracticePlanSchema.safeParse({
      ...(version.snapshot as Record<string, unknown>),
      id: row.id,
      versionId: version.id,
      version: version.version,
      title: row.title,
      slug: row.slug,
      purpose: row.purpose,
      targetAudience: row.targetAudience,
      status: row.status,
      visibility: row.visibility,
      durationMinutes: row.durationMinutes,
      plannedLoad: row.plannedLoad,
      updatedAt: row.updatedAt.toISOString(),
    });
    return parsed.success ? [parsed.data] : [];
  });
  const planByVersionId = new Map(
    practicePlans.map((plan) => [plan.versionId, plan]),
  );
  const tagLabelById = new Map(
    availableTagRows.map((tag) => [tag.id, tag.label]),
  );
  const events = eventRows.map((row) => {
    const plan = row.practicePlanVersionId
      ? planByVersionId.get(row.practicePlanVersionId)
      : undefined;
    const program = row.programId
      ? programRows.find((candidate) => candidate.id === row.programId)
      : undefined;
    const focusArea =
      focusFromTagLabel(
        row.focusAreaTagId ? tagLabelById.get(row.focusAreaTagId) : undefined,
      ) ??
      focusFromTagLabel(
        typeof row.externalLoad.focusArea === "string"
          ? row.externalLoad.focusArea
          : undefined,
      );
    return {
      id: row.id,
      ...(row.programId ? { programId: row.programId } : {}),
      kind: row.kind,
      title: row.title,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      timezone: row.timezone,
      status: row.status,
      ...(plan
        ? { practicePlanId: plan.id, practicePlanTitle: plan.title }
        : {}),
      ...(focusArea ? { focusArea } : {}),
      plannedLoad: row.plannedLoad,
      plannedIntensity: row.plannedIntensity,
      athleteCount: program?.athleteCount ?? 0,
    };
  });
  const programs = programRows.flatMap((row) => {
    const recurrence = trainingRecurrenceSchema.safeParse(row.recurrence);
    if (!recurrence.success) return [];
    const programEvents = events.filter((event) => event.programId === row.id);
    const completedSessionCount = programEvents.filter(
      (event) => event.kind === "practice" && event.status === "completed",
    ).length;
    const nextEvent = programEvents.find(
      (event) =>
        event.status !== "cancelled" && new Date(event.startsAt) >= now,
    );
    const parsed = trainingProgramSchema.safeParse({
      id: row.id,
      ...(row.catalogItemId ? { catalogItemId: row.catalogItemId } : {}),
      title: row.title,
      slug: row.slug,
      purpose: row.purpose,
      targetAudience: row.targetAudience,
      objectives: row.objectives,
      approach: row.approach,
      status: row.status,
      startDate: row.startDate,
      endDate: row.endDate,
      timezone: row.timezone,
      recurrence: recurrence.data,
      milestones: row.milestones,
      scheduledSessionCount: row.scheduledSessionCount,
      completedSessionCount,
      plannedMinutes: programEvents
        .filter((event) => event.kind === "practice")
        .reduce(
          (sum, event) =>
            sum +
            Math.round(
              (new Date(event.endsAt).getTime() -
                new Date(event.startsAt).getTime()) /
                60_000,
            ),
          0,
        ),
      athleteCount: row.athleteCount,
      currentPhase:
        row.status === "draft"
          ? "Designing"
          : row.status === "archived"
            ? "Archived"
            : row.status === "completed"
              ? "Complete"
              : "In progress",
      ...(nextEvent ? { nextEventAt: nextEvent.startsAt } : {}),
      readiness: programReadiness(
        row.status,
        row.scheduledSessionCount,
        completedSessionCount,
      ),
    });
    return parsed.success ? [parsed.data] : [];
  });
  const archivedProgramIds = new Set(
    programRows
      .filter((program) => program.status === "archived" || program.archivedAt)
      .map((program) => program.id),
  );
  const operationalEvents = events.filter(
    (event) => !event.programId || !archivedProgramIds.has(event.programId),
  );
  const activePracticePlans = practicePlans.filter(
    (plan) => plan.status !== "archived",
  );
  const focusMinutes = new Map<TrainingFocusArea, number>();
  for (const plan of activePracticePlans) {
    for (const block of plan.blocks) {
      if (!block.focusArea) continue;
      focusMinutes.set(
        block.focusArea,
        (focusMinutes.get(block.focusArea) ?? 0) + block.durationMinutes,
      );
    }
  }
  const totalFocusMinutes = [...focusMinutes.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  const weeklyLoad = Array.from({ length: 6 }, (_, index) => {
    const weekStart = addDays(now, (index - 3) * 7);
    const weekEnd = addDays(weekStart, 7);
    const matching = operationalEvents.filter((event) => {
      const startsAt = new Date(event.startsAt);
      return startsAt >= weekStart && startsAt < weekEnd;
    });
    return {
      week: weekLabel(weekStart),
      planned: matching.length
        ? Math.round(
            matching.reduce((sum, event) => sum + event.plannedLoad, 0) /
              matching.length,
          )
        : 0,
      tournament: matching.some((event) => event.kind === "tournament"),
    };
  });
  const upcomingEvents = operationalEvents
    .filter(
      (event) =>
        event.status !== "cancelled" &&
        new Date(event.endsAt).getTime() >= now.getTime(),
    )
    .slice(0, 30);
  const todayKey = isoDate(now);
  const today = upcomingEvents.find(
    (event) => event.startsAt.slice(0, 10) === todayKey,
  );
  const totalMinutes = events
    .filter((event) => event.status === "completed")
    .reduce(
      (sum, event) =>
        sum +
        Math.max(
          0,
          Math.round(
            (new Date(event.endsAt).getTime() -
              new Date(event.startsAt).getTime()) /
              60_000,
          ),
        ),
      0,
    );
  const totalTouchesTypical = activePracticePlans.reduce(
    (sum, plan) => sum + plan.totalTouchesTypical,
    0,
  );
  return trainingWorkspaceSchema.parse({
    generatedAt: now.toISOString(),
    timezone: programRows[0]?.timezone ?? "America/New_York",
    focusAreas: TRAINING_FOCUS_AREAS,
    ...(today ? { today } : {}),
    upcomingEvents,
    programs,
    practicePlans,
    drills,
    insights: {
      headline: [
        ...(totalMinutes
          ? [
              {
                id: "training-time",
                label: "Completed training",
                value: `${(totalMinutes / 60).toFixed(1)} hr`,
                detail: "From connected completed training events",
                trend: "steady" as const,
                tone: "default" as const,
              },
            ]
          : []),
        ...(totalTouchesTypical
          ? [
              {
                id: "contacts",
                label: "Planned contacts",
                value: new Intl.NumberFormat("en-US").format(
                  totalTouchesTypical,
                ),
                detail: "Typical estimate across current practice plans",
                trend: "steady" as const,
                tone: "default" as const,
              },
            ]
          : []),
      ],
      focusDistribution: [...focusMinutes.entries()]
        .map(([focusArea, minutes]) => ({
          focusArea,
          minutes,
          percent: totalFocusMinutes
            ? Math.round((minutes / totalFocusMinutes) * 100)
            : 0,
        }))
        .sort((a, b) => b.minutes - a.minutes),
      weeklyLoad,
      totalMinutes,
      totalTouchesTypical,
    },
  });
}

/**
 * The workspace feed deliberately limits its general upcoming list so the
 * coaching home remains quick. A program detail must never inherit that
 * display limit: its schedule is the source of truth for every session in the
 * program, including completed and cancelled history.
 */
export async function loadTrainingProgramEvents(input: {
  readonly organizationId: string;
  readonly programId: string;
  readonly now?: Date;
  readonly demo?: boolean;
}): Promise<TrainingEvent[]> {
  const parsed = trainingProgramEventsInputSchema.parse({
    programId: input.programId,
  });
  if (input.demo && !process.env.DATABASE_URL) {
    return loadDemoTrainingWorkspace(
      input.organizationId,
      input.now,
    ).upcomingEvents.filter((event) => event.programId === parsed.programId);
  }
  requireTrainingDatabase();
  const database = getDatabase();
  const [program] = await database
    .select({
      id: trainingPrograms.id,
      athleteCount: trainingPrograms.athleteCount,
    })
    .from(trainingPrograms)
    .where(
      and(
        eq(trainingPrograms.id, parsed.programId),
        eq(trainingPrograms.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!program) {
    throw new TrainingServiceError(
      "RESOURCE_NOT_FOUND",
      "This program is no longer available.",
    );
  }
  const [eventRows, tagRows] = await Promise.all([
    database
      .select()
      .from(trainingEvents)
      .where(
        and(
          eq(trainingEvents.organizationId, input.organizationId),
          eq(trainingEvents.programId, program.id),
        ),
      )
      .orderBy(asc(trainingEvents.startsAt)),
    database
      .select()
      .from(trainingTags)
      .where(
        or(
          eq(trainingTags.organizationId, input.organizationId),
          isNull(trainingTags.organizationId),
        ),
      )
      .limit(500),
  ]);
  const tagLabelById = new Map(tagRows.map((tag) => [tag.id, tag.label]));
  return eventRows.map((row) => {
    const focusArea =
      focusFromTagLabel(
        row.focusAreaTagId ? tagLabelById.get(row.focusAreaTagId) : undefined,
      ) ??
      focusFromTagLabel(
        typeof row.externalLoad.focusArea === "string"
          ? row.externalLoad.focusArea
          : undefined,
      );
    return trainingEventSchema.parse({
      id: row.id,
      programId: program.id,
      kind: row.kind,
      title: row.title,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      timezone: row.timezone,
      status: row.status,
      ...(focusArea ? { focusArea } : {}),
      plannedLoad: row.plannedLoad,
      plannedIntensity: row.plannedIntensity,
      athleteCount: program.athleteCount,
    });
  });
}

/**
 * Training revisions are intentionally a small operational history, not an
 * unbounded audit log. The audit log captures every state transition; this
 * list gives coaches the five content snapshots they can actually restore.
 */
export async function loadTrainingProgramVersions(input: {
  readonly organizationId: string;
  readonly programId: string;
  readonly now?: Date;
  readonly demo?: boolean;
}): Promise<TrainingVersionHistoryEntry[]> {
  const parsed = trainingProgramVersionsInputSchema.parse({
    programId: input.programId,
  });
  if (input.demo && !process.env.DATABASE_URL) {
    const program = loadDemoTrainingWorkspace(
      input.organizationId,
      input.now,
    ).programs.find((entry) => entry.id === parsed.programId);
    return program
      ? [
          {
            id: demoId(780),
            version: 1,
            title: program.title,
            createdAt: (input.now ?? new Date()).toISOString(),
            current: true,
            changeNote: "Initial coach-authored program calendar.",
          },
        ]
      : [];
  }
  requireTrainingDatabase();
  const database = getDatabase();
  const [program] = await database
    .select({
      id: trainingPrograms.id,
      title: trainingPrograms.title,
      currentVersionId: trainingPrograms.currentVersionId,
    })
    .from(trainingPrograms)
    .where(
      and(
        eq(trainingPrograms.id, parsed.programId),
        eq(trainingPrograms.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!program) {
    throw new TrainingServiceError(
      "RESOURCE_NOT_FOUND",
      "This program is no longer available.",
    );
  }
  const versions = await database
    .select({
      id: trainingProgramVersions.id,
      version: trainingProgramVersions.version,
      snapshot: trainingProgramVersions.snapshot,
      changeNote: trainingProgramVersions.changeNote,
      createdAt: trainingProgramVersions.createdAt,
    })
    .from(trainingProgramVersions)
    .where(eq(trainingProgramVersions.programId, program.id))
    .orderBy(desc(trainingProgramVersions.version))
    .limit(TRAINING_VERSION_RETENTION);
  return versions.map((version) =>
    versionEntry(version, program.currentVersionId, program.title, "program"),
  );
}

export async function loadTrainingPracticePlanVersions(input: {
  readonly organizationId: string;
  readonly practicePlanId: string;
  readonly now?: Date;
  readonly demo?: boolean;
}): Promise<TrainingVersionHistoryEntry[]> {
  const parsed = trainingPracticePlanVersionsInputSchema.parse({
    practicePlanId: input.practicePlanId,
  });
  if (input.demo && !process.env.DATABASE_URL) {
    const plan = loadDemoTrainingWorkspace(
      input.organizationId,
      input.now,
    ).practicePlans.find((entry) => entry.id === parsed.practicePlanId);
    return plan
      ? [
          {
            id: demoId(781),
            version: plan.version,
            title: plan.title,
            createdAt: plan.updatedAt,
            current: true,
            changeNote: "Initial coach-authored practice plan.",
          },
        ]
      : [];
  }
  requireTrainingDatabase();
  const database = getDatabase();
  const [plan] = await database
    .select({
      id: trainingPracticePlans.id,
      title: trainingPracticePlans.title,
      currentVersionId: trainingPracticePlans.currentVersionId,
    })
    .from(trainingPracticePlans)
    .where(
      and(
        eq(trainingPracticePlans.id, parsed.practicePlanId),
        eq(trainingPracticePlans.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!plan) {
    throw new TrainingServiceError(
      "RESOURCE_NOT_FOUND",
      "This practice plan is no longer available.",
    );
  }
  const versions = await database
    .select({
      id: trainingPracticePlanVersions.id,
      version: trainingPracticePlanVersions.version,
      snapshot: trainingPracticePlanVersions.snapshot,
      changeNote: trainingPracticePlanVersions.changeNote,
      createdAt: trainingPracticePlanVersions.createdAt,
    })
    .from(trainingPracticePlanVersions)
    .where(eq(trainingPracticePlanVersions.practicePlanId, plan.id))
    .orderBy(desc(trainingPracticePlanVersions.version))
    .limit(TRAINING_VERSION_RETENTION);
  return versions.map((version) =>
    versionEntry(version, plan.currentVersionId, plan.title, "practice-plan"),
  );
}

function athletePractice(plan: TrainingPracticePlan | undefined) {
  if (!plan) return undefined;
  return {
    title: plan.title,
    purpose: plan.purpose,
    durationMinutes: plan.durationMinutes,
    focusArea: plan.focusArea,
    totalTouchesTypical: plan.totalTouchesTypical,
    totalJumpsTypical: plan.totalJumpsTypical,
    blocks: plan.blocks.map((block) => ({
      id: block.id,
      sequence: block.sequence,
      lane: block.lane,
      title: block.title,
      kind: block.kind,
      startsAtMinute: block.startsAtMinute,
      durationMinutes: block.durationMinutes,
      intensity: block.intensity,
      ...(block.focusArea ? { focusArea: block.focusArea } : {}),
      touchesTypical: block.touchesTypical,
      jumpsTypical: block.jumpsTypical,
    })),
  };
}

function nextPlayerMilestone(
  milestones: readonly Record<string, unknown>[],
  today: string,
) {
  return milestones
    .flatMap((milestone) => {
      const kind = milestone.kind;
      const title = milestone.title;
      const startsOn = milestone.startsOn;
      if (
        (kind !== "tournament" &&
          kind !== "travel" &&
          kind !== "assessment" &&
          kind !== "break") ||
        typeof title !== "string" ||
        typeof startsOn !== "string" ||
        startsOn < today
      ) {
        return [];
      }
      return [{ kind, title, startsOn }];
    })
    .sort((first, second) => first.startsOn.localeCompare(second.startsOn))[0];
}

function demoPlayerTrainingWorkspace(now: Date): PlayerTrainingWorkspace {
  const training = loadDemoTrainingWorkspace(demoOrganization.id, now);
  const program = training.programs[0]!;
  const plan = training.practicePlans[0]!;
  const eventForPlayer = (
    event: TrainingWorkspace["upcomingEvents"][number],
  ): PlayerTrainingEvent | undefined => {
    if (!event.programId) return undefined;
    const eventProgram = training.programs.find(
      (candidate) => candidate.id === event.programId,
    );
    if (!eventProgram) return undefined;
    const eventPlan = event.practicePlanId
      ? training.practicePlans.find(
          (candidate) => candidate.id === event.practicePlanId,
        )
      : undefined;
    return playerTrainingEventSchema.parse({
      id: event.id,
      programId: event.programId,
      programTitle: eventProgram.title,
      kind: event.kind,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      timezone: event.timezone,
      status: event.status,
      ...(event.focusArea ? { focusArea: event.focusArea } : {}),
      plannedLoad: event.plannedLoad,
      plannedIntensity: event.plannedIntensity,
      ...(eventPlan ? { practice: athletePractice(eventPlan) } : {}),
    });
  };
  const upcomingEvents = training.upcomingEvents.flatMap((event) => {
    const parsed = eventForPlayer(event);
    return parsed ? [parsed] : [];
  });
  const recentStart = addDays(now, -2);
  const recentSession = playerTrainingEventSchema.parse({
    id: demoId(690),
    programId: program.id,
    programTitle: program.title,
    kind: "practice",
    title: "Defend, Convert, Repeat",
    startsAt: recentStart.toISOString(),
    endsAt: new Date(recentStart.getTime() + 88 * 60_000).toISOString(),
    timezone: program.timezone,
    status: "completed",
    focusArea: "Team Defense",
    plannedLoad: 72,
    plannedIntensity: 8,
    practice: athletePractice(plan),
  });
  return playerTrainingWorkspaceSchema.parse({
    generatedAt: now.toISOString(),
    programs: training.programs
      .filter(
        (candidate) =>
          candidate.id === program.id && candidate.status !== "draft",
      )
      .map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        purpose: candidate.purpose,
        startDate: candidate.startDate,
        endDate: candidate.endDate,
        currentPhase: candidate.currentPhase,
        completedSessionCount: candidate.completedSessionCount,
        scheduledSessionCount: candidate.scheduledSessionCount,
        ...(nextPlayerMilestone(candidate.milestones, isoDate(now))
          ? {
              nextMilestone: nextPlayerMilestone(
                candidate.milestones,
                isoDate(now),
              ),
            }
          : {}),
      })),
    nextPractice: upcomingEvents.find((event) => event.kind === "practice"),
    upcomingEvents,
    recentSessions: [recentSession],
    weeklyLoad: training.insights.weeklyLoad.map((week) => ({
      week: week.week,
      planned: week.planned,
      tournament: week.tournament,
    })),
  });
}

/** Athlete-safe training view. Coach notes and organization-wide data stay out. */
export async function loadPlayerTrainingWorkspace(input: {
  readonly actor: ApiActor;
  readonly now?: Date;
}): Promise<PlayerTrainingWorkspace> {
  const now = input.now ?? new Date();
  if (input.actor.isDemo && !process.env.DATABASE_URL) {
    return demoPlayerTrainingWorkspace(now);
  }
  requireTrainingDatabase();
  const database = getDatabase();
  const participantRows = (
    await database
      .select()
      .from(trainingProgramParticipants)
      .where(eq(trainingProgramParticipants.personId, input.actor.personId))
  ).filter((row) => ["active", "paused", "completed"].includes(row.status));
  const programIds = participantRows.map((row) => row.programId);
  if (!programIds.length) {
    return playerTrainingWorkspaceSchema.parse({
      generatedAt: now.toISOString(),
      programs: [],
      upcomingEvents: [],
      recentSessions: [],
      weeklyLoad: [],
    });
  }
  const [programRows, eventRows] = await Promise.all([
    database
      .select()
      .from(trainingPrograms)
      .where(inArray(trainingPrograms.id, programIds)),
    database
      .select()
      .from(trainingEvents)
      .where(inArray(trainingEvents.programId, programIds))
      .orderBy(asc(trainingEvents.startsAt))
      .limit(750),
  ]);
  const eventIds = eventRows.map((row) => row.id);
  const planVersionIds = eventRows
    .map((row) => row.practicePlanVersionId)
    .filter((value): value is string => Boolean(value));
  const [planVersionRows, responseRows] = await Promise.all([
    planVersionIds.length
      ? database
          .select()
          .from(trainingPracticePlanVersions)
          .where(inArray(trainingPracticePlanVersions.id, planVersionIds))
      : Promise.resolve([]),
    eventIds.length
      ? database
          .select()
          .from(trainingAthleteResponses)
          .where(
            and(
              eq(trainingAthleteResponses.personId, input.actor.personId),
              inArray(trainingAthleteResponses.trainingEventId, eventIds),
            ),
          )
      : Promise.resolve([]),
  ]);
  const planByVersionId = new Map(
    planVersionRows.flatMap((row) => {
      const parsed = trainingPracticePlanSchema.safeParse(row.snapshot);
      return parsed.success ? [[row.id, parsed.data] as const] : [];
    }),
  );
  const activeProgramRows = programRows.filter(
    (program) => program.status !== "archived" && !program.archivedAt,
  );
  const programById = new Map(activeProgramRows.map((row) => [row.id, row]));
  const responseByEventId = new Map(
    responseRows.map((row) => [row.trainingEventId, row]),
  );
  const events = eventRows.flatMap((row) => {
    if (!row.programId) return [];
    const program = programById.get(row.programId);
    if (!program) return [];
    const plan = row.practicePlanVersionId
      ? planByVersionId.get(row.practicePlanVersionId)
      : undefined;
    const response = responseByEventId.get(row.id);
    const parsed = playerTrainingEventSchema.safeParse({
      id: row.id,
      programId: row.programId,
      programTitle: program.title,
      kind: row.kind,
      title: row.title,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      timezone: row.timezone,
      status: row.status,
      ...(plan ? { focusArea: plan.focusArea } : {}),
      plannedLoad: row.plannedLoad,
      plannedIntensity: row.plannedIntensity,
      ...(plan ? { practice: athletePractice(plan) } : {}),
      ...(response
        ? {
            response: {
              attendanceStatus: response.attendanceStatus,
              ...(response.minutesParticipated !== null
                ? { minutesParticipated: response.minutesParticipated }
                : {}),
              ...(response.sessionRpe !== null
                ? { sessionRpe: response.sessionRpe }
                : {}),
              ...(response.feedback ? { feedback: response.feedback } : {}),
              ...(response.submittedAt
                ? { submittedAt: response.submittedAt.toISOString() }
                : {}),
            },
          }
        : {}),
    });
    return parsed.success ? [parsed.data] : [];
  });
  const upcomingEvents = events.filter(
    (event) =>
      event.status !== "cancelled" &&
      new Date(event.endsAt).getTime() >= now.getTime(),
  );
  const recentSessions = events
    .filter(
      (event) =>
        event.kind === "practice" &&
        new Date(event.endsAt).getTime() < now.getTime(),
    )
    .sort(
      (first, second) =>
        new Date(second.startsAt).getTime() -
        new Date(first.startsAt).getTime(),
    )
    .slice(0, 8);
  const programs = activeProgramRows.map((row) => {
    const programEvents = events.filter((event) => event.programId === row.id);
    const completedSessionCount = programEvents.filter(
      (event) => event.kind === "practice" && event.status === "completed",
    ).length;
    const milestone = nextPlayerMilestone(row.milestones, isoDate(now));
    return {
      id: row.id,
      title: row.title,
      purpose: row.purpose,
      startDate: row.startDate,
      endDate: row.endDate,
      currentPhase:
        row.status === "completed"
          ? "Complete"
          : row.status === "draft"
            ? "Preparing"
            : row.status === "archived"
              ? "Archived"
              : "In progress",
      completedSessionCount,
      scheduledSessionCount: row.scheduledSessionCount,
      ...(milestone ? { nextMilestone: milestone } : {}),
    };
  });
  const weeklyLoad = Array.from({ length: 6 }, (_, index) => {
    const start = addDays(now, index * 7);
    const end = addDays(start, 7);
    const matching = events.filter((event) => {
      const startsAt = new Date(event.startsAt);
      return startsAt >= start && startsAt < end;
    });
    return {
      week: weekLabel(start),
      planned: matching.length
        ? Math.round(
            matching.reduce((total, event) => total + event.plannedLoad, 0) /
              matching.length,
          )
        : 0,
      tournament: matching.some((event) => event.kind === "tournament"),
    };
  });
  return playerTrainingWorkspaceSchema.parse({
    generatedAt: now.toISOString(),
    programs,
    nextPractice: upcomingEvents.find((event) => event.kind === "practice"),
    upcomingEvents: upcomingEvents.slice(0, 30),
    recentSessions,
    weeklyLoad,
  });
}

export async function submitTrainingAthleteResponse(input: {
  readonly actor: ApiActor;
  readonly response: unknown;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly eventId: string; readonly submittedAt: string }> {
  const parsed = submitTrainingAthleteResponseInputSchema.parse(input.response);
  if (input.actor.isDemo && !process.env.DATABASE_URL) {
    return {
      eventId: parsed.trainingEventId,
      submittedAt: input.now.toISOString(),
    };
  }
  requireTrainingDatabase();
  const database = getDatabase();
  const [event] = await database
    .select()
    .from(trainingEvents)
    .where(eq(trainingEvents.id, parsed.trainingEventId))
    .limit(1);
  if (!event?.programId) {
    throw new TrainingServiceError(
      "RESOURCE_NOT_FOUND",
      "That training session is not available.",
    );
  }
  const [participant] = await database
    .select()
    .from(trainingProgramParticipants)
    .where(
      and(
        eq(trainingProgramParticipants.programId, event.programId),
        eq(trainingProgramParticipants.personId, input.actor.personId),
      ),
    )
    .limit(1);
  if (!participant || participant.status === "removed") {
    throw new TrainingServiceError(
      "FORBIDDEN",
      "Only athletes assigned to this program can submit a response.",
    );
  }
  if (event.endsAt.getTime() > input.now.getTime()) {
    throw new TrainingServiceError(
      "INVALID_CONFIGURATION",
      "The athlete check-in opens after the practice ends.",
    );
  }
  const databaseTransaction = getTransactionalDatabase();
  await databaseTransaction.transaction(async (transaction) => {
    await transaction
      .insert(trainingAthleteResponses)
      .values({
        trainingEventId: event.id,
        personId: input.actor.personId,
        attendanceStatus: parsed.attendanceStatus,
        minutesParticipated: parsed.minutesParticipated ?? null,
        sessionRpe: parsed.sessionRpe ?? null,
        feedback: parsed.feedback ?? null,
        submittedAt: input.now,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: [
          trainingAthleteResponses.trainingEventId,
          trainingAthleteResponses.personId,
        ],
        set: {
          attendanceStatus: parsed.attendanceStatus,
          minutesParticipated: parsed.minutesParticipated ?? null,
          sessionRpe: parsed.sessionRpe ?? null,
          feedback: parsed.feedback ?? null,
          submittedAt: input.now,
          updatedAt: input.now,
        },
      });
    await transaction.insert(auditLog).values({
      organizationId: event.organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "training-athlete-response.submitted",
      entityType: "training-event",
      entityId: event.id,
      afterHash: stableHash({
        attendanceStatus: parsed.attendanceStatus,
        minutesParticipated: parsed.minutesParticipated,
        sessionRpe: parsed.sessionRpe,
        feedback: parsed.feedback,
      }),
      reason: "Athlete submitted their own post-practice response.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return { eventId: event.id, submittedAt: input.now.toISOString() };
}

async function assertCatalogProgramOwnership(
  organizationId: string,
  catalogItemId: string | undefined,
) {
  if (!catalogItemId) return;
  const [item] = await getDatabase()
    .select({
      organizationId: catalogItems.organizationId,
      type: catalogItems.type,
      subtype: catalogItems.subtype,
    })
    .from(catalogItems)
    .where(eq(catalogItems.id, catalogItemId))
    .limit(1);
  if (
    !item ||
    item.organizationId !== organizationId ||
    item.type !== "service" ||
    item.subtype !== "program"
  ) {
    throw new TrainingServiceError(
      "RESOURCE_WRONG_ORGANIZATION",
      "The linked offer must be this organization's Program service.",
    );
  }
}

export async function createTrainingDrill(input: {
  readonly actor: ApiActor;
  readonly draft: unknown;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{
  readonly id: string;
  readonly versionId: string;
  readonly status: string;
}> {
  requireTrainingDatabase();
  const organizationId = requireOrganization(input.actor);
  if (!hasTrainingWrite(input.actor)) {
    throw new TrainingServiceError(
      "FORBIDDEN",
      "Your role cannot create training content.",
    );
  }
  const parsed = createTrainingDrillInputSchema.parse({
    draft: input.draft,
    idempotencyKey: input.idempotencyKey,
  });
  const id = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const status = parsed.draft.visibility === "public" ? "published" : "draft";
  const slug = `${slugify(parsed.draft.title)}-${id.slice(0, 6)}`;
  const marketplace =
    parsed.draft.visibility === "public"
      ? (parsed.draft.marketplace ?? {
          offer: "free" as const,
          currency: "USD" as const,
        })
      : undefined;
  const paidMarketplaceIds =
    marketplace?.offer === "paid"
      ? {
          catalogItemId: crypto.randomUUID(),
          catalogItemVersionId: crypto.randomUUID(),
          catalogVariantId: crypto.randomUUID(),
          catalogPriceId: crypto.randomUUID(),
        }
      : undefined;
  const saved = trainingDrillSchema.parse({
    ...parsed.draft,
    id,
    versionId,
    version: 1,
    slug,
    status,
    ownership: "organization",
    ...(marketplace
      ? {
          marketplace: {
            ...marketplace,
            ...(paidMarketplaceIds
              ? {
                  catalogItemId: paidMarketplaceIds.catalogItemId,
                  catalogVariantId: paidMarketplaceIds.catalogVariantId,
                  catalogPriceId: paidMarketplaceIds.catalogPriceId,
                }
              : {}),
            access: "owner",
          },
        }
      : { marketplace: undefined }),
    updatedAt: input.now.toISOString(),
  });
  const database = getTransactionalDatabase();
  await database.transaction(async (transaction) => {
    await transaction.insert(trainingDrills).values({
      id,
      organizationId,
      slug,
      title: saved.title,
      status,
      visibility: saved.visibility,
      activityKind: saved.activityKind,
      discipline: saved.discipline,
      skillLevel: saved.skillLevel,
      mode: saved.mode,
      purpose: saved.purpose,
      targetAudience: saved.targetAudience,
      summary: saved.summary,
      descriptionMarkdown: saved.descriptionMarkdown,
      minPlayers: saved.minPlayers,
      maxPlayers: saved.maxPlayers,
      recommendedPlayers: saved.recommendedPlayers,
      durationMinutes: saved.durationMinutes,
      intensity: saved.intensity,
      ballCount: saved.ballCount,
      equipment: saved.equipment,
      setup: { steps: saved.steps },
      choreography: saved.scene,
      scoring: { instructions: saved.scoring },
      coaching: {
        cues: saved.coachingCues,
        safety: saved.safety,
        variations: saved.variations,
      },
      estimateModel: saved.estimate,
      touchEstimateLow: saved.estimate.touchesLow,
      touchEstimateTypical: saved.estimate.touchesTypical,
      touchEstimateHigh: saved.estimate.touchesHigh,
      jumpEstimateTypical: saved.estimate.jumpsTypical,
      sourceName: saved.source?.name,
      sourceUrl: saved.source?.url,
      sourceLicense: saved.source?.license,
      sourceAttribution: saved.source?.attribution,
      currentVersionId: versionId,
      createdByPersonId: input.actor.personId,
      createdAt: input.now,
      updatedAt: input.now,
    });
    await transaction.insert(trainingDrillVersions).values({
      id: versionId,
      drillId: id,
      version: 1,
      snapshot: saved,
      changeNote: "Initial coach-authored version.",
      createdByPersonId: input.actor.personId,
      createdAt: input.now,
    });
    if (paidMarketplaceIds && saved.marketplace?.offer === "paid") {
      const catalogSlug = `drill-${slug}`;
      await transaction.insert(catalogItems).values({
        id: paidMarketplaceIds.catalogItemId,
        organizationId,
        type: "good",
        subtype: "digital-content",
        slug: catalogSlug,
        title: saved.title,
        shortSummary: saved.summary,
        description: saved.descriptionMarkdown,
        status: "active",
        visibility: "public",
        taxable: true,
        allowCard: true,
        allowCash: false,
        allowCredits: false,
        membershipRequired: false,
        defaultFulfillment: "digital-content",
        configuration: {
          trainingDrillId: id,
          saleEnabled: true,
          inventoryTracked: false,
          delivery: "organization-license",
        },
        currentVersionId: paidMarketplaceIds.catalogItemVersionId,
        createdByPersonId: input.actor.personId,
        publishedAt: input.now,
        createdAt: input.now,
        updatedAt: input.now,
      });
      await transaction.insert(catalogVariants).values({
        id: paidMarketplaceIds.catalogVariantId,
        organizationId,
        catalogItemId: paidMarketplaceIds.catalogItemId,
        sku: `DRILL-${id.slice(0, 8).toUpperCase()}`,
        title: "Organization license",
        optionCoordinates: {},
        status: "active",
        createdAt: input.now,
        updatedAt: input.now,
      });
      await transaction.insert(catalogPrices).values({
        id: paidMarketplaceIds.catalogPriceId,
        organizationId,
        catalogItemId: paidMarketplaceIds.catalogItemId,
        catalogVariantId: paidMarketplaceIds.catalogVariantId,
        audience: "everyone",
        paymentKind: "card",
        amountMinor: saved.marketplace.priceMinor!,
        currency: saved.marketplace.currency,
        taxBehavior: "exclusive",
        active: true,
        createdAt: input.now,
        updatedAt: input.now,
      });
      await transaction.insert(catalogItemVersions).values({
        id: paidMarketplaceIds.catalogItemVersionId,
        organizationId,
        catalogItemId: paidMarketplaceIds.catalogItemId,
        version: 1,
        snapshot: {
          type: "good",
          subtype: "digital-content",
          title: saved.title,
          shortSummary: saved.summary,
          description: saved.descriptionMarkdown,
          visibility: "public",
          defaultFulfillment: "digital-content",
          configuration: {
            trainingDrillId: id,
            delivery: "organization-license",
          },
          price: {
            amountMinor: saved.marketplace.priceMinor,
            currency: saved.marketplace.currency,
          },
        },
        createdByPersonId: input.actor.personId,
        createdAt: input.now,
      });
    }
    for (const tag of saved.tags) {
      const normalized = normalizeTrainingTag(tag.label);
      const [existing] = await transaction
        .select({ id: trainingTags.id })
        .from(trainingTags)
        .where(
          and(
            eq(trainingTags.slug, normalized.slug),
            or(
              isNull(trainingTags.organizationId),
              eq(trainingTags.organizationId, organizationId),
            ),
          ),
        )
        .limit(1);
      const tagId = existing?.id ?? crypto.randomUUID();
      if (!existing) {
        await transaction.insert(trainingTags).values({
          id: tagId,
          organizationId,
          slug: normalized.slug,
          label: normalized.label,
          aliases: [],
          category: tag.isFocusArea ? "focus" : tag.category,
          isFocusArea: tag.isFocusArea,
          createdByPersonId: input.actor.personId,
          createdAt: input.now,
          updatedAt: input.now,
        });
      }
      await transaction.insert(trainingDrillTags).values({
        drillId: id,
        tagId,
        isFocusArea: tag.isFocusArea,
        createdAt: input.now,
      });
    }
    await transaction.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "training-drill.created",
      entityType: "training-drill",
      entityId: id,
      afterHash: stableHash(saved),
      reason:
        status === "published"
          ? "Coach published a drill to the shared Drill Marketplace."
          : "Coach created an organization-private drill draft.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return { id, versionId, status };
}

export async function createTrainingPracticePlan(input: {
  readonly actor: ApiActor;
  readonly plan: unknown;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{
  readonly id: string;
  readonly versionId: string;
  readonly status: "draft";
}> {
  requireTrainingDatabase();
  const organizationId = requireOrganization(input.actor);
  if (!hasTrainingWrite(input.actor)) {
    throw new TrainingServiceError(
      "FORBIDDEN",
      "Your role cannot create practice plans.",
    );
  }
  const parsed = createTrainingPracticePlanInputSchema.parse({
    plan: input.plan,
    idempotencyKey: input.idempotencyKey,
  });
  const id = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const slug = `${slugify(parsed.plan.title)}-${id.slice(0, 6)}`;
  const blocks = parsed.plan.blocks.map((block) => ({
    ...block,
    id: crypto.randomUUID(),
  }));
  const saved = trainingPracticePlanSchema.parse({
    ...parsed.plan,
    id,
    versionId,
    version: 1,
    slug,
    status: "draft",
    blocks,
    totalTouchesTypical: blocks.reduce(
      (sum, block) => sum + block.touchesTypical,
      0,
    ),
    totalJumpsTypical: blocks.reduce(
      (sum, block) => sum + block.jumpsTypical,
      0,
    ),
    updatedAt: input.now.toISOString(),
  });
  const drillIds = blocks
    .map((block) => block.drillId)
    .filter((value): value is string => Boolean(value));
  const currentDrills = drillIds.length
    ? await getDatabase()
        .select({
          id: trainingDrills.id,
          versionId: trainingDrills.currentVersionId,
          organizationId: trainingDrills.organizationId,
          visibility: trainingDrills.visibility,
          status: trainingDrills.status,
        })
        .from(trainingDrills)
        .where(inArray(trainingDrills.id, drillIds))
    : [];
  const drillVersionByDrillId = new Map(
    currentDrills
      .filter(
        (drill) =>
          drill.versionId &&
          (drill.organizationId === organizationId ||
            (drill.visibility === "public" && drill.status === "published")),
      )
      .map((drill) => [drill.id, drill.versionId!]),
  );
  if (
    drillIds.some(
      (drillId) =>
        !BUILT_IN_DUNA_DRILL_IDS.has(drillId) &&
        !drillVersionByDrillId.has(drillId),
    )
  ) {
    throw new TrainingServiceError(
      "RESOURCE_WRONG_ORGANIZATION",
      "A practice block uses a drill that is no longer available to this organization.",
    );
  }
  const database = getTransactionalDatabase();
  await database.transaction(async (transaction) => {
    await transaction.insert(trainingPracticePlans).values({
      id,
      organizationId,
      slug,
      title: saved.title,
      purpose: saved.purpose,
      targetAudience: saved.targetAudience,
      status: "draft",
      visibility: saved.visibility,
      durationMinutes: saved.durationMinutes,
      plannedLoad: saved.plannedLoad,
      currentVersionId: versionId,
      createdByPersonId: input.actor.personId,
      createdAt: input.now,
      updatedAt: input.now,
    });
    await transaction.insert(trainingPracticePlanVersions).values({
      id: versionId,
      practicePlanId: id,
      version: 1,
      snapshot: saved,
      changeNote: "Initial coach-authored practice plan.",
      createdByPersonId: input.actor.personId,
      createdAt: input.now,
    });
    for (const block of blocks) {
      await transaction.insert(trainingPracticePlanBlocks).values({
        id: block.id,
        practicePlanVersionId: versionId,
        drillVersionId: block.drillId
          ? drillVersionByDrillId.get(block.drillId)
          : undefined,
        sequence: block.sequence,
        lane: block.lane,
        title: block.title,
        kind: block.kind,
        startsAtMinute: block.startsAtMinute,
        durationMinutes: block.durationMinutes,
        transitionMinutes: block.transitionMinutes,
        intensity: block.intensity,
        plannedLoad: block.plannedLoad,
        instructionsMarkdown: block.instructions,
        estimates: {
          touchesTypical: block.touchesTypical,
          jumpsTypical: block.jumpsTypical,
          focusArea: block.focusArea,
        },
        locked: block.locked,
        createdAt: input.now,
      });
    }
    for (const tag of saved.tags) {
      const normalized = normalizeTrainingTag(tag.label);
      const [existing] = await transaction
        .select({ id: trainingTags.id })
        .from(trainingTags)
        .where(
          and(
            eq(trainingTags.slug, normalized.slug),
            or(
              isNull(trainingTags.organizationId),
              eq(trainingTags.organizationId, organizationId),
            ),
          ),
        )
        .limit(1);
      const tagId = existing?.id ?? crypto.randomUUID();
      if (!existing) {
        await transaction.insert(trainingTags).values({
          id: tagId,
          organizationId,
          slug: normalized.slug,
          label: normalized.label,
          aliases: [],
          category: tag.isFocusArea ? "focus" : tag.category,
          isFocusArea: tag.isFocusArea,
          createdByPersonId: input.actor.personId,
          createdAt: input.now,
          updatedAt: input.now,
        });
      }
      await transaction.insert(trainingPracticePlanTags).values({
        practicePlanId: id,
        tagId,
        isFocusArea: tag.isFocusArea,
        createdAt: input.now,
      });
    }
    await transaction.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "training-practice-plan.created",
      entityType: "training-practice-plan",
      entityId: id,
      afterHash: stableHash(saved),
      reason: "Coach created an immutable practice-plan version for review.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return { id, versionId, status: "draft" };
}

export async function updateTrainingPracticePlan(input: {
  readonly actor: ApiActor;
  readonly practicePlanId: string;
  readonly plan: unknown;
  readonly changeNote?: string;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{
  readonly id: string;
  readonly versionId: string;
  readonly status: "draft" | "review" | "published";
}> {
  requireTrainingDatabase();
  const organizationId = requireOrganization(input.actor);
  if (!hasTrainingWrite(input.actor)) {
    throw new TrainingServiceError(
      "FORBIDDEN",
      "Your role cannot update practice plans.",
    );
  }
  const parsed = updateTrainingPracticePlanInputSchema.parse(input);
  const database = getDatabase();
  const [existingPlan, existingVersions] = await Promise.all([
    database
      .select()
      .from(trainingPracticePlans)
      .where(
        and(
          eq(trainingPracticePlans.id, parsed.practicePlanId),
          eq(trainingPracticePlans.organizationId, organizationId),
        ),
      )
      .limit(1),
    database
      .select({
        id: trainingPracticePlanVersions.id,
        version: trainingPracticePlanVersions.version,
      })
      .from(trainingPracticePlanVersions)
      .where(
        eq(trainingPracticePlanVersions.practicePlanId, parsed.practicePlanId),
      )
      .orderBy(desc(trainingPracticePlanVersions.version)),
  ]);
  const plan = existingPlan[0];
  if (!plan) {
    throw new TrainingServiceError(
      "RESOURCE_NOT_FOUND",
      "This practice plan is no longer available.",
    );
  }
  if (plan.status === "archived" || plan.archivedAt) {
    throw new TrainingServiceError(
      "INVALID_CONFIGURATION",
      "Restore this archived practice plan before creating a new version.",
    );
  }
  const blocks = parsed.plan.blocks.map((block) => ({
    ...block,
    id: crypto.randomUUID(),
  }));
  const versionId = crypto.randomUUID();
  const version = (existingVersions[0]?.version ?? 0) + 1;
  const saved = trainingPracticePlanSchema.parse({
    ...parsed.plan,
    id: plan.id,
    versionId,
    version,
    slug: plan.slug,
    status: plan.status,
    blocks,
    totalTouchesTypical: blocks.reduce(
      (sum, block) => sum + block.touchesTypical,
      0,
    ),
    totalJumpsTypical: blocks.reduce(
      (sum, block) => sum + block.jumpsTypical,
      0,
    ),
    updatedAt: input.now.toISOString(),
  });
  const drillIds = blocks
    .map((block) => block.drillId)
    .filter((value): value is string => Boolean(value));
  const currentDrills = drillIds.length
    ? await database
        .select({
          id: trainingDrills.id,
          versionId: trainingDrills.currentVersionId,
          organizationId: trainingDrills.organizationId,
          visibility: trainingDrills.visibility,
          status: trainingDrills.status,
        })
        .from(trainingDrills)
        .where(inArray(trainingDrills.id, drillIds))
    : [];
  const drillVersionByDrillId = new Map(
    currentDrills
      .filter(
        (drill) =>
          drill.versionId &&
          (drill.organizationId === organizationId ||
            (drill.visibility === "public" && drill.status === "published")),
      )
      .map((drill) => [drill.id, drill.versionId!]),
  );
  if (
    drillIds.some(
      (drillId) =>
        !BUILT_IN_DUNA_DRILL_IDS.has(drillId) &&
        !drillVersionByDrillId.has(drillId),
    )
  ) {
    throw new TrainingServiceError(
      "RESOURCE_WRONG_ORGANIZATION",
      "A practice block uses a drill that is no longer available to this organization.",
    );
  }
  const staleVersionIds = existingVersions
    .slice(TRAINING_VERSION_RETENTION - 1)
    .map((entry) => entry.id);
  const transactional = getTransactionalDatabase();
  await transactional.transaction(async (transaction) => {
    await transaction
      .update(trainingPracticePlans)
      .set({
        title: saved.title,
        purpose: saved.purpose,
        targetAudience: saved.targetAudience,
        visibility: saved.visibility,
        durationMinutes: saved.durationMinutes,
        plannedLoad: saved.plannedLoad,
        currentVersionId: versionId,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(trainingPracticePlans.id, plan.id),
          eq(trainingPracticePlans.organizationId, organizationId),
        ),
      );
    await transaction.insert(trainingPracticePlanVersions).values({
      id: versionId,
      practicePlanId: plan.id,
      version,
      snapshot: saved,
      changeNote:
        parsed.changeNote ?? "Coach updated the practice-plan timeline.",
      createdByPersonId: input.actor.personId,
      createdAt: input.now,
    });
    await transaction.insert(trainingPracticePlanBlocks).values(
      blocks.map((block) => ({
        id: block.id,
        practicePlanVersionId: versionId,
        drillVersionId: block.drillId
          ? drillVersionByDrillId.get(block.drillId)
          : undefined,
        sequence: block.sequence,
        lane: block.lane,
        title: block.title,
        kind: block.kind,
        startsAtMinute: block.startsAtMinute,
        durationMinutes: block.durationMinutes,
        transitionMinutes: block.transitionMinutes,
        intensity: block.intensity,
        plannedLoad: block.plannedLoad,
        instructionsMarkdown: block.instructions,
        estimates: {
          touchesTypical: block.touchesTypical,
          jumpsTypical: block.jumpsTypical,
          focusArea: block.focusArea,
        },
        locked: block.locked,
        createdAt: input.now,
      })),
    );
    await transaction
      .delete(trainingPracticePlanTags)
      .where(eq(trainingPracticePlanTags.practicePlanId, plan.id));
    for (const tag of saved.tags) {
      const normalized = normalizeTrainingTag(tag.label);
      const [existingTag] = await transaction
        .select({ id: trainingTags.id })
        .from(trainingTags)
        .where(
          and(
            eq(trainingTags.slug, normalized.slug),
            or(
              isNull(trainingTags.organizationId),
              eq(trainingTags.organizationId, organizationId),
            ),
          ),
        )
        .limit(1);
      const tagId = existingTag?.id ?? crypto.randomUUID();
      if (!existingTag) {
        await transaction.insert(trainingTags).values({
          id: tagId,
          organizationId,
          slug: normalized.slug,
          label: normalized.label,
          aliases: [],
          category: tag.isFocusArea ? "focus" : tag.category,
          isFocusArea: tag.isFocusArea,
          createdByPersonId: input.actor.personId,
          createdAt: input.now,
          updatedAt: input.now,
        });
      }
      await transaction.insert(trainingPracticePlanTags).values({
        practicePlanId: plan.id,
        tagId,
        isFocusArea: tag.isFocusArea,
        createdAt: input.now,
      });
    }
    if (staleVersionIds.length) {
      const [eventReferences, outcomeReferences] = await Promise.all([
        transaction
          .select({ versionId: trainingEvents.practicePlanVersionId })
          .from(trainingEvents)
          .where(
            inArray(trainingEvents.practicePlanVersionId, staleVersionIds),
          ),
        transaction
          .select({ versionId: trainingPracticeOutcomes.practicePlanVersionId })
          .from(trainingPracticeOutcomes)
          .where(
            inArray(
              trainingPracticeOutcomes.practicePlanVersionId,
              staleVersionIds,
            ),
          ),
      ]);
      const protectedVersionIds = new Set(
        [...eventReferences, ...outcomeReferences]
          .map((reference) => reference.versionId)
          .filter((value): value is string => Boolean(value)),
      );
      const removableVersionIds = staleVersionIds.filter(
        (entry) => !protectedVersionIds.has(entry),
      );
      if (removableVersionIds.length) {
        await transaction
          .delete(trainingPracticePlanVersions)
          .where(inArray(trainingPracticePlanVersions.id, removableVersionIds));
      }
    }
    await transaction.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "training-practice-plan.version-created",
      entityType: "training-practice-plan",
      entityId: plan.id,
      beforeHash: stableHash({ versionId: plan.currentVersionId }),
      afterHash: stableHash(saved),
      reason:
        "Coach created a new restorable practice-plan version. Assigned session snapshots remain untouched.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return { id: plan.id, versionId, status: plan.status };
}

export async function archiveTrainingPracticePlan(input: {
  readonly actor: ApiActor;
  readonly practicePlanId: string;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly id: string; readonly status: "archived" }> {
  requireTrainingDatabase();
  const organizationId = requireOrganization(input.actor);
  if (!hasTrainingWrite(input.actor)) {
    throw new TrainingServiceError(
      "FORBIDDEN",
      "Your role cannot archive practice plans.",
    );
  }
  const parsed = archiveTrainingPracticePlanInputSchema.parse(input);
  const database = getDatabase();
  const [plan] = await database
    .select()
    .from(trainingPracticePlans)
    .where(
      and(
        eq(trainingPracticePlans.id, parsed.practicePlanId),
        eq(trainingPracticePlans.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!plan) {
    throw new TrainingServiceError(
      "RESOURCE_NOT_FOUND",
      "This practice plan is no longer available.",
    );
  }
  if (plan.status === "archived" || plan.archivedAt) {
    return { id: plan.id, status: "archived" };
  }
  const versions = await database
    .select({ id: trainingPracticePlanVersions.id })
    .from(trainingPracticePlanVersions)
    .where(eq(trainingPracticePlanVersions.practicePlanId, plan.id))
    .orderBy(desc(trainingPracticePlanVersions.version));
  const staleVersionIds = versions
    .slice(TRAINING_VERSION_RETENTION)
    .map((version) => version.id);
  const transactional = getTransactionalDatabase();
  await transactional.transaction(async (transaction) => {
    await transaction
      .update(trainingPracticePlans)
      .set({ status: "archived", archivedAt: input.now, updatedAt: input.now })
      .where(
        and(
          eq(trainingPracticePlans.id, plan.id),
          eq(trainingPracticePlans.organizationId, organizationId),
        ),
      );
    if (staleVersionIds.length) {
      const [eventReferences, outcomeReferences] = await Promise.all([
        transaction
          .select({ versionId: trainingEvents.practicePlanVersionId })
          .from(trainingEvents)
          .where(
            inArray(trainingEvents.practicePlanVersionId, staleVersionIds),
          ),
        transaction
          .select({ versionId: trainingPracticeOutcomes.practicePlanVersionId })
          .from(trainingPracticeOutcomes)
          .where(
            inArray(
              trainingPracticeOutcomes.practicePlanVersionId,
              staleVersionIds,
            ),
          ),
      ]);
      const protectedVersionIds = new Set(
        [...eventReferences, ...outcomeReferences]
          .map((reference) => reference.versionId)
          .filter((value): value is string => Boolean(value)),
      );
      const removableVersionIds = staleVersionIds.filter(
        (versionId) => !protectedVersionIds.has(versionId),
      );
      if (removableVersionIds.length) {
        await transaction
          .delete(trainingPracticePlanVersions)
          .where(inArray(trainingPracticePlanVersions.id, removableVersionIds));
      }
    }
    await transaction.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "training-practice-plan.archived",
      entityType: "training-practice-plan",
      entityId: plan.id,
      beforeHash: stableHash({ status: plan.status }),
      afterHash: stableHash({ status: "archived" }),
      reason:
        "Coach archived the reusable practice plan. Existing assigned session versions remain available to the session record.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return { id: plan.id, status: "archived" };
}

export async function restoreTrainingPracticePlanArchive(input: {
  readonly actor: ApiActor;
  readonly practicePlanId: string;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{
  readonly id: string;
  readonly status: "draft" | "review" | "published";
}> {
  requireTrainingDatabase();
  const organizationId = requireOrganization(input.actor);
  if (!hasTrainingWrite(input.actor)) {
    throw new TrainingServiceError(
      "FORBIDDEN",
      "Your role cannot restore practice plans.",
    );
  }
  const parsed = restoreTrainingPracticePlanArchiveInputSchema.parse(input);
  const database = getDatabase();
  const [plan] = await database
    .select()
    .from(trainingPracticePlans)
    .where(
      and(
        eq(trainingPracticePlans.id, parsed.practicePlanId),
        eq(trainingPracticePlans.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!plan) {
    throw new TrainingServiceError(
      "RESOURCE_NOT_FOUND",
      "This practice plan is no longer available.",
    );
  }
  if (plan.status !== "archived" && !plan.archivedAt) {
    return { id: plan.id, status: plan.status };
  }
  const transactional = getTransactionalDatabase();
  await transactional.transaction(async (transaction) => {
    await transaction
      .update(trainingPracticePlans)
      .set({ status: "draft", archivedAt: null, updatedAt: input.now })
      .where(
        and(
          eq(trainingPracticePlans.id, plan.id),
          eq(trainingPracticePlans.organizationId, organizationId),
        ),
      );
    await transaction.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "training-practice-plan.restored",
      entityType: "training-practice-plan",
      entityId: plan.id,
      beforeHash: stableHash({ status: plan.status }),
      afterHash: stableHash({ status: "draft" }),
      reason:
        "Coach restored the archived practice plan as a private draft. Assigned session history was not changed.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return { id: plan.id, status: "draft" };
}

export async function restoreTrainingPracticePlanVersion(input: {
  readonly actor: ApiActor;
  readonly practicePlanId: string;
  readonly versionId: string;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly id: string; readonly versionId: string }> {
  requireTrainingDatabase();
  const organizationId = requireOrganization(input.actor);
  if (!hasTrainingWrite(input.actor)) {
    throw new TrainingServiceError(
      "FORBIDDEN",
      "Your role cannot restore practice-plan versions.",
    );
  }
  const parsed = restoreTrainingPracticePlanVersionInputSchema.parse(input);
  const database = getDatabase();
  const [plan, versions, target, sourceBlocks] = await Promise.all([
    database
      .select()
      .from(trainingPracticePlans)
      .where(
        and(
          eq(trainingPracticePlans.id, parsed.practicePlanId),
          eq(trainingPracticePlans.organizationId, organizationId),
        ),
      )
      .limit(1),
    database
      .select({
        id: trainingPracticePlanVersions.id,
        version: trainingPracticePlanVersions.version,
      })
      .from(trainingPracticePlanVersions)
      .where(
        eq(trainingPracticePlanVersions.practicePlanId, parsed.practicePlanId),
      )
      .orderBy(desc(trainingPracticePlanVersions.version)),
    database
      .select({
        id: trainingPracticePlanVersions.id,
        version: trainingPracticePlanVersions.version,
        snapshot: trainingPracticePlanVersions.snapshot,
      })
      .from(trainingPracticePlanVersions)
      .where(
        and(
          eq(trainingPracticePlanVersions.id, parsed.versionId),
          eq(
            trainingPracticePlanVersions.practicePlanId,
            parsed.practicePlanId,
          ),
        ),
      )
      .limit(1),
    database
      .select({
        id: trainingPracticePlanBlocks.id,
        drillVersionId: trainingPracticePlanBlocks.drillVersionId,
      })
      .from(trainingPracticePlanBlocks)
      .where(
        eq(trainingPracticePlanBlocks.practicePlanVersionId, parsed.versionId),
      ),
  ]);
  const currentPlan = plan[0];
  const selectedVersion = target[0];
  if (!currentPlan || !selectedVersion) {
    throw new TrainingServiceError(
      "RESOURCE_NOT_FOUND",
      "That recoverable practice-plan version is no longer available.",
    );
  }
  const restored = trainingPracticePlanSchema.safeParse(
    selectedVersion.snapshot,
  );
  if (!restored.success) {
    throw new TrainingServiceError(
      "INVALID_CONFIGURATION",
      "This historical practice-plan version cannot be restored safely.",
    );
  }
  const nextVersionId = crypto.randomUUID();
  const nextVersion = (versions[0]?.version ?? 0) + 1;
  const restoredStatus =
    currentPlan.status === "archived" ? "draft" : currentPlan.status;
  const newBlocks = restored.data.blocks.map((block) => ({
    ...block,
    id: crypto.randomUUID(),
  }));
  const saved = trainingPracticePlanSchema.parse({
    ...restored.data,
    id: currentPlan.id,
    versionId: nextVersionId,
    version: nextVersion,
    slug: currentPlan.slug,
    status: restoredStatus,
    visibility: currentPlan.visibility,
    blocks: newBlocks,
    updatedAt: input.now.toISOString(),
  });
  const sourceBlockById = new Map(
    sourceBlocks.map((block) => [block.id, block]),
  );
  const staleVersionIds = versions
    .slice(TRAINING_VERSION_RETENTION - 1)
    .map((version) => version.id);
  const transactional = getTransactionalDatabase();
  await transactional.transaction(async (transaction) => {
    await transaction
      .update(trainingPracticePlans)
      .set({
        title: saved.title,
        purpose: saved.purpose,
        targetAudience: saved.targetAudience,
        status: restoredStatus,
        visibility: saved.visibility,
        durationMinutes: saved.durationMinutes,
        plannedLoad: saved.plannedLoad,
        archivedAt: restoredStatus === "draft" ? null : currentPlan.archivedAt,
        currentVersionId: nextVersionId,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(trainingPracticePlans.id, currentPlan.id),
          eq(trainingPracticePlans.organizationId, organizationId),
        ),
      );
    await transaction.insert(trainingPracticePlanVersions).values({
      id: nextVersionId,
      practicePlanId: currentPlan.id,
      version: nextVersion,
      snapshot: saved,
      changeNote: `Restored from version ${selectedVersion.version}.`,
      createdByPersonId: input.actor.personId,
      createdAt: input.now,
    });
    await transaction.insert(trainingPracticePlanBlocks).values(
      saved.blocks.map((block, index) => ({
        id: block.id,
        practicePlanVersionId: nextVersionId,
        drillVersionId: sourceBlockById.get(restored.data.blocks[index]!.id)
          ?.drillVersionId,
        sequence: block.sequence,
        lane: block.lane,
        title: block.title,
        kind: block.kind,
        startsAtMinute: block.startsAtMinute,
        durationMinutes: block.durationMinutes,
        transitionMinutes: block.transitionMinutes,
        intensity: block.intensity,
        plannedLoad: block.plannedLoad,
        instructionsMarkdown: block.instructions,
        estimates: {
          touchesTypical: block.touchesTypical,
          jumpsTypical: block.jumpsTypical,
          focusArea: block.focusArea,
        },
        locked: block.locked,
        createdAt: input.now,
      })),
    );
    await transaction
      .delete(trainingPracticePlanTags)
      .where(eq(trainingPracticePlanTags.practicePlanId, currentPlan.id));
    for (const tag of saved.tags) {
      const normalized = normalizeTrainingTag(tag.label);
      const [existingTag] = await transaction
        .select({ id: trainingTags.id })
        .from(trainingTags)
        .where(
          and(
            eq(trainingTags.slug, normalized.slug),
            or(
              isNull(trainingTags.organizationId),
              eq(trainingTags.organizationId, organizationId),
            ),
          ),
        )
        .limit(1);
      const tagId = existingTag?.id ?? crypto.randomUUID();
      if (!existingTag) {
        await transaction.insert(trainingTags).values({
          id: tagId,
          organizationId,
          slug: normalized.slug,
          label: normalized.label,
          aliases: [],
          category: tag.isFocusArea ? "focus" : tag.category,
          isFocusArea: tag.isFocusArea,
          createdByPersonId: input.actor.personId,
          createdAt: input.now,
          updatedAt: input.now,
        });
      }
      await transaction.insert(trainingPracticePlanTags).values({
        practicePlanId: currentPlan.id,
        tagId,
        isFocusArea: tag.isFocusArea,
        createdAt: input.now,
      });
    }
    if (staleVersionIds.length) {
      const [eventReferences, outcomeReferences] = await Promise.all([
        transaction
          .select({ versionId: trainingEvents.practicePlanVersionId })
          .from(trainingEvents)
          .where(
            inArray(trainingEvents.practicePlanVersionId, staleVersionIds),
          ),
        transaction
          .select({ versionId: trainingPracticeOutcomes.practicePlanVersionId })
          .from(trainingPracticeOutcomes)
          .where(
            inArray(
              trainingPracticeOutcomes.practicePlanVersionId,
              staleVersionIds,
            ),
          ),
      ]);
      const protectedVersionIds = new Set(
        [...eventReferences, ...outcomeReferences]
          .map((reference) => reference.versionId)
          .filter((value): value is string => Boolean(value)),
      );
      const removableVersionIds = staleVersionIds.filter(
        (versionId) => !protectedVersionIds.has(versionId),
      );
      if (removableVersionIds.length) {
        await transaction
          .delete(trainingPracticePlanVersions)
          .where(inArray(trainingPracticePlanVersions.id, removableVersionIds));
      }
    }
    await transaction.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "training-practice-plan.version-restored",
      entityType: "training-practice-plan",
      entityId: currentPlan.id,
      beforeHash: stableHash({ versionId: currentPlan.currentVersionId }),
      afterHash: stableHash(saved),
      reason:
        "Coach restored a prior practice plan into a new current version. Assigned session snapshots remain untouched.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return { id: currentPlan.id, versionId: nextVersionId };
}

export function validateTrainingProgramOccurrenceSchedule(
  brief: Pick<DraftTrainingProgramInput, "startDate" | "endDate">,
  occurrences: TrainingProgramDraft["occurrences"],
): { readonly sessionCount: number; readonly plannedMinutes: number } {
  const occurrenceKeys = new Set<string>();
  for (const occurrence of occurrences) {
    if (
      occurrence.localDate < brief.startDate ||
      occurrence.localDate > brief.endDate
    ) {
      throw new TrainingServiceError(
        "INVALID_SCHEDULE",
        "Every practice must stay inside the program date window.",
      );
    }
    const key = `${occurrence.localDate}:${occurrence.startsAt}`;
    if (occurrenceKeys.has(key)) {
      throw new TrainingServiceError(
        "INVALID_SCHEDULE",
        "Each practice needs its own date and start time.",
      );
    }
    occurrenceKeys.add(key);
  }
  return {
    sessionCount: occurrences.length,
    plannedMinutes: occurrences.reduce(
      (total, occurrence) => total + occurrence.durationMinutes,
      0,
    ),
  };
}

export async function createTrainingProgram(input: {
  readonly actor: ApiActor;
  readonly brief: unknown;
  readonly draft: unknown;
  readonly catalogItemId?: string;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{
  readonly id: string;
  readonly sessionCount: number;
  readonly status: "draft";
}> {
  requireTrainingDatabase();
  const organizationId = requireOrganization(input.actor);
  if (!hasTrainingWrite(input.actor)) {
    throw new TrainingServiceError(
      "FORBIDDEN",
      "Your role cannot create programs.",
    );
  }
  const parsed = createTrainingProgramInputSchema.parse({
    brief: input.brief,
    draft: input.draft,
    catalogItemId: input.catalogItemId,
    idempotencyKey: input.idempotencyKey,
  });
  await assertCatalogProgramOwnership(organizationId, parsed.catalogItemId);
  const schedule = validateTrainingProgramOccurrenceSchedule(
    parsed.brief,
    parsed.draft.occurrences,
  );
  const scheduledSessionCount = schedule.sessionCount;
  const id = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const slug = `${slugify(parsed.brief.title)}-${id.slice(0, 6)}`;
  const eventSnapshot = trainingProgramVersionSnapshotSchema.parse({
    program: {
      title: parsed.brief.title,
      purpose: parsed.brief.purpose,
      targetAudience: parsed.brief.targetAudience,
      objectives: parsed.brief.objectives,
      approach: parsed.brief.approach,
      startDate: parsed.brief.startDate,
      endDate: parsed.brief.endDate,
      timezone: parsed.brief.timezone,
      recurrence: parsed.brief.recurrence,
      milestones: parsed.brief.milestones,
      scheduledSessionCount,
      defaultPracticeMinutes: parsed.brief.preferredPracticeMinutes,
      athleteCount: parsed.brief.athleteCount,
    },
    events: [
      ...parsed.draft.occurrences.map((occurrence) => {
        const startsAt = localTrainingTimeToUtc(
          occurrence.localDate,
          occurrence.startsAt,
          parsed.brief.timezone,
        );
        return {
          id: crypto.randomUUID(),
          kind: "practice" as const,
          title: occurrence.title,
          startsAt: startsAt.toISOString(),
          endsAt: new Date(
            startsAt.getTime() + occurrence.durationMinutes * 60_000,
          ).toISOString(),
          timezone: parsed.brief.timezone,
          status: "planned" as const,
          objectives: [occurrence.rationale],
          plannedLoad: occurrence.plannedLoad,
          plannedIntensity: clamp(
            Math.round(occurrence.plannedLoad / 10),
            1,
            10,
          ),
          externalLoad: {
            phase: occurrence.phase,
            focusArea: occurrence.focusArea,
            estimateKind: "coach-plan",
          },
          source: "ai-draft" as const,
        };
      }),
      ...parsed.brief.milestones.map((milestone) => {
        const startsAt = localTrainingTimeToUtc(
          milestone.startsOn,
          milestone.kind === "tournament" ? "08:00" : "12:00",
          parsed.brief.timezone,
        );
        const endDate = new Date(`${milestone.endsOn}T12:00:00.000Z`);
        const startDate = new Date(`${milestone.startsOn}T12:00:00.000Z`);
        const daySpan = Math.max(
          1,
          Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) +
            1,
        );
        return {
          id: crypto.randomUUID(),
          kind:
            milestone.kind === "break"
              ? ("rest" as const)
              : milestone.kind === "assessment"
                ? ("assessment" as const)
                : milestone.kind,
          title: milestone.title,
          startsAt: startsAt.toISOString(),
          endsAt: new Date(
            startsAt.getTime() +
              daySpan *
                (milestone.kind === "tournament" ? 10 : 4) *
                60 *
                60_000,
          ).toISOString(),
          timezone: parsed.brief.timezone,
          status: "planned" as const,
          objectives: milestone.notes ? [milestone.notes] : [],
          plannedLoad:
            milestone.kind === "tournament"
              ? 90
              : milestone.kind === "travel"
                ? 15
                : 30,
          plannedIntensity: milestone.kind === "tournament" ? 9 : 2,
          externalLoad: { priority: milestone.priority },
          source: "ai-draft" as const,
        };
      }),
    ],
  });
  const database = getTransactionalDatabase();
  await database.transaction(async (transaction) => {
    await transaction.insert(trainingPrograms).values({
      id,
      organizationId,
      catalogItemId: parsed.catalogItemId,
      slug,
      title: parsed.brief.title,
      purpose: parsed.brief.purpose,
      targetAudience: parsed.brief.targetAudience,
      objectives: parsed.brief.objectives,
      approach: parsed.brief.approach,
      status: "draft",
      startDate: parsed.brief.startDate,
      endDate: parsed.brief.endDate,
      timezone: parsed.brief.timezone,
      recurrence: parsed.brief.recurrence,
      milestones: parsed.brief.milestones,
      scheduledSessionCount,
      defaultPracticeMinutes: parsed.brief.preferredPracticeMinutes,
      athleteCount: parsed.brief.athleteCount,
      currentVersionId: versionId,
      createdByPersonId: input.actor.personId,
      createdAt: input.now,
      updatedAt: input.now,
    });
    await transaction.insert(trainingEvents).values(
      eventSnapshot.events.map((event) => ({
        id: event.id,
        organizationId,
        programId: id,
        kind: event.kind,
        title: event.title,
        startsAt: new Date(event.startsAt),
        endsAt: new Date(event.endsAt),
        timezone: event.timezone,
        status: event.status,
        practicePlanVersionId: event.practicePlanVersionId,
        objectives: event.objectives,
        plannedLoad: event.plannedLoad,
        plannedIntensity: event.plannedIntensity,
        externalLoad: event.externalLoad,
        source: event.source,
        createdByPersonId: input.actor.personId,
        createdAt: input.now,
        updatedAt: input.now,
      })),
    );
    await transaction.insert(trainingProgramVersions).values({
      id: versionId,
      programId: id,
      version: 1,
      snapshot: eventSnapshot,
      changeNote: "Initial coach-authored program calendar.",
      createdByPersonId: input.actor.personId,
      createdAt: input.now,
    });
    await transaction.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "training-program.created",
      entityType: "training-program",
      entityId: id,
      afterHash: stableHash({
        brief: parsed.brief,
        draft: parsed.draft,
        catalogItemId: parsed.catalogItemId,
      }),
      reason:
        "Coach confirmed the generated program calendar as a private draft; no sessions were published.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return { id, sessionCount: scheduledSessionCount, status: "draft" };
}

export async function updateTrainingProgramEvent(input: {
  readonly actor: ApiActor;
  readonly trainingEventId: string;
  readonly localDate: string;
  readonly startsAt: string;
  readonly durationMinutes: number;
  readonly title: string;
  readonly plannedLoad: number;
  readonly focusArea?: TrainingFocusArea;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly id: string; readonly programId: string }> {
  requireTrainingDatabase();
  const organizationId = requireOrganization(input.actor);
  if (!hasTrainingWrite(input.actor)) {
    throw new TrainingServiceError(
      "FORBIDDEN",
      "Your role cannot edit a program schedule.",
    );
  }
  const parsed = updateTrainingProgramEventInputSchema.parse(input);
  const database = getDatabase();
  const [event] = await database
    .select()
    .from(trainingEvents)
    .where(eq(trainingEvents.id, parsed.trainingEventId))
    .limit(1);
  if (!event || !event.programId) {
    throw new TrainingServiceError(
      "RESOURCE_NOT_FOUND",
      "This program event is no longer available.",
    );
  }
  if (event.organizationId !== organizationId) {
    throw new TrainingServiceError(
      "RESOURCE_WRONG_ORGANIZATION",
      "This program event belongs to another organization.",
    );
  }
  if (event.status === "completed") {
    throw new TrainingServiceError(
      "INVALID_SCHEDULE",
      "Completed sessions are historical records and cannot be rescheduled.",
    );
  }
  const [program] = await database
    .select()
    .from(trainingPrograms)
    .where(
      and(
        eq(trainingPrograms.id, event.programId),
        eq(trainingPrograms.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (
    !program ||
    parsed.localDate < program.startDate ||
    parsed.localDate > program.endDate
  ) {
    throw new TrainingServiceError(
      "INVALID_SCHEDULE",
      "Keep this event inside the program date window.",
    );
  }
  if (program.status === "archived") {
    throw new TrainingServiceError(
      "INVALID_CONFIGURATION",
      "Restore this archived program before changing its calendar.",
    );
  }
  const programEvents = await database
    .select()
    .from(trainingEvents)
    .where(
      and(
        eq(trainingEvents.programId, program.id),
        eq(trainingEvents.organizationId, organizationId),
      ),
    )
    .orderBy(asc(trainingEvents.startsAt));
  const programVersions = await database
    .select({
      id: trainingProgramVersions.id,
      version: trainingProgramVersions.version,
    })
    .from(trainingProgramVersions)
    .where(eq(trainingProgramVersions.programId, program.id))
    .orderBy(desc(trainingProgramVersions.version));
  const startsAt = localTrainingTimeToUtc(
    parsed.localDate,
    parsed.startsAt,
    program.timezone,
  );
  const endsAt = new Date(startsAt.getTime() + parsed.durationMinutes * 60_000);
  // `focusArea` is optional because a coach can deliberately remove it.
  // Remove the previous value before applying the optional new one so a
  // "No focus area" choice does not silently retain stale reporting data.
  const externalLoad = { ...(event.externalLoad ?? {}) };
  delete externalLoad.focusArea;
  if (parsed.focusArea) externalLoad.focusArea = parsed.focusArea;
  const nextProgramEvents = programEvents.map((candidate) =>
    candidate.id === event.id
      ? {
          ...candidate,
          title: parsed.title,
          startsAt,
          endsAt,
          timezone: program.timezone,
          plannedLoad: parsed.plannedLoad,
          plannedIntensity: clamp(Math.round(parsed.plannedLoad / 10), 1, 10),
          externalLoad,
        }
      : candidate,
  );
  const nextSnapshot = programVersionSnapshot(program, nextProgramEvents);
  const nextVersionId = crypto.randomUUID();
  const nextVersion = (programVersions[0]?.version ?? 0) + 1;
  const staleVersionIds = programVersions
    .slice(TRAINING_VERSION_RETENTION - 1)
    .map((version) => version.id);
  const transactional = getTransactionalDatabase();
  await transactional.transaction(async (transaction) => {
    await transaction
      .update(trainingEvents)
      .set({
        title: parsed.title,
        startsAt,
        endsAt,
        timezone: program.timezone,
        plannedLoad: parsed.plannedLoad,
        plannedIntensity: clamp(Math.round(parsed.plannedLoad / 10), 1, 10),
        externalLoad,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(trainingEvents.id, event.id),
          eq(trainingEvents.organizationId, organizationId),
        ),
      );
    await transaction
      .update(trainingPrograms)
      .set({ currentVersionId: nextVersionId, updatedAt: input.now })
      .where(
        and(
          eq(trainingPrograms.id, program.id),
          eq(trainingPrograms.organizationId, organizationId),
        ),
      );
    await transaction.insert(trainingProgramVersions).values({
      id: nextVersionId,
      programId: program.id,
      version: nextVersion,
      snapshot: nextSnapshot,
      changeNote: `Calendar adjusted: ${parsed.title}.`,
      createdByPersonId: input.actor.personId,
      createdAt: input.now,
    });
    if (staleVersionIds.length) {
      await transaction
        .delete(trainingProgramVersions)
        .where(inArray(trainingProgramVersions.id, staleVersionIds));
    }
    await transaction.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "training-program.event-updated",
      entityType: "training-event",
      entityId: event.id,
      beforeHash: stableHash({
        title: event.title,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        plannedLoad: event.plannedLoad,
        externalLoad: event.externalLoad,
      }),
      afterHash: stableHash({
        title: parsed.title,
        startsAt,
        endsAt,
        plannedLoad: parsed.plannedLoad,
        externalLoad,
      }),
      reason:
        "Coach adjusted a program event while keeping the commercial offer and completed-session history intact.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return { id: event.id, programId: event.programId };
}

export async function removeTrainingProgramEvent(input: {
  readonly actor: ApiActor;
  readonly trainingEventId: string;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly id: string; readonly programId: string }> {
  requireTrainingDatabase();
  const organizationId = requireOrganization(input.actor);
  if (!hasTrainingWrite(input.actor)) {
    throw new TrainingServiceError(
      "FORBIDDEN",
      "Your role cannot remove a program session.",
    );
  }
  const parsed = removeTrainingProgramEventInputSchema.parse(input);
  const database = getDatabase();
  const [event] = await database
    .select()
    .from(trainingEvents)
    .where(eq(trainingEvents.id, parsed.trainingEventId))
    .limit(1);
  if (!event || !event.programId) {
    throw new TrainingServiceError(
      "RESOURCE_NOT_FOUND",
      "This program session is no longer available.",
    );
  }
  if (event.organizationId !== organizationId) {
    throw new TrainingServiceError(
      "RESOURCE_WRONG_ORGANIZATION",
      "This program session belongs to another organization.",
    );
  }
  if (event.status === "completed") {
    throw new TrainingServiceError(
      "INVALID_SCHEDULE",
      "Completed sessions are historical records and cannot be removed.",
    );
  }
  if (event.sessionId) {
    throw new TrainingServiceError(
      "INVALID_SCHEDULE",
      "This session is tied to attendance or a customer booking. Cancel it from the session record instead so money and participation history stay intact.",
    );
  }
  const [program] = await database
    .select()
    .from(trainingPrograms)
    .where(
      and(
        eq(trainingPrograms.id, event.programId),
        eq(trainingPrograms.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!program) {
    throw new TrainingServiceError(
      "RESOURCE_NOT_FOUND",
      "This training program is no longer available.",
    );
  }
  if (program.status === "archived") {
    throw new TrainingServiceError(
      "INVALID_CONFIGURATION",
      "Restore this archived program before changing its calendar.",
    );
  }
  const [programEvents, programVersions] = await Promise.all([
    database
      .select()
      .from(trainingEvents)
      .where(
        and(
          eq(trainingEvents.programId, program.id),
          eq(trainingEvents.organizationId, organizationId),
        ),
      )
      .orderBy(asc(trainingEvents.startsAt)),
    database
      .select({
        id: trainingProgramVersions.id,
        version: trainingProgramVersions.version,
      })
      .from(trainingProgramVersions)
      .where(eq(trainingProgramVersions.programId, program.id))
      .orderBy(desc(trainingProgramVersions.version)),
  ]);
  const nextProgramEvents = programEvents.filter(
    (candidate) => candidate.id !== event.id,
  );
  const scheduledSessionCount = Math.max(
    0,
    program.scheduledSessionCount - (event.kind === "practice" ? 1 : 0),
  );
  const nextSnapshot = programVersionSnapshot(
    { ...program, scheduledSessionCount },
    nextProgramEvents,
  );
  const nextVersionId = crypto.randomUUID();
  const nextVersion = (programVersions[0]?.version ?? 0) + 1;
  const staleVersionIds = programVersions
    .slice(TRAINING_VERSION_RETENTION - 1)
    .map((version) => version.id);
  const transactional = getTransactionalDatabase();
  await transactional.transaction(async (transaction) => {
    await transaction
      .delete(trainingEvents)
      .where(
        and(
          eq(trainingEvents.id, event.id),
          eq(trainingEvents.organizationId, organizationId),
        ),
      );
    await transaction
      .update(trainingPrograms)
      .set({
        scheduledSessionCount,
        currentVersionId: nextVersionId,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(trainingPrograms.id, program.id),
          eq(trainingPrograms.organizationId, organizationId),
        ),
      );
    await transaction.insert(trainingProgramVersions).values({
      id: nextVersionId,
      programId: program.id,
      version: nextVersion,
      snapshot: nextSnapshot,
      changeNote: `Removed calendar item: ${event.title}.`,
      createdByPersonId: input.actor.personId,
      createdAt: input.now,
    });
    if (staleVersionIds.length) {
      await transaction
        .delete(trainingProgramVersions)
        .where(inArray(trainingProgramVersions.id, staleVersionIds));
    }
    await transaction.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "training-program.event-removed",
      entityType: "training-event",
      entityId: event.id,
      beforeHash: stableHash(programEventSnapshot(event)),
      afterHash: stableHash({ removed: true, programId: program.id }),
      reason:
        "Coach removed an uncompleted, non-commercial calendar item and preserved the prior program version.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return { id: event.id, programId: event.programId };
}

export async function archiveTrainingProgram(input: {
  readonly actor: ApiActor;
  readonly programId: string;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly id: string; readonly status: "archived" }> {
  requireTrainingDatabase();
  const organizationId = requireOrganization(input.actor);
  if (!hasTrainingWrite(input.actor)) {
    throw new TrainingServiceError(
      "FORBIDDEN",
      "Your role cannot archive training programs.",
    );
  }
  const parsed = archiveTrainingProgramInputSchema.parse(input);
  const database = getDatabase();
  const [program, versions, events] = await Promise.all([
    database
      .select()
      .from(trainingPrograms)
      .where(
        and(
          eq(trainingPrograms.id, parsed.programId),
          eq(trainingPrograms.organizationId, organizationId),
        ),
      )
      .limit(1),
    database
      .select({
        id: trainingProgramVersions.id,
        version: trainingProgramVersions.version,
      })
      .from(trainingProgramVersions)
      .where(eq(trainingProgramVersions.programId, parsed.programId))
      .orderBy(desc(trainingProgramVersions.version)),
    database
      .select()
      .from(trainingEvents)
      .where(
        and(
          eq(trainingEvents.programId, parsed.programId),
          eq(trainingEvents.organizationId, organizationId),
        ),
      )
      .orderBy(asc(trainingEvents.startsAt)),
  ]);
  const currentProgram = program[0];
  if (!currentProgram) {
    throw new TrainingServiceError(
      "RESOURCE_NOT_FOUND",
      "This program is no longer available.",
    );
  }
  if (currentProgram.status === "archived" || currentProgram.archivedAt) {
    return { id: currentProgram.id, status: "archived" };
  }
  const storedCurrentVersionId = versions.some(
    (version) => version.id === currentProgram.currentVersionId,
  )
    ? currentProgram.currentVersionId
    : versions[0]?.id;
  const baselineVersionId = storedCurrentVersionId ?? crypto.randomUUID();
  const needsBaseline = !storedCurrentVersionId;
  const staleVersionIds = versions
    .slice(
      needsBaseline
        ? TRAINING_VERSION_RETENTION - 1
        : TRAINING_VERSION_RETENTION,
    )
    .map((version) => version.id);
  const transactional = getTransactionalDatabase();
  await transactional.transaction(async (transaction) => {
    if (needsBaseline) {
      await transaction.insert(trainingProgramVersions).values({
        id: baselineVersionId,
        programId: currentProgram.id,
        version: (versions[0]?.version ?? 0) + 1,
        snapshot: programVersionSnapshot(currentProgram, events),
        changeNote: "Baseline saved before archiving this program.",
        createdByPersonId: input.actor.personId,
        createdAt: input.now,
      });
    }
    await transaction
      .update(trainingPrograms)
      .set({
        status: "archived",
        archivedAt: input.now,
        currentVersionId: baselineVersionId,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(trainingPrograms.id, currentProgram.id),
          eq(trainingPrograms.organizationId, organizationId),
        ),
      );
    if (staleVersionIds.length) {
      await transaction
        .delete(trainingProgramVersions)
        .where(inArray(trainingProgramVersions.id, staleVersionIds));
    }
    await transaction.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "training-program.archived",
      entityType: "training-program",
      entityId: currentProgram.id,
      beforeHash: stableHash({ status: currentProgram.status }),
      afterHash: stableHash({ status: "archived" }),
      reason:
        "Coach archived the operational program. Its offer, completed sessions, and recoverable calendar versions remain intact.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return { id: currentProgram.id, status: "archived" };
}

export async function restoreTrainingProgramArchive(input: {
  readonly actor: ApiActor;
  readonly programId: string;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{
  readonly id: string;
  readonly status: "draft" | "active" | "completed";
}> {
  requireTrainingDatabase();
  const organizationId = requireOrganization(input.actor);
  if (!hasTrainingWrite(input.actor)) {
    throw new TrainingServiceError(
      "FORBIDDEN",
      "Your role cannot restore training programs.",
    );
  }
  const parsed = restoreTrainingProgramArchiveInputSchema.parse(input);
  const database = getDatabase();
  const [program] = await database
    .select()
    .from(trainingPrograms)
    .where(
      and(
        eq(trainingPrograms.id, parsed.programId),
        eq(trainingPrograms.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!program) {
    throw new TrainingServiceError(
      "RESOURCE_NOT_FOUND",
      "This program is no longer available.",
    );
  }
  if (program.status !== "archived" && !program.archivedAt) {
    return { id: program.id, status: program.status };
  }
  const transactional = getTransactionalDatabase();
  await transactional.transaction(async (transaction) => {
    await transaction
      .update(trainingPrograms)
      .set({
        status: "draft",
        archivedAt: null,
        completedAt: null,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(trainingPrograms.id, program.id),
          eq(trainingPrograms.organizationId, organizationId),
        ),
      );
    await transaction.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "training-program.restored",
      entityType: "training-program",
      entityId: program.id,
      beforeHash: stableHash({ status: program.status }),
      afterHash: stableHash({ status: "draft" }),
      reason:
        "Coach restored the archived program as a private draft. Commercial records were not changed.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return { id: program.id, status: "draft" };
}

export async function restoreTrainingProgramVersion(input: {
  readonly actor: ApiActor;
  readonly programId: string;
  readonly versionId: string;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly id: string; readonly versionId: string }> {
  requireTrainingDatabase();
  const organizationId = requireOrganization(input.actor);
  if (!hasTrainingWrite(input.actor)) {
    throw new TrainingServiceError(
      "FORBIDDEN",
      "Your role cannot restore program versions.",
    );
  }
  const parsed = restoreTrainingProgramVersionInputSchema.parse(input);
  const database = getDatabase();
  const [program, versions, target, eventRows] = await Promise.all([
    database
      .select()
      .from(trainingPrograms)
      .where(
        and(
          eq(trainingPrograms.id, parsed.programId),
          eq(trainingPrograms.organizationId, organizationId),
        ),
      )
      .limit(1),
    database
      .select({
        id: trainingProgramVersions.id,
        version: trainingProgramVersions.version,
      })
      .from(trainingProgramVersions)
      .where(eq(trainingProgramVersions.programId, parsed.programId))
      .orderBy(desc(trainingProgramVersions.version)),
    database
      .select({
        id: trainingProgramVersions.id,
        version: trainingProgramVersions.version,
        snapshot: trainingProgramVersions.snapshot,
      })
      .from(trainingProgramVersions)
      .where(
        and(
          eq(trainingProgramVersions.id, parsed.versionId),
          eq(trainingProgramVersions.programId, parsed.programId),
        ),
      )
      .limit(1),
    database
      .select()
      .from(trainingEvents)
      .where(
        and(
          eq(trainingEvents.programId, parsed.programId),
          eq(trainingEvents.organizationId, organizationId),
        ),
      )
      .orderBy(asc(trainingEvents.startsAt)),
  ]);
  const currentProgram = program[0];
  const selectedVersion = target[0];
  if (!currentProgram || !selectedVersion) {
    throw new TrainingServiceError(
      "RESOURCE_NOT_FOUND",
      "That recoverable program version is no longer available.",
    );
  }
  const restored = trainingProgramVersionSnapshotSchema.safeParse(
    selectedVersion.snapshot,
  );
  if (!restored.success) {
    throw new TrainingServiceError(
      "INVALID_CONFIGURATION",
      "This historical program version cannot be restored safely.",
    );
  }
  const referencedPlanVersionIds = [
    ...new Set(
      restored.data.events
        .map((event) => event.practicePlanVersionId)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const availablePlanVersionIds = new Set(
    referencedPlanVersionIds.length
      ? (
          await database
            .select({ id: trainingPracticePlanVersions.id })
            .from(trainingPracticePlanVersions)
            .where(
              inArray(
                trainingPracticePlanVersions.id,
                referencedPlanVersionIds,
              ),
            )
        ).map((version) => version.id)
      : [],
  );
  const currentEventById = new Map(eventRows.map((event) => [event.id, event]));
  const restoredEvents = restored.data.events.map((event) => {
    const current = currentEventById.get(event.id);
    if (current?.status === "completed") return programEventSnapshot(current);
    if (
      event.practicePlanVersionId &&
      !availablePlanVersionIds.has(event.practicePlanVersionId)
    ) {
      const safeEvent = { ...event };
      delete safeEvent.practicePlanVersionId;
      return safeEvent;
    }
    return event;
  });
  const restoredEventIds = new Set(restoredEvents.map((event) => event.id));
  const preservedEvents = eventRows.flatMap((event) =>
    !restoredEventIds.has(event.id) &&
    (event.status === "completed" || event.status === "cancelled")
      ? [programEventSnapshot(event)]
      : [],
  );
  const nextSnapshot = trainingProgramVersionSnapshotSchema.parse({
    program: restored.data.program,
    events: [...restoredEvents, ...preservedEvents].sort((first, second) =>
      first.startsAt.localeCompare(second.startsAt),
    ),
  });
  const nextVersionId = crypto.randomUUID();
  const nextVersion = (versions[0]?.version ?? 0) + 1;
  const staleVersionIds = versions
    .slice(TRAINING_VERSION_RETENTION - 1)
    .map((version) => version.id);
  const restoredProgramStatus =
    currentProgram.status === "archived" ? "draft" : currentProgram.status;
  const transactional = getTransactionalDatabase();
  await transactional.transaction(async (transaction) => {
    await transaction
      .update(trainingPrograms)
      .set({
        title: nextSnapshot.program.title,
        purpose: nextSnapshot.program.purpose,
        targetAudience: nextSnapshot.program.targetAudience,
        objectives: nextSnapshot.program.objectives,
        approach: nextSnapshot.program.approach,
        startDate: nextSnapshot.program.startDate,
        endDate: nextSnapshot.program.endDate,
        timezone: nextSnapshot.program.timezone,
        recurrence: nextSnapshot.program.recurrence,
        milestones: nextSnapshot.program.milestones,
        scheduledSessionCount: nextSnapshot.program.scheduledSessionCount,
        defaultPracticeMinutes: nextSnapshot.program.defaultPracticeMinutes,
        athleteCount: nextSnapshot.program.athleteCount,
        status: restoredProgramStatus,
        archivedAt:
          restoredProgramStatus === "draft" ? null : currentProgram.archivedAt,
        currentVersionId: nextVersionId,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(trainingPrograms.id, currentProgram.id),
          eq(trainingPrograms.organizationId, organizationId),
        ),
      );
    for (const event of nextSnapshot.events) {
      const current = currentEventById.get(event.id);
      if (current?.status === "completed") continue;
      if (current) {
        await transaction
          .update(trainingEvents)
          .set({
            kind: event.kind,
            title: event.title,
            startsAt: new Date(event.startsAt),
            endsAt: new Date(event.endsAt),
            timezone: event.timezone,
            status: event.status,
            practicePlanVersionId: event.practicePlanVersionId,
            objectives: event.objectives,
            plannedLoad: event.plannedLoad,
            plannedIntensity: event.plannedIntensity,
            externalLoad: event.externalLoad,
            source: event.source,
            updatedAt: input.now,
          })
          .where(
            and(
              eq(trainingEvents.id, current.id),
              eq(trainingEvents.organizationId, organizationId),
            ),
          );
      } else {
        await transaction.insert(trainingEvents).values({
          id: event.id,
          organizationId,
          programId: currentProgram.id,
          kind: event.kind,
          title: event.title,
          startsAt: new Date(event.startsAt),
          endsAt: new Date(event.endsAt),
          timezone: event.timezone,
          status: event.status,
          practicePlanVersionId: event.practicePlanVersionId,
          objectives: event.objectives,
          plannedLoad: event.plannedLoad,
          plannedIntensity: event.plannedIntensity,
          externalLoad: event.externalLoad,
          source: event.source,
          createdByPersonId: input.actor.personId,
          createdAt: input.now,
          updatedAt: input.now,
        });
      }
    }
    for (const event of eventRows) {
      if (restoredEventIds.has(event.id) || event.status === "completed")
        continue;
      await transaction
        .update(trainingEvents)
        .set({ status: "cancelled", updatedAt: input.now })
        .where(
          and(
            eq(trainingEvents.id, event.id),
            eq(trainingEvents.organizationId, organizationId),
          ),
        );
    }
    await transaction.insert(trainingProgramVersions).values({
      id: nextVersionId,
      programId: currentProgram.id,
      version: nextVersion,
      snapshot: nextSnapshot,
      changeNote: `Restored from version ${selectedVersion.version}.`,
      createdByPersonId: input.actor.personId,
      createdAt: input.now,
    });
    if (staleVersionIds.length) {
      await transaction
        .delete(trainingProgramVersions)
        .where(inArray(trainingProgramVersions.id, staleVersionIds));
    }
    await transaction.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "training-program.version-restored",
      entityType: "training-program",
      entityId: currentProgram.id,
      beforeHash: stableHash({ versionId: currentProgram.currentVersionId }),
      afterHash: stableHash(nextSnapshot),
      reason:
        "Coach restored a prior program calendar into a new current version. Completed sessions remain historical records.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return { id: currentProgram.id, versionId: nextVersionId };
}

export async function assignTrainingPracticePlan(input: {
  readonly actor: ApiActor;
  readonly trainingEventId: string;
  readonly practicePlanVersionId: string;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly id: string; readonly status: "assigned" }> {
  requireTrainingDatabase();
  const organizationId = requireOrganization(input.actor);
  if (!hasTrainingWrite(input.actor)) {
    throw new TrainingServiceError(
      "FORBIDDEN",
      "Your role cannot assign practice plans.",
    );
  }
  const parsed = assignTrainingPracticePlanInputSchema.parse(input);
  const database = getDatabase();
  const [event] = await database
    .select({
      id: trainingEvents.id,
      organizationId: trainingEvents.organizationId,
      previousVersionId: trainingEvents.practicePlanVersionId,
    })
    .from(trainingEvents)
    .where(eq(trainingEvents.id, parsed.trainingEventId))
    .limit(1);
  const [version] = await database
    .select({
      id: trainingPracticePlanVersions.id,
      organizationId: trainingPracticePlans.organizationId,
    })
    .from(trainingPracticePlanVersions)
    .innerJoin(
      trainingPracticePlans,
      eq(trainingPracticePlans.id, trainingPracticePlanVersions.practicePlanId),
    )
    .where(eq(trainingPracticePlanVersions.id, parsed.practicePlanVersionId))
    .limit(1);
  if (
    !event ||
    !version ||
    event.organizationId !== organizationId ||
    version.organizationId !== organizationId
  ) {
    throw new TrainingServiceError(
      "RESOURCE_WRONG_ORGANIZATION",
      "The practice and plan must belong to the active organization.",
    );
  }
  await database.batch([
    database
      .update(trainingEvents)
      .set({
        practicePlanVersionId: parsed.practicePlanVersionId,
        status: "ready",
        updatedAt: input.now,
      })
      .where(
        and(
          eq(trainingEvents.id, parsed.trainingEventId),
          eq(trainingEvents.organizationId, organizationId),
        ),
      ),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "training-practice-plan.assigned",
      entityType: "training-event",
      entityId: parsed.trainingEventId,
      beforeHash: stableHash({ versionId: event.previousVersionId }),
      afterHash: stableHash({ versionId: parsed.practicePlanVersionId }),
      reason:
        "Coach assigned an immutable practice-plan version to the session.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { id: parsed.trainingEventId, status: "assigned" };
}

export async function recordTrainingOutcome(input: {
  readonly actor: ApiActor;
  readonly trainingEventId: string;
  readonly actualStartsAt?: string;
  readonly actualEndsAt?: string;
  readonly actualLoad?: number;
  readonly coachRpe?: number;
  readonly attendanceCount: number;
  readonly plannedBlockCount: number;
  readonly completedBlockCount: number;
  readonly blockOutcomes: readonly unknown[];
  readonly notesMarkdown?: string;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly id: string; readonly status: "completed" }> {
  requireTrainingDatabase();
  const organizationId = requireOrganization(input.actor);
  if (!hasTrainingWrite(input.actor)) {
    throw new TrainingServiceError(
      "FORBIDDEN",
      "Your role cannot complete practices.",
    );
  }
  const parsed = recordTrainingOutcomeInputSchema.parse(input);
  if (parsed.completedBlockCount > parsed.plannedBlockCount) {
    throw new TrainingServiceError(
      "INVALID_CONFIGURATION",
      "Completed blocks cannot exceed planned blocks.",
    );
  }
  const [event] = await getDatabase()
    .select({
      id: trainingEvents.id,
      organizationId: trainingEvents.organizationId,
      practicePlanVersionId: trainingEvents.practicePlanVersionId,
    })
    .from(trainingEvents)
    .where(eq(trainingEvents.id, parsed.trainingEventId))
    .limit(1);
  if (!event || event.organizationId !== organizationId) {
    throw new TrainingServiceError(
      "RESOURCE_WRONG_ORGANIZATION",
      "The practice does not belong to the active organization.",
    );
  }
  const outcomeId = crypto.randomUUID();
  const database = getTransactionalDatabase();
  await database.transaction(async (transaction) => {
    await transaction
      .insert(trainingPracticeOutcomes)
      .values({
        id: outcomeId,
        trainingEventId: parsed.trainingEventId,
        practicePlanVersionId: event.practicePlanVersionId,
        recordedByPersonId: input.actor.personId,
        actualStartsAt: parsed.actualStartsAt
          ? new Date(parsed.actualStartsAt)
          : undefined,
        actualEndsAt: parsed.actualEndsAt
          ? new Date(parsed.actualEndsAt)
          : undefined,
        actualLoad: parsed.actualLoad,
        coachRpe: parsed.coachRpe,
        attendanceCount: parsed.attendanceCount,
        plannedBlockCount: parsed.plannedBlockCount,
        completedBlockCount: parsed.completedBlockCount,
        blockOutcomes: parsed.blockOutcomes,
        notesMarkdown: parsed.notesMarkdown,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: trainingPracticeOutcomes.trainingEventId,
        set: {
          practicePlanVersionId: event.practicePlanVersionId,
          recordedByPersonId: input.actor.personId,
          actualStartsAt: parsed.actualStartsAt
            ? new Date(parsed.actualStartsAt)
            : undefined,
          actualEndsAt: parsed.actualEndsAt
            ? new Date(parsed.actualEndsAt)
            : undefined,
          actualLoad: parsed.actualLoad,
          coachRpe: parsed.coachRpe,
          attendanceCount: parsed.attendanceCount,
          plannedBlockCount: parsed.plannedBlockCount,
          completedBlockCount: parsed.completedBlockCount,
          blockOutcomes: parsed.blockOutcomes,
          notesMarkdown: parsed.notesMarkdown,
          updatedAt: input.now,
        },
      });
    await transaction
      .update(trainingEvents)
      .set({ status: "completed", updatedAt: input.now })
      .where(
        and(
          eq(trainingEvents.id, parsed.trainingEventId),
          eq(trainingEvents.organizationId, organizationId),
        ),
      );
    await transaction.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "training-practice.completed",
      entityType: "training-event",
      entityId: parsed.trainingEventId,
      afterHash: stableHash(parsed),
      reason:
        "Coach recorded the completed practice, actual load, and block outcomes.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return { id: parsed.trainingEventId, status: "completed" };
}
