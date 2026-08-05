CREATE TABLE "professional_event_prediction_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"previous_external_team_id" text,
	"new_external_team_id" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "professional_event_predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"external_team_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "professional_match_prediction_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"imported_match_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"previous_side" varchar(1),
	"new_side" varchar(1) NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "professional_match_prediction_history_side_valid" CHECK ("professional_match_prediction_history"."new_side" IN ('A', 'B') AND ("professional_match_prediction_history"."previous_side" IS NULL OR "professional_match_prediction_history"."previous_side" IN ('A', 'B')))
);
--> statement-breakpoint
CREATE TABLE "professional_match_predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"imported_match_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"predicted_side" varchar(1) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "professional_match_prediction_side_valid" CHECK ("professional_match_predictions"."predicted_side" IN ('A', 'B'))
);
--> statement-breakpoint
ALTER TABLE "professional_event_prediction_history" ADD CONSTRAINT "professional_event_prediction_history_event_id_professional_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."professional_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_event_prediction_history" ADD CONSTRAINT "professional_event_prediction_history_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_event_predictions" ADD CONSTRAINT "professional_event_predictions_event_id_professional_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."professional_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_event_predictions" ADD CONSTRAINT "professional_event_predictions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_match_prediction_history" ADD CONSTRAINT "professional_match_prediction_history_imported_match_id_imported_matches_id_fk" FOREIGN KEY ("imported_match_id") REFERENCES "public"."imported_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_match_prediction_history" ADD CONSTRAINT "professional_match_prediction_history_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_match_predictions" ADD CONSTRAINT "professional_match_predictions_imported_match_id_imported_matches_id_fk" FOREIGN KEY ("imported_match_id") REFERENCES "public"."imported_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_match_predictions" ADD CONSTRAINT "professional_match_predictions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "professional_event_prediction_history_person_idx" ON "professional_event_prediction_history" USING btree ("event_id","person_id","changed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "professional_event_prediction_person_unique" ON "professional_event_predictions" USING btree ("event_id","person_id");--> statement-breakpoint
CREATE INDEX "professional_event_prediction_team_idx" ON "professional_event_predictions" USING btree ("event_id","external_team_id");--> statement-breakpoint
CREATE INDEX "professional_match_prediction_history_person_idx" ON "professional_match_prediction_history" USING btree ("imported_match_id","person_id","changed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "professional_match_prediction_person_unique" ON "professional_match_predictions" USING btree ("imported_match_id","person_id");--> statement-breakpoint
CREATE INDEX "professional_match_prediction_side_idx" ON "professional_match_predictions" USING btree ("imported_match_id","predicted_side");