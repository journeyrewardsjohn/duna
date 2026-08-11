import { describe, expect, it } from "vitest";
import { decideMessagingPermission } from "./permissions";

describe("decideMessagingPermission", () => {
  it("allows organization service messaging only with a prior relationship", () => {
    expect(
      decideMessagingPermission({
        senderType: "organization",
        recipientType: "user",
        conversationType: "event",
        senderIsOrganizationStaff: true,
        priorOrganizationRelationship: true,
        sharedActiveContext: true,
      }),
    ).toMatchObject({ allowed: true, route: "context-group" });
    expect(
      decideMessagingPermission({
        senderType: "organization",
        recipientType: "user",
        conversationType: "broadcast",
        senderIsOrganizationStaff: true,
      }),
    ).toMatchObject({ allowed: false, code: "relationship-required" });
  });

  it("never allows marketing intent through the relationship channel", () => {
    expect(
      decideMessagingPermission({
        senderType: "organization",
        recipientType: "user",
        conversationType: "broadcast",
        senderIsOrganizationStaff: true,
        priorOrganizationRelationship: true,
        marketingIntent: true,
      }),
    ).toMatchObject({ allowed: false, code: "marketing-not-allowed" });
  });

  it("allows a pro to message a follower without allowing the inverse", () => {
    expect(
      decideMessagingPermission({
        senderType: "user",
        recipientType: "user",
        conversationType: "broadcast",
        senderIsProfessional: true,
        recipientFollowsSender: true,
      }),
    ).toMatchObject({ allowed: true, route: "follower-broadcast" });
    expect(
      decideMessagingPermission({
        senderType: "user",
        recipientType: "user",
        conversationType: "dm",
        senderFollowsRecipient: true,
        recipientFollowsSender: false,
      }),
    ).toMatchObject({ allowed: false, code: "mutual-follow-required" });
  });

  it("requires both guardian visibility and screening for minors", () => {
    const base = {
      senderType: "user" as const,
      recipientType: "user" as const,
      conversationType: "dm" as const,
      senderFollowsRecipient: true,
      recipientFollowsSender: true,
      minorPresent: true,
    };
    expect(
      decideMessagingPermission({
        ...base,
        safetyScreeningAvailable: true,
      }),
    ).toMatchObject({ allowed: false, code: "guardian-required" });
    expect(
      decideMessagingPermission({
        ...base,
        verifiedGuardianPresent: true,
      }),
    ).toMatchObject({ allowed: false, code: "screening-required" });
    expect(
      decideMessagingPermission({
        ...base,
        verifiedGuardianPresent: true,
        safetyScreeningAvailable: true,
      }),
    ).toMatchObject({
      allowed: true,
      guardianRequired: true,
      screeningRequired: true,
    });
  });

  it("makes an active block authoritative", () => {
    expect(
      decideMessagingPermission({
        senderType: "organization",
        recipientType: "user",
        conversationType: "event",
        senderIsOrganizationStaff: true,
        priorOrganizationRelationship: true,
        blockedByRecipient: true,
      }),
    ).toMatchObject({ allowed: false, code: "blocked" });
  });
});
