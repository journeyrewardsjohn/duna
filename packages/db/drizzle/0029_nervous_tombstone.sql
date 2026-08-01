CREATE TYPE "public"."calendar_provider" AS ENUM('google', 'apple', 'ical');--> statement-breakpoint
CREATE TYPE "public"."catalog_audience" AS ENUM('everyone', 'member', 'non-member');--> statement-breakpoint
CREATE TYPE "public"."catalog_item_type" AS ENUM('event', 'service', 'good', 'plan');--> statement-breakpoint
CREATE TYPE "public"."catalog_payment_kind" AS ENUM('card', 'cash', 'credit');--> statement-breakpoint
CREATE TYPE "public"."catalog_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."inventory_movement_kind" AS ENUM('receive', 'sale', 'rent-out', 'rent-return', 'coach-checkout', 'coach-return', 'adjustment', 'damage', 'retire');--> statement-breakpoint
CREATE TYPE "public"."inventory_purpose" AS ENUM('sale', 'rental', 'coach-use', 'operations');--> statement-breakpoint
CREATE TYPE "public"."journal_status" AS ENUM('draft', 'posted');--> statement-breakpoint
CREATE TYPE "public"."ledger_account_type" AS ENUM('asset', 'liability', 'equity', 'revenue', 'expense', 'memo');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_side" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."ledger_unit_kind" AS ENUM('money', 'organization-credit');--> statement-breakpoint
CREATE TYPE "public"."resource_reservation_status" AS ENUM('held', 'confirmed', 'released', 'cancelled');--> statement-breakpoint
CREATE TABLE "calendar_busy_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"calendar_connection_id" uuid NOT NULL,
	"external_event_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"transparency" varchar(16) DEFAULT 'busy' NOT NULL,
	"source_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_busy_time_valid" CHECK ("calendar_busy_blocks"."ends_at" > "calendar_busy_blocks"."starts_at"),
	CONSTRAINT "calendar_busy_transparency_valid" CHECK ("calendar_busy_blocks"."transparency" IN ('busy', 'free'))
);
--> statement-breakpoint
CREATE TABLE "calendar_change_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"original_starts_at" timestamp with time zone NOT NULL,
	"original_ends_at" timestamp with time zone NOT NULL,
	"proposed_starts_at" timestamp with time zone NOT NULL,
	"proposed_ends_at" timestamp with time zone NOT NULL,
	"proposed_court_id" uuid,
	"proposed_coach_person_id" uuid,
	"conflict_summary" jsonb NOT NULL,
	"status" varchar(24) DEFAULT 'proposed' NOT NULL,
	"created_by_person_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_change_time_valid" CHECK ("calendar_change_proposals"."original_ends_at" > "calendar_change_proposals"."original_starts_at" AND "calendar_change_proposals"."proposed_ends_at" > "calendar_change_proposals"."proposed_starts_at"),
	CONSTRAINT "calendar_change_status_valid" CHECK ("calendar_change_proposals"."status" IN ('proposed', 'confirmed', 'rejected', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"provider" "calendar_provider" NOT NULL,
	"external_account_id" text NOT NULL,
	"credential_reference" text NOT NULL,
	"selected_calendar_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sync_direction" varchar(16) DEFAULT 'two-way' NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"sync_token" text,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_connection_direction_valid" CHECK ("calendar_connections"."sync_direction" IN ('busy-only', 'duna-to-external', 'two-way')),
	CONSTRAINT "calendar_connection_status_valid" CHECK ("calendar_connections"."status" IN ('pending', 'active', 'reauthorization-required', 'paused', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "catalog_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan_catalog_item_id" uuid NOT NULL,
	"kind" varchar(32) NOT NULL,
	"target_catalog_item_id" uuid,
	"quantity" integer,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_entitlement_kind_valid" CHECK ("catalog_entitlements"."kind" IN ('membership-access', 'credit-grant', 'discount', 'priority-booking', 'included-item')),
	CONSTRAINT "catalog_entitlement_quantity_positive" CHECK ("catalog_entitlements"."quantity" IS NULL OR "catalog_entitlements"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" "catalog_item_type" NOT NULL,
	"subtype" varchar(48) NOT NULL,
	"slug" varchar(96) NOT NULL,
	"title" text NOT NULL,
	"short_summary" text,
	"description" text,
	"status" "catalog_status" DEFAULT 'draft' NOT NULL,
	"visibility" varchar(24) DEFAULT 'public' NOT NULL,
	"taxable" boolean DEFAULT true NOT NULL,
	"stripe_tax_code" varchar(64),
	"allow_card" boolean DEFAULT true NOT NULL,
	"allow_cash" boolean DEFAULT false NOT NULL,
	"allow_credits" boolean DEFAULT false NOT NULL,
	"membership_required" boolean DEFAULT false NOT NULL,
	"default_fulfillment" varchar(32) DEFAULT 'registration' NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_person_id" uuid,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_item_visibility_valid" CHECK ("catalog_items"."visibility" IN ('public', 'members', 'private')),
	CONSTRAINT "catalog_item_subtype_valid" CHECK (("catalog_items"."type" = 'event' AND "catalog_items"."subtype" IN ('tournament', 'league', 'clinic', 'open-play', 'pickup')) OR ("catalog_items"."type" = 'service' AND "catalog_items"."subtype" IN ('private-lesson', 'group-lesson', 'program', 'court-rental', 'assessment', 'other')) OR ("catalog_items"."type" = 'good' AND "catalog_items"."subtype" IN ('apparel', 'equipment', 'rental', 'swag', 'consumable', 'other')) OR ("catalog_items"."type" = 'plan' AND "catalog_items"."subtype" IN ('membership', 'credit-pack'))),
	CONSTRAINT "catalog_item_payment_method" CHECK ("catalog_items"."allow_card" OR "catalog_items"."allow_cash" OR "catalog_items"."allow_credits")
);
--> statement-breakpoint
CREATE TABLE "catalog_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"catalog_variant_id" uuid,
	"kind" varchar(16) NOT NULL,
	"url" text NOT NULL,
	"poster_url" text,
	"alt" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_media_kind_valid" CHECK ("catalog_media"."kind" IN ('image', 'video'))
);
--> statement-breakpoint
CREATE TABLE "catalog_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"code" varchar(48) NOT NULL,
	"name" text NOT NULL,
	"values" jsonb NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_option_values_present" CHECK (jsonb_array_length("catalog_options"."values") > 0)
);
--> statement-breakpoint
CREATE TABLE "catalog_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"catalog_variant_id" uuid,
	"audience" "catalog_audience" DEFAULT 'everyone' NOT NULL,
	"payment_kind" "catalog_payment_kind" NOT NULL,
	"amount_minor" bigint,
	"currency" varchar(3),
	"credit_amount" integer,
	"recurring_interval" varchar(16),
	"recurring_interval_count" integer,
	"stripe_price_id" varchar(128),
	"tax_behavior" varchar(16) DEFAULT 'exclusive' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_prices_stripe_price_id_unique" UNIQUE("stripe_price_id"),
	CONSTRAINT "catalog_price_value_valid" CHECK (("catalog_prices"."payment_kind" = 'credit' AND "catalog_prices"."credit_amount" > 0 AND "catalog_prices"."amount_minor" IS NULL AND "catalog_prices"."currency" IS NULL) OR ("catalog_prices"."payment_kind" IN ('card', 'cash') AND "catalog_prices"."amount_minor" >= 0 AND "catalog_prices"."currency" IS NOT NULL AND "catalog_prices"."credit_amount" IS NULL)),
	CONSTRAINT "catalog_price_currency_uppercase" CHECK ("catalog_prices"."currency" IS NULL OR "catalog_prices"."currency" = upper("catalog_prices"."currency")),
	CONSTRAINT "catalog_price_recurring_valid" CHECK (("catalog_prices"."recurring_interval" IS NULL AND "catalog_prices"."recurring_interval_count" IS NULL) OR ("catalog_prices"."recurring_interval" IN ('week', 'month', 'year') AND "catalog_prices"."recurring_interval_count" > 0)),
	CONSTRAINT "catalog_price_window_valid" CHECK ("catalog_prices"."starts_at" IS NULL OR "catalog_prices"."ends_at" IS NULL OR "catalog_prices"."ends_at" > "catalog_prices"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "catalog_session_links" (
	"catalog_item_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"division_id" uuid,
	"relationship" varchar(24) DEFAULT 'primary' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_session_links_catalog_item_id_session_id_pk" PRIMARY KEY("catalog_item_id","session_id"),
	CONSTRAINT "catalog_session_link_relationship_valid" CHECK ("catalog_session_links"."relationship" IN ('primary', 'entry', 'ticket', 'upsell'))
);
--> statement-breakpoint
CREATE TABLE "catalog_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"sku" varchar(96),
	"title" text NOT NULL,
	"option_coordinates" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "catalog_status" DEFAULT 'active' NOT NULL,
	"barcode" varchar(96),
	"weight_grams" integer,
	"stripe_product_id" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_variant_weight_nonnegative" CHECK ("catalog_variants"."weight_grams" IS NULL OR "catalog_variants"."weight_grams" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"venue_id" uuid,
	"name" text NOT NULL,
	"kind" varchar(24) DEFAULT 'venue' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_location_kind_valid" CHECK ("inventory_locations"."kind" IN ('venue', 'warehouse', 'vehicle', 'coach-kit', 'virtual'))
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"inventory_stock_item_id" uuid NOT NULL,
	"kind" "inventory_movement_kind" NOT NULL,
	"quantity_delta" integer NOT NULL,
	"unit_cost_minor" bigint,
	"currency" varchar(3),
	"source_type" varchar(32),
	"source_id" text,
	"idempotency_key" varchar(128) NOT NULL,
	"actor_person_id" uuid,
	"reason" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_movement_nonzero" CHECK ("inventory_movements"."quantity_delta" <> 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"inventory_stock_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"source_type" varchar(32) NOT NULL,
	"source_id" text NOT NULL,
	"status" "resource_reservation_status" DEFAULT 'held' NOT NULL,
	"held_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_reservation_quantity_positive" CHECK ("inventory_reservations"."quantity" > 0),
	CONSTRAINT "inventory_reservation_time_valid" CHECK ("inventory_reservations"."ends_at" > "inventory_reservations"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "inventory_stock_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"catalog_variant_id" uuid NOT NULL,
	"inventory_location_id" uuid NOT NULL,
	"purpose" "inventory_purpose" NOT NULL,
	"tracking_mode" varchar(16) DEFAULT 'quantity' NOT NULL,
	"quantity_on_hand" integer DEFAULT 0 NOT NULL,
	"quantity_reserved" integer DEFAULT 0 NOT NULL,
	"reorder_point" integer DEFAULT 0 NOT NULL,
	"serial_number" varchar(128),
	"asset_tag" varchar(96),
	"condition" varchar(24) DEFAULT 'good' NOT NULL,
	"unit_cost_minor" bigint,
	"currency" varchar(3),
	"acquired_at" date,
	"vendor_name" text,
	"vendor_reference" text,
	"receipt_url" text,
	"placed_in_service_at" date,
	"depreciation_method" varchar(32),
	"useful_life_months" integer,
	"salvage_value_minor" bigint,
	"tax_asset_class" varchar(64),
	"retired_at" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_stock_quantities_valid" CHECK ("inventory_stock_items"."quantity_on_hand" >= 0 AND "inventory_stock_items"."quantity_reserved" >= 0 AND "inventory_stock_items"."quantity_reserved" <= "inventory_stock_items"."quantity_on_hand" AND "inventory_stock_items"."reorder_point" >= 0),
	CONSTRAINT "inventory_stock_tracking_mode_valid" CHECK ("inventory_stock_items"."tracking_mode" IN ('quantity', 'serialized')),
	CONSTRAINT "inventory_stock_serialized_quantity" CHECK ("inventory_stock_items"."tracking_mode" <> 'serialized' OR ("inventory_stock_items"."quantity_on_hand" <= 1 AND "inventory_stock_items"."serial_number" IS NOT NULL)),
	CONSTRAINT "inventory_stock_acquisition_amounts" CHECK ("inventory_stock_items"."unit_cost_minor" IS NULL OR ("inventory_stock_items"."unit_cost_minor" >= 0 AND "inventory_stock_items"."currency" IS NOT NULL)),
	CONSTRAINT "inventory_stock_depreciation_valid" CHECK ("inventory_stock_items"."depreciation_method" IS NULL OR "inventory_stock_items"."depreciation_method" IN ('straight-line', 'declining-balance', 'section-179', 'bonus', 'none')),
	CONSTRAINT "inventory_stock_useful_life_positive" CHECK ("inventory_stock_items"."useful_life_months" IS NULL OR "inventory_stock_items"."useful_life_months" > 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner_person_id" uuid,
	"code" varchar(96) NOT NULL,
	"name" text NOT NULL,
	"account_type" "ledger_account_type" NOT NULL,
	"normal_side" "ledger_entry_side" NOT NULL,
	"unit_kind" "ledger_unit_kind" NOT NULL,
	"unit" varchar(96) NOT NULL,
	"currency" varchar(3),
	"system_managed" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_account_unit_currency_valid" CHECK (("ledger_accounts"."unit_kind" = 'money' AND "ledger_accounts"."currency" IS NOT NULL AND "ledger_accounts"."unit" = "ledger_accounts"."currency") OR ("ledger_accounts"."unit_kind" = 'organization-credit' AND "ledger_accounts"."currency" IS NULL)),
	CONSTRAINT "ledger_account_currency_uppercase" CHECK ("ledger_accounts"."currency" IS NULL OR "ledger_accounts"."currency" = upper("ledger_accounts"."currency"))
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"journal_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"side" "ledger_entry_side" NOT NULL,
	"amount" bigint NOT NULL,
	"unit_kind" "ledger_unit_kind" NOT NULL,
	"unit" varchar(96) NOT NULL,
	"currency" varchar(3),
	"memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entry_amount_positive" CHECK ("ledger_entries"."amount" > 0),
	CONSTRAINT "ledger_entry_sequence_nonnegative" CHECK ("ledger_entries"."sequence" >= 0),
	CONSTRAINT "ledger_entry_unit_currency_valid" CHECK (("ledger_entries"."unit_kind" = 'money' AND "ledger_entries"."currency" IS NOT NULL AND "ledger_entries"."unit" = "ledger_entries"."currency") OR ("ledger_entries"."unit_kind" = 'organization-credit' AND "ledger_entries"."currency" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "ledger_journals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"source_type" varchar(48) NOT NULL,
	"source_id" text NOT NULL,
	"description" text NOT NULL,
	"status" "journal_status" DEFAULT 'draft' NOT NULL,
	"reversal_of_journal_id" uuid,
	"actor_person_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"posted_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_journal_posted_state_valid" CHECK (("ledger_journals"."status" = 'draft' AND "ledger_journals"."posted_at" IS NULL) OR ("ledger_journals"."status" = 'posted' AND "ledger_journals"."posted_at" IS NOT NULL)),
	CONSTRAINT "ledger_journal_not_self_reversal" CHECK ("ledger_journals"."reversal_of_journal_id" IS NULL OR "ledger_journals"."reversal_of_journal_id" <> "ledger_journals"."id")
);
--> statement-breakpoint
CREATE TABLE "ledger_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" varchar(24) NOT NULL,
	"period_starts_at" timestamp with time zone NOT NULL,
	"period_ends_at" timestamp with time zone NOT NULL,
	"ledger_amount_minor" bigint NOT NULL,
	"provider_amount_minor" bigint NOT NULL,
	"drift_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" varchar(24) NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_reconciliation_time_valid" CHECK ("ledger_reconciliations"."period_ends_at" > "ledger_reconciliations"."period_starts_at"),
	CONSTRAINT "ledger_reconciliation_status_valid" CHECK ("ledger_reconciliations"."status" IN ('matched', 'drift', 'investigating', 'resolved'))
);
--> statement-breakpoint
CREATE TABLE "order_tax_contexts" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"venue_id" uuid,
	"source" varchar(24) NOT NULL,
	"address_snapshot" jsonb NOT NULL,
	"item_tax_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stripe_tax_calculation_id" varchar(128),
	"stripe_tax_transaction_id" varchar(128),
	"tax_amount_minor" bigint DEFAULT 0 NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" varchar(24) DEFAULT 'estimated' NOT NULL,
	"committed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_tax_source_valid" CHECK ("order_tax_contexts"."source" IN ('venue', 'organization', 'shipping', 'online')),
	CONSTRAINT "order_tax_status_valid" CHECK ("order_tax_contexts"."status" IN ('estimated', 'committed', 'voided', 'failed')),
	CONSTRAINT "order_tax_amount_nonnegative" CHECK ("order_tax_contexts"."tax_amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "organization_credit_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"organization_wallet_id" uuid NOT NULL,
	"source_journal_id" uuid NOT NULL,
	"catalog_item_id" uuid,
	"initial_credits" integer NOT NULL,
	"remaining_credits" integer NOT NULL,
	"expires_at" timestamp with time zone,
	"status" varchar(24) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_credit_grant_amounts_valid" CHECK ("organization_credit_grants"."initial_credits" > 0 AND "organization_credit_grants"."remaining_credits" >= 0 AND "organization_credit_grants"."remaining_credits" <= "organization_credit_grants"."initial_credits"),
	CONSTRAINT "organization_credit_grant_status_valid" CHECK ("organization_credit_grants"."status" IN ('active', 'exhausted', 'expired', 'reversed'))
);
--> statement-breakpoint
CREATE TABLE "organization_themes" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"logo_url" text,
	"mark_url" text,
	"hero_media_type" varchar(16),
	"hero_media_url" text,
	"hero_poster_url" text,
	"tagline" text,
	"profile_summary" text,
	"palette" jsonb DEFAULT '{"primary":"#173A63","accent":"#2B67A4","sand":"#E9DFC9","ink":"#101828","canvas":"#FAFAF7"}'::jsonb NOT NULL,
	"typography" jsonb DEFAULT '{"heading":"Instrument Sans","body":"Archivo"}'::jsonb NOT NULL,
	"card_style" varchar(24) DEFAULT 'soft' NOT NULL,
	"profile_layout" varchar(24) DEFAULT 'editorial' NOT NULL,
	"social_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_theme_hero_type_valid" CHECK ("organization_themes"."hero_media_type" IS NULL OR "organization_themes"."hero_media_type" IN ('image', 'video')),
	CONSTRAINT "organization_theme_card_style_valid" CHECK ("organization_themes"."card_style" IN ('soft', 'crisp', 'borderless'))
);
--> statement-breakpoint
CREATE TABLE "organization_wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"credit_ledger_account_id" uuid NOT NULL,
	"unit" varchar(96) NOT NULL,
	"status" varchar(24) DEFAULT 'active' NOT NULL,
	"cached_available_credits" integer DEFAULT 0 NOT NULL,
	"cached_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_wallet_status_valid" CHECK ("organization_wallets"."status" IN ('active', 'frozen', 'closed')),
	CONSTRAINT "organization_wallet_cached_nonnegative" CHECK ("organization_wallets"."cached_available_credits" >= 0)
);
--> statement-breakpoint
CREATE TABLE "refund_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_id" uuid,
	"disposition" varchar(24) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"credits_issued" integer,
	"stripe_refund_id" varchar(128),
	"ledger_journal_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" varchar(24) NOT NULL,
	"initiated_by_person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refund_records_stripe_refund_id_unique" UNIQUE("stripe_refund_id"),
	CONSTRAINT "refund_record_disposition_valid" CHECK ("refund_records"."disposition" IN ('original-payment', 'organization-credit')),
	CONSTRAINT "refund_record_amount_positive" CHECK ("refund_records"."amount_minor" > 0),
	CONSTRAINT "refund_record_credit_pair" CHECK (("refund_records"."disposition" = 'organization-credit' AND "refund_records"."credits_issued" > 0) OR ("refund_records"."disposition" = 'original-payment' AND "refund_records"."credits_issued" IS NULL)),
	CONSTRAINT "refund_record_status_valid" CHECK ("refund_records"."status" IN ('pending', 'succeeded', 'failed', 'reversed'))
);
--> statement-breakpoint
CREATE TABLE "resource_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"resource_type" varchar(24) NOT NULL,
	"resource_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"exclusive" boolean DEFAULT true NOT NULL,
	"source_type" varchar(32) NOT NULL,
	"source_id" text NOT NULL,
	"status" "resource_reservation_status" DEFAULT 'held' NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"held_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resource_reservation_type_valid" CHECK ("resource_reservations"."resource_type" IN ('court', 'coach', 'equipment')),
	CONSTRAINT "resource_reservation_time_valid" CHECK ("resource_reservations"."ends_at" > "resource_reservations"."starts_at"),
	CONSTRAINT "resource_reservation_quantity_positive" CHECK ("resource_reservations"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "address_line_1" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "address_line_2" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "locality" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "administrative_area" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "postal_code" varchar(24);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_tax_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "tax_registration_status" varchar(24) DEFAULT 'not-configured' NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_busy_blocks" ADD CONSTRAINT "calendar_busy_blocks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_busy_blocks" ADD CONSTRAINT "calendar_busy_blocks_calendar_connection_id_calendar_connections_id_fk" FOREIGN KEY ("calendar_connection_id") REFERENCES "public"."calendar_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_change_proposals" ADD CONSTRAINT "calendar_change_proposals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_change_proposals" ADD CONSTRAINT "calendar_change_proposals_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_change_proposals" ADD CONSTRAINT "calendar_change_proposals_proposed_court_id_courts_id_fk" FOREIGN KEY ("proposed_court_id") REFERENCES "public"."courts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_change_proposals" ADD CONSTRAINT "calendar_change_proposals_proposed_coach_person_id_people_id_fk" FOREIGN KEY ("proposed_coach_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_change_proposals" ADD CONSTRAINT "calendar_change_proposals_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_entitlements" ADD CONSTRAINT "catalog_entitlements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_entitlements" ADD CONSTRAINT "catalog_entitlements_plan_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("plan_catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_entitlements" ADD CONSTRAINT "catalog_entitlements_target_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("target_catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_media" ADD CONSTRAINT "catalog_media_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_media" ADD CONSTRAINT "catalog_media_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_media" ADD CONSTRAINT "catalog_media_catalog_variant_id_catalog_variants_id_fk" FOREIGN KEY ("catalog_variant_id") REFERENCES "public"."catalog_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_options" ADD CONSTRAINT "catalog_options_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_options" ADD CONSTRAINT "catalog_options_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_prices" ADD CONSTRAINT "catalog_prices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_prices" ADD CONSTRAINT "catalog_prices_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_prices" ADD CONSTRAINT "catalog_prices_catalog_variant_id_catalog_variants_id_fk" FOREIGN KEY ("catalog_variant_id") REFERENCES "public"."catalog_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_session_links" ADD CONSTRAINT "catalog_session_links_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_session_links" ADD CONSTRAINT "catalog_session_links_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_session_links" ADD CONSTRAINT "catalog_session_links_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD CONSTRAINT "catalog_variants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD CONSTRAINT "catalog_variants_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_locations" ADD CONSTRAINT "inventory_locations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_locations" ADD CONSTRAINT "inventory_locations_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_inventory_stock_item_id_inventory_stock_items_id_fk" FOREIGN KEY ("inventory_stock_item_id") REFERENCES "public"."inventory_stock_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_actor_person_id_people_id_fk" FOREIGN KEY ("actor_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_inventory_stock_item_id_inventory_stock_items_id_fk" FOREIGN KEY ("inventory_stock_item_id") REFERENCES "public"."inventory_stock_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stock_items" ADD CONSTRAINT "inventory_stock_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stock_items" ADD CONSTRAINT "inventory_stock_items_catalog_variant_id_catalog_variants_id_fk" FOREIGN KEY ("catalog_variant_id") REFERENCES "public"."catalog_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stock_items" ADD CONSTRAINT "inventory_stock_items_inventory_location_id_inventory_locations_id_fk" FOREIGN KEY ("inventory_location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_owner_person_id_people_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_journal_id_ledger_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."ledger_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_journals" ADD CONSTRAINT "ledger_journals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_journals" ADD CONSTRAINT "ledger_journals_actor_person_id_people_id_fk" FOREIGN KEY ("actor_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_reconciliations" ADD CONSTRAINT "ledger_reconciliations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_tax_contexts" ADD CONSTRAINT "order_tax_contexts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_tax_contexts" ADD CONSTRAINT "order_tax_contexts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_tax_contexts" ADD CONSTRAINT "order_tax_contexts_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_credit_grants" ADD CONSTRAINT "organization_credit_grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_credit_grants" ADD CONSTRAINT "organization_credit_grants_organization_wallet_id_organization_wallets_id_fk" FOREIGN KEY ("organization_wallet_id") REFERENCES "public"."organization_wallets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_credit_grants" ADD CONSTRAINT "organization_credit_grants_source_journal_id_ledger_journals_id_fk" FOREIGN KEY ("source_journal_id") REFERENCES "public"."ledger_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_credit_grants" ADD CONSTRAINT "organization_credit_grants_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_themes" ADD CONSTRAINT "organization_themes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_wallets" ADD CONSTRAINT "organization_wallets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_wallets" ADD CONSTRAINT "organization_wallets_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_wallets" ADD CONSTRAINT "organization_wallets_credit_ledger_account_id_ledger_accounts_id_fk" FOREIGN KEY ("credit_ledger_account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_records" ADD CONSTRAINT "refund_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_records" ADD CONSTRAINT "refund_records_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_records" ADD CONSTRAINT "refund_records_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_records" ADD CONSTRAINT "refund_records_ledger_journal_id_ledger_journals_id_fk" FOREIGN KEY ("ledger_journal_id") REFERENCES "public"."ledger_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_records" ADD CONSTRAINT "refund_records_initiated_by_person_id_people_id_fk" FOREIGN KEY ("initiated_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_reservations" ADD CONSTRAINT "resource_reservations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_busy_connection_event_unique" ON "calendar_busy_blocks" USING btree ("calendar_connection_id","external_event_id");--> statement-breakpoint
CREATE INDEX "calendar_busy_org_time_idx" ON "calendar_busy_blocks" USING btree ("organization_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "calendar_change_org_status_idx" ON "calendar_change_proposals" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_connection_org_person_provider_unique" ON "calendar_connections" USING btree ("organization_id","person_id","provider","external_account_id");--> statement-breakpoint
CREATE INDEX "calendar_connection_org_status_idx" ON "calendar_connections" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "catalog_entitlement_org_plan_idx" ON "catalog_entitlements" USING btree ("organization_id","plan_catalog_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_item_org_slug_unique" ON "catalog_items" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "catalog_item_org_type_status_idx" ON "catalog_items" USING btree ("organization_id","type","status");--> statement-breakpoint
CREATE INDEX "catalog_media_org_item_idx" ON "catalog_media" USING btree ("organization_id","catalog_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_option_item_code_unique" ON "catalog_options" USING btree ("catalog_item_id","code");--> statement-breakpoint
CREATE INDEX "catalog_option_org_item_idx" ON "catalog_options" USING btree ("organization_id","catalog_item_id");--> statement-breakpoint
CREATE INDEX "catalog_price_org_item_idx" ON "catalog_prices" USING btree ("organization_id","catalog_item_id","active");--> statement-breakpoint
CREATE INDEX "catalog_session_link_session_idx" ON "catalog_session_links" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_variant_item_sku_unique" ON "catalog_variants" USING btree ("catalog_item_id","sku") WHERE "catalog_variants"."sku" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "catalog_variant_org_item_idx" ON "catalog_variants" USING btree ("organization_id","catalog_item_id");--> statement-breakpoint
CREATE INDEX "catalog_variant_options_gin_idx" ON "catalog_variants" USING gin ("option_coordinates");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_location_org_name_unique" ON "inventory_locations" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "inventory_location_org_active_idx" ON "inventory_locations" USING btree ("organization_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_movement_org_idempotency_unique" ON "inventory_movements" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "inventory_movement_org_stock_time_idx" ON "inventory_movements" USING btree ("organization_id","inventory_stock_item_id","occurred_at");--> statement-breakpoint
CREATE INDEX "inventory_reservation_org_stock_time_idx" ON "inventory_reservations" USING btree ("organization_id","inventory_stock_item_id","starts_at");--> statement-breakpoint
CREATE INDEX "inventory_stock_org_location_idx" ON "inventory_stock_items" USING btree ("organization_id","inventory_location_id","purpose");--> statement-breakpoint
CREATE INDEX "inventory_stock_org_variant_idx" ON "inventory_stock_items" USING btree ("organization_id","catalog_variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_stock_org_serial_unique" ON "inventory_stock_items" USING btree ("organization_id","serial_number") WHERE "inventory_stock_items"."serial_number" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_stock_org_asset_tag_unique" ON "inventory_stock_items" USING btree ("organization_id","asset_tag") WHERE "inventory_stock_items"."asset_tag" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_account_org_code_owner_unique" ON "ledger_accounts" USING btree ("organization_id","code","owner_person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_account_org_system_code_unique" ON "ledger_accounts" USING btree ("organization_id","code") WHERE "ledger_accounts"."owner_person_id" IS NULL;--> statement-breakpoint
CREATE INDEX "ledger_account_org_owner_idx" ON "ledger_accounts" USING btree ("organization_id","owner_person_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entry_journal_sequence_unique" ON "ledger_entries" USING btree ("journal_id","sequence");--> statement-breakpoint
CREATE INDEX "ledger_entry_org_account_idx" ON "ledger_entries" USING btree ("organization_id","account_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_entry_org_journal_idx" ON "ledger_entries" USING btree ("organization_id","journal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_journal_org_idempotency_unique" ON "ledger_journals" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_journal_reversal_unique" ON "ledger_journals" USING btree ("reversal_of_journal_id") WHERE "ledger_journals"."reversal_of_journal_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ledger_journal_org_source_idx" ON "ledger_journals" USING btree ("organization_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "ledger_journal_org_occurred_idx" ON "ledger_journals" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_reconciliation_org_period_unique" ON "ledger_reconciliations" USING btree ("organization_id","provider","period_starts_at","period_ends_at","currency");--> statement-breakpoint
CREATE INDEX "order_tax_org_status_idx" ON "order_tax_contexts" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "organization_credit_grant_wallet_expiry_idx" ON "organization_credit_grants" USING btree ("organization_id","organization_wallet_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_wallet_person_unique" ON "organization_wallets" USING btree ("organization_id","person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_wallet_account_unique" ON "organization_wallets" USING btree ("credit_ledger_account_id");--> statement-breakpoint
CREATE INDEX "organization_wallet_org_status_idx" ON "organization_wallets" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "refund_record_org_order_idx" ON "refund_records" USING btree ("organization_id","order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_reservation_org_idempotency_unique" ON "resource_reservations" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "resource_reservation_org_resource_time_idx" ON "resource_reservations" USING btree ("organization_id","resource_type","resource_id","starts_at");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organization_tax_status_valid" CHECK ("organizations"."tax_registration_status" IN ('not-configured', 'pending', 'active', 'restricted'));
--> statement-breakpoint
ALTER TABLE "ledger_journals" ADD CONSTRAINT "ledger_journals_reversal_of_journal_id_fk" FOREIGN KEY ("reversal_of_journal_id") REFERENCES "public"."ledger_journals"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "resource_reservations"
  ADD CONSTRAINT "resource_reservation_no_exclusive_overlap"
  EXCLUDE USING gist (
    "organization_id" WITH =,
    "resource_type" WITH =,
    "resource_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  )
  WHERE (
    "exclusive" = true
    AND "status" IN ('held', 'confirmed')
  );
--> statement-breakpoint
CREATE OR REPLACE FUNCTION duna_guard_ledger_entry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  journal_row "ledger_journals"%ROWTYPE;
  account_row "ledger_accounts"%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'ledger entries are append-only; post a reversal journal';
  END IF;

  SELECT * INTO journal_row
  FROM "ledger_journals"
  WHERE "id" = NEW."journal_id"
  FOR UPDATE;

  IF journal_row."status" <> 'draft' THEN
    RAISE EXCEPTION 'cannot add entries to a posted journal';
  END IF;
  IF journal_row."organization_id" <> NEW."organization_id" THEN
    RAISE EXCEPTION 'ledger journal tenant does not match entry tenant';
  END IF;

  SELECT * INTO account_row
  FROM "ledger_accounts"
  WHERE "id" = NEW."account_id";

  IF account_row."organization_id" <> NEW."organization_id" THEN
    RAISE EXCEPTION 'ledger account tenant does not match entry tenant';
  END IF;
  IF account_row."unit_kind" <> NEW."unit_kind"
    OR account_row."unit" <> NEW."unit"
    OR account_row."currency" IS DISTINCT FROM NEW."currency" THEN
    RAISE EXCEPTION 'ledger entry unit does not match its account';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ledger_entry_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "ledger_entries"
FOR EACH ROW EXECUTE FUNCTION duna_guard_ledger_entry();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION duna_guard_ledger_journal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  posting_count integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ledger journals are append-only';
  END IF;

  IF OLD."status" = 'posted' THEN
    RAISE EXCEPTION 'posted ledger journals are immutable; create a reversal';
  END IF;

  IF NEW."status" <> 'posted'
    OR OLD."status" <> 'draft'
    OR NEW."posted_at" IS NULL THEN
    RAISE EXCEPTION 'the only journal transition is draft to posted';
  END IF;

  IF (to_jsonb(NEW) - 'status' - 'posted_at')
    IS DISTINCT FROM
    (to_jsonb(OLD) - 'status' - 'posted_at') THEN
    RAISE EXCEPTION 'journal details cannot change while posting';
  END IF;

  SELECT count(*) INTO posting_count
  FROM "ledger_entries"
  WHERE "journal_id" = NEW."id";

  IF posting_count < 2 THEN
    RAISE EXCEPTION 'a posted journal requires at least two entries';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ledger_entries"
    WHERE "journal_id" = NEW."id"
    GROUP BY "unit_kind", "unit", "currency"
    HAVING sum(CASE WHEN "side" = 'debit' THEN "amount" ELSE 0 END)
      <> sum(CASE WHEN "side" = 'credit' THEN "amount" ELSE 0 END)
  ) THEN
    RAISE EXCEPTION 'ledger journal is not balanced by unit and currency';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ledger_journal_guard"
BEFORE UPDATE OR DELETE ON "ledger_journals"
FOR EACH ROW EXECUTE FUNCTION duna_guard_ledger_journal();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION duna_prevent_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "inventory_movement_append_only"
BEFORE UPDATE OR DELETE ON "inventory_movements"
FOR EACH ROW EXECUTE FUNCTION duna_prevent_append_only_mutation();
