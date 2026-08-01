import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const createdAt = timestamp("created_at", {
  withTimezone: true,
  mode: "date",
})
  .notNull()
  .defaultNow();

const updatedAt = timestamp("updated_at", {
  withTimezone: true,
  mode: "date",
})
  .notNull()
  .defaultNow();

export const personStatusEnum = pgEnum("person_status", [
  "active",
  "restricted",
  "suspended",
  "deleted",
]);
export const orgRoleEnum = pgEnum("org_role", [
  "owner",
  "manager",
  "coach",
  "front-desk",
  "scorekeeper",
  "accountant",
]);
export const disciplineEnum = pgEnum("discipline", [
  "beach-2s",
  "beach-4s",
  "beach-6s",
  "grass",
  "indoor",
]);
export const confidenceEnum = pgEnum("rating_confidence", [
  "Provisional",
  "Developing",
  "Reliable",
  "Locked",
]);
export const venueStatusEnum = pgEnum("venue_status", [
  "draft",
  "active",
  "maintenance",
  "seasonal",
  "closed",
]);
export const availabilityModeEnum = pgEnum("availability_mode", [
  "open",
  "private-lessons-only",
  "group-only",
  "league-reserved",
  "rentals-only",
  "members-only",
  "maintenance",
  "blocked",
]);
export const eventKindEnum = pgEnum("event_kind", [
  "tournament",
  "league",
  "clinic",
  "open-play",
  "private-lesson",
  "court-rental",
  "pickup",
]);
export const sessionStatusEnum = pgEnum("session_status", [
  "draft",
  "published",
  "registration-open",
  "live",
  "weather-hold",
  "completed",
  "cancelled",
]);
export const registrationStatusEnum = pgEnum("registration_status", [
  "pending",
  "confirmed",
  "waitlisted",
  "cancelled",
  "refunded",
  "checked-in",
]);
export const bookingStatusEnum = pgEnum("booking_status", [
  "held",
  "confirmed",
  "cancelled",
  "expired",
  "refunded",
]);
export const matchStatusEnum = pgEnum("match_status", [
  "scheduled",
  "warmup",
  "live",
  "pending-verification",
  "verified",
  "disputed",
  "complete",
  "forfeit",
  "cancelled",
]);
export const matchVerificationEnum = pgEnum("match_verification", [
  "live-scored",
  "desk",
  "both-confirmed",
  "auto-accepted",
  "self-reported",
  "imported-professional",
  "imported-amateur",
  "group-confirmed",
]);
export const orderStatusEnum = pgEnum("order_status", [
  "draft",
  "pending",
  "paid",
  "partially-refunded",
  "refunded",
  "failed",
  "disputed",
  "cancelled",
]);
export const ledgerDirectionEnum = pgEnum("ledger_direction", [
  "credit",
  "debit",
]);
export const walletEntryKindEnum = pgEnum("wallet_entry_kind", [
  "load",
  "booking",
  "refund",
  "prize",
  "coach-earning",
  "withdrawal",
  "affiliate",
  "adjustment",
  "chargeback",
]);
export const ledgerStatusEnum = pgEnum("ledger_status", [
  "pending",
  "available",
  "complete",
  "held",
  "reversed",
]);
export const taxCharacterEnum = pgEnum("tax_character", [
  "none",
  "prize",
  "contractor",
  "affiliate",
  "refund",
]);
export const ticketStatusEnum = pgEnum("ticket_status", [
  "held",
  "issued",
  "transferred",
  "scanned",
  "void",
  "refunded",
]);
export const consentScopeEnum = pgEnum("consent_scope", [
  "transactional",
  "marketing-email",
  "marketing-sms",
  "marketing-push",
]);
export const messageChannelEnum = pgEnum("message_channel", [
  "email",
  "sms",
  "push",
  "in-app",
]);
export const queueStatusEnum = pgEnum("queue_status", [
  "open",
  "triaged",
  "investigating",
  "held",
  "resolved",
  "dismissed",
]);
export const riskTierEnum = pgEnum("agent_risk_tier", [
  "read",
  "propose",
  "confirm-always",
]);

// Identity
export const people = pgTable(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: varchar("clerk_user_id", { length: 128 }).unique(),
    phoneE164: varchar("phone_e164", { length: 24 }).unique(),
    email: text("email"),
    givenName: text("given_name"),
    familyName: text("family_name"),
    displayName: text("display_name").notNull(),
    handle: varchar("handle", { length: 48 }).notNull().unique(),
    avatarUrl: text("avatar_url"),
    profileClaimStatus: varchar("profile_claim_status", { length: 24 })
      .notNull()
      .default("claimed"),
    isProfessional: boolean("is_professional").notNull().default(false),
    professionalSince: date("professional_since", { mode: "string" }),
    professionalDefinition: text("professional_definition"),
    genderCategory: varchar("gender_category", { length: 16 }),
    birthDate: date("birth_date", { mode: "string" }),
    isMinor: boolean("is_minor").notNull().default(false),
    ageBand: varchar("age_band", { length: 16 }).notNull().default("unknown"),
    ageVerifiedAt: timestamp("age_verified_at", {
      withTimezone: true,
      mode: "date",
    }),
    parentalConsentAt: timestamp("parental_consent_at", {
      withTimezone: true,
      mode: "date",
    }),
    profileVisibility: varchar("profile_visibility", { length: 24 })
      .notNull()
      .default("private"),
    homeMarket: text("home_market"),
    locale: varchar("locale", { length: 16 }).notNull().default("en-US"),
    measurementSystem: varchar("measurement_system", { length: 12 })
      .notNull()
      .default("imperial"),
    status: personStatusEnum("status").notNull().default("active"),
    ...{ createdAt, updatedAt },
  },
  (table) => [
    index("people_display_name_idx").on(table.displayName),
    check(
      "people_minor_private_check",
      sql`NOT ${table.isMinor} OR ${table.profileVisibility} <> 'public'`,
    ),
    check(
      "people_age_band_check",
      sql`${table.ageBand} IN ('unknown', 'under-13', 'teen', 'adult')`,
    ),
    check(
      "people_minor_age_band_check",
      sql`${table.ageBand} NOT IN ('under-13', 'teen') OR ${table.isMinor}`,
    ),
    check(
      "people_profile_claim_status_check",
      sql`${table.profileClaimStatus} IN ('claimed', 'unclaimed', 'claim-pending', 'merged')`,
    ),
  ],
);

export const guardianships = pgTable(
  "guardianships",
  {
    guardianId: uuid("guardian_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    minorId: uuid("minor_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    relationship: varchar("relationship", { length: 48 }).notNull(),
    verified: boolean("verified").notNull().default(false),
    emergencyContact: boolean("emergency_contact").notNull().default(true),
    canApproveSpending: boolean("can_approve_spending").notNull().default(true),
    reviewStatus: varchar("review_status", { length: 16 })
      .notNull()
      .default("pending"),
    reviewReason: text("review_reason"),
    reviewedByPersonId: uuid("reviewed_by_person_id").references(
      () => people.id,
    ),
    reviewedAt: timestamp("reviewed_at", {
      withTimezone: true,
      mode: "date",
    }),
    verifiedAt: timestamp("verified_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
  },
  (table) => [
    primaryKey({ columns: [table.guardianId, table.minorId] }),
    check(
      "guardianship_distinct_people",
      sql`${table.guardianId} <> ${table.minorId}`,
    ),
    check(
      "guardianship_review_status_valid",
      sql`${table.reviewStatus} IN ('pending', 'verified', 'rejected')`,
    ),
  ],
);

export const guardianConsents = pgTable(
  "guardian_consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guardianId: uuid("guardian_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    minorId: uuid("minor_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    disclosureVersion: varchar("disclosure_version", { length: 32 }).notNull(),
    disclosureText: text("disclosure_text").notNull(),
    disclosureTextHash: varchar("disclosure_text_hash", {
      length: 128,
    }).notNull(),
    granted: boolean("granted").notNull(),
    method: varchar("method", { length: 32 }).notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: text("user_agent"),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("guardian_consent_minor_idx").on(table.minorId, table.occurredAt),
    index("guardian_consent_guardian_idx").on(
      table.guardianId,
      table.occurredAt,
    ),
    check(
      "guardian_consent_distinct_people",
      sql`${table.guardianId} <> ${table.minorId}`,
    ),
    check(
      "guardian_consent_method_valid",
      sql`${table.method} IN ('signed-attestation', 'identity-provider', 'admin-review')`,
    ),
  ],
);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkOrganizationId: varchar("clerk_organization_id", {
      length: 128,
    }).unique(),
    slug: varchar("slug", { length: 64 }).notNull().unique(),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    plan: varchar("plan", { length: 24 }).notNull().default("coach"),
    timezone: varchar("timezone", { length: 64 })
      .notNull()
      .default("America/New_York"),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    countryCode: varchar("country_code", { length: 2 }).notNull().default("US"),
    stripeAccountId: varchar("stripe_account_id", { length: 128 }),
    stripeAccountType: varchar("stripe_account_type", { length: 24 }),
    stripeChargesEnabled: boolean("stripe_charges_enabled")
      .notNull()
      .default(false),
    marketLaunchEnabled: boolean("market_launch_enabled")
      .notNull()
      .default(false),
    ...{ createdAt, updatedAt },
  },
  (table) => [
    check(
      "organization_currency_uppercase",
      sql`${table.currency} = upper(${table.currency})`,
    ),
  ],
);

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    role: orgRoleEnum("role").notNull(),
    scopes: text("scopes")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    active: boolean("active").notNull().default(true),
    joinedAt: timestamp("joined_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("org_membership_unique").on(
      table.organizationId,
      table.personId,
      table.role,
    ),
    index("org_membership_person_idx").on(table.personId),
  ],
);

export const ratePlans = pgTable(
  "rate_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    baseAmountMinor: integer("base_amount_minor").notNull(),
    memberAmountMinor: integer("member_amount_minor"),
    nonMemberAmountMinor: integer("non_member_amount_minor"),
    rateUnitMinutes: integer("rate_unit_minutes").notNull().default(60),
    dynamicFloorMinor: integer("dynamic_floor_minor"),
    dynamicCeilingMinor: integer("dynamic_ceiling_minor"),
    dailyChangeCapBps: integer("daily_change_cap_bps"),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "rate_plan_amounts_nonnegative",
      sql`${table.baseAmountMinor} >= 0 AND (${table.memberAmountMinor} IS NULL OR ${table.memberAmountMinor} >= 0) AND (${table.nonMemberAmountMinor} IS NULL OR ${table.nonMemberAmountMinor} >= 0)`,
    ),
    check("rate_plan_unit_positive", sql`${table.rateUnitMinutes} > 0`),
  ],
);

// Inventory and booking
export const venues = pgTable(
  "venues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 64 }).notNull(),
    name: text("name").notNull(),
    status: venueStatusEnum("status").notNull().default("draft"),
    temporary: boolean("temporary").notNull().default(false),
    addressLine1: text("address_line_1"),
    addressLine2: text("address_line_2"),
    locality: text("locality"),
    administrativeArea: text("administrative_area"),
    postalCode: varchar("postal_code", { length: 24 }),
    countryCode: varchar("country_code", { length: 2 }).notNull().default("US"),
    timezone: varchar("timezone", { length: 64 }).notNull(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    lifecycleEndsAt: timestamp("lifecycle_ends_at", {
      withTimezone: true,
      mode: "date",
    }),
    ...{ createdAt, updatedAt },
  },
  (table) => [
    uniqueIndex("venue_org_slug_unique").on(table.organizationId, table.slug),
    index("venue_geo_idx").on(table.latitude, table.longitude),
  ],
);

export const courts = pgTable(
  "courts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    surface: varchar("surface", { length: 32 }).notNull().default("sand"),
    lit: boolean("lit").notNull().default(false),
    status: venueStatusEnum("status").notNull().default("active"),
    bookingPolicy: varchar("booking_policy", { length: 32 })
      .notNull()
      .default("public"),
    ratePlanId: uuid("rate_plan_id").references(() => ratePlans.id),
    minimumDurationMinutes: integer("minimum_duration_minutes")
      .notNull()
      .default(30),
    maximumDurationMinutes: integer("maximum_duration_minutes")
      .notNull()
      .default(120),
    bufferBeforeMinutes: integer("buffer_before_minutes").notNull().default(0),
    bufferAfterMinutes: integer("buffer_after_minutes").notNull().default(0),
    minimumNoticeMinutes: integer("minimum_notice_minutes")
      .notNull()
      .default(60),
    maximumAdvanceDays: integer("maximum_advance_days").notNull().default(90),
    cancellationPolicy: jsonb("cancellation_policy")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    qrToken: varchar("qr_token", { length: 96 }).notNull().unique(),
    ...{ createdAt, updatedAt },
  },
  (table) => [
    uniqueIndex("court_venue_name_unique").on(table.venueId, table.name),
    check(
      "court_duration_valid",
      sql`${table.minimumDurationMinutes} > 0 AND ${table.maximumDurationMinutes} >= ${table.minimumDurationMinutes}`,
    ),
    check(
      "court_booking_window_valid",
      sql`${table.minimumNoticeMinutes} >= 0 AND ${table.maximumAdvanceDays} > 0`,
    ),
  ],
);

export const schedules = pgTable(
  "schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    timezone: varchar("timezone", { length: 64 }).notNull(),
    resourceType: varchar("resource_type", { length: 24 }).notNull(),
    resourceId: uuid("resource_id").notNull(),
    ...{ createdAt, updatedAt },
  },
  (table) => [
    index("schedule_resource_idx").on(table.resourceType, table.resourceId),
  ],
);

export const scheduleBlocks = pgTable(
  "schedule_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    startsAtMinute: integer("starts_at_minute").notNull(),
    endsAtMinute: integer("ends_at_minute").notNull(),
    mode: availabilityModeEnum("mode").notNull(),
    effectiveFrom: date("effective_from", { mode: "string" }),
    effectiveTo: date("effective_to", { mode: "string" }),
    createdAt,
  },
  (table) => [
    check("schedule_block_weekday", sql`${table.weekday} BETWEEN 0 AND 6`),
    check(
      "schedule_block_time",
      sql`${table.startsAtMinute} >= 0 AND ${table.endsAtMinute} <= 1440 AND ${table.endsAtMinute} > ${table.startsAtMinute}`,
    ),
  ],
);

export const scheduleOverrides = pgTable(
  "schedule_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    endsAt: timestamp("ends_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    mode: availabilityModeEnum("mode").notNull(),
    reason: text("reason").notNull(),
    createdAt,
  },
  (table) => [
    check("schedule_override_time", sql`${table.endsAt} > ${table.startsAt}`),
  ],
);

// Programs, sessions, registrations, eligibility, and forms
export const programs = pgTable("programs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  slug: varchar("slug", { length: 80 }).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  kind: eventKindEnum("kind").notNull(),
  status: sessionStatusEnum("status").notNull().default("draft"),
  createdAt,
  updatedAt,
});

export const eligibilityRules = pgTable(
  "eligibility_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    version: integer("version").notNull(),
    tree: jsonb("tree").notNull().$type<Record<string, unknown>>(),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdByPersonId: uuid("created_by_person_id").references(() => people.id),
    createdAt,
  },
  (table) => [
    uniqueIndex("eligibility_rule_version_unique").on(table.id, table.version),
  ],
);

export const eventTypes = pgTable("event_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  kind: eventKindEnum("kind").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  capacity: integer("capacity").notNull(),
  minimumCapacity: integer("minimum_capacity").notNull().default(1),
  priceMinor: integer("price_minor").notNull().default(0),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  packageCreditCost: integer("package_credit_cost"),
  scheduleId: uuid("schedule_id").references(() => schedules.id),
  ratePlanId: uuid("rate_plan_id").references(() => ratePlans.id),
  eligibilityRuleId: uuid("eligibility_rule_id").references(
    () => eligibilityRules.id,
  ),
  cancellationPolicy: jsonb("cancellation_policy")
    .notNull()
    .$type<Record<string, unknown>>()
    .default({}),
  createdAt,
  updatedAt,
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id").references(() => programs.id, {
      onDelete: "cascade",
    }),
    eventTypeId: uuid("event_type_id").references(() => eventTypes.id),
    venueId: uuid("venue_id").references(() => venues.id),
    courtId: uuid("court_id").references(() => courts.id),
    createdByPersonId: uuid("created_by_person_id").references(() => people.id),
    coachPersonId: uuid("coach_person_id").references(() => people.id),
    title: text("title").notNull(),
    slug: varchar("slug", { length: 96 }).notNull().unique(),
    startsAt: timestamp("starts_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    endsAt: timestamp("ends_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    timezone: varchar("timezone", { length: 64 }).notNull(),
    status: sessionStatusEnum("status").notNull().default("draft"),
    capacity: integer("capacity").notNull(),
    minimumCapacity: integer("minimum_capacity").notNull().default(1),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("session_start_idx").on(table.startsAt),
    check("session_time_valid", sql`${table.endsAt} > ${table.startsAt}`),
    check(
      "session_capacity_valid",
      sql`${table.capacity} >= ${table.minimumCapacity} AND ${table.minimumCapacity} > 0`,
    ),
  ],
);

export const eventBlueprints = pgTable("event_blueprints", {
  sessionId: uuid("session_id")
    .primaryKey()
    .references(() => sessions.id, { onDelete: "cascade" }),
  shortSummary: text("short_summary"),
  description: text("description"),
  media: jsonb("media")
    .notNull()
    .$type<readonly Record<string, unknown>[]>()
    .default([]),
  location: jsonb("location")
    .notNull()
    .$type<Record<string, unknown>>()
    .default({}),
  features: jsonb("features")
    .notNull()
    .$type<readonly Record<string, unknown>[]>()
    .default([]),
  policies: jsonb("policies")
    .notNull()
    .$type<readonly Record<string, unknown>[]>()
    .default([]),
  recurrence: jsonb("recurrence").$type<Record<string, unknown>>(),
  registrationSettings: jsonb("registration_settings")
    .notNull()
    .$type<Record<string, unknown>>()
    .default({}),
  createdAt,
  updatedAt,
});

export const divisions = pgTable("divisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  discipline: disciplineEnum("discipline").notNull(),
  eligibilityRuleId: uuid("eligibility_rule_id").references(
    () => eligibilityRules.id,
  ),
  ratingBasis: varchar("rating_basis", { length: 24 })
    .notNull()
    .default("anti-sandbag"),
  capacity: integer("capacity").notNull(),
  minimumTeams: integer("minimum_teams").notNull().default(2),
  maximumTeams: integer("maximum_teams"),
  teamSize: integer("team_size").notNull().default(2),
  priceBasis: varchar("price_basis", { length: 24 })
    .notNull()
    .default("per-team"),
  settings: jsonb("settings")
    .notNull()
    .$type<Record<string, unknown>>()
    .default({}),
  entryFeeMinor: integer("entry_fee_minor").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  createdAt,
  updatedAt,
});

export const registrations = pgTable(
  "registrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    divisionId: uuid("division_id").references(() => divisions.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    status: registrationStatusEnum("status").notNull().default("pending"),
    eligibilityDecision: jsonb("eligibility_decision")
      .notNull()
      .$type<Record<string, unknown>>(),
    eligibilityRuleVersion: integer("eligibility_rule_version"),
    orderId: uuid("order_id"),
    holdExpiresAt: timestamp("hold_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    overriddenByPersonId: uuid("overridden_by_person_id").references(
      () => people.id,
    ),
    overrideReason: text("override_reason"),
    checkedInAt: timestamp("checked_in_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("registration_session_person_unique").on(
      table.sessionId,
      table.personId,
    ),
    uniqueIndex("registration_order_unique")
      .on(table.orderId)
      .where(sql`${table.orderId} IS NOT NULL`),
    check(
      "registration_pending_hold_required",
      sql`${table.status} <> 'pending' OR (${table.orderId} IS NOT NULL AND ${table.holdExpiresAt} IS NOT NULL)`,
    ),
  ],
);

export const forms = pgTable(
  "forms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    version: integer("version").notNull(),
    schema: jsonb("schema").notNull().$type<Record<string, unknown>>(),
    documentText: text("document_text"),
    documentTextHash: varchar("document_text_hash", { length: 128 }),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
  },
  (table) => [
    uniqueIndex("form_version_unique").on(table.id, table.version),
    check(
      "form_document_hash_pair",
      sql`(${table.documentText} IS NULL AND ${table.documentTextHash} IS NULL) OR (${table.documentText} IS NOT NULL AND ${table.documentTextHash} IS NOT NULL)`,
    ),
  ],
);

export const formResponses = pgTable(
  "form_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id")
      .notNull()
      .references(() => forms.id),
    formVersion: integer("form_version").notNull(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    subjectPersonId: uuid("subject_person_id")
      .notNull()
      .references(() => people.id),
    answers: jsonb("answers").notNull().$type<Record<string, unknown>>(),
    signedByPersonId: uuid("signed_by_person_id").references(() => people.id),
    signatureTextHash: varchar("signature_text_hash", { length: 128 }),
    signedAt: timestamp("signed_at", { withTimezone: true, mode: "date" }),
    ipAddress: varchar("ip_address", { length: 64 }),
    createdAt,
  },
  (table) => [
    check(
      "form_response_signature_complete",
      sql`(${table.signedByPersonId} IS NULL AND ${table.signatureTextHash} IS NULL AND ${table.signedAt} IS NULL) OR (${table.signedByPersonId} IS NOT NULL AND ${table.signatureTextHash} IS NOT NULL AND ${table.signedAt} IS NOT NULL)`,
    ),
  ],
);

// Competition and event-sourced scoring
export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  divisionId: uuid("division_id").references(() => divisions.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  seed: integer("seed"),
  status: varchar("status", { length: 24 }).notNull().default("active"),
  createdAt,
  updatedAt,
});

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    role: varchar("role", { length: 24 }).notNull().default("player"),
    joinedAt: timestamp("joined_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.teamId, table.personId] })],
);

export const brackets = pgTable(
  "brackets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    divisionId: uuid("division_id")
      .notNull()
      .references(() => divisions.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    format: varchar("format", { length: 48 }).notNull(),
    structure: jsonb("structure").notNull().$type<Record<string, unknown>>(),
    liveAt: timestamp("live_at", { withTimezone: true, mode: "date" }),
    supersedesBracketId: uuid("supersedes_bracket_id"),
    changeReason: text("change_reason"),
    createdAt,
  },
  (table) => [
    uniqueIndex("bracket_division_version_unique").on(
      table.divisionId,
      table.version,
    ),
  ],
);

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    divisionId: uuid("division_id").references(() => divisions.id),
    bracketId: uuid("bracket_id").references(() => brackets.id),
    teamAId: uuid("team_a_id").references(() => teams.id),
    teamBId: uuid("team_b_id").references(() => teams.id),
    venueId: uuid("venue_id").references(() => venues.id),
    courtId: uuid("court_id").references(() => courts.id),
    createdByPersonId: uuid("created_by_person_id").references(() => people.id),
    status: matchStatusEnum("status").notNull().default("scheduled"),
    scheduledAt: timestamp("scheduled_at", {
      withTimezone: true,
      mode: "date",
    }),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    format: jsonb("format").notNull().$type<Record<string, unknown>>(),
    assignedScorekeeperPersonId: uuid(
      "assigned_scorekeeper_person_id",
    ).references(() => people.id),
    authoritativeDeviceId: varchar("authoritative_device_id", { length: 128 }),
    verification: matchVerificationEnum("verification"),
    verificationWeightBps: integer("verification_weight_bps"),
    winnerTeamId: uuid("winner_team_id").references(() => teams.id),
    ratingEligible: boolean("rating_eligible").notNull().default(true),
    ratingAppliedAt: timestamp("rating_applied_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("match_schedule_idx").on(table.scheduledAt),
    check(
      "match_team_distinct",
      sql`${table.teamAId} IS NULL OR ${table.teamBId} IS NULL OR ${table.teamAId} <> ${table.teamBId}`,
    ),
    check(
      "match_verification_weight",
      sql`${table.verificationWeightBps} IS NULL OR ${table.verificationWeightBps} BETWEEN 0 AND 10000`,
    ),
  ],
);

export const rallyEvents = pgTable(
  "rally_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    deviceId: varchar("device_id", { length: 128 }).notNull(),
    monotonicCounter: integer("monotonic_counter").notNull(),
    eventType: varchar("event_type", { length: 48 }).notNull(),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    wallClockAt: timestamp("wall_clock_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    receivedAt: timestamp("received_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("rally_event_match_sequence_unique").on(
      table.matchId,
      table.sequence,
    ),
    uniqueIndex("rally_event_replay_unique").on(
      table.matchId,
      table.sequence,
      table.deviceId,
    ),
    index("rally_event_match_sequence_idx").on(table.matchId, table.sequence),
  ],
);

export const matchConfirmations = pgTable(
  "match_confirmations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    decision: varchar("decision", { length: 16 }).notNull(),
    reason: text("reason"),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("match_confirmation_person_unique").on(
      table.matchId,
      table.personId,
    ),
    check(
      "match_confirmation_decision_valid",
      sql`${table.decision} IN ('confirmed', 'disputed')`,
    ),
  ],
);

export const workTeamAssignments = pgTable("work_team_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  matchId: uuid("match_id")
    .notNull()
    .references(() => matches.id, { onDelete: "cascade" }),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id),
  status: varchar("status", { length: 24 }).notNull().default("assigned"),
  remindedAt: timestamp("reminded_at", { withTimezone: true, mode: "date" }),
  checkedInAt: timestamp("checked_in_at", { withTimezone: true, mode: "date" }),
  createdAt,
});

export const purses = pgTable("purses", {
  id: uuid("id").primaryKey().defaultRandom(),
  divisionId: uuid("division_id")
    .notNull()
    .references(() => divisions.id, { onDelete: "cascade" }),
  allocationBps: integer("allocation_bps").notNull(),
  organizerTopUpMinor: integer("organizer_top_up_minor").notNull().default(0),
  currency: varchar("currency", { length: 3 }).notNull(),
  payoutTable: jsonb("payout_table")
    .notNull()
    .$type<readonly { place: number; percentageBps: number }[]>(),
  distributedAt: timestamp("distributed_at", {
    withTimezone: true,
    mode: "date",
  }),
  createdAt,
  updatedAt,
});

// Ratings and imports
export const ratings = pgTable(
  "ratings",
  {
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    discipline: disciplineEnum("discipline").notNull(),
    mu: doublePrecision("mu").notNull(),
    phi: doublePrecision("phi").notNull(),
    sigma: doublePrecision("sigma").notNull(),
    display: doublePrecision("display").notNull(),
    confidence: confidenceEnum("confidence").notNull(),
    current52WeekPeak: doublePrecision("current_52_week_peak").notNull(),
    ratedMatches: integer("rated_matches").notNull().default(0),
    weeklyPositiveDisplayGain: doublePrecision("weekly_positive_display_gain")
      .notNull()
      .default(0),
    weeklyGainWindowStart: timestamp("weekly_gain_window_start", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    updatedAt,
  },
  (table) => [
    primaryKey({ columns: [table.personId, table.discipline] }),
    index("rating_display_idx").on(table.discipline, table.display),
    check("rating_display_range", sql`${table.display} BETWEEN 1 AND 8`),
  ],
);

export const ratingEvents = pgTable(
  "rating_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id),
    discipline: disciplineEnum("discipline").notNull(),
    sequence: integer("sequence").notNull(),
    before: jsonb("before").notNull().$type<Record<string, number | string>>(),
    after: jsonb("after").notNull().$type<Record<string, number | string>>(),
    explanation: jsonb("explanation")
      .notNull()
      .$type<Record<string, number | string | boolean>>(),
    verificationWeightBps: integer("verification_weight_bps").notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("rating_event_person_sequence_unique").on(
      table.personId,
      table.discipline,
      table.sequence,
    ),
    index("rating_event_match_idx").on(table.matchId),
    uniqueIndex("rating_event_match_person_unique").on(
      table.matchId,
      table.personId,
    ),
  ],
);

export const importSources = pgTable("import_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: text("name").notNull(),
  licenseStatus: varchar("license_status", { length: 24 })
    .notNull()
    .default("pending"),
  latestSnapshotKey: text("latest_snapshot_key"),
  latestImportedAt: timestamp("latest_imported_at", {
    withTimezone: true,
    mode: "date",
  }),
  createdAt,
  updatedAt,
});

export const importLinks = pgTable(
  "import_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => importSources.id),
    externalPersonId: text("external_person_id").notNull(),
    personId: uuid("person_id").references(() => people.id),
    resolutionScoreBps: integer("resolution_score_bps"),
    resolutionState: varchar("resolution_state", { length: 24 })
      .notNull()
      .default("unresolved"),
    evidence: jsonb("evidence").notNull().$type<Record<string, unknown>>(),
    claimedAt: timestamp("claimed_at", { withTimezone: true, mode: "date" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("import_link_source_person_unique").on(
      table.sourceId,
      table.externalPersonId,
    ),
  ],
);

export const externalPlayerProfiles = pgTable(
  "external_player_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => importSources.id, { onDelete: "cascade" }),
    externalPersonId: text("external_person_id").notNull(),
    personId: uuid("person_id").references(() => people.id),
    displayName: text("display_name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    profileUrl: text("profile_url"),
    hometown: text("hometown"),
    countryCode: varchar("country_code", { length: 3 }),
    birthDate: date("birth_date", { mode: "string" }),
    avatarUrl: text("avatar_url"),
    mappingState: varchar("mapping_state", { length: 24 })
      .notNull()
      .default("unresolved"),
    mappingScoreBps: integer("mapping_score_bps"),
    mappingEvidence: jsonb("mapping_evidence")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    isProfessional: boolean("is_professional").notNull().default(false),
    externalRating: doublePrecision("external_rating"),
    externalRatingConfidence: doublePrecision("external_rating_confidence"),
    externalMatchCount: integer("external_match_count"),
    rawProfile: jsonb("raw_profile")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    lastSeenAt: timestamp("last_seen_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastImportedAt: timestamp("last_imported_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("external_player_source_person_unique").on(
      table.sourceId,
      table.externalPersonId,
    ),
    index("external_player_normalized_name_idx").on(table.normalizedName),
    index("external_player_mapping_queue_idx").on(
      table.mappingState,
      table.mappingScoreBps,
    ),
    check(
      "external_player_mapping_state_check",
      sql`${table.mappingState} IN ('unresolved', 'suggested', 'linked', 'rejected', 'merged')`,
    ),
    check(
      "external_player_mapping_score_check",
      sql`${table.mappingScoreBps} IS NULL OR ${table.mappingScoreBps} BETWEEN 0 AND 10000`,
    ),
  ],
);

export const sandIngestionRuns = pgTable(
  "sand_ingestion_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => importSources.id),
    mode: varchar("mode", { length: 32 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("running"),
    requestedUrl: text("requested_url"),
    requestedExternalId: text("requested_external_id"),
    engine: varchar("engine", { length: 24 }).notNull(),
    counters: jsonb("counters")
      .notNull()
      .$type<Record<string, number>>()
      .default({}),
    checkpoint: jsonb("checkpoint")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    errorKind: varchar("error_kind", { length: 48 }),
    errorMessage: text("error_message"),
    createdByPersonId: uuid("created_by_person_id").references(() => people.id),
    startedAt: timestamp("started_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
  },
  (table) => [
    index("sand_ingestion_source_started_idx").on(
      table.sourceId,
      table.startedAt,
    ),
    check(
      "sand_ingestion_status_check",
      sql`${table.status} IN ('running', 'succeeded', 'partial', 'failed', 'unavailable')`,
    ),
  ],
);

export const importedMatches = pgTable(
  "imported_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => importSources.id),
    ingestionRunId: uuid("ingestion_run_id").references(
      () => sandIngestionRuns.id,
    ),
    externalMatchId: text("external_match_id").notNull(),
    externalEventId: text("external_event_id"),
    sourceUrl: text("source_url"),
    sourceFingerprint: varchar("source_fingerprint", {
      length: 128,
    }).notNull(),
    crossSourceFingerprint: varchar("cross_source_fingerprint", {
      length: 128,
    }).notNull(),
    title: text("title").notNull(),
    roundLabel: text("round_label"),
    location: text("location"),
    genderCategory: varchar("gender_category", { length: 16 }),
    discipline: disciplineEnum("discipline").notNull().default("beach-2s"),
    playedAt: timestamp("played_at", {
      withTimezone: true,
      mode: "date",
    }),
    participants: jsonb("participants").notNull().$type<
      readonly {
        externalPersonId: string;
        name: string;
        side: "A" | "B";
        personId?: string;
      }[]
    >(),
    sets: jsonb("sets").notNull().$type<readonly { a: number; b: number }[]>(),
    winnerSide: varchar("winner_side", { length: 1 }),
    importState: varchar("import_state", { length: 24 })
      .notNull()
      .default("staged"),
    exclusionReason: text("exclusion_reason"),
    possibleDuplicateOfId: uuid("possible_duplicate_of_id"),
    canonicalMatchId: uuid("canonical_match_id").references(() => matches.id),
    approvedByPersonId: uuid("approved_by_person_id").references(
      () => people.id,
    ),
    approvedAt: timestamp("approved_at", {
      withTimezone: true,
      mode: "date",
    }),
    rawPayload: jsonb("raw_payload")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("imported_match_source_external_unique").on(
      table.sourceId,
      table.externalMatchId,
    ),
    uniqueIndex("imported_match_source_fingerprint_unique").on(
      table.sourceId,
      table.sourceFingerprint,
    ),
    index("imported_match_cross_source_idx").on(table.crossSourceFingerprint),
    index("imported_match_queue_idx").on(table.importState, table.playedAt),
    check(
      "imported_match_state_check",
      sql`${table.importState} IN ('staged', 'needs-mapping', 'ready', 'approved', 'duplicate', 'excluded', 'rejected')`,
    ),
    check(
      "imported_match_winner_check",
      sql`${table.winnerSide} IS NULL OR ${table.winnerSide} IN ('A', 'B')`,
    ),
  ],
);

export const professionalEvents = pgTable(
  "professional_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => importSources.id),
    externalEventId: text("external_event_id").notNull(),
    sourceUrl: text("source_url").notNull(),
    name: text("name").notNull(),
    location: text("location"),
    countryCode: varchar("country_code", { length: 3 }),
    category: text("category"),
    genderCategory: varchar("gender_category", { length: 16 }).notNull(),
    startsOn: date("starts_on", { mode: "string" }),
    endsOn: date("ends_on", { mode: "string" }),
    status: varchar("status", { length: 24 }).notNull(),
    live: boolean("live").notNull().default(false),
    teamCount: integer("team_count").notNull().default(0),
    matchCount: integer("match_count").notNull().default(0),
    rawPayload: jsonb("raw_payload")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    lastSyncedAt: timestamp("last_synced_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("professional_event_source_external_unique").on(
      table.sourceId,
      table.externalEventId,
    ),
    index("professional_event_live_date_idx").on(
      table.live,
      table.startsOn,
      table.endsOn,
    ),
  ],
);

export const worldRankings = pgTable(
  "world_rankings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => importSources.id),
    rankingDate: date("ranking_date", { mode: "string" }).notNull(),
    genderCategory: varchar("gender_category", { length: 16 }).notNull(),
    rank: integer("rank").notNull(),
    points: doublePrecision("points").notNull().default(0),
    externalPersonId: text("external_person_id").notNull(),
    displayName: text("display_name").notNull(),
    countryCode: varchar("country_code", { length: 3 }),
    personId: uuid("person_id").references(() => people.id),
    previousRank: integer("previous_rank"),
    rawPayload: jsonb("raw_payload")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    createdAt,
  },
  (table) => [
    uniqueIndex("world_ranking_snapshot_person_unique").on(
      table.sourceId,
      table.rankingDate,
      table.genderCategory,
      table.externalPersonId,
    ),
    index("world_ranking_current_idx").on(
      table.rankingDate,
      table.genderCategory,
      table.rank,
    ),
  ],
);

export const ratingConfigurations = pgTable(
  "rating_configurations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    version: integer("version").notNull(),
    algorithmVersion: varchar("algorithm_version", { length: 48 }).notNull(),
    active: boolean("active").notNull().default(false),
    parameters: jsonb("parameters")
      .notNull()
      .$type<Record<string, number | boolean | string>>(),
    notes: text("notes"),
    createdByPersonId: uuid("created_by_person_id").references(() => people.id),
    createdAt,
  },
  (table) => [
    uniqueIndex("rating_configuration_name_version_unique").on(
      table.name,
      table.version,
    ),
    index("rating_configuration_active_idx").on(table.active),
  ],
);

export const ratingEvaluations = pgTable(
  "rating_evaluations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    configurationId: uuid("configuration_id")
      .notNull()
      .references(() => ratingConfigurations.id),
    sampleSize: integer("sample_size").notNull(),
    predictionAccuracy: doublePrecision("prediction_accuracy").notNull(),
    brierScore: doublePrecision("brier_score").notNull(),
    calibration: jsonb("calibration").notNull().$type<
      readonly {
        lowerBound: number;
        upperBound: number;
        predictions: number;
        averageExpected: number;
        observedWinRate: number;
      }[]
    >(),
    dateFrom: date("date_from", { mode: "string" }),
    dateTo: date("date_to", { mode: "string" }),
    createdByPersonId: uuid("created_by_person_id").references(() => people.id),
    createdAt,
  },
  (table) => [
    index("rating_evaluation_configuration_idx").on(
      table.configurationId,
      table.createdAt,
    ),
  ],
);

export const profileMergeRecords = pgTable(
  "profile_merge_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourcePersonId: uuid("source_person_id")
      .notNull()
      .references(() => people.id),
    targetPersonId: uuid("target_person_id")
      .notNull()
      .references(() => people.id),
    status: varchar("status", { length: 24 }).notNull().default("completed"),
    reason: text("reason").notNull(),
    movedCounts: jsonb("moved_counts")
      .notNull()
      .$type<Record<string, number>>()
      .default({}),
    performedByPersonId: uuid("performed_by_person_id")
      .notNull()
      .references(() => people.id),
    createdAt,
  },
  (table) => [
    index("profile_merge_target_idx").on(table.targetPersonId, table.createdAt),
    check(
      "profile_merge_distinct_people_check",
      sql`${table.sourcePersonId} <> ${table.targetPersonId}`,
    ),
  ],
);

// Commerce, memberships, ledgers, wallet, and reconciliation
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id),
    buyerPersonId: uuid("buyer_person_id")
      .notNull()
      .references(() => people.id),
    status: orderStatusEnum("status").notNull().default("draft"),
    currency: varchar("currency", { length: 3 }).notNull(),
    subtotalMinor: integer("subtotal_minor").notNull(),
    feeTotalMinor: integer("fee_total_minor").notNull().default(0),
    taxTotalMinor: integer("tax_total_minor").notNull().default(0),
    totalMinor: integer("total_minor").notNull(),
    walletAppliedMinor: integer("wallet_applied_minor").notNull().default(0),
    stripePaymentIntentId: varchar("stripe_payment_intent_id", {
      length: 128,
    }).unique(),
    stripeCheckoutSessionId: varchar("stripe_checkout_session_id", {
      length: 128,
    }).unique(),
    idempotencyKey: varchar("idempotency_key", { length: 128 })
      .notNull()
      .unique(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "order_amounts_nonnegative",
      sql`${table.subtotalMinor} >= 0 AND ${table.feeTotalMinor} >= 0 AND ${table.taxTotalMinor} >= 0 AND ${table.totalMinor} >= 0`,
    ),
  ],
);

export const courtBookings = pgTable(
  "court_bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id),
    courtId: uuid("court_id")
      .notNull()
      .references(() => courts.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    eventTypeId: uuid("event_type_id").references(() => eventTypes.id),
    orderId: uuid("order_id").references(() => orders.id),
    startsAt: timestamp("starts_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    endsAt: timestamp("ends_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    bufferBeforeMinutes: integer("buffer_before_minutes").notNull().default(0),
    bufferAfterMinutes: integer("buffer_after_minutes").notNull().default(0),
    status: bookingStatusEnum("status").notNull().default("held"),
    holdExpiresAt: timestamp("hold_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    idempotencyKey: varchar("idempotency_key", { length: 128 })
      .notNull()
      .unique(),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("court_booking_court_time_idx").on(
      table.courtId,
      table.startsAt,
      table.endsAt,
    ),
    index("court_booking_person_idx").on(table.personId, table.startsAt),
    check("court_booking_time_valid", sql`${table.endsAt} > ${table.startsAt}`),
    check(
      "court_booking_buffers_valid",
      sql`${table.bufferBeforeMinutes} >= 0 AND ${table.bufferAfterMinutes} >= 0`,
    ),
    check(
      "court_booking_hold_expiry",
      sql`${table.status} <> 'held' OR ${table.holdExpiresAt} IS NOT NULL`,
    ),
  ],
);

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 32 }).notNull(),
  referenceId: uuid("reference_id"),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull(),
  unitAmountMinor: integer("unit_amount_minor").notNull(),
  totalAmountMinor: integer("total_amount_minor").notNull(),
  createdAt,
});

export const eventPolicyAcceptances = pgTable(
  "event_policy_acceptances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    acceptanceKey: varchar("acceptance_key", { length: 128 })
      .notNull()
      .unique(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    policyId: varchar("policy_id", { length: 128 }).notNull(),
    policyKind: varchar("policy_kind", { length: 16 }).notNull(),
    policyTitle: text("policy_title").notNull(),
    documentText: text("document_text").notNull(),
    documentTextHash: varchar("document_text_hash", { length: 128 }).notNull(),
    subjectPersonId: uuid("subject_person_id")
      .notNull()
      .references(() => people.id),
    acceptedByPersonId: uuid("accepted_by_person_id")
      .notNull()
      .references(() => people.id),
    orderId: uuid("order_id").references(() => orders.id),
    registrationId: uuid("registration_id").references(() => registrations.id),
    fullScrollConfirmed: boolean("full_scroll_confirmed")
      .notNull()
      .default(false),
    ipAddress: varchar("ip_address", { length: 64 }),
    acceptedAt: timestamp("accepted_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    createdAt,
  },
  (table) => [
    index("event_policy_acceptance_session_idx").on(
      table.sessionId,
      table.subjectPersonId,
      table.acceptedAt,
    ),
    index("event_policy_acceptance_order_idx").on(table.orderId),
    check(
      "event_policy_acceptance_kind",
      sql`${table.policyKind} IN ('policy', 'waiver')`,
    ),
    check(
      "event_policy_acceptance_reference",
      sql`${table.orderId} IS NOT NULL OR ${table.registrationId} IS NOT NULL`,
    ),
  ],
);

export const appliedFees = pgTable("applied_fees", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  ruleId: varchar("rule_id", { length: 64 }).notNull(),
  payer: varchar("payer", { length: 24 }).notNull(),
  amountMinor: integer("amount_minor").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  ruleInputs: jsonb("rule_inputs")
    .notNull()
    .$type<Record<string, string | number | boolean>>(),
  createdAt,
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id),
  method: varchar("method", { length: 32 }).notNull(),
  amountMinor: integer("amount_minor").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  stripeChargeId: varchar("stripe_charge_id", { length: 128 }).unique(),
  stripeApplicationFeeId: varchar("stripe_application_fee_id", {
    length: 128,
  }),
  status: varchar("status", { length: 24 }).notNull(),
  createdAt,
  updatedAt,
});

export const packages = pgTable("packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  credits: integer("credits").notNull(),
  priceMinor: integer("price_minor").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  expiryDays: integer("expiry_days"),
  active: boolean("active").notNull().default(true),
  createdAt,
  updatedAt,
});

export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    packageId: uuid("package_id").references(() => packages.id),
    direction: ledgerDirectionEnum("direction").notNull(),
    credits: integer("credits").notNull(),
    reasonCode: varchar("reason_code", { length: 48 }).notNull(),
    referenceId: uuid("reference_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    actorPersonId: uuid("actor_person_id").references(() => people.id),
    createdAt,
  },
  (table) => [
    index("credit_ledger_balance_idx").on(table.organizationId, table.personId),
    check("credit_ledger_positive", sql`${table.credits} > 0`),
  ],
);

export const membershipTiers = pgTable(
  "membership_tiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    code: varchar("code", { length: 64 }).notNull(),
    name: text("name").notNull(),
    priceMinor: integer("price_minor").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    interval: varchar("interval", { length: 16 }).notNull(),
    stripePriceId: varchar("stripe_price_id", { length: 128 }).unique(),
    benefits: jsonb("benefits")
      .notNull()
      .$type<readonly string[]>()
      .default([]),
    active: boolean("active").notNull().default(true),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("platform_membership_tier_code_unique")
      .on(table.code)
      .where(sql`${table.organizationId} IS NULL`),
    uniqueIndex("organization_membership_tier_code_unique")
      .on(table.organizationId, table.code)
      .where(sql`${table.organizationId} IS NOT NULL`),
    check("membership_tier_price_valid", sql`${table.priceMinor} >= 0`),
    check(
      "membership_tier_interval_valid",
      sql`${table.interval} IN ('month', 'year')`,
    ),
  ],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    tierId: uuid("tier_id")
      .notNull()
      .references(() => membershipTiers.id),
    status: varchar("status", { length: 24 }).notNull(),
    stripeSubscriptionId: varchar("stripe_subscription_id", {
      length: 128,
    }).unique(),
    currentPeriodStartsAt: timestamp("current_period_starts_at", {
      withTimezone: true,
      mode: "date",
    }),
    currentPeriodEndsAt: timestamp("current_period_ends_at", {
      withTimezone: true,
      mode: "date",
    }),
    pausedUntil: timestamp("paused_until", {
      withTimezone: true,
      mode: "date",
    }),
    pauseMonthsUsed: integer("pause_months_used").notNull().default(0),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("membership_person_status_idx").on(table.personId, table.status),
    check(
      "membership_pause_months_valid",
      sql`${table.pauseMonthsUsed} >= 0 AND ${table.pauseMonthsUsed} <= 4`,
    ),
  ],
);

export const walletAccounts = pgTable("wallet_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: uuid("person_id")
    .notNull()
    .references(() => people.id)
    .unique(),
  stripeAccountId: varchar("stripe_account_id", { length: 128 }).unique(),
  custodialGuardianPersonId: uuid("custodial_guardian_person_id").references(
    () => people.id,
  ),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  kycStatus: varchar("kyc_status", { length: 24 })
    .notNull()
    .default("not-started"),
  spendingBlocked: boolean("spending_blocked").notNull().default(false),
  payoutHeld: boolean("payout_held").notNull().default(false),
  createdAt,
  updatedAt,
});

export const walletLedger = pgTable(
  "wallet_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletAccountId: uuid("wallet_account_id")
      .notNull()
      .references(() => walletAccounts.id),
    direction: ledgerDirectionEnum("direction").notNull(),
    kind: walletEntryKindEnum("kind").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    status: ledgerStatusEnum("status").notNull(),
    taxCharacter: taxCharacterEnum("tax_character").notNull(),
    stripeBalanceTransactionId: varchar("stripe_balance_transaction_id", {
      length: 128,
    }).unique(),
    referenceType: varchar("reference_type", { length: 32 }),
    referenceId: uuid("reference_id"),
    reasonCode: varchar("reason_code", { length: 64 }).notNull(),
    availableAt: timestamp("available_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
  },
  (table) => [
    index("wallet_ledger_balance_idx").on(table.walletAccountId, table.status),
    check("wallet_ledger_positive", sql`${table.amountMinor} > 0`),
  ],
);

export const payouts = pgTable("payouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  walletAccountId: uuid("wallet_account_id").references(
    () => walletAccounts.id,
  ),
  organizationId: uuid("organization_id").references(() => organizations.id),
  stripePayoutId: varchar("stripe_payout_id", { length: 128 }).unique(),
  amountMinor: integer("amount_minor").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  status: varchar("status", { length: 24 }).notNull(),
  composition: jsonb("composition").notNull().$type<Record<string, number>>(),
  expectedArrivalAt: timestamp("expected_arrival_at", {
    withTimezone: true,
    mode: "date",
  }),
  createdAt,
  updatedAt,
});

export const disputes = pgTable("disputes", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id),
  orderId: uuid("order_id").references(() => orders.id),
  stripeDisputeId: varchar("stripe_dispute_id", { length: 128 }).unique(),
  kind: varchar("kind", { length: 32 }).notNull(),
  status: queueStatusEnum("status").notNull().default("open"),
  amountMinor: integer("amount_minor"),
  currency: varchar("currency", { length: 3 }),
  evidence: jsonb("evidence").notNull().$type<Record<string, unknown>>(),
  dueAt: timestamp("due_at", { withTimezone: true, mode: "date" }),
  assignedToPersonId: uuid("assigned_to_person_id").references(() => people.id),
  createdAt,
  updatedAt,
});

// Ticketing, waitlists, team claims, and affiliates
export const ticketGroups = pgTable("ticket_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  settings: jsonb("settings")
    .notNull()
    .$type<Record<string, unknown>>()
    .default({}),
  createdAt,
  updatedAt,
});

export const ticketTypes = pgTable(
  "ticket_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => ticketGroups.id),
    name: text("name").notNull(),
    description: text("description"),
    priceMinor: integer("price_minor").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    quantity: integer("quantity"),
    minimumPerOrder: integer("minimum_per_order").notNull().default(1),
    maximumPerOrder: integer("maximum_per_order").notNull().default(10),
    salesStartsAt: timestamp("sales_starts_at", {
      withTimezone: true,
      mode: "date",
    }),
    salesEndsAt: timestamp("sales_ends_at", {
      withTimezone: true,
      mode: "date",
    }),
    validityStartsAt: timestamp("validity_starts_at", {
      withTimezone: true,
      mode: "date",
    }),
    validityEndsAt: timestamp("validity_ends_at", {
      withTimezone: true,
      mode: "date",
    }),
    hidden: boolean("hidden").notNull().default(false),
    availableOnline: boolean("available_online").notNull().default(true),
    availableInPerson: boolean("available_in_person").notNull().default(false),
    waitlistEnabled: boolean("waitlist_enabled").notNull().default(false),
    passwordHash: text("password_hash"),
    approvalRequired: boolean("approval_required").notNull().default(false),
    transferability: varchar("transferability", { length: 24 })
      .notNull()
      .default("allowed"),
    manualSoldOut: boolean("manual_sold_out").notNull().default(false),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "ticket_hidden_password_exclusion",
      sql`NOT (${table.hidden} AND ${table.passwordHash} IS NOT NULL)`,
    ),
    check(
      "ticket_order_limits",
      sql`${table.minimumPerOrder} > 0 AND ${table.maximumPerOrder} >= ${table.minimumPerOrder}`,
    ),
    check(
      "ticket_quantity_positive",
      sql`${table.quantity} IS NULL OR ${table.quantity} > 0`,
    ),
    check(
      "ticket_sales_window_valid",
      sql`${table.salesStartsAt} IS NULL OR ${table.salesEndsAt} IS NULL OR ${table.salesEndsAt} > ${table.salesStartsAt}`,
    ),
    check(
      "ticket_validity_window_valid",
      sql`${table.validityStartsAt} IS NULL OR ${table.validityEndsAt} IS NULL OR ${table.validityEndsAt} > ${table.validityStartsAt}`,
    ),
  ],
);

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketTypeId: uuid("ticket_type_id")
      .notNull()
      .references(() => ticketTypes.id),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    ownerPersonId: uuid("owner_person_id")
      .notNull()
      .references(() => people.id),
    token: varchar("token", { length: 128 }).notNull().unique(),
    status: ticketStatusEnum("status").notNull(),
    scannedAt: timestamp("scanned_at", { withTimezone: true, mode: "date" }),
    scannedByPersonId: uuid("scanned_by_person_id").references(() => people.id),
    scannedDeviceId: varchar("scanned_device_id", { length: 128 }),
    createdAt,
    updatedAt,
  },
  (table) => [index("ticket_token_status_idx").on(table.token, table.status)],
);

export const ticketScanEvents = pgTable(
  "ticket_scan_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    scannedByPersonId: uuid("scanned_by_person_id")
      .notNull()
      .references(() => people.id),
    deviceId: varchar("device_id", { length: 128 }).notNull(),
    scannedAt: timestamp("scanned_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    receivedAt: timestamp("received_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    offline: boolean("offline").notNull().default(false),
    accepted: boolean("accepted").notNull(),
    duplicate: boolean("duplicate").notNull().default(false),
    reason: varchar("reason", { length: 48 }),
    createdAt,
  },
  (table) => [
    index("ticket_scan_event_ticket_idx").on(table.ticketId, table.scannedAt),
    uniqueIndex("ticket_scan_event_device_dedupe").on(
      table.ticketId,
      table.deviceId,
      table.scannedAt,
    ),
  ],
);

export const waitlistEntries = pgTable(
  "waitlist_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    position: integer("position").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("waiting"),
    promotedAt: timestamp("promoted_at", { withTimezone: true, mode: "date" }),
    holdExpiresAt: timestamp("hold_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("waitlist_session_person_unique").on(
      table.sessionId,
      table.personId,
    ),
    uniqueIndex("waitlist_session_position_unique").on(
      table.sessionId,
      table.position,
    ),
    check("waitlist_position_positive", sql`${table.position} > 0`),
    check(
      "waitlist_status_valid",
      sql`${table.status} IN ('waiting', 'offered', 'accepted', 'expired', 'cancelled')`,
    ),
  ],
);

export const teamEntries = pgTable(
  "team_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    registrationId: uuid("registration_id")
      .notNull()
      .references(() => registrations.id),
    payingPersonId: uuid("paying_person_id")
      .notNull()
      .references(() => people.id),
    partnerPersonId: uuid("partner_person_id").references(() => people.id),
    expectedTeamSize: integer("expected_team_size").notNull().default(2),
    paymentMode: varchar("payment_mode", { length: 16 })
      .notNull()
      .default("self"),
    roster: jsonb("roster")
      .notNull()
      .$type<
        readonly {
          readonly personId?: string;
          readonly inviteTarget?: string;
          readonly displayName?: string;
          readonly status: "selected" | "invited" | "claimed";
        }[]
      >()
      .default([]),
    status: varchar("status", { length: 24 }).notNull().default("assembling"),
    claimToken: varchar("claim_token", { length: 128 }).notNull().unique(),
    claimExpiresAt: timestamp("claim_expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true, mode: "date" }),
    rosterLockedAt: timestamp("roster_locked_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("team_entry_registration_unique").on(table.registrationId),
    check("team_entry_expected_size", sql`${table.expectedTeamSize} >= 2`),
    check(
      "team_entry_payment_mode",
      sql`${table.paymentMode} IN ('self', 'team')`,
    ),
    check(
      "team_entry_status",
      sql`${table.status} IN ('assembling', 'ready', 'confirmed', 'cancelled', 'expired')`,
    ),
  ],
);

export const promoCodes = pgTable(
  "promo_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 48 }).notNull(),
    discountType: varchar("discount_type", { length: 16 }).notNull(),
    discountValue: integer("discount_value").notNull(),
    redemptionCap: integer("redemption_cap"),
    redeemedCount: integer("redeemed_count").notNull().default(0),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }),
    active: boolean("active").notNull().default(true),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("promo_org_code_unique").on(table.organizationId, table.code),
  ],
);

export const affiliateOffers = pgTable("affiliate_offers", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  affiliatePersonId: uuid("affiliate_person_id").references(() => people.id),
  public: boolean("public").notNull().default(false),
  commissionType: varchar("commission_type", { length: 16 }).notNull(),
  commissionValue: integer("commission_value").notNull(),
  token: varchar("token", { length: 96 }).notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdAt,
  updatedAt,
});

// Messaging and social
export const consents = pgTable(
  "consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    scope: consentScopeEnum("scope").notNull(),
    granted: boolean("granted").notNull(),
    disclosureText: text("disclosure_text").notNull(),
    disclosureTextHash: varchar("disclosure_text_hash", {
      length: 128,
    }).notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: text("user_agent"),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("consent_person_scope_idx").on(table.personId, table.scope),
  ],
);

export const privacyRequests = pgTable(
  "privacy_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("queued"),
    reason: text("reason"),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("privacy_request_active_unique")
      .on(table.personId, table.kind)
      .where(
        sql`${table.status} IN ('queued', 'identity-review', 'legal-hold')`,
      ),
    check(
      "privacy_request_kind_valid",
      sql`${table.kind} IN ('account-deletion')`,
    ),
    check(
      "privacy_request_status_valid",
      sql`${table.status} IN ('queued', 'identity-review', 'legal-hold', 'completed', 'cancelled')`,
    ),
    check(
      "privacy_request_completion_valid",
      sql`${table.status} <> 'completed' OR ${table.completedAt} IS NOT NULL`,
    ),
  ],
);

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id),
  senderPersonId: uuid("sender_person_id").references(() => people.id),
  recipientPersonId: uuid("recipient_person_id")
    .notNull()
    .references(() => people.id),
  guardianCopyPersonIds: uuid("guardian_copy_person_ids")
    .array()
    .notNull()
    .default(sql`'{}'::uuid[]`),
  channel: messageChannelEnum("channel").notNull(),
  kind: varchar("kind", { length: 48 }).notNull(),
  consentId: uuid("consent_id").references(() => consents.id),
  subject: text("subject"),
  body: text("body").notNull(),
  status: varchar("status", { length: 24 }).notNull().default("queued"),
  providerMessageId: text("provider_message_id"),
  scheduledAt: timestamp("scheduled_at", {
    withTimezone: true,
    mode: "date",
  }),
  sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
  createdAt,
  updatedAt,
});

export const follows = pgTable(
  "follows",
  {
    followerPersonId: uuid("follower_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    entityType: varchar("entity_type", { length: 24 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    createdAt,
  },
  (table) => [
    primaryKey({
      columns: [table.followerPersonId, table.entityType, table.entityId],
    }),
  ],
);

export const pickupSessions = pgTable(
  "pickup_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hostPersonId: uuid("host_person_id")
      .notNull()
      .references(() => people.id),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    venueId: uuid("venue_id").references(() => venues.id),
    venueLabel: text("venue_label").notNull(),
    title: text("title").notNull(),
    format: varchar("format", { length: 24 }).notNull().default("4s"),
    note: text("note"),
    recordMatches: boolean("record_matches").notNull().default(true),
    startsAt: timestamp("starts_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    endsAt: timestamp("ends_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    capacity: integer("capacity").notNull(),
    ratingMinimum: doublePrecision("rating_minimum"),
    ratingMaximum: doublePrecision("rating_maximum"),
    visibility: varchar("visibility", { length: 24 })
      .notNull()
      .default("public"),
    costMinor: integer("cost_minor").notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("pickup_session_start_idx").on(table.startsAt),
    index("pickup_session_organization_idx").on(table.organizationId),
    check(
      "pickup_session_time_valid",
      sql`${table.endsAt} > ${table.startsAt}`,
    ),
    check("pickup_session_capacity_valid", sql`${table.capacity} > 1`),
    check("pickup_session_cost_valid", sql`${table.costMinor} >= 0`),
    check(
      "pickup_session_rating_range_valid",
      sql`(${table.ratingMinimum} IS NULL AND ${table.ratingMaximum} IS NULL) OR (${table.ratingMinimum} IS NOT NULL AND ${table.ratingMaximum} IS NOT NULL AND ${table.ratingMaximum} >= ${table.ratingMinimum})`,
    ),
    check(
      "pickup_session_visibility_valid",
      sql`${table.visibility} IN ('public', 'unlisted', 'private')`,
    ),
    check(
      "pickup_session_format_valid",
      sql`${table.format} IN ('2s', '4s', '6s', 'king-queen')`,
    ),
  ],
);

export const pickupParticipants = pgTable(
  "pickup_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pickupSessionId: uuid("pickup_session_id")
      .notNull()
      .references(() => pickupSessions.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    status: registrationStatusEnum("status").notNull().default("confirmed"),
    orderId: uuid("order_id").references(() => orders.id),
    holdExpiresAt: timestamp("hold_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("pickup_participant_session_person_unique").on(
      table.pickupSessionId,
      table.personId,
    ),
    uniqueIndex("pickup_participant_order_unique")
      .on(table.orderId)
      .where(sql`${table.orderId} IS NOT NULL`),
    index("pickup_participant_person_idx").on(table.personId, table.createdAt),
    check(
      "pickup_participant_pending_hold_required",
      sql`${table.status} <> 'pending' OR (${table.orderId} IS NOT NULL AND ${table.holdExpiresAt} IS NOT NULL)`,
    ),
  ],
);

export const threads = pgTable("threads", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityType: varchar("entity_type", { length: 24 }).notNull(),
  entityId: uuid("entity_id").notNull(),
  announcementOnly: boolean("announcement_only").notNull().default(false),
  createdAt,
  updatedAt,
});

export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id")
    .notNull()
    .references(() => threads.id, { onDelete: "cascade" }),
  authorPersonId: uuid("author_person_id")
    .notNull()
    .references(() => people.id),
  body: text("body").notNull(),
  mediaKeys: text("media_keys")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  hiddenAt: timestamp("hidden_at", { withTimezone: true, mode: "date" }),
  createdAt,
  updatedAt,
});

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporterPersonId: uuid("reporter_person_id")
    .notNull()
    .references(() => people.id),
  entityType: varchar("entity_type", { length: 24 }).notNull(),
  entityId: uuid("entity_id").notNull(),
  category: varchar("category", { length: 48 }).notNull(),
  details: text("details").notNull(),
  involvesMinor: boolean("involves_minor").notNull().default(false),
  status: queueStatusEnum("status").notNull().default("open"),
  assignedToPersonId: uuid("assigned_to_person_id").references(() => people.id),
  slaDueAt: timestamp("sla_due_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
  createdAt,
  updatedAt,
});

// Platform control plane, webhooks, idempotency, and AI risk gate
export const adminRoles = pgTable(
  "admin_roles",
  {
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 24 }).notNull(),
    scopes: text("scopes")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    grantedByPersonId: uuid("granted_by_person_id").references(() => people.id),
    grantedAt: timestamp("granted_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.personId, table.role] })],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id),
    actorPersonId: uuid("actor_person_id").references(() => people.id),
    actorType: varchar("actor_type", { length: 24 }).notNull(),
    action: varchar("action", { length: 96 }).notNull(),
    entityType: varchar("entity_type", { length: 48 }).notNull(),
    entityId: text("entity_id").notNull(),
    beforeHash: varchar("before_hash", { length: 128 }),
    afterHash: varchar("after_hash", { length: 128 }),
    reason: text("reason").notNull(),
    traceId: varchar("trace_id", { length: 128 }),
    conversationId: varchar("conversation_id", { length: 128 }),
    ipAddress: varchar("ip_address", { length: 64 }),
    createdAt,
  },
  (table) => [
    index("audit_entity_idx").on(table.entityType, table.entityId),
    index("audit_actor_idx").on(table.actorPersonId, table.createdAt),
  ],
);

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: varchar("key", { length: 160 }).notNull(),
    procedure: varchar("procedure", { length: 128 }).notNull(),
    personId: uuid("person_id").references(() => people.id),
    organizationId: uuid("organization_id").references(() => organizations.id),
    requestHash: varchar("request_hash", { length: 128 }).notNull(),
    resultHash: varchar("result_hash", { length: 128 }),
    result: jsonb("result").$type<Record<string, unknown>>(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("idempotency_procedure_key_unique").on(
      table.procedure,
      table.key,
    ),
  ],
);

export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  key: varchar("key", { length: 256 }).primaryKey(),
  tokens: doublePrecision("tokens").notNull(),
  capacity: integer("capacity").notNull(),
  refillPerSecond: doublePrecision("refill_per_second").notNull(),
  expiresAt: timestamp("expires_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
  createdAt,
  updatedAt,
});

export const workflowJobs = pgTable(
  "workflow_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: varchar("kind", { length: 128 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 192 }).notNull(),
    organizationId: uuid("organization_id").references(() => organizations.id),
    personId: uuid("person_id").references(() => people.id),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    status: varchar("status", { length: 24 }).notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maximumAttempts: integer("maximum_attempts").notNull().default(8),
    availableAt: timestamp("available_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true, mode: "date" }),
    lockToken: uuid("lock_token"),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastError: text("last_error"),
    traceId: varchar("trace_id", { length: 128 }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("workflow_kind_idempotency_unique").on(
      table.kind,
      table.idempotencyKey,
    ),
    index("workflow_ready_idx").on(
      table.status,
      table.availableAt,
      table.createdAt,
    ),
    check(
      "workflow_attempt_bounds",
      sql`${table.attempts} >= 0 AND ${table.maximumAttempts} > 0`,
    ),
  ],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: varchar("provider", { length: 24 }).notNull(),
    providerEventId: varchar("provider_event_id", { length: 192 }).notNull(),
    eventType: varchar("event_type", { length: 128 }).notNull(),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    signatureVerified: boolean("signature_verified").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("received"),
    attempts: integer("attempts").notNull().default(0),
    processedAt: timestamp("processed_at", {
      withTimezone: true,
      mode: "date",
    }),
    error: text("error"),
    createdAt,
  },
  (table) => [
    uniqueIndex("webhook_provider_event_unique").on(
      table.provider,
      table.providerEventId,
    ),
  ],
);

export const agentDrafts = pgTable("agent_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: uuid("person_id")
    .notNull()
    .references(() => people.id),
  organizationId: uuid("organization_id").references(() => organizations.id),
  conversationId: varchar("conversation_id", { length: 128 }).notNull(),
  toolName: varchar("tool_name", { length: 128 }).notNull(),
  riskTier: riskTierEnum("risk_tier").notNull(),
  inputHash: varchar("input_hash", { length: 128 }).notNull(),
  input: jsonb("input").notNull().$type<Record<string, unknown>>(),
  proposedDiff: jsonb("proposed_diff")
    .notNull()
    .$type<Record<string, unknown>>(),
  confirmationNonceHash: varchar("confirmation_nonce_hash", { length: 128 }),
  status: varchar("status", { length: 24 }).notNull().default("proposed"),
  confirmedByPersonId: uuid("confirmed_by_person_id").references(
    () => people.id,
  ),
  confirmedAt: timestamp("confirmed_at", {
    withTimezone: true,
    mode: "date",
  }),
  expiresAt: timestamp("expires_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
  createdAt,
  updatedAt,
});

export const featureFlags = pgTable(
  "feature_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: varchar("key", { length: 96 }).notNull(),
    organizationId: uuid("organization_id").references(() => organizations.id),
    market: varchar("market", { length: 96 }),
    enabled: boolean("enabled").notNull().default(false),
    configuration: jsonb("configuration")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    updatedByPersonId: uuid("updated_by_person_id").references(() => people.id),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("feature_flag_global_unique")
      .on(table.key)
      .where(sql`${table.organizationId} IS NULL AND ${table.market} IS NULL`),
    uniqueIndex("feature_flag_organization_unique")
      .on(table.key, table.organizationId)
      .where(
        sql`${table.organizationId} IS NOT NULL AND ${table.market} IS NULL`,
      ),
    uniqueIndex("feature_flag_market_unique")
      .on(table.key, table.market)
      .where(
        sql`${table.organizationId} IS NULL AND ${table.market} IS NOT NULL`,
      ),
    uniqueIndex("feature_flag_organization_market_unique")
      .on(table.key, table.organizationId, table.market)
      .where(
        sql`${table.organizationId} IS NOT NULL AND ${table.market} IS NOT NULL`,
      ),
  ],
);
