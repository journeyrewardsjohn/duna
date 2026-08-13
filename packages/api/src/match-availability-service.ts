import {
  auditLog,
  getDatabase,
  matchAvailabilityPosts,
  people,
} from "@duna/db";
import { and, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import { loadAttendanceReliability } from "./attendance-service";
import type {
  MatchAvailabilityCandidate,
  MatchAvailabilityPost,
} from "./contracts";
import type { ApiActor } from "./context";
import { loadPeople } from "./database-repository";

const formats = ["2s", "3s", "4s", "6s", "king-queen"] as const;
type MatchFormat = (typeof formats)[number];

function postStatus(
  status: string,
  endsAt: Date,
  now: Date,
): MatchAvailabilityPost["status"] {
  return status === "active" && endsAt <= now
    ? "expired"
    : status === "active" ||
        status === "paused" ||
        status === "matched" ||
        status === "cancelled"
      ? status
      : "cancelled";
}

function serializePost(
  row: typeof matchAvailabilityPosts.$inferSelect,
  now: Date,
): MatchAvailabilityPost {
  return {
    id: row.id,
    personId: row.personId,
    venueId: row.venueId ?? undefined,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    matchType:
      row.matchType === "competitive" || row.matchType === "casual"
        ? row.matchType
        : "either",
    genderPreference:
      row.genderPreference === "mens" ||
      row.genderPreference === "womens" ||
      row.genderPreference === "mixed"
        ? row.genderPreference
        : "open",
    formatPreferences: row.formatPreferences.filter(
      (value): value is MatchFormat => formats.includes(value as MatchFormat),
    ),
    ratingMinimum: row.ratingMinimum ?? undefined,
    ratingMaximum: row.ratingMaximum ?? undefined,
    note: row.note ?? undefined,
    status: postStatus(row.status, row.endsAt, now),
  };
}

function validateWindow(startsAt: Date, endsAt: Date, now: Date) {
  if (startsAt < new Date(now.getTime() - 5 * 60_000)) {
    throw new Error("Looking-to-play availability must start in the future.");
  }
  if (endsAt <= startsAt) {
    throw new Error("Availability must end after it starts.");
  }
  if (endsAt.getTime() - startsAt.getTime() > 12 * 60 * 60_000) {
    throw new Error("A looking-to-play window can be at most 12 hours.");
  }
  if (startsAt.getTime() - now.getTime() > 30 * 24 * 60 * 60_000) {
    throw new Error(
      "Looking-to-play availability can be posted 30 days ahead.",
    );
  }
}

export async function createMatchAvailabilityPost(input: {
  readonly actor: ApiActor;
  readonly venueId?: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly matchType: "either" | "competitive" | "casual";
  readonly genderPreference: "open" | "mens" | "womens" | "mixed";
  readonly formatPreferences: readonly MatchFormat[];
  readonly ratingMinimum?: number;
  readonly ratingMaximum?: number;
  readonly note?: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<MatchAvailabilityPost> {
  validateWindow(input.startsAt, input.endsAt, input.now);
  if (
    (input.ratingMinimum === undefined) !==
      (input.ratingMaximum === undefined) ||
    (input.ratingMinimum !== undefined &&
      input.ratingMaximum !== undefined &&
      input.ratingMaximum < input.ratingMinimum)
  ) {
    throw new Error("Choose both ends of a valid rating range.");
  }
  const database = getDatabase();
  const person = await database.query.people.findFirst({
    where: and(
      eq(people.id, input.actor.personId),
      eq(people.status, "active"),
      eq(people.isMinor, false),
      eq(people.profileVisibility, "public"),
    ),
  });
  if (!person) {
    throw new Error(
      "Looking to play is available to adult players with a public Duna profile.",
    );
  }
  const existing = await database.query.matchAvailabilityPosts.findFirst({
    where: and(
      eq(matchAvailabilityPosts.personId, input.actor.personId),
      eq(matchAvailabilityPosts.status, "active"),
      eq(matchAvailabilityPosts.startsAt, input.startsAt),
      eq(matchAvailabilityPosts.endsAt, input.endsAt),
      input.venueId
        ? eq(matchAvailabilityPosts.venueId, input.venueId)
        : isNull(matchAvailabilityPosts.venueId),
    ),
  });
  if (existing) return serializePost(existing, input.now);
  const row = (
    await database
      .insert(matchAvailabilityPosts)
      .values({
        personId: input.actor.personId,
        venueId: input.venueId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        matchType: input.matchType,
        genderPreference: input.genderPreference,
        formatPreferences: [...new Set(input.formatPreferences)],
        ratingMinimum: input.ratingMinimum,
        ratingMaximum: input.ratingMaximum,
        note: input.note?.trim() || undefined,
      })
      .returning()
  )[0];
  if (!row) throw new Error("Could not publish looking-to-play availability.");
  await database.insert(auditLog).values({
    organizationId: input.actor.organizationId,
    actorPersonId: input.actor.personId,
    actorType: "person",
    action: "match-availability.created",
    entityType: "match-availability",
    entityId: row.id,
    reason: "Player explicitly opted in to looking-to-play discovery.",
    traceId: input.requestId,
    ipAddress: input.ipAddress,
    createdAt: input.now,
  });
  return serializePost(row, input.now);
}

export async function cancelMatchAvailabilityPost(input: {
  readonly actor: ApiActor;
  readonly postId: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<MatchAvailabilityPost> {
  const database = getDatabase();
  const row = (
    await database
      .update(matchAvailabilityPosts)
      .set({ status: "cancelled", updatedAt: input.now })
      .where(
        and(
          eq(matchAvailabilityPosts.id, input.postId),
          eq(matchAvailabilityPosts.personId, input.actor.personId),
          inArray(matchAvailabilityPosts.status, ["active", "paused"]),
        ),
      )
      .returning()
  )[0];
  if (!row)
    throw new Error("Active looking-to-play availability was not found.");
  await database.insert(auditLog).values({
    organizationId: input.actor.organizationId,
    actorPersonId: input.actor.personId,
    actorType: "person",
    action: "match-availability.cancelled",
    entityType: "match-availability",
    entityId: row.id,
    reason: "Player withdrew looking-to-play availability.",
    traceId: input.requestId,
    ipAddress: input.ipAddress,
    createdAt: input.now,
  });
  return serializePost(row, input.now);
}

export async function loadOwnMatchAvailability(input: {
  readonly actor: ApiActor;
  readonly now: Date;
}): Promise<readonly MatchAvailabilityPost[]> {
  const rows = await getDatabase()
    .select()
    .from(matchAvailabilityPosts)
    .where(
      and(
        eq(matchAvailabilityPosts.personId, input.actor.personId),
        gt(matchAvailabilityPosts.endsAt, input.now),
        inArray(matchAvailabilityPosts.status, ["active", "paused"]),
      ),
    );
  return rows.map((row) => serializePost(row, input.now));
}

export async function loadMatchAvailabilityCandidates(input: {
  readonly actor: ApiActor;
  readonly venueId?: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly matchType: "competitive" | "casual";
  readonly genderPreference: "open" | "mens" | "womens" | "mixed";
  readonly format: MatchFormat;
  readonly now: Date;
}): Promise<readonly MatchAvailabilityCandidate[]> {
  validateWindow(input.startsAt, input.endsAt, input.now);
  const database = getDatabase();
  const rows = await database
    .select({ post: matchAvailabilityPosts })
    .from(matchAvailabilityPosts)
    .innerJoin(people, eq(matchAvailabilityPosts.personId, people.id))
    .where(
      and(
        eq(matchAvailabilityPosts.status, "active"),
        gt(matchAvailabilityPosts.endsAt, input.startsAt),
        lt(matchAvailabilityPosts.startsAt, input.endsAt),
        input.venueId
          ? or(
              eq(matchAvailabilityPosts.venueId, input.venueId),
              isNull(matchAvailabilityPosts.venueId),
            )
          : isNull(matchAvailabilityPosts.venueId),
        or(
          eq(matchAvailabilityPosts.matchType, "either"),
          eq(matchAvailabilityPosts.matchType, input.matchType),
        ),
        eq(people.status, "active"),
        eq(people.isMinor, false),
        eq(people.profileVisibility, "public"),
      ),
    );
  const compatibleByPerson = new Map<string, (typeof rows)[number]>();
  for (const candidate of rows) {
    const { post } = candidate;
    const formatsMatch =
      post.formatPreferences.length === 0 ||
      post.formatPreferences.includes(input.format);
    const genderMatches =
      post.genderPreference === "open" ||
      post.genderPreference === input.genderPreference;
    if (
      post.personId === input.actor.personId ||
      !formatsMatch ||
      !genderMatches
    ) {
      continue;
    }
    const existingCandidate = compatibleByPerson.get(post.personId);
    const overlap =
      Math.min(post.endsAt.getTime(), input.endsAt.getTime()) -
      Math.max(post.startsAt.getTime(), input.startsAt.getTime());
    const existingOverlap = existingCandidate
      ? Math.min(
          existingCandidate.post.endsAt.getTime(),
          input.endsAt.getTime(),
        ) -
        Math.max(
          existingCandidate.post.startsAt.getTime(),
          input.startsAt.getTime(),
        )
      : -1;
    if (!existingCandidate || overlap > existingOverlap) {
      compatibleByPerson.set(post.personId, candidate);
    }
  }
  const compatible = [...compatibleByPerson.values()];
  const personIds = [...new Set(compatible.map(({ post }) => post.personId))];
  const [profiles, reliability] = await Promise.all([
    loadPeople(personIds),
    loadAttendanceReliability({ personIds }),
  ]);
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  return compatible.flatMap(({ post }) => {
    const person = profileById.get(post.personId);
    if (!person) return [];
    const overlapStartsAt = new Date(
      Math.max(post.startsAt.getTime(), input.startsAt.getTime()),
    );
    const overlapEndsAt = new Date(
      Math.min(post.endsAt.getTime(), input.endsAt.getTime()),
    );
    return [
      {
        postId: post.id,
        person,
        overlapStartsAt: overlapStartsAt.toISOString(),
        overlapEndsAt: overlapEndsAt.toISOString(),
        note: post.note ?? undefined,
        matchType:
          post.matchType === "competitive" || post.matchType === "casual"
            ? post.matchType
            : "either",
        formatPreferences: post.formatPreferences.filter(
          (value): value is MatchFormat =>
            formats.includes(value as MatchFormat),
        ),
        reliability: reliability.get(post.personId) ?? {
          label: "new" as const,
          tracked: 0,
          attended: 0,
          noShows: 0,
        },
      },
    ];
  });
}

export async function markAvailabilityMatched(input: {
  readonly personIds: readonly string[];
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly now: Date;
}) {
  if (input.personIds.length === 0) return;
  await getDatabase()
    .update(matchAvailabilityPosts)
    .set({ status: "matched", updatedAt: input.now })
    .where(
      and(
        inArray(matchAvailabilityPosts.personId, [...input.personIds]),
        eq(matchAvailabilityPosts.status, "active"),
        gt(matchAvailabilityPosts.endsAt, input.startsAt),
        lt(matchAvailabilityPosts.startsAt, input.endsAt),
      ),
    );
}
