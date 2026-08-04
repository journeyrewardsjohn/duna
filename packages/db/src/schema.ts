import { sql } from "drizzle-orm";
import {
  bigint,
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
export const catalogItemTypeEnum = pgEnum("catalog_item_type", [
  "event",
  "service",
  "good",
  "plan",
]);
export const catalogStatusEnum = pgEnum("catalog_status", [
  "draft",
  "active",
  "archived",
]);
export const catalogAudienceEnum = pgEnum("catalog_audience", [
  "everyone",
  "member",
  "non-member",
]);
export const catalogPaymentKindEnum = pgEnum("catalog_payment_kind", [
  "card",
  "cash",
  "credit",
]);
export const inventoryPurposeEnum = pgEnum("inventory_purpose", [
  "sale",
  "rental",
  "coach-use",
  "operations",
]);
export const inventoryMovementKindEnum = pgEnum("inventory_movement_kind", [
  "receive",
  "sale",
  "rent-out",
  "rent-return",
  "coach-checkout",
  "coach-return",
  "adjustment",
  "damage",
  "retire",
]);
export const journalStatusEnum = pgEnum("journal_status", ["draft", "posted"]);
export const ledgerAccountTypeEnum = pgEnum("ledger_account_type", [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
  "memo",
]);
export const ledgerEntrySideEnum = pgEnum("ledger_entry_side", [
  "debit",
  "credit",
]);
export const ledgerUnitKindEnum = pgEnum("ledger_unit_kind", [
  "money",
  "organization-credit",
]);
export const reservationStatusEnum = pgEnum("resource_reservation_status", [
  "held",
  "confirmed",
  "released",
  "cancelled",
]);
export const calendarProviderEnum = pgEnum("calendar_provider", [
  "google",
  "apple",
  "ical",
]);

// Identity
export const people = pgTable(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workosUserId: varchar("workos_user_id", { length: 128 }).unique(),
    clerkUserId: varchar("clerk_user_id", { length: 128 }).unique(),
    phoneE164: varchar("phone_e164", { length: 24 }).unique(),
    email: text("email"),
    givenName: text("given_name"),
    familyName: text("family_name"),
    legalGivenName: text("legal_given_name"),
    legalMiddleName: text("legal_middle_name"),
    legalFamilyName: text("legal_family_name"),
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
    heightMillimeters: integer("height_millimeters"),
    playingExperience: varchar("playing_experience", { length: 24 })
      .notNull()
      .default("not-set"),
    playedIndoorPrior: boolean("played_indoor_prior"),
    yearsPlaying: integer("years_playing"),
    collegeName: text("college_name"),
    experienceSummary: text("experience_summary"),
    profileOnboardingStatus: varchar("profile_onboarding_status", {
      length: 24,
    })
      .notNull()
      .default("not-started"),
    profileOnboardingCompletedAt: timestamp("profile_onboarding_completed_at", {
      withTimezone: true,
      mode: "date",
    }),
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
    check(
      "people_height_valid",
      sql`${table.heightMillimeters} IS NULL OR ${table.heightMillimeters} BETWEEN 600 AND 2600`,
    ),
    check(
      "people_playing_experience_valid",
      sql`${table.playingExperience} IN ('not-set', 'amateur', 'high-school', 'collegiate', 'professional')`,
    ),
    check(
      "people_years_playing_valid",
      sql`${table.yearsPlaying} IS NULL OR ${table.yearsPlaying} BETWEEN 0 AND 100`,
    ),
    check(
      "people_profile_onboarding_status_valid",
      sql`${table.profileOnboardingStatus} IN ('not-started', 'in-progress', 'guardian-required', 'complete')`,
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

export const guardianInvitations = pgTable(
  "guardian_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    minorId: uuid("minor_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    createdByPersonId: uuid("created_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
    relationship: varchar("relationship", { length: 48 })
      .notNull()
      .default("Parent or legal guardian"),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    claimedByPersonId: uuid("claimed_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    claimedAt: timestamp("claimed_at", {
      withTimezone: true,
      mode: "date",
    }),
    cancelledAt: timestamp("cancelled_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("guardian_invitation_minor_status_idx").on(
      table.minorId,
      table.status,
      table.expiresAt,
    ),
    check(
      "guardian_invitation_status_valid",
      sql`${table.status} IN ('pending', 'claimed', 'expired', 'cancelled')`,
    ),
    check(
      "guardian_invitation_claim_state_valid",
      sql`(${table.status} = 'claimed' AND ${table.claimedByPersonId} IS NOT NULL AND ${table.claimedAt} IS NOT NULL) OR (${table.status} <> 'claimed')`,
    ),
  ],
);

export const identityVerificationSessions = pgTable(
  "identity_verification_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    requestedByPersonId: uuid("requested_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    provider: varchar("provider", { length: 24 }).notNull().default("stripe"),
    providerSessionId: varchar("provider_session_id", { length: 128 })
      .notNull()
      .unique(),
    purpose: varchar("purpose", { length: 24 }).notNull().default("payouts"),
    status: varchar("status", { length: 24 })
      .notNull()
      .default("requires-input"),
    livemode: boolean("livemode").notNull().default(false),
    lastErrorCode: varchar("last_error_code", { length: 96 }),
    verifiedAt: timestamp("verified_at", {
      withTimezone: true,
      mode: "date",
    }),
    submittedAt: timestamp("submitted_at", {
      withTimezone: true,
      mode: "date",
    }),
    redactedAt: timestamp("redacted_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("identity_verification_person_status_idx").on(
      table.personId,
      table.status,
      table.createdAt,
    ),
    check(
      "identity_verification_provider_valid",
      sql`${table.provider} IN ('stripe')`,
    ),
    check(
      "identity_verification_purpose_valid",
      sql`${table.purpose} IN ('payouts')`,
    ),
    check(
      "identity_verification_status_valid",
      sql`${table.status} IN ('requires-input', 'processing', 'verified', 'canceled', 'redacted')`,
    ),
  ],
);

export const playerSourceConnections = pgTable(
  "player_source_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 32 }).notNull(),
    externalPersonId: text("external_person_id").notNull(),
    profileUrl: text("profile_url").notNull(),
    apiProfileUrl: text("api_profile_url"),
    profileSnapshot: jsonb("profile_snapshot")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    verificationStatus: varchar("verification_status", { length: 24 })
      .notNull()
      .default("pending"),
    verifiedAt: timestamp("verified_at", {
      withTimezone: true,
      mode: "date",
    }),
    status: varchar("status", { length: 24 }).notNull().default("queued"),
    progressPhase: varchar("progress_phase", { length: 48 })
      .notNull()
      .default("queued"),
    progressCurrent: integer("progress_current").notNull().default(0),
    progressTotal: integer("progress_total").notNull().default(0),
    matchesFound: integer("matches_found").notNull().default(0),
    profilesFound: integer("profiles_found").notNull().default(0),
    lastProfileFetchedAt: timestamp("last_profile_fetched_at", {
      withTimezone: true,
      mode: "date",
    }),
    nextRefreshAt: timestamp("next_refresh_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastIngestionRunId: uuid("last_ingestion_run_id"),
    lastError: text("last_error"),
    lastSyncedAt: timestamp("last_synced_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("player_source_connection_person_source_unique").on(
      table.personId,
      table.source,
    ),
    uniqueIndex("player_source_connection_external_unique").on(
      table.source,
      table.externalPersonId,
    ),
    index("player_source_connection_status_idx").on(
      table.status,
      table.updatedAt,
    ),
    index("player_source_connection_refresh_idx").on(
      table.status,
      table.verificationStatus,
      table.nextRefreshAt,
    ),
    check(
      "player_source_connection_source_valid",
      sql`${table.source} IN ('volleyball-life', 'bvbinfo')`,
    ),
    check(
      "player_source_connection_status_valid",
      sql`${table.status} IN ('queued', 'syncing', 'linked', 'review-required', 'failed', 'disconnected')`,
    ),
    check(
      "player_source_connection_verification_valid",
      sql`${table.verificationStatus} IN ('pending', 'confirmed', 'rejected')`,
    ),
    check(
      "player_source_connection_progress_valid",
      sql`${table.progressCurrent} >= 0 AND ${table.progressTotal} >= 0 AND ${table.matchesFound} >= 0 AND ${table.profilesFound} >= 0`,
    ),
  ],
);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workosOrganizationId: varchar("workos_organization_id", {
      length: 128,
    }).unique(),
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
    addressLine1: text("address_line_1"),
    addressLine2: text("address_line_2"),
    locality: text("locality"),
    administrativeArea: text("administrative_area"),
    postalCode: varchar("postal_code", { length: 24 }),
    googlePlaceId: text("google_place_id"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    stripeTaxEnabled: boolean("stripe_tax_enabled").notNull().default(false),
    taxRegistrationStatus: varchar("tax_registration_status", { length: 24 })
      .notNull()
      .default("not-configured"),
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
    check(
      "organization_tax_status_valid",
      sql`${table.taxRegistrationStatus} IN ('not-configured', 'pending', 'active', 'restricted')`,
    ),
  ],
);

export const organizationDomains = pgTable(
  "organization_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    hostname: varchar("hostname", { length: 253 }).notNull(),
    kind: varchar("kind", { length: 24 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    isPrimary: boolean("is_primary").notNull().default(false),
    vercelProjectId: text("vercel_project_id"),
    vercelDomainId: text("vercel_domain_id"),
    verification: jsonb("verification")
      .notNull()
      .$type<readonly Record<string, unknown>[]>()
      .default([]),
    lastCheckedAt: timestamp("last_checked_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("organization_domain_hostname_unique").on(table.hostname),
    uniqueIndex("organization_domain_primary_unique")
      .on(table.organizationId)
      .where(sql`${table.isPrimary} = true`),
    index("organization_domain_status_idx").on(
      table.organizationId,
      table.status,
    ),
    check(
      "organization_domain_kind_valid",
      sql`${table.kind} IN ('duna-subdomain', 'custom', 'purchased')`,
    ),
    check(
      "organization_domain_status_valid",
      sql`${table.status} IN ('pending', 'verifying', 'active', 'failed', 'disabled')`,
    ),
  ],
);

export const organizationCommunicationSettings = pgTable(
  "organization_communication_settings",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    senderDisplayName: text("sender_display_name"),
    senderEmailLocalPart: varchar("sender_email_local_part", { length: 64 }),
    senderEmailDomain: varchar("sender_email_domain", { length: 253 }),
    senderEmail: varchar("sender_email", { length: 320 }),
    emailDomainStatus: varchar("email_domain_status", { length: 24 })
      .notNull()
      .default("not-configured"),
    emailDnsRecords: jsonb("email_dns_records")
      .notNull()
      .$type<
        readonly {
          type: string;
          name: string;
          value: string;
          status: string;
          priority?: number;
        }[]
      >()
      .default([]),
    messagingAddonStatus: varchar("messaging_addon_status", { length: 24 })
      .notNull()
      .default("disabled"),
    messagingPhoneNumber: varchar("messaging_phone_number", { length: 32 }),
    messagingSenderId: varchar("messaging_sender_id", { length: 64 }),
    smsEnabled: boolean("sms_enabled").notNull().default(false),
    rcsEnabled: boolean("rcs_enabled").notNull().default(false),
    whatsappEnabled: boolean("whatsapp_enabled").notNull().default(false),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 128 }),
    stripeMessagingItemId: varchar("stripe_messaging_item_id", {
      length: 128,
    }),
    stripeBoostItemId: varchar("stripe_boost_item_id", { length: 128 }),
    emailMessageLimit: integer("email_message_limit").notNull().default(1000),
    emailContactLimit: integer("email_contact_limit").notNull().default(100),
    messagingMessageLimit: integer("messaging_message_limit")
      .notNull()
      .default(1000),
    messagingContactLimit: integer("messaging_contact_limit")
      .notNull()
      .default(100),
    boostUnits: integer("boost_units").notNull().default(0),
    alertThresholdBps: integer("alert_threshold_bps").notNull().default(8000),
    softOverageBps: integer("soft_overage_bps").notNull().default(5000),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "organization_email_domain_status_valid",
      sql`${table.emailDomainStatus} IN ('not-configured', 'pending', 'verified', 'failed')`,
    ),
    check(
      "organization_messaging_addon_status_valid",
      sql`${table.messagingAddonStatus} IN ('disabled', 'trialing', 'active', 'past-due', 'cancelled')`,
    ),
    check(
      "organization_communication_limits_valid",
      sql`${table.emailMessageLimit} >= 0 AND ${table.emailContactLimit} >= 0 AND ${table.messagingMessageLimit} >= 0 AND ${table.messagingContactLimit} >= 0 AND ${table.boostUnits} >= 0`,
    ),
    check(
      "organization_communication_thresholds_valid",
      sql`${table.alertThresholdBps} BETWEEN 1 AND 10000 AND ${table.softOverageBps} BETWEEN 0 AND 10000`,
    ),
  ],
);

export const communicationUsagePeriods = pgTable(
  "communication_usage_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    periodStart: date("period_start", { mode: "date" }).notNull(),
    emailContacts: integer("email_contacts").notNull().default(0),
    emailMessages: integer("email_messages").notNull().default(0),
    messagingContacts: integer("messaging_contacts").notNull().default(0),
    smsMessages: integer("sms_messages").notNull().default(0),
    rcsMessages: integer("rcs_messages").notNull().default(0),
    whatsappMessages: integer("whatsapp_messages").notNull().default(0),
    pushMessages: integer("push_messages").notNull().default(0),
    delivered: integer("delivered").notNull().default(0),
    opened: integer("opened").notNull().default(0),
    clicked: integer("clicked").notNull().default(0),
    bounced: integer("bounced").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    converted: integer("converted").notNull().default(0),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("communication_usage_period_unique").on(
      table.organizationId,
      table.periodStart,
    ),
    check(
      "communication_usage_nonnegative",
      sql`${table.emailContacts} >= 0 AND ${table.emailMessages} >= 0 AND ${table.messagingContacts} >= 0 AND ${table.smsMessages} >= 0 AND ${table.rcsMessages} >= 0 AND ${table.whatsappMessages} >= 0 AND ${table.pushMessages} >= 0 AND ${table.delivered} >= 0 AND ${table.opened} >= 0 AND ${table.clicked} >= 0 AND ${table.bounced} >= 0 AND ${table.failed} >= 0 AND ${table.converted} >= 0`,
    ),
  ],
);

export const organizationThemes = pgTable(
  "organization_themes",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    brandDisplayName: text("brand_display_name"),
    membershipProgramName: text("membership_program_name"),
    logoUrl: text("logo_url"),
    markUrl: text("mark_url"),
    logoLightUrl: text("logo_light_url"),
    logoDarkUrl: text("logo_dark_url"),
    heroMediaType: varchar("hero_media_type", { length: 16 }),
    heroMediaUrl: text("hero_media_url"),
    heroPosterUrl: text("hero_poster_url"),
    tagline: text("tagline"),
    profileSummary: text("profile_summary"),
    brandVoice: text("brand_voice"),
    palette: jsonb("palette")
      .notNull()
      .$type<{
        primary: string;
        accent: string;
        sand: string;
        ink: string;
        canvas: string;
        success: string;
      }>()
      .default({
        primary: "#173A63",
        accent: "#2B67A4",
        sand: "#E9DFC9",
        ink: "#101828",
        canvas: "#FAFAF7",
        success: "#4E7C67",
      }),
    typography: jsonb("typography")
      .notNull()
      .$type<{ heading: string; body: string }>()
      .default({ heading: "Instrument Sans", body: "Archivo" }),
    fontLicenseConfirmed: boolean("font_license_confirmed")
      .notNull()
      .default(false),
    safeFallbackFont: text("safe_fallback_font")
      .notNull()
      .default("Arial, Helvetica, sans-serif"),
    cardStyle: varchar("card_style", { length: 24 }).notNull().default("soft"),
    profileLayout: varchar("profile_layout", { length: 24 })
      .notNull()
      .default("editorial"),
    socialLinks: jsonb("social_links")
      .notNull()
      .$type<readonly { label: string; url: string }[]>()
      .default([]),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "organization_theme_hero_type_valid",
      sql`${table.heroMediaType} IS NULL OR ${table.heroMediaType} IN ('image', 'video')`,
    ),
    check(
      "organization_theme_card_style_valid",
      sql`${table.cardStyle} IN ('soft', 'crisp', 'borderless')`,
    ),
    check(
      "organization_theme_profile_layout_valid",
      sql`${table.profileLayout} IN ('editorial', 'immersive', 'compact')`,
    ),
  ],
);

export const organizationBrandKnowledgeSources = pgTable(
  "organization_brand_knowledge_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    scope: varchar("scope", { length: 24 }).notNull().default("brand"),
    kind: varchar("kind", { length: 24 }).notNull(),
    title: text("title").notNull(),
    sourceUrl: text("source_url"),
    storageUrl: text("storage_url"),
    mimeType: varchar("mime_type", { length: 120 }),
    originalFilename: text("original_filename"),
    contentText: text("content_text"),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("ready"),
    approvedByPersonId: uuid("approved_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    approvedAt: timestamp("approved_at", {
      withTimezone: true,
      mode: "date",
    }),
    failureReason: text("failure_reason"),
    lastProcessedAt: timestamp("last_processed_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "organization_brand_knowledge_scope_valid",
      sql`${table.scope} IN ('brand', 'organization', 'venue', 'service', 'product')`,
    ),
    check(
      "organization_brand_knowledge_kind_valid",
      sql`${table.kind} IN ('note', 'link', 'document')`,
    ),
    check(
      "organization_brand_knowledge_status_valid",
      sql`${table.status} IN ('processing', 'ready', 'failed', 'archived')`,
    ),
    check(
      "organization_brand_knowledge_payload_present",
      sql`${table.contentText} IS NOT NULL OR ${table.sourceUrl} IS NOT NULL OR ${table.storageUrl} IS NOT NULL`,
    ),
    index("organization_brand_knowledge_status_idx").on(
      table.organizationId,
      table.status,
    ),
    index("organization_brand_knowledge_scope_idx").on(
      table.organizationId,
      table.scope,
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

export const organizationStaffProfiles = pgTable(
  "organization_staff_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    workerClassification: varchar("worker_classification", {
      length: 24,
    }).notNull(),
    compensationModel: varchar("compensation_model", { length: 24 })
      .notNull()
      .default("not-set"),
    hourlyRateMinor: integer("hourly_rate_minor"),
    profitShareBps: integer("profit_share_bps"),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    addressLine1: text("address_line_1"),
    addressLine2: text("address_line_2"),
    locality: text("locality"),
    administrativeArea: text("administrative_area"),
    postalCode: varchar("postal_code", { length: 24 }),
    countryCode: varchar("country_code", { length: 2 }).notNull().default("US"),
    googlePlaceId: text("google_place_id"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    availability: jsonb("availability")
      .notNull()
      .$type<readonly Record<string, unknown>[]>()
      .default([]),
    incomeGoalMinor: integer("income_goal_minor"),
    incomeGoalPeriod: varchar("income_goal_period", { length: 16 }),
    startedAt: date("started_at", { mode: "string" }),
    active: boolean("active").notNull().default(true),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("organization_staff_profile_unique").on(
      table.organizationId,
      table.personId,
    ),
    index("organization_staff_profile_org_active_idx").on(
      table.organizationId,
      table.active,
    ),
    check(
      "organization_staff_classification_valid",
      sql`${table.workerClassification} IN ('1099-contractor', 'w2-employee')`,
    ),
    check(
      "organization_staff_compensation_valid",
      sql`${table.compensationModel} IN ('not-set', 'hourly', 'profit-share', 'hourly-plus-profit-share')`,
    ),
    check(
      "organization_staff_hourly_rate_valid",
      sql`${table.hourlyRateMinor} IS NULL OR ${table.hourlyRateMinor} >= 0`,
    ),
    check(
      "organization_staff_profit_share_valid",
      sql`${table.profitShareBps} IS NULL OR ${table.profitShareBps} BETWEEN 0 AND 10000`,
    ),
    check(
      "organization_staff_income_goal_valid",
      sql`${table.incomeGoalMinor} IS NULL OR ${table.incomeGoalMinor} >= 0`,
    ),
    check(
      "organization_staff_goal_period_valid",
      sql`${table.incomeGoalPeriod} IS NULL OR ${table.incomeGoalPeriod} IN ('week', 'month', 'quarter', 'year')`,
    ),
  ],
);

export const organizationStaffInvitations = pgTable(
  "organization_staff_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invitedByPersonId: uuid("invited_by_person_id")
      .notNull()
      .references(() => people.id),
    inviteToken: varchar("invite_token", { length: 96 }).notNull().unique(),
    invitedName: text("invited_name").notNull(),
    invitedEmail: text("invited_email"),
    invitedPhoneE164: varchar("invited_phone_e164", { length: 24 }),
    role: varchar("role", { length: 24 }).notNull(),
    workerClassification: varchar("worker_classification", {
      length: 24,
    }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    deliveryChannel: varchar("delivery_channel", { length: 16 }),
    deliveryStatus: varchar("delivery_status", { length: 24 })
      .notNull()
      .default("not-configured"),
    deliveryMessageId: varchar("delivery_message_id", { length: 160 }),
    claimedByPersonId: uuid("claimed_by_person_id").references(() => people.id),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    claimedAt: timestamp("claimed_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("organization_staff_invitation_org_status_idx").on(
      table.organizationId,
      table.status,
      table.createdAt,
    ),
    check(
      "organization_staff_invitation_role_valid",
      sql`${table.role} IN ('coach', 'manager', 'front-desk', 'accountant')`,
    ),
    check(
      "organization_staff_invitation_classification_valid",
      sql`${table.workerClassification} IN ('1099-contractor', 'w2-employee')`,
    ),
    check(
      "organization_staff_invitation_status_valid",
      sql`${table.status} IN ('pending', 'claimed', 'expired', 'cancelled')`,
    ),
    check(
      "organization_staff_invitation_destination_present",
      sql`${table.invitedEmail} IS NOT NULL OR ${table.invitedPhoneE164} IS NOT NULL`,
    ),
  ],
);

export const organizationParticipants = pgTable(
  "organization_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    relationship: varchar("relationship", { length: 24 })
      .notNull()
      .default("player"),
    status: varchar("status", { length: 24 }).notNull().default("active"),
    addedByPersonId: uuid("added_by_person_id").references(() => people.id),
    joinedAt: timestamp("joined_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("organization_participant_unique").on(
      table.organizationId,
      table.personId,
      table.relationship,
    ),
    index("organization_participant_person_idx").on(table.personId),
    check(
      "organization_participant_relationship_valid",
      sql`${table.relationship} IN ('player', 'member', 'guardian')`,
    ),
    check(
      "organization_participant_status_valid",
      sql`${table.status} IN ('active', 'inactive', 'pending')`,
    ),
  ],
);

export const organizationInvitations = pgTable(
  "organization_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invitedByPersonId: uuid("invited_by_person_id")
      .notNull()
      .references(() => people.id),
    inviteToken: varchar("invite_token", { length: 96 }).notNull().unique(),
    relationship: varchar("relationship", { length: 24 })
      .notNull()
      .default("player"),
    invitedName: text("invited_name").notNull(),
    invitedEmail: text("invited_email"),
    invitedPhoneE164: varchar("invited_phone_e164", { length: 24 }),
    isMinor: boolean("is_minor").notNull().default(false),
    guardianName: text("guardian_name"),
    guardianEmail: text("guardian_email"),
    guardianPhoneE164: varchar("guardian_phone_e164", { length: 24 }),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    deliveryChannel: varchar("delivery_channel", { length: 16 }),
    deliveryStatus: varchar("delivery_status", { length: 24 })
      .notNull()
      .default("not-configured"),
    deliveryMessageId: varchar("delivery_message_id", { length: 160 }),
    claimedByPersonId: uuid("claimed_by_person_id").references(() => people.id),
    claimedPersonId: uuid("claimed_person_id").references(() => people.id),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    claimedAt: timestamp("claimed_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("organization_invitation_org_status_idx").on(
      table.organizationId,
      table.status,
      table.createdAt,
    ),
    check(
      "organization_invitation_relationship_valid",
      sql`${table.relationship} IN ('player', 'member')`,
    ),
    check(
      "organization_invitation_status_valid",
      sql`${table.status} IN ('pending', 'claimed', 'expired', 'cancelled')`,
    ),
    check(
      "organization_invitation_delivery_status_valid",
      sql`${table.deliveryStatus} IN ('not-configured', 'queued', 'sent', 'failed')`,
    ),
    check(
      "organization_invitation_destination_present",
      sql`${table.invitedEmail} IS NOT NULL OR ${table.invitedPhoneE164} IS NOT NULL OR ${table.guardianEmail} IS NOT NULL OR ${table.guardianPhoneE164} IS NOT NULL`,
    ),
    check(
      "organization_invitation_minor_guardian_present",
      sql`NOT ${table.isMinor} OR ${table.guardianEmail} IS NOT NULL OR ${table.guardianPhoneE164} IS NOT NULL`,
    ),
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
    description: text("description"),
    status: venueStatusEnum("status").notNull().default("draft"),
    temporary: boolean("temporary").notNull().default(false),
    capacity: integer("capacity").notNull().default(0),
    heroImageUrl: text("hero_image_url"),
    heroImageTreatmentUrl: text("hero_image_treatment_url"),
    amenities: text("amenities")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    addressLine1: text("address_line_1"),
    addressLine2: text("address_line_2"),
    locality: text("locality"),
    administrativeArea: text("administrative_area"),
    postalCode: varchar("postal_code", { length: 24 }),
    countryCode: varchar("country_code", { length: 2 }).notNull().default("US"),
    googlePlaceId: text("google_place_id"),
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
    check("venue_capacity_nonnegative", sql`${table.capacity} >= 0`),
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
    imageUrl: text("image_url"),
    lit: boolean("lit").notNull().default(false),
    capacity: integer("capacity").notNull().default(12),
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
    durationOptionsMinutes: integer("duration_options_minutes")
      .array()
      .notNull()
      .default(sql`ARRAY[60, 90, 120]::integer[]`),
    bookingIncrementMinutes: integer("booking_increment_minutes")
      .notNull()
      .default(30),
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
    check("court_capacity_positive", sql`${table.capacity} > 0`),
    check(
      "court_booking_increment_valid",
      sql`${table.bookingIncrementMinutes} BETWEEN 5 AND 240`,
    ),
    check(
      "court_duration_options_valid",
      sql`cardinality(${table.durationOptionsMinutes}) > 0 AND 0 < ALL(${table.durationOptionsMinutes})`,
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

export const eventImpressions = pgTable(
  "event_impressions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    viewerPersonId: uuid("viewer_person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    anonymousId: varchar("anonymous_id", { length: 128 }),
    surface: varchar("surface", { length: 24 }).notNull(),
    placement: varchar("placement", { length: 64 })
      .notNull()
      .default("event-page"),
    source: varchar("source", { length: 120 }),
    campaignId: uuid("campaign_id"),
    dedupeKey: varchar("dedupe_key", { length: 192 }).notNull(),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    createdAt,
  },
  (table) => [
    uniqueIndex("event_impression_dedupe_unique").on(table.dedupeKey),
    index("event_impression_session_time_idx").on(
      table.sessionId,
      table.occurredAt,
    ),
    index("event_impression_campaign_idx").on(
      table.campaignId,
      table.occurredAt,
    ),
    check(
      "event_impression_surface_valid",
      sql`${table.surface} IN ('web', 'player-app', 'pro-app', 'hq')`,
    ),
    check(
      "event_impression_viewer_present",
      sql`${table.viewerPersonId} IS NOT NULL OR ${table.anonymousId} IS NOT NULL`,
    ),
  ],
);

// Organization catalog: events, services, goods, and plans share one sellable model.
export const catalogItems = pgTable(
  "catalog_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    type: catalogItemTypeEnum("type").notNull(),
    subtype: varchar("subtype", { length: 48 }).notNull(),
    slug: varchar("slug", { length: 96 }).notNull(),
    title: text("title").notNull(),
    shortSummary: text("short_summary"),
    description: text("description"),
    status: catalogStatusEnum("status").notNull().default("draft"),
    visibility: varchar("visibility", { length: 24 })
      .notNull()
      .default("public"),
    taxable: boolean("taxable").notNull().default(true),
    stripeTaxCode: varchar("stripe_tax_code", { length: 64 }),
    allowCard: boolean("allow_card").notNull().default(true),
    allowCash: boolean("allow_cash").notNull().default(false),
    allowCredits: boolean("allow_credits").notNull().default(false),
    membershipRequired: boolean("membership_required").notNull().default(false),
    defaultFulfillment: varchar("default_fulfillment", { length: 32 })
      .notNull()
      .default("registration"),
    configuration: jsonb("configuration")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    createdByPersonId: uuid("created_by_person_id").references(() => people.id),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("catalog_item_org_slug_unique").on(
      table.organizationId,
      table.slug,
    ),
    index("catalog_item_org_type_status_idx").on(
      table.organizationId,
      table.type,
      table.status,
    ),
    check(
      "catalog_item_visibility_valid",
      sql`${table.visibility} IN ('public', 'members', 'private')`,
    ),
    check(
      "catalog_item_subtype_valid",
      sql`(${table.type} = 'event' AND ${table.subtype} IN ('tournament', 'league', 'clinic', 'open-play', 'pickup')) OR (${table.type} = 'service' AND ${table.subtype} IN ('private-lesson', 'group-lesson', 'program', 'court-rental', 'assessment', 'other')) OR (${table.type} = 'good' AND ${table.subtype} IN ('apparel', 'equipment', 'rental', 'swag', 'consumable', 'other')) OR (${table.type} = 'plan' AND ${table.subtype} IN ('membership', 'credit-pack'))`,
    ),
    check(
      "catalog_item_payment_method",
      sql`${table.allowCard} OR ${table.allowCash} OR ${table.allowCredits}`,
    ),
  ],
);

export const catalogOptions = pgTable(
  "catalog_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    catalogItemId: uuid("catalog_item_id")
      .notNull()
      .references(() => catalogItems.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 48 }).notNull(),
    name: text("name").notNull(),
    values: jsonb("values").notNull().$type<readonly string[]>(),
    required: boolean("required").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("catalog_option_item_code_unique").on(
      table.catalogItemId,
      table.code,
    ),
    index("catalog_option_org_item_idx").on(
      table.organizationId,
      table.catalogItemId,
    ),
    check(
      "catalog_option_values_present",
      sql`jsonb_array_length(${table.values}) > 0`,
    ),
  ],
);

export const catalogVariants = pgTable(
  "catalog_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    catalogItemId: uuid("catalog_item_id")
      .notNull()
      .references(() => catalogItems.id, { onDelete: "cascade" }),
    sku: varchar("sku", { length: 96 }),
    title: text("title").notNull(),
    optionCoordinates: jsonb("option_coordinates")
      .notNull()
      .$type<Record<string, string>>()
      .default({}),
    status: catalogStatusEnum("status").notNull().default("active"),
    barcode: varchar("barcode", { length: 96 }),
    weightGrams: integer("weight_grams"),
    stripeProductId: varchar("stripe_product_id", { length: 128 }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("catalog_variant_item_sku_unique")
      .on(table.catalogItemId, table.sku)
      .where(sql`${table.sku} IS NOT NULL`),
    index("catalog_variant_org_item_idx").on(
      table.organizationId,
      table.catalogItemId,
    ),
    index("catalog_variant_options_gin_idx").using(
      "gin",
      table.optionCoordinates,
    ),
    check(
      "catalog_variant_weight_nonnegative",
      sql`${table.weightGrams} IS NULL OR ${table.weightGrams} >= 0`,
    ),
  ],
);

export const catalogPrices = pgTable(
  "catalog_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    catalogItemId: uuid("catalog_item_id")
      .notNull()
      .references(() => catalogItems.id, { onDelete: "cascade" }),
    catalogVariantId: uuid("catalog_variant_id").references(
      () => catalogVariants.id,
      { onDelete: "cascade" },
    ),
    audience: catalogAudienceEnum("audience").notNull().default("everyone"),
    paymentKind: catalogPaymentKindEnum("payment_kind").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }),
    currency: varchar("currency", { length: 3 }),
    creditAmount: integer("credit_amount"),
    recurringInterval: varchar("recurring_interval", { length: 16 }),
    recurringIntervalCount: integer("recurring_interval_count"),
    stripePriceId: varchar("stripe_price_id", { length: 128 }).unique(),
    taxBehavior: varchar("tax_behavior", { length: 16 })
      .notNull()
      .default("exclusive"),
    active: boolean("active").notNull().default(true),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("catalog_price_org_item_idx").on(
      table.organizationId,
      table.catalogItemId,
      table.active,
    ),
    check(
      "catalog_price_value_valid",
      sql`(${table.paymentKind} = 'credit' AND ${table.creditAmount} > 0 AND ${table.amountMinor} IS NULL AND ${table.currency} IS NULL) OR (${table.paymentKind} IN ('card', 'cash') AND ${table.amountMinor} >= 0 AND ${table.currency} IS NOT NULL AND ${table.creditAmount} IS NULL)`,
    ),
    check(
      "catalog_price_currency_uppercase",
      sql`${table.currency} IS NULL OR ${table.currency} = upper(${table.currency})`,
    ),
    check(
      "catalog_price_recurring_valid",
      sql`(${table.recurringInterval} IS NULL AND ${table.recurringIntervalCount} IS NULL) OR (${table.recurringInterval} IN ('week', 'month', 'year') AND ${table.recurringIntervalCount} > 0)`,
    ),
    check(
      "catalog_price_window_valid",
      sql`${table.startsAt} IS NULL OR ${table.endsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`,
    ),
  ],
);

export const catalogMedia = pgTable(
  "catalog_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    catalogItemId: uuid("catalog_item_id")
      .notNull()
      .references(() => catalogItems.id, { onDelete: "cascade" }),
    catalogVariantId: uuid("catalog_variant_id").references(
      () => catalogVariants.id,
      { onDelete: "cascade" },
    ),
    kind: varchar("kind", { length: 16 }).notNull(),
    url: text("url").notNull(),
    posterUrl: text("poster_url"),
    alt: text("alt"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt,
  },
  (table) => [
    index("catalog_media_org_item_idx").on(
      table.organizationId,
      table.catalogItemId,
    ),
    check("catalog_media_kind_valid", sql`${table.kind} IN ('image', 'video')`),
  ],
);

export const catalogEntitlements = pgTable(
  "catalog_entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    planCatalogItemId: uuid("plan_catalog_item_id")
      .notNull()
      .references(() => catalogItems.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 32 }).notNull(),
    targetCatalogItemId: uuid("target_catalog_item_id").references(
      () => catalogItems.id,
      { onDelete: "cascade" },
    ),
    quantity: integer("quantity"),
    configuration: jsonb("configuration")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    createdAt,
  },
  (table) => [
    index("catalog_entitlement_org_plan_idx").on(
      table.organizationId,
      table.planCatalogItemId,
    ),
    check(
      "catalog_entitlement_kind_valid",
      sql`${table.kind} IN ('membership-access', 'credit-grant', 'discount', 'priority-booking', 'included-item')`,
    ),
    check(
      "catalog_entitlement_quantity_positive",
      sql`${table.quantity} IS NULL OR ${table.quantity} > 0`,
    ),
  ],
);

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

export const catalogSessionLinks = pgTable(
  "catalog_session_links",
  {
    catalogItemId: uuid("catalog_item_id")
      .notNull()
      .references(() => catalogItems.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    divisionId: uuid("division_id").references(() => divisions.id, {
      onDelete: "cascade",
    }),
    relationship: varchar("relationship", { length: 24 })
      .notNull()
      .default("primary"),
    createdAt,
  },
  (table) => [
    primaryKey({ columns: [table.catalogItemId, table.sessionId] }),
    index("catalog_session_link_session_idx").on(table.sessionId),
    check(
      "catalog_session_link_relationship_valid",
      sql`${table.relationship} IN ('primary', 'entry', 'ticket', 'upsell')`,
    ),
  ],
);

export const inventoryLocations = pgTable(
  "inventory_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id").references(() => venues.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    kind: varchar("kind", { length: 24 }).notNull().default("venue"),
    active: boolean("active").notNull().default(true),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("inventory_location_org_name_unique").on(
      table.organizationId,
      table.name,
    ),
    index("inventory_location_org_active_idx").on(
      table.organizationId,
      table.active,
    ),
    check(
      "inventory_location_kind_valid",
      sql`${table.kind} IN ('venue', 'warehouse', 'vehicle', 'coach-kit', 'virtual')`,
    ),
  ],
);

export const inventoryStockItems = pgTable(
  "inventory_stock_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    catalogVariantId: uuid("catalog_variant_id")
      .notNull()
      .references(() => catalogVariants.id, { onDelete: "cascade" }),
    inventoryLocationId: uuid("inventory_location_id")
      .notNull()
      .references(() => inventoryLocations.id, { onDelete: "cascade" }),
    purpose: inventoryPurposeEnum("purpose").notNull(),
    trackingMode: varchar("tracking_mode", { length: 16 })
      .notNull()
      .default("quantity"),
    quantityOnHand: integer("quantity_on_hand").notNull().default(0),
    quantityReserved: integer("quantity_reserved").notNull().default(0),
    reorderPoint: integer("reorder_point").notNull().default(0),
    serialNumber: varchar("serial_number", { length: 128 }),
    assetTag: varchar("asset_tag", { length: 96 }),
    condition: varchar("condition", { length: 24 }).notNull().default("good"),
    unitCostMinor: bigint("unit_cost_minor", { mode: "number" }),
    currency: varchar("currency", { length: 3 }),
    acquiredAt: date("acquired_at", { mode: "string" }),
    vendorName: text("vendor_name"),
    vendorReference: text("vendor_reference"),
    receiptUrl: text("receipt_url"),
    placedInServiceAt: date("placed_in_service_at", { mode: "string" }),
    depreciationMethod: varchar("depreciation_method", { length: 32 }),
    usefulLifeMonths: integer("useful_life_months"),
    salvageValueMinor: bigint("salvage_value_minor", { mode: "number" }),
    taxAssetClass: varchar("tax_asset_class", { length: 64 }),
    retiredAt: date("retired_at", { mode: "string" }),
    notes: text("notes"),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("inventory_stock_org_location_idx").on(
      table.organizationId,
      table.inventoryLocationId,
      table.purpose,
    ),
    index("inventory_stock_org_variant_idx").on(
      table.organizationId,
      table.catalogVariantId,
    ),
    uniqueIndex("inventory_stock_org_serial_unique")
      .on(table.organizationId, table.serialNumber)
      .where(sql`${table.serialNumber} IS NOT NULL`),
    uniqueIndex("inventory_stock_org_asset_tag_unique")
      .on(table.organizationId, table.assetTag)
      .where(sql`${table.assetTag} IS NOT NULL`),
    check(
      "inventory_stock_quantities_valid",
      sql`${table.quantityOnHand} >= 0 AND ${table.quantityReserved} >= 0 AND ${table.quantityReserved} <= ${table.quantityOnHand} AND ${table.reorderPoint} >= 0`,
    ),
    check(
      "inventory_stock_tracking_mode_valid",
      sql`${table.trackingMode} IN ('quantity', 'serialized')`,
    ),
    check(
      "inventory_stock_serialized_quantity",
      sql`${table.trackingMode} <> 'serialized' OR (${table.quantityOnHand} <= 1 AND ${table.serialNumber} IS NOT NULL)`,
    ),
    check(
      "inventory_stock_acquisition_amounts",
      sql`${table.unitCostMinor} IS NULL OR (${table.unitCostMinor} >= 0 AND ${table.currency} IS NOT NULL)`,
    ),
    check(
      "inventory_stock_depreciation_valid",
      sql`${table.depreciationMethod} IS NULL OR ${table.depreciationMethod} IN ('straight-line', 'declining-balance', 'section-179', 'bonus', 'none')`,
    ),
    check(
      "inventory_stock_useful_life_positive",
      sql`${table.usefulLifeMonths} IS NULL OR ${table.usefulLifeMonths} > 0`,
    ),
  ],
);

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    inventoryStockItemId: uuid("inventory_stock_item_id")
      .notNull()
      .references(() => inventoryStockItems.id),
    kind: inventoryMovementKindEnum("kind").notNull(),
    quantityDelta: integer("quantity_delta").notNull(),
    unitCostMinor: bigint("unit_cost_minor", { mode: "number" }),
    currency: varchar("currency", { length: 3 }),
    sourceType: varchar("source_type", { length: 32 }),
    sourceId: text("source_id"),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    actorPersonId: uuid("actor_person_id").references(() => people.id),
    reason: text("reason").notNull(),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("inventory_movement_org_idempotency_unique").on(
      table.organizationId,
      table.idempotencyKey,
    ),
    index("inventory_movement_org_stock_time_idx").on(
      table.organizationId,
      table.inventoryStockItemId,
      table.occurredAt,
    ),
    check("inventory_movement_nonzero", sql`${table.quantityDelta} <> 0`),
  ],
);

export const inventoryReservations = pgTable(
  "inventory_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    inventoryStockItemId: uuid("inventory_stock_item_id")
      .notNull()
      .references(() => inventoryStockItems.id),
    quantity: integer("quantity").notNull(),
    startsAt: timestamp("starts_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    endsAt: timestamp("ends_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    sourceType: varchar("source_type", { length: 32 }).notNull(),
    sourceId: text("source_id").notNull(),
    status: reservationStatusEnum("status").notNull().default("held"),
    heldUntil: timestamp("held_until", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("inventory_reservation_org_stock_time_idx").on(
      table.organizationId,
      table.inventoryStockItemId,
      table.startsAt,
    ),
    check(
      "inventory_reservation_quantity_positive",
      sql`${table.quantity} > 0`,
    ),
    check(
      "inventory_reservation_time_valid",
      sql`${table.endsAt} > ${table.startsAt}`,
    ),
  ],
);

export const resourceReservations = pgTable(
  "resource_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    resourceType: varchar("resource_type", { length: 24 }).notNull(),
    resourceId: uuid("resource_id").notNull(),
    startsAt: timestamp("starts_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    endsAt: timestamp("ends_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    quantity: integer("quantity").notNull().default(1),
    exclusive: boolean("exclusive").notNull().default(true),
    sourceType: varchar("source_type", { length: 32 }).notNull(),
    sourceId: text("source_id").notNull(),
    status: reservationStatusEnum("status").notNull().default("held"),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    heldUntil: timestamp("held_until", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("resource_reservation_org_idempotency_unique").on(
      table.organizationId,
      table.idempotencyKey,
    ),
    index("resource_reservation_org_resource_time_idx").on(
      table.organizationId,
      table.resourceType,
      table.resourceId,
      table.startsAt,
    ),
    check(
      "resource_reservation_type_valid",
      sql`${table.resourceType} IN ('court', 'coach', 'equipment')`,
    ),
    check(
      "resource_reservation_time_valid",
      sql`${table.endsAt} > ${table.startsAt}`,
    ),
    check("resource_reservation_quantity_positive", sql`${table.quantity} > 0`),
  ],
);

export const calendarConnections = pgTable(
  "calendar_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    provider: calendarProviderEnum("provider").notNull(),
    externalAccountId: text("external_account_id").notNull(),
    credentialReference: text("credential_reference").notNull(),
    selectedCalendarIds: jsonb("selected_calendar_ids")
      .notNull()
      .$type<readonly string[]>()
      .default([]),
    syncDirection: varchar("sync_direction", { length: 16 })
      .notNull()
      .default("two-way"),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    syncToken: text("sync_token"),
    lastSyncedAt: timestamp("last_synced_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastError: text("last_error"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("calendar_connection_org_person_provider_unique").on(
      table.organizationId,
      table.personId,
      table.provider,
      table.externalAccountId,
    ),
    index("calendar_connection_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
    check(
      "calendar_connection_direction_valid",
      sql`${table.syncDirection} IN ('busy-only', 'duna-to-external', 'two-way')`,
    ),
    check(
      "calendar_connection_status_valid",
      sql`${table.status} IN ('pending', 'active', 'reauthorization-required', 'paused', 'revoked')`,
    ),
  ],
);

export const calendarBusyBlocks = pgTable(
  "calendar_busy_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    calendarConnectionId: uuid("calendar_connection_id")
      .notNull()
      .references(() => calendarConnections.id, { onDelete: "cascade" }),
    externalEventId: text("external_event_id").notNull(),
    startsAt: timestamp("starts_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    endsAt: timestamp("ends_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    transparency: varchar("transparency", { length: 16 })
      .notNull()
      .default("busy"),
    sourceUpdatedAt: timestamp("source_updated_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("calendar_busy_connection_event_unique").on(
      table.calendarConnectionId,
      table.externalEventId,
    ),
    index("calendar_busy_org_time_idx").on(
      table.organizationId,
      table.startsAt,
      table.endsAt,
    ),
    check("calendar_busy_time_valid", sql`${table.endsAt} > ${table.startsAt}`),
    check(
      "calendar_busy_transparency_valid",
      sql`${table.transparency} IN ('busy', 'free')`,
    ),
  ],
);

export const calendarChangeProposals = pgTable(
  "calendar_change_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    originalStartsAt: timestamp("original_starts_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    originalEndsAt: timestamp("original_ends_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    proposedStartsAt: timestamp("proposed_starts_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    proposedEndsAt: timestamp("proposed_ends_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    proposedCourtId: uuid("proposed_court_id").references(() => courts.id),
    proposedCoachPersonId: uuid("proposed_coach_person_id").references(
      () => people.id,
    ),
    conflictSummary: jsonb("conflict_summary").notNull().$type<{
      conflicts: readonly string[];
      notifications: number;
      reservations: number;
    }>(),
    status: varchar("status", { length: 24 }).notNull().default("proposed"),
    createdByPersonId: uuid("created_by_person_id")
      .notNull()
      .references(() => people.id),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    confirmedAt: timestamp("confirmed_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("calendar_change_org_status_idx").on(
      table.organizationId,
      table.status,
      table.createdAt,
    ),
    check(
      "calendar_change_time_valid",
      sql`${table.originalEndsAt} > ${table.originalStartsAt} AND ${table.proposedEndsAt} > ${table.proposedStartsAt}`,
    ),
    check(
      "calendar_change_status_valid",
      sql`${table.status} IN ('proposed', 'confirmed', 'rejected', 'expired')`,
    ),
  ],
);

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
    ratingEvidence: jsonb("rating_evidence").$type<Record<string, unknown>>(),
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

export const matchHistoryDisputes = pgTable(
  "match_history_disputes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    reasonCode: varchar("reason_code", { length: 32 }).notNull(),
    details: text("details"),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    excludesFromRating: boolean("excludes_from_rating").notNull().default(true),
    reviewedByPersonId: uuid("reviewed_by_person_id").references(
      () => people.id,
    ),
    reviewedAt: timestamp("reviewed_at", {
      withTimezone: true,
      mode: "date",
    }),
    resolutionNotes: text("resolution_notes"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("match_history_dispute_person_match_unique").on(
      table.personId,
      table.matchId,
    ),
    index("match_history_dispute_review_idx").on(table.status, table.createdAt),
    check(
      "match_history_dispute_reason_valid",
      sql`${table.reasonCode} IN ('not-me', 'wrong-score', 'wrong-opponents', 'duplicate', 'other')`,
    ),
    check(
      "match_history_dispute_status_valid",
      sql`${table.status} IN ('pending', 'upheld', 'rejected', 'withdrawn')`,
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
    reportedByPersonId: uuid("reported_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
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
    index("rally_event_match_reporter_idx").on(
      table.matchId,
      table.reportedByPersonId,
    ),
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
    paymentMode: varchar("payment_mode", { length: 16 })
      .notNull()
      .default("full"),
    totalAmountMinor: integer("total_amount_minor").notNull().default(0),
    fundedAmountMinor: integer("funded_amount_minor").notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    participantTarget: integer("participant_target").notNull().default(1),
    policySnapshot: jsonb("policy_snapshot")
      .notNull()
      .$type<{
        readonly title: string;
        readonly markdown: string;
        readonly refundBeforeHours?: number;
        readonly creditBeforeHours?: number;
        readonly lateCancellation?: string;
        readonly requireFullScroll: boolean;
      }>()
      .default({
        title: "Reservation cancellation policy",
        markdown: "",
        requireFullScroll: false,
      }),
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
    check(
      "court_booking_payment_mode",
      sql`${table.paymentMode} IN ('full', 'split')`,
    ),
    check(
      "court_booking_funding_valid",
      sql`${table.totalAmountMinor} >= 0 AND ${table.fundedAmountMinor} >= 0 AND ${table.fundedAmountMinor} <= ${table.totalAmountMinor}`,
    ),
    check(
      "court_booking_participant_target",
      sql`${table.participantTarget} > 0`,
    ),
  ],
);

export const courtBookingParticipants = pgTable(
  "court_booking_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => courtBookings.id, { onDelete: "cascade" }),
    personId: uuid("person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    invitedName: text("invited_name"),
    invitedEmail: text("invited_email"),
    invitedPhoneE164: varchar("invited_phone_e164", { length: 24 }),
    inviteToken: varchar("invite_token", { length: 96 }).notNull().unique(),
    role: varchar("role", { length: 24 }).notNull().default("player"),
    status: varchar("status", { length: 24 }).notNull().default("invited"),
    shareAmountMinor: integer("share_amount_minor").notNull().default(0),
    orderId: uuid("order_id").references(() => orders.id),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
    acceptedAt: timestamp("accepted_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("court_booking_participant_person_unique")
      .on(table.bookingId, table.personId)
      .where(sql`${table.personId} IS NOT NULL`),
    uniqueIndex("court_booking_participant_order_unique")
      .on(table.orderId)
      .where(sql`${table.orderId} IS NOT NULL`),
    index("court_booking_participant_booking_idx").on(
      table.bookingId,
      table.status,
    ),
    check(
      "court_booking_participant_identity",
      sql`${table.personId} IS NOT NULL OR ${table.invitedEmail} IS NOT NULL OR ${table.invitedPhoneE164} IS NOT NULL`,
    ),
    check(
      "court_booking_participant_status",
      sql`${table.status} IN ('organizer', 'invited', 'accepted', 'payment-pending', 'paid', 'declined', 'cancelled')`,
    ),
    check(
      "court_booking_participant_share",
      sql`${table.shareAmountMinor} >= 0`,
    ),
  ],
);

export const bookingPolicyAcceptances = pgTable(
  "booking_policy_acceptances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    acceptanceKey: varchar("acceptance_key", { length: 128 })
      .notNull()
      .unique(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => courtBookings.id, { onDelete: "cascade" }),
    subjectPersonId: uuid("subject_person_id")
      .notNull()
      .references(() => people.id),
    acceptedByPersonId: uuid("accepted_by_person_id")
      .notNull()
      .references(() => people.id),
    policyTitle: text("policy_title").notNull(),
    documentText: text("document_text").notNull(),
    documentTextHash: varchar("document_text_hash", { length: 128 }).notNull(),
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
    index("booking_policy_acceptance_booking_idx").on(
      table.bookingId,
      table.subjectPersonId,
    ),
  ],
);

export const availabilityAlerts = pgTable(
  "availability_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    courtId: uuid("court_id").references(() => courts.id, {
      onDelete: "cascade",
    }),
    targetDate: date("target_date", { mode: "string" }).notNull(),
    earliestMinute: integer("earliest_minute").notNull().default(0),
    latestMinute: integer("latest_minute").notNull().default(1440),
    durationMinutes: integer("duration_minutes").notNull(),
    channel: messageChannelEnum("channel").notNull().default("push"),
    status: varchar("status", { length: 24 }).notNull().default("active"),
    lastMatchedAt: timestamp("last_matched_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastNotifiedAt: timestamp("last_notified_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("availability_alert_active_idx").on(
      table.venueId,
      table.targetDate,
      table.status,
    ),
    check(
      "availability_alert_minutes_valid",
      sql`${table.earliestMinute} >= 0 AND ${table.latestMinute} <= 1440 AND ${table.latestMinute} > ${table.earliestMinute}`,
    ),
    check(
      "availability_alert_duration_valid",
      sql`${table.durationMinutes} > 0`,
    ),
    check(
      "availability_alert_status_valid",
      sql`${table.status} IN ('active', 'matched', 'paused', 'expired', 'cancelled')`,
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

// Balanced organization subledger. Cash remains in Stripe; closed-loop credits
// are organization-scoped units and never masquerade as transferable cash.
export const ledgerAccounts = pgTable(
  "ledger_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ownerPersonId: uuid("owner_person_id").references(() => people.id, {
      onDelete: "restrict",
    }),
    code: varchar("code", { length: 96 }).notNull(),
    name: text("name").notNull(),
    accountType: ledgerAccountTypeEnum("account_type").notNull(),
    normalSide: ledgerEntrySideEnum("normal_side").notNull(),
    unitKind: ledgerUnitKindEnum("unit_kind").notNull(),
    unit: varchar("unit", { length: 96 }).notNull(),
    currency: varchar("currency", { length: 3 }),
    systemManaged: boolean("system_managed").notNull().default(true),
    active: boolean("active").notNull().default(true),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("ledger_account_org_code_owner_unique").on(
      table.organizationId,
      table.code,
      table.ownerPersonId,
    ),
    uniqueIndex("ledger_account_org_system_code_unique")
      .on(table.organizationId, table.code)
      .where(sql`${table.ownerPersonId} IS NULL`),
    index("ledger_account_org_owner_idx").on(
      table.organizationId,
      table.ownerPersonId,
      table.active,
    ),
    check(
      "ledger_account_unit_currency_valid",
      sql`(${table.unitKind} = 'money' AND ${table.currency} IS NOT NULL AND ${table.unit} = ${table.currency}) OR (${table.unitKind} = 'organization-credit' AND ${table.currency} IS NULL)`,
    ),
    check(
      "ledger_account_currency_uppercase",
      sql`${table.currency} IS NULL OR ${table.currency} = upper(${table.currency})`,
    ),
  ],
);

export const ledgerJournals = pgTable(
  "ledger_journals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    sourceType: varchar("source_type", { length: 48 }).notNull(),
    sourceId: text("source_id").notNull(),
    description: text("description").notNull(),
    status: journalStatusEnum("status").notNull().default("draft"),
    reversalOfJournalId: uuid("reversal_of_journal_id"),
    actorPersonId: uuid("actor_person_id").references(() => people.id),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    postedAt: timestamp("posted_at", {
      withTimezone: true,
      mode: "date",
    }),
    metadata: jsonb("metadata")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    createdAt,
  },
  (table) => [
    uniqueIndex("ledger_journal_org_idempotency_unique").on(
      table.organizationId,
      table.idempotencyKey,
    ),
    uniqueIndex("ledger_journal_reversal_unique")
      .on(table.reversalOfJournalId)
      .where(sql`${table.reversalOfJournalId} IS NOT NULL`),
    index("ledger_journal_org_source_idx").on(
      table.organizationId,
      table.sourceType,
      table.sourceId,
    ),
    index("ledger_journal_org_occurred_idx").on(
      table.organizationId,
      table.occurredAt,
    ),
    check(
      "ledger_journal_posted_state_valid",
      sql`(${table.status} = 'draft' AND ${table.postedAt} IS NULL) OR (${table.status} = 'posted' AND ${table.postedAt} IS NOT NULL)`,
    ),
    check(
      "ledger_journal_not_self_reversal",
      sql`${table.reversalOfJournalId} IS NULL OR ${table.reversalOfJournalId} <> ${table.id}`,
    ),
  ],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    journalId: uuid("journal_id")
      .notNull()
      .references(() => ledgerJournals.id, { onDelete: "restrict" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    side: ledgerEntrySideEnum("side").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    unitKind: ledgerUnitKindEnum("unit_kind").notNull(),
    unit: varchar("unit", { length: 96 }).notNull(),
    currency: varchar("currency", { length: 3 }),
    memo: text("memo"),
    createdAt,
  },
  (table) => [
    uniqueIndex("ledger_entry_journal_sequence_unique").on(
      table.journalId,
      table.sequence,
    ),
    index("ledger_entry_org_account_idx").on(
      table.organizationId,
      table.accountId,
      table.createdAt,
    ),
    index("ledger_entry_org_journal_idx").on(
      table.organizationId,
      table.journalId,
    ),
    check("ledger_entry_amount_positive", sql`${table.amount} > 0`),
    check("ledger_entry_sequence_nonnegative", sql`${table.sequence} >= 0`),
    check(
      "ledger_entry_unit_currency_valid",
      sql`(${table.unitKind} = 'money' AND ${table.currency} IS NOT NULL AND ${table.unit} = ${table.currency}) OR (${table.unitKind} = 'organization-credit' AND ${table.currency} IS NULL)`,
    ),
  ],
);

export const organizationWallets = pgTable(
  "organization_wallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    creditLedgerAccountId: uuid("credit_ledger_account_id")
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: "restrict" }),
    unit: varchar("unit", { length: 96 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("active"),
    cachedAvailableCredits: integer("cached_available_credits")
      .notNull()
      .default(0),
    cachedAt: timestamp("cached_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("organization_wallet_person_unique").on(
      table.organizationId,
      table.personId,
    ),
    uniqueIndex("organization_wallet_account_unique").on(
      table.creditLedgerAccountId,
    ),
    index("organization_wallet_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
    check(
      "organization_wallet_status_valid",
      sql`${table.status} IN ('active', 'frozen', 'closed')`,
    ),
    check(
      "organization_wallet_cached_nonnegative",
      sql`${table.cachedAvailableCredits} >= 0`,
    ),
  ],
);

export const organizationCreditGrants = pgTable(
  "organization_credit_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    organizationWalletId: uuid("organization_wallet_id")
      .notNull()
      .references(() => organizationWallets.id, { onDelete: "restrict" }),
    sourceJournalId: uuid("source_journal_id")
      .notNull()
      .references(() => ledgerJournals.id, { onDelete: "restrict" }),
    catalogItemId: uuid("catalog_item_id").references(() => catalogItems.id),
    sourceOrderId: uuid("source_order_id").references(() => orders.id, {
      onDelete: "restrict",
    }),
    initialCredits: integer("initial_credits").notNull(),
    remainingCredits: integer("remaining_credits").notNull(),
    initialValueMinor: bigint("initial_value_minor", { mode: "number" })
      .notNull()
      .default(0),
    remainingValueMinor: bigint("remaining_value_minor", { mode: "number" })
      .notNull()
      .default(0),
    currency: varchar("currency", { length: 3 }),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    status: varchar("status", { length: 24 }).notNull().default("active"),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("organization_credit_grant_wallet_expiry_idx").on(
      table.organizationId,
      table.organizationWalletId,
      table.expiresAt,
    ),
    index("organization_credit_grant_source_order_idx").on(
      table.organizationId,
      table.sourceOrderId,
    ),
    check(
      "organization_credit_grant_amounts_valid",
      sql`${table.initialCredits} > 0 AND ${table.remainingCredits} >= 0 AND ${table.remainingCredits} <= ${table.initialCredits}`,
    ),
    check(
      "organization_credit_grant_value_valid",
      sql`${table.initialValueMinor} >= 0 AND ${table.remainingValueMinor} >= 0 AND ${table.remainingValueMinor} <= ${table.initialValueMinor} AND ((${table.initialValueMinor} = 0 AND ${table.currency} IS NULL) OR (${table.initialValueMinor} > 0 AND ${table.currency} IS NOT NULL AND ${table.currency} = upper(${table.currency})))`,
    ),
    check(
      "organization_credit_grant_status_valid",
      sql`${table.status} IN ('active', 'exhausted', 'expired', 'reversed')`,
    ),
  ],
);

export const familyCreditTransfers = pgTable(
  "family_credit_transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    guardianPersonId: uuid("guardian_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    dependentPersonId: uuid("dependent_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    fromWalletId: uuid("from_wallet_id")
      .notNull()
      .references(() => organizationWallets.id, { onDelete: "restrict" }),
    toWalletId: uuid("to_wallet_id")
      .notNull()
      .references(() => organizationWallets.id, { onDelete: "restrict" }),
    journalId: uuid("journal_id")
      .notNull()
      .references(() => ledgerJournals.id, { onDelete: "restrict" })
      .unique(),
    credits: integer("credits").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 128 })
      .notNull()
      .unique(),
    createdAt,
  },
  (table) => [
    index("family_credit_transfer_guardian_idx").on(
      table.guardianPersonId,
      table.createdAt,
    ),
    index("family_credit_transfer_dependent_idx").on(
      table.dependentPersonId,
      table.createdAt,
    ),
    check(
      "family_credit_transfer_people_distinct",
      sql`${table.guardianPersonId} <> ${table.dependentPersonId}`,
    ),
    check(
      "family_credit_transfer_wallets_distinct",
      sql`${table.fromWalletId} <> ${table.toWalletId}`,
    ),
    check("family_credit_transfer_positive", sql`${table.credits} > 0`),
  ],
);

export const organizationCreditApplications = pgTable(
  "organization_credit_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    organizationWalletId: uuid("organization_wallet_id")
      .notNull()
      .references(() => organizationWallets.id, { onDelete: "restrict" }),
    organizationCreditGrantId: uuid("organization_credit_grant_id")
      .notNull()
      .references(() => organizationCreditGrants.id, {
        onDelete: "restrict",
      }),
    journalId: uuid("journal_id")
      .notNull()
      .references(() => ledgerJournals.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    credits: integer("credits").notNull(),
    valueMinor: bigint("value_minor", { mode: "number" }).notNull().default(0),
    currency: varchar("currency", { length: 3 }),
    createdAt,
  },
  (table) => [
    uniqueIndex("organization_credit_application_journal_grant_unique").on(
      table.journalId,
      table.organizationCreditGrantId,
    ),
    index("organization_credit_application_wallet_idx").on(
      table.organizationId,
      table.organizationWalletId,
      table.createdAt,
    ),
    index("organization_credit_application_order_idx").on(table.orderId),
    check(
      "organization_credit_application_positive",
      sql`${table.credits} > 0`,
    ),
    check(
      "organization_credit_application_value_valid",
      sql`${table.valueMinor} >= 0 AND ((${table.valueMinor} = 0 AND ${table.currency} IS NULL) OR (${table.valueMinor} > 0 AND ${table.currency} IS NOT NULL AND ${table.currency} = upper(${table.currency})))`,
    ),
  ],
);

export const catalogFulfillments = pgTable(
  "catalog_fulfillments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    catalogItemId: uuid("catalog_item_id")
      .notNull()
      .references(() => catalogItems.id, { onDelete: "restrict" }),
    catalogVariantId: uuid("catalog_variant_id")
      .notNull()
      .references(() => catalogVariants.id, { onDelete: "restrict" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    kind: varchar("kind", { length: 32 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    details: jsonb("details")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    fulfilledAt: timestamp("fulfilled_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("catalog_fulfillment_order_item_unique").on(table.orderItemId),
    index("catalog_fulfillment_person_status_idx").on(
      table.organizationId,
      table.personId,
      table.status,
    ),
    check(
      "catalog_fulfillment_kind_valid",
      sql`${table.kind} IN ('registration', 'appointment', 'pickup', 'shipment', 'rental', 'membership', 'credit-grant')`,
    ),
    check(
      "catalog_fulfillment_status_valid",
      sql`${table.status} IN ('held', 'pending', 'ready', 'fulfilled', 'cancelled', 'refunded')`,
    ),
  ],
);

export const orderTaxContexts = pgTable(
  "order_tax_contexts",
  {
    orderId: uuid("order_id")
      .primaryKey()
      .references(() => orders.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    venueId: uuid("venue_id").references(() => venues.id),
    source: varchar("source", { length: 24 }).notNull(),
    addressSnapshot: jsonb("address_snapshot").notNull().$type<{
      line1?: string;
      line2?: string;
      city?: string;
      region?: string;
      postalCode?: string;
      country: string;
    }>(),
    itemTaxCodes: jsonb("item_tax_codes")
      .notNull()
      .$type<readonly { orderItemId: string; stripeTaxCode?: string }[]>()
      .default([]),
    stripeTaxCalculationId: varchar("stripe_tax_calculation_id", {
      length: 128,
    }),
    stripeTaxTransactionId: varchar("stripe_tax_transaction_id", {
      length: 128,
    }),
    taxAmountMinor: bigint("tax_amount_minor", { mode: "number" })
      .notNull()
      .default(0),
    currency: varchar("currency", { length: 3 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("estimated"),
    committedAt: timestamp("committed_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
  },
  (table) => [
    index("order_tax_org_status_idx").on(
      table.organizationId,
      table.status,
      table.createdAt,
    ),
    check(
      "order_tax_source_valid",
      sql`${table.source} IN ('venue', 'organization', 'shipping', 'online')`,
    ),
    check(
      "order_tax_status_valid",
      sql`${table.status} IN ('estimated', 'committed', 'voided', 'failed')`,
    ),
    check("order_tax_amount_nonnegative", sql`${table.taxAmountMinor} >= 0`),
  ],
);

export const refundRecords = pgTable(
  "refund_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    paymentId: uuid("payment_id").references(() => payments.id),
    disposition: varchar("disposition", { length: 24 }).notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    creditsIssued: integer("credits_issued"),
    stripeRefundId: varchar("stripe_refund_id", { length: 128 }).unique(),
    ledgerJournalId: uuid("ledger_journal_id").references(
      () => ledgerJournals.id,
      { onDelete: "restrict" },
    ),
    reason: text("reason").notNull(),
    status: varchar("status", { length: 24 }).notNull(),
    initiatedByPersonId: uuid("initiated_by_person_id")
      .notNull()
      .references(() => people.id),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("refund_record_org_order_idx").on(
      table.organizationId,
      table.orderId,
      table.createdAt,
    ),
    check(
      "refund_record_disposition_valid",
      sql`${table.disposition} IN ('original-payment', 'organization-credit')`,
    ),
    check("refund_record_amount_positive", sql`${table.amountMinor} > 0`),
    check(
      "refund_record_credit_pair",
      sql`(${table.disposition} = 'organization-credit' AND ${table.creditsIssued} > 0) OR (${table.disposition} = 'original-payment' AND ${table.creditsIssued} IS NULL)`,
    ),
    check(
      "refund_record_status_valid",
      sql`${table.status} IN ('pending', 'succeeded', 'failed', 'reversed')`,
    ),
  ],
);

export const ledgerReconciliations = pgTable(
  "ledger_reconciliations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 24 }).notNull(),
    periodStartsAt: timestamp("period_starts_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    periodEndsAt: timestamp("period_ends_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    ledgerAmountMinor: bigint("ledger_amount_minor", {
      mode: "number",
    }).notNull(),
    providerAmountMinor: bigint("provider_amount_minor", {
      mode: "number",
    }).notNull(),
    driftMinor: bigint("drift_minor", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    status: varchar("status", { length: 24 }).notNull(),
    evidence: jsonb("evidence")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
  },
  (table) => [
    uniqueIndex("ledger_reconciliation_org_period_unique").on(
      table.organizationId,
      table.provider,
      table.periodStartsAt,
      table.periodEndsAt,
      table.currency,
    ),
    check(
      "ledger_reconciliation_time_valid",
      sql`${table.periodEndsAt} > ${table.periodStartsAt}`,
    ),
    check(
      "ledger_reconciliation_status_valid",
      sql`${table.status} IN ('matched', 'drift', 'investigating', 'resolved')`,
    ),
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

export const legalAcceptances = pgTable(
  "legal_acceptances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    documentKey: varchar("document_key", { length: 48 }).notNull(),
    documentVersion: varchar("document_version", { length: 32 }).notNull(),
    acceptanceMethod: varchar("acceptance_method", { length: 24 })
      .notNull()
      .default("clickwrap"),
    evidence: jsonb("evidence")
      .notNull()
      .$type<{
        termsUrl: string;
        privacyUrl?: string;
        selectedPlan?: string;
        pricingSnapshot?: Record<string, unknown>;
      }>()
      .default({ termsUrl: "" }),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: text("user_agent"),
    acceptedAt: timestamp("accepted_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    createdAt,
  },
  (table) => [
    index("legal_acceptance_person_document_idx").on(
      table.personId,
      table.documentKey,
      table.acceptedAt,
    ),
    index("legal_acceptance_org_document_idx").on(
      table.organizationId,
      table.documentKey,
      table.acceptedAt,
    ),
    check(
      "legal_acceptance_document_valid",
      sql`${table.documentKey} IN ('consumer-terms', 'privacy-policy', 'mobile-eula', 'hq-terms')`,
    ),
    check(
      "legal_acceptance_method_valid",
      sql`${table.acceptanceMethod} IN ('clickwrap', 'signed-order-form', 'admin-import')`,
    ),
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

export const marketingFlows = pgTable(
  "marketing_flows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => sessions.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    description: text("description"),
    segment: jsonb("segment")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    trigger: jsonb("trigger")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    action: jsonb("action")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    status: varchar("status", { length: 24 }).notNull().default("draft"),
    createdByPersonId: uuid("created_by_person_id")
      .notNull()
      .references(() => people.id),
    activatedAt: timestamp("activated_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("marketing_flow_org_status_idx").on(
      table.organizationId,
      table.status,
      table.createdAt,
    ),
    index("marketing_flow_session_status_idx").on(
      table.sessionId,
      table.status,
      table.createdAt,
    ),
    check(
      "marketing_flow_status_valid",
      sql`${table.status} IN ('draft', 'active', 'paused', 'archived')`,
    ),
  ],
);

export const marketingCampaigns = pgTable(
  "marketing_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    segment: jsonb("segment")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    channel: messageChannelEnum("channel").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("draft"),
    scheduledAt: timestamp("scheduled_at", {
      withTimezone: true,
      mode: "date",
    }),
    stats: jsonb("stats")
      .notNull()
      .$type<{
        recipients: number;
        delivered: number;
        opened: number;
        clicked: number;
        failed: number;
      }>()
      .default({
        recipients: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        failed: 0,
      }),
    createdByPersonId: uuid("created_by_person_id")
      .notNull()
      .references(() => people.id),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("marketing_campaign_org_status_idx").on(
      table.organizationId,
      table.status,
      table.createdAt,
    ),
    check(
      "marketing_campaign_status_valid",
      sql`${table.status} IN ('draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled')`,
    ),
  ],
);

export const messageDeliveryEvents = pgTable(
  "message_delivery_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    campaignId: uuid("campaign_id").references(() => marketingCampaigns.id, {
      onDelete: "set null",
    }),
    providerEventId: varchar("provider_event_id", { length: 192 }).notNull(),
    channel: messageChannelEnum("channel").notNull(),
    transport: varchar("transport", { length: 24 }).notNull(),
    eventType: varchar("event_type", { length: 24 }).notNull(),
    recipientHash: varchar("recipient_hash", { length: 64 }),
    metadata: jsonb("metadata")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("message_delivery_provider_event_unique").on(
      table.providerEventId,
    ),
    index("message_delivery_org_time_idx").on(
      table.organizationId,
      table.occurredAt,
    ),
    index("message_delivery_campaign_idx").on(
      table.campaignId,
      table.occurredAt,
    ),
    check(
      "message_delivery_transport_valid",
      sql`${table.transport} IN ('email', 'sms', 'rcs', 'whatsapp', 'push', 'in-app')`,
    ),
    check(
      "message_delivery_event_type_valid",
      sql`${table.eventType} IN ('queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'unsubscribed', 'converted')`,
    ),
  ],
);

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

export const liveActivitySubscriptions = pgTable(
  "live_activity_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    subjectType: varchar("subject_type", { length: 24 }).notNull(),
    subjectId: uuid("subject_id").notNull(),
    activityId: varchar("activity_id", { length: 128 }).notNull(),
    pushToken: text("push_token").notNull(),
    environment: varchar("environment", { length: 16 })
      .notNull()
      .default("production"),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    lastDeliveredAt: timestamp("last_delivered_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastError: text("last_error"),
    revokedAt: timestamp("revoked_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("live_activity_push_token_unique").on(table.pushToken),
    index("live_activity_subject_status_idx").on(
      table.subjectType,
      table.subjectId,
      table.status,
    ),
    index("live_activity_person_status_idx").on(table.personId, table.status),
    check(
      "live_activity_subject_type_valid",
      sql`${table.subjectType} IN ('upcoming', 'match')`,
    ),
    check(
      "live_activity_environment_valid",
      sql`${table.environment} IN ('sandbox', 'production')`,
    ),
    check(
      "live_activity_status_valid",
      sql`${table.status} IN ('active', 'expired', 'revoked')`,
    ),
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
    courtBookingId: uuid("court_booking_id")
      .unique()
      .references(() => courtBookings.id, { onDelete: "set null" }),
    venueLabel: text("venue_label").notNull(),
    title: text("title").notNull(),
    matchType: varchar("match_type", { length: 24 })
      .notNull()
      .default("competitive"),
    genderPreference: varchar("gender_preference", { length: 24 })
      .notNull()
      .default("open"),
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
    status: varchar("status", { length: 24 }).notNull().default("active"),
    approvalRequired: boolean("approval_required").notNull().default(false),
    address: text("address"),
    googlePlaceId: text("google_place_id"),
    locationConfidence: varchar("location_confidence", { length: 16 })
      .notNull()
      .default("approximate"),
    smartRules: jsonb("smart_rules")
      .notNull()
      .$type<{
        waitlistEnabled: boolean;
        allowLateCancellation: boolean;
        minimumNoticeMinutes: number;
        autoCancelLowAttendance: boolean;
        minimumAttendance: number;
      }>()
      .default({
        waitlistEnabled: true,
        allowLateCancellation: false,
        minimumNoticeMinutes: 60,
        autoCancelLowAttendance: false,
        minimumAttendance: 2,
      }),
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
      "pickup_session_status_valid",
      sql`${table.status} IN ('active', 'cancelled', 'completed')`,
    ),
    check(
      "pickup_session_location_confidence_valid",
      sql`${table.locationConfidence} IN ('confirmed', 'approximate')`,
    ),
    check(
      "pickup_session_format_valid",
      sql`${table.format} IN ('2s', '3s', '4s', '6s', 'king-queen')`,
    ),
    check(
      "pickup_session_match_type_valid",
      sql`${table.matchType} IN ('competitive', 'casual')`,
    ),
    check(
      "pickup_session_gender_valid",
      sql`${table.genderPreference} IN ('open', 'mens', 'womens', 'mixed')`,
    ),
  ],
);

export const pickupJoinRequests = pgTable(
  "pickup_join_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pickupSessionId: uuid("pickup_session_id")
      .notNull()
      .references(() => pickupSessions.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 24 }).notNull().default("requested"),
    note: text("note"),
    reviewedByPersonId: uuid("reviewed_by_person_id").references(
      () => people.id,
    ),
    reviewedAt: timestamp("reviewed_at", {
      withTimezone: true,
      mode: "date",
    }),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("pickup_join_request_session_person_unique").on(
      table.pickupSessionId,
      table.personId,
    ),
    index("pickup_join_request_host_queue_idx").on(
      table.pickupSessionId,
      table.status,
      table.createdAt,
    ),
    check(
      "pickup_join_request_status_valid",
      sql`${table.status} IN ('requested', 'approved', 'rejected', 'cancelled', 'expired')`,
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
