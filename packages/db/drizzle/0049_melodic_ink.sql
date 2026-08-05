CREATE TABLE "operator_earnings_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"target_minor" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"period" varchar(16) DEFAULT 'month' NOT NULL,
	"period_starts_at" timestamp with time zone NOT NULL,
	"period_ends_at" timestamp with time zone NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operator_earnings_goal_target_valid" CHECK ("operator_earnings_goals"."target_minor" > 0),
	CONSTRAINT "operator_earnings_goal_period_valid" CHECK ("operator_earnings_goals"."period" IN ('week', 'month', 'quarter', 'year') AND "operator_earnings_goals"."period_ends_at" > "operator_earnings_goals"."period_starts_at")
);
--> statement-breakpoint
CREATE TABLE "operator_payment_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"payer_person_id" uuid NOT NULL,
	"operator_person_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"reference_type" varchar(24) DEFAULT 'custom' NOT NULL,
	"reference_id" uuid,
	"reference_label" text NOT NULL,
	"tender" varchar(32) NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"application_fee_minor" integer DEFAULT 0 NOT NULL,
	"processing_fee_minor" integer DEFAULT 0 NOT NULL,
	"commission_minor" integer DEFAULT 0 NOT NULL,
	"credits_applied" integer DEFAULT 0 NOT NULL,
	"wallet_cash_applied_minor" integer DEFAULT 0 NOT NULL,
	"stripe_payment_intent_id" varchar(128),
	"status" varchar(32) DEFAULT 'created' NOT NULL,
	"decline_code" varchar(96),
	"failure_code" varchar(96),
	"failure_message" text,
	"receipt_url" text,
	"idempotency_key" varchar(128) NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operator_payment_collections_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "operator_payment_collections_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id"),
	CONSTRAINT "operator_payment_collections_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "operator_payment_collection_reference_valid" CHECK ("operator_payment_collections"."reference_type" IN ('session', 'catalog-item', 'custom')),
	CONSTRAINT "operator_payment_collection_tender_valid" CHECK ("operator_payment_collections"."tender" IN ('card-present', 'organization-credit', 'wallet-cash')),
	CONSTRAINT "operator_payment_collection_status_valid" CHECK ("operator_payment_collections"."status" IN ('created', 'awaiting-reader', 'processing', 'succeeded', 'declined', 'failed', 'cancelled')),
	CONSTRAINT "operator_payment_collection_amounts_valid" CHECK ("operator_payment_collections"."amount_minor" > 0 AND "operator_payment_collections"."application_fee_minor" >= 0 AND "operator_payment_collections"."processing_fee_minor" >= 0 AND "operator_payment_collections"."commission_minor" >= 0 AND "operator_payment_collections"."credits_applied" >= 0 AND "operator_payment_collections"."wallet_cash_applied_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "operator_payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_type" varchar(48) NOT NULL,
	"status" varchar(32) NOT NULL,
	"processor_code" varchar(96),
	"message" text,
	"idempotency_key" varchar(128) NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operator_payment_events_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "organization_terminal_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"stripe_location_id" varchar(128) NOT NULL,
	"status" varchar(24) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_terminal_locations_stripe_location_id_unique" UNIQUE("stripe_location_id"),
	CONSTRAINT "organization_terminal_location_status_valid" CHECK ("organization_terminal_locations"."status" IN ('active', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "session_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"registration_id" uuid,
	"person_id" uuid NOT NULL,
	"status" varchar(24) DEFAULT 'scheduled' NOT NULL,
	"note" text,
	"recorded_by_person_id" uuid,
	"recorded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_attendance_status_valid" CHECK ("session_attendance"."status" IN ('scheduled', 'attended', 'no-show', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "session_note_recipients" (
	"note_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"detected" boolean DEFAULT false NOT NULL,
	"shared_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_note_recipients_note_id_person_id_pk" PRIMARY KEY("note_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "session_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"author_person_id" uuid NOT NULL,
	"subject" text,
	"visibility" varchar(24) DEFAULT 'private' NOT NULL,
	"source" varchar(24) DEFAULT 'typed' NOT NULL,
	"transcript" text,
	"summary" text NOT NULL,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_note_visibility_valid" CHECK ("session_notes"."visibility" IN ('private', 'player')),
	CONSTRAINT "session_note_source_valid" CHECK ("session_notes"."source" IN ('typed', 'livekit-voice')),
	CONSTRAINT "session_note_status_valid" CHECK ("session_notes"."status" IN ('draft', 'published', 'archived')),
	CONSTRAINT "session_note_publish_pair_valid" CHECK (("session_notes"."status" = 'published' AND "session_notes"."visibility" = 'player' AND "session_notes"."published_at" IS NOT NULL) OR ("session_notes"."status" <> 'published' AND "session_notes"."published_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "session_operations" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"cancellation_kind" varchar(24),
	"cancellation_reason" text,
	"cancelled_by_person_id" uuid,
	"cancelled_at" timestamp with time zone,
	"weather_snapshot" jsonb,
	"weather_captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_operation_cancellation_kind_valid" CHECK ("session_operations"."cancellation_kind" IS NULL OR "session_operations"."cancellation_kind" IN ('coach', 'weather', 'operator', 'venue', 'other')),
	CONSTRAINT "session_operation_cancellation_pair_valid" CHECK (("session_operations"."cancelled_at" IS NULL AND "session_operations"."cancellation_kind" IS NULL AND "session_operations"."cancellation_reason" IS NULL) OR ("session_operations"."cancelled_at" IS NOT NULL AND "session_operations"."cancellation_kind" IS NOT NULL AND "session_operations"."cancellation_reason" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "catalog_fulfillments" DROP CONSTRAINT "catalog_fulfillment_kind_valid";--> statement-breakpoint
ALTER TABLE "catalog_items" DROP CONSTRAINT "catalog_item_subtype_valid";--> statement-breakpoint
ALTER TABLE "catalog_items" DROP CONSTRAINT "catalog_item_payment_method";--> statement-breakpoint
ALTER TABLE "duna_plus_grants" ALTER COLUMN "reason" SET DEFAULT 'Complimentary Premium+';--> statement-breakpoint
ALTER TABLE "video_quota_policies" ALTER COLUMN "monthly_live_seconds" SET DEFAULT 28800;--> statement-breakpoint
ALTER TABLE "video_quota_policies" ALTER COLUMN "monthly_upload_seconds" SET DEFAULT 108000;--> statement-breakpoint
ALTER TABLE "video_quota_policies" ALTER COLUMN "enforce_upload_limit" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "total_cost_minor" bigint;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "operator_commission_bps_override" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_fee_metadata_status" varchar(24) DEFAULT 'not-connected' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_fee_metadata_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_fee_metadata_error" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_billing_customer_id" varchar(128);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_subscription_id" varchar(128);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_subscription_status" varchar(32);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "plan_billing_interval" varchar(12);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "plan_current_period_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "plan_current_period_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "plan_cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "operator_earnings_goals" ADD CONSTRAINT "operator_earnings_goals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_earnings_goals" ADD CONSTRAINT "operator_earnings_goals_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_payment_collections" ADD CONSTRAINT "operator_payment_collections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_payment_collections" ADD CONSTRAINT "operator_payment_collections_payer_person_id_people_id_fk" FOREIGN KEY ("payer_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_payment_collections" ADD CONSTRAINT "operator_payment_collections_operator_person_id_people_id_fk" FOREIGN KEY ("operator_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_payment_collections" ADD CONSTRAINT "operator_payment_collections_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_payment_events" ADD CONSTRAINT "operator_payment_events_collection_id_operator_payment_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."operator_payment_collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_payment_events" ADD CONSTRAINT "operator_payment_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_terminal_locations" ADD CONSTRAINT "organization_terminal_locations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_attendance" ADD CONSTRAINT "session_attendance_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_attendance" ADD CONSTRAINT "session_attendance_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_attendance" ADD CONSTRAINT "session_attendance_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_attendance" ADD CONSTRAINT "session_attendance_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_attendance" ADD CONSTRAINT "session_attendance_recorded_by_person_id_people_id_fk" FOREIGN KEY ("recorded_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_note_recipients" ADD CONSTRAINT "session_note_recipients_note_id_session_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."session_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_note_recipients" ADD CONSTRAINT "session_note_recipients_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_author_person_id_people_id_fk" FOREIGN KEY ("author_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_operations" ADD CONSTRAINT "session_operations_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_operations" ADD CONSTRAINT "session_operations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_operations" ADD CONSTRAINT "session_operations_cancelled_by_person_id_people_id_fk" FOREIGN KEY ("cancelled_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "operator_earnings_goal_active_unique" ON "operator_earnings_goals" USING btree ("organization_id","person_id") WHERE "operator_earnings_goals"."active" = true;--> statement-breakpoint
CREATE INDEX "operator_earnings_goal_period_idx" ON "operator_earnings_goals" USING btree ("organization_id","person_id","period_starts_at","period_ends_at");--> statement-breakpoint
CREATE INDEX "operator_payment_collection_org_created_idx" ON "operator_payment_collections" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "operator_payment_collection_operator_status_idx" ON "operator_payment_collections" USING btree ("operator_person_id","status","created_at");--> statement-breakpoint
CREATE INDEX "operator_payment_collection_payer_idx" ON "operator_payment_collections" USING btree ("payer_person_id","created_at");--> statement-breakpoint
CREATE INDEX "operator_payment_event_collection_idx" ON "operator_payment_events" USING btree ("collection_id","created_at");--> statement-breakpoint
CREATE INDEX "operator_payment_event_org_created_idx" ON "operator_payment_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_terminal_location_org_unique" ON "organization_terminal_locations" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_attendance_person_unique" ON "session_attendance" USING btree ("session_id","person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_attendance_registration_unique" ON "session_attendance" USING btree ("registration_id") WHERE "session_attendance"."registration_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "session_attendance_org_status_idx" ON "session_attendance" USING btree ("organization_id","status","recorded_at");--> statement-breakpoint
CREATE INDEX "session_note_recipient_person_idx" ON "session_note_recipients" USING btree ("person_id","shared_at");--> statement-breakpoint
CREATE INDEX "session_note_org_session_idx" ON "session_notes" USING btree ("organization_id","session_id","created_at");--> statement-breakpoint
CREATE INDEX "session_operation_org_cancelled_idx" ON "session_operations" USING btree ("organization_id","cancelled_at");--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_organization_created_idx" ON "videos" USING btree ("organization_id","created_at");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_stripe_billing_customer_id_unique" UNIQUE("stripe_billing_customer_id");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id");--> statement-breakpoint
ALTER TABLE "catalog_fulfillments" ADD CONSTRAINT "catalog_fulfillment_kind_valid" CHECK ("catalog_fulfillments"."kind" IN ('registration', 'appointment', 'pickup', 'shipment', 'rental', 'membership', 'credit-grant', 'package'));--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_item_subtype_valid" CHECK (("catalog_items"."type" = 'event' AND "catalog_items"."subtype" IN ('tournament', 'league', 'clinic', 'open-play', 'pickup')) OR ("catalog_items"."type" = 'service' AND "catalog_items"."subtype" IN ('private-lesson', 'group-lesson', 'program', 'court-rental', 'assessment', 'other')) OR ("catalog_items"."type" = 'good' AND "catalog_items"."subtype" IN ('apparel', 'equipment', 'rental', 'swag', 'consumable', 'other')) OR ("catalog_items"."type" = 'plan' AND "catalog_items"."subtype" IN ('membership', 'credit-pack', 'bundle')));--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_item_payment_method" CHECK ("catalog_items"."allow_card" OR "catalog_items"."allow_cash" OR "catalog_items"."allow_credits" OR ("catalog_items"."type" = 'good' AND "catalog_items"."configuration" ->> 'saleEnabled' = 'false'));--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movement_cost_valid" CHECK (("inventory_movements"."unit_cost_minor" IS NULL AND "inventory_movements"."total_cost_minor" IS NULL) OR ("inventory_movements"."unit_cost_minor" >= 0 AND ("inventory_movements"."total_cost_minor" IS NULL OR "inventory_movements"."total_cost_minor" >= 0) AND "inventory_movements"."currency" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organization_plan_valid" CHECK ("organizations"."plan" IN ('coach', 'small-club', 'club', 'multi-venue'));--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organization_commission_override_valid" CHECK ("organizations"."operator_commission_bps_override" IS NULL OR "organizations"."operator_commission_bps_override" BETWEEN 0 AND 2500);--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organization_fee_metadata_status_valid" CHECK ("organizations"."stripe_fee_metadata_status" IN ('not-connected', 'pending', 'synced', 'failed'));--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organization_plan_billing_interval_valid" CHECK ("organizations"."plan_billing_interval" IS NULL OR "organizations"."plan_billing_interval" IN ('month', 'year'));
--> statement-breakpoint
UPDATE "video_quota_policies"
SET
	"monthly_live_seconds" = 28800,
	"monthly_upload_seconds" = 108000,
	"enforce_live_limit" = true,
	"enforce_upload_limit" = true,
	"updated_at" = now()
WHERE
	"person_id" IS NULL
	AND "monthly_live_seconds" = 14400
	AND "monthly_upload_seconds" = 86400
	AND "enforce_live_limit" = true
	AND "enforce_upload_limit" = false;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "duna_reserve_catalog_inventory"(
  p_organization_id uuid,
  p_catalog_variant_id uuid,
  p_order_id uuid,
  p_purpose text,
  p_quantity integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_stock inventory_stock_items%ROWTYPE;
  v_existing integer;
  v_remaining integer := p_quantity;
  v_take integer;
  v_costing_method text;
BEGIN
  IF p_quantity <= 0
     OR p_ends_at <= p_starts_at
     OR p_purpose NOT IN ('sale', 'rental') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'inventory_reservation_invalid';
  END IF;

  SELECT CASE
           WHEN lower(COALESCE(max(i.configuration ->> 'inventoryCostingMethod'), 'fifo')) = 'lifo'
             THEN 'lifo'
           ELSE 'fifo'
         END
    INTO v_costing_method
    FROM catalog_variants AS v
    JOIN catalog_items AS i
      ON i.id = v.catalog_item_id
     AND i.organization_id = p_organization_id
   WHERE v.id = p_catalog_variant_id
     AND v.organization_id = p_organization_id;

  SELECT COALESCE(sum(r.quantity), 0)::integer
    INTO v_existing
    FROM inventory_reservations AS r
   WHERE r.organization_id = p_organization_id
     AND r.source_type = 'catalog-order'
     AND r.source_id = p_order_id::text
     AND r.status = 'held';

  IF v_existing = p_quantity THEN
    RETURN;
  ELSIF v_existing <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'inventory_reservation_conflict';
  END IF;

  FOR v_stock IN
    SELECT s.*
      FROM inventory_stock_items AS s
     WHERE s.organization_id = p_organization_id
       AND s.catalog_variant_id = p_catalog_variant_id
       AND s.purpose = p_purpose::inventory_purpose
       AND s.quantity_on_hand > s.quantity_reserved
     ORDER BY
       CASE WHEN v_costing_method = 'lifo'
         THEN COALESCE(s.acquired_at, s.created_at::date)
       END DESC,
       CASE WHEN v_costing_method = 'lifo' THEN s.created_at END DESC,
       CASE WHEN v_costing_method = 'fifo'
         THEN COALESCE(s.acquired_at, s.created_at::date)
       END ASC,
       CASE WHEN v_costing_method = 'fifo' THEN s.created_at END ASC,
       s.id ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_remaining = 0;
    v_take := LEAST(
      v_remaining,
      v_stock.quantity_on_hand - v_stock.quantity_reserved
    );

    UPDATE inventory_stock_items
       SET quantity_reserved = quantity_reserved + v_take,
           updated_at = p_starts_at
     WHERE id = v_stock.id;

    INSERT INTO inventory_reservations (
      id,
      organization_id,
      inventory_stock_item_id,
      quantity,
      starts_at,
      ends_at,
      source_type,
      source_id,
      status,
      held_until,
      created_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      p_organization_id,
      v_stock.id,
      v_take,
      p_starts_at,
      p_ends_at,
      'catalog-order',
      p_order_id::text,
      'held',
      p_ends_at,
      p_starts_at,
      p_starts_at
    );

    v_remaining := v_remaining - v_take;
  END LOOP;

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'inventory_unavailable';
  END IF;
END;
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "duna_operator_wallet_cash_payment"(
  p_collection_id uuid,
  p_wallet_account_id uuid,
  p_order_id uuid,
  p_amount_minor integer,
  p_currency text,
  p_occurred_at timestamptz
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_collection operator_payment_collections%ROWTYPE;
  v_wallet wallet_accounts%ROWTYPE;
  v_order orders%ROWTYPE;
  v_available bigint;
BEGIN
  IF p_amount_minor <= 0 OR p_currency <> upper(p_currency) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'wallet_payment_amount_invalid';
  END IF;

  SELECT c.*
    INTO v_collection
    FROM operator_payment_collections AS c
   WHERE c.id = p_collection_id
   FOR UPDATE;

  IF NOT FOUND OR v_collection.order_id <> p_order_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'wallet_payment_collection_not_found';
  END IF;

  IF v_collection.status = 'succeeded' THEN
    RETURN 'succeeded';
  END IF;

  IF v_collection.tender <> 'wallet-cash'
     OR v_collection.status NOT IN ('created', 'processing', 'declined')
     OR v_collection.amount_minor <> p_amount_minor
     OR v_collection.currency <> p_currency THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'wallet_payment_collection_invalid';
  END IF;

  SELECT o.*
    INTO v_order
    FROM orders AS o
   WHERE o.id = p_order_id
   FOR UPDATE;

  IF NOT FOUND
     OR v_order.status <> 'pending'
     OR v_order.buyer_person_id <> v_collection.payer_person_id
     OR v_order.organization_id <> v_collection.organization_id
     OR v_order.total_minor <> p_amount_minor
     OR v_order.currency <> p_currency THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'wallet_payment_order_invalid';
  END IF;

  SELECT w.*
    INTO v_wallet
    FROM wallet_accounts AS w
   WHERE w.id = p_wallet_account_id
   FOR UPDATE;

  IF NOT FOUND
     OR v_wallet.person_id <> v_collection.payer_person_id
     OR v_wallet.currency <> p_currency
     OR v_wallet.spending_blocked
     OR EXISTS (
       SELECT 1
         FROM people AS p
        WHERE p.id = v_collection.payer_person_id
          AND p.is_minor = true
     ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'wallet_payment_wallet_restricted';
  END IF;

  SELECT COALESCE(SUM(
    CASE
      WHEN l.status IN ('available', 'complete') AND l.direction = 'credit'
        THEN l.amount_minor
      WHEN l.status IN ('available', 'complete') AND l.direction = 'debit'
        THEN -l.amount_minor
      ELSE 0
    END
  ), 0)
    INTO v_available
    FROM wallet_ledger AS l
   WHERE l.wallet_account_id = v_wallet.id
     AND l.currency = p_currency;

  IF v_available < p_amount_minor THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'insufficient_wallet_cash';
  END IF;

  INSERT INTO wallet_ledger (
    wallet_account_id,
    direction,
    kind,
    amount_minor,
    currency,
    status,
    tax_character,
    reference_type,
    reference_id,
    reason_code,
    available_at,
    created_at
  )
  VALUES (
    v_wallet.id,
    'debit',
    'booking',
    p_amount_minor,
    p_currency,
    'complete',
    'none',
    'operator-payment',
    p_collection_id,
    'operator_in_person_payment',
    p_occurred_at,
    p_occurred_at
  );

  UPDATE orders
     SET status = 'paid',
         wallet_applied_minor = p_amount_minor,
         updated_at = p_occurred_at
   WHERE id = p_order_id;

  INSERT INTO payments (
    order_id,
    method,
    amount_minor,
    currency,
    status,
    created_at,
    updated_at
  )
  VALUES (
    p_order_id,
    'wallet-cash',
    p_amount_minor,
    p_currency,
    'succeeded',
    p_occurred_at,
    p_occurred_at
  );

  UPDATE operator_payment_collections
     SET status = 'succeeded',
         wallet_cash_applied_minor = p_amount_minor,
         completed_at = p_occurred_at,
         updated_at = p_occurred_at
   WHERE id = p_collection_id;

  INSERT INTO operator_payment_events (
    collection_id,
    organization_id,
    event_type,
    status,
    idempotency_key,
    message,
    created_at
  )
  VALUES (
    p_collection_id,
    v_collection.organization_id,
    'wallet.approved',
    'succeeded',
    'operator-payment:' || p_collection_id::text || ':wallet-approved',
    'Player cash wallet payment completed.',
    p_occurred_at
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN 'succeeded';
END;
$function$;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "people_teammate_search_trgm_idx"
ON "people"
USING gin (
  (
    coalesce("display_name", '') || ' ' ||
    coalesce("handle", '') || ' ' ||
    coalesce("home_market", '')
  ) gin_trgm_ops
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_member_person_recent_idx"
ON "team_members" USING btree ("person_id", "joined_at" DESC);
