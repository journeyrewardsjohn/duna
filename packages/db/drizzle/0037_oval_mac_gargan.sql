CREATE TABLE "marketing_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"segment" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"channel" "message_channel" NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"stats" jsonb DEFAULT '{"recipients":0,"delivered":0,"opened":0,"clicked":0,"failed":0}'::jsonb NOT NULL,
	"created_by_person_id" uuid NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_campaign_status_valid" CHECK ("marketing_campaigns"."status" IN ('draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "marketing_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"segment" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"trigger" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"action" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"created_by_person_id" uuid NOT NULL,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_flow_status_valid" CHECK ("marketing_flows"."status" IN ('draft', 'active', 'paused', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "organization_staff_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invited_by_person_id" uuid NOT NULL,
	"invite_token" varchar(96) NOT NULL,
	"invited_name" text NOT NULL,
	"invited_email" text,
	"invited_phone_e164" varchar(24),
	"role" varchar(24) NOT NULL,
	"worker_classification" varchar(24) NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"delivery_channel" varchar(16),
	"delivery_status" varchar(24) DEFAULT 'not-configured' NOT NULL,
	"delivery_message_id" varchar(160),
	"claimed_by_person_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_staff_invitations_invite_token_unique" UNIQUE("invite_token"),
	CONSTRAINT "organization_staff_invitation_role_valid" CHECK ("organization_staff_invitations"."role" IN ('coach', 'manager', 'front-desk', 'accountant')),
	CONSTRAINT "organization_staff_invitation_classification_valid" CHECK ("organization_staff_invitations"."worker_classification" IN ('1099-contractor', 'w2-employee')),
	CONSTRAINT "organization_staff_invitation_status_valid" CHECK ("organization_staff_invitations"."status" IN ('pending', 'claimed', 'expired', 'cancelled')),
	CONSTRAINT "organization_staff_invitation_destination_present" CHECK ("organization_staff_invitations"."invited_email" IS NOT NULL OR "organization_staff_invitations"."invited_phone_e164" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "organization_staff_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"worker_classification" varchar(24) NOT NULL,
	"compensation_model" varchar(24) DEFAULT 'not-set' NOT NULL,
	"hourly_rate_minor" integer,
	"profit_share_bps" integer,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"address_line_1" text,
	"address_line_2" text,
	"locality" text,
	"administrative_area" text,
	"postal_code" varchar(24),
	"country_code" varchar(2) DEFAULT 'US' NOT NULL,
	"google_place_id" text,
	"latitude" double precision,
	"longitude" double precision,
	"availability" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"income_goal_minor" integer,
	"income_goal_period" varchar(16),
	"started_at" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_staff_classification_valid" CHECK ("organization_staff_profiles"."worker_classification" IN ('1099-contractor', 'w2-employee')),
	CONSTRAINT "organization_staff_compensation_valid" CHECK ("organization_staff_profiles"."compensation_model" IN ('not-set', 'hourly', 'profit-share', 'hourly-plus-profit-share')),
	CONSTRAINT "organization_staff_hourly_rate_valid" CHECK ("organization_staff_profiles"."hourly_rate_minor" IS NULL OR "organization_staff_profiles"."hourly_rate_minor" >= 0),
	CONSTRAINT "organization_staff_profit_share_valid" CHECK ("organization_staff_profiles"."profit_share_bps" IS NULL OR "organization_staff_profiles"."profit_share_bps" BETWEEN 0 AND 10000),
	CONSTRAINT "organization_staff_income_goal_valid" CHECK ("organization_staff_profiles"."income_goal_minor" IS NULL OR "organization_staff_profiles"."income_goal_minor" >= 0),
	CONSTRAINT "organization_staff_goal_period_valid" CHECK ("organization_staff_profiles"."income_goal_period" IS NULL OR "organization_staff_profiles"."income_goal_period" IN ('week', 'month', 'quarter', 'year'))
);
--> statement-breakpoint
CREATE TABLE "pickup_join_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pickup_session_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"status" varchar(24) DEFAULT 'requested' NOT NULL,
	"note" text,
	"reviewed_by_person_id" uuid,
	"reviewed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pickup_join_request_status_valid" CHECK ("pickup_join_requests"."status" IN ('requested', 'approved', 'rejected', 'cancelled', 'expired'))
);
--> statement-breakpoint
ALTER TABLE "pickup_sessions" ADD COLUMN "status" varchar(24) DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "pickup_sessions" ADD COLUMN "approval_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pickup_sessions" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "pickup_sessions" ADD COLUMN "google_place_id" text;--> statement-breakpoint
ALTER TABLE "pickup_sessions" ADD COLUMN "location_confidence" varchar(16) DEFAULT 'approximate' NOT NULL;--> statement-breakpoint
ALTER TABLE "pickup_sessions" ADD COLUMN "smart_rules" jsonb DEFAULT '{"waitlistEnabled":true,"allowLateCancellation":false,"minimumNoticeMinutes":60,"autoCancelLowAttendance":false,"minimumAttendance":2}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_flows" ADD CONSTRAINT "marketing_flows_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_flows" ADD CONSTRAINT "marketing_flows_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_staff_invitations" ADD CONSTRAINT "organization_staff_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_staff_invitations" ADD CONSTRAINT "organization_staff_invitations_invited_by_person_id_people_id_fk" FOREIGN KEY ("invited_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_staff_invitations" ADD CONSTRAINT "organization_staff_invitations_claimed_by_person_id_people_id_fk" FOREIGN KEY ("claimed_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_staff_profiles" ADD CONSTRAINT "organization_staff_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_staff_profiles" ADD CONSTRAINT "organization_staff_profiles_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_join_requests" ADD CONSTRAINT "pickup_join_requests_pickup_session_id_pickup_sessions_id_fk" FOREIGN KEY ("pickup_session_id") REFERENCES "public"."pickup_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_join_requests" ADD CONSTRAINT "pickup_join_requests_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_join_requests" ADD CONSTRAINT "pickup_join_requests_reviewed_by_person_id_people_id_fk" FOREIGN KEY ("reviewed_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketing_campaign_org_status_idx" ON "marketing_campaigns" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "marketing_flow_org_status_idx" ON "marketing_flows" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "organization_staff_invitation_org_status_idx" ON "organization_staff_invitations" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_staff_profile_unique" ON "organization_staff_profiles" USING btree ("organization_id","person_id");--> statement-breakpoint
CREATE INDEX "organization_staff_profile_org_active_idx" ON "organization_staff_profiles" USING btree ("organization_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "pickup_join_request_session_person_unique" ON "pickup_join_requests" USING btree ("pickup_session_id","person_id");--> statement-breakpoint
CREATE INDEX "pickup_join_request_host_queue_idx" ON "pickup_join_requests" USING btree ("pickup_session_id","status","created_at");--> statement-breakpoint
ALTER TABLE "organization_themes" ADD CONSTRAINT "organization_theme_profile_layout_valid" CHECK ("organization_themes"."profile_layout" IN ('editorial', 'immersive', 'compact'));--> statement-breakpoint
ALTER TABLE "pickup_sessions" ADD CONSTRAINT "pickup_session_status_valid" CHECK ("pickup_sessions"."status" IN ('active', 'cancelled', 'completed'));--> statement-breakpoint
ALTER TABLE "pickup_sessions" ADD CONSTRAINT "pickup_session_location_confidence_valid" CHECK ("pickup_sessions"."location_confidence" IN ('confirmed', 'approximate'));