import { describe, expect, it } from "vitest";
import {
  authorizePiiAccess,
  evaluateCoachMarketplaceGate,
  evaluateWalletRisk,
  triageTrustReport,
  validateReviewIntegrity,
} from "./trust";

describe("trust, safety, and platform administration", () => {
  it("gives minor-safety reports a one-hour human-triage SLA", () => {
    expect(
      triageTrustReport({
        kind: "minor-safety",
        createdAt: "2026-07-30T12:00:00Z",
        subjectIsMinor: true,
      }),
    ).toEqual({
      priority: "urgent",
      dueAt: "2026-07-30T13:00:00.000Z",
      payoutHoldRequired: false,
      humanReviewRequired: true,
    });
  });

  it("holds a load-spend-withdraw laundering pattern for human review", () => {
    const decision = evaluateWalletRisk({
      evaluatedAt: "2026-07-30T12:00:00Z",
      events: [
        {
          id: "load",
          kind: "load",
          amountMinor: 50_000,
          occurredAt: "2026-07-30T08:00:00Z",
          succeeded: true,
        },
        {
          id: "spend",
          kind: "spend",
          amountMinor: 48_000,
          occurredAt: "2026-07-30T09:00:00Z",
          succeeded: true,
        },
        {
          id: "withdraw",
          kind: "withdrawal",
          amountMinor: 45_000,
          occurredAt: "2026-07-30T10:00:00Z",
          ipAddress: "203.0.113.40",
          succeeded: true,
        },
      ],
    });

    expect(decision).toMatchObject({
      risk: "hold",
      spendingBlocked: true,
      payoutHeld: true,
    });
    expect(decision.reasons).toContain("load-spend-withdraw");
    expect(decision.reasons).toContain("new-ip-before-withdrawal");
  });

  it("requires an admin role, explicit scope, and a reason for PII access", () => {
    expect(
      authorizePiiAccess({
        roles: ["admin"],
        scopes: ["pii:read"],
        reason: "Safety case SAFE-10842",
      }),
    ).toEqual({ allowed: true, auditRequired: true });
    expect(
      authorizePiiAccess({
        roles: ["manager"],
        scopes: ["pii:read"],
        reason: "Curiosity",
      }).reason,
    ).toBe("admin-role-required");
  });

  it("gates minor-facing coaches on a clear background check", () => {
    expect(
      evaluateCoachMarketplaceGate({
        backgroundCheckStatus: "pending",
        minorFacing: true,
        marketplaceOriginatedClient: false,
        evaluatedAt: "2026-07-30T12:00:00Z",
      }),
    ).toMatchObject({
      canPublish: false,
      reasons: ["background-check-required"],
    });
  });

  it("allows reviews only after a verified completed booking", () => {
    expect(
      validateReviewIntegrity({
        reviewerPersonId: "player-1",
        coachPersonId: "coach-1",
        completedBookingPersonIds: ["player-1"],
      }),
    ).toEqual({ allowed: true });
    expect(
      validateReviewIntegrity({
        reviewerPersonId: "coach-1",
        coachPersonId: "coach-1",
        completedBookingPersonIds: ["coach-1"],
      }).reason,
    ).toBe("self-review");
  });
});
