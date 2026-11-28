/**
 * Schema: invitations by text message (owner: INVITE-SMS). A signed-in adult
 * texts an invitation to something they host or are booked into
 * (docs/product/invites.md). Additive only.
 *
 * - `invite_sms_messages`: one row per chosen contact per preview. Created by
 *   the preview (status `previewed` or `blocked`), moved by the send
 *   (`sending` → `sent` / `failed` / `not-configured`) and by the provider's
 *   delivery receipts (`delivered`, `failed`). The phone number itself is
 *   NEVER stored here: only `destination_hash` (SHA-256 of the E.164 number
 *   with a fixed domain prefix; pseudonymous, not anonymous) and the last
 *   four digits the sender already typed, so the sender can read the state
 *   of each text. The number lives only where the underlying invitation
 *   already keeps it (court booking participants, match and club
 *   invitations) and in the request that sends it.
 * - `sms_suppressions`: numbers that must never get another invitation text
 *   (STOP, a carrier disconnect, the provider answering "unsubscribed").
 *   Keyed by the same hash. Honoured before every preview and send.
 *
 * Enumerations are varchar plus CHECK, as in the W3 files.
 */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { organizations, people } from "../schema";
import {
  at,
  createdAtColumn,
  nullOrOneOf,
  oneOf,
  updatedAtColumn,
} from "./_columns";

export const inviteSmsKinds = [
  "match",
  "court-booking",
  "session",
  "pickup",
  "club",
] as const;

export const inviteSmsStatuses = [
  "previewed",
  "blocked",
  "sending",
  "sent",
  "delivered",
  "failed",
  "not-configured",
] as const;

export const inviteSmsBlockReasons = [
  "invalid-number",
  "opted-out",
  "junior",
  "rate-limited",
  "already-invited",
  "own-number",
  "not-on-invitation",
] as const;

export const smsSuppressionSources = [
  "stop-keyword",
  "carrier-disconnect",
  "provider-unsubscribed",
  "link",
] as const;

export const inviteSmsMessages = pgTable(
  "invite_sms_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    senderPersonId: uuid("sender_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    inviteKind: varchar("invite_kind", { length: 24 }).notNull(),
    subjectId: uuid("subject_id").notNull(),
    /** SHA-256 of the preview (texts, recipients, blocks); the send must quote it. */
    previewHash: varchar("preview_hash", { length: 64 }).notNull(),
    destinationHash: varchar("destination_hash", { length: 64 }).notNull(),
    destinationLast4: varchar("destination_last4", { length: 4 }).notNull(),
    /** The name the sender typed, shown back to the sender only. */
    recipientName: text("recipient_name").notNull(),
    /** A claim token reserved at preview for an invitation the send creates. */
    claimToken: varchar("claim_token", { length: 96 }),
    /** Which existing invitation the text carries (participant, invitation or share-link id). */
    invitationRef: varchar("invitation_ref", { length: 128 }),
    status: varchar("status", { length: 24 }).notNull().default("previewed"),
    blockReason: varchar("block_reason", { length: 32 }),
    providerMessageId: varchar("provider_message_id", { length: 160 }),
    /** Provider failure code (e.g. `carrier_rejected`), never free text. */
    failureCode: varchar("failure_code", { length: 48 }),
    channel: varchar("channel", { length: 16 }),
    sendIdempotencyKey: varchar("send_idempotency_key", { length: 128 }),
    previewExpiresAt: at("preview_expires_at").notNull(),
    sentAt: at("sent_at"),
    deliveredAt: at("delivered_at"),
    lastEventAt: at("last_event_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("invite_sms_preview_destination_unique").on(
      table.senderPersonId,
      table.previewHash,
      table.destinationHash,
    ),
    uniqueIndex("invite_sms_provider_message_unique")
      .on(table.providerMessageId)
      .where(sql`${table.providerMessageId} IS NOT NULL`),
    index("invite_sms_sender_subject_idx").on(
      table.senderPersonId,
      table.inviteKind,
      table.subjectId,
      table.createdAt,
    ),
    index("invite_sms_sender_sent_idx").on(table.senderPersonId, table.sentAt),
    index("invite_sms_destination_sent_idx").on(
      table.destinationHash,
      table.sentAt,
    ),
    check("invite_sms_kind_valid", oneOf(table.inviteKind, inviteSmsKinds)),
    check("invite_sms_status_valid", oneOf(table.status, inviteSmsStatuses)),
    check(
      "invite_sms_block_reason_valid",
      nullOrOneOf(table.blockReason, inviteSmsBlockReasons),
    ),
    check(
      "invite_sms_destination_hash_format",
      sql`${table.destinationHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "invite_sms_last4_format",
      sql`${table.destinationLast4} ~ '^[0-9]{4}$'`,
    ),
  ],
);

export const smsSuppressions = pgTable(
  "sms_suppressions",
  {
    destinationHash: varchar("destination_hash", { length: 64 }).primaryKey(),
    source: varchar("source", { length: 24 }).notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    check(
      "sms_suppression_source_valid",
      oneOf(table.source, smsSuppressionSources),
    ),
    check(
      "sms_suppression_hash_format",
      sql`${table.destinationHash} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);
