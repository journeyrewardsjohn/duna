CREATE TYPE "public"."booking_status" AS ENUM('held', 'confirmed', 'cancelled', 'expired', 'refunded');--> statement-breakpoint
CREATE TABLE "court_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"court_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"event_type_id" uuid,
	"order_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "booking_status" DEFAULT 'held' NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"idempotency_key" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "court_bookings_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "court_booking_time_valid" CHECK ("court_bookings"."ends_at" > "court_bookings"."starts_at"),
	CONSTRAINT "court_booking_hold_expiry" CHECK ("court_bookings"."status" <> 'held' OR "court_bookings"."hold_expires_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "ticket_scan_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"scanned_by_person_id" uuid NOT NULL,
	"device_id" varchar(128) NOT NULL,
	"scanned_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"offline" boolean DEFAULT false NOT NULL,
	"accepted" boolean NOT NULL,
	"duplicate" boolean DEFAULT false NOT NULL,
	"reason" varchar(48),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "court_bookings" ADD CONSTRAINT "court_bookings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_bookings" ADD CONSTRAINT "court_bookings_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_bookings" ADD CONSTRAINT "court_bookings_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_bookings" ADD CONSTRAINT "court_bookings_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_bookings" ADD CONSTRAINT "court_bookings_event_type_id_event_types_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_bookings" ADD CONSTRAINT "court_bookings_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_scan_events" ADD CONSTRAINT "ticket_scan_events_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_scan_events" ADD CONSTRAINT "ticket_scan_events_scanned_by_person_id_people_id_fk" FOREIGN KEY ("scanned_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "court_booking_court_time_idx" ON "court_bookings" USING btree ("court_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "court_booking_person_idx" ON "court_bookings" USING btree ("person_id","starts_at");--> statement-breakpoint
CREATE INDEX "ticket_scan_event_ticket_idx" ON "ticket_scan_events" USING btree ("ticket_id","scanned_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_scan_event_device_dedupe" ON "ticket_scan_events" USING btree ("ticket_id","device_id","scanned_at");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_session_person_unique" ON "waitlist_entries" USING btree ("session_id","person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_session_position_unique" ON "waitlist_entries" USING btree ("session_id","position");--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_position_positive" CHECK ("waitlist_entries"."position" > 0);