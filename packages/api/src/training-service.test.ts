import { describe, expect, it } from "vitest";
import { demoOrganization } from "@duna/core/demo";
import { createDemoActor } from "./context";
import { trainingDrillSchema } from "./training-contracts";
import {
  countTrainingSessions,
  estimateTrainingContacts,
  generateTrainingOccurrences,
  loadDemoTrainingWorkspace,
  loadPlayerTrainingWorkspace,
  normalizeTrainingTag,
  submitTrainingAthleteResponse,
} from "./training-service";

describe("training schedule generation", () => {
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
