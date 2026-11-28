/**
 * One bookable session by id (B10): what the session detail screen and the
 * `duna://sessions/:id` link need, honouring visibility. A draft or archived
 * offering, a members-only offering for a non-member, a private
 * (invite-only) offering for someone who neither runs the club nor holds a
 * place, and anything at a system workspace are all "not found": the
 * answer never reveals that the session exists.
 */
import {
  catalogFulfillments,
  catalogItems,
  catalogPrices,
  catalogSessionOccurrences,
  catalogVariants,
  organizationMemberships,
  organizationParticipants,
  organizations,
  venues,
} from "@duna/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { SearchSession } from "../../contracts/search";
import { discoveryLocalParts } from "../../discovery-ranking";
import { ACTIVE_BOOKING_STATUSES } from "../participation/catalog";
import { sessionDiscoveryKind } from "./candidates";
import { loadSessionParticipation, type SearchDatabase } from "./participation";

type Currency = NonNullable<
  SearchSession["prices"][number]["amount"]
>["currency"];

export class SearchNotFoundError extends Error {
  constructor() {
    super("This session was not found.");
    this.name = "SearchNotFoundError";
  }
}

const SESSION_KIND = {
  "open-play": "open-play",
  clinic: "clinic",
  training: "group",
  lesson: "lesson",
} as const;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function stringField(
  configuration: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const value = configuration[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Whether this person may see a members-only or private offering. */
async function maySee(input: {
  readonly database: SearchDatabase;
  readonly visibility: string;
  readonly organizationId: string;
  readonly occurrenceId: string;
  readonly personId?: string;
}): Promise<boolean> {
  if (input.visibility === "public") return true;
  if (!input.personId) return false;
  const database = input.database;
  const [staff, participant, place] = await Promise.all([
    database
      .select({ id: organizationMemberships.id })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, input.organizationId),
          eq(organizationMemberships.personId, input.personId),
        ),
      )
      .limit(1),
    input.visibility === "members"
      ? database
          .select({ id: organizationParticipants.id })
          .from(organizationParticipants)
          .where(
            and(
              eq(organizationParticipants.organizationId, input.organizationId),
              eq(organizationParticipants.personId, input.personId),
              eq(organizationParticipants.status, "active"),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
    database
      .select({ id: catalogFulfillments.id })
      .from(catalogFulfillments)
      .where(
        and(
          eq(
            catalogFulfillments.catalogSessionOccurrenceId,
            input.occurrenceId,
          ),
          eq(catalogFulfillments.personId, input.personId),
          inArray(catalogFulfillments.status, [...ACTIVE_BOOKING_STATUSES]),
        ),
      )
      .limit(1),
  ]);
  return staff.length > 0 || participant.length > 0 || place.length > 0;
}

export async function loadSearchSession(input: {
  readonly database: SearchDatabase;
  readonly id: string;
  readonly personId?: string;
  readonly viewerTimeZone?: string;
  readonly now: Date;
}): Promise<SearchSession> {
  const database = input.database;
  const row = await database
    .select({
      occurrence: catalogSessionOccurrences,
      item: catalogItems,
      organization: {
        id: organizations.id,
        slug: organizations.slug,
        name: organizations.name,
        systemKey: organizations.systemKey,
        latitude: organizations.latitude,
        longitude: organizations.longitude,
        locality: organizations.locality,
      },
    })
    .from(catalogSessionOccurrences)
    .innerJoin(
      catalogItems,
      eq(catalogSessionOccurrences.catalogItemId, catalogItems.id),
    )
    .innerJoin(organizations, eq(catalogItems.organizationId, organizations.id))
    .where(eq(catalogSessionOccurrences.id, input.id))
    .limit(1)
    .then((rows) => rows[0]);
  if (
    !row ||
    row.item.status !== "active" ||
    row.item.type !== "service" ||
    row.organization.systemKey !== null ||
    (row.occurrence.status !== "scheduled" &&
      row.occurrence.status !== "cancelled") ||
    !(await maySee({
      database,
      visibility: row.item.visibility,
      organizationId: row.organization.id,
      occurrenceId: row.occurrence.id,
      personId: input.personId,
    }))
  ) {
    throw new SearchNotFoundError();
  }
  const { occurrence, item, organization } = row;
  const [venueRows, variantRows, participation] = await Promise.all([
    database
      .select({
        id: venues.id,
        name: venues.name,
        locality: venues.locality,
        latitude: venues.latitude,
        longitude: venues.longitude,
      })
      .from(venues)
      .where(
        and(
          eq(venues.organizationId, organization.id),
          eq(venues.status, "active"),
        ),
      )
      .orderBy(asc(venues.name))
      .limit(1),
    database
      .select({ id: catalogVariants.id })
      .from(catalogVariants)
      .where(
        and(
          eq(catalogVariants.catalogItemId, item.id),
          eq(catalogVariants.status, "active"),
        ),
      )
      .orderBy(asc(catalogVariants.title))
      .limit(1),
    loadSessionParticipation({
      database,
      subjects: [{ occurrence, item, clubName: organization.name }],
      now: input.now,
      viewerTimeZone: input.viewerTimeZone,
    }),
  ]);
  const variant = variantRows[0];
  const priceRows = variant
    ? await database
        .select()
        .from(catalogPrices)
        .where(
          and(
            eq(catalogPrices.catalogVariantId, variant.id),
            eq(catalogPrices.active, true),
          ),
        )
        .orderBy(asc(catalogPrices.createdAt))
    : [];
  const venue = venueRows[0];
  const group = participation.get(occurrence.id)!;
  const end = discoveryLocalParts(
    occurrence.endsAt.getTime(),
    occurrence.timezone,
  );
  const level =
    stringField(item.configuration, "skillLevel") ??
    stringField(item.configuration, "level");
  const kind = SESSION_KIND[sessionDiscoveryKind(item)];
  return {
    id: occurrence.id,
    catalogItemId: item.id,
    ...(variant ? { catalogVariantId: variant.id } : {}),
    title: item.title,
    sessionKind: kind,
    ...(item.shortSummary ? { summary: item.shortSummary } : {}),
    ...(level ? { level } : {}),
    path: `/clubs/${organization.slug}/products/${item.slug}?session=${occurrence.id}`,
    status: occurrence.status === "cancelled" ? "cancelled" : "scheduled",
    club: {
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
    },
    ...(venue
      ? {
          venue: {
            id: venue.id,
            name: venue.name,
            ...(venue.latitude !== null ? { latitude: venue.latitude } : {}),
            ...(venue.longitude !== null ? { longitude: venue.longitude } : {}),
            ...(venue.locality ? { locality: venue.locality } : {}),
          },
        }
      : {}),
    startsAt: occurrence.startsAt.toISOString(),
    endsAt: occurrence.endsAt.toISOString(),
    timezone: occurrence.timezone,
    local: {
      date: occurrence.localDate,
      startTime: occurrence.localTime.slice(0, 5),
      endTime: `${pad(end.hour)}:${pad(end.minute)}`,
    },
    capacity: occurrence.capacity,
    spotsLeft: group.display.numbers.spotsLeft,
    membershipRequired:
      item.membershipRequired || item.visibility === "members",
    prices: priceRows.map((price) => ({
      priceId: price.id,
      kind: price.paymentKind as "card" | "credit" | "cash",
      audience: price.audience as "everyone" | "member" | "non-member",
      ...(price.amountMinor !== null && price.currency
        ? {
            amount: {
              amountMinor: price.amountMinor,
              currency: price.currency as Currency,
            },
          }
        : {}),
      ...(price.creditAmount !== null ? { credits: price.creditAmount } : {}),
    })),
    participation: {
      displayState: group.display.state,
      display: group.display,
      copy: group.copy,
    },
    waitlist: { available: group.waitlist, waiting: group.waiting },
  };
}
