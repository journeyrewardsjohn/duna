/**
 * Contract: concierge (owner: B7). Concierge threads, the Send card
 * (recipients × one channel, confirmed by a person) and per-person delivery.
 * Frozen by W3-0: B7 implements the service behind these shapes; H3 (HQ
 * Inbox), P7 (player web) and the native Concierge build against them and
 * the fixtures in `@duna/core/demo/concierge`. Procedures:
 * `operator.concierge.*`, `player.concierge.*` (docs/plan/w3-contracts.md).
 *
 * A thread is a `messaging_conversations` row. Thread kinds map to the
 * conversation context: lesson → `lesson`, match → `match`, tournament →
 * `event`, league → `league`, club → `organization`; a person's own Duna
 * thread is a `support` conversation with no context.
 */
import {
  conciergeChannels,
  conciergeDeliveryStatuses,
  conciergeDraftedBy,
  conciergeEndpointStatuses,
  conciergeProposalStatuses,
  conciergeUnreachableReasons,
  messagingContextTypeEnum,
} from "@duna/db/schema";
import { z } from "zod";
import {
  w3DateTimeSchema,
  w3IdSchema,
  w3IdempotencyKeySchema,
  w3PageInputSchema,
  w3PageSchema,
  w3PersonRefSchema,
  w3TimeOfDaySchema,
} from "./w3-common";

export const conciergeChannelSchema = z.enum(conciergeChannels);
export const conciergeEndpointStatusSchema = z.enum(conciergeEndpointStatuses);
export const conciergeProposalStatusSchema = z.enum(conciergeProposalStatuses);
export const conciergeDraftedBySchema = z.enum(conciergeDraftedBy);
export const conciergeUnreachableReasonSchema = z.enum(
  conciergeUnreachableReasons,
);
export const conciergeDeliveryStatusSchema = z.enum(conciergeDeliveryStatuses);
export const conciergeContextTypeSchema = z.enum(
  messagingContextTypeEnum.enumValues,
);

/** The thread kinds the Concierge shows (C-Concierge). */
export const conciergeThreadKindSchema = z.enum([
  "lesson",
  "match",
  "tournament",
  "league",
  "club",
  "duna",
]);
export const conciergeThreadFilterSchema = z.enum([
  "all",
  "unread",
  "families",
]);
/** Whether a channel can be used right now (flag `concierge.channel.*` + provider). */
export const conciergeChannelAvailabilitySchema = z.enum([
  "available",
  "not-enabled",
  "provider-not-configured",
]);

export const conciergeThreadContextSchema = z.object({
  type: conciergeContextTypeSchema,
  id: z.string().min(1).max(192),
  label: z.string().min(1),
  /** "Today", "Score posted", "Registered", "Member", "Time changed", "Guardian". */
  status: z.string().max(40).optional(),
  startsAt: w3DateTimeSchema.optional(),
  place: z.string().optional(),
});

export const conciergeThreadSummarySchema = z.object({
  conversationId: w3IdSchema,
  kind: conciergeThreadKindSchema,
  title: z.string().min(1),
  context: conciergeThreadContextSchema.optional(),
  participantCount: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative(),
  /** A minor is in the thread, so guardians are included (Families filter). */
  minorPresent: z.boolean(),
  lastMessagePreview: z.string().max(280).optional(),
  lastMessageAt: w3DateTimeSchema.optional(),
});

export const conciergeThreadsInputSchema = w3PageInputSchema.extend({
  filter: conciergeThreadFilterSchema.default("all"),
  kind: conciergeThreadKindSchema.optional(),
});
export const conciergeThreadsSchema = w3PageSchema(
  conciergeThreadSummarySchema,
).extend({
  counts: z.object({
    all: z.number().int().nonnegative(),
    unread: z.number().int().nonnegative(),
    families: z.number().int().nonnegative(),
  }),
});

export const conciergeMessageKindSchema = z.enum([
  "coach",
  "person",
  "mine",
  "system",
  "duna",
]);
export const conciergeSystemKindSchema = z.enum([
  "schedule",
  "score",
  "results",
  "rating",
]);

export const conciergeMessageSchema = z.object({
  messageId: w3IdSchema,
  sequence: z.number().int().nonnegative(),
  kind: conciergeMessageKindSchema,
  /** Who it is attributed to (coach and club for staff messages). */
  author: w3PersonRefSchema.optional(),
  onBehalfOfOrganization: z.string().optional(),
  body: z.string(),
  systemKind: conciergeSystemKindSchema.optional(),
  /** Structured facts for system messages: { from, to } for schedule, scores … */
  systemDetails: z.record(z.string(), z.unknown()).optional(),
  /** The channel a reply arrived on, or the viewer's own delivery channel. */
  channel: conciergeChannelSchema.optional(),
  /** Aggregate delivery for a sent message ("Read by Jordan", "Sent"). */
  delivery: z
    .object({
      status: conciergeDeliveryStatusSchema,
      readBy: z.array(z.string()).max(10),
      recipientCount: z.number().int().nonnegative(),
    })
    .optional(),
  createdAt: w3DateTimeSchema,
});

export const conciergeThreadInputSchema = z.object({
  conversationId: w3IdSchema,
  beforeSequence: z.number().int().positive().optional(),
});
export const conciergeThreadSchema = conciergeThreadSummarySchema.extend({
  participants: z.array(
    w3PersonRefSchema.extend({
      role: z.enum(["member", "coach", "guardian", "staff"]),
      guardianOf: z.string().optional(),
    }),
  ),
  messages: z.array(conciergeMessageSchema),
});

export const conciergeRecipientSchema = z.object({
  recipientId: w3IdSchema,
  person: w3PersonRefSchema,
  /** Set when this person receives it as the guardian of a minor. */
  guardianOf: w3PersonRefSchema.optional(),
  channel: conciergeChannelSchema.optional(),
  unreachableReason: conciergeUnreachableReasonSchema.optional(),
});

export const conciergeSendProposalSchema = z.object({
  proposalId: w3IdSchema,
  conversationId: w3IdSchema,
  author: w3PersonRefSchema,
  draftedBy: conciergeDraftedBySchema,
  body: z.string().min(1).max(4000),
  /** SHA-256 of body + recipients; confirmSend must echo it. */
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  status: conciergeProposalStatusSchema,
  recipients: z.array(conciergeRecipientSchema),
  recipientCount: z.number().int().nonnegative(),
  unreachableCount: z.number().int().nonnegative(),
  guardianNote: z.string().optional(),
  confirmedBy: w3PersonRefSchema.optional(),
  confirmedAt: w3DateTimeSchema.optional(),
  messageId: w3IdSchema.optional(),
  expiresAt: w3DateTimeSchema.optional(),
  createdAt: w3DateTimeSchema,
});

export const conciergeDraftSendInputSchema = z.object({
  conversationId: w3IdSchema,
  body: z.string().trim().min(1).max(4000),
  /** "duna" when Ask Duna wrote the text the coach is reviewing. */
  draftedBy: conciergeDraftedBySchema.default("person"),
});
export const conciergeSetRecipientChannelInputSchema = z.object({
  proposalId: w3IdSchema,
  recipientId: w3IdSchema,
  channel: conciergeChannelSchema,
});
export const conciergeConfirmSendInputSchema = z.object({
  proposalId: w3IdSchema,
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  idempotencyKey: w3IdempotencyKeySchema,
});
export const conciergeProposalInputSchema = z.object({
  proposalId: w3IdSchema,
});

export const conciergeDeliverySchema = z.object({
  deliveryId: w3IdSchema,
  recipientId: w3IdSchema,
  person: w3PersonRefSchema,
  channel: conciergeChannelSchema,
  status: conciergeDeliveryStatusSchema,
  errorCode: z.string().max(64).optional(),
  attempts: z.number().int().nonnegative(),
  sentAt: w3DateTimeSchema.optional(),
  deliveredAt: w3DateTimeSchema.optional(),
  readAt: w3DateTimeSchema.optional(),
});
export const conciergeDeliveriesSchema = z.object({
  proposalId: w3IdSchema,
  deliveries: z.array(conciergeDeliverySchema),
});

export const conciergeReplyInputSchema = z.object({
  conversationId: w3IdSchema,
  body: z.string().trim().min(1).max(4000),
  idempotencyKey: w3IdempotencyKeySchema,
});

export const conciergeEndpointSchema = z.object({
  endpointId: w3IdSchema,
  channel: conciergeChannelSchema,
  /** Masked for display ("m••••@example.com", "••• 0142"); never the full value. */
  destinationHint: z.string().max(64).optional(),
  status: conciergeEndpointStatusSchema,
  verifiedAt: w3DateTimeSchema.optional(),
});
export const conciergeChannelsSchema = z.object({
  preferredChannel: conciergeChannelSchema,
  quietHours: z
    .object({
      start: w3TimeOfDaySchema,
      end: w3TimeOfDaySchema,
      timezone: z.string().min(1).max(64),
    })
    .optional(),
  availability: z.array(
    z.object({
      channel: conciergeChannelSchema,
      availability: conciergeChannelAvailabilitySchema,
    }),
  ),
  endpoints: z.array(conciergeEndpointSchema),
});
export const conciergeConnectChannelInputSchema = z.discriminatedUnion(
  "channel",
  [
    z.object({ channel: z.literal("email"), destination: z.email() }),
    z.object({
      channel: z.literal("imessage"),
      destination: z.string().regex(/^\+[1-9]\d{6,14}$/),
    }),
    z.object({
      channel: z.literal("whatsapp"),
      destination: z.string().regex(/^\+[1-9]\d{6,14}$/),
    }),
  ],
);
/** Connecting never contacts a provider while the channel is unavailable. */
export const conciergeConnectChannelResultSchema = z.object({
  availability: conciergeChannelAvailabilitySchema,
  endpoint: conciergeEndpointSchema.optional(),
});
export const conciergeVerifyChannelInputSchema = z.object({
  endpointId: w3IdSchema,
  code: z.string().regex(/^\d{6}$/),
});
export const conciergeRevokeChannelInputSchema = z.object({
  endpointId: w3IdSchema,
});
export const conciergeSetPreferenceInputSchema = z.object({
  preferredChannel: conciergeChannelSchema,
  quietHours: z
    .object({
      start: w3TimeOfDaySchema,
      end: w3TimeOfDaySchema,
      timezone: z.string().min(1).max(64),
    })
    .nullable()
    .optional(),
});

export type ConciergeThreadSummary = z.infer<
  typeof conciergeThreadSummarySchema
>;
export type ConciergeThread = z.infer<typeof conciergeThreadSchema>;
export type ConciergeSendProposal = z.infer<typeof conciergeSendProposalSchema>;
export type ConciergeDelivery = z.infer<typeof conciergeDeliverySchema>;
export type ConciergeChannels = z.infer<typeof conciergeChannelsSchema>;
