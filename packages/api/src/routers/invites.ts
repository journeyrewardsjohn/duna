/**
 * Router seam: invitations by text message (owner: INVITE-SMS). Mounted at
 * `player.invites`. Shapes in ../contracts/invites.ts; services in
 * ../services/invites/. See docs/product/invites.md.
 *
 *   smsPreview  mutation  the exact text per contact and who cannot be texted
 *   sendSms     mutation  preview hash + confirmed + idempotency key
 *   smsStatus   query     the sender's own texts for one subject
 *
 * All three need a signed-in adult (`adultProcedure`): a junior account
 * never sends, and a junior's number is never texted.
 *
 * Demo mode: the preview is computed from fixtures; the send answers "not
 * configured"; the status returns fixtures.
 */
import { invitesDemo } from "@duna/core/demo/invites";
import { TRPCError } from "@trpc/server";
import { adultProcedure, rateLimitMiddleware, router } from "../auth";
import type { ApiContext } from "../context";
import {
  inviteSmsPreviewInputSchema,
  inviteSmsPreviewSchema,
  inviteSmsSendInputSchema,
  inviteSmsSendResultSchema,
  inviteSmsStatusInputSchema,
  inviteSmsStatusSchema,
} from "../contracts/invites";
import { isFeatureEnabled } from "../feature-flag-evaluator";
import {
  IdempotencyConflictError,
  IdempotencyInProgressError,
  executeIdempotent,
} from "../idempotency";
import { providerNotConfigured } from "../observability";
import { usesDemoData } from "../services/data-source";
import {
  InviteSmsError,
  inviteSmsStatus,
  previewInviteSms,
  previewInviteSmsDemo,
  sendInviteSms,
  type InviteSmsSendState,
} from "../services/invites/sms-invites";
import { inviteSmsProvider } from "../services/invites/sms-provider";

const previewLimit = rateLimitMiddleware({
  id: "invites-sms-preview",
  capacity: 30,
  refillPerMinute: 10,
});
const sendLimit = rateLimitMiddleware({
  id: "invites-sms-send",
  capacity: 6,
  refillPerMinute: 2,
});

function toTrpcError(error: unknown): never {
  if (error instanceof InviteSmsError) {
    throw new TRPCError({ code: error.code, message: error.message });
  }
  if (error instanceof IdempotencyConflictError) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This request was already used for a different invitation.",
    });
  }
  if (error instanceof IdempotencyInProgressError) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "These invitations are already being sent.",
    });
  }
  throw error;
}

async function sendState(ctx: ApiContext): Promise<InviteSmsSendState> {
  if (usesDemoData()) return "not-configured";
  if (!(await isFeatureEnabled("invites.sms", { context: ctx }))) {
    return "not-enabled";
  }
  return inviteSmsProvider().isConfigured() ? "ready" : "not-configured";
}

export const invitesPlayerRouter = router({
  /** The exact text each chosen contact would get, and who cannot be texted. */
  smsPreview: adultProcedure
    .use(previewLimit)
    .input(inviteSmsPreviewInputSchema)
    .output(inviteSmsPreviewSchema)
    .mutation(async ({ ctx, input }) => {
      const state = await sendState(ctx);
      if (usesDemoData()) {
        return previewInviteSmsDemo({
          request: input,
          sendState: state,
          now: ctx.now,
        });
      }
      try {
        return await previewInviteSms({
          actor: ctx.actor!,
          request: input,
          sendState: state,
          now: ctx.now,
        });
      } catch (error) {
        return toTrpcError(error);
      }
    }),

  /** Send ONE transactional text per ready recipient of a confirmed preview. */
  sendSms: adultProcedure
    .use(sendLimit)
    .input(inviteSmsSendInputSchema)
    .output(inviteSmsSendResultSchema)
    .mutation(async ({ ctx, input }) => {
      const state = await sendState(ctx);
      if (state === "not-enabled") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Texting invitations is switched off right now.",
        });
      }
      if (state === "not-configured") providerNotConfigured("sms");
      try {
        return (
          await executeIdempotent({
            key: input.idempotencyKey,
            procedure: "invites.sendSms",
            personId: ctx.actor!.personId,
            request: JSON.parse(JSON.stringify(input)),
            now: ctx.now,
            execute: () =>
              sendInviteSms({
                actor: ctx.actor!,
                request: input,
                requestId: ctx.requestId,
                now: ctx.now,
              }),
          })
        ).result;
      } catch (error) {
        return toTrpcError(error);
      }
    }),

  /** The sender's own texts for one subject, newest first. */
  smsStatus: adultProcedure
    .input(inviteSmsStatusInputSchema)
    .output(inviteSmsStatusSchema)
    .query(async ({ ctx, input }) => {
      if (usesDemoData()) return invitesDemo.status;
      try {
        return await inviteSmsStatus({
          actor: ctx.actor!,
          kind: input.inviteKind,
          subjectId: input.subjectId,
        });
      } catch (error) {
        return toTrpcError(error);
      }
    }),
});
