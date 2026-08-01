ALTER TABLE "pickup_sessions" ADD COLUMN "court_booking_id" uuid;--> statement-breakpoint
ALTER TABLE "pickup_sessions" ADD COLUMN "match_type" varchar(24) DEFAULT 'competitive' NOT NULL;--> statement-breakpoint
ALTER TABLE "pickup_sessions" ADD COLUMN "gender_preference" varchar(24) DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "pickup_sessions" ADD CONSTRAINT "pickup_sessions_court_booking_id_court_bookings_id_fk" FOREIGN KEY ("court_booking_id") REFERENCES "public"."court_bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_sessions" ADD CONSTRAINT "pickup_sessions_court_booking_id_unique" UNIQUE("court_booking_id");--> statement-breakpoint
ALTER TABLE "pickup_sessions" ADD CONSTRAINT "pickup_session_match_type_valid" CHECK ("pickup_sessions"."match_type" IN ('competitive', 'casual'));--> statement-breakpoint
ALTER TABLE "pickup_sessions" ADD CONSTRAINT "pickup_session_gender_valid" CHECK ("pickup_sessions"."gender_preference" IN ('open', 'mens', 'womens', 'mixed'));