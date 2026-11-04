import {
  beginMessageAttachmentUploadInputSchema,
  completeMessageAttachmentUploadInputSchema,
  conversationDetailSchema,
  conversationMessageSchema,
  createConversationInputSchema,
  dunaSupportResultSchema,
  inboxSchema,
  messageActionInputSchema,
  messageAttachmentUploadPartSchema,
  messageAttachmentUploadResultSchema,
  messageAttachmentUploadSessionSchema,
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
  abortMessageAttachmentUpload,
  beginMessageAttachmentUpload,
  completeMessageAttachmentUpload,
  createMessagingConversation,
  appendAgentConversationMessage,
  loadDunaSupportQueue,
  loadConversation,
  loadMessagingInbox,
  loadMessagingComposeOptions,
  loadMessagingModerationQueue,
  markConversationRead,
  MessagingError,
  presignMessageAttachmentPart,
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

import {
  beginMessagingChannelLink,
  loadMessagingChannelStatus,
  revokeMessagingChannelLinks,
} from "./messaging-channel-link";
import {
  dispatchPhoneReply,
  enqueuePhoneReply,
  loadPhoneReplyOptions,
} from "./sendblue-outbox";
import {
  clubContactInput,
  createClubServiceConversation,
  loadClubContact,
} from "./club-service-contact";
import { resolveClubDestination } from "./club-conversation-routing";

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

const messagingUploadProcedure = protectedProcedure.use(
  rateLimitMiddleware({
    id: "messaging-upload-parts",
    capacity: 600,
    refillPerMinute: 300,
  }),
);

export const messagingRouter = router({
  phoneReplyOptions: messagingReadProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      try {
        return await loadPhoneReplyOptions(ctx.actor!, input.conversationId);
      } catch (error) {
        return messagingFailure(error);
      }
    }),
  sendPhoneReply: messagingWriteProcedure
    .input(
      z.object({
        bindingId: z.string().uuid(),
        message: sendMessageInputSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const options = await loadPhoneReplyOptions(
          ctx.actor!,
          input.message.conversationId,
        );
        if (
          !options.options.some((option) => option.id === input.bindingId) ||
          input.message.widgets.length ||
          input.message.attachmentUploadIds.length ||
          input.message.kind !== "text"
        )
          throw new MessagingError(
            "BAD_REQUEST",
            "Choose an available phone destination and send plain text only.",
          );
        const message = await sendConversationMessage({
          actor: ctx.actor!,
          asPrincipal: "organization",
          message: input.message,
          requestId: ctx.requestId,
          now: ctx.now,
        });
        const queued = await enqueuePhoneReply(
          ctx.actor!,
          input.message.conversationId,
          message.id,
          input.bindingId,
        );
        const status = await dispatchPhoneReply(queued.id);
        return { id: message.id, status };
      } catch (error) {
        return messagingFailure(error);
      }
    }),
  channelStatus: messagingReadProcedure.query(async ({ ctx }) => {
    try {
      return await loadMessagingChannelStatus(ctx.actor!);
    } catch (error) {
      return messagingFailure(error);
    }
  }),
  beginChannelLink: messagingWriteProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await beginMessagingChannelLink(
          ctx.actor!,
          input.conversationId,
          ctx.now,
        );
      } catch (error) {
        return messagingFailure(error);
      }
    }),
  revokeChannelLinks: messagingWriteProcedure.mutation(async ({ ctx }) => {
    try {
      return await revokeMessagingChannelLinks(ctx.actor!);
    } catch (error) {
      return messagingFailure(error);
    }
  }),
  resolveClub: messagingReadProcedure
    .input(
      z.object({
        conversationId: z.string().uuid().optional(),
        selectedOrganizationId: z.string().uuid().optional(),
        message: z.string().max(4000).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        const inbox = await loadMessagingInbox({
          actor: ctx.actor!,
          asPrincipal: "user",
          now: ctx.now,
        });
        const destinations = new Map<
          string,
          { organizationId: string; label: string; conversationIds: string[] }
        >();
        for (const conversation of inbox.conversations) {
          const organization = conversation.participants.find(
            (participant) => participant.type === "organization",
          );
          const organizationId =
            conversation.context?.organizationId ?? organization?.id;
          if (
            !organizationId ||
            !organization ||
            organization.id !== organizationId
          )
            continue;
          const existing = destinations.get(organizationId);
          if (existing) existing.conversationIds.push(conversation.id);
          else
            destinations.set(organizationId, {
              organizationId,
              label: organization.displayName,
              conversationIds: [conversation.id],
            });
        }
        return resolveClubDestination({
          ...input,
          destinations: [...destinations.values()],
        });
      } catch (error) {
        return messagingFailure(error);
      }
    }),
  clubContact: messagingReadProcedure
    .input(z.object({ club: z.string().trim().min(1).max(64) }))
    .query(async ({ input }) => {
      try {
        return await loadClubContact(input.club);
      } catch (error) {
        return messagingFailure(error);
      }
    }),
  contactClub: messagingWriteProcedure
    .input(clubContactInput)
    .output(messagingActionResultSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await createClubServiceConversation({
          ...input,
          actor: ctx.actor!,
          requestId: ctx.requestId,
          now: ctx.now,
        });
      } catch (error) {
        return messagingFailure(error);
      }
    }),
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
  beginAttachmentUpload: messagingWriteProcedure
    .input(
      z.object({
        asPrincipal: principalModeSchema,
        attachment: beginMessageAttachmentUploadInputSchema,
      }),
    )
    .output(messageAttachmentUploadSessionSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await beginMessageAttachmentUpload({
          actor: ctx.actor!,
          asPrincipal: input.asPrincipal,
          attachment: input.attachment,
          now: ctx.now,
        });
      } catch (error) {
        return messagingFailure(error);
      }
    }),
  attachmentPartUrl: messagingUploadProcedure
    .input(
      z.object({
        uploadId: z.string().uuid(),
        partNumber: z.number().int().positive().max(10_000),
      }),
    )
    .output(messageAttachmentUploadPartSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await presignMessageAttachmentPart({
          actor: ctx.actor!,
          ...input,
          now: ctx.now,
        });
      } catch (error) {
        return messagingFailure(error);
      }
    }),
  completeAttachmentUpload: messagingWriteProcedure
    .input(completeMessageAttachmentUploadInputSchema)
    .output(messageAttachmentUploadResultSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await completeMessageAttachmentUpload({
          actor: ctx.actor!,
          completion: input,
          now: ctx.now,
        });
      } catch (error) {
        return messagingFailure(error);
      }
    }),
  abortAttachmentUpload: messagingWriteProcedure
    .input(z.object({ uploadId: z.string().uuid() }))
    .output(messagingActionResultSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await abortMessageAttachmentUpload({
          actor: ctx.actor!,
          uploadId: input.uploadId,
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
