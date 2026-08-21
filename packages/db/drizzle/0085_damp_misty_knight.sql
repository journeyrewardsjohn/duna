CREATE TABLE "membership_invoice_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"membership_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"stripe_subscription_id" varchar(128) NOT NULL,
	"stripe_invoice_id" varchar(128) NOT NULL,
	"stripe_payment_intent_id" varchar(128),
	"stripe_tax_transaction_id" varchar(128),
	"stripe_tax_transfer_reversal_id" varchar(128),
	"amount_paid_minor" integer NOT NULL,
	"tax_amount_minor" integer DEFAULT 0 NOT NULL,
	"refunded_minor" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" varchar(24) NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_invoice_transactions_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id"),
	CONSTRAINT "membership_invoice_amounts_valid" CHECK ("membership_invoice_transactions"."amount_paid_minor" >= 0 AND "membership_invoice_transactions"."tax_amount_minor" >= 0 AND "membership_invoice_transactions"."refunded_minor" >= 0 AND "membership_invoice_transactions"."refunded_minor" <= "membership_invoice_transactions"."amount_paid_minor"),
	CONSTRAINT "membership_invoice_status_valid" CHECK ("membership_invoice_transactions"."status" IN ('paid', 'partially-refunded', 'refunded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "membership_policy_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"acceptance_key" varchar(128) NOT NULL,
	"order_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"policy_version" varchar(32) NOT NULL,
	"policy_snapshot" jsonb NOT NULL,
	"disclosure_text" text NOT NULL,
	"disclosure_text_hash" varchar(128) NOT NULL,
	"affirmative_consent" boolean NOT NULL,
	"ip_address" varchar(64),
	"accepted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_policy_acceptances_acceptance_key_unique" UNIQUE("acceptance_key"),
	CONSTRAINT "membership_policy_acceptances_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "membership_policy_acceptance_affirmative" CHECK ("membership_policy_acceptances"."affirmative_consent" = true)
);
--> statement-breakpoint
CREATE TABLE "organization_money_settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"payout_interval" varchar(16) DEFAULT 'weekly' NOT NULL,
	"weekly_payout_day" varchar(12) DEFAULT 'friday' NOT NULL,
	"monthly_payout_day" integer DEFAULT 1 NOT NULL,
	"minimum_payout_minor" integer DEFAULT 0 NOT NULL,
	"statement_descriptor" varchar(22),
	"payout_statement_descriptor" varchar(22),
	"stripe_settings_status" varchar(24) DEFAULT 'not-synced' NOT NULL,
	"stripe_settings_synced_at" timestamp with time zone,
	"stripe_settings_error" text,
	"last_automatic_payout_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_money_payout_interval_valid" CHECK ("organization_money_settings"."payout_interval" IN ('manual', 'daily', 'weekly', 'monthly')),
	CONSTRAINT "organization_money_weekly_day_valid" CHECK ("organization_money_settings"."weekly_payout_day" IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday')),
	CONSTRAINT "organization_money_monthly_day_valid" CHECK ("organization_money_settings"."monthly_payout_day" BETWEEN 1 AND 28),
	CONSTRAINT "organization_money_minimum_payout_valid" CHECK ("organization_money_settings"."minimum_payout_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "organization_refund_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mode" varchar(24) DEFAULT 'refundable' NOT NULL,
	"refund_before_minutes" integer,
	"terms" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_refund_policy_mode_valid" CHECK ("organization_refund_policies"."mode" IN ('refundable', 'non-refundable')),
	CONSTRAINT "organization_refund_policy_window_valid" CHECK (("organization_refund_policies"."mode" = 'refundable' AND "organization_refund_policies"."refund_before_minutes" IS NOT NULL AND "organization_refund_policies"."refund_before_minutes" >= 0) OR ("organization_refund_policies"."mode" = 'non-refundable' AND "organization_refund_policies"."refund_before_minutes" IS NULL)),
	CONSTRAINT "organization_refund_policy_version_valid" CHECK ("organization_refund_policies"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_fund_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_id" uuid,
	"session_id" uuid,
	"payout_id" uuid,
	"policy_id" uuid,
	"policy_name" text NOT NULL,
	"policy_version" integer DEFAULT 1 NOT NULL,
	"policy_mode" varchar(24) NOT NULL,
	"refund_before_minutes" integer,
	"event_starts_at" timestamp with time zone,
	"policy_release_at" timestamp with time zone,
	"processor_available_at" timestamp with time zone,
	"available_at" timestamp with time zone,
	"gross_minor" integer NOT NULL,
	"consumer_fee_minor" integer DEFAULT 0 NOT NULL,
	"processing_fee_minor" integer DEFAULT 0 NOT NULL,
	"organization_fee_minor" integer DEFAULT 0 NOT NULL,
	"tax_minor" integer DEFAULT 0 NOT NULL,
	"net_minor" integer NOT NULL,
	"refunded_minor" integer DEFAULT 0 NOT NULL,
	"disputed_minor" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" varchar(24) DEFAULT 'pending-clearance' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_fund_schedules_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "payment_fund_schedule_policy_valid" CHECK ("payment_fund_schedules"."policy_mode" IN ('refundable', 'non-refundable')),
	CONSTRAINT "payment_fund_schedule_status_valid" CHECK ("payment_fund_schedules"."status" IN ('pending-clearance', 'held', 'available', 'payout-pending', 'paid-out', 'partially-refunded', 'refunded', 'disputed')),
	CONSTRAINT "payment_fund_schedule_amounts_valid" CHECK ("payment_fund_schedules"."gross_minor" >= 0 AND "payment_fund_schedules"."consumer_fee_minor" >= 0 AND "payment_fund_schedules"."processing_fee_minor" >= 0 AND "payment_fund_schedules"."organization_fee_minor" >= 0 AND "payment_fund_schedules"."tax_minor" >= 0 AND "payment_fund_schedules"."net_minor" >= 0 AND "payment_fund_schedules"."refunded_minor" >= 0 AND "payment_fund_schedules"."disputed_minor" >= 0),
	CONSTRAINT "payment_fund_schedule_policy_window_valid" CHECK (("payment_fund_schedules"."policy_mode" = 'refundable' AND "payment_fund_schedules"."refund_before_minutes" IS NOT NULL AND "payment_fund_schedules"."refund_before_minutes" >= 0) OR ("payment_fund_schedules"."policy_mode" = 'non-refundable' AND "payment_fund_schedules"."refund_before_minutes" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "stripe_subscription_schedule_id" varchar(128);--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "subscription_policy_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "initial_term_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "cancellation_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "cancellation_effective_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_tax_contexts" ADD COLUMN "policy_version" varchar(32);--> statement-breakpoint
ALTER TABLE "order_tax_contexts" ADD COLUMN "liability" varchar(24) DEFAULT 'platform' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_tax_contexts" ADD COLUMN "stripe_transfer_reversal_id" varchar(128);--> statement-breakpoint
ALTER TABLE "order_tax_contexts" ADD COLUMN "tax_withheld_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "membership_invoice_transactions" ADD CONSTRAINT "membership_invoice_transactions_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_invoice_transactions" ADD CONSTRAINT "membership_invoice_transactions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_invoice_transactions" ADD CONSTRAINT "membership_invoice_transactions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_policy_acceptances" ADD CONSTRAINT "membership_policy_acceptances_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_policy_acceptances" ADD CONSTRAINT "membership_policy_acceptances_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_policy_acceptances" ADD CONSTRAINT "membership_policy_acceptances_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_policy_acceptances" ADD CONSTRAINT "membership_policy_acceptances_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_money_settings" ADD CONSTRAINT "organization_money_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_refund_policies" ADD CONSTRAINT "organization_refund_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_fund_schedules" ADD CONSTRAINT "payment_fund_schedules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_fund_schedules" ADD CONSTRAINT "payment_fund_schedules_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_fund_schedules" ADD CONSTRAINT "payment_fund_schedules_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_fund_schedules" ADD CONSTRAINT "payment_fund_schedules_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_fund_schedules" ADD CONSTRAINT "payment_fund_schedules_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "membership_invoice_membership_idx" ON "membership_invoice_transactions" USING btree ("membership_id","created_at");--> statement-breakpoint
CREATE INDEX "membership_invoice_org_idx" ON "membership_invoice_transactions" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "membership_policy_acceptance_person_idx" ON "membership_policy_acceptances" USING btree ("person_id","accepted_at");--> statement-breakpoint
CREATE INDEX "membership_policy_acceptance_org_idx" ON "membership_policy_acceptances" USING btree ("organization_id","accepted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_refund_policy_name_unique" ON "organization_refund_policies" USING btree ("organization_id","name","version");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_refund_policy_default_unique" ON "organization_refund_policies" USING btree ("organization_id") WHERE "organization_refund_policies"."is_default" = true AND "organization_refund_policies"."active" = true;--> statement-breakpoint
CREATE INDEX "organization_refund_policy_active_idx" ON "organization_refund_policies" USING btree ("organization_id","active");--> statement-breakpoint
CREATE INDEX "payment_fund_schedule_release_idx" ON "payment_fund_schedules" USING btree ("organization_id","status","available_at");--> statement-breakpoint
CREATE INDEX "payment_fund_schedule_payout_idx" ON "payment_fund_schedules" USING btree ("payout_id");--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_stripe_subscription_schedule_id_unique" UNIQUE("stripe_subscription_schedule_id");--> statement-breakpoint
ALTER TABLE "order_tax_contexts" ADD CONSTRAINT "order_tax_liability_valid" CHECK ("order_tax_contexts"."liability" IN ('platform'));