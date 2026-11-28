/**
 * Schema: households (owner: FAM). Guardians and children in one household,
 * child profiles managed by a parent, invitations, and consent records.
 * A child under 13 cannot self-register: their `people` row has no sign-in
 * identity and `account_holder_person_id` names the guardian who owns the
 * account. The guardian ↔ minor authority link stays `guardianships`
 * (../schema.ts), which Health already reads; a household never replaces
 * it. Written by the W3-0 schema steward.
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
import { legalAcceptances, people } from "../schema";
import { at, createdAtColumn, oneOf, updatedAtColumn } from "./_columns";

export const householdMemberRoles = [
  "guardian",
  "adult",
  "teen",
  "child",
] as const;
export const householdMemberStatuses = ["active", "removed"] as const;
export const householdInvitationStatuses = [
  "pending",
  "accepted",
  "declined",
  "expired",
  "cancelled",
] as const;
export const householdConsentKinds = [
  "account",
  "verifiable-parental-consent",
  "public-profile",
  "video",
  "messaging",
  "location",
] as const;
export const householdConsentDecisions = [
  "granted",
  "denied",
  "withdrawn",
] as const;
export const householdConsentMethods = [
  "checkbox-attestation",
  "card-verification",
  "signed-attestation",
  "identity-provider",
  "admin-review",
] as const;

export const households = pgTable("households", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdByPersonId: uuid("created_by_person_id")
    .notNull()
    .references(() => people.id, { onDelete: "restrict" }),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
});

export const householdMembers = pgTable(
  "household_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 10 }).notNull(),
    /** The guardian who owns a managed child's account; null = the person signs in themselves. */
    accountHolderPersonId: uuid("account_holder_person_id").references(
      () => people.id,
      { onDelete: "restrict" },
    ),
    status: varchar("status", { length: 8 }).notNull().default("active"),
    joinedAt: at("joined_at").notNull().defaultNow(),
    removedAt: at("removed_at"),
    /** Deletion after the 7-day recovery window (childrens-privacy §8). */
    deletionScheduledAt: at("deletion_scheduled_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("household_member_active_unique")
      .on(table.householdId, table.personId)
      .where(sql`${table.status} = 'active'`),
    index("household_member_person_idx").on(table.personId, table.status),
    check(
      "household_member_role_valid",
      oneOf(table.role, householdMemberRoles),
    ),
    check(
      "household_member_status_valid",
      oneOf(table.status, householdMemberStatuses),
    ),
    check(
      "household_member_child_managed",
      sql`${table.role} <> 'child' OR ${table.accountHolderPersonId} IS NOT NULL`,
    ),
    check(
      "household_member_holder_not_self",
      sql`${table.accountHolderPersonId} IS NULL OR ${table.accountHolderPersonId} <> ${table.personId}`,
    ),
    check(
      "household_member_removed_shape",
      sql`(${table.status} = 'removed') = (${table.removedAt} IS NOT NULL)`,
    ),
  ],
);

/** An invitation to join a household (a co-guardian, a teen, another adult). */
export const householdInvitations = pgTable(
  "household_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    invitedByPersonId: uuid("invited_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 10 }).notNull(),
    /** The child the invitation concerns, for a co-guardian. */
    concernsPersonId: uuid("concerns_person_id").references(() => people.id, {
      onDelete: "cascade",
    }),
    /** Masked contact for display ("a••••@example.com"); the full address is never stored here. */
    contactHint: text("contact_hint"),
    tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
    status: varchar("status", { length: 10 }).notNull().default("pending"),
    expiresAt: at("expires_at").notNull(),
    acceptedByPersonId: uuid("accepted_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    respondedAt: at("responded_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("household_invitation_household_status_idx").on(
      table.householdId,
      table.status,
    ),
    check(
      "household_invitation_role_valid",
      oneOf(table.role, householdMemberRoles),
    ),
    check(
      "household_invitation_status_valid",
      oneOf(table.status, householdInvitationStatuses),
    ),
    check(
      "household_invitation_no_child_invite",
      sql`${table.role} <> 'child'`,
    ),
    check(
      "household_invitation_accepted_shape",
      sql`(${table.status} = 'accepted') = (${table.acceptedByPersonId} IS NOT NULL)`,
    ),
  ],
);

/**
 * Append-only consent acts by a guardian for a child: who consented, when,
 * the version and hash of the text shown, and how (guardians-and-youth §10.1).
 * Health consent stays in `health_consents`.
 */
export const householdConsents = pgTable(
  "household_consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").references(() => households.id, {
      onDelete: "restrict",
    }),
    guardianPersonId: uuid("guardian_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    childPersonId: uuid("child_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    kind: varchar("kind", { length: 32 }).notNull(),
    decision: varchar("decision", { length: 10 }).notNull(),
    method: varchar("method", { length: 24 }).notNull(),
    disclosureVersion: varchar("disclosure_version", { length: 32 }).notNull(),
    disclosureTextHash: varchar("disclosure_text_hash", {
      length: 64,
    }).notNull(),
    /** The processor reference of a card verification; never card data. */
    verificationReference: varchar("verification_reference", { length: 128 }),
    legalAcceptanceId: uuid("legal_acceptance_id").references(
      () => legalAcceptances.id,
      { onDelete: "restrict" },
    ),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: text("user_agent"),
    occurredAt: at("occurred_at").notNull().defaultNow(),
  },
  (table) => [
    index("household_consent_child_kind_idx").on(
      table.childPersonId,
      table.kind,
      table.occurredAt,
    ),
    index("household_consent_guardian_idx").on(
      table.guardianPersonId,
      table.occurredAt,
    ),
    check(
      "household_consent_kind_valid",
      oneOf(table.kind, householdConsentKinds),
    ),
    check(
      "household_consent_decision_valid",
      oneOf(table.decision, householdConsentDecisions),
    ),
    check(
      "household_consent_method_valid",
      oneOf(table.method, householdConsentMethods),
    ),
    check(
      "household_consent_distinct_people",
      sql`${table.guardianPersonId} <> ${table.childPersonId}`,
    ),
  ],
);
