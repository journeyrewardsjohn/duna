import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { getWorkOS, withAuth } from "@workos-inc/authkit-nextjs";

export interface WorkspaceOption {
  readonly id: string;
  readonly name: string;
}

export interface WorkspaceOptions {
  readonly currentOrganizationId?: string;
  readonly organizations: readonly WorkspaceOption[];
}

/** Returns only organizations the signed-in person may switch into. */
export async function loadWorkspaceOptions(): Promise<WorkspaceOptions> {
  if (!isWorkOSAuthKitConfigured()) return { organizations: [] };

  const { organizationId: currentOrganizationId, user } = await withAuth();
  if (!user) return { organizations: [] };

  const workos = getWorkOS();
  const memberships = await workos.userManagement.listOrganizationMemberships({
    userId: user.id,
  });
  const organizations = await Promise.all(
    memberships.data.map(async (membership) => {
      const organization = await workos.organizations.getOrganization(
        membership.organizationId,
      );
      return { id: organization.id, name: organization.name };
    }),
  );

  return {
    currentOrganizationId: currentOrganizationId ?? undefined,
    organizations: organizations.sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
  };
}

export async function canAccessWorkspace(
  organizationId: string,
): Promise<boolean> {
  if (!isWorkOSAuthKitConfigured()) return false;
  const { user } = await withAuth();
  if (!user) return false;

  const memberships =
    await getWorkOS().userManagement.listOrganizationMemberships({
      userId: user.id,
    });
  return memberships.data.some(
    (membership) => membership.organizationId === organizationId,
  );
}
