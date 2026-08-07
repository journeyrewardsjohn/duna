CREATE TABLE "prediction_market_rule_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"resolution_criteria" text NOT NULL,
	"resolution_source" text NOT NULL,
	"close_policy" text NOT NULL,
	"public_note" text,
	"locks_at" timestamp with time zone,
	"change_reason" text NOT NULL,
	"created_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prediction_market_rule_version_positive" CHECK ("prediction_market_rule_versions"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "prediction_markets" ADD COLUMN "current_rule_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "prediction_market_rule_versions" ADD CONSTRAINT "prediction_market_rule_versions_market_id_prediction_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."prediction_markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_market_rule_versions" ADD CONSTRAINT "prediction_market_rule_versions_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prediction_market_rule_version_unique" ON "prediction_market_rule_versions" USING btree ("market_id","version");--> statement-breakpoint
CREATE INDEX "prediction_market_rule_market_time_idx" ON "prediction_market_rule_versions" USING btree ("market_id","created_at");