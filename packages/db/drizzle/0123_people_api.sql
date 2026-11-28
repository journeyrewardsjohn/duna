CREATE TABLE "people_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_person_id" uuid NOT NULL,
	"status" varchar(12) DEFAULT 'previewed' NOT NULL,
	"plan_hash" varchar(128) NOT NULL,
	"plan" jsonb,
	"counts" jsonb NOT NULL,
	"total_rows" integer NOT NULL,
	"processed_rows" integer DEFAULT 0 NOT NULL,
	"idempotency_key" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_import_batch_status_valid" CHECK ("people_import_batches"."status" IN ('previewed', 'importing', 'completed', 'expired')),
	CONSTRAINT "people_import_batch_progress" CHECK ("people_import_batches"."processed_rows" >= 0 AND "people_import_batches"."processed_rows" <= "people_import_batches"."total_rows")
);
--> statement-breakpoint
CREATE TABLE "people_merges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"keep_person_id" uuid NOT NULL,
	"merged_person_id" uuid NOT NULL,
	"status" varchar(12) DEFAULT 'previewed' NOT NULL,
	"plan_hash" varchar(128) NOT NULL,
	"moved" jsonb,
	"created_by_person_id" uuid NOT NULL,
	"idempotency_key" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_merge_status_valid" CHECK ("people_merges"."status" IN ('previewed', 'completed')),
	CONSTRAINT "people_merge_distinct" CHECK ("people_merges"."keep_person_id" <> "people_merges"."merged_person_id")
);
--> statement-breakpoint
CREATE TABLE "person_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"author_person_id" uuid NOT NULL,
	"body" text NOT NULL,
	"edited_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"removed_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_note_body_length" CHECK (char_length("person_notes"."body") <= 4000),
	CONSTRAINT "person_note_removed_shape" CHECK ("person_notes"."removed_at" IS NULL OR "person_notes"."body" = '')
);
--> statement-breakpoint
CREATE TABLE "person_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"tag" varchar(40) NOT NULL,
	"created_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_tag_shape" CHECK (char_length("person_tags"."tag") BETWEEN 1 AND 40)
);
--> statement-breakpoint
ALTER TABLE "people_import_batches" ADD CONSTRAINT "people_import_batches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_import_batches" ADD CONSTRAINT "people_import_batches_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_merges" ADD CONSTRAINT "people_merges_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_merges" ADD CONSTRAINT "people_merges_keep_person_id_people_id_fk" FOREIGN KEY ("keep_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_merges" ADD CONSTRAINT "people_merges_merged_person_id_people_id_fk" FOREIGN KEY ("merged_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_merges" ADD CONSTRAINT "people_merges_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_notes" ADD CONSTRAINT "person_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_notes" ADD CONSTRAINT "person_notes_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_notes" ADD CONSTRAINT "person_notes_author_person_id_people_id_fk" FOREIGN KEY ("author_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_notes" ADD CONSTRAINT "person_notes_removed_by_person_id_people_id_fk" FOREIGN KEY ("removed_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_tags" ADD CONSTRAINT "person_tags_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_tags" ADD CONSTRAINT "person_tags_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_tags" ADD CONSTRAINT "person_tags_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "people_import_batch_org_idx" ON "people_import_batches" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "people_merge_org_idx" ON "people_merges" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "people_merge_completed_unique" ON "people_merges" USING btree ("merged_person_id") WHERE "people_merges"."status" = 'completed';--> statement-breakpoint
CREATE INDEX "person_note_org_person_idx" ON "person_notes" USING btree ("organization_id","person_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "person_tag_unique" ON "person_tags" USING btree ("organization_id","person_id","tag");--> statement-breakpoint
CREATE INDEX "person_tag_org_tag_idx" ON "person_tags" USING btree ("organization_id","tag");