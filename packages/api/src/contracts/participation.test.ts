import { PARTICIPATION_STATES } from "@duna/core";
import { participationDemo } from "@duna/core/demo/participation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiContext, createDemoActor } from "../context";
import { createCaller } from "../router";
import {
  participationAtRiskSchema,
  participationCancelRequestSchema,
  participationCancelSessionSchema,
  participationDefaultsSchema,
  participationExtendLockSchema,
  participationPreviewRuleChangeSchema,
  participationQuoteSchema,
  participationRecordAttendanceSchema,
} from "./participation";
import { expectCoverage } from "./w3-test-support";

describe("participation contract and demo fixtures (PART-3)", () => {
  it("every fixture parses against its contract", () => {
    for (const quote of participationDemo.quotes) participationQuoteSchema.parse(quote);
    participationDefaultsSchema.parse(participationDemo.defaults);
    participationAtRiskSchema.parse(participationDemo.atRisk);
    participationPreviewRuleChangeSchema.parse(participationDemo.preview);
    participationExtendLockSchema.parse(participationDemo.extendLock);
    participationCancelSessionSchema.parse(participationDemo.cancelSession);
    participationRecordAttendanceSchema.parse(participationDemo.attendance);
    for (const request of participationDemo.cancelRequests) {
      participationCancelRequestSchema.parse(request);
    }
  });

  it("covers every display state, and a session without a group rule", () => {
    const seen = participationDemo.quotes.map((quote) => quote.displayState);
    expectCoverage([...PARTICIPATION_STATES, "open"], seen);
    expectCoverage(
      ["credits-restored", "refund-submitted", "released", "review-required"],
      participationDemo.cancelSession.cancellations.map((entry) => entry.refundStatus),
    );
  });

  it("speaks the worked examples' words", () => {
    const byTitle = new Map(participationDemo.quotes.map((quote) => [quote.title, quote]));
    expect(byTitle.get("Saturday semi-private")?.copy).toMatchObject({
      status: "Needs 1 more",
      line: "Confirms Fri 9:00 AM if 1 more joins",
    });
    expect(byTitle.get("Thursday clinic")?.copy).toMatchObject({
      status: "Minimum reached",
      price: "3 credits now. If more join by Wed 6:00 PM, the difference comes back.",
    });
    expect(byTitle.get("Saturday open play")?.copy.status).toBe(
      "Cancelled · not enough players",
    );
  });
});

describe("participation routers in demo mode", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
  });
  afterEach(() => vi.unstubAllEnvs());

  // The owner holds payments:write (cancel with refunds); a manager does not.
  const caller = () =>
    createCaller(createApiContext({ actor: createDemoActor(["player", "owner"]) }));
  const key = () => crypto.randomUUID();
  const subject = {
    subjectType: "catalog-session-occurrence" as const,
    subjectId: participationDemo.quotes[0]!.subjectId,
  };

  it("serves every procedure", async () => {
    const api = caller();
    expect((await api.operator.participation.defaults()).rules?.minParticipants).toBe(3);
    expect(
      (
        await api.operator.participation.setDefaults({
          rules: { minParticipants: 3 },
          appliesTo: ["service"],
          idempotencyKey: key(),
        })
      ).issues,
    ).toEqual([]);
    expect(
      (
        await api.operator.participation.previewRuleChange({
          catalogItemId: participationDemo.atRisk.sessions[0]!.catalogItemId,
          rules: { minParticipants: 4 },
        })
      ).changeClass,
    ).toBe("loosens");
    const risk = await api.operator.participation.atRisk();
    expect(risk.sessions[0]?.displayState).toBe("needs-players");
    expect(
      await api.operator.participation.extendLock({
        ...subject,
        lockAt: participationDemo.extendLock.lockAt,
        confirmed: true,
        idempotencyKey: key(),
      }),
    ).toEqual(participationDemo.extendLock);
    expect(
      await api.operator.participation.runAnyway({ ...subject, confirmed: true, idempotencyKey: key() }),
    ).toEqual(participationDemo.runAnyway);
    expect(
      (
        await api.operator.participation.cancelSession({
          ...subject,
          reason: "weather",
          confirmed: true,
          idempotencyKey: key(),
        })
      ).cancellations,
    ).toHaveLength(4);
    expect(
      await api.operator.participation.requestCancel({ ...subject, reason: "coach", idempotencyKey: key() }),
    ).toEqual(participationDemo.cancelRequest);
    expect(await api.operator.participation.cancelRequests()).toHaveLength(1);
    expect(
      (
        await api.operator.participation.recordAttendance({
          ...subject,
          marks: [{ bookingId: subject.subjectId, status: "attended" }],
          idempotencyKey: key(),
        })
      ).recorded,
    ).toBe(7);
    const quote = await api.player.participation.quote({
      catalogItemId: participationDemo.atRisk.sessions[0]!.catalogItemId,
      catalogSessionOccurrenceId: participationDemo.quotes[1]!.subjectId,
    });
    expect(quote.title).toBe("Thursday clinic");
  });

  it("keeps cancel-with-refunds behind payments:write", async () => {
    const manager = createCaller(createApiContext({ actor: createDemoActor() }));
    await expect(
      manager.operator.participation.cancelSession({
        ...subject,
        reason: "weather",
        confirmed: true,
        idempotencyKey: key(),
      }),
    ).rejects.toThrow("payments:write");
  });

  it("refuses a cancellation nobody confirmed", async () => {
    await expect(
      caller().operator.participation.cancelSession({
        ...subject,
        reason: "weather",
        confirmed: false as unknown as true,
        idempotencyKey: key(),
      }),
    ).rejects.toThrow();
  });
});
