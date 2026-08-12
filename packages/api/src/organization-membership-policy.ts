import {
  catalogItems,
  courts,
  getDatabase,
  scheduleBlocks,
  schedules,
  venues,
} from "@duna/db";
import { and, eq, inArray, ne, or } from "drizzle-orm";

export async function organizationHasActiveMembershipOffer(
  organizationId: string,
): Promise<boolean> {
  const membership = await getDatabase().query.catalogItems.findFirst({
    columns: { id: true },
    where: and(
      eq(catalogItems.organizationId, organizationId),
      eq(catalogItems.type, "plan"),
      eq(catalogItems.subtype, "membership"),
      eq(catalogItems.status, "active"),
    ),
  });
  return Boolean(membership);
}

export async function requireActiveMembershipOffer(
  organizationId: string,
): Promise<void> {
  if (await organizationHasActiveMembershipOffer(organizationId)) return;
  throw new Error(
    "Publish a membership plan before making products or courts members only.",
  );
}

export async function requireMembershipOfferCanDeactivate(
  organizationId: string,
  membershipCatalogItemId: string,
): Promise<void> {
  const database = getDatabase();
  const replacement = await database.query.catalogItems.findFirst({
    columns: { id: true },
    where: and(
      eq(catalogItems.organizationId, organizationId),
      ne(catalogItems.id, membershipCatalogItemId),
      eq(catalogItems.type, "plan"),
      eq(catalogItems.subtype, "membership"),
      eq(catalogItems.status, "active"),
    ),
  });
  if (replacement) return;

  const [memberProduct, memberCourt, memberSchedule] = await Promise.all([
    database.query.catalogItems.findFirst({
      columns: { id: true },
      where: and(
        eq(catalogItems.organizationId, organizationId),
        ne(catalogItems.id, membershipCatalogItemId),
        eq(catalogItems.status, "active"),
        or(
          eq(catalogItems.membershipRequired, true),
          eq(catalogItems.visibility, "members"),
        ),
      ),
    }),
    database
      .select({ id: courts.id })
      .from(courts)
      .innerJoin(venues, eq(courts.venueId, venues.id))
      .where(
        and(
          eq(venues.organizationId, organizationId),
          inArray(courts.bookingPolicy, ["members", "tiers"]),
        ),
      )
      .limit(1),
    database
      .select({ id: scheduleBlocks.id })
      .from(scheduleBlocks)
      .innerJoin(schedules, eq(scheduleBlocks.scheduleId, schedules.id))
      .where(
        and(
          eq(schedules.organizationId, organizationId),
          eq(scheduleBlocks.mode, "members-only"),
        ),
      )
      .limit(1),
  ]);
  if (!memberProduct && memberCourt.length === 0 && memberSchedule.length === 0)
    return;
  throw new Error(
    "Make every members-only product, court, and schedule public before unpublishing the last membership plan.",
  );
}
