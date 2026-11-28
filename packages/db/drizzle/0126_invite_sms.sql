CREATE TABLE "invite_sms_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_person_id" uuid NOT NULL,
	"organization_id" uuid,
	"invite_kind" varchar(24) NOT NULL,
	"subject_id" uuid NOT NULL,
	"preview_hash" varchar(64) NOT NULL,
	"destination_hash" varchar(64) NOT NULL,
	"destination_last4" varchar(4) NOT NULL,
	"recipient_name" text NOT NULL,
	"claim_token" varchar(96),
	"invitation_ref" varchar(128),
	"status" varchar(24) DEFAULT 'previewed' NOT NULL,
	"block_reason" varchar(32),
	"provider_message_id" varchar(160),
	"failure_code" varchar(48),
	"channel" varchar(16),
	"send_idempotency_key" varchar(128),
	"preview_expires_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"last_event_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invite_sms_kind_valid" CHECK ("invite_sms_messages"."invite_kind" IN ('match', 'court-booking', 'session', 'pickup', 'club')),
	CONSTRAINT "invite_sms_status_valid" CHECK ("invite_sms_messages"."status" IN ('previewed', 'blocked', 'sending', 'sent', 'delivered', 'failed', 'not-configured')),
	CONSTRAINT "invite_sms_block_reason_valid" CHECK ("invite_sms_messages"."block_reason" IS NULL OR "invite_sms_messages"."block_reason" IN ('invalid-number', 'opted-out', 'junior', 'rate-limited', 'already-invited', 'own-number', 'not-on-invitation')),
	CONSTRAINT "invite_sms_destination_hash_format" CHECK ("invite_sms_messages"."destination_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "invite_sms_last4_format" CHECK ("invite_sms_messages"."destination_last4" ~ '^[0-9]{4}$')
);
--> statement-breakpoint
CREATE TABLE "sms_suppressions" (
	"destination_hash" varchar(64) PRIMARY KEY NOT NULL,
	"source" varchar(24) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_suppression_source_valid" CHECK ("sms_suppressions"."source" IN ('stop-keyword', 'carrier-disconnect', 'provider-unsubscribed', 'link')),
	CONSTRAINT "sms_suppression_hash_format" CHECK ("sms_suppressions"."destination_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "invite_sms_messages" ADD CONSTRAINT "invite_sms_messages_sender_person_id_people_id_fk" FOREIGN KEY ("sender_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_sms_messages" ADD CONSTRAINT "invite_sms_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invite_sms_preview_destination_unique" ON "invite_sms_messages" USING btree ("sender_person_id","preview_hash","destination_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "invite_sms_provider_message_unique" ON "invite_sms_messages" USING btree ("provider_message_id") WHERE "invite_sms_messages"."provider_message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "invite_sms_sender_subject_idx" ON "invite_sms_messages" USING btree ("sender_person_id","invite_kind","subject_id","created_at");--> statement-breakpoint
CREATE INDEX "invite_sms_sender_sent_idx" ON "invite_sms_messages" USING btree ("sender_person_id","sent_at");--> statement-breakpoint
CREATE INDEX "invite_sms_destination_sent_idx" ON "invite_sms_messages" USING btree ("destination_hash","sent_at");