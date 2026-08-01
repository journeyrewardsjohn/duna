CREATE TABLE "availability_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"court_id" uuid,
	"target_date" date NOT NULL,
	"earliest_minute" integer DEFAULT 0 NOT NULL,
	"latest_minute" integer DEFAULT 1440 NOT NULL,
	"duration_minutes" integer NOT NULL,
	"channel" "message_channel" DEFAULT 'push' NOT NULL,
	"status" varchar(24) DEFAULT 'active' NOT NULL,
	"last_matched_at" timestamp with time zone,
	"last_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_alert_minutes_valid" CHECK ("availability_alerts"."earliest_minute" >= 0 AND "availability_alerts"."latest_minute" <= 1440 AND "availability_alerts"."latest_minute" > "availability_alerts"."earliest_minute"),
	CONSTRAINT "availability_alert_duration_valid" CHECK ("availability_alerts"."duration_minutes" > 0),
	CONSTRAINT "availability_alert_status_valid" CHECK ("availability_alerts"."status" IN ('active', 'matched', 'paused', 'expired', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "booking_policy_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"acceptance_key" varchar(128) NOT NULL,
	"booking_id" uuid NOT NULL,
	"subject_person_id" uuid NOT NULL,
	"accepted_by_person_id" uuid NOT NULL,
	"policy_title" text NOT NULL,
	"document_text" text NOT NULL,
	"document_text_hash" varchar(128) NOT NULL,
	"full_scroll_confirmed" boolean DEFAULT false NOT NULL,
	"ip_address" varchar(64),
	"accepted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_policy_acceptances_acceptance_key_unique" UNIQUE("acceptance_key")
);
--> statement-breakpoint
CREATE TABLE "court_booking_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"person_id" uuid,
	"invited_name" text,
	"invited_email" text,
	"invited_phone_e164" varchar(24),
	"invite_token" varchar(96) NOT NULL,
	"role" varchar(24) DEFAULT 'player' NOT NULL,
	"status" varchar(24) DEFAULT 'invited' NOT NULL,
	"share_amount_minor" integer DEFAULT 0 NOT NULL,
	"order_id" uuid,
	"paid_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "court_booking_participants_invite_token_unique" UNIQUE("invite_token"),
	CONSTRAINT "court_booking_participant_identity" CHECK ("court_booking_participants"."person_id" IS NOT NULL OR "court_booking_participants"."invited_email" IS NOT NULL OR "court_booking_participants"."invited_phone_e164" IS NOT NULL),
	CONSTRAINT "court_booking_participant_status" CHECK ("court_booking_participants"."status" IN ('organizer', 'invited', 'accepted', 'payment-pending', 'paid', 'declined', 'cancelled')),
	CONSTRAINT "court_booking_participant_share" CHECK ("court_booking_participants"."share_amount_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "court_bookings" ADD COLUMN "payment_mode" varchar(16) DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "court_bookings" ADD COLUMN "total_amount_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "court_bookings" ADD COLUMN "funded_amount_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "court_bookings" ADD COLUMN "currency" varchar(3) DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "court_bookings" ADD COLUMN "participant_target" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "court_bookings" ADD COLUMN "policy_snapshot" jsonb DEFAULT '{"title":"Reservation cancellation policy","markdown":"","requireFullScroll":false}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "courts" ADD COLUMN "capacity" integer DEFAULT 12 NOT NULL;--> statement-breakpoint
ALTER TABLE "courts" ADD COLUMN "duration_options_minutes" integer[] DEFAULT ARRAY[60, 90, 120]::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "courts" ADD COLUMN "booking_increment_minutes" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "capacity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "hero_image_url" text;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "hero_image_treatment_url" text;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "amenities" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "availability_alerts" ADD CONSTRAINT "availability_alerts_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_alerts" ADD CONSTRAINT "availability_alerts_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_alerts" ADD CONSTRAINT "availability_alerts_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_policy_acceptances" ADD CONSTRAINT "booking_policy_acceptances_booking_id_court_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."court_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_policy_acceptances" ADD CONSTRAINT "booking_policy_acceptances_subject_person_id_people_id_fk" FOREIGN KEY ("subject_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_policy_acceptances" ADD CONSTRAINT "booking_policy_acceptances_accepted_by_person_id_people_id_fk" FOREIGN KEY ("accepted_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_booking_participants" ADD CONSTRAINT "court_booking_participants_booking_id_court_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."court_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_booking_participants" ADD CONSTRAINT "court_booking_participants_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_booking_participants" ADD CONSTRAINT "court_booking_participants_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_alert_active_idx" ON "availability_alerts" USING btree ("venue_id","target_date","status");--> statement-breakpoint
CREATE INDEX "booking_policy_acceptance_booking_idx" ON "booking_policy_acceptances" USING btree ("booking_id","subject_person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "court_booking_participant_person_unique" ON "court_booking_participants" USING btree ("booking_id","person_id") WHERE "court_booking_participants"."person_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "court_booking_participant_order_unique" ON "court_booking_participants" USING btree ("order_id") WHERE "court_booking_participants"."order_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "court_booking_participant_booking_idx" ON "court_booking_participants" USING btree ("booking_id","status");--> statement-breakpoint
ALTER TABLE "court_bookings" ADD CONSTRAINT "court_booking_payment_mode" CHECK ("court_bookings"."payment_mode" IN ('full', 'split'));--> statement-breakpoint
ALTER TABLE "court_bookings" ADD CONSTRAINT "court_booking_funding_valid" CHECK ("court_bookings"."total_amount_minor" >= 0 AND "court_bookings"."funded_amount_minor" >= 0 AND "court_bookings"."funded_amount_minor" <= "court_bookings"."total_amount_minor");--> statement-breakpoint
ALTER TABLE "court_bookings" ADD CONSTRAINT "court_booking_participant_target" CHECK ("court_bookings"."participant_target" > 0);--> statement-breakpoint
ALTER TABLE "courts" ADD CONSTRAINT "court_capacity_positive" CHECK ("courts"."capacity" > 0);--> statement-breakpoint
ALTER TABLE "courts" ADD CONSTRAINT "court_booking_increment_valid" CHECK ("courts"."booking_increment_minutes" BETWEEN 5 AND 240);--> statement-breakpoint
ALTER TABLE "courts" ADD CONSTRAINT "court_duration_options_valid" CHECK (cardinality("courts"."duration_options_minutes") > 0 AND 0 < ALL("courts"."duration_options_minutes"));--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venue_capacity_nonnegative" CHECK ("venues"."capacity" >= 0);--> statement-breakpoint
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
     AND status = 'pending'
  RETURNING * INTO v_pickup_participant;

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
      WHEN v_pickup_participant.id IS NOT NULL
        THEN 'Stripe payment projected and the held pickup spot was confirmed.'
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
