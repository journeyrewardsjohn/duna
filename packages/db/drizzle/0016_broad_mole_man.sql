ALTER TABLE "court_bookings" ADD COLUMN IF NOT EXISTS "buffer_before_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "court_bookings" ADD COLUMN IF NOT EXISTS "buffer_after_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "courts" ADD COLUMN IF NOT EXISTS "rate_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "courts" ADD COLUMN IF NOT EXISTS "minimum_notice_minutes" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "courts" ADD COLUMN IF NOT EXISTS "maximum_advance_days" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "courts" ADD COLUMN IF NOT EXISTS "cancellation_policy" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "rate_plans" ADD COLUMN IF NOT EXISTS "rate_unit_minutes" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "courts" DROP CONSTRAINT IF EXISTS "courts_rate_plan_id_rate_plans_id_fk";--> statement-breakpoint
ALTER TABLE "courts" ADD CONSTRAINT "courts_rate_plan_id_rate_plans_id_fk" FOREIGN KEY ("rate_plan_id") REFERENCES "public"."rate_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_bookings" DROP CONSTRAINT IF EXISTS "court_booking_buffers_valid";--> statement-breakpoint
ALTER TABLE "court_bookings" ADD CONSTRAINT "court_booking_buffers_valid" CHECK ("court_bookings"."buffer_before_minutes" >= 0 AND "court_bookings"."buffer_after_minutes" >= 0);--> statement-breakpoint
ALTER TABLE "courts" DROP CONSTRAINT IF EXISTS "court_booking_window_valid";--> statement-breakpoint
ALTER TABLE "courts" ADD CONSTRAINT "court_booking_window_valid" CHECK ("courts"."minimum_notice_minutes" >= 0 AND "courts"."maximum_advance_days" > 0);--> statement-breakpoint
ALTER TABLE "rate_plans" DROP CONSTRAINT IF EXISTS "rate_plan_amounts_nonnegative";--> statement-breakpoint
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plan_amounts_nonnegative" CHECK ("rate_plans"."base_amount_minor" >= 0 AND ("rate_plans"."member_amount_minor" IS NULL OR "rate_plans"."member_amount_minor" >= 0) AND ("rate_plans"."non_member_amount_minor" IS NULL OR "rate_plans"."non_member_amount_minor" >= 0));--> statement-breakpoint
ALTER TABLE "rate_plans" DROP CONSTRAINT IF EXISTS "rate_plan_unit_positive";--> statement-breakpoint
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plan_unit_positive" CHECK ("rate_plans"."rate_unit_minutes" > 0);--> statement-breakpoint
ALTER TABLE "court_bookings" DROP CONSTRAINT IF EXISTS "court_bookings_no_overlap";--> statement-breakpoint
CREATE OR REPLACE FUNCTION "duna_court_booking_occupied_range"(
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_buffer_before_minutes integer,
  p_buffer_after_minutes integer
)
RETURNS tstzrange
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $function$
  SELECT tstzrange(
    p_starts_at - (p_buffer_before_minutes * interval '1 minute'),
    p_ends_at + (p_buffer_after_minutes * interval '1 minute'),
    '[)'
  )
$function$;--> statement-breakpoint
ALTER TABLE "court_bookings"
  ADD CONSTRAINT "court_bookings_no_overlap"
  EXCLUDE USING gist (
    "court_id" WITH =,
    duna_court_booking_occupied_range(
      "starts_at",
      "ends_at",
      "buffer_before_minutes",
      "buffer_after_minutes"
    ) WITH &&
  )
  WHERE ("status" IN ('held', 'confirmed'));--> statement-breakpoint
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
      ELSE 'Stripe payment projected to the order ledger.'
    END,
    p_trace_id,
    p_paid_at
  );

  RETURN 'paid';
END;
$function$;
