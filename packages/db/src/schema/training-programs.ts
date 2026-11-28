/**
 * Schema: training-programs (owner: B4). Programs unified: per-weekday
 * practice times, blackout / tournament / travel dates, weekly phases,
 * several coaches per program and per session. Sessions are
 * `training_events` rows (cancel keeps the row and its reason; added events
 * carry `source = 'manual'`). New columns on `training_programs`,
 * `training_events` and the practice-plan tables live in ../schema.ts.
 * Written by the W3-0 schema steward; request changes in
 * docs/plan/schema-requests/B4.md.
 */
import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  time,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  courts,
  people,
  sessions,
  trainingEvents,
  trainingPrograms,
  venues,
} from "../schema";
import { createdAtColumn, oneOf, updatedAtColumn } from "./_columns";

export const trainingProgramCoachRoles = ["lead", "assistant"] as const;
export const trainingEventCoachRoles = [
  "lead",
  "assistant",
  "substitute",
] as const;
export const trainingProgramExceptionKinds = [
  "blackout",
  "break",
  "tournament",
  "travel",
] as const;
export const trainingProgramWeekPhases = [
  "build",
  "break",
  "maintain",
  "taper",
  "recover",
] as const;
/** Where a session's load, contacts and jumps came from. */
export const trainingEstimateSources = [
  "assumed",
  "coach-edited",
  "derived-from-scene",
] as const;

/** A coach on a program, optionally limited to some weekdays ("Assistant · Mon, Sat"). */
export const trainingProgramCoaches = pgTable(
  "training_program_coaches",
  {
    programId: uuid("program_id")
      .notNull()
      .references(() => trainingPrograms.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 12 }).notNull().default("lead"),
    /** Weekdays covered (0 = Sunday); empty = all practices. */
    weekdays: integer("weekdays")
      .array()
      .notNull()
      .default(sql`'{}'::integer[]`),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    primaryKey({ columns: [table.programId, table.personId] }),
    index("training_program_coach_person_idx").on(table.personId),
    uniqueIndex("training_program_one_lead_unique")
      .on(table.programId)
      .where(sql`${table.role} = 'lead'`),
    check(
      "training_program_coach_role_valid",
      oneOf(table.role, trainingProgramCoachRoles),
    ),
    check(
      "training_program_coach_weekdays_valid",
      sql`${table.weekdays} <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::integer[]`,
    ),
  ],
);

/** A practice day and its own times (Mon 4–6 PM, Sat 9–11 AM). */
export const trainingProgramWeeklySlots = pgTable(
  "training_program_weekly_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id")
      .notNull()
      .references(() => trainingPrograms.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    startsAt: time("starts_at").notNull(),
    endsAt: time("ends_at").notNull(),
    /** Every N weeks (1 = weekly). */
    intervalWeeks: integer("interval_weeks").notNull().default(1),
    venueId: uuid("venue_id").references(() => venues.id, {
      onDelete: "set null",
    }),
    courtIds: uuid("court_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("training_program_weekly_slot_program_idx").on(
      table.programId,
      table.weekday,
    ),
    check(
      "training_program_weekly_slot_weekday_valid",
      sql`${table.weekday} BETWEEN 0 AND 6`,
    ),
    check(
      "training_program_weekly_slot_time_valid",
      sql`${table.endsAt} > ${table.startsAt}`,
    ),
    check(
      "training_program_weekly_slot_interval_valid",
      sql`${table.intervalWeeks} BETWEEN 1 AND 8`,
    ),
  ],
);

/** Dates practice does not happen, or that hold a tournament or travel. */
export const trainingProgramDateExceptions = pgTable(
  "training_program_date_exceptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id")
      .notNull()
      .references(() => trainingPrograms.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 12 }).notNull(),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    endsOn: date("ends_on", { mode: "string" }).notNull(),
    label: text("label").notNull(),
    /** The event it stands for, when it is a Duna event (a tournament). */
    sessionId: uuid("session_id").references(() => sessions.id, {
      onDelete: "set null",
    }),
    /** Imported from a link ("Import from a link"). */
    sourceUrl: text("source_url"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("training_program_exception_program_idx").on(
      table.programId,
      table.startsOn,
    ),
    check(
      "training_program_exception_kind_valid",
      oneOf(table.kind, trainingProgramExceptionKinds),
    ),
    check(
      "training_program_exception_dates_valid",
      sql`${table.endsOn} >= ${table.startsOn}`,
    ),
  ],
);

/** The weekly plan on TR-Program: phase and planned load per week. */
export const trainingProgramWeeks = pgTable(
  "training_program_weeks",
  {
    programId: uuid("program_id")
      .notNull()
      .references(() => trainingPrograms.id, { onDelete: "cascade" }),
    weekNumber: integer("week_number").notNull(),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    phase: varchar("phase", { length: 10 }).notNull(),
    plannedLoad: integer("planned_load").notNull(),
    note: text("note"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    primaryKey({ columns: [table.programId, table.weekNumber] }),
    check("training_program_week_number_valid", sql`${table.weekNumber} > 0`),
    check(
      "training_program_week_phase_valid",
      oneOf(table.phase, trainingProgramWeekPhases),
    ),
    check(
      "training_program_week_load_valid",
      sql`${table.plannedLoad} BETWEEN 0 AND 100`,
    ),
  ],
);

/** Coaches on one session (several, and substitutes from coverage). */
export const trainingEventCoaches = pgTable(
  "training_event_coaches",
  {
    trainingEventId: uuid("training_event_id")
      .notNull()
      .references(() => trainingEvents.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 12 }).notNull().default("lead"),
    courtId: uuid("court_id").references(() => courts.id, {
      onDelete: "set null",
    }),
    createdAt: createdAtColumn(),
  },
  (table) => [
    primaryKey({ columns: [table.trainingEventId, table.personId] }),
    index("training_event_coach_person_idx").on(table.personId),
    check(
      "training_event_coach_role_valid",
      oneOf(table.role, trainingEventCoachRoles),
    ),
  ],
);
