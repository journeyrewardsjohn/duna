CREATE TABLE "promo_code_catalog_items" (
	"promo_code_id" uuid NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_code_catalog_items_promo_code_id_catalog_item_id_pk" PRIMARY KEY("promo_code_id","catalog_item_id")
);
--> statement-breakpoint
CREATE TABLE "promo_code_members" (
	"promo_code_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_code_members_promo_code_id_person_id_pk" PRIMARY KEY("promo_code_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "promo_code_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promo_code_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"original_subtotal_minor" integer NOT NULL,
	"eligible_subtotal_minor" integer NOT NULL,
	"discount_minor" integer NOT NULL,
	"net_subtotal_minor" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"stripe_coupon_id" varchar(128),
	"stripe_promotion_code_id" varchar(128),
	"redeemed_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_redemption_status_valid" CHECK ("promo_code_redemptions"."status" IN ('pending', 'redeemed', 'released', 'refunded')),
	CONSTRAINT "promo_redemption_amounts_valid" CHECK ("promo_code_redemptions"."original_subtotal_minor" >= 0 AND "promo_code_redemptions"."eligible_subtotal_minor" >= 0 AND "promo_code_redemptions"."discount_minor" > 0 AND "promo_code_redemptions"."net_subtotal_minor" >= 0 AND "promo_code_redemptions"."net_subtotal_minor" = "promo_code_redemptions"."original_subtotal_minor" - "promo_code_redemptions"."discount_minor"),
	CONSTRAINT "promo_redemption_currency_uppercase" CHECK ("promo_code_redemptions"."currency" = upper("promo_code_redemptions"."currency"))
);
--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "name" text DEFAULT 'Promotion' NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "currency" varchar(3) DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "minimum_purchase_minor" integer;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "maximum_discount_minor" integer;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "per_person_limit" integer;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "applies_to_all_plans" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "applies_to_all_products" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "applies_to_all_services" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "stripe_coupon_id" varchar(128);--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "stripe_promotion_code_id" varchar(128);--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "stripe_sync_status" varchar(24) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "stripe_sync_error" text;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "stripe_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "duplicated_from_id" uuid;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "promo_code_catalog_items" ADD CONSTRAINT "promo_code_catalog_items_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_code_catalog_items" ADD CONSTRAINT "promo_code_catalog_items_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_code_members" ADD CONSTRAINT "promo_code_members_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_code_members" ADD CONSTRAINT "promo_code_members_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_code_redemptions" ADD CONSTRAINT "promo_code_redemptions_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_code_redemptions" ADD CONSTRAINT "promo_code_redemptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_code_redemptions" ADD CONSTRAINT "promo_code_redemptions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_code_redemptions" ADD CONSTRAINT "promo_code_redemptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "promo_item_catalog_idx" ON "promo_code_catalog_items" USING btree ("catalog_item_id");--> statement-breakpoint
CREATE INDEX "promo_member_person_idx" ON "promo_code_members" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "promo_redemption_order_unique" ON "promo_code_redemptions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "promo_redemption_code_status_idx" ON "promo_code_redemptions" USING btree ("promo_code_id","status");--> statement-breakpoint
CREATE INDEX "promo_redemption_person_idx" ON "promo_code_redemptions" USING btree ("promo_code_id","person_id","status");--> statement-breakpoint
UPDATE "promo_codes" SET "discount_type" = 'percent' WHERE "discount_type" IN ('percentage', 'percent_off');--> statement-breakpoint
UPDATE "promo_codes" SET "discount_type" = 'amount' WHERE "discount_type" IN ('fixed', 'dollars', 'amount_off');--> statement-breakpoint
UPDATE "promo_codes" SET "discount_value" = "discount_value" * 100 WHERE "discount_type" = 'percent' AND "discount_value" BETWEEN 1 AND 100;--> statement-breakpoint
DELETE FROM "promo_codes" WHERE "discount_type" NOT IN ('percent', 'amount') OR "discount_value" <= 0 OR ("discount_type" = 'percent' AND "discount_value" > 10000);--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_discount_type_valid" CHECK ("promo_codes"."discount_type" IN ('percent', 'amount'));--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_discount_value_valid" CHECK ("promo_codes"."discount_value" > 0 AND ("promo_codes"."discount_type" <> 'percent' OR "promo_codes"."discount_value" <= 10000));--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_currency_uppercase" CHECK ("promo_codes"."currency" = upper("promo_codes"."currency"));--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_limits_positive" CHECK (("promo_codes"."minimum_purchase_minor" IS NULL OR "promo_codes"."minimum_purchase_minor" >= 0) AND ("promo_codes"."maximum_discount_minor" IS NULL OR "promo_codes"."maximum_discount_minor" > 0) AND ("promo_codes"."redemption_cap" IS NULL OR "promo_codes"."redemption_cap" > 0) AND ("promo_codes"."per_person_limit" IS NULL OR "promo_codes"."per_person_limit" > 0));--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_window_valid" CHECK ("promo_codes"."starts_at" IS NULL OR "promo_codes"."ends_at" IS NULL OR "promo_codes"."ends_at" > "promo_codes"."starts_at");--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_stripe_sync_status_valid" CHECK ("promo_codes"."stripe_sync_status" IN ('pending', 'synced', 'failed', 'not-applicable'));
