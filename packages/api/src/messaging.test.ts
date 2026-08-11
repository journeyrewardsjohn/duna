import { describe, expect, it } from "vitest";
import { canSendAt, enforceGuardianCopies } from "./messaging";
import { canUseMinorAi, resolveDunaAiModel } from "./duna-ai-support";
import {
  canUseOrganizationMessaging,
  hasActiveGuardianCoverage,
  validateConversationCreationMode,
  validateMessageAuthoring,
} from "./messaging-service";

describe("messaging safety", () => {
  it("qualifies OpenAI models only when routing through AI Gateway", () => {
    expect(resolveDunaAiModel("gpt-5.6-luna", true)).toBe(
      "openai/gpt-5.6-luna",
    );
    expect(resolveDunaAiModel("openai/gpt-5.6-luna", true)).toBe(
      "openai/gpt-5.6-luna",
    );
    expect(resolveDunaAiModel("openai/gpt-5.6", false)).toBe("gpt-5.6");
  });

  it("adds every verified guardian at the server boundary", () => {
    expect(
      enforceGuardianCopies({
        recipientPersonId: "minor",
        recipientIsMinor: true,
        verifiedGuardianPersonIds: ["guardian-1", "guardian-2"],
        requestedCopyPersonIds: ["guardian-1"],
      }),
    ).toEqual({
      recipientPersonId: "minor",
      guardianCopyPersonIds: ["guardian-1", "guardian-2"],
      enforced: true,
    });
  });

  it("blocks coach-to-minor messages when no guardian is verified", () => {
    expect(() =>
      enforceGuardianCopies({
        recipientPersonId: "minor",
        recipientIsMinor: true,
        verifiedGuardianPersonIds: [],
      }),
    ).toThrow("verified guardian");
  });

  it("allows transactional notices through quiet hours", () => {
    expect(
      canSendAt({
        now: new Date("2026-07-30T05:00:00.000Z"),
        timezoneOffsetMinutes: -420,
        quietHoursStart: 21 * 60,
        quietHoursEnd: 8 * 60,
        transactional: true,
      }),
    ).toBe(true);
  });

  it("requires both parental consent and confirmed zero-retention controls for minors", () => {
    expect(
      canUseMinorAi({
        zeroDataRetentionConfirmed: true,
        parentalConsentComplete: true,
      }),
    ).toBe(true);
    expect(
      canUseMinorAi({
        zeroDataRetentionConfirmed: true,
        parentalConsentComplete: false,
      }),
    ).toBe(false);
    expect(
      canUseMinorAi({
        zeroDataRetentionConfirmed: false,
        parentalConsentComplete: true,
      }),
    ).toBe(false);
  });

  it("requires an active verified guardian for every minor participant", () => {
    const verifiedGuardianships = [
      { guardianId: "guardian-1", minorId: "minor-1" },
      { guardianId: "guardian-2", minorId: "minor-2" },
    ];
    expect(
      hasActiveGuardianCoverage({
        minorPersonIds: ["minor-1", "minor-2"],
        activeParticipantPersonIds: [
          "minor-1",
          "minor-2",
          "guardian-1",
          "guardian-2",
        ],
        verifiedGuardianships,
      }),
    ).toBe(true);
    expect(
      hasActiveGuardianCoverage({
        minorPersonIds: ["minor-1", "minor-2"],
        activeParticipantPersonIds: ["minor-1", "minor-2", "guardian-1"],
        verifiedGuardianships,
      }),
    ).toBe(false);
  });

  it("keeps event audiences and follower broadcasts on their authorized principals", () => {
    expect(() =>
      validateConversationCreationMode({
        principalType: "user",
        conversation: {
          type: "event",
          title: "Forged event audience",
          recipientPersonIds: ["10000000-0000-4000-8000-000000000010"],
          context: {
            type: "event",
            id: "20000000-0000-4000-8000-000000000010",
            label: "Someone else's event",
            organizationId: "30000000-0000-4000-8000-000000000010",
          },
          announcementOnly: false,
          followerBroadcast: false,
        },
      }),
    ).toThrow("Event audiences are resolved by their organization");
    expect(() =>
      validateConversationCreationMode({
        principalType: "organization",
        conversation: {
          type: "broadcast",
          title: "Followers",
          recipientPersonIds: [],
          announcementOnly: true,
          followerBroadcast: true,
        },
      }),
    ).toThrow("verified Duna Pro");
  });

  it("reserves transactional cards and trusted message kinds for Duna services", () => {
    expect(() =>
      validateMessageAuthoring({
        principalType: "user",
        kind: "payment-request",
        widgetCount: 1,
      }),
    ).toThrow("transactional cards");
    expect(() =>
      validateMessageAuthoring({
        principalType: "organization",
        kind: "system",
        widgetCount: 0,
      }),
    ).toThrow("trusted Duna services");
    expect(() =>
      validateMessageAuthoring({
        principalType: "organization",
        kind: "schedule-change",
        widgetCount: 1,
      }),
    ).not.toThrow();
  });

  it("does not let a member scope impersonate an organization principal", () => {
    const common = {
      personId: "10000000-0000-4000-8000-000000000001",
      organizationId: "20000000-0000-4000-8000-000000000001",
      displayName: "Duna member",
      ageBand: "adult" as const,
      isDemo: false,
    };
    expect(
      canUseOrganizationMessaging({
        ...common,
        roles: ["player"],
        scopes: ["messages:write"],
      }),
    ).toBe(false);
    expect(
      canUseOrganizationMessaging({
        ...common,
        roles: ["coach"],
        scopes: ["messages:write"],
      }),
    ).toBe(true);
  });
});
