CREATE TABLE "video_performance_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"analysis_run_id" uuid NOT NULL,
	"requested_by_person_id" uuid NOT NULL,
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"provider" varchar(40) NOT NULL,
	"model" varchar(120) NOT NULL,
	"reasoning_effort" varchar(16) NOT NULL,
	"privacy_safety_identifier" varchar(160) NOT NULL,
	"prompt_version" varchar(80) NOT NULL,
	"schema_version" varchar(80) NOT NULL,
	"evidence_sha256" varchar(64) NOT NULL,
	"provider_response_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recommendations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"failure_code" varchar(120),
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_performance_review_status_valid" CHECK ("video_performance_reviews"."status" IN ('queued', 'processing', 'succeeded', 'unavailable', 'failed')),
	CONSTRAINT "video_performance_review_evidence_sha_valid" CHECK ("video_performance_reviews"."evidence_sha256" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "vision_improvement_proposal_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"reviewer_person_id" uuid NOT NULL,
	"decision" varchar(16) NOT NULL,
	"notes" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vision_improvement_proposal_review_decision_valid" CHECK ("vision_improvement_proposal_reviews"."decision" IN ('approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "vision_improvement_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"analysis_run_id" uuid NOT NULL,
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"provider" varchar(40) NOT NULL,
	"model" varchar(120) NOT NULL,
	"reasoning_effort" varchar(16) NOT NULL,
	"privacy_safety_identifier" varchar(160) NOT NULL,
	"prompt_version" varchar(80) NOT NULL,
	"schema_version" varchar(80) NOT NULL,
	"evidence_sha256" varchar(64) NOT NULL,
	"evidence" jsonb NOT NULL,
	"provider_response_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"proposals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"failure_code" varchar(120),
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vision_improvement_proposal_status_valid" CHECK ("vision_improvement_proposals"."status" IN ('queued', 'processing', 'succeeded', 'unavailable', 'failed')),
	CONSTRAINT "vision_improvement_proposal_evidence_sha_valid" CHECK ("vision_improvement_proposals"."evidence_sha256" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "r2_part_size_bytes" integer;--> statement-breakpoint
ALTER TABLE "video_performance_reviews" ADD CONSTRAINT "video_performance_reviews_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_performance_reviews" ADD CONSTRAINT "video_performance_reviews_analysis_run_id_video_analysis_runs_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."video_analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_performance_reviews" ADD CONSTRAINT "video_performance_reviews_requested_by_person_id_people_id_fk" FOREIGN KEY ("requested_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_improvement_proposal_reviews" ADD CONSTRAINT "vision_improvement_proposal_reviews_proposal_id_vision_improvement_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."vision_improvement_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_improvement_proposal_reviews" ADD CONSTRAINT "vision_improvement_proposal_reviews_reviewer_person_id_people_id_fk" FOREIGN KEY ("reviewer_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_improvement_proposals" ADD CONSTRAINT "vision_improvement_proposals_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_improvement_proposals" ADD CONSTRAINT "vision_improvement_proposals_analysis_run_id_video_analysis_runs_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."video_analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_performance_review_video_created_idx" ON "video_performance_reviews" USING btree ("video_id","created_at");--> statement-breakpoint
CREATE INDEX "video_performance_review_requester_created_idx" ON "video_performance_reviews" USING btree ("requested_by_person_id","created_at");--> statement-breakpoint
CREATE INDEX "vision_improvement_proposal_review_created_idx" ON "vision_improvement_proposal_reviews" USING btree ("proposal_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vision_improvement_proposal_run_unique" ON "vision_improvement_proposals" USING btree ("analysis_run_id");--> statement-breakpoint
CREATE INDEX "vision_improvement_proposal_status_created_idx" ON "vision_improvement_proposals" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "vision_improvement_proposal_video_created_idx" ON "vision_improvement_proposals" USING btree ("video_id","created_at");--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "video_r2_part_size_valid" CHECK ("videos"."r2_part_size_bytes" IS NULL OR "videos"."r2_part_size_bytes" BETWEEN 5242880 AND 67108864);