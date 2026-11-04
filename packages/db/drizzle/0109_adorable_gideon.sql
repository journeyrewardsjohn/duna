CREATE TABLE "website_credit_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_id" text NOT NULL,
	"credits" integer NOT NULL,
	"remaining" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "website_credit_balance_valid" CHECK ("website_credit_grants"."remaining" >= 0 AND "website_credit_grants"."remaining" <= "website_credit_grants"."credits")
);
--> statement-breakpoint
CREATE TABLE "website_credit_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"grant_id" uuid NOT NULL,
	"operation_id" text NOT NULL,
	"reserved" integer NOT NULL,
	"consumed" integer,
	"status" text DEFAULT 'reserved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "website_credit_reservation_valid" CHECK ("website_credit_reservations"."reserved" > 0 AND ("website_credit_reservations"."consumed" IS NULL OR ("website_credit_reservations"."consumed" >= 0 AND "website_credit_reservations"."consumed" <= "website_credit_reservations"."reserved")))
);
--> statement-breakpoint
CREATE TABLE "website_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"document" jsonb NOT NULL,
	"brief" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deployment_id" text,
	"deployment_url" text,
	"status" text DEFAULT 'draft' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_websites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"brief" text DEFAULT '' NOT NULL,
	"source_url" text,
	"inspiration_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"draft" jsonb,
	"published_revision_id" uuid,
	"vercel_project_id" text,
	"neon_project_id" text,
	"domain" text,
	"provisioning_status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "website_subscriptions" (
	"site_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" text DEFAULT 'inactive' NOT NULL,
	"period_ends_at" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "website_credit_grants" ADD CONSTRAINT "website_credit_grants_site_id_club_websites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."club_websites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_credit_reservations" ADD CONSTRAINT "website_credit_reservations_site_id_club_websites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."club_websites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_credit_reservations" ADD CONSTRAINT "website_credit_reservations_grant_id_website_credit_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."website_credit_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_revisions" ADD CONSTRAINT "website_revisions_site_id_club_websites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."club_websites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_subscriptions" ADD CONSTRAINT "website_subscriptions_site_id_club_websites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."club_websites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "website_credit_source_unique" ON "website_credit_grants" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "website_credit_operation_unique" ON "website_credit_reservations" USING btree ("site_id","operation_id");--> statement-breakpoint
CREATE INDEX "website_revisions_site_idx" ON "website_revisions" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "club_websites_org_idx" ON "club_websites" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "website_subscription_stripe_unique" ON "website_subscriptions" USING btree ("stripe_subscription_id");