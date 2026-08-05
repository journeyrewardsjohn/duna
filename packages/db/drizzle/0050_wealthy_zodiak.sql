CREATE TABLE "health_daily_check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"local_date" varchar(10) NOT NULL,
	"encrypted_payload" text NOT NULL,
	"encryption_iv" varchar(32) NOT NULL,
	"auth_tag" varchar(32) NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "health_daily_check_in_date_valid" CHECK ("health_daily_check_ins"."local_date" ~ '^\d{4}-\d{2}-\d{2}$'),
	CONSTRAINT "health_daily_check_in_key_version_valid" CHECK ("health_daily_check_ins"."key_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "health_daily_check_ins" ADD CONSTRAINT "health_daily_check_ins_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "health_daily_check_in_person_date_unique" ON "health_daily_check_ins" USING btree ("person_id","local_date");--> statement-breakpoint
CREATE INDEX "health_daily_check_in_person_date_idx" ON "health_daily_check_ins" USING btree ("person_id","local_date");