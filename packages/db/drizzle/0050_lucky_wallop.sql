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
ALTER TABLE "operator_earnings_goals" ADD CONSTRAINT "operator_earnings_goals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_earnings_goals" ADD CONSTRAINT "operator_earnings_goals_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_payment_collections" ADD CONSTRAINT "operator_payment_collections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_payment_collections" ADD CONSTRAINT "operator_payment_collections_payer_person_id_people_id_fk" FOREIGN KEY ("payer_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_payment_collections" ADD CONSTRAINT "operator_payment_collections_operator_person_id_people_id_fk" FOREIGN KEY ("operator_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_payment_collections" ADD CONSTRAINT "operator_payment_collections_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_payment_events" ADD CONSTRAINT "operator_payment_events_collection_id_operator_payment_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."operator_payment_collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_payment_events" ADD CONSTRAINT "operator_payment_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_terminal_locations" ADD CONSTRAINT "organization_terminal_locations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "operator_earnings_goal_active_unique" ON "operator_earnings_goals" USING btree ("organization_id","person_id") WHERE "operator_earnings_goals"."active" = true;--> statement-breakpoint
CREATE INDEX "operator_earnings_goal_period_idx" ON "operator_earnings_goals" USING btree ("organization_id","person_id","period_starts_at","period_ends_at");--> statement-breakpoint
CREATE INDEX "operator_payment_collection_org_created_idx" ON "operator_payment_collections" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "operator_payment_collection_operator_status_idx" ON "operator_payment_collections" USING btree ("operator_person_id","status","created_at");--> statement-breakpoint
CREATE INDEX "operator_payment_collection_payer_idx" ON "operator_payment_collections" USING btree ("payer_person_id","created_at");--> statement-breakpoint
CREATE INDEX "operator_payment_event_collection_idx" ON "operator_payment_events" USING btree ("collection_id","created_at");--> statement-breakpoint
CREATE INDEX "operator_payment_event_org_created_idx" ON "operator_payment_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_terminal_location_org_unique" ON "organization_terminal_locations" USING btree ("organization_id");
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
