CREATE TABLE "pickup_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pickup_session_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"status" "registration_status" DEFAULT 'confirmed' NOT NULL,
	"order_id" uuid,
	"hold_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pickup_participant_pending_hold_required" CHECK ("pickup_participants"."status" <> 'pending' OR ("pickup_participants"."order_id" IS NOT NULL AND "pickup_participants"."hold_expires_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "pickup_sessions" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "pickup_participants" ADD CONSTRAINT "pickup_participants_pickup_session_id_pickup_sessions_id_fk" FOREIGN KEY ("pickup_session_id") REFERENCES "public"."pickup_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_participants" ADD CONSTRAINT "pickup_participants_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_participants" ADD CONSTRAINT "pickup_participants_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pickup_participant_session_person_unique" ON "pickup_participants" USING btree ("pickup_session_id","person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pickup_participant_order_unique" ON "pickup_participants" USING btree ("order_id") WHERE "pickup_participants"."order_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "pickup_participant_person_idx" ON "pickup_participants" USING btree ("person_id","created_at");--> statement-breakpoint
ALTER TABLE "pickup_sessions" ADD CONSTRAINT "pickup_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pickup_session_start_idx" ON "pickup_sessions" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "pickup_session_organization_idx" ON "pickup_sessions" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "pickup_sessions" ADD CONSTRAINT "pickup_session_time_valid" CHECK ("pickup_sessions"."ends_at" > "pickup_sessions"."starts_at");--> statement-breakpoint
ALTER TABLE "pickup_sessions" ADD CONSTRAINT "pickup_session_capacity_valid" CHECK ("pickup_sessions"."capacity" > 1);--> statement-breakpoint
ALTER TABLE "pickup_sessions" ADD CONSTRAINT "pickup_session_cost_valid" CHECK ("pickup_sessions"."cost_minor" >= 0);--> statement-breakpoint
ALTER TABLE "pickup_sessions" ADD CONSTRAINT "pickup_session_rating_range_valid" CHECK (("pickup_sessions"."rating_minimum" IS NULL AND "pickup_sessions"."rating_maximum" IS NULL) OR ("pickup_sessions"."rating_minimum" IS NOT NULL AND "pickup_sessions"."rating_maximum" IS NOT NULL AND "pickup_sessions"."rating_maximum" >= "pickup_sessions"."rating_minimum"));--> statement-breakpoint
ALTER TABLE "pickup_sessions" ADD CONSTRAINT "pickup_session_visibility_valid" CHECK ("pickup_sessions"."visibility" IN ('public', 'unlisted', 'private'));--> statement-breakpoint
UPDATE "pickup_sessions" AS ps
   SET "organization_id" = v."organization_id"
  FROM "venues" AS v
 WHERE ps."venue_id" = v."id"
   AND ps."organization_id" IS NULL;--> statement-breakpoint
INSERT INTO "pickup_participants" (
  "pickup_session_id",
  "person_id",
  "status"
)
SELECT
  ps."id",
  ps."host_person_id",
  'confirmed'::registration_status
FROM "pickup_sessions" AS ps
ON CONFLICT ("pickup_session_id", "person_id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "registrations"
  ADD CONSTRAINT "registrations_order_id_orders_id_fk"
  FOREIGN KEY ("order_id")
  REFERENCES "public"."orders"("id")
  ON DELETE no action
  ON UPDATE no action;--> statement-breakpoint
DROP FUNCTION IF EXISTS "duna_register_for_session"(
  uuid,
  uuid,
  jsonb,
  integer,
  text,
  text
);--> statement-breakpoint
CREATE FUNCTION "duna_register_for_session"(
  p_session_id uuid,
  p_division_id uuid,
  p_person_id uuid,
  p_eligibility_decision jsonb,
  p_eligibility_rule_version integer,
  p_trace_id text,
  p_ip_address text
)
RETURNS TABLE (
  registration_id uuid,
  result_status text,
  spots_remaining integer,
  waitlist_position integer
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_session sessions%ROWTYPE;
  v_existing registrations%ROWTYPE;
  v_occupied integer;
  v_position integer;
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

  IF p_division_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM divisions AS d
        WHERE d.id = p_division_id
          AND d.session_id = p_session_id
     ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'division_not_found';
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
     AND r.person_id = p_person_id;

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
        GREATEST(v_session.capacity - v_occupied, 0),
        NULL::integer;
    RETURN;
  END IF;

  IF v_existing.id IS NOT NULL
     AND v_existing.status = 'pending'
     AND v_existing.hold_expires_at > now() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'checkout_in_progress';
  END IF;

  IF v_existing.id IS NOT NULL
     AND v_existing.status = 'waitlisted' THEN
    SELECT w.position
      INTO v_position
      FROM waitlist_entries AS w
     WHERE w.session_id = p_session_id
       AND w.person_id = p_person_id;

    RETURN QUERY
      SELECT
        v_existing.id,
        'waitlisted'::text,
        GREATEST(v_session.capacity - v_occupied, 0),
        v_position;
    RETURN;
  END IF;

  DELETE FROM waitlist_entries
   WHERE session_id = p_session_id
     AND person_id = p_person_id;

  IF v_occupied < v_session.capacity THEN
    IF v_existing.id IS NULL THEN
      INSERT INTO registrations (
        session_id,
        division_id,
        person_id,
        status,
        eligibility_decision,
        eligibility_rule_version,
        order_id,
        hold_expires_at
      )
      VALUES (
        p_session_id,
        p_division_id,
        p_person_id,
        'confirmed',
        p_eligibility_decision,
        p_eligibility_rule_version,
        NULL,
        NULL
      )
      RETURNING * INTO v_existing;
    ELSE
      UPDATE registrations
         SET division_id = p_division_id,
             status = 'confirmed',
             eligibility_decision = p_eligibility_decision,
             eligibility_rule_version = p_eligibility_rule_version,
             order_id = NULL,
             hold_expires_at = NULL,
             checked_in_at = NULL,
             updated_at = now()
       WHERE id = v_existing.id
      RETURNING * INTO v_existing;
    END IF;
    v_occupied := v_occupied + 1;
    v_position := NULL;
  ELSE
    SELECT COALESCE(max(w.position), 0) + 1
      INTO v_position
      FROM waitlist_entries AS w
     WHERE w.session_id = p_session_id;

    IF v_existing.id IS NULL THEN
      INSERT INTO registrations (
        session_id,
        division_id,
        person_id,
        status,
        eligibility_decision,
        eligibility_rule_version,
        order_id,
        hold_expires_at
      )
      VALUES (
        p_session_id,
        p_division_id,
        p_person_id,
        'waitlisted',
        p_eligibility_decision,
        p_eligibility_rule_version,
        NULL,
        NULL
      )
      RETURNING * INTO v_existing;
    ELSE
      UPDATE registrations
         SET division_id = p_division_id,
             status = 'waitlisted',
             eligibility_decision = p_eligibility_decision,
             eligibility_rule_version = p_eligibility_rule_version,
             order_id = NULL,
             hold_expires_at = NULL,
             checked_in_at = NULL,
             updated_at = now()
       WHERE id = v_existing.id
      RETURNING * INTO v_existing;
    END IF;

    INSERT INTO waitlist_entries (
      session_id,
      person_id,
      position,
      status
    )
    VALUES (
      p_session_id,
      p_person_id,
      v_position,
      'waiting'
    );
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
    p_person_id,
    'person',
    CASE
      WHEN v_existing.status = 'waitlisted' THEN 'registration.waitlisted'
      ELSE 'registration.confirmed'
    END,
    'registration',
    v_existing.id::text,
    'Serialized session registration decision.',
    p_trace_id,
    p_ip_address
  );

  RETURN QUERY
    SELECT
      v_existing.id,
      v_existing.status::text,
      GREATEST(v_session.capacity - v_occupied, 0),
      v_position;
END;
$function$;--> statement-breakpoint
DROP FUNCTION IF EXISTS "duna_hold_session_registration"(
  uuid,
  uuid,
  uuid,
  uuid,
  timestamptz,
  jsonb,
  integer,
  text,
  text
);--> statement-breakpoint
CREATE FUNCTION "duna_hold_session_registration"(
  p_session_id uuid,
  p_division_id uuid,
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

  IF p_division_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM divisions AS d
        WHERE d.id = p_division_id
          AND d.session_id = p_session_id
     ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'division_not_found';
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
    IF v_existing.id IS NULL THEN
      INSERT INTO registrations (
        session_id,
        division_id,
        person_id,
        status,
        eligibility_decision,
        eligibility_rule_version
      )
      VALUES (
        p_session_id,
        p_division_id,
        p_subject_person_id,
        'waitlisted',
        p_eligibility_decision,
        p_eligibility_rule_version
      )
      RETURNING * INTO v_existing;
    ELSE
      UPDATE registrations
         SET division_id = p_division_id,
             status = 'waitlisted',
             eligibility_decision = p_eligibility_decision,
             eligibility_rule_version = p_eligibility_rule_version,
             order_id = NULL,
             hold_expires_at = NULL,
             checked_in_at = NULL,
             updated_at = now()
       WHERE id = v_existing.id
      RETURNING * INTO v_existing;
    END IF;

    INSERT INTO waitlist_entries (
      session_id,
      person_id,
      position,
      status
    )
    SELECT
      p_session_id,
      p_subject_person_id,
      COALESCE(max(w.position), 0) + 1,
      'waiting'
    FROM waitlist_entries AS w
    WHERE w.session_id = p_session_id
    ON CONFLICT (session_id, person_id) DO UPDATE
      SET status = 'waiting',
          updated_at = now();

    RETURN QUERY
      SELECT
        v_existing.id,
        'waitlisted'::text,
        0::integer;
    RETURN;
  END IF;

  IF v_existing.id IS NULL THEN
    INSERT INTO registrations (
      session_id,
      division_id,
      person_id,
      status,
      eligibility_decision,
      eligibility_rule_version,
      order_id,
      hold_expires_at
    )
    VALUES (
      p_session_id,
      p_division_id,
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
       SET division_id = p_division_id,
           status = 'pending',
           eligibility_decision = p_eligibility_decision,
           eligibility_rule_version = p_eligibility_rule_version,
           order_id = p_order_id,
           hold_expires_at = p_hold_expires_at,
           checked_in_at = NULL,
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
CREATE FUNCTION "duna_join_pickup"(
  p_pickup_session_id uuid,
  p_subject_person_id uuid,
  p_actor_person_id uuid,
  p_order_id uuid,
  p_hold_expires_at timestamptz,
  p_eligibility_decision jsonb,
  p_trace_id text,
  p_ip_address text
)
RETURNS TABLE (
  participant_id uuid,
  result_status text,
  spots_remaining integer
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_pickup pickup_sessions%ROWTYPE;
  v_existing pickup_participants%ROWTYPE;
  v_occupied integer;
  v_new_status registration_status;
BEGIN
  SELECT ps.*
    INTO v_pickup
    FROM pickup_sessions AS ps
   WHERE ps.id = p_pickup_session_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'pickup_not_found';
  END IF;

  IF v_pickup.visibility <> 'public'
     AND v_pickup.host_person_id <> p_actor_person_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'pickup_not_joinable';
  END IF;

  IF v_pickup.ends_at <= now() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'pickup_has_ended';
  END IF;

  IF COALESCE(p_eligibility_decision->>'status', '') <> 'eligible' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'pickup_ineligible';
  END IF;

  IF (p_order_id IS NULL) <> (p_hold_expires_at IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'pickup_hold_invalid';
  END IF;

  UPDATE pickup_participants
     SET status = 'cancelled',
         updated_at = now()
   WHERE pickup_session_id = p_pickup_session_id
     AND status = 'pending'
     AND hold_expires_at <= now();

  UPDATE orders
     SET status = 'cancelled',
         updated_at = now()
   WHERE id IN (
     SELECT pp.order_id
       FROM pickup_participants AS pp
      WHERE pp.pickup_session_id = p_pickup_session_id
        AND pp.status = 'cancelled'
        AND pp.hold_expires_at <= now()
        AND pp.order_id IS NOT NULL
   )
     AND status IN ('draft', 'pending');

  SELECT pp.*
    INTO v_existing
    FROM pickup_participants AS pp
   WHERE pp.pickup_session_id = p_pickup_session_id
     AND pp.person_id = p_subject_person_id;

  SELECT count(*)::integer
    INTO v_occupied
    FROM pickup_participants AS pp
   WHERE pp.pickup_session_id = p_pickup_session_id
     AND (
       pp.status IN ('confirmed', 'checked-in')
       OR (pp.status = 'pending' AND pp.hold_expires_at > now())
     );

  IF v_existing.id IS NOT NULL
     AND v_existing.status IN ('confirmed', 'checked-in') THEN
    RETURN QUERY
      SELECT
        v_existing.id,
        'confirmed'::text,
        GREATEST(v_pickup.capacity - v_occupied, 0);
    RETURN;
  END IF;

  IF v_existing.id IS NOT NULL
     AND v_existing.status = 'pending'
     AND v_existing.hold_expires_at > now() THEN
    RETURN QUERY
      SELECT
        v_existing.id,
        'pending'::text,
        GREATEST(v_pickup.capacity - v_occupied, 0);
    RETURN;
  END IF;

  IF v_existing.id IS NOT NULL
     AND v_existing.status = 'waitlisted' THEN
    RETURN QUERY
      SELECT
        v_existing.id,
        'waitlisted'::text,
        GREATEST(v_pickup.capacity - v_occupied, 0);
    RETURN;
  END IF;

  IF v_occupied >= v_pickup.capacity THEN
    IF v_existing.id IS NULL THEN
      INSERT INTO pickup_participants (
        pickup_session_id,
        person_id,
        status
      )
      VALUES (
        p_pickup_session_id,
        p_subject_person_id,
        'waitlisted'
      )
      RETURNING * INTO v_existing;
    ELSE
      UPDATE pickup_participants
         SET status = 'waitlisted',
             order_id = NULL,
             hold_expires_at = NULL,
             updated_at = now()
       WHERE id = v_existing.id
      RETURNING * INTO v_existing;
    END IF;

    RETURN QUERY
      SELECT
        v_existing.id,
        'waitlisted'::text,
        0::integer;
    RETURN;
  END IF;

  v_new_status :=
    CASE WHEN p_order_id IS NULL THEN 'confirmed' ELSE 'pending' END;

  IF v_existing.id IS NULL THEN
    INSERT INTO pickup_participants (
      pickup_session_id,
      person_id,
      status,
      order_id,
      hold_expires_at
    )
    VALUES (
      p_pickup_session_id,
      p_subject_person_id,
      v_new_status,
      p_order_id,
      p_hold_expires_at
    )
    RETURNING * INTO v_existing;
  ELSE
    UPDATE pickup_participants
       SET status = v_new_status,
           order_id = p_order_id,
           hold_expires_at = p_hold_expires_at,
           updated_at = now()
     WHERE id = v_existing.id
    RETURNING * INTO v_existing;
  END IF;

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
    v_pickup.organization_id,
    p_actor_person_id,
    'person',
    CASE
      WHEN v_new_status = 'pending' THEN 'pickup-participant.held'
      ELSE 'pickup-participant.confirmed'
    END,
    'pickup-participant',
    v_existing.id::text,
    CASE
      WHEN v_new_status = 'pending'
        THEN 'Pickup capacity held while Stripe checkout is active.'
      ELSE 'Serialized pickup participation decision.'
    END,
    p_trace_id,
    p_ip_address
  );

  RETURN QUERY
    SELECT
      v_existing.id,
      v_new_status::text,
      GREATEST(v_pickup.capacity - v_occupied - 1, 0);
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

  UPDATE pickup_participants
     SET status = 'confirmed',
         hold_expires_at = NULL,
         updated_at = p_paid_at
   WHERE order_id = p_order_id
     AND status = 'pending'
  RETURNING * INTO v_pickup_participant;

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
      ELSE 'Stripe payment projected to the order ledger.'
    END,
    p_trace_id,
    p_paid_at
  );

  RETURN 'paid';
END;
$function$;
