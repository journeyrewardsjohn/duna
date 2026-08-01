CREATE TABLE "organization_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invited_by_person_id" uuid NOT NULL,
	"invite_token" varchar(96) NOT NULL,
	"relationship" varchar(24) DEFAULT 'player' NOT NULL,
	"invited_name" text NOT NULL,
	"invited_email" text,
	"invited_phone_e164" varchar(24),
	"is_minor" boolean DEFAULT false NOT NULL,
	"guardian_name" text,
	"guardian_email" text,
	"guardian_phone_e164" varchar(24),
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"delivery_channel" varchar(16),
	"delivery_status" varchar(24) DEFAULT 'not-configured' NOT NULL,
	"delivery_message_id" varchar(160),
	"claimed_by_person_id" uuid,
	"claimed_person_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_invitations_invite_token_unique" UNIQUE("invite_token"),
	CONSTRAINT "organization_invitation_relationship_valid" CHECK ("organization_invitations"."relationship" IN ('player', 'member')),
	CONSTRAINT "organization_invitation_status_valid" CHECK ("organization_invitations"."status" IN ('pending', 'claimed', 'expired', 'cancelled')),
	CONSTRAINT "organization_invitation_delivery_status_valid" CHECK ("organization_invitations"."delivery_status" IN ('not-configured', 'queued', 'sent', 'failed')),
	CONSTRAINT "organization_invitation_destination_present" CHECK ("organization_invitations"."invited_email" IS NOT NULL OR "organization_invitations"."invited_phone_e164" IS NOT NULL OR "organization_invitations"."guardian_email" IS NOT NULL OR "organization_invitations"."guardian_phone_e164" IS NOT NULL),
	CONSTRAINT "organization_invitation_minor_guardian_present" CHECK (NOT "organization_invitations"."is_minor" OR "organization_invitations"."guardian_email" IS NOT NULL OR "organization_invitations"."guardian_phone_e164" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "organization_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"relationship" varchar(24) DEFAULT 'player' NOT NULL,
	"status" varchar(24) DEFAULT 'active' NOT NULL,
	"added_by_person_id" uuid,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_participant_relationship_valid" CHECK ("organization_participants"."relationship" IN ('player', 'member', 'guardian')),
	CONSTRAINT "organization_participant_status_valid" CHECK ("organization_participants"."status" IN ('active', 'inactive', 'pending'))
);
--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_invited_by_person_id_people_id_fk" FOREIGN KEY ("invited_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_claimed_by_person_id_people_id_fk" FOREIGN KEY ("claimed_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_claimed_person_id_people_id_fk" FOREIGN KEY ("claimed_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_participants" ADD CONSTRAINT "organization_participants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_participants" ADD CONSTRAINT "organization_participants_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_participants" ADD CONSTRAINT "organization_participants_added_by_person_id_people_id_fk" FOREIGN KEY ("added_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_invitation_org_status_idx" ON "organization_invitations" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_participant_unique" ON "organization_participants" USING btree ("organization_id","person_id","relationship");--> statement-breakpoint
CREATE INDEX "organization_participant_person_idx" ON "organization_participants" USING btree ("person_id");