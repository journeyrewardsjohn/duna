CREATE TABLE "rating_backtest_predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"actual_team_a" integer NOT NULL,
	"probabilities" jsonb NOT NULL,
	"ensemble_weights" jsonb NOT NULL,
	"pre_match_ratings" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rating_backtest_prediction_actual_valid" CHECK ("rating_backtest_predictions"."actual_team_a" IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE "rating_backtest_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"configuration_id" uuid NOT NULL,
	"methodology_version" varchar(48) NOT NULL,
	"status" varchar(24) DEFAULT 'running' NOT NULL,
	"matches_processed" integer DEFAULT 0 NOT NULL,
	"players_processed" integer DEFAULT 0 NOT NULL,
	"date_from" timestamp with time zone,
	"date_to" timestamp with time zone,
	"champion_model_id" varchar(48),
	"model_summaries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"failure_reason" text,
	"created_by_person_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rating_backtest_status_valid" CHECK ("rating_backtest_runs"."status" IN ('running', 'completed', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "rating_backtest_predictions" ADD CONSTRAINT "rating_backtest_predictions_run_id_rating_backtest_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."rating_backtest_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_backtest_predictions" ADD CONSTRAINT "rating_backtest_predictions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_backtest_runs" ADD CONSTRAINT "rating_backtest_runs_configuration_id_rating_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."rating_configurations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_backtest_runs" ADD CONSTRAINT "rating_backtest_runs_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rating_backtest_prediction_run_match_unique" ON "rating_backtest_predictions" USING btree ("run_id","match_id");--> statement-breakpoint
CREATE INDEX "rating_backtest_prediction_match_idx" ON "rating_backtest_predictions" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "rating_backtest_prediction_run_time_idx" ON "rating_backtest_predictions" USING btree ("run_id","occurred_at");--> statement-breakpoint
CREATE INDEX "rating_backtest_status_completed_idx" ON "rating_backtest_runs" USING btree ("status","completed_at");--> statement-breakpoint
CREATE INDEX "rating_backtest_configuration_idx" ON "rating_backtest_runs" USING btree ("configuration_id","created_at");