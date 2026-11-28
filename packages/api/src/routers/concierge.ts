/**
 * Router seam: concierge (owner: B7). Concierge threads, the Send card and
 * per-person delivery (flags concierge.channel.*). Shapes are frozen in
 * ../contracts/concierge.ts (W3-0).
 *
 * Mounted once in ../router.ts:
 *   operator.concierge  organizationProcedure: read "messages:read", draft
 *                       "messages:propose", confirm a send "messages:write"
 *   player.concierge    protectedProcedure: the signed-in person's threads
 *                       and channels
 *
 * Every procedure returns its fixture from @duna/core/demo/concierge in demo
 * mode and throws `notImplementedYet` otherwise until B7 lands the service
 * in ../services/concierge/. Nothing here ever calls a messaging provider;
 * in demo mode a send never leaves the process. Read ./README.md first.
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
  conciergeChannelsSchema,
  conciergeConfirmSendInputSchema,
  conciergeConnectChannelInputSchema,
  conciergeConnectChannelResultSchema,
  conciergeDeliveriesSchema,
  conciergeDraftSendInputSchema,
  conciergeEndpointSchema,
  conciergeMessageSchema,
  conciergeProposalInputSchema,
  conciergeReplyInputSchema,
  conciergeRevokeChannelInputSchema,
  conciergeSendProposalSchema,
  conciergeSetPreferenceInputSchema,
  conciergeSetRecipientChannelInputSchema,
  conciergeThreadInputSchema,
  conciergeThreadSchema,
  conciergeThreadsInputSchema,
  conciergeThreadsSchema,
  conciergeVerifyChannelInputSchema,
} from "../contracts/concierge";
import { usesDemoData } from "../services/data-source";
import { notImplementedYet } from "./not-implemented";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "concierge";
const read = organizationProcedure("messages:read");
const propose = organizationProcedure("messages:propose");
const send = organizationProcedure("messages:write").use(
  rateLimitMiddleware({
    id: "concierge-send",
    capacity: 20,
    refillPerMinute: 10,
    scope: "organization",
  }),
);
const playerWrite = protectedProcedure.use(
  rateLimitMiddleware({
    id: "concierge-player-write",
    capacity: 30,
    refillPerMinute: 15,
  }),
);

function demoThreads(input: {
  filter: "all" | "unread" | "families";
  kind?: string;
}) {
  const items = conciergeDemo.threads.items.filter(
    (thread) =>
      (input.filter === "all" ||
        (input.filter === "unread" && thread.unreadCount > 0) ||
        (input.filter === "families" && thread.minorPresent)) &&
      (!input.kind || thread.kind === input.kind),
  );
  return { items, counts: conciergeDemo.threads.counts };
}

function demoThread(conversationId: string) {
  if (conversationId === conciergeDemo.thread.conversationId) {
    return conciergeDemo.thread;
  }
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

export const conciergeOperatorRouter = router({
  status: read
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** The Inbox (W-Inbox): threads with All / Unread / Families counts. */
  threads: read
    .input(conciergeThreadsInputSchema)
    .output(conciergeThreadsSchema)
    .query(({ input }) => {
      if (usesDemoData()) return demoThreads(input);
      return notImplementedYet(DOMAIN, "threads");
    }),

  /** One thread with its participants and messages. */
  thread: read
    .input(conciergeThreadInputSchema)
    .output(conciergeThreadSchema)
    .query(({ input }) => {
      if (usesDemoData()) return demoThread(input.conversationId);
      return notImplementedYet(DOMAIN, "thread");
    }),

  /** Build the Send card: recipients resolved server-side, one channel each. */
  draftSend: propose
    .input(conciergeDraftSendInputSchema)
    .output(conciergeSendProposalSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        return {
          ...demoProposal(conciergeDemoIds.readyProposal),
          conversationId: input.conversationId,
          body: input.body,
          draftedBy: input.draftedBy,
        };
      }
      return notImplementedYet(DOMAIN, "draftSend");
    }),

  proposal: read
    .input(conciergeProposalInputSchema)
    .output(conciergeSendProposalSchema)
    .query(({ input }) => {
      if (usesDemoData()) return demoProposal(input.proposalId);
      return notImplementedYet(DOMAIN, "proposal");
    }),

  /** Change one recipient's channel on a draft or ready card (new content hash). */
  setRecipientChannel: propose
    .input(conciergeSetRecipientChannelInputSchema)
    .output(conciergeSendProposalSchema)
    .mutation(({ input }) => {
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
      return notImplementedYet(DOMAIN, "setRecipientChannel");
    }),

  /** A person presses Send. Valid only for the card's current content hash. */
  confirmSend: send
    .input(conciergeConfirmSendInputSchema)
    .output(conciergeSendProposalSchema)
    .mutation(({ input }) => {
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
      return notImplementedYet(DOMAIN, "confirmSend");
    }),

  cancelSend: propose
    .input(conciergeProposalInputSchema)
    .output(conciergeSendProposalSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        return {
          ...demoProposal(input.proposalId),
          status: "cancelled" as const,
        };
      }
      return notImplementedYet(DOMAIN, "cancelSend");
    }),

  /** Per-person delivery for a sent card. */
  deliveries: read
    .input(conciergeProposalInputSchema)
    .output(conciergeDeliveriesSchema)
    .query(({ input }) => {
      if (usesDemoData()) {
        return { ...conciergeDemo.deliveries, proposalId: input.proposalId };
      }
      return notImplementedYet(DOMAIN, "deliveries");
    }),
});

export const conciergePlayerRouter = router({
  status: protectedProcedure
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** The signed-in person's threads (and their juniors' as guardian). */
  threads: protectedProcedure
    .input(conciergeThreadsInputSchema)
    .output(conciergeThreadsSchema)
    .query(({ input }) => {
      if (usesDemoData()) return demoThreads(input);
      return notImplementedYet(DOMAIN, "threads");
    }),

  thread: protectedProcedure
    .input(conciergeThreadInputSchema)
    .output(conciergeThreadSchema)
    .query(({ input }) => {
      if (usesDemoData()) return demoThread(input.conversationId);
      return notImplementedYet(DOMAIN, "thread");
    }),

  /** Reply in a thread (Duna messenger); external replies arrive by webhook. */
  reply: playerWrite
    .input(conciergeReplyInputSchema)
    .output(conciergeMessageSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        const mine = conciergeDemo.thread.messages.find(
          (m) => m.kind === "mine",
        )!;
        return { ...mine, body: input.body };
      }
      return notImplementedYet(DOMAIN, "reply");
    }),

  /** C-Web-Reach: preferred channel, quiet hours, connected destinations. */
  channels: protectedProcedure.output(conciergeChannelsSchema).query(() => {
    if (usesDemoData()) return conciergeDemo.channels;
    return notImplementedYet(DOMAIN, "channels");
  }),

  /** Start connecting a channel; returns availability and never calls a provider when unavailable. */
  connectChannel: playerWrite
    .input(conciergeConnectChannelInputSchema)
    .output(conciergeConnectChannelResultSchema)
    .mutation(({ input }) => {
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
      return notImplementedYet(DOMAIN, "connectChannel");
    }),

  verifyChannel: playerWrite
    .input(conciergeVerifyChannelInputSchema)
    .output(conciergeEndpointSchema)
    .mutation(({ input }) => {
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
      return notImplementedYet(DOMAIN, "verifyChannel");
    }),

  revokeChannel: playerWrite
    .input(conciergeRevokeChannelInputSchema)
    .output(conciergeEndpointSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        const endpoint = conciergeDemo.channels.endpoints.find(
          (candidate) => candidate.endpointId === input.endpointId,
        );
        if (!endpoint) throw new TRPCError({ code: "NOT_FOUND" });
        return { ...endpoint, status: "revoked" as const };
      }
      return notImplementedYet(DOMAIN, "revokeChannel");
    }),

  /** Exactly one preferred channel, plus optional quiet hours. */
  setPreference: playerWrite
    .input(conciergeSetPreferenceInputSchema)
    .output(conciergeChannelsSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        const quietHours =
          input.quietHours === undefined
            ? conciergeDemo.channels.quietHours
            : input.quietHours;
        return {
          preferredChannel: input.preferredChannel,
          availability: conciergeDemo.channels.availability,
          endpoints: conciergeDemo.channels.endpoints,
          ...(quietHours ? { quietHours } : {}),
        };
      }
      return notImplementedYet(DOMAIN, "setPreference");
    }),
});
