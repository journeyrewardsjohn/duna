import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  foreignKey,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
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
  "invited",
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
export const trainingProgramStatusEnum = pgEnum("training_program_status", [
  "draft",
  "active",
  "completed",
  "archived",
]);
export const trainingEventKindEnum = pgEnum("training_event_kind", [
  "practice",
  "tournament",
  "travel",
  "recovery",
  "strength",
  "conditioning",
  "plyometrics",
  "film",
  "meeting",
  "assessment",
  "rest",
]);
export const trainingEventStatusEnum = pgEnum("training_event_status", [
  "planned",
  "ready",
  "completed",
  "cancelled",
]);
export const trainingContentStatusEnum = pgEnum("training_content_status", [
  "draft",
  "review",
  "published",
  "archived",
]);
export const trainingVisibilityEnum = pgEnum("training_visibility", [
  "organization",
  "public",
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
    dunaMemberId: varchar("duna_member_id", { length: 6 })
      .notNull()
      .default(sql`duna_next_member_id()`),
    membershipQrToken: varchar("membership_qr_token", { length: 64 })
      .notNull()
      .default(
        sql`replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')`,
      ),
    workosUserId: varchar("workos_user_id", { length: 128 }).unique(),
    clerkUserId: varchar("clerk_user_id", { length: 128 }).unique(),
    stripeCustomerId: varchar("stripe_customer_id", { length: 128 }).unique(),
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
    uniqueIndex("people_duna_member_id_unique").on(table.dunaMemberId),
    uniqueIndex("people_membership_qr_token_unique").on(
      table.membershipQrToken,
    ),
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

export const playerPublicProfiles = pgTable(
  "player_public_profiles",
  {
    personId: uuid("person_id")
      .primaryKey()
      .references(() => people.id, { onDelete: "cascade" }),
    publicationStatus: varchar("publication_status", { length: 24 })
      .notNull()
      .default("draft"),
    shortBio: text("short_bio"),
    biography: text("biography"),
    countryCode: varchar("country_code", { length: 3 }),
    hometown: text("hometown"),
    collegeName: text("college_name"),
    collegeLogoUrl: text("college_logo_url"),
    playingRole: varchar("playing_role", { length: 48 }),
    accentId: varchar("accent_id", { length: 32 })
      .notNull()
      .default("dune-gold"),
    cutoutImageUrl: text("cutout_image_url"),
    heroImageUrl: text("hero_image_url"),
    heroVideoUrl: text("hero_video_url"),
    imageAlt: text("image_alt"),
    careerStats: jsonb("career_stats")
      .notNull()
      .$type<{
        readonly events?: number;
        readonly wins?: number;
        readonly podiums?: number;
        readonly gold?: number;
        readonly silver?: number;
        readonly bronze?: number;
        readonly earningsMinor?: number;
        readonly earningsCurrency?: string;
      }>()
      .default({}),
    links: jsonb("links")
      .notNull()
      .$type<
        readonly {
          readonly label: string;
          readonly url: string;
          readonly kind: "website" | "instagram" | "youtube" | "news";
        }[]
      >()
      .default([]),
    news: jsonb("news")
      .notNull()
      .$type<
        readonly {
          readonly title: string;
          readonly url: string;
          readonly publisher?: string;
          readonly publishedAt?: string;
        }[]
      >()
      .default([]),
    researchStatus: varchar("research_status", { length: 24 })
      .notNull()
      .default("not-started"),
    researchProposal: jsonb("research_proposal")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    researchEvidence: jsonb("research_evidence")
      .notNull()
      .$type<
        readonly {
          readonly title: string;
          readonly url: string;
          readonly description?: string;
        }[]
      >()
      .default([]),
    researchModel: varchar("research_model", { length: 160 }),
    researchedAt: timestamp("researched_at", {
      withTimezone: true,
      mode: "date",
    }),
    reviewedByPersonId: uuid("reviewed_by_person_id").references(
      () => people.id,
    ),
    reviewedAt: timestamp("reviewed_at", {
      withTimezone: true,
      mode: "date",
    }),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("player_public_profile_status_idx").on(
      table.publicationStatus,
      table.updatedAt,
    ),
    index("player_public_profile_research_idx").on(
      table.researchStatus,
      table.researchedAt,
    ),
    check(
      "player_public_profile_publication_status_valid",
      sql`${table.publicationStatus} IN ('draft', 'review', 'published')`,
    ),
    check(
      "player_public_profile_research_status_valid",
      sql`${table.researchStatus} IN ('not-started', 'queued', 'researching', 'review', 'published', 'failed')`,
    ),
    check(
      "player_public_profile_accent_valid",
      sql`${table.accentId} IN ('dune-gold', 'marine', 'deep-coral', 'moss', 'terracotta', 'slate-blue', 'ochre', 'plum', 'sea-green', 'ink')`,
    ),
  ],
);

export const playerMediaWorkflows = pgTable(
  "player_media_workflows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    requestedByPersonId: uuid("requested_by_person_id")
      .notNull()
      .references(() => people.id),
    status: varchar("status", { length: 24 }).notNull().default("draft"),
    referenceImages: jsonb("reference_images")
      .notNull()
      .$type<
        readonly {
          readonly url: string;
          readonly kind: "action" | "portrait";
          readonly width?: number;
          readonly height?: number;
          readonly uploadedAt: string;
        }[]
      >()
      .default([]),
    brief: text("brief"),
    generationPrompt: text("generation_prompt"),
    models: jsonb("models")
      .notNull()
      .$type<{
        readonly cutout?: string;
        readonly poster?: string;
        readonly provider?: "higgsfield";
        readonly cutoutJobId?: string;
        readonly posterJobId?: string;
        readonly referenceMediaIds?: readonly string[];
      }>()
      .default({}),
    outputImages: jsonb("output_images")
      .notNull()
      .$type<
        readonly {
          readonly url: string;
          readonly kind: "cutout" | "poster" | "background";
          readonly jobId?: string;
        }[]
      >()
      .default([]),
    rightsConfirmedAt: timestamp("rights_confirmed_at", {
      withTimezone: true,
      mode: "date",
    }),
    reviewedByPersonId: uuid("reviewed_by_person_id").references(
      () => people.id,
    ),
    reviewedAt: timestamp("reviewed_at", {
      withTimezone: true,
      mode: "date",
    }),
    failureReason: text("failure_reason"),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("player_media_workflow_person_idx").on(
      table.personId,
      table.createdAt,
    ),
    index("player_media_workflow_queue_idx").on(table.status, table.createdAt),
    check(
      "player_media_workflow_status_valid",
      sql`${table.status} IN ('draft', 'ready', 'generating', 'review', 'published', 'failed', 'rejected')`,
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

// Club-scoped waiver library. A document is the stable library entry; every
// editable release is captured as an immutable version before it can be shown
// to a player or guardian for acceptance.
export const waiverDocuments = pgTable(
  "waiver_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("draft"),
    currentVersionId: uuid("current_version_id"),
    createdByPersonId: uuid("created_by_person_id").references(() => people.id),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("waiver_document_org_slug_unique").on(
      table.organizationId,
      table.slug,
    ),
    index("waiver_document_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
    check(
      "waiver_document_status_valid",
      sql`${table.status} IN ('draft', 'active', 'archived')`,
    ),
  ],
);

export const waiverVersions = pgTable(
  "waiver_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    waiverDocumentId: uuid("waiver_document_id")
      .notNull()
      .references(() => waiverDocuments.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    markdown: text("markdown").notNull(),
    contentHash: varchar("content_hash", { length: 128 }).notNull(),
    sourceFilename: text("source_filename"),
    sourceMimeType: varchar("source_mime_type", { length: 120 }),
    requiresSignature: boolean("requires_signature").notNull().default(true),
    signatureValidityDays: integer("signature_validity_days")
      .notNull()
      .default(365),
    requiresParentForMinors: boolean("requires_parent_for_minors")
      .notNull()
      .default(true),
    playerAcknowledgementMinimumAge: integer(
      "player_acknowledgement_minimum_age",
    ),
    keySections: jsonb("key_sections")
      .notNull()
      .$type<
        readonly {
          id: string;
          title: string;
          markdown: string;
          acknowledgementRequired: boolean;
        }[]
      >()
      .default([]),
    createdByPersonId: uuid("created_by_person_id").references(() => people.id),
    createdAt,
  },
  (table) => [
    uniqueIndex("waiver_version_document_version_unique").on(
      table.waiverDocumentId,
      table.version,
    ),
    index("waiver_version_content_hash_idx").on(table.contentHash),
    check(
      "waiver_version_validity_days_valid",
      sql`${table.signatureValidityDays} BETWEEN 1 AND 3650`,
    ),
    check(
      "waiver_version_player_ack_age_valid",
      sql`${table.playerAcknowledgementMinimumAge} IS NULL OR ${table.playerAcknowledgementMinimumAge} BETWEEN 13 AND 17`,
    ),
  ],
);

export const waiverAssignments = pgTable(
  "waiver_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    waiverDocumentId: uuid("waiver_document_id")
      .notNull()
      .references(() => waiverDocuments.id, { onDelete: "cascade" }),
    catalogItemId: uuid("catalog_item_id").references(() => catalogItems.id, {
      onDelete: "cascade",
    }),
    scope: varchar("scope", { length: 24 }).notNull(),
    required: boolean("required").notNull().default(true),
    createdAt,
  },
  (table) => [
    index("waiver_assignment_org_scope_idx").on(
      table.organizationId,
      table.scope,
    ),
    uniqueIndex("waiver_assignment_catalog_document_unique")
      .on(table.catalogItemId, table.waiverDocumentId)
      .where(sql`${table.catalogItemId} IS NOT NULL`),
    uniqueIndex("waiver_assignment_global_document_unique")
      .on(table.organizationId, table.scope, table.waiverDocumentId)
      .where(sql`${table.catalogItemId} IS NULL`),
    check(
      "waiver_assignment_scope_valid",
      sql`${table.scope} IN ('all-members', 'booking', 'catalog-item')`,
    ),
    check(
      "waiver_assignment_target_valid",
      sql`(${table.scope} = 'catalog-item') = (${table.catalogItemId} IS NOT NULL)`,
    ),
  ],
);

export const waiverExecutions = pgTable(
  "waiver_executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    waiverDocumentId: uuid("waiver_document_id")
      .notNull()
      .references(() => waiverDocuments.id, { onDelete: "restrict" }),
    waiverVersionId: uuid("waiver_version_id")
      .notNull()
      .references(() => waiverVersions.id, { onDelete: "restrict" }),
    subjectPersonId: uuid("subject_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    signerPersonId: uuid("signer_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    signerRole: varchar("signer_role", { length: 16 }).notNull(),
    relationship: varchar("relationship", { length: 80 }),
    typedLegalName: text("typed_legal_name").notNull(),
    signatureMethod: varchar("signature_method", { length: 24 })
      .notNull()
      .default("typed-name-clickwrap"),
    displayedInline: boolean("displayed_inline").notNull().default(true),
    scrolledToEnd: boolean("scrolled_to_end").notNull().default(false),
    acknowledgedSectionIds: jsonb("acknowledged_section_ids")
      .notNull()
      .$type<readonly string[]>()
      .default([]),
    contentHash: varchar("content_hash", { length: 128 }).notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: text("user_agent"),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
  },
  (table) => [
    index("waiver_execution_subject_validity_idx").on(
      table.organizationId,
      table.subjectPersonId,
      table.expiresAt,
    ),
    index("waiver_execution_document_subject_idx").on(
      table.waiverDocumentId,
      table.subjectPersonId,
      table.occurredAt,
    ),
    check(
      "waiver_execution_signer_role_valid",
      sql`${table.signerRole} IN ('adult-player', 'parent-or-guardian', 'player-acknowledgement')`,
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
    lastDunaActivityAt: timestamp("last_duna_activity_at", {
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
    // System workspaces are real WorkOS organizations, but never tenants. The
    // Duna platform workspace is used to synchronize staff membership without
    // letting it leak into club pickers or active organization context.
    systemKey: varchar("system_key", { length: 32 }).unique(),
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
    volleyballTypes: text("volleyball_types")
      .array()
      .notNull()
      .default(sql`ARRAY['beach']::text[]`),
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
    operatorCommissionBpsOverride: integer("operator_commission_bps_override"),
    stripeFeeMetadataStatus: varchar("stripe_fee_metadata_status", {
      length: 24,
    })
      .notNull()
      .default("not-connected"),
    stripeFeeMetadataSyncedAt: timestamp("stripe_fee_metadata_synced_at", {
      withTimezone: true,
      mode: "date",
    }),
    stripeFeeMetadataError: text("stripe_fee_metadata_error"),
    stripeBillingCustomerId: varchar("stripe_billing_customer_id", {
      length: 128,
    }).unique(),
    stripeSubscriptionId: varchar("stripe_subscription_id", {
      length: 128,
    }).unique(),
    stripeSubscriptionStatus: varchar("stripe_subscription_status", {
      length: 32,
    }),
    planBillingInterval: varchar("plan_billing_interval", { length: 12 }),
    planCurrentPeriodStartsAt: timestamp("plan_current_period_starts_at", {
      withTimezone: true,
      mode: "date",
    }),
    planCurrentPeriodEndsAt: timestamp("plan_current_period_ends_at", {
      withTimezone: true,
      mode: "date",
    }),
    planCancelAtPeriodEnd: boolean("plan_cancel_at_period_end")
      .notNull()
      .default(false),
    videoUploadAddonSeconds: integer("video_upload_addon_seconds")
      .notNull()
      .default(0),
    videoLiveAddonSeconds: integer("video_live_addon_seconds")
      .notNull()
      .default(0),
    videoPaygEnabled: boolean("video_payg_enabled").notNull().default(false),
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
    check(
      "organization_plan_valid",
      sql`${table.plan} IN ('coach', 'small-club', 'club')`,
    ),
    check(
      "organization_volleyball_types_valid",
      sql`cardinality(${table.volleyballTypes}) BETWEEN 1 AND 2 AND ${table.volleyballTypes} <@ ARRAY['beach', 'indoor']::text[]`,
    ),
    check(
      "organization_commission_override_valid",
      sql`${table.operatorCommissionBpsOverride} IS NULL OR ${table.operatorCommissionBpsOverride} BETWEEN 0 AND 2500`,
    ),
    check(
      "organization_fee_metadata_status_valid",
      sql`${table.stripeFeeMetadataStatus} IN ('not-connected', 'pending', 'synced', 'failed')`,
    ),
    check(
      "organization_plan_billing_interval_valid",
      sql`${table.planBillingInterval} IS NULL OR ${table.planBillingInterval} IN ('month', 'year')`,
    ),
    check(
      "organization_video_addons_nonnegative",
      sql`${table.videoUploadAddonSeconds} >= 0 AND ${table.videoLiveAddonSeconds} >= 0`,
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
        clubHue?: number;
        clubChroma?: number;
      }>()
      .default({
        primary: "#517986",
        accent: "#BDD2D9",
        sand: "#E5F1F5",
        ink: "#2D4D57",
        canvas: "#F6F5F1",
        success: "#2F6B3A",
        clubHue: 220.25,
        clubChroma: 0.0489,
      }),
    typography: jsonb("typography")
      .notNull()
      .$type<{ heading: string; body: string }>()
      .default({ heading: "Satoshi", body: "Satoshi" }),
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
    // Duna has exactly one active Owner per organization. Directors retain
    // their day-to-day role in organizationStaffProfiles and a manager
    // membership with director scopes; ownership moves only through the
    // explicit transfer workflow.
    uniqueIndex("organization_active_owner_unique")
      .on(table.organizationId)
      .where(sql`${table.role} = 'owner' AND ${table.active} = true`),
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
    staffRole: varchar("staff_role", { length: 24 }).notNull().default("coach"),
    workerClassification: varchar("worker_classification", {
      length: 24,
    })
      .notNull()
      .default("not-set"),
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
      "organization_staff_role_valid",
      sql`${table.staffRole} IN ('coach', 'director', 'manager', 'front-desk', 'accountant')`,
    ),
    check(
      "organization_staff_classification_valid",
      sql`${table.workerClassification} IN ('not-set', '1099-contractor', 'w2-employee')`,
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
      sql`${table.role} IN ('coach', 'director', 'manager', 'front-desk', 'accountant')`,
    ),
    check(
      "organization_staff_invitation_classification_valid",
      sql`${table.workerClassification} IN ('1099-contractor', 'w2-employee')`,
    ),
    check(
      "organization_staff_invitation_status_valid",
      sql`${table.status} IN ('pending', 'claimed', 'expired', 'cancelled')`,
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

// Audiences are organization-scoped, versioned selection definitions. Their
// snapshots are projections only; organization participants remain the
// authority for candidate membership and message eligibility is rechecked by
// the Messaging service at send time.
export const audiences = pgTable(
  "audiences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    mode: varchar("mode", { length: 16 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    currentVersionId: uuid("current_version_id").references(
      (): AnyPgColumn => audienceVersions.id,
      { onDelete: "restrict" },
    ),
    createdByPersonId: uuid("created_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("audience_org_name_unique").on(
      table.organizationId,
      table.name,
    ),
    index("audience_org_status_updated_idx").on(
      table.organizationId,
      table.status,
      table.updatedAt,
    ),
    check(
      "audience_mode_valid",
      sql`${table.mode} IN ('static', 'dynamic', 'hybrid')`,
    ),
    check(
      "audience_status_valid",
      sql`${table.status} IN ('active', 'archived')`,
    ),
  ],
);

export const audienceVersions = pgTable(
  "audience_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    audienceId: uuid("audience_id")
      .notNull()
      .references(() => audiences.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    ruleVersion: integer("rule_version").notNull().default(1),
    ruleAst: jsonb("rule_ast")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    ruleHash: varchar("rule_hash", { length: 96 }).notNull(),
    createdByPersonId: uuid("created_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    notes: text("notes"),
    createdAt,
  },
  (table) => [
    uniqueIndex("audience_version_revision_unique").on(
      table.audienceId,
      table.revision,
    ),
    uniqueIndex("audience_version_hash_unique").on(
      table.audienceId,
      table.ruleHash,
    ),
    index("audience_version_audience_created_idx").on(
      table.audienceId,
      table.createdAt,
    ),
    check("audience_version_positive", sql`${table.revision} > 0`),
    check("audience_rule_version_positive", sql`${table.ruleVersion} > 0`),
  ],
);

export const audienceVersionMembers = pgTable(
  "audience_version_members",
  {
    audienceVersionId: uuid("audience_version_id")
      .notNull()
      .references(() => audienceVersions.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    disposition: varchar("disposition", { length: 12 }).notNull(),
    createdAt,
  },
  (table) => [
    primaryKey({ columns: [table.audienceVersionId, table.personId] }),
    index("audience_version_member_person_idx").on(table.personId),
    check(
      "audience_version_member_disposition_valid",
      sql`${table.disposition} IN ('include', 'exclude')`,
    ),
  ],
);

export const audienceSnapshots = pgTable(
  "audience_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    audienceVersionId: uuid("audience_version_id")
      .notNull()
      .references(() => audienceVersions.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 }).notNull().default("complete"),
    memberCount: integer("member_count").notNull().default(0),
    unavailableFactKeys: jsonb("unavailable_fact_keys")
      .notNull()
      .$type<readonly string[]>()
      .default([]),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    createdAt,
  },
  (table) => [
    index("audience_snapshot_version_evaluated_idx").on(
      table.audienceVersionId,
      table.evaluatedAt,
    ),
    index("audience_snapshot_org_evaluated_idx").on(
      table.organizationId,
      table.evaluatedAt,
    ),
    check(
      "audience_snapshot_status_valid",
      sql`${table.status} IN ('complete', 'partial', 'unavailable')`,
    ),
    check(
      "audience_snapshot_member_count_valid",
      sql`${table.memberCount} >= 0`,
    ),
  ],
);

export const audienceSnapshotMembers = pgTable(
  "audience_snapshot_members",
  {
    audienceSnapshotId: uuid("audience_snapshot_id")
      .notNull()
      .references(() => audienceSnapshots.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    included: boolean("included").notNull(),
    reasonCode: varchar("reason_code", { length: 48 }).notNull(),
    reasons: jsonb("reasons").notNull().$type<readonly string[]>().default([]),
    createdAt,
  },
  (table) => [
    primaryKey({ columns: [table.audienceSnapshotId, table.personId] }),
    index("audience_snapshot_member_included_idx").on(
      table.audienceSnapshotId,
      table.included,
    ),
    check(
      "audience_snapshot_reason_code_valid",
      sql`${table.reasonCode} IN ('dynamic-match', 'static-include', 'explicit-exclude', 'rule-no-match', 'fact-unavailable')`,
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
    locationKind: varchar("location_kind", { length: 32 })
      .notNull()
      .default("private-venue"),
    environment: varchar("environment", { length: 16 })
      .notNull()
      .default("outdoor"),
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
    check(
      "venue_environment_valid",
      sql`${table.environment} IN ('indoor', 'outdoor')`,
    ),
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
    // Points at the immutable offer definition used for new checkout attempts.
    // It is deliberately not cascaded: a purchase must always be able to name
    // the exact product revision it bought.
    currentVersionId: uuid("current_version_id"),
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
      sql`(${table.type} = 'event' AND ${table.subtype} IN ('tournament', 'league', 'clinic', 'open-play', 'pickup')) OR (${table.type} = 'service' AND ${table.subtype} IN ('private-lesson', 'group-lesson', 'program', 'court-rental', 'assessment', 'other')) OR (${table.type} = 'good' AND ${table.subtype} IN ('apparel', 'equipment', 'rental', 'swag', 'consumable', 'digital-content', 'other')) OR (${table.type} = 'plan' AND ${table.subtype} IN ('membership', 'credit-pack', 'bundle'))`,
    ),
    check(
      "catalog_item_payment_method",
      sql`${table.allowCard} OR ${table.allowCash} OR ${table.allowCredits} OR (${table.type} = 'good' AND ${table.configuration} ->> 'saleEnabled' = 'false')`,
    ),
  ],
);

// An append-only snapshot of a sellable offer. Catalog tables remain the
// current working projection; this table is the historical source of truth
// for purchases, audit, and reverting a product to an earlier definition.
export const catalogItemVersions = pgTable(
  "catalog_item_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    catalogItemId: uuid("catalog_item_id")
      .notNull()
      .references(() => catalogItems.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").notNull().$type<Record<string, unknown>>(),
    createdByPersonId: uuid("created_by_person_id").references(() => people.id),
    createdAt,
  },
  (table) => [
    uniqueIndex("catalog_item_version_unique").on(
      table.catalogItemId,
      table.version,
    ),
    index("catalog_item_version_org_item_created_idx").on(
      table.organizationId,
      table.catalogItemId,
      table.createdAt,
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

export const catalogSessionOccurrences = pgTable(
  "catalog_session_occurrences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    catalogItemId: uuid("catalog_item_id")
      .notNull()
      .references(() => catalogItems.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    endsAt: timestamp("ends_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    timezone: varchar("timezone", { length: 80 }).notNull(),
    localDate: date("local_date", { mode: "string" }).notNull(),
    localTime: time("local_time", { precision: 0 }).notNull(),
    coachPersonIds: uuid("coach_person_ids").array().notNull().default([]),
    capacity: integer("capacity").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("scheduled"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("catalog_session_occurrence_item_time_unique").on(
      table.catalogItemId,
      table.startsAt,
    ),
    index("catalog_session_occurrence_org_time_idx").on(
      table.organizationId,
      table.startsAt,
    ),
    check(
      "catalog_session_occurrence_time_valid",
      sql`${table.endsAt} > ${table.startsAt}`,
    ),
    check(
      "catalog_session_occurrence_capacity_valid",
      sql`${table.capacity} > 0`,
    ),
    check(
      "catalog_session_occurrence_status_valid",
      sql`${table.status} IN ('scheduled', 'cancelled', 'complete')`,
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
    totalCostMinor: bigint("total_cost_minor", { mode: "number" }),
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
    check(
      "inventory_movement_cost_valid",
      sql`(${table.unitCostMinor} IS NULL AND ${table.totalCostMinor} IS NULL) OR (${table.unitCostMinor} >= 0 AND (${table.totalCostMinor} IS NULL OR ${table.totalCostMinor} >= 0) AND ${table.currency} IS NOT NULL)`,
    ),
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

// Session operations keep the human context around a completed or cancelled
// session without overloading the scheduling record itself. Weather is stored
// as an observed snapshot so historical reporting never substitutes a current
// forecast for what happened on the day.
export const sessionOperations = pgTable(
  "session_operations",
  {
    sessionId: uuid("session_id")
      .primaryKey()
      .references(() => sessions.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    cancellationKind: varchar("cancellation_kind", { length: 24 }),
    cancellationReason: text("cancellation_reason"),
    cancelledByPersonId: uuid("cancelled_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    cancelledAt: timestamp("cancelled_at", {
      withTimezone: true,
      mode: "date",
    }),
    weatherSnapshot: jsonb("weather_snapshot").$type<{
      readonly condition: string;
      readonly temperatureC?: number;
      readonly apparentTemperatureC?: number;
      readonly precipitationProbability?: number;
      readonly windSpeedKph?: number;
      readonly source: string;
      readonly observedAt: string;
    }>(),
    weatherCapturedAt: timestamp("weather_captured_at", {
      withTimezone: true,
      mode: "date",
    }),
    refundStatus: varchar("refund_status", { length: 24 }),
    refundSummary: jsonb("refund_summary").$type<{
      readonly registrationCount: number;
      readonly orderCount: number;
      readonly cashRefundMinor: number;
      readonly creditsRestored: number;
      readonly succeededOrderIds: readonly string[];
      readonly failedOrderIds: readonly string[];
    }>(),
    refundCompletedAt: timestamp("refund_completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("session_operation_org_cancelled_idx").on(
      table.organizationId,
      table.cancelledAt,
    ),
    check(
      "session_operation_cancellation_kind_valid",
      sql`${table.cancellationKind} IS NULL OR ${table.cancellationKind} IN ('coach', 'weather', 'operator', 'venue', 'other')`,
    ),
    check(
      "session_operation_cancellation_pair_valid",
      sql`(${table.cancelledAt} IS NULL AND ${table.cancellationKind} IS NULL AND ${table.cancellationReason} IS NULL) OR (${table.cancelledAt} IS NOT NULL AND ${table.cancellationKind} IS NOT NULL AND ${table.cancellationReason} IS NOT NULL)`,
    ),
    check(
      "session_operation_refund_status_valid",
      sql`${table.refundStatus} IS NULL OR ${table.refundStatus} IN ('pending', 'complete', 'attention')`,
    ),
  ],
);

export const sessionAttendance = pgTable(
  "session_attendance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    registrationId: uuid("registration_id").references(() => registrations.id, {
      onDelete: "set null",
    }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 24 }).notNull().default("scheduled"),
    note: text("note"),
    recordedByPersonId: uuid("recorded_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    recordedAt: timestamp("recorded_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("session_attendance_person_unique").on(
      table.sessionId,
      table.personId,
    ),
    uniqueIndex("session_attendance_registration_unique")
      .on(table.registrationId)
      .where(sql`${table.registrationId} IS NOT NULL`),
    index("session_attendance_org_status_idx").on(
      table.organizationId,
      table.status,
      table.recordedAt,
    ),
    check(
      "session_attendance_status_valid",
      sql`${table.status} IN ('scheduled', 'attended', 'no-show', 'cancelled')`,
    ),
  ],
);

// Court reservations and community matches are not sessions, but attendance
// must still be auditable and contribute to the same player reliability view.
// The activity ID is deliberately polymorphic; every write validates activity
// ownership and the underlying participant before inserting a row.
export const activityAttendance = pgTable(
  "activity_attendance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Community matches may not belong to a club. Organization-scoped HQ
    // reads still filter this column, while player-host reports can remain
    // attributable without manufacturing an organization relationship.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    activityType: varchar("activity_type", { length: 24 }).notNull(),
    activityId: uuid("activity_id").notNull(),
    participantId: uuid("participant_id").notNull(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 24 }).notNull().default("scheduled"),
    source: varchar("source", { length: 24 }).notNull().default("manual"),
    note: text("note"),
    recordedByPersonId: uuid("recorded_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    recordedAt: timestamp("recorded_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("activity_attendance_person_unique").on(
      table.activityType,
      table.activityId,
      table.personId,
    ),
    index("activity_attendance_participant_idx").on(
      table.activityType,
      table.participantId,
    ),
    index("activity_attendance_person_status_idx").on(
      table.personId,
      table.status,
      table.recordedAt,
    ),
    check(
      "activity_attendance_type_valid",
      sql`${table.activityType} IN ('court-booking', 'pickup')`,
    ),
    check(
      "activity_attendance_status_valid",
      sql`${table.status} IN ('scheduled', 'attended', 'no-show', 'cancelled')`,
    ),
    check(
      "activity_attendance_source_valid",
      sql`${table.source} IN ('manual', 'member-qr', 'player-report', 'system')`,
    ),
  ],
);

// A player's post-event reflection belongs to that player alone unless they
// explicitly choose to share it. It is deliberately separate from a coach's
// session note: coaches and organizations must never gain read access merely
// because they hosted the activity.
export const playerEventNotes = pgTable(
  "player_event_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    activityType: varchar("activity_type", { length: 24 }).notNull(),
    activityId: uuid("activity_id").notNull(),
    visibility: varchar("visibility", { length: 24 })
      .notNull()
      .default("private"),
    source: varchar("source", { length: 24 }).notNull().default("typed"),
    body: text("body").notNull(),
    audioUrl: text("audio_url"),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("player_event_note_person_activity_idx").on(
      table.personId,
      table.activityType,
      table.activityId,
      table.createdAt,
    ),
    check(
      "player_event_note_type_valid",
      sql`${table.activityType} IN ('pickup', 'session')`,
    ),
    check(
      "player_event_note_visibility_valid",
      sql`${table.visibility} IN ('private', 'shared-with-host')`,
    ),
    check(
      "player_event_note_source_valid",
      sql`${table.source} IN ('typed', 'voice')`,
    ),
  ],
);

// Arrival signals deliberately retain only short-lived derived travel data.
// Raw device coordinates are used to calculate distance/ETA, then discarded.
export const sessionArrivalSignals = pgTable(
  "session_arrival_signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    registrationId: uuid("registration_id").references(() => registrations.id, {
      onDelete: "cascade",
    }),
    role: varchar("role", { length: 16 }).notNull(),
    status: varchar("status", { length: 24 }).notNull(),
    distanceMeters: integer("distance_meters").notNull(),
    travelDurationSeconds: integer("travel_duration_seconds").notNull(),
    leaveBy: timestamp("leave_by", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    routeSource: varchar("route_source", { length: 24 }).notNull(),
    accuracyMeters: doublePrecision("accuracy_meters"),
    consentedAt: timestamp("consented_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    observedAt: timestamp("observed_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("session_arrival_signal_session_person_unique").on(
      table.sessionId,
      table.personId,
    ),
    index("session_arrival_signal_session_expiry_idx").on(
      table.sessionId,
      table.expiresAt,
    ),
    index("session_arrival_signal_person_expiry_idx").on(
      table.personId,
      table.expiresAt,
    ),
    check(
      "session_arrival_signal_role_valid",
      sql`${table.role} IN ('player', 'coach')`,
    ),
    check(
      "session_arrival_signal_status_valid",
      sql`${table.status} IN ('on-time', 'leave-now', 'running-late', 'arrived')`,
    ),
    check(
      "session_arrival_signal_distance_valid",
      sql`${table.distanceMeters} >= 0 AND ${table.travelDurationSeconds} >= 0 AND (${table.accuracyMeters} IS NULL OR ${table.accuracyMeters} >= 0)`,
    ),
    check(
      "session_arrival_signal_expiry_valid",
      sql`${table.expiresAt} > ${table.observedAt}`,
    ),
  ],
);

export const sessionNotes = pgTable(
  "session_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    authorPersonId: uuid("author_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    subject: text("subject"),
    visibility: varchar("visibility", { length: 24 })
      .notNull()
      .default("private"),
    source: varchar("source", { length: 24 }).notNull().default("typed"),
    transcript: text("transcript"),
    summary: text("summary").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("draft"),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("session_note_org_session_idx").on(
      table.organizationId,
      table.sessionId,
      table.createdAt,
    ),
    check(
      "session_note_visibility_valid",
      sql`${table.visibility} IN ('private', 'player')`,
    ),
    check(
      "session_note_source_valid",
      sql`${table.source} IN ('typed', 'livekit-voice')`,
    ),
    check(
      "session_note_status_valid",
      sql`${table.status} IN ('draft', 'published', 'archived')`,
    ),
    check(
      "session_note_publish_pair_valid",
      sql`(${table.status} = 'published' AND ${table.visibility} = 'player' AND ${table.publishedAt} IS NOT NULL) OR (${table.status} <> 'published' AND ${table.publishedAt} IS NULL)`,
    ),
  ],
);

export const sessionNoteRecipients = pgTable(
  "session_note_recipients",
  {
    noteId: uuid("note_id")
      .notNull()
      .references(() => sessionNotes.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    detected: boolean("detected").notNull().default(false),
    sharedAt: timestamp("shared_at", { withTimezone: true, mode: "date" }),
    createdAt,
  },
  (table) => [
    primaryKey({ columns: [table.noteId, table.personId] }),
    index("session_note_recipient_person_idx").on(
      table.personId,
      table.sharedAt,
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

// Player video, live streaming, direct uploads, sharing, and engagement
export const videoQuotaPolicies = pgTable(
  "video_quota_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id").references(() => people.id, {
      onDelete: "cascade",
    }),
    monthlyLiveSeconds: integer("monthly_live_seconds")
      .notNull()
      .default(8 * 60 * 60),
    monthlyUploadSeconds: integer("monthly_upload_seconds")
      .notNull()
      .default(30 * 60 * 60),
    enforceLiveLimit: boolean("enforce_live_limit").notNull().default(true),
    enforceUploadLimit: boolean("enforce_upload_limit").notNull().default(true),
    updatedByPersonId: uuid("updated_by_person_id").references(() => people.id),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("video_quota_global_unique")
      .on(sql`(1)`)
      .where(sql`${table.personId} IS NULL`),
    uniqueIndex("video_quota_person_unique")
      .on(table.personId)
      .where(sql`${table.personId} IS NOT NULL`),
    check(
      "video_quota_live_nonnegative",
      sql`${table.monthlyLiveSeconds} >= 0`,
    ),
    check(
      "video_quota_upload_nonnegative",
      sql`${table.monthlyUploadSeconds} >= 0`,
    ),
  ],
);

export const videos = pgTable(
  "videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerPersonId: uuid("owner_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    source: varchar("source", { length: 16 }).notNull(),
    category: varchar("category", { length: 16 }).notNull(),
    title: text("title").notNull(),
    eventId: uuid("event_id").references(() => sessions.id, {
      onDelete: "set null",
    }),
    matchId: uuid("match_id").references(() => matches.id, {
      onDelete: "set null",
    }),
    venueId: uuid("venue_id").references(() => venues.id, {
      onDelete: "set null",
    }),
    venueName: text("venue_name"),
    venueAddress: text("venue_address"),
    googlePlaceId: varchar("google_place_id", { length: 255 }),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    status: varchar("status", { length: 24 }).notNull().default("draft"),
    liveVisibility: varchar("live_visibility", { length: 16 })
      .notNull()
      .default("public"),
    recordingVisibility: varchar("recording_visibility", { length: 16 })
      .notNull()
      .default("private"),
    publishedToProfile: boolean("published_to_profile")
      .notNull()
      .default(false),
    hasAudio: boolean("has_audio").notNull().default(true),
    visionLearningConsent: boolean("vision_learning_consent")
      .notNull()
      .default(false),
    visionLearningConsentedAt: timestamp("vision_learning_consented_at", {
      withTimezone: true,
      mode: "date",
    }),
    musicRemovalRequested: boolean("music_removal_requested")
      .notNull()
      .default(false),
    musicRemovalStatus: varchar("music_removal_status", { length: 24 })
      .notNull()
      .default("not-requested"),
    muxLiveStreamId: varchar("mux_live_stream_id", {
      length: 128,
    }).unique(),
    muxLivePlaybackId: varchar("mux_live_playback_id", {
      length: 128,
    }).unique(),
    muxLivePlaybackPolicy: varchar("mux_live_playback_policy", {
      length: 16,
    }),
    muxAssetId: varchar("mux_asset_id", { length: 128 }).unique(),
    muxAssetPlaybackId: varchar("mux_asset_playback_id", {
      length: 128,
    }).unique(),
    muxAssetPlaybackPolicy: varchar("mux_asset_playback_policy", {
      length: 16,
    }),
    r2ObjectKey: text("r2_object_key").unique(),
    r2UploadId: text("r2_upload_id"),
    r2Etag: text("r2_etag"),
    originalFileName: text("original_file_name"),
    mimeType: varchar("mime_type", { length: 128 }),
    bytes: bigint("bytes", { mode: "number" }),
    durationSeconds: integer("duration_seconds"),
    courtCalibration: jsonb("court_calibration").$type<{
      readonly courtWidthMeters: number;
      readonly courtLengthMeters: number;
      readonly netHeightMeters: number;
      readonly qualityGrade: "excellent" | "good" | "limited" | "poor";
      readonly qualityScore: number;
      readonly confidence: number;
      readonly corners?: readonly {
        readonly x: number;
        readonly y: number;
      }[];
      readonly netLine?: readonly {
        readonly x: number;
        readonly y: number;
      }[];
      readonly netTopLine?: readonly {
        readonly x: number;
        readonly y: number;
      }[];
      readonly antennaPoints?: readonly {
        readonly x: number;
        readonly y: number;
      }[];
      readonly visibleCornerCount?: number;
      readonly nearLineVisible?: boolean;
      readonly partialCourt?: boolean;
      readonly edgeVisibility?: {
        readonly far: boolean;
        readonly left: boolean;
        readonly right: boolean;
        readonly near: boolean;
        readonly net: boolean;
      };
      readonly netDetected?: boolean;
      readonly antennaDetected?: boolean;
      readonly calibrationMode?: "automatic" | "assisted" | "manual";
      readonly modelVersion?: string;
      readonly deviceAttitude?: {
        readonly pitch: number;
        readonly roll: number;
        readonly yaw: number;
      };
      readonly lens?: string;
      readonly zoomFactor?: number;
      readonly warnings: readonly string[];
      readonly calibratedAt: string;
    }>(),
    startedAt: timestamp("started_at", {
      withTimezone: true,
      mode: "date",
    }),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
    readyAt: timestamp("ready_at", { withTimezone: true, mode: "date" }),
    failureReason: text("failure_reason"),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("video_organization_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    index("video_owner_created_idx").on(table.ownerPersonId, table.createdAt),
    index("video_event_status_idx").on(table.eventId, table.status),
    index("video_match_status_idx").on(table.matchId, table.status),
    index("video_public_profile_idx").on(
      table.ownerPersonId,
      table.publishedToProfile,
      table.status,
    ),
    check("video_source_valid", sql`${table.source} IN ('live', 'upload')`),
    check(
      "video_category_valid",
      sql`${table.category} IN ('practice', 'event', 'match', 'social')`,
    ),
    check(
      "video_status_valid",
      sql`${table.status} IN ('draft', 'uploading', 'processing', 'ready', 'live', 'ended', 'failed', 'deleted')`,
    ),
    check(
      "video_live_visibility_valid",
      sql`${table.liveVisibility} IN ('public', 'link-only')`,
    ),
    check(
      "video_recording_visibility_valid",
      sql`${table.recordingVisibility} IN ('public', 'private')`,
    ),
    check(
      "video_music_removal_status_valid",
      sql`${table.musicRemovalStatus} IN ('not-requested', 'queued', 'processing', 'complete', 'failed', 'provider-required')`,
    ),
    check(
      "video_duration_nonnegative",
      sql`${table.durationSeconds} IS NULL OR ${table.durationSeconds} >= 0`,
    ),
    check(
      "video_bytes_nonnegative",
      sql`${table.bytes} IS NULL OR ${table.bytes} >= 0`,
    ),
    check(
      "video_category_association",
      sql`(${table.category} <> 'event' OR ${table.eventId} IS NOT NULL) AND (${table.category} <> 'match' OR ${table.matchId} IS NOT NULL)`,
    ),
    check(
      "video_coordinates_pair",
      sql`(${table.latitude} IS NULL AND ${table.longitude} IS NULL) OR (${table.latitude} IS NOT NULL AND ${table.longitude} IS NOT NULL)`,
    ),
    check(
      "video_vision_learning_consent_pair",
      sql`(${table.visionLearningConsent} = false AND ${table.visionLearningConsentedAt} IS NULL) OR (${table.visionLearningConsent} = true AND ${table.visionLearningConsentedAt} IS NOT NULL)`,
    ),
  ],
);

export const visionSessions = pgTable(
  "vision_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerPersonId: uuid("owner_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    videoId: uuid("video_id")
      .unique()
      .references(() => videos.id, { onDelete: "set null" }),
    matchId: uuid("match_id").references(() => matches.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("setup"),
    remoteTokenHash: varchar("remote_token_hash", { length: 128 })
      .notNull()
      .unique(),
    remoteExpiresAt: timestamp("remote_expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    settings: jsonb("settings")
      .$type<{
        readonly captureMode?: "record" | "live" | "upload";
        readonly courtWidthMeters: number;
        readonly courtLengthMeters: number;
        readonly netHeightMeters: number;
        readonly cameraHeightMeters?: number;
        readonly overlayScoreboard: boolean;
        readonly teamA: string;
        readonly teamB: string;
        readonly corners?: readonly {
          readonly x: number;
          readonly y: number;
        }[];
        readonly netLine?: readonly {
          readonly x: number;
          readonly y: number;
        }[];
        readonly netTopLine?: readonly {
          readonly x: number;
          readonly y: number;
        }[];
        readonly antennaPoints?: readonly {
          readonly x: number;
          readonly y: number;
        }[];
        readonly nearLineVisible?: boolean;
        readonly edgeVisibility?: {
          readonly far: boolean;
          readonly left: boolean;
          readonly right: boolean;
          readonly near: boolean;
          readonly net: boolean;
        };
        readonly calibrationMode?: "automatic" | "assisted" | "manual";
      }>()
      .notNull(),
    controlVersion: integer("control_version").notNull().default(1),
    previewJpegBase64: text("preview_jpeg_base64"),
    previewCapturedAt: timestamp("preview_captured_at", {
      withTimezone: true,
      mode: "date",
    }),
    recordingStartedAt: timestamp("recording_started_at", {
      withTimezone: true,
      mode: "date",
    }),
    recordingEndedAt: timestamp("recording_ended_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastRemoteSeenAt: timestamp("last_remote_seen_at", {
      withTimezone: true,
      mode: "date",
    }),
    revokedAt: timestamp("revoked_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("vision_session_owner_created_idx").on(
      table.ownerPersonId,
      table.createdAt,
    ),
    index("vision_session_match_status_idx").on(table.matchId, table.status),
    check(
      "vision_session_status_valid",
      sql`${table.status} IN ('setup', 'ready', 'recording', 'ended', 'expired')`,
    ),
    check(
      "vision_session_control_version_positive",
      sql`${table.controlVersion} > 0`,
    ),
    check(
      "vision_session_remote_window_valid",
      sql`${table.remoteExpiresAt} > ${table.createdAt}`,
    ),
  ],
);

export const visionTimelineEvents = pgTable(
  "vision_timeline_events",
  {
    id: uuid("id").primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => visionSessions.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 24 }).notNull(),
    type: varchar("type", { length: 32 }).notNull(),
    winnerSide: varchar("winner_side", { length: 1 }),
    targetEventId: uuid("target_event_id"),
    elapsedMs: integer("elapsed_ms").notNull(),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    scoreState: jsonb("score_state").$type<{
      readonly setIndex: number;
      readonly sets: readonly { readonly a: number; readonly b: number }[];
      readonly serving?: "A" | "B";
      readonly status: "not-started" | "live" | "complete" | "forfeit";
    }>(),
    label: varchar("label", { length: 160 }),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt,
  },
  (table) => [
    index("vision_timeline_session_elapsed_idx").on(
      table.sessionId,
      table.elapsedMs,
    ),
    index("vision_timeline_session_occurred_idx").on(
      table.sessionId,
      table.occurredAt,
    ),
    check(
      "vision_timeline_source_valid",
      sql`${table.source} IN ('apple-watch', 'iphone', 'remote', 'match')`,
    ),
    check(
      "vision_timeline_type_valid",
      sql`${table.type} IN ('recording-started', 'rally-won', 'favorite', 'undo', 'side-change', 'set-ended', 'recording-stopped', 'calibration-updated', 'review-marker')`,
    ),
    check(
      "vision_timeline_winner_valid",
      sql`${table.winnerSide} IS NULL OR ${table.winnerSide} IN ('A', 'B')`,
    ),
    check(
      "vision_timeline_elapsed_valid",
      sql`${table.elapsedMs} BETWEEN 0 AND 43200000`,
    ),
  ],
);

// Model improvement is deliberately consented and human-reviewed. A sample
// references the low-resolution Vision preview instead of copying private video
// into a second store, and approval is distinct from automatic training.
export const visionCalibrationSamples = pgTable(
  "vision_calibration_samples",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" })
      .unique(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => visionSessions.id, { onDelete: "cascade" })
      .unique(),
    ownerPersonId: uuid("owner_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    sourceModelVersion: varchar("source_model_version", { length: 80 }),
    qualityScore: integer("quality_score"),
    geometry: jsonb("geometry").notNull().$type<Record<string, unknown>>(),
    previewCapturedAt: timestamp("preview_captured_at", {
      withTimezone: true,
      mode: "date",
    }),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    reviewedByPersonId: uuid("reviewed_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    reviewNotes: text("review_notes"),
    reviewedAt: timestamp("reviewed_at", {
      withTimezone: true,
      mode: "date",
    }),
    approvedForTrainingAt: timestamp("approved_for_training_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("vision_calibration_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    index("vision_calibration_owner_created_idx").on(
      table.ownerPersonId,
      table.createdAt,
    ),
    check(
      "vision_calibration_status_valid",
      sql`${table.status} IN ('pending', 'approved', 'rejected', 'training', 'trained')`,
    ),
    check(
      "vision_calibration_quality_score_valid",
      sql`${table.qualityScore} IS NULL OR ${table.qualityScore} BETWEEN 0 AND 100`,
    ),
    check(
      "vision_calibration_review_pair",
      sql`(${table.status} = 'pending' AND ${table.reviewedAt} IS NULL AND ${table.reviewedByPersonId} IS NULL) OR (${table.status} <> 'pending' AND ${table.reviewedAt} IS NOT NULL AND ${table.reviewedByPersonId} IS NOT NULL)`,
    ),
  ],
);

export const videoInsights = pgTable(
  "video_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    playerPersonId: uuid("player_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    category: varchar("category", { length: 32 }).notNull(),
    headline: varchar("headline", { length: 180 }).notNull(),
    guidance: text("guidance").notNull(),
    evidence: jsonb("evidence").notNull().$type<Record<string, unknown>>(),
    confidence: doublePrecision("confidence").notNull(),
    modelVersion: varchar("model_version", { length: 80 }),
    createdByType: varchar("created_by_type", { length: 16 })
      .notNull()
      .default("model"),
    status: varchar("status", { length: 24 }).notNull().default("draft"),
    reviewedByPersonId: uuid("reviewed_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("video_insight_player_status_idx").on(
      table.playerPersonId,
      table.status,
      table.createdAt,
    ),
    index("video_insight_video_idx").on(table.videoId, table.createdAt),
    check(
      "video_insight_category_valid",
      sql`${table.category} IN ('hitting', 'passing', 'setting', 'serving', 'movement', 'strategy')`,
    ),
    check(
      "video_insight_confidence_valid",
      sql`${table.confidence} BETWEEN 0 AND 1`,
    ),
    check(
      "video_insight_creator_valid",
      sql`${table.createdByType} IN ('model', 'pro', 'admin')`,
    ),
    check(
      "video_insight_status_valid",
      sql`${table.status} IN ('draft', 'pro-review', 'published', 'dismissed', 'archived')`,
    ),
  ],
);

export const videoInsightFeedback = pgTable(
  "video_insight_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    insightId: uuid("insight_id")
      .notNull()
      .references(() => videoInsights.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    vote: integer("vote").notNull(),
    note: text("note"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("video_insight_feedback_person_unique").on(
      table.insightId,
      table.personId,
    ),
    index("video_insight_feedback_created_idx").on(table.createdAt),
    check("video_insight_feedback_vote_valid", sql`${table.vote} IN (-1, 1)`),
  ],
);

// Duna Vision analysis is evidence-first. A run contains calibration and
// pipeline provenance; events are immutable observations; reviews are separate
// human decisions so a model result is never silently rewritten as fact.
export const videoAnalysisRuns = pgTable(
  "video_analysis_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    visionSessionId: uuid("vision_session_id").references(
      () => visionSessions.id,
      { onDelete: "set null" },
    ),
    requestedByPersonId: uuid("requested_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    status: varchar("status", { length: 24 }).notNull().default("queued"),
    pipelineVersion: varchar("pipeline_version", { length: 80 }).notNull(),
    modelVersion: varchar("model_version", { length: 80 }),
    courtMap: jsonb("court_map").$type<{
      readonly widthMeters: number;
      readonly lengthMeters: number;
      readonly coordinateFrame: "canonical-court";
      readonly calibrationSource: "vision" | "manual" | "unknown";
      readonly calibrationQualityScore?: number;
      readonly imageCorners?: readonly {
        readonly x: number;
        readonly y: number;
      }[];
    }>(),
    coverage: jsonb("coverage").$type<{
      readonly sampledDurationUs?: number;
      readonly usableDurationUs?: number;
      readonly sourceVideoAvailable: boolean;
      readonly scoreTimelineAvailable: boolean;
    }>(),
    qualityGate: jsonb("quality_gate").$type<{
      attestationVersion: 1;
      decision: "passed" | "failed" | "unverified";
      productionEligible: boolean;
      benchmarkId?: string;
      modelBundleSha256: string;
      datasetManifestSha256?: string;
      evaluatedAt?: string;
      metrics: Record<string, number>;
      failedChecks: string[];
      evaluatedSlices: string[];
    }>(),
    artifactR2Key: text("artifact_r2_key"),
    failureCode: varchar("failure_code", { length: 80 }),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("video_analysis_run_video_created_idx").on(
      table.videoId,
      table.createdAt,
    ),
    index("video_analysis_run_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    check(
      "video_analysis_run_status_valid",
      sql`${table.status} IN ('queued', 'processing', 'ready', 'needs-review', 'failed', 'cancelled')`,
    ),
    check(
      "video_analysis_run_completed_pair",
      sql`(${table.status} IN ('ready', 'needs-review', 'failed', 'cancelled') AND ${table.completedAt} IS NOT NULL) OR (${table.status} NOT IN ('ready', 'needs-review', 'failed', 'cancelled'))`,
    ),
  ],
);

// Model files remain private objects. These rows are the governed registry:
// immutable bundle identity, evidence, lifecycle, cost, and human approvals.
export const visionModels = pgTable(
  "vision_models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    version: varchar("version", { length: 80 }).notNull(),
    bundleSha256: varchar("bundle_sha256", { length: 64 }).notNull(),
    bundleR2Prefix: text("bundle_r2_prefix").notNull(),
    detectorFamily: varchar("detector_family", { length: 80 }).notNull(),
    sourceLicense: varchar("source_license", { length: 80 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("candidate"),
    manifest: jsonb("manifest").notNull().$type<Record<string, unknown>>(),
    qualityGate: jsonb("quality_gate").$type<Record<string, unknown>>(),
    promotionAttestationR2Key: text("promotion_attestation_r2_key"),
    createdByPersonId: uuid("created_by_person_id").references(
      () => people.id,
      {
        onDelete: "set null",
      },
    ),
    shadowApprovedAt: timestamp("shadow_approved_at", {
      withTimezone: true,
      mode: "date",
    }),
    productionApprovedAt: timestamp("production_approved_at", {
      withTimezone: true,
      mode: "date",
    }),
    retiredAt: timestamp("retired_at", { withTimezone: true, mode: "date" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("vision_model_version_unique").on(table.version),
    uniqueIndex("vision_model_bundle_sha_unique").on(table.bundleSha256),
    index("vision_model_status_updated_idx").on(table.status, table.updatedAt),
    check(
      "vision_model_status_valid",
      sql`${table.status} IN ('candidate', 'shadow', 'production', 'retired', 'rejected')`,
    ),
    check(
      "vision_model_bundle_sha_valid",
      sql`${table.bundleSha256} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

export const visionTrainingRuns = pgTable(
  "vision_training_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestedModelVersion: varchar("requested_model_version", {
      length: 80,
    }).notNull(),
    modelId: uuid("model_id").references(() => visionModels.id, {
      onDelete: "set null",
    }),
    status: varchar("status", { length: 24 }).notNull().default("queued"),
    provider: varchar("provider", { length: 24 }).notNull().default("modal"),
    gpuType: varchar("gpu_type", { length: 24 }).notNull().default("L4"),
    datasetR2Key: text("dataset_r2_key").notNull(),
    datasetManifestSha256: varchar("dataset_manifest_sha256", { length: 64 }),
    baseModelVersion: varchar("base_model_version", { length: 80 }),
    codeCommitSha: varchar("code_commit_sha", { length: 64 }).notNull(),
    budgetCents: integer("budget_cents").notNull(),
    actualCostCents: integer("actual_cost_cents"),
    providerJobId: varchar("provider_job_id", { length: 160 }),
    metrics: jsonb("metrics").$type<Record<string, number>>(),
    failureCode: varchar("failure_code", { length: 80 }),
    requestedByPersonId: uuid("requested_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("vision_training_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    check(
      "vision_training_status_valid",
      sql`${table.status} IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')`,
    ),
    check(
      "vision_training_budget_valid",
      sql`${table.budgetCents} BETWEEN 100 AND 100000`,
    ),
    check(
      "vision_training_cost_valid",
      sql`${table.actualCostCents} IS NULL OR ${table.actualCostCents} >= 0`,
    ),
  ],
);

export const visionBenchmarkRuns = pgTable(
  "vision_benchmark_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelId: uuid("model_id")
      .notNull()
      .references(() => visionModels.id, { onDelete: "cascade" }),
    benchmarkId: varchar("benchmark_id", { length: 120 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("queued"),
    datasetManifestR2Key: text("dataset_manifest_r2_key").notNull(),
    datasetManifestSha256: varchar("dataset_manifest_sha256", { length: 64 }),
    attestationR2Key: text("attestation_r2_key"),
    qualityGate: jsonb("quality_gate").$type<Record<string, unknown>>(),
    providerJobId: varchar("provider_job_id", { length: 160 }),
    failureCode: varchar("failure_code", { length: 80 }),
    requestedByPersonId: uuid("requested_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("vision_benchmark_model_created_idx").on(
      table.modelId,
      table.createdAt,
    ),
    check(
      "vision_benchmark_status_valid",
      sql`${table.status} IN ('queued', 'running', 'passed', 'failed', 'cancelled')`,
    ),
  ],
);

export const visionModelApprovals = pgTable(
  "vision_model_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelId: uuid("model_id")
      .notNull()
      .references(() => visionModels.id, { onDelete: "cascade" }),
    stage: varchar("stage", { length: 24 }).notNull(),
    decision: varchar("decision", { length: 16 }).notNull(),
    reviewerPersonId: uuid("reviewer_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    notes: text("notes").notNull(),
    evidenceSha256: varchar("evidence_sha256", { length: 64 }).notNull(),
    createdAt,
  },
  (table) => [
    index("vision_model_approval_model_stage_idx").on(
      table.modelId,
      table.stage,
      table.createdAt,
    ),
    check(
      "vision_model_approval_stage_valid",
      sql`${table.stage} IN ('dataset', 'shadow', 'production', 'rollback')`,
    ),
    check(
      "vision_model_approval_decision_valid",
      sql`${table.decision} IN ('approved', 'rejected')`,
    ),
    check(
      "vision_model_approval_evidence_sha_valid",
      sql`${table.evidenceSha256} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

export const videoAnalysisEvents = pgTable(
  "video_analysis_events",
  {
    id: uuid("id").primaryKey(),
    runId: uuid("run_id").references(() => videoAnalysisRuns.id, {
      onDelete: "cascade",
    }),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    visionSessionId: uuid("vision_session_id").references(
      () => visionSessions.id,
      { onDelete: "set null" },
    ),
    eventType: varchar("event_type", { length: 32 }).notNull(),
    source: varchar("source", { length: 16 }).notNull(),
    state: varchar("state", { length: 16 }).notNull().default("proposed"),
    sessionTimeUs: bigint("session_time_us", { mode: "number" }).notNull(),
    durationUs: bigint("duration_us", { mode: "number" }),
    confidence: doublePrecision("confidence"),
    courtPoint: jsonb("court_point").$type<{
      readonly xMeters: number;
      readonly yMeters: number;
      readonly observed: "visible" | "edge" | "out-of-frame";
    }>(),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    modelVersion: varchar("model_version", { length: 80 }),
    createdByPersonId: uuid("created_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    supersedesEventId: uuid("supersedes_event_id"),
    createdAt,
  },
  (table) => [
    index("video_analysis_event_video_time_idx").on(
      table.videoId,
      table.sessionTimeUs,
    ),
    index("video_analysis_event_run_time_idx").on(
      table.runId,
      table.sessionTimeUs,
    ),
    index("video_analysis_event_session_time_idx").on(
      table.visionSessionId,
      table.sessionTimeUs,
    ),
    check(
      "video_analysis_event_type_valid",
      sql`${table.eventType} IN ('rally-started', 'rally-ended', 'ball-contact', 'ball-landing', 'player-position', 'highlight', 'review-marker')`,
    ),
    check(
      "video_analysis_event_source_valid",
      sql`${table.source} IN ('model', 'human', 'watch', 'system')`,
    ),
    check(
      "video_analysis_event_state_valid",
      sql`${table.state} IN ('proposed', 'confirmed', 'corrected', 'rejected')`,
    ),
    check(
      "video_analysis_event_time_valid",
      sql`${table.sessionTimeUs} BETWEEN 0 AND 43200000000`,
    ),
    check(
      "video_analysis_event_duration_valid",
      sql`${table.durationUs} IS NULL OR ${table.durationUs} BETWEEN 0 AND 43200000000`,
    ),
    check(
      "video_analysis_event_confidence_valid",
      sql`${table.confidence} IS NULL OR ${table.confidence} BETWEEN 0 AND 1`,
    ),
  ],
);

export const videoAnalysisReviews = pgTable(
  "video_analysis_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => videoAnalysisEvents.id, { onDelete: "cascade" }),
    reviewerPersonId: uuid("reviewer_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    decision: varchar("decision", { length: 16 }).notNull(),
    correction: jsonb("correction").$type<Record<string, unknown>>(),
    note: varchar("note", { length: 600 }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("video_analysis_review_event_reviewer_unique").on(
      table.eventId,
      table.reviewerPersonId,
    ),
    index("video_analysis_review_video_created_idx").on(
      table.videoId,
      table.createdAt,
    ),
    check(
      "video_analysis_review_decision_valid",
      sql`${table.decision} IN ('confirmed', 'corrected', 'rejected')`,
    ),
  ],
);

// Apple Health imports are intentionally separated from general profile data.
// Query metadata stays indexable; sensitive values are encrypted by the API.
export const healthConnections = pgTable(
  "health_connections",
  {
    personId: uuid("person_id")
      .primaryKey()
      .references(() => people.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 24 })
      .notNull()
      .default("apple-health"),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    consentVersion: varchar("consent_version", { length: 64 }).notNull(),
    enabledCategories: text("enabled_categories")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    timezone: varchar("timezone", { length: 64 }).notNull(),
    earliestAuthorizedAt: timestamp("earliest_authorized_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastSyncedAt: timestamp("last_synced_at", {
      withTimezone: true,
      mode: "date",
    }),
    revokedAt: timestamp("revoked_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "health_connection_provider_valid",
      sql`${table.provider} = 'apple-health'`,
    ),
    check(
      "health_connection_status_valid",
      sql`${table.status} IN ('active', 'paused', 'revoked')`,
    ),
    check(
      "health_connection_categories_valid",
      sql`${table.enabledCategories} <@ ARRAY['heart', 'recovery', 'activity', 'body']::text[]`,
    ),
  ],
);

export const healthSamples = pgTable(
  "health_samples",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    externalIdHash: varchar("external_id_hash", { length: 64 }).notNull(),
    metric: varchar("metric", { length: 48 }).notNull(),
    sampleKind: varchar("sample_kind", { length: 16 }).notNull(),
    startedAt: timestamp("started_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    endedAt: timestamp("ended_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    encryptedPayload: text("encrypted_payload").notNull(),
    encryptionIv: varchar("encryption_iv", { length: 32 }).notNull(),
    authTag: varchar("auth_tag", { length: 32 }).notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("health_sample_person_external_unique").on(
      table.personId,
      table.externalIdHash,
    ),
    index("health_sample_person_started_idx").on(
      table.personId,
      table.startedAt,
    ),
    index("health_sample_person_metric_started_idx").on(
      table.personId,
      table.metric,
      table.startedAt,
    ),
    check(
      "health_sample_metric_valid",
      sql`${table.metric} IN ('heart-rate', 'resting-heart-rate', 'heart-rate-variability', 'walking-heart-rate', 'vo2-max', 'respiratory-rate', 'oxygen-saturation', 'body-temperature', 'sleep', 'active-energy', 'basal-energy', 'steps', 'distance', 'exercise-minutes', 'stand-minutes', 'workout', 'weight', 'body-fat', 'lean-body-mass')`,
    ),
    check(
      "health_sample_kind_valid",
      sql`${table.sampleKind} IN ('quantity', 'category', 'workout')`,
    ),
    check(
      "health_sample_time_valid",
      sql`${table.endedAt} >= ${table.startedAt}`,
    ),
    check("health_sample_key_version_valid", sql`${table.keyVersion} > 0`),
  ],
);

// Athlete-reported context is health-adjacent sensitive data. Values and notes
// use the same envelope encryption as imported HealthKit samples; only the
// owner/date metadata remains indexable for one private check-in per day.
export const healthDailyCheckIns = pgTable(
  "health_daily_check_ins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    localDate: varchar("local_date", { length: 10 }).notNull(),
    encryptedPayload: text("encrypted_payload").notNull(),
    encryptionIv: varchar("encryption_iv", { length: 32 }).notNull(),
    authTag: varchar("auth_tag", { length: 32 }).notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("health_daily_check_in_person_date_unique").on(
      table.personId,
      table.localDate,
    ),
    index("health_daily_check_in_person_date_idx").on(
      table.personId,
      table.localDate,
    ),
    check(
      "health_daily_check_in_date_valid",
      sql`${table.localDate} ~ '^\\d{4}-\\d{2}-\\d{2}$'`,
    ),
    check(
      "health_daily_check_in_key_version_valid",
      sql`${table.keyVersion} > 0`,
    ),
  ],
);

export const healthSharingGrants = pgTable(
  "health_sharing_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerPersonId: uuid("owner_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    audienceKind: varchar("audience_kind", { length: 24 }).notNull(),
    audiencePersonId: uuid("audience_person_id").references(() => people.id, {
      onDelete: "cascade",
    }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    categories: text("categories")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    scopes: text("scopes")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    consentVersion: varchar("consent_version", { length: 64 }).notNull(),
    consentTextHash: varchar("consent_text_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    revokedAt: timestamp("revoked_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("health_grant_owner_idx").on(table.ownerPersonId, table.createdAt),
    index("health_grant_person_audience_idx").on(
      table.audiencePersonId,
      table.expiresAt,
    ),
    index("health_grant_org_audience_idx").on(
      table.organizationId,
      table.expiresAt,
    ),
    uniqueIndex("health_grant_active_person_unique")
      .on(table.ownerPersonId, table.audienceKind, table.audiencePersonId)
      .where(
        sql`${table.audiencePersonId} IS NOT NULL AND ${table.revokedAt} IS NULL`,
      ),
    uniqueIndex("health_grant_active_org_unique")
      .on(table.ownerPersonId, table.audienceKind, table.organizationId)
      .where(
        sql`${table.organizationId} IS NOT NULL AND ${table.revokedAt} IS NULL`,
      ),
    check(
      "health_grant_audience_kind_valid",
      sql`${table.audienceKind} IN ('player', 'coach', 'organization')`,
    ),
    check(
      "health_grant_audience_shape_valid",
      sql`(${table.audienceKind} IN ('player', 'coach') AND ${table.audiencePersonId} IS NOT NULL AND ${table.organizationId} IS NULL) OR (${table.audienceKind} = 'organization' AND ${table.audiencePersonId} IS NULL AND ${table.organizationId} IS NOT NULL)`,
    ),
    check(
      "health_grant_categories_valid",
      sql`cardinality(${table.categories}) > 0 AND ${table.categories} <@ ARRAY['heart', 'recovery', 'activity', 'body']::text[]`,
    ),
    check(
      "health_grant_scopes_valid",
      sql`cardinality(${table.scopes}) > 0 AND ${table.scopes} <@ ARRAY['summary', 'timeline', 'video-overlay']::text[]`,
    ),
    check(
      "health_grant_video_overlay_heart",
      sql`NOT ('video-overlay' = ANY(${table.scopes})) OR 'heart' = ANY(${table.categories})`,
    ),
    check(
      "health_grant_window_valid",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

export const videoShareLinks = pgTable(
  "video_share_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
    createdByPersonId: uuid("created_by_person_id")
      .notNull()
      .references(() => people.id),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    revokedAt: timestamp("revoked_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastUsedAt: timestamp("last_used_at", {
      withTimezone: true,
      mode: "date",
    }),
    useCount: integer("use_count").notNull().default(0),
    createdAt,
  },
  (table) => [
    index("video_share_link_video_idx").on(table.videoId, table.createdAt),
    check("video_share_link_use_count", sql`${table.useCount} >= 0`),
  ],
);

export const videoUploadParts = pgTable(
  "video_upload_parts",
  {
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    partNumber: integer("part_number").notNull(),
    etag: text("etag").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedAt: timestamp("uploaded_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.videoId, table.partNumber] }),
    check(
      "video_upload_part_number_valid",
      sql`${table.partNumber} BETWEEN 1 AND 10000`,
    ),
    check("video_upload_part_size_valid", sql`${table.sizeBytes} >= 0`),
  ],
);

export const videoViews = pgTable(
  "video_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    viewerPersonId: uuid("viewer_person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    shareLinkId: uuid("share_link_id").references(() => videoShareLinks.id, {
      onDelete: "set null",
    }),
    sessionTokenHash: varchar("session_token_hash", { length: 128 }).notNull(),
    platform: varchar("platform", { length: 16 }).notNull(),
    watchedSeconds: integer("watched_seconds").notNull().default(0),
    completed: boolean("completed").notNull().default(false),
    startedAt: timestamp("started_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    lastHeartbeatAt: timestamp("last_heartbeat_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    uniqueIndex("video_view_session_unique").on(
      table.videoId,
      table.sessionTokenHash,
    ),
    index("video_view_video_started_idx").on(table.videoId, table.startedAt),
    check(
      "video_view_platform_valid",
      sql`${table.platform} IN ('ios', 'web')`,
    ),
    check("video_view_watched_nonnegative", sql`${table.watchedSeconds} >= 0`),
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

export const matchParticipantInvitations = pgTable(
  "match_participant_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    provisionalPersonId: uuid("provisional_person_id")
      .notNull()
      .references(() => people.id),
    invitedByPersonId: uuid("invited_by_person_id")
      .notNull()
      .references(() => people.id),
    inviteToken: varchar("invite_token", { length: 96 }).notNull().unique(),
    invitedEmail: text("invited_email"),
    invitedPhoneE164: varchar("invited_phone_e164", { length: 24 }),
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
    uniqueIndex("match_participant_invitation_person_unique").on(
      table.matchId,
      table.provisionalPersonId,
    ),
    index("match_participant_invitation_match_status_idx").on(
      table.matchId,
      table.status,
    ),
    check(
      "match_participant_invitation_destination_present",
      sql`${table.invitedEmail} IS NOT NULL OR ${table.invitedPhoneE164} IS NOT NULL`,
    ),
    check(
      "match_participant_invitation_status_valid",
      sql`${table.status} IN ('pending', 'claimed', 'expired', 'cancelled')`,
    ),
    check(
      "match_participant_invitation_delivery_status_valid",
      sql`${table.deliveryStatus} IN ('not-configured', 'queued', 'sent', 'failed')`,
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

// Source policy is separate from imported evidence: pausing an upstream must
// never remove already-proven match history or official live snapshots.
export const scraperControls = pgTable(
  "scraper_controls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: varchar("source", { length: 64 }).notNull().unique(),
    enabled: boolean("enabled").notNull().default(true),
    engine: varchar("engine", { length: 16 }).notNull().default("auto"),
    minRequestIntervalMs: integer("min_request_interval_ms")
      .notNull()
      .default(3_000),
    maxRequestsPerHour: integer("max_requests_per_hour").notNull().default(120),
    linkedPlayerActiveRefreshHours: integer(
      "linked_player_active_refresh_hours",
    ),
    linkedPlayerIdleRefreshHours: integer("linked_player_idle_refresh_hours"),
    activePlayerWindowDays: integer("active_player_window_days"),
    activeEventRefreshMinutes: integer("active_event_refresh_minutes"),
    completedEventGraceHours: integer("completed_event_grace_hours"),
    liveTransportEnabled: boolean("live_transport_enabled")
      .notNull()
      .default(true),
    liveRefreshSeconds: integer("live_refresh_seconds"),
    liveRestFallbackSeconds: integer("live_rest_fallback_seconds"),
    liveHealthStatus: varchar("live_health_status", { length: 16 }),
    liveHealthCheckedAt: timestamp("live_health_checked_at", {
      withTimezone: true,
      mode: "date",
    }),
    liveHealthLatencyMs: integer("live_health_latency_ms"),
    liveHealthDetail: jsonb("live_health_detail")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    firecrawlCacheTtlSeconds: integer("firecrawl_cache_ttl_seconds"),
    firecrawlChangeTracking: boolean("firecrawl_change_tracking")
      .notNull()
      .default(false),
    nativeFailureStreak: integer("native_failure_streak").notNull().default(0),
    firecrawlPreferredUntil: timestamp("firecrawl_preferred_until", {
      withTimezone: true,
      mode: "date",
    }),
    nativeLastFailureAt: timestamp("native_last_failure_at", {
      withTimezone: true,
      mode: "date",
    }),
    firecrawlFallbackLastSucceededAt: timestamp(
      "firecrawl_fallback_last_succeeded_at",
      { withTimezone: true, mode: "date" },
    ),
    nativeLastError: text("native_last_error"),
    updatedByPersonId: uuid("updated_by_person_id").references(() => people.id),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "scraper_control_engine_valid",
      sql`${table.engine} IN ('auto', 'native', 'firecrawl')`,
    ),
    check(
      "scraper_control_min_interval_valid",
      sql`${table.minRequestIntervalMs} BETWEEN 250 AND 3600000`,
    ),
    check(
      "scraper_control_max_requests_valid",
      sql`${table.maxRequestsPerHour} BETWEEN 1 AND 10000`,
    ),
    check(
      "scraper_control_player_cadence_valid",
      sql`(${table.linkedPlayerActiveRefreshHours} IS NULL OR ${table.linkedPlayerActiveRefreshHours} BETWEEN 1 AND 720) AND (${table.linkedPlayerIdleRefreshHours} IS NULL OR ${table.linkedPlayerIdleRefreshHours} BETWEEN 1 AND 8760) AND (${table.activePlayerWindowDays} IS NULL OR ${table.activePlayerWindowDays} BETWEEN 1 AND 365)`,
    ),
    check(
      "scraper_control_event_cadence_valid",
      sql`(${table.activeEventRefreshMinutes} IS NULL OR ${table.activeEventRefreshMinutes} BETWEEN 5 AND 10080) AND (${table.completedEventGraceHours} IS NULL OR ${table.completedEventGraceHours} BETWEEN 0 AND 720)`,
    ),
    check(
      "scraper_control_live_transport_valid",
      sql`(${table.liveRefreshSeconds} IS NULL OR ${table.liveRefreshSeconds} BETWEEN 60 AND 3600) AND (${table.liveRestFallbackSeconds} IS NULL OR ${table.liveRestFallbackSeconds} BETWEEN 15 AND 300) AND (${table.liveHealthStatus} IS NULL OR ${table.liveHealthStatus} IN ('idle', 'healthy', 'degraded', 'unavailable', 'paused')) AND (${table.liveHealthLatencyMs} IS NULL OR ${table.liveHealthLatencyMs} >= 0)`,
    ),
    check(
      "scraper_control_cache_ttl_valid",
      sql`${table.firecrawlCacheTtlSeconds} IS NULL OR ${table.firecrawlCacheTtlSeconds} BETWEEN 0 AND 604800`,
    ),
    check(
      "scraper_control_native_failure_streak_valid",
      sql`${table.nativeFailureStreak} >= 0`,
    ),
  ],
);

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

export const professionalEventPredictions = pgTable(
  "professional_event_predictions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => professionalEvents.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    externalTeamId: text("external_team_id").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("professional_event_prediction_person_unique").on(
      table.eventId,
      table.personId,
    ),
    index("professional_event_prediction_team_idx").on(
      table.eventId,
      table.externalTeamId,
    ),
  ],
);

export const professionalEventPredictionHistory = pgTable(
  "professional_event_prediction_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => professionalEvents.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    previousExternalTeamId: text("previous_external_team_id"),
    newExternalTeamId: text("new_external_team_id").notNull(),
    changedAt: timestamp("changed_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("professional_event_prediction_history_person_idx").on(
      table.eventId,
      table.personId,
      table.changedAt,
    ),
  ],
);

export const professionalMatchPredictions = pgTable(
  "professional_match_predictions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importedMatchId: uuid("imported_match_id")
      .notNull()
      .references(() => importedMatches.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    predictedSide: varchar("predicted_side", { length: 1 }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("professional_match_prediction_person_unique").on(
      table.importedMatchId,
      table.personId,
    ),
    index("professional_match_prediction_side_idx").on(
      table.importedMatchId,
      table.predictedSide,
    ),
    check(
      "professional_match_prediction_side_valid",
      sql`${table.predictedSide} IN ('A', 'B')`,
    ),
  ],
);

export const professionalMatchPredictionHistory = pgTable(
  "professional_match_prediction_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importedMatchId: uuid("imported_match_id")
      .notNull()
      .references(() => importedMatches.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    previousSide: varchar("previous_side", { length: 1 }),
    newSide: varchar("new_side", { length: 1 }).notNull(),
    changedAt: timestamp("changed_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("professional_match_prediction_history_person_idx").on(
      table.importedMatchId,
      table.personId,
      table.changedAt,
    ),
    check(
      "professional_match_prediction_history_side_valid",
      sql`${table.newSide} IN ('A', 'B') AND (${table.previousSide} IS NULL OR ${table.previousSide} IN ('A', 'B'))`,
    ),
  ],
);

// Prediction credits are a closed, non-cash unit. They cannot be purchased,
// transferred, redeemed, or mixed with money and organization-credit ledgers.
export const predictionCreditAccounts = pgTable(
  "prediction_credit_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" })
      .unique(),
    cachedAvailableMicros: bigint("cached_available_micros", {
      mode: "number",
    })
      .notNull()
      .default(0),
    lifetimeGrantedMicros: bigint("lifetime_granted_micros", {
      mode: "number",
    })
      .notNull()
      .default(0),
    status: varchar("status", { length: 24 }).notNull().default("active"),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "prediction_credit_account_balance_valid",
      sql`${table.cachedAvailableMicros} >= 0 AND ${table.lifetimeGrantedMicros} >= 0`,
    ),
    check(
      "prediction_credit_account_status_valid",
      sql`${table.status} IN ('active', 'frozen', 'closed')`,
    ),
  ],
);

export const predictionMarkets = pgTable(
  "prediction_markets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectType: varchar("subject_type", { length: 32 }).notNull(),
    subjectId: text("subject_id").notNull(),
    groupKey: text("group_key"),
    title: text("title").notNull(),
    yesLabel: text("yes_label").notNull(),
    noLabel: text("no_label").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("open"),
    initialYesPriceBps: integer("initial_yes_price_bps")
      .notNull()
      .default(5_000),
    lastYesPriceBps: integer("last_yes_price_bps").notNull().default(5_000),
    volumeMicros: bigint("volume_micros", { mode: "number" })
      .notNull()
      .default(0),
    opensAt: timestamp("opens_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    locksAt: timestamp("locks_at", { withTimezone: true, mode: "date" }),
    resolvedSide: varchar("resolved_side", { length: 3 }),
    settledAt: timestamp("settled_at", { withTimezone: true, mode: "date" }),
    sourceSnapshot: jsonb("source_snapshot")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    currentRuleVersion: integer("current_rule_version").notNull().default(1),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("prediction_market_subject_unique").on(
      table.subjectType,
      table.subjectId,
    ),
    index("prediction_market_group_idx").on(table.groupKey, table.status),
    index("prediction_market_status_lock_idx").on(table.status, table.locksAt),
    check(
      "prediction_market_status_valid",
      sql`${table.status} IN ('open', 'locked', 'settled', 'void')`,
    ),
    check(
      "prediction_market_prices_valid",
      sql`${table.initialYesPriceBps} BETWEEN 100 AND 9900 AND ${table.lastYesPriceBps} BETWEEN 0 AND 10000`,
    ),
    check(
      "prediction_market_resolution_valid",
      sql`${table.resolvedSide} IS NULL OR ${table.resolvedSide} IN ('yes', 'no')`,
    ),
  ],
);

// Market rules are versioned rather than overwritten so players and operators
// can inspect exactly which resolution language governed a position.
export const predictionMarketRuleVersions = pgTable(
  "prediction_market_rule_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => predictionMarkets.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    resolutionCriteria: text("resolution_criteria").notNull(),
    resolutionSource: text("resolution_source").notNull(),
    closePolicy: text("close_policy").notNull(),
    publicNote: text("public_note"),
    locksAt: timestamp("locks_at", { withTimezone: true, mode: "date" }),
    changeReason: text("change_reason").notNull(),
    createdByPersonId: uuid("created_by_person_id").references(() => people.id),
    createdAt,
  },
  (table) => [
    uniqueIndex("prediction_market_rule_version_unique").on(
      table.marketId,
      table.version,
    ),
    index("prediction_market_rule_market_time_idx").on(
      table.marketId,
      table.createdAt,
    ),
    check("prediction_market_rule_version_positive", sql`${table.version} > 0`),
  ],
);

export const predictionOrders = pgTable(
  "prediction_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => predictionMarkets.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => predictionCreditAccounts.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    intent: varchar("intent", { length: 4 }).notNull().default("buy"),
    side: varchar("side", { length: 3 }).notNull(),
    limitPriceBps: integer("limit_price_bps").notNull(),
    sharesMicros: bigint("shares_micros", { mode: "number" }).notNull(),
    remainingSharesMicros: bigint("remaining_shares_micros", {
      mode: "number",
    }).notNull(),
    reservedMicros: bigint("reserved_micros", { mode: "number" }).notNull(),
    reservedSharesMicros: bigint("reserved_shares_micros", {
      mode: "number",
    })
      .notNull()
      .default(0),
    spentMicros: bigint("spent_micros", { mode: "number" })
      .notNull()
      .default(0),
    proceedsMicros: bigint("proceeds_micros", { mode: "number" })
      .notNull()
      .default(0),
    status: varchar("status", { length: 24 }).notNull().default("open"),
    filledAt: timestamp("filled_at", { withTimezone: true, mode: "date" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("prediction_order_book_idx").on(
      table.marketId,
      table.side,
      table.status,
      table.limitPriceBps,
      table.createdAt,
    ),
    index("prediction_order_person_idx").on(table.personId, table.createdAt),
    check(
      "prediction_order_intent_valid",
      sql`${table.intent} IN ('buy', 'sell')`,
    ),
    check("prediction_order_side_valid", sql`${table.side} IN ('yes', 'no')`),
    check(
      "prediction_order_price_valid",
      sql`${table.limitPriceBps} BETWEEN 100 AND 9900`,
    ),
    check(
      "prediction_order_amounts_valid",
      sql`${table.sharesMicros} > 0 AND ${table.remainingSharesMicros} >= 0 AND ${table.remainingSharesMicros} <= ${table.sharesMicros} AND ${table.reservedMicros} >= 0 AND ${table.reservedSharesMicros} >= 0 AND ${table.reservedSharesMicros} <= ${table.remainingSharesMicros} AND ${table.spentMicros} >= 0 AND ${table.proceedsMicros} >= 0`,
    ),
    check(
      "prediction_order_reserve_type_valid",
      sql`(${table.intent} = 'buy' AND ${table.reservedSharesMicros} = 0) OR (${table.intent} = 'sell' AND ${table.reservedMicros} = 0)`,
    ),
    check(
      "prediction_order_status_valid",
      sql`${table.status} IN ('open', 'partially-filled', 'filled', 'settled', 'void')`,
    ),
  ],
);

export const predictionTrades = pgTable(
  "prediction_trades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => predictionMarkets.id, { onDelete: "cascade" }),
    yesOrderId: uuid("yes_order_id")
      .notNull()
      .references(() => predictionOrders.id),
    noOrderId: uuid("no_order_id")
      .notNull()
      .references(() => predictionOrders.id),
    makerOrderId: uuid("maker_order_id")
      .notNull()
      .references(() => predictionOrders.id),
    sharesMicros: bigint("shares_micros", { mode: "number" }).notNull(),
    yesPriceBps: integer("yes_price_bps").notNull(),
    yesCostMicros: bigint("yes_cost_micros", { mode: "number" }).notNull(),
    noCostMicros: bigint("no_cost_micros", { mode: "number" }).notNull(),
    executedAt: timestamp("executed_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    createdAt,
  },
  (table) => [
    index("prediction_trade_market_time_idx").on(
      table.marketId,
      table.executedAt,
    ),
    check("prediction_trade_shares_valid", sql`${table.sharesMicros} > 0`),
    check(
      "prediction_trade_price_valid",
      sql`${table.yesPriceBps} BETWEEN 100 AND 9900`,
    ),
    check(
      "prediction_trade_cost_valid",
      sql`${table.yesCostMicros} >= 0 AND ${table.noCostMicros} >= 0 AND ${table.yesCostMicros} + ${table.noCostMicros} = ${table.sharesMicros}`,
    ),
  ],
);

export const predictionPositions = pgTable(
  "prediction_positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => predictionMarkets.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => predictionCreditAccounts.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    side: varchar("side", { length: 3 }).notNull(),
    sharesMicros: bigint("shares_micros", { mode: "number" })
      .notNull()
      .default(0),
    costMicros: bigint("cost_micros", { mode: "number" }).notNull().default(0),
    payoutMicros: bigint("payout_micros", { mode: "number" })
      .notNull()
      .default(0),
    reservedSharesMicros: bigint("reserved_shares_micros", {
      mode: "number",
    })
      .notNull()
      .default(0),
    status: varchar("status", { length: 24 }).notNull().default("open"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("prediction_position_person_side_unique").on(
      table.marketId,
      table.personId,
      table.side,
    ),
    index("prediction_position_person_status_idx").on(
      table.personId,
      table.status,
    ),
    check(
      "prediction_position_side_valid",
      sql`${table.side} IN ('yes', 'no')`,
    ),
    check(
      "prediction_position_amounts_valid",
      sql`${table.sharesMicros} >= 0 AND ${table.costMicros} >= 0 AND ${table.payoutMicros} >= 0 AND ${table.reservedSharesMicros} >= 0 AND ${table.reservedSharesMicros} <= ${table.sharesMicros}`,
    ),
    check(
      "prediction_position_status_valid",
      sql`${table.status} IN ('open', 'won', 'lost', 'void')`,
    ),
  ],
);

export const predictionShareTrades = pgTable(
  "prediction_share_trades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => predictionMarkets.id, { onDelete: "cascade" }),
    side: varchar("side", { length: 3 }).notNull(),
    buyOrderId: uuid("buy_order_id")
      .notNull()
      .references(() => predictionOrders.id),
    sellOrderId: uuid("sell_order_id")
      .notNull()
      .references(() => predictionOrders.id),
    sellerPositionId: uuid("seller_position_id")
      .notNull()
      .references(() => predictionPositions.id),
    makerOrderId: uuid("maker_order_id")
      .notNull()
      .references(() => predictionOrders.id),
    sharesMicros: bigint("shares_micros", { mode: "number" }).notNull(),
    priceBps: integer("price_bps").notNull(),
    costMicros: bigint("cost_micros", { mode: "number" }).notNull(),
    executedAt: timestamp("executed_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    createdAt,
  },
  (table) => [
    index("prediction_share_trade_market_time_idx").on(
      table.marketId,
      table.executedAt,
    ),
    check(
      "prediction_share_trade_side_valid",
      sql`${table.side} IN ('yes', 'no')`,
    ),
    check(
      "prediction_share_trade_amounts_valid",
      sql`${table.sharesMicros} > 0 AND ${table.costMicros} >= 0`,
    ),
    check(
      "prediction_share_trade_price_valid",
      sql`${table.priceBps} BETWEEN 100 AND 9900`,
    ),
  ],
);

export const predictionPriceSnapshots = pgTable(
  "prediction_price_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => predictionMarkets.id, { onDelete: "cascade" }),
    yesPriceBps: integer("yes_price_bps").notNull(),
    source: varchar("source", { length: 24 }).notNull(),
    volumeMicros: bigint("volume_micros", { mode: "number" })
      .notNull()
      .default(0),
    recordedAt: timestamp("recorded_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    createdAt,
  },
  (table) => [
    index("prediction_price_market_time_idx").on(
      table.marketId,
      table.recordedAt,
    ),
    check(
      "prediction_price_snapshot_valid",
      sql`${table.yesPriceBps} BETWEEN 0 AND 10000 AND ${table.volumeMicros} >= 0`,
    ),
    check(
      "prediction_price_snapshot_source_valid",
      sql`${table.source} IN ('model', 'trade', 'settlement')`,
    ),
  ],
);

export const predictionCreditLedger = pgTable(
  "prediction_credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => predictionCreditAccounts.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    deltaMicros: bigint("delta_micros", { mode: "number" }).notNull(),
    kind: varchar("kind", { length: 32 }).notNull(),
    marketId: uuid("market_id").references(() => predictionMarkets.id),
    orderId: uuid("order_id").references(() => predictionOrders.id),
    positionId: uuid("position_id").references(() => predictionPositions.id),
    periodKey: varchar("period_key", { length: 16 }),
    idempotencyKey: varchar("idempotency_key", { length: 160 })
      .notNull()
      .unique(),
    note: text("note").notNull(),
    metadata: jsonb("metadata")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    chainSequence: bigint("chain_sequence", { mode: "number" })
      .notNull()
      .default(0),
    previousHash: varchar("previous_hash", { length: 64 })
      .notNull()
      .default(
        "0000000000000000000000000000000000000000000000000000000000000000",
      ),
    entryHash: varchar("entry_hash", { length: 64 })
      .notNull()
      .default(
        "0000000000000000000000000000000000000000000000000000000000000000",
      ),
    hashVersion: integer("hash_version").notNull().default(1),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    createdAt,
  },
  (table) => [
    index("prediction_credit_ledger_account_time_idx").on(
      table.accountId,
      table.occurredAt,
    ),
    index("prediction_credit_ledger_market_idx").on(table.marketId),
    uniqueIndex("prediction_credit_ledger_account_sequence_unique").on(
      table.accountId,
      table.chainSequence,
    ),
    uniqueIndex("prediction_credit_ledger_entry_hash_unique").on(
      table.entryHash,
    ),
    check(
      "prediction_credit_ledger_delta_valid",
      sql`${table.deltaMicros} <> 0 OR ${table.kind} IN ('sell-order', 'sell-release')`,
    ),
    check(
      "prediction_credit_ledger_kind_valid",
      sql`${table.kind} IN ('initial-grant', 'monthly-grant', 'order-reserve', 'sell-order', 'sell-release', 'sale-proceeds', 'price-improvement-refund', 'settlement', 'void-refund', 'admin-adjustment')`,
    ),
    check(
      "prediction_credit_ledger_hash_valid",
      sql`${table.hashVersion} = 1 AND char_length(${table.previousHash}) = 64 AND char_length(${table.entryHash}) = 64`,
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

export const ratingBacktestRuns = pgTable(
  "rating_backtest_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    configurationId: uuid("configuration_id")
      .notNull()
      .references(() => ratingConfigurations.id),
    methodologyVersion: varchar("methodology_version", {
      length: 48,
    }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("running"),
    matchesProcessed: integer("matches_processed").notNull().default(0),
    playersProcessed: integer("players_processed").notNull().default(0),
    dateFrom: timestamp("date_from", { withTimezone: true, mode: "date" }),
    dateTo: timestamp("date_to", { withTimezone: true, mode: "date" }),
    championModelId: varchar("champion_model_id", { length: 48 }),
    modelSummaries: jsonb("model_summaries")
      .notNull()
      .$type<
        readonly {
          readonly modelId: string;
          readonly label: string;
          readonly family: string;
          readonly sampleSize: number;
          readonly accuracy: number;
          readonly accuracyInterval95: readonly [number, number];
          readonly brierScore: number;
          readonly logLoss: number;
          readonly expectedCalibrationError: number;
          readonly areaUnderRocCurve: number;
          readonly calibration: readonly {
            readonly lowerBound: number;
            readonly upperBound: number;
            readonly predictions: number;
            readonly averageExpected: number;
            readonly observedWinRate: number;
          }[];
          readonly curve: readonly {
            readonly matches: number;
            readonly brierScore: number;
            readonly logLoss: number;
          }[];
        }[]
      >()
      .default([]),
    failureReason: text("failure_reason"),
    createdByPersonId: uuid("created_by_person_id").references(() => people.id),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("rating_backtest_status_completed_idx").on(
      table.status,
      table.completedAt,
    ),
    index("rating_backtest_configuration_idx").on(
      table.configurationId,
      table.createdAt,
    ),
    check(
      "rating_backtest_status_valid",
      sql`${table.status} IN ('running', 'completed', 'failed')`,
    ),
  ],
);

export const ratingBacktestPredictions = pgTable(
  "rating_backtest_predictions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => ratingBacktestRuns.id, { onDelete: "cascade" }),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    actualTeamA: integer("actual_team_a").notNull(),
    probabilities: jsonb("probabilities")
      .notNull()
      .$type<Readonly<Record<string, number>>>(),
    ensembleWeights: jsonb("ensemble_weights")
      .notNull()
      .$type<Readonly<Record<string, number>>>(),
    preMatchRatings: jsonb("pre_match_ratings").notNull().$type<{
      readonly teamA: readonly [number, number];
      readonly teamB: readonly [number, number];
      readonly players: Readonly<Record<string, number>>;
    }>(),
    createdAt,
  },
  (table) => [
    uniqueIndex("rating_backtest_prediction_run_match_unique").on(
      table.runId,
      table.matchId,
    ),
    index("rating_backtest_prediction_match_idx").on(table.matchId),
    index("rating_backtest_prediction_run_time_idx").on(
      table.runId,
      table.occurredAt,
    ),
    check(
      "rating_backtest_prediction_actual_valid",
      sql`${table.actualTeamA} IN (0, 1)`,
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
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 128 }),
  stripeInvoiceId: varchar("stripe_invoice_id", { length: 128 }).unique(),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 128 }),
  stripeTransferId: varchar("stripe_transfer_id", { length: 128 }),
  stripeDestinationPaymentId: varchar("stripe_destination_payment_id", {
    length: 128,
  }),
  stripeBalanceTransactionId: varchar("stripe_balance_transaction_id", {
    length: 128,
  }).unique(),
  status: varchar("status", { length: 24 }).notNull(),
  createdAt,
  updatedAt,
});

export const paymentSchedules = pgTable(
  "payment_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" })
      .unique(),
    buyerPersonId: uuid("buyer_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    stripeSubscriptionId: varchar("stripe_subscription_id", {
      length: 128,
    }).unique(),
    stripeSubscriptionScheduleId: varchar("stripe_subscription_schedule_id", {
      length: 128,
    }).unique(),
    kind: varchar("kind", { length: 24 }).notNull().default("installment"),
    status: varchar("status", { length: 24 }).notNull().default("scheduled"),
    installmentCount: integer("installment_count").notNull(),
    totalMinor: integer("total_minor").notNull(),
    paidMinor: integer("paid_minor").notNull().default(0),
    refundedMinor: integer("refunded_minor").notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull(),
    cadence: varchar("cadence", { length: 16 }).notNull().default("monthly"),
    termsSnapshot: jsonb("terms_snapshot")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    completedAt: timestamp("completed_at", {
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
    index("payment_schedule_buyer_status_idx").on(
      table.buyerPersonId,
      table.status,
      table.createdAt,
    ),
    index("payment_schedule_org_status_idx").on(
      table.organizationId,
      table.status,
      table.createdAt,
    ),
    check(
      "payment_schedule_kind_valid",
      sql`${table.kind} IN ('installment', 'membership')`,
    ),
    check(
      "payment_schedule_status_valid",
      sql`${table.status} IN ('scheduled', 'active', 'past-due', 'completed', 'cancelled', 'refunded')`,
    ),
    check(
      "payment_schedule_amounts_valid",
      sql`${table.installmentCount} > 0 AND ${table.totalMinor} >= 0 AND ${table.paidMinor} >= 0 AND ${table.refundedMinor} >= 0 AND ${table.paidMinor} <= ${table.totalMinor}`,
    ),
    check(
      "payment_schedule_cadence_valid",
      sql`${table.cadence} IN ('weekly', 'monthly', 'annual')`,
    ),
  ],
);

export const paymentScheduleInstallments = pgTable(
  "payment_schedule_installments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => paymentSchedules.id, { onDelete: "cascade" }),
    paymentId: uuid("payment_id").references(() => payments.id, {
      onDelete: "set null",
    }),
    sequence: integer("sequence").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    dueAt: timestamp("due_at", { withTimezone: true, mode: "date" }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("scheduled"),
    stripeInvoiceId: varchar("stripe_invoice_id", { length: 128 }).unique(),
    stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 128 }),
    attemptCount: integer("attempt_count").notNull().default(0),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
    failedAt: timestamp("failed_at", { withTimezone: true, mode: "date" }),
    failureMessage: text("failure_message"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("payment_schedule_installment_sequence_unique").on(
      table.scheduleId,
      table.sequence,
    ),
    index("payment_schedule_installment_due_idx").on(table.status, table.dueAt),
    check(
      "payment_schedule_installment_status_valid",
      sql`${table.status} IN ('scheduled', 'processing', 'paid', 'failed', 'refunded', 'cancelled')`,
    ),
    check(
      "payment_schedule_installment_amount_valid",
      sql`${table.sequence} > 0 AND ${table.amountMinor} >= 0 AND ${table.attemptCount} >= 0`,
    ),
  ],
);

export const organizationTerminalLocations = pgTable(
  "organization_terminal_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    stripeLocationId: varchar("stripe_location_id", { length: 128 })
      .notNull()
      .unique(),
    status: varchar("status", { length: 24 }).notNull().default("active"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("organization_terminal_location_org_unique").on(
      table.organizationId,
    ),
    check(
      "organization_terminal_location_status_valid",
      sql`${table.status} IN ('active', 'disabled')`,
    ),
  ],
);

export const operatorPaymentCollections = pgTable(
  "operator_payment_collections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    payerPersonId: uuid("payer_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    operatorPersonId: uuid("operator_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" })
      .unique(),
    referenceType: varchar("reference_type", { length: 24 })
      .notNull()
      .default("custom"),
    referenceId: uuid("reference_id"),
    referenceLabel: text("reference_label").notNull(),
    tender: varchar("tender", { length: 32 }).notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    applicationFeeMinor: integer("application_fee_minor").notNull().default(0),
    processingFeeMinor: integer("processing_fee_minor").notNull().default(0),
    commissionMinor: integer("commission_minor").notNull().default(0),
    creditsApplied: integer("credits_applied").notNull().default(0),
    walletCashAppliedMinor: integer("wallet_cash_applied_minor")
      .notNull()
      .default(0),
    stripePaymentIntentId: varchar("stripe_payment_intent_id", {
      length: 128,
    }).unique(),
    status: varchar("status", { length: 32 }).notNull().default("created"),
    declineCode: varchar("decline_code", { length: 96 }),
    failureCode: varchar("failure_code", { length: 96 }),
    failureMessage: text("failure_message"),
    receiptUrl: text("receipt_url"),
    idempotencyKey: varchar("idempotency_key", { length: 128 })
      .notNull()
      .unique(),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("operator_payment_collection_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    index("operator_payment_collection_operator_status_idx").on(
      table.operatorPersonId,
      table.status,
      table.createdAt,
    ),
    index("operator_payment_collection_payer_idx").on(
      table.payerPersonId,
      table.createdAt,
    ),
    check(
      "operator_payment_collection_reference_valid",
      sql`${table.referenceType} IN ('session', 'catalog-item', 'custom')`,
    ),
    check(
      "operator_payment_collection_tender_valid",
      sql`${table.tender} IN ('card-present', 'organization-credit', 'wallet-cash')`,
    ),
    check(
      "operator_payment_collection_status_valid",
      sql`${table.status} IN ('created', 'awaiting-reader', 'processing', 'succeeded', 'declined', 'failed', 'cancelled')`,
    ),
    check(
      "operator_payment_collection_amounts_valid",
      sql`${table.amountMinor} > 0 AND ${table.applicationFeeMinor} >= 0 AND ${table.processingFeeMinor} >= 0 AND ${table.commissionMinor} >= 0 AND ${table.creditsApplied} >= 0 AND ${table.walletCashAppliedMinor} >= 0`,
    ),
  ],
);

export const operatorPaymentEvents = pgTable(
  "operator_payment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => operatorPaymentCollections.id, {
        onDelete: "cascade",
      }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 48 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    processorCode: varchar("processor_code", { length: 96 }),
    message: text("message"),
    idempotencyKey: varchar("idempotency_key", { length: 128 })
      .notNull()
      .unique(),
    details: jsonb("details")
      .notNull()
      .$type<Record<string, string | number | boolean>>()
      .default({}),
    createdAt,
  },
  (table) => [
    index("operator_payment_event_collection_idx").on(
      table.collectionId,
      table.createdAt,
    ),
    index("operator_payment_event_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);

export const operatorEarningsGoals = pgTable(
  "operator_earnings_goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    targetMinor: integer("target_minor").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    period: varchar("period", { length: 16 }).notNull().default("month"),
    periodStartsAt: timestamp("period_starts_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    periodEndsAt: timestamp("period_ends_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("operator_earnings_goal_active_unique")
      .on(table.organizationId, table.personId)
      .where(sql`${table.active} = true`),
    index("operator_earnings_goal_period_idx").on(
      table.organizationId,
      table.personId,
      table.periodStartsAt,
      table.periodEndsAt,
    ),
    check("operator_earnings_goal_target_valid", sql`${table.targetMinor} > 0`),
    check(
      "operator_earnings_goal_period_valid",
      sql`${table.period} IN ('week', 'month', 'quarter', 'year') AND ${table.periodEndsAt} > ${table.periodStartsAt}`,
    ),
  ],
);

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
    stripeSubscriptionScheduleId: varchar("stripe_subscription_schedule_id", {
      length: 128,
    }).unique(),
    subscriptionPolicySnapshot: jsonb("subscription_policy_snapshot").$type<{
      readonly version: string;
      readonly initialTermMonths?: number;
      readonly renewalBehavior: "automatic" | "ends-after-term";
      readonly cancellationTiming: "period-end" | "immediate";
      readonly refundBehavior: "none" | "prorated" | "full-within-window";
      readonly refundWindowDays?: number;
      readonly trialDays: number;
      readonly trialPaymentMethod: "required" | "optional";
      readonly renewalReminderDays: number;
    }>(),
    trialEndsAt: timestamp("trial_ends_at", {
      withTimezone: true,
      mode: "date",
    }),
    initialTermEndsAt: timestamp("initial_term_ends_at", {
      withTimezone: true,
      mode: "date",
    }),
    cancellationRequestedAt: timestamp("cancellation_requested_at", {
      withTimezone: true,
      mode: "date",
    }),
    cancellationEffectiveAt: timestamp("cancellation_effective_at", {
      withTimezone: true,
      mode: "date",
    }),
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

export const membershipPolicyAcceptances = pgTable(
  "membership_policy_acceptances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    acceptanceKey: varchar("acceptance_key", { length: 128 })
      .notNull()
      .unique(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" })
      .unique(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    catalogItemId: uuid("catalog_item_id")
      .notNull()
      .references(() => catalogItems.id, { onDelete: "restrict" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    policyVersion: varchar("policy_version", { length: 32 }).notNull(),
    policySnapshot: jsonb("policy_snapshot")
      .notNull()
      .$type<Record<string, unknown>>(),
    disclosureText: text("disclosure_text").notNull(),
    disclosureTextHash: varchar("disclosure_text_hash", {
      length: 128,
    }).notNull(),
    affirmativeConsent: boolean("affirmative_consent").notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    acceptedAt: timestamp("accepted_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    createdAt,
  },
  (table) => [
    index("membership_policy_acceptance_person_idx").on(
      table.personId,
      table.acceptedAt,
    ),
    index("membership_policy_acceptance_org_idx").on(
      table.organizationId,
      table.acceptedAt,
    ),
    check(
      "membership_policy_acceptance_affirmative",
      sql`${table.affirmativeConsent} = true`,
    ),
  ],
);

export const membershipInvoiceTransactions = pgTable(
  "membership_invoice_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "restrict" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    stripeSubscriptionId: varchar("stripe_subscription_id", {
      length: 128,
    }).notNull(),
    stripeInvoiceId: varchar("stripe_invoice_id", { length: 128 })
      .notNull()
      .unique(),
    stripePaymentIntentId: varchar("stripe_payment_intent_id", {
      length: 128,
    }),
    stripeTaxTransactionId: varchar("stripe_tax_transaction_id", {
      length: 128,
    }),
    stripeTaxTransferReversalId: varchar("stripe_tax_transfer_reversal_id", {
      length: 128,
    }),
    amountPaidMinor: integer("amount_paid_minor").notNull(),
    taxAmountMinor: integer("tax_amount_minor").notNull().default(0),
    refundedMinor: integer("refunded_minor").notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull(),
    status: varchar("status", { length: 24 }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("membership_invoice_membership_idx").on(
      table.membershipId,
      table.createdAt,
    ),
    index("membership_invoice_org_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    check(
      "membership_invoice_amounts_valid",
      sql`${table.amountPaidMinor} >= 0 AND ${table.taxAmountMinor} >= 0 AND ${table.refundedMinor} >= 0 AND ${table.refundedMinor} <= ${table.amountPaidMinor}`,
    ),
    check(
      "membership_invoice_status_valid",
      sql`${table.status} IN ('paid', 'partially-refunded', 'refunded', 'failed')`,
    ),
  ],
);

export const dunaPlusGrants = pgTable(
  "duna_plus_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id").references(() => people.id, {
      onDelete: "cascade",
    }),
    emailNormalized: varchar("email_normalized", { length: 320 })
      .notNull()
      .unique(),
    status: varchar("status", { length: 24 }).notNull().default("active"),
    startsAt: timestamp("starts_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }),
    reason: text("reason").notNull().default("Complimentary Premium+"),
    grantedByPersonId: uuid("granted_by_person_id").references(() => people.id),
    revokedByPersonId: uuid("revoked_by_person_id").references(() => people.id),
    revokedAt: timestamp("revoked_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("duna_plus_grant_person_idx").on(table.personId, table.status),
    index("duna_plus_grant_status_end_idx").on(table.status, table.endsAt),
    check(
      "duna_plus_grant_status_valid",
      sql`${table.status} IN ('active', 'revoked')`,
    ),
    check(
      "duna_plus_grant_window_valid",
      sql`${table.endsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`,
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
    restorationJournalId: uuid("restoration_journal_id").references(
      () => ledgerJournals.id,
      { onDelete: "restrict" },
    ),
    restoredAt: timestamp("restored_at", {
      withTimezone: true,
      mode: "date",
    }),
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
    index("organization_credit_application_restoration_idx").on(
      table.orderId,
      table.restoredAt,
    ),
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
    catalogItemVersionId: uuid("catalog_item_version_id").references(
      () => catalogItemVersions.id,
      { onDelete: "restrict" },
    ),
    catalogVariantId: uuid("catalog_variant_id")
      .notNull()
      .references(() => catalogVariants.id, { onDelete: "restrict" }),
    catalogSessionOccurrenceId: uuid(
      "catalog_session_occurrence_id",
    ).references(() => catalogSessionOccurrences.id, { onDelete: "restrict" }),
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
    index("catalog_fulfillment_version_idx").on(table.catalogItemVersionId),
    check(
      "catalog_fulfillment_kind_valid",
      sql`${table.kind} IN ('registration', 'appointment', 'pickup', 'shipment', 'rental', 'digital-content', 'membership', 'credit-grant', 'package')`,
    ),
    check(
      "catalog_fulfillment_status_valid",
      sql`${table.status} IN ('held', 'pending', 'ready', 'fulfilled', 'cancelled', 'refunded')`,
    ),
  ],
);

// One durable delivery record per scheduled online occurrence. Google remains the
// conference provider, while this row is Duna's source of truth for who the
// session belongs to, when it occurs, and whether its artifacts were ingested.
export const virtualSessionMeetings = pgTable(
  "virtual_session_meetings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    catalogItemId: uuid("catalog_item_id")
      .notNull()
      .references(() => catalogItems.id, { onDelete: "restrict" }),
    catalogSessionOccurrenceId: uuid("catalog_session_occurrence_id")
      .notNull()
      .unique()
      .references(() => catalogSessionOccurrences.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => sessions.id, {
      onDelete: "set null",
    }),
    coachPersonIds: uuid("coach_person_ids").array().notNull().default([]),
    participantSnapshot: jsonb("participant_snapshot")
      .notNull()
      .$type<
        readonly {
          readonly personId: string;
          readonly role: "coach" | "player";
          readonly displayName: string;
          readonly email: string;
        }[]
      >()
      .default([]),
    startsAt: timestamp("starts_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    endsAt: timestamp("ends_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    timezone: varchar("timezone", { length: 80 }).notNull(),
    provider: varchar("provider", { length: 32 })
      .notNull()
      .default("google-meet"),
    organizerEmail: text("organizer_email"),
    calendarEventId: text("calendar_event_id"),
    calendarHtmlUrl: text("calendar_html_url"),
    meetSpaceName: text("meet_space_name"),
    meetingCode: varchar("meeting_code", { length: 128 }),
    joinUrl: text("join_url"),
    conferenceRecordName: text("conference_record_name"),
    autoRecord: boolean("auto_record").notNull().default(false),
    autoTranscribe: boolean("auto_transcribe").notNull().default(false),
    generateAiSummary: boolean("generate_ai_summary").notNull().default(false),
    recordingConsentRequired: boolean("recording_consent_required")
      .notNull()
      .default(true),
    status: varchar("status", { length: 32 }).notNull().default("provisioning"),
    attempts: integer("attempts").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastError: text("last_error"),
    artifactsSyncedAt: timestamp("artifacts_synced_at", {
      withTimezone: true,
      mode: "date",
    }),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("virtual_session_catalog_time_idx").on(
      table.catalogItemId,
      table.startsAt,
    ),
    index("virtual_session_processing_idx").on(table.status, table.endsAt),
    index("virtual_session_calendar_event_idx").on(table.calendarEventId),
    check(
      "virtual_session_time_valid",
      sql`${table.endsAt} > ${table.startsAt}`,
    ),
    check(
      "virtual_session_provider_valid",
      sql`${table.provider} IN ('google-meet')`,
    ),
    check(
      "virtual_session_status_valid",
      sql`${table.status} IN ('provisioning', 'scheduled', 'in-progress', 'awaiting-artifacts', 'complete', 'failed', 'cancelled')`,
    ),
  ],
);

export const virtualSessionMeetingParticipants = pgTable(
  "virtual_session_meeting_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    virtualSessionMeetingId: uuid("virtual_session_meeting_id")
      .notNull()
      .references(() => virtualSessionMeetings.id, { onDelete: "cascade" }),
    fulfillmentId: uuid("fulfillment_id").references(
      () => catalogFulfillments.id,
      { onDelete: "cascade" },
    ),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    role: varchar("role", { length: 16 }).notNull(),
    emailSnapshot: text("email_snapshot"),
    displayNameSnapshot: text("display_name_snapshot").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("virtual_session_participant_meeting_person_unique").on(
      table.virtualSessionMeetingId,
      table.personId,
      table.role,
    ),
    index("virtual_session_participant_person_idx").on(
      table.personId,
      table.createdAt,
    ),
    check(
      "virtual_session_participant_role_valid",
      sql`${table.role} IN ('coach', 'player')`,
    ),
  ],
);

export const virtualSessionArtifacts = pgTable(
  "virtual_session_artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    virtualSessionMeetingId: uuid("virtual_session_meeting_id")
      .notNull()
      .references(() => virtualSessionMeetings.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 24 }).notNull(),
    providerArtifactName: text("provider_artifact_name").notNull(),
    providerFileId: text("provider_file_id"),
    providerExportUri: text("provider_export_uri"),
    storageObjectKey: text("storage_object_key"),
    state: varchar("state", { length: 24 }).notNull().default("pending"),
    transcriptText: text("transcript_text"),
    aiSummary: text("ai_summary"),
    actionItems: jsonb("action_items")
      .notNull()
      .$type<
        readonly {
          readonly ownerRole: "coach" | "player" | "shared";
          readonly text: string;
        }[]
      >()
      .default([]),
    participantRoles: jsonb("participant_roles")
      .notNull()
      .$type<
        readonly {
          readonly providerParticipantName: string;
          readonly displayName: string;
          readonly role: "coach" | "player" | "unknown";
        }[]
      >()
      .default([]),
    aiModel: varchar("ai_model", { length: 160 }),
    generatedAt: timestamp("generated_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("virtual_session_artifact_provider_unique").on(
      table.virtualSessionMeetingId,
      table.providerArtifactName,
    ),
    index("virtual_session_artifact_meeting_kind_idx").on(
      table.virtualSessionMeetingId,
      table.kind,
    ),
    check(
      "virtual_session_artifact_kind_valid",
      sql`${table.kind} IN ('recording', 'transcript')`,
    ),
    check(
      "virtual_session_artifact_state_valid",
      sql`${table.state} IN ('pending', 'available', 'stored', 'summarized', 'failed')`,
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
    policyVersion: varchar("policy_version", { length: 32 }),
    liability: varchar("liability", { length: 24 })
      .notNull()
      .default("platform"),
    stripeTaxCalculationId: varchar("stripe_tax_calculation_id", {
      length: 128,
    }),
    stripeTaxTransactionId: varchar("stripe_tax_transaction_id", {
      length: 128,
    }),
    stripeTransferReversalId: varchar("stripe_transfer_reversal_id", {
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
    taxWithheldAt: timestamp("tax_withheld_at", {
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
    check("order_tax_liability_valid", sql`${table.liability} IN ('platform')`),
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
    creditsRestored: integer("credits_restored"),
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
      sql`${table.disposition} IN ('original-payment', 'organization-credit', 'organization-credit-restoration')`,
    ),
    check(
      "refund_record_amount_valid",
      sql`(${table.disposition} = 'organization-credit-restoration' AND ${table.amountMinor} >= 0) OR (${table.disposition} <> 'organization-credit-restoration' AND ${table.amountMinor} > 0)`,
    ),
    check(
      "refund_record_credit_pair",
      sql`(${table.disposition} = 'organization-credit' AND ${table.creditsIssued} > 0 AND ${table.creditsRestored} IS NULL) OR (${table.disposition} = 'organization-credit-restoration' AND ${table.creditsIssued} IS NULL AND ${table.creditsRestored} > 0) OR (${table.disposition} = 'original-payment' AND ${table.creditsIssued} IS NULL AND ${table.creditsRestored} IS NULL)`,
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

export const payoutAllocations = pgTable(
  "payout_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    payoutId: uuid("payout_id")
      .notNull()
      .references(() => payouts.id, { onDelete: "cascade" }),
    paymentFundScheduleId: uuid("payment_fund_schedule_id")
      .notNull()
      .references(() => paymentFundSchedules.id, { onDelete: "restrict" }),
    amountMinor: integer("amount_minor").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("payout_allocation_fund_unique").on(
      table.payoutId,
      table.paymentFundScheduleId,
    ),
    check("payout_allocation_amount_valid", sql`${table.amountMinor} > 0`),
  ],
);

export const organizationRefundPolicies = pgTable(
  "organization_refund_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    mode: varchar("mode", { length: 24 }).notNull().default("refundable"),
    refundBeforeMinutes: integer("refund_before_minutes"),
    terms: text("terms").notNull().default(""),
    version: integer("version").notNull().default(1),
    isDefault: boolean("is_default").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("organization_refund_policy_name_unique").on(
      table.organizationId,
      table.name,
      table.version,
    ),
    uniqueIndex("organization_refund_policy_default_unique")
      .on(table.organizationId)
      .where(sql`${table.isDefault} = true AND ${table.active} = true`),
    index("organization_refund_policy_active_idx").on(
      table.organizationId,
      table.active,
    ),
    check(
      "organization_refund_policy_mode_valid",
      sql`${table.mode} IN ('refundable', 'non-refundable')`,
    ),
    check(
      "organization_refund_policy_window_valid",
      sql`(${table.mode} = 'refundable' AND ${table.refundBeforeMinutes} IS NOT NULL AND ${table.refundBeforeMinutes} >= 0) OR (${table.mode} = 'non-refundable' AND ${table.refundBeforeMinutes} IS NULL)`,
    ),
    check(
      "organization_refund_policy_version_valid",
      sql`${table.version} > 0`,
    ),
  ],
);

export const organizationMoneySettings = pgTable(
  "organization_money_settings",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    payoutInterval: varchar("payout_interval", { length: 16 })
      .notNull()
      .default("weekly"),
    weeklyPayoutDay: varchar("weekly_payout_day", { length: 12 })
      .notNull()
      .default("friday"),
    monthlyPayoutDay: integer("monthly_payout_day").notNull().default(1),
    minimumPayoutMinor: integer("minimum_payout_minor").notNull().default(0),
    statementDescriptor: varchar("statement_descriptor", { length: 22 }),
    payoutStatementDescriptor: varchar("payout_statement_descriptor", {
      length: 22,
    }),
    stripeSettingsStatus: varchar("stripe_settings_status", { length: 24 })
      .notNull()
      .default("not-synced"),
    stripeSettingsSyncedAt: timestamp("stripe_settings_synced_at", {
      withTimezone: true,
      mode: "date",
    }),
    stripeSettingsError: text("stripe_settings_error"),
    lastAutomaticPayoutAt: timestamp("last_automatic_payout_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "organization_money_payout_interval_valid",
      sql`${table.payoutInterval} IN ('manual', 'daily', 'weekly', 'monthly')`,
    ),
    check(
      "organization_money_weekly_day_valid",
      sql`${table.weeklyPayoutDay} IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday')`,
    ),
    check(
      "organization_money_monthly_day_valid",
      sql`${table.monthlyPayoutDay} BETWEEN 1 AND 28`,
    ),
    check(
      "organization_money_minimum_payout_valid",
      sql`${table.minimumPayoutMinor} >= 0`,
    ),
  ],
);

export const paymentFundSchedules = pgTable(
  "payment_fund_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    paymentId: uuid("payment_id").references(() => payments.id, {
      onDelete: "set null",
    }),
    installmentId: uuid("installment_id").references(
      () => paymentScheduleInstallments.id,
      { onDelete: "set null" },
    ),
    stripeTransferId: varchar("stripe_transfer_id", { length: 128 }),
    stripeBalanceTransactionId: varchar("stripe_balance_transaction_id", {
      length: 128,
    }),
    sessionId: uuid("session_id").references(() => sessions.id, {
      onDelete: "set null",
    }),
    payoutId: uuid("payout_id").references(() => payouts.id, {
      onDelete: "set null",
    }),
    policyId: uuid("policy_id"),
    policyName: text("policy_name").notNull(),
    policyVersion: integer("policy_version").notNull().default(1),
    policyMode: varchar("policy_mode", { length: 24 }).notNull(),
    refundBeforeMinutes: integer("refund_before_minutes"),
    eventStartsAt: timestamp("event_starts_at", {
      withTimezone: true,
      mode: "date",
    }),
    policyReleaseAt: timestamp("policy_release_at", {
      withTimezone: true,
      mode: "date",
    }),
    processorAvailableAt: timestamp("processor_available_at", {
      withTimezone: true,
      mode: "date",
    }),
    availableAt: timestamp("available_at", {
      withTimezone: true,
      mode: "date",
    }),
    grossMinor: integer("gross_minor").notNull(),
    consumerFeeMinor: integer("consumer_fee_minor").notNull().default(0),
    processingFeeMinor: integer("processing_fee_minor").notNull().default(0),
    organizationFeeMinor: integer("organization_fee_minor")
      .notNull()
      .default(0),
    taxMinor: integer("tax_minor").notNull().default(0),
    netMinor: integer("net_minor").notNull(),
    refundedMinor: integer("refunded_minor").notNull().default(0),
    disputedMinor: integer("disputed_minor").notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull(),
    status: varchar("status", { length: 24 })
      .notNull()
      .default("pending-clearance"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("payment_fund_schedule_payment_unique")
      .on(table.paymentId)
      .where(sql`${table.paymentId} IS NOT NULL`),
    uniqueIndex("payment_fund_schedule_installment_unique")
      .on(table.installmentId)
      .where(sql`${table.installmentId} IS NOT NULL`),
    index("payment_fund_schedule_release_idx").on(
      table.organizationId,
      table.status,
      table.availableAt,
    ),
    index("payment_fund_schedule_payout_idx").on(table.payoutId),
    check(
      "payment_fund_schedule_policy_valid",
      sql`${table.policyMode} IN ('refundable', 'non-refundable')`,
    ),
    check(
      "payment_fund_schedule_status_valid",
      sql`${table.status} IN ('pending-clearance', 'held', 'available', 'payout-pending', 'paid-out', 'partially-refunded', 'refunded', 'disputed')`,
    ),
    check(
      "payment_fund_schedule_amounts_valid",
      sql`${table.grossMinor} >= 0 AND ${table.consumerFeeMinor} >= 0 AND ${table.processingFeeMinor} >= 0 AND ${table.organizationFeeMinor} >= 0 AND ${table.taxMinor} >= 0 AND ${table.netMinor} >= 0 AND ${table.refundedMinor} >= 0 AND ${table.disputedMinor} >= 0`,
    ),
    check(
      "payment_fund_schedule_policy_window_valid",
      sql`(${table.policyMode} = 'refundable' AND ${table.refundBeforeMinutes} IS NOT NULL AND ${table.refundBeforeMinutes} >= 0) OR (${table.policyMode} = 'non-refundable' AND ${table.refundBeforeMinutes} IS NULL)`,
    ),
  ],
);

export const stripeTransactionLinks = pgTable(
  "stripe_transaction_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" })
      .unique(),
    stripePaymentIntentId: varchar("stripe_payment_intent_id", {
      length: 128,
    }).notNull(),
    stripeChargeId: varchar("stripe_charge_id", { length: 128 }).notNull(),
    stripeTransferId: varchar("stripe_transfer_id", { length: 128 }),
    stripeDestinationPaymentId: varchar("stripe_destination_payment_id", {
      length: 128,
    }),
    stripeBalanceTransactionId: varchar("stripe_balance_transaction_id", {
      length: 128,
    }).unique(),
    stripeApplicationFeeId: varchar("stripe_application_fee_id", {
      length: 128,
    }),
    grossMinor: integer("gross_minor").notNull(),
    feeMinor: integer("fee_minor").notNull().default(0),
    netMinor: integer("net_minor").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    availableAt: timestamp("available_at", {
      withTimezone: true,
      mode: "date",
    }),
    livemode: boolean("livemode").notNull(),
    evidence: jsonb("evidence")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    createdAt,
  },
  (table) => [
    index("stripe_transaction_link_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    check(
      "stripe_transaction_link_amounts_valid",
      sql`${table.grossMinor} >= 0 AND ${table.feeMinor} >= 0 AND ${table.netMinor} >= 0`,
    ),
  ],
);

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

export type VenueLayoutGeoGeometry = {
  readonly coordinateSpace: "geo";
  readonly shape: "rectangle" | "circle" | "polygon";
  readonly center: {
    readonly latitude: number;
    readonly longitude: number;
  };
  readonly widthMeters: number;
  readonly heightMeters: number;
  readonly radiusMeters?: number;
  readonly rotationDegrees: number;
  readonly bufferMeters: number;
  readonly points?: readonly {
    readonly latitude: number;
    readonly longitude: number;
  }[];
};

export type VenueLayoutFloorplanGeometry = {
  readonly coordinateSpace: "floorplan";
  readonly shape: "rectangle" | "circle" | "polygon";
  readonly center: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
  readonly radius?: number;
  readonly rotationDegrees: number;
  readonly buffer: number;
  readonly points?: readonly { readonly x: number; readonly y: number }[];
};

export type VenueLayoutGeometry =
  VenueLayoutGeoGeometry | VenueLayoutFloorplanGeometry;

export const venueLayouts = pgTable(
  "venue_layouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    eventSessionId: uuid("event_session_id").references(() => sessions.id, {
      onDelete: "set null",
    }),
    createdByPersonId: uuid("created_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    name: text("name").notNull(),
    version: integer("version").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("draft"),
    sourceType: varchar("source_type", { length: 24 })
      .notNull()
      .default("satellite"),
    isPrimary: boolean("is_primary").notNull().default(false),
    floorplanImageUrl: text("floorplan_image_url"),
    floorplanAnalysis:
      jsonb("floorplan_analysis").$type<Record<string, unknown>>(),
    mapCenterLatitude: doublePrecision("map_center_latitude"),
    mapCenterLongitude: doublePrecision("map_center_longitude"),
    mapZoom: doublePrecision("map_zoom").notNull().default(19),
    mapBearing: doublePrecision("map_bearing").notNull().default(0),
    mapPitch: doublePrecision("map_pitch").notNull().default(0),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("venue_layout_venue_version_unique").on(
      table.venueId,
      table.version,
    ),
    uniqueIndex("venue_layout_primary_unique")
      .on(table.venueId)
      .where(sql`${table.isPrimary} = true`),
    index("venue_layout_venue_status_idx").on(
      table.venueId,
      table.status,
      table.updatedAt,
    ),
    index("venue_layout_event_idx").on(table.eventSessionId),
    check("venue_layout_version_positive", sql`${table.version} > 0`),
    check(
      "venue_layout_status_valid",
      sql`${table.status} IN ('draft', 'published', 'archived')`,
    ),
    check(
      "venue_layout_source_type_valid",
      sql`${table.sourceType} IN ('satellite', 'floorplan')`,
    ),
    check(
      "venue_layout_map_center_pair",
      sql`(${table.mapCenterLatitude} IS NULL AND ${table.mapCenterLongitude} IS NULL) OR (${table.mapCenterLatitude} BETWEEN -90 AND 90 AND ${table.mapCenterLongitude} BETWEEN -180 AND 180)`,
    ),
  ],
);

export const venueLayoutAssets = pgTable(
  "venue_layout_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    layoutId: uuid("layout_id")
      .notNull()
      .references(() => venueLayouts.id, { onDelete: "cascade" }),
    courtId: uuid("court_id").references(() => courts.id, {
      onDelete: "cascade",
    }),
    ticketTypeId: uuid("ticket_type_id").references(() => ticketTypes.id, {
      onDelete: "set null",
    }),
    kind: varchar("kind", { length: 32 }).notNull(),
    templateKey: varchar("template_key", { length: 48 }),
    label: text("label").notNull(),
    identifierCode: varchar("identifier_code", { length: 48 }),
    capacity: integer("capacity"),
    geometry: jsonb("geometry").notNull().$type<VenueLayoutGeometry>(),
    appearance: jsonb("appearance")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    sortOrder: integer("sort_order").notNull().default(0),
    locked: boolean("locked").notNull().default(false),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("venue_layout_asset_court_unique")
      .on(table.layoutId, table.courtId)
      .where(sql`${table.courtId} IS NOT NULL`),
    uniqueIndex("venue_layout_asset_code_unique")
      .on(table.layoutId, table.identifierCode)
      .where(sql`${table.identifierCode} IS NOT NULL`),
    index("venue_layout_asset_layout_sort_idx").on(
      table.layoutId,
      table.sortOrder,
    ),
    check(
      "venue_layout_asset_kind_valid",
      sql`${table.kind} IN ('court', 'shape', 'ticketed-space', 'table', 'amenity', 'bookable-block')`,
    ),
    check(
      "venue_layout_asset_capacity_positive",
      sql`${table.capacity} IS NULL OR ${table.capacity} > 0`,
    ),
    check(
      "venue_layout_asset_court_link",
      sql`(${table.kind} = 'court' AND ${table.courtId} IS NOT NULL) OR ${table.kind} <> 'court'`,
    ),
  ],
);

export const venueLayoutDivisionPriorities = pgTable(
  "venue_layout_division_priorities",
  {
    layoutAssetId: uuid("layout_asset_id")
      .notNull()
      .references(() => venueLayoutAssets.id, { onDelete: "cascade" }),
    divisionId: uuid("division_id")
      .notNull()
      .references(() => divisions.id, { onDelete: "cascade" }),
    priority: integer("priority").notNull(),
    startsHere: boolean("starts_here").notNull().default(false),
    allowWhenFree: boolean("allow_when_free").notNull().default(true),
    createdAt,
    updatedAt,
  },
  (table) => [
    primaryKey({ columns: [table.layoutAssetId, table.divisionId] }),
    index("venue_layout_division_priority_idx").on(
      table.divisionId,
      table.priority,
    ),
    check(
      "venue_layout_division_priority_positive",
      sql`${table.priority} > 0`,
    ),
  ],
);

export const venueLayoutEventSettings = pgTable(
  "venue_layout_event_settings",
  {
    sessionId: uuid("session_id")
      .primaryKey()
      .references(() => sessions.id, { onDelete: "cascade" }),
    layoutId: uuid("layout_id")
      .notNull()
      .references(() => venueLayouts.id, { onDelete: "restrict" }),
    aiCourtAssignmentEnabled: boolean("ai_court_assignment_enabled")
      .notNull()
      .default(false),
    averageMatchMinutes: integer("average_match_minutes").notNull().default(45),
    releaseCourtWhenFree: boolean("release_court_when_free")
      .notNull()
      .default(true),
    rules: jsonb("rules")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("venue_layout_event_settings_layout_idx").on(table.layoutId),
    check(
      "venue_layout_event_match_minutes_positive",
      sql`${table.averageMatchMinutes} BETWEEN 10 AND 240`,
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
    teamId: uuid("team_id").references(() => teams.id, {
      onDelete: "set null",
    }),
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
          readonly deliveryChannel?: "email" | "sms" | "in-app";
          readonly deliveryStatus?: "queued" | "sent" | "failed";
          readonly providerMessageId?: string;
          readonly paidAt?: string;
          readonly orderId?: string;
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
    seed: integer("seed"),
    selectionStatus: varchar("selection_status", { length: 24 })
      .notNull()
      .default("pending"),
    selectionReason: text("selection_reason"),
    selectionLocked: boolean("selection_locked").notNull().default(false),
    qualificationScore: doublePrecision("qualification_score"),
    qualificationSnapshot: jsonb("qualification_snapshot").$type<{
      readonly method: string;
      readonly calculatedAt: string;
      readonly registrationClosesAt?: string;
      readonly fullyPaidAt?: string;
      readonly playerRatings: readonly {
        readonly personId: string;
        readonly display?: number;
        readonly current52WeekPeak?: number;
      }[];
    }>(),
    selectedAt: timestamp("selected_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("team_entry_registration_unique").on(table.registrationId),
    uniqueIndex("team_entry_team_unique")
      .on(table.teamId)
      .where(sql`${table.teamId} IS NOT NULL`),
    check("team_entry_expected_size", sql`${table.expectedTeamSize} >= 1`),
    check(
      "team_entry_payment_mode",
      sql`${table.paymentMode} IN ('self', 'team')`,
    ),
    check(
      "team_entry_status",
      sql`${table.status} IN ('assembling', 'ready', 'confirmed', 'cancelled', 'expired')`,
    ),
    check(
      "team_entry_selection_status",
      sql`${table.selectionStatus} IN ('pending', 'confirmed', 'waitlisted', 'withdrawn')`,
    ),
    check(
      "team_entry_seed_positive",
      sql`${table.seed} IS NULL OR ${table.seed} > 0`,
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
    name: text("name").notNull().default("Promotion"),
    code: varchar("code", { length: 48 }).notNull(),
    discountType: varchar("discount_type", { length: 16 }).notNull(),
    discountValue: integer("discount_value").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    minimumPurchaseMinor: integer("minimum_purchase_minor"),
    maximumDiscountMinor: integer("maximum_discount_minor"),
    redemptionCap: integer("redemption_cap"),
    perPersonLimit: integer("per_person_limit"),
    redeemedCount: integer("redeemed_count").notNull().default(0),
    appliesToAllPlans: boolean("applies_to_all_plans").notNull().default(false),
    appliesToAllProducts: boolean("applies_to_all_products")
      .notNull()
      .default(false),
    appliesToAllServices: boolean("applies_to_all_services")
      .notNull()
      .default(false),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }),
    stripeCouponId: varchar("stripe_coupon_id", { length: 128 }),
    stripePromotionCodeId: varchar("stripe_promotion_code_id", { length: 128 }),
    stripeSyncStatus: varchar("stripe_sync_status", { length: 24 })
      .notNull()
      .default("pending"),
    stripeSyncError: text("stripe_sync_error"),
    stripeSyncedAt: timestamp("stripe_synced_at", {
      withTimezone: true,
      mode: "date",
    }),
    // Promo codes are immutable commercial records. A revision is a new code
    // that succeeds an earlier one; checkout and redemption rows therefore
    // continue pointing at the exact rule set a customer used.
    lineageRootId: uuid("lineage_root_id").notNull(),
    supersedesPromoCodeId: uuid("supersedes_promo_code_id"),
    revision: integer("revision").notNull().default(1),
    duplicatedFromId: uuid("duplicated_from_id"),
    deactivatedAt: timestamp("deactivated_at", {
      withTimezone: true,
      mode: "date",
    }),
    active: boolean("active").notNull().default(true),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("promo_org_code_unique").on(table.organizationId, table.code),
    uniqueIndex("promo_lineage_revision_unique").on(
      table.lineageRootId,
      table.revision,
    ),
    uniqueIndex("promo_supersedes_unique")
      .on(table.supersedesPromoCodeId)
      .where(sql`${table.supersedesPromoCodeId} IS NOT NULL`),
    foreignKey({
      columns: [table.lineageRootId],
      foreignColumns: [table.id],
      name: "promo_codes_lineage_root_id_promo_codes_id_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.supersedesPromoCodeId],
      foreignColumns: [table.id],
      name: "promo_codes_supersedes_promo_code_id_promo_codes_id_fk",
    }).onDelete("restrict"),
    check(
      "promo_discount_type_valid",
      sql`${table.discountType} IN ('percent', 'amount')`,
    ),
    check("promo_revision_positive", sql`${table.revision} > 0`),
    check(
      "promo_discount_value_valid",
      sql`${table.discountValue} > 0 AND (${table.discountType} <> 'percent' OR ${table.discountValue} <= 10000)`,
    ),
    check(
      "promo_currency_uppercase",
      sql`${table.currency} = upper(${table.currency})`,
    ),
    check(
      "promo_limits_positive",
      sql`(${table.minimumPurchaseMinor} IS NULL OR ${table.minimumPurchaseMinor} >= 0) AND (${table.maximumDiscountMinor} IS NULL OR ${table.maximumDiscountMinor} > 0) AND (${table.redemptionCap} IS NULL OR ${table.redemptionCap} > 0) AND (${table.perPersonLimit} IS NULL OR ${table.perPersonLimit} > 0)`,
    ),
    check(
      "promo_window_valid",
      sql`${table.startsAt} IS NULL OR ${table.endsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`,
    ),
    check(
      "promo_stripe_sync_status_valid",
      sql`${table.stripeSyncStatus} IN ('pending', 'synced', 'failed', 'not-applicable')`,
    ),
  ],
);

export const promoCodeCatalogItems = pgTable(
  "promo_code_catalog_items",
  {
    promoCodeId: uuid("promo_code_id")
      .notNull()
      .references(() => promoCodes.id, { onDelete: "cascade" }),
    catalogItemId: uuid("catalog_item_id")
      .notNull()
      .references(() => catalogItems.id, { onDelete: "cascade" }),
    createdAt,
  },
  (table) => [
    primaryKey({ columns: [table.promoCodeId, table.catalogItemId] }),
    index("promo_item_catalog_idx").on(table.catalogItemId),
  ],
);

export const promoCodeMembers = pgTable(
  "promo_code_members",
  {
    promoCodeId: uuid("promo_code_id")
      .notNull()
      .references(() => promoCodes.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    createdAt,
  },
  (table) => [
    primaryKey({ columns: [table.promoCodeId, table.personId] }),
    index("promo_member_person_idx").on(table.personId),
  ],
);

export const promoCodeRedemptions = pgTable(
  "promo_code_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    promoCodeId: uuid("promo_code_id")
      .notNull()
      .references(() => promoCodes.id, { onDelete: "restrict" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    originalSubtotalMinor: integer("original_subtotal_minor").notNull(),
    eligibleSubtotalMinor: integer("eligible_subtotal_minor").notNull(),
    discountMinor: integer("discount_minor").notNull(),
    netSubtotalMinor: integer("net_subtotal_minor").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    stripeCouponId: varchar("stripe_coupon_id", { length: 128 }),
    stripePromotionCodeId: varchar("stripe_promotion_code_id", { length: 128 }),
    redeemedAt: timestamp("redeemed_at", {
      withTimezone: true,
      mode: "date",
    }),
    releasedAt: timestamp("released_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("promo_redemption_order_unique").on(table.orderId),
    index("promo_redemption_code_status_idx").on(
      table.promoCodeId,
      table.status,
    ),
    index("promo_redemption_person_idx").on(
      table.promoCodeId,
      table.personId,
      table.status,
    ),
    check(
      "promo_redemption_status_valid",
      sql`${table.status} IN ('pending', 'redeemed', 'released', 'refunded')`,
    ),
    check(
      "promo_redemption_amounts_valid",
      sql`${table.originalSubtotalMinor} >= 0 AND ${table.eligibleSubtotalMinor} >= 0 AND ${table.discountMinor} > 0 AND ${table.netSubtotalMinor} >= 0 AND ${table.netSubtotalMinor} = ${table.originalSubtotalMinor} - ${table.discountMinor}`,
    ),
    check(
      "promo_redemption_currency_uppercase",
      sql`${table.currency} = upper(${table.currency})`,
    ),
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
    audienceVersionId: uuid("audience_version_id").references(
      () => audienceVersions.id,
      { onDelete: "set null" },
    ),
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
    index("marketing_flow_audience_version_idx").on(table.audienceVersionId),
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
    audienceVersionId: uuid("audience_version_id").references(
      () => audienceVersions.id,
      { onDelete: "set null" },
    ),
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
    index("marketing_campaign_audience_version_idx").on(
      table.audienceVersionId,
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

export const playerFollowPreferences = pgTable(
  "player_follow_preferences",
  {
    followerPersonId: uuid("follower_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    playerPersonId: uuid("player_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    notifyRegistrations: boolean("notify_registrations")
      .notNull()
      .default(true),
    notifyWatch: boolean("notify_watch").notNull().default(true),
    notifyResults: boolean("notify_results").notNull().default(false),
    createdAt,
    updatedAt,
  },
  (table) => [
    primaryKey({
      columns: [table.followerPersonId, table.playerPersonId],
    }),
    index("player_follow_preferences_player_idx").on(table.playerPersonId),
    check(
      "player_follow_preferences_not_self",
      sql`${table.followerPersonId} <> ${table.playerPersonId}`,
    ),
  ],
);

export const playerFollowDeliveries = pgTable(
  "player_follow_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    followerPersonId: uuid("follower_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    playerPersonId: uuid("player_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 32 }).notNull(),
    entityKey: varchar("entity_key", { length: 192 }).notNull(),
    messageId: uuid("message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    payload: jsonb("payload")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    createdAt,
  },
  (table) => [
    uniqueIndex("player_follow_delivery_unique").on(
      table.followerPersonId,
      table.playerPersonId,
      table.kind,
      table.entityKey,
    ),
    index("player_follow_delivery_player_idx").on(
      table.playerPersonId,
      table.createdAt,
    ),
    check(
      "player_follow_delivery_kind_valid",
      sql`${table.kind} IN ('registration', 'watch', 'result')`,
    ),
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
    app: varchar("app", { length: 16 }).notNull().default("player"),
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
      sql`${table.subjectType} IN ('upcoming', 'match', 'event', 'player', 'coach')`,
    ),
    check("live_activity_app_valid", sql`${table.app} IN ('player', 'pro')`),
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
    addedByPersonId: uuid("added_by_person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    paidByPersonId: uuid("paid_by_person_id").references(() => people.id, {
      onDelete: "set null",
    }),
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
    index("pickup_participant_order_idx")
      .on(table.orderId)
      .where(sql`${table.orderId} IS NOT NULL`),
    index("pickup_participant_person_idx").on(table.personId, table.createdAt),
    check(
      "pickup_participant_pending_hold_required",
      sql`${table.status} <> 'pending' OR (${table.orderId} IS NOT NULL AND ${table.holdExpiresAt} IS NOT NULL)`,
    ),
  ],
);

// Explicit, time-bounded opt-in used to help match hosts fill open places.
// It is never inferred from browsing, location, or prior bookings.
export const matchAvailabilityPosts = pgTable(
  "match_availability_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id").references(() => venues.id, {
      onDelete: "cascade",
    }),
    startsAt: timestamp("starts_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    endsAt: timestamp("ends_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    matchType: varchar("match_type", { length: 16 })
      .notNull()
      .default("either"),
    genderPreference: varchar("gender_preference", { length: 16 })
      .notNull()
      .default("open"),
    formatPreferences: text("format_preferences")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    ratingMinimum: doublePrecision("rating_minimum"),
    ratingMaximum: doublePrecision("rating_maximum"),
    note: text("note"),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("match_availability_venue_time_idx").on(
      table.venueId,
      table.status,
      table.startsAt,
      table.endsAt,
    ),
    index("match_availability_person_idx").on(
      table.personId,
      table.status,
      table.endsAt,
    ),
    check(
      "match_availability_time_valid",
      sql`${table.endsAt} > ${table.startsAt}`,
    ),
    check(
      "match_availability_type_valid",
      sql`${table.matchType} IN ('either', 'competitive', 'casual')`,
    ),
    check(
      "match_availability_gender_valid",
      sql`${table.genderPreference} IN ('open', 'mens', 'womens', 'mixed')`,
    ),
    check(
      "match_availability_status_valid",
      sql`${table.status} IN ('active', 'paused', 'matched', 'cancelled')`,
    ),
    check(
      "match_availability_rating_valid",
      sql`(${table.ratingMinimum} IS NULL AND ${table.ratingMaximum} IS NULL) OR (${table.ratingMinimum} IS NOT NULL AND ${table.ratingMaximum} IS NOT NULL AND ${table.ratingMinimum} BETWEEN 1 AND 8 AND ${table.ratingMaximum} BETWEEN 1 AND 8 AND ${table.ratingMaximum} >= ${table.ratingMinimum})`,
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

// Training operating system: reusable drills and practice plans remain
// separate from the finite, scheduled program that delivers them. Immutable
// versions preserve exactly what a coach published and what an athlete saw.
export const trainingTags = pgTable(
  "training_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    slug: varchar("slug", { length: 80 }).notNull(),
    label: varchar("label", { length: 120 }).notNull(),
    aliases: text("aliases")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    category: varchar("category", { length: 24 }).notNull().default("custom"),
    isFocusArea: boolean("is_focus_area").notNull().default(false),
    createdByPersonId: uuid("created_by_person_id").references(
      () => people.id,
      {
        onDelete: "set null",
      },
    ),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("training_tag_platform_slug_unique")
      .on(table.slug)
      .where(sql`${table.organizationId} IS NULL`),
    uniqueIndex("training_tag_org_slug_unique")
      .on(table.organizationId, table.slug)
      .where(sql`${table.organizationId} IS NOT NULL`),
    index("training_tag_org_category_idx").on(
      table.organizationId,
      table.category,
    ),
    check(
      "training_tag_category_valid",
      sql`${table.category} IN ('focus', 'skill', 'context', 'custom')`,
    ),
  ],
);

export const trainingDrills = pgTable(
  "training_drills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Null is reserved for Duna-curated public library content. Organization
    // authors always retain their tenant ownership even when sharing publicly.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    slug: varchar("slug", { length: 96 }).notNull(),
    title: text("title").notNull(),
    status: trainingContentStatusEnum("status").notNull().default("draft"),
    visibility: trainingVisibilityEnum("visibility")
      .notNull()
      .default("organization"),
    activityKind: varchar("activity_kind", { length: 24 })
      .notNull()
      .default("drill"),
    discipline: disciplineEnum("discipline").notNull().default("beach-2s"),
    skillLevel: varchar("skill_level", { length: 32 })
      .notNull()
      .default("all-levels"),
    mode: varchar("mode", { length: 24 }).notNull().default("cooperative"),
    purpose: text("purpose").notNull(),
    targetAudience: text("target_audience").notNull(),
    summary: text("summary").notNull(),
    descriptionMarkdown: text("description_markdown").notNull(),
    minPlayers: integer("min_players").notNull().default(1),
    maxPlayers: integer("max_players").notNull().default(12),
    recommendedPlayers: integer("recommended_players").notNull().default(4),
    durationMinutes: integer("duration_minutes").notNull().default(10),
    intensity: integer("intensity").notNull().default(5),
    ballCount: integer("ball_count").notNull().default(1),
    equipment: text("equipment")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    setup: jsonb("setup")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    choreography: jsonb("choreography")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    scoring: jsonb("scoring")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    coaching: jsonb("coaching")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    estimateModel: jsonb("estimate_model")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    touchEstimateLow: integer("touch_estimate_low").notNull().default(0),
    touchEstimateTypical: integer("touch_estimate_typical")
      .notNull()
      .default(0),
    touchEstimateHigh: integer("touch_estimate_high").notNull().default(0),
    jumpEstimateTypical: integer("jump_estimate_typical").notNull().default(0),
    sourceName: text("source_name"),
    sourceUrl: text("source_url"),
    sourceLicense: text("source_license"),
    sourceAttribution: text("source_attribution"),
    currentVersionId: uuid("current_version_id"),
    createdByPersonId: uuid("created_by_person_id").references(
      () => people.id,
      {
        onDelete: "set null",
      },
    ),
    reviewedByPersonId: uuid("reviewed_by_person_id").references(
      () => people.id,
      {
        onDelete: "set null",
      },
    ),
    reviewedAt: timestamp("reviewed_at", {
      withTimezone: true,
      mode: "date",
    }),
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
    uniqueIndex("training_drill_platform_slug_unique")
      .on(table.slug)
      .where(sql`${table.organizationId} IS NULL`),
    uniqueIndex("training_drill_org_slug_unique")
      .on(table.organizationId, table.slug)
      .where(sql`${table.organizationId} IS NOT NULL`),
    index("training_drill_library_idx").on(
      table.visibility,
      table.status,
      table.activityKind,
    ),
    index("training_drill_org_updated_idx").on(
      table.organizationId,
      table.updatedAt,
    ),
    check(
      "training_drill_activity_valid",
      sql`${table.activityKind} IN ('drill', 'warmup', 'cool-down', 'conditioning', 'strength', 'plyometrics', 'film', 'meeting', 'recovery', 'assessment', 'break', 'transition')`,
    ),
    check(
      "training_drill_mode_valid",
      sql`${table.mode} IN ('cooperative', 'competitive', 'hybrid', 'individual')`,
    ),
    check(
      "training_drill_players_valid",
      sql`${table.minPlayers} > 0 AND ${table.maxPlayers} >= ${table.minPlayers} AND ${table.recommendedPlayers} BETWEEN ${table.minPlayers} AND ${table.maxPlayers}`,
    ),
    check(
      "training_drill_duration_valid",
      sql`${table.durationMinutes} BETWEEN 1 AND 480`,
    ),
    check(
      "training_drill_intensity_valid",
      sql`${table.intensity} BETWEEN 1 AND 10`,
    ),
    check(
      "training_drill_estimate_valid",
      sql`${table.touchEstimateLow} >= 0 AND ${table.touchEstimateTypical} >= ${table.touchEstimateLow} AND ${table.touchEstimateHigh} >= ${table.touchEstimateTypical} AND ${table.jumpEstimateTypical} >= 0`,
    ),
  ],
);

export const trainingDrillVersions = pgTable(
  "training_drill_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    drillId: uuid("drill_id")
      .notNull()
      .references(() => trainingDrills.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").notNull().$type<Record<string, unknown>>(),
    changeNote: text("change_note"),
    createdByPersonId: uuid("created_by_person_id").references(
      () => people.id,
      {
        onDelete: "set null",
      },
    ),
    createdAt,
  },
  (table) => [
    uniqueIndex("training_drill_version_unique").on(
      table.drillId,
      table.version,
    ),
    index("training_drill_version_created_idx").on(
      table.drillId,
      table.createdAt,
    ),
  ],
);

export const trainingDrillLicenses = pgTable(
  "training_drill_licenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    drillId: uuid("drill_id")
      .notNull()
      .references(() => trainingDrills.id, { onDelete: "restrict" }),
    sellerOrganizationId: uuid("seller_organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    buyerOrganizationId: uuid("buyer_organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    catalogFulfillmentId: uuid("catalog_fulfillment_id")
      .notNull()
      .references(() => catalogFulfillments.id, { onDelete: "restrict" }),
    status: varchar("status", { length: 24 }).notNull().default("active"),
    grantedAt: timestamp("granted_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("training_drill_license_buyer_unique").on(
      table.drillId,
      table.buyerOrganizationId,
    ),
    uniqueIndex("training_drill_license_fulfillment_unique").on(
      table.catalogFulfillmentId,
    ),
    index("training_drill_license_buyer_status_idx").on(
      table.buyerOrganizationId,
      table.status,
    ),
    check(
      "training_drill_license_status_valid",
      sql`${table.status} IN ('active', 'revoked', 'refunded')`,
    ),
    check(
      "training_drill_license_distinct_organizations",
      sql`${table.sellerOrganizationId} <> ${table.buyerOrganizationId}`,
    ),
  ],
);

export const trainingDrillTags = pgTable(
  "training_drill_tags",
  {
    drillId: uuid("drill_id")
      .notNull()
      .references(() => trainingDrills.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => trainingTags.id, { onDelete: "cascade" }),
    isFocusArea: boolean("is_focus_area").notNull().default(false),
    createdAt,
  },
  (table) => [
    primaryKey({ columns: [table.drillId, table.tagId] }),
    index("training_drill_tag_tag_idx").on(table.tagId, table.drillId),
    uniqueIndex("training_drill_one_focus_unique")
      .on(table.drillId)
      .where(sql`${table.isFocusArea} = true`),
  ],
);

export const trainingPracticePlans = pgTable(
  "training_practice_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 96 }).notNull(),
    title: text("title").notNull(),
    purpose: text("purpose").notNull(),
    targetAudience: text("target_audience").notNull(),
    status: trainingContentStatusEnum("status").notNull().default("draft"),
    visibility: trainingVisibilityEnum("visibility")
      .notNull()
      .default("organization"),
    durationMinutes: integer("duration_minutes").notNull().default(90),
    plannedLoad: integer("planned_load").notNull().default(50),
    currentVersionId: uuid("current_version_id"),
    createdByPersonId: uuid("created_by_person_id").references(
      () => people.id,
      {
        onDelete: "set null",
      },
    ),
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
    uniqueIndex("training_plan_org_slug_unique").on(
      table.organizationId,
      table.slug,
    ),
    index("training_plan_org_status_idx").on(
      table.organizationId,
      table.status,
      table.updatedAt,
    ),
    check(
      "training_plan_duration_valid",
      sql`${table.durationMinutes} BETWEEN 1 AND 720`,
    ),
    check(
      "training_plan_load_valid",
      sql`${table.plannedLoad} BETWEEN 0 AND 100`,
    ),
  ],
);

export const trainingPracticePlanVersions = pgTable(
  "training_practice_plan_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    practicePlanId: uuid("practice_plan_id")
      .notNull()
      .references(() => trainingPracticePlans.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").notNull().$type<Record<string, unknown>>(),
    changeNote: text("change_note"),
    createdByPersonId: uuid("created_by_person_id").references(
      () => people.id,
      {
        onDelete: "set null",
      },
    ),
    createdAt,
  },
  (table) => [
    uniqueIndex("training_plan_version_unique").on(
      table.practicePlanId,
      table.version,
    ),
    index("training_plan_version_created_idx").on(
      table.practicePlanId,
      table.createdAt,
    ),
  ],
);

export const trainingPracticePlanBlocks = pgTable(
  "training_practice_plan_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    practicePlanVersionId: uuid("practice_plan_version_id")
      .notNull()
      .references(() => trainingPracticePlanVersions.id, {
        onDelete: "cascade",
      }),
    drillVersionId: uuid("drill_version_id").references(
      () => trainingDrillVersions.id,
      { onDelete: "restrict" },
    ),
    sequence: integer("sequence").notNull(),
    lane: varchar("lane", { length: 48 }).notNull().default("all"),
    title: text("title").notNull(),
    kind: varchar("kind", { length: 24 }).notNull().default("drill"),
    startsAtMinute: integer("starts_at_minute").notNull().default(0),
    durationMinutes: integer("duration_minutes").notNull(),
    transitionMinutes: integer("transition_minutes").notNull().default(0),
    intensity: integer("intensity").notNull().default(5),
    plannedLoad: integer("planned_load").notNull().default(50),
    instructionsMarkdown: text("instructions_markdown"),
    estimates: jsonb("estimates")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    locked: boolean("locked").notNull().default(false),
    createdAt,
  },
  (table) => [
    uniqueIndex("training_plan_block_sequence_unique").on(
      table.practicePlanVersionId,
      table.lane,
      table.sequence,
    ),
    index("training_plan_block_timeline_idx").on(
      table.practicePlanVersionId,
      table.startsAtMinute,
    ),
    check(
      "training_plan_block_time_valid",
      sql`${table.startsAtMinute} >= 0 AND ${table.durationMinutes} > 0 AND ${table.transitionMinutes} >= 0`,
    ),
    check(
      "training_plan_block_load_valid",
      sql`${table.intensity} BETWEEN 1 AND 10 AND ${table.plannedLoad} BETWEEN 0 AND 100`,
    ),
  ],
);

export const trainingPracticePlanTags = pgTable(
  "training_practice_plan_tags",
  {
    practicePlanId: uuid("practice_plan_id")
      .notNull()
      .references(() => trainingPracticePlans.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => trainingTags.id, { onDelete: "cascade" }),
    isFocusArea: boolean("is_focus_area").notNull().default(false),
    createdAt,
  },
  (table) => [
    primaryKey({ columns: [table.practicePlanId, table.tagId] }),
    uniqueIndex("training_plan_one_focus_unique")
      .on(table.practicePlanId)
      .where(sql`${table.isFocusArea} = true`),
  ],
);

export const trainingPrograms = pgTable(
  "training_programs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    catalogItemId: uuid("catalog_item_id").references(() => catalogItems.id, {
      onDelete: "set null",
    }),
    slug: varchar("slug", { length: 96 }).notNull(),
    title: text("title").notNull(),
    purpose: text("purpose").notNull(),
    targetAudience: text("target_audience").notNull(),
    objectives: text("objectives")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    approach: text("approach").notNull(),
    status: trainingProgramStatusEnum("status").notNull().default("draft"),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    timezone: varchar("timezone", { length: 64 }).notNull(),
    recurrence: jsonb("recurrence")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    milestones: jsonb("milestones")
      .notNull()
      .$type<readonly Record<string, unknown>[]>()
      .default([]),
    scheduledSessionCount: integer("scheduled_session_count")
      .notNull()
      .default(0),
    defaultPracticeMinutes: integer("default_practice_minutes")
      .notNull()
      .default(90),
    athleteCount: integer("athlete_count").notNull().default(1),
    currentVersionId: uuid("current_version_id"),
    createdByPersonId: uuid("created_by_person_id").references(
      () => people.id,
      {
        onDelete: "set null",
      },
    ),
    activatedAt: timestamp("activated_at", {
      withTimezone: true,
      mode: "date",
    }),
    completedAt: timestamp("completed_at", {
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
    uniqueIndex("training_program_org_slug_unique").on(
      table.organizationId,
      table.slug,
    ),
    index("training_program_org_dates_idx").on(
      table.organizationId,
      table.startDate,
      table.endDate,
    ),
    index("training_program_catalog_idx")
      .on(table.catalogItemId)
      .where(sql`${table.catalogItemId} IS NOT NULL`),
    check(
      "training_program_dates_valid",
      sql`${table.endDate} >= ${table.startDate}`,
    ),
    check(
      "training_program_session_count_valid",
      sql`${table.scheduledSessionCount} >= 0`,
    ),
    check(
      "training_program_defaults_valid",
      sql`${table.defaultPracticeMinutes} BETWEEN 1 AND 720 AND ${table.athleteCount} > 0`,
    ),
  ],
);

export const trainingProgramVersions = pgTable(
  "training_program_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id")
      .notNull()
      .references(() => trainingPrograms.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").notNull().$type<Record<string, unknown>>(),
    changeNote: text("change_note"),
    createdByPersonId: uuid("created_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    createdAt,
  },
  (table) => [
    uniqueIndex("training_program_version_unique").on(
      table.programId,
      table.version,
    ),
    index("training_program_version_created_idx").on(
      table.programId,
      table.createdAt,
    ),
  ],
);

export const trainingProgramParticipants = pgTable(
  "training_program_participants",
  {
    programId: uuid("program_id")
      .notNull()
      .references(() => trainingPrograms.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 24 }).notNull().default("athlete"),
    status: varchar("status", { length: 24 }).notNull().default("active"),
    position: varchar("position", { length: 48 }),
    joinedAt: timestamp("joined_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    createdAt,
    updatedAt,
  },
  (table) => [
    primaryKey({ columns: [table.programId, table.personId] }),
    index("training_program_participant_person_idx").on(
      table.personId,
      table.status,
    ),
    check(
      "training_program_participant_role_valid",
      sql`${table.role} IN ('athlete', 'coach', 'assistant', 'director')`,
    ),
    check(
      "training_program_participant_status_valid",
      sql`${table.status} IN ('invited', 'active', 'paused', 'completed', 'removed')`,
    ),
  ],
);

export const trainingEvents = pgTable(
  "training_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    programId: uuid("program_id").references(() => trainingPrograms.id, {
      onDelete: "cascade",
    }),
    sessionId: uuid("session_id").references(() => sessions.id, {
      onDelete: "set null",
    }),
    practicePlanVersionId: uuid("practice_plan_version_id").references(
      () => trainingPracticePlanVersions.id,
      { onDelete: "set null" },
    ),
    kind: trainingEventKindEnum("kind").notNull(),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    endsAt: timestamp("ends_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    timezone: varchar("timezone", { length: 64 }).notNull(),
    status: trainingEventStatusEnum("status").notNull().default("planned"),
    coachPersonId: uuid("coach_person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    venueId: uuid("venue_id").references(() => venues.id, {
      onDelete: "set null",
    }),
    courtId: uuid("court_id").references(() => courts.id, {
      onDelete: "set null",
    }),
    focusAreaTagId: uuid("focus_area_tag_id").references(
      () => trainingTags.id,
      { onDelete: "set null" },
    ),
    objectives: text("objectives")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    plannedLoad: integer("planned_load").notNull().default(50),
    plannedIntensity: integer("planned_intensity").notNull().default(5),
    externalLoad: jsonb("external_load")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    notesMarkdown: text("notes_markdown"),
    source: varchar("source", { length: 24 }).notNull().default("program"),
    createdByPersonId: uuid("created_by_person_id").references(
      () => people.id,
      {
        onDelete: "set null",
      },
    ),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("training_event_org_time_idx").on(
      table.organizationId,
      table.startsAt,
    ),
    index("training_event_program_time_idx").on(
      table.programId,
      table.startsAt,
    ),
    check(
      "training_event_time_valid",
      sql`${table.endsAt} > ${table.startsAt}`,
    ),
    check(
      "training_event_load_valid",
      sql`${table.plannedLoad} BETWEEN 0 AND 100 AND ${table.plannedIntensity} BETWEEN 1 AND 10`,
    ),
    check(
      "training_event_source_valid",
      sql`${table.source} IN ('program', 'manual', 'catalog', 'imported', 'ai-draft')`,
    ),
  ],
);

export const trainingPracticeOutcomes = pgTable(
  "training_practice_outcomes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainingEventId: uuid("training_event_id")
      .notNull()
      .references(() => trainingEvents.id, { onDelete: "cascade" }),
    practicePlanVersionId: uuid("practice_plan_version_id").references(
      () => trainingPracticePlanVersions.id,
      { onDelete: "set null" },
    ),
    recordedByPersonId: uuid("recorded_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    actualStartsAt: timestamp("actual_starts_at", {
      withTimezone: true,
      mode: "date",
    }),
    actualEndsAt: timestamp("actual_ends_at", {
      withTimezone: true,
      mode: "date",
    }),
    actualLoad: integer("actual_load"),
    coachRpe: integer("coach_rpe"),
    attendanceCount: integer("attendance_count").notNull().default(0),
    plannedBlockCount: integer("planned_block_count").notNull().default(0),
    completedBlockCount: integer("completed_block_count").notNull().default(0),
    blockOutcomes: jsonb("block_outcomes")
      .notNull()
      .$type<readonly Record<string, unknown>[]>()
      .default([]),
    notesMarkdown: text("notes_markdown"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("training_practice_outcome_event_unique").on(
      table.trainingEventId,
    ),
    check(
      "training_practice_outcome_time_valid",
      sql`${table.actualEndsAt} IS NULL OR ${table.actualStartsAt} IS NULL OR ${table.actualEndsAt} > ${table.actualStartsAt}`,
    ),
    check(
      "training_practice_outcome_load_valid",
      sql`${table.actualLoad} IS NULL OR ${table.actualLoad} BETWEEN 0 AND 100`,
    ),
    check(
      "training_practice_outcome_rpe_valid",
      sql`${table.coachRpe} IS NULL OR ${table.coachRpe} BETWEEN 1 AND 10`,
    ),
    check(
      "training_practice_outcome_counts_valid",
      sql`${table.attendanceCount} >= 0 AND ${table.plannedBlockCount} >= 0 AND ${table.completedBlockCount} BETWEEN 0 AND ${table.plannedBlockCount}`,
    ),
  ],
);

export const trainingAthleteResponses = pgTable(
  "training_athlete_responses",
  {
    trainingEventId: uuid("training_event_id")
      .notNull()
      .references(() => trainingEvents.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    attendanceStatus: varchar("attendance_status", { length: 24 })
      .notNull()
      .default("attended"),
    minutesParticipated: integer("minutes_participated"),
    sessionRpe: integer("session_rpe"),
    feedback: text("feedback"),
    submittedAt: timestamp("submitted_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    primaryKey({ columns: [table.trainingEventId, table.personId] }),
    index("training_athlete_response_person_idx").on(
      table.personId,
      table.submittedAt,
    ),
    check(
      "training_athlete_response_attendance_valid",
      sql`${table.attendanceStatus} IN ('planned', 'attended', 'partial', 'excused', 'absent')`,
    ),
    check(
      "training_athlete_response_minutes_valid",
      sql`${table.minutesParticipated} IS NULL OR ${table.minutesParticipated} >= 0`,
    ),
    check(
      "training_athlete_response_rpe_valid",
      sql`${table.sessionRpe} IS NULL OR ${table.sessionRpe} BETWEEN 1 AND 10`,
    ),
  ],
);

export const trainingMediaAssets = pgTable(
  "training_media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    drillVersionId: uuid("drill_version_id")
      .notNull()
      .references(() => trainingDrillVersions.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 24 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("draft"),
    provider: varchar("provider", { length: 48 }).notNull().default("duna"),
    providerAssetId: text("provider_asset_id"),
    url: text("url"),
    posterUrl: text("poster_url"),
    altText: text("alt_text").notNull(),
    sceneSpec: jsonb("scene_spec")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    provenance: jsonb("provenance")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    createdByPersonId: uuid("created_by_person_id").references(
      () => people.id,
      {
        onDelete: "set null",
      },
    ),
    approvedByPersonId: uuid("approved_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    approvedAt: timestamp("approved_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("training_media_drill_version_idx").on(
      table.drillVersionId,
      table.kind,
      table.status,
    ),
    check(
      "training_media_kind_valid",
      sql`${table.kind} IN ('scene', 'diagram', 'animation', 'video', 'thumbnail')`,
    ),
    check(
      "training_media_status_valid",
      sql`${table.status} IN ('draft', 'generating', 'review', 'approved', 'failed', 'archived')`,
    ),
  ],
);

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

// A Super Admin refund is deliberately reviewed before it can reach Stripe or
// issue organization credits. The server stores only a hash of the challenge
// phrase and consumes each review once, so a front-end confirmation alone can
// never move money.
export const superAdminMoneyReviews = pgTable(
  "super_admin_money_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorPersonId: uuid("actor_person_id")
      .notNull()
      .references(() => people.id),
    buyerPersonId: uuid("buyer_person_id")
      .notNull()
      .references(() => people.id),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    amountMinor: integer("amount_minor").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    disposition: varchar("disposition", { length: 24 }).notNull(),
    credits: integer("credits"),
    reason: text("reason").notNull(),
    confirmationCodeHash: varchar("confirmation_code_hash", {
      length: 128,
    }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    confirmedAt: timestamp("confirmed_at", {
      withTimezone: true,
      mode: "date",
    }),
    failureCode: varchar("failure_code", { length: 80 }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("super_admin_money_review_actor_created_idx").on(
      table.actorPersonId,
      table.createdAt,
    ),
    index("super_admin_money_review_order_idx").on(table.orderId),
    check(
      "super_admin_money_review_amount_positive",
      sql`${table.amountMinor} > 0`,
    ),
    check(
      "super_admin_money_review_disposition_valid",
      sql`${table.disposition} IN ('original-payment', 'organization-credit')`,
    ),
    check(
      "super_admin_money_review_status_valid",
      sql`${table.status} IN ('pending', 'processing', 'succeeded', 'failed', 'expired')`,
    ),
  ],
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

// Demo data is deliberately tracked independently from the production tables it
// exercises. This makes the records visible to every normal product surface,
// while giving Super Admin an exact, auditable set of rows to remove later.
export const demoDataSets = pgTable(
  "demo_data_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 96 }).notNull(),
    label: text("label").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    createdByPersonId: uuid("created_by_person_id").references(() => people.id),
    updatedByPersonId: uuid("updated_by_person_id").references(() => people.id),
    enabledAt: timestamp("enabled_at", { withTimezone: true, mode: "date" }),
    disabledAt: timestamp("disabled_at", {
      withTimezone: true,
      mode: "date",
    }),
    ...{ createdAt, updatedAt },
  },
  (table) => [
    uniqueIndex("demo_data_set_organization_key_unique").on(
      table.organizationId,
      table.key,
    ),
    index("demo_data_set_organization_enabled_idx").on(
      table.organizationId,
      table.enabled,
    ),
  ],
);

export const demoDataRecords = pgTable(
  "demo_data_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dataSetId: uuid("data_set_id")
      .notNull()
      .references(() => demoDataSets.id, { onDelete: "cascade" }),
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    createdAt,
  },
  (table) => [
    uniqueIndex("demo_data_record_entity_unique").on(
      table.dataSetId,
      table.entityType,
      table.entityId,
    ),
    index("demo_data_record_set_type_idx").on(
      table.dataSetId,
      table.entityType,
    ),
  ],
);

// Duna Messaging is a relationship-scoped communication system. Neon remains
// authoritative for every read and write; the owned delivery layer only adds
// cursor sync and best-effort wake-up hints around these tables.
export const messagingPrincipalTypeEnum = pgEnum("messaging_principal_type", [
  "user",
  "organization",
  "agent",
]);
export const messagingConversationTypeEnum = pgEnum(
  "messaging_conversation_type",
  ["dm", "group", "event", "division", "league", "broadcast", "support"],
);
export const messagingContextTypeEnum = pgEnum("messaging_context_type", [
  "organization",
  "event",
  "division",
  "league",
  "lesson",
  "rental",
  "match",
  "support-case",
]);
export const messagingParticipantRoleEnum = pgEnum(
  "messaging_participant_role",
  ["member", "moderator", "guardian", "agent"],
);
export const conversationMessageKindEnum = pgEnum("conversation_message_kind", [
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
export const conversationMessageStatusEnum = pgEnum(
  "conversation_message_status",
  ["screening", "published", "held", "removed"],
);
export const messageModerationStateEnum = pgEnum("message_moderation_state", [
  "not-required",
  "screening",
  "safe",
  "review",
  "blocked",
]);

export const messagingConversations = pgTable(
  "messaging_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    type: messagingConversationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    contextType: messagingContextTypeEnum("context_type"),
    contextId: varchar("context_id", { length: 192 }),
    contextLabel: text("context_label"),
    createdByPrincipalType: messagingPrincipalTypeEnum(
      "created_by_principal_type",
    ).notNull(),
    createdByPrincipalId: varchar("created_by_principal_id", {
      length: 192,
    }).notNull(),
    announcementOnly: boolean("announcement_only").notNull().default(false),
    followerBroadcast: boolean("follower_broadcast").notNull().default(false),
    minorPresent: boolean("minor_present").notNull().default(false),
    guardianCoverageComplete: boolean("guardian_coverage_complete")
      .notNull()
      .default(true),
    safetyScreeningRequired: boolean("safety_screening_required")
      .notNull()
      .default(false),
    status: varchar("status", { length: 24 }).notNull().default("open"),
    lastMessageSequence: integer("last_message_sequence").notNull().default(0),
    lastMessageAt: timestamp("last_message_at", {
      withTimezone: true,
      mode: "date",
    }),
    metadata: jsonb("metadata")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("messaging_conversation_org_updated_idx").on(
      table.organizationId,
      table.updatedAt,
    ),
    index("messaging_conversation_context_idx").on(
      table.contextType,
      table.contextId,
    ),
    uniqueIndex("messaging_context_conversation_unique")
      .on(table.organizationId, table.type, table.contextType, table.contextId)
      .where(sql`${table.contextId} IS NOT NULL AND ${table.status} = 'open'`),
    check(
      "messaging_conversation_status_valid",
      sql`${table.status} IN ('open', 'closed', 'archived')`,
    ),
    check(
      "messaging_conversation_context_pair",
      sql`(${table.contextType} IS NULL) = (${table.contextId} IS NULL)`,
    ),
    check(
      "messaging_conversation_minor_safety",
      sql`NOT ${table.minorPresent} OR (${table.guardianCoverageComplete} AND ${table.safetyScreeningRequired})`,
    ),
    check(
      "messaging_conversation_sequence_nonnegative",
      sql`${table.lastMessageSequence} >= 0`,
    ),
  ],
);

export const messagingConversationParticipants = pgTable(
  "messaging_conversation_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => messagingConversations.id, { onDelete: "cascade" }),
    principalType: messagingPrincipalTypeEnum("principal_type").notNull(),
    principalId: varchar("principal_id", { length: 192 }).notNull(),
    personId: uuid("person_id").references(() => people.id, {
      onDelete: "cascade",
    }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    role: messagingParticipantRoleEnum("role").notNull().default("member"),
    guardianOfPersonId: uuid("guardian_of_person_id").references(
      () => people.id,
      { onDelete: "cascade" },
    ),
    canPost: boolean("can_post").notNull().default(true),
    notificationLevel: varchar("notification_level", { length: 16 })
      .notNull()
      .default("all"),
    lastReadSequence: integer("last_read_sequence").notNull().default(0),
    lastDeliveredSequence: integer("last_delivered_sequence")
      .notNull()
      .default(0),
    joinedAt: timestamp("joined_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true, mode: "date" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("messaging_participant_principal_unique").on(
      table.conversationId,
      table.principalType,
      table.principalId,
    ),
    index("messaging_participant_person_inbox_idx").on(
      table.personId,
      table.leftAt,
      table.updatedAt,
    ),
    index("messaging_participant_org_inbox_idx").on(
      table.organizationId,
      table.leftAt,
      table.updatedAt,
    ),
    check(
      "messaging_participant_notification_valid",
      sql`${table.notificationLevel} IN ('all', 'mentions', 'muted')`,
    ),
    check(
      "messaging_participant_watermarks_nonnegative",
      sql`${table.lastReadSequence} >= 0 AND ${table.lastDeliveredSequence} >= 0 AND ${table.lastDeliveredSequence} >= ${table.lastReadSequence}`,
    ),
    check(
      "messaging_participant_principal_reference",
      sql`(${table.principalType} = 'user' AND ${table.personId} IS NOT NULL AND ${table.organizationId} IS NULL) OR (${table.principalType} = 'organization' AND ${table.organizationId} IS NOT NULL AND ${table.personId} IS NULL) OR (${table.principalType} = 'agent' AND ${table.personId} IS NULL AND ${table.organizationId} IS NULL)`,
    ),
    check(
      "messaging_guardian_requires_minor",
      sql`${table.role} <> 'guardian' OR ${table.guardianOfPersonId} IS NOT NULL`,
    ),
  ],
);

export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => messagingConversations.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    clientMessageId: uuid("client_message_id").notNull(),
    senderPrincipalType: messagingPrincipalTypeEnum(
      "sender_principal_type",
    ).notNull(),
    senderPrincipalId: varchar("sender_principal_id", {
      length: 192,
    }).notNull(),
    senderPersonId: uuid("sender_person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    senderOrganizationId: uuid("sender_organization_id").references(
      () => organizations.id,
      { onDelete: "set null" },
    ),
    kind: conversationMessageKindEnum("kind").notNull().default("text"),
    body: text("body"),
    widgets: jsonb("widgets")
      .notNull()
      .$type<readonly Record<string, unknown>[]>()
      .default([]),
    replyToMessageId: uuid("reply_to_message_id"),
    status: conversationMessageStatusEnum("status")
      .notNull()
      .default("published"),
    moderationState: messageModerationStateEnum("moderation_state")
      .notNull()
      .default("not-required"),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
    editedAt: timestamp("edited_at", { withTimezone: true, mode: "date" }),
    removedAt: timestamp("removed_at", { withTimezone: true, mode: "date" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("conversation_message_sequence_unique").on(
      table.conversationId,
      table.sequence,
    ),
    uniqueIndex("conversation_message_client_id_unique").on(
      table.clientMessageId,
    ),
    index("conversation_message_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
    index("conversation_message_screening_idx").on(
      table.moderationState,
      table.createdAt,
    ),
    check("conversation_message_sequence_positive", sql`${table.sequence} > 0`),
  ],
);

export const conversationMessageReactions = pgTable(
  "conversation_message_reactions",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => conversationMessages.id, { onDelete: "cascade" }),
    principalType: messagingPrincipalTypeEnum("principal_type").notNull(),
    principalId: varchar("principal_id", { length: 192 }).notNull(),
    emoji: varchar("emoji", { length: 32 }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    primaryKey({
      columns: [
        table.messageId,
        table.principalType,
        table.principalId,
        table.emoji,
      ],
    }),
    index("conversation_reaction_message_idx").on(table.messageId),
  ],
);

export const conversationMessageAttachments = pgTable(
  "conversation_message_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => conversationMessages.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    kind: varchar("kind", { length: 16 }).notNull(),
    mediaType: varchar("media_type", { length: 80 }).notNull(),
    fileName: text("file_name").notNull(),
    byteSize: integer("byte_size").notNull(),
    safetyStatus: varchar("safety_status", { length: 24 })
      .notNull()
      .default("pending"),
    createdAt,
  },
  (table) => [
    index("conversation_attachment_message_idx").on(table.messageId),
    check("conversation_attachment_size_positive", sql`${table.byteSize} > 0`),
    check(
      "conversation_attachment_kind_valid",
      sql`${table.kind} IN ('image', 'video', 'file')`,
    ),
    check(
      "conversation_attachment_safety_valid",
      sql`${table.safetyStatus} IN ('pending', 'safe', 'review', 'blocked')`,
    ),
  ],
);

export const messagingAttachmentUploads = pgTable(
  "messaging_attachment_uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => messagingConversations.id, { onDelete: "cascade" }),
    ownerPersonId: uuid("owner_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique(),
    providerUploadId: text("provider_upload_id").notNull(),
    kind: varchar("kind", { length: 16 }).notNull(),
    mediaType: varchar("media_type", { length: 80 }).notNull(),
    fileName: text("file_name").notNull(),
    byteSize: integer("byte_size").notNull(),
    partSizeBytes: integer("part_size_bytes").notNull(),
    totalParts: integer("total_parts").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("initiated"),
    attachedMessageId: uuid("attached_message_id").references(
      () => conversationMessages.id,
      { onDelete: "set null" },
    ),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("messaging_attachment_upload_owner_idx").on(
      table.ownerPersonId,
      table.status,
      table.expiresAt,
    ),
    index("messaging_attachment_upload_conversation_idx").on(
      table.conversationId,
      table.status,
    ),
    check(
      "messaging_attachment_upload_kind_valid",
      sql`${table.kind} IN ('image', 'video', 'file')`,
    ),
    check(
      "messaging_attachment_upload_status_valid",
      sql`${table.status} IN ('initiated', 'uploaded', 'attached', 'aborted')`,
    ),
    check(
      "messaging_attachment_upload_size_valid",
      sql`${table.byteSize} > 0 AND ${table.byteSize} <= 1073741824`,
    ),
    check(
      "messaging_attachment_upload_parts_valid",
      sql`${table.partSizeBytes} >= 5242880 AND ${table.totalParts} > 0 AND ${table.totalParts} <= 10000`,
    ),
  ],
);

// Relationship records are append-only evidence that an organization or pair
// of people has had a legitimate Duna context. Ending a relationship does not
// erase the fact that it existed, while a current block always wins at send.
export const messagingRelationships = pgTable(
  "messaging_relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourcePrincipalType: messagingPrincipalTypeEnum(
      "source_principal_type",
    ).notNull(),
    sourcePrincipalId: varchar("source_principal_id", {
      length: 192,
    }).notNull(),
    targetPrincipalType: messagingPrincipalTypeEnum(
      "target_principal_type",
    ).notNull(),
    targetPrincipalId: varchar("target_principal_id", {
      length: 192,
    }).notNull(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    personId: uuid("person_id").references(() => people.id, {
      onDelete: "cascade",
    }),
    contextType: messagingContextTypeEnum("context_type"),
    contextId: varchar("context_id", { length: 192 }),
    kind: varchar("kind", { length: 48 }).notNull(),
    sourceKey: varchar("source_key", { length: 256 }).notNull(),
    active: boolean("active").notNull().default(true),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("messaging_relationship_source_key_unique").on(table.sourceKey),
    index("messaging_relationship_pair_idx").on(
      table.sourcePrincipalType,
      table.sourcePrincipalId,
      table.targetPrincipalType,
      table.targetPrincipalId,
    ),
    index("messaging_relationship_org_person_idx").on(
      table.organizationId,
      table.personId,
    ),
    check(
      "messaging_relationship_kind_valid",
      sql`${table.kind} IN ('organization-member', 'event-registration', 'lesson', 'rental', 'league', 'staff', 'follow', 'support')`,
    ),
    check(
      "messaging_relationship_context_pair",
      sql`(${table.contextType} IS NULL) = (${table.contextId} IS NULL)`,
    ),
  ],
);

export const messagingBlocks = pgTable(
  "messaging_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blockerPersonId: uuid("blocker_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    blockedPrincipalType: messagingPrincipalTypeEnum(
      "blocked_principal_type",
    ).notNull(),
    blockedPrincipalId: varchar("blocked_principal_id", {
      length: 192,
    }).notNull(),
    reason: text("reason"),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("messaging_active_block_unique")
      .on(
        table.blockerPersonId,
        table.blockedPrincipalType,
        table.blockedPrincipalId,
      )
      .where(sql`${table.revokedAt} IS NULL`),
    index("messaging_blocked_principal_idx").on(
      table.blockedPrincipalType,
      table.blockedPrincipalId,
    ),
    check(
      "messaging_block_agent_disallowed",
      sql`${table.blockedPrincipalType} <> 'agent'`,
    ),
  ],
);

// Expo push tokens are tied to the authenticated Duna person, not an email or
// phone number. Re-registering the same token moves it to the current account,
// which prevents a shared device from retaining another member's delivery.
export const messagingPushDevices = pgTable(
  "messaging_push_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    app: varchar("app", { length: 16 }).notNull(),
    platform: varchar("platform", { length: 16 }).notNull(),
    expoPushToken: text("expo_push_token").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    lastSeenAt: timestamp("last_seen_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    disabledAt: timestamp("disabled_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastErrorCode: varchar("last_error_code", { length: 80 }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("messaging_push_device_token_unique").on(table.expoPushToken),
    index("messaging_push_device_person_idx").on(table.personId, table.enabled),
    check(
      "messaging_push_device_app_valid",
      sql`${table.app} IN ('player', 'pro')`,
    ),
    check(
      "messaging_push_device_platform_valid",
      sql`${table.platform} IN ('ios', 'android')`,
    ),
  ],
);

export const messagingPushDeliveries = pgTable(
  "messaging_push_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => conversationMessages.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => messagingPushDevices.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 24 }).notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    expoTicketId: varchar("expo_ticket_id", { length: 192 }),
    errorCode: varchar("error_code", { length: 80 }),
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
    receiptCheckedAt: timestamp("receipt_checked_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("messaging_push_delivery_message_device_unique").on(
      table.messageId,
      table.deviceId,
    ),
    index("messaging_push_delivery_receipt_idx").on(
      table.status,
      table.receiptCheckedAt,
      table.createdAt,
    ),
    check(
      "messaging_push_delivery_status_valid",
      sql`${table.status} IN ('queued', 'submitted', 'delivered', 'retry', 'failed')`,
    ),
    check(
      "messaging_push_delivery_attempts_nonnegative",
      sql`${table.attempts} >= 0`,
    ),
  ],
);

export const messageModerationCases = pgTable(
  "message_moderation_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => conversationMessages.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 24 }).notNull().default("open"),
    severity: varchar("severity", { length: 16 }).notNull(),
    categories: text("categories")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    explanation: text("explanation").notNull(),
    model: varchar("model", { length: 160 }),
    modelVersion: varchar("model_version", { length: 160 }),
    confidence: doublePrecision("confidence"),
    assignedToPersonId: uuid("assigned_to_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    reviewedByPersonId: uuid("reviewed_by_person_id").references(
      () => people.id,
      { onDelete: "set null" },
    ),
    reviewedAt: timestamp("reviewed_at", {
      withTimezone: true,
      mode: "date",
    }),
    resolutionNote: text("resolution_note"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("message_moderation_message_unique").on(table.messageId),
    index("message_moderation_queue_idx").on(
      table.status,
      table.severity,
      table.createdAt,
    ),
    check(
      "message_moderation_status_valid",
      sql`${table.status} IN ('open', 'reviewing', 'cleared', 'restricted', 'escalated')`,
    ),
    check(
      "message_moderation_severity_valid",
      sql`${table.severity} IN ('low', 'medium', 'high', 'critical')`,
    ),
    check(
      "message_moderation_confidence_valid",
      sql`${table.confidence} IS NULL OR ${table.confidence} BETWEEN 0 AND 1`,
    ),
  ],
);

export const conversationMessageActions = pgTable(
  "conversation_message_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => conversationMessages.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    actionId: varchar("action_id", { length: 64 }).notNull(),
    actionType: varchar("action_type", { length: 32 }).notNull(),
    payload: jsonb("payload")
      .notNull()
      .$type<Record<string, unknown>>()
      .default({}),
    createdAt,
  },
  (table) => [
    uniqueIndex("conversation_message_action_unique").on(
      table.messageId,
      table.personId,
      table.actionId,
    ),
  ],
);

export const messagingAgentRuns = pgTable(
  "messaging_agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => messagingConversations.id, { onDelete: "cascade" }),
    requestMessageId: uuid("request_message_id").references(
      () => conversationMessages.id,
      { onDelete: "set null" },
    ),
    responseMessageId: uuid("response_message_id").references(
      () => conversationMessages.id,
      { onDelete: "set null" },
    ),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    agentId: varchar("agent_id", { length: 96 }).notNull(),
    model: varchar("model", { length: 160 }),
    status: varchar("status", { length: 24 }).notNull().default("queued"),
    toolsUsed: text("tools_used")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    contextDigest: varchar("context_digest", { length: 128 }),
    responseDigest: varchar("response_digest", { length: 128 }),
    handoffReason: text("handoff_reason"),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("messaging_agent_conversation_idx").on(
      table.conversationId,
      table.createdAt,
    ),
    check(
      "messaging_agent_status_valid",
      sql`${table.status} IN ('queued', 'running', 'completed', 'handoff', 'failed')`,
    ),
  ],
);
