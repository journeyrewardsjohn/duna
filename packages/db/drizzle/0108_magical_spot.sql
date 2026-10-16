CREATE TABLE "ask_duna_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"input" jsonb NOT NULL,
	"summary" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ask_duna_action_status_valid" CHECK ("ask_duna_actions"."status" in ('pending', 'executing', 'succeeded', 'failed', 'declined', 'uncertain'))
);
--> statement-breakpoint
CREATE TABLE "ask_duna_controls" (
	"id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"mutations_enabled" boolean DEFAULT true NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ask_duna_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"session_id" text,
	"title" text DEFAULT 'New conversation' NOT NULL,
	"preview" text DEFAULT '' NOT NULL,
	"effort" text DEFAULT 'medium' NOT NULL,
	"page" text DEFAULT '/ask' NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ask_duna_conversations_session_id_unique" UNIQUE("session_id"),
	CONSTRAINT "ask_duna_effort_valid" CHECK ("ask_duna_conversations"."effort" in ('fast', 'medium', 'high', 'max', 'ultra'))
);
--> statement-breakpoint
CREATE TABLE "ask_duna_events" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"type" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ask_duna_actions" ADD CONSTRAINT "ask_duna_actions_conversation_id_ask_duna_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ask_duna_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_duna_controls" ADD CONSTRAINT "ask_duna_controls_updated_by_people_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_duna_conversations" ADD CONSTRAINT "ask_duna_conversations_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_duna_conversations" ADD CONSTRAINT "ask_duna_conversations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_duna_events" ADD CONSTRAINT "ask_duna_events_conversation_id_ask_duna_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ask_duna_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ask_duna_action_conversation_idx" ON "ask_duna_actions" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "ask_duna_history_idx" ON "ask_duna_conversations" USING btree ("organization_id","person_id","updated_at");--> statement-breakpoint
CREATE INDEX "ask_duna_event_conversation_idx" ON "ask_duna_events" USING btree ("conversation_id","created_at");