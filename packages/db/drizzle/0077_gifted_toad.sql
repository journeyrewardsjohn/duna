CREATE TABLE "vision_benchmark_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"benchmark_id" varchar(120) NOT NULL,
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"dataset_manifest_r2_key" text NOT NULL,
	"dataset_manifest_sha256" varchar(64),
	"attestation_r2_key" text,
	"quality_gate" jsonb,
	"provider_job_id" varchar(160),
	"failure_code" varchar(80),
	"requested_by_person_id" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vision_benchmark_status_valid" CHECK ("vision_benchmark_runs"."status" IN ('queued', 'running', 'passed', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "vision_model_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"stage" varchar(24) NOT NULL,
	"decision" varchar(16) NOT NULL,
	"reviewer_person_id" uuid NOT NULL,
	"notes" text NOT NULL,
	"evidence_sha256" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vision_model_approval_stage_valid" CHECK ("vision_model_approvals"."stage" IN ('dataset', 'shadow', 'production', 'rollback')),
	CONSTRAINT "vision_model_approval_decision_valid" CHECK ("vision_model_approvals"."decision" IN ('approved', 'rejected')),
	CONSTRAINT "vision_model_approval_evidence_sha_valid" CHECK ("vision_model_approvals"."evidence_sha256" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "vision_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" varchar(80) NOT NULL,
	"bundle_sha256" varchar(64) NOT NULL,
	"bundle_r2_prefix" text NOT NULL,
	"detector_family" varchar(80) NOT NULL,
	"source_license" varchar(80) NOT NULL,
	"status" varchar(24) DEFAULT 'candidate' NOT NULL,
	"manifest" jsonb NOT NULL,
	"quality_gate" jsonb,
	"promotion_attestation_r2_key" text,
	"created_by_person_id" uuid,
	"shadow_approved_at" timestamp with time zone,
	"production_approved_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vision_model_status_valid" CHECK ("vision_models"."status" IN ('candidate', 'shadow', 'production', 'retired', 'rejected')),
	CONSTRAINT "vision_model_bundle_sha_valid" CHECK ("vision_models"."bundle_sha256" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "vision_training_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requested_model_version" varchar(80) NOT NULL,
	"model_id" uuid,
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"provider" varchar(24) DEFAULT 'modal' NOT NULL,
	"gpu_type" varchar(24) DEFAULT 'L4' NOT NULL,
	"dataset_r2_key" text NOT NULL,
	"dataset_manifest_sha256" varchar(64),
	"base_model_version" varchar(80),
	"code_commit_sha" varchar(64) NOT NULL,
	"budget_cents" integer NOT NULL,
	"actual_cost_cents" integer,
	"provider_job_id" varchar(160),
	"metrics" jsonb,
	"failure_code" varchar(80),
	"requested_by_person_id" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vision_training_status_valid" CHECK ("vision_training_runs"."status" IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT "vision_training_budget_valid" CHECK ("vision_training_runs"."budget_cents" BETWEEN 100 AND 100000),
	CONSTRAINT "vision_training_cost_valid" CHECK ("vision_training_runs"."actual_cost_cents" IS NULL OR "vision_training_runs"."actual_cost_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "video_analysis_runs" ADD COLUMN "quality_gate" jsonb;--> statement-breakpoint
ALTER TABLE "vision_benchmark_runs" ADD CONSTRAINT "vision_benchmark_runs_model_id_vision_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."vision_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_benchmark_runs" ADD CONSTRAINT "vision_benchmark_runs_requested_by_person_id_people_id_fk" FOREIGN KEY ("requested_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_model_approvals" ADD CONSTRAINT "vision_model_approvals_model_id_vision_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."vision_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_model_approvals" ADD CONSTRAINT "vision_model_approvals_reviewer_person_id_people_id_fk" FOREIGN KEY ("reviewer_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_models" ADD CONSTRAINT "vision_models_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_training_runs" ADD CONSTRAINT "vision_training_runs_model_id_vision_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."vision_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_training_runs" ADD CONSTRAINT "vision_training_runs_requested_by_person_id_people_id_fk" FOREIGN KEY ("requested_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vision_benchmark_model_created_idx" ON "vision_benchmark_runs" USING btree ("model_id","created_at");--> statement-breakpoint
CREATE INDEX "vision_model_approval_model_stage_idx" ON "vision_model_approvals" USING btree ("model_id","stage","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vision_model_version_unique" ON "vision_models" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "vision_model_bundle_sha_unique" ON "vision_models" USING btree ("bundle_sha256");--> statement-breakpoint
CREATE INDEX "vision_model_status_updated_idx" ON "vision_models" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "vision_training_status_created_idx" ON "vision_training_runs" USING btree ("status","created_at");
