ALTER TABLE "organization_staff_profiles" DROP CONSTRAINT "organization_staff_classification_valid";--> statement-breakpoint
ALTER TABLE "organization_staff_profiles" ALTER COLUMN "worker_classification" SET DEFAULT 'not-set';--> statement-breakpoint
ALTER TABLE "organization_staff_profiles" ADD COLUMN "staff_role" varchar(24) DEFAULT 'coach' NOT NULL;--> statement-breakpoint
UPDATE "organization_staff_profiles" AS "staff"
SET "staff_role" = "membership"."role"
FROM (
	SELECT DISTINCT ON ("organization_id", "person_id")
		"organization_id",
		"person_id",
		"role"
	FROM "organization_memberships"
	WHERE "active" = true
		AND "role" IN ('coach', 'manager', 'front-desk', 'accountant')
	ORDER BY
		"organization_id",
		"person_id",
		CASE "role"
			WHEN 'manager' THEN 1
			WHEN 'coach' THEN 2
			WHEN 'front-desk' THEN 3
			ELSE 4
		END
) AS "membership"
WHERE "staff"."organization_id" = "membership"."organization_id"
	AND "staff"."person_id" = "membership"."person_id";--> statement-breakpoint
ALTER TABLE "organization_staff_profiles" ADD CONSTRAINT "organization_staff_role_valid" CHECK ("organization_staff_profiles"."staff_role" IN ('coach', 'director', 'manager', 'front-desk', 'accountant'));--> statement-breakpoint
ALTER TABLE "organization_staff_profiles" ADD CONSTRAINT "organization_staff_classification_valid" CHECK ("organization_staff_profiles"."worker_classification" IN ('not-set', '1099-contractor', 'w2-employee'));
