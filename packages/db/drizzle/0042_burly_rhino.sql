CREATE TABLE "organization_brand_knowledge_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"scope" varchar(24) DEFAULT 'brand' NOT NULL,
	"kind" varchar(24) NOT NULL,
	"title" text NOT NULL,
	"source_url" text,
	"storage_url" text,
	"mime_type" varchar(120),
	"original_filename" text,
	"content_text" text,
	"content_hash" varchar(64) NOT NULL,
	"status" varchar(24) DEFAULT 'ready' NOT NULL,
	"approved_by_person_id" uuid,
	"approved_at" timestamp with time zone,
	"failure_reason" text,
	"last_processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_brand_knowledge_scope_valid" CHECK ("organization_brand_knowledge_sources"."scope" IN ('brand', 'organization', 'venue', 'service', 'product')),
	CONSTRAINT "organization_brand_knowledge_kind_valid" CHECK ("organization_brand_knowledge_sources"."kind" IN ('note', 'link', 'document')),
	CONSTRAINT "organization_brand_knowledge_status_valid" CHECK ("organization_brand_knowledge_sources"."status" IN ('processing', 'ready', 'failed', 'archived')),
	CONSTRAINT "organization_brand_knowledge_payload_present" CHECK ("organization_brand_knowledge_sources"."content_text" IS NOT NULL OR "organization_brand_knowledge_sources"."source_url" IS NOT NULL OR "organization_brand_knowledge_sources"."storage_url" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "organization_themes" ALTER COLUMN "palette" SET DEFAULT '{"primary":"#173A63","accent":"#2B67A4","sand":"#E9DFC9","ink":"#101828","canvas":"#FAFAF7","success":"#4E7C67"}'::jsonb;--> statement-breakpoint
ALTER TABLE "organization_themes" ADD COLUMN "brand_display_name" text;--> statement-breakpoint
ALTER TABLE "organization_themes" ADD COLUMN "membership_program_name" text;--> statement-breakpoint
ALTER TABLE "organization_themes" ADD COLUMN "logo_light_url" text;--> statement-breakpoint
ALTER TABLE "organization_themes" ADD COLUMN "logo_dark_url" text;--> statement-breakpoint
ALTER TABLE "organization_themes" ADD COLUMN "brand_voice" text;--> statement-breakpoint
ALTER TABLE "organization_themes" ADD COLUMN "font_license_confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_themes" ADD COLUMN "safe_fallback_font" text DEFAULT 'Arial, Helvetica, sans-serif' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_brand_knowledge_sources" ADD CONSTRAINT "organization_brand_knowledge_sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_brand_knowledge_sources" ADD CONSTRAINT "organization_brand_knowledge_sources_approved_by_person_id_people_id_fk" FOREIGN KEY ("approved_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_brand_knowledge_status_idx" ON "organization_brand_knowledge_sources" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "organization_brand_knowledge_scope_idx" ON "organization_brand_knowledge_sources" USING btree ("organization_id","scope");