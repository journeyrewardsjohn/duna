import { describe, expect, it } from "vitest";
import { demoOrganization } from "@duna/core/demo";
import { createDemoActor } from "./context";
import {
  createTrainingProgramEventInputSchema,
  draftTrainingDrillInputSchema,
  importTrainingTournamentInputSchema,
  trainingPracticeBlockSchema,
  trainingDrillSchema,
  trainingDrillMarketplaceSchema,
  type TrainingProgramDraft,
} from "./training-contracts";
import {
  countTrainingSessions,
  draftTrainingDrill,
  estimateTrainingContacts,
  generateTrainingOccurrences,
  loadDemoTrainingWorkspace,
  loadTrainingPracticePlanVersions,
  loadTrainingProgramEvents,
  loadTrainingProgramVersions,
  loadPlayerTrainingWorkspace,
  normalizeTrainingTag,
  submitTrainingAthleteResponse,
  validateTrainingProgramOccurrenceSchedule,
} from "./training-service";

describe("training program calendar items", () => {
  const base = {
    programId: "11000000-0000-4000-8000-000000000001",
    kind: "tournament" as const,
    title: "18U National Championships",
    startsOn: "2026-06-20",
    startsAt: "08:00",
    endsOn: "2026-06-22",
    endsAt: "18:00",
    plannedLoad: 90,
    calendarDetails: {
      source: "manual" as const,
      tournamentType: "national" as const,
      websiteUrl: "https://example.org/tournaments/nationals",
      venueName: "National Volleyball Center",
      address: "100 Court Way, Dallas, TX",
    },
    idempotencyKey: "11000000-0000-4000-8000-000000000002",
  };

  it("accepts a multi-day tournament with coach-reviewed website and location details", () => {
    expect(createTrainingProgramEventInputSchema.parse(base)).toMatchObject({
      kind: "tournament",
      calendarDetails: {
        tournamentType: "national",
        websiteUrl: "https://example.org/tournaments/nationals",
      },
    });
  });

  it("requires tournament level and an end after the start", () => {
    expect(() =>
      createTrainingProgramEventInputSchema.parse({
        ...base,
        endsOn: base.startsOn,
        endsAt: "07:00",
        calendarDetails: { source: "manual" },
      }),
    ).toThrow();
  });

  it("accepts public tournament websites and rejects local network targets", () => {
    expect(
      importTrainingTournamentInputSchema.parse({
        name: "Regional Open",
        websiteUrl: "https://volleyball.example.com/regional-open",
      }).websiteUrl,
    ).toBe("https://volleyball.example.com/regional-open");
    expect(() =>
      importTrainingTournamentInputSchema.parse({
        name: "Internal event",
        websiteUrl: "http://localhost:3000/private",
      }),
    ).toThrow("public http or https");
  });
});

describe("training schedule generation", () => {
  it("accepts lightweight custom and free-play practice blocks", () => {
    const common = {
      id: "38e346e8-322f-4a2e-a73b-33ee9742dff0",
      sequence: 1,
      lane: "all",
      title: "Coach-authored block",
      startsAtMinute: 10,
      durationMinutes: 12,
      transitionMinutes: 2,
      intensity: 6,
      plannedLoad: 55,
      instructions: "Keep the explanation lightweight.",
      touchesTypical: 32,
      jumpsTypical: 4,
      locked: false,
    };
    expect(
      trainingPracticeBlockSchema.parse({ ...common, kind: "custom" }),
    ).toMatchObject({ kind: "custom", tags: [] });
    expect(
      trainingPracticeBlockSchema.parse({
        ...common,
        kind: "free-play",
        tags: ["Game-Like", "Decision Making"],
      }),
    ).toMatchObject({
      kind: "free-play",
      tags: ["Game-Like", "Decision Making"],
    });
  });

  it("loads a program calendar independently of the dashboard upcoming-event limit", async () => {
    const now = new Date("2026-08-20T14:00:00.000Z");
    const workspace = loadDemoTrainingWorkspace(demoOrganization.id, now);
    const program = workspace.programs[0]!;
    await expect(
      loadTrainingProgramEvents({
        organizationId: demoOrganization.id,
        programId: program.id,
        now,
        demo: true,
      }),
    ).resolves.toEqual(
      workspace.upcomingEvents.filter(
        (event) => event.programId === program.id,
      ),
    );
  });

  it("gives coaches a bounded, current restore history for programs and practice plans", async () => {
    const now = new Date("2026-08-20T14:00:00.000Z");
    const workspace = loadDemoTrainingWorkspace(demoOrganization.id, now);
    const [programHistory, practicePlanHistory] = await Promise.all([
      loadTrainingProgramVersions({
        organizationId: demoOrganization.id,
        programId: workspace.programs[0]!.id,
        now,
        demo: true,
      }),
      loadTrainingPracticePlanVersions({
        organizationId: demoOrganization.id,
        practicePlanId: workspace.practicePlans[0]!.id,
        now,
        demo: true,
      }),
    ]);
    expect(programHistory).toHaveLength(1);
    expect(practicePlanHistory).toHaveLength(1);
    expect(programHistory[0]).toMatchObject({
      current: true,
      version: 1,
      title: workspace.programs[0]!.title,
    });
    expect(practicePlanHistory[0]).toMatchObject({
      current: true,
      title: workspace.practicePlans[0]!.title,
    });
    expect(programHistory.length).toBeLessThanOrEqual(5);
    expect(practicePlanHistory.length).toBeLessThanOrEqual(5);
  });

  it("counts every Monday and Wednesday in a four-week program", () => {
    expect(
      countTrainingSessions({
        startDate: "2026-09-07",
        endDate: "2026-10-04",
        recurrence: {
          intervalWeeks: 1,
          days: [
            { day: "monday", startsAt: "17:00", durationMinutes: 90 },
            { day: "wednesday", startsAt: "17:00", durationMinutes: 90 },
          ],
          excludedDates: [],
        },
      }),
    ).toBe(8);
  });

  it("honors exclusions and biweekly cadence without timezone drift", () => {
    const occurrences = generateTrainingOccurrences({
      startDate: "2026-10-26",
      endDate: "2026-11-22",
      recurrence: {
        intervalWeeks: 2,
        days: [
          { day: "monday", startsAt: "17:30", durationMinutes: 75 },
          { day: "wednesday", startsAt: "17:30", durationMinutes: 75 },
        ],
        excludedDates: ["2026-11-11"],
      },
    });
    expect(occurrences.map((occurrence) => occurrence.localDate)).toEqual([
      "2026-10-26",
      "2026-10-28",
      "2026-11-09",
    ]);
  });

  it("keeps coach-edited sessions inside the program window without forcing them back to recurrence", () => {
    const occurrences = [
      {
        localDate: "2026-09-08",
        startsAt: "18:15",
        durationMinutes: 105,
        title: "Competition prep · serve receive",
        phase: "Build",
        focusArea: "Ball Control",
        plannedLoad: 74,
        rationale: "A coach shifted this practice after the tournament draw.",
      },
      {
        localDate: "2026-09-10",
        startsAt: "17:00",
        durationMinutes: 75,
        title: "Competition prep · transition",
        phase: "Build",
        focusArea: "Team Defense",
        plannedLoad: 66,
        rationale: "The session stays within the program window.",
      },
    ] satisfies TrainingProgramDraft["occurrences"];

    expect(
      validateTrainingProgramOccurrenceSchedule(
        { startDate: "2026-09-07", endDate: "2026-09-20" },
        occurrences,
      ),
    ).toEqual({ sessionCount: 2, plannedMinutes: 180 });
  });

  it("rejects duplicate edited practice slots", () => {
    const occurrence = {
      localDate: "2026-09-08",
      startsAt: "17:00",
      durationMinutes: 90,
      title: "Foundation · Ball Control",
      phase: "Foundation",
      focusArea: "Ball Control" as const,
      plannedLoad: 60,
      rationale: "Keep first contact deliberate.",
    };
    expect(() =>
      validateTrainingProgramOccurrenceSchedule(
        { startDate: "2026-09-07", endDate: "2026-09-20" },
        [occurrence, { ...occurrence, title: "Duplicate" }],
      ),
    ).toThrow("Each practice needs its own date and start time.");
  });
});

describe("training estimates", () => {
  it("returns role-specific ranges from a deterministic repetition model", () => {
    const estimate = estimateTrainingContacts({
      durationMinutes: 12,
      playerCount: 8,
      ballCount: 2,
      mode: "cooperative",
      contactsPerRep: 3,
      repsOrPoints: 80,
      roleWeights: [
        { role: "Setters", players: 2, share: 1.5 },
        { role: "Attackers", players: 6, share: 0.85 },
      ],
      jumpShare: 0.2,
    });
    expect(estimate.confidence).toBe("high");
    expect(estimate.totalContactsTypical).toBe(240);
    expect(estimate.byRole[0]!.touchesTypical).toBeGreaterThan(
      estimate.byRole[1]!.touchesTypical,
    );
    expect(estimate.touchesLow).toBeLessThan(estimate.touchesTypical);
    expect(estimate.touchesHigh).toBeGreaterThan(estimate.touchesTypical);
  });
});

describe("training taxonomy and demo workspace", () => {
  it("preserves a structured volleyball phase canvas for Sol interpretation and rendering", async () => {
    const editor = {
      court: "beach-full" as const,
      orientation: "vertical" as const,
      phases: [
        {
          id: "phase-1",
          title: "Serve receive entry",
          durationSeconds: 10,
          notes: "Pass to target before the setter releases.",
          objects: [
            {
              id: "coach-1",
              kind: "coach" as const,
              label: "C",
              x: 12,
              y: 20,
              team: "neutral" as const,
              role: "Server",
              color: "sand" as const,
            },
            {
              id: "player-1",
              kind: "player" as const,
              label: "1",
              x: 38,
              y: 72,
              team: "a" as const,
              role: "Passer",
              color: "ink" as const,
            },
            {
              id: "ball-1",
              kind: "ball" as const,
              label: "B1",
              x: 14,
              y: 22,
              team: "neutral" as const,
              color: "signal" as const,
              ballEntry: "serve" as const,
              initiatedBy: "coach" as const,
              ballOrder: 1,
            },
          ],
          actions: [
            {
              id: "serve-1",
              order: 1,
              kind: "serve" as const,
              actorId: "coach-1",
              targetObjectId: "player-1",
              toX: 38,
              toY: 72,
              ballId: "ball-1",
              withBall: true,
              simultaneous: false,
              intent: "serve the seam",
            },
          ],
        },
      ],
      overallNotes: "Train a calm first contact under serve pressure.",
      outputMarkdown: "",
    };
    const input = draftTrainingDrillInputSchema.parse({
      description:
        "Coach serves to the seam. The passer controls first contact to a target before rotating.",
      editor,
      focusArea: "Ball Control",
    });
    const previousKey = process.env.AI_GATEWAY_API_KEY;
    const previousToken = process.env.VERCEL_OIDC_TOKEN;
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;
    try {
      const drill = await draftTrainingDrill(
        input,
        new Date("2026-08-20T14:00:00.000Z"),
      );
      expect(drill.editor).toEqual(editor);
      expect(drill.scene.movements[0]).toMatchObject({
        kind: "ball",
        from: "coach-1",
        to: "player-1",
      });
      expect(drill.interpretation?.contactSequence[0]).toMatchObject({
        contact: "serve",
        actor: "C",
      });
      expect(drill.animation.renderModel).toBe("gpt_image_2");
    } finally {
      if (previousKey === undefined) delete process.env.AI_GATEWAY_API_KEY;
      else process.env.AI_GATEWAY_API_KEY = previousKey;
      if (previousToken === undefined) delete process.env.VERCEL_OIDC_TOKEN;
      else process.env.VERCEL_OIDC_TOKEN = previousToken;
    }
  });

  it("requires a real price for a paid drill marketplace listing", () => {
    expect(
      trainingDrillMarketplaceSchema.safeParse({
        offer: "paid",
        currency: "USD",
      }).success,
    ).toBe(false);
    expect(
      trainingDrillMarketplaceSchema.parse({
        offer: "paid",
        priceMinor: 900,
        currency: "USD",
      }),
    ).toMatchObject({ offer: "paid", priceMinor: 900 });
  });

  it("normalizes equivalent standard tags to one canonical focus area", () => {
    expect(normalizeTrainingTag("back row attacks")).toEqual({
      label: "Back-Row Attack",
      slug: "back-row-attacks",
    });
    expect(normalizeTrainingTag("BALL control").label).toBe("Ball Control");
  });

  it("ships a complete coach-ready demo without fabricated empty metrics", () => {
    const workspace = loadDemoTrainingWorkspace(
      demoOrganization.id,
      new Date("2026-08-19T14:00:00.000Z"),
    );
    expect(workspace.programs[0]!.scheduledSessionCount).toBeGreaterThan(8);
    expect(
      workspace.practicePlans[0]!.blocks.some(
        (block) => block.lane === "Court 1",
      ),
    ).toBe(true);
    expect(
      workspace.practicePlans[0]!.blocks.some(
        (block) => block.lane === "Court 2",
      ),
    ).toBe(true);
    expect(
      workspace.drills.filter((drill) => drill.visibility === "public"),
    ).toHaveLength(3);
    expect(workspace.insights.headline).toHaveLength(4);
  });

  it("requires a reusable source to carry provenance and a rights attestation", () => {
    const drill = loadDemoTrainingWorkspace(
      demoOrganization.id,
      new Date("2026-08-19T14:00:00.000Z"),
    ).drills[0]!;
    expect(
      trainingDrillSchema.safeParse({
        ...drill,
        source: {
          name: "Licensed coaching manual",
          url: "https://example.com/drill",
          license: "Organization-owned material",
        },
      }).success,
    ).toBe(false);
    expect(
      trainingDrillSchema.safeParse({
        ...drill,
        source: {
          name: "Licensed coaching manual",
          url: "https://example.com/drill",
          license: "Organization-owned material",
          rightsConfirmed: true,
        },
      }).success,
    ).toBe(true);
  });

  it("gives an athlete only their program, plan outline, and own check-in", async () => {
    const actor = createDemoActor(["player"]);
    const now = new Date("2026-08-19T14:00:00.000Z");
    const workspace = await loadPlayerTrainingWorkspace({ actor, now });
    expect(workspace.programs).toHaveLength(1);
    expect(workspace.nextPractice?.practice?.blocks.length).toBeGreaterThan(3);
    expect(workspace.nextPractice?.practice?.blocks[0]).not.toHaveProperty(
      "instructions",
    );
    expect(workspace.recentSessions[0]?.response).toBeUndefined();
    await expect(
      submitTrainingAthleteResponse({
        actor,
        response: {
          trainingEventId: workspace.recentSessions[0]!.id,
          attendanceStatus: "attended",
          sessionRpe: 7,
          feedback: "Pressure felt realistic.",
          idempotencyKey: crypto.randomUUID(),
        },
        requestId: crypto.randomUUID(),
        now,
      }),
    ).resolves.toMatchObject({ eventId: workspace.recentSessions[0]!.id });
  });
});
