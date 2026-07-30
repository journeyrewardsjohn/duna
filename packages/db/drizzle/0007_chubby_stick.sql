ALTER TABLE "form_responses" ADD CONSTRAINT "form_response_signature_complete" CHECK (("form_responses"."signed_by_person_id" IS NULL AND "form_responses"."signature_text_hash" IS NULL AND "form_responses"."signed_at" IS NULL) OR ("form_responses"."signed_by_person_id" IS NOT NULL AND "form_responses"."signature_text_hash" IS NOT NULL AND "form_responses"."signed_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "form_document_hash_pair" CHECK (("forms"."document_text" IS NULL AND "forms"."document_text_hash" IS NULL) OR ("forms"."document_text" IS NOT NULL AND "forms"."document_text_hash" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_quantity_positive" CHECK ("ticket_types"."quantity" IS NULL OR "ticket_types"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_sales_window_valid" CHECK ("ticket_types"."sales_starts_at" IS NULL OR "ticket_types"."sales_ends_at" IS NULL OR "ticket_types"."sales_ends_at" > "ticket_types"."sales_starts_at");--> statement-breakpoint
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_validity_window_valid" CHECK ("ticket_types"."validity_starts_at" IS NULL OR "ticket_types"."validity_ends_at" IS NULL OR "ticket_types"."validity_ends_at" > "ticket_types"."validity_starts_at");--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_status_valid" CHECK ("waitlist_entries"."status" IN ('waiting', 'offered', 'accepted', 'expired', 'cancelled'));--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "btree_gist";--> statement-breakpoint
ALTER TABLE "court_bookings"
  ADD CONSTRAINT "court_bookings_no_overlap"
  EXCLUDE USING gist (
    "court_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  )
  WHERE ("status" IN ('held', 'confirmed'));--> statement-breakpoint
CREATE OR REPLACE FUNCTION "duna_register_for_session"(
  p_session_id uuid,
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

  IF v_session.status NOT IN ('published', 'registration-open') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'session_not_open';
  END IF;

  IF v_session.ends_at <= now() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'session_has_ended';
  END IF;

  IF COALESCE(p_eligibility_decision->>'status', '') <> 'eligible' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'registration_ineligible';
  END IF;

  SELECT r.*
    INTO v_existing
    FROM registrations AS r
   WHERE r.session_id = p_session_id
     AND r.person_id = p_person_id;

  SELECT count(*)::integer
    INTO v_occupied
    FROM registrations AS r
   WHERE r.session_id = p_session_id
     AND r.status IN ('pending', 'confirmed', 'checked-in');

  IF FOUND AND v_existing.id IS NOT NULL THEN
    SELECT w.position
      INTO v_position
      FROM waitlist_entries AS w
     WHERE w.session_id = p_session_id
       AND w.person_id = p_person_id;

    RETURN QUERY
      SELECT
        v_existing.id,
        v_existing.status::text,
        GREATEST(v_session.capacity - v_occupied, 0),
        v_position;
    RETURN;
  END IF;

  IF v_occupied < v_session.capacity THEN
    INSERT INTO registrations (
      session_id,
      person_id,
      status,
      eligibility_decision,
      eligibility_rule_version
    )
    VALUES (
      p_session_id,
      p_person_id,
      'confirmed',
      p_eligibility_decision,
      p_eligibility_rule_version
    )
    RETURNING * INTO v_existing;
    v_occupied := v_occupied + 1;
    v_position := NULL;
  ELSE
    SELECT COALESCE(max(w.position), 0) + 1
      INTO v_position
      FROM waitlist_entries AS w
     WHERE w.session_id = p_session_id;

    INSERT INTO registrations (
      session_id,
      person_id,
      status,
      eligibility_decision,
      eligibility_rule_version
    )
    VALUES (
      p_session_id,
      p_person_id,
      'waitlisted',
      p_eligibility_decision,
      p_eligibility_rule_version
    )
    RETURNING * INTO v_existing;

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
CREATE OR REPLACE FUNCTION "duna_scan_ticket"(
  p_ticket_token text,
  p_organization_id uuid,
  p_actor_person_id uuid,
  p_device_id text,
  p_scanned_at timestamptz,
  p_offline boolean,
  p_trace_id text,
  p_ip_address text
)
RETURNS TABLE (
  scan_event_id uuid,
  result_ticket_id uuid,
  accepted boolean,
  duplicate boolean,
  reason text,
  result_ticket_status text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_ticket tickets%ROWTYPE;
  v_existing_scan ticket_scan_events%ROWTYPE;
  v_event ticket_scan_events%ROWTYPE;
  v_ticket_organization_id uuid;
  v_accepted boolean;
  v_duplicate boolean;
  v_reason text;
BEGIN
  SELECT t.*
    INTO v_ticket
    FROM tickets AS t
   WHERE t.token = p_ticket_token
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ticket_not_found';
  END IF;

  SELECT COALESCE(p.organization_id, et.organization_id, v.organization_id)
    INTO v_ticket_organization_id
    FROM ticket_types AS tt
    JOIN sessions AS s ON s.id = tt.session_id
    LEFT JOIN programs AS p ON p.id = s.program_id
    LEFT JOIN event_types AS et ON et.id = s.event_type_id
    LEFT JOIN venues AS v ON v.id = s.venue_id
   WHERE tt.id = v_ticket.ticket_type_id;

  IF v_ticket_organization_id IS NULL
     OR v_ticket_organization_id <> p_organization_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ticket_wrong_organization';
  END IF;

  SELECT tse.*
    INTO v_existing_scan
    FROM ticket_scan_events AS tse
   WHERE tse.ticket_id = v_ticket.id
     AND tse.device_id = p_device_id
     AND tse.scanned_at = p_scanned_at;

  IF FOUND THEN
    RETURN QUERY
      SELECT
        v_existing_scan.id,
        v_ticket.id,
        v_existing_scan.accepted,
        v_existing_scan.duplicate,
        v_existing_scan.reason,
        v_ticket.status::text;
    RETURN;
  END IF;

  IF v_ticket.status IN ('issued', 'transferred') THEN
    v_accepted := true;
    v_duplicate := false;
    v_reason := NULL;

    UPDATE tickets
       SET status = 'scanned',
           scanned_at = p_scanned_at,
           scanned_by_person_id = p_actor_person_id,
           scanned_device_id = p_device_id,
           updated_at = now()
     WHERE id = v_ticket.id
    RETURNING * INTO v_ticket;
  ELSIF v_ticket.status = 'scanned' THEN
    v_accepted := false;
    v_duplicate := true;
    v_reason := 'already-scanned';
  ELSIF v_ticket.status = 'void' THEN
    v_accepted := false;
    v_duplicate := false;
    v_reason := 'void';
  ELSIF v_ticket.status = 'refunded' THEN
    v_accepted := false;
    v_duplicate := false;
    v_reason := 'refunded';
  ELSE
    v_accepted := false;
    v_duplicate := false;
    v_reason := 'not-issued';
  END IF;

  INSERT INTO ticket_scan_events (
    ticket_id,
    scanned_by_person_id,
    device_id,
    scanned_at,
    offline,
    accepted,
    duplicate,
    reason
  )
  VALUES (
    v_ticket.id,
    p_actor_person_id,
    p_device_id,
    p_scanned_at,
    p_offline,
    v_accepted,
    v_duplicate,
    v_reason
  )
  RETURNING * INTO v_event;

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
    p_organization_id,
    p_actor_person_id,
    'person',
    CASE WHEN v_accepted THEN 'ticket.scan.accepted' ELSE 'ticket.scan.rejected' END,
    'ticket',
    v_ticket.id::text,
    COALESCE(v_reason, 'Ticket admitted.'),
    p_trace_id,
    p_ip_address
  );

  RETURN QUERY
    SELECT
      v_event.id,
      v_ticket.id,
      v_accepted,
      v_duplicate,
      v_reason,
      v_ticket.status::text;
END;
$function$;
