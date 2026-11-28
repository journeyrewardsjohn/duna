ALTER TYPE "public"."match_status" ADD VALUE 'not-finished' BEFORE 'pending-verification';--> statement-breakpoint
CREATE TABLE "organization_profiles" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"phone_e164" varchar(24),
	"email" text,
	"website_url" text,
	"tagline" text,
	"about" text,
	"hours" jsonb DEFAULT '{"weekly":[]}'::jsonb NOT NULL,
	"socials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"field_sources" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"website_last_read_at" timestamp with time zone,
	"updated_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_profile_phone_e164" CHECK ("organization_profiles"."phone_e164" IS NULL OR "organization_profiles"."phone_e164" ~ '^\+[1-9][0-9]{6,14}$')
);
--> statement-breakpoint
CREATE TABLE "setup_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"category" varchar(16) NOT NULL,
	"field_key" varchar(64) NOT NULL,
	"label" text NOT NULL,
	"payload" jsonb NOT NULL,
	"candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_pages" text[] DEFAULT '{}'::text[] NOT NULL,
	"needs_check" boolean DEFAULT false NOT NULL,
	"check_note" text,
	"decision" varchar(16) DEFAULT 'pending' NOT NULL,
	"edited_payload" jsonb,
	"decided_by_person_id" uuid,
	"decided_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"applied_entity_type" varchar(48),
	"applied_entity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setup_proposal_category_valid" CHECK ("setup_proposals"."category" IN ('identity', 'contact', 'places', 'offerings', 'team', 'policies')),
	CONSTRAINT "setup_proposal_decision_valid" CHECK ("setup_proposals"."decision" IN ('pending', 'kept', 'edited', 'skipped', 'applied', 'superseded')),
	CONSTRAINT "setup_proposal_edit_shape" CHECK ("setup_proposals"."decision" <> 'edited' OR "setup_proposals"."edited_payload" IS NOT NULL),
	CONSTRAINT "setup_proposal_decided_shape" CHECK ("setup_proposals"."decision" IN ('pending', 'superseded') OR "setup_proposals"."decided_at" IS NOT NULL),
	CONSTRAINT "setup_proposal_applied_shape" CHECK (("setup_proposals"."decision" = 'applied') = ("setup_proposals"."applied_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "setup_run_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"status" varchar(16) DEFAULT 'queued' NOT NULL,
	"items_found" integer DEFAULT 0 NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setup_run_page_status_valid" CHECK ("setup_run_pages"."status" IN ('queued', 'reading', 'read', 'failed', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "setup_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_kind" varchar(24) NOT NULL,
	"source_url" text,
	"source_text" text,
	"status" varchar(16) DEFAULT 'queued' NOT NULL,
	"outcome" varchar(24),
	"failure_reason" varchar(64),
	"pages_total" integer DEFAULT 0 NOT NULL,
	"pages_read" integer DEFAULT 0 NOT NULL,
	"items_found" integer DEFAULT 0 NOT NULL,
	"previous_run_id" uuid,
	"started_by_person_id" uuid,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setup_run_source_kind_valid" CHECK ("setup_runs"."source_kind" IN ('website', 'google-listing', 'description')),
	CONSTRAINT "setup_run_status_valid" CHECK ("setup_runs"."status" IN ('queued', 'reading', 'review', 'applied', 'failed', 'cancelled')),
	CONSTRAINT "setup_run_outcome_valid" CHECK ("setup_runs"."outcome" IS NULL OR "setup_runs"."outcome" IN ('complete', 'no-website', 'site-unreachable', 'found-very-little')),
	CONSTRAINT "setup_run_counts_valid" CHECK ("setup_runs"."pages_total" >= 0 AND "setup_runs"."pages_read" BETWEEN 0 AND "setup_runs"."pages_total" AND "setup_runs"."items_found" >= 0),
	CONSTRAINT "setup_run_source_present" CHECK (("setup_runs"."source_kind" = 'description' AND "setup_runs"."source_text" IS NOT NULL) OR ("setup_runs"."source_kind" <> 'description'))
);
--> statement-breakpoint
CREATE TABLE "organization_pay_accounts" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"status" varchar(16) DEFAULT 'not-started' NOT NULL,
	"charges_enabled" boolean DEFAULT false NOT NULL,
	"payouts_enabled" boolean DEFAULT false NOT NULL,
	"card_payments_active" boolean DEFAULT false NOT NULL,
	"requirements_due" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requirements_due_by" timestamp with time zone,
	"disabled_reason" varchar(64),
	"bank_status" varchar(16) DEFAULT 'missing' NOT NULL,
	"bank_last4" varchar(4),
	"bank_name" text,
	"onboarding_method" varchar(16) DEFAULT 'hosted' NOT NULL,
	"business_type" varchar(32),
	"what_you_sell" text,
	"first_charge_at" timestamp with time zone,
	"first_payout_not_before" timestamp with time zone,
	"first_payout_delay_waived_at" timestamp with time zone,
	"first_payout_delay_waived_by_person_id" uuid,
	"start_tranche_opt_in" boolean DEFAULT false NOT NULL,
	"start_tranche_bps" integer DEFAULT 0 NOT NULL,
	"sales_suspended_at" timestamp with time zone,
	"closure_notice_at" timestamp with time zone,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_pay_account_status_valid" CHECK ("organization_pay_accounts"."status" IN ('not-started', 'in-progress', 'verifying', 'action-needed', 'restricted', 'ready')),
	CONSTRAINT "organization_pay_account_bank_status_valid" CHECK ("organization_pay_accounts"."bank_status" IN ('missing', 'pending', 'verified', 'errored')),
	CONSTRAINT "organization_pay_account_onboarding_valid" CHECK ("organization_pay_accounts"."onboarding_method" IN ('hosted', 'embedded')),
	CONSTRAINT "organization_pay_account_bank_last4_valid" CHECK ("organization_pay_accounts"."bank_last4" IS NULL OR "organization_pay_accounts"."bank_last4" ~ '^[0-9]{4}$'),
	CONSTRAINT "organization_pay_account_start_tranche_valid" CHECK ("organization_pay_accounts"."start_tranche_bps" BETWEEN 0 AND 2500 AND ("organization_pay_accounts"."start_tranche_opt_in" OR "organization_pay_accounts"."start_tranche_bps" = 0)),
	CONSTRAINT "organization_pay_account_ready_shape" CHECK ("organization_pay_accounts"."status" <> 'ready' OR ("organization_pay_accounts"."charges_enabled" AND "organization_pay_accounts"."payouts_enabled"))
);
--> statement-breakpoint
CREATE TABLE "pay_delivery_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"obligation_id" uuid NOT NULL,
	"tranche_id" uuid,
	"kind" varchar(32) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"source_type" varchar(32) NOT NULL,
	"source_id" varchar(128),
	"actor_person_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pay_delivery_event_kind_valid" CHECK ("pay_delivery_events"."kind" IN ('booking-ended', 'session-ended', 'event-last-day-ended', 'weekly-portion-elapsed', 'membership-payment-received', 'refund-window-ended', 'credit-redeemed', 'credit-refunded', 'goods-fulfilled', 'goods-shipped', 'goods-cancel-offered', 'access-granted', 'paid-in-person', 'delivery-cancelled'))
);
--> statement-breakpoint
CREATE TABLE "pay_dispute_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"obligation_id" uuid,
	"order_id" uuid,
	"legacy_dispute_id" uuid,
	"processor_dispute_id" varchar(128) NOT NULL,
	"reason" varchar(48) NOT NULL,
	"status" varchar(20) DEFAULT 'needs-response' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"fee_minor" bigint DEFAULT 0 NOT NULL,
	"fee_returned" boolean DEFAULT false NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"evidence_due_by" timestamp with time zone,
	"organization_evidence_due_by" timestamp with time zone,
	"evidence_submitted_at" timestamp with time zone,
	"evidence_submitted_by_person_id" uuid,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"transfer_reversal_id" varchar(128),
	"retransfer_id" varchar(128),
	"hold_id" uuid,
	"reversal_ledger_journal_id" uuid,
	"outcome_ledger_journal_id" uuid,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pay_dispute_cases_processor_dispute_id_unique" UNIQUE("processor_dispute_id"),
	CONSTRAINT "pay_dispute_case_status_valid" CHECK ("pay_dispute_cases"."status" IN ('needs-response', 'evidence-submitted', 'under-review', 'won', 'lost', 'accepted', 'warning-closed')),
	CONSTRAINT "pay_dispute_case_amounts_valid" CHECK ("pay_dispute_cases"."amount_minor" >= 0 AND "pay_dispute_cases"."fee_minor" >= 0),
	CONSTRAINT "pay_dispute_case_currency_valid" CHECK ("pay_dispute_cases"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "pay_dispute_case_closed_shape" CHECK (("pay_dispute_cases"."status" IN ('won', 'lost', 'accepted', 'warning-closed')) = ("pay_dispute_cases"."closed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "pay_fee_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"buyer_person_id" uuid,
	"order_id" uuid,
	"catalog_item_id" uuid,
	"surface" varchar(20) NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"service_fee_minor" bigint DEFAULT 0 NOT NULL,
	"organization_fee_minor" bigint DEFAULT 0 NOT NULL,
	"processing_estimate_minor" bigint DEFAULT 0 NOT NULL,
	"tax_minor" bigint DEFAULT 0 NOT NULL,
	"total_minor" bigint NOT NULL,
	"fee_rule_version" varchar(32) NOT NULL,
	"premium_applied" boolean DEFAULT false NOT NULL,
	"shown_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pay_fee_quote_surface_valid" CHECK ("pay_fee_quotes"."surface" IN ('web-checkout', 'player-app', 'pro-app', 'hq-point-of-sale', 'public-page')),
	CONSTRAINT "pay_fee_quote_currency_valid" CHECK ("pay_fee_quotes"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "pay_fee_quote_amounts_valid" CHECK ("pay_fee_quotes"."subtotal_minor" >= 0 AND "pay_fee_quotes"."service_fee_minor" >= 0 AND "pay_fee_quotes"."organization_fee_minor" >= 0 AND "pay_fee_quotes"."processing_estimate_minor" >= 0 AND "pay_fee_quotes"."tax_minor" >= 0 AND "pay_fee_quotes"."total_minor" = "pay_fee_quotes"."subtotal_minor" + "pay_fee_quotes"."service_fee_minor" + "pay_fee_quotes"."tax_minor")
);
--> statement-breakpoint
CREATE TABLE "pay_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"obligation_id" uuid,
	"reserve_id" uuid,
	"dispute_case_id" uuid,
	"kind" varchar(28) NOT NULL,
	"status" varchar(12) DEFAULT 'active' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"reason" text NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"release_after" timestamp with time zone,
	"released_at" timestamp with time zone,
	"placed_by_person_id" uuid,
	"ledger_journal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pay_hold_kind_valid" CHECK ("pay_holds"."kind" IN ('dispute', 'first-payout-delay', 'rolling-reserve', 'unredeemed-credit-reserve', 'negative-balance', 'closure', 'manual-review')),
	CONSTRAINT "pay_hold_status_valid" CHECK ("pay_holds"."status" IN ('active', 'released', 'applied')),
	CONSTRAINT "pay_hold_amount_valid" CHECK ("pay_holds"."amount_minor" >= 0),
	CONSTRAINT "pay_hold_currency_valid" CHECK ("pay_holds"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "pay_hold_released_shape" CHECK (("pay_holds"."status" = 'active') = ("pay_holds"."released_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "pay_obligation_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"obligation_id" uuid NOT NULL,
	"refund_record_id" uuid NOT NULL,
	"source" varchar(20) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"service_fee_kept_minor" bigint DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"ledger_journal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pay_obligation_refund_source_valid" CHECK ("pay_obligation_refunds"."source" IN ('held-funds', 'available-balance', 'future-proceeds', 'bank-debit')),
	CONSTRAINT "pay_obligation_refund_amount_valid" CHECK ("pay_obligation_refunds"."amount_minor" > 0 AND "pay_obligation_refunds"."service_fee_kept_minor" >= 0),
	CONSTRAINT "pay_obligation_refund_currency_valid" CHECK ("pay_obligation_refunds"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "pay_obligations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid,
	"payment_id" uuid,
	"fund_schedule_id" uuid,
	"catalog_item_id" uuid,
	"product_kind" varchar(64) NOT NULL,
	"delivery_rule" varchar(24) NOT NULL,
	"status" varchar(20) DEFAULT 'pending-settlement' NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"gross_minor" bigint NOT NULL,
	"application_fee_minor" bigint DEFAULT 0 NOT NULL,
	"tax_minor" bigint DEFAULT 0 NOT NULL,
	"proceeds_minor" bigint NOT NULL,
	"released_minor" bigint DEFAULT 0 NOT NULL,
	"refunded_minor" bigint DEFAULT 0 NOT NULL,
	"disputed_minor" bigint DEFAULT 0 NOT NULL,
	"reserved_minor" bigint DEFAULT 0 NOT NULL,
	"settled_at" timestamp with time zone,
	"delivery_starts_at" timestamp with time zone,
	"delivery_ends_at" timestamp with time zone,
	"refund_window_ends_at" timestamp with time zone,
	"ship_by_at" timestamp with time zone,
	"buyer_cancel_eligible_at" timestamp with time zone,
	"refund_policy_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pay_obligation_rule_valid" CHECK ("pay_obligations"."delivery_rule" IN ('scheduled-end', 'event-last-day', 'pro-rata-sessions', 'pro-rata-weekly', 'membership-period', 'credit-pack-reserve', 'goods-fulfilment', 'instant')),
	CONSTRAINT "pay_obligation_status_valid" CHECK ("pay_obligations"."status" IN ('pending-settlement', 'awaiting-delivery', 'partially-released', 'released', 'held', 'disputed', 'partially-refunded', 'refunded', 'cancelled')),
	CONSTRAINT "pay_obligation_currency_valid" CHECK ("pay_obligations"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "pay_obligation_amounts_valid" CHECK ("pay_obligations"."gross_minor" >= 0 AND "pay_obligations"."application_fee_minor" >= 0 AND "pay_obligations"."tax_minor" >= 0 AND "pay_obligations"."proceeds_minor" >= 0 AND "pay_obligations"."proceeds_minor" = "pay_obligations"."gross_minor" - "pay_obligations"."application_fee_minor" - "pay_obligations"."tax_minor"),
	CONSTRAINT "pay_obligation_progress_valid" CHECK ("pay_obligations"."released_minor" >= 0 AND "pay_obligations"."refunded_minor" >= 0 AND "pay_obligations"."disputed_minor" >= 0 AND "pay_obligations"."reserved_minor" >= 0 AND "pay_obligations"."refunded_minor" <= "pay_obligations"."gross_minor"),
	CONSTRAINT "pay_obligation_delivery_window_valid" CHECK ("pay_obligations"."delivery_starts_at" IS NULL OR "pay_obligations"."delivery_ends_at" IS NULL OR "pay_obligations"."delivery_ends_at" >= "pay_obligations"."delivery_starts_at")
);
--> statement-breakpoint
CREATE TABLE "pay_recoveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" varchar(12) NOT NULL,
	"status" varchar(12) DEFAULT 'pending' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"owed_for" varchar(32) NOT NULL,
	"due_at" timestamp with time zone,
	"invoice_reference" varchar(128),
	"collected_at" timestamp with time zone,
	"ledger_journal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pay_recovery_kind_valid" CHECK ("pay_recoveries"."kind" IN ('set-off', 'bank-debit', 'invoice')),
	CONSTRAINT "pay_recovery_status_valid" CHECK ("pay_recoveries"."status" IN ('pending', 'collected', 'failed', 'written-off')),
	CONSTRAINT "pay_recovery_amount_valid" CHECK ("pay_recoveries"."amount_minor" > 0),
	CONSTRAINT "pay_recovery_currency_valid" CHECK ("pay_recoveries"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "pay_release_tranches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"obligation_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"kind" varchar(20) NOT NULL,
	"status" varchar(12) DEFAULT 'scheduled' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"session_id" uuid,
	"delivery_due_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"releasable_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"payout_id" uuid,
	"ledger_journal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pay_release_tranche_kind_valid" CHECK ("pay_release_tranches"."kind" IN ('full', 'session-share', 'weekly-portion', 'start-tranche', 'membership-period', 'reserve-remainder')),
	CONSTRAINT "pay_release_tranche_status_valid" CHECK ("pay_release_tranches"."status" IN ('scheduled', 'delivered', 'releasable', 'held', 'released', 'reversed', 'cancelled')),
	CONSTRAINT "pay_release_tranche_amount_valid" CHECK ("pay_release_tranches"."amount_minor" >= 0),
	CONSTRAINT "pay_release_tranche_sequence_valid" CHECK ("pay_release_tranches"."sequence" >= 0),
	CONSTRAINT "pay_release_tranche_currency_valid" CHECK ("pay_release_tranches"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "pay_release_tranche_released_shape" CHECK (("pay_release_tranches"."status" = 'released') = ("pay_release_tranches"."released_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "pay_reserves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" varchar(20) NOT NULL,
	"trigger" varchar(32) NOT NULL,
	"status" varchar(16) DEFAULT 'proposed' NOT NULL,
	"percent_bps" integer NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"review_at" timestamp with time zone,
	"notice_reason" text NOT NULL,
	"notice_sent_at" timestamp with time zone,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"decided_by_person_id" uuid,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pay_reserve_kind_valid" CHECK ("pay_reserves"."kind" IN ('rolling', 'unredeemed-credit', 'closure')),
	CONSTRAINT "pay_reserve_trigger_valid" CHECK ("pay_reserves"."trigger" IN ('new-organization-high-volume', 'refund-rate', 'dispute-rate', 'long-dated-sales', 'business-change', 'processor-requirement', 'standing-credit-reserve', 'closure')),
	CONSTRAINT "pay_reserve_status_valid" CHECK ("pay_reserves"."status" IN ('proposed', 'active', 'under-review', 'released')),
	CONSTRAINT "pay_reserve_percent_valid" CHECK ("pay_reserves"."percent_bps" BETWEEN 1 AND 10000),
	CONSTRAINT "pay_reserve_duration_valid" CHECK ("pay_reserves"."kind" = 'unredeemed-credit' OR "pay_reserves"."starts_at" IS NULL OR "pay_reserves"."ends_at" IS NULL OR ("pay_reserves"."ends_at" > "pay_reserves"."starts_at" AND "pay_reserves"."ends_at" <= "pay_reserves"."starts_at" + interval '180 days')),
	CONSTRAINT "pay_reserve_active_shape" CHECK ("pay_reserves"."status" NOT IN ('active', 'under-review') OR ("pay_reserves"."starts_at" IS NOT NULL AND "pay_reserves"."notice_sent_at" IS NOT NULL AND "pay_reserves"."review_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "staff_availability_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"staff_profile_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" varchar(12) DEFAULT 'draft' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"timezone" varchar(64) NOT NULL,
	"source_text" text,
	"created_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_availability_schedule_status_valid" CHECK ("staff_availability_schedules"."status" IN ('draft', 'active', 'fallback', 'archived')),
	CONSTRAINT "staff_availability_schedule_dates_valid" CHECK ("staff_availability_schedules"."effective_to" IS NULL OR "staff_availability_schedules"."effective_to" >= "staff_availability_schedules"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "staff_availability_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"starts_at" time NOT NULL,
	"ends_at" time NOT NULL,
	"kind" varchar(12) DEFAULT 'coaching' NOT NULL,
	"label" text,
	"venue_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_availability_window_weekday_valid" CHECK ("staff_availability_windows"."weekday" BETWEEN 0 AND 6),
	CONSTRAINT "staff_availability_window_time_valid" CHECK ("staff_availability_windows"."ends_at" > "staff_availability_windows"."starts_at"),
	CONSTRAINT "staff_availability_window_kind_valid" CHECK ("staff_availability_windows"."kind" IN ('coaching', 'early', 'juniors', 'office', 'other'))
);
--> statement-breakpoint
CREATE TABLE "staff_blackouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"staff_profile_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text,
	"created_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_blackout_time_valid" CHECK ("staff_blackouts"."ends_at" > "staff_blackouts"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "staff_coverage_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"staff_profile_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"status" varchar(12) DEFAULT 'suggested' NOT NULL,
	"rationale" text,
	"asked_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_coverage_offer_rank_valid" CHECK ("staff_coverage_offers"."rank" >= 0),
	CONSTRAINT "staff_coverage_offer_status_valid" CHECK ("staff_coverage_offers"."status" IN ('suggested', 'asked', 'accepted', 'declined', 'assigned', 'withdrawn'))
);
--> statement-breakpoint
CREATE TABLE "staff_coverage_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"session_id" uuid,
	"training_event_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"original_staff_profile_id" uuid,
	"reason" varchar(20) NOT NULL,
	"time_off_id" uuid,
	"blackout_id" uuid,
	"status" varchar(12) DEFAULT 'open' NOT NULL,
	"covered_by_staff_profile_id" uuid,
	"resolved_by_person_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_coverage_request_one_target" CHECK (num_nonnulls("staff_coverage_requests"."session_id", "staff_coverage_requests"."training_event_id") = 1),
	CONSTRAINT "staff_coverage_request_time_valid" CHECK ("staff_coverage_requests"."ends_at" > "staff_coverage_requests"."starts_at"),
	CONSTRAINT "staff_coverage_request_reason_valid" CHECK ("staff_coverage_requests"."reason" IN ('time-off', 'blackout', 'schedule-change', 'no-coach-assigned', 'manual')),
	CONSTRAINT "staff_coverage_request_status_valid" CHECK ("staff_coverage_requests"."status" IN ('open', 'asking', 'covered', 'nobody-free', 'cancelled')),
	CONSTRAINT "staff_coverage_request_covered_shape" CHECK (("staff_coverage_requests"."status" = 'covered') = ("staff_coverage_requests"."covered_by_staff_profile_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "staff_time_off" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"staff_profile_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text,
	"status" varchar(12) DEFAULT 'requested' NOT NULL,
	"requested_by_person_id" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_person_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_time_off_time_valid" CHECK ("staff_time_off"."ends_at" > "staff_time_off"."starts_at"),
	CONSTRAINT "staff_time_off_status_valid" CHECK ("staff_time_off"."status" IN ('requested', 'approved', 'declined', 'cancelled')),
	CONSTRAINT "staff_time_off_decided_shape" CHECK ("staff_time_off"."status" IN ('requested', 'cancelled') OR "staff_time_off"."decided_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "staff_compensation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"staff_profile_id" uuid NOT NULL,
	"model" varchar(20) NOT NULL,
	"classification" varchar(16) NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"hourly_rate_minor" bigint,
	"per_session_rate_minor" bigint,
	"annual_salary_minor" bigint,
	"revenue_share_bps" integer,
	"revenue_share_scope" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_compensation_model_valid" CHECK ("staff_compensation"."model" IN ('per-session', 'hourly', 'salary', 'revenue-share', 'hourly-plus-share')),
	CONSTRAINT "staff_compensation_classification_valid" CHECK ("staff_compensation"."classification" IN ('1099-contractor', 'w2-employee')),
	CONSTRAINT "staff_compensation_currency_valid" CHECK ("staff_compensation"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "staff_compensation_dates_valid" CHECK ("staff_compensation"."effective_to" IS NULL OR "staff_compensation"."effective_to" >= "staff_compensation"."effective_from"),
	CONSTRAINT "staff_compensation_amounts_valid" CHECK (coalesce("staff_compensation"."hourly_rate_minor", 0) >= 0 AND coalesce("staff_compensation"."per_session_rate_minor", 0) >= 0 AND coalesce("staff_compensation"."annual_salary_minor", 0) >= 0 AND ("staff_compensation"."revenue_share_bps" IS NULL OR "staff_compensation"."revenue_share_bps" BETWEEN 0 AND 10000)),
	CONSTRAINT "staff_compensation_model_shape" CHECK (("staff_compensation"."model" = 'per-session' AND "staff_compensation"."per_session_rate_minor" IS NOT NULL)
        OR ("staff_compensation"."model" = 'hourly' AND "staff_compensation"."hourly_rate_minor" IS NOT NULL)
        OR ("staff_compensation"."model" = 'salary' AND "staff_compensation"."annual_salary_minor" IS NOT NULL)
        OR ("staff_compensation"."model" = 'revenue-share' AND "staff_compensation"."revenue_share_bps" IS NOT NULL)
        OR ("staff_compensation"."model" = 'hourly-plus-share' AND "staff_compensation"."hourly_rate_minor" IS NOT NULL AND "staff_compensation"."revenue_share_bps" IS NOT NULL)),
	CONSTRAINT "staff_compensation_salary_w2_only" CHECK ("staff_compensation"."model" <> 'salary' OR "staff_compensation"."classification" = 'w2-employee')
);
--> statement-breakpoint
CREATE TABLE "staff_pay_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"pay_run_id" uuid NOT NULL,
	"format" varchar(12) NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"row_count" integer NOT NULL,
	"created_by_person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_pay_export_format_valid" CHECK ("staff_pay_exports"."format" IN ('csv', 'gusto', 'adp', 'quickbooks')),
	CONSTRAINT "staff_pay_export_rows_valid" CHECK ("staff_pay_exports"."row_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "staff_pay_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"frequency" varchar(16) NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"approve_by" date,
	"status" varchar(8) DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_pay_period_frequency_valid" CHECK ("staff_pay_periods"."frequency" IN ('weekly', 'every-2-weeks', 'twice-monthly', 'monthly')),
	CONSTRAINT "staff_pay_period_status_valid" CHECK ("staff_pay_periods"."status" IN ('open', 'closed')),
	CONSTRAINT "staff_pay_period_dates_valid" CHECK ("staff_pay_periods"."ends_on" >= "staff_pay_periods"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "staff_pay_run_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"pay_run_id" uuid NOT NULL,
	"staff_profile_id" uuid NOT NULL,
	"compensation_id" uuid,
	"classification" varchar(16) NOT NULL,
	"method" varchar(10) NOT NULL,
	"status" varchar(10) DEFAULT 'computed' NOT NULL,
	"sessions_count" integer DEFAULT 0 NOT NULL,
	"minutes_worked" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"earnings_minor" bigint NOT NULL,
	"adjustments_minor" bigint DEFAULT 0 NOT NULL,
	"total_minor" bigint NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_pay_run_line_classification_valid" CHECK ("staff_pay_run_lines"."classification" IN ('1099-contractor', 'w2-employee')),
	CONSTRAINT "staff_pay_run_line_method_valid" CHECK ("staff_pay_run_lines"."method" IN ('duna-pay', 'export', 'none')),
	CONSTRAINT "staff_pay_run_line_status_valid" CHECK ("staff_pay_run_lines"."status" IN ('computed', 'adjusted', 'approved', 'exported', 'paying', 'paid', 'failed', 'excluded')),
	CONSTRAINT "staff_pay_run_line_currency_valid" CHECK ("staff_pay_run_lines"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "staff_pay_run_line_amounts_valid" CHECK ("staff_pay_run_lines"."earnings_minor" >= 0 AND "staff_pay_run_lines"."total_minor" >= 0 AND "staff_pay_run_lines"."total_minor" = "staff_pay_run_lines"."earnings_minor" + "staff_pay_run_lines"."adjustments_minor" AND "staff_pay_run_lines"."sessions_count" >= 0 AND "staff_pay_run_lines"."minutes_worked" >= 0),
	CONSTRAINT "staff_pay_run_line_w2_not_paid_by_duna" CHECK ("staff_pay_run_lines"."classification" <> 'w2-employee' OR "staff_pay_run_lines"."method" <> 'duna-pay')
);
--> statement-breakpoint
CREATE TABLE "staff_pay_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"pay_period_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"contractor_total_minor" bigint DEFAULT 0 NOT NULL,
	"employee_total_minor" bigint DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone,
	"approved_by_person_id" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_pay_run_status_valid" CHECK ("staff_pay_runs"."status" IN ('draft', 'computing', 'ready-for-approval', 'approved', 'exported', 'paying', 'paid', 'partially-paid', 'cancelled')),
	CONSTRAINT "staff_pay_run_currency_valid" CHECK ("staff_pay_runs"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "staff_pay_run_totals_valid" CHECK ("staff_pay_runs"."contractor_total_minor" >= 0 AND "staff_pay_runs"."employee_total_minor" >= 0 AND "staff_pay_runs"."revision" > 0),
	CONSTRAINT "staff_pay_run_approved_shape" CHECK ("staff_pay_runs"."status" IN ('draft', 'computing', 'ready-for-approval', 'cancelled') OR "staff_pay_runs"."approved_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "staff_connected_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"invited_by_organization_id" uuid,
	"processor_account_id" varchar(128) NOT NULL,
	"status" varchar(16) DEFAULT 'not-started' NOT NULL,
	"payouts_enabled" boolean DEFAULT false NOT NULL,
	"requirements_due" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bank_last4" varchar(4),
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_connected_accounts_processor_account_id_unique" UNIQUE("processor_account_id"),
	CONSTRAINT "staff_connected_account_status_valid" CHECK ("staff_connected_accounts"."status" IN ('not-started', 'in-progress', 'verifying', 'action-needed', 'restricted', 'ready')),
	CONSTRAINT "staff_connected_account_bank_last4_valid" CHECK ("staff_connected_accounts"."bank_last4" IS NULL OR "staff_connected_accounts"."bank_last4" ~ '^[0-9]{4}$')
);
--> statement-breakpoint
CREATE TABLE "staff_contractor_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"staff_profile_id" uuid NOT NULL,
	"pay_run_line_id" uuid NOT NULL,
	"connected_account_id" uuid NOT NULL,
	"status" varchar(12) DEFAULT 'pending' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"processor_transfer_id" varchar(128),
	"failure_code" varchar(64),
	"initiated_by_person_id" uuid NOT NULL,
	"initiated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"note" text,
	"ledger_journal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_contractor_payout_status_valid" CHECK ("staff_contractor_payouts"."status" IN ('pending', 'processing', 'paid', 'failed', 'cancelled')),
	CONSTRAINT "staff_contractor_payout_amount_valid" CHECK ("staff_contractor_payouts"."amount_minor" > 0),
	CONSTRAINT "staff_contractor_payout_currency_valid" CHECK ("staff_contractor_payouts"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "staff_contractor_payout_paid_shape" CHECK (("staff_contractor_payouts"."status" = 'paid') = ("staff_contractor_payouts"."paid_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "training_event_coaches" (
	"training_event_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" varchar(12) DEFAULT 'lead' NOT NULL,
	"court_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_event_coaches_training_event_id_person_id_pk" PRIMARY KEY("training_event_id","person_id"),
	CONSTRAINT "training_event_coach_role_valid" CHECK ("training_event_coaches"."role" IN ('lead', 'assistant', 'substitute'))
);
--> statement-breakpoint
CREATE TABLE "training_program_coaches" (
	"program_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" varchar(12) DEFAULT 'lead' NOT NULL,
	"weekdays" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_program_coaches_program_id_person_id_pk" PRIMARY KEY("program_id","person_id"),
	CONSTRAINT "training_program_coach_role_valid" CHECK ("training_program_coaches"."role" IN ('lead', 'assistant')),
	CONSTRAINT "training_program_coach_weekdays_valid" CHECK ("training_program_coaches"."weekdays" <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::integer[])
);
--> statement-breakpoint
CREATE TABLE "training_program_date_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"kind" varchar(12) NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"label" text NOT NULL,
	"session_id" uuid,
	"source_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_program_exception_kind_valid" CHECK ("training_program_date_exceptions"."kind" IN ('blackout', 'break', 'tournament', 'travel')),
	CONSTRAINT "training_program_exception_dates_valid" CHECK ("training_program_date_exceptions"."ends_on" >= "training_program_date_exceptions"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "training_program_weekly_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"starts_at" time NOT NULL,
	"ends_at" time NOT NULL,
	"interval_weeks" integer DEFAULT 1 NOT NULL,
	"venue_id" uuid,
	"court_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_program_weekly_slot_weekday_valid" CHECK ("training_program_weekly_slots"."weekday" BETWEEN 0 AND 6),
	CONSTRAINT "training_program_weekly_slot_time_valid" CHECK ("training_program_weekly_slots"."ends_at" > "training_program_weekly_slots"."starts_at"),
	CONSTRAINT "training_program_weekly_slot_interval_valid" CHECK ("training_program_weekly_slots"."interval_weeks" BETWEEN 1 AND 8)
);
--> statement-breakpoint
CREATE TABLE "training_program_weeks" (
	"program_id" uuid NOT NULL,
	"week_number" integer NOT NULL,
	"starts_on" date NOT NULL,
	"phase" varchar(10) NOT NULL,
	"planned_load" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_program_weeks_program_id_week_number_pk" PRIMARY KEY("program_id","week_number"),
	CONSTRAINT "training_program_week_number_valid" CHECK ("training_program_weeks"."week_number" > 0),
	CONSTRAINT "training_program_week_phase_valid" CHECK ("training_program_weeks"."phase" IN ('build', 'break', 'maintain', 'taper', 'recover')),
	CONSTRAINT "training_program_week_load_valid" CHECK ("training_program_weeks"."planned_load" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "training_drill_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drill_id" uuid NOT NULL,
	"drill_version_id" uuid NOT NULL,
	"seller_organization_id" uuid,
	"seller_person_id" uuid,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"pricing" varchar(8) DEFAULT 'free' NOT NULL,
	"price_minor" bigint DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"license_terms" text NOT NULL,
	"listed_as" text NOT NULL,
	"listed_at" timestamp with time zone,
	"delisted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_drill_listing_status_valid" CHECK ("training_drill_listings"."status" IN ('draft', 'pending-review', 'listed', 'delisted', 'rejected')),
	CONSTRAINT "training_drill_listing_pricing_valid" CHECK ("training_drill_listings"."pricing" IN ('free', 'paid')),
	CONSTRAINT "training_drill_listing_currency_valid" CHECK ("training_drill_listings"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "training_drill_listing_price_shape" CHECK (("training_drill_listings"."pricing" = 'free' AND "training_drill_listings"."price_minor" = 0) OR ("training_drill_listings"."pricing" = 'paid' AND "training_drill_listings"."price_minor" > 0)),
	CONSTRAINT "training_drill_listing_one_seller" CHECK (num_nonnulls("training_drill_listings"."seller_organization_id", "training_drill_listings"."seller_person_id") = 1),
	CONSTRAINT "training_drill_listing_listed_shape" CHECK ("training_drill_listings"."status" <> 'listed' OR "training_drill_listings"."listed_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "training_drill_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"buyer_organization_id" uuid,
	"buyer_person_id" uuid,
	"status" varchar(10) DEFAULT 'pending' NOT NULL,
	"price_minor" bigint DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"order_id" uuid,
	"license_id" uuid,
	"purchased_by_person_id" uuid NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_drill_purchase_status_valid" CHECK ("training_drill_purchases"."status" IN ('pending', 'complete', 'refunded', 'revoked')),
	CONSTRAINT "training_drill_purchase_one_buyer" CHECK (num_nonnulls("training_drill_purchases"."buyer_organization_id", "training_drill_purchases"."buyer_person_id") = 1),
	CONSTRAINT "training_drill_purchase_price_valid" CHECK ("training_drill_purchases"."price_minor" >= 0),
	CONSTRAINT "training_drill_purchase_currency_valid" CHECK ("training_drill_purchases"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "training_drill_purchase_paid_has_order" CHECK ("training_drill_purchases"."price_minor" = 0 OR "training_drill_purchases"."status" = 'pending' OR "training_drill_purchases"."order_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "training_drill_review_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drill_version_id" uuid NOT NULL,
	"kind" varchar(20) NOT NULL,
	"status" varchar(8) DEFAULT 'waiting' NOT NULL,
	"note" text,
	"reviewer_person_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_drill_review_check_kind_valid" CHECK ("training_drill_review_checks"."kind" IN ('scene-valid', 'no-personal-data', 'duna-review')),
	CONSTRAINT "training_drill_review_check_status_valid" CHECK ("training_drill_review_checks"."status" IN ('waiting', 'ok', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "training_drill_scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drill_version_id" uuid NOT NULL,
	"model_version" integer NOT NULL,
	"document" jsonb NOT NULL,
	"derived" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"validation_status" varchar(10) DEFAULT 'unchecked' NOT NULL,
	"validation_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"validator_version" varchar(32),
	"validated_at" timestamp with time zone,
	"source" varchar(10) DEFAULT 'coach' NOT NULL,
	"has_pinned_edits" boolean DEFAULT false NOT NULL,
	"created_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_drill_scenes_drill_version_id_unique" UNIQUE("drill_version_id"),
	CONSTRAINT "training_drill_scene_model_version_valid" CHECK ("training_drill_scenes"."model_version" >= 2),
	CONSTRAINT "training_drill_scene_validation_valid" CHECK ("training_drill_scenes"."validation_status" IN ('unchecked', 'valid', 'invalid')),
	CONSTRAINT "training_drill_scene_source_valid" CHECK ("training_drill_scenes"."source" IN ('coach', 'ai', 'converted')),
	CONSTRAINT "training_drill_scene_validated_shape" CHECK ("training_drill_scenes"."validation_status" = 'unchecked' OR "training_drill_scenes"."validated_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "training_scene_ai_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"drill_id" uuid,
	"requested_by_person_id" uuid,
	"prompt" text NOT NULL,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"named_spots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"draft_document" jsonb,
	"validation_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result_scene_id" uuid,
	"model" varchar(64),
	"error_code" varchar(64),
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_scene_ai_run_status_valid" CHECK ("training_scene_ai_runs"."status" IN ('queued', 'naming', 'placing', 'validating', 'repairing', 'ready-for-review', 'accepted', 'rejected', 'failed')),
	CONSTRAINT "training_scene_ai_run_attempts_valid" CHECK ("training_scene_ai_runs"."attempts" BETWEEN 0 AND 10),
	CONSTRAINT "training_scene_ai_run_accepted_shape" CHECK ("training_scene_ai_runs"."status" <> 'accepted' OR "training_scene_ai_runs"."result_scene_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "concierge_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"proposal_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"message_id" uuid,
	"person_id" uuid NOT NULL,
	"channel" varchar(10) NOT NULL,
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"provider_message_handle" varchar(192),
	"error_code" varchar(64),
	"attempts" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concierge_deliveries_recipient_id_unique" UNIQUE("recipient_id"),
	CONSTRAINT "concierge_delivery_channel_valid" CHECK ("concierge_deliveries"."channel" IN ('duna', 'email', 'imessage', 'whatsapp')),
	CONSTRAINT "concierge_delivery_status_valid" CHECK ("concierge_deliveries"."status" IN ('queued', 'sent', 'delivered', 'read', 'failed', 'not-enabled', 'provider-not-configured', 'skipped')),
	CONSTRAINT "concierge_delivery_attempts_valid" CHECK ("concierge_deliveries"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "concierge_send_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"conversation_id" uuid NOT NULL,
	"author_person_id" uuid NOT NULL,
	"drafted_by" varchar(8) DEFAULT 'person' NOT NULL,
	"body" text NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"status" varchar(18) DEFAULT 'draft' NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"unreachable_count" integer DEFAULT 0 NOT NULL,
	"guardian_note" text,
	"confirmed_by_person_id" uuid,
	"confirmed_at" timestamp with time zone,
	"message_id" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concierge_send_proposal_status_valid" CHECK ("concierge_send_proposals"."status" IN ('draft', 'ready', 'confirmed', 'sending', 'sent', 'partially-failed', 'cancelled', 'expired')),
	CONSTRAINT "concierge_send_proposal_drafted_by_valid" CHECK ("concierge_send_proposals"."drafted_by" IN ('person', 'duna')),
	CONSTRAINT "concierge_send_proposal_counts_valid" CHECK ("concierge_send_proposals"."recipient_count" >= 0 AND "concierge_send_proposals"."unreachable_count" BETWEEN 0 AND "concierge_send_proposals"."recipient_count"),
	CONSTRAINT "concierge_send_proposal_confirmed_shape" CHECK ("concierge_send_proposals"."status" IN ('draft', 'ready', 'cancelled', 'expired') OR ("concierge_send_proposals"."confirmed_by_person_id" IS NOT NULL AND "concierge_send_proposals"."confirmed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "concierge_send_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"guardian_of_person_id" uuid,
	"channel" varchar(10),
	"unreachable_reason" varchar(24),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concierge_send_recipient_channel_valid" CHECK ("concierge_send_recipients"."channel" IS NULL OR "concierge_send_recipients"."channel" IN ('duna', 'email', 'imessage', 'whatsapp')),
	CONSTRAINT "concierge_send_recipient_reason_valid" CHECK ("concierge_send_recipients"."unreachable_reason" IS NULL OR "concierge_send_recipients"."unreachable_reason" IN ('no-channel', 'channel-not-enabled', 'provider-not-configured', 'no-consent', 'quiet-hours', 'blocked')),
	CONSTRAINT "concierge_send_recipient_reachable_shape" CHECK (("concierge_send_recipients"."channel" IS NULL) = ("concierge_send_recipients"."unreachable_reason" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "person_channel_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"channel" varchar(10) NOT NULL,
	"destination" text,
	"status" varchar(24) DEFAULT 'pending-verification' NOT NULL,
	"verified_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_channel_endpoint_channel_valid" CHECK ("person_channel_endpoints"."channel" IN ('duna', 'email', 'imessage', 'whatsapp')),
	CONSTRAINT "person_channel_endpoint_status_valid" CHECK ("person_channel_endpoints"."status" IN ('pending-verification', 'connected', 'revoked')),
	CONSTRAINT "person_channel_endpoint_destination_shape" CHECK ("person_channel_endpoints"."channel" = 'duna' OR "person_channel_endpoints"."destination" IS NOT NULL),
	CONSTRAINT "person_channel_endpoint_verified_shape" CHECK ("person_channel_endpoints"."status" <> 'connected' OR "person_channel_endpoints"."verified_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "person_channel_preferences" (
	"person_id" uuid PRIMARY KEY NOT NULL,
	"preferred_channel" varchar(10) DEFAULT 'duna' NOT NULL,
	"quiet_hours_start" time,
	"quiet_hours_end" time,
	"timezone" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_channel_preference_channel_valid" CHECK ("person_channel_preferences"."preferred_channel" IN ('duna', 'email', 'imessage', 'whatsapp')),
	CONSTRAINT "person_channel_preference_quiet_hours_pair" CHECK (("person_channel_preferences"."quiet_hours_start" IS NULL) = ("person_channel_preferences"."quiet_hours_end" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "website_change_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"change_id" uuid NOT NULL,
	"kind" varchar(24) NOT NULL,
	"status" varchar(8) DEFAULT 'pending' NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" text,
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "website_change_check_kind_valid" CHECK ("website_change_checks"."kind" IN ('build', 'checkout-test-mode', 'links', 'phone-layout', 'accessibility', 'speed', 'pages-changed', 'duna-areas-untouched')),
	CONSTRAINT "website_change_check_status_valid" CHECK ("website_change_checks"."status" IN ('pending', 'running', 'passed', 'warning', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "website_change_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"change_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"title" text NOT NULL,
	"status" varchar(10) DEFAULT 'queued' NOT NULL,
	"question" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error_code" varchar(64),
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "website_change_job_status_valid" CHECK ("website_change_jobs"."status" IN ('queued', 'working', 'done', 'needs-you', 'failed', 'cancelled')),
	CONSTRAINT "website_change_job_question_shape" CHECK ("website_change_jobs"."status" <> 'needs-you' OR "website_change_jobs"."question" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "website_change_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"change_id" uuid NOT NULL,
	"role" varchar(8) NOT NULL,
	"author_person_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "website_change_message_role_valid" CHECK ("website_change_messages"."role" IN ('person', 'duna', 'system')),
	CONSTRAINT "website_change_message_author_shape" CHECK ("website_change_messages"."role" <> 'person' OR "website_change_messages"."author_person_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "website_change_pages" (
	"change_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"kind" varchar(8) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "website_change_pages_change_id_page_id_pk" PRIMARY KEY("change_id","page_id"),
	CONSTRAINT "website_change_page_kind_valid" CHECK ("website_change_pages"."kind" IN ('changed', 'new', 'removed'))
);
--> statement-breakpoint
CREATE TABLE "website_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"lane" varchar(16) NOT NULL,
	"lane_overridden_from" varchar(16),
	"status" varchar(18) DEFAULT 'draft' NOT NULL,
	"request_text" text NOT NULL,
	"asked_by_person_id" uuid,
	"base_revision_id" uuid,
	"preview_revision_id" uuid,
	"preview_url" text,
	"fact_proposal" jsonb,
	"capability_plan" jsonb,
	"credits_reserved" bigint DEFAULT 0 NOT NULL,
	"credits_spent" bigint DEFAULT 0 NOT NULL,
	"scheduled_for" timestamp with time zone,
	"published_at" timestamp with time zone,
	"discarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "website_change_lane_valid" CHECK ("website_changes"."lane" IN ('club-facts', 'content', 'design', 'new-capability')),
	CONSTRAINT "website_change_lane_override_valid" CHECK ("website_changes"."lane_overridden_from" IS NULL OR "website_changes"."lane_overridden_from" IN ('club-facts', 'content', 'design', 'new-capability')),
	CONSTRAINT "website_change_status_valid" CHECK ("website_changes"."status" IN ('draft', 'asking', 'in-progress', 'ready-for-review', 'out-of-date', 'scheduled', 'published', 'discarded', 'failed', 'undone')),
	CONSTRAINT "website_change_number_valid" CHECK ("website_changes"."number" > 0),
	CONSTRAINT "website_change_credits_valid" CHECK ("website_changes"."credits_reserved" >= 0 AND "website_changes"."credits_spent" >= 0),
	CONSTRAINT "website_change_scheduled_shape" CHECK ("website_changes"."status" <> 'scheduled' OR "website_changes"."scheduled_for" IS NOT NULL),
	CONSTRAINT "website_change_published_shape" CHECK ("website_changes"."status" NOT IN ('published', 'undone') OR "website_changes"."published_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "website_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"parent_page_id" uuid,
	"path" text NOT NULL,
	"title" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"managed_by" varchar(8) DEFAULT 'club' NOT NULL,
	"status" varchar(8) DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "website_page_managed_by_valid" CHECK ("website_pages"."managed_by" IN ('club', 'duna')),
	CONSTRAINT "website_page_status_valid" CHECK ("website_pages"."status" IN ('draft', 'live', 'hidden', 'removed')),
	CONSTRAINT "website_page_path_valid" CHECK ("website_pages"."path" ~ '^/[a-z0-9/_-]*$'),
	CONSTRAINT "website_page_not_own_parent" CHECK ("website_pages"."parent_page_id" IS NULL OR "website_pages"."parent_page_id" <> "website_pages"."id")
);
--> statement-breakpoint
CREATE TABLE "website_publish_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" varchar(8) NOT NULL,
	"version" integer NOT NULL,
	"change_id" uuid,
	"revision_id" uuid NOT NULL,
	"reverses_event_id" uuid,
	"actor_person_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "website_publish_event_kind_valid" CHECK ("website_publish_events"."kind" IN ('publish', 'undo', 'restore')),
	CONSTRAINT "website_publish_event_version_valid" CHECK ("website_publish_events"."version" > 0),
	CONSTRAINT "website_publish_event_reverse_shape" CHECK (("website_publish_events"."kind" = 'publish') = ("website_publish_events"."reverses_event_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "website_site_starts" (
	"site_id" uuid PRIMARY KEY NOT NULL,
	"origin" varchar(16) NOT NULL,
	"template_id" uuid,
	"existing_site_url" text,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_by_person_id" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "website_site_start_origin_valid" CHECK ("website_site_starts"."origin" IN ('template', 'existing-site')),
	CONSTRAINT "website_site_start_origin_shape" CHECK (("website_site_starts"."origin" = 'template' AND "website_site_starts"."template_id" IS NOT NULL) OR ("website_site_starts"."origin" = 'existing-site' AND "website_site_starts"."existing_site_url" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "website_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(48) NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"status" varchar(10) DEFAULT 'draft' NOT NULL,
	"preview_image_url" text,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "website_template_status_valid" CHECK ("website_templates"."status" IN ('draft', 'available', 'retired')),
	CONSTRAINT "website_template_version_valid" CHECK ("website_templates"."version" > 0),
	CONSTRAINT "website_template_key_valid" CHECK ("website_templates"."key" ~ '^[a-z0-9-]+$')
);
--> statement-breakpoint
CREATE TABLE "court_play_stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"court_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"reason" varchar(12) NOT NULL,
	"source" varchar(14) DEFAULT 'manual' NOT NULL,
	"status" varchar(8) DEFAULT 'active' NOT NULL,
	"note" text,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"lifted_at" timestamp with time zone,
	"started_by_person_id" uuid,
	"lifted_by_person_id" uuid,
	"affected_reservations" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "court_play_stop_reason_valid" CHECK ("court_play_stops"."reason" IN ('lightning', 'weather', 'maintenance', 'event', 'other')),
	CONSTRAINT "court_play_stop_source_valid" CHECK ("court_play_stops"."source" IN ('manual', 'weather-alert')),
	CONSTRAINT "court_play_stop_status_valid" CHECK ("court_play_stops"."status" IN ('active', 'lifted', 'expired')),
	CONSTRAINT "court_play_stop_time_valid" CHECK ("court_play_stops"."ends_at" IS NULL OR "court_play_stops"."ends_at" > "court_play_stops"."starts_at"),
	CONSTRAINT "court_play_stop_lifted_shape" CHECK (("court_play_stops"."status" = 'lifted') = ("court_play_stops"."lifted_at" IS NOT NULL)),
	CONSTRAINT "court_play_stop_affected_valid" CHECK ("court_play_stops"."affected_reservations" >= 0)
);
--> statement-breakpoint
CREATE TABLE "facility_access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"guardian_person_id" uuid,
	"status" varchar(10) DEFAULT 'requested' NOT NULL,
	"affiliation" text,
	"message" text,
	"waiver_execution_id" uuid,
	"auto_approved" boolean DEFAULT false NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_person_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "facility_access_request_status_valid" CHECK ("facility_access_requests"."status" IN ('requested', 'approved', 'declined', 'expired', 'removed')),
	CONSTRAINT "facility_access_request_decided_shape" CHECK ("facility_access_requests"."status" = 'requested' OR "facility_access_requests"."decided_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "facility_access_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"access" varchar(16) NOT NULL,
	"court_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"weekdays" integer[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::integer[] NOT NULL,
	"starts_at" time,
	"ends_at" time,
	"season_starts_on" date,
	"season_ends_on" date,
	"early_access_hours" integer,
	"priority" integer DEFAULT 0 NOT NULL,
	"status" varchar(8) DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "facility_access_rule_access_valid" CHECK ("facility_access_rules"."access" IN ('anyone', 'approved-only', 'members-only', 'first-come', 'open-play', 'residents-first')),
	CONSTRAINT "facility_access_rule_status_valid" CHECK ("facility_access_rules"."status" IN ('draft', 'active', 'archived')),
	CONSTRAINT "facility_access_rule_weekdays_valid" CHECK (cardinality("facility_access_rules"."weekdays") > 0 AND "facility_access_rules"."weekdays" <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::integer[]),
	CONSTRAINT "facility_access_rule_time_valid" CHECK (("facility_access_rules"."starts_at" IS NULL) = ("facility_access_rules"."ends_at" IS NULL) AND ("facility_access_rules"."starts_at" IS NULL OR "facility_access_rules"."ends_at" > "facility_access_rules"."starts_at")),
	CONSTRAINT "facility_access_rule_season_valid" CHECK (("facility_access_rules"."season_starts_on" IS NULL) = ("facility_access_rules"."season_ends_on" IS NULL) AND ("facility_access_rules"."season_starts_on" IS NULL OR "facility_access_rules"."season_ends_on" >= "facility_access_rules"."season_starts_on")),
	CONSTRAINT "facility_access_rule_early_valid" CHECK ("facility_access_rules"."early_access_hours" IS NULL OR "facility_access_rules"."early_access_hours" BETWEEN 1 AND 720)
);
--> statement-breakpoint
CREATE TABLE "facility_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"slug" varchar(96) NOT NULL,
	"status" varchar(10) DEFAULT 'draft' NOT NULL,
	"default_access" varchar(16) DEFAULT 'anyone' NOT NULL,
	"lighting" varchar(10) DEFAULT 'no-lights' NOT NULL,
	"payout_mode" varchar(10) DEFAULT 'free-only' NOT NULL,
	"price_per_court_hour_minor" bigint DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"waiver_document_id" uuid,
	"free_cancel_minutes" integer,
	"no_show_policy" text,
	"max_hours_per_person_per_day" integer,
	"max_hours_per_person_per_week" integer,
	"booking_window_days" integer DEFAULT 7 NOT NULL,
	"max_players_per_court" integer,
	"lights_off_at" time,
	"noise_ends_at" time,
	"lightning_radius_km" double precision,
	"lightning_action" varchar(20),
	"auto_approve_signed_adults" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "facility_listings_venue_id_unique" UNIQUE("venue_id"),
	CONSTRAINT "facility_listings_slug_unique" UNIQUE("slug"),
	CONSTRAINT "facility_listing_status_valid" CHECK ("facility_listings"."status" IN ('draft', 'live', 'paused', 'archived')),
	CONSTRAINT "facility_listing_access_valid" CHECK ("facility_listings"."default_access" IN ('anyone', 'approved-only', 'members-only', 'first-come', 'open-play', 'residents-first')),
	CONSTRAINT "facility_listing_lighting_valid" CHECK ("facility_listings"."lighting" IN ('all-lit', 'some-lit', 'no-lights')),
	CONSTRAINT "facility_listing_payout_valid" CHECK ("facility_listings"."payout_mode" IN ('connected', 'free-only')),
	CONSTRAINT "facility_listing_lightning_action_valid" CHECK ("facility_listings"."lightning_action" IS NULL OR "facility_listings"."lightning_action" IN ('pause-and-notify', 'cancel-and-refund', 'notify-only')),
	CONSTRAINT "facility_listing_currency_valid" CHECK ("facility_listings"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "facility_listing_price_valid" CHECK ("facility_listings"."price_per_court_hour_minor" >= 0 AND ("facility_listings"."payout_mode" = 'connected' OR "facility_listings"."price_per_court_hour_minor" = 0)),
	CONSTRAINT "facility_listing_limits_valid" CHECK (coalesce("facility_listings"."free_cancel_minutes", 0) >= 0 AND coalesce("facility_listings"."max_hours_per_person_per_day", 1) > 0 AND coalesce("facility_listings"."max_hours_per_person_per_week", 1) > 0 AND "facility_listings"."booking_window_days" BETWEEN 0 AND 365 AND coalesce("facility_listings"."max_players_per_court", 1) > 0 AND coalesce("facility_listings"."lightning_radius_km", 1) > 0),
	CONSTRAINT "facility_listing_slug_valid" CHECK ("facility_listings"."slug" ~ '^[a-z0-9-]+$')
);
--> statement-breakpoint
CREATE TABLE "search_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar(16) NOT NULL,
	"entity_id" uuid NOT NULL,
	"organization_id" uuid,
	"title" text NOT NULL,
	"subtitle" text,
	"path" text NOT NULL,
	"visibility" varchar(8) DEFAULT 'public' NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"locality" text,
	"administrative_area" text,
	"country_code" varchar(2),
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"price_from_minor" bigint,
	"currency" varchar(3),
	"search_text" text NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	"source_updated_at" timestamp with time zone NOT NULL,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_document_kind_valid" CHECK ("search_documents"."kind" IN ('club', 'venue', 'public-court', 'event', 'league', 'lesson', 'program', 'coach', 'open-play')),
	CONSTRAINT "search_document_visibility_valid" CHECK ("search_documents"."visibility" IN ('public', 'members', 'hidden')),
	CONSTRAINT "search_document_geo_pair" CHECK (("search_documents"."latitude" IS NULL) = ("search_documents"."longitude" IS NULL) AND ("search_documents"."latitude" IS NULL OR ("search_documents"."latitude" BETWEEN -90 AND 90 AND "search_documents"."longitude" BETWEEN -180 AND 180))),
	CONSTRAINT "search_document_time_valid" CHECK ("search_documents"."ends_at" IS NULL OR "search_documents"."starts_at" IS NULL OR "search_documents"."ends_at" >= "search_documents"."starts_at"),
	CONSTRAINT "search_document_price_shape" CHECK (("search_documents"."price_from_minor" IS NULL) = ("search_documents"."currency" IS NULL) AND ("search_documents"."currency" IS NULL OR "search_documents"."currency" ~ '^[A-Z]{3}$') AND coalesce("search_documents"."price_from_minor", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "conditions_hourly" (
	"location_key" varchar(64) NOT NULL,
	"hour_starts_at" timestamp with time zone NOT NULL,
	"venue_id" uuid,
	"temperature_c" double precision,
	"feels_like_c" double precision,
	"wind_speed_kph" double precision,
	"wind_gust_kph" double precision,
	"wind_direction_deg" integer,
	"wind_strength" varchar(8),
	"precipitation_probability" integer,
	"uv_index" double precision,
	"lightning_distance_km" double precision,
	"alert_level" varchar(8) DEFAULT 'none' NOT NULL,
	"condition_code" varchar(32),
	"provider" varchar(12) NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "conditions_hourly_location_key_hour_starts_at_pk" PRIMARY KEY("location_key","hour_starts_at"),
	CONSTRAINT "conditions_hourly_alert_valid" CHECK ("conditions_hourly"."alert_level" IN ('none', 'watch', 'stop')),
	CONSTRAINT "conditions_hourly_provider_valid" CHECK ("conditions_hourly"."provider" IN ('tomorrow-io', 'noaa', 'computed')),
	CONSTRAINT "conditions_hourly_wind_strength_valid" CHECK ("conditions_hourly"."wind_strength" IS NULL OR "conditions_hourly"."wind_strength" IN ('calm', 'light', 'steady', 'strong')),
	CONSTRAINT "conditions_hourly_ranges_valid" CHECK (("conditions_hourly"."wind_direction_deg" IS NULL OR "conditions_hourly"."wind_direction_deg" BETWEEN 0 AND 359) AND ("conditions_hourly"."precipitation_probability" IS NULL OR "conditions_hourly"."precipitation_probability" BETWEEN 0 AND 100) AND coalesce("conditions_hourly"."wind_speed_kph", 0) >= 0 AND coalesce("conditions_hourly"."wind_gust_kph", 0) >= 0 AND coalesce("conditions_hourly"."uv_index", 0) >= 0 AND coalesce("conditions_hourly"."lightning_distance_km", 0) >= 0),
	CONSTRAINT "conditions_hourly_expiry_valid" CHECK ("conditions_hourly"."expires_at" > "conditions_hourly"."fetched_at")
);
--> statement-breakpoint
CREATE TABLE "conditions_sun_times" (
	"location_key" varchar(64) NOT NULL,
	"local_date" date NOT NULL,
	"timezone" varchar(64) NOT NULL,
	"civil_dawn_at" timestamp with time zone,
	"sunrise_at" timestamp with time zone,
	"golden_hour_starts_at" timestamp with time zone,
	"sunset_at" timestamp with time zone,
	"civil_dusk_at" timestamp with time zone,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conditions_sun_times_location_key_local_date_pk" PRIMARY KEY("location_key","local_date"),
	CONSTRAINT "conditions_sun_order_valid" CHECK ("conditions_sun_times"."sunrise_at" IS NULL OR "conditions_sun_times"."sunset_at" IS NULL OR "conditions_sun_times"."sunset_at" > "conditions_sun_times"."sunrise_at")
);
--> statement-breakpoint
CREATE TABLE "premium_subscription_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"kind" varchar(32) NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"store_event_ref" varchar(192),
	"note" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "premium_subscription_event_kind_valid" CHECK ("premium_subscription_events"."kind" IN ('started', 'trial-started', 'renewed', 'renewal-reminder-sent', 'price-change-notice-sent', 'trial-ending-reminder-sent', 'payment-failed', 'grace-period-started', 'cancel-requested', 'cancel-undone', 'expired', 'refunded', 'revoked', 'store-changed'))
);
--> statement-breakpoint
CREATE TABLE "premium_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"store" varchar(20) NOT NULL,
	"store_subscription_ref" varchar(192) NOT NULL,
	"plan_key" varchar(48) NOT NULL,
	"status" varchar(24) NOT NULL,
	"billing_interval" varchar(8) NOT NULL,
	"price_minor" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"auto_renews" boolean DEFAULT true NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"current_period_starts_at" timestamp with time zone NOT NULL,
	"current_period_ends_at" timestamp with time zone NOT NULL,
	"grace_period_ends_at" timestamp with time zone,
	"cancel_requested_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"pending_price_minor" bigint,
	"pending_price_effective_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "premium_subscription_store_valid" CHECK ("premium_subscriptions"."store" IN ('duna-pay', 'apple-app-store', 'google-play')),
	CONSTRAINT "premium_subscription_status_valid" CHECK ("premium_subscriptions"."status" IN ('trialing', 'active', 'grace-period', 'past-due', 'cancel-at-period-end', 'expired', 'revoked', 'refunded')),
	CONSTRAINT "premium_subscription_interval_valid" CHECK ("premium_subscriptions"."billing_interval" IN ('month', 'year')),
	CONSTRAINT "premium_subscription_currency_valid" CHECK ("premium_subscriptions"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "premium_subscription_price_valid" CHECK ("premium_subscriptions"."price_minor" >= 0 AND ("premium_subscriptions"."pending_price_minor" IS NULL OR "premium_subscriptions"."pending_price_minor" >= 0)),
	CONSTRAINT "premium_subscription_period_valid" CHECK ("premium_subscriptions"."current_period_ends_at" > "premium_subscriptions"."current_period_starts_at")
);
--> statement-breakpoint
CREATE TABLE "household_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid,
	"guardian_person_id" uuid NOT NULL,
	"child_person_id" uuid NOT NULL,
	"kind" varchar(32) NOT NULL,
	"decision" varchar(10) NOT NULL,
	"method" varchar(24) NOT NULL,
	"disclosure_version" varchar(32) NOT NULL,
	"disclosure_text_hash" varchar(64) NOT NULL,
	"verification_reference" varchar(128),
	"legal_acceptance_id" uuid,
	"ip_address" varchar(64),
	"user_agent" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_consent_kind_valid" CHECK ("household_consents"."kind" IN ('account', 'verifiable-parental-consent', 'public-profile', 'video', 'messaging', 'location')),
	CONSTRAINT "household_consent_decision_valid" CHECK ("household_consents"."decision" IN ('granted', 'denied', 'withdrawn')),
	CONSTRAINT "household_consent_method_valid" CHECK ("household_consents"."method" IN ('checkbox-attestation', 'card-verification', 'signed-attestation', 'identity-provider', 'admin-review')),
	CONSTRAINT "household_consent_distinct_people" CHECK ("household_consents"."guardian_person_id" <> "household_consents"."child_person_id")
);
--> statement-breakpoint
CREATE TABLE "household_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"invited_by_person_id" uuid NOT NULL,
	"role" varchar(10) NOT NULL,
	"concerns_person_id" uuid,
	"contact_hint" text,
	"token_hash" varchar(128) NOT NULL,
	"status" varchar(10) DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_by_person_id" uuid,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "household_invitation_role_valid" CHECK ("household_invitations"."role" IN ('guardian', 'adult', 'teen', 'child')),
	CONSTRAINT "household_invitation_status_valid" CHECK ("household_invitations"."status" IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
	CONSTRAINT "household_invitation_no_child_invite" CHECK ("household_invitations"."role" <> 'child'),
	CONSTRAINT "household_invitation_accepted_shape" CHECK (("household_invitations"."status" = 'accepted') = ("household_invitations"."accepted_by_person_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "household_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" varchar(10) NOT NULL,
	"account_holder_person_id" uuid,
	"status" varchar(8) DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"deletion_scheduled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_member_role_valid" CHECK ("household_members"."role" IN ('guardian', 'adult', 'teen', 'child')),
	CONSTRAINT "household_member_status_valid" CHECK ("household_members"."status" IN ('active', 'removed')),
	CONSTRAINT "household_member_child_managed" CHECK ("household_members"."role" <> 'child' OR "household_members"."account_holder_person_id" IS NOT NULL),
	CONSTRAINT "household_member_holder_not_self" CHECK ("household_members"."account_holder_person_id" IS NULL OR "household_members"."account_holder_person_id" <> "household_members"."person_id"),
	CONSTRAINT "household_member_removed_shape" CHECK (("household_members"."status" = 'removed') = ("household_members"."removed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_by_person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_key" varchar(48) NOT NULL,
	"version" varchar(32) NOT NULL,
	"title" text NOT NULL,
	"audience" varchar(16) NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"url" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"requires_reacceptance" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_document_version_key_valid" CHECK ("legal_document_versions"."document_key" ~ '^[a-z0-9][a-z0-9-]{1,47}$'),
	CONSTRAINT "legal_document_version_audience_valid" CHECK ("legal_document_versions"."audience" IN ('players', 'guardians', 'organizations', 'everyone')),
	CONSTRAINT "legal_document_version_hash_valid" CHECK ("legal_document_versions"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "legal_document_version_effective_valid" CHECK ("legal_document_versions"."effective_at" >= "legal_document_versions"."published_at")
);
--> statement-breakpoint
ALTER TABLE "legal_acceptances" DROP CONSTRAINT "legal_acceptance_document_valid";--> statement-breakpoint
ALTER TABLE "courts" ADD COLUMN "orientation_deg" integer;--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD COLUMN "accepted_as" varchar(24) DEFAULT 'self' NOT NULL;--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD COLUMN "on_behalf_of_person_id" uuid;--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD COLUMN "surface" varchar(16);--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD COLUMN "locale" varchar(16);--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD COLUMN "document_version_id" uuid;--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD COLUMN "document_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD COLUMN "app_version" varchar(32);--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD COLUMN "request_id" varchar(64);--> statement-breakpoint
ALTER TABLE "training_drills" ADD COLUMN "scope" varchar(10) DEFAULT 'club' NOT NULL;--> statement-breakpoint
ALTER TABLE "training_drills" ADD COLUMN "owner_person_id" uuid;--> statement-breakpoint
ALTER TABLE "training_drills" ADD COLUMN "review_state" varchar(20) DEFAULT 'not-submitted' NOT NULL;--> statement-breakpoint
ALTER TABLE "training_events" ADD COLUMN "focus_text" text;--> statement-breakpoint
ALTER TABLE "training_events" ADD COLUMN "load_estimate_source" varchar(20) DEFAULT 'assumed' NOT NULL;--> statement-breakpoint
ALTER TABLE "training_events" ADD COLUMN "estimated_touches" integer;--> statement-breakpoint
ALTER TABLE "training_events" ADD COLUMN "estimated_jumps" integer;--> statement-breakpoint
ALTER TABLE "training_events" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "training_events" ADD COLUMN "cancelled_by_person_id" uuid;--> statement-breakpoint
ALTER TABLE "training_events" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "training_practice_plan_blocks" ADD COLUMN "focus" text;--> statement-breakpoint
ALTER TABLE "training_practice_plan_blocks" ADD COLUMN "estimated_touches" integer;--> statement-breakpoint
ALTER TABLE "training_practice_plan_blocks" ADD COLUMN "estimated_jumps" integer;--> statement-breakpoint
ALTER TABLE "training_practice_plan_blocks" ADD COLUMN "estimated_metres" integer;--> statement-breakpoint
ALTER TABLE "training_practice_plan_blocks" ADD COLUMN "estimate_source" varchar(20) DEFAULT 'assumed' NOT NULL;--> statement-breakpoint
ALTER TABLE "training_practice_plans" ADD COLUMN "assumptions" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "training_practice_plans" ADD COLUMN "target_load" integer;--> statement-breakpoint
ALTER TABLE "training_programs" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "training_programs" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "training_programs" ADD COLUMN "source_text" text;--> statement-breakpoint
ALTER TABLE "organization_profiles" ADD CONSTRAINT "organization_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_profiles" ADD CONSTRAINT "organization_profiles_updated_by_person_id_people_id_fk" FOREIGN KEY ("updated_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup_proposals" ADD CONSTRAINT "setup_proposals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup_proposals" ADD CONSTRAINT "setup_proposals_run_id_setup_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."setup_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup_proposals" ADD CONSTRAINT "setup_proposals_decided_by_person_id_people_id_fk" FOREIGN KEY ("decided_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup_run_pages" ADD CONSTRAINT "setup_run_pages_run_id_setup_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."setup_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup_runs" ADD CONSTRAINT "setup_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup_runs" ADD CONSTRAINT "setup_runs_started_by_person_id_people_id_fk" FOREIGN KEY ("started_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_pay_accounts" ADD CONSTRAINT "organization_pay_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_pay_accounts" ADD CONSTRAINT "organization_pay_accounts_first_payout_delay_waived_by_person_id_people_id_fk" FOREIGN KEY ("first_payout_delay_waived_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_delivery_events" ADD CONSTRAINT "pay_delivery_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_delivery_events" ADD CONSTRAINT "pay_delivery_events_obligation_id_pay_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."pay_obligations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_delivery_events" ADD CONSTRAINT "pay_delivery_events_tranche_id_pay_release_tranches_id_fk" FOREIGN KEY ("tranche_id") REFERENCES "public"."pay_release_tranches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_delivery_events" ADD CONSTRAINT "pay_delivery_events_actor_person_id_people_id_fk" FOREIGN KEY ("actor_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_dispute_cases" ADD CONSTRAINT "pay_dispute_cases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_dispute_cases" ADD CONSTRAINT "pay_dispute_cases_obligation_id_pay_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."pay_obligations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_dispute_cases" ADD CONSTRAINT "pay_dispute_cases_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_dispute_cases" ADD CONSTRAINT "pay_dispute_cases_legacy_dispute_id_disputes_id_fk" FOREIGN KEY ("legacy_dispute_id") REFERENCES "public"."disputes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_dispute_cases" ADD CONSTRAINT "pay_dispute_cases_evidence_submitted_by_person_id_people_id_fk" FOREIGN KEY ("evidence_submitted_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_dispute_cases" ADD CONSTRAINT "pay_dispute_cases_hold_id_pay_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."pay_holds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_dispute_cases" ADD CONSTRAINT "pay_dispute_cases_reversal_ledger_journal_id_ledger_journals_id_fk" FOREIGN KEY ("reversal_ledger_journal_id") REFERENCES "public"."ledger_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_dispute_cases" ADD CONSTRAINT "pay_dispute_cases_outcome_ledger_journal_id_ledger_journals_id_fk" FOREIGN KEY ("outcome_ledger_journal_id") REFERENCES "public"."ledger_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_fee_quotes" ADD CONSTRAINT "pay_fee_quotes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_fee_quotes" ADD CONSTRAINT "pay_fee_quotes_buyer_person_id_people_id_fk" FOREIGN KEY ("buyer_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_fee_quotes" ADD CONSTRAINT "pay_fee_quotes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_fee_quotes" ADD CONSTRAINT "pay_fee_quotes_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_holds" ADD CONSTRAINT "pay_holds_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_holds" ADD CONSTRAINT "pay_holds_obligation_id_pay_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."pay_obligations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_holds" ADD CONSTRAINT "pay_holds_placed_by_person_id_people_id_fk" FOREIGN KEY ("placed_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_holds" ADD CONSTRAINT "pay_holds_ledger_journal_id_ledger_journals_id_fk" FOREIGN KEY ("ledger_journal_id") REFERENCES "public"."ledger_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_obligation_refunds" ADD CONSTRAINT "pay_obligation_refunds_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_obligation_refunds" ADD CONSTRAINT "pay_obligation_refunds_obligation_id_pay_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."pay_obligations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_obligation_refunds" ADD CONSTRAINT "pay_obligation_refunds_refund_record_id_refund_records_id_fk" FOREIGN KEY ("refund_record_id") REFERENCES "public"."refund_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_obligation_refunds" ADD CONSTRAINT "pay_obligation_refunds_ledger_journal_id_ledger_journals_id_fk" FOREIGN KEY ("ledger_journal_id") REFERENCES "public"."ledger_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_obligations" ADD CONSTRAINT "pay_obligations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_obligations" ADD CONSTRAINT "pay_obligations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_obligations" ADD CONSTRAINT "pay_obligations_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_obligations" ADD CONSTRAINT "pay_obligations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_obligations" ADD CONSTRAINT "pay_obligations_fund_schedule_id_payment_fund_schedules_id_fk" FOREIGN KEY ("fund_schedule_id") REFERENCES "public"."payment_fund_schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_obligations" ADD CONSTRAINT "pay_obligations_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_recoveries" ADD CONSTRAINT "pay_recoveries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_recoveries" ADD CONSTRAINT "pay_recoveries_ledger_journal_id_ledger_journals_id_fk" FOREIGN KEY ("ledger_journal_id") REFERENCES "public"."ledger_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_release_tranches" ADD CONSTRAINT "pay_release_tranches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_release_tranches" ADD CONSTRAINT "pay_release_tranches_obligation_id_pay_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."pay_obligations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_release_tranches" ADD CONSTRAINT "pay_release_tranches_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_release_tranches" ADD CONSTRAINT "pay_release_tranches_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_release_tranches" ADD CONSTRAINT "pay_release_tranches_ledger_journal_id_ledger_journals_id_fk" FOREIGN KEY ("ledger_journal_id") REFERENCES "public"."ledger_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_reserves" ADD CONSTRAINT "pay_reserves_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_reserves" ADD CONSTRAINT "pay_reserves_decided_by_person_id_people_id_fk" FOREIGN KEY ("decided_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_availability_schedules" ADD CONSTRAINT "staff_availability_schedules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_availability_schedules" ADD CONSTRAINT "staff_availability_schedules_staff_profile_id_organization_staff_profiles_id_fk" FOREIGN KEY ("staff_profile_id") REFERENCES "public"."organization_staff_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_availability_schedules" ADD CONSTRAINT "staff_availability_schedules_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_availability_windows" ADD CONSTRAINT "staff_availability_windows_schedule_id_staff_availability_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."staff_availability_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_availability_windows" ADD CONSTRAINT "staff_availability_windows_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_blackouts" ADD CONSTRAINT "staff_blackouts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_blackouts" ADD CONSTRAINT "staff_blackouts_staff_profile_id_organization_staff_profiles_id_fk" FOREIGN KEY ("staff_profile_id") REFERENCES "public"."organization_staff_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_blackouts" ADD CONSTRAINT "staff_blackouts_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_coverage_offers" ADD CONSTRAINT "staff_coverage_offers_request_id_staff_coverage_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."staff_coverage_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_coverage_offers" ADD CONSTRAINT "staff_coverage_offers_staff_profile_id_organization_staff_profiles_id_fk" FOREIGN KEY ("staff_profile_id") REFERENCES "public"."organization_staff_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_coverage_requests" ADD CONSTRAINT "staff_coverage_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_coverage_requests" ADD CONSTRAINT "staff_coverage_requests_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_coverage_requests" ADD CONSTRAINT "staff_coverage_requests_training_event_id_training_events_id_fk" FOREIGN KEY ("training_event_id") REFERENCES "public"."training_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_coverage_requests" ADD CONSTRAINT "staff_coverage_requests_original_staff_profile_id_organization_staff_profiles_id_fk" FOREIGN KEY ("original_staff_profile_id") REFERENCES "public"."organization_staff_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_coverage_requests" ADD CONSTRAINT "staff_coverage_requests_time_off_id_staff_time_off_id_fk" FOREIGN KEY ("time_off_id") REFERENCES "public"."staff_time_off"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_coverage_requests" ADD CONSTRAINT "staff_coverage_requests_blackout_id_staff_blackouts_id_fk" FOREIGN KEY ("blackout_id") REFERENCES "public"."staff_blackouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_coverage_requests" ADD CONSTRAINT "staff_coverage_requests_covered_by_staff_profile_id_organization_staff_profiles_id_fk" FOREIGN KEY ("covered_by_staff_profile_id") REFERENCES "public"."organization_staff_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_coverage_requests" ADD CONSTRAINT "staff_coverage_requests_resolved_by_person_id_people_id_fk" FOREIGN KEY ("resolved_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_staff_profile_id_organization_staff_profiles_id_fk" FOREIGN KEY ("staff_profile_id") REFERENCES "public"."organization_staff_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_requested_by_person_id_people_id_fk" FOREIGN KEY ("requested_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_decided_by_person_id_people_id_fk" FOREIGN KEY ("decided_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_compensation" ADD CONSTRAINT "staff_compensation_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_compensation" ADD CONSTRAINT "staff_compensation_staff_profile_id_organization_staff_profiles_id_fk" FOREIGN KEY ("staff_profile_id") REFERENCES "public"."organization_staff_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_compensation" ADD CONSTRAINT "staff_compensation_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_pay_exports" ADD CONSTRAINT "staff_pay_exports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_pay_exports" ADD CONSTRAINT "staff_pay_exports_pay_run_id_staff_pay_runs_id_fk" FOREIGN KEY ("pay_run_id") REFERENCES "public"."staff_pay_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_pay_exports" ADD CONSTRAINT "staff_pay_exports_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_pay_periods" ADD CONSTRAINT "staff_pay_periods_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_pay_run_lines" ADD CONSTRAINT "staff_pay_run_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_pay_run_lines" ADD CONSTRAINT "staff_pay_run_lines_pay_run_id_staff_pay_runs_id_fk" FOREIGN KEY ("pay_run_id") REFERENCES "public"."staff_pay_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_pay_run_lines" ADD CONSTRAINT "staff_pay_run_lines_staff_profile_id_organization_staff_profiles_id_fk" FOREIGN KEY ("staff_profile_id") REFERENCES "public"."organization_staff_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_pay_run_lines" ADD CONSTRAINT "staff_pay_run_lines_compensation_id_staff_compensation_id_fk" FOREIGN KEY ("compensation_id") REFERENCES "public"."staff_compensation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_pay_runs" ADD CONSTRAINT "staff_pay_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_pay_runs" ADD CONSTRAINT "staff_pay_runs_pay_period_id_staff_pay_periods_id_fk" FOREIGN KEY ("pay_period_id") REFERENCES "public"."staff_pay_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_pay_runs" ADD CONSTRAINT "staff_pay_runs_approved_by_person_id_people_id_fk" FOREIGN KEY ("approved_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_connected_accounts" ADD CONSTRAINT "staff_connected_accounts_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_connected_accounts" ADD CONSTRAINT "staff_connected_accounts_invited_by_organization_id_organizations_id_fk" FOREIGN KEY ("invited_by_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_contractor_payouts" ADD CONSTRAINT "staff_contractor_payouts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_contractor_payouts" ADD CONSTRAINT "staff_contractor_payouts_staff_profile_id_organization_staff_profiles_id_fk" FOREIGN KEY ("staff_profile_id") REFERENCES "public"."organization_staff_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_contractor_payouts" ADD CONSTRAINT "staff_contractor_payouts_pay_run_line_id_staff_pay_run_lines_id_fk" FOREIGN KEY ("pay_run_line_id") REFERENCES "public"."staff_pay_run_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_contractor_payouts" ADD CONSTRAINT "staff_contractor_payouts_connected_account_id_staff_connected_accounts_id_fk" FOREIGN KEY ("connected_account_id") REFERENCES "public"."staff_connected_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_contractor_payouts" ADD CONSTRAINT "staff_contractor_payouts_initiated_by_person_id_people_id_fk" FOREIGN KEY ("initiated_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_contractor_payouts" ADD CONSTRAINT "staff_contractor_payouts_ledger_journal_id_ledger_journals_id_fk" FOREIGN KEY ("ledger_journal_id") REFERENCES "public"."ledger_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_event_coaches" ADD CONSTRAINT "training_event_coaches_training_event_id_training_events_id_fk" FOREIGN KEY ("training_event_id") REFERENCES "public"."training_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_event_coaches" ADD CONSTRAINT "training_event_coaches_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_event_coaches" ADD CONSTRAINT "training_event_coaches_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_program_coaches" ADD CONSTRAINT "training_program_coaches_program_id_training_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."training_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_program_coaches" ADD CONSTRAINT "training_program_coaches_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_program_date_exceptions" ADD CONSTRAINT "training_program_date_exceptions_program_id_training_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."training_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_program_date_exceptions" ADD CONSTRAINT "training_program_date_exceptions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_program_weekly_slots" ADD CONSTRAINT "training_program_weekly_slots_program_id_training_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."training_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_program_weekly_slots" ADD CONSTRAINT "training_program_weekly_slots_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_program_weeks" ADD CONSTRAINT "training_program_weeks_program_id_training_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."training_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_drill_listings" ADD CONSTRAINT "training_drill_listings_drill_id_training_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."training_drills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_drill_listings" ADD CONSTRAINT "training_drill_listings_drill_version_id_training_drill_versions_id_fk" FOREIGN KEY ("drill_version_id") REFERENCES "public"."training_drill_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_drill_listings" ADD CONSTRAINT "training_drill_listings_seller_organization_id_organizations_id_fk" FOREIGN KEY ("seller_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_drill_listings" ADD CONSTRAINT "training_drill_listings_seller_person_id_people_id_fk" FOREIGN KEY ("seller_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_drill_purchases" ADD CONSTRAINT "training_drill_purchases_listing_id_training_drill_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."training_drill_listings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_drill_purchases" ADD CONSTRAINT "training_drill_purchases_buyer_organization_id_organizations_id_fk" FOREIGN KEY ("buyer_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_drill_purchases" ADD CONSTRAINT "training_drill_purchases_buyer_person_id_people_id_fk" FOREIGN KEY ("buyer_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_drill_purchases" ADD CONSTRAINT "training_drill_purchases_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_drill_purchases" ADD CONSTRAINT "training_drill_purchases_license_id_training_drill_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."training_drill_licenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_drill_purchases" ADD CONSTRAINT "training_drill_purchases_purchased_by_person_id_people_id_fk" FOREIGN KEY ("purchased_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_drill_review_checks" ADD CONSTRAINT "training_drill_review_checks_drill_version_id_training_drill_versions_id_fk" FOREIGN KEY ("drill_version_id") REFERENCES "public"."training_drill_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_drill_review_checks" ADD CONSTRAINT "training_drill_review_checks_reviewer_person_id_people_id_fk" FOREIGN KEY ("reviewer_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_drill_scenes" ADD CONSTRAINT "training_drill_scenes_drill_version_id_training_drill_versions_id_fk" FOREIGN KEY ("drill_version_id") REFERENCES "public"."training_drill_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_drill_scenes" ADD CONSTRAINT "training_drill_scenes_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_scene_ai_runs" ADD CONSTRAINT "training_scene_ai_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_scene_ai_runs" ADD CONSTRAINT "training_scene_ai_runs_drill_id_training_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."training_drills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_scene_ai_runs" ADD CONSTRAINT "training_scene_ai_runs_requested_by_person_id_people_id_fk" FOREIGN KEY ("requested_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_scene_ai_runs" ADD CONSTRAINT "training_scene_ai_runs_result_scene_id_training_drill_scenes_id_fk" FOREIGN KEY ("result_scene_id") REFERENCES "public"."training_drill_scenes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concierge_deliveries" ADD CONSTRAINT "concierge_deliveries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concierge_deliveries" ADD CONSTRAINT "concierge_deliveries_proposal_id_concierge_send_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."concierge_send_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concierge_deliveries" ADD CONSTRAINT "concierge_deliveries_recipient_id_concierge_send_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."concierge_send_recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concierge_deliveries" ADD CONSTRAINT "concierge_deliveries_message_id_conversation_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concierge_deliveries" ADD CONSTRAINT "concierge_deliveries_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concierge_send_proposals" ADD CONSTRAINT "concierge_send_proposals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concierge_send_proposals" ADD CONSTRAINT "concierge_send_proposals_conversation_id_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concierge_send_proposals" ADD CONSTRAINT "concierge_send_proposals_author_person_id_people_id_fk" FOREIGN KEY ("author_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concierge_send_proposals" ADD CONSTRAINT "concierge_send_proposals_confirmed_by_person_id_people_id_fk" FOREIGN KEY ("confirmed_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concierge_send_proposals" ADD CONSTRAINT "concierge_send_proposals_message_id_conversation_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concierge_send_recipients" ADD CONSTRAINT "concierge_send_recipients_proposal_id_concierge_send_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."concierge_send_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concierge_send_recipients" ADD CONSTRAINT "concierge_send_recipients_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concierge_send_recipients" ADD CONSTRAINT "concierge_send_recipients_guardian_of_person_id_people_id_fk" FOREIGN KEY ("guardian_of_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_channel_endpoints" ADD CONSTRAINT "person_channel_endpoints_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_channel_preferences" ADD CONSTRAINT "person_channel_preferences_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_change_checks" ADD CONSTRAINT "website_change_checks_change_id_website_changes_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."website_changes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_change_jobs" ADD CONSTRAINT "website_change_jobs_change_id_website_changes_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."website_changes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_change_messages" ADD CONSTRAINT "website_change_messages_change_id_website_changes_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."website_changes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_change_messages" ADD CONSTRAINT "website_change_messages_author_person_id_people_id_fk" FOREIGN KEY ("author_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_change_pages" ADD CONSTRAINT "website_change_pages_change_id_website_changes_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."website_changes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_change_pages" ADD CONSTRAINT "website_change_pages_page_id_website_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."website_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_changes" ADD CONSTRAINT "website_changes_site_id_club_websites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."club_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_changes" ADD CONSTRAINT "website_changes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_changes" ADD CONSTRAINT "website_changes_asked_by_person_id_people_id_fk" FOREIGN KEY ("asked_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_changes" ADD CONSTRAINT "website_changes_base_revision_id_website_revisions_id_fk" FOREIGN KEY ("base_revision_id") REFERENCES "public"."website_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_changes" ADD CONSTRAINT "website_changes_preview_revision_id_website_revisions_id_fk" FOREIGN KEY ("preview_revision_id") REFERENCES "public"."website_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_pages" ADD CONSTRAINT "website_pages_site_id_club_websites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."club_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_pages" ADD CONSTRAINT "website_pages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_publish_events" ADD CONSTRAINT "website_publish_events_site_id_club_websites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."club_websites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_publish_events" ADD CONSTRAINT "website_publish_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_publish_events" ADD CONSTRAINT "website_publish_events_change_id_website_changes_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."website_changes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_publish_events" ADD CONSTRAINT "website_publish_events_revision_id_website_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."website_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_publish_events" ADD CONSTRAINT "website_publish_events_actor_person_id_people_id_fk" FOREIGN KEY ("actor_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_site_starts" ADD CONSTRAINT "website_site_starts_site_id_club_websites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."club_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_site_starts" ADD CONSTRAINT "website_site_starts_template_id_website_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."website_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_site_starts" ADD CONSTRAINT "website_site_starts_started_by_person_id_people_id_fk" FOREIGN KEY ("started_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_play_stops" ADD CONSTRAINT "court_play_stops_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_play_stops" ADD CONSTRAINT "court_play_stops_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_play_stops" ADD CONSTRAINT "court_play_stops_started_by_person_id_people_id_fk" FOREIGN KEY ("started_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_play_stops" ADD CONSTRAINT "court_play_stops_lifted_by_person_id_people_id_fk" FOREIGN KEY ("lifted_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_access_requests" ADD CONSTRAINT "facility_access_requests_listing_id_facility_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."facility_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_access_requests" ADD CONSTRAINT "facility_access_requests_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_access_requests" ADD CONSTRAINT "facility_access_requests_guardian_person_id_people_id_fk" FOREIGN KEY ("guardian_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_access_requests" ADD CONSTRAINT "facility_access_requests_waiver_execution_id_waiver_executions_id_fk" FOREIGN KEY ("waiver_execution_id") REFERENCES "public"."waiver_executions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_access_requests" ADD CONSTRAINT "facility_access_requests_decided_by_person_id_people_id_fk" FOREIGN KEY ("decided_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_access_rules" ADD CONSTRAINT "facility_access_rules_listing_id_facility_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."facility_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_listings" ADD CONSTRAINT "facility_listings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_listings" ADD CONSTRAINT "facility_listings_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_listings" ADD CONSTRAINT "facility_listings_waiver_document_id_waiver_documents_id_fk" FOREIGN KEY ("waiver_document_id") REFERENCES "public"."waiver_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_documents" ADD CONSTRAINT "search_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conditions_hourly" ADD CONSTRAINT "conditions_hourly_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "premium_subscription_events" ADD CONSTRAINT "premium_subscription_events_subscription_id_premium_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."premium_subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "premium_subscriptions" ADD CONSTRAINT "premium_subscriptions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_consents" ADD CONSTRAINT "household_consents_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_consents" ADD CONSTRAINT "household_consents_guardian_person_id_people_id_fk" FOREIGN KEY ("guardian_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_consents" ADD CONSTRAINT "household_consents_child_person_id_people_id_fk" FOREIGN KEY ("child_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_consents" ADD CONSTRAINT "household_consents_legal_acceptance_id_legal_acceptances_id_fk" FOREIGN KEY ("legal_acceptance_id") REFERENCES "public"."legal_acceptances"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_invitations" ADD CONSTRAINT "household_invitations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_invitations" ADD CONSTRAINT "household_invitations_invited_by_person_id_people_id_fk" FOREIGN KEY ("invited_by_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_invitations" ADD CONSTRAINT "household_invitations_concerns_person_id_people_id_fk" FOREIGN KEY ("concerns_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_invitations" ADD CONSTRAINT "household_invitations_accepted_by_person_id_people_id_fk" FOREIGN KEY ("accepted_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_account_holder_person_id_people_id_fk" FOREIGN KEY ("account_holder_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "setup_proposal_run_category_idx" ON "setup_proposals" USING btree ("run_id","category");--> statement-breakpoint
CREATE INDEX "setup_proposal_org_decision_idx" ON "setup_proposals" USING btree ("organization_id","decision");--> statement-breakpoint
CREATE UNIQUE INDEX "setup_run_page_position_unique" ON "setup_run_pages" USING btree ("run_id","position");--> statement-breakpoint
CREATE INDEX "setup_run_org_created_idx" ON "setup_runs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "organization_pay_account_status_idx" ON "organization_pay_accounts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "pay_delivery_event_idempotency_unique" ON "pay_delivery_events" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "pay_delivery_event_obligation_idx" ON "pay_delivery_events" USING btree ("obligation_id","occurred_at");--> statement-breakpoint
CREATE INDEX "pay_dispute_case_org_status_idx" ON "pay_dispute_cases" USING btree ("organization_id","status","evidence_due_by");--> statement-breakpoint
CREATE INDEX "pay_fee_quote_order_idx" ON "pay_fee_quotes" USING btree ("order_id") WHERE "pay_fee_quotes"."order_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "pay_fee_quote_org_shown_idx" ON "pay_fee_quotes" USING btree ("organization_id","shown_at");--> statement-breakpoint
CREATE INDEX "pay_hold_org_status_idx" ON "pay_holds" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "pay_hold_obligation_idx" ON "pay_holds" USING btree ("obligation_id") WHERE "pay_holds"."obligation_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "pay_obligation_refund_obligation_idx" ON "pay_obligation_refunds" USING btree ("obligation_id");--> statement-breakpoint
CREATE INDEX "pay_obligation_refund_record_idx" ON "pay_obligation_refunds" USING btree ("refund_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pay_obligation_order_item_unique" ON "pay_obligations" USING btree ("order_item_id") WHERE "pay_obligations"."order_item_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "pay_obligation_org_status_idx" ON "pay_obligations" USING btree ("organization_id","status","delivery_ends_at");--> statement-breakpoint
CREATE INDEX "pay_obligation_order_idx" ON "pay_obligations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "pay_obligation_payment_idx" ON "pay_obligations" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "pay_recovery_org_status_idx" ON "pay_recoveries" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "pay_release_tranche_sequence_unique" ON "pay_release_tranches" USING btree ("obligation_id","sequence");--> statement-breakpoint
CREATE INDEX "pay_release_tranche_due_idx" ON "pay_release_tranches" USING btree ("organization_id","status","releasable_at");--> statement-breakpoint
CREATE INDEX "pay_release_tranche_session_idx" ON "pay_release_tranches" USING btree ("session_id") WHERE "pay_release_tranches"."session_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "pay_reserve_org_status_idx" ON "pay_reserves" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "staff_availability_schedule_staff_idx" ON "staff_availability_schedules" USING btree ("staff_profile_id","status","effective_from");--> statement-breakpoint
CREATE INDEX "staff_availability_schedule_org_idx" ON "staff_availability_schedules" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_availability_schedule_one_fallback" ON "staff_availability_schedules" USING btree ("staff_profile_id") WHERE "staff_availability_schedules"."status" = 'fallback';--> statement-breakpoint
CREATE INDEX "staff_availability_window_schedule_idx" ON "staff_availability_windows" USING btree ("schedule_id","weekday","starts_at");--> statement-breakpoint
CREATE INDEX "staff_blackout_staff_time_idx" ON "staff_blackouts" USING btree ("staff_profile_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "staff_blackout_org_time_idx" ON "staff_blackouts" USING btree ("organization_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_coverage_offer_unique" ON "staff_coverage_offers" USING btree ("request_id","staff_profile_id");--> statement-breakpoint
CREATE INDEX "staff_coverage_request_org_status_idx" ON "staff_coverage_requests" USING btree ("organization_id","status","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_coverage_request_session_open_unique" ON "staff_coverage_requests" USING btree ("session_id") WHERE "staff_coverage_requests"."session_id" IS NOT NULL AND "staff_coverage_requests"."status" IN ('open', 'asking');--> statement-breakpoint
CREATE UNIQUE INDEX "staff_coverage_request_training_open_unique" ON "staff_coverage_requests" USING btree ("training_event_id") WHERE "staff_coverage_requests"."training_event_id" IS NOT NULL AND "staff_coverage_requests"."status" IN ('open', 'asking');--> statement-breakpoint
CREATE INDEX "staff_time_off_staff_time_idx" ON "staff_time_off" USING btree ("staff_profile_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "staff_time_off_org_status_idx" ON "staff_time_off" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "staff_compensation_staff_idx" ON "staff_compensation" USING btree ("staff_profile_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_compensation_current_unique" ON "staff_compensation" USING btree ("staff_profile_id") WHERE "staff_compensation"."effective_to" IS NULL;--> statement-breakpoint
CREATE INDEX "staff_pay_export_run_idx" ON "staff_pay_exports" USING btree ("pay_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_pay_period_org_start_unique" ON "staff_pay_periods" USING btree ("organization_id","starts_on");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_pay_run_line_unique" ON "staff_pay_run_lines" USING btree ("pay_run_id","staff_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_pay_run_idempotency_unique" ON "staff_pay_runs" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_pay_run_period_revision_unique" ON "staff_pay_runs" USING btree ("pay_period_id","revision");--> statement-breakpoint
CREATE INDEX "staff_pay_run_org_status_idx" ON "staff_pay_runs" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_connected_account_person_unique" ON "staff_connected_accounts" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_contractor_payout_idempotency_unique" ON "staff_contractor_payouts" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_contractor_payout_line_active_unique" ON "staff_contractor_payouts" USING btree ("pay_run_line_id") WHERE "staff_contractor_payouts"."status" IN ('pending', 'processing', 'paid');--> statement-breakpoint
CREATE INDEX "staff_contractor_payout_org_status_idx" ON "staff_contractor_payouts" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "training_event_coach_person_idx" ON "training_event_coaches" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "training_program_coach_person_idx" ON "training_program_coaches" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "training_program_one_lead_unique" ON "training_program_coaches" USING btree ("program_id") WHERE "training_program_coaches"."role" = 'lead';--> statement-breakpoint
CREATE INDEX "training_program_exception_program_idx" ON "training_program_date_exceptions" USING btree ("program_id","starts_on");--> statement-breakpoint
CREATE INDEX "training_program_weekly_slot_program_idx" ON "training_program_weekly_slots" USING btree ("program_id","weekday");--> statement-breakpoint
CREATE UNIQUE INDEX "training_drill_listing_active_unique" ON "training_drill_listings" USING btree ("drill_id") WHERE "training_drill_listings"."status" IN ('draft', 'pending-review', 'listed');--> statement-breakpoint
CREATE INDEX "training_drill_listing_store_idx" ON "training_drill_listings" USING btree ("status","listed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "training_drill_purchase_org_unique" ON "training_drill_purchases" USING btree ("listing_id","buyer_organization_id") WHERE "training_drill_purchases"."buyer_organization_id" IS NOT NULL AND "training_drill_purchases"."status" IN ('pending', 'complete');--> statement-breakpoint
CREATE UNIQUE INDEX "training_drill_purchase_person_unique" ON "training_drill_purchases" USING btree ("listing_id","buyer_person_id") WHERE "training_drill_purchases"."buyer_person_id" IS NOT NULL AND "training_drill_purchases"."status" IN ('pending', 'complete');--> statement-breakpoint
CREATE INDEX "training_drill_purchase_buyer_org_idx" ON "training_drill_purchases" USING btree ("buyer_organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "training_drill_review_check_unique" ON "training_drill_review_checks" USING btree ("drill_version_id","kind");--> statement-breakpoint
CREATE INDEX "training_scene_ai_run_org_created_idx" ON "training_scene_ai_runs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "concierge_delivery_proposal_idx" ON "concierge_deliveries" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "concierge_delivery_person_idx" ON "concierge_deliveries" USING btree ("person_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "concierge_delivery_provider_handle_unique" ON "concierge_deliveries" USING btree ("channel","provider_message_handle") WHERE "concierge_deliveries"."provider_message_handle" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "concierge_send_proposal_conversation_idx" ON "concierge_send_proposals" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "concierge_send_proposal_org_status_idx" ON "concierge_send_proposals" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "concierge_send_recipient_unique" ON "concierge_send_recipients" USING btree ("proposal_id","person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "person_channel_endpoint_active_unique" ON "person_channel_endpoints" USING btree ("person_id","channel") WHERE "person_channel_endpoints"."status" <> 'revoked';--> statement-breakpoint
CREATE UNIQUE INDEX "website_change_check_unique" ON "website_change_checks" USING btree ("change_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "website_change_job_sequence_unique" ON "website_change_jobs" USING btree ("change_id","sequence");--> statement-breakpoint
CREATE INDEX "website_change_job_status_idx" ON "website_change_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "website_change_message_change_idx" ON "website_change_messages" USING btree ("change_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "website_change_site_number_unique" ON "website_changes" USING btree ("site_id","number");--> statement-breakpoint
CREATE INDEX "website_change_org_status_idx" ON "website_changes" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "website_page_site_path_unique" ON "website_pages" USING btree ("site_id","path") WHERE "website_pages"."status" <> 'removed';--> statement-breakpoint
CREATE INDEX "website_page_parent_idx" ON "website_pages" USING btree ("site_id","parent_page_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "website_publish_event_site_version_unique" ON "website_publish_events" USING btree ("site_id","version");--> statement-breakpoint
CREATE INDEX "website_publish_event_change_idx" ON "website_publish_events" USING btree ("change_id");--> statement-breakpoint
CREATE INDEX "website_site_start_template_idx" ON "website_site_starts" USING btree ("template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "website_template_key_version_unique" ON "website_templates" USING btree ("key","version");--> statement-breakpoint
CREATE INDEX "court_play_stop_venue_active_idx" ON "court_play_stops" USING btree ("venue_id","status","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "facility_access_request_open_unique" ON "facility_access_requests" USING btree ("listing_id","person_id") WHERE "facility_access_requests"."status" IN ('requested', 'approved');--> statement-breakpoint
CREATE INDEX "facility_access_request_listing_status_idx" ON "facility_access_requests" USING btree ("listing_id","status");--> statement-breakpoint
CREATE INDEX "facility_access_rule_listing_idx" ON "facility_access_rules" USING btree ("listing_id","status","priority");--> statement-breakpoint
CREATE INDEX "facility_listing_org_status_idx" ON "facility_listings" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "search_document_entity_unique" ON "search_documents" USING btree ("kind","entity_id");--> statement-breakpoint
CREATE INDEX "search_document_geo_idx" ON "search_documents" USING btree ("latitude","longitude") WHERE "search_documents"."visibility" = 'public';--> statement-breakpoint
CREATE INDEX "search_document_when_idx" ON "search_documents" USING btree ("kind","starts_at") WHERE "search_documents"."visibility" = 'public';--> statement-breakpoint
CREATE INDEX "search_document_tags_idx" ON "search_documents" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "search_document_text_idx" ON "search_documents" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "search_document_org_idx" ON "search_documents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "conditions_hourly_expires_idx" ON "conditions_hourly" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "premium_subscription_event_sub_idx" ON "premium_subscription_events" USING btree ("subscription_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "premium_subscription_event_store_ref_unique" ON "premium_subscription_events" USING btree ("subscription_id","store_event_ref") WHERE "premium_subscription_events"."store_event_ref" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "premium_subscription_store_ref_unique" ON "premium_subscriptions" USING btree ("store","store_subscription_ref");--> statement-breakpoint
CREATE INDEX "premium_subscription_person_status_idx" ON "premium_subscriptions" USING btree ("person_id","status");--> statement-breakpoint
CREATE INDEX "premium_subscription_renewal_idx" ON "premium_subscriptions" USING btree ("status","current_period_ends_at");--> statement-breakpoint
CREATE INDEX "household_consent_child_kind_idx" ON "household_consents" USING btree ("child_person_id","kind","occurred_at");--> statement-breakpoint
CREATE INDEX "household_consent_guardian_idx" ON "household_consents" USING btree ("guardian_person_id","occurred_at");--> statement-breakpoint
CREATE INDEX "household_invitation_household_status_idx" ON "household_invitations" USING btree ("household_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "household_member_active_unique" ON "household_members" USING btree ("household_id","person_id") WHERE "household_members"."status" = 'active';--> statement-breakpoint
CREATE INDEX "household_member_person_idx" ON "household_members" USING btree ("person_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_document_version_unique" ON "legal_document_versions" USING btree ("document_key","version");--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_on_behalf_of_person_id_people_id_fk" FOREIGN KEY ("on_behalf_of_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_document_version_id_legal_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."legal_document_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_drills" ADD CONSTRAINT "training_drills_owner_person_id_people_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_events" ADD CONSTRAINT "training_events_cancelled_by_person_id_people_id_fk" FOREIGN KEY ("cancelled_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legal_acceptance_on_behalf_idx" ON "legal_acceptances" USING btree ("on_behalf_of_person_id","document_key","accepted_at") WHERE "legal_acceptances"."on_behalf_of_person_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "courts" ADD CONSTRAINT "court_orientation_valid" CHECK ("courts"."orientation_deg" IS NULL OR "courts"."orientation_deg" BETWEEN 0 AND 179);--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptance_document_key_format" CHECK ("legal_acceptances"."document_key" ~ '^[a-z0-9][a-z0-9-]{1,47}$');--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptance_accepted_as_valid" CHECK ("legal_acceptances"."accepted_as" IN ('self', 'guardian', 'organization-authority'));--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptance_surface_valid" CHECK ("legal_acceptances"."surface" IS NULL OR "legal_acceptances"."surface" IN ('web-sign-up', 'web-checkout', 'web-settings', 'player-app', 'pro-app', 'hq-onboarding', 'hq-settings', 'guardian-flow', 'admin-import'));--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptance_on_behalf_shape" CHECK (("legal_acceptances"."accepted_as" = 'guardian') = ("legal_acceptances"."on_behalf_of_person_id" IS NOT NULL) AND ("legal_acceptances"."accepted_as" <> 'organization-authority' OR "legal_acceptances"."organization_id" IS NOT NULL) AND ("legal_acceptances"."on_behalf_of_person_id" IS NULL OR "legal_acceptances"."on_behalf_of_person_id" <> "legal_acceptances"."person_id"));--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptance_document_hash_valid" CHECK ("legal_acceptances"."document_hash" IS NULL OR "legal_acceptances"."document_hash" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "training_drills" ADD CONSTRAINT "training_drill_scope_valid" CHECK ("training_drills"."scope" IN ('personal', 'club', 'duna'));--> statement-breakpoint
ALTER TABLE "training_drills" ADD CONSTRAINT "training_drill_scope_owner_shape" CHECK (("training_drills"."scope" = 'personal') = ("training_drills"."owner_person_id" IS NOT NULL) AND ("training_drills"."scope" <> 'duna' OR "training_drills"."organization_id" IS NULL));--> statement-breakpoint
ALTER TABLE "training_drills" ADD CONSTRAINT "training_drill_review_state_valid" CHECK ("training_drills"."review_state" IN ('not-submitted', 'checks-running', 'in-review', 'changes-requested', 'approved', 'rejected'));--> statement-breakpoint
ALTER TABLE "training_events" ADD CONSTRAINT "training_event_load_source_valid" CHECK ("training_events"."load_estimate_source" IN ('assumed', 'coach-edited', 'derived-from-scene'));--> statement-breakpoint
ALTER TABLE "training_events" ADD CONSTRAINT "training_event_estimates_valid" CHECK (coalesce("training_events"."estimated_touches", 0) >= 0 AND coalesce("training_events"."estimated_jumps", 0) >= 0);--> statement-breakpoint
ALTER TABLE "training_events" ADD CONSTRAINT "training_event_cancelled_shape" CHECK ("training_events"."cancelled_at" IS NULL OR "training_events"."status" = 'cancelled');--> statement-breakpoint
ALTER TABLE "training_practice_plan_blocks" ADD CONSTRAINT "training_plan_block_estimate_source_valid" CHECK ("training_practice_plan_blocks"."estimate_source" IN ('assumed', 'coach-edited', 'derived-from-scene'));--> statement-breakpoint
ALTER TABLE "training_practice_plan_blocks" ADD CONSTRAINT "training_plan_block_estimates_valid" CHECK (coalesce("training_practice_plan_blocks"."estimated_touches", 0) >= 0 AND coalesce("training_practice_plan_blocks"."estimated_jumps", 0) >= 0 AND coalesce("training_practice_plan_blocks"."estimated_metres", 0) >= 0);--> statement-breakpoint
ALTER TABLE "training_practice_plans" ADD CONSTRAINT "training_plan_target_load_valid" CHECK ("training_practice_plans"."target_load" IS NULL OR "training_practice_plans"."target_load" BETWEEN 0 AND 100);--> statement-breakpoint
ALTER TABLE "training_programs" ADD CONSTRAINT "training_program_cancelled_shape" CHECK ("training_programs"."cancelled_at" IS NULL OR "training_programs"."status" = 'archived');--> statement-breakpoint
-- W3-0 (hand-written, after the generated statements): append-only guards
-- reuse duna_prevent_append_only_mutation() from 0029.
CREATE TRIGGER "pay_delivery_event_append_only"
BEFORE UPDATE OR DELETE ON "pay_delivery_events"
FOR EACH ROW EXECUTE FUNCTION duna_prevent_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER "premium_subscription_event_append_only"
BEFORE UPDATE OR DELETE ON "premium_subscription_events"
FOR EACH ROW EXECUTE FUNCTION duna_prevent_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER "household_consent_append_only"
BEFORE UPDATE OR DELETE ON "household_consents"
FOR EACH ROW EXECUTE FUNCTION duna_prevent_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER "website_publish_event_append_only"
BEFORE UPDATE OR DELETE ON "website_publish_events"
FOR EACH ROW EXECUTE FUNCTION duna_prevent_append_only_mutation();
--> statement-breakpoint
-- Duna-curated drills (no organisation) belong to the Duna library scope.
UPDATE "training_drills" SET "scope" = 'duna' WHERE "organization_id" IS NULL;
