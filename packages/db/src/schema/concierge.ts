/**
 * Schema: concierge (owner: B7). A Concierge thread is a
 * `messaging_conversations` row with a context (lesson, match, event for a
 * tournament, league, organization for the club, duna for a person's own
 * Duna thread); its messages are `conversation_messages`. This file adds the
 * Send proposal (recipients × channel, confirmed by a person), one delivery
 * record per person, and each person's channels with exactly one preferred
 * channel. Written by the W3-0 schema steward; request changes in
 * docs/plan/schema-requests/B7.md.
 */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  time,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  conversationMessages,
  messagingConversations,
  organizations,
  people,
} from "../schema";
import {
  at,
  createdAtColumn,
  nullOrOneOf,
  oneOf,
  updatedAtColumn,
} from "./_columns";

/** The four Concierge channels (C-Web-Reach). One per person. */
export const conciergeChannels = [
  "duna",
  "email",
  "imessage",
  "whatsapp",
] as const;
export const conciergeEndpointStatuses = [
  "pending-verification",
  "connected",
  "revoked",
] as const;
export const conciergeProposalStatuses = [
  "draft",
  "ready",
  "confirmed",
  "sending",
  "sent",
  "partially-failed",
  "cancelled",
  "expired",
] as const;
export const conciergeDraftedBy = ["person", "duna"] as const;
export const conciergeUnreachableReasons = [
  "no-channel",
  "channel-not-enabled",
  "provider-not-configured",
  "no-consent",
  "quiet-hours",
  "blocked",
] as const;
export const conciergeDeliveryStatuses = [
  "queued",
  "sent",
  "delivered",
  "read",
  "failed",
  "not-enabled",
  "provider-not-configured",
  "skipped",
] as const;

/** A destination a person connected for a channel (an address or a number). */
export const personChannelEndpoints = pgTable(
  "person_channel_endpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    channel: varchar("channel", { length: 10 }).notNull(),
    /** Email address or E.164 number; empty for `duna`. Never logged. */
    destination: text("destination"),
    status: varchar("status", { length: 24 })
      .notNull()
      .default("pending-verification"),
    verifiedAt: at("verified_at"),
    revokedAt: at("revoked_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("person_channel_endpoint_active_unique")
      .on(table.personId, table.channel)
      .where(sql`${table.status} <> 'revoked'`),
    check(
      "person_channel_endpoint_channel_valid",
      oneOf(table.channel, conciergeChannels),
    ),
    check(
      "person_channel_endpoint_status_valid",
      oneOf(table.status, conciergeEndpointStatuses),
    ),
    check(
      "person_channel_endpoint_destination_shape",
      sql`${table.channel} = 'duna' OR ${table.destination} IS NOT NULL`,
    ),
    check(
      "person_channel_endpoint_verified_shape",
      sql`${table.status} <> 'connected' OR ${table.verifiedAt} IS NOT NULL`,
    ),
  ],
);

/** Exactly one preferred channel per person, plus quiet hours. */
export const personChannelPreferences = pgTable(
  "person_channel_preferences",
  {
    personId: uuid("person_id")
      .primaryKey()
      .references(() => people.id, { onDelete: "cascade" }),
    preferredChannel: varchar("preferred_channel", { length: 10 })
      .notNull()
      .default("duna"),
    quietHoursStart: time("quiet_hours_start"),
    quietHoursEnd: time("quiet_hours_end"),
    timezone: varchar("timezone", { length: 64 }),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    check(
      "person_channel_preference_channel_valid",
      oneOf(table.preferredChannel, conciergeChannels),
    ),
    check(
      "person_channel_preference_quiet_hours_pair",
      sql`(${table.quietHoursStart} IS NULL) = (${table.quietHoursEnd} IS NULL)`,
    ),
  ],
);

/**
 * The Send card: what will be sent, to whom, on which channel. Nothing is
 * sent until a person confirms; the confirmation is tied to the content hash.
 */
export const conciergeSendProposals = pgTable(
  "concierge_send_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => messagingConversations.id, { onDelete: "cascade" }),
    authorPersonId: uuid("author_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    draftedBy: varchar("drafted_by", { length: 8 }).notNull().default("person"),
    body: text("body").notNull(),
    /** SHA-256 of body + recipients; a confirmation is valid only for this hash. */
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    status: varchar("status", { length: 18 }).notNull().default("draft"),
    recipientCount: integer("recipient_count").notNull().default(0),
    unreachableCount: integer("unreachable_count").notNull().default(0),
    guardianNote: text("guardian_note"),
    confirmedByPersonId: uuid("confirmed_by_person_id").references(
      () => people.id,
      { onDelete: "restrict" },
    ),
    confirmedAt: at("confirmed_at"),
    /** The thread message created when sent. */
    messageId: uuid("message_id").references(() => conversationMessages.id, {
      onDelete: "set null",
    }),
    expiresAt: at("expires_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("concierge_send_proposal_conversation_idx").on(
      table.conversationId,
      table.createdAt,
    ),
    index("concierge_send_proposal_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
    check(
      "concierge_send_proposal_status_valid",
      oneOf(table.status, conciergeProposalStatuses),
    ),
    check(
      "concierge_send_proposal_drafted_by_valid",
      oneOf(table.draftedBy, conciergeDraftedBy),
    ),
    check(
      "concierge_send_proposal_counts_valid",
      sql`${table.recipientCount} >= 0 AND ${table.unreachableCount} BETWEEN 0 AND ${table.recipientCount}`,
    ),
    check(
      "concierge_send_proposal_confirmed_shape",
      sql`${table.status} IN ('draft', 'ready', 'cancelled', 'expired') OR (${table.confirmedByPersonId} IS NOT NULL AND ${table.confirmedAt} IS NOT NULL)`,
    ),
  ],
);

/** One recipient on the Send card, with the one channel chosen for them. */
export const conciergeSendRecipients = pgTable(
  "concierge_send_recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => conciergeSendProposals.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    /** Set when this person receives it as the guardian of a minor in the thread. */
    guardianOfPersonId: uuid("guardian_of_person_id").references(
      () => people.id,
      { onDelete: "cascade" },
    ),
    channel: varchar("channel", { length: 10 }),
    unreachableReason: varchar("unreachable_reason", { length: 24 }),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex("concierge_send_recipient_unique").on(
      table.proposalId,
      table.personId,
    ),
    check(
      "concierge_send_recipient_channel_valid",
      nullOrOneOf(table.channel, conciergeChannels),
    ),
    check(
      "concierge_send_recipient_reason_valid",
      nullOrOneOf(table.unreachableReason, conciergeUnreachableReasons),
    ),
    check(
      "concierge_send_recipient_reachable_shape",
      sql`(${table.channel} IS NULL) = (${table.unreachableReason} IS NOT NULL)`,
    ),
  ],
);

/** What happened to the message for one person on one channel. */
export const conciergeDeliveries = pgTable(
  "concierge_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => conciergeSendProposals.id, { onDelete: "cascade" }),
    recipientId: uuid("recipient_id")
      .notNull()
      .unique()
      .references(() => conciergeSendRecipients.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => conversationMessages.id, {
      onDelete: "set null",
    }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    channel: varchar("channel", { length: 10 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("queued"),
    providerMessageHandle: varchar("provider_message_handle", { length: 192 }),
    errorCode: varchar("error_code", { length: 64 }),
    attempts: integer("attempts").notNull().default(0),
    sentAt: at("sent_at"),
    deliveredAt: at("delivered_at"),
    readAt: at("read_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("concierge_delivery_proposal_idx").on(table.proposalId),
    index("concierge_delivery_person_idx").on(table.personId, table.createdAt),
    uniqueIndex("concierge_delivery_provider_handle_unique")
      .on(table.channel, table.providerMessageHandle)
      .where(sql`${table.providerMessageHandle} IS NOT NULL`),
    check(
      "concierge_delivery_channel_valid",
      oneOf(table.channel, conciergeChannels),
    ),
    check(
      "concierge_delivery_status_valid",
      oneOf(table.status, conciergeDeliveryStatuses),
    ),
    check("concierge_delivery_attempts_valid", sql`${table.attempts} >= 0`),
  ],
);
