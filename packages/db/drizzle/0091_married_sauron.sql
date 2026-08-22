CREATE TABLE "payment_schedule_installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"payment_id" uuid,
	"sequence" integer NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" varchar(24) DEFAULT 'scheduled' NOT NULL,
	"stripe_invoice_id" varchar(128),
	"stripe_payment_intent_id" varchar(128),
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"paid_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failure_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_schedule_installments_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id"),
	CONSTRAINT "payment_schedule_installment_status_valid" CHECK ("payment_schedule_installments"."status" IN ('scheduled', 'processing', 'paid', 'failed', 'refunded', 'cancelled')),
	CONSTRAINT "payment_schedule_installment_amount_valid" CHECK ("payment_schedule_installments"."sequence" > 0 AND "payment_schedule_installments"."amount_minor" >= 0 AND "payment_schedule_installments"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payment_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"buyer_person_id" uuid NOT NULL,
	"stripe_subscription_id" varchar(128),
	"stripe_subscription_schedule_id" varchar(128),
	"kind" varchar(24) DEFAULT 'installment' NOT NULL,
	"status" varchar(24) DEFAULT 'scheduled' NOT NULL,
	"installment_count" integer NOT NULL,
	"total_minor" integer NOT NULL,
	"paid_minor" integer DEFAULT 0 NOT NULL,
	"refunded_minor" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) NOT NULL,
	"cadence" varchar(16) DEFAULT 'monthly' NOT NULL,
	"terms_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_schedules_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "payment_schedules_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id"),
	CONSTRAINT "payment_schedules_stripe_subscription_schedule_id_unique" UNIQUE("stripe_subscription_schedule_id"),
	CONSTRAINT "payment_schedule_kind_valid" CHECK ("payment_schedules"."kind" IN ('installment', 'membership')),
	CONSTRAINT "payment_schedule_status_valid" CHECK ("payment_schedules"."status" IN ('scheduled', 'active', 'past-due', 'completed', 'cancelled', 'refunded')),
	CONSTRAINT "payment_schedule_amounts_valid" CHECK ("payment_schedules"."installment_count" > 0 AND "payment_schedules"."total_minor" >= 0 AND "payment_schedules"."paid_minor" >= 0 AND "payment_schedules"."refunded_minor" >= 0 AND "payment_schedules"."paid_minor" <= "payment_schedules"."total_minor"),
	CONSTRAINT "payment_schedule_cadence_valid" CHECK ("payment_schedules"."cadence" IN ('weekly', 'monthly', 'annual'))
);
--> statement-breakpoint
CREATE TABLE "payout_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payout_id" uuid NOT NULL,
	"payment_fund_schedule_id" uuid NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payout_allocation_amount_valid" CHECK ("payout_allocations"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "stripe_transaction_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"stripe_payment_intent_id" varchar(128) NOT NULL,
	"stripe_charge_id" varchar(128) NOT NULL,
	"stripe_transfer_id" varchar(128),
	"stripe_destination_payment_id" varchar(128),
	"stripe_balance_transaction_id" varchar(128),
	"stripe_application_fee_id" varchar(128),
	"gross_minor" integer NOT NULL,
	"fee_minor" integer DEFAULT 0 NOT NULL,
	"net_minor" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"available_at" timestamp with time zone,
	"livemode" boolean NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_transaction_links_payment_id_unique" UNIQUE("payment_id"),
	CONSTRAINT "stripe_transaction_links_stripe_balance_transaction_id_unique" UNIQUE("stripe_balance_transaction_id"),
	CONSTRAINT "stripe_transaction_link_amounts_valid" CHECK ("stripe_transaction_links"."gross_minor" >= 0 AND "stripe_transaction_links"."fee_minor" >= 0 AND "stripe_transaction_links"."net_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "payment_fund_schedules" DROP CONSTRAINT "payment_fund_schedules_order_id_unique";--> statement-breakpoint
ALTER TABLE "payment_fund_schedules" ADD COLUMN "installment_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_fund_schedules" ADD COLUMN "stripe_transfer_id" varchar(128);--> statement-breakpoint
ALTER TABLE "payment_fund_schedules" ADD COLUMN "stripe_balance_transaction_id" varchar(128);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "stripe_payment_intent_id" varchar(128);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "stripe_invoice_id" varchar(128);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "stripe_subscription_id" varchar(128);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "stripe_transfer_id" varchar(128);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "stripe_destination_payment_id" varchar(128);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "stripe_balance_transaction_id" varchar(128);--> statement-breakpoint
ALTER TABLE "payment_schedule_installments" ADD CONSTRAINT "payment_schedule_installments_schedule_id_payment_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."payment_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_schedule_installments" ADD CONSTRAINT "payment_schedule_installments_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_buyer_person_id_people_id_fk" FOREIGN KEY ("buyer_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_allocations" ADD CONSTRAINT "payout_allocations_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_allocations" ADD CONSTRAINT "payout_allocations_payment_fund_schedule_id_payment_fund_schedules_id_fk" FOREIGN KEY ("payment_fund_schedule_id") REFERENCES "public"."payment_fund_schedules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_transaction_links" ADD CONSTRAINT "stripe_transaction_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_transaction_links" ADD CONSTRAINT "stripe_transaction_links_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_transaction_links" ADD CONSTRAINT "stripe_transaction_links_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_schedule_installment_sequence_unique" ON "payment_schedule_installments" USING btree ("schedule_id","sequence");--> statement-breakpoint
CREATE INDEX "payment_schedule_installment_due_idx" ON "payment_schedule_installments" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "payment_schedule_buyer_status_idx" ON "payment_schedules" USING btree ("buyer_person_id","status","created_at");--> statement-breakpoint
CREATE INDEX "payment_schedule_org_status_idx" ON "payment_schedules" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_allocation_fund_unique" ON "payout_allocations" USING btree ("payout_id","payment_fund_schedule_id");--> statement-breakpoint
CREATE INDEX "stripe_transaction_link_org_created_idx" ON "stripe_transaction_links" USING btree ("organization_id","created_at");--> statement-breakpoint
ALTER TABLE "payment_fund_schedules" ADD CONSTRAINT "payment_fund_schedules_installment_id_payment_schedule_installments_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."payment_schedule_installments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_fund_schedule_payment_unique" ON "payment_fund_schedules" USING btree ("payment_id") WHERE "payment_fund_schedules"."payment_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_fund_schedule_installment_unique" ON "payment_fund_schedules" USING btree ("installment_id") WHERE "payment_fund_schedules"."installment_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_stripe_balance_transaction_id_unique" UNIQUE("stripe_balance_transaction_id");