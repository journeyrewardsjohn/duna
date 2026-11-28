/**
 * Contract: households (owner: FAM). Guardians and children in one household,
 * child profiles managed by a parent (a child under 13 cannot self-register:
 * the account belongs to the guardian), invitations, and consent records.
 * The guardian ↔ minor authority link is `guardianships`, read here exactly
 * as Duna Health reads it (services/health/policy.ts). Frozen by W3-0;
 * procedures `player.households.*` (see docs/plan/w3-contracts.md).
 */
import {
  householdConsentDecisions,
  householdConsentKinds,
  householdConsentMethods,
  householdInvitationStatuses,
  householdMemberRoles,
  householdMemberStatuses,
} from "@duna/db/schema";
import { z } from "zod";
import {
  w3DateSchema,
  w3DateTimeSchema,
  w3IdSchema,
  w3PersonRefSchema,
} from "./w3-common";

export const householdsMemberRoleSchema = z.enum(householdMemberRoles);
export const householdsMemberStatusSchema = z.enum(householdMemberStatuses);
export const householdsInvitationStatusSchema = z.enum(
  householdInvitationStatuses,
);
export const householdsConsentKindSchema = z.enum(householdConsentKinds);
export const householdsConsentDecisionSchema = z.enum(
  householdConsentDecisions,
);
export const householdsConsentMethodSchema = z.enum(householdConsentMethods);
export const householdsAgeBandSchema = z.enum([
  "unknown",
  "under-13",
  "teen",
  "adult",
]);
export const householdsGuardianLinkStatusSchema = z.enum([
  "pending",
  "verified",
  "rejected",
]);

export const householdsMemberSchema = z.object({
  id: w3IdSchema,
  person: w3PersonRefSchema,
  role: householdsMemberRoleSchema,
  ageBand: householdsAgeBandSchema,
  /** True when a guardian owns the account (no sign-in of their own). */
  managed: z.boolean(),
  accountHolder: w3PersonRefSchema.optional(),
  status: householdsMemberStatusSchema,
  joinedAt: w3DateTimeSchema,
  removedAt: w3DateTimeSchema.optional(),
  /** End of the 7-day recovery window after removal (childrens-privacy §8). */
  deletionScheduledAt: w3DateTimeSchema.optional(),
});

export const householdsInvitationSchema = z.object({
  id: w3IdSchema,
  role: householdsMemberRoleSchema.exclude(["child"]),
  concerns: w3PersonRefSchema.optional(),
  invitedBy: w3PersonRefSchema,
  /** Masked ("a••••@example.com"); the address itself is never returned. */
  contactHint: z.string().optional(),
  status: householdsInvitationStatusSchema,
  expiresAt: w3DateTimeSchema,
  respondedAt: w3DateTimeSchema.optional(),
  acceptedBy: w3PersonRefSchema.optional(),
  createdAt: w3DateTimeSchema,
});

export const householdsGuardianLinkSchema = z.object({
  guardian: w3PersonRefSchema,
  minor: w3PersonRefSchema,
  relationship: z.string().min(1),
  reviewStatus: householdsGuardianLinkStatusSchema,
});

export const householdsHouseholdSchema = z.object({
  id: w3IdSchema,
  name: z.string().min(1),
  createdBy: w3PersonRefSchema,
  members: z.array(householdsMemberSchema),
  invitations: z.array(householdsInvitationSchema),
  /** Read from `guardianships`; FAM never writes a second guardian link. */
  guardianLinks: z.array(householdsGuardianLinkSchema),
  createdAt: w3DateTimeSchema,
});

export const householdsCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

/** A child profile the guardian manages. Under 13: no sign-in, ever, until 13. */
export const householdsAddManagedChildInputSchema = z.object({
  givenName: z.string().trim().min(1).max(80),
  familyName: z.string().trim().max(80).optional(),
  birthDate: w3DateSchema,
  relationship: z.string().trim().min(1).max(48),
});

export const householdsInviteInputSchema = z.object({
  role: householdsMemberRoleSchema.exclude(["child"]),
  /** For a co-guardian: the child the invitation concerns. */
  concernsPersonId: w3IdSchema.optional(),
  contact: z.union([
    z.object({ email: z.email() }),
    z.object({ phoneE164: z.string().regex(/^\+[1-9]\d{6,14}$/) }),
  ]),
});
/** The invitation plus a share link; the token appears only inside the link. */
export const householdsInviteResultSchema = z.object({
  invitation: householdsInvitationSchema,
  shareUrl: z.url(),
});

export const householdsInvitationTokenInputSchema = z.object({
  token: z.string().min(16).max(256),
});
export const householdsInvitationPreviewSchema = z.object({
  householdName: z.string().min(1),
  invitedBy: w3PersonRefSchema,
  role: householdsMemberRoleSchema.exclude(["child"]),
  concerns: w3PersonRefSchema.optional(),
  status: householdsInvitationStatusSchema,
  expiresAt: w3DateTimeSchema,
});
export const householdsRespondInputSchema =
  householdsInvitationTokenInputSchema.extend({ accept: z.boolean() });

export const householdsInvitationRefInputSchema = z.object({
  invitationId: w3IdSchema,
});
export const householdsMemberRefInputSchema = z.object({
  memberId: w3IdSchema,
});

export const householdsConsentSchema = z.object({
  id: w3IdSchema,
  guardian: w3PersonRefSchema,
  child: w3PersonRefSchema,
  kind: householdsConsentKindSchema,
  decision: householdsConsentDecisionSchema,
  method: householdsConsentMethodSchema,
  disclosureVersion: z.string().min(1).max(32),
  disclosureTextHash: z.string().regex(/^[0-9a-f]{64}$/),
  occurredAt: w3DateTimeSchema,
});

export const householdsConsentsInputSchema = z.object({
  childPersonId: w3IdSchema,
});

export const householdsRecordConsentInputSchema = z.object({
  childPersonId: w3IdSchema,
  kind: householdsConsentKindSchema,
  decision: householdsConsentDecisionSchema.exclude(["withdrawn"]),
  method: householdsConsentMethodSchema.exclude(["admin-review"]),
  disclosureVersion: z.string().min(1).max(32),
  disclosureTextHash: z.string().regex(/^[0-9a-f]{64}$/),
});
export const householdsWithdrawConsentInputSchema = z.object({
  childPersonId: w3IdSchema,
  kind: householdsConsentKindSchema,
});

/**
 * Recording a consent either records it, or says the method's provider is
 * not configured (card verification needs Duna Pay credentials) so the UI
 * shows NotConfigured and offers another accepted method.
 */
export const householdsConsentResultSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("recorded"), consent: householdsConsentSchema }),
  z.object({
    state: z.literal("provider-not-configured"),
    method: householdsConsentMethodSchema,
  }),
]);

export type HouseholdsHousehold = z.infer<typeof householdsHouseholdSchema>;
export type HouseholdsMember = z.infer<typeof householdsMemberSchema>;
export type HouseholdsInvitation = z.infer<typeof householdsInvitationSchema>;
export type HouseholdsConsent = z.infer<typeof householdsConsentSchema>;
