/**
 * Candidate venues: places players named that Duna does not list. A
 * candidate is never public. It records where the place came from, how many
 * distinct drafts named it, and an existing venue it looks like; staff then
 * promote it to a draft venue, merge it into a venue, or dismiss it
 * (docs/product/add-score.md "From a suggested court to a listing").
 *
 * Duplicates (docs/design/website.md 2.5): the same provider place id, or
 * within 150 m with a similar name, against existing venues first and then
 * against other candidates.
 *
 * Provider content (name, address, coordinates from the maps provider) is
 * kept at most 30 days: `expireProviderContent` clears it; the place id
 * stays so staff can look it up again.
 */
import { createHash } from "node:crypto";
import {
  getDatabase,
  people,
  venueCandidates,
  venueCandidateSubmitters,
  venues,
} from "@duna/db";
import { and, asc, desc, eq, gte, isNotNull, lte, ne, sql } from "drizzle-orm";
import type {
  AddScoreCandidate,
  AddScorePlace,
  AddScoreResolveCandidateInput,
} from "../../contracts/add-score";
import {
  boundingBox,
  isLikelySamePlace,
  normalizePlaceName,
  SAME_PLACE_RADIUS_METERS,
} from "./rules";

/** How long content returned by the maps provider is kept. */
export const PROVIDER_CONTENT_DAYS = 30;

export class AddScoreCandidateError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "ALREADY_RESOLVED" | "VENUE_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "AddScoreCandidateError";
  }
}

export function submitterKeyForDraft(draftId: string): string {
  return createHash("sha256").update(`draft:${draftId}`).digest("hex");
}

interface NearbyVenue {
  readonly id: string;
  readonly name: string;
  readonly googlePlaceId: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

async function venuesNear(point: {
  latitude: number;
  longitude: number;
}): Promise<NearbyVenue[]> {
  const box = boundingBox(point, SAME_PLACE_RADIUS_METERS * 2);
  return getDatabase()
    .select({
      id: venues.id,
      name: venues.name,
      googlePlaceId: venues.googlePlaceId,
      latitude: venues.latitude,
      longitude: venues.longitude,
    })
    .from(venues)
    .where(
      and(
        gte(venues.latitude, box.south),
        lte(venues.latitude, box.north),
        gte(venues.longitude, box.west),
        lte(venues.longitude, box.east),
      ),
    )
    .limit(50);
}

/** A Duna venue that already is this provider place (by place id). */
export async function venueForPlaceId(
  placeId: string,
): Promise<{ readonly id: string; readonly name: string } | undefined> {
  const rows = await getDatabase()
    .select({ id: venues.id, name: venues.name })
    .from(venues)
    .where(and(eq(venues.googlePlaceId, placeId), ne(venues.status, "closed")))
    .limit(1);
  return rows[0];
}

async function similarVenue(place: {
  name: string;
  googlePlaceId?: string;
  latitude?: number;
  longitude?: number;
}): Promise<string | undefined> {
  if (place.latitude === undefined || place.longitude === undefined) {
    return undefined;
  }
  const nearby = await venuesNear({
    latitude: place.latitude,
    longitude: place.longitude,
  });
  return nearby.find((venue) =>
    isLikelySamePlace(
      {
        name: place.name,
        latitude: place.latitude,
        longitude: place.longitude,
      },
      // Compare by distance and name: a venue's stored place id may differ
      // from the provider's current one for the same building.
      {
        name: venue.name,
        latitude: venue.latitude,
        longitude: venue.longitude,
      },
    ),
  )?.id;
}

async function similarCandidate(place: {
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
}): Promise<string | undefined> {
  const database = getDatabase();
  if (place.latitude !== undefined && place.longitude !== undefined) {
    const box = boundingBox(
      { latitude: place.latitude, longitude: place.longitude },
      SAME_PLACE_RADIUS_METERS * 2,
    );
    const nearby = await database
      .select({
        id: venueCandidates.id,
        describedName: venueCandidates.describedName,
        providerName: venueCandidates.providerName,
        latitude: venueCandidates.latitude,
        longitude: venueCandidates.longitude,
      })
      .from(venueCandidates)
      .where(
        and(
          eq(venueCandidates.status, "pending"),
          gte(venueCandidates.latitude, box.south),
          lte(venueCandidates.latitude, box.north),
          gte(venueCandidates.longitude, box.west),
          lte(venueCandidates.longitude, box.east),
        ),
      )
      .limit(50);
    const match = nearby.find((candidate) =>
      isLikelySamePlace(
        {
          name: place.name,
          latitude: place.latitude,
          longitude: place.longitude,
        },
        {
          name: candidate.describedName ?? candidate.providerName ?? "",
          latitude: candidate.latitude,
          longitude: candidate.longitude,
        },
      ),
    );
    if (match) return match.id;
  }
  if (!place.address) return undefined;
  // No pin: the same name at the same typed address.
  const rows = await database
    .select({ id: venueCandidates.id })
    .from(venueCandidates)
    .where(
      and(
        eq(venueCandidates.status, "pending"),
        eq(venueCandidates.source, "described"),
        eq(venueCandidates.normalizedName, normalizePlaceName(place.name)),
        sql`lower(${venueCandidates.describedAddress}) = ${place.address.trim().toLowerCase()}`,
      ),
    )
    .limit(1);
  return rows[0]?.id;
}

async function recountSubmitters(candidateId: string): Promise<void> {
  await getDatabase()
    .update(venueCandidates)
    .set({
      distinctSubmitters: sql`(SELECT count(*)::int FROM ${venueCandidateSubmitters} WHERE ${venueCandidateSubmitters.candidateId} = ${candidateId})`,
      claimedSubmitters: sql`(SELECT count(*)::int FROM ${venueCandidateSubmitters} WHERE ${venueCandidateSubmitters.candidateId} = ${candidateId} AND ${venueCandidateSubmitters.personId} IS NOT NULL)`,
    })
    .where(eq(venueCandidates.id, candidateId));
}

/**
 * Where a draft's place lands: an existing venue (its provider place id is
 * already a Duna venue), or a candidate (found or new) that this draft is
 * counted towards. A Duna venue chosen in the picker needs neither.
 */
export async function recordPlaceForDraft(input: {
  readonly draftId: string;
  readonly previousCandidateId: string | null;
  readonly place: AddScorePlace;
  readonly now: Date;
}): Promise<{
  readonly venueId: string | null;
  readonly candidateId: string | null;
}> {
  const database = getDatabase();
  const submitterKey = submitterKeyForDraft(input.draftId);
  let venueId: string | null = null;
  let candidateId: string | null = null;
  const { place, now } = input;

  if (place.kind === "duna") {
    venueId = place.venueId;
  } else if (place.kind === "places") {
    const venue = await venueForPlaceId(place.placeId);
    if (venue) {
      venueId = venue.id;
    } else {
      const providerExpiry = new Date(
        now.getTime() + PROVIDER_CONTENT_DAYS * 86_400_000,
      );
      const suggestedVenueId =
        (await similarVenue({
          name: place.name,
          latitude: place.latitude,
          longitude: place.longitude,
        })) ?? null;
      const [row] = await database
        .insert(venueCandidates)
        .values({
          source: "places",
          googlePlaceId: place.placeId,
          providerName: place.name,
          providerAddress: place.address ?? null,
          providerContentExpiresAt: providerExpiry,
          latitude: place.latitude,
          longitude: place.longitude,
          normalizedName: normalizePlaceName(place.name),
          suggestedVenueId,
          firstSubmittedAt: now,
          lastSubmittedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: venueCandidates.googlePlaceId,
          targetWhere: isNotNull(venueCandidates.googlePlaceId),
          set: {
            providerName: place.name,
            providerAddress: place.address ?? null,
            providerContentExpiresAt: providerExpiry,
            latitude: place.latitude,
            longitude: place.longitude,
            normalizedName: normalizePlaceName(place.name),
            lastSubmittedAt: now,
            updatedAt: now,
          },
        })
        .returning({ id: venueCandidates.id });
      candidateId = row?.id ?? null;
    }
  } else {
    const suggestedVenueId =
      (await similarVenue({
        name: place.name,
        latitude: place.latitude,
        longitude: place.longitude,
      })) ?? null;
    const existing = await similarCandidate(place);
    if (existing) {
      await database
        .update(venueCandidates)
        .set({ lastSubmittedAt: now, updatedAt: now })
        .where(eq(venueCandidates.id, existing));
      candidateId = existing;
    } else {
      const [row] = await database
        .insert(venueCandidates)
        .values({
          source: "described",
          describedName: place.name,
          describedAddress: place.address ?? null,
          latitude: place.latitude ?? null,
          longitude: place.longitude ?? null,
          surface: place.surface ?? null,
          nets: place.nets ?? null,
          normalizedName: normalizePlaceName(place.name),
          suggestedVenueId,
          firstSubmittedAt: now,
          lastSubmittedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: venueCandidates.id });
      candidateId = row?.id ?? null;
    }
  }

  if (input.previousCandidateId && input.previousCandidateId !== candidateId) {
    await database
      .delete(venueCandidateSubmitters)
      .where(
        and(
          eq(venueCandidateSubmitters.candidateId, input.previousCandidateId),
          eq(venueCandidateSubmitters.submitterKey, submitterKey),
        ),
      );
    await recountSubmitters(input.previousCandidateId);
  }
  if (candidateId) {
    await database
      .insert(venueCandidateSubmitters)
      .values({
        candidateId,
        submitterKey,
        draftId: input.draftId,
        createdAt: now,
      })
      .onConflictDoNothing();
    await recountSubmitters(candidateId);
  }
  return { venueId, candidateId };
}

/** The draft became a match on an account: count its submitter as claimed. */
export async function markCandidateClaimed(input: {
  readonly draftId: string;
  readonly candidateId: string;
  readonly personId: string;
}): Promise<void> {
  await getDatabase()
    .update(venueCandidateSubmitters)
    .set({ personId: input.personId })
    .where(
      and(
        eq(venueCandidateSubmitters.candidateId, input.candidateId),
        eq(
          venueCandidateSubmitters.submitterKey,
          submitterKeyForDraft(input.draftId),
        ),
      ),
    );
  await recountSubmitters(input.candidateId);
}

/** Clears provider content older than 30 days; the place id is kept. */
export async function expireProviderContent(now: Date): Promise<number> {
  const rows = await getDatabase()
    .update(venueCandidates)
    .set({
      providerName: null,
      providerAddress: null,
      providerContentExpiresAt: null,
      latitude: null,
      longitude: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(venueCandidates.source, "places"),
        isNotNull(venueCandidates.providerContentExpiresAt),
        lte(venueCandidates.providerContentExpiresAt, now),
      ),
    )
    .returning({ id: venueCandidates.id });
  return rows.length;
}

export async function listCandidates(input: {
  readonly status: AddScoreCandidate["status"];
  readonly limit: number;
  readonly now: Date;
}): Promise<AddScoreCandidate[]> {
  const suggested = venues;
  const rows = await getDatabase()
    .select({
      candidate: venueCandidates,
      suggestedName: suggested.name,
    })
    .from(venueCandidates)
    .leftJoin(suggested, eq(suggested.id, venueCandidates.suggestedVenueId))
    .where(eq(venueCandidates.status, input.status))
    .orderBy(
      desc(venueCandidates.distinctSubmitters),
      desc(venueCandidates.lastSubmittedAt),
      asc(venueCandidates.id),
    )
    .limit(input.limit);
  return rows.map(({ candidate, suggestedName }) => {
    const providerExpired =
      candidate.source === "places" &&
      (!candidate.providerContentExpiresAt ||
        candidate.providerContentExpiresAt.getTime() <= input.now.getTime());
    return {
      id: candidate.id,
      source: candidate.source as AddScoreCandidate["source"],
      status: candidate.status as AddScoreCandidate["status"],
      name:
        candidate.describedName ??
        (providerExpired ? null : candidate.providerName),
      address:
        candidate.describedAddress ??
        (providerExpired ? null : candidate.providerAddress),
      googlePlaceId: candidate.googlePlaceId,
      providerContentExpired: providerExpired,
      latitude: providerExpired ? null : candidate.latitude,
      longitude: providerExpired ? null : candidate.longitude,
      surface: candidate.surface as AddScoreCandidate["surface"],
      nets: candidate.nets,
      distinctSubmitters: candidate.distinctSubmitters,
      claimedSubmitters: candidate.claimedSubmitters,
      suggestedVenue:
        candidate.suggestedVenueId && suggestedName
          ? { id: candidate.suggestedVenueId, name: suggestedName }
          : null,
      resolvedVenueId: candidate.resolvedVenueId,
      firstSubmittedAt: candidate.firstSubmittedAt.toISOString(),
      lastSubmittedAt: candidate.lastSubmittedAt.toISOString(),
    };
  });
}

function slugFrom(name: string): string {
  const base = normalizePlaceName(name).replace(/\s+/g, "-").slice(0, 48);
  return `${base || "court"}-${crypto.randomUUID().slice(0, 6)}`;
}

/**
 * Staff decide a candidate. Promote makes a DRAFT venue (never public until
 * an operator publishes it); merge points it at an existing venue; dismiss
 * records why. Each writes an audit line in the caller (router).
 */
export async function resolveCandidate(input: {
  readonly decision: AddScoreResolveCandidateInput;
  readonly reviewerPersonId: string;
  readonly now: Date;
}): Promise<{
  readonly candidateId: string;
  readonly status: AddScoreCandidate["status"];
  readonly venueId: string | null;
}> {
  const database = getDatabase();
  const { decision, now } = input;
  const [candidate] = await database
    .select()
    .from(venueCandidates)
    .where(eq(venueCandidates.id, decision.candidateId))
    .limit(1);
  if (!candidate) {
    throw new AddScoreCandidateError("NOT_FOUND", "That candidate is gone.");
  }
  if (candidate.status !== "pending") {
    if (
      candidate.status ===
      (decision.action === "promote"
        ? "promoted"
        : decision.action === "merge"
          ? "merged"
          : "dismissed")
    ) {
      return {
        candidateId: candidate.id,
        status: candidate.status as AddScoreCandidate["status"],
        venueId: candidate.resolvedVenueId,
      };
    }
    throw new AddScoreCandidateError(
      "ALREADY_RESOLVED",
      "Someone already decided this candidate.",
    );
  }
  const reviewer = await database
    .select({ id: people.id })
    .from(people)
    .where(eq(people.id, input.reviewerPersonId))
    .limit(1);
  const reviewedByPersonId = reviewer[0]?.id ?? null;
  let venueId: string | null = null;
  let status: AddScoreCandidate["status"];
  if (decision.action === "promote") {
    venueId = crypto.randomUUID();
    const providerUsable =
      candidate.providerContentExpiresAt &&
      candidate.providerContentExpiresAt.getTime() > now.getTime();
    await database.insert(venues).values({
      id: venueId,
      organizationId: decision.organizationId,
      slug: slugFrom(decision.name),
      name: decision.name,
      status: "draft",
      locationKind: "public-location",
      environment:
        candidate.surface === "indoor-sand" ||
        candidate.surface === "indoor-hardwood"
          ? "indoor"
          : "outdoor",
      googlePlaceId: candidate.googlePlaceId,
      timezone: decision.timezone,
      latitude:
        candidate.source === "described" || providerUsable
          ? candidate.latitude
          : null,
      longitude:
        candidate.source === "described" || providerUsable
          ? candidate.longitude
          : null,
      addressLine1: candidate.describedAddress ?? null,
      createdAt: now,
      updatedAt: now,
    });
    status = "promoted";
  } else if (decision.action === "merge") {
    const [venue] = await database
      .select({ id: venues.id })
      .from(venues)
      .where(eq(venues.id, decision.venueId))
      .limit(1);
    if (!venue) {
      throw new AddScoreCandidateError(
        "VENUE_NOT_FOUND",
        "That venue doesn't exist.",
      );
    }
    venueId = venue.id;
    status = "merged";
  } else {
    status = "dismissed";
  }
  const [updated] = await database
    .update(venueCandidates)
    .set({
      status,
      resolvedVenueId: venueId,
      reviewedByPersonId,
      reviewedAt: now,
      reviewNote: decision.note ?? null,
      updatedAt: now,
    })
    .where(
      and(
        eq(venueCandidates.id, candidate.id),
        eq(venueCandidates.status, "pending"),
      ),
    )
    .returning({ id: venueCandidates.id });
  if (!updated) {
    throw new AddScoreCandidateError(
      "ALREADY_RESOLVED",
      "Someone already decided this candidate.",
    );
  }
  return { candidateId: candidate.id, status, venueId };
}
