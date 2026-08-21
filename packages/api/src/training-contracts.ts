import { z } from "zod";

export const TRAINING_FOCUS_AREAS = [
  "Attacking",
  "Setting",
  "Ball Control",
  "Attack Location",
  "Footwork",
  "Team Defense",
  "Offensive Systems",
  "Blocking",
  "Serving",
  "Back-Row Attack",
  "Free-Ball Play",
  "Out-of-System",
] as const;

export const trainingFocusAreaSchema = z.enum(TRAINING_FOCUS_AREAS);
export type TrainingFocusArea = z.infer<typeof trainingFocusAreaSchema>;

export const trainingVisibilitySchema = z.enum(["organization", "public"]);
export const trainingContentStatusSchema = z.enum([
  "draft",
  "review",
  "published",
  "archived",
]);
export const trainingActivityKindSchema = z.enum([
  "drill",
  "warmup",
  "cool-down",
  "conditioning",
  "strength",
  "plyometrics",
  "film",
  "meeting",
  "recovery",
  "assessment",
  "break",
  "transition",
]);
export const trainingDisciplineSchema = z.enum([
  "beach-2s",
  "beach-4s",
  "beach-6s",
  "grass",
  "indoor",
]);
export const trainingDrillModeSchema = z.enum([
  "cooperative",
  "competitive",
  "hybrid",
  "individual",
]);

export const trainingTagSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1),
  slug: z.string().min(1),
  category: z.enum(["focus", "skill", "context", "custom"]),
  isFocusArea: z.boolean(),
});

export const touchEstimateInputSchema = z.object({
  durationMinutes: z.number().int().min(1).max(480),
  playerCount: z.number().int().min(1).max(100),
  ballCount: z.number().int().min(0).max(30),
  mode: trainingDrillModeSchema,
  contactsPerMinutePerBall: z.number().min(0).max(30).default(5),
  livePlayRatio: z.number().min(0.05).max(1).default(0.68),
  contactsPerRep: z.number().min(0).max(100).optional(),
  repsOrPoints: z.number().int().min(1).max(10_000).optional(),
  roleWeights: z
    .array(
      z.object({
        role: z.string().trim().min(1).max(80),
        players: z.number().int().min(1).max(100),
        share: z.number().positive().max(20),
      }),
    )
    .max(12)
    .optional(),
  jumpShare: z.number().min(0).max(1).default(0.12),
});
export type TouchEstimateInput = z.input<typeof touchEstimateInputSchema>;

export const trainingRoleEstimateSchema = z.object({
  role: z.string(),
  players: z.number().int().positive(),
  touchesLow: z.number().int().nonnegative(),
  touchesTypical: z.number().int().nonnegative(),
  touchesHigh: z.number().int().nonnegative(),
  jumpsTypical: z.number().int().nonnegative(),
});

export const trainingContactEstimateSchema = z.object({
  touchesLow: z.number().int().nonnegative(),
  touchesTypical: z.number().int().nonnegative(),
  touchesHigh: z.number().int().nonnegative(),
  jumpsTypical: z.number().int().nonnegative(),
  totalContactsTypical: z.number().int().nonnegative(),
  confidence: z.enum(["low", "medium", "high"]),
  basis: z.array(z.string()),
  assumptions: z.array(z.string()),
  byRole: z.array(trainingRoleEstimateSchema),
});
export type TrainingContactEstimate = z.infer<
  typeof trainingContactEstimateSchema
>;

export const courtPositionSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(12),
  role: z.string().min(1).max(60),
  team: z.enum(["a", "b", "coach", "queue"]),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
});

export const courtMovementSchema = z.object({
  id: z.string().min(1).max(40),
  from: z.string().min(1).max(40),
  to: z.string().min(1).max(40),
  kind: z.enum(["player", "ball", "rotation"]),
  label: z.string().max(80).optional(),
  order: z.number().int().min(1).max(99),
});

export const drillSceneSchema = z.object({
  court: z.enum(["beach-full", "indoor-full", "half-court", "no-court"]),
  perspective: z.enum(["top", "isometric"]).default("isometric"),
  positions: z.array(courtPositionSchema).max(30),
  movements: z.array(courtMovementSchema).max(50),
  ballCount: z.number().int().min(0).max(30),
  loopSeconds: z.number().min(2).max(60).default(12),
});
export type DrillScene = z.infer<typeof drillSceneSchema>;

export const drillEditorObjectSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(["player", "coach", "ball", "cone", "box", "target", "shape"]),
  label: z.string().trim().min(1).max(24),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  team: z.enum(["a", "b", "neutral"]).default("neutral"),
  role: z.string().trim().max(80).optional(),
  color: z.enum(["ink", "marine", "sand", "flare", "signal"]).default("ink"),
  ballEntry: z.enum(["toss", "held", "freeball", "serve"]).optional(),
  initiatedBy: z.enum(["player", "coach"]).optional(),
  ballOrder: z.number().int().min(1).max(99).optional(),
});
export type DrillEditorObject = z.infer<typeof drillEditorObjectSchema>;

export const drillEditorActionSchema = z.object({
  id: z.string().min(1).max(80),
  order: z.number().int().min(1).max(999),
  kind: z.enum([
    "move",
    "rotate",
    "toss",
    "pass",
    "set",
    "attack",
    "serve",
    "block",
    "dig",
    "freeball",
    "hold",
  ]),
  actorId: z.string().min(1).max(80),
  targetObjectId: z.string().min(1).max(80).optional(),
  fromX: z.number().min(0).max(100).optional(),
  fromY: z.number().min(0).max(100).optional(),
  toX: z.number().min(0).max(100),
  toY: z.number().min(0).max(100),
  controlX: z.number().min(0).max(100).optional(),
  controlY: z.number().min(0).max(100).optional(),
  ballId: z.string().min(1).max(80).optional(),
  withBall: z.boolean().default(false),
  simultaneous: z.boolean().default(false),
  intent: z.string().trim().max(160).optional(),
});
export type DrillEditorAction = z.infer<typeof drillEditorActionSchema>;

export const drillEditorPhaseSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().trim().min(1).max(100),
  durationSeconds: z.number().int().min(1).max(600).default(12),
  notes: z.string().trim().max(4_000).default(""),
  objects: z.array(drillEditorObjectSchema).max(80),
  actions: z.array(drillEditorActionSchema).max(160),
});
export type DrillEditorPhase = z.infer<typeof drillEditorPhaseSchema>;

export const drillEditorStateSchema = z.object({
  court: z.enum(["beach-full", "beach-half", "indoor-full", "indoor-half"]),
  orientation: z.enum(["vertical", "horizontal"]).default("vertical"),
  phases: z.array(drillEditorPhaseSchema).min(1).max(24),
  overallNotes: z.string().trim().max(8_000).default(""),
  outputMarkdown: z.string().max(40_000).default(""),
});
export type DrillEditorState = z.infer<typeof drillEditorStateSchema>;

export const trainingDrillInterpretationSchema = z.object({
  phaseSummaries: z.array(
    z.object({
      phaseId: z.string().min(1).max(80),
      purpose: z.string().trim().min(3).max(600),
      coachPosition: z.string().trim().min(2).max(300),
      successSignal: z.string().trim().min(2).max(300),
    }),
  ),
  roles: z.array(
    z.object({
      label: z.string().trim().min(1).max(80),
      responsibility: z.string().trim().min(3).max(400),
      touchIntent: z.string().trim().min(2).max(240),
    }),
  ),
  contactSequence: z.array(
    z.object({
      order: z.number().int().min(1).max(999),
      phaseId: z.string().min(1).max(80),
      actor: z.string().trim().min(1).max(80),
      contact: z.enum([
        "toss",
        "pass",
        "set",
        "attack",
        "serve",
        "block",
        "dig",
        "freeball",
        "hold",
        "movement",
      ]),
      intent: z.string().trim().min(2).max(300),
    }),
  ),
  progression: z.object({
    prerequisites: z.array(z.string().trim().min(2).max(240)).max(8),
    simplify: z.string().trim().min(3).max(500),
    progress: z.string().trim().min(3).max(500),
    programFit: z.string().trim().min(3).max(700),
    nextDrill: z.string().trim().min(3).max(500),
  }),
  fidelityNotes: z.array(z.string().trim().min(2).max(300)).max(12),
});
export type TrainingDrillInterpretation = z.infer<
  typeof trainingDrillInterpretationSchema
>;

export const trainingDrillMarketplaceSchema = z
  .object({
    offer: z.enum(["free", "paid"]),
    priceMinor: z.number().int().min(100).max(100_000_00).optional(),
    currency: z.enum(["USD", "CAD", "AUD", "BRL", "EUR"]).default("USD"),
    catalogItemId: z.string().uuid().optional(),
    catalogVariantId: z.string().uuid().optional(),
    catalogPriceId: z.string().uuid().optional(),
    access: z
      .enum(["owner", "free", "purchased", "purchase-required"])
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.offer === "paid" && value.priceMinor === undefined) {
      context.addIssue({
        code: "custom",
        path: ["priceMinor"],
        message: "Set a price for a paid drill.",
      });
    }
  });
export type TrainingDrillMarketplace = z.infer<
  typeof trainingDrillMarketplaceSchema
>;

export const trainingDrillSchema = z.object({
  id: z.string().uuid(),
  versionId: z.string().uuid(),
  version: z.number().int().positive(),
  title: z.string().min(2),
  slug: z.string().min(2),
  status: trainingContentStatusSchema,
  visibility: trainingVisibilitySchema,
  ownership: z.enum(["organization", "duna", "shared"]),
  activityKind: trainingActivityKindSchema,
  discipline: trainingDisciplineSchema,
  skillLevel: z.string(),
  mode: trainingDrillModeSchema,
  purpose: z.string(),
  targetAudience: z.string(),
  summary: z.string(),
  descriptionMarkdown: z.string(),
  minPlayers: z.number().int().positive(),
  maxPlayers: z.number().int().positive(),
  recommendedPlayers: z.number().int().positive(),
  durationMinutes: z.number().int().positive(),
  intensity: z.number().int().min(1).max(10),
  ballCount: z.number().int().nonnegative(),
  equipment: z.array(z.string()),
  focusArea: trainingFocusAreaSchema,
  tags: z.array(trainingTagSchema),
  steps: z.array(z.string()),
  coachingCues: z.array(z.string()),
  safety: z.array(z.string()),
  variations: z.array(z.string()),
  scoring: z.string(),
  estimate: trainingContactEstimateSchema,
  scene: drillSceneSchema,
  editor: drillEditorStateSchema.optional(),
  interpretation: trainingDrillInterpretationSchema.optional(),
  marketplace: trainingDrillMarketplaceSchema.optional(),
  source: z
    .object({
      name: z.string().trim().min(2).max(200),
      url: z.url({ protocol: /^https?$/ }),
      license: z.string().trim().min(2).max(500),
      attribution: z.string().trim().min(2).max(500).optional(),
      rightsConfirmed: z.literal(true),
    })
    .optional(),
  animation: z.object({
    status: z.enum(["ready", "draft", "generating", "review", "failed"]),
    kind: z.enum(["duna-scene", "generated-image", "generated-video"]),
    reviewed: z.boolean(),
    altText: z.string(),
    url: z.string().url().optional(),
    renderModel: z
      .enum(["gpt_image_2", "nano_banana_pro", "duna-scene"])
      .optional(),
    directorBrief: z.string().max(8_000).optional(),
    storyboardPrompt: z.string().max(12_000).optional(),
    negativePrompt: z.string().max(4_000).optional(),
    qaChecklist: z.array(z.string().max(300)).max(20).optional(),
  }),
  updatedAt: z.iso.datetime(),
});
export type TrainingDrill = z.infer<typeof trainingDrillSchema>;

export const trainingPracticeBlockSchema = z.object({
  id: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  lane: z.string(),
  title: z.string(),
  kind: trainingActivityKindSchema,
  drillId: z.string().uuid().optional(),
  startsAtMinute: z.number().int().nonnegative(),
  durationMinutes: z.number().int().positive(),
  transitionMinutes: z.number().int().nonnegative(),
  intensity: z.number().int().min(1).max(10),
  plannedLoad: z.number().int().min(0).max(100),
  focusArea: trainingFocusAreaSchema.optional(),
  instructions: z.string().optional(),
  touchesTypical: z.number().int().nonnegative(),
  jumpsTypical: z.number().int().nonnegative(),
  locked: z.boolean(),
});
export type TrainingPracticeBlock = z.infer<typeof trainingPracticeBlockSchema>;

export const trainingPracticePlanSchema = z.object({
  id: z.string().uuid(),
  versionId: z.string().uuid(),
  version: z.number().int().positive(),
  title: z.string(),
  slug: z.string(),
  purpose: z.string(),
  targetAudience: z.string(),
  status: trainingContentStatusSchema,
  visibility: trainingVisibilitySchema,
  durationMinutes: z.number().int().positive(),
  plannedLoad: z.number().int().min(0).max(100),
  focusArea: trainingFocusAreaSchema,
  tags: z.array(trainingTagSchema),
  blocks: z.array(trainingPracticeBlockSchema),
  totalTouchesTypical: z.number().int().nonnegative(),
  totalJumpsTypical: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
});
export type TrainingPracticePlan = z.infer<typeof trainingPracticePlanSchema>;

export const trainingWeekdaySchema = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);
export type TrainingWeekday = z.infer<typeof trainingWeekdaySchema>;

export const trainingRecurrenceDaySchema = z.object({
  day: trainingWeekdaySchema,
  startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationMinutes: z.number().int().min(15).max(720),
});

export const trainingRecurrenceSchema = z.object({
  intervalWeeks: z.number().int().min(1).max(12).default(1),
  days: z.array(trainingRecurrenceDaySchema).min(1).max(7),
  excludedDates: z.array(z.iso.date()).max(200).default([]),
});
export type TrainingRecurrence = z.input<typeof trainingRecurrenceSchema>;

export const trainingMilestoneSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["tournament", "travel", "assessment", "break"]),
  title: z.string(),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  priority: z.enum(["low", "standard", "key"]),
  notes: z.string().optional(),
});

export const trainingTournamentTypeSchema = z.enum([
  "national",
  "qualifying",
  "pro",
  "local",
  "other",
]);
export type TrainingTournamentType = z.infer<
  typeof trainingTournamentTypeSchema
>;

const trainingWebsiteUrlSchema = z
  .url()
  .max(2_000)
  .refine((value) => {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    const privateIpv4 =
      /^(?:0|10|127)\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(?:1[6-9]|2\d|3[01])\./.test(host) ||
      /^100\.(?:6[4-9]|[789]\d|1[01]\d|12[0-7])\./.test(host);
    const privateIpv6 = /^(?:\[)?(?:fc|fd|fe8|fe9|fea|feb|::1)/.test(host);
    return (
      !url.username &&
      !url.password &&
      host !== "localhost" &&
      host !== "0.0.0.0" &&
      host !== "127.0.0.1" &&
      host !== "::1" &&
      !host.endsWith(".local") &&
      !privateIpv4 &&
      !privateIpv6
    );
  }, "Enter a public http or https website address.");

export const trainingCalendarItemDetailsSchema = z.object({
  source: z.enum(["manual", "duna"]).default("manual"),
  tournamentType: trainingTournamentTypeSchema.optional(),
  dunaTournamentId: z.string().max(240).optional(),
  dunaTournamentHref: z.string().startsWith("/").max(500).optional(),
  websiteUrl: trainingWebsiteUrlSchema.optional(),
  venueName: z.string().trim().max(180).optional(),
  address: z.string().trim().max(500).optional(),
  googlePlaceId: z.string().trim().max(300).optional(),
  googleMapsUri: z.url().max(2_000).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  summary: z.string().trim().max(2_000).optional(),
});
export type TrainingCalendarItemDetails = z.infer<
  typeof trainingCalendarItemDetailsSchema
>;

export const trainingEventSchema = z.object({
  id: z.string().uuid(),
  programId: z.string().uuid().optional(),
  kind: z.enum([
    "practice",
    "tournament",
    "travel",
    "recovery",
    "strength",
    "conditioning",
    "plyometrics",
    "film",
    "meeting",
    "assessment",
    "rest",
  ]),
  title: z.string(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  timezone: z.string(),
  status: z.enum(["planned", "ready", "completed", "cancelled"]),
  coachName: z.string().optional(),
  venueName: z.string().optional(),
  practicePlanId: z.string().uuid().optional(),
  practicePlanTitle: z.string().optional(),
  focusArea: trainingFocusAreaSchema.optional(),
  plannedLoad: z.number().int().min(0).max(100),
  plannedIntensity: z.number().int().min(1).max(10),
  athleteCount: z.number().int().nonnegative(),
  completion: z.number().min(0).max(1).optional(),
  actualRpe: z.number().min(1).max(10).optional(),
  calendarDetails: trainingCalendarItemDetailsSchema.optional(),
});
export type TrainingEvent = z.infer<typeof trainingEventSchema>;

export const trainingProgramSchema = z.object({
  id: z.string().uuid(),
  catalogItemId: z.string().uuid().optional(),
  title: z.string(),
  slug: z.string(),
  purpose: z.string(),
  targetAudience: z.string(),
  objectives: z.array(z.string()),
  approach: z.string(),
  status: z.enum(["draft", "active", "completed", "archived"]),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  timezone: z.string(),
  recurrence: trainingRecurrenceSchema,
  milestones: z.array(trainingMilestoneSchema),
  scheduledSessionCount: z.number().int().nonnegative(),
  completedSessionCount: z.number().int().nonnegative(),
  plannedMinutes: z.number().int().nonnegative(),
  athleteCount: z.number().int().positive(),
  currentPhase: z.string(),
  nextEventAt: z.iso.datetime().optional(),
  readiness: z.enum(["building", "on-track", "attention", "complete"]),
  linkedOffer: z
    .object({
      title: z.string(),
      priceMinor: z.number().int().nonnegative(),
      currency: z.string().length(3),
      inclusions: z.array(z.string()),
    })
    .optional(),
});
export type TrainingProgram = z.infer<typeof trainingProgramSchema>;

export const trainingVersionHistoryEntrySchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  title: z.string(),
  createdAt: z.iso.datetime(),
  current: z.boolean(),
  changeNote: z.string().optional(),
});
export type TrainingVersionHistoryEntry = z.infer<
  typeof trainingVersionHistoryEntrySchema
>;

export const trainingProgramVersionEventSnapshotSchema = z.object({
  id: z.string().uuid(),
  kind: trainingEventSchema.shape.kind,
  title: z.string().trim().min(2).max(180),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  timezone: z.string().trim().min(1).max(80),
  status: trainingEventSchema.shape.status,
  practicePlanVersionId: z.string().uuid().optional(),
  objectives: z.array(z.string().trim().max(2_000)).max(12),
  plannedLoad: z.number().int().min(0).max(100),
  plannedIntensity: z.number().int().min(1).max(10),
  externalLoad: z.record(z.string(), z.unknown()),
  source: z.enum(["program", "manual", "catalog", "imported", "ai-draft"]),
});

export const trainingProgramVersionSnapshotSchema = z.object({
  program: z.object({
    title: z.string().trim().min(2).max(180),
    purpose: z.string().trim().min(10).max(2_000),
    targetAudience: z.string().trim().min(3).max(500),
    objectives: z.array(z.string().trim().min(2).max(240)).min(1).max(12),
    approach: z.string().trim().min(3).max(2_000),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    timezone: z.string().trim().min(1).max(80),
    recurrence: trainingRecurrenceSchema,
    milestones: z.array(trainingMilestoneSchema).max(50),
    scheduledSessionCount: z.number().int().nonnegative(),
    defaultPracticeMinutes: z.number().int().min(1).max(720),
    athleteCount: z.number().int().positive().max(500),
  }),
  events: z.array(trainingProgramVersionEventSnapshotSchema).max(500),
});
export type TrainingProgramVersionSnapshot = z.infer<
  typeof trainingProgramVersionSnapshotSchema
>;

export const trainingInsightSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string(),
  detail: z.string(),
  trend: z.enum(["up", "down", "steady"]),
  tone: z.enum(["default", "positive", "attention"]),
});

export const trainingFocusDistributionSchema = z.object({
  focusArea: trainingFocusAreaSchema,
  minutes: z.number().int().nonnegative(),
  percent: z.number().min(0).max(100),
});

export const trainingWorkspaceSchema = z.object({
  generatedAt: z.iso.datetime(),
  timezone: z.string(),
  focusAreas: z.array(trainingFocusAreaSchema),
  today: trainingEventSchema.optional(),
  upcomingEvents: z.array(trainingEventSchema),
  programs: z.array(trainingProgramSchema),
  practicePlans: z.array(trainingPracticePlanSchema),
  drills: z.array(trainingDrillSchema),
  insights: z.object({
    headline: z.array(trainingInsightSchema),
    focusDistribution: z.array(trainingFocusDistributionSchema),
    weeklyLoad: z.array(
      z.object({
        week: z.string(),
        planned: z.number().int().min(0).max(100),
        actual: z.number().int().min(0).max(100).optional(),
        tournament: z.boolean(),
      }),
    ),
    totalMinutes: z.number().int().nonnegative(),
    totalTouchesTypical: z.number().int().nonnegative(),
    athleteResponseRate: z.number().min(0).max(100).optional(),
  }),
});
export type TrainingWorkspace = z.infer<typeof trainingWorkspaceSchema>;

export const playerTrainingBlockSchema = z.object({
  id: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  lane: z.string(),
  title: z.string(),
  kind: trainingActivityKindSchema,
  startsAtMinute: z.number().int().nonnegative(),
  durationMinutes: z.number().int().positive(),
  intensity: z.number().int().min(1).max(10),
  focusArea: trainingFocusAreaSchema.optional(),
  touchesTypical: z.number().int().nonnegative(),
  jumpsTypical: z.number().int().nonnegative(),
});

export const playerTrainingEventSchema = z.object({
  id: z.string().uuid(),
  programId: z.string().uuid(),
  programTitle: z.string(),
  kind: trainingEventSchema.shape.kind,
  title: z.string(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  timezone: z.string(),
  status: trainingEventSchema.shape.status,
  focusArea: trainingFocusAreaSchema.optional(),
  plannedLoad: z.number().int().min(0).max(100),
  plannedIntensity: z.number().int().min(1).max(10),
  practice: z
    .object({
      title: z.string(),
      purpose: z.string(),
      durationMinutes: z.number().int().positive(),
      focusArea: trainingFocusAreaSchema,
      totalTouchesTypical: z.number().int().nonnegative(),
      totalJumpsTypical: z.number().int().nonnegative(),
      blocks: z.array(playerTrainingBlockSchema),
    })
    .optional(),
  response: z
    .object({
      attendanceStatus: z.enum([
        "planned",
        "attended",
        "partial",
        "excused",
        "absent",
      ]),
      minutesParticipated: z.number().int().nonnegative().optional(),
      sessionRpe: z.number().int().min(1).max(10).optional(),
      feedback: z.string().optional(),
      submittedAt: z.iso.datetime().optional(),
    })
    .optional(),
});
export type PlayerTrainingEvent = z.infer<typeof playerTrainingEventSchema>;

export const playerTrainingWorkspaceSchema = z.object({
  generatedAt: z.iso.datetime(),
  programs: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      purpose: z.string(),
      startDate: z.iso.date(),
      endDate: z.iso.date(),
      currentPhase: z.string(),
      completedSessionCount: z.number().int().nonnegative(),
      scheduledSessionCount: z.number().int().nonnegative(),
      nextMilestone: z
        .object({
          title: z.string(),
          startsOn: z.iso.date(),
          kind: z.enum(["tournament", "travel", "assessment", "break"]),
        })
        .optional(),
    }),
  ),
  nextPractice: playerTrainingEventSchema.optional(),
  upcomingEvents: z.array(playerTrainingEventSchema),
  recentSessions: z.array(playerTrainingEventSchema),
  weeklyLoad: z.array(
    z.object({
      week: z.string(),
      planned: z.number().int().min(0).max(100),
      tournament: z.boolean(),
    }),
  ),
});
export type PlayerTrainingWorkspace = z.infer<
  typeof playerTrainingWorkspaceSchema
>;

export const submitTrainingAthleteResponseInputSchema = z
  .object({
    trainingEventId: z.string().uuid(),
    attendanceStatus: z.enum(["attended", "partial", "excused", "absent"]),
    minutesParticipated: z.number().int().min(0).max(720).optional(),
    sessionRpe: z.number().int().min(1).max(10).optional(),
    feedback: z.string().trim().max(1_000).optional(),
    idempotencyKey: z.string().uuid(),
  })
  .superRefine((value, context) => {
    if (
      (value.attendanceStatus === "attended" ||
        value.attendanceStatus === "partial") &&
      value.sessionRpe === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["sessionRpe"],
        message: "Add how hard the session felt.",
      });
    }
  });

export const draftTrainingDrillInputSchema = z.object({
  description: z.string().trim().min(20).max(6_000),
  titleHint: z.string().trim().max(160).optional(),
  discipline: trainingDisciplineSchema.default("beach-2s"),
  skillLevel: z.string().trim().min(2).max(80).default("Intermediate"),
  mode: trainingDrillModeSchema.default("cooperative"),
  playerCount: z.number().int().min(1).max(100).default(8),
  minPlayers: z.number().int().min(1).max(100).default(4),
  maxPlayers: z.number().int().min(1).max(100).default(12),
  durationMinutes: z.number().int().min(1).max(480).default(12),
  ballCount: z.number().int().min(0).max(30).default(2),
  intensity: z.number().int().min(1).max(10).default(6),
  focusArea: trainingFocusAreaSchema.optional(),
  editor: drillEditorStateSchema.optional(),
});
export type DraftTrainingDrillInput = z.input<
  typeof draftTrainingDrillInputSchema
>;

export const createTrainingDrillInputSchema = z.object({
  draft: trainingDrillSchema.omit({
    id: true,
    versionId: true,
    version: true,
    ownership: true,
    updatedAt: true,
  }),
  idempotencyKey: z.string().uuid(),
});

export const trainingPracticePlanEditorSchema = trainingPracticePlanSchema
  .omit({
    id: true,
    versionId: true,
    version: true,
    updatedAt: true,
    totalTouchesTypical: true,
    totalJumpsTypical: true,
  })
  .extend({
    blocks: z
      .array(trainingPracticeBlockSchema.omit({ id: true }))
      .min(1)
      .max(80),
  });

export const createTrainingPracticePlanInputSchema = z.object({
  plan: trainingPracticePlanEditorSchema,
  idempotencyKey: z.string().uuid(),
});

export const updateTrainingPracticePlanInputSchema = z.object({
  practicePlanId: z.string().uuid(),
  plan: trainingPracticePlanEditorSchema,
  changeNote: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().uuid(),
});

export const draftTrainingProgramInputSchema = z.object({
  title: z.string().trim().min(2).max(180),
  purpose: z.string().trim().min(10).max(2_000),
  targetAudience: z.string().trim().min(3).max(500),
  objectives: z.array(z.string().trim().min(2).max(240)).min(1).max(12),
  approach: z.string().trim().min(3).max(2_000),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  timezone: z.string().trim().min(1).max(80),
  recurrence: trainingRecurrenceSchema,
  milestones: z.array(trainingMilestoneSchema).max(50).default([]),
  athleteCount: z.number().int().min(1).max(500),
  preferredPracticeMinutes: z.number().int().min(30).max(360).default(90),
});
export type DraftTrainingProgramInput = z.input<
  typeof draftTrainingProgramInputSchema
>;

export const trainingProgramDraftSchema = z.object({
  summary: z.string(),
  phaseStrategy: z.array(
    z.object({
      name: z.string(),
      startsOn: z.iso.date(),
      endsOn: z.iso.date(),
      objective: z.string(),
      loadIntent: z.enum(["build", "maintain", "recover", "taper"]),
      focusAreas: z.array(trainingFocusAreaSchema).min(1).max(4),
    }),
  ),
  occurrences: z
    .array(
      z.object({
        localDate: z.iso.date(),
        startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        durationMinutes: z.number().int().min(15).max(720),
        title: z.string().trim().min(2).max(180),
        phase: z.string().trim().min(1).max(120),
        focusArea: trainingFocusAreaSchema,
        plannedLoad: z.number().int().min(0).max(100),
        rationale: z.string().trim().min(2).max(2_000),
      }),
    )
    .min(1)
    .max(500),
  scheduledSessionCount: z.number().int().nonnegative(),
  plannedMinutes: z.number().int().nonnegative(),
  assumptions: z.array(z.string()),
  warnings: z.array(z.string()),
  providerAvailable: z.boolean(),
});
export type TrainingProgramDraft = z.infer<typeof trainingProgramDraftSchema>;

export const createTrainingProgramInputSchema = z.object({
  brief: draftTrainingProgramInputSchema,
  draft: trainingProgramDraftSchema,
  catalogItemId: z.string().uuid().optional(),
  idempotencyKey: z.string().uuid(),
});

export const trainingProgramEventsInputSchema = z.object({
  programId: z.string().uuid(),
});

export const updateTrainingProgramEventInputSchema = z.object({
  trainingEventId: z.string().uuid(),
  localDate: z.iso.date(),
  startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationMinutes: z.number().int().min(15).max(20_160),
  title: z.string().trim().min(2).max(180),
  plannedLoad: z.number().int().min(0).max(100),
  focusArea: trainingFocusAreaSchema.optional(),
  idempotencyKey: z.string().uuid(),
});

export const createTrainingProgramEventInputSchema = z
  .object({
    programId: z.string().uuid(),
    kind: z.enum(["practice", "tournament", "travel", "assessment", "rest"]),
    title: z.string().trim().min(2).max(180),
    startsOn: z.iso.date(),
    startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endsOn: z.iso.date(),
    endsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    plannedLoad: z.number().int().min(0).max(100),
    focusArea: trainingFocusAreaSchema.optional(),
    notes: z.string().trim().max(2_000).optional(),
    calendarDetails: trainingCalendarItemDetailsSchema.optional(),
    idempotencyKey: z.string().uuid(),
  })
  .superRefine((value, context) => {
    if (
      `${value.endsOn}T${value.endsAt}` <= `${value.startsOn}T${value.startsAt}`
    ) {
      context.addIssue({
        code: "custom",
        path: ["endsOn"],
        message: "The calendar item must end after it starts.",
      });
    }
    if (value.kind === "tournament" && !value.calendarDetails?.tournamentType) {
      context.addIssue({
        code: "custom",
        path: ["calendarDetails", "tournamentType"],
        message: "Choose the tournament level.",
      });
    }
  });
export type CreateTrainingProgramEventInput = z.input<
  typeof createTrainingProgramEventInputSchema
>;

export const importTrainingTournamentInputSchema = z.object({
  name: z.string().trim().min(2).max(180),
  websiteUrl: trainingWebsiteUrlSchema,
  currentLocation: z.string().trim().max(500).optional(),
});

export const trainingTournamentImportSchema = z.object({
  providerAvailable: z.boolean(),
  sourceUrl: trainingWebsiteUrlSchema,
  model: z.string().optional(),
  title: z.string().trim().max(180).optional(),
  startsOn: z.iso.date().optional(),
  endsOn: z.iso.date().optional(),
  venueName: z.string().trim().max(180).optional(),
  address: z.string().trim().max(500).optional(),
  summary: z.string().trim().max(2_000).optional(),
  tournamentType: trainingTournamentTypeSchema.optional(),
});
export type TrainingTournamentImport = z.infer<
  typeof trainingTournamentImportSchema
>;

export const removeTrainingProgramEventInputSchema = z.object({
  trainingEventId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
});

export const trainingProgramVersionsInputSchema = z.object({
  programId: z.string().uuid(),
});

export const trainingPracticePlanVersionsInputSchema = z.object({
  practicePlanId: z.string().uuid(),
});

export const archiveTrainingProgramInputSchema = z.object({
  programId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
});

export const restoreTrainingProgramArchiveInputSchema = z.object({
  programId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
});

export const restoreTrainingProgramVersionInputSchema = z.object({
  programId: z.string().uuid(),
  versionId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
});

export const archiveTrainingPracticePlanInputSchema = z.object({
  practicePlanId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
});

export const restoreTrainingPracticePlanArchiveInputSchema = z.object({
  practicePlanId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
});

export const restoreTrainingPracticePlanVersionInputSchema = z.object({
  practicePlanId: z.string().uuid(),
  versionId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
});

export const assignTrainingPracticePlanInputSchema = z.object({
  trainingEventId: z.string().uuid(),
  practicePlanVersionId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
});

export const recordTrainingOutcomeInputSchema = z.object({
  trainingEventId: z.string().uuid(),
  actualStartsAt: z.iso.datetime().optional(),
  actualEndsAt: z.iso.datetime().optional(),
  actualLoad: z.number().int().min(0).max(100).optional(),
  coachRpe: z.number().int().min(1).max(10).optional(),
  attendanceCount: z.number().int().min(0).max(10_000),
  plannedBlockCount: z.number().int().min(0).max(200),
  completedBlockCount: z.number().int().min(0).max(200),
  blockOutcomes: z
    .array(
      z.object({
        blockId: z.string().uuid(),
        status: z.enum(["completed", "modified", "skipped"]),
        actualMinutes: z.number().int().min(0).max(720),
        note: z.string().trim().max(1_000).optional(),
      }),
    )
    .max(200),
  notesMarkdown: z.string().trim().max(20_000).optional(),
  idempotencyKey: z.string().uuid(),
});
export type RecordTrainingOutcomeInput = z.input<
  typeof recordTrainingOutcomeInputSchema
>;
