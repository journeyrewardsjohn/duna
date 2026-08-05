CREATE TABLE "prediction_share_trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"side" varchar(3) NOT NULL,
	"buy_order_id" uuid NOT NULL,
	"sell_order_id" uuid NOT NULL,
	"seller_position_id" uuid NOT NULL,
	"maker_order_id" uuid NOT NULL,
	"shares_micros" bigint NOT NULL,
	"price_bps" integer NOT NULL,
	"cost_micros" bigint NOT NULL,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prediction_share_trade_side_valid" CHECK ("prediction_share_trades"."side" IN ('yes', 'no')),
	CONSTRAINT "prediction_share_trade_amounts_valid" CHECK ("prediction_share_trades"."shares_micros" > 0 AND "prediction_share_trades"."cost_micros" >= 0),
	CONSTRAINT "prediction_share_trade_price_valid" CHECK ("prediction_share_trades"."price_bps" BETWEEN 100 AND 9900)
);
--> statement-breakpoint
ALTER TABLE "prediction_credit_ledger" DROP CONSTRAINT "prediction_credit_ledger_delta_valid";--> statement-breakpoint
ALTER TABLE "prediction_credit_ledger" DROP CONSTRAINT "prediction_credit_ledger_kind_valid";--> statement-breakpoint
ALTER TABLE "prediction_orders" DROP CONSTRAINT "prediction_order_amounts_valid";--> statement-breakpoint
ALTER TABLE "prediction_positions" DROP CONSTRAINT "prediction_position_amounts_valid";--> statement-breakpoint
ALTER TABLE "prediction_credit_ledger" ADD COLUMN "chain_sequence" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "prediction_credit_ledger" ADD COLUMN "previous_hash" varchar(64) DEFAULT '0000000000000000000000000000000000000000000000000000000000000000' NOT NULL;--> statement-breakpoint
ALTER TABLE "prediction_credit_ledger" ADD COLUMN "entry_hash" varchar(64) DEFAULT '0000000000000000000000000000000000000000000000000000000000000000' NOT NULL;--> statement-breakpoint
ALTER TABLE "prediction_credit_ledger" ADD COLUMN "hash_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "prediction_orders" ADD COLUMN "intent" varchar(4) DEFAULT 'buy' NOT NULL;--> statement-breakpoint
ALTER TABLE "prediction_orders" ADD COLUMN "reserved_shares_micros" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "prediction_orders" ADD COLUMN "proceeds_micros" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "prediction_positions" ADD COLUMN "reserved_shares_micros" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
DROP TRIGGER IF EXISTS "prediction_credit_ledger_guard" ON "prediction_credit_ledger";--> statement-breakpoint
DROP FUNCTION IF EXISTS duna_guard_prediction_credit_ledger();--> statement-breakpoint
ALTER TABLE "prediction_share_trades" ADD CONSTRAINT "prediction_share_trades_market_id_prediction_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."prediction_markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_share_trades" ADD CONSTRAINT "prediction_share_trades_buy_order_id_prediction_orders_id_fk" FOREIGN KEY ("buy_order_id") REFERENCES "public"."prediction_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_share_trades" ADD CONSTRAINT "prediction_share_trades_sell_order_id_prediction_orders_id_fk" FOREIGN KEY ("sell_order_id") REFERENCES "public"."prediction_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_share_trades" ADD CONSTRAINT "prediction_share_trades_seller_position_id_prediction_positions_id_fk" FOREIGN KEY ("seller_position_id") REFERENCES "public"."prediction_positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_share_trades" ADD CONSTRAINT "prediction_share_trades_maker_order_id_prediction_orders_id_fk" FOREIGN KEY ("maker_order_id") REFERENCES "public"."prediction_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prediction_share_trade_market_time_idx" ON "prediction_share_trades" USING btree ("market_id","executed_at");--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
CREATE OR REPLACE FUNCTION duna_prediction_credit_ledger_hash(
	p_account_id uuid,
	p_chain_sequence bigint,
	p_previous_hash text,
	p_entry_id uuid,
	p_person_id uuid,
	p_delta_micros bigint,
	p_kind text,
	p_market_id uuid,
	p_order_id uuid,
	p_position_id uuid,
	p_period_key text,
	p_idempotency_key text,
	p_note text,
	p_metadata jsonb,
	p_occurred_at timestamptz
) RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
	SELECT encode(
		digest(
			convert_to(
				'duna-prediction-ledger-v1' || chr(31) ||
				coalesce(p_account_id::text, '') || chr(31) ||
				coalesce(p_chain_sequence::text, '') || chr(31) ||
				coalesce(p_previous_hash, '') || chr(31) ||
				coalesce(p_entry_id::text, '') || chr(31) ||
				coalesce(p_person_id::text, '') || chr(31) ||
				coalesce(p_delta_micros::text, '') || chr(31) ||
				coalesce(p_kind, '') || chr(31) ||
				coalesce(p_market_id::text, '') || chr(31) ||
				coalesce(p_order_id::text, '') || chr(31) ||
				coalesce(p_position_id::text, '') || chr(31) ||
				coalesce(p_period_key, '') || chr(31) ||
				coalesce(p_idempotency_key, '') || chr(31) ||
				coalesce(p_note, '') || chr(31) ||
				coalesce(p_metadata::text, '{}') || chr(31) ||
				coalesce(to_char(p_occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), ''),
				'UTF8'
			),
			'sha256'
		),
		'hex'
	);
$$;--> statement-breakpoint
DO $$
DECLARE
	account_row record;
	entry_row record;
	sequence_value bigint;
	previous_hash_value text;
	entry_hash_value text;
BEGIN
	FOR account_row IN
		SELECT DISTINCT account_id
		FROM prediction_credit_ledger
		ORDER BY account_id
	LOOP
		sequence_value := 0;
		previous_hash_value := repeat('0', 64);
		FOR entry_row IN
			SELECT *
			FROM prediction_credit_ledger
			WHERE account_id = account_row.account_id
			ORDER BY occurred_at, created_at, id
		LOOP
			sequence_value := sequence_value + 1;
			entry_hash_value := duna_prediction_credit_ledger_hash(
				entry_row.account_id,
				sequence_value,
				previous_hash_value,
				entry_row.id,
				entry_row.person_id,
				entry_row.delta_micros,
				entry_row.kind,
				entry_row.market_id,
				entry_row.order_id,
				entry_row.position_id,
				entry_row.period_key,
				entry_row.idempotency_key,
				entry_row.note,
				entry_row.metadata,
				entry_row.occurred_at
			);
			UPDATE prediction_credit_ledger
			SET chain_sequence = sequence_value,
				previous_hash = previous_hash_value,
				entry_hash = entry_hash_value,
				hash_version = 1
			WHERE id = entry_row.id;
			previous_hash_value := entry_hash_value;
		END LOOP;
	END LOOP;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION duna_prediction_credit_ledger_chain_entry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	prior_sequence bigint;
	prior_hash text;
	owner_person_id uuid;
BEGIN
	SELECT person_id
	INTO owner_person_id
	FROM prediction_credit_accounts
	WHERE id = NEW.account_id
	FOR UPDATE;

	IF owner_person_id IS NULL OR owner_person_id <> NEW.person_id THEN
		RAISE EXCEPTION 'prediction credit ledger account does not match person';
	END IF;

	SELECT chain_sequence, entry_hash
	INTO prior_sequence, prior_hash
	FROM prediction_credit_ledger
	WHERE account_id = NEW.account_id
	ORDER BY chain_sequence DESC
	LIMIT 1;

	NEW.chain_sequence := coalesce(prior_sequence, 0) + 1;
	NEW.previous_hash := coalesce(prior_hash, repeat('0', 64));
	NEW.hash_version := 1;
	NEW.entry_hash := duna_prediction_credit_ledger_hash(
		NEW.account_id,
		NEW.chain_sequence,
		NEW.previous_hash,
		NEW.id,
		NEW.person_id,
		NEW.delta_micros,
		NEW.kind,
		NEW.market_id,
		NEW.order_id,
		NEW.position_id,
		NEW.period_key,
		NEW.idempotency_key,
		NEW.note,
		NEW.metadata,
		NEW.occurred_at
	);
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER prediction_credit_ledger_chain_entry
BEFORE INSERT ON prediction_credit_ledger
FOR EACH ROW
EXECUTE FUNCTION duna_prediction_credit_ledger_chain_entry();--> statement-breakpoint
CREATE OR REPLACE FUNCTION duna_prediction_credit_ledger_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'prediction_credit_ledger is append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER prediction_credit_ledger_append_only
BEFORE UPDATE OR DELETE ON prediction_credit_ledger
FOR EACH ROW
EXECUTE FUNCTION duna_prediction_credit_ledger_append_only();--> statement-breakpoint
CREATE OR REPLACE FUNCTION prediction_credit_ledger_integrity(p_account_id uuid)
RETURNS TABLE(entry_count bigint, head_hash text, verified boolean)
LANGUAGE sql
STABLE
AS $$
	WITH ordered AS (
		SELECT
			ledger.*,
			row_number() OVER (ORDER BY chain_sequence) AS expected_sequence,
			lag(entry_hash) OVER (ORDER BY chain_sequence) AS expected_previous_hash
		FROM prediction_credit_ledger ledger
		WHERE account_id = p_account_id
	), checked AS (
		SELECT
			*,
			entry_hash = duna_prediction_credit_ledger_hash(
				account_id,
				chain_sequence,
				previous_hash,
				id,
				person_id,
				delta_micros,
				kind,
				market_id,
				order_id,
				position_id,
				period_key,
				idempotency_key,
				note,
				metadata,
				occurred_at
			) AS hash_matches
		FROM ordered
	)
	SELECT
		count(*)::bigint,
		(array_agg(entry_hash ORDER BY chain_sequence DESC))[1],
		coalesce(
			bool_and(
				chain_sequence = expected_sequence
				AND previous_hash = coalesce(expected_previous_hash, repeat('0', 64))
				AND hash_version = 1
				AND hash_matches
			),
			true
		)
		AND coalesce(sum(delta_micros), 0) = coalesce(
			(
				SELECT cached_available_micros
				FROM prediction_credit_accounts
				WHERE id = p_account_id
			),
			0
		)
	FROM checked;
$$;--> statement-breakpoint
CREATE UNIQUE INDEX "prediction_credit_ledger_account_sequence_unique" ON "prediction_credit_ledger" USING btree ("account_id","chain_sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "prediction_credit_ledger_entry_hash_unique" ON "prediction_credit_ledger" USING btree ("entry_hash");--> statement-breakpoint
ALTER TABLE "prediction_credit_ledger" ADD CONSTRAINT "prediction_credit_ledger_hash_valid" CHECK ("prediction_credit_ledger"."hash_version" = 1 AND char_length("prediction_credit_ledger"."previous_hash") = 64 AND char_length("prediction_credit_ledger"."entry_hash") = 64);--> statement-breakpoint
ALTER TABLE "prediction_credit_ledger" ADD CONSTRAINT "prediction_credit_ledger_delta_valid" CHECK ("prediction_credit_ledger"."delta_micros" <> 0 OR "prediction_credit_ledger"."kind" IN ('sell-order', 'sell-release'));--> statement-breakpoint
ALTER TABLE "prediction_credit_ledger" ADD CONSTRAINT "prediction_credit_ledger_kind_valid" CHECK ("prediction_credit_ledger"."kind" IN ('initial-grant', 'monthly-grant', 'order-reserve', 'sell-order', 'sell-release', 'sale-proceeds', 'price-improvement-refund', 'settlement', 'void-refund', 'admin-adjustment'));--> statement-breakpoint
ALTER TABLE "prediction_orders" ADD CONSTRAINT "prediction_order_intent_valid" CHECK ("prediction_orders"."intent" IN ('buy', 'sell'));--> statement-breakpoint
ALTER TABLE "prediction_orders" ADD CONSTRAINT "prediction_order_reserve_type_valid" CHECK (("prediction_orders"."intent" = 'buy' AND "prediction_orders"."reserved_shares_micros" = 0) OR ("prediction_orders"."intent" = 'sell' AND "prediction_orders"."reserved_micros" = 0));--> statement-breakpoint
ALTER TABLE "prediction_orders" ADD CONSTRAINT "prediction_order_amounts_valid" CHECK ("prediction_orders"."shares_micros" > 0 AND "prediction_orders"."remaining_shares_micros" >= 0 AND "prediction_orders"."remaining_shares_micros" <= "prediction_orders"."shares_micros" AND "prediction_orders"."reserved_micros" >= 0 AND "prediction_orders"."reserved_shares_micros" >= 0 AND "prediction_orders"."reserved_shares_micros" <= "prediction_orders"."remaining_shares_micros" AND "prediction_orders"."spent_micros" >= 0 AND "prediction_orders"."proceeds_micros" >= 0);--> statement-breakpoint
ALTER TABLE "prediction_positions" ADD CONSTRAINT "prediction_position_amounts_valid" CHECK ("prediction_positions"."shares_micros" >= 0 AND "prediction_positions"."cost_micros" >= 0 AND "prediction_positions"."payout_micros" >= 0 AND "prediction_positions"."reserved_shares_micros" >= 0 AND "prediction_positions"."reserved_shares_micros" <= "prediction_positions"."shares_micros");
