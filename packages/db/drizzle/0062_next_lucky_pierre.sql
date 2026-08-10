ALTER TYPE "public"."registration_status" ADD VALUE 'invited' BEFORE 'pending';--> statement-breakpoint
CREATE OR REPLACE FUNCTION "duna_join_pickup"(
  p_pickup_session_id uuid,
  p_subject_person_id uuid,
  p_actor_person_id uuid,
  p_order_id uuid,
  p_hold_expires_at timestamptz,
  p_eligibility_decision jsonb,
  p_trace_id text,
  p_ip_address text
)
RETURNS TABLE(participant_id uuid, result_status text, spots_remaining integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_pickup pickup_sessions%ROWTYPE;
  v_existing pickup_participants%ROWTYPE;
  v_occupied integer;
  v_new_status registration_status;
  v_actor_can_add boolean;
BEGIN
  SELECT ps.*
    INTO v_pickup
    FROM pickup_sessions AS ps
   WHERE ps.id = p_pickup_session_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'pickup_not_found';
  END IF;

  SELECT (
    v_pickup.host_person_id = p_actor_person_id
    OR EXISTS (
      SELECT 1
        FROM pickup_participants AS actor_participant
       WHERE actor_participant.pickup_session_id = p_pickup_session_id
         AND actor_participant.person_id = p_actor_person_id
         AND actor_participant.status IN ('confirmed', 'checked-in')
    )
  ) INTO v_actor_can_add;

  IF v_pickup.visibility <> 'public' AND NOT v_actor_can_add THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'pickup_not_joinable';
  END IF;

  IF v_pickup.status <> 'active' OR v_pickup.ends_at <= now() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'pickup_has_ended';
  END IF;

  IF COALESCE(p_eligibility_decision->>'status', '') <> 'eligible' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'pickup_ineligible';
  END IF;

  IF (p_order_id IS NULL) <> (p_hold_expires_at IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'pickup_hold_invalid';
  END IF;

  UPDATE pickup_participants
     SET status = 'cancelled', updated_at = now()
   WHERE pickup_session_id = p_pickup_session_id
     AND status = 'pending'
     AND hold_expires_at <= now();

  UPDATE orders
     SET status = 'cancelled', updated_at = now()
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
    RETURN QUERY SELECT v_existing.id, 'confirmed'::text,
      GREATEST(v_pickup.capacity - v_occupied, 0);
    RETURN;
  END IF;

  IF v_existing.id IS NOT NULL
     AND v_existing.status = 'pending'
     AND v_existing.hold_expires_at > now() THEN
    RETURN QUERY SELECT v_existing.id, 'pending'::text,
      GREATEST(v_pickup.capacity - v_occupied, 0);
    RETURN;
  END IF;

  IF v_occupied >= v_pickup.capacity THEN
    IF COALESCE((v_pickup.smart_rules->>'waitlistEnabled')::boolean, true) = false THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'pickup_full';
    END IF;

    IF v_existing.id IS NULL THEN
      INSERT INTO pickup_participants (pickup_session_id, person_id, status)
      VALUES (p_pickup_session_id, p_subject_person_id, 'waitlisted')
      RETURNING * INTO v_existing;
    ELSE
      UPDATE pickup_participants
         SET status = 'waitlisted', order_id = NULL, hold_expires_at = NULL,
             updated_at = now()
       WHERE id = v_existing.id
      RETURNING * INTO v_existing;
    END IF;

    RETURN QUERY SELECT v_existing.id, 'waitlisted'::text, 0::integer;
    RETURN;
  END IF;

  v_new_status := CASE WHEN p_order_id IS NULL THEN 'confirmed' ELSE 'pending' END;

  IF v_existing.id IS NULL THEN
    INSERT INTO pickup_participants (
      pickup_session_id, person_id, status, order_id, hold_expires_at
    ) VALUES (
      p_pickup_session_id, p_subject_person_id, v_new_status,
      p_order_id, p_hold_expires_at
    ) RETURNING * INTO v_existing;
  ELSE
    UPDATE pickup_participants
       SET status = v_new_status, order_id = p_order_id,
           hold_expires_at = p_hold_expires_at, updated_at = now()
     WHERE id = v_existing.id
    RETURNING * INTO v_existing;
  END IF;

  INSERT INTO audit_log (
    organization_id, actor_person_id, actor_type, action, entity_type,
    entity_id, reason, trace_id, ip_address
  ) VALUES (
    v_pickup.organization_id, p_actor_person_id, 'person',
    CASE WHEN v_new_status = 'pending'
      THEN 'pickup-participant.held'
      ELSE 'pickup-participant.confirmed' END,
    'pickup-participant', v_existing.id::text,
    CASE WHEN v_new_status = 'pending'
      THEN 'Pickup capacity held while Stripe checkout is active.'
      ELSE 'Serialized pickup participation decision.' END,
    p_trace_id, p_ip_address
  );

  RETURN QUERY SELECT v_existing.id, v_new_status::text,
    GREATEST(v_pickup.capacity - v_occupied - 1, 0);
END;
$function$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "duna_offer_pickup_waitlist"(
  p_pickup_session_id uuid,
  p_requested_offers integer,
  p_trace_id text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_pickup pickup_sessions%ROWTYPE;
  v_occupied integer := 0;
  v_offer_limit integer := 0;
  v_offered integer := 0;
BEGIN
  SELECT ps.*
    INTO v_pickup
    FROM pickup_sessions AS ps
   WHERE ps.id = p_pickup_session_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'pickup_not_found';
  END IF;

  IF p_requested_offers <= 0
     OR COALESCE((v_pickup.smart_rules->>'waitlistEnabled')::boolean, true) = false THEN
    RETURN 0;
  END IF;

  SELECT count(*)::integer
    INTO v_occupied
    FROM pickup_participants AS pp
   WHERE pp.pickup_session_id = p_pickup_session_id
     AND (
       pp.status IN ('confirmed', 'checked-in')
       OR (pp.status = 'pending' AND pp.hold_expires_at > now())
     );

  v_offer_limit := LEAST(
    p_requested_offers,
    GREATEST(v_pickup.capacity - v_occupied, 0)
  );
  IF v_offer_limit <= 0 THEN
    RETURN 0;
  END IF;

  WITH next_waitlisted AS (
    SELECT pp.id
      FROM pickup_participants AS pp
     WHERE pp.pickup_session_id = p_pickup_session_id
       AND pp.status = 'waitlisted'
     ORDER BY pp.created_at, pp.id
     FOR UPDATE SKIP LOCKED
     LIMIT v_offer_limit
  )
  UPDATE pickup_participants AS pp
     SET status = 'invited', order_id = NULL, hold_expires_at = NULL,
         paid_by_person_id = NULL, updated_at = now()
    FROM next_waitlisted AS offered
   WHERE pp.id = offered.id;
  GET DIAGNOSTICS v_offered = ROW_COUNT;

  IF v_offered > 0 THEN
    INSERT INTO audit_log (
      organization_id, actor_type, action, entity_type, entity_id,
      reason, trace_id
    ) VALUES (
      v_pickup.organization_id, 'system', 'pickup.waitlist-offered',
      'pickup-session', v_pickup.id::text,
      v_offered::text || ' waitlisted player(s) received the next confirmation opportunity.',
      p_trace_id
    );
  END IF;

  RETURN v_offered;
END;
$function$;
