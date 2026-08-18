CREATE TABLE "super_admin_money_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_person_id" uuid NOT NULL,
	"buyer_person_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"disposition" varchar(24) NOT NULL,
	"credits" integer,
	"reason" text NOT NULL,
	"confirmation_code_hash" varchar(128) NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"failure_code" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "super_admin_money_review_amount_positive" CHECK ("super_admin_money_reviews"."amount_minor" > 0),
	CONSTRAINT "super_admin_money_review_disposition_valid" CHECK ("super_admin_money_reviews"."disposition" IN ('original-payment', 'organization-credit')),
	CONSTRAINT "super_admin_money_review_status_valid" CHECK ("super_admin_money_reviews"."status" IN ('pending', 'processing', 'succeeded', 'failed', 'expired'))
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "system_key" varchar(32);--> statement-breakpoint
ALTER TABLE "super_admin_money_reviews" ADD CONSTRAINT "super_admin_money_reviews_actor_person_id_people_id_fk" FOREIGN KEY ("actor_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "super_admin_money_reviews" ADD CONSTRAINT "super_admin_money_reviews_buyer_person_id_people_id_fk" FOREIGN KEY ("buyer_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "super_admin_money_reviews" ADD CONSTRAINT "super_admin_money_reviews_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "super_admin_money_reviews" ADD CONSTRAINT "super_admin_money_reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "super_admin_money_review_actor_created_idx" ON "super_admin_money_reviews" USING btree ("actor_person_id","created_at");--> statement-breakpoint
CREATE INDEX "super_admin_money_review_order_idx" ON "super_admin_money_reviews" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_system_key_unique" UNIQUE("system_key");