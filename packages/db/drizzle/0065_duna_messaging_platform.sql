CREATE TYPE "public"."conversation_message_kind" AS ENUM('text', 'announcement', 'event-update', 'schedule-change', 'payment-request', 'form-request', 'score-update', 'support-response', 'system');--> statement-breakpoint
CREATE TYPE "public"."conversation_message_status" AS ENUM('screening', 'published', 'held', 'removed');--> statement-breakpoint
CREATE TYPE "public"."message_moderation_state" AS ENUM('not-required', 'screening', 'safe', 'review', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."messaging_context_type" AS ENUM('organization', 'event', 'division', 'league', 'lesson', 'rental', 'match', 'support-case');--> statement-breakpoint
CREATE TYPE "public"."messaging_conversation_type" AS ENUM('dm', 'group', 'event', 'division', 'league', 'broadcast', 'support');--> statement-breakpoint
CREATE TYPE "public"."messaging_participant_role" AS ENUM('member', 'moderator', 'guardian', 'agent');--> statement-breakpoint
CREATE TYPE "public"."messaging_principal_type" AS ENUM('user', 'organization', 'agent');--> statement-breakpoint
CREATE TABLE "conversation_message_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"action_id" varchar(64) NOT NULL,
	"action_type" varchar(32) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_message_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"media_type" varchar(80) NOT NULL,
	"file_name" text NOT NULL,
	"byte_size" integer NOT NULL,
	"safety_status" varchar(24) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_attachment_size_positive" CHECK ("conversation_message_attachments"."byte_size" > 0),
	CONSTRAINT "conversation_attachment_safety_valid" CHECK ("conversation_message_attachments"."safety_status" IN ('pending', 'safe', 'review', 'blocked'))
);
--> statement-breakpoint
CREATE TABLE "conversation_message_reactions" (
	"message_id" uuid NOT NULL,
	"principal_type" "messaging_principal_type" NOT NULL,
	"principal_id" varchar(192) NOT NULL,
	"emoji" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_message_reactions_message_id_principal_type_principal_id_emoji_pk" PRIMARY KEY("message_id","principal_type","principal_id","emoji")
);
--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"client_message_id" uuid NOT NULL,
	"sender_principal_type" "messaging_principal_type" NOT NULL,
	"sender_principal_id" varchar(192) NOT NULL,
	"sender_person_id" uuid,
	"sender_organization_id" uuid,
	"kind" "conversation_message_kind" DEFAULT 'text' NOT NULL,
	"body" text,
	"widgets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reply_to_message_id" uuid,
	"status" "conversation_message_status" DEFAULT 'published' NOT NULL,
	"moderation_state" "message_moderation_state" DEFAULT 'not-required' NOT NULL,
	"published_at" timestamp with time zone,
	"edited_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_message_sequence_positive" CHECK ("conversation_messages"."sequence" > 0),
	CONSTRAINT "conversation_message_content_present" CHECK ("conversation_messages"."body" IS NOT NULL OR jsonb_array_length("conversation_messages"."widgets") > 0)
);
--> statement-breakpoint
CREATE TABLE "message_moderation_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"status" varchar(24) DEFAULT 'open' NOT NULL,
	"severity" varchar(16) NOT NULL,
	"categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"explanation" text NOT NULL,
	"model" varchar(160),
	"model_version" varchar(160),
	"confidence" double precision,
	"assigned_to_person_id" uuid,
	"reviewed_by_person_id" uuid,
	"reviewed_at" timestamp with time zone,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_moderation_status_valid" CHECK ("message_moderation_cases"."status" IN ('open', 'reviewing', 'cleared', 'restricted', 'escalated')),
	CONSTRAINT "message_moderation_severity_valid" CHECK ("message_moderation_cases"."severity" IN ('low', 'medium', 'high', 'critical')),
	CONSTRAINT "message_moderation_confidence_valid" CHECK ("message_moderation_cases"."confidence" IS NULL OR "message_moderation_cases"."confidence" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "messaging_agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"request_message_id" uuid,
	"response_message_id" uuid,
	"person_id" uuid NOT NULL,
	"agent_id" varchar(96) NOT NULL,
	"model" varchar(160),
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"tools_used" text[] DEFAULT '{}'::text[] NOT NULL,
	"context_digest" varchar(128),
	"response_digest" varchar(128),
	"handoff_reason" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_agent_status_valid" CHECK ("messaging_agent_runs"."status" IN ('queued', 'running', 'completed', 'handoff', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "messaging_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blocker_person_id" uuid NOT NULL,
	"blocked_principal_type" "messaging_principal_type" NOT NULL,
	"blocked_principal_id" varchar(192) NOT NULL,
	"reason" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_block_agent_disallowed" CHECK ("messaging_blocks"."blocked_principal_type" <> 'agent')
);
--> statement-breakpoint
CREATE TABLE "messaging_conversation_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"principal_type" "messaging_principal_type" NOT NULL,
	"principal_id" varchar(192) NOT NULL,
	"person_id" uuid,
	"organization_id" uuid,
	"role" "messaging_participant_role" DEFAULT 'member' NOT NULL,
	"guardian_of_person_id" uuid,
	"can_post" boolean DEFAULT true NOT NULL,
	"notification_level" varchar(16) DEFAULT 'all' NOT NULL,
	"last_read_sequence" integer DEFAULT 0 NOT NULL,
	"last_delivered_sequence" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_participant_notification_valid" CHECK ("messaging_conversation_participants"."notification_level" IN ('all', 'mentions', 'muted')),
	CONSTRAINT "messaging_participant_watermarks_nonnegative" CHECK ("messaging_conversation_participants"."last_read_sequence" >= 0 AND "messaging_conversation_participants"."last_delivered_sequence" >= 0 AND "messaging_conversation_participants"."last_delivered_sequence" >= "messaging_conversation_participants"."last_read_sequence"),
	CONSTRAINT "messaging_participant_principal_reference" CHECK (("messaging_conversation_participants"."principal_type" = 'user' AND "messaging_conversation_participants"."person_id" IS NOT NULL AND "messaging_conversation_participants"."organization_id" IS NULL) OR ("messaging_conversation_participants"."principal_type" = 'organization' AND "messaging_conversation_participants"."organization_id" IS NOT NULL AND "messaging_conversation_participants"."person_id" IS NULL) OR ("messaging_conversation_participants"."principal_type" = 'agent' AND "messaging_conversation_participants"."person_id" IS NULL AND "messaging_conversation_participants"."organization_id" IS NULL)),
	CONSTRAINT "messaging_guardian_requires_minor" CHECK ("messaging_conversation_participants"."role" <> 'guardian' OR "messaging_conversation_participants"."guardian_of_person_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "messaging_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"type" "messaging_conversation_type" NOT NULL,
	"title" text NOT NULL,
	"context_type" "messaging_context_type",
	"context_id" varchar(192),
	"context_label" text,
	"created_by_principal_type" "messaging_principal_type" NOT NULL,
	"created_by_principal_id" varchar(192) NOT NULL,
	"announcement_only" boolean DEFAULT false NOT NULL,
	"follower_broadcast" boolean DEFAULT false NOT NULL,
	"minor_present" boolean DEFAULT false NOT NULL,
	"guardian_coverage_complete" boolean DEFAULT true NOT NULL,
	"safety_screening_required" boolean DEFAULT false NOT NULL,
	"status" varchar(24) DEFAULT 'open' NOT NULL,
	"last_message_sequence" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_conversation_status_valid" CHECK ("messaging_conversations"."status" IN ('open', 'closed', 'archived')),
	CONSTRAINT "messaging_conversation_context_pair" CHECK (("messaging_conversations"."context_type" IS NULL) = ("messaging_conversations"."context_id" IS NULL)),
	CONSTRAINT "messaging_conversation_minor_safety" CHECK (NOT "messaging_conversations"."minor_present" OR ("messaging_conversations"."guardian_coverage_complete" AND "messaging_conversations"."safety_screening_required")),
	CONSTRAINT "messaging_conversation_sequence_nonnegative" CHECK ("messaging_conversations"."last_message_sequence" >= 0)
);
--> statement-breakpoint
CREATE TABLE "messaging_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_principal_type" "messaging_principal_type" NOT NULL,
	"source_principal_id" varchar(192) NOT NULL,
	"target_principal_type" "messaging_principal_type" NOT NULL,
	"target_principal_id" varchar(192) NOT NULL,
	"organization_id" uuid,
	"person_id" uuid,
	"context_type" "messaging_context_type",
	"context_id" varchar(192),
	"kind" varchar(48) NOT NULL,
	"source_key" varchar(256) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_relationship_kind_valid" CHECK ("messaging_relationships"."kind" IN ('organization-member', 'event-registration', 'lesson', 'rental', 'league', 'staff', 'follow', 'support')),
	CONSTRAINT "messaging_relationship_context_pair" CHECK (("messaging_relationships"."context_type" IS NULL) = ("messaging_relationships"."context_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "conversation_message_actions" ADD CONSTRAINT "conversation_message_actions_message_id_conversation_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_message_actions" ADD CONSTRAINT "conversation_message_actions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_message_attachments" ADD CONSTRAINT "conversation_message_attachments_message_id_conversation_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_message_reactions" ADD CONSTRAINT "conversation_message_reactions_message_id_conversation_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_sender_person_id_people_id_fk" FOREIGN KEY ("sender_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_sender_organization_id_organizations_id_fk" FOREIGN KEY ("sender_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_moderation_cases" ADD CONSTRAINT "message_moderation_cases_message_id_conversation_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_moderation_cases" ADD CONSTRAINT "message_moderation_cases_assigned_to_person_id_people_id_fk" FOREIGN KEY ("assigned_to_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_moderation_cases" ADD CONSTRAINT "message_moderation_cases_reviewed_by_person_id_people_id_fk" FOREIGN KEY ("reviewed_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_agent_runs" ADD CONSTRAINT "messaging_agent_runs_conversation_id_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_agent_runs" ADD CONSTRAINT "messaging_agent_runs_request_message_id_conversation_messages_id_fk" FOREIGN KEY ("request_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_agent_runs" ADD CONSTRAINT "messaging_agent_runs_response_message_id_conversation_messages_id_fk" FOREIGN KEY ("response_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_agent_runs" ADD CONSTRAINT "messaging_agent_runs_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_blocks" ADD CONSTRAINT "messaging_blocks_blocker_person_id_people_id_fk" FOREIGN KEY ("blocker_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_conversation_participants" ADD CONSTRAINT "messaging_conversation_participants_conversation_id_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_conversation_participants" ADD CONSTRAINT "messaging_conversation_participants_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_conversation_participants" ADD CONSTRAINT "messaging_conversation_participants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_conversation_participants" ADD CONSTRAINT "messaging_conversation_participants_guardian_of_person_id_people_id_fk" FOREIGN KEY ("guardian_of_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_conversations" ADD CONSTRAINT "messaging_conversations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_relationships" ADD CONSTRAINT "messaging_relationships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_relationships" ADD CONSTRAINT "messaging_relationships_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_message_action_unique" ON "conversation_message_actions" USING btree ("message_id","person_id","action_id");--> statement-breakpoint
CREATE INDEX "conversation_attachment_message_idx" ON "conversation_message_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "conversation_reaction_message_idx" ON "conversation_message_reactions" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_message_sequence_unique" ON "conversation_messages" USING btree ("conversation_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_message_client_id_unique" ON "conversation_messages" USING btree ("client_message_id");--> statement-breakpoint
CREATE INDEX "conversation_message_conversation_created_idx" ON "conversation_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "conversation_message_screening_idx" ON "conversation_messages" USING btree ("moderation_state","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "message_moderation_message_unique" ON "message_moderation_cases" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_moderation_queue_idx" ON "message_moderation_cases" USING btree ("status","severity","created_at");--> statement-breakpoint
CREATE INDEX "messaging_agent_conversation_idx" ON "messaging_agent_runs" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_active_block_unique" ON "messaging_blocks" USING btree ("blocker_person_id","blocked_principal_type","blocked_principal_id") WHERE "messaging_blocks"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "messaging_blocked_principal_idx" ON "messaging_blocks" USING btree ("blocked_principal_type","blocked_principal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_participant_principal_unique" ON "messaging_conversation_participants" USING btree ("conversation_id","principal_type","principal_id");--> statement-breakpoint
CREATE INDEX "messaging_participant_person_inbox_idx" ON "messaging_conversation_participants" USING btree ("person_id","left_at","updated_at");--> statement-breakpoint
CREATE INDEX "messaging_participant_org_inbox_idx" ON "messaging_conversation_participants" USING btree ("organization_id","left_at","updated_at");--> statement-breakpoint
CREATE INDEX "messaging_conversation_org_updated_idx" ON "messaging_conversations" USING btree ("organization_id","updated_at");--> statement-breakpoint
CREATE INDEX "messaging_conversation_context_idx" ON "messaging_conversations" USING btree ("context_type","context_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_context_conversation_unique" ON "messaging_conversations" USING btree ("organization_id","type","context_type","context_id") WHERE "messaging_conversations"."context_id" IS NOT NULL AND "messaging_conversations"."status" = 'open';--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_relationship_source_key_unique" ON "messaging_relationships" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "messaging_relationship_pair_idx" ON "messaging_relationships" USING btree ("source_principal_type","source_principal_id","target_principal_type","target_principal_id");--> statement-breakpoint
CREATE INDEX "messaging_relationship_org_person_idx" ON "messaging_relationships" USING btree ("organization_id","person_id");
--> statement-breakpoint
-- Seed durable relationship evidence from every existing first-party Duna
-- relationship. These rows are intentionally retained when the source domain
-- record later becomes inactive; a current messaging block still overrides
-- every relationship at send time.
INSERT INTO "messaging_relationships" (
	"source_principal_type", "source_principal_id",
	"target_principal_type", "target_principal_id",
	"organization_id", "person_id", "kind", "source_key",
	"active", "started_at", "created_at", "updated_at"
)
SELECT
	'organization', op."organization_id"::text,
	'user', op."person_id"::text,
	op."organization_id", op."person_id", 'organization-member',
	'organization-participant:' || op."id"::text,
	(op."status" = 'active'), op."joined_at", op."created_at", op."updated_at"
FROM "organization_participants" op
WHERE op."status" IN ('active', 'inactive')
ON CONFLICT ("source_key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "messaging_relationships" (
	"source_principal_type", "source_principal_id",
	"target_principal_type", "target_principal_id",
	"organization_id", "person_id", "kind", "source_key",
	"active", "started_at", "created_at", "updated_at"
)
SELECT
	'organization', om."organization_id"::text,
	'user', om."person_id"::text,
	om."organization_id", om."person_id", 'staff',
	'organization-membership:' || om."id"::text,
	om."active", om."joined_at", om."created_at", om."updated_at"
FROM "organization_memberships" om
ON CONFLICT ("source_key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "messaging_relationships" (
	"source_principal_type", "source_principal_id",
	"target_principal_type", "target_principal_id",
	"organization_id", "person_id", "context_type", "context_id",
	"kind", "source_key", "active", "started_at", "created_at", "updated_at"
)
SELECT
	'organization', p."organization_id"::text,
	'user', r."person_id"::text,
	p."organization_id", r."person_id",
	CASE
		WHEN p."kind" = 'private-lesson' THEN 'lesson'::messaging_context_type
		WHEN p."kind" = 'league' THEN 'league'::messaging_context_type
		ELSE 'event'::messaging_context_type
	END,
	CASE WHEN p."kind" = 'league' THEN p."id"::text ELSE s."id"::text END,
	CASE
		WHEN p."kind" = 'private-lesson' THEN 'lesson'
		WHEN p."kind" = 'league' THEN 'league'
		ELSE 'event-registration'
	END,
	'registration:' || r."id"::text,
	(r."status" NOT IN ('cancelled', 'refunded')),
	r."created_at", r."created_at", r."updated_at"
FROM "registrations" r
JOIN "sessions" s ON s."id" = r."session_id"
JOIN "programs" p ON p."id" = s."program_id"
ON CONFLICT ("source_key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "messaging_relationships" (
	"source_principal_type", "source_principal_id",
	"target_principal_type", "target_principal_id",
	"organization_id", "person_id", "context_type", "context_id",
	"kind", "source_key", "active", "started_at", "created_at", "updated_at"
)
SELECT
	'organization', cb."organization_id"::text,
	'user', cb."person_id"::text,
	cb."organization_id", cb."person_id", 'rental', cb."id"::text,
	'rental', 'court-booking-owner:' || cb."id"::text,
	(cb."status" IN ('held', 'confirmed')), cb."created_at", cb."created_at", cb."updated_at"
FROM "court_bookings" cb
ON CONFLICT ("source_key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "messaging_relationships" (
	"source_principal_type", "source_principal_id",
	"target_principal_type", "target_principal_id",
	"organization_id", "person_id", "context_type", "context_id",
	"kind", "source_key", "active", "started_at", "created_at", "updated_at"
)
SELECT
	'organization', cb."organization_id"::text,
	'user', cbp."person_id"::text,
	cb."organization_id", cbp."person_id", 'rental', cb."id"::text,
	'rental', 'court-booking-participant:' || cbp."id"::text,
	(cbp."status" NOT IN ('declined', 'cancelled')), cbp."created_at", cbp."created_at", cbp."updated_at"
FROM "court_booking_participants" cbp
JOIN "court_bookings" cb ON cb."id" = cbp."booking_id"
WHERE cbp."person_id" IS NOT NULL
ON CONFLICT ("source_key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "messaging_relationships" (
	"source_principal_type", "source_principal_id",
	"target_principal_type", "target_principal_id",
	"kind", "source_key", "active", "started_at", "created_at", "updated_at"
)
SELECT
	'user', f."follower_person_id"::text,
	'user', f."entity_id"::text,
	'follow',
	'follow:' || f."follower_person_id"::text || ':' || f."entity_id"::text,
	true, f."created_at", f."created_at", f."created_at"
FROM "follows" f
WHERE f."entity_type" = 'player'
ON CONFLICT ("source_key") DO NOTHING;
