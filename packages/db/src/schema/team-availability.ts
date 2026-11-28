/**
 * Schema: team-availability (owner: B3a). Named availability schedules with
 * effective dates and weekly windows, blackouts, time off, and coverage
 * requests with substitute offers. Written by the W3-0 schema steward;
 * request changes in docs/plan/schema-requests/B3a.md.
 *
 * Replaces `organization_staff_profiles.availability` (jsonb), which stays
 * readable until B3a moves its readers (see FOLLOW-UP-DROPS.md).
 */
import { sql } from "drizzle-orm";
import {
  check,
  date,
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
  organizationStaffProfiles,
  organizations,
  people,
  sessions,
  trainingEvents,
  venues,
} from "../schema";
import { at, createdAtColumn, oneOf, updatedAtColumn } from "./_columns";

export const staffScheduleStatuses = [
  "draft",
  "active",
  "fallback",
  "archived",
] as const;
export const staffWindowKinds = [
  "coaching",
  "early",
  "juniors",
  "office",
  "other",
] as const;
export const staffTimeOffStatuses = [
  "requested",
  "approved",
  "declined",
  "cancelled",
] as const;
export const staffCoverageStatuses = [
  "open",
  "asking",
  "covered",
  "nobody-free",
  "cancelled",
] as const;
export const staffCoverageReasons = [
  "time-off",
  "blackout",
  "schedule-change",
  "no-coach-assigned",
  "manual",
] as const;
export const staffCoverageOfferStatuses = [
  "suggested",
  "asked",
  "accepted",
  "declined",
  "assigned",
  "withdrawn",
] as const;

/** A named weekly schedule ("Summer", "School term") valid between dates. */
export const staffAvailabilitySchedules = pgTable(
  "staff_availability_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    staffProfileId: uuid("staff_profile_id")
      .notNull()
      .references(() => organizationStaffProfiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: varchar("status", { length: 12 }).notNull().default("draft"),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    timezone: varchar("timezone", { length: 64 }).notNull(),
    /** The sentence the coach or Ask Duna wrote it from ("Mon and Wed 3 to 8"). */
    sourceText: text("source_text"),
    createdByPersonId: uuid("created_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("staff_availability_schedule_staff_idx").on(
      table.staffProfileId,
      table.status,
      table.effectiveFrom,
    ),
    index("staff_availability_schedule_org_idx").on(
      table.organizationId,
      table.status,
    ),
    uniqueIndex("staff_availability_schedule_one_fallback")
      .on(table.staffProfileId)
      .where(sql`${table.status} = 'fallback'`),
    check(
      "staff_availability_schedule_status_valid",
      oneOf(table.status, staffScheduleStatuses),
    ),
    check(
      "staff_availability_schedule_dates_valid",
      sql`${table.effectiveTo} IS NULL OR ${table.effectiveTo} >= ${table.effectiveFrom}`,
    ),
  ],
);

/** Several windows per weekday are allowed (Tue 7–9 AM and Tue 3–8 PM). */
export const staffAvailabilityWindows = pgTable(
  "staff_availability_windows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => staffAvailabilitySchedules.id, { onDelete: "cascade" }),
    /** 0 = Sunday … 6 = Saturday, in the schedule's timezone. */
    weekday: integer("weekday").notNull(),
    startsAt: time("starts_at").notNull(),
    endsAt: time("ends_at").notNull(),
    kind: varchar("kind", { length: 12 }).notNull().default("coaching"),
    label: text("label"),
    venueId: uuid("venue_id").references(() => venues.id, {
      onDelete: "set null",
    }),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index("staff_availability_window_schedule_idx").on(
      table.scheduleId,
      table.weekday,
      table.startsAt,
    ),
    check(
      "staff_availability_window_weekday_valid",
      sql`${table.weekday} BETWEEN 0 AND 6`,
    ),
    check(
      "staff_availability_window_time_valid",
      sql`${table.endsAt} > ${table.startsAt}`,
    ),
    check(
      "staff_availability_window_kind_valid",
      oneOf(table.kind, staffWindowKinds),
    ),
  ],
);

/** Dates a staff member cannot work, set by them or a manager; no approval. */
export const staffBlackouts = pgTable(
  "staff_blackouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    staffProfileId: uuid("staff_profile_id")
      .notNull()
      .references(() => organizationStaffProfiles.id, { onDelete: "cascade" }),
    startsAt: at("starts_at").notNull(),
    endsAt: at("ends_at").notNull(),
    reason: text("reason"),
    createdByPersonId: uuid("created_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("staff_blackout_staff_time_idx").on(
      table.staffProfileId,
      table.startsAt,
      table.endsAt,
    ),
    index("staff_blackout_org_time_idx").on(
      table.organizationId,
      table.startsAt,
    ),
    check(
      "staff_blackout_time_valid",
      sql`${table.endsAt} > ${table.startsAt}`,
    ),
  ],
);

/** Time off that needs a manager's approval. */
export const staffTimeOff = pgTable(
  "staff_time_off",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    staffProfileId: uuid("staff_profile_id")
      .notNull()
      .references(() => organizationStaffProfiles.id, { onDelete: "cascade" }),
    startsAt: at("starts_at").notNull(),
    endsAt: at("ends_at").notNull(),
    reason: text("reason"),
    status: varchar("status", { length: 12 }).notNull().default("requested"),
    requestedByPersonId: uuid("requested_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    requestedAt: at("requested_at").notNull().defaultNow(),
    decidedByPersonId: uuid("decided_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    decidedAt: at("decided_at"),
    decisionNote: text("decision_note"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("staff_time_off_staff_time_idx").on(
      table.staffProfileId,
      table.startsAt,
      table.endsAt,
    ),
    index("staff_time_off_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
    check(
      "staff_time_off_time_valid",
      sql`${table.endsAt} > ${table.startsAt}`,
    ),
    check(
      "staff_time_off_status_valid",
      oneOf(table.status, staffTimeOffStatuses),
    ),
    check(
      "staff_time_off_decided_shape",
      sql`${table.status} IN ('requested', 'cancelled') OR ${table.decidedAt} IS NOT NULL`,
    ),
  ],
);

/**
 * A session that needs a coach. The session is a `sessions` row or a
 * `training_events` row (exactly one).
 */
export const staffCoverageRequests = pgTable(
  "staff_coverage_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => sessions.id, {
      onDelete: "cascade",
    }),
    trainingEventId: uuid("training_event_id").references(
      () => trainingEvents.id,
      { onDelete: "cascade" },
    ),
    startsAt: at("starts_at").notNull(),
    endsAt: at("ends_at").notNull(),
    originalStaffProfileId: uuid("original_staff_profile_id").references(
      () => organizationStaffProfiles.id,
      { onDelete: "set null" },
    ),
    reason: varchar("reason", { length: 20 }).notNull(),
    timeOffId: uuid("time_off_id").references(() => staffTimeOff.id, {
      onDelete: "set null",
    }),
    blackoutId: uuid("blackout_id").references(() => staffBlackouts.id, {
      onDelete: "set null",
    }),
    status: varchar("status", { length: 12 }).notNull().default("open"),
    coveredByStaffProfileId: uuid("covered_by_staff_profile_id").references(
      () => organizationStaffProfiles.id,
      { onDelete: "set null" },
    ),
    resolvedByPersonId: uuid("resolved_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    resolvedAt: at("resolved_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("staff_coverage_request_org_status_idx").on(
      table.organizationId,
      table.status,
      table.startsAt,
    ),
    uniqueIndex("staff_coverage_request_session_open_unique")
      .on(table.sessionId)
      .where(
        sql`${table.sessionId} IS NOT NULL AND ${table.status} IN ('open', 'asking')`,
      ),
    uniqueIndex("staff_coverage_request_training_open_unique")
      .on(table.trainingEventId)
      .where(
        sql`${table.trainingEventId} IS NOT NULL AND ${table.status} IN ('open', 'asking')`,
      ),
    check(
      "staff_coverage_request_one_target",
      sql`num_nonnulls(${table.sessionId}, ${table.trainingEventId}) = 1`,
    ),
    check(
      "staff_coverage_request_time_valid",
      sql`${table.endsAt} > ${table.startsAt}`,
    ),
    check(
      "staff_coverage_request_reason_valid",
      oneOf(table.reason, staffCoverageReasons),
    ),
    check(
      "staff_coverage_request_status_valid",
      oneOf(table.status, staffCoverageStatuses),
    ),
    check(
      "staff_coverage_request_covered_shape",
      sql`(${table.status} = 'covered') = (${table.coveredByStaffProfileId} IS NOT NULL)`,
    ),
  ],
);

/** A suggested or asked substitute, ranked. */
export const staffCoverageOffers = pgTable(
  "staff_coverage_offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => staffCoverageRequests.id, { onDelete: "cascade" }),
    staffProfileId: uuid("staff_profile_id")
      .notNull()
      .references(() => organizationStaffProfiles.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    status: varchar("status", { length: 12 }).notNull().default("suggested"),
    /** Why suggested: { free: true, sameLevel: true, sessionsThisWeek: 3 }. */
    rationale: text("rationale"),
    askedAt: at("asked_at"),
    respondedAt: at("responded_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("staff_coverage_offer_unique").on(
      table.requestId,
      table.staffProfileId,
    ),
    check("staff_coverage_offer_rank_valid", sql`${table.rank} >= 0`),
    check(
      "staff_coverage_offer_status_valid",
      oneOf(table.status, staffCoverageOfferStatuses),
    ),
  ],
);
