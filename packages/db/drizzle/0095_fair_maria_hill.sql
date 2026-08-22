ALTER TABLE "payouts" ADD COLUMN "idempotency_key" varchar(160);--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "method" varchar(16);--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "destination_id" varchar(128);--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "destination_name" varchar(128);--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "destination_last4" varchar(4);--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "statement_descriptor" varchar(22);--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "livemode" boolean;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "trace_id" varchar(128);--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "trace_status" varchar(24);--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "failure_code" varchar(64);--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "failure_message" text;--> statement-breakpoint
CREATE UNIQUE INDEX "payout_organization_idempotency_unique" ON "payouts" USING btree ("organization_id","idempotency_key");