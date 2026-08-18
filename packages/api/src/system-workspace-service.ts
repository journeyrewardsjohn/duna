import { getDatabase, organizations } from "@duna/db";
import { and, eq, inArray, isNotNull } from "drizzle-orm";

/**
 * System workspaces are WorkOS identity boundaries, never Duna tenants. Keep
 * their provider IDs out of normal workspace selectors and context switching.
 */
export async function systemWorkspaceWorkOSIds(
  workosOrganizationIds: readonly string[],
): Promise<ReadonlySet<string>> {
  if (!process.env.DATABASE_URL || workosOrganizationIds.length === 0) {
    return new Set();
  }

  const rows = await getDatabase()
    .select({ workosOrganizationId: organizations.workosOrganizationId })
    .from(organizations)
    .where(
      and(
        isNotNull(organizations.systemKey),
        inArray(organizations.workosOrganizationId, workosOrganizationIds),
      ),
    );
  return new Set(
    rows.flatMap((row) =>
      row.workosOrganizationId ? [row.workosOrganizationId] : [],
    ),
  );
}

export async function isSystemWorkspaceWorkOSId(
  workosOrganizationId: string,
): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const organization = await getDatabase().query.organizations.findFirst({
    columns: { systemKey: true },
    where: eq(organizations.workosOrganizationId, workosOrganizationId),
  });
  return Boolean(organization?.systemKey);
}
