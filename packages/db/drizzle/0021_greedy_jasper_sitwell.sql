CREATE TABLE "event_policy_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"acceptance_key" varchar(128) NOT NULL,
	"session_id" uuid NOT NULL,
	"policy_id" varchar(128) NOT NULL,
	"policy_kind" varchar(16) NOT NULL,
	"policy_title" text NOT NULL,
	"document_text" text NOT NULL,
	"document_text_hash" varchar(128) NOT NULL,
	"subject_person_id" uuid NOT NULL,
	"accepted_by_person_id" uuid NOT NULL,
	"order_id" uuid,
	"registration_id" uuid,
	"full_scroll_confirmed" boolean DEFAULT false NOT NULL,
	"ip_address" varchar(64),
	"accepted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_policy_acceptances_acceptance_key_unique" UNIQUE("acceptance_key"),
	CONSTRAINT "event_policy_acceptance_kind" CHECK ("event_policy_acceptances"."policy_kind" IN ('policy', 'waiver')),
	CONSTRAINT "event_policy_acceptance_reference" CHECK ("event_policy_acceptances"."order_id" IS NOT NULL OR "event_policy_acceptances"."registration_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "event_policy_acceptances" ADD CONSTRAINT "event_policy_acceptances_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_policy_acceptances" ADD CONSTRAINT "event_policy_acceptances_subject_person_id_people_id_fk" FOREIGN KEY ("subject_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_policy_acceptances" ADD CONSTRAINT "event_policy_acceptances_accepted_by_person_id_people_id_fk" FOREIGN KEY ("accepted_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_policy_acceptances" ADD CONSTRAINT "event_policy_acceptances_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_policy_acceptances" ADD CONSTRAINT "event_policy_acceptances_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_policy_acceptance_session_idx" ON "event_policy_acceptances" USING btree ("session_id","subject_person_id","accepted_at");--> statement-breakpoint
CREATE INDEX "event_policy_acceptance_order_idx" ON "event_policy_acceptances" USING btree ("order_id");