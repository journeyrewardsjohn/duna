import { z } from "zod";

export const principalTypeSchema = z.enum(["user", "organization", "agent"]);
export type PrincipalType = z.infer<typeof principalTypeSchema>;

export const messagingPrincipalSchema = z.object({
  type: principalTypeSchema,
  id: z.string().min(1).max(192),
  displayName: z.string().min(1).max(160),
  avatarUrl: z.string().url().optional(),
  isProfessional: z.boolean().optional(),
});
export type MessagingPrincipal = z.infer<typeof messagingPrincipalSchema>;

export const conversationTypeSchema = z.enum([
  "dm",
  "group",
  "event",
  "division",
  "league",
  "broadcast",
  "support",
]);
export type ConversationType = z.infer<typeof conversationTypeSchema>;

export const conversationContextTypeSchema = z.enum([
  "organization",
  "event",
  "division",
  "league",
  "lesson",
  "rental",
  "match",
  "support-case",
]);
export type ConversationContextType = z.infer<
  typeof conversationContextTypeSchema
>;

export const conversationContextSchema = z.object({
  type: conversationContextTypeSchema,
  id: z.string().min(1).max(192),
  label: z.string().min(1).max(160),
  organizationId: z.string().uuid().optional(),
});
export type ConversationContext = z.infer<typeof conversationContextSchema>;

const dunaActionPathSchema = z
  .string()
  .trim()
  .max(500)
  .regex(/^\/(?!\/)/, "Message actions must use an internal Duna path");

export const messageWidgetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("event-update"),
    title: z.string().min(1).max(160),
    detail: z.string().max(1_000),
    startsAt: z.string().datetime().optional(),
    location: z.string().max(240).optional(),
    action: z
      .object({ label: z.string().max(48), href: dunaActionPathSchema })
      .optional(),
  }),
  z.object({
    kind: z.literal("schedule-change"),
    title: z.string().min(1).max(160),
    previousStartsAt: z.string().datetime().optional(),
    startsAt: z.string().datetime(),
    acknowledgementRequired: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal("payment-request"),
    title: z.string().min(1).max(160),
    amountMinor: z.number().int().nonnegative(),
    currency: z
      .string()
      .length(3)
      .regex(/^[A-Z]{3}$/),
    dueAt: z.string().datetime().optional(),
    paymentPath: dunaActionPathSchema,
    status: z.enum(["open", "paid", "expired", "cancelled"]),
  }),
  z.object({
    kind: z.literal("form-request"),
    title: z.string().min(1).max(160),
    description: z.string().max(1_000),
    formPath: dunaActionPathSchema,
    status: z.enum(["open", "submitted", "expired"]),
  }),
  z.object({
    kind: z.literal("score-update"),
    title: z.string().min(1).max(160),
    homeLabel: z.string().max(80),
    awayLabel: z.string().max(80),
    homeScore: z.number().int().nonnegative(),
    awayScore: z.number().int().nonnegative(),
    status: z.enum(["scheduled", "live", "final"]),
    matchPath: dunaActionPathSchema.optional(),
  }),
  z.object({
    kind: z.literal("quick-actions"),
    title: z.string().min(1).max(160).optional(),
    actions: z
      .array(
        z.object({
          id: z.string().min(1).max(64),
          label: z.string().min(1).max(48),
          style: z.enum(["primary", "secondary", "destructive"]),
        }),
      )
      .min(1)
      .max(4),
  }),
]);
export type MessageWidget = z.infer<typeof messageWidgetSchema>;

export const messageKindSchema = z.enum([
  "text",
  "announcement",
  "event-update",
  "schedule-change",
  "payment-request",
  "form-request",
  "score-update",
  "support-response",
  "system",
]);
export type MessageKind = z.infer<typeof messageKindSchema>;

export const messageModerationStateSchema = z.enum([
  "not-required",
  "screening",
  "safe",
  "review",
  "blocked",
]);

export const messageAttachmentKindSchema = z.enum(["image", "video", "file"]);
export type MessageAttachmentKind = z.infer<typeof messageAttachmentKindSchema>;

export const messageAttachmentSchema = z.object({
  id: z.string().uuid(),
  kind: messageAttachmentKindSchema,
  mediaType: z.string().min(1).max(80),
  fileName: z.string().min(1).max(255),
  byteSize: z.number().int().positive(),
  safetyStatus: z.enum(["pending", "safe", "review", "blocked"]),
  downloadUrl: z.string().url().optional(),
});
export type MessageAttachment = z.infer<typeof messageAttachmentSchema>;

export const conversationMessageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  clientMessageId: z.string().uuid(),
  seq: z.number().int().positive(),
  sender: messagingPrincipalSchema,
  kind: messageKindSchema,
  body: z.string().max(10_000).optional(),
  widgets: z.array(messageWidgetSchema).max(8).default([]),
  attachments: z.array(messageAttachmentSchema).max(6).default([]),
  status: z.enum(["screening", "published", "held", "removed"]),
  moderationState: messageModerationStateSchema,
  createdAt: z.string().datetime(),
  editedAt: z.string().datetime().optional(),
  removedAt: z.string().datetime().optional(),
});
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;

export const conversationParticipantSchema = z.object({
  principal: messagingPrincipalSchema,
  role: z.enum(["member", "moderator", "guardian", "agent"]),
  guardianOfPersonId: z.string().uuid().optional(),
  canPost: z.boolean(),
  lastReadSeq: z.number().int().nonnegative(),
  lastDeliveredSeq: z.number().int().nonnegative(),
});
export type ConversationParticipant = z.infer<
  typeof conversationParticipantSchema
>;

export const conversationSummarySchema = z.object({
  id: z.string().uuid(),
  type: conversationTypeSchema,
  title: z.string().min(1).max(160),
  context: conversationContextSchema.optional(),
  participants: z.array(messagingPrincipalSchema).max(8),
  lastMessage: conversationMessageSchema.optional(),
  unreadCount: z.number().int().nonnegative(),
  announcementOnly: z.boolean(),
  muted: z.boolean(),
  safety: z.object({
    minorPresent: z.boolean(),
    guardianPresent: z.boolean(),
    screeningRequired: z.boolean(),
  }),
  updatedAt: z.string().datetime(),
});
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

export const conversationDetailSchema = z.object({
  conversation: conversationSummarySchema,
  participants: z.array(conversationParticipantSchema),
  messages: z.array(conversationMessageSchema),
  permissions: z.object({
    canPost: z.boolean(),
    canAddParticipants: z.boolean(),
    canManageConversation: z.boolean(),
    canBlock: z.boolean(),
    reason: z.string().optional(),
  }),
});
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

export const inboxSchema = z.object({
  principal: messagingPrincipalSchema,
  conversations: z.array(conversationSummarySchema),
  totalUnread: z.number().int().nonnegative(),
  syncedAt: z.string().datetime(),
});
export type MessagingInbox = z.infer<typeof inboxSchema>;

export const messagingComposeOptionsSchema = z.object({
  candidates: z.array(
    z.object({
      principal: messagingPrincipalSchema.extend({ type: z.literal("user") }),
      isMinor: z.boolean(),
    }),
  ),
  canBroadcastFollowers: z.boolean(),
  followerCount: z.number().int().nonnegative(),
});
export type MessagingComposeOptions = z.infer<
  typeof messagingComposeOptionsSchema
>;

export const sendMessageInputSchema = z
  .object({
    conversationId: z.string().uuid(),
    clientMessageId: z.string().uuid(),
    kind: messageKindSchema.default("text"),
    body: z.string().trim().max(10_000).optional(),
    widgets: z.array(messageWidgetSchema).max(8).default([]),
    attachmentUploadIds: z.array(z.string().uuid()).max(6).default([]),
  })
  .refine(
    (value) =>
      Boolean(value.body) ||
      value.widgets.length > 0 ||
      value.attachmentUploadIds.length > 0,
    {
      message: "A message needs text, an attachment, or an interactive card.",
    },
  );
export type SendMessageInput = z.infer<typeof sendMessageInputSchema>;

export const beginMessageAttachmentUploadInputSchema = z.object({
  conversationId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(255),
  mediaType: z.string().trim().min(1).max(80),
  byteSize: z
    .number()
    .int()
    .positive()
    .max(1024 * 1024 * 1024),
});
export type BeginMessageAttachmentUploadInput = z.infer<
  typeof beginMessageAttachmentUploadInputSchema
>;

export const messageAttachmentUploadSessionSchema = z.object({
  id: z.string().uuid(),
  partSizeBytes: z.number().int().positive(),
  totalParts: z.number().int().positive().max(10_000),
  expiresAt: z.string().datetime(),
});
export type MessageAttachmentUploadSession = z.infer<
  typeof messageAttachmentUploadSessionSchema
>;

export const messageAttachmentUploadPartSchema = z.object({
  url: z.string().url(),
  expiresAt: z.string().datetime(),
});
export type MessageAttachmentUploadPart = z.infer<
  typeof messageAttachmentUploadPartSchema
>;

export const completeMessageAttachmentUploadInputSchema = z.object({
  uploadId: z.string().uuid(),
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().positive().max(10_000),
        etag: z.string().trim().min(1).max(512),
      }),
    )
    .min(1)
    .max(10_000),
});
export type CompleteMessageAttachmentUploadInput = z.infer<
  typeof completeMessageAttachmentUploadInputSchema
>;

export const messageAttachmentUploadResultSchema = z.object({
  id: z.string().uuid(),
  status: z.literal("uploaded"),
});
export type MessageAttachmentUploadResult = z.infer<
  typeof messageAttachmentUploadResultSchema
>;

export const messageActionInputSchema = z.object({
  messageId: z.string().uuid(),
  actionId: z.string().min(1).max(64),
  actionType: z.enum(["acknowledge", "quick-action"]),
});
export type MessageActionInput = z.infer<typeof messageActionInputSchema>;

export const createConversationInputSchema = z.object({
  type: conversationTypeSchema,
  title: z.string().trim().min(1).max(160),
  recipientPersonIds: z.array(z.string().uuid()).max(2_000).default([]),
  context: conversationContextSchema.optional(),
  announcementOnly: z.boolean().default(false),
  followerBroadcast: z.boolean().default(false),
  initialMessage: z.string().trim().min(1).max(10_000).optional(),
  clientMessageId: z.string().uuid().optional(),
});
export type CreateConversationInput = z.infer<
  typeof createConversationInputSchema
>;

export const moderationCaseSchema = z.object({
  id: z.string().uuid(),
  messageId: z.string().uuid(),
  conversationId: z.string().uuid(),
  conversationTitle: z.string(),
  status: z.enum(["open", "reviewing", "cleared", "restricted", "escalated"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  categories: z.array(z.string()),
  explanation: z.string(),
  messagePreview: z.string().max(2_000).optional(),
  attachments: z.array(messageAttachmentSchema).max(6).default([]),
  minorPresent: z.boolean(),
  createdAt: z.string().datetime(),
});
export type MessagingModerationCase = z.infer<typeof moderationCaseSchema>;

export const messagingActionResultSchema = z.object({
  ok: z.literal(true),
  id: z.string(),
  message: z.string(),
});
export type MessagingActionResult = z.infer<typeof messagingActionResultSchema>;

export const messagingPushDeviceInputSchema = z.object({
  expoPushToken: z
    .string()
    .trim()
    .regex(/^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/),
  app: z.enum(["player", "pro"]),
  platform: z.enum(["ios", "android"]),
});
export type MessagingPushDeviceInput = z.infer<
  typeof messagingPushDeviceInputSchema
>;

export const dunaSupportResultSchema = z.object({
  request: conversationMessageSchema,
  response: conversationMessageSchema.optional(),
  handoff: z.boolean(),
  pendingSafetyReview: z.boolean(),
});
export type DunaSupportResult = z.infer<typeof dunaSupportResultSchema>;

export const supportQueueItemSchema = z.object({
  conversationId: z.string().uuid(),
  title: z.string(),
  member: messagingPrincipalSchema,
  messages: z.array(conversationMessageSchema),
  updatedAt: z.string().datetime(),
  aiStatus: z.enum(["not-started", "completed", "handoff", "failed"]),
  handoffReason: z.string().optional(),
});
export const supportQueueSchema = z.array(supportQueueItemSchema);
export type SupportQueueItem = z.infer<typeof supportQueueItemSchema>;
