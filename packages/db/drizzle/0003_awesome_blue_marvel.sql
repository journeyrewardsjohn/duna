CREATE TABLE "workflow_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar(128) NOT NULL,
	"idempotency_key" varchar(192) NOT NULL,
	"organization_id" uuid,
	"person_id" uuid,
	"payload" jsonb NOT NULL,
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"maximum_attempts" integer DEFAULT 8 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"lock_token" uuid,
	"completed_at" timestamp with time zone,
	"last_error" text,
	"trace_id" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_attempt_bounds" CHECK ("workflow_jobs"."attempts" >= 0 AND "workflow_jobs"."maximum_attempts" > 0)
);
--> statement-breakpoint
ALTER TABLE "workflow_jobs" ADD CONSTRAINT "workflow_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_jobs" ADD CONSTRAINT "workflow_jobs_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_kind_idempotency_unique" ON "workflow_jobs" USING btree ("kind","idempotency_key");--> statement-breakpoint
CREATE INDEX "workflow_ready_idx" ON "workflow_jobs" USING btree ("status","available_at","created_at");