CREATE TABLE "messaging_channel_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_message_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"binding_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_person_id" uuid NOT NULL,
	"recipient_person_id" uuid NOT NULL,
	"endpoint" varchar(24) NOT NULL,
	"recipient_phone" varchar(24) NOT NULL,
	"body" text NOT NULL,
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"provider_message_handle" varchar(192),
	"error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_channel_outbox_source_message_id_unique" UNIQUE("source_message_id"),
	CONSTRAINT "messaging_channel_outbox_provider_message_handle_unique" UNIQUE("provider_message_handle")
);
--> statement-breakpoint
ALTER TABLE "messaging_channel_outbox" ADD CONSTRAINT "messaging_channel_outbox_source_message_id_conversation_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_channel_outbox" ADD CONSTRAINT "messaging_channel_outbox_conversation_id_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_channel_outbox" ADD CONSTRAINT "messaging_channel_outbox_binding_id_messaging_channel_bindings_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."messaging_channel_bindings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_channel_outbox" ADD CONSTRAINT "messaging_channel_outbox_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_channel_outbox" ADD CONSTRAINT "messaging_channel_outbox_actor_person_id_people_id_fk" FOREIGN KEY ("actor_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_channel_outbox" ADD CONSTRAINT "messaging_channel_outbox_recipient_person_id_people_id_fk" FOREIGN KEY ("recipient_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messaging_channel_outbox_status_idx" ON "messaging_channel_outbox" USING btree ("status","created_at");