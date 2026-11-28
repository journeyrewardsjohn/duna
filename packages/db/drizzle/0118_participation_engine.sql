CREATE TABLE "organization_participation_defaults" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"rules" jsonb NOT NULL,
	"applies_to" varchar(24)[] DEFAULT ARRAY['service']::varchar(24)[] NOT NULL,
	"updated_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_participation_defaults_applies_to_valid" CHECK ("organization_participation_defaults"."applies_to" <@ ARRAY['service', 'open-play', 'pickup']::varchar(24)[]),
	CONSTRAINT "organization_participation_defaults_rules_object" CHECK (jsonb_typeof("organization_participation_defaults"."rules") = 'object')
);
--> statement-breakpoint
CREATE TABLE "participation_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"catalog_fulfillment_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" varchar(32) NOT NULL,
	"credits" integer DEFAULT 0 NOT NULL,
	"amount_minor" bigint DEFAULT 0 NOT NULL,
	"credit_journal_id" uuid,
	"refund_record_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participation_adjustments_kind_valid" CHECK ("participation_adjustments"."kind" IN ('late-cancel-final-price', 'place-refilled', 'card-group-difference')),
	CONSTRAINT "participation_adjustments_amounts_nonnegative" CHECK ("participation_adjustments"."credits" >= 0 AND "participation_adjustments"."amount_minor" >= 0),
	CONSTRAINT "participation_adjustments_credit_journal_required" CHECK ("participation_adjustments"."credits" = 0 OR "participation_adjustments"."credit_journal_id" IS NOT NULL),
	CONSTRAINT "participation_adjustments_refund_record_required" CHECK (("participation_adjustments"."credits" = 0 AND "participation_adjustments"."amount_minor" = 0) OR "participation_adjustments"."refund_record_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "participation_attendance" (
	"booking_id" uuid PRIMARY KEY NOT NULL,
	"booking_type" varchar(24) DEFAULT 'catalog-fulfillment' NOT NULL,
	"organization_id" uuid NOT NULL,
	"subject_type" varchar(32) NOT NULL,
	"subject_id" uuid NOT NULL,
	"status" varchar(12) NOT NULL,
	"marked_by_person_id" uuid NOT NULL,
	"marked_at" timestamp with time zone NOT NULL,
	"device_marked_at" timestamp with time zone,
	"idempotency_key" uuid NOT NULL,
	CONSTRAINT "participation_attendance_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "participation_attendance_status_valid" CHECK ("participation_attendance"."status" IN ('attended', 'absent')),
	CONSTRAINT "participation_attendance_booking_type_valid" CHECK ("participation_attendance"."booking_type" IN ('catalog-fulfillment')),
	CONSTRAINT "participation_attendance_subject_type_valid" CHECK ("participation_attendance"."subject_type" IN ('catalog-session-occurrence', 'session', 'division', 'pickup-session'))
);
--> statement-breakpoint
CREATE TABLE "participation_cancel_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"subject_type" varchar(32) NOT NULL,
	"subject_id" uuid NOT NULL,
	"requested_by_person_id" uuid NOT NULL,
	"reason" varchar(24) NOT NULL,
	"status" varchar(12) DEFAULT 'open' NOT NULL,
	"resolved_by_person_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participation_cancel_requests_subject_type_valid" CHECK ("participation_cancel_requests"."subject_type" IN ('catalog-session-occurrence', 'session', 'division', 'pickup-session')),
	CONSTRAINT "participation_cancel_requests_reason_valid" CHECK ("participation_cancel_requests"."reason" IN ('coach', 'weather', 'venue', 'other')),
	CONSTRAINT "participation_cancel_requests_status_valid" CHECK ("participation_cancel_requests"."status" IN ('open', 'approved', 'declined', 'withdrawn'))
);
--> statement-breakpoint
CREATE TABLE "participation_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"subject_type" varchar(32) NOT NULL,
	"subject_id" uuid NOT NULL,
	"rule_snapshot" jsonb NOT NULL,
	"snapshot_at" timestamp with time zone NOT NULL,
	"lock_at" timestamp with time zone NOT NULL,
	"lock_override_at" timestamp with time zone,
	"forced_outcome" varchar(24),
	"outcome" varchar(32),
	"cancel_reason" varchar(24),
	"merged_into_subject_id" uuid,
	"decided_at" timestamp with time zone,
	"decided_group_size" integer,
	"decided_by_person_id" uuid,
	"settled_at" timestamp with time zone,
	"settled_group_size" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participation_decisions_subject_type_valid" CHECK ("participation_decisions"."subject_type" IN ('catalog-session-occurrence', 'session', 'division', 'pickup-session')),
	CONSTRAINT "participation_decisions_outcome_valid" CHECK ("participation_decisions"."outcome" IS NULL OR "participation_decisions"."outcome" IN ('minimum-met', 'run-under-minimum', 'cancel-under-minimum', 'cancelled-by-club')),
	CONSTRAINT "participation_decisions_forced_outcome_valid" CHECK ("participation_decisions"."forced_outcome" IS NULL OR "participation_decisions"."forced_outcome" IN ('run')),
	CONSTRAINT "participation_decisions_cancel_reason_valid" CHECK ("participation_decisions"."cancel_reason" IS NULL OR "participation_decisions"."cancel_reason" IN ('minimum-not-met', 'coach', 'weather', 'venue', 'merged', 'other')),
	CONSTRAINT "participation_decisions_decided_together" CHECK (("participation_decisions"."outcome" IS NULL AND "participation_decisions"."decided_at" IS NULL AND "participation_decisions"."decided_group_size" IS NULL)
        OR ("participation_decisions"."outcome" IS NOT NULL AND "participation_decisions"."decided_at" IS NOT NULL AND "participation_decisions"."decided_group_size" IS NOT NULL)),
	CONSTRAINT "participation_decisions_group_sizes_valid" CHECK (("participation_decisions"."decided_group_size" IS NULL OR "participation_decisions"."decided_group_size" >= 0)
        AND ("participation_decisions"."settled_group_size" IS NULL OR "participation_decisions"."settled_group_size" >= 0)),
	CONSTRAINT "participation_decisions_settled_only_when_running" CHECK ("participation_decisions"."settled_at" IS NULL OR "participation_decisions"."outcome" IN ('minimum-met', 'run-under-minimum')),
	CONSTRAINT "participation_decisions_cancel_reason_iff_cancelled" CHECK (("participation_decisions"."cancel_reason" IS NOT NULL) = ("participation_decisions"."outcome" IS NOT NULL AND "participation_decisions"."outcome" IN ('cancel-under-minimum', 'cancelled-by-club'))),
	CONSTRAINT "participation_decisions_merged_reason" CHECK ("participation_decisions"."merged_into_subject_id" IS NULL OR "participation_decisions"."cancel_reason" = 'merged'),
	CONSTRAINT "participation_decisions_rule_object" CHECK (jsonb_typeof("participation_decisions"."rule_snapshot") = 'object')
);
--> statement-breakpoint
CREATE TABLE "participation_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"subject_type" varchar(32) NOT NULL,
	"subject_id" uuid NOT NULL,
	"created_by_person_id" uuid NOT NULL,
	"code" varchar(24) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"opened_count" integer DEFAULT 0 NOT NULL,
	"booked_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participation_invites_code_unique" UNIQUE("code"),
	CONSTRAINT "participation_invites_subject_type_valid" CHECK ("participation_invites"."subject_type" IN ('catalog-session-occurrence', 'session', 'division', 'pickup-session')),
	CONSTRAINT "participation_invites_code_format" CHECK ("participation_invites"."code" ~ '^[A-Za-z0-9_-]{8,24}$'),
	CONSTRAINT "participation_invites_counts_nonnegative" CHECK ("participation_invites"."opened_count" >= 0 AND "participation_invites"."booked_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "participation_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"subject_type" varchar(32) NOT NULL,
	"subject_id" uuid NOT NULL,
	"recipient_person_id" uuid NOT NULL,
	"booking_id" uuid,
	"kind" varchar(32) NOT NULL,
	"channel" varchar(16),
	"status" varchar(12) DEFAULT 'queued' NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"error_code" varchar(48),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participation_notices_once" UNIQUE NULLS NOT DISTINCT("subject_type","subject_id","recipient_person_id","kind","booking_id"),
	CONSTRAINT "participation_notices_subject_type_valid" CHECK ("participation_notices"."subject_type" IN ('catalog-session-occurrence', 'session', 'division', 'pickup-session')),
	CONSTRAINT "participation_notices_kind_valid" CHECK ("participation_notices"."kind" IN ('booked-needs-players', 'needs-players-reminder', 'confirmed', 'cancelled-low', 'cancelled-club', 'lock-extended', 'moved', 'waitlist-offer', 'place-refilled', 'staff-at-risk-digest', 'staff-cancelled', 'refund-attention')),
	CONSTRAINT "participation_notices_channel_valid" CHECK ("participation_notices"."channel" IS NULL OR "participation_notices"."channel" IN ('in-app', 'push', 'email', 'imessage', 'whatsapp')),
	CONSTRAINT "participation_notices_status_valid" CHECK ("participation_notices"."status" IN ('queued', 'sent', 'failed', 'skipped')),
	CONSTRAINT "participation_notices_sent_has_time" CHECK ("participation_notices"."status" <> 'sent' OR "participation_notices"."sent_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "participation_waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"subject_type" varchar(32) NOT NULL,
	"subject_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"requested_by_person_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"position" integer NOT NULL,
	"status" varchar(16) DEFAULT 'waiting' NOT NULL,
	"offered_at" timestamp with time zone,
	"hold_expires_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participation_waitlist_subject_type_valid" CHECK ("participation_waitlist_entries"."subject_type" IN ('catalog-session-occurrence', 'session', 'division', 'pickup-session')),
	CONSTRAINT "participation_waitlist_status_valid" CHECK ("participation_waitlist_entries"."status" IN ('waiting', 'offered', 'accepted', 'expired', 'cancelled')),
	CONSTRAINT "participation_waitlist_quantity_positive" CHECK ("participation_waitlist_entries"."quantity" > 0),
	CONSTRAINT "participation_waitlist_position_positive" CHECK ("participation_waitlist_entries"."position" > 0),
	CONSTRAINT "participation_waitlist_offer_has_hold" CHECK ("participation_waitlist_entries"."status" <> 'offered' OR ("participation_waitlist_entries"."offered_at" IS NOT NULL AND "participation_waitlist_entries"."hold_expires_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "divisions" ADD COLUMN "participation" jsonb;--> statement-breakpoint
ALTER TABLE "pickup_sessions" ADD COLUMN "participation" jsonb;--> statement-breakpoint
ALTER TABLE "pickup_sessions" ADD COLUMN "participation_review_state" varchar(16);--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "participation" jsonb;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "participation_review_state" varchar(16);--> statement-breakpoint
ALTER TABLE "organization_participation_defaults" ADD CONSTRAINT "organization_participation_defaults_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_participation_defaults" ADD CONSTRAINT "organization_participation_defaults_updated_by_person_id_people_id_fk" FOREIGN KEY ("updated_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participation_adjustments" ADD CONSTRAINT "participation_adjustments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participation_adjustments" ADD CONSTRAINT "participation_adjustments_catalog_fulfillment_id_catalog_fulfillments_id_fk" FOREIGN KEY ("catalog_fulfillment_id") REFERENCES "public"."catalog_fulfillments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participation_adjustments" ADD CONSTRAINT "participation_adjustments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participation_adjustments" ADD CONSTRAINT "participation_adjustments_credit_journal_id_ledger_journals_id_fk" FOREIGN KEY ("credit_journal_id") REFERENCES "public"."ledger_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participation_adjustments" ADD CONSTRAINT "participation_adjustments_refund_record_id_refund_records_id_fk" FOREIGN KEY ("refund_record_id") REFERENCES "public"."refund_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participation_attendance" ADD CONSTRAINT "participation_attendance_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participation_attendance" ADD CONSTRAINT "participation_attendance_marked_by_person_id_people_id_fk" FOREIGN KEY ("marked_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participation_cancel_requests" ADD CONSTRAINT "participation_cancel_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participation_cancel_requests" ADD CONSTRAINT "participation_cancel_requests_requested_by_person_id_people_id_fk" FOREIGN KEY ("requested_by_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participation_cancel_requests" ADD CONSTRAINT "participation_cancel_requests_resolved_by_person_id_people_id_fk" FOREIGN KEY ("resolved_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participation_decisions" ADD CONSTRAINT "participation_decisions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participation_decisions" ADD CONSTRAINT "participation_decisions_decided_by_person_id_people_id_fk" FOREIGN KEY ("decided_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participation_invites" ADD CONSTRAINT "participation_invites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participation_invites" ADD CONSTRAINT "participation_invites_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participation_notices" ADD CONSTRAINT "participation_notices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participation_notices" ADD CONSTRAINT "participation_notices_recipient_person_id_people_id_fk" FOREIGN KEY ("recipient_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participation_waitlist_entries" ADD CONSTRAINT "participation_waitlist_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participation_waitlist_entries" ADD CONSTRAINT "participation_waitlist_entries_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participation_waitlist_entries" ADD CONSTRAINT "participation_waitlist_entries_requested_by_person_id_people_id_fk" FOREIGN KEY ("requested_by_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "participation_adjustments_fulfillment_kind_unique" ON "participation_adjustments" USING btree ("catalog_fulfillment_id","kind");--> statement-breakpoint
CREATE INDEX "participation_adjustments_order_idx" ON "participation_adjustments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "participation_attendance_subject_idx" ON "participation_attendance" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participation_cancel_requests_open_unique" ON "participation_cancel_requests" USING btree ("subject_type","subject_id") WHERE "participation_cancel_requests"."status" = 'open';--> statement-breakpoint
CREATE INDEX "participation_cancel_requests_org_idx" ON "participation_cancel_requests" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "participation_decisions_subject_unique" ON "participation_decisions" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "participation_decisions_open_lock_idx" ON "participation_decisions" USING btree ("organization_id","lock_at") WHERE "participation_decisions"."outcome" IS NULL;--> statement-breakpoint
CREATE INDEX "participation_decisions_outcome_idx" ON "participation_decisions" USING btree ("organization_id","subject_type","outcome");--> statement-breakpoint
CREATE INDEX "participation_invites_subject_idx" ON "participation_invites" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participation_invites_creator_subject_unique" ON "participation_invites" USING btree ("subject_type","subject_id","created_by_person_id");--> statement-breakpoint
CREATE INDEX "participation_notices_due_idx" ON "participation_notices" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "participation_waitlist_active_person_unique" ON "participation_waitlist_entries" USING btree ("subject_type","subject_id","person_id") WHERE "participation_waitlist_entries"."status" IN ('waiting', 'offered');--> statement-breakpoint
CREATE UNIQUE INDEX "participation_waitlist_position_unique" ON "participation_waitlist_entries" USING btree ("subject_type","subject_id","position");--> statement-breakpoint
CREATE INDEX "participation_waitlist_expiry_idx" ON "participation_waitlist_entries" USING btree ("status","hold_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_fulfillment_occurrence_person_active_unique" ON "catalog_fulfillments" USING btree ("catalog_session_occurrence_id","person_id") WHERE "catalog_fulfillments"."status" IN ('held', 'pending', 'ready', 'fulfilled') AND "catalog_fulfillments"."catalog_session_occurrence_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "pickup_sessions" ADD CONSTRAINT "pickup_session_participation_review_state_valid" CHECK ("pickup_sessions"."participation_review_state" IS NULL OR "pickup_sessions"."participation_review_state" IN ('pending', 'kept', 'changed'));--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "session_participation_review_state_valid" CHECK ("sessions"."participation_review_state" IS NULL OR "sessions"."participation_review_state" IN ('pending', 'kept', 'changed'));--> statement-breakpoint
-- PART-2 backfill (hand-written, additive). Legacy minimums that were never
-- enforced become group rules that RUN (decision 7): switching existing
-- sessions to "cancel" would cancel bookings people expected to run. Owners
-- see them under "Rules to review" (participation_review_state = 'pending').
UPDATE "sessions" SET
  "participation" = jsonb_build_object(
    'version', 2, 'unit', 'player', 'minParticipants', "minimum_capacity",
    'minimumPolicy', 'run', 'waitlist', true, 'tiers', '[]'::jsonb),
  "participation_review_state" = 'pending'
WHERE "minimum_capacity" > 1 AND "participation" IS NULL;--> statement-breakpoint
UPDATE "sessions" AS s SET
  "participation" = jsonb_build_object(
    'version', 2, 'unit', 'player',
    'minParticipants', LEAST(s."capacity", GREATEST(2, (b."registration_settings" #>> '{smartRules,minimumAttendance}')::int)),
    'minimumPolicy', 'run', 'waitlist', true, 'tiers', '[]'::jsonb),
  "participation_review_state" = 'pending'
FROM "event_blueprints" AS b
WHERE b."session_id" = s."id"
  AND s."participation" IS NULL
  AND b."registration_settings" #>> '{smartRules,autoCancelLowAttendance}' = 'true'
  AND (b."registration_settings" #>> '{smartRules,minimumAttendance}') ~ '^[0-9]{1,4}$';--> statement-breakpoint
UPDATE "divisions" SET
  "participation" = jsonb_build_object(
    'version', 2, 'unit', 'team', 'minParticipants', "minimum_teams",
    'minimumPolicy', 'run', 'waitlist', true, 'tiers', '[]'::jsonb)
WHERE "minimum_teams" > 1 AND "participation" IS NULL;--> statement-breakpoint
UPDATE "pickup_sessions" SET
  "participation" = jsonb_build_object(
    'version', 2, 'unit', 'player',
    'minParticipants', LEAST("capacity", GREATEST(1, ("smart_rules" ->> 'minimumAttendance')::int)),
    'minimumPolicy', 'run',
    'lockMinutesBeforeStart', LEAST(10080, GREATEST(0, ("smart_rules" ->> 'minimumNoticeMinutes')::int)),
    'waitlist', COALESCE(("smart_rules" ->> 'waitlistEnabled')::boolean, true),
    'tiers', '[]'::jsonb),
  "participation_review_state" = 'pending'
WHERE "participation" IS NULL
  AND "smart_rules" ->> 'autoCancelLowAttendance' = 'true'
  AND ("smart_rules" ->> 'minimumAttendance') ~ '^[0-9]{1,4}$'
  AND ("smart_rules" ->> 'minimumNoticeMinutes') ~ '^[0-9]{1,6}$';--> statement-breakpoint
-- One decision row per catalog occurrence already decided or with an active
-- booking under an offering with a group rule. The snapshot is the offering's
-- current rule: the best available (bookings before PART kept only tiers).
INSERT INTO "participation_decisions" (
  "organization_id", "subject_type", "subject_id", "rule_snapshot", "snapshot_at",
  "lock_at", "outcome", "cancel_reason", "decided_at", "decided_group_size",
  "settled_at", "settled_group_size")
SELECT o."organization_id", 'catalog-session-occurrence', o."id",
  i."configuration" -> 'participation',
  COALESCE(o."participation_decided_at", now()),
  o."starts_at" - make_interval(mins => LEAST(10080, GREATEST(0, COALESCE(
    CASE WHEN (i."configuration" #>> '{participation,lockMinutesBeforeStart}') ~ '^[0-9]{1,6}$'
      THEN (i."configuration" #>> '{participation,lockMinutesBeforeStart}')::int END,
    CASE WHEN (i."configuration" #>> '{participation,cutoffMinutesBeforeStart}') ~ '^[0-9]{1,6}$'
      THEN (i."configuration" #>> '{participation,cutoffMinutesBeforeStart}')::int END,
    1440)))),
  o."participation_outcome",
  CASE WHEN o."participation_outcome" = 'cancel-under-minimum' THEN 'minimum-not-met' END,
  o."participation_decided_at", o."decided_headcount",
  o."participation_settled_at", o."settled_headcount"
FROM "catalog_session_occurrences" AS o
JOIN "catalog_items" AS i ON i."id" = o."catalog_item_id"
WHERE jsonb_typeof(i."configuration" -> 'participation') = 'object'
  AND (o."participation_outcome" IS NOT NULL OR EXISTS (
    SELECT 1 FROM "catalog_fulfillments" AS f
    WHERE f."catalog_session_occurrence_id" = o."id"
      AND f."status" IN ('held', 'pending', 'ready', 'fulfilled')))
ON CONFLICT ("subject_type", "subject_id") DO NOTHING;
