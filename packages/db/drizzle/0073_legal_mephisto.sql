CREATE TABLE "waiver_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"waiver_document_id" uuid NOT NULL,
	"catalog_item_id" uuid,
	"scope" varchar(24) NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waiver_assignment_scope_valid" CHECK ("waiver_assignments"."scope" IN ('all-members', 'booking', 'catalog-item')),
	CONSTRAINT "waiver_assignment_target_valid" CHECK (("waiver_assignments"."scope" = 'catalog-item') = ("waiver_assignments"."catalog_item_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "waiver_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" varchar(120) NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"current_version_id" uuid,
	"created_by_person_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waiver_document_status_valid" CHECK ("waiver_documents"."status" IN ('draft', 'active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "waiver_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"waiver_document_id" uuid NOT NULL,
	"waiver_version_id" uuid NOT NULL,
	"subject_person_id" uuid NOT NULL,
	"signer_person_id" uuid NOT NULL,
	"signer_role" varchar(16) NOT NULL,
	"relationship" varchar(80),
	"typed_legal_name" text NOT NULL,
	"signature_method" varchar(24) DEFAULT 'typed-name-clickwrap' NOT NULL,
	"acknowledged_section_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_hash" varchar(128) NOT NULL,
	"ip_address" varchar(64),
	"user_agent" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "waiver_execution_signer_role_valid" CHECK ("waiver_executions"."signer_role" IN ('adult-player', 'parent-or-guardian', 'player-acknowledgement'))
);
--> statement-breakpoint
CREATE TABLE "waiver_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"waiver_document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"markdown" text NOT NULL,
	"content_hash" varchar(128) NOT NULL,
	"source_filename" text,
	"source_mime_type" varchar(120),
	"requires_signature" boolean DEFAULT true NOT NULL,
	"signature_validity_days" integer DEFAULT 365 NOT NULL,
	"requires_parent_for_minors" boolean DEFAULT true NOT NULL,
	"player_acknowledgement_minimum_age" integer,
	"key_sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waiver_version_validity_days_valid" CHECK ("waiver_versions"."signature_validity_days" BETWEEN 1 AND 3650),
	CONSTRAINT "waiver_version_player_ack_age_valid" CHECK ("waiver_versions"."player_acknowledgement_minimum_age" IS NULL OR "waiver_versions"."player_acknowledgement_minimum_age" BETWEEN 13 AND 17)
);
--> statement-breakpoint
ALTER TABLE "waiver_assignments" ADD CONSTRAINT "waiver_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiver_assignments" ADD CONSTRAINT "waiver_assignments_waiver_document_id_waiver_documents_id_fk" FOREIGN KEY ("waiver_document_id") REFERENCES "public"."waiver_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiver_assignments" ADD CONSTRAINT "waiver_assignments_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiver_documents" ADD CONSTRAINT "waiver_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiver_documents" ADD CONSTRAINT "waiver_documents_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiver_executions" ADD CONSTRAINT "waiver_executions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiver_executions" ADD CONSTRAINT "waiver_executions_waiver_document_id_waiver_documents_id_fk" FOREIGN KEY ("waiver_document_id") REFERENCES "public"."waiver_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiver_executions" ADD CONSTRAINT "waiver_executions_waiver_version_id_waiver_versions_id_fk" FOREIGN KEY ("waiver_version_id") REFERENCES "public"."waiver_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiver_executions" ADD CONSTRAINT "waiver_executions_subject_person_id_people_id_fk" FOREIGN KEY ("subject_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiver_executions" ADD CONSTRAINT "waiver_executions_signer_person_id_people_id_fk" FOREIGN KEY ("signer_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiver_versions" ADD CONSTRAINT "waiver_versions_waiver_document_id_waiver_documents_id_fk" FOREIGN KEY ("waiver_document_id") REFERENCES "public"."waiver_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiver_versions" ADD CONSTRAINT "waiver_versions_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "waiver_assignment_org_scope_idx" ON "waiver_assignments" USING btree ("organization_id","scope");--> statement-breakpoint
CREATE UNIQUE INDEX "waiver_assignment_catalog_document_unique" ON "waiver_assignments" USING btree ("catalog_item_id","waiver_document_id") WHERE "waiver_assignments"."catalog_item_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "waiver_assignment_global_document_unique" ON "waiver_assignments" USING btree ("organization_id","scope","waiver_document_id") WHERE "waiver_assignments"."catalog_item_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "waiver_document_org_slug_unique" ON "waiver_documents" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "waiver_document_org_status_idx" ON "waiver_documents" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "waiver_execution_subject_validity_idx" ON "waiver_executions" USING btree ("organization_id","subject_person_id","expires_at");--> statement-breakpoint
CREATE INDEX "waiver_execution_document_subject_idx" ON "waiver_executions" USING btree ("waiver_document_id","subject_person_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "waiver_version_document_version_unique" ON "waiver_versions" USING btree ("waiver_document_id","version");--> statement-breakpoint
CREATE INDEX "waiver_version_content_hash_idx" ON "waiver_versions" USING btree ("content_hash");