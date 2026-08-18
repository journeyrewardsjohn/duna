CREATE TABLE "demo_data_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data_set_id" uuid NOT NULL,
	"entity_type" varchar(64) NOT NULL,
	"entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demo_data_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" varchar(96) NOT NULL,
	"label" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_by_person_id" uuid,
	"updated_by_person_id" uuid,
	"enabled_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "demo_data_records" ADD CONSTRAINT "demo_data_records_data_set_id_demo_data_sets_id_fk" FOREIGN KEY ("data_set_id") REFERENCES "public"."demo_data_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_data_sets" ADD CONSTRAINT "demo_data_sets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_data_sets" ADD CONSTRAINT "demo_data_sets_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_data_sets" ADD CONSTRAINT "demo_data_sets_updated_by_person_id_people_id_fk" FOREIGN KEY ("updated_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "demo_data_record_entity_unique" ON "demo_data_records" USING btree ("data_set_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "demo_data_record_set_type_idx" ON "demo_data_records" USING btree ("data_set_id","entity_type");--> statement-breakpoint
CREATE UNIQUE INDEX "demo_data_set_organization_key_unique" ON "demo_data_sets" USING btree ("organization_id","key");--> statement-breakpoint
CREATE INDEX "demo_data_set_organization_enabled_idx" ON "demo_data_sets" USING btree ("organization_id","enabled");