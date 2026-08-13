CREATE SEQUENCE "duna_member_id_seq" MINVALUE 1 MAXVALUE 2176782335;--> statement-breakpoint
CREATE FUNCTION "duna_member_id_encode"("value" bigint) RETURNS varchar(6)
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
	"alphabet" constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
	"remaining" bigint := "value";
	"encoded" text := '';
BEGIN
	IF "value" < 0 OR "value" > 2176782335 THEN
		RAISE EXCEPTION 'Duna member ID sequence exhausted';
	END IF;
	FOR "position" IN 1..6 LOOP
		"encoded" := substr("alphabet", (("remaining" % 36)::integer + 1), 1) || "encoded";
		"remaining" := "remaining" / 36;
	END LOOP;
	RETURN "encoded";
END;
$$;--> statement-breakpoint
CREATE FUNCTION "duna_next_member_id"() RETURNS varchar(6)
LANGUAGE sql
VOLATILE
AS $$
	SELECT duna_member_id_encode(nextval('duna_member_id_seq'));
$$;--> statement-breakpoint
CREATE TABLE "activity_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"activity_type" varchar(24) NOT NULL,
	"activity_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"status" varchar(24) DEFAULT 'scheduled' NOT NULL,
	"source" varchar(24) DEFAULT 'manual' NOT NULL,
	"note" text,
	"recorded_by_person_id" uuid,
	"recorded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_attendance_type_valid" CHECK ("activity_attendance"."activity_type" IN ('court-booking', 'pickup')),
	CONSTRAINT "activity_attendance_status_valid" CHECK ("activity_attendance"."status" IN ('scheduled', 'attended', 'no-show', 'cancelled')),
	CONSTRAINT "activity_attendance_source_valid" CHECK ("activity_attendance"."source" IN ('manual', 'member-qr', 'player-report', 'system'))
);
--> statement-breakpoint
CREATE TABLE "match_availability_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"venue_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"match_type" varchar(16) DEFAULT 'either' NOT NULL,
	"gender_preference" varchar(16) DEFAULT 'open' NOT NULL,
	"format_preferences" text[] DEFAULT '{}'::text[] NOT NULL,
	"rating_minimum" double precision,
	"rating_maximum" double precision,
	"note" text,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_availability_time_valid" CHECK ("match_availability_posts"."ends_at" > "match_availability_posts"."starts_at"),
	CONSTRAINT "match_availability_type_valid" CHECK ("match_availability_posts"."match_type" IN ('either', 'competitive', 'casual')),
	CONSTRAINT "match_availability_gender_valid" CHECK ("match_availability_posts"."gender_preference" IN ('open', 'mens', 'womens', 'mixed')),
	CONSTRAINT "match_availability_status_valid" CHECK ("match_availability_posts"."status" IN ('active', 'paused', 'matched', 'cancelled')),
	CONSTRAINT "match_availability_rating_valid" CHECK (("match_availability_posts"."rating_minimum" IS NULL AND "match_availability_posts"."rating_maximum" IS NULL) OR ("match_availability_posts"."rating_minimum" IS NOT NULL AND "match_availability_posts"."rating_maximum" IS NOT NULL AND "match_availability_posts"."rating_minimum" BETWEEN 1 AND 8 AND "match_availability_posts"."rating_maximum" BETWEEN 1 AND 8 AND "match_availability_posts"."rating_maximum" >= "match_availability_posts"."rating_minimum"))
);
--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "duna_member_id" varchar(6) DEFAULT duna_next_member_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "membership_qr_token" varchar(64) DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_attendance" ADD CONSTRAINT "activity_attendance_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_attendance" ADD CONSTRAINT "activity_attendance_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_attendance" ADD CONSTRAINT "activity_attendance_recorded_by_person_id_people_id_fk" FOREIGN KEY ("recorded_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_availability_posts" ADD CONSTRAINT "match_availability_posts_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_availability_posts" ADD CONSTRAINT "match_availability_posts_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_attendance_person_unique" ON "activity_attendance" USING btree ("activity_type","activity_id","person_id");--> statement-breakpoint
CREATE INDEX "activity_attendance_participant_idx" ON "activity_attendance" USING btree ("activity_type","participant_id");--> statement-breakpoint
CREATE INDEX "activity_attendance_person_status_idx" ON "activity_attendance" USING btree ("person_id","status","recorded_at");--> statement-breakpoint
CREATE INDEX "match_availability_venue_time_idx" ON "match_availability_posts" USING btree ("venue_id","status","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "match_availability_person_idx" ON "match_availability_posts" USING btree ("person_id","status","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "people_duna_member_id_unique" ON "people" USING btree ("duna_member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "people_membership_qr_token_unique" ON "people" USING btree ("membership_qr_token");
