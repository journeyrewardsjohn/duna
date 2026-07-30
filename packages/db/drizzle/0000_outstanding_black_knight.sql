CREATE TYPE "public"."availability_mode" AS ENUM('open', 'private-lessons-only', 'group-only', 'league-reserved', 'rentals-only', 'members-only', 'maintenance', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."rating_confidence" AS ENUM('Provisional', 'Developing', 'Reliable', 'Locked');--> statement-breakpoint
CREATE TYPE "public"."consent_scope" AS ENUM('transactional', 'marketing-email', 'marketing-sms', 'marketing-push');--> statement-breakpoint
CREATE TYPE "public"."discipline" AS ENUM('beach-2s', 'beach-4s', 'beach-6s', 'grass', 'indoor');--> statement-breakpoint
CREATE TYPE "public"."event_kind" AS ENUM('tournament', 'league', 'clinic', 'open-play', 'private-lesson', 'court-rental', 'pickup');--> statement-breakpoint
CREATE TYPE "public"."ledger_direction" AS ENUM('credit', 'debit');--> statement-breakpoint
CREATE TYPE "public"."ledger_status" AS ENUM('pending', 'available', 'complete', 'held', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('scheduled', 'warmup', 'live', 'pending-verification', 'verified', 'disputed', 'complete', 'forfeit', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."match_verification" AS ENUM('live-scored', 'desk', 'both-confirmed', 'auto-accepted', 'self-reported', 'imported-professional', 'imported-amateur', 'group-confirmed');--> statement-breakpoint
CREATE TYPE "public"."message_channel" AS ENUM('email', 'sms', 'push', 'in-app');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('draft', 'pending', 'paid', 'partially-refunded', 'refunded', 'failed', 'disputed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."org_role" AS ENUM('owner', 'manager', 'coach', 'front-desk', 'scorekeeper', 'accountant');--> statement-breakpoint
CREATE TYPE "public"."person_status" AS ENUM('active', 'restricted', 'suspended', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."queue_status" AS ENUM('open', 'triaged', 'investigating', 'held', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."registration_status" AS ENUM('pending', 'confirmed', 'waitlisted', 'cancelled', 'refunded', 'checked-in');--> statement-breakpoint
CREATE TYPE "public"."agent_risk_tier" AS ENUM('read', 'propose', 'confirm-always');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('draft', 'published', 'registration-open', 'live', 'weather-hold', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."tax_character" AS ENUM('none', 'prize', 'contractor', 'affiliate', 'refund');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('held', 'issued', 'transferred', 'scanned', 'void', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."venue_status" AS ENUM('draft', 'active', 'maintenance', 'seasonal', 'closed');--> statement-breakpoint
CREATE TYPE "public"."wallet_entry_kind" AS ENUM('load', 'booking', 'refund', 'prize', 'coach-earning', 'withdrawal', 'affiliate', 'adjustment', 'chargeback');--> statement-breakpoint
CREATE TABLE "admin_roles" (
	"person_id" uuid NOT NULL,
	"role" varchar(24) NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"granted_by_person_id" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_roles_person_id_role_pk" PRIMARY KEY("person_id","role")
);
--> statement-breakpoint
CREATE TABLE "affiliate_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"affiliate_person_id" uuid,
	"public" boolean DEFAULT false NOT NULL,
	"commission_type" varchar(16) NOT NULL,
	"commission_value" integer NOT NULL,
	"token" varchar(96) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_offers_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "agent_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"organization_id" uuid,
	"conversation_id" varchar(128) NOT NULL,
	"tool_name" varchar(128) NOT NULL,
	"risk_tier" "agent_risk_tier" NOT NULL,
	"input" jsonb NOT NULL,
	"proposed_diff" jsonb NOT NULL,
	"status" varchar(24) DEFAULT 'proposed' NOT NULL,
	"confirmed_by_person_id" uuid,
	"confirmed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applied_fees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"rule_id" varchar(64) NOT NULL,
	"payer" varchar(24) NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"rule_inputs" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"actor_person_id" uuid,
	"actor_type" varchar(24) NOT NULL,
	"action" varchar(96) NOT NULL,
	"entity_type" varchar(48) NOT NULL,
	"entity_id" text NOT NULL,
	"before_hash" varchar(128),
	"after_hash" varchar(128),
	"reason" text NOT NULL,
	"trace_id" varchar(128),
	"conversation_id" varchar(128),
	"ip_address" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brackets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"format" varchar(48) NOT NULL,
	"structure" jsonb NOT NULL,
	"live_at" timestamp with time zone,
	"supersedes_bracket_id" uuid,
	"change_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"scope" "consent_scope" NOT NULL,
	"granted" boolean NOT NULL,
	"disclosure_text" text NOT NULL,
	"disclosure_text_hash" varchar(128) NOT NULL,
	"ip_address" varchar(64),
	"user_agent" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"name" text NOT NULL,
	"surface" varchar(32) DEFAULT 'sand' NOT NULL,
	"lit" boolean DEFAULT false NOT NULL,
	"status" "venue_status" DEFAULT 'active' NOT NULL,
	"booking_policy" varchar(32) DEFAULT 'public' NOT NULL,
	"minimum_duration_minutes" integer DEFAULT 30 NOT NULL,
	"maximum_duration_minutes" integer DEFAULT 120 NOT NULL,
	"buffer_before_minutes" integer DEFAULT 0 NOT NULL,
	"buffer_after_minutes" integer DEFAULT 0 NOT NULL,
	"qr_token" varchar(96) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courts_qr_token_unique" UNIQUE("qr_token"),
	CONSTRAINT "court_duration_valid" CHECK ("courts"."minimum_duration_minutes" > 0 AND "courts"."maximum_duration_minutes" >= "courts"."minimum_duration_minutes")
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"package_id" uuid,
	"direction" "ledger_direction" NOT NULL,
	"credits" integer NOT NULL,
	"reason_code" varchar(48) NOT NULL,
	"reference_id" uuid,
	"expires_at" timestamp with time zone,
	"actor_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_ledger_positive" CHECK ("credit_ledger"."credits" > 0)
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"order_id" uuid,
	"stripe_dispute_id" varchar(128),
	"kind" varchar(32) NOT NULL,
	"status" "queue_status" DEFAULT 'open' NOT NULL,
	"amount_minor" integer,
	"currency" varchar(3),
	"evidence" jsonb NOT NULL,
	"due_at" timestamp with time zone,
	"assigned_to_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disputes_stripe_dispute_id_unique" UNIQUE("stripe_dispute_id")
);
--> statement-breakpoint
CREATE TABLE "divisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"name" text NOT NULL,
	"discipline" "discipline" NOT NULL,
	"eligibility_rule_id" uuid,
	"rating_basis" varchar(24) DEFAULT 'anti-sandbag' NOT NULL,
	"capacity" integer NOT NULL,
	"entry_fee_minor" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eligibility_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"tree" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" "event_kind" NOT NULL,
	"duration_minutes" integer NOT NULL,
	"capacity" integer NOT NULL,
	"minimum_capacity" integer DEFAULT 1 NOT NULL,
	"price_minor" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"package_credit_cost" integer,
	"schedule_id" uuid,
	"rate_plan_id" uuid,
	"eligibility_rule_id" uuid,
	"cancellation_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(96) NOT NULL,
	"organization_id" uuid,
	"market" varchar(96),
	"enabled" boolean DEFAULT false NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"follower_person_id" uuid NOT NULL,
	"entity_type" varchar(24) NOT NULL,
	"entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_person_id_entity_type_entity_id_pk" PRIMARY KEY("follower_person_id","entity_type","entity_id")
);
--> statement-breakpoint
CREATE TABLE "form_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"form_version" integer NOT NULL,
	"person_id" uuid NOT NULL,
	"subject_person_id" uuid NOT NULL,
	"answers" jsonb NOT NULL,
	"signed_by_person_id" uuid,
	"signature_text_hash" varchar(128),
	"signed_at" timestamp with time zone,
	"ip_address" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"schema" jsonb NOT NULL,
	"document_text" text,
	"document_text_hash" varchar(128),
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guardianships" (
	"guardian_id" uuid NOT NULL,
	"minor_id" uuid NOT NULL,
	"relationship" varchar(48) NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"emergency_contact" boolean DEFAULT true NOT NULL,
	"can_approve_spending" boolean DEFAULT true NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardianships_guardian_id_minor_id_pk" PRIMARY KEY("guardian_id","minor_id"),
	CONSTRAINT "guardianship_distinct_people" CHECK ("guardianships"."guardian_id" <> "guardianships"."minor_id")
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(160) NOT NULL,
	"procedure" varchar(128) NOT NULL,
	"person_id" uuid,
	"organization_id" uuid,
	"request_hash" varchar(128) NOT NULL,
	"result_hash" varchar(128),
	"result" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"external_person_id" text NOT NULL,
	"person_id" uuid,
	"resolution_score_bps" integer,
	"resolution_state" varchar(24) DEFAULT 'unresolved' NOT NULL,
	"evidence" jsonb NOT NULL,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"license_status" varchar(24) DEFAULT 'pending' NOT NULL,
	"latest_snapshot_key" text,
	"latest_imported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_sources_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_id" uuid,
	"bracket_id" uuid,
	"team_a_id" uuid,
	"team_b_id" uuid,
	"venue_id" uuid,
	"court_id" uuid,
	"status" "match_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"format" jsonb NOT NULL,
	"assigned_scorekeeper_person_id" uuid,
	"authoritative_device_id" varchar(128),
	"verification" "match_verification",
	"verification_weight_bps" integer,
	"winner_team_id" uuid,
	"rating_eligible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_team_distinct" CHECK ("matches"."team_a_id" IS NULL OR "matches"."team_b_id" IS NULL OR "matches"."team_a_id" <> "matches"."team_b_id"),
	CONSTRAINT "match_verification_weight" CHECK ("matches"."verification_weight_bps" IS NULL OR "matches"."verification_weight_bps" BETWEEN 0 AND 10000)
);
--> statement-breakpoint
CREATE TABLE "membership_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"code" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"price_minor" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"interval" varchar(16) NOT NULL,
	"stripe_price_id" varchar(128),
	"benefits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"tier_id" uuid NOT NULL,
	"status" varchar(24) NOT NULL,
	"stripe_subscription_id" varchar(128),
	"current_period_starts_at" timestamp with time zone,
	"current_period_ends_at" timestamp with time zone,
	"paused_until" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"sender_person_id" uuid,
	"recipient_person_id" uuid NOT NULL,
	"guardian_copy_person_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"channel" "message_channel" NOT NULL,
	"kind" varchar(48) NOT NULL,
	"consent_id" uuid,
	"subject" text,
	"body" text NOT NULL,
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" varchar(32) NOT NULL,
	"reference_id" uuid,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_amount_minor" integer NOT NULL,
	"total_amount_minor" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"buyer_person_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'draft' NOT NULL,
	"currency" varchar(3) NOT NULL,
	"subtotal_minor" integer NOT NULL,
	"fee_total_minor" integer DEFAULT 0 NOT NULL,
	"tax_total_minor" integer DEFAULT 0 NOT NULL,
	"total_minor" integer NOT NULL,
	"wallet_applied_minor" integer DEFAULT 0 NOT NULL,
	"stripe_payment_intent_id" varchar(128),
	"idempotency_key" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id"),
	CONSTRAINT "orders_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "order_amounts_nonnegative" CHECK ("orders"."subtotal_minor" >= 0 AND "orders"."fee_total_minor" >= 0 AND "orders"."tax_total_minor" >= 0 AND "orders"."total_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "organization_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" "org_role" NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_organization_id" varchar(128),
	"slug" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"plan" varchar(24) DEFAULT 'coach' NOT NULL,
	"timezone" varchar(64) DEFAULT 'America/New_York' NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"country_code" varchar(2) DEFAULT 'US' NOT NULL,
	"stripe_account_id" varchar(128),
	"stripe_account_type" varchar(24),
	"stripe_charges_enabled" boolean DEFAULT false NOT NULL,
	"market_launch_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_clerk_organization_id_unique" UNIQUE("clerk_organization_id"),
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug"),
	CONSTRAINT "organization_currency_uppercase" CHECK ("organizations"."currency" = upper("organizations"."currency"))
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"credits" integer NOT NULL,
	"price_minor" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"expiry_days" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"method" varchar(32) NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"stripe_charge_id" varchar(128),
	"stripe_application_fee_id" varchar(128),
	"status" varchar(24) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_stripe_charge_id_unique" UNIQUE("stripe_charge_id")
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_account_id" uuid,
	"organization_id" uuid,
	"stripe_payout_id" varchar(128),
	"amount_minor" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" varchar(24) NOT NULL,
	"composition" jsonb NOT NULL,
	"expected_arrival_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_stripe_payout_id_unique" UNIQUE("stripe_payout_id")
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" varchar(128),
	"phone_e164" varchar(24),
	"email" text,
	"given_name" text,
	"family_name" text,
	"display_name" text NOT NULL,
	"handle" varchar(48) NOT NULL,
	"birth_date" date,
	"is_minor" boolean DEFAULT false NOT NULL,
	"parental_consent_at" timestamp with time zone,
	"profile_visibility" varchar(24) DEFAULT 'private' NOT NULL,
	"home_market" text,
	"locale" varchar(16) DEFAULT 'en-US' NOT NULL,
	"measurement_system" varchar(12) DEFAULT 'imperial' NOT NULL,
	"status" "person_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_clerk_user_id_unique" UNIQUE("clerk_user_id"),
	CONSTRAINT "people_phone_e164_unique" UNIQUE("phone_e164"),
	CONSTRAINT "people_handle_unique" UNIQUE("handle"),
	CONSTRAINT "people_minor_private_check" CHECK (NOT "people"."is_minor" OR "people"."profile_visibility" <> 'public')
);
--> statement-breakpoint
CREATE TABLE "pickup_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_person_id" uuid NOT NULL,
	"venue_id" uuid,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"capacity" integer NOT NULL,
	"rating_minimum" double precision,
	"rating_maximum" double precision,
	"visibility" varchar(24) DEFAULT 'public' NOT NULL,
	"cost_minor" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"author_person_id" uuid NOT NULL,
	"body" text NOT NULL,
	"media_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slug" varchar(80) NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"kind" "event_kind" NOT NULL,
	"status" "session_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promo_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" varchar(48) NOT NULL,
	"discount_type" varchar(16) NOT NULL,
	"discount_value" integer NOT NULL,
	"redemption_cap" integer,
	"redeemed_count" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_id" uuid NOT NULL,
	"allocation_bps" integer NOT NULL,
	"organizer_top_up_minor" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) NOT NULL,
	"payout_table" jsonb NOT NULL,
	"distributed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rally_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"device_id" varchar(128) NOT NULL,
	"monotonic_counter" integer NOT NULL,
	"event_type" varchar(48) NOT NULL,
	"payload" jsonb NOT NULL,
	"wall_clock_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"currency" varchar(3) NOT NULL,
	"base_amount_minor" integer NOT NULL,
	"member_amount_minor" integer,
	"non_member_amount_minor" integer,
	"dynamic_floor_minor" integer,
	"dynamic_ceiling_minor" integer,
	"daily_change_cap_bps" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rating_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"discipline" "discipline" NOT NULL,
	"sequence" integer NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"explanation" jsonb NOT NULL,
	"verification_weight_bps" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"person_id" uuid NOT NULL,
	"discipline" "discipline" NOT NULL,
	"mu" double precision NOT NULL,
	"phi" double precision NOT NULL,
	"sigma" double precision NOT NULL,
	"display" double precision NOT NULL,
	"confidence" "rating_confidence" NOT NULL,
	"current_52_week_peak" double precision NOT NULL,
	"rated_matches" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ratings_person_id_discipline_pk" PRIMARY KEY("person_id","discipline"),
	CONSTRAINT "rating_display_range" CHECK ("ratings"."display" BETWEEN 1 AND 8)
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"division_id" uuid,
	"person_id" uuid NOT NULL,
	"status" "registration_status" DEFAULT 'pending' NOT NULL,
	"eligibility_decision" jsonb NOT NULL,
	"eligibility_rule_version" integer,
	"overridden_by_person_id" uuid,
	"override_reason" text,
	"checked_in_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_person_id" uuid NOT NULL,
	"entity_type" varchar(24) NOT NULL,
	"entity_id" uuid NOT NULL,
	"category" varchar(48) NOT NULL,
	"details" text NOT NULL,
	"involves_minor" boolean DEFAULT false NOT NULL,
	"status" "queue_status" DEFAULT 'open' NOT NULL,
	"assigned_to_person_id" uuid,
	"sla_due_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"starts_at_minute" integer NOT NULL,
	"ends_at_minute" integer NOT NULL,
	"mode" "availability_mode" NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_block_weekday" CHECK ("schedule_blocks"."weekday" BETWEEN 0 AND 6),
	CONSTRAINT "schedule_block_time" CHECK ("schedule_blocks"."starts_at_minute" >= 0 AND "schedule_blocks"."ends_at_minute" <= 1440 AND "schedule_blocks"."ends_at_minute" > "schedule_blocks"."starts_at_minute")
);
--> statement-breakpoint
CREATE TABLE "schedule_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"mode" "availability_mode" NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_override_time" CHECK ("schedule_overrides"."ends_at" > "schedule_overrides"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"timezone" varchar(64) NOT NULL,
	"resource_type" varchar(24) NOT NULL,
	"resource_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid,
	"event_type_id" uuid,
	"venue_id" uuid,
	"court_id" uuid,
	"coach_person_id" uuid,
	"title" text NOT NULL,
	"slug" varchar(96) NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" varchar(64) NOT NULL,
	"status" "session_status" DEFAULT 'draft' NOT NULL,
	"capacity" integer NOT NULL,
	"minimum_capacity" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_slug_unique" UNIQUE("slug"),
	CONSTRAINT "session_time_valid" CHECK ("sessions"."ends_at" > "sessions"."starts_at"),
	CONSTRAINT "session_capacity_valid" CHECK ("sessions"."capacity" >= "sessions"."minimum_capacity" AND "sessions"."minimum_capacity" > 0)
);
--> statement-breakpoint
CREATE TABLE "team_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"paying_person_id" uuid NOT NULL,
	"partner_person_id" uuid,
	"claim_token" varchar(128) NOT NULL,
	"claim_expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"roster_locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_entries_claim_token_unique" UNIQUE("claim_token")
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" varchar(24) DEFAULT 'player' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_team_id_person_id_pk" PRIMARY KEY("team_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_id" uuid,
	"name" text NOT NULL,
	"seed" integer,
	"status" varchar(24) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(24) NOT NULL,
	"entity_id" uuid NOT NULL,
	"announcement_only" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"group_id" uuid,
	"name" text NOT NULL,
	"price_minor" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"quantity" integer,
	"minimum_per_order" integer DEFAULT 1 NOT NULL,
	"maximum_per_order" integer DEFAULT 10 NOT NULL,
	"sales_starts_at" timestamp with time zone,
	"sales_ends_at" timestamp with time zone,
	"validity_starts_at" timestamp with time zone,
	"validity_ends_at" timestamp with time zone,
	"hidden" boolean DEFAULT false NOT NULL,
	"password_hash" text,
	"approval_required" boolean DEFAULT false NOT NULL,
	"transferability" varchar(24) DEFAULT 'allowed' NOT NULL,
	"manual_sold_out" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_hidden_password_exclusion" CHECK (NOT ("ticket_types"."hidden" AND "ticket_types"."password_hash" IS NOT NULL)),
	CONSTRAINT "ticket_order_limits" CHECK ("ticket_types"."minimum_per_order" > 0 AND "ticket_types"."maximum_per_order" >= "ticket_types"."minimum_per_order")
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"owner_person_id" uuid NOT NULL,
	"token" varchar(128) NOT NULL,
	"status" "ticket_status" NOT NULL,
	"scanned_at" timestamp with time zone,
	"scanned_by_person_id" uuid,
	"scanned_device_id" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"status" "venue_status" DEFAULT 'draft' NOT NULL,
	"temporary" boolean DEFAULT false NOT NULL,
	"address_line_1" text,
	"address_line_2" text,
	"locality" text,
	"administrative_area" text,
	"postal_code" varchar(24),
	"country_code" varchar(2) DEFAULT 'US' NOT NULL,
	"timezone" varchar(64) NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"lifecycle_ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"status" varchar(24) DEFAULT 'waiting' NOT NULL,
	"promoted_at" timestamp with time zone,
	"hold_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"stripe_account_id" varchar(128),
	"custodial_guardian_person_id" uuid,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"kyc_status" varchar(24) DEFAULT 'not-started' NOT NULL,
	"spending_blocked" boolean DEFAULT false NOT NULL,
	"payout_held" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_accounts_person_id_unique" UNIQUE("person_id"),
	CONSTRAINT "wallet_accounts_stripe_account_id_unique" UNIQUE("stripe_account_id")
);
--> statement-breakpoint
CREATE TABLE "wallet_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_account_id" uuid NOT NULL,
	"direction" "ledger_direction" NOT NULL,
	"kind" "wallet_entry_kind" NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" "ledger_status" NOT NULL,
	"tax_character" "tax_character" NOT NULL,
	"stripe_balance_transaction_id" varchar(128),
	"reference_type" varchar(32),
	"reference_id" uuid,
	"reason_code" varchar(64) NOT NULL,
	"available_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_ledger_stripe_balance_transaction_id_unique" UNIQUE("stripe_balance_transaction_id"),
	CONSTRAINT "wallet_ledger_positive" CHECK ("wallet_ledger"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(24) NOT NULL,
	"provider_event_id" varchar(192) NOT NULL,
	"event_type" varchar(128) NOT NULL,
	"payload" jsonb NOT NULL,
	"signature_verified" boolean NOT NULL,
	"status" varchar(24) DEFAULT 'received' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_team_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"status" varchar(24) DEFAULT 'assigned' NOT NULL,
	"reminded_at" timestamp with time zone,
	"checked_in_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_roles" ADD CONSTRAINT "admin_roles_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_roles" ADD CONSTRAINT "admin_roles_granted_by_person_id_people_id_fk" FOREIGN KEY ("granted_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_offers" ADD CONSTRAINT "affiliate_offers_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_offers" ADD CONSTRAINT "affiliate_offers_affiliate_person_id_people_id_fk" FOREIGN KEY ("affiliate_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_drafts" ADD CONSTRAINT "agent_drafts_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_drafts" ADD CONSTRAINT "agent_drafts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_drafts" ADD CONSTRAINT "agent_drafts_confirmed_by_person_id_people_id_fk" FOREIGN KEY ("confirmed_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applied_fees" ADD CONSTRAINT "applied_fees_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_person_id_people_id_fk" FOREIGN KEY ("actor_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brackets" ADD CONSTRAINT "brackets_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courts" ADD CONSTRAINT "courts_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_actor_person_id_people_id_fk" FOREIGN KEY ("actor_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_assigned_to_person_id_people_id_fk" FOREIGN KEY ("assigned_to_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divisions" ADD CONSTRAINT "divisions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divisions" ADD CONSTRAINT "divisions_eligibility_rule_id_eligibility_rules_id_fk" FOREIGN KEY ("eligibility_rule_id") REFERENCES "public"."eligibility_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility_rules" ADD CONSTRAINT "eligibility_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility_rules" ADD CONSTRAINT "eligibility_rules_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_rate_plan_id_rate_plans_id_fk" FOREIGN KEY ("rate_plan_id") REFERENCES "public"."rate_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_eligibility_rule_id_eligibility_rules_id_fk" FOREIGN KEY ("eligibility_rule_id") REFERENCES "public"."eligibility_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_updated_by_person_id_people_id_fk" FOREIGN KEY ("updated_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_person_id_people_id_fk" FOREIGN KEY ("follower_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_subject_person_id_people_id_fk" FOREIGN KEY ("subject_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_signed_by_person_id_people_id_fk" FOREIGN KEY ("signed_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardianships" ADD CONSTRAINT "guardianships_guardian_id_people_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardianships" ADD CONSTRAINT "guardianships_minor_id_people_id_fk" FOREIGN KEY ("minor_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_links" ADD CONSTRAINT "import_links_source_id_import_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."import_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_links" ADD CONSTRAINT "import_links_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_bracket_id_brackets_id_fk" FOREIGN KEY ("bracket_id") REFERENCES "public"."brackets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_team_a_id_teams_id_fk" FOREIGN KEY ("team_a_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_team_b_id_teams_id_fk" FOREIGN KEY ("team_b_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_assigned_scorekeeper_person_id_people_id_fk" FOREIGN KEY ("assigned_scorekeeper_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_winner_team_id_teams_id_fk" FOREIGN KEY ("winner_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_tiers" ADD CONSTRAINT "membership_tiers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tier_id_membership_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."membership_tiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_person_id_people_id_fk" FOREIGN KEY ("sender_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_recipient_person_id_people_id_fk" FOREIGN KEY ("recipient_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_consent_id_consents_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."consents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_person_id_people_id_fk" FOREIGN KEY ("buyer_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_wallet_account_id_wallet_accounts_id_fk" FOREIGN KEY ("wallet_account_id") REFERENCES "public"."wallet_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_sessions" ADD CONSTRAINT "pickup_sessions_host_person_id_people_id_fk" FOREIGN KEY ("host_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_sessions" ADD CONSTRAINT "pickup_sessions_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_person_id_people_id_fk" FOREIGN KEY ("author_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purses" ADD CONSTRAINT "purses_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rally_events" ADD CONSTRAINT "rally_events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_events" ADD CONSTRAINT "rating_events_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_events" ADD CONSTRAINT "rating_events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_overridden_by_person_id_people_id_fk" FOREIGN KEY ("overridden_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_person_id_people_id_fk" FOREIGN KEY ("reporter_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_assigned_to_person_id_people_id_fk" FOREIGN KEY ("assigned_to_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_overrides" ADD CONSTRAINT "schedule_overrides_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_event_type_id_event_types_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_coach_person_id_people_id_fk" FOREIGN KEY ("coach_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_entries" ADD CONSTRAINT "team_entries_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_entries" ADD CONSTRAINT "team_entries_paying_person_id_people_id_fk" FOREIGN KEY ("paying_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_entries" ADD CONSTRAINT "team_entries_partner_person_id_people_id_fk" FOREIGN KEY ("partner_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_groups" ADD CONSTRAINT "ticket_groups_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_group_id_ticket_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."ticket_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_ticket_type_id_ticket_types_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."ticket_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_owner_person_id_people_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_scanned_by_person_id_people_id_fk" FOREIGN KEY ("scanned_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_custodial_guardian_person_id_people_id_fk" FOREIGN KEY ("custodial_guardian_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_wallet_account_id_wallet_accounts_id_fk" FOREIGN KEY ("wallet_account_id") REFERENCES "public"."wallet_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_team_assignments" ADD CONSTRAINT "work_team_assignments_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_team_assignments" ADD CONSTRAINT "work_team_assignments_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_log" USING btree ("actor_person_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bracket_division_version_unique" ON "brackets" USING btree ("division_id","version");--> statement-breakpoint
CREATE INDEX "consent_person_scope_idx" ON "consents" USING btree ("person_id","scope");--> statement-breakpoint
CREATE UNIQUE INDEX "court_venue_name_unique" ON "courts" USING btree ("venue_id","name");--> statement-breakpoint
CREATE INDEX "credit_ledger_balance_idx" ON "credit_ledger" USING btree ("organization_id","person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eligibility_rule_version_unique" ON "eligibility_rules" USING btree ("id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "feature_flag_scope_unique" ON "feature_flags" USING btree ("key","organization_id","market");--> statement-breakpoint
CREATE UNIQUE INDEX "form_version_unique" ON "forms" USING btree ("id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_procedure_key_unique" ON "idempotency_records" USING btree ("procedure","key");--> statement-breakpoint
CREATE UNIQUE INDEX "import_link_source_person_unique" ON "import_links" USING btree ("source_id","external_person_id");--> statement-breakpoint
CREATE INDEX "match_schedule_idx" ON "matches" USING btree ("scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "org_membership_unique" ON "organization_memberships" USING btree ("organization_id","person_id","role");--> statement-breakpoint
CREATE INDEX "org_membership_person_idx" ON "organization_memberships" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "people_display_name_idx" ON "people" USING btree ("display_name");--> statement-breakpoint
CREATE UNIQUE INDEX "promo_org_code_unique" ON "promo_codes" USING btree ("organization_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "rally_event_replay_unique" ON "rally_events" USING btree ("match_id","sequence","device_id");--> statement-breakpoint
CREATE INDEX "rally_event_match_sequence_idx" ON "rally_events" USING btree ("match_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "rating_event_person_sequence_unique" ON "rating_events" USING btree ("person_id","discipline","sequence");--> statement-breakpoint
CREATE INDEX "rating_event_match_idx" ON "rating_events" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "rating_display_idx" ON "ratings" USING btree ("discipline","display");--> statement-breakpoint
CREATE UNIQUE INDEX "registration_session_person_unique" ON "registrations" USING btree ("session_id","person_id");--> statement-breakpoint
CREATE INDEX "schedule_resource_idx" ON "schedules" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "session_start_idx" ON "sessions" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "ticket_token_status_idx" ON "tickets" USING btree ("token","status");--> statement-breakpoint
CREATE UNIQUE INDEX "venue_org_slug_unique" ON "venues" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "venue_geo_idx" ON "venues" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "wallet_ledger_balance_idx" ON "wallet_ledger" USING btree ("wallet_account_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_provider_event_unique" ON "webhook_events" USING btree ("provider","provider_event_id");