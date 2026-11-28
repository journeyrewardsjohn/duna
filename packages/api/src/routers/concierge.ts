/**
 * Router seam: concierge (owner: B7). Concierge threads, the Send review and
 * per-person delivery (flags concierge.channel.*). Shapes in
 * ../contracts/concierge.ts; service in ../services/concierge/
 * (docs/product/concierge.md).
 *
 * Mounted once in ../router.ts:
 *   operator.concierge  organizationProcedure: read "messages:read", draft
 *                       "messages:propose", confirm a send "messages:write"
 *                       (rate-limited per club and per sender)
 *   player.concierge    protectedProcedure: the signed-in person's threads
 *                       (and their juniors' as guardian) and channels
 *
 * Demo mode returns fixtures from @duna/core/demo/concierge and never calls
 * a messaging provider. No procedure sends without a person confirming the
 * reviewed content hash (`confirmSend`).
 */
import {
  conciergeDemo,
  conciergeDemoIds,
  conciergeDemoProposals,
} from "@duna/core/demo/concierge";
import { TRPCError } from "@trpc/server";
import {
  organizationProcedure,
  protectedProcedure,
  rateLimitMiddleware,
  router,
} from "../auth";
import {
  conciergeAssignThreadInputSchema,
  conciergeAssignThreadSchema,
  conciergeChannelsSchema,
  conciergeClubMuteInputSchema,
  conciergeClubMuteSchema,
  conciergeConfirmSendInputSchema,
  conciergeConnectChannelInputSchema,
  conciergeConnectChannelResultSchema,
  conciergeDeliveriesSchema,
  conciergeDismissQuarantineInputSchema,
  conciergeDismissQuarantineSchema,
  conciergeDraftSendInputSchema,
  conciergeEditDraftInputSchema,
  conciergeEndpointSchema,
  conciergeHandoffInputSchema,
  conciergeHandoffSchema,
  conciergeMarkReadInputSchema,
  conciergeMarkReadResultSchema,
  conciergeMessageSchema,
  conciergeProposalInputSchema,
  conciergeQuarantineSchema,
  conciergeReplyInputSchema,
  conciergeRevokeChannelInputSchema,
  conciergeSendProposalSchema,
  conciergeSetPreferenceInputSchema,
  conciergeSetRecipientChannelInputSchema,
  conciergeThreadInputSchema,
  conciergeThreadMuteInputSchema,
  conciergeThreadMuteSchema,
  conciergeThreadSchema,
  conciergeThreadsInputSchema,
  conciergeThreadsSchema,
  conciergeVerifyChannelInputSchema,
} from "../contracts/concierge";
import { executeIdempotent } from "../idempotency";
import {
  markConversationRead,
  sendConversationMessage,
} from "../messaging-service";
import {
  assignConciergeThread,
  cancelConciergeSend,
  confirmConciergeSend,
  connectConciergeChannel,
  createConciergeDraftFromHandoff,
  dismissConciergeQuarantine,
  draftConciergeSend,
  editConciergeDraft,
  guardedConcierge,
  listConciergeQuarantine,
  listConciergeThreads,
  loadConciergeChannels,
  loadConciergeDeliveries,
  loadConciergeProposal,
  loadConciergeThread,
  revokeConciergeEndpoint,
  setConciergeClubMute,
  setConciergePreference,
  setConciergeRecipientChannel,
  setConciergeThreadMute,
  verifyConciergeChannel,
} from "../services/concierge";
import { personRef, stableUuid } from "../services/concierge/proposals";
import { loadClubThread } from "../services/concierge/proposals";
import { usesDemoData } from "../services/data-source";

const read = organizationProcedure("messages:read");
const propose = organizationProcedure("messages:propose");
const send = organizationProcedure("messages:write")
  .use(
    rateLimitMiddleware({
      id: "concierge-send",
      capacity: 20,
      refillPerMinute: 10,
      scope: "organization",
    }),
  )
  .use(
    rateLimitMiddleware({
      id: "concierge-send-person",
      capacity: 10,
      refillPerMinute: 5,
    }),
  );
const playerWrite = protectedProcedure.use(
  rateLimitMiddleware({
    id: "concierge-player-write",
    capacity: 30,
    refillPerMinute: 15,
  }),
);
/** Codes cost money and reach a real destination: tighter. */
const playerConnect = protectedProcedure.use(
  rateLimitMiddleware({
    id: "concierge-player-connect",
    capacity: 5,
    refillPerMinute: 1,
  }),
);

function demoThreads(input: {
  filter: "all" | "unread" | "families";
  kind?: string;
  search?: string;
}) {
  const search = input.search?.trim().toLowerCase();
  const items = conciergeDemo.threads.items.filter(
    (thread) =>
      (input.filter === "all" ||
        (input.filter === "unread" && thread.unreadCount > 0) ||
        (input.filter === "families" && thread.minorPresent)) &&
      (!input.kind || thread.kind === input.kind) &&
      (!search || thread.title.toLowerCase().includes(search)),
  );
  return { items, counts: conciergeDemo.threads.counts };
}

function demoThread(conversationId: string) {
  const full = conciergeDemo.threadDetails.find(
    (thread) => thread.conversationId === conversationId,
  );
  if (full) return full;
  const summary = conciergeDemo.threads.items.find(
    (thread) => thread.conversationId === conversationId,
  );
  if (!summary) throw new TRPCError({ code: "NOT_FOUND" });
  return { ...summary, participants: [], messages: [] };
}

function demoProposal(proposalId: string) {
  const proposal = conciergeDemoProposals.find(
    (candidate) => candidate.proposalId === proposalId,
  );
  if (!proposal) throw new TRPCError({ code: "NOT_FOUND" });
  return proposal;
}

function viewerOf(ctx: {
  organizationId: string;
  actor: { personId: string };
}) {
  return {
    kind: "club" as const,
    organizationId: ctx.organizationId,
    personId: ctx.actor.personId,
  };
}

export const conciergeOperatorRouter = router({
  /** The Inbox: threads with All / Unread / Families counts and the staff queue. */
  threads: read
    .input(conciergeThreadsInputSchema)
    .output(conciergeThreadsSchema)
    .query(({ ctx, input }) => {
      if (usesDemoData()) return demoThreads(input);
      return guardedConcierge(() => listConciergeThreads(viewerOf(ctx), input));
    }),

  /** One thread with its participants and messages. */
  thread: read
    .input(conciergeThreadInputSchema)
    .output(conciergeThreadSchema)
    .query(({ ctx, input }) => {
      if (usesDemoData()) return demoThread(input.conversationId);
      return guardedConcierge(() => loadConciergeThread(viewerOf(ctx), input));
    }),

  /** The club has read a thread up to `sequence` (shared by the club's staff). */
  markRead: read
    .input(conciergeMarkReadInputSchema)
    .output(conciergeMarkReadResultSchema)
    .mutation(async ({ ctx, input }) => {
      if (usesDemoData()) return { conversationId: input.conversationId };
      await guardedConcierge(() =>
        markConversationRead({
          actor: ctx.actor,
          asPrincipal: "organization",
          conversationId: input.conversationId,
          sequence: input.sequence,
          now: ctx.now,
        }),
      );
      return { conversationId: input.conversationId };
    }),

  /** The staff queue: assign a thread to a staff member, or clear it. */
  assignThread: propose
    .input(conciergeAssignThreadInputSchema)
    .output(conciergeAssignThreadSchema)
    .mutation(async ({ ctx, input }) => {
      if (usesDemoData()) return input;
      return guardedConcierge(async () => {
        await loadClubThread(ctx.organizationId, input.conversationId);
        await assignConciergeThread({
          organizationId: ctx.organizationId,
          actorPersonId: ctx.actor.personId,
          conversationId: input.conversationId,
          assigneePersonId: input.assigneePersonId,
          now: ctx.now,
        });
        return input;
      });
    }),

  /** Build the Send review: recipients resolved server-side, one channel each. Sends nothing. */
  draftSend: propose
    .input(conciergeDraftSendInputSchema)
    .output(conciergeSendProposalSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) {
        return {
          ...demoProposal(conciergeDemoIds.readyProposal),
          conversationId: input.conversationId,
          body: input.body,
          draftedBy: input.draftedBy,
        };
      }
      return guardedConcierge(() =>
        draftConciergeSend({
          actor: ctx.actor,
          organizationId: ctx.organizationId,
          conversationId: input.conversationId,
          body: input.body,
          draftedBy: input.draftedBy,
          kind: input.kind,
          requestId: ctx.requestId,
          now: ctx.now,
        }),
      );
    }),

  /** Hand-offs ("draft to Inbox", cancellations, notify athletes): one entry point. Sends nothing. */
  drafts: router({
    createFromHandoff: propose
      .input(conciergeHandoffInputSchema)
      .output(conciergeHandoffSchema)
      .mutation(({ ctx, input }) => {
        if (usesDemoData()) {
          const thread =
            conciergeDemo.threads.items.find(
              (candidate) => candidate.context?.id === input.contextId,
            ) ?? conciergeDemo.threads.items[0]!;
          return {
            conversationId: thread.conversationId,
            ...(input.suggestedText
              ? {
                  proposal: {
                    ...demoProposal(conciergeDemoIds.readyProposal),
                    conversationId: thread.conversationId,
                    body: input.suggestedText,
                    draftedBy: input.draftedBy,
                  },
                }
              : {}),
          };
        }
        return guardedConcierge(() =>
          createConciergeDraftFromHandoff({
            actor: ctx.actor,
            organizationId: ctx.organizationId,
            source: input.source,
            contextType: input.contextType,
            contextId: input.contextId,
            label: input.label,
            suggestedText: input.suggestedText,
            draftedBy: input.draftedBy,
            kind: input.kind,
            requestId: ctx.requestId,
            now: ctx.now,
          }),
        );
      }),
  }),

  proposal: read
    .input(conciergeProposalInputSchema)
    .output(conciergeSendProposalSchema)
    .query(({ ctx, input }) => {
      if (usesDemoData()) return demoProposal(input.proposalId);
      return guardedConcierge(() =>
        loadConciergeProposal({
          organizationId: ctx.organizationId,
          proposalId: input.proposalId,
          now: ctx.now,
        }),
      );
    }),

  /** Change the text on a card under review (new content hash). */
  editDraft: propose
    .input(conciergeEditDraftInputSchema)
    .output(conciergeSendProposalSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) {
        return { ...demoProposal(input.proposalId), body: input.body };
      }
      return guardedConcierge(() =>
        editConciergeDraft({
          actor: ctx.actor,
          organizationId: ctx.organizationId,
          proposalId: input.proposalId,
          body: input.body,
          now: ctx.now,
        }),
      );
    }),

  /** Change one recipient's channel on a card under review (new content hash). */
  setRecipientChannel: propose
    .input(conciergeSetRecipientChannelInputSchema)
    .output(conciergeSendProposalSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) {
        const proposal = demoProposal(input.proposalId);
        return {
          ...proposal,
          recipients: proposal.recipients.map((recipient) =>
            recipient.recipientId === input.recipientId
              ? {
                  ...recipient,
                  channel: input.channel,
                  unreachableReason: undefined,
                }
              : recipient,
          ),
        };
      }
      return guardedConcierge(() =>
        setConciergeRecipientChannel({
          actor: ctx.actor,
          organizationId: ctx.organizationId,
          proposalId: input.proposalId,
          recipientId: input.recipientId,
          channel: input.channel,
          now: ctx.now,
        }),
      );
    }),

  /** A person presses Send. Valid only for the card's current content hash. */
  confirmSend: send
    .input(conciergeConfirmSendInputSchema)
    .output(conciergeSendProposalSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) {
        const proposal = demoProposal(input.proposalId);
        if (proposal.contentHash !== input.contentHash) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "The message changed. Review it again.",
          });
        }
        return {
          ...demoProposal(conciergeDemoIds.sentProposal),
          proposalId: input.proposalId,
        };
      }
      return guardedConcierge(async () => {
        const { result } = await executeIdempotent({
          key: input.idempotencyKey,
          procedure: "concierge.confirmSend",
          personId: ctx.actor.personId,
          organizationId: ctx.organizationId,
          request: {
            proposalId: input.proposalId,
            contentHash: input.contentHash,
          },
          now: ctx.now,
          execute: () =>
            confirmConciergeSend({
              actor: ctx.actor,
              organizationId: ctx.organizationId,
              proposalId: input.proposalId,
              contentHash: input.contentHash,
              requestId: ctx.requestId,
              now: ctx.now,
            }),
          hydrateReplay: () =>
            loadConciergeProposal({
              organizationId: ctx.organizationId,
              proposalId: input.proposalId,
              now: ctx.now,
            }),
        });
        return result;
      });
    }),

  cancelSend: propose
    .input(conciergeProposalInputSchema)
    .output(conciergeSendProposalSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) {
        return {
          ...demoProposal(input.proposalId),
          status: "cancelled" as const,
        };
      }
      return guardedConcierge(() =>
        cancelConciergeSend({
          actor: ctx.actor,
          organizationId: ctx.organizationId,
          proposalId: input.proposalId,
          requestId: ctx.requestId,
          now: ctx.now,
        }),
      );
    }),

  /** Per-person delivery for a send (sender and staff with the scope only). */
  deliveries: read
    .input(conciergeProposalInputSchema)
    .output(conciergeDeliveriesSchema)
    .query(({ ctx, input }) => {
      if (usesDemoData()) {
        return { ...conciergeDemo.deliveries, proposalId: input.proposalId };
      }
      return guardedConcierge(() =>
        loadConciergeDeliveries({
          organizationId: ctx.organizationId,
          proposalId: input.proposalId,
        }),
      );
    }),

  /** Replies that could not be routed safely, for the club's staff to review. */
  quarantine: read.output(conciergeQuarantineSchema).query(({ ctx }) => {
    if (usesDemoData()) return { items: [] };
    return guardedConcierge(async () => ({
      items: await listConciergeQuarantine(ctx.organizationId),
    }));
  }),

  dismissQuarantine: propose
    .input(conciergeDismissQuarantineInputSchema)
    .output(conciergeDismissQuarantineSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) return { dismissed: true };
      return guardedConcierge(() =>
        dismissConciergeQuarantine(ctx.organizationId, input.quarantineId),
      );
    }),
});

const person = (ctx: { actor: { personId: string } }) => ({
  kind: "person" as const,
  personId: ctx.actor.personId,
});

export const conciergePlayerRouter = router({
  /** The signed-in person's threads (and their juniors' as guardian). */
  threads: protectedProcedure
    .input(conciergeThreadsInputSchema)
    .output(conciergeThreadsSchema)
    .query(({ ctx, input }) => {
      if (usesDemoData()) return demoThreads(input);
      return guardedConcierge(() =>
        listConciergeThreads(person(ctx), { ...input, queue: "all" }),
      );
    }),

  thread: protectedProcedure
    .input(conciergeThreadInputSchema)
    .output(conciergeThreadSchema)
    .query(({ ctx, input }) => {
      if (usesDemoData()) return demoThread(input.conversationId);
      return guardedConcierge(() => loadConciergeThread(person(ctx), input));
    }),

  markRead: playerWrite
    .input(conciergeMarkReadInputSchema)
    .output(conciergeMarkReadResultSchema)
    .mutation(async ({ ctx, input }) => {
      if (usesDemoData()) return { conversationId: input.conversationId };
      await guardedConcierge(() =>
        markConversationRead({
          actor: ctx.actor,
          asPrincipal: "user",
          conversationId: input.conversationId,
          sequence: input.sequence,
          now: ctx.now,
        }),
      );
      return { conversationId: input.conversationId };
    }),

  /** Mute a thread: it stays in Duna; push and outside channels stop. */
  setThreadMute: playerWrite
    .input(conciergeThreadMuteInputSchema)
    .output(conciergeThreadMuteSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) return input;
      return guardedConcierge(() =>
        setConciergeThreadMute({
          personId: ctx.actor.personId,
          conversationId: input.conversationId,
          muted: input.muted,
          now: ctx.now,
        }),
      );
    }),

  /** Mute a club on outside channels (in-app stays). */
  setClubMute: playerWrite
    .input(conciergeClubMuteInputSchema)
    .output(conciergeClubMuteSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) return input;
      return guardedConcierge(() =>
        setConciergeClubMute({
          personId: ctx.actor.personId,
          organizationId: input.organizationId,
          muted: input.muted,
          now: ctx.now,
        }),
      );
    }),

  /** Reply in a thread (Duna messenger); outside replies arrive by webhook. */
  reply: playerWrite
    .input(conciergeReplyInputSchema)
    .output(conciergeMessageSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) {
        const mine = conciergeDemo.thread.messages.find(
          (m) => m.kind === "mine",
        )!;
        return { ...mine, body: input.body };
      }
      return guardedConcierge(async () => {
        const message = await sendConversationMessage({
          actor: ctx.actor,
          asPrincipal: "user",
          requestId: ctx.requestId,
          now: ctx.now,
          message: {
            conversationId: input.conversationId,
            clientMessageId: stableUuid(
              `concierge-reply:${ctx.actor.personId}:${input.idempotencyKey}`,
            ),
            kind: "text",
            body: input.body,
            widgets: [],
            attachmentUploadIds: [],
          },
        });
        return {
          messageId: message.id,
          sequence: message.seq,
          kind: "mine" as const,
          author: personRef({
            id: ctx.actor.personId,
            displayName: ctx.actor.displayName,
          }),
          body: message.body ?? input.body,
          channel: "duna" as const,
          createdAt: message.createdAt,
        };
      });
    }),

  /** Preferred channels, quiet hours, connected destinations (masked). */
  channels: protectedProcedure
    .output(conciergeChannelsSchema)
    .query(({ ctx }) => {
      if (usesDemoData()) return conciergeDemo.channels;
      return guardedConcierge(() => loadConciergeChannels(ctx.actor));
    }),

  /** Start connecting a channel; never calls a provider when it is unavailable. */
  connectChannel: playerConnect
    .input(conciergeConnectChannelInputSchema)
    .output(conciergeConnectChannelResultSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) {
        const availability = conciergeDemo.channels.availability.find(
          (entry) => entry.channel === input.channel,
        )!.availability;
        return availability === "available"
          ? {
              availability,
              endpoint: conciergeDemo.channels.endpoints.find(
                (endpoint) => endpoint.channel === input.channel,
              ),
            }
          : { availability };
      }
      return guardedConcierge(() =>
        connectConciergeChannel({
          actor: ctx.actor,
          channel: input.channel,
          destination: input.destination,
          now: ctx.now,
        }),
      );
    }),

  verifyChannel: playerWrite
    .input(conciergeVerifyChannelInputSchema)
    .output(conciergeEndpointSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) {
        const endpoint = conciergeDemo.channels.endpoints.find(
          (candidate) => candidate.endpointId === input.endpointId,
        );
        if (!endpoint) throw new TRPCError({ code: "NOT_FOUND" });
        return {
          ...endpoint,
          status: "connected" as const,
          verifiedAt: "2026-11-28T15:10:00.000Z",
        };
      }
      return guardedConcierge(() =>
        verifyConciergeChannel({
          actor: ctx.actor,
          endpointId: input.endpointId,
          code: input.code,
          now: ctx.now,
        }),
      );
    }),

  revokeChannel: playerWrite
    .input(conciergeRevokeChannelInputSchema)
    .output(conciergeEndpointSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) {
        const endpoint = conciergeDemo.channels.endpoints.find(
          (candidate) => candidate.endpointId === input.endpointId,
        );
        if (!endpoint) throw new TRPCError({ code: "NOT_FOUND" });
        return { ...endpoint, status: "revoked" as const };
      }
      return guardedConcierge(() =>
        revokeConciergeEndpoint({
          personId: ctx.actor.personId,
          endpointId: input.endpointId,
          reason: "person",
          now: ctx.now,
        }),
      );
    }),

  /** Exactly one preferred channel (and one for operational notices), plus quiet hours. */
  setPreference: playerWrite
    .input(conciergeSetPreferenceInputSchema)
    .output(conciergeChannelsSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) {
        const quietHours =
          input.quietHours === undefined
            ? conciergeDemo.channels.quietHours
            : input.quietHours;
        return {
          preferredChannel: input.preferredChannel,
          ...(input.operationalChannel
            ? { operationalChannel: input.operationalChannel }
            : {}),
          availability: conciergeDemo.channels.availability,
          endpoints: conciergeDemo.channels.endpoints,
          ...(quietHours ? { quietHours } : {}),
        };
      }
      return guardedConcierge(() =>
        setConciergePreference({
          actor: ctx.actor,
          preferredChannel: input.preferredChannel,
          operationalChannel: input.operationalChannel,
          quietHours: input.quietHours,
          now: ctx.now,
        }),
      );
    }),
});
