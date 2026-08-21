ALTER TABLE "organization_staff_invitations" DROP CONSTRAINT "organization_staff_invitation_destination_present";--> statement-breakpoint
-- A claim token is itself a secure delivery destination. Private-link invites
-- therefore do not need an email address or telephone number.
INSERT INTO "organization_staff_profiles" (
  "organization_id",
  "person_id",
  "staff_role",
  "worker_classification",
  "compensation_model",
  "currency",
  "country_code",
  "availability",
  "active",
  "created_at",
  "updated_at"
)
SELECT
  "organization_id",
  "person_id",
  'director',
  'not-set',
  'not-set',
  'USD',
  'US',
  '[]'::jsonb,
  true,
  NOW(),
  NOW()
FROM "organization_memberships"
WHERE "role" = 'owner' AND "active" = true
ON CONFLICT ("organization_id", "person_id") DO UPDATE
SET
  "staff_role" = 'director',
  "active" = true,
  "updated_at" = NOW();--> statement-breakpoint
-- Earlier builds allowed a Director invitation to create another owner. Keep
-- the earliest owner and turn every additional owner into an active Director
-- (manager membership plus Director scopes) before enforcing the new rule.
WITH ranked_owners AS (
  SELECT
    "id",
    "organization_id",
    "person_id",
    ROW_NUMBER() OVER (
      PARTITION BY "organization_id"
      ORDER BY "joined_at" ASC, "created_at" ASC, "id" ASC
    ) AS owner_rank
  FROM "organization_memberships"
  WHERE "role" = 'owner' AND "active" = true
)
UPDATE "organization_memberships" AS manager
SET
  "scopes" = ARRAY[
    'members:read',
    'members:write',
    'sessions:read',
    'sessions:write',
    'training:read',
    'training:write',
    'matches:read',
    'matches:write',
    'matches:score',
    'payments:read',
    'payments:write',
    'payments:collect',
    'tickets:scan',
    'messages:read',
    'messages:write',
    'messages:propose',
    'reports:read'
  ]::text[],
  "active" = true,
  "updated_at" = NOW()
FROM ranked_owners AS extra_owner
WHERE extra_owner.owner_rank > 1
  AND manager."organization_id" = extra_owner."organization_id"
  AND manager."person_id" = extra_owner."person_id"
  AND manager."role" = 'manager';--> statement-breakpoint
WITH ranked_owners AS (
  SELECT
    "id",
    "organization_id",
    "person_id",
    ROW_NUMBER() OVER (
      PARTITION BY "organization_id"
      ORDER BY "joined_at" ASC, "created_at" ASC, "id" ASC
    ) AS owner_rank
  FROM "organization_memberships"
  WHERE "role" = 'owner' AND "active" = true
)
DELETE FROM "organization_memberships" AS owner
USING "organization_memberships" AS manager, ranked_owners AS extra_owner
WHERE owner."id" = extra_owner."id"
  AND extra_owner.owner_rank > 1
  AND manager."organization_id" = extra_owner."organization_id"
  AND manager."person_id" = extra_owner."person_id"
  AND manager."role" = 'manager';--> statement-breakpoint
WITH ranked_owners AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "organization_id"
      ORDER BY "joined_at" ASC, "created_at" ASC, "id" ASC
    ) AS owner_rank
  FROM "organization_memberships"
  WHERE "role" = 'owner' AND "active" = true
)
UPDATE "organization_memberships" AS owner
SET
  "role" = 'manager',
  "scopes" = ARRAY[
    'members:read',
    'members:write',
    'sessions:read',
    'sessions:write',
    'training:read',
    'training:write',
    'matches:read',
    'matches:write',
    'matches:score',
    'payments:read',
    'payments:write',
    'payments:collect',
    'tickets:scan',
    'messages:read',
    'messages:write',
    'messages:propose',
    'reports:read'
  ]::text[],
  "updated_at" = NOW()
FROM ranked_owners AS extra_owner
WHERE owner."id" = extra_owner."id"
  AND extra_owner.owner_rank > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_active_owner_unique" ON "organization_memberships" USING btree ("organization_id") WHERE "organization_memberships"."role" = 'owner' AND "organization_memberships"."active" = true;
