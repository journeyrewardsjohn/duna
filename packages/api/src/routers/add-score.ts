/**
 * Router: add a score without an account (owner: SITE-3).
 * docs/product/add-score.md; contracts in ../contracts/add-score.ts.
 *
 * Mounted once in ../router.ts:
 *   public.addScore   publicProcedure: the anonymous draft (token from the
 *                     web app's HTTP-only cookie), with its own per-address
 *                     and per-draft limits inside the service
 *   player.addScore   protectedProcedure: claim the draft after sign-in
 *   admin.addScore    adminProcedure: review candidate venues
 */
import { addScoreDemo } from "@duna/core/demo/add-score";
import { TRPCError } from "@trpc/server";
import { getDatabase, auditLog } from "@duna/db";
import {
  adminProcedure,
  protectedProcedure,
  publicProcedure,
  rateLimitMiddleware,
  requireScope,
  router,
} from "../auth";
import {
  addScoreCandidateListInputSchema,
  addScoreCandidateListSchema,
  addScoreClaimInputSchema,
  addScoreClaimResultSchema,
  addScoreDiscardResultSchema,
  addScorePreviewResultSchema,
  addScoreReadResultSchema,
  addScoreResolveCandidateInputSchema,
  addScoreResolveCandidateResultSchema,
  addScoreSaveInputSchema,
  addScoreSaveResultSchema,
  addScoreTokenInputSchema,
} from "../contracts/add-score";
import {
  executeIdempotent,
  IdempotencyConflictError,
  IdempotencyInProgressError,
} from "../idempotency";
import { MatchServiceError } from "../match-service";
import {
  AddScoreCandidateError,
  listCandidates,
  resolveCandidate,
} from "../services/add-score/candidates";
import {
  AddScoreError,
  claimScoreDraft,
  discardScoreDraft,
  previewScoreDraft,
  readScoreDraft,
  saveScoreDraft,
} from "../services/add-score/service";
import { usesDemoData } from "../services/data-source";

/** Domain errors as tRPC errors with the message written for people. */
function rethrow(error: unknown): never {
  if (error instanceof AddScoreError) {
    const code =
      error.code === "RATE_LIMITED"
        ? "TOO_MANY_REQUESTS"
        : error.code === "NOT_FOUND"
          ? "NOT_FOUND"
          : error.code === "CLAIMED_BY_SOMEONE_ELSE" ||
              error.code === "UNDER_13"
            ? "FORBIDDEN"
            : error.code === "CLAIM_IN_PROGRESS"
              ? "CONFLICT"
              : "PRECONDITION_FAILED";
    throw new TRPCError({ code, message: error.message, cause: error });
  }
  if (error instanceof AddScoreCandidateError) {
    throw new TRPCError({
      code:
        error.code === "ALREADY_RESOLVED"
          ? "CONFLICT"
          : error.code === "NOT_FOUND" || error.code === "VENUE_NOT_FOUND"
            ? "NOT_FOUND"
            : "BAD_REQUEST",
      message: error.message,
      cause: error,
    });
  }
  if (error instanceof MatchServiceError) {
    throw new TRPCError({
      code:
        error.code === "DATABASE_REQUIRED"
          ? "INTERNAL_SERVER_ERROR"
          : "PRECONDITION_FAILED",
      message: error.message,
      cause: error,
    });
  }
  if (error instanceof IdempotencyConflictError) {
    throw new TRPCError({ code: "CONFLICT", message: error.message });
  }
  if (error instanceof IdempotencyInProgressError) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "We’re already saving this score. Give it a moment.",
    });
  }
  throw error;
}

export const addScorePublicRouter = router({
  /** Save one step of the draft; the first save starts it (newToken). */
  save: publicProcedure
    .input(addScoreSaveInputSchema)
    .output(addScoreSaveResultSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await saveScoreDraft({
          token: input.token,
          step: input.step,
          data: input.data,
          ipAddress: ctx.ipAddress,
          requestId: ctx.requestId,
          now: ctx.now,
        });
      } catch (error) {
        return rethrow(error);
      }
    }),

  /** Resume the draft this browser started. */
  read: publicProcedure
    .input(addScoreTokenInputSchema.partial())
    .output(addScoreReadResultSchema)
    .query(async ({ input, ctx }) => {
      try {
        return await readScoreDraft({
          token: input.token,
          ipAddress: ctx.ipAddress,
          requestId: ctx.requestId,
          now: ctx.now,
        });
      } catch (error) {
        return rethrow(error);
      }
    }),

  /** What this result would do: the rating engine on a copy, never written. */
  preview: publicProcedure
    .input(addScoreTokenInputSchema)
    .output(addScorePreviewResultSchema)
    .query(async ({ input, ctx }) => {
      try {
        return await previewScoreDraft({
          token: input.token,
          ipAddress: ctx.ipAddress,
          requestId: ctx.requestId,
          now: ctx.now,
        });
      } catch (error) {
        return rethrow(error);
      }
    }),

  /** Start over: delete the draft now. */
  discard: publicProcedure
    .input(addScoreTokenInputSchema)
    .output(addScoreDiscardResultSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await discardScoreDraft({
          token: input.token,
          ipAddress: ctx.ipAddress,
          requestId: ctx.requestId,
          now: ctx.now,
        });
      } catch (error) {
        return rethrow(error);
      }
    }),
});

export const addScorePlayerRouter = router({
  /**
   * Save the draft to the signed-in person as one unverified match. The
   * other side confirms through the existing path; then ratings move.
   */
  claim: protectedProcedure
    .use(requireScope("matches:write"))
    .use(
      rateLimitMiddleware({
        id: "add-score-claim",
        capacity: 10,
        refillPerMinute: 5,
      }),
    )
    .input(addScoreClaimInputSchema)
    .output(addScoreClaimResultSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return (
          await executeIdempotent({
            key: input.idempotencyKey,
            procedure: "player.addScore.claim",
            personId: ctx.actor.personId,
            request: input,
            now: ctx.now,
            execute: () =>
              claimScoreDraft({
                actor: ctx.actor,
                claim: input,
                requestId: ctx.requestId,
                ipAddress: ctx.ipAddress,
                now: ctx.now,
              }),
          })
        ).result;
      } catch (error) {
        return rethrow(error);
      }
    }),
});

export const addScoreAdminRouter = router({
  /** Places players named that Duna does not list yet. Never public. */
  candidates: adminProcedure
    .input(addScoreCandidateListInputSchema)
    .output(addScoreCandidateListSchema)
    .query(async ({ input, ctx }) => {
      if (usesDemoData()) {
        return {
          items: addScoreDemo.candidates.filter(
            (candidate) => candidate.status === input.status,
          ),
        };
      }
      return {
        items: await listCandidates({
          status: input.status,
          limit: input.limit,
          now: ctx.now,
        }),
      };
    }),

  /** Promote to a draft venue, merge into a venue, or dismiss. Audited. */
  resolveCandidate: adminProcedure
    .input(addScoreResolveCandidateInputSchema)
    .output(addScoreResolveCandidateResultSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) {
        return {
          candidateId: input.candidateId,
          status:
            input.action === "promote"
              ? ("promoted" as const)
              : input.action === "merge"
                ? ("merged" as const)
                : ("dismissed" as const),
          venueId: input.action === "merge" ? input.venueId : null,
        };
      }
      try {
        const result = await resolveCandidate({
          decision: input,
          reviewerPersonId: ctx.actor.personId,
          now: ctx.now,
        });
        await getDatabase()
          .insert(auditLog)
          .values({
            actorPersonId: ctx.actor.personId,
            actorType: "person",
            action: `venue_candidate.${result.status}`,
            entityType: "venue_candidate",
            entityId: result.candidateId,
            reason: input.note ?? `Candidate ${result.status} by staff review.`,
            traceId: ctx.requestId,
            ipAddress: ctx.ipAddress,
            createdAt: ctx.now,
          });
        return result;
      } catch (error) {
        return rethrow(error);
      }
    }),
});
