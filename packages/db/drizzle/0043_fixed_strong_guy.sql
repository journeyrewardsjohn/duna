CREATE TABLE "communication_usage_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"email_contacts" integer DEFAULT 0 NOT NULL,
	"email_messages" integer DEFAULT 0 NOT NULL,
	"messaging_contacts" integer DEFAULT 0 NOT NULL,
	"sms_messages" integer DEFAULT 0 NOT NULL,
	"rcs_messages" integer DEFAULT 0 NOT NULL,
	"whatsapp_messages" integer DEFAULT 0 NOT NULL,
	"push_messages" integer DEFAULT 0 NOT NULL,
	"delivered" integer DEFAULT 0 NOT NULL,
	"opened" integer DEFAULT 0 NOT NULL,
	"clicked" integer DEFAULT 0 NOT NULL,
	"bounced" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"converted" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "communication_usage_nonnegative" CHECK ("communication_usage_periods"."email_contacts" >= 0 AND "communication_usage_periods"."email_messages" >= 0 AND "communication_usage_periods"."messaging_contacts" >= 0 AND "communication_usage_periods"."sms_messages" >= 0 AND "communication_usage_periods"."rcs_messages" >= 0 AND "communication_usage_periods"."whatsapp_messages" >= 0 AND "communication_usage_periods"."push_messages" >= 0 AND "communication_usage_periods"."delivered" >= 0 AND "communication_usage_periods"."opened" >= 0 AND "communication_usage_periods"."clicked" >= 0 AND "communication_usage_periods"."bounced" >= 0 AND "communication_usage_periods"."failed" >= 0 AND "communication_usage_periods"."converted" >= 0)
);
--> statement-breakpoint
CREATE TABLE "event_impressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"viewer_person_id" uuid,
	"anonymous_id" varchar(128),
	"surface" varchar(24) NOT NULL,
	"placement" varchar(64) DEFAULT 'event-page' NOT NULL,
	"source" varchar(120),
	"campaign_id" uuid,
	"dedupe_key" varchar(192) NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_impression_surface_valid" CHECK ("event_impressions"."surface" IN ('web', 'player-app', 'pro-app', 'hq')),
	CONSTRAINT "event_impression_viewer_present" CHECK ("event_impressions"."viewer_person_id" IS NOT NULL OR "event_impressions"."anonymous_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "message_delivery_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"message_id" uuid,
	"campaign_id" uuid,
	"provider_event_id" varchar(192) NOT NULL,
	"channel" "message_channel" NOT NULL,
	"transport" varchar(24) NOT NULL,
	"event_type" varchar(24) NOT NULL,
	"recipient_hash" varchar(64),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_delivery_transport_valid" CHECK ("message_delivery_events"."transport" IN ('email', 'sms', 'rcs', 'whatsapp', 'push', 'in-app')),
	CONSTRAINT "message_delivery_event_type_valid" CHECK ("message_delivery_events"."event_type" IN ('queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'unsubscribed', 'converted'))
);
--> statement-breakpoint
CREATE TABLE "organization_communication_settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"sender_display_name" text,
	"sender_email_local_part" varchar(64),
	"sender_email_domain" varchar(253),
	"sender_email" varchar(320),
	"email_domain_status" varchar(24) DEFAULT 'not-configured' NOT NULL,
	"email_dns_records" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"messaging_addon_status" varchar(24) DEFAULT 'disabled' NOT NULL,
	"messaging_phone_number" varchar(32),
	"messaging_sender_id" varchar(64),
	"sms_enabled" boolean DEFAULT false NOT NULL,
	"rcs_enabled" boolean DEFAULT false NOT NULL,
	"whatsapp_enabled" boolean DEFAULT false NOT NULL,
	"stripe_subscription_id" varchar(128),
	"stripe_messaging_item_id" varchar(128),
	"stripe_boost_item_id" varchar(128),
	"email_message_limit" integer DEFAULT 1000 NOT NULL,
	"email_contact_limit" integer DEFAULT 100 NOT NULL,
	"messaging_message_limit" integer DEFAULT 1000 NOT NULL,
	"messaging_contact_limit" integer DEFAULT 100 NOT NULL,
	"boost_units" integer DEFAULT 0 NOT NULL,
	"alert_threshold_bps" integer DEFAULT 8000 NOT NULL,
	"soft_overage_bps" integer DEFAULT 5000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_email_domain_status_valid" CHECK ("organization_communication_settings"."email_domain_status" IN ('not-configured', 'pending', 'verified', 'failed')),
	CONSTRAINT "organization_messaging_addon_status_valid" CHECK ("organization_communication_settings"."messaging_addon_status" IN ('disabled', 'trialing', 'active', 'past-due', 'cancelled')),
	CONSTRAINT "organization_communication_limits_valid" CHECK ("organization_communication_settings"."email_message_limit" >= 0 AND "organization_communication_settings"."email_contact_limit" >= 0 AND "organization_communication_settings"."messaging_message_limit" >= 0 AND "organization_communication_settings"."messaging_contact_limit" >= 0 AND "organization_communication_settings"."boost_units" >= 0),
	CONSTRAINT "organization_communication_thresholds_valid" CHECK ("organization_communication_settings"."alert_threshold_bps" BETWEEN 1 AND 10000 AND "organization_communication_settings"."soft_overage_bps" BETWEEN 0 AND 10000)
);
--> statement-breakpoint
CREATE TABLE "organization_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"hostname" varchar(253) NOT NULL,
	"kind" varchar(24) NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"vercel_project_id" text,
	"vercel_domain_id" text,
	"verification" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_domain_kind_valid" CHECK ("organization_domains"."kind" IN ('duna-subdomain', 'custom', 'purchased')),
	CONSTRAINT "organization_domain_status_valid" CHECK ("organization_domains"."status" IN ('pending', 'verifying', 'active', 'failed', 'disabled'))
);
--> statement-breakpoint
ALTER TABLE "marketing_flows" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "communication_usage_periods" ADD CONSTRAINT "communication_usage_periods_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_impressions" ADD CONSTRAINT "event_impressions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_impressions" ADD CONSTRAINT "event_impressions_viewer_person_id_people_id_fk" FOREIGN KEY ("viewer_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_delivery_events" ADD CONSTRAINT "message_delivery_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_delivery_events" ADD CONSTRAINT "message_delivery_events_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_delivery_events" ADD CONSTRAINT "message_delivery_events_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_communication_settings" ADD CONSTRAINT "organization_communication_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_domains" ADD CONSTRAINT "organization_domains_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "communication_usage_period_unique" ON "communication_usage_periods" USING btree ("organization_id","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "event_impression_dedupe_unique" ON "event_impressions" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "event_impression_session_time_idx" ON "event_impressions" USING btree ("session_id","occurred_at");--> statement-breakpoint
CREATE INDEX "event_impression_campaign_idx" ON "event_impressions" USING btree ("campaign_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "message_delivery_provider_event_unique" ON "message_delivery_events" USING btree ("provider_event_id");--> statement-breakpoint
CREATE INDEX "message_delivery_org_time_idx" ON "message_delivery_events" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "message_delivery_campaign_idx" ON "message_delivery_events" USING btree ("campaign_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_domain_hostname_unique" ON "organization_domains" USING btree ("hostname");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_domain_primary_unique" ON "organization_domains" USING btree ("organization_id") WHERE "organization_domains"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "organization_domain_status_idx" ON "organization_domains" USING btree ("organization_id","status");--> statement-breakpoint
ALTER TABLE "marketing_flows" ADD CONSTRAINT "marketing_flows_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketing_flow_session_status_idx" ON "marketing_flows" USING btree ("session_id","status","created_at");