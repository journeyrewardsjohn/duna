import { PARTICIPATION_STATES } from "@duna/core";
import { participationDemo } from "@duna/core/demo/participation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiContext, createDemoActor } from "../context";
import { createCaller } from "../router";
import {
  participationAtRiskSchema,
  participationInviteLinkSchema,
  participationInviteSchema,
  participationJoinWaitlistSchema,
  participationMergeSessionsSchema,
  participationRuleToReviewSchema,
  participationWaitlistPlaceSchema,
  participationCancelPreviewSchema,
  participationResolveCancelRequestSchema,
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
    for (const quote of participationDemo.quotes)
      participationQuoteSchema.parse(quote);
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
      participationDemo.cancelSession.cancellations.map(
        (entry) => entry.refundStatus,
      ),
    );
  });

  it("speaks the worked examples' words", () => {
    const byTitle = new Map(
      participationDemo.quotes.map((quote) => [quote.title, quote]),
    );
    expect(byTitle.get("Saturday semi-private")?.copy).toMatchObject({
      status: "Needs 1 more",
      line: "Confirms Fri 9:00 AM if 1 more joins",
    });
    expect(byTitle.get("Thursday clinic")?.copy).toMatchObject({
      status: "Minimum reached",
      // 9 booked: the cheaper rung (8–12 · 2) is already reached.
      price:
        "3 credits now; 1 comes back when the group is confirmed Wed 6:00 PM.",
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
    createCaller(
      createApiContext({ actor: createDemoActor(["player", "owner"]) }),
    );
  const key = () => crypto.randomUUID();
  const subject = {
    subjectType: "catalog-session-occurrence" as const,
    subjectId: participationDemo.quotes[0]!.subjectId,
  };

  it("serves every procedure", async () => {
    const api = caller();
    expect(
      (await api.operator.participation.defaults()).rules?.minParticipants,
    ).toBe(3);
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
      await api.operator.participation.runAnyway({
        ...subject,
        confirmed: true,
        idempotencyKey: key(),
      }),
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
      await api.operator.participation.requestCancel({
        ...subject,
        reason: "coach",
        idempotencyKey: key(),
      }),
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
    const manager = createCaller(
      createApiContext({ actor: createDemoActor() }),
    );
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

describe("participation part 2 fixtures and procedures", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("parses and serves waitlist, invites, merges and rules to review", async () => {
    participationJoinWaitlistSchema.parse(participationDemo.waitlistJoined);
    participationWaitlistPlaceSchema.parse(participationDemo.waitlistOffer);
    participationInviteLinkSchema.parse(participationDemo.inviteLink);
    participationInviteSchema.parse(participationDemo.invite);
    participationMergeSessionsSchema.parse(participationDemo.mergeSessions);
    for (const row of participationDemo.rulesToReview)
      participationRuleToReviewSchema.parse(row);
    const api = createCaller(
      createApiContext({ actor: createDemoActor(["player", "owner"]) }),
    );
    const key = () => crypto.randomUUID();
    const subjectId = participationDemo.quotes[2]!.subjectId;
    expect(
      await api.player.participation.joinWaitlist({
        subjectType: "catalog-session-occurrence",
        subjectId,
        idempotencyKey: key(),
      }),
    ).toEqual(participationDemo.waitlistJoined);
    expect(
      await api.player.participation.leaveWaitlist({
        entryId: participationDemo.waitlistJoined.entryId,
        idempotencyKey: key(),
      }),
    ).toEqual({ status: "cancelled" });
    expect(
      (
        await api.player.participation.createInvite({
          subjectType: "catalog-session-occurrence",
          subjectId,
        })
      ).url,
    ).toBe("/i/demoInvite12");
    expect(
      (await api.public.participation.invite({ code: "demoInvite12" })).needs,
    ).toBe(1);
    expect(
      (
        await api.operator.participation.mergeSessions({
          fromOccurrenceId: participationDemo.quotes[0]!.subjectId,
          intoOccurrenceId: participationDemo.quotes[1]!.subjectId,
          confirmed: true,
          idempotencyKey: key(),
        })
      ).moved,
    ).toBe(3);
    expect(await api.operator.participation.rulesToReview()).toHaveLength(2);
    expect(
      await api.operator.participation.keepRule({
        subjectType: "session",
        subjectId: participationDemo.rulesToReview[0]!.subjectId,
        idempotencyKey: key(),
      }),
    ).toEqual({ state: "kept" });
  });
});

describe("PART-B procedures in demo mode", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
  });
  afterEach(() => vi.unstubAllEnvs());
  const key = () => crypto.randomUUID();
  const owner = () =>
    createCaller(
      createApiContext({ actor: createDemoActor(["player", "owner"]) }),
    );
  const coach = () =>
    createCaller(
      createApiContext({ actor: createDemoActor(["player", "coach"]) }),
    );

  it("fixtures parse against their contracts", () => {
    participationCancelPreviewSchema.parse(participationDemo.cancelPreview);
    participationResolveCancelRequestSchema.parse(
      participationDemo.cancelRequestApproved,
    );
    participationResolveCancelRequestSchema.parse(
      participationDemo.cancelRequestDeclined,
    );
    participationInviteLinkSchema.parse(participationDemo.shareLink);
  });

  it("previews a cancellation with money for the owner and without for a coach", async () => {
    const subject = {
      subjectType: "catalog-session-occurrence" as const,
      subjectId: participationDemo.cancelPreview.subjectId,
    };
    const full = await owner().operator.participation.cancelPreview(subject);
    expect(full.totals.creditsBack).toBeGreaterThan(0);
    expect(full.bookings.some((booking) => booking.isMinor)).toBe(true);
    const junior = full.bookings.find((booking) => booking.isMinor)!;
    expect(junior.displayName).toBe("Sam");
    expect(
      full.notices.find((notice) => notice.bookingId === junior.bookingId),
    ).toMatchObject({ audienceRole: "guardian", audience: "Mara Lewis" });
    const names = await coach().operator.participation.cancelPreview(subject);
    expect(names.totals.creditsBack).toBeUndefined();
    expect(
      names.bookings.every(
        (booking) =>
          booking.creditsBack === undefined &&
          booking.cardRefundMinor === undefined,
      ),
    ).toBe(true);
  });

  it("resolves a cancel request and makes a share link", async () => {
    const requestId = participationDemo.cancelRequests[0]!.id;
    expect(
      await owner().operator.participation.resolveCancelRequest({
        requestId,
        decision: "approve",
        confirmed: true,
        idempotencyKey: key(),
      }),
    ).toEqual(participationDemo.cancelRequestApproved);
    expect(
      (
        await owner().operator.participation.resolveCancelRequest({
          requestId,
          decision: "decline",
          note: "We have a cover coach",
          confirmed: true,
          idempotencyKey: key(),
        })
      ).status,
    ).toBe("declined");
    expect(
      await coach().operator.participation.shareLink({
        subjectType: "catalog-session-occurrence",
        subjectId: participationDemo.quotes[0]!.subjectId,
      }),
    ).toEqual(participationDemo.shareLink);
  });

  it("answers the staff session list from the fixtures, with detail", async () => {
    const rows = await owner().operator.catalogSessionOccurrences();
    expect(rows.length).toBe(participationDemo.occurrences.length);
    const clinic = rows.find((row) => row.title === "Thursday clinic")!;
    expect(clinic.coach?.displayName).toBe("Coach Rivera");
    expect(clinic.venue?.name).toBe("Manhattan Beach Pier");
    expect(
      clinic.bookings.find((booking) => booking.isMinor)?.guardianDisplayName,
    ).toBe("Mara Lewis");
    const one = await coach().operator.catalogSessionOccurrences({
      occurrenceId: clinic.id,
    });
    expect(one.map((row) => row.id)).toEqual([clinic.id]);
    expect(one[0]!.participation?.atStakeCredits).toBeUndefined();
  });

  it("quotes an all-in price on the operator side", async () => {
    const quote = await owner().operator.fees.quote({
      priceMinor: 3_000,
      currency: "USD",
      method: "card",
    });
    expect(quote).toMatchObject({ status: "ok", unit: "money" });
    if (quote.status === "ok" && quote.unit === "money") {
      expect(quote.clubReceives.amountMinor).toBe(
        quote.playerPays.amountMinor - quote.dunaFees.amountMinor,
      );
    }
    expect(
      await owner().operator.fees.quote({
        offeringId: participationDemo.atRisk.sessions[0]!.catalogItemId,
        currency: "USD",
        method: "credits",
      }),
    ).toMatchObject({ status: "ok", unit: "credits" });
  });
});
