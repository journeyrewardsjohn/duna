ALTER TABLE "pickup_sessions" ADD COLUMN "format" varchar(24) DEFAULT '4s' NOT NULL;--> statement-breakpoint
ALTER TABLE "pickup_sessions" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "pickup_sessions" ADD COLUMN "record_matches" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "pickup_sessions" ADD CONSTRAINT "pickup_session_format_valid" CHECK ("pickup_sessions"."format" IN ('2s', '4s', '6s', 'king-queen'));