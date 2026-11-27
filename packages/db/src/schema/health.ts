/**
 * Schema seam: health (H1, junior players). Consent records for 13-to-17
 * Health and bookkeeping for the Health retention job.
 *
 * The original Health tables (health_connections, health_samples,
 * health_daily_check_ins, health_sharing_grants) stay in ../schema.ts; their
 * H1 columns are added there. Re-exported by ../schema.ts with one
 * `export *` line.
 */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  boolean,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { healthSharingGrants, people } from "../schema";

/**
 * Append-only record of every Health consent act for a minor: the teen's own
 * opt-in, the guardian's approval, each grant approval or denial, and every
 * withdrawal. The disclosure shown is identified by policy version and the
 * SHA-256 of its text; no Health values are stored here.
 */
export const healthConsents = pgTable(
  "health_consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectPersonId: uuid("subject_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    actorPersonId: uuid("actor_person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    actorRole: varchar("actor_role", { length: 16 }).notNull(),
    kind: varchar("kind", { length: 16 }).notNull(),
    decision: varchar("decision", { length: 16 }).notNull(),
    grantId: uuid("grant_id").references(() => healthSharingGrants.id, {
      onDelete: "set null",
    }),
    subjectAgeBand: varchar("subject_age_band", { length: 16 }).notNull(),
    policyVersion: varchar("policy_version", { length: 64 }).notNull(),
    disclosureTextHash: varchar("disclosure_text_hash", {
      length: 64,
    }).notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("health_consent_subject_kind_idx").on(
      table.subjectPersonId,
      table.kind,
      table.occurredAt,
    ),
    index("health_consent_actor_idx").on(table.actorPersonId, table.occurredAt),
    index("health_consent_grant_idx").on(table.grantId),
    check(
      "health_consent_actor_role_valid",
      sql`${table.actorRole} IN ('subject', 'guardian', 'system')`,
    ),
    check(
      "health_consent_kind_valid",
      sql`${table.kind} IN ('collection', 'grant')`,
    ),
    check(
      "health_consent_decision_valid",
      sql`${table.decision} IN ('granted', 'denied', 'withdrawn')`,
    ),
    check(
      "health_consent_grant_shape_valid",
      sql`${table.kind} = 'collection' OR ${table.grantId} IS NOT NULL OR ${table.decision} = 'withdrawn'`,
    ),
  ],
);

/** One row per retention job run; counts only, never people or values. */
export const healthRetentionRuns = pgTable("health_retention_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
  policyVersion: varchar("policy_version", { length: 64 }).notNull(),
  expiredSamplesDeleted: integer("expired_samples_deleted")
    .notNull()
    .default(0),
  expiredCheckInsDeleted: integer("expired_check_ins_deleted")
    .notNull()
    .default(0),
  withdrawnSamplesDeleted: integer("withdrawn_samples_deleted")
    .notNull()
    .default(0),
  withdrawnConnectionsPurged: integer("withdrawn_connections_purged")
    .notNull()
    .default(0),
  ageBandsRefreshed: integer("age_bands_refreshed").notNull().default(0),
  batches: integer("batches").notNull().default(0),
  complete: boolean("complete").notNull().default(false),
});
