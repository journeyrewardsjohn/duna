import type { PersonRole } from "@duna/core";
import { demoOrganization } from "@duna/core/demo";
import {
  auditLog,
  getDatabase,
  getTransactionalDatabase,
  organizationMemberships,
  organizations,
  organizationStaffProfiles,
} from "@duna/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { stableHash } from "./canonical";
import type { PlayerOrganizationAccess } from "./contracts";
import type { ApiActor } from "./context";

type StaffRole = NonNullable<
  PlayerOrganizationAccess["organizations"][number]["staff"]
>["role"];

export interface PlayerOrganizationMembershipRow {
  readonly organizationId: string;
  readonly organizationSlug: string;
  readonly organizationName: string;
  readonly membershipRole: PersonRole;
  readonly staffActive: boolean | null;
  readonly staffRole: string | null;
}

const coachScopes = [
  "members:read",
  "sessions:read",
  "sessions:write",
  "matches:read",
  "matches:write",
  "matches:score",
  "messages:propose",
  "reports:read",
] as const;

export class PlayerOrganizationError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "ORGANIZATION_REQUIRED"
      | "MEMBERSHIP_REQUIRED"
      | "ADMIN_REQUIRED",
    message: string,
  ) {
    super(message);
    this.name = "PlayerOrganizationError";
  }
}

function isStaffRole(value: string | null): value is StaffRole {
  return (
    value === "coach" ||
    value === "director" ||
    value === "manager" ||
    value === "front-desk" ||
    value === "accountant"
  );
}

export function buildPlayerOrganizationAccess(
  actor: ApiActor,
  rows: readonly PlayerOrganizationMembershipRow[],
): PlayerOrganizationAccess {
  const grouped = new Map<
    string,
    {
      id: string;
      slug: string;
      name: string;
      roles: Set<PersonRole>;
      staff?: { active: boolean; role: StaffRole };
    }
  >();

  for (const row of rows) {
    const current = grouped.get(row.organizationId) ?? {
      id: row.organizationId,
      slug: row.organizationSlug,
      name: row.organizationName,
      roles: new Set<PersonRole>(),
    };
    current.roles.add(row.membershipRole);
    if (isStaffRole(row.staffRole)) {
      current.staff = {
        active: row.staffActive ?? false,
        role: row.staffRole,
      };
    }
    grouped.set(row.organizationId, current);
  }

  return {
    activeOrganizationId: actor.organizationId,
    organizations: [...grouped.values()].map((organization) => {
      const roles = [...organization.roles];
      const canManage = roles.includes("owner") || roles.includes("manager");
      const isActive = organization.id === actor.organizationId;
      return {
        id: organization.id,
        slug: organization.slug,
        name: organization.name,
        roles,
        isActive,
        canManage,
        canSelfEnroll:
          isActive && canManage && organization.staff?.active !== true,
        staff: organization.staff,
      };
    }),
  };
}

export async function loadPlayerOrganizationAccess(
  actor: ApiActor,
): Promise<PlayerOrganizationAccess> {
  if (!process.env.DATABASE_URL) {
    return actor.isDemo
      ? {
          activeOrganizationId: demoOrganization.id,
          organizations: [
            {
              id: demoOrganization.id,
              slug: demoOrganization.slug,
              name: demoOrganization.name,
              roles: ["manager", "coach"],
              isActive: true,
              canManage: true,
              canSelfEnroll: false,
              staff: { active: true, role: "director" },
            },
          ],
        }
      : { organizations: [] };
  }

  const rows = await getDatabase()
    .select({
      organizationId: organizations.id,
      organizationSlug: organizations.slug,
      organizationName: organizations.name,
      membershipRole: organizationMemberships.role,
      staffActive: organizationStaffProfiles.active,
      staffRole: organizationStaffProfiles.staffRole,
    })
    .from(organizationMemberships)
    .innerJoin(
      organizations,
      eq(organizationMemberships.organizationId, organizations.id),
    )
    .leftJoin(
      organizationStaffProfiles,
      and(
        eq(
          organizationStaffProfiles.organizationId,
          organizationMemberships.organizationId,
        ),
        eq(
          organizationStaffProfiles.personId,
          organizationMemberships.personId,
        ),
      ),
    )
    .where(
      and(
        eq(organizationMemberships.personId, actor.personId),
        eq(organizationMemberships.active, true),
      ),
    )
    .orderBy(asc(organizations.name));

  return buildPlayerOrganizationAccess(actor, rows);
}

export async function validatePlayerOrganizationSelection(input: {
  readonly actor: ApiActor;
  readonly organizationId: string;
}): Promise<{ readonly organizationId: string }> {
  if (!process.env.DATABASE_URL) {
    if (input.actor.isDemo && input.organizationId === demoOrganization.id) {
      return { organizationId: input.organizationId };
    }
    throw new PlayerOrganizationError(
      "DATABASE_REQUIRED",
      "Organization switching requires the connected Duna database.",
    );
  }
  const membership =
    await getDatabase().query.organizationMemberships.findFirst({
      where: and(
        eq(organizationMemberships.organizationId, input.organizationId),
        eq(organizationMemberships.personId, input.actor.personId),
        eq(organizationMemberships.active, true),
      ),
    });
  if (!membership) {
    throw new PlayerOrganizationError(
      "MEMBERSHIP_REQUIRED",
      "You no longer have access to this organization.",
    );
  }
  return { organizationId: input.organizationId };
}

export async function selfEnrollOrganizationStaff(input: {
  readonly actor: ApiActor;
  readonly staffRole: "coach" | "director";
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{
  readonly id: string;
  readonly entity: "staff-profile";
  readonly status: "active";
}> {
  if (!process.env.DATABASE_URL) {
    throw new PlayerOrganizationError(
      "DATABASE_REQUIRED",
      "Team setup requires the connected Duna database.",
    );
  }
  if (!input.actor.organizationId) {
    throw new PlayerOrganizationError(
      "ORGANIZATION_REQUIRED",
      "Choose an organization before joining its team.",
    );
  }

  const database = getDatabase();
  const administrator = await database.query.organizationMemberships.findFirst({
    where: and(
      eq(organizationMemberships.organizationId, input.actor.organizationId),
      eq(organizationMemberships.personId, input.actor.personId),
      eq(organizationMemberships.active, true),
      inArray(organizationMemberships.role, ["owner", "manager"]),
    ),
  });
  if (!administrator) {
    throw new PlayerOrganizationError(
      "ADMIN_REQUIRED",
      "Organization admin access is required to add yourself to the working team.",
    );
  }

  const existing = await database.query.organizationStaffProfiles.findFirst({
    where: and(
      eq(organizationStaffProfiles.organizationId, input.actor.organizationId),
      eq(organizationStaffProfiles.personId, input.actor.personId),
    ),
  });
  const staffProfileId = existing?.id ?? crypto.randomUUID();

  const transactionalDatabase = getTransactionalDatabase();
  await transactionalDatabase.transaction(async (transaction) => {
    await transaction
      .insert(organizationStaffProfiles)
      .values({
        id: staffProfileId,
        organizationId: input.actor.organizationId!,
        personId: input.actor.personId,
        staffRole: input.staffRole,
        workerClassification: "not-set",
        active: true,
      })
      .onConflictDoUpdate({
        target: [
          organizationStaffProfiles.organizationId,
          organizationStaffProfiles.personId,
        ],
        set: {
          staffRole: input.staffRole,
          active: true,
          updatedAt: input.now,
        },
      });
    await transaction
      .insert(organizationMemberships)
      .values({
        organizationId: input.actor.organizationId!,
        personId: input.actor.personId,
        role: "coach",
        scopes: [...coachScopes],
        active: true,
      })
      .onConflictDoUpdate({
        target: [
          organizationMemberships.organizationId,
          organizationMemberships.personId,
          organizationMemberships.role,
        ],
        set: {
          scopes: [...coachScopes],
          active: true,
          updatedAt: input.now,
        },
      });
    await transaction.insert(auditLog).values({
      organizationId: input.actor.organizationId!,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: existing
        ? "staff-profile.self-reactivated"
        : "staff-profile.self-enrolled",
      entityType: "staff-profile",
      entityId: staffProfileId,
      beforeHash: existing ? stableHash(existing) : undefined,
      afterHash: stableHash({
        personId: input.actor.personId,
        staffRole: input.staffRole,
        active: true,
      }),
      reason:
        "Organization administrator explicitly added themself to the schedulable working team without changing ownership access.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });

  return { id: staffProfileId, entity: "staff-profile", status: "active" };
}
