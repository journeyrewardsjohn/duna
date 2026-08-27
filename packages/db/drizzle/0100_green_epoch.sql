CREATE TABLE "court_rate_plan_assignments" (
	"court_id" uuid NOT NULL,
	"rate_plan_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "court_rate_plan_assignments_court_id_rate_plan_id_pk" PRIMARY KEY("court_id","rate_plan_id")
);
--> statement-breakpoint
CREATE TABLE "rate_plan_eligible_people" (
	"rate_plan_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_plan_eligible_people_rate_plan_id_person_id_pk" PRIMARY KEY("rate_plan_id","person_id")
);
--> statement-breakpoint
ALTER TABLE "rate_plans" ADD COLUMN "audience" varchar(24) DEFAULT 'everyone' NOT NULL;--> statement-breakpoint
ALTER TABLE "rate_plans" ADD COLUMN "weekdays" integer[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "rate_plans" ADD COLUMN "starts_on" date;--> statement-breakpoint
ALTER TABLE "rate_plans" ADD COLUMN "ends_on" date;--> statement-breakpoint
ALTER TABLE "rate_plans" ADD COLUMN "specific_dates" date[] DEFAULT ARRAY[]::date[] NOT NULL;--> statement-breakpoint
ALTER TABLE "court_rate_plan_assignments" ADD CONSTRAINT "court_rate_plan_assignments_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_rate_plan_assignments" ADD CONSTRAINT "court_rate_plan_assignments_rate_plan_id_rate_plans_id_fk" FOREIGN KEY ("rate_plan_id") REFERENCES "public"."rate_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_plan_eligible_people" ADD CONSTRAINT "rate_plan_eligible_people_rate_plan_id_rate_plans_id_fk" FOREIGN KEY ("rate_plan_id") REFERENCES "public"."rate_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_plan_eligible_people" ADD CONSTRAINT "rate_plan_eligible_people_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "court_rate_plan_assignments" ("court_id", "rate_plan_id")
SELECT "id", "rate_plan_id" FROM "courts" WHERE "rate_plan_id" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
CREATE INDEX "court_rate_plan_rate_idx" ON "court_rate_plan_assignments" USING btree ("rate_plan_id");--> statement-breakpoint
CREATE INDEX "rate_plan_eligible_person_idx" ON "rate_plan_eligible_people" USING btree ("person_id");--> statement-breakpoint
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plan_audience_valid" CHECK ("rate_plans"."audience" IN ('everyone', 'selected-users'));--> statement-breakpoint
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plan_weekdays_valid" CHECK (cardinality("rate_plans"."weekdays") > 0 AND 0 <= ALL("rate_plans"."weekdays") AND 6 >= ALL("rate_plans"."weekdays"));--> statement-breakpoint
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plan_date_window_valid" CHECK ("rate_plans"."ends_on" IS NULL OR "rate_plans"."starts_on" IS NULL OR "rate_plans"."ends_on" >= "rate_plans"."starts_on");
