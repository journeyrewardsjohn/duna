CREATE TABLE "family_credit_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"guardian_person_id" uuid NOT NULL,
	"dependent_person_id" uuid NOT NULL,
	"from_wallet_id" uuid NOT NULL,
	"to_wallet_id" uuid NOT NULL,
	"journal_id" uuid NOT NULL,
	"credits" integer NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_credit_transfers_journal_id_unique" UNIQUE("journal_id"),
	CONSTRAINT "family_credit_transfers_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "family_credit_transfer_people_distinct" CHECK ("family_credit_transfers"."guardian_person_id" <> "family_credit_transfers"."dependent_person_id"),
	CONSTRAINT "family_credit_transfer_wallets_distinct" CHECK ("family_credit_transfers"."from_wallet_id" <> "family_credit_transfers"."to_wallet_id"),
	CONSTRAINT "family_credit_transfer_positive" CHECK ("family_credit_transfers"."credits" > 0)
);
--> statement-breakpoint
CREATE TABLE "guardian_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"minor_id" uuid NOT NULL,
	"created_by_person_id" uuid NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"relationship" varchar(48) DEFAULT 'Parent or legal guardian' NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"claimed_by_person_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardian_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "guardian_invitation_status_valid" CHECK ("guardian_invitations"."status" IN ('pending', 'claimed', 'expired', 'cancelled')),
	CONSTRAINT "guardian_invitation_claim_state_valid" CHECK (("guardian_invitations"."status" = 'claimed' AND "guardian_invitations"."claimed_by_person_id" IS NOT NULL AND "guardian_invitations"."claimed_at" IS NOT NULL) OR ("guardian_invitations"."status" <> 'claimed'))
);
--> statement-breakpoint
CREATE TABLE "identity_verification_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"requested_by_person_id" uuid NOT NULL,
	"provider" varchar(24) DEFAULT 'stripe' NOT NULL,
	"provider_session_id" varchar(128) NOT NULL,
	"purpose" varchar(24) DEFAULT 'payouts' NOT NULL,
	"status" varchar(24) DEFAULT 'requires-input' NOT NULL,
	"livemode" boolean DEFAULT false NOT NULL,
	"last_error_code" varchar(96),
	"verified_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"redacted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_verification_sessions_provider_session_id_unique" UNIQUE("provider_session_id"),
	CONSTRAINT "identity_verification_provider_valid" CHECK ("identity_verification_sessions"."provider" IN ('stripe')),
	CONSTRAINT "identity_verification_purpose_valid" CHECK ("identity_verification_sessions"."purpose" IN ('payouts')),
	CONSTRAINT "identity_verification_status_valid" CHECK ("identity_verification_sessions"."status" IN ('requires-input', 'processing', 'verified', 'canceled', 'redacted'))
);
--> statement-breakpoint
CREATE TABLE "player_source_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"source" varchar(32) NOT NULL,
	"external_person_id" text NOT NULL,
	"profile_url" text NOT NULL,
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"last_ingestion_run_id" uuid,
	"last_error" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_source_connection_source_valid" CHECK ("player_source_connections"."source" IN ('volleyball-life', 'bvbinfo')),
	CONSTRAINT "player_source_connection_status_valid" CHECK ("player_source_connections"."status" IN ('queued', 'syncing', 'linked', 'review-required', 'failed', 'disconnected'))
);
--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "legal_given_name" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "legal_middle_name" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "legal_family_name" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "height_millimeters" integer;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "playing_experience" varchar(24) DEFAULT 'not-set' NOT NULL;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "played_indoor_prior" boolean;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "years_playing" integer;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "experience_summary" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "profile_onboarding_status" varchar(24) DEFAULT 'not-started' NOT NULL;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "profile_onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "family_credit_transfers" ADD CONSTRAINT "family_credit_transfers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_credit_transfers" ADD CONSTRAINT "family_credit_transfers_guardian_person_id_people_id_fk" FOREIGN KEY ("guardian_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_credit_transfers" ADD CONSTRAINT "family_credit_transfers_dependent_person_id_people_id_fk" FOREIGN KEY ("dependent_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_credit_transfers" ADD CONSTRAINT "family_credit_transfers_from_wallet_id_organization_wallets_id_fk" FOREIGN KEY ("from_wallet_id") REFERENCES "public"."organization_wallets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_credit_transfers" ADD CONSTRAINT "family_credit_transfers_to_wallet_id_organization_wallets_id_fk" FOREIGN KEY ("to_wallet_id") REFERENCES "public"."organization_wallets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_credit_transfers" ADD CONSTRAINT "family_credit_transfers_journal_id_ledger_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."ledger_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_invitations" ADD CONSTRAINT "guardian_invitations_minor_id_people_id_fk" FOREIGN KEY ("minor_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_invitations" ADD CONSTRAINT "guardian_invitations_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_invitations" ADD CONSTRAINT "guardian_invitations_claimed_by_person_id_people_id_fk" FOREIGN KEY ("claimed_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_verification_sessions" ADD CONSTRAINT "identity_verification_sessions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_verification_sessions" ADD CONSTRAINT "identity_verification_sessions_requested_by_person_id_people_id_fk" FOREIGN KEY ("requested_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_source_connections" ADD CONSTRAINT "player_source_connections_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "family_credit_transfer_guardian_idx" ON "family_credit_transfers" USING btree ("guardian_person_id","created_at");--> statement-breakpoint
CREATE INDEX "family_credit_transfer_dependent_idx" ON "family_credit_transfers" USING btree ("dependent_person_id","created_at");--> statement-breakpoint
CREATE INDEX "guardian_invitation_minor_status_idx" ON "guardian_invitations" USING btree ("minor_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "identity_verification_person_status_idx" ON "identity_verification_sessions" USING btree ("person_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "player_source_connection_person_source_unique" ON "player_source_connections" USING btree ("person_id","source");--> statement-breakpoint
CREATE UNIQUE INDEX "player_source_connection_external_unique" ON "player_source_connections" USING btree ("source","external_person_id");--> statement-breakpoint
CREATE INDEX "player_source_connection_status_idx" ON "player_source_connections" USING btree ("status","updated_at");--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_height_valid" CHECK ("people"."height_millimeters" IS NULL OR "people"."height_millimeters" BETWEEN 600 AND 2600);--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_playing_experience_valid" CHECK ("people"."playing_experience" IN ('not-set', 'amateur', 'high-school', 'collegiate', 'professional'));--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_years_playing_valid" CHECK ("people"."years_playing" IS NULL OR "people"."years_playing" BETWEEN 0 AND 100);--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_profile_onboarding_status_valid" CHECK ("people"."profile_onboarding_status" IN ('not-started', 'in-progress', 'guardian-required', 'complete'));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "duna_transfer_family_credits"(
  p_organization_id uuid,
  p_guardian_person_id uuid,
  p_dependent_person_id uuid,
  p_credits integer,
  p_idempotency_key text,
  p_trace_id text,
  p_occurred_at timestamptz
)
RETURNS TABLE(transfer_id uuid, journal_id uuid, result_status text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_existing family_credit_transfers%ROWTYPE;
  v_from_wallet organization_wallets%ROWTYPE;
  v_to_wallet organization_wallets%ROWTYPE;
  v_grant organization_credit_grants%ROWTYPE;
  v_transfer_id uuid := gen_random_uuid();
  v_journal_id uuid := gen_random_uuid();
  v_remaining integer := p_credits;
  v_take integer;
  v_value bigint;
  v_available integer;
BEGIN
  IF p_credits <= 0 OR p_guardian_person_id = p_dependent_person_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'family_credit_transfer_invalid';
  END IF;

  SELECT *
    INTO v_existing
    FROM family_credit_transfers
   WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.organization_id <> p_organization_id
       OR v_existing.guardian_person_id <> p_guardian_person_id
       OR v_existing.dependent_person_id <> p_dependent_person_id
       OR v_existing.credits <> p_credits THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'family_credit_transfer_conflict';
    END IF;
    RETURN QUERY SELECT v_existing.id, v_existing.journal_id, 'posted'::text;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM guardianships
     WHERE guardian_id = p_guardian_person_id
       AND minor_id = p_dependent_person_id
       AND verified = true
       AND review_status = 'verified'
       AND can_approve_spending = true
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'verified_guardian_required';
  END IF;

  SELECT *
    INTO v_from_wallet
    FROM organization_wallets
   WHERE organization_id = p_organization_id
     AND person_id = p_guardian_person_id
   FOR UPDATE;

  SELECT *
    INTO v_to_wallet
    FROM organization_wallets
   WHERE organization_id = p_organization_id
     AND person_id = p_dependent_person_id
   FOR UPDATE;

  IF v_from_wallet.id IS NULL OR v_to_wallet.id IS NULL
     OR v_from_wallet.status <> 'active' OR v_to_wallet.status <> 'active'
     OR v_from_wallet.unit <> v_to_wallet.unit THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'family_credit_wallet_unavailable';
  END IF;

  SELECT COALESCE(sum(remaining_credits), 0)::integer
    INTO v_available
    FROM organization_credit_grants
   WHERE organization_id = p_organization_id
     AND organization_wallet_id = v_from_wallet.id
     AND status = 'active'
     AND remaining_credits > 0
     AND (expires_at IS NULL OR expires_at > p_occurred_at);

  IF v_available < p_credits OR v_from_wallet.cached_available_credits < p_credits THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'family_credit_balance_insufficient';
  END IF;

  INSERT INTO ledger_journals (
    id, organization_id, idempotency_key, source_type, source_id,
    description, status, actor_person_id, occurred_at, posted_at, metadata
  )
  VALUES (
    v_journal_id, p_organization_id, p_idempotency_key,
    'family-credit-transfer', v_transfer_id::text,
    'Guardian funded a dependent organization wallet.',
    'posted', p_guardian_person_id, p_occurred_at, p_occurred_at,
    jsonb_build_object(
      'guardianPersonId', p_guardian_person_id,
      'dependentPersonId', p_dependent_person_id,
      'credits', p_credits
    )
  );

  FOR v_grant IN
    SELECT *
      FROM organization_credit_grants
     WHERE organization_id = p_organization_id
       AND organization_wallet_id = v_from_wallet.id
       AND status = 'active'
       AND remaining_credits > 0
       AND (expires_at IS NULL OR expires_at > p_occurred_at)
     ORDER BY expires_at ASC NULLS LAST, created_at ASC, id ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_remaining = 0;
    v_take := LEAST(v_remaining, v_grant.remaining_credits);
    v_value := CASE
      WHEN v_take = v_grant.remaining_credits THEN v_grant.remaining_value_minor
      ELSE floor(
        (v_grant.remaining_value_minor::numeric * v_take::numeric)
        / v_grant.remaining_credits::numeric
      )::bigint
    END;

    UPDATE organization_credit_grants
       SET remaining_credits = remaining_credits - v_take,
           remaining_value_minor = remaining_value_minor - v_value,
           status = CASE
             WHEN remaining_credits - v_take = 0 THEN 'exhausted'
             ELSE 'active'
           END,
           updated_at = p_occurred_at
     WHERE id = v_grant.id;

    INSERT INTO organization_credit_grants (
      id, organization_id, organization_wallet_id, source_journal_id,
      catalog_item_id, source_order_id, initial_credits, remaining_credits,
      initial_value_minor, remaining_value_minor, currency, expires_at,
      status, created_at, updated_at
    )
    VALUES (
      gen_random_uuid(), p_organization_id, v_to_wallet.id, v_journal_id,
      v_grant.catalog_item_id, v_grant.source_order_id, v_take, v_take,
      v_value, v_value, CASE WHEN v_value > 0 THEN v_grant.currency ELSE NULL END,
      v_grant.expires_at, 'active', p_occurred_at, p_occurred_at
    );

    v_remaining := v_remaining - v_take;
  END LOOP;

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'family_credit_balance_changed';
  END IF;

  INSERT INTO ledger_entries (
    id, organization_id, journal_id, account_id, sequence, side,
    amount, unit_kind, unit, created_at
  )
  VALUES
    (
      gen_random_uuid(), p_organization_id, v_journal_id,
      v_from_wallet.credit_ledger_account_id, 0, 'debit',
      p_credits, 'organization-credit', v_from_wallet.unit, p_occurred_at
    ),
    (
      gen_random_uuid(), p_organization_id, v_journal_id,
      v_to_wallet.credit_ledger_account_id, 1, 'credit',
      p_credits, 'organization-credit', v_to_wallet.unit, p_occurred_at
    );

  UPDATE organization_wallets
     SET cached_available_credits = cached_available_credits - p_credits,
         cached_at = p_occurred_at,
         updated_at = p_occurred_at
   WHERE id = v_from_wallet.id;

  UPDATE organization_wallets
     SET cached_available_credits = cached_available_credits + p_credits,
         cached_at = p_occurred_at,
         updated_at = p_occurred_at
   WHERE id = v_to_wallet.id;

  INSERT INTO family_credit_transfers (
    id, organization_id, guardian_person_id, dependent_person_id,
    from_wallet_id, to_wallet_id, journal_id, credits,
    idempotency_key, created_at
  )
  VALUES (
    v_transfer_id, p_organization_id, p_guardian_person_id,
    p_dependent_person_id, v_from_wallet.id, v_to_wallet.id,
    v_journal_id, p_credits, p_idempotency_key, p_occurred_at
  );

  INSERT INTO audit_log (
    id, organization_id, actor_person_id, actor_type, action,
    entity_type, entity_id, reason, trace_id, created_at
  )
  VALUES (
    gen_random_uuid(), p_organization_id, p_guardian_person_id, 'person',
    'wallet.family_credits_transferred', 'family-credit-transfer',
    v_transfer_id::text,
    'Verified guardian funded a dependent wallet through a balanced credit journal.',
    p_trace_id, p_occurred_at
  );

  RETURN QUERY SELECT v_transfer_id, v_journal_id, 'posted'::text;
END;
$function$;
