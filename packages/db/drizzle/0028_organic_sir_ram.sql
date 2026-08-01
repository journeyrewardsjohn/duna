ALTER TABLE "organizations" ADD COLUMN "workos_organization_id" varchar(128);--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "workos_user_id" varchar(128);--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_workos_organization_id_unique" UNIQUE("workos_organization_id");--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_workos_user_id_unique" UNIQUE("workos_user_id");