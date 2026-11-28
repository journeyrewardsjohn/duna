/**
 * Training drills (B5): which drills a person in a club can see.
 *
 * - `club`: the club's own drills (organization_id = the club, scope club).
 * - `personal`: "My drills" — only the owner sees them.
 * - `duna`: the Duna library (organization_id null, scope duna), published.
 * - purchased: drills the club (or the person) holds through a complete
 *   purchase or an active licence. Purchased drills are read-only.
 * Another club's drill is invisible: every lookup answers NOT_FOUND.
 */
import {
  getDatabase,
  trainingDrillLicenses,
  trainingDrillListings,
  trainingDrillPurchases,
  trainingDrillVersions,
  trainingDrills,
} from "@duna/db";
import { and, eq, exists, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { ApiActor } from "../../context";

export interface DrillViewer {
  readonly actor: ApiActor;
  readonly organizationId: string;
}

/** Complete purchase or active licence held by this club or this person. */
export function purchasedCondition(viewer: DrillViewer): SQL {
  return or(
    exists(
      getDatabase()
        .select({ one: sql`1` })
        .from(trainingDrillPurchases)
        .innerJoin(
          trainingDrillListings,
          eq(trainingDrillListings.id, trainingDrillPurchases.listingId),
        )
        .where(
          and(
            eq(trainingDrillListings.drillId, trainingDrills.id),
            eq(trainingDrillPurchases.status, "complete"),
            or(
              eq(trainingDrillPurchases.buyerOrganizationId, viewer.organizationId),
              eq(trainingDrillPurchases.buyerPersonId, viewer.actor.personId),
            ),
          ),
        ),
    ),
    exists(
      getDatabase()
        .select({ one: sql`1` })
        .from(trainingDrillLicenses)
        .where(
          and(
            eq(trainingDrillLicenses.drillId, trainingDrills.id),
            eq(trainingDrillLicenses.buyerOrganizationId, viewer.organizationId),
            eq(trainingDrillLicenses.status, "active"),
          ),
        ),
    ),
  )!;
}

/** Every drill this viewer may read. */
export function visibleDrillCondition(viewer: DrillViewer): SQL {
  return or(
    and(
      eq(trainingDrills.organizationId, viewer.organizationId),
      or(
        eq(trainingDrills.scope, "club"),
        and(
          eq(trainingDrills.scope, "personal"),
          eq(trainingDrills.ownerPersonId, viewer.actor.personId),
        ),
      ),
    ),
    and(
      isNull(trainingDrills.organizationId),
      eq(trainingDrills.scope, "duna"),
      eq(trainingDrills.status, "published"),
    ),
    purchasedCondition(viewer),
  )!;
}

export interface PinnedDrillVersion {
  readonly drillId: string;
  readonly drillVersionId: string;
  readonly currentVersionId: string | null;
  readonly title: string;
}

/**
 * Resolves the drill references of plan blocks to pinned versions: a block
 * that names only a drill pins its current version; a block that names a
 * version must name one of that drill's versions. Unknown or invisible
 * drills answer undefined (the caller reports NOT_FOUND).
 */
export async function pinDrillVersions(
  viewer: DrillViewer,
  refs: readonly { readonly drillId?: string; readonly drillVersionId?: string }[],
): Promise<(PinnedDrillVersion | undefined)[]> {
  const drillIds = [
    ...new Set(refs.flatMap((ref) => (ref.drillId ? [ref.drillId] : []))),
  ];
  const versionIds = [
    ...new Set(
      refs.flatMap((ref) => (ref.drillVersionId ? [ref.drillVersionId] : [])),
    ),
  ];
  if (drillIds.length === 0 && versionIds.length === 0) {
    return refs.map(() => undefined);
  }
  const versions = versionIds.length
    ? await getDatabase()
        .select({ id: trainingDrillVersions.id, drillId: trainingDrillVersions.drillId })
        .from(trainingDrillVersions)
        .where(inArray(trainingDrillVersions.id, versionIds))
    : [];
  const allDrillIds = [
    ...new Set([...drillIds, ...versions.map((version) => version.drillId)]),
  ];
  const drills = await getDatabase()
    .select({
      id: trainingDrills.id,
      title: trainingDrills.title,
      currentVersionId: trainingDrills.currentVersionId,
    })
    .from(trainingDrills)
    .where(and(inArray(trainingDrills.id, allDrillIds), visibleDrillCondition(viewer)));
  const drillById = new Map(drills.map((drill) => [drill.id, drill]));
  const versionById = new Map(versions.map((version) => [version.id, version]));
  return refs.map((ref) => {
    if (!ref.drillId && !ref.drillVersionId) return undefined;
    const version = ref.drillVersionId ? versionById.get(ref.drillVersionId) : undefined;
    if (ref.drillVersionId && !version) return undefined;
    const drillId = version?.drillId ?? ref.drillId!;
    if (ref.drillId && ref.drillId !== drillId) return undefined;
    const drill = drillById.get(drillId);
    if (!drill) return undefined;
    const pinned = version?.id ?? drill.currentVersionId;
    if (!pinned) return undefined;
    return {
      drillId,
      drillVersionId: pinned,
      currentVersionId: drill.currentVersionId,
      title: drill.title,
    };
  });
}
