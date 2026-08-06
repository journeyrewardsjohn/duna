CREATE TABLE "video_insight_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"insight_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"vote" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_insight_feedback_vote_valid" CHECK ("video_insight_feedback"."vote" IN (-1, 1))
);
--> statement-breakpoint
CREATE TABLE "video_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"player_person_id" uuid NOT NULL,
	"category" varchar(32) NOT NULL,
	"headline" varchar(180) NOT NULL,
	"guidance" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"confidence" double precision NOT NULL,
	"model_version" varchar(80),
	"created_by_type" varchar(16) DEFAULT 'model' NOT NULL,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"reviewed_by_person_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_insight_category_valid" CHECK ("video_insights"."category" IN ('hitting', 'passing', 'setting', 'serving', 'movement', 'strategy')),
	CONSTRAINT "video_insight_confidence_valid" CHECK ("video_insights"."confidence" BETWEEN 0 AND 1),
	CONSTRAINT "video_insight_creator_valid" CHECK ("video_insights"."created_by_type" IN ('model', 'pro', 'admin')),
	CONSTRAINT "video_insight_status_valid" CHECK ("video_insights"."status" IN ('draft', 'pro-review', 'published', 'dismissed', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "vision_calibration_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"owner_person_id" uuid NOT NULL,
	"source_model_version" varchar(80),
	"quality_score" integer,
	"geometry" jsonb NOT NULL,
	"preview_captured_at" timestamp with time zone,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"reviewed_by_person_id" uuid,
	"review_notes" text,
	"reviewed_at" timestamp with time zone,
	"approved_for_training_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vision_calibration_samples_video_id_unique" UNIQUE("video_id"),
	CONSTRAINT "vision_calibration_samples_session_id_unique" UNIQUE("session_id"),
	CONSTRAINT "vision_calibration_status_valid" CHECK ("vision_calibration_samples"."status" IN ('pending', 'approved', 'rejected', 'training', 'trained')),
	CONSTRAINT "vision_calibration_quality_score_valid" CHECK ("vision_calibration_samples"."quality_score" IS NULL OR "vision_calibration_samples"."quality_score" BETWEEN 0 AND 100),
	CONSTRAINT "vision_calibration_review_pair" CHECK (("vision_calibration_samples"."status" = 'pending' AND "vision_calibration_samples"."reviewed_at" IS NULL AND "vision_calibration_samples"."reviewed_by_person_id" IS NULL) OR ("vision_calibration_samples"."status" <> 'pending' AND "vision_calibration_samples"."reviewed_at" IS NOT NULL AND "vision_calibration_samples"."reviewed_by_person_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "vision_learning_consent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "vision_learning_consented_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "video_insight_feedback" ADD CONSTRAINT "video_insight_feedback_insight_id_video_insights_id_fk" FOREIGN KEY ("insight_id") REFERENCES "public"."video_insights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_insight_feedback" ADD CONSTRAINT "video_insight_feedback_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_insights" ADD CONSTRAINT "video_insights_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_insights" ADD CONSTRAINT "video_insights_player_person_id_people_id_fk" FOREIGN KEY ("player_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_insights" ADD CONSTRAINT "video_insights_reviewed_by_person_id_people_id_fk" FOREIGN KEY ("reviewed_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_calibration_samples" ADD CONSTRAINT "vision_calibration_samples_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_calibration_samples" ADD CONSTRAINT "vision_calibration_samples_session_id_vision_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."vision_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_calibration_samples" ADD CONSTRAINT "vision_calibration_samples_owner_person_id_people_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_calibration_samples" ADD CONSTRAINT "vision_calibration_samples_reviewed_by_person_id_people_id_fk" FOREIGN KEY ("reviewed_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "video_insight_feedback_person_unique" ON "video_insight_feedback" USING btree ("insight_id","person_id");--> statement-breakpoint
CREATE INDEX "video_insight_feedback_created_idx" ON "video_insight_feedback" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "video_insight_player_status_idx" ON "video_insights" USING btree ("player_person_id","status","created_at");--> statement-breakpoint
CREATE INDEX "video_insight_video_idx" ON "video_insights" USING btree ("video_id","created_at");--> statement-breakpoint
CREATE INDEX "vision_calibration_status_created_idx" ON "vision_calibration_samples" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "vision_calibration_owner_created_idx" ON "vision_calibration_samples" USING btree ("owner_person_id","created_at");--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "video_vision_learning_consent_pair" CHECK (("videos"."vision_learning_consent" = false AND "videos"."vision_learning_consented_at" IS NULL) OR ("videos"."vision_learning_consent" = true AND "videos"."vision_learning_consented_at" IS NOT NULL));