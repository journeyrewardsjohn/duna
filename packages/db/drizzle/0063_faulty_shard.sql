CREATE TABLE "match_participant_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"provisional_person_id" uuid NOT NULL,
	"invited_by_person_id" uuid NOT NULL,
	"invite_token" varchar(96) NOT NULL,
	"invited_email" text,
	"invited_phone_e164" varchar(24),
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"delivery_channel" varchar(16),
	"delivery_status" varchar(24) DEFAULT 'not-configured' NOT NULL,
	"delivery_message_id" varchar(160),
	"claimed_by_person_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_participant_invitations_invite_token_unique" UNIQUE("invite_token"),
	CONSTRAINT "match_participant_invitation_destination_present" CHECK ("match_participant_invitations"."invited_email" IS NOT NULL OR "match_participant_invitations"."invited_phone_e164" IS NOT NULL),
	CONSTRAINT "match_participant_invitation_status_valid" CHECK ("match_participant_invitations"."status" IN ('pending', 'claimed', 'expired', 'cancelled')),
	CONSTRAINT "match_participant_invitation_delivery_status_valid" CHECK ("match_participant_invitations"."delivery_status" IN ('not-configured', 'queued', 'sent', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "match_participant_invitations" ADD CONSTRAINT "match_participant_invitations_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participant_invitations" ADD CONSTRAINT "match_participant_invitations_provisional_person_id_people_id_fk" FOREIGN KEY ("provisional_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participant_invitations" ADD CONSTRAINT "match_participant_invitations_invited_by_person_id_people_id_fk" FOREIGN KEY ("invited_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participant_invitations" ADD CONSTRAINT "match_participant_invitations_claimed_by_person_id_people_id_fk" FOREIGN KEY ("claimed_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_participant_invitation_person_unique" ON "match_participant_invitations" USING btree ("match_id","provisional_person_id");--> statement-breakpoint
CREATE INDEX "match_participant_invitation_match_status_idx" ON "match_participant_invitations" USING btree ("match_id","status");