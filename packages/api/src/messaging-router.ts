import {
  conversationDetailSchema,
  conversationMessageSchema,
  createConversationInputSchema,
  dunaSupportResultSchema,
  inboxSchema,
  messageActionInputSchema,
  messagingComposeOptionsSchema,
  messagingActionResultSchema,
  messagingPushDeviceInputSchema,
  moderationCaseSchema,
  sendMessageInputSchema,
  supportQueueSchema,
} from "@duna/messaging-client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  protectedProcedure,
  rateLimitMiddleware,
  router,
  superAdminProcedure,
} from "./auth";
import {
  createMessagingConversation,
  appendAgentConversationMessage,
  loadDunaSupportQueue,
  loadConversation,
  loadMessagingInbox,
  loadMessagingComposeOptions,
  loadMessagingModerationQueue,
  markConversationRead,
  MessagingError,
  recordConversationMessageAction,
  reportConversationMessage,
  reviewMessagingModerationCase,
  sendConversationMessage,
  setMessagingBlock,
} from "./messaging-service";
import { askDunaSupport } from "./duna-ai-support";
import {
  registerMessagingPushDevice,
  unregisterMessagingPushDevice,
} from "./messaging-notifications";

const principalModeSchema = z.enum(["user", "organization"]).default("user");

function messagingFailure(error: unknown): never {
  if (error instanceof MessagingError) {
    throw new TRPCError({
      code: error.code,
      message: error.message,
    });
  }
  throw error;
}

const messagingReadProcedure = protectedProcedure.use(
  rateLimitMiddleware({
    id: "messaging-read",
    capacity: 600,
    refillPerMinute: 600,
  }),
);

const messagingWriteProcedure = protectedProcedure.use(
  rateLimitMiddleware({
    id: "messaging-write",
    capacity: 90,
    refillPerMinute: 60,
  }),
);

export const messagingRouter = router({
  composeOptions: messagingReadProcedure
    .output(messagingComposeOptionsSchema)
    .query(async ({ ctx }) => {
      try {
        return await loadMessagingComposeOptions({ actor: ctx.actor! });
      } catch (error) {
        return messagingFailure(error);
      }
    }),
  inbox: messagingReadProcedure
    .input(
      z
        .object({ asPrincipal: principalModeSchema })
        .default({ asPrincipal: "user" }),
    )
    .output(inboxSchema)
    .query(async ({ input, ctx }) => {
      try {
        return await loadMessagingInbox({
          actor: ctx.actor!,
          asPrincipal: input.asPrincipal,
          now: ctx.now,
        });
      } catch (error) {
        return messagingFailure(error);
      }
    }),
  conversation: messagingReadProcedure
    .input(
      z.object({
        conversationId: z.string().uuid(),
        asPrincipal: principalModeSchema,
        beforeSequence: z.number().int().positive().optional(),
      }),
    )
    .output(conversationDetailSchema)
    .query(async ({ input, ctx }) => {
      try {
        return await loadConversation({
          actor: ctx.actor!,
          conversationId: input.conversationId,
          asPrincipal: input.asPrincipal,
          beforeSequence: input.beforeSequence,
        });
      } catch (error) {
        return messagingFailure(error);
      }
    }),
  create: messagingWriteProcedure
    .input(
      z.object({
        asPrincipal: principalModeSchema,
        conversation: createConversationInputSchema,
      }),
    )
    .output(messagingActionResultSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await createMessagingConversation({
          actor: ctx.actor!,
          asPrincipal: input.asPrincipal,
          conversation: input.conversation,
          now: ctx.now,
          requestId: ctx.requestId,
        });
      } catch (error) {
        return messagingFailure(error);
      }
    }),
  send: messagingWriteProcedure
    .input(
      z.object({
        asPrincipal: principalModeSchema,
        message: sendMessageInputSchema,
      }),
    )
    .output(conversationMessageSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await sendConversationMessage({
          actor: ctx.actor!,
          asPrincipal: input.asPrincipal,
          message: input.message,
          requestId: ctx.requestId,
          now: ctx.now,
        });
      } catch (error) {
        return messagingFailure(error);
      }
    }),
  markRead: messagingWriteProcedure
    .input(
      z.object({
        conversationId: z.string().uuid(),
        sequence: z.number().int().nonnegative(),
        asPrincipal: principalModeSchema,
      }),
    )
    .output(messagingActionResultSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await markConversationRead({
          actor: ctx.actor!,
          conversationId: input.conversationId,
          sequence: input.sequence,
          asPrincipal: input.asPrincipal,
          now: ctx.now,
        });
      } catch (error) {
        return messagingFailure(error);
      }
    }),
  registerPushDevice: messagingWriteProcedure
    .input(messagingPushDeviceInputSchema)
    .output(messagingActionResultSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await registerMessagingPushDevice({
          actor: ctx.actor!,
          device: input,
          now: ctx.now,
        });
      } catch (error) {
        return messagingFailure(error);
      }
    }),
  unregisterPushDevice: messagingWriteProcedure
    .input(messagingPushDeviceInputSchema.pick({ expoPushToken: true }))
    .output(messagingActionResultSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await unregisterMessagingPushDevice({
          actor: ctx.actor!,
          expoPushToken: input.expoPushToken,
          now: ctx.now,
        });
      } catch (error) {
        return messagingFailure(error);
      }
    }),
  act: messagingWriteProcedure
    .input(messageActionInputSchema)
    .output(messagingActionResultSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await recordConversationMessageAction({
          actor: ctx.actor!,
          action: input,
          requestId: ctx.requestId,
          now: ctx.now,
        });
      } catch (error) {
        return messagingFailure(error);
      }
    }),
  block: messagingWriteProcedure
    .input(
      z.object({
        blockedPrincipalType: z.enum(["user", "organization"]),
        blockedPrincipalId: z.string().min(1).max(192),
        blocked: z.boolean(),
        reason: z.string().trim().min(3).max(500).optional(),
      }),
    )
    .output(messagingActionResultSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await setMessagingBlock({
          actor: ctx.actor!,
          ...input,
          requestId: ctx.requestId,
          now: ctx.now,
        });
      } catch (error) {
        return messagingFailure(error);
      }
    }),
  report: messagingWriteProcedure
    .input(
      z.object({
        messageId: z.string().uuid(),
        category: z.enum([
          "harassment",
          "unsafe-contact",
          "spam",
          "impersonation",
          "other",
        ]),
        details: z.string().trim().min(10).max(2_000),
      }),
    )
    .output(messagingActionResultSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await reportConversationMessage({
          actor: ctx.actor!,
          ...input,
          requestId: ctx.requestId,
          now: ctx.now,
        });
      } catch (error) {
        return messagingFailure(error);
      }
    }),
  askDuna: messagingWriteProcedure
    .input(
      z.object({
        conversationId: z.string().uuid(),
        question: z.string().trim().min(1).max(10_000),
        clientMessageId: z.string().uuid(),
        responseClientMessageId: z.string().uuid(),
      }),
    )
    .output(dunaSupportResultSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await askDunaSupport({
          actor: ctx.actor!,
          ...input,
          requestId: ctx.requestId,
          now: ctx.now,
        });
      } catch (error) {
        return messagingFailure(error);
      }
    }),
  supportQueue: superAdminProcedure
    .output(supportQueueSchema)
    .query(async ({ ctx }) => {
      try {
        return await loadDunaSupportQueue({ actor: ctx.actor! });
      } catch (error) {
        return messagingFailure(error);
      }
    }),
  supportReply: superAdminProcedure
    .input(
      z.object({
        conversationId: z.string().uuid(),
        body: z.string().trim().min(1).max(10_000),
        clientMessageId: z.string().uuid(),
      }),
    )
    .output(conversationMessageSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await appendAgentConversationMessage({
          ...input,
          supportActorPersonId: ctx.actor!.personId,
          requestId: ctx.requestId,
          now: ctx.now,
        });
      } catch (error) {
        return messagingFailure(error);
      }
    }),
  moderationQueue: superAdminProcedure
    .output(z.array(moderationCaseSchema))
    .query(async ({ ctx }) => {
      try {
        return await loadMessagingModerationQueue({ actor: ctx.actor! });
      } catch (error) {
        return messagingFailure(error);
      }
    }),
  reviewModeration: superAdminProcedure
    .input(
      z.object({
        caseId: z.string().uuid(),
        decision: z.enum(["cleared", "restricted", "escalated"]),
        note: z.string().trim().min(10).max(2_000),
      }),
    )
    .output(messagingActionResultSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await reviewMessagingModerationCase({
          actor: ctx.actor!,
          ...input,
          requestId: ctx.requestId,
          now: ctx.now,
        });
      } catch (error) {
        return messagingFailure(error);
      }
    }),
});
