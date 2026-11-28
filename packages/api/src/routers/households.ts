/**
 * Router seam: households (owner: FAM). Guardians and children, managed child
 * profiles, invitations and consent records. Shapes are frozen in
 * ../contracts/households.ts (W3-0).
 *
 * Mounted once in ../router.ts as `player.households` (protectedProcedure:
 * signed in). Authority over a child is decided in the service from
 * `guardianships` (as Duna Health does), never from input. A person
 * confirms every consent on its own screen.
 *
 * Every procedure returns its fixture from @duna/core/demo/households in
 * demo mode and throws `notImplementedYet` otherwise until FAM lands the
 * service in ../services/households/. Read ./README.md first.
 */
import {
  householdsDemo,
  householdsDemoIds,
  householdsDemoInvitations,
  householdsDemoMembers,
} from "@duna/core/demo/households";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, rateLimitMiddleware, router } from "../auth";
import {
  householdsAddManagedChildInputSchema,
  householdsConsentResultSchema,
  householdsConsentSchema,
  householdsConsentsInputSchema,
  householdsCreateInputSchema,
  householdsGuardianLinkSchema,
  householdsHouseholdSchema,
  householdsInvitationPreviewSchema,
  householdsInvitationRefInputSchema,
  householdsInvitationSchema,
  householdsInvitationTokenInputSchema,
  householdsInviteInputSchema,
  householdsInviteResultSchema,
  householdsMemberRefInputSchema,
  householdsMemberSchema,
  householdsRecordConsentInputSchema,
  householdsRespondInputSchema,
  householdsWithdrawConsentInputSchema,
} from "../contracts/households";
import { usesDemoData } from "../services/data-source";
import { notImplementedYet } from "./not-implemented";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "households";
const DEMO_NOW = "2026-11-27T22:30:00.000Z";
const invitationWrites = rateLimitMiddleware({
  id: "household-invitation",
  capacity: 10,
  refillPerMinute: 2,
});

function demoMember(memberId: string) {
  const member = householdsDemoMembers.find((m) => m.id === memberId);
  if (!member) throw new TRPCError({ code: "NOT_FOUND" });
  return member;
}

export const householdsPlayerRouter = router({
  status: protectedProcedure
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** The signed-in person's household, or null when they have none. */
  mine: protectedProcedure
    .output(householdsHouseholdSchema.nullable())
    .query(() => {
      if (usesDemoData()) return householdsDemo.household;
      return notImplementedYet(DOMAIN, "mine");
    }),

  create: protectedProcedure
    .input(householdsCreateInputSchema)
    .output(householdsHouseholdSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        return { ...householdsDemo.household, name: input.name };
      }
      return notImplementedYet(DOMAIN, "create");
    }),

  /** Add a child profile the guardian manages (no sign-in of its own). */
  addManagedChild: protectedProcedure
    .input(householdsAddManagedChildInputSchema)
    .output(householdsMemberSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        const member = demoMember(householdsDemoIds.remyMember);
        return {
          ...member,
          person: {
            ...member.person,
            displayName: [input.givenName, input.familyName]
              .filter(Boolean)
              .join(" "),
          },
        };
      }
      return notImplementedYet(DOMAIN, "addManagedChild");
    }),

  /** Invite a co-guardian, a teen or another adult. A person sends it. */
  invite: protectedProcedure
    .use(invitationWrites)
    .input(householdsInviteInputSchema)
    .output(householdsInviteResultSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        return {
          invitation: { ...householdsDemoInvitations[0]!, role: input.role },
          shareUrl: householdsDemo.shareUrl,
        };
      }
      return notImplementedYet(DOMAIN, "invite");
    }),

  cancelInvitation: protectedProcedure
    .input(householdsInvitationRefInputSchema)
    .output(householdsInvitationSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        const invitation = householdsDemoInvitations.find(
          (candidate) => candidate.id === input.invitationId,
        );
        if (!invitation) throw new TRPCError({ code: "NOT_FOUND" });
        return {
          ...invitation,
          status: "cancelled" as const,
          respondedAt: DEMO_NOW,
        };
      }
      return notImplementedYet(DOMAIN, "cancelInvitation");
    }),

  /** What an invitation link offers, before the invitee answers. */
  invitationPreview: protectedProcedure
    .input(householdsInvitationTokenInputSchema)
    .output(householdsInvitationPreviewSchema)
    .query(() => {
      if (usesDemoData()) return householdsDemo.invitationPreview;
      return notImplementedYet(DOMAIN, "invitationPreview");
    }),

  respondToInvitation: protectedProcedure
    .use(invitationWrites)
    .input(householdsRespondInputSchema)
    .output(householdsInvitationSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        return {
          ...householdsDemoInvitations[0]!,
          status: input.accept ? ("accepted" as const) : ("declined" as const),
          respondedAt: DEMO_NOW,
        };
      }
      return notImplementedYet(DOMAIN, "respondToInvitation");
    }),

  /** Remove a member; a child's data is deleted after a 7-day recovery window. */
  removeMember: protectedProcedure
    .input(householdsMemberRefInputSchema)
    .output(householdsMemberSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        const member = demoMember(input.memberId);
        return {
          ...member,
          status: "removed" as const,
          removedAt: DEMO_NOW,
          deletionScheduledAt: "2026-12-04T22:30:00.000Z",
        };
      }
      return notImplementedYet(DOMAIN, "removeMember");
    }),

  /** Undo a removal inside the recovery window. */
  restoreMember: protectedProcedure
    .input(householdsMemberRefInputSchema)
    .output(householdsMemberSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        const member = demoMember(input.memberId);
        return {
          id: member.id,
          person: member.person,
          role: member.role,
          ageBand: member.ageBand,
          managed: member.managed,
          ...("accountHolder" in member
            ? { accountHolder: member.accountHolder }
            : {}),
          status: "active" as const,
          joinedAt: member.joinedAt,
        };
      }
      return notImplementedYet(DOMAIN, "restoreMember");
    }),

  /** Guardian links from `guardianships` (read-only; Health reads the same). */
  guardianLinks: protectedProcedure
    .output(z.array(householdsGuardianLinkSchema))
    .query(() => {
      if (usesDemoData()) return householdsDemo.household.guardianLinks;
      return notImplementedYet(DOMAIN, "guardianLinks");
    }),

  /** Every consent act for one child, newest first. */
  consents: protectedProcedure
    .input(householdsConsentsInputSchema)
    .output(z.array(householdsConsentSchema))
    .query(({ input }) => {
      if (usesDemoData()) {
        return householdsDemo.consents.filter(
          (consent) => consent.child.personId === input.childPersonId,
        );
      }
      return notImplementedYet(DOMAIN, "consents");
    }),

  /** Record a guardian's consent; card verification may be not configured. */
  recordConsent: protectedProcedure
    .input(householdsRecordConsentInputSchema)
    .output(householdsConsentResultSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        if (input.method === "card-verification") {
          return {
            state: "provider-not-configured" as const,
            method: input.method,
          };
        }
        const base = householdsDemo.consents[0]!;
        return {
          state: "recorded" as const,
          consent: {
            ...base,
            child: { ...base.child, personId: input.childPersonId },
            kind: input.kind,
            decision: input.decision,
            method: input.method,
            disclosureVersion: input.disclosureVersion,
            disclosureTextHash: input.disclosureTextHash,
            occurredAt: DEMO_NOW,
          },
        };
      }
      return notImplementedYet(DOMAIN, "recordConsent");
    }),

  withdrawConsent: protectedProcedure
    .input(householdsWithdrawConsentInputSchema)
    .output(householdsConsentSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        const base = householdsDemo.consents[0]!;
        return {
          ...base,
          child: { ...base.child, personId: input.childPersonId },
          kind: input.kind,
          decision: "withdrawn" as const,
          occurredAt: DEMO_NOW,
        };
      }
      return notImplementedYet(DOMAIN, "withdrawConsent");
    }),
});
