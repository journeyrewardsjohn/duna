ALTER TABLE "people" ADD COLUMN "stripe_customer_id" varchar(128);--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_stripe_customer_id_unique" UNIQUE("stripe_customer_id");