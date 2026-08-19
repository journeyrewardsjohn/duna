CREATE TABLE "catalog_item_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_fulfillments" ADD COLUMN "catalog_item_version_id" uuid;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "current_version_id" uuid;--> statement-breakpoint
ALTER TABLE "catalog_item_versions" ADD CONSTRAINT "catalog_item_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_versions" ADD CONSTRAINT "catalog_item_versions_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_versions" ADD CONSTRAINT "catalog_item_versions_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_item_version_unique" ON "catalog_item_versions" USING btree ("catalog_item_id","version");--> statement-breakpoint
CREATE INDEX "catalog_item_version_org_item_created_idx" ON "catalog_item_versions" USING btree ("organization_id","catalog_item_id","created_at");--> statement-breakpoint
ALTER TABLE "catalog_fulfillments" ADD CONSTRAINT "catalog_fulfillments_catalog_item_version_id_catalog_item_versions_id_fk" FOREIGN KEY ("catalog_item_version_id") REFERENCES "public"."catalog_item_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_fulfillment_version_idx" ON "catalog_fulfillments" USING btree ("catalog_item_version_id");