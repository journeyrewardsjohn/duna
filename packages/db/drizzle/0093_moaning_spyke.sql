CREATE TABLE "audience_snapshot_members" (
	"audience_snapshot_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"included" boolean NOT NULL,
	"reason_code" varchar(48) NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audience_snapshot_members_audience_snapshot_id_person_id_pk" PRIMARY KEY("audience_snapshot_id","person_id"),
	CONSTRAINT "audience_snapshot_reason_code_valid" CHECK ("audience_snapshot_members"."reason_code" IN ('dynamic-match', 'static-include', 'explicit-exclude', 'rule-no-match', 'fact-unavailable'))
);
--> statement-breakpoint
CREATE TABLE "audience_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audience_version_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"status" varchar(16) DEFAULT 'complete' NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL,
	"unavailable_fact_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audience_snapshot_status_valid" CHECK ("audience_snapshots"."status" IN ('complete', 'partial', 'unavailable')),
	CONSTRAINT "audience_snapshot_member_count_valid" CHECK ("audience_snapshots"."member_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "audience_version_members" (
	"audience_version_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"disposition" varchar(12) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audience_version_members_audience_version_id_person_id_pk" PRIMARY KEY("audience_version_id","person_id"),
	CONSTRAINT "audience_version_member_disposition_valid" CHECK ("audience_version_members"."disposition" IN ('include', 'exclude'))
);
--> statement-breakpoint
CREATE TABLE "audience_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audience_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"rule_version" integer DEFAULT 1 NOT NULL,
	"rule_ast" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rule_hash" varchar(96) NOT NULL,
	"created_by_person_id" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audience_version_positive" CHECK ("audience_versions"."revision" > 0),
	CONSTRAINT "audience_rule_version_positive" CHECK ("audience_versions"."rule_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "audiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mode" varchar(16) NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"current_version_id" uuid,
	"created_by_person_id" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audience_mode_valid" CHECK ("audiences"."mode" IN ('static', 'dynamic', 'hybrid')),
	CONSTRAINT "audience_status_valid" CHECK ("audiences"."status" IN ('active', 'archived'))
);
--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD COLUMN "audience_version_id" uuid;--> statement-breakpoint
ALTER TABLE "marketing_flows" ADD COLUMN "audience_version_id" uuid;--> statement-breakpoint
ALTER TABLE "audience_snapshot_members" ADD CONSTRAINT "audience_snapshot_members_audience_snapshot_id_audience_snapshots_id_fk" FOREIGN KEY ("audience_snapshot_id") REFERENCES "public"."audience_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_snapshot_members" ADD CONSTRAINT "audience_snapshot_members_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_snapshots" ADD CONSTRAINT "audience_snapshots_audience_version_id_audience_versions_id_fk" FOREIGN KEY ("audience_version_id") REFERENCES "public"."audience_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_snapshots" ADD CONSTRAINT "audience_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_version_members" ADD CONSTRAINT "audience_version_members_audience_version_id_audience_versions_id_fk" FOREIGN KEY ("audience_version_id") REFERENCES "public"."audience_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_version_members" ADD CONSTRAINT "audience_version_members_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_versions" ADD CONSTRAINT "audience_versions_audience_id_audiences_id_fk" FOREIGN KEY ("audience_id") REFERENCES "public"."audiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_versions" ADD CONSTRAINT "audience_versions_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiences" ADD CONSTRAINT "audiences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiences" ADD CONSTRAINT "audiences_current_version_id_audience_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."audience_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiences" ADD CONSTRAINT "audiences_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audience_snapshot_member_included_idx" ON "audience_snapshot_members" USING btree ("audience_snapshot_id","included");--> statement-breakpoint
CREATE INDEX "audience_snapshot_version_evaluated_idx" ON "audience_snapshots" USING btree ("audience_version_id","evaluated_at");--> statement-breakpoint
CREATE INDEX "audience_snapshot_org_evaluated_idx" ON "audience_snapshots" USING btree ("organization_id","evaluated_at");--> statement-breakpoint
CREATE INDEX "audience_version_member_person_idx" ON "audience_version_members" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "audience_version_revision_unique" ON "audience_versions" USING btree ("audience_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "audience_version_hash_unique" ON "audience_versions" USING btree ("audience_id","rule_hash");--> statement-breakpoint
CREATE INDEX "audience_version_audience_created_idx" ON "audience_versions" USING btree ("audience_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "audience_org_name_unique" ON "audiences" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "audience_org_status_updated_idx" ON "audiences" USING btree ("organization_id","status","updated_at");--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_audience_version_id_audience_versions_id_fk" FOREIGN KEY ("audience_version_id") REFERENCES "public"."audience_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_flows" ADD CONSTRAINT "marketing_flows_audience_version_id_audience_versions_id_fk" FOREIGN KEY ("audience_version_id") REFERENCES "public"."audience_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketing_campaign_audience_version_idx" ON "marketing_campaigns" USING btree ("audience_version_id");--> statement-breakpoint
CREATE INDEX "marketing_flow_audience_version_idx" ON "marketing_flows" USING btree ("audience_version_id");