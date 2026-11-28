CREATE TABLE "concierge_channel_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concierge_channel_verification_attempts_valid" CHECK ("concierge_channel_verifications"."attempts" BETWEEN 0 AND 10)
);
--> statement-breakpoint
CREATE TABLE "concierge_message_channels" (
	"message_id" uuid PRIMARY KEY NOT NULL,
	"channel" varchar(10) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concierge_message_channel_valid" CHECK ("concierge_message_channels"."channel" IN ('duna', 'email', 'imessage', 'whatsapp'))
);
--> statement-breakpoint
CREATE TABLE "concierge_organization_mutes" (
	"person_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concierge_organization_mutes_person_id_organization_id_pk" PRIMARY KEY("person_id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "concierge_thread_assignments" (
	"conversation_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"assigned_person_id" uuid NOT NULL,
	"assigned_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "concierge_deliveries" ADD COLUMN "endpoint_id" uuid;--> statement-breakpoint
ALTER TABLE "concierge_send_proposals" ADD COLUMN "source" varchar(64);--> statement-breakpoint
ALTER TABLE "concierge_send_proposals" ADD COLUMN "message_kind" varchar(16) DEFAULT 'conversation' NOT NULL;--> statement-breakpoint
ALTER TABLE "person_channel_endpoints" ADD COLUMN "revoked_reason" varchar(16);--> statement-breakpoint
ALTER TABLE "person_channel_preferences" ADD COLUMN "operational_channel" varchar(10);--> statement-breakpoint
ALTER TABLE "concierge_channel_verifications" ADD CONSTRAINT "concierge_channel_verifications_endpoint_id_person_channel_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."person_channel_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concierge_channel_verifications" ADD CONSTRAINT "concierge_channel_verifications_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concierge_message_channels" ADD CONSTRAINT "concierge_message_channels_message_id_conversation_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concierge_organization_mutes" ADD CONSTRAINT "concierge_organization_mutes_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concierge_organization_mutes" ADD CONSTRAINT "concierge_organization_mutes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concierge_thread_assignments" ADD CONSTRAINT "concierge_thread_assignments_conversation_id_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concierge_thread_assignments" ADD CONSTRAINT "concierge_thread_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concierge_thread_assignments" ADD CONSTRAINT "concierge_thread_assignments_assigned_person_id_people_id_fk" FOREIGN KEY ("assigned_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concierge_thread_assignments" ADD CONSTRAINT "concierge_thread_assignments_assigned_by_person_id_people_id_fk" FOREIGN KEY ("assigned_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "concierge_channel_verification_endpoint_idx" ON "concierge_channel_verifications" USING btree ("endpoint_id","created_at");--> statement-breakpoint
CREATE INDEX "concierge_channel_verification_person_idx" ON "concierge_channel_verifications" USING btree ("person_id","created_at");--> statement-breakpoint
CREATE INDEX "concierge_thread_assignment_org_person_idx" ON "concierge_thread_assignments" USING btree ("organization_id","assigned_person_id");--> statement-breakpoint
ALTER TABLE "concierge_deliveries" ADD CONSTRAINT "concierge_deliveries_endpoint_id_person_channel_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."person_channel_endpoints"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "person_channel_endpoint_destination_idx" ON "person_channel_endpoints" USING btree ("channel","destination");--> statement-breakpoint
ALTER TABLE "concierge_send_proposals" ADD CONSTRAINT "concierge_send_proposal_message_kind_valid" CHECK ("concierge_send_proposals"."message_kind" IN ('conversation', 'operational'));--> statement-breakpoint
ALTER TABLE "person_channel_endpoints" ADD CONSTRAINT "person_channel_endpoint_revoked_reason_valid" CHECK ("person_channel_endpoints"."revoked_reason" IS NULL OR "person_channel_endpoints"."revoked_reason" IN ('person', 'opt-out', 'replaced'));--> statement-breakpoint
ALTER TABLE "person_channel_preferences" ADD CONSTRAINT "person_channel_preference_operational_valid" CHECK ("person_channel_preferences"."operational_channel" IS NULL OR "person_channel_preferences"."operational_channel" IN ('duna', 'email', 'imessage', 'whatsapp'));