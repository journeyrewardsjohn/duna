/**
 * Router seam: legal (owner: L3, terms acceptance). Document versions and
 * acceptances of any document key and version. Shapes are frozen in
 * ../contracts/legal.ts (W3-0).
 *
 * Mounted once in ../router.ts:
 *   public.legal    publicProcedure: the document registry
 *   player.legal    protectedProcedure: my acceptances, requirements, accept
 *   operator.legal  organizationProcedure: the organisation's acceptances;
 *                   accepting HQ / Duna Pay terms needs "members:write"
 *
 * The service records IP address, user agent and request id as evidence
 * from the request context, never from input. Every procedure returns its
 * fixture from @duna/core/demo/legal in demo mode and throws
 * `notImplementedYet` otherwise until L3 lands ../services/legal/.
 */
import { legalDemo } from "@duna/core/demo/legal";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  organizationProcedure,
  protectedProcedure,
  publicProcedure,
  rateLimitMiddleware,
  router,
} from "../auth";
import {
  legalAcceptInputSchema,
  legalAcceptanceSchema,
  legalDocumentInputSchema,
  legalDocumentVersionSchema,
  legalDocumentsInputSchema,
  legalOrganizationAcceptInputSchema,
  legalRequirementSchema,
  legalRequirementsInputSchema,
} from "../contracts/legal";
import { usesDemoData } from "../services/data-source";
import { notImplementedYet } from "./not-implemented";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "legal";
const DEMO_NOW = "2026-11-27T22:30:00.000Z";
const acceptWrites = rateLimitMiddleware({
  id: "legal-accept",
  capacity: 20,
  refillPerMinute: 10,
});

/** Current = the latest effective version per key (drafts win over published in demo). */
function demoCurrentDocuments() {
  const byKey = new Map<string, (typeof legalDemo.documents)[number]>();
  for (const document of legalDemo.documents) {
    if (!byKey.has(document.documentKey)) {
      byKey.set(document.documentKey, document);
    }
  }
  return [...byKey.values()];
}

function demoAccepted(
  documents: readonly {
    documentKey: string;
    version: string;
    documentHash: string;
  }[],
  extra: Record<string, unknown>,
) {
  const base = legalDemo.acceptances[0]!;
  return documents.map((document, index) => ({
    ...base,
    id: `${base.id.slice(0, -4)}${String(9000 + index)}`,
    documentKey: document.documentKey,
    documentVersion: document.version,
    documentHash: document.documentHash,
    acceptedAt: DEMO_NOW,
    ...extra,
  }));
}

export const legalPublicRouter = router({
  status: publicProcedure
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** Current version of every document (the Legal Center). */
  documents: publicProcedure
    .input(legalDocumentsInputSchema)
    .output(z.array(legalDocumentVersionSchema))
    .query(({ input }) => {
      if (usesDemoData()) {
        return demoCurrentDocuments().filter(
          (document) => !input.audience || document.audience === input.audience,
        );
      }
      return notImplementedYet(DOMAIN, "documents");
    }),

  /** One document version (the current one when version is omitted). */
  document: publicProcedure
    .input(legalDocumentInputSchema)
    .output(legalDocumentVersionSchema)
    .query(({ input }) => {
      if (usesDemoData()) {
        const document = legalDemo.documents.find(
          (candidate) =>
            candidate.documentKey === input.documentKey &&
            (!input.version || candidate.version === input.version),
        );
        if (!document) throw new TRPCError({ code: "NOT_FOUND" });
        return document;
      }
      return notImplementedYet(DOMAIN, "document");
    }),
});

export const legalPlayerRouter = router({
  status: protectedProcedure
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** My acceptances, and those I made for minors I manage. */
  myAcceptances: protectedProcedure
    .output(z.array(legalAcceptanceSchema))
    .query(() => {
      if (usesDemoData()) {
        return legalDemo.acceptances.filter(
          (acceptance) => acceptance.acceptedAs !== "organization-authority",
        );
      }
      return notImplementedYet(DOMAIN, "myAcceptances");
    }),

  /** What still needs (re)acceptance before continuing on a surface. */
  requirements: protectedProcedure
    .input(legalRequirementsInputSchema)
    .output(z.array(legalRequirementSchema))
    .query(({ input }) => {
      if (usesDemoData()) {
        return legalDemo.requirements.filter(
          (requirement) =>
            !input.forPersonId ||
            ("forPerson" in requirement &&
              requirement.forPerson?.personId === input.forPersonId),
        );
      }
      return notImplementedYet(DOMAIN, "requirements");
    }),

  /** Accept one or more documents, for myself or a managed minor. */
  accept: protectedProcedure
    .use(acceptWrites)
    .input(legalAcceptInputSchema)
    .output(z.array(legalAcceptanceSchema))
    .mutation(({ input }) => {
      if (usesDemoData()) {
        const minor = input.onBehalfOfPersonId
          ? {
              acceptedAs: "guardian" as const,
              onBehalfOf: {
                personId: input.onBehalfOfPersonId,
                displayName: "Managed player",
              },
            }
          : {};
        return demoAccepted(input.documents, {
          surface: input.surface,
          ...(input.locale ? { locale: input.locale } : {}),
          ...minor,
        });
      }
      return notImplementedYet(DOMAIN, "accept");
    }),
});

export const legalOperatorRouter = router({
  status: organizationProcedure("members:read")
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** The organisation's accepted terms (HQ terms, Duna Pay terms). */
  acceptances: organizationProcedure("members:read")
    .output(z.array(legalAcceptanceSchema))
    .query(() => {
      if (usesDemoData()) {
        return legalDemo.acceptances.filter(
          (acceptance) => acceptance.acceptedAs === "organization-authority",
        );
      }
      return notImplementedYet(DOMAIN, "acceptances");
    }),

  /** Accept for the organisation; the person confirms authority to bind it. */
  accept: organizationProcedure("members:write")
    .use(acceptWrites)
    .input(legalOrganizationAcceptInputSchema)
    .output(z.array(legalAcceptanceSchema))
    .mutation(({ input, ctx }) => {
      if (usesDemoData()) {
        return demoAccepted(input.documents, {
          acceptedAs: "organization-authority" as const,
          organizationId: ctx.organizationId,
          surface: input.surface,
        });
      }
      return notImplementedYet(DOMAIN, "accept");
    }),
});
