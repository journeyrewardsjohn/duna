import {
  auditLog,
  calendarBusyBlocks,
  calendarChangeProposals,
  calendarConnections,
  catalogEntitlements,
  catalogFulfillments,
  catalogItems,
  catalogMedia,
  catalogOptions,
  catalogPrices,
  catalogVariants,
  courtBookings,
  courts,
  getDatabase,
  inventoryLocations,
  inventoryMovements,
  inventoryStockItems,
  ledgerAccounts,
  ledgerEntries,
  ledgerJournals,
  ledgerReconciliations,
  membershipTiers,
  memberships,
  organizationCreditGrants,
  organizationMemberships,
  organizationParticipants,
  organizationThemes,
  organizationWallets,
  organizations,
  orderItems,
  orders,
  people,
  programs,
  registrations,
  refundRecords,
  resourceReservations,
  sessions,
  venues,
  eventTypes,
} from "@duna/db";
import {
  assertBalancedJournal,
  reverseLedgerPostings,
  type LedgerPosting,
} from "@duna/core";
import { and, asc, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { stableHash } from "./canonical";
import type {
  OperatorMutationResult,
  OperatorWorkspace,
  PublicOrganizationStorefront,
} from "./contracts";
import type { ApiActor } from "./context";
import { getStripeClient, isStripeConfigured, refundPayment } from "./payments";

type CatalogItemType = OperatorWorkspace["catalog"][number]["type"];
type CatalogItemSubtype = string;
type CatalogPaymentKind =
  OperatorWorkspace["catalog"][number]["variants"][number]["prices"][number]["paymentKind"];

const DEFAULT_THEME: OperatorWorkspace["theme"] = {
  palette: {
    primary: "#173A63",
    accent: "#2B67A4",
    sand: "#E9DFC9",
    ink: "#101828",
    canvas: "#FAFAF7",
  },
  typography: {
    heading: "Instrument Sans",
    body: "Archivo",
  },
  cardStyle: "soft",
  profileLayout: "editorial",
};

function requireDatabase(): void {
  if (!process.env.DATABASE_URL) {
    throw new Error("Catalog changes require the connected Duna database.");
  }
}

function requireOrganization(actor: ApiActor): string {
  if (!actor.organizationId) {
    throw new Error("An organization context is required.");
  }
  return actor.organizationId;
}

function slugBase(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replaceAll(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/(^-|-$)/g, "")
      .slice(0, 84) || "item"
  );
}

async function uniqueCatalogSlug(
  organizationId: string,
  value: string,
): Promise<string> {
  const base = slugBase(value);
  const existing = await getDatabase().query.catalogItems.findFirst({
    where: and(
      eq(catalogItems.organizationId, organizationId),
      eq(catalogItems.slug, base),
    ),
  });
  return existing ? `${base}-${crypto.randomUUID().slice(0, 7)}` : base;
}

function defaultFulfillment(type: CatalogItemType, subtype: string): string {
  if (type === "event") return "registration";
  if (type === "service") return "appointment";
  if (type === "good") {
    return subtype === "rental" ? "rental" : "pickup-or-shipping";
  }
  return subtype === "credit-pack" ? "credit-grant" : "membership";
}

function optionCode(value: string): string {
  return slugBase(value).replaceAll("-", "_").slice(0, 48);
}

function variantMatrix(
  options: readonly {
    readonly name: string;
    readonly values: readonly string[];
  }[],
): readonly Record<string, string>[] {
  if (options.length === 0) return [{}];
  let matrix: readonly Record<string, string>[] = [{}];
  for (const option of options) {
    const code = optionCode(option.name);
    const values = [
      ...new Set(option.values.map((value) => value.trim()).filter(Boolean)),
    ];
    if (!code || values.length === 0) {
      throw new Error(
        "Every product option needs a name and at least one value.",
      );
    }
    matrix = matrix.flatMap((coordinates) =>
      values.map((value) => ({ ...coordinates, [code]: value })),
    );
    if (matrix.length > 500) {
      throw new Error(
        "This option matrix creates more than 500 variants. Split it into smaller batches.",
      );
    }
  }
  return matrix;
}

function variantTitle(
  itemTitle: string,
  coordinates: Readonly<Record<string, string>>,
): string {
  const values = Object.values(coordinates);
  return values.length === 0
    ? "Default"
    : `${itemTitle} · ${values.join(" / ")}`;
}

function calculateBookValue(input: {
  readonly unitCostMinor?: number;
  readonly quantityOnHand: number;
  readonly placedInServiceAt?: string;
  readonly acquiredAt?: string;
  readonly depreciationMethod?: string;
  readonly usefulLifeMonths?: number;
  readonly salvageValueMinor?: number;
  readonly now: Date;
}): number | undefined {
  if (input.unitCostMinor === undefined) return undefined;
  const gross = input.unitCostMinor * input.quantityOnHand;
  if (input.depreciationMethod !== "straight-line" || !input.usefulLifeMonths) {
    return gross;
  }
  const start = new Date(
    `${input.placedInServiceAt ?? input.acquiredAt ?? input.now.toISOString().slice(0, 10)}T00:00:00.000Z`,
  );
  const months =
    (input.now.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    input.now.getUTCMonth() -
    start.getUTCMonth();
  const salvage = (input.salvageValueMinor ?? 0) * input.quantityOnHand;
  const depreciable = Math.max(0, gross - salvage);
  const used = Math.min(input.usefulLifeMonths, Math.max(0, months));
  return Math.max(
    salvage,
    Math.round(gross - (depreciable * used) / input.usefulLifeMonths),
  );
}

export function loadDemoCommerceWorkspace(): Pick<
  OperatorWorkspace,
  | "catalog"
  | "inventory"
  | "inventoryLocations"
  | "people"
  | "calendar"
  | "theme"
  | "ledger"
  | "recommendations"
> {
  return {
    catalog: [],
    inventory: [],
    inventoryLocations: [],
    people: [],
    calendar: {
      entries: [],
      connections: [],
      resourceConflicts: 0,
    },
    theme: DEFAULT_THEME,
    ledger: {
      postedJournalCount: 0,
      draftJournalCount: 0,
      reconciliationStatus: "not-started",
      creditLiability: 0,
    },
    recommendations: [
      {
        id: "start-catalog",
        title: "Start with one thing you already sell",
        detail:
          "Add a private lesson, clinic, membership, credit pack, or piece of gear. Keep it in draft until pricing and tax setup are ready.",
        action: "Create a product",
        href: "/products",
        tone: "setup",
      },
    ],
  };
}

export async function loadOperatorCommerceWorkspace(
  organizationId: string,
  now = new Date(),
): Promise<
  Pick<
    OperatorWorkspace,
    | "catalog"
    | "inventory"
    | "inventoryLocations"
    | "people"
    | "calendar"
    | "theme"
    | "ledger"
    | "recommendations"
  >
> {
  requireDatabase();
  const database = getDatabase();
  const organization = await database.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });
  if (!organization) throw new Error("Organization was not found.");

  const horizonStart = new Date(now.getTime() - 45 * 24 * 60 * 60_000);
  const horizonEnd = new Date(now.getTime() + 180 * 24 * 60 * 60_000);
  const [
    itemRows,
    variantRows,
    priceRows,
    mediaRows,
    stockRows,
    locationRows,
    participantRows,
    staffRows,
    sessionRows,
    bookingRows,
    connectionRows,
    busyRows,
    themeRow,
    journalRows,
    reconciliationRow,
    proposalRows,
  ] = await Promise.all([
    database
      .select()
      .from(catalogItems)
      .where(eq(catalogItems.organizationId, organizationId))
      .orderBy(asc(catalogItems.type), asc(catalogItems.title))
      .limit(1_000),
    database
      .select()
      .from(catalogVariants)
      .where(eq(catalogVariants.organizationId, organizationId))
      .orderBy(asc(catalogVariants.title))
      .limit(10_000),
    database
      .select()
      .from(catalogPrices)
      .where(eq(catalogPrices.organizationId, organizationId))
      .orderBy(asc(catalogPrices.createdAt))
      .limit(25_000),
    database
      .select()
      .from(catalogMedia)
      .where(eq(catalogMedia.organizationId, organizationId))
      .orderBy(asc(catalogMedia.sortOrder))
      .limit(10_000),
    database
      .select({
        stock: inventoryStockItems,
        itemTitle: catalogItems.title,
        catalogItemId: catalogItems.id,
        variantTitle: catalogVariants.title,
        locationName: inventoryLocations.name,
      })
      .from(inventoryStockItems)
      .innerJoin(
        catalogVariants,
        eq(inventoryStockItems.catalogVariantId, catalogVariants.id),
      )
      .innerJoin(
        catalogItems,
        eq(catalogVariants.catalogItemId, catalogItems.id),
      )
      .innerJoin(
        inventoryLocations,
        eq(inventoryStockItems.inventoryLocationId, inventoryLocations.id),
      )
      .where(eq(inventoryStockItems.organizationId, organizationId))
      .orderBy(asc(catalogItems.title), asc(catalogVariants.title))
      .limit(10_000),
    database
      .select()
      .from(inventoryLocations)
      .where(eq(inventoryLocations.organizationId, organizationId))
      .orderBy(asc(inventoryLocations.name)),
    database
      .select({
        participant: organizationParticipants,
        person: people,
      })
      .from(organizationParticipants)
      .innerJoin(people, eq(organizationParticipants.personId, people.id))
      .where(eq(organizationParticipants.organizationId, organizationId))
      .orderBy(asc(people.displayName)),
    database
      .select({
        membership: organizationMemberships,
        person: people,
      })
      .from(organizationMemberships)
      .innerJoin(people, eq(organizationMemberships.personId, people.id))
      .where(
        and(
          eq(organizationMemberships.organizationId, organizationId),
          eq(organizationMemberships.active, true),
        ),
      )
      .orderBy(asc(people.displayName)),
    database
      .select({
        id: sessions.id,
        title: sessions.title,
        startsAt: sessions.startsAt,
        endsAt: sessions.endsAt,
        timezone: sessions.timezone,
        status: sessions.status,
        capacity: sessions.capacity,
        courtId: sessions.courtId,
        coachPersonId: sessions.coachPersonId,
        coachName: people.displayName,
        courtName: courts.name,
        venueName: venues.name,
      })
      .from(sessions)
      .leftJoin(programs, eq(sessions.programId, programs.id))
      .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
      .leftJoin(venues, eq(sessions.venueId, venues.id))
      .leftJoin(courts, eq(sessions.courtId, courts.id))
      .leftJoin(people, eq(sessions.coachPersonId, people.id))
      .where(
        and(
          or(
            eq(programs.organizationId, organizationId),
            eq(eventTypes.organizationId, organizationId),
            eq(venues.organizationId, organizationId),
          ),
          gt(sessions.endsAt, horizonStart),
          lt(sessions.startsAt, horizonEnd),
        ),
      )
      .orderBy(asc(sessions.startsAt))
      .limit(5_000),
    database
      .select({
        id: courtBookings.id,
        title: people.displayName,
        startsAt: courtBookings.startsAt,
        endsAt: courtBookings.endsAt,
        status: courtBookings.status,
        courtId: courtBookings.courtId,
        courtName: courts.name,
        venueName: venues.name,
        timezone: venues.timezone,
        capacity: courts.capacity,
        participantCount: courtBookings.participantTarget,
      })
      .from(courtBookings)
      .innerJoin(venues, eq(courtBookings.venueId, venues.id))
      .innerJoin(courts, eq(courtBookings.courtId, courts.id))
      .innerJoin(people, eq(courtBookings.personId, people.id))
      .where(
        and(
          eq(courtBookings.organizationId, organizationId),
          gt(courtBookings.endsAt, horizonStart),
          lt(courtBookings.startsAt, horizonEnd),
        ),
      )
      .orderBy(asc(courtBookings.startsAt))
      .limit(5_000),
    database
      .select({
        connection: calendarConnections,
        personName: people.displayName,
      })
      .from(calendarConnections)
      .innerJoin(people, eq(calendarConnections.personId, people.id))
      .where(eq(calendarConnections.organizationId, organizationId))
      .orderBy(asc(people.displayName)),
    database
      .select({
        block: calendarBusyBlocks,
        personId: calendarConnections.personId,
        personName: people.displayName,
      })
      .from(calendarBusyBlocks)
      .innerJoin(
        calendarConnections,
        eq(calendarBusyBlocks.calendarConnectionId, calendarConnections.id),
      )
      .innerJoin(people, eq(calendarConnections.personId, people.id))
      .where(
        and(
          eq(calendarBusyBlocks.organizationId, organizationId),
          eq(calendarBusyBlocks.transparency, "busy"),
          gt(calendarBusyBlocks.endsAt, horizonStart),
          lt(calendarBusyBlocks.startsAt, horizonEnd),
        ),
      )
      .orderBy(asc(calendarBusyBlocks.startsAt))
      .limit(10_000),
    database.query.organizationThemes.findFirst({
      where: eq(organizationThemes.organizationId, organizationId),
    }),
    database
      .select({ status: ledgerJournals.status })
      .from(ledgerJournals)
      .where(eq(ledgerJournals.organizationId, organizationId))
      .limit(100_000),
    database.query.ledgerReconciliations.findFirst({
      where: eq(ledgerReconciliations.organizationId, organizationId),
      orderBy: [desc(ledgerReconciliations.createdAt)],
    }),
    database
      .select({ conflictSummary: calendarChangeProposals.conflictSummary })
      .from(calendarChangeProposals)
      .where(
        and(
          eq(calendarChangeProposals.organizationId, organizationId),
          eq(calendarChangeProposals.status, "proposed"),
        ),
      )
      .limit(500),
  ]);

  const variantsByItem = new Map<string, typeof variantRows>();
  const pricesByVariant = new Map<string, typeof priceRows>();
  const mediaByItem = new Map<string, typeof mediaRows>();
  const stockByItem = new Map<
    string,
    { readonly onHand: number; readonly reserved: number }
  >();
  for (const variant of variantRows) {
    const rows = variantsByItem.get(variant.catalogItemId) ?? [];
    variantsByItem.set(variant.catalogItemId, [...rows, variant]);
  }
  for (const price of priceRows) {
    if (!price.catalogVariantId) continue;
    const rows = pricesByVariant.get(price.catalogVariantId) ?? [];
    pricesByVariant.set(price.catalogVariantId, [...rows, price]);
  }
  for (const media of mediaRows) {
    const rows = mediaByItem.get(media.catalogItemId) ?? [];
    mediaByItem.set(media.catalogItemId, [...rows, media]);
  }
  for (const row of stockRows) {
    const current = stockByItem.get(row.catalogItemId) ?? {
      onHand: 0,
      reserved: 0,
    };
    stockByItem.set(row.catalogItemId, {
      onHand: current.onHand + row.stock.quantityOnHand,
      reserved: current.reserved + row.stock.quantityReserved,
    });
  }

  const catalog: OperatorWorkspace["catalog"] = itemRows.map((item) => {
    const inventory = stockByItem.get(item.id) ?? { onHand: 0, reserved: 0 };
    return {
      id: item.id,
      type: item.type,
      subtype: item.subtype,
      slug: item.slug,
      title: item.title,
      shortSummary: item.shortSummary ?? undefined,
      description: item.description ?? undefined,
      status: item.status,
      visibility:
        item.visibility === "members" || item.visibility === "private"
          ? item.visibility
          : "public",
      taxable: item.taxable,
      stripeTaxCode: item.stripeTaxCode ?? undefined,
      allowCard: item.allowCard,
      allowCash: item.allowCash,
      allowCredits: item.allowCredits,
      membershipRequired: item.membershipRequired,
      defaultFulfillment: item.defaultFulfillment,
      configuration: item.configuration,
      variants: (variantsByItem.get(item.id) ?? []).map((variant) => ({
        id: variant.id,
        title: variant.title,
        sku: variant.sku ?? undefined,
        optionCoordinates: variant.optionCoordinates,
        status: variant.status,
        prices: (pricesByVariant.get(variant.id) ?? []).map((price) => ({
          id: price.id,
          audience: price.audience,
          paymentKind: price.paymentKind,
          amountMinor: price.amountMinor ?? undefined,
          currency: price.currency
            ? (price.currency as OperatorWorkspace["organization"]["currency"])
            : undefined,
          creditAmount: price.creditAmount ?? undefined,
          recurringInterval:
            price.recurringInterval === "week" ||
            price.recurringInterval === "month" ||
            price.recurringInterval === "year"
              ? price.recurringInterval
              : undefined,
          recurringIntervalCount: price.recurringIntervalCount ?? undefined,
          active: price.active,
        })),
      })),
      media: (mediaByItem.get(item.id) ?? []).map((media) => ({
        id: media.id,
        kind: media.kind === "video" ? "video" : "image",
        url: media.url,
        posterUrl: media.posterUrl ?? undefined,
        alt: media.alt ?? undefined,
      })),
      inventoryOnHand: inventory.onHand,
      inventoryReserved: inventory.reserved,
      publishedAt: item.publishedAt?.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  });

  const inventory: OperatorWorkspace["inventory"] = stockRows.map((row) => ({
    id: row.stock.id,
    catalogItemId: row.catalogItemId,
    catalogVariantId: row.stock.catalogVariantId,
    itemTitle: row.itemTitle,
    variantTitle: row.variantTitle,
    locationName: row.locationName,
    purpose: row.stock.purpose,
    trackingMode:
      row.stock.trackingMode === "serialized" ? "serialized" : "quantity",
    quantityOnHand: row.stock.quantityOnHand,
    quantityReserved: row.stock.quantityReserved,
    reorderPoint: row.stock.reorderPoint,
    serialNumber: row.stock.serialNumber ?? undefined,
    assetTag: row.stock.assetTag ?? undefined,
    condition: row.stock.condition,
    unitCostMinor: row.stock.unitCostMinor ?? undefined,
    currency: row.stock.currency
      ? (row.stock.currency as OperatorWorkspace["organization"]["currency"])
      : undefined,
    acquiredAt: row.stock.acquiredAt ?? undefined,
    vendorName: row.stock.vendorName ?? undefined,
    depreciationMethod: row.stock.depreciationMethod ?? undefined,
    usefulLifeMonths: row.stock.usefulLifeMonths ?? undefined,
    bookValueMinor: calculateBookValue({
      unitCostMinor: row.stock.unitCostMinor ?? undefined,
      quantityOnHand: row.stock.quantityOnHand,
      placedInServiceAt: row.stock.placedInServiceAt ?? undefined,
      acquiredAt: row.stock.acquiredAt ?? undefined,
      depreciationMethod: row.stock.depreciationMethod ?? undefined,
      usefulLifeMonths: row.stock.usefulLifeMonths ?? undefined,
      salvageValueMinor: row.stock.salvageValueMinor ?? undefined,
      now,
    }),
  }));

  const basePeople = new Map<
    string,
    {
      person: (typeof participantRows)[number]["person"];
      roles: Set<OperatorWorkspace["people"][number]["roles"][number]>;
      status: "active" | "inactive" | "pending";
      joinedAt: Date;
    }
  >();
  for (const row of participantRows) {
    const role =
      row.participant.relationship === "guardian"
        ? "guardian"
        : ("player" as const);
    basePeople.set(row.person.id, {
      person: row.person,
      roles: new Set([role]),
      status:
        row.participant.status === "inactive" ||
        row.participant.status === "pending"
          ? row.participant.status
          : "active",
      joinedAt: row.participant.joinedAt,
    });
  }
  for (const row of staffRows) {
    const current = basePeople.get(row.person.id) ?? {
      person: row.person,
      roles: new Set<OperatorWorkspace["people"][number]["roles"][number]>(),
      status: "active" as const,
      joinedAt: row.membership.joinedAt,
    };
    current.roles.add(row.membership.role);
    basePeople.set(row.person.id, current);
  }
  const personIds = [...basePeople.keys()];
  const [membershipRows, walletRows, orderRows, registrationRows] =
    personIds.length === 0
      ? [[], [], [], []]
      : await Promise.all([
          database
            .select({
              personId: memberships.personId,
              status: memberships.status,
              name: membershipTiers.name,
            })
            .from(memberships)
            .innerJoin(
              membershipTiers,
              eq(memberships.tierId, membershipTiers.id),
            )
            .where(
              and(
                inArray(memberships.personId, personIds),
                eq(membershipTiers.organizationId, organizationId),
              ),
            )
            .orderBy(desc(memberships.updatedAt)),
          database
            .select({
              personId: organizationWallets.personId,
              credits: organizationWallets.cachedAvailableCredits,
            })
            .from(organizationWallets)
            .where(
              and(
                eq(organizationWallets.organizationId, organizationId),
                inArray(organizationWallets.personId, personIds),
              ),
            ),
          database
            .select({
              orderId: orders.id,
              personId: orders.buyerPersonId,
              totalMinor: orders.totalMinor,
              currency: orders.currency,
              status: orders.status,
              purchasedAt: orders.createdAt,
              description: sql<string>`coalesce(min(${orderItems.description}), 'Organization purchase')`,
            })
            .from(orders)
            .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
            .where(
              and(
                eq(orders.organizationId, organizationId),
                inArray(orders.buyerPersonId, personIds),
              ),
            )
            .groupBy(
              orders.id,
              orders.buyerPersonId,
              orders.totalMinor,
              orders.currency,
              orders.status,
              orders.createdAt,
            )
            .orderBy(desc(orders.createdAt))
            .limit(100_000),
          database
            .select({
              personId: registrations.personId,
              startsAt: sessions.startsAt,
              status: registrations.status,
            })
            .from(registrations)
            .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
            .where(
              and(
                inArray(registrations.personId, personIds),
                gt(sessions.startsAt, now),
              ),
            )
            .limit(100_000),
        ]);
  const membershipByPerson = new Map<string, (typeof membershipRows)[number]>();
  for (const row of membershipRows) {
    if (!membershipByPerson.has(row.personId)) {
      membershipByPerson.set(row.personId, row);
    }
  }
  const creditsByPerson = new Map(
    walletRows.map((row) => [row.personId, row.credits] as const),
  );
  const purchasesByPerson = new Map<
    string,
    {
      total: number;
      count: number;
      recent: OperatorWorkspace["people"][number]["recentPurchases"];
    }
  >();
  for (const order of orderRows) {
    if (!["paid", "partially-refunded", "refunded"].includes(order.status)) {
      continue;
    }
    const current = purchasesByPerson.get(order.personId) ?? {
      total: 0,
      count: 0,
      recent: [],
    };
    purchasesByPerson.set(order.personId, {
      total:
        current.total +
        (order.status === "refunded" ? 0 : Math.max(0, order.totalMinor)),
      count: current.count + 1,
      recent:
        current.recent.length >= 5
          ? current.recent
          : [
              ...current.recent,
              {
                orderId: order.orderId,
                description: order.description,
                amountMinor: Math.max(0, order.totalMinor),
                currency:
                  order.currency as OperatorWorkspace["organization"]["currency"],
                status: order.status,
                purchasedAt: order.purchasedAt.toISOString(),
              },
            ],
    });
  }
  const upcomingByPerson = new Map<string, number>();
  for (const registration of registrationRows) {
    if (["cancelled", "refunded"].includes(registration.status)) continue;
    upcomingByPerson.set(
      registration.personId,
      (upcomingByPerson.get(registration.personId) ?? 0) + 1,
    );
  }
  const organizationPeople: OperatorWorkspace["people"] = [...basePeople].map(
    ([personId, value]) => {
      const membership = membershipByPerson.get(personId);
      const purchases = purchasesByPerson.get(personId) ?? {
        total: 0,
        count: 0,
        recent: [],
      };
      return {
        personId,
        displayName: value.person.displayName,
        avatarUrl: value.person.avatarUrl ?? undefined,
        email: value.person.email ?? undefined,
        phoneE164: value.person.phoneE164 ?? undefined,
        isMinor: value.person.isMinor,
        roles: [...value.roles],
        status: value.status,
        membershipStatus: membership?.status,
        membershipName: membership?.name,
        creditBalance: creditsByPerson.get(personId) ?? 0,
        lifetimeSpendMinor: purchases.total,
        purchaseCount: purchases.count,
        recentPurchases: purchases.recent,
        upcomingCount: upcomingByPerson.get(personId) ?? 0,
        joinedAt: value.joinedAt.toISOString(),
      };
    },
  );

  const registrationCounts = new Map<string, number>();
  if (sessionRows.length > 0) {
    const counts = await database
      .select({
        sessionId: registrations.sessionId,
        count: sql<number>`count(*)::int`,
      })
      .from(registrations)
      .where(
        and(
          inArray(
            registrations.sessionId,
            sessionRows.map((session) => session.id),
          ),
          inArray(registrations.status, ["confirmed", "checked-in"]),
        ),
      )
      .groupBy(registrations.sessionId);
    for (const row of counts) registrationCounts.set(row.sessionId, row.count);
  }
  const calendarEntries: OperatorWorkspace["calendar"]["entries"] = [
    ...sessionRows.map((session) => ({
      id: session.id,
      sourceType: "session" as const,
      title: session.title,
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      timezone: session.timezone,
      status: session.status,
      venueName: session.venueName ?? undefined,
      courtId: session.courtId ?? undefined,
      courtName: session.courtName ?? undefined,
      coachPersonId: session.coachPersonId ?? undefined,
      coachName: session.coachName ?? undefined,
      participantCount: registrationCounts.get(session.id) ?? 0,
      capacity: session.capacity,
      color: session.status === "live" ? "#1E8E72" : "#2B67A4",
      draggable: !["live", "completed", "cancelled"].includes(session.status),
    })),
    ...bookingRows.map((booking) => ({
      id: booking.id,
      sourceType: "booking" as const,
      title: `${booking.title} · court booking`,
      startsAt: booking.startsAt.toISOString(),
      endsAt: booking.endsAt.toISOString(),
      timezone: booking.timezone,
      status: booking.status,
      venueName: booking.venueName,
      courtId: booking.courtId,
      courtName: booking.courtName,
      participantCount: booking.participantCount,
      capacity: booking.capacity,
      color: "#B98435",
      draggable: false,
    })),
    ...busyRows.map((row) => ({
      id: row.block.id,
      sourceType: "busy-block" as const,
      title: `${row.personName} unavailable`,
      startsAt: row.block.startsAt.toISOString(),
      endsAt: row.block.endsAt.toISOString(),
      timezone: organization.timezone,
      status: "busy",
      coachPersonId: row.personId,
      coachName: row.personName,
      participantCount: 0,
      capacity: 0,
      color: "#8A94A3",
      draggable: false,
    })),
  ].toSorted((left, right) => left.startsAt.localeCompare(right.startsAt));

  const postedJournalCount = journalRows.filter(
    (row) => row.status === "posted",
  ).length;
  const draftJournalCount = journalRows.length - postedJournalCount;
  const creditLiability = walletRows.reduce(
    (total, row) => total + row.credits,
    0,
  );
  const reconciliationStatus =
    reconciliationRow?.status === "matched" ||
    reconciliationRow?.status === "drift" ||
    reconciliationRow?.status === "investigating" ||
    reconciliationRow?.status === "resolved"
      ? reconciliationRow.status
      : "not-started";

  const theme: OperatorWorkspace["theme"] = themeRow
    ? {
        logoUrl: themeRow.logoUrl ?? undefined,
        markUrl: themeRow.markUrl ?? undefined,
        heroMediaType:
          themeRow.heroMediaType === "image" ||
          themeRow.heroMediaType === "video"
            ? themeRow.heroMediaType
            : undefined,
        heroMediaUrl: themeRow.heroMediaUrl ?? undefined,
        heroPosterUrl: themeRow.heroPosterUrl ?? undefined,
        tagline: themeRow.tagline ?? undefined,
        profileSummary: themeRow.profileSummary ?? undefined,
        palette: themeRow.palette,
        typography: themeRow.typography,
        cardStyle:
          themeRow.cardStyle === "crisp" || themeRow.cardStyle === "borderless"
            ? themeRow.cardStyle
            : "soft",
        profileLayout: themeRow.profileLayout,
        publishedAt: themeRow.publishedAt?.toISOString(),
      }
    : DEFAULT_THEME;

  const recommendations: Array<OperatorWorkspace["recommendations"][number]> =
    [];
  if (catalog.length === 0) {
    recommendations.push({
      id: "start-catalog",
      title: "Start with one thing you already sell",
      detail:
        "Create a private lesson, clinic, membership, credit pack, or piece of gear. Duna will keep the setup in draft.",
      action: "Create a product",
      href: "/products",
      tone: "setup",
    });
  }
  if (
    !catalog.some(
      (item) => item.type === "plan" && item.subtype === "membership",
    )
  ) {
    recommendations.push({
      id: "membership",
      title: "Memberships make pricing simpler",
      detail:
        "Offer a modest member price on the sessions players already attend. You can require membership only where it adds real value.",
      action: "Add membership",
      href: "/products?create=membership",
      tone: "growth",
    });
  }
  if (
    !catalog.some(
      (item) => item.type === "plan" && item.subtype === "credit-pack",
    )
  ) {
    recommendations.push({
      id: "credits",
      title: "Turn occasional visits into a habit",
      detail:
        "A 5- or 10-credit pack can reward commitment without forcing a recurring membership.",
      action: "Add credit pack",
      href: "/products?create=credit-pack",
      tone: "growth",
    });
  }
  if (
    !organization.addressLine1 ||
    !organization.locality ||
    !organization.administrativeArea ||
    !organization.postalCode
  ) {
    recommendations.push({
      id: "tax-address",
      title: "Complete the legal business address",
      detail:
        "Duna needs the organization address and each venue address to choose the right taxable location for automatic tax.",
      action: "Complete address",
      href: "/settings#tax",
      tone: "attention",
    });
  }
  if (!themeRow?.publishedAt) {
    recommendations.push({
      id: "theme",
      title: "Make the club profile feel like yours",
      detail:
        "Add a hero image or video, logo, tagline, and colors. This is a profile theme—not a website builder.",
      action: "Open Theme Kit",
      href: "/settings#theme-kit",
      tone: "setup",
    });
  }

  return {
    catalog,
    inventory,
    inventoryLocations: locationRows.map((location) => ({
      id: location.id,
      venueId: location.venueId ?? undefined,
      name: location.name,
      kind:
        location.kind === "warehouse" ||
        location.kind === "vehicle" ||
        location.kind === "coach-kit" ||
        location.kind === "virtual"
          ? location.kind
          : "venue",
      active: location.active,
    })),
    people: organizationPeople,
    calendar: {
      entries: calendarEntries,
      connections: connectionRows.map((row) => ({
        id: row.connection.id,
        personId: row.connection.personId,
        personName: row.personName,
        provider: row.connection.provider,
        syncDirection:
          row.connection.syncDirection === "busy-only" ||
          row.connection.syncDirection === "duna-to-external"
            ? row.connection.syncDirection
            : "two-way",
        status:
          row.connection.status === "active" ||
          row.connection.status === "reauthorization-required" ||
          row.connection.status === "paused" ||
          row.connection.status === "revoked"
            ? row.connection.status
            : "pending",
        lastSyncedAt: row.connection.lastSyncedAt?.toISOString(),
      })),
      resourceConflicts: proposalRows.reduce(
        (total, row) => total + row.conflictSummary.conflicts.length,
        0,
      ),
    },
    theme,
    ledger: {
      postedJournalCount,
      draftJournalCount,
      lastReconciledAt: reconciliationRow?.completedAt?.toISOString(),
      reconciliationStatus,
      creditLiability,
    },
    recommendations,
  };
}

export async function loadPublicOrganizationStorefront(
  slug: string,
): Promise<PublicOrganizationStorefront | undefined> {
  requireDatabase();
  const database = getDatabase();
  const organization = await database.query.organizations.findFirst({
    where: eq(organizations.slug, slug),
  });
  if (!organization) return undefined;

  const [themeRow, itemRows] = await Promise.all([
    database.query.organizationThemes.findFirst({
      where: and(
        eq(organizationThemes.organizationId, organization.id),
        sql`${organizationThemes.publishedAt} IS NOT NULL`,
      ),
    }),
    database
      .select()
      .from(catalogItems)
      .where(
        and(
          eq(catalogItems.organizationId, organization.id),
          eq(catalogItems.status, "active"),
          inArray(catalogItems.visibility, ["public", "members"]),
        ),
      )
      .orderBy(asc(catalogItems.type), asc(catalogItems.title)),
  ]);
  const itemIds = itemRows.map((item) => item.id);
  const variantRows =
    itemIds.length === 0
      ? []
      : await database
          .select()
          .from(catalogVariants)
          .where(
            and(
              eq(catalogVariants.organizationId, organization.id),
              eq(catalogVariants.status, "active"),
              inArray(catalogVariants.catalogItemId, itemIds),
            ),
          )
          .orderBy(asc(catalogVariants.title));
  const variantIds = variantRows.map((variant) => variant.id);
  const [priceRows, mediaRows, stockRows] = await Promise.all([
    variantIds.length === 0
      ? Promise.resolve([])
      : database
          .select()
          .from(catalogPrices)
          .where(
            and(
              eq(catalogPrices.organizationId, organization.id),
              eq(catalogPrices.active, true),
              inArray(catalogPrices.catalogVariantId, variantIds),
            ),
          )
          .orderBy(asc(catalogPrices.createdAt)),
    itemIds.length === 0
      ? Promise.resolve([])
      : database
          .select()
          .from(catalogMedia)
          .where(
            and(
              eq(catalogMedia.organizationId, organization.id),
              inArray(catalogMedia.catalogItemId, itemIds),
            ),
          )
          .orderBy(asc(catalogMedia.sortOrder)),
    variantIds.length === 0
      ? Promise.resolve([])
      : database
          .select({
            catalogVariantId: inventoryStockItems.catalogVariantId,
            purpose: inventoryStockItems.purpose,
            quantityOnHand: inventoryStockItems.quantityOnHand,
            quantityReserved: inventoryStockItems.quantityReserved,
          })
          .from(inventoryStockItems)
          .where(
            and(
              eq(inventoryStockItems.organizationId, organization.id),
              inArray(inventoryStockItems.purpose, ["sale", "rental"]),
              inArray(inventoryStockItems.catalogVariantId, variantIds),
            ),
          ),
  ]);

  const pricesByVariant = new Map<string, typeof priceRows>();
  const variantsByItem = new Map<string, typeof variantRows>();
  const mediaByItem = new Map<string, typeof mediaRows>();
  const availableByVariant = new Map<string, number>();
  for (const price of priceRows) {
    if (!price.catalogVariantId) continue;
    pricesByVariant.set(price.catalogVariantId, [
      ...(pricesByVariant.get(price.catalogVariantId) ?? []),
      price,
    ]);
  }
  for (const variant of variantRows) {
    variantsByItem.set(variant.catalogItemId, [
      ...(variantsByItem.get(variant.catalogItemId) ?? []),
      variant,
    ]);
  }
  for (const media of mediaRows) {
    mediaByItem.set(media.catalogItemId, [
      ...(mediaByItem.get(media.catalogItemId) ?? []),
      media,
    ]);
  }
  for (const stock of stockRows) {
    const variant = variantRows.find(
      (candidate) => candidate.id === stock.catalogVariantId,
    );
    const item = itemRows.find(
      (candidate) => candidate.id === variant?.catalogItemId,
    );
    const desiredPurpose = item?.subtype === "rental" ? "rental" : "sale";
    if (stock.purpose !== desiredPurpose) continue;
    availableByVariant.set(
      stock.catalogVariantId,
      (availableByVariant.get(stock.catalogVariantId) ?? 0) +
        Math.max(0, stock.quantityOnHand - stock.quantityReserved),
    );
  }

  const theme: OperatorWorkspace["theme"] = themeRow
    ? {
        logoUrl: themeRow.logoUrl ?? undefined,
        markUrl: themeRow.markUrl ?? undefined,
        heroMediaType:
          themeRow.heroMediaType === "image" ||
          themeRow.heroMediaType === "video"
            ? themeRow.heroMediaType
            : undefined,
        heroMediaUrl: themeRow.heroMediaUrl ?? undefined,
        heroPosterUrl: themeRow.heroPosterUrl ?? undefined,
        tagline: themeRow.tagline ?? undefined,
        profileSummary: themeRow.profileSummary ?? undefined,
        palette: themeRow.palette,
        typography: themeRow.typography,
        cardStyle:
          themeRow.cardStyle === "crisp" || themeRow.cardStyle === "borderless"
            ? themeRow.cardStyle
            : "soft",
        profileLayout: themeRow.profileLayout,
        publishedAt: themeRow.publishedAt?.toISOString(),
      }
    : DEFAULT_THEME;

  return {
    organizationId: organization.id,
    slug: organization.slug,
    name: organization.name,
    currency: organization.currency as PublicOrganizationStorefront["currency"],
    timezone: organization.timezone,
    paymentsReady: Boolean(
      organization.stripeAccountId && organization.stripeChargesEnabled,
    ),
    theme,
    catalog: itemRows.map((item) => ({
      id: item.id,
      type: item.type,
      subtype: item.subtype,
      slug: item.slug,
      title: item.title,
      shortSummary: item.shortSummary ?? undefined,
      description: item.description ?? undefined,
      visibility: "public" as const,
      taxable: item.taxable,
      allowCard: item.allowCard,
      allowCash: item.allowCash,
      allowCredits: item.allowCredits,
      membershipRequired: item.membershipRequired,
      defaultFulfillment: item.defaultFulfillment,
      configuration: item.configuration,
      variants: (variantsByItem.get(item.id) ?? []).map((variant) => ({
        id: variant.id,
        title: variant.title,
        sku: variant.sku ?? undefined,
        optionCoordinates: variant.optionCoordinates,
        prices: (pricesByVariant.get(variant.id) ?? []).map((price) => ({
          id: price.id,
          audience: price.audience,
          paymentKind: price.paymentKind,
          amountMinor: price.amountMinor ?? undefined,
          currency: price.currency
            ? (price.currency as PublicOrganizationStorefront["currency"])
            : undefined,
          creditAmount: price.creditAmount ?? undefined,
          recurringInterval:
            price.recurringInterval === "week" ||
            price.recurringInterval === "month" ||
            price.recurringInterval === "year"
              ? price.recurringInterval
              : undefined,
          recurringIntervalCount: price.recurringIntervalCount ?? undefined,
        })),
        availableQuantity:
          item.type === "good"
            ? (availableByVariant.get(variant.id) ?? 0)
            : undefined,
      })),
      media: (mediaByItem.get(item.id) ?? []).map((media) => ({
        id: media.id,
        kind: media.kind === "video" ? ("video" as const) : ("image" as const),
        url: media.url,
        posterUrl: media.posterUrl ?? undefined,
        alt: media.alt ?? undefined,
      })),
    })),
  };
}

export async function loadPlayerOrganizationWallets(
  personId: string,
  now = new Date(),
): Promise<
  readonly {
    readonly organizationId: string;
    readonly organizationSlug: string;
    readonly organizationName: string;
    readonly credits: number;
    readonly status: "active" | "frozen" | "closed";
    readonly nextExpirationAt?: string;
    readonly nextExpiringCredits: number;
    readonly membershipName?: string;
    readonly membershipStatus?: string;
  }[]
> {
  requireDatabase();
  const database = getDatabase();
  const [walletRows, membershipRows] = await Promise.all([
    database
      .select({
        wallet: organizationWallets,
        organizationSlug: organizations.slug,
        organizationName: organizations.name,
      })
      .from(organizationWallets)
      .innerJoin(
        organizations,
        eq(organizationWallets.organizationId, organizations.id),
      )
      .where(eq(organizationWallets.personId, personId))
      .orderBy(asc(organizations.name)),
    database
      .select({
        membership: memberships,
        tier: membershipTiers,
        organizationId: organizations.id,
        organizationSlug: organizations.slug,
        organizationName: organizations.name,
      })
      .from(memberships)
      .innerJoin(membershipTiers, eq(memberships.tierId, membershipTiers.id))
      .innerJoin(
        organizations,
        eq(membershipTiers.organizationId, organizations.id),
      )
      .where(eq(memberships.personId, personId))
      .orderBy(desc(memberships.updatedAt)),
  ]);
  if (walletRows.length === 0 && membershipRows.length === 0) return [];
  const grants =
    walletRows.length === 0
      ? []
      : await database
          .select()
          .from(organizationCreditGrants)
          .where(
            and(
              inArray(
                organizationCreditGrants.organizationWalletId,
                walletRows.map((row) => row.wallet.id),
              ),
              eq(organizationCreditGrants.status, "active"),
              gt(organizationCreditGrants.remainingCredits, 0),
            ),
          )
          .orderBy(
            asc(organizationCreditGrants.expiresAt),
            asc(organizationCreditGrants.createdAt),
          );
  const summaries = new Map<
    string,
    {
      organizationId: string;
      organizationSlug: string;
      organizationName: string;
      credits: number;
      status: "active" | "frozen" | "closed";
      nextExpirationAt?: string;
      nextExpiringCredits: number;
      membershipName?: string;
      membershipStatus?: string;
    }
  >();
  for (const row of walletRows) {
    const expiring = grants.filter(
      (grant) =>
        grant.organizationWalletId === row.wallet.id &&
        grant.expiresAt &&
        grant.expiresAt > now,
    );
    const nextExpiration = expiring[0]?.expiresAt;
    summaries.set(row.wallet.organizationId, {
      organizationId: row.wallet.organizationId,
      organizationSlug: row.organizationSlug,
      organizationName: row.organizationName,
      credits: row.wallet.cachedAvailableCredits,
      status:
        row.wallet.status === "frozen" || row.wallet.status === "closed"
          ? row.wallet.status
          : "active",
      nextExpirationAt: nextExpiration?.toISOString(),
      nextExpiringCredits: nextExpiration
        ? expiring
            .filter(
              (grant) =>
                grant.expiresAt?.getTime() === nextExpiration.getTime(),
            )
            .reduce((total, grant) => total + grant.remainingCredits, 0)
        : 0,
    });
  }
  for (const row of membershipRows) {
    const current = summaries.get(row.organizationId);
    if (current?.membershipStatus) continue;
    summaries.set(row.organizationId, {
      organizationId: row.organizationId,
      organizationSlug: row.organizationSlug,
      organizationName: row.organizationName,
      credits: current?.credits ?? 0,
      status: current?.status ?? "active",
      nextExpirationAt: current?.nextExpirationAt,
      nextExpiringCredits: current?.nextExpiringCredits ?? 0,
      membershipName: row.tier.name,
      membershipStatus: row.membership.status,
    });
  }
  return [...summaries.values()].toSorted((left, right) =>
    left.organizationName.localeCompare(right.organizationName),
  );
}

export interface CreateCatalogItemInput {
  readonly actor: ApiActor;
  readonly type: CatalogItemType;
  readonly subtype: CatalogItemSubtype;
  readonly title: string;
  readonly shortSummary?: string;
  readonly description?: string;
  readonly visibility: "public" | "members" | "private";
  readonly taxable: boolean;
  readonly stripeTaxCode?: string;
  readonly allowCard: boolean;
  readonly allowCash: boolean;
  readonly allowCredits: boolean;
  readonly membershipRequired: boolean;
  readonly priceMinor?: number;
  readonly memberPriceMinor?: number;
  readonly nonMemberPriceMinor?: number;
  readonly creditCost?: number;
  readonly recurringInterval?: "week" | "month" | "year";
  readonly recurringIntervalCount?: number;
  readonly options: readonly {
    readonly name: string;
    readonly values: readonly string[];
  }[];
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}

export async function createCatalogItem(
  input: CreateCatalogItemInput,
): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const database = getDatabase();
  const organization = await database.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });
  if (!organization) throw new Error("Organization was not found.");
  if (!input.allowCard && !input.allowCash && !input.allowCredits) {
    throw new Error("Choose at least one way customers can pay.");
  }
  if (
    (input.allowCard || input.allowCash) &&
    input.priceMinor === undefined &&
    input.memberPriceMinor === undefined &&
    input.nonMemberPriceMinor === undefined
  ) {
    throw new Error("Add a cash price when card or cash payment is enabled.");
  }
  if (input.allowCredits && (!input.creditCost || input.creditCost <= 0)) {
    throw new Error("Add a positive credit cost when credits are enabled.");
  }
  if (
    input.type === "plan" &&
    input.subtype === "credit-pack" &&
    input.allowCredits
  ) {
    throw new Error("A credit pack cannot be purchased with credits.");
  }
  if (
    input.type === "plan" &&
    input.subtype === "membership" &&
    input.allowCard &&
    input.recurringInterval !== "month" &&
    input.recurringInterval !== "year"
  ) {
    throw new Error("Membership card billing must recur monthly or annually.");
  }
  if (
    (input.type === "event" || input.type === "service") &&
    input.configuration.deliveryMode === "venue"
  ) {
    const configuredVenueId =
      typeof input.configuration.venueId === "string"
        ? input.configuration.venueId
        : undefined;
    const venue = configuredVenueId
      ? await database.query.venues.findFirst({
          where: and(
            eq(venues.id, configuredVenueId),
            eq(venues.organizationId, organizationId),
          ),
        })
      : undefined;
    if (!venue) {
      throw new Error(
        "Choose an organization venue for this in-person offering.",
      );
    }
  }
  const creditsGranted =
    input.type === "plan" && input.subtype === "credit-pack"
      ? Number(input.configuration.creditsGranted)
      : undefined;
  if (
    input.type === "plan" &&
    input.subtype === "credit-pack" &&
    (!Number.isSafeInteger(creditsGranted) || (creditsGranted ?? 0) <= 0)
  ) {
    throw new Error("A credit pack must grant a positive number of credits.");
  }
  const coordinates = variantMatrix(input.options);
  const itemId = crypto.randomUUID();
  const slug = await uniqueCatalogSlug(organizationId, input.title);
  const variantValues = coordinates.map((optionCoordinates, index) => ({
    id: crypto.randomUUID(),
    organizationId,
    catalogItemId: itemId,
    sku:
      input.type === "good"
        ? `${slug.toUpperCase().replaceAll("-", "_")}-${String(index + 1).padStart(3, "0")}`
        : undefined,
    title: variantTitle(input.title.trim(), optionCoordinates),
    optionCoordinates,
    status: "active" as const,
  }));
  const prices: {
    id: string;
    organizationId: string;
    catalogItemId: string;
    catalogVariantId: string;
    audience: "everyone" | "member" | "non-member";
    paymentKind: CatalogPaymentKind;
    amountMinor?: number;
    currency?: string;
    creditAmount?: number;
    recurringInterval?: "week" | "month" | "year";
    recurringIntervalCount?: number;
  }[] = [];
  for (const variant of variantValues) {
    for (const paymentKind of (
      [
        input.allowCard ? "card" : undefined,
        input.allowCash ? "cash" : undefined,
      ] as const
    ).filter((value): value is "card" | "cash" => Boolean(value))) {
      if (
        input.memberPriceMinor !== undefined ||
        input.nonMemberPriceMinor !== undefined
      ) {
        prices.push({
          id: crypto.randomUUID(),
          organizationId,
          catalogItemId: itemId,
          catalogVariantId: variant.id,
          audience: "member",
          paymentKind,
          amountMinor: input.memberPriceMinor ?? input.priceMinor ?? 0,
          currency: organization.currency,
          recurringInterval: input.recurringInterval,
          recurringIntervalCount: input.recurringIntervalCount,
        });
        prices.push({
          id: crypto.randomUUID(),
          organizationId,
          catalogItemId: itemId,
          catalogVariantId: variant.id,
          audience: "non-member",
          paymentKind,
          amountMinor: input.nonMemberPriceMinor ?? input.priceMinor ?? 0,
          currency: organization.currency,
          recurringInterval: input.recurringInterval,
          recurringIntervalCount: input.recurringIntervalCount,
        });
      } else {
        prices.push({
          id: crypto.randomUUID(),
          organizationId,
          catalogItemId: itemId,
          catalogVariantId: variant.id,
          audience: "everyone",
          paymentKind,
          amountMinor: input.priceMinor ?? 0,
          currency: organization.currency,
          recurringInterval: input.recurringInterval,
          recurringIntervalCount: input.recurringIntervalCount,
        });
      }
    }
    if (input.allowCredits && input.creditCost) {
      prices.push({
        id: crypto.randomUUID(),
        organizationId,
        catalogItemId: itemId,
        catalogVariantId: variant.id,
        audience: "everyone",
        paymentKind: "credit",
        creditAmount: input.creditCost,
      });
    }
  }
  const optionValues = input.options.map((option, sortOrder) => ({
    id: crypto.randomUUID(),
    organizationId,
    catalogItemId: itemId,
    code: optionCode(option.name),
    name: option.name.trim(),
    values: [
      ...new Set(option.values.map((value) => value.trim()).filter(Boolean)),
    ],
    sortOrder,
  }));
  const values = {
    type: input.type,
    subtype: input.subtype,
    slug,
    title: input.title.trim(),
    shortSummary: input.shortSummary?.trim() || undefined,
    description: input.description?.trim() || undefined,
    visibility: input.visibility,
    taxable: input.taxable,
    stripeTaxCode: input.stripeTaxCode?.trim() || undefined,
    allowCard: input.allowCard,
    allowCash: input.allowCash,
    allowCredits: input.allowCredits,
    membershipRequired: input.membershipRequired,
    defaultFulfillment: defaultFulfillment(input.type, input.subtype),
    configuration: input.configuration,
  };
  await database.batch([
    database.insert(catalogItems).values({
      id: itemId,
      organizationId,
      ...values,
      createdByPersonId: input.actor.personId,
      status: "draft",
    }),
    optionValues.length > 0
      ? database.insert(catalogOptions).values(optionValues)
      : database
          .update(catalogItems)
          .set({ updatedAt: input.now })
          .where(sql`false`),
    database.insert(catalogVariants).values(variantValues),
    database.insert(catalogPrices).values(prices),
    creditsGranted
      ? database.insert(catalogEntitlements).values({
          id: crypto.randomUUID(),
          organizationId,
          planCatalogItemId: itemId,
          kind: "credit-grant",
          quantity: creditsGranted,
          configuration: {
            unitKind: "organization-credit",
            organizationId,
          },
        })
      : database
          .update(catalogItems)
          .set({ updatedAt: input.now })
          .where(sql`false`),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "catalog.item_created",
      entityType: "catalog-item",
      entityId: itemId,
      afterHash: stableHash({
        ...values,
        options: optionValues,
        variants: variantValues,
        prices,
      }),
      reason: "Operator created a private catalog draft.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { id: itemId, entity: "catalog-item", status: "draft" };
}

async function ensureCatalogStripeResources(input: {
  readonly organizationId: string;
  readonly item: typeof catalogItems.$inferSelect;
  readonly variants: readonly (typeof catalogVariants.$inferSelect)[];
  readonly prices: readonly (typeof catalogPrices.$inferSelect)[];
  readonly now: Date;
}): Promise<void> {
  const cardPrices = input.prices.filter(
    (price) => price.paymentKind === "card" && price.active,
  );
  if (cardPrices.length === 0) return;
  if (!isStripeConfigured()) {
    throw new Error(
      "Card payments are not configured in this environment, so card pricing cannot be published.",
    );
  }
  const database = getDatabase();
  const stripe = getStripeClient();
  for (const variant of input.variants) {
    const variantPrices = cardPrices.filter(
      (price) => price.catalogVariantId === variant.id,
    );
    if (variantPrices.length === 0) continue;
    let stripeProductId = variant.stripeProductId ?? undefined;
    if (!stripeProductId) {
      const product = await stripe.products.create(
        {
          name:
            variant.title === "Default"
              ? input.item.title
              : `${input.item.title} · ${variant.title}`,
          description:
            input.item.shortSummary ?? input.item.description ?? undefined,
          tax_code: input.item.stripeTaxCode ?? undefined,
          metadata: {
            dunaOrganizationId: input.organizationId,
            dunaCatalogItemId: input.item.id,
            dunaCatalogVariantId: variant.id,
          },
        },
        {
          idempotencyKey: `catalog-product:${variant.id}`,
        },
      );
      stripeProductId = product.id;
      await database
        .update(catalogVariants)
        .set({ stripeProductId, updatedAt: input.now })
        .where(eq(catalogVariants.id, variant.id));
    }
    for (const price of variantPrices) {
      if (price.stripePriceId) continue;
      if (price.amountMinor === null || !price.currency) {
        throw new Error("Card price is missing its amount or currency.");
      }
      const recurring:
        | {
            interval: "week" | "month" | "year";
            interval_count: number;
          }
        | undefined =
        price.recurringInterval === "week" ||
        price.recurringInterval === "month" ||
        price.recurringInterval === "year"
          ? {
              interval: price.recurringInterval,
              interval_count: price.recurringIntervalCount ?? 1,
            }
          : undefined;
      const stripePrice = await stripe.prices.create(
        {
          product: stripeProductId,
          currency: price.currency.toLowerCase(),
          unit_amount: price.amountMinor,
          tax_behavior:
            price.taxBehavior === "inclusive" ? "inclusive" : "exclusive",
          recurring,
          nickname:
            price.audience === "everyone"
              ? input.item.title
              : `${input.item.title} · ${price.audience}`,
          metadata: {
            dunaOrganizationId: input.organizationId,
            dunaCatalogItemId: input.item.id,
            dunaCatalogVariantId: variant.id,
            dunaCatalogPriceId: price.id,
            dunaAudience: price.audience,
          },
        },
        {
          idempotencyKey: `catalog-price:${price.id}`,
        },
      );
      await database
        .update(catalogPrices)
        .set({ stripePriceId: stripePrice.id, updatedAt: input.now })
        .where(eq(catalogPrices.id, price.id));
      if (
        input.item.type === "plan" &&
        input.item.subtype === "membership" &&
        recurring
      ) {
        const tierCode = `${input.item.slug}-${price.audience}`.slice(0, 64);
        const benefits = Array.isArray(input.item.configuration.benefits)
          ? input.item.configuration.benefits.filter(
              (benefit): benefit is string => typeof benefit === "string",
            )
          : [];
        const existingTier = await database.query.membershipTiers.findFirst({
          where: and(
            eq(membershipTiers.organizationId, input.organizationId),
            eq(membershipTiers.code, tierCode),
          ),
        });
        if (existingTier) {
          await database
            .update(membershipTiers)
            .set({
              name: input.item.title,
              priceMinor: price.amountMinor,
              currency: price.currency,
              interval: recurring.interval,
              stripePriceId: stripePrice.id,
              benefits,
              active: true,
              updatedAt: input.now,
            })
            .where(eq(membershipTiers.id, existingTier.id));
        } else {
          await database.insert(membershipTiers).values({
            organizationId: input.organizationId,
            code: tierCode,
            name: input.item.title,
            priceMinor: price.amountMinor,
            currency: price.currency,
            interval: recurring.interval,
            stripePriceId: stripePrice.id,
            benefits,
          });
        }
      }
    }
  }
}

export async function setCatalogItemStatus(input: {
  readonly actor: ApiActor;
  readonly catalogItemId: string;
  readonly status: "draft" | "active" | "archived";
  readonly confirmed: true;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const database = getDatabase();
  const [organization, item] = await Promise.all([
    database.query.organizations.findFirst({
      where: eq(organizations.id, organizationId),
    }),
    database.query.catalogItems.findFirst({
      where: and(
        eq(catalogItems.id, input.catalogItemId),
        eq(catalogItems.organizationId, organizationId),
      ),
    }),
  ]);
  if (!organization || !item) {
    throw new Error("Product was not found in this organization.");
  }

  if (input.status === "active") {
    const [variants, prices, entitlements] = await Promise.all([
      database
        .select()
        .from(catalogVariants)
        .where(
          and(
            eq(catalogVariants.catalogItemId, item.id),
            eq(catalogVariants.status, "active"),
          ),
        ),
      database
        .select()
        .from(catalogPrices)
        .where(
          and(
            eq(catalogPrices.catalogItemId, item.id),
            eq(catalogPrices.active, true),
          ),
        ),
      database
        .select()
        .from(catalogEntitlements)
        .where(eq(catalogEntitlements.planCatalogItemId, item.id)),
    ]);
    if (variants.length === 0 || prices.length === 0) {
      throw new Error("Add an active variant and price before publishing.");
    }
    if (
      item.allowCard &&
      (!organization.stripeAccountId || !organization.stripeChargesEnabled)
    ) {
      throw new Error(
        "Finish payment setup before publishing a product that accepts cards.",
      );
    }
    const configuredVenueId =
      typeof item.configuration.venueId === "string"
        ? item.configuration.venueId
        : undefined;
    const taxVenue = configuredVenueId
      ? await database.query.venues.findFirst({
          where: and(
            eq(venues.id, configuredVenueId),
            eq(venues.organizationId, organizationId),
          ),
        })
      : undefined;
    if (item.configuration.deliveryMode === "venue" && !taxVenue) {
      throw new Error(
        "Choose an active organization venue before publishing this in-person product.",
      );
    }
    const taxableLocation = taxVenue ?? organization;
    if (
      item.taxable &&
      (!taxableLocation.addressLine1 ||
        !taxableLocation.locality ||
        !taxableLocation.administrativeArea ||
        !taxableLocation.postalCode)
    ) {
      throw new Error(
        taxVenue
          ? "Complete the venue address before publishing this taxable product."
          : "Complete the organization tax address before publishing a taxable product.",
      );
    }
    if (
      item.type === "plan" &&
      item.subtype === "membership" &&
      item.allowCard &&
      (!prices.some((price) => price.paymentKind === "card") ||
        prices
          .filter((price) => price.paymentKind === "card")
          .some(
            (price) =>
              price.recurringInterval !== "month" &&
              price.recurringInterval !== "year",
          ))
    ) {
      throw new Error(
        "Every card price on a membership must bill monthly or annually.",
      );
    }
    if (
      item.type === "plan" &&
      item.subtype === "credit-pack" &&
      !entitlements.some(
        (entitlement) =>
          entitlement.kind === "credit-grant" &&
          (entitlement.quantity ?? 0) > 0,
      )
    ) {
      throw new Error("Set how many organization credits this pack grants.");
    }
    if (item.allowCard) {
      await ensureCatalogStripeResources({
        organizationId,
        item,
        variants,
        prices,
        now: input.now,
      });
    }
  }

  const before = {
    status: item.status,
    publishedAt: item.publishedAt?.toISOString(),
    archivedAt: item.archivedAt?.toISOString(),
  };
  const next = {
    status: input.status,
    publishedAt:
      input.status === "active"
        ? (item.publishedAt ?? input.now)
        : item.publishedAt,
    archivedAt: input.status === "archived" ? input.now : null,
    updatedAt: input.now,
  } as const;
  await database.batch([
    database
      .update(catalogItems)
      .set(next)
      .where(
        and(
          eq(catalogItems.id, item.id),
          eq(catalogItems.organizationId, organizationId),
        ),
      ),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: `catalog.item_${input.status}`,
      entityType: "catalog-item",
      entityId: item.id,
      beforeHash: stableHash(before),
      afterHash: stableHash(next),
      reason:
        input.status === "active"
          ? "Operator confirmed publication after commerce readiness checks."
          : input.status === "archived"
            ? "Operator archived the product."
            : "Operator returned the product to draft.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { id: item.id, entity: "catalog-item", status: input.status };
}

export async function createInventoryStock(input: {
  readonly actor: ApiActor;
  readonly catalogVariantId: string;
  readonly inventoryLocationId?: string;
  readonly locationName?: string;
  readonly venueId?: string;
  readonly purpose: "sale" | "rental" | "coach-use" | "operations";
  readonly trackingMode: "quantity" | "serialized";
  readonly quantity: number;
  readonly reorderPoint: number;
  readonly serialNumber?: string;
  readonly assetTag?: string;
  readonly condition: string;
  readonly unitCostMinor?: number;
  readonly acquiredAt?: string;
  readonly vendorName?: string;
  readonly vendorReference?: string;
  readonly receiptUrl?: string;
  readonly placedInServiceAt?: string;
  readonly depreciationMethod?:
    "straight-line" | "declining-balance" | "section-179" | "bonus" | "none";
  readonly usefulLifeMonths?: number;
  readonly salvageValueMinor?: number;
  readonly taxAssetClass?: string;
  readonly notes?: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const database = getDatabase();
  const [organization, variant] = await Promise.all([
    database.query.organizations.findFirst({
      where: eq(organizations.id, organizationId),
    }),
    database
      .select({
        variant: catalogVariants,
        item: catalogItems,
      })
      .from(catalogVariants)
      .innerJoin(
        catalogItems,
        eq(catalogVariants.catalogItemId, catalogItems.id),
      )
      .where(eq(catalogVariants.id, input.catalogVariantId))
      .limit(1)
      .then((rows) => rows[0]),
  ]);
  if (!organization) throw new Error("Organization was not found.");
  if (!variant || variant.item.organizationId !== organizationId) {
    throw new Error("Catalog variant was not found in this organization.");
  }
  if (variant.item.type !== "good") {
    throw new Error("Only goods can be added to inventory.");
  }
  if (input.trackingMode === "serialized" && input.quantity !== 1) {
    throw new Error("Serialized equipment must be added one asset at a time.");
  }
  let locationId = input.inventoryLocationId;
  if (locationId) {
    const location = await database.query.inventoryLocations.findFirst({
      where: eq(inventoryLocations.id, locationId),
    });
    if (!location || location.organizationId !== organizationId) {
      throw new Error("Inventory location was not found.");
    }
  } else {
    const locationName = input.locationName?.trim() || "Main inventory";
    const existing = await database.query.inventoryLocations.findFirst({
      where: and(
        eq(inventoryLocations.organizationId, organizationId),
        eq(inventoryLocations.name, locationName),
      ),
    });
    locationId = existing?.id ?? crypto.randomUUID();
    if (!existing) {
      await database.insert(inventoryLocations).values({
        id: locationId,
        organizationId,
        venueId: input.venueId,
        name: locationName,
        kind: input.venueId ? "venue" : "warehouse",
      });
    }
  }
  const id = crypto.randomUUID();
  const movementId = crypto.randomUUID();
  const values = {
    catalogVariantId: input.catalogVariantId,
    inventoryLocationId: locationId,
    purpose: input.purpose,
    trackingMode: input.trackingMode,
    quantityOnHand: input.quantity,
    quantityReserved: 0,
    reorderPoint: input.reorderPoint,
    serialNumber: input.serialNumber?.trim() || undefined,
    assetTag: input.assetTag?.trim() || undefined,
    condition: input.condition.trim() || "good",
    unitCostMinor: input.unitCostMinor,
    currency:
      input.unitCostMinor === undefined ? undefined : organization.currency,
    acquiredAt: input.acquiredAt,
    vendorName: input.vendorName?.trim() || undefined,
    vendorReference: input.vendorReference?.trim() || undefined,
    receiptUrl: input.receiptUrl?.trim() || undefined,
    placedInServiceAt: input.placedInServiceAt,
    depreciationMethod: input.depreciationMethod,
    usefulLifeMonths: input.usefulLifeMonths,
    salvageValueMinor: input.salvageValueMinor,
    taxAssetClass: input.taxAssetClass?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
  };
  await database.batch([
    database.insert(inventoryStockItems).values({
      id,
      organizationId,
      ...values,
    }),
    database.insert(inventoryMovements).values({
      id: movementId,
      organizationId,
      inventoryStockItemId: id,
      kind: "receive",
      quantityDelta: input.quantity,
      unitCostMinor: input.unitCostMinor,
      currency:
        input.unitCostMinor === undefined ? undefined : organization.currency,
      sourceType: "operator-intake",
      sourceId: id,
      idempotencyKey: input.requestId,
      actorPersonId: input.actor.personId,
      reason: "Initial inventory receipt.",
      occurredAt: input.now,
    }),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "inventory.stock_received",
      entityType: "inventory-item",
      entityId: id,
      afterHash: stableHash(values),
      reason:
        "Operator recorded equipment or goods inventory with acquisition details.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { id, entity: "inventory-item", status: "active" };
}

export async function updateOrganizationCommerceSettings(input: {
  readonly actor: ApiActor;
  readonly legalName?: string;
  readonly addressLine1: string;
  readonly addressLine2?: string;
  readonly locality: string;
  readonly administrativeArea: string;
  readonly postalCode: string;
  readonly countryCode: string;
  readonly googlePlaceId?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly stripeTaxEnabled: boolean;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const database = getDatabase();
  const organization = await database.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });
  if (!organization) throw new Error("Organization was not found.");
  if (input.stripeTaxEnabled && !organization.stripeChargesEnabled) {
    throw new Error(
      "Finish payment onboarding before turning on automatic tax.",
    );
  }
  const values = {
    legalName: input.legalName?.trim() || undefined,
    addressLine1: input.addressLine1.trim(),
    addressLine2: input.addressLine2?.trim() || undefined,
    locality: input.locality.trim(),
    administrativeArea: input.administrativeArea.trim(),
    postalCode: input.postalCode.trim(),
    countryCode: input.countryCode.toUpperCase(),
    googlePlaceId: input.googlePlaceId?.trim() || undefined,
    latitude: input.latitude,
    longitude: input.longitude,
    stripeTaxEnabled: input.stripeTaxEnabled,
    taxRegistrationStatus: input.stripeTaxEnabled
      ? ("pending" as const)
      : ("not-configured" as const),
  };
  await database.batch([
    database
      .update(organizations)
      .set({ ...values, updatedAt: input.now })
      .where(eq(organizations.id, organizationId)),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "organization.commerce_settings_updated",
      entityType: "organization-settings",
      entityId: organizationId,
      beforeHash: stableHash({
        legalName: organization.legalName,
        addressLine1: organization.addressLine1,
        addressLine2: organization.addressLine2,
        locality: organization.locality,
        administrativeArea: organization.administrativeArea,
        postalCode: organization.postalCode,
        countryCode: organization.countryCode,
        stripeTaxEnabled: organization.stripeTaxEnabled,
        taxRegistrationStatus: organization.taxRegistrationStatus,
      }),
      afterHash: stableHash(values),
      reason:
        "Operator confirmed the organization address and automatic-tax preference.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return {
    id: organizationId,
    entity: "organization-settings",
    status: input.stripeTaxEnabled ? "pending" : "saved",
  };
}

export async function updateOrganizationTheme(input: {
  readonly actor: ApiActor;
  readonly logoUrl?: string;
  readonly heroMediaType?: "image" | "video";
  readonly heroMediaUrl?: string;
  readonly heroPosterUrl?: string;
  readonly tagline?: string;
  readonly profileSummary?: string;
  readonly palette: OperatorWorkspace["theme"]["palette"];
  readonly cardStyle: "soft" | "crisp" | "borderless";
  readonly publish: boolean;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const database = getDatabase();
  const current = await database.query.organizationThemes.findFirst({
    where: eq(organizationThemes.organizationId, organizationId),
  });
  const values = {
    logoUrl: input.logoUrl?.trim() || undefined,
    heroMediaType: input.heroMediaType,
    heroMediaUrl: input.heroMediaUrl?.trim() || undefined,
    heroPosterUrl: input.heroPosterUrl?.trim() || undefined,
    tagline: input.tagline?.trim() || undefined,
    profileSummary: input.profileSummary?.trim() || undefined,
    palette: input.palette,
    typography: DEFAULT_THEME.typography,
    cardStyle: input.cardStyle,
    profileLayout: "editorial",
    publishedAt: input.publish ? input.now : current?.publishedAt,
    updatedAt: input.now,
  };
  await database.batch([
    database
      .insert(organizationThemes)
      .values({ organizationId, ...values })
      .onConflictDoUpdate({
        target: organizationThemes.organizationId,
        set: values,
      }),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: input.publish
        ? "organization.theme_published"
        : "organization.theme_saved",
      entityType: "organization-theme",
      entityId: organizationId,
      beforeHash: current ? stableHash(current) : undefined,
      afterHash: stableHash(values),
      reason: input.publish
        ? "Operator confirmed the player-facing Theme Kit."
        : "Operator saved a private Theme Kit draft.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return {
    id: organizationId,
    entity: "organization-theme",
    status: input.publish ? "published" : "draft",
  };
}

export async function ensureLedgerAccount(input: {
  readonly organizationId: string;
  readonly ownerPersonId?: string;
  readonly code: string;
  readonly name: string;
  readonly accountType:
    "asset" | "liability" | "equity" | "revenue" | "expense" | "memo";
  readonly normalSide: "debit" | "credit";
  readonly unitKind: "money" | "organization-credit";
  readonly unit: string;
  readonly currency?: string;
}): Promise<string> {
  const database = getDatabase();
  const existing = await database.query.ledgerAccounts.findFirst({
    where: and(
      eq(ledgerAccounts.organizationId, input.organizationId),
      eq(ledgerAccounts.code, input.code),
      input.ownerPersonId
        ? eq(ledgerAccounts.ownerPersonId, input.ownerPersonId)
        : sql`${ledgerAccounts.ownerPersonId} IS NULL`,
    ),
  });
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await database
    .insert(ledgerAccounts)
    .values({ id, ...input })
    .onConflictDoNothing();
  const inserted = await database.query.ledgerAccounts.findFirst({
    where: and(
      eq(ledgerAccounts.organizationId, input.organizationId),
      eq(ledgerAccounts.code, input.code),
      input.ownerPersonId
        ? eq(ledgerAccounts.ownerPersonId, input.ownerPersonId)
        : sql`${ledgerAccounts.ownerPersonId} IS NULL`,
    ),
  });
  if (!inserted) throw new Error("Ledger account could not be created.");
  return inserted.id;
}

export async function issueOrganizationCredits(input: {
  readonly actor: ApiActor;
  readonly personId: string;
  readonly credits: number;
  readonly expiresAt?: Date;
  readonly valueMinor?: number;
  readonly currency?: string;
  readonly valueSource?: "paid-credit-pack" | "refund-credit";
  readonly sourceOrderId?: string;
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const database = getDatabase();
  const relationship = await database
    .select({ personId: people.id })
    .from(people)
    .leftJoin(
      organizationParticipants,
      and(
        eq(organizationParticipants.personId, people.id),
        eq(organizationParticipants.organizationId, organizationId),
      ),
    )
    .leftJoin(
      organizationMemberships,
      and(
        eq(organizationMemberships.personId, people.id),
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.active, true),
      ),
    )
    .where(
      and(
        eq(people.id, input.personId),
        or(
          sql`${organizationParticipants.id} IS NOT NULL`,
          sql`${organizationMemberships.id} IS NOT NULL`,
        ),
      ),
    )
    .limit(1);
  if (!relationship[0]) {
    throw new Error("This person is not connected to the organization.");
  }
  const valueMinor = input.valueMinor ?? 0;
  if (!Number.isSafeInteger(valueMinor) || valueMinor < 0) {
    throw new Error("Credit carrying value must be a nonnegative amount.");
  }
  if (
    (valueMinor > 0 &&
      (!input.currency || !/^[A-Z]{3}$/.test(input.currency))) ||
    (valueMinor === 0 && input.currency)
  ) {
    throw new Error(
      "Valued credits require an uppercase currency; promotional credits do not carry cash value.",
    );
  }
  if (valueMinor > 0 && !input.valueSource) {
    throw new Error("Valued credits require an accounting source.");
  }
  const unit = `${organizationId}:CREDIT`;
  const [
    controlAccountId,
    walletAccountId,
    refundExpenseId,
    deferredRevenueId,
  ] = await Promise.all([
    ensureLedgerAccount({
      organizationId,
      code: "CREDIT_ISSUANCE_CONTROL",
      name: "Credit issuance control",
      accountType: "memo",
      normalSide: "debit",
      unitKind: "organization-credit",
      unit,
    }),
    ensureLedgerAccount({
      organizationId,
      ownerPersonId: input.personId,
      code: `MEMBER_CREDITS_${input.personId}`,
      name: "Member credit wallet",
      accountType: "liability",
      normalSide: "credit",
      unitKind: "organization-credit",
      unit,
    }),
    input.valueSource === "refund-credit" && input.currency
      ? ensureLedgerAccount({
          organizationId,
          code: "REFUNDS_AND_RETURNS",
          name: "Refunds and returns",
          accountType: "expense",
          normalSide: "debit",
          unitKind: "money",
          unit: input.currency,
          currency: input.currency,
        })
      : Promise.resolve(undefined),
    input.valueSource === "refund-credit" && input.currency
      ? ensureLedgerAccount({
          organizationId,
          code: "DEFERRED_CREDIT_REVENUE",
          name: "Deferred organization-credit revenue",
          accountType: "liability",
          normalSide: "credit",
          unitKind: "money",
          unit: input.currency,
          currency: input.currency,
        })
      : Promise.resolve(undefined),
  ]);
  let wallet = await database.query.organizationWallets.findFirst({
    where: and(
      eq(organizationWallets.organizationId, organizationId),
      eq(organizationWallets.personId, input.personId),
    ),
  });
  if (!wallet) {
    const walletId = crypto.randomUUID();
    await database
      .insert(organizationWallets)
      .values({
        id: walletId,
        organizationId,
        personId: input.personId,
        creditLedgerAccountId: walletAccountId,
        unit,
      })
      .onConflictDoNothing();
    wallet = await database.query.organizationWallets.findFirst({
      where: and(
        eq(organizationWallets.organizationId, organizationId),
        eq(organizationWallets.personId, input.personId),
      ),
    });
  }
  if (!wallet) throw new Error("Organization wallet could not be created.");
  const journalId = crypto.randomUUID();
  const postings: LedgerPosting[] = [
    {
      accountId: controlAccountId,
      side: "debit",
      amount: input.credits,
      unit,
      unitKind: "organization-credit",
    },
    {
      accountId: walletAccountId,
      side: "credit",
      amount: input.credits,
      unit,
      unitKind: "organization-credit",
    },
  ];
  if (
    input.valueSource === "refund-credit" &&
    valueMinor > 0 &&
    input.currency &&
    refundExpenseId &&
    deferredRevenueId
  ) {
    postings.push(
      {
        accountId: refundExpenseId,
        side: "debit",
        amount: valueMinor,
        unit: input.currency,
        unitKind: "money",
        currency: input.currency,
      },
      {
        accountId: deferredRevenueId,
        side: "credit",
        amount: valueMinor,
        unit: input.currency,
        unitKind: "money",
        currency: input.currency,
      },
    );
  }
  assertBalancedJournal(postings);
  const grantId = crypto.randomUUID();
  await database.batch([
    database.insert(ledgerJournals).values({
      id: journalId,
      organizationId,
      idempotencyKey: input.requestId,
      sourceType: "manual-credit-adjustment",
      sourceId: grantId,
      description: input.reason,
      status: "draft",
      actorPersonId: input.actor.personId,
      occurredAt: input.now,
      metadata: {
        personId: input.personId,
        credits: input.credits,
        valueMinor,
        currency: input.currency,
        valueSource: input.valueSource,
        sourceOrderId: input.sourceOrderId,
        expiresAt: input.expiresAt?.toISOString(),
      },
    }),
    database.insert(ledgerEntries).values(
      postings.map((posting, sequence) => ({
        id: crypto.randomUUID(),
        organizationId,
        journalId,
        sequence,
        ...posting,
      })),
    ),
    database
      .update(ledgerJournals)
      .set({ status: "posted", postedAt: input.now })
      .where(eq(ledgerJournals.id, journalId)),
    database.insert(organizationCreditGrants).values({
      id: grantId,
      organizationId,
      organizationWalletId: wallet.id,
      sourceJournalId: journalId,
      sourceOrderId: input.sourceOrderId,
      initialCredits: input.credits,
      remainingCredits: input.credits,
      initialValueMinor: valueMinor,
      remainingValueMinor: valueMinor,
      currency: valueMinor > 0 ? input.currency : undefined,
      expiresAt: input.expiresAt,
    }),
    database
      .update(organizationWallets)
      .set({
        cachedAvailableCredits: wallet.cachedAvailableCredits + input.credits,
        cachedAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(organizationWallets.id, wallet.id)),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "wallet.organization_credits_issued",
      entityType: "credit-adjustment",
      entityId: grantId,
      afterHash: stableHash({
        personId: input.personId,
        credits: input.credits,
        valueMinor,
        currency: input.currency,
        valueSource: input.valueSource,
        sourceOrderId: input.sourceOrderId,
        expiresAt: input.expiresAt?.toISOString(),
        journalId,
      }),
      reason: input.reason,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { id: grantId, entity: "credit-adjustment", status: "posted" };
}

export async function proposeCalendarChange(input: {
  readonly actor: ApiActor;
  readonly sessionId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly courtId?: string;
  readonly coachPersonId?: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const database = getDatabase();
  const session = await database
    .select({
      session: sessions,
      organizationId: sql<string>`coalesce(${programs.organizationId}, ${eventTypes.organizationId}, ${venues.organizationId})`,
    })
    .from(sessions)
    .leftJoin(programs, eq(sessions.programId, programs.id))
    .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
    .leftJoin(venues, eq(sessions.venueId, venues.id))
    .where(eq(sessions.id, input.sessionId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!session || session.organizationId !== organizationId) {
    throw new Error("Session was not found in this organization.");
  }
  if (input.endsAt <= input.startsAt || input.startsAt <= input.now) {
    throw new Error("The proposed time must be in the future and end later.");
  }
  const resourceCandidates = [
    input.courtId ? { type: "court" as const, id: input.courtId } : undefined,
    input.coachPersonId
      ? { type: "coach" as const, id: input.coachPersonId }
      : undefined,
  ].filter(
    (value): value is { type: "court" | "coach"; id: string } =>
      value !== undefined,
  );
  const conflicts: string[] = [];
  for (const resource of resourceCandidates) {
    const existing = await database
      .select({ id: resourceReservations.id })
      .from(resourceReservations)
      .where(
        and(
          eq(resourceReservations.organizationId, organizationId),
          eq(resourceReservations.resourceType, resource.type),
          eq(resourceReservations.resourceId, resource.id),
          inArray(resourceReservations.status, ["held", "confirmed"]),
          lt(resourceReservations.startsAt, input.endsAt),
          gt(resourceReservations.endsAt, input.startsAt),
          sql`${resourceReservations.sourceId} <> ${input.sessionId}`,
        ),
      )
      .limit(1);
    if (existing[0]) conflicts.push(`${resource.type} is already reserved`);
  }
  const notificationCount = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(registrations)
    .where(
      and(
        eq(registrations.sessionId, input.sessionId),
        inArray(registrations.status, [
          "confirmed",
          "waitlisted",
          "checked-in",
        ]),
      ),
    )
    .then((rows) => rows[0]?.count ?? 0);
  const proposalId = crypto.randomUUID();
  const conflictSummary = {
    conflicts,
    notifications: notificationCount,
    reservations: resourceCandidates.length,
  };
  await database.batch([
    database.insert(calendarChangeProposals).values({
      id: proposalId,
      organizationId,
      sessionId: input.sessionId,
      originalStartsAt: session.session.startsAt,
      originalEndsAt: session.session.endsAt,
      proposedStartsAt: input.startsAt,
      proposedEndsAt: input.endsAt,
      proposedCourtId: input.courtId,
      proposedCoachPersonId: input.coachPersonId,
      conflictSummary,
      createdByPersonId: input.actor.personId,
      expiresAt: new Date(input.now.getTime() + 30 * 60_000),
    }),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "calendar.change_proposed",
      entityType: "calendar-change",
      entityId: proposalId,
      beforeHash: stableHash({
        startsAt: session.session.startsAt,
        endsAt: session.session.endsAt,
        courtId: session.session.courtId,
        coachPersonId: session.session.coachPersonId,
      }),
      afterHash: stableHash({
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        courtId: input.courtId,
        coachPersonId: input.coachPersonId,
        conflictSummary,
      }),
      reason:
        "Operator dragged or edited a calendar item; no schedule changed yet.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return {
    id: proposalId,
    entity: "calendar-change",
    status: conflicts.length === 0 ? "ready-to-confirm" : "conflict",
  };
}

export async function confirmCalendarChange(input: {
  readonly actor: ApiActor;
  readonly proposalId: string;
  readonly confirmed: boolean;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const database = getDatabase();
  const proposal = await database.query.calendarChangeProposals.findFirst({
    where: eq(calendarChangeProposals.id, input.proposalId),
  });
  if (!proposal || proposal.organizationId !== organizationId) {
    throw new Error("Calendar proposal was not found.");
  }
  if (!input.confirmed) throw new Error("Confirm the calendar change.");
  if (proposal.status !== "proposed" || proposal.expiresAt <= input.now) {
    throw new Error("This calendar proposal is no longer active.");
  }
  if (proposal.conflictSummary.conflicts.length > 0) {
    throw new Error(
      "Resolve the resource conflicts before moving this session.",
    );
  }
  const reservations = [
    proposal.proposedCourtId
      ? {
          type: "court" as const,
          id: proposal.proposedCourtId,
        }
      : undefined,
    proposal.proposedCoachPersonId
      ? {
          type: "coach" as const,
          id: proposal.proposedCoachPersonId,
        }
      : undefined,
  ].filter(
    (value): value is { type: "court" | "coach"; id: string } =>
      value !== undefined,
  );
  await database.batch([
    database
      .update(resourceReservations)
      .set({ status: "released", updatedAt: input.now })
      .where(
        and(
          eq(resourceReservations.organizationId, organizationId),
          eq(resourceReservations.sourceType, "session"),
          eq(resourceReservations.sourceId, proposal.sessionId),
          inArray(resourceReservations.status, ["held", "confirmed"]),
        ),
      ),
    reservations.length > 0
      ? database.insert(resourceReservations).values(
          reservations.map((reservation) => ({
            id: crypto.randomUUID(),
            organizationId,
            resourceType: reservation.type,
            resourceId: reservation.id,
            startsAt: proposal.proposedStartsAt,
            endsAt: proposal.proposedEndsAt,
            sourceType: "session",
            sourceId: proposal.sessionId,
            status: "confirmed" as const,
            idempotencyKey: `${input.requestId}:${reservation.type}`,
          })),
        )
      : database
          .update(sessions)
          .set({ updatedAt: input.now })
          .where(sql`false`),
    database
      .update(sessions)
      .set({
        startsAt: proposal.proposedStartsAt,
        endsAt: proposal.proposedEndsAt,
        courtId: proposal.proposedCourtId,
        coachPersonId: proposal.proposedCoachPersonId,
        updatedAt: input.now,
      })
      .where(eq(sessions.id, proposal.sessionId)),
    database
      .update(calendarChangeProposals)
      .set({
        status: "confirmed",
        confirmedAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(calendarChangeProposals.id, proposal.id)),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "calendar.change_confirmed",
      entityType: "calendar-change",
      entityId: proposal.id,
      afterHash: stableHash({
        sessionId: proposal.sessionId,
        startsAt: proposal.proposedStartsAt,
        endsAt: proposal.proposedEndsAt,
        courtId: proposal.proposedCourtId,
        coachPersonId: proposal.proposedCoachPersonId,
        notificationCount: proposal.conflictSummary.notifications,
      }),
      reason:
        "Operator confirmed the time, resource reservations, and notification impact.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return {
    id: proposal.id,
    entity: "calendar-change",
    status: "confirmed",
  };
}

async function postFullCatalogOrderReversal(input: {
  readonly organizationId: string;
  readonly orderId: string;
  readonly refundId: string;
  readonly actorPersonId: string;
  readonly requestId: string;
  readonly reason: string;
  readonly now: Date;
}): Promise<string | undefined> {
  const database = getDatabase();
  const sourceJournal = await database.query.ledgerJournals.findFirst({
    where: and(
      eq(ledgerJournals.organizationId, input.organizationId),
      eq(ledgerJournals.sourceType, "catalog-order"),
      eq(ledgerJournals.sourceId, input.orderId),
      eq(ledgerJournals.status, "posted"),
    ),
  });
  if (!sourceJournal) return undefined;
  const sourceEntries = await database
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.journalId, sourceJournal.id))
    .orderBy(asc(ledgerEntries.sequence));
  const reversed = reverseLedgerPostings(
    sourceEntries.map((entry): LedgerPosting => ({
      accountId: entry.accountId,
      side: entry.side,
      amount: entry.amount,
      unit: entry.unit,
      unitKind: entry.unitKind,
      currency: entry.currency ?? undefined,
    })),
  );
  const journalId = crypto.randomUUID();
  await database.batch([
    database.insert(ledgerJournals).values({
      id: journalId,
      organizationId: input.organizationId,
      idempotencyKey: input.requestId,
      sourceType: "refund",
      sourceId: input.refundId,
      description: `Full catalog-order reversal · ${input.reason}`,
      status: "draft",
      reversalOfJournalId: sourceJournal.id,
      actorPersonId: input.actorPersonId,
      occurredAt: input.now,
      metadata: {
        orderId: input.orderId,
        originalJournalId: sourceJournal.id,
      },
    }),
    database.insert(ledgerEntries).values(
      reversed.map((posting, sequence) => ({
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        journalId,
        sequence,
        ...posting,
      })),
    ),
    database
      .update(ledgerJournals)
      .set({ status: "posted", postedAt: input.now })
      .where(eq(ledgerJournals.id, journalId)),
  ]);
  return journalId;
}

async function assertUnusedCreditPackIsRefundable(input: {
  readonly organizationId: string;
  readonly orderId: string;
}): Promise<typeof organizationCreditGrants.$inferSelect> {
  const grant = await getDatabase().query.organizationCreditGrants.findFirst({
    where: and(
      eq(organizationCreditGrants.organizationId, input.organizationId),
      eq(organizationCreditGrants.sourceOrderId, input.orderId),
    ),
  });
  if (
    !grant ||
    grant.status !== "active" ||
    grant.remainingCredits !== grant.initialCredits ||
    grant.remainingValueMinor !== grant.initialValueMinor
  ) {
    throw new Error(
      "Credit packs can only be returned to the original payment before any credits are used.",
    );
  }
  return grant;
}

async function reverseUnusedCreditPackGrant(input: {
  readonly organizationId: string;
  readonly orderId: string;
  readonly refundId: string;
  readonly actorPersonId: string;
  readonly requestId: string;
  readonly reason: string;
  readonly now: Date;
}): Promise<string> {
  const database = getDatabase();
  const grant = await assertUnusedCreditPackIsRefundable(input);
  const wallet = await database.query.organizationWallets.findFirst({
    where: and(
      eq(organizationWallets.id, grant.organizationWalletId),
      eq(organizationWallets.organizationId, input.organizationId),
    ),
  });
  if (!wallet) throw new Error("The organization credit wallet was not found.");
  const sourceEntries = await database
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.journalId, grant.sourceJournalId))
    .orderBy(asc(ledgerEntries.sequence));
  const reversed = reverseLedgerPostings(
    sourceEntries.map((entry): LedgerPosting => ({
      accountId: entry.accountId,
      side: entry.side,
      amount: entry.amount,
      unit: entry.unit,
      unitKind: entry.unitKind,
      currency: entry.currency ?? undefined,
    })),
  );
  const journalId = crypto.randomUUID();
  await database.batch([
    database.insert(ledgerJournals).values({
      id: journalId,
      organizationId: input.organizationId,
      idempotencyKey: input.requestId,
      sourceType: "refund",
      sourceId: input.refundId,
      description: `Credit-pack grant reversal · ${input.reason}`,
      status: "draft",
      reversalOfJournalId: grant.sourceJournalId,
      actorPersonId: input.actorPersonId,
      occurredAt: input.now,
      metadata: {
        orderId: input.orderId,
        creditGrantId: grant.id,
        originalJournalId: grant.sourceJournalId,
      },
    }),
    database.insert(ledgerEntries).values(
      reversed.map((posting, sequence) => ({
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        journalId,
        sequence,
        ...posting,
      })),
    ),
    database
      .update(ledgerJournals)
      .set({ status: "posted", postedAt: input.now })
      .where(eq(ledgerJournals.id, journalId)),
    database
      .update(organizationCreditGrants)
      .set({
        status: "reversed",
        remainingCredits: 0,
        remainingValueMinor: 0,
        updatedAt: input.now,
      })
      .where(eq(organizationCreditGrants.id, grant.id)),
    database
      .update(organizationWallets)
      .set({
        cachedAvailableCredits: Math.max(
          0,
          wallet.cachedAvailableCredits - grant.initialCredits,
        ),
        cachedAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(organizationWallets.id, wallet.id)),
  ]);
  return journalId;
}

async function postMoneyRefundJournal(input: {
  readonly organizationId: string;
  readonly actorPersonId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly refundId: string;
  readonly requestId: string;
  readonly reason: string;
  readonly now: Date;
}): Promise<string> {
  const [refundExpenseId, stripeClearingId] = await Promise.all([
    ensureLedgerAccount({
      organizationId: input.organizationId,
      code: "REFUNDS_AND_RETURNS",
      name: "Refunds and returns",
      accountType: "expense",
      normalSide: "debit",
      unitKind: "money",
      unit: input.currency,
      currency: input.currency,
    }),
    ensureLedgerAccount({
      organizationId: input.organizationId,
      code: "STRIPE_CLEARING",
      name: "Payment processor clearing",
      accountType: "asset",
      normalSide: "debit",
      unitKind: "money",
      unit: input.currency,
      currency: input.currency,
    }),
  ]);
  const journalId = crypto.randomUUID();
  const postings: readonly LedgerPosting[] = [
    {
      accountId: refundExpenseId,
      side: "debit",
      amount: input.amountMinor,
      unit: input.currency,
      unitKind: "money",
      currency: input.currency,
    },
    {
      accountId: stripeClearingId,
      side: "credit",
      amount: input.amountMinor,
      unit: input.currency,
      unitKind: "money",
      currency: input.currency,
    },
  ];
  assertBalancedJournal(postings);
  const database = getDatabase();
  await database.batch([
    database.insert(ledgerJournals).values({
      id: journalId,
      organizationId: input.organizationId,
      idempotencyKey: input.requestId,
      sourceType: "refund",
      sourceId: input.refundId,
      description: input.reason,
      status: "draft",
      actorPersonId: input.actorPersonId,
      occurredAt: input.now,
    }),
    database.insert(ledgerEntries).values(
      postings.map((posting, sequence) => ({
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        journalId,
        sequence,
        ...posting,
      })),
    ),
    database
      .update(ledgerJournals)
      .set({ status: "posted", postedAt: input.now })
      .where(eq(ledgerJournals.id, journalId)),
  ]);
  return journalId;
}

export async function refundOrganizationOrder(input: {
  readonly actor: ApiActor;
  readonly orderId: string;
  readonly amountMinor: number;
  readonly disposition: "original-payment" | "organization-credit";
  readonly credits?: number;
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const database = getDatabase();
  const order = await database.query.orders.findFirst({
    where: eq(orders.id, input.orderId),
  });
  if (!order || order.organizationId !== organizationId) {
    throw new Error("Order was not found in this organization.");
  }
  const fulfillment = await database.query.catalogFulfillments.findFirst({
    where: and(
      eq(catalogFulfillments.organizationId, organizationId),
      eq(catalogFulfillments.orderId, order.id),
    ),
  });
  const catalogItem = fulfillment
    ? await database.query.catalogItems.findFirst({
        where: and(
          eq(catalogItems.organizationId, organizationId),
          eq(catalogItems.id, fulfillment.catalogItemId),
        ),
      })
    : undefined;
  if (input.amountMinor <= 0 || input.amountMinor > order.totalMinor) {
    throw new Error(
      "Refund amount must be positive and no more than the order.",
    );
  }
  const refundId = crypto.randomUUID();
  const refunded = await database
    .select({
      amount: sql<number>`coalesce(sum(${refundRecords.amountMinor}), 0)::bigint`,
    })
    .from(refundRecords)
    .where(
      and(
        eq(refundRecords.organizationId, organizationId),
        eq(refundRecords.orderId, order.id),
        inArray(refundRecords.status, ["pending", "succeeded"]),
      ),
    )
    .then((rows) => rows[0]?.amount ?? 0);
  if (refunded + input.amountMinor > order.totalMinor) {
    throw new Error("This refund would exceed the order's remaining balance.");
  }
  const isCreditPack =
    catalogItem?.type === "plan" && catalogItem.subtype === "credit-pack";
  if (isCreditPack) {
    if (
      input.disposition !== "original-payment" ||
      refunded !== 0 ||
      input.amountMinor !== order.totalMinor
    ) {
      throw new Error(
        "Credit packs must be fully returned to the original payment method.",
      );
    }
    await assertUnusedCreditPackIsRefundable({
      organizationId,
      orderId: order.id,
    });
  }
  const nextOrderStatus =
    refunded + input.amountMinor >= order.totalMinor
      ? ("refunded" as const)
      : ("partially-refunded" as const);
  if (input.disposition === "organization-credit") {
    if (!input.credits || input.credits <= 0) {
      throw new Error("Choose how many organization credits to issue.");
    }
    const creditResult = await issueOrganizationCredits({
      actor: input.actor,
      personId: order.buyerPersonId,
      credits: input.credits,
      valueMinor: input.amountMinor,
      currency: order.currency,
      valueSource: "refund-credit",
      sourceOrderId: order.id,
      reason: input.reason,
      requestId: `${input.requestId}:credit`,
      ipAddress: input.ipAddress,
      now: input.now,
    });
    const grant = await database.query.organizationCreditGrants.findFirst({
      where: eq(organizationCreditGrants.id, creditResult.id),
    });
    if (!grant) throw new Error("Credit refund journal could not be found.");
    await database.batch([
      database.insert(refundRecords).values({
        id: refundId,
        organizationId,
        orderId: order.id,
        disposition: "organization-credit",
        amountMinor: input.amountMinor,
        currency: order.currency,
        creditsIssued: input.credits,
        ledgerJournalId: grant.sourceJournalId,
        reason: input.reason,
        status: "succeeded",
        initiatedByPersonId: input.actor.personId,
      }),
      database
        .update(orders)
        .set({ status: nextOrderStatus, updatedAt: input.now })
        .where(eq(orders.id, order.id)),
      nextOrderStatus === "refunded" && fulfillment
        ? database
            .update(catalogFulfillments)
            .set({ status: "refunded", updatedAt: input.now })
            .where(eq(catalogFulfillments.id, fulfillment.id))
        : database
            .update(catalogFulfillments)
            .set({ updatedAt: input.now })
            .where(sql`false`),
      database.insert(auditLog).values({
        organizationId,
        actorPersonId: input.actor.personId,
        actorType: "person",
        action: "order.refunded_to_organization_credit",
        entityType: "refund",
        entityId: refundId,
        afterHash: stableHash({
          orderId: order.id,
          amountMinor: input.amountMinor,
          creditsIssued: input.credits,
          journalId: grant.sourceJournalId,
        }),
        reason: input.reason,
        traceId: input.requestId,
        ipAddress: input.ipAddress,
        createdAt: input.now,
      }),
    ]);
    return { id: refundId, entity: "refund", status: "succeeded" };
  }
  if (!order.stripePaymentIntentId) {
    throw new Error("This order has no original payment to refund.");
  }
  const organization = await database.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });
  const destinationCharge = Boolean(organization?.stripeAccountId);
  const stripeRefund = await refundPayment({
    paymentIntentId: order.stripePaymentIntentId,
    amountMinor: input.amountMinor,
    reason: "requested_by_customer",
    idempotencyKey: input.requestId,
    reverseTransfer: destinationCharge,
    refundApplicationFee: destinationCharge,
  });
  const refundStatus =
    stripeRefund.status === "succeeded"
      ? ("succeeded" as const)
      : stripeRefund.status === "failed" || stripeRefund.status === "canceled"
        ? ("failed" as const)
        : ("pending" as const);
  if (refundStatus === "failed") {
    await database.batch([
      database.insert(refundRecords).values({
        id: refundId,
        organizationId,
        orderId: order.id,
        disposition: "original-payment",
        amountMinor: input.amountMinor,
        currency: order.currency,
        stripeRefundId: stripeRefund.id,
        reason: input.reason,
        status: "failed",
        initiatedByPersonId: input.actor.personId,
      }),
      database.insert(auditLog).values({
        organizationId,
        actorPersonId: input.actor.personId,
        actorType: "person",
        action: "order.refund_failed",
        entityType: "refund",
        entityId: refundId,
        afterHash: stableHash({
          orderId: order.id,
          amountMinor: input.amountMinor,
          stripeRefundId: stripeRefund.id,
        }),
        reason: input.reason,
        traceId: input.requestId,
        ipAddress: input.ipAddress,
        createdAt: input.now,
      }),
    ]);
    return { id: refundId, entity: "refund", status: "failed" };
  }
  if (isCreditPack) {
    await reverseUnusedCreditPackGrant({
      organizationId,
      orderId: order.id,
      refundId,
      actorPersonId: input.actor.personId,
      requestId: `${input.requestId}:credit-grant-reversal`,
      reason: input.reason,
      now: input.now,
    });
  }
  const isUnambiguousFullReversal =
    refunded === 0 && input.amountMinor === order.totalMinor;
  const journalId =
    (isUnambiguousFullReversal
      ? await postFullCatalogOrderReversal({
          organizationId,
          orderId: order.id,
          refundId,
          actorPersonId: input.actor.personId,
          requestId: `${input.requestId}:ledger`,
          reason: input.reason,
          now: input.now,
        })
      : undefined) ??
    (await postMoneyRefundJournal({
      organizationId,
      actorPersonId: input.actor.personId,
      amountMinor: input.amountMinor,
      currency: order.currency,
      refundId,
      requestId: `${input.requestId}:ledger`,
      reason: input.reason,
      now: input.now,
    }));
  await database.batch([
    database.insert(refundRecords).values({
      id: refundId,
      organizationId,
      orderId: order.id,
      disposition: "original-payment",
      amountMinor: input.amountMinor,
      currency: order.currency,
      stripeRefundId: stripeRefund.id,
      ledgerJournalId: journalId,
      reason: input.reason,
      status: refundStatus,
      initiatedByPersonId: input.actor.personId,
    }),
    database
      .update(orders)
      .set({
        status: nextOrderStatus,
        updatedAt: input.now,
      })
      .where(eq(orders.id, order.id)),
    nextOrderStatus === "refunded" && fulfillment
      ? database
          .update(catalogFulfillments)
          .set({ status: "refunded", updatedAt: input.now })
          .where(eq(catalogFulfillments.id, fulfillment.id))
      : database
          .update(catalogFulfillments)
          .set({ updatedAt: input.now })
          .where(sql`false`),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "order.refunded_to_original_payment",
      entityType: "refund",
      entityId: refundId,
      afterHash: stableHash({
        orderId: order.id,
        amountMinor: input.amountMinor,
        stripeRefundId: stripeRefund.id,
        journalId,
      }),
      reason: input.reason,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { id: refundId, entity: "refund", status: refundStatus };
}
