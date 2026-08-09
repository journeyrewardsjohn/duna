DROP INDEX "pickup_participant_order_unique";--> statement-breakpoint
ALTER TABLE "pickup_participants" ADD COLUMN "added_by_person_id" uuid;--> statement-breakpoint
ALTER TABLE "pickup_participants" ADD COLUMN "paid_by_person_id" uuid;--> statement-breakpoint
ALTER TABLE "pickup_participants" ADD CONSTRAINT "pickup_participants_added_by_person_id_people_id_fk" FOREIGN KEY ("added_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_participants" ADD CONSTRAINT "pickup_participants_paid_by_person_id_people_id_fk" FOREIGN KEY ("paid_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pickup_participant_order_idx" ON "pickup_participants" USING btree ("order_id") WHERE "pickup_participants"."order_id" IS NOT NULL;--> statement-breakpoint
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
  v_pickup_participant_count integer := 0;
  v_court_booking court_bookings%ROWTYPE;
  v_booking_participant court_booking_participants%ROWTYPE;
  v_ticket_count integer := 0;
  v_pending_ticket_count integer := 0;
  v_funded_amount integer := 0;
  v_paid_participants integer := 0;
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

  IF v_court_booking.id IS NULL THEN
    SELECT cbp.*
      INTO v_booking_participant
      FROM court_booking_participants AS cbp
     WHERE cbp.order_id = p_order_id
     FOR UPDATE;

    IF v_booking_participant.id IS NOT NULL THEN
      SELECT cb.*
        INTO v_court_booking
        FROM court_bookings AS cb
       WHERE cb.id = v_booking_participant.booking_id
       FOR UPDATE;
    END IF;
  END IF;

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
     AND status = 'pending';
  GET DIAGNOSTICS v_pickup_participant_count = ROW_COUNT;

  IF v_booking_participant.id IS NOT NULL THEN
    UPDATE court_booking_participants
       SET status = 'paid',
           paid_at = p_paid_at,
           accepted_at = COALESCE(accepted_at, p_paid_at),
           updated_at = p_paid_at
     WHERE id = v_booking_participant.id;

    SELECT
      COALESCE(sum(cbp.share_amount_minor), 0)::integer,
      count(*)::integer
      INTO v_funded_amount, v_paid_participants
      FROM court_booking_participants AS cbp
     WHERE cbp.booking_id = v_court_booking.id
       AND cbp.status = 'paid';

    UPDATE court_bookings
       SET funded_amount_minor = LEAST(total_amount_minor, v_funded_amount),
           status = CASE
             WHEN v_funded_amount >= total_amount_minor
              AND v_paid_participants >= participant_target
               THEN 'confirmed'::booking_status
             ELSE status
           END,
           hold_expires_at = CASE
             WHEN v_funded_amount >= total_amount_minor
              AND v_paid_participants >= participant_target
               THEN NULL
             ELSE hold_expires_at
           END,
           updated_at = p_paid_at
     WHERE id = v_court_booking.id
     RETURNING * INTO v_court_booking;
  ELSE
    UPDATE court_bookings
       SET status = 'confirmed',
           funded_amount_minor = total_amount_minor,
           hold_expires_at = NULL,
           updated_at = p_paid_at
     WHERE order_id = p_order_id
       AND status = 'held'
    RETURNING * INTO v_court_booking;

    IF v_court_booking.id IS NOT NULL THEN
      UPDATE court_booking_participants
         SET status = CASE
               WHEN role = 'organizer' THEN 'paid'
               WHEN status IN ('invited', 'accepted') THEN 'accepted'
               ELSE status
             END,
             paid_at = CASE
               WHEN role = 'organizer' THEN p_paid_at
               ELSE paid_at
             END,
             updated_at = p_paid_at
       WHERE booking_id = v_court_booking.id;
    END IF;
  END IF;

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
      WHEN v_pickup_participant_count > 0
        THEN 'Stripe payment projected and the held pickup places were confirmed.'
      WHEN v_booking_participant.id IS NOT NULL
       AND v_court_booking.status = 'confirmed'
        THEN 'Stripe payment projected and the final participant share confirmed the court booking.'
      WHEN v_booking_participant.id IS NOT NULL
        THEN 'Stripe payment projected to a participant share while the court remains held.'
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
