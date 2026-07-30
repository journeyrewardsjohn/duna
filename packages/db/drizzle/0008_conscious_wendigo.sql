ALTER TABLE "orders" ADD COLUMN "stripe_checkout_session_id" varchar(128);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "order_id" uuid;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "hold_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "registration_order_unique" ON "registrations" USING btree ("order_id") WHERE "registrations"."order_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_stripe_checkout_session_id_unique" UNIQUE("stripe_checkout_session_id");--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registration_pending_hold_required" CHECK ("registrations"."status" <> 'pending' OR ("registrations"."order_id" IS NOT NULL AND "registrations"."hold_expires_at" IS NOT NULL));--> statement-breakpoint
CREATE OR REPLACE FUNCTION "duna_hold_session_registration"(
  p_session_id uuid,
  p_subject_person_id uuid,
  p_actor_person_id uuid,
  p_order_id uuid,
  p_hold_expires_at timestamptz,
  p_eligibility_decision jsonb,
  p_eligibility_rule_version integer,
  p_trace_id text,
  p_ip_address text
)
RETURNS TABLE (
  registration_id uuid,
  result_status text,
  spots_remaining integer
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_session sessions%ROWTYPE;
  v_existing registrations%ROWTYPE;
  v_occupied integer;
  v_organization_id uuid;
BEGIN
  SELECT s.*
    INTO v_session
    FROM sessions AS s
   WHERE s.id = p_session_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'session_not_found';
  END IF;

  IF v_session.status NOT IN ('published', 'registration-open') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'session_not_open';
  END IF;

  IF v_session.ends_at <= now() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'session_has_ended';
  END IF;

  IF COALESCE(p_eligibility_decision->>'status', '') <> 'eligible' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'registration_ineligible';
  END IF;

  UPDATE registrations
     SET status = 'cancelled',
         updated_at = now()
   WHERE session_id = p_session_id
     AND status = 'pending'
     AND hold_expires_at <= now();

  UPDATE orders
     SET status = 'cancelled',
         updated_at = now()
   WHERE id IN (
     SELECT r.order_id
       FROM registrations AS r
      WHERE r.session_id = p_session_id
        AND r.status = 'cancelled'
        AND r.hold_expires_at <= now()
        AND r.order_id IS NOT NULL
   )
     AND status IN ('draft', 'pending');

  SELECT r.*
    INTO v_existing
    FROM registrations AS r
   WHERE r.session_id = p_session_id
     AND r.person_id = p_subject_person_id;

  SELECT count(*)::integer
    INTO v_occupied
    FROM registrations AS r
   WHERE r.session_id = p_session_id
     AND (
       r.status IN ('confirmed', 'checked-in')
       OR (r.status = 'pending' AND r.hold_expires_at > now())
     );

  IF v_existing.id IS NOT NULL
     AND v_existing.status IN ('confirmed', 'checked-in') THEN
    RETURN QUERY
      SELECT
        v_existing.id,
        'confirmed'::text,
        GREATEST(v_session.capacity - v_occupied, 0);
    RETURN;
  END IF;

  IF v_existing.id IS NOT NULL
     AND v_existing.status = 'pending'
     AND v_existing.hold_expires_at > now() THEN
    RETURN QUERY
      SELECT
        v_existing.id,
        'pending'::text,
        GREATEST(v_session.capacity - v_occupied, 0);
    RETURN;
  END IF;

  IF v_occupied >= v_session.capacity THEN
    RETURN QUERY
      SELECT
        NULL::uuid,
        'full'::text,
        0::integer;
    RETURN;
  END IF;

  IF v_existing.id IS NULL THEN
    INSERT INTO registrations (
      session_id,
      person_id,
      status,
      eligibility_decision,
      eligibility_rule_version,
      order_id,
      hold_expires_at
    )
    VALUES (
      p_session_id,
      p_subject_person_id,
      'pending',
      p_eligibility_decision,
      p_eligibility_rule_version,
      p_order_id,
      p_hold_expires_at
    )
    RETURNING * INTO v_existing;
  ELSE
    UPDATE registrations
       SET status = 'pending',
           eligibility_decision = p_eligibility_decision,
           eligibility_rule_version = p_eligibility_rule_version,
           order_id = p_order_id,
           hold_expires_at = p_hold_expires_at,
           updated_at = now()
     WHERE id = v_existing.id
    RETURNING * INTO v_existing;

    DELETE FROM waitlist_entries
     WHERE session_id = p_session_id
       AND person_id = p_subject_person_id;
  END IF;

  SELECT COALESCE(p.organization_id, et.organization_id, v.organization_id)
    INTO v_organization_id
    FROM sessions AS s
    LEFT JOIN programs AS p ON p.id = s.program_id
    LEFT JOIN event_types AS et ON et.id = s.event_type_id
    LEFT JOIN venues AS v ON v.id = s.venue_id
   WHERE s.id = p_session_id;

  INSERT INTO audit_log (
    organization_id,
    actor_person_id,
    actor_type,
    action,
    entity_type,
    entity_id,
    reason,
    trace_id,
    ip_address
  )
  VALUES (
    v_organization_id,
    p_actor_person_id,
    'person',
    'registration.held',
    'registration',
    v_existing.id::text,
    'Capacity held while Stripe checkout is active.',
    p_trace_id,
    p_ip_address
  );

  RETURN QUERY
    SELECT
      v_existing.id,
      'pending'::text,
      GREATEST(v_session.capacity - v_occupied - 1, 0);
END;
$function$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "duna_project_order_payment"(
  p_order_id uuid,
  p_payment_intent_id text,
  p_charge_id text,
  p_paid_at timestamptz,
  p_trace_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_order orders%ROWTYPE;
  v_registration registrations%ROWTYPE;
BEGIN
  SELECT o.*
    INTO v_order
    FROM orders AS o
   WHERE o.id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'order_not_found';
  END IF;

  IF v_order.status = 'paid' THEN
    RETURN 'paid';
  END IF;

  IF v_order.status NOT IN ('draft', 'pending') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'order_not_payable';
  END IF;

  UPDATE orders
     SET status = 'paid',
         stripe_payment_intent_id = p_payment_intent_id,
         updated_at = p_paid_at
   WHERE id = p_order_id;

  INSERT INTO payments (
    order_id,
    method,
    amount_minor,
    currency,
    stripe_charge_id,
    status,
    created_at,
    updated_at
  )
  VALUES (
    p_order_id,
    'stripe-checkout',
    v_order.total_minor,
    v_order.currency,
    p_charge_id,
    'succeeded',
    p_paid_at,
    p_paid_at
  )
  ON CONFLICT ("stripe_charge_id") DO NOTHING;

  UPDATE registrations
     SET status = 'confirmed',
         hold_expires_at = NULL,
         updated_at = p_paid_at
   WHERE order_id = p_order_id
     AND status = 'pending'
  RETURNING * INTO v_registration;

  INSERT INTO audit_log (
    organization_id,
    actor_type,
    action,
    entity_type,
    entity_id,
    reason,
    trace_id,
    created_at
  )
  VALUES (
    v_order.organization_id,
    'system',
    'order.payment_succeeded',
    'order',
    v_order.id::text,
    CASE
      WHEN v_registration.id IS NULL
        THEN 'Stripe payment projected to the order ledger.'
      ELSE 'Stripe payment projected and the held registration was confirmed.'
    END,
    p_trace_id,
    p_paid_at
  );

  RETURN 'paid';
END;
$function$;
