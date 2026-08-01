CREATE TABLE "catalog_fulfillments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"catalog_variant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" varchar(32) NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fulfilled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_fulfillment_kind_valid" CHECK ("catalog_fulfillments"."kind" IN ('registration', 'appointment', 'pickup', 'shipment', 'rental', 'membership', 'credit-grant')),
	CONSTRAINT "catalog_fulfillment_status_valid" CHECK ("catalog_fulfillments"."status" IN ('held', 'pending', 'ready', 'fulfilled', 'cancelled', 'refunded'))
);
--> statement-breakpoint
CREATE TABLE "organization_credit_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"organization_wallet_id" uuid NOT NULL,
	"organization_credit_grant_id" uuid NOT NULL,
	"journal_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"credits" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_credit_application_positive" CHECK ("organization_credit_applications"."credits" > 0)
);
--> statement-breakpoint
ALTER TABLE "catalog_fulfillments" ADD CONSTRAINT "catalog_fulfillments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_fulfillments" ADD CONSTRAINT "catalog_fulfillments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_fulfillments" ADD CONSTRAINT "catalog_fulfillments_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_fulfillments" ADD CONSTRAINT "catalog_fulfillments_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_fulfillments" ADD CONSTRAINT "catalog_fulfillments_catalog_variant_id_catalog_variants_id_fk" FOREIGN KEY ("catalog_variant_id") REFERENCES "public"."catalog_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_fulfillments" ADD CONSTRAINT "catalog_fulfillments_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_credit_applications" ADD CONSTRAINT "organization_credit_applications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_credit_applications" ADD CONSTRAINT "organization_credit_applications_organization_wallet_id_organization_wallets_id_fk" FOREIGN KEY ("organization_wallet_id") REFERENCES "public"."organization_wallets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_credit_applications" ADD CONSTRAINT "organization_credit_applications_organization_credit_grant_id_organization_credit_grants_id_fk" FOREIGN KEY ("organization_credit_grant_id") REFERENCES "public"."organization_credit_grants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_credit_applications" ADD CONSTRAINT "organization_credit_applications_journal_id_ledger_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."ledger_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_credit_applications" ADD CONSTRAINT "organization_credit_applications_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_fulfillment_order_item_unique" ON "catalog_fulfillments" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "catalog_fulfillment_person_status_idx" ON "catalog_fulfillments" USING btree ("organization_id","person_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_credit_application_journal_grant_unique" ON "organization_credit_applications" USING btree ("journal_id","organization_credit_grant_id");--> statement-breakpoint
CREATE INDEX "organization_credit_application_wallet_idx" ON "organization_credit_applications" USING btree ("organization_id","organization_wallet_id","created_at");--> statement-breakpoint
CREATE INDEX "organization_credit_application_order_idx" ON "organization_credit_applications" USING btree ("order_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "duna_redeem_organization_credits"(
  p_organization_id uuid,
  p_person_id uuid,
  p_order_id uuid,
  p_credits integer,
  p_wallet_account_id uuid,
  p_control_account_id uuid,
  p_journal_id uuid,
  p_idempotency_key text,
  p_occurred_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_wallet organization_wallets%ROWTYPE;
  v_order orders%ROWTYPE;
  v_grant organization_credit_grants%ROWTYPE;
  v_remaining integer := p_credits;
  v_take integer;
  v_sequence integer := 0;
BEGIN
  IF p_credits <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'credit_amount_invalid';
  END IF;

  SELECT o.*
    INTO v_order
    FROM orders AS o
   WHERE o.id = p_order_id
     AND o.organization_id = p_organization_id
     AND o.buyer_person_id = p_person_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'credit_order_not_found';
  END IF;

  IF v_order.status = 'paid' THEN
    RETURN;
  END IF;

  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'credit_order_not_payable';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM ledger_journals
     WHERE organization_id = p_organization_id
       AND idempotency_key = p_idempotency_key
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'credit_redemption_in_progress';
  END IF;

  SELECT w.*
    INTO v_wallet
    FROM organization_wallets AS w
   WHERE w.organization_id = p_organization_id
     AND w.person_id = p_person_id
     AND w.status = 'active'
   FOR UPDATE;

  IF NOT FOUND
     OR v_wallet.credit_ledger_account_id <> p_wallet_account_id
     OR v_wallet.cached_available_credits < p_credits THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'insufficient_organization_credits';
  END IF;

  INSERT INTO ledger_journals (
    id,
    organization_id,
    idempotency_key,
    source_type,
    source_id,
    description,
    status,
    actor_person_id,
    occurred_at,
    metadata
  )
  VALUES (
    p_journal_id,
    p_organization_id,
    p_idempotency_key,
    'catalog-credit-redemption',
    p_order_id::text,
    'Organization credits redeemed for catalog order',
    'draft',
    p_person_id,
    p_occurred_at,
    jsonb_build_object(
      'orderId', p_order_id,
      'personId', p_person_id,
      'credits', p_credits
    )
  );

  INSERT INTO ledger_entries (
    id,
    organization_id,
    journal_id,
    account_id,
    sequence,
    side,
    amount,
    unit_kind,
    unit,
    memo
  )
  VALUES
    (
      gen_random_uuid(),
      p_organization_id,
      p_journal_id,
      p_wallet_account_id,
      0,
      'debit',
      p_credits,
      'organization-credit',
      p_organization_id::text || ':CREDIT',
      'Reduce member organization-credit liability'
    ),
    (
      gen_random_uuid(),
      p_organization_id,
      p_journal_id,
      p_control_account_id,
      1,
      'credit',
      p_credits,
      'organization-credit',
      p_organization_id::text || ':CREDIT',
      'Offset redeemed organization credits'
    );

  FOR v_grant IN
    SELECT g.*
      FROM organization_credit_grants AS g
     WHERE g.organization_id = p_organization_id
       AND g.organization_wallet_id = v_wallet.id
       AND g.status = 'active'
       AND g.remaining_credits > 0
       AND (g.expires_at IS NULL OR g.expires_at > p_occurred_at)
     ORDER BY g.expires_at ASC NULLS LAST, g.created_at ASC, g.id ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_remaining = 0;
    v_take := LEAST(v_remaining, v_grant.remaining_credits);

    UPDATE organization_credit_grants
       SET remaining_credits = remaining_credits - v_take,
           status = CASE
             WHEN remaining_credits - v_take = 0 THEN 'exhausted'
             ELSE status
           END,
           updated_at = p_occurred_at
     WHERE id = v_grant.id;

    INSERT INTO organization_credit_applications (
      id,
      organization_id,
      organization_wallet_id,
      organization_credit_grant_id,
      journal_id,
      order_id,
      credits
    )
    VALUES (
      gen_random_uuid(),
      p_organization_id,
      v_wallet.id,
      v_grant.id,
      p_journal_id,
      p_order_id,
      v_take
    );

    v_remaining := v_remaining - v_take;
    v_sequence := v_sequence + 1;
  END LOOP;

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'insufficient_unexpired_organization_credits';
  END IF;

  UPDATE organization_wallets
     SET cached_available_credits = cached_available_credits - p_credits,
         cached_at = p_occurred_at,
         updated_at = p_occurred_at
   WHERE id = v_wallet.id
     AND cached_available_credits >= p_credits;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'organization_credit_wallet_changed';
  END IF;

  UPDATE ledger_journals
     SET status = 'posted',
         posted_at = p_occurred_at
   WHERE id = p_journal_id
     AND status = 'draft';

  UPDATE orders
     SET status = 'paid',
         updated_at = p_occurred_at
   WHERE id = p_order_id
     AND status = 'pending';
END;
$function$;
