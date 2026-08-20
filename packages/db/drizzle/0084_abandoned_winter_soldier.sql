CREATE TABLE "training_drill_licenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drill_id" uuid NOT NULL,
	"seller_organization_id" uuid NOT NULL,
	"buyer_organization_id" uuid NOT NULL,
	"catalog_fulfillment_id" uuid NOT NULL,
	"status" varchar(24) DEFAULT 'active' NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_drill_license_status_valid" CHECK ("training_drill_licenses"."status" IN ('active', 'revoked', 'refunded')),
	CONSTRAINT "training_drill_license_distinct_organizations" CHECK ("training_drill_licenses"."seller_organization_id" <> "training_drill_licenses"."buyer_organization_id")
);
--> statement-breakpoint
ALTER TABLE "catalog_fulfillments" DROP CONSTRAINT "catalog_fulfillment_kind_valid";--> statement-breakpoint
ALTER TABLE "catalog_items" DROP CONSTRAINT "catalog_item_subtype_valid";--> statement-breakpoint
ALTER TABLE "training_drill_licenses" ADD CONSTRAINT "training_drill_licenses_drill_id_training_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."training_drills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_drill_licenses" ADD CONSTRAINT "training_drill_licenses_seller_organization_id_organizations_id_fk" FOREIGN KEY ("seller_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_drill_licenses" ADD CONSTRAINT "training_drill_licenses_buyer_organization_id_organizations_id_fk" FOREIGN KEY ("buyer_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_drill_licenses" ADD CONSTRAINT "training_drill_licenses_catalog_fulfillment_id_catalog_fulfillments_id_fk" FOREIGN KEY ("catalog_fulfillment_id") REFERENCES "public"."catalog_fulfillments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "training_drill_license_buyer_unique" ON "training_drill_licenses" USING btree ("drill_id","buyer_organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "training_drill_license_fulfillment_unique" ON "training_drill_licenses" USING btree ("catalog_fulfillment_id");--> statement-breakpoint
CREATE INDEX "training_drill_license_buyer_status_idx" ON "training_drill_licenses" USING btree ("buyer_organization_id","status");--> statement-breakpoint
ALTER TABLE "catalog_fulfillments" ADD CONSTRAINT "catalog_fulfillment_kind_valid" CHECK ("catalog_fulfillments"."kind" IN ('registration', 'appointment', 'pickup', 'shipment', 'rental', 'digital-content', 'membership', 'credit-grant', 'package'));--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_item_subtype_valid" CHECK (("catalog_items"."type" = 'event' AND "catalog_items"."subtype" IN ('tournament', 'league', 'clinic', 'open-play', 'pickup')) OR ("catalog_items"."type" = 'service' AND "catalog_items"."subtype" IN ('private-lesson', 'group-lesson', 'program', 'court-rental', 'assessment', 'other')) OR ("catalog_items"."type" = 'good' AND "catalog_items"."subtype" IN ('apparel', 'equipment', 'rental', 'swag', 'consumable', 'digital-content', 'other')) OR ("catalog_items"."type" = 'plan' AND "catalog_items"."subtype" IN ('membership', 'credit-pack', 'bundle')));