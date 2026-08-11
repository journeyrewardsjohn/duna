CREATE TABLE "messaging_push_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expo_ticket_id" varchar(192),
	"error_code" varchar(80),
	"error_message" text,
	"sent_at" timestamp with time zone,
	"receipt_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_push_delivery_status_valid" CHECK ("messaging_push_deliveries"."status" IN ('queued', 'submitted', 'delivered', 'retry', 'failed')),
	CONSTRAINT "messaging_push_delivery_attempts_nonnegative" CHECK ("messaging_push_deliveries"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "messaging_push_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"app" varchar(16) NOT NULL,
	"platform" varchar(16) NOT NULL,
	"expo_push_token" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone,
	"last_error_code" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_push_device_app_valid" CHECK ("messaging_push_devices"."app" IN ('player', 'pro')),
	CONSTRAINT "messaging_push_device_platform_valid" CHECK ("messaging_push_devices"."platform" IN ('ios', 'android'))
);
--> statement-breakpoint
ALTER TABLE "messaging_push_deliveries" ADD CONSTRAINT "messaging_push_deliveries_message_id_conversation_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_push_deliveries" ADD CONSTRAINT "messaging_push_deliveries_device_id_messaging_push_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."messaging_push_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_push_devices" ADD CONSTRAINT "messaging_push_devices_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_push_delivery_message_device_unique" ON "messaging_push_deliveries" USING btree ("message_id","device_id");--> statement-breakpoint
CREATE INDEX "messaging_push_delivery_receipt_idx" ON "messaging_push_deliveries" USING btree ("status","receipt_checked_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_push_device_token_unique" ON "messaging_push_devices" USING btree ("expo_push_token");--> statement-breakpoint
CREATE INDEX "messaging_push_device_person_idx" ON "messaging_push_devices" USING btree ("person_id","enabled");