CREATE TABLE "event_blueprints" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"short_summary" text,
	"description" text,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"location" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"policies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recurrence" jsonb,
	"registration_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "divisions" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "divisions" ADD COLUMN "minimum_teams" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "divisions" ADD COLUMN "maximum_teams" integer;--> statement-breakpoint
ALTER TABLE "divisions" ADD COLUMN "team_size" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "divisions" ADD COLUMN "price_basis" varchar(24) DEFAULT 'per-team' NOT NULL;--> statement-breakpoint
ALTER TABLE "divisions" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_types" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "ticket_types" ADD COLUMN "available_online" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_types" ADD COLUMN "available_in_person" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_types" ADD COLUMN "waitlist_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "event_blueprints" ADD CONSTRAINT "event_blueprints_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "duna_hold_event_tickets"(
  p_ticket_type_id uuid,
  p_order_id uuid,
  p_owner_person_id uuid,
  p_quantity integer
)
RETURNS TABLE(result_status text, held_count integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_ticket_type ticket_types%ROWTYPE;
  v_existing integer;
  v_active integer;
BEGIN
  IF p_quantity < 1 OR p_quantity > 10 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ticket_quantity_invalid';
  END IF;

  SELECT tt.*
    INTO v_ticket_type
    FROM ticket_types AS tt
   WHERE tt.id = p_ticket_type_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ticket_type_not_found';
  END IF;

  SELECT count(*)::integer
    INTO v_existing
    FROM tickets AS t
   WHERE t.order_id = p_order_id
     AND t.ticket_type_id = p_ticket_type_id
     AND t.status IN ('held', 'issued', 'transferred', 'scanned');

  IF v_existing > 0 THEN
    RETURN QUERY SELECT 'held'::text, v_existing;
    RETURN;
  END IF;

  IF v_ticket_type.hidden
     OR NOT v_ticket_type.available_online
     OR v_ticket_type.manual_sold_out
     OR p_quantity < v_ticket_type.minimum_per_order
     OR p_quantity > v_ticket_type.maximum_per_order
     OR (
       v_ticket_type.sales_starts_at IS NOT NULL
       AND v_ticket_type.sales_starts_at > now()
     )
     OR (
       v_ticket_type.sales_ends_at IS NOT NULL
       AND v_ticket_type.sales_ends_at <= now()
     ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ticket_type_unavailable';
  END IF;

  SELECT count(*)::integer
    INTO v_active
    FROM tickets AS t
   WHERE t.ticket_type_id = p_ticket_type_id
     AND t.status IN ('held', 'issued', 'transferred', 'scanned');

  IF v_ticket_type.quantity IS NOT NULL
     AND v_active + p_quantity > v_ticket_type.quantity THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ticket_quantity_unavailable';
  END IF;

  INSERT INTO tickets (
    ticket_type_id,
    order_id,
    owner_person_id,
    token,
    status
  )
  SELECT
    p_ticket_type_id,
    p_order_id,
    p_owner_person_id,
    replace(gen_random_uuid()::text, '-', '') ||
      replace(gen_random_uuid()::text, '-', ''),
    'held'
  FROM generate_series(1, p_quantity);

  RETURN QUERY SELECT 'held'::text, p_quantity;
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
  v_pickup_participant pickup_participants%ROWTYPE;
  v_court_booking court_bookings%ROWTYPE;
  v_ticket_count integer := 0;
  v_pending_ticket_count integer := 0;
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

  SELECT cb.*
    INTO v_court_booking
    FROM court_bookings AS cb
   WHERE cb.order_id = p_order_id
   FOR UPDATE;

  IF v_court_booking.id IS NOT NULL
     AND (
       v_court_booking.status <> 'held'
       OR v_court_booking.hold_expires_at IS NULL
       OR v_court_booking.hold_expires_at < p_paid_at
     ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'court_booking_hold_expired';
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

  UPDATE pickup_participants
     SET status = 'confirmed',
         hold_expires_at = NULL,
         updated_at = p_paid_at
   WHERE order_id = p_order_id
     AND status = 'pending'
  RETURNING * INTO v_pickup_participant;

  UPDATE court_bookings
     SET status = 'confirmed',
         hold_expires_at = NULL,
         updated_at = p_paid_at
   WHERE order_id = p_order_id
     AND status = 'held'
  RETURNING * INTO v_court_booking;

  UPDATE tickets AS t
     SET status = 'issued',
         updated_at = p_paid_at
    FROM ticket_types AS tt
   WHERE t.order_id = p_order_id
     AND t.status = 'held'
     AND t.ticket_type_id = tt.id
     AND NOT tt.approval_required;
  GET DIAGNOSTICS v_ticket_count = ROW_COUNT;

  SELECT count(*)::integer
    INTO v_pending_ticket_count
    FROM tickets AS t
    JOIN ticket_types AS tt ON tt.id = t.ticket_type_id
   WHERE t.order_id = p_order_id
     AND t.status = 'held'
     AND tt.approval_required;

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
      WHEN v_registration.id IS NOT NULL
        THEN 'Stripe payment projected and the held registration was confirmed.'
      WHEN v_pickup_participant.id IS NOT NULL
        THEN 'Stripe payment projected and the held pickup spot was confirmed.'
      WHEN v_court_booking.id IS NOT NULL
        THEN 'Stripe payment projected and the held court booking was confirmed.'
      WHEN v_pending_ticket_count > 0
        THEN 'Stripe payment projected and the held event tickets await operator approval.'
      WHEN v_ticket_count > 0
        THEN 'Stripe payment projected and the held event tickets were issued.'
      ELSE 'Stripe payment projected to the order ledger.'
    END,
    p_trace_id,
    p_paid_at
  );

  RETURN 'paid';
END;
$function$;
