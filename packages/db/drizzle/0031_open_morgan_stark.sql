ALTER TABLE "organization_credit_applications" ADD COLUMN "value_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_credit_applications" ADD COLUMN "currency" varchar(3);--> statement-breakpoint
ALTER TABLE "organization_credit_grants" ADD COLUMN "source_order_id" uuid;--> statement-breakpoint
ALTER TABLE "organization_credit_grants" ADD COLUMN "initial_value_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_credit_grants" ADD COLUMN "remaining_value_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_credit_grants" ADD COLUMN "currency" varchar(3);--> statement-breakpoint
ALTER TABLE "organization_credit_grants" ADD CONSTRAINT "organization_credit_grants_source_order_id_orders_id_fk" FOREIGN KEY ("source_order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_credit_grant_source_order_idx" ON "organization_credit_grants" USING btree ("organization_id","source_order_id");--> statement-breakpoint
ALTER TABLE "organization_credit_applications" ADD CONSTRAINT "organization_credit_application_value_valid" CHECK ("organization_credit_applications"."value_minor" >= 0 AND (("organization_credit_applications"."value_minor" = 0 AND "organization_credit_applications"."currency" IS NULL) OR ("organization_credit_applications"."value_minor" > 0 AND "organization_credit_applications"."currency" IS NOT NULL AND "organization_credit_applications"."currency" = upper("organization_credit_applications"."currency"))));--> statement-breakpoint
ALTER TABLE "organization_credit_grants" ADD CONSTRAINT "organization_credit_grant_value_valid" CHECK ("organization_credit_grants"."initial_value_minor" >= 0 AND "organization_credit_grants"."remaining_value_minor" >= 0 AND "organization_credit_grants"."remaining_value_minor" <= "organization_credit_grants"."initial_value_minor" AND (("organization_credit_grants"."initial_value_minor" = 0 AND "organization_credit_grants"."currency" IS NULL) OR ("organization_credit_grants"."initial_value_minor" > 0 AND "organization_credit_grants"."currency" IS NOT NULL AND "organization_credit_grants"."currency" = upper("organization_credit_grants"."currency"))));
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
BEGIN
  IF p_quantity <= 0
     OR p_ends_at <= p_starts_at
     OR p_purpose NOT IN ('sale', 'rental') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'inventory_reservation_invalid';
  END IF;

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
     ORDER BY s.created_at ASC, s.id ASC
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
DROP FUNCTION IF EXISTS "duna_redeem_organization_credits"(
  uuid,
  uuid,
  uuid,
  integer,
  uuid,
  uuid,
  uuid,
  text,
  timestamptz
);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "duna_redeem_organization_credits"(
  p_organization_id uuid,
  p_person_id uuid,
  p_order_id uuid,
  p_credits integer,
  p_wallet_account_id uuid,
  p_control_account_id uuid,
  p_credit_journal_id uuid,
  p_deferred_revenue_account_id uuid,
  p_earned_revenue_account_id uuid,
  p_money_journal_id uuid,
  p_currency text,
  p_idempotency_key text,
  p_occurred_at timestamptz
)
RETURNS bigint
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
  v_value bigint;
  v_redeemed_value bigint := 0;
BEGIN
  IF p_credits <= 0 OR p_currency <> upper(p_currency) THEN
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
    RETURN 0;
  END IF;

  IF v_order.status <> 'pending' OR v_order.currency <> p_currency THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'credit_order_not_payable';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM ledger_journals
     WHERE organization_id = p_organization_id
       AND idempotency_key IN (
         p_idempotency_key,
         p_idempotency_key || ':value'
       )
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
    p_credit_journal_id,
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
      p_credit_journal_id,
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
      p_credit_journal_id,
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
    v_value := CASE
      WHEN v_take = v_grant.remaining_credits
        THEN v_grant.remaining_value_minor
      ELSE (
        v_grant.remaining_value_minor * v_take /
        v_grant.remaining_credits
      )
    END;

    UPDATE organization_credit_grants
       SET remaining_credits = remaining_credits - v_take,
           remaining_value_minor = remaining_value_minor - v_value,
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
      credits,
      value_minor,
      currency
    )
    VALUES (
      gen_random_uuid(),
      p_organization_id,
      v_wallet.id,
      v_grant.id,
      p_credit_journal_id,
      p_order_id,
      v_take,
      v_value,
      CASE WHEN v_value > 0 THEN v_grant.currency ELSE NULL END
    );

    v_remaining := v_remaining - v_take;
    v_redeemed_value := v_redeemed_value + v_value;
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
   WHERE id = p_credit_journal_id
     AND status = 'draft';

  IF v_redeemed_value > 0 THEN
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
      p_money_journal_id,
      p_organization_id,
      p_idempotency_key || ':value',
      'catalog-credit-revenue',
      p_order_id::text,
      'Deferred credit value recognized at redemption',
      'draft',
      p_person_id,
      p_occurred_at,
      jsonb_build_object(
        'orderId', p_order_id,
        'credits', p_credits,
        'valueMinor', v_redeemed_value,
        'currency', p_currency
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
      currency,
      memo
    )
    VALUES
      (
        gen_random_uuid(),
        p_organization_id,
        p_money_journal_id,
        p_deferred_revenue_account_id,
        0,
        'debit',
        v_redeemed_value,
        'money',
        p_currency,
        p_currency,
        'Release deferred organization-credit value'
      ),
      (
        gen_random_uuid(),
        p_organization_id,
        p_money_journal_id,
        p_earned_revenue_account_id,
        1,
        'credit',
        v_redeemed_value,
        'money',
        p_currency,
        p_currency,
        'Recognize catalog revenue from redeemed credits'
      );

    UPDATE ledger_journals
       SET status = 'posted',
           posted_at = p_occurred_at
     WHERE id = p_money_journal_id
       AND status = 'draft';
  END IF;

  UPDATE orders
     SET status = 'paid',
         updated_at = p_occurred_at
   WHERE id = p_order_id
     AND status = 'pending';

  RETURN v_redeemed_value;
END;
$function$;
