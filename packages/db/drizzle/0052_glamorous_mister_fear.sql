CREATE TABLE "prediction_credit_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"cached_available_micros" bigint DEFAULT 0 NOT NULL,
	"lifetime_granted_micros" bigint DEFAULT 0 NOT NULL,
	"status" varchar(24) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prediction_credit_accounts_person_id_unique" UNIQUE("person_id"),
	CONSTRAINT "prediction_credit_account_balance_valid" CHECK ("prediction_credit_accounts"."cached_available_micros" >= 0 AND "prediction_credit_accounts"."lifetime_granted_micros" >= 0),
	CONSTRAINT "prediction_credit_account_status_valid" CHECK ("prediction_credit_accounts"."status" IN ('active', 'frozen', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "prediction_credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"delta_micros" bigint NOT NULL,
	"kind" varchar(32) NOT NULL,
	"market_id" uuid,
	"order_id" uuid,
	"position_id" uuid,
	"period_key" varchar(16),
	"idempotency_key" varchar(160) NOT NULL,
	"note" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prediction_credit_ledger_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "prediction_credit_ledger_delta_valid" CHECK ("prediction_credit_ledger"."delta_micros" <> 0),
	CONSTRAINT "prediction_credit_ledger_kind_valid" CHECK ("prediction_credit_ledger"."kind" IN ('initial-grant', 'monthly-grant', 'order-reserve', 'price-improvement-refund', 'settlement', 'void-refund', 'admin-adjustment'))
);
--> statement-breakpoint
CREATE TABLE "prediction_markets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" varchar(32) NOT NULL,
	"subject_id" text NOT NULL,
	"group_key" text,
	"title" text NOT NULL,
	"yes_label" text NOT NULL,
	"no_label" text NOT NULL,
	"status" varchar(24) DEFAULT 'open' NOT NULL,
	"initial_yes_price_bps" integer DEFAULT 5000 NOT NULL,
	"last_yes_price_bps" integer DEFAULT 5000 NOT NULL,
	"volume_micros" bigint DEFAULT 0 NOT NULL,
	"opens_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locks_at" timestamp with time zone,
	"resolved_side" varchar(3),
	"settled_at" timestamp with time zone,
	"source_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prediction_market_status_valid" CHECK ("prediction_markets"."status" IN ('open', 'locked', 'settled', 'void')),
	CONSTRAINT "prediction_market_prices_valid" CHECK ("prediction_markets"."initial_yes_price_bps" BETWEEN 100 AND 9900 AND "prediction_markets"."last_yes_price_bps" BETWEEN 0 AND 10000),
	CONSTRAINT "prediction_market_resolution_valid" CHECK ("prediction_markets"."resolved_side" IS NULL OR "prediction_markets"."resolved_side" IN ('yes', 'no'))
);
--> statement-breakpoint
CREATE TABLE "prediction_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"side" varchar(3) NOT NULL,
	"limit_price_bps" integer NOT NULL,
	"shares_micros" bigint NOT NULL,
	"remaining_shares_micros" bigint NOT NULL,
	"reserved_micros" bigint NOT NULL,
	"spent_micros" bigint DEFAULT 0 NOT NULL,
	"status" varchar(24) DEFAULT 'open' NOT NULL,
	"filled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prediction_order_side_valid" CHECK ("prediction_orders"."side" IN ('yes', 'no')),
	CONSTRAINT "prediction_order_price_valid" CHECK ("prediction_orders"."limit_price_bps" BETWEEN 100 AND 9900),
	CONSTRAINT "prediction_order_amounts_valid" CHECK ("prediction_orders"."shares_micros" > 0 AND "prediction_orders"."remaining_shares_micros" >= 0 AND "prediction_orders"."remaining_shares_micros" <= "prediction_orders"."shares_micros" AND "prediction_orders"."reserved_micros" >= 0 AND "prediction_orders"."spent_micros" >= 0),
	CONSTRAINT "prediction_order_status_valid" CHECK ("prediction_orders"."status" IN ('open', 'partially-filled', 'filled', 'settled', 'void'))
);
--> statement-breakpoint
CREATE TABLE "prediction_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"side" varchar(3) NOT NULL,
	"shares_micros" bigint DEFAULT 0 NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"payout_micros" bigint DEFAULT 0 NOT NULL,
	"status" varchar(24) DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prediction_position_side_valid" CHECK ("prediction_positions"."side" IN ('yes', 'no')),
	CONSTRAINT "prediction_position_amounts_valid" CHECK ("prediction_positions"."shares_micros" >= 0 AND "prediction_positions"."cost_micros" >= 0 AND "prediction_positions"."payout_micros" >= 0),
	CONSTRAINT "prediction_position_status_valid" CHECK ("prediction_positions"."status" IN ('open', 'won', 'lost', 'void'))
);
--> statement-breakpoint
CREATE TABLE "prediction_price_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"yes_price_bps" integer NOT NULL,
	"source" varchar(24) NOT NULL,
	"volume_micros" bigint DEFAULT 0 NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prediction_price_snapshot_valid" CHECK ("prediction_price_snapshots"."yes_price_bps" BETWEEN 0 AND 10000 AND "prediction_price_snapshots"."volume_micros" >= 0),
	CONSTRAINT "prediction_price_snapshot_source_valid" CHECK ("prediction_price_snapshots"."source" IN ('model', 'trade', 'settlement'))
);
--> statement-breakpoint
CREATE TABLE "prediction_trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"yes_order_id" uuid NOT NULL,
	"no_order_id" uuid NOT NULL,
	"maker_order_id" uuid NOT NULL,
	"shares_micros" bigint NOT NULL,
	"yes_price_bps" integer NOT NULL,
	"yes_cost_micros" bigint NOT NULL,
	"no_cost_micros" bigint NOT NULL,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prediction_trade_shares_valid" CHECK ("prediction_trades"."shares_micros" > 0),
	CONSTRAINT "prediction_trade_price_valid" CHECK ("prediction_trades"."yes_price_bps" BETWEEN 100 AND 9900),
	CONSTRAINT "prediction_trade_cost_valid" CHECK ("prediction_trades"."yes_cost_micros" >= 0 AND "prediction_trades"."no_cost_micros" >= 0 AND "prediction_trades"."yes_cost_micros" + "prediction_trades"."no_cost_micros" = "prediction_trades"."shares_micros")
);
--> statement-breakpoint
ALTER TABLE "prediction_credit_accounts" ADD CONSTRAINT "prediction_credit_accounts_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_credit_ledger" ADD CONSTRAINT "prediction_credit_ledger_account_id_prediction_credit_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."prediction_credit_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_credit_ledger" ADD CONSTRAINT "prediction_credit_ledger_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_credit_ledger" ADD CONSTRAINT "prediction_credit_ledger_market_id_prediction_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."prediction_markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_credit_ledger" ADD CONSTRAINT "prediction_credit_ledger_order_id_prediction_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."prediction_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_credit_ledger" ADD CONSTRAINT "prediction_credit_ledger_position_id_prediction_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."prediction_positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_orders" ADD CONSTRAINT "prediction_orders_market_id_prediction_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."prediction_markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_orders" ADD CONSTRAINT "prediction_orders_account_id_prediction_credit_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."prediction_credit_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_orders" ADD CONSTRAINT "prediction_orders_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_positions" ADD CONSTRAINT "prediction_positions_market_id_prediction_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."prediction_markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_positions" ADD CONSTRAINT "prediction_positions_account_id_prediction_credit_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."prediction_credit_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_positions" ADD CONSTRAINT "prediction_positions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_price_snapshots" ADD CONSTRAINT "prediction_price_snapshots_market_id_prediction_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."prediction_markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_trades" ADD CONSTRAINT "prediction_trades_market_id_prediction_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."prediction_markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_trades" ADD CONSTRAINT "prediction_trades_yes_order_id_prediction_orders_id_fk" FOREIGN KEY ("yes_order_id") REFERENCES "public"."prediction_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_trades" ADD CONSTRAINT "prediction_trades_no_order_id_prediction_orders_id_fk" FOREIGN KEY ("no_order_id") REFERENCES "public"."prediction_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_trades" ADD CONSTRAINT "prediction_trades_maker_order_id_prediction_orders_id_fk" FOREIGN KEY ("maker_order_id") REFERENCES "public"."prediction_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prediction_credit_ledger_account_time_idx" ON "prediction_credit_ledger" USING btree ("account_id","occurred_at");--> statement-breakpoint
CREATE INDEX "prediction_credit_ledger_market_idx" ON "prediction_credit_ledger" USING btree ("market_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prediction_market_subject_unique" ON "prediction_markets" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "prediction_market_group_idx" ON "prediction_markets" USING btree ("group_key","status");--> statement-breakpoint
CREATE INDEX "prediction_market_status_lock_idx" ON "prediction_markets" USING btree ("status","locks_at");--> statement-breakpoint
CREATE INDEX "prediction_order_book_idx" ON "prediction_orders" USING btree ("market_id","side","status","limit_price_bps","created_at");--> statement-breakpoint
CREATE INDEX "prediction_order_person_idx" ON "prediction_orders" USING btree ("person_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "prediction_position_person_side_unique" ON "prediction_positions" USING btree ("market_id","person_id","side");--> statement-breakpoint
CREATE INDEX "prediction_position_person_status_idx" ON "prediction_positions" USING btree ("person_id","status");--> statement-breakpoint
CREATE INDEX "prediction_price_market_time_idx" ON "prediction_price_snapshots" USING btree ("market_id","recorded_at");--> statement-breakpoint
CREATE INDEX "prediction_trade_market_time_idx" ON "prediction_trades" USING btree ("market_id","executed_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION duna_guard_prediction_credit_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  owner_person_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'prediction credit ledger entries are append-only';
  END IF;

  SELECT person_id
  INTO owner_person_id
  FROM prediction_credit_accounts
  WHERE id = NEW.account_id;

  IF owner_person_id IS NULL OR owner_person_id <> NEW.person_id THEN
    RAISE EXCEPTION 'prediction credit ledger account does not match person';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "prediction_credit_ledger_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "prediction_credit_ledger"
FOR EACH ROW EXECUTE FUNCTION duna_guard_prediction_credit_ledger();
