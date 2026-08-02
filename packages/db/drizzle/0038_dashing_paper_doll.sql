CREATE TABLE "legal_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"organization_id" uuid,
	"document_key" varchar(48) NOT NULL,
	"document_version" varchar(32) NOT NULL,
	"acceptance_method" varchar(24) DEFAULT 'clickwrap' NOT NULL,
	"evidence" jsonb DEFAULT '{"termsUrl":""}'::jsonb NOT NULL,
	"ip_address" varchar(64),
	"user_agent" text,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_acceptance_document_valid" CHECK ("legal_acceptances"."document_key" IN ('consumer-terms', 'privacy-policy', 'mobile-eula', 'hq-terms')),
	CONSTRAINT "legal_acceptance_method_valid" CHECK ("legal_acceptances"."acceptance_method" IN ('clickwrap', 'signed-order-form', 'admin-import'))
);
--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legal_acceptance_person_document_idx" ON "legal_acceptances" USING btree ("person_id","document_key","accepted_at");--> statement-breakpoint
CREATE INDEX "legal_acceptance_org_document_idx" ON "legal_acceptances" USING btree ("organization_id","document_key","accepted_at");