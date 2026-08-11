import type {
  ConversationContextType,
  ConversationType,
  PrincipalType,
} from "./contracts";

export interface MessagingPermissionFacts {
  readonly senderType: PrincipalType;
  readonly recipientType: Exclude<PrincipalType, "agent">;
  readonly conversationType: ConversationType;
  readonly contextType?: ConversationContextType;
  readonly senderIsProfessional?: boolean;
  readonly recipientFollowsSender?: boolean;
  readonly senderFollowsRecipient?: boolean;
  readonly sharedActiveContext?: boolean;
  readonly priorOrganizationRelationship?: boolean;
  readonly senderIsOrganizationStaff?: boolean;
  readonly userInitiatedSupport?: boolean;
  readonly blockedByRecipient?: boolean;
  readonly senderBlockedRecipient?: boolean;
  readonly minorPresent?: boolean;
  readonly verifiedGuardianPresent?: boolean;
  readonly safetyScreeningAvailable?: boolean;
  readonly marketingIntent?: boolean;
}

export type MessagingDeliveryRoute =
  "direct" | "context-group" | "follower-broadcast" | "support" | "denied";

export interface MessagingPermissionDecision {
  readonly allowed: boolean;
  readonly route: MessagingDeliveryRoute;
  readonly guardianRequired: boolean;
  readonly screeningRequired: boolean;
  readonly code:
    | "allowed"
    | "blocked"
    | "marketing-not-allowed"
    | "relationship-required"
    | "mutual-follow-required"
    | "guardian-required"
    | "screening-required"
    | "support-user-initiation-required";
  readonly reason: string;
}

function denied(
  code: Exclude<MessagingPermissionDecision["code"], "allowed">,
  reason: string,
  facts: MessagingPermissionFacts,
): MessagingPermissionDecision {
  return {
    allowed: false,
    route: "denied",
    guardianRequired: Boolean(facts.minorPresent),
    screeningRequired: Boolean(facts.minorPresent),
    code,
    reason,
  };
}

export function decideMessagingPermission(
  facts: MessagingPermissionFacts,
): MessagingPermissionDecision {
  if (facts.blockedByRecipient || facts.senderBlockedRecipient) {
    return denied(
      "blocked",
      "Messaging is blocked for this relationship.",
      facts,
    );
  }
  if (facts.marketingIntent) {
    return denied(
      "marketing-not-allowed",
      "Duna Messaging is for service and relationship communication, not unsolicited marketing.",
      facts,
    );
  }
  if (facts.minorPresent && !facts.verifiedGuardianPresent) {
    return denied(
      "guardian-required",
      "A verified parent or guardian must be included in conversations involving a minor.",
      facts,
    );
  }
  if (facts.minorPresent && !facts.safetyScreeningAvailable) {
    return denied(
      "screening-required",
      "Minor messaging is unavailable until SafeSport screening is active.",
      facts,
    );
  }

  let route: Exclude<MessagingDeliveryRoute, "denied"> | undefined;
  if (facts.senderType === "agent") {
    if (!facts.userInitiatedSupport) {
      return denied(
        "support-user-initiation-required",
        "Duna Support may respond after a member opens or continues a support conversation.",
        facts,
      );
    }
    route = "support";
  } else if (facts.senderType === "organization") {
    if (
      !facts.senderIsOrganizationStaff ||
      !facts.priorOrganizationRelationship
    ) {
      return denied(
        "relationship-required",
        "The organization needs a recorded event, lesson, rental, membership, or staff relationship with this member.",
        facts,
      );
    }
    route = facts.sharedActiveContext ? "context-group" : "direct";
  } else if (
    facts.senderIsProfessional &&
    facts.recipientFollowsSender &&
    facts.conversationType === "broadcast"
  ) {
    route = "follower-broadcast";
  } else if (facts.sharedActiveContext) {
    route = "context-group";
  } else if (facts.senderFollowsRecipient && facts.recipientFollowsSender) {
    route = "direct";
  } else {
    return denied(
      "mutual-follow-required",
      "Member-to-member messages require a mutual follow or an active shared Duna context.",
      facts,
    );
  }

  return {
    allowed: true,
    route,
    guardianRequired: Boolean(facts.minorPresent),
    screeningRequired: Boolean(facts.minorPresent),
    code: "allowed",
    reason: facts.minorPresent
      ? "Allowed with guardian visibility and SafeSport screening."
      : "Allowed by the current Duna relationship.",
  };
}
