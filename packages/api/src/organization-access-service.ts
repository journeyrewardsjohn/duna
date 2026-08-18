import {
  auditLog,
  getDatabase,
  organizationMemberships,
  organizationStaffProfiles,
  organizations,
  people,
} from "@duna/db";
import { WorkOS } from "@workos-inc/node";
import { and, eq, ilike, inArray } from "drizzle-orm";
import type { ApiActor } from "./context";
import { createStaffInvitation } from "./operator-service";
import { resolveWorkOSCredentials } from "./workos-environment";

export type OrganizationAccessRole =
  "director" | "manager" | "coach" | "front-desk" | "accountant";

export class OrganizationAccessError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "CONFIGURATION" | "WORKOS",
    message: string,
  ) {
    super(message);
    this.name = "OrganizationAccessError";
  }
}

function roleScopes(role: OrganizationAccessRole): string[] {
  switch (role) {
    case "director":
      return [
        "members:read",
        "members:write",
        "sessions:read",
        "sessions:write",
        "matches:read",
        "matches:write",
        "matches:score",
        "payments:read",
        "payments:write",
        "payments:collect",
        "tickets:scan",
        "messages:read",
        "messages:write",
        "messages:propose",
        "reports:read",
      ];
    case "manager":
      return [
        "members:read",
        "members:write",
        "sessions:read",
        "sessions:write",
        "matches:read",
        "matches:write",
        "matches:score",
        "tickets:scan",
        "messages:read",
        "messages:write",
        "messages:propose",
        "reports:read",
      ];
    case "front-desk":
      return [
        "members:read",
        "sessions:read",
        "sessions:write",
        "bookings:write",
        "payments:collect",
        "tickets:scan",
        "messages:read",
        "messages:write",
      ];
    case "accountant":
      return ["sessions:read", "payments:read", "reports:read"];
    case "coach":
      return [
        "members:read",
        "sessions:read",
        "matches:read",
        "matches:write",
        "matches:score",
        "payments:collect",
        "messages:read",
        "messages:write",
        "messages:propose",
      ];
  }
}

function workOSRoleSlug(role: OrganizationAccessRole): string {
  return role === "director" ? "owner" : role;
}

async function synchronizeWorkOSMembership(input: {
  readonly workosOrganizationId?: string | null;
  readonly workosUserId?: string | null;
  readonly role: OrganizationAccessRole;
}): Promise<"synced" | "not-linked"> {
  if (!input.workosOrganizationId || !input.workosUserId) return "not-linked";
  const credentials = resolveWorkOSCredentials();
  if (!credentials) {
    throw new OrganizationAccessError(
      "CONFIGURATION",
      "WorkOS is not configured. Configure WORKOS_API_KEY and WORKOS_CLIENT_ID before assigning a linked organization user.",
    );
  }
  try {
    const workos = new WorkOS(credentials.apiKey, {
      appInfo: { name: "duna", version: "0.1.0" },
    });
    const memberships = await workos.userManagement.listOrganizationMemberships(
      {
        organizationId: input.workosOrganizationId,
        userId: input.workosUserId,
        statuses: ["active", "inactive"],
        limit: 10,
      },
    );
    const membership = memberships.data.find(
      (candidate) => candidate.userId === input.workosUserId,
    );
    if (membership) {
      await workos.userManagement.updateOrganizationMembership(membership.id, {
        roleSlug: workOSRoleSlug(input.role),
      });
    } else {
      await workos.userManagement.createOrganizationMembership({
        organizationId: input.workosOrganizationId,
        userId: input.workosUserId,
        roleSlug: workOSRoleSlug(input.role),
      });
    }
    return "synced";
  } catch (error) {
    throw new OrganizationAccessError(
      "WORKOS",
      error instanceof Error
        ? `WorkOS membership could not be synchronized: ${error.message}`
        : "WorkOS membership could not be synchronized.",
    );
  }
}

export async function grantOrganizationAccess(input: {
  readonly actor: ApiActor;
  readonly organizationId: string;
  readonly email: string;
  readonly displayName?: string;
  readonly role: OrganizationAccessRole;
  readonly workerClassification: "1099-contractor" | "w2-employee";
  readonly deliveryMode: "send" | "link-only";
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
  /** Internal platform-only path; never exposed by the public admin mutation. */
  readonly allowSystemOrganization?: boolean;
}): Promise<{
  readonly id: string;
  readonly entity: "staff-profile" | "staff-invitation";
  readonly status: "granted" | "invite-created";
  readonly privateClaimLink?: string;
  readonly workosSync: "synced" | "not-linked";
}> {
  if (!process.env.DATABASE_URL) {
    throw new OrganizationAccessError(
      "CONFIGURATION",
      "A connected Duna database is required to manage organization access.",
    );
  }
  const database = getDatabase();
  const organization = await database.query.organizations.findFirst({
    where: eq(organizations.id, input.organizationId),
  });
  if (!organization) {
    throw new OrganizationAccessError(
      "NOT_FOUND",
      "Organization was not found.",
    );
  }
  if (organization.systemKey && !input.allowSystemOrganization) {
    throw new OrganizationAccessError(
      "NOT_FOUND",
      "System workspaces cannot receive organization access through this route.",
    );
  }
  const email = input.email.trim().toLowerCase();
  const person = await database.query.people.findFirst({
    where: ilike(people.email, email),
  });
  if (!person) {
    if (!input.displayName?.trim()) {
      throw new OrganizationAccessError(
        "CONFIGURATION",
        "Enter a name to create an invitation for a new Duna user.",
      );
    }
    const invitation = await createStaffInvitation({
      actor: { ...input.actor, organizationId: input.organizationId },
      invitedName: input.displayName.trim(),
      invitedEmail: email,
      role: input.role,
      workerClassification: input.workerClassification,
      preferredChannel: "email",
      deliveryMode: input.deliveryMode,
      allowDirector: true,
      confirmed: true,
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      now: input.now,
    });
    return {
      id: invitation.id,
      entity: "staff-invitation",
      status: "invite-created",
      privateClaimLink: invitation.privateClaimLink,
      workosSync: "not-linked",
    };
  }

  const workosSync = await synchronizeWorkOSMembership({
    workosOrganizationId: organization.workosOrganizationId,
    workosUserId: person.workosUserId,
    role: input.role,
  });
  const membershipRole = input.role === "director" ? "owner" : input.role;
  await database.transaction(async (transaction) => {
    await transaction
      .update(organizationMemberships)
      .set({ active: false, updatedAt: input.now })
      .where(
        and(
          eq(organizationMemberships.organizationId, organization.id),
          eq(organizationMemberships.personId, person.id),
          inArray(organizationMemberships.role, [
            "owner",
            "manager",
            "coach",
            "front-desk",
            "accountant",
            "scorekeeper",
          ]),
        ),
      );
    await transaction
      .insert(organizationMemberships)
      .values({
        organizationId: organization.id,
        personId: person.id,
        role: membershipRole,
        scopes: roleScopes(input.role),
        active: true,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: [
          organizationMemberships.organizationId,
          organizationMemberships.personId,
          organizationMemberships.role,
        ],
        set: {
          scopes: roleScopes(input.role),
          active: true,
          updatedAt: input.now,
        },
      });
    await transaction
      .insert(organizationStaffProfiles)
      .values({
        organizationId: organization.id,
        personId: person.id,
        staffRole: input.role,
        workerClassification: input.workerClassification,
        active: true,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: [
          organizationStaffProfiles.organizationId,
          organizationStaffProfiles.personId,
        ],
        set: {
          staffRole: input.role,
          workerClassification: input.workerClassification,
          active: true,
          updatedAt: input.now,
        },
      });
    await transaction.insert(auditLog).values({
      organizationId: organization.id,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "admin.organization-access.granted",
      entityType: "organization-membership",
      entityId: person.id,
      reason: `Super Admin assigned ${person.displayName} the ${input.role} role. WorkOS sync: ${workosSync}.`,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return {
    id: person.id,
    entity: "staff-profile",
    status: "granted",
    workosSync,
  };
}
