import {
  auditLog,
  courts,
  eventTypes,
  getDatabase,
  guardianships,
  organizationMemberships,
  organizations,
  orders,
  people,
  pickupSessions,
  programs,
  ratings,
  registrations,
  reports,
  sessions,
  venues,
  walletAccounts,
  walletLedger,
} from "@duna/db";
import {
  evaluateTaxRails,
  foldWalletLedger,
  type AuditEvent,
  type Currency,
  type EventKind,
  type EventSummary,
  type Metric,
  type OrganizationSummary,
  type PersonRole,
  type PersonSummary,
  type VenueSummary,
  type WalletEntry,
} from "@duna/core";
import {
  priceConsumerOrder,
  type CurrencyCode,
  type PricedOrderItem,
} from "@duna/pricing";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import type {
  AdminQueue,
  DunaRepository,
  OperatorScheduleItem,
  PickupMutationInput,
  PlayerWallet,
} from "./repository-contract";

const publicSessionStatuses = [
  "published",
  "registration-open",
  "live",
  "weather-hold",
] as const;

function initials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function titleCase(value: string): string {
  return value
    .split("-")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function currency(value: string): Currency {
  const supported: readonly Currency[] = ["USD", "CAD", "AUD", "BRL", "EUR"];
  return supported.includes(value as Currency) ? (value as Currency) : "USD";
}

function plan(value: string): OrganizationSummary["plan"] {
  const supported: readonly OrganizationSummary["plan"][] = [
    "coach",
    "small-club",
    "club",
    "multi-venue",
  ];
  return supported.includes(value as OrganizationSummary["plan"])
    ? (value as OrganizationSummary["plan"])
    : "coach";
}

function formatUsd(amountMinor: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

function relativeAge(occurredAt: Date, now = new Date()): string {
  const minutes = Math.max(
    0,
    Math.floor((now.getTime() - occurredAt.getTime()) / 60_000),
  );
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

function slaLabel(dueAt: Date, now = new Date()): string {
  const minutes = Math.floor((dueAt.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return `${Math.abs(minutes)} min overdue`;
  if (minutes < 60) return `${minutes} min remaining`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m remaining`;
}

function walletDescription(reasonCode: string): string {
  return titleCase(reasonCode);
}

async function loadPeople(
  personIds: readonly string[],
): Promise<PersonSummary[]> {
  if (personIds.length === 0) return [];
  const database = getDatabase();
  const [personRows, ratingRows, membershipRows, guardianRows] =
    await Promise.all([
      database
        .select()
        .from(people)
        .where(inArray(people.id, [...personIds])),
      database
        .select()
        .from(ratings)
        .where(inArray(ratings.personId, [...personIds])),
      database
        .select()
        .from(organizationMemberships)
        .where(
          and(
            inArray(organizationMemberships.personId, [...personIds]),
            eq(organizationMemberships.active, true),
          ),
        ),
      database
        .select()
        .from(guardianships)
        .where(inArray(guardianships.minorId, [...personIds])),
    ]);
  const ratingByPerson = new Map(
    ratingRows.map((row) => [row.personId, row] as const),
  );
  const rolesByPerson = new Map<string, Set<PersonRole>>();
  for (const personId of personIds)
    rolesByPerson.set(personId, new Set(["player"]));
  for (const row of membershipRows) {
    rolesByPerson.get(row.personId)?.add(row.role);
  }
  const guardiansByMinor = new Map<string, string[]>();
  for (const row of guardianRows) {
    const current = guardiansByMinor.get(row.minorId) ?? [];
    current.push(row.guardianId);
    guardiansByMinor.set(row.minorId, current);
  }
  const order = new Map(personIds.map((id, index) => [id, index] as const));
  return personRows
    .map((person): PersonSummary => {
      const rating = ratingByPerson.get(person.id);
      return {
        id: person.id,
        displayName: person.displayName,
        handle: person.handle,
        initials: initials(person.displayName),
        homeMarket: person.homeMarket ?? "Market not set",
        roles: [
          ...(rolesByPerson.get(person.id) ?? new Set<PersonRole>(["player"])),
        ],
        isMinor: person.isMinor,
        guardianIds: guardiansByMinor.get(person.id),
        rating: rating
          ? {
              display: rating.display,
              mu: rating.mu,
              phi: rating.phi,
              sigma: rating.sigma,
              confidence: rating.confidence,
              discipline: rating.discipline,
            }
          : {
              display: 1,
              mu: 1_500,
              phi: 350,
              sigma: 0.06,
              confidence: "Provisional",
              discipline: "beach-2s",
            },
      };
    })
    .sort(
      (a, b) =>
        (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
}

interface ScopedEvent {
  readonly event: EventSummary;
  readonly organizationId?: string;
}

async function loadEvents(): Promise<ScopedEvent[]> {
  const database = getDatabase();
  const [sessionRows, pickupRows, registrationRows] = await Promise.all([
    database
      .select({
        id: sessions.id,
        slug: sessions.slug,
        title: sessions.title,
        startsAt: sessions.startsAt,
        endsAt: sessions.endsAt,
        timezone: sessions.timezone,
        status: sessions.status,
        capacity: sessions.capacity,
        programKind: programs.kind,
        programOrganizationId: programs.organizationId,
        eventTypeKind: eventTypes.kind,
        eventTypeOrganizationId: eventTypes.organizationId,
        priceMinor: eventTypes.priceMinor,
        priceCurrency: eventTypes.currency,
        venueName: venues.name,
        venueOrganizationId: venues.organizationId,
      })
      .from(sessions)
      .leftJoin(programs, eq(sessions.programId, programs.id))
      .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
      .leftJoin(venues, eq(sessions.venueId, venues.id))
      .where(inArray(sessions.status, [...publicSessionStatuses]))
      .orderBy(asc(sessions.startsAt)),
    database
      .select({
        id: pickupSessions.id,
        title: pickupSessions.title,
        hostName: people.displayName,
        startsAt: pickupSessions.startsAt,
        endsAt: pickupSessions.endsAt,
        venueLabel: pickupSessions.venueLabel,
        venueTimezone: venues.timezone,
        venueOrganizationId: venues.organizationId,
        capacity: pickupSessions.capacity,
        ratingMinimum: pickupSessions.ratingMinimum,
        ratingMaximum: pickupSessions.ratingMaximum,
        currency: pickupSessions.currency,
        costMinor: pickupSessions.costMinor,
      })
      .from(pickupSessions)
      .innerJoin(people, eq(pickupSessions.hostPersonId, people.id))
      .leftJoin(venues, eq(pickupSessions.venueId, venues.id))
      .where(eq(pickupSessions.visibility, "public"))
      .orderBy(asc(pickupSessions.startsAt)),
    database
      .select({
        sessionId: registrations.sessionId,
        status: registrations.status,
      })
      .from(registrations)
      .where(
        inArray(registrations.status, ["pending", "confirmed", "checked-in"]),
      ),
  ]);
  const organizationIds = new Set<string>();
  for (const row of sessionRows) {
    const id =
      row.programOrganizationId ??
      row.eventTypeOrganizationId ??
      row.venueOrganizationId;
    if (id) organizationIds.add(id);
  }
  const organizationRows =
    organizationIds.size === 0
      ? []
      : await database
          .select({ id: organizations.id, name: organizations.name })
          .from(organizations)
          .where(inArray(organizations.id, [...organizationIds]));
  const organizationNames = new Map(
    organizationRows.map((row) => [row.id, row.name] as const),
  );
  const registrationCount = new Map<string, number>();
  for (const row of registrationRows) {
    registrationCount.set(
      row.sessionId,
      (registrationCount.get(row.sessionId) ?? 0) + 1,
    );
  }
  const sessionEvents: ScopedEvent[] = sessionRows.map((row) => {
    const kind = (row.programKind ??
      row.eventTypeKind ??
      "open-play") as EventKind;
    const organizationId =
      row.programOrganizationId ??
      row.eventTypeOrganizationId ??
      row.venueOrganizationId ??
      undefined;
    const occupied = registrationCount.get(row.id) ?? 0;
    return {
      organizationId,
      event: {
        id: row.id,
        slug: row.slug,
        title: row.title,
        kind,
        organizationName:
          (organizationId && organizationNames.get(organizationId)) ??
          "Independent organizer",
        venueName: row.venueName ?? "Location shared after registration",
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        timezone: row.timezone,
        price: {
          amountMinor: row.priceMinor ?? 0,
          currency: currency(row.priceCurrency ?? "USD"),
        },
        spotsRemaining: Math.max(0, row.capacity - occupied),
        capacity: row.capacity,
        live: row.status === "live",
        tags: [titleCase(kind), titleCase(row.status)],
      },
    };
  });
  const pickupEvents: ScopedEvent[] = pickupRows.map((row) => ({
    organizationId: row.venueOrganizationId ?? undefined,
    event: {
      id: row.id,
      slug: `pickup-${row.id}`,
      title: row.title,
      kind: "pickup",
      organizationName: `Hosted by ${row.hostName}`,
      venueName: row.venueLabel,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      timezone: row.venueTimezone ?? "America/New_York",
      price: {
        amountMinor: row.costMinor,
        currency: currency(row.currency),
      },
      spotsRemaining: Math.max(0, row.capacity - 1),
      capacity: row.capacity,
      ratingRange:
        row.ratingMinimum !== null && row.ratingMaximum !== null
          ? [row.ratingMinimum, row.ratingMaximum]
          : undefined,
      tags: ["Pickup", row.costMinor === 0 ? "Free" : "Paid"],
    },
  }));
  return [...sessionEvents, ...pickupEvents].sort((a, b) =>
    a.event.startsAt.localeCompare(b.event.startsAt),
  );
}

async function loadVenues(organizationId?: string): Promise<VenueSummary[]> {
  const database = getDatabase();
  const venueRows = await database
    .select()
    .from(venues)
    .where(
      organizationId
        ? and(
            eq(venues.organizationId, organizationId),
            ne(venues.status, "draft"),
          )
        : ne(venues.status, "draft"),
    )
    .orderBy(asc(venues.name));
  if (venueRows.length === 0) return [];
  const courtRows = await database
    .select({ venueId: courts.venueId, status: courts.status })
    .from(courts)
    .where(
      inArray(
        courts.venueId,
        venueRows.map((row) => row.id),
      ),
    );
  const counts = new Map<string, number>();
  for (const row of courtRows) {
    if (row.status === "active") {
      counts.set(row.venueId, (counts.get(row.venueId) ?? 0) + 1);
    }
  }
  return venueRows.map((row) => {
    const courtCount = counts.get(row.id) ?? 0;
    return {
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      city: row.locality ?? "City not set",
      region: row.administrativeArea ?? row.countryCode,
      timezone: row.timezone,
      courtCount,
      openNow: row.status === "active",
      latitude: row.latitude ?? 0,
      longitude: row.longitude ?? 0,
      tags: [
        `${courtCount} ${courtCount === 1 ? "court" : "courts"}`,
        row.temporary ? "Temporary" : "Facility",
      ],
    };
  });
}

async function loadOrganizations(
  organizationId?: string,
): Promise<OrganizationSummary[]> {
  const database = getDatabase();
  const organizationRows = await database
    .select()
    .from(organizations)
    .where(organizationId ? eq(organizations.id, organizationId) : undefined)
    .orderBy(asc(organizations.name));
  if (organizationRows.length === 0) return [];
  const ids = organizationRows.map((row) => row.id);
  const [membershipRows, venueRows] = await Promise.all([
    database
      .select({
        organizationId: organizationMemberships.organizationId,
        personId: organizationMemberships.personId,
        role: organizationMemberships.role,
      })
      .from(organizationMemberships)
      .where(
        and(
          inArray(organizationMemberships.organizationId, ids),
          eq(organizationMemberships.active, true),
        ),
      ),
    database
      .select({ id: venues.id, organizationId: venues.organizationId })
      .from(venues)
      .where(inArray(venues.organizationId, ids)),
  ]);
  return organizationRows.map((row) => {
    const memberIds = new Set(
      membershipRows
        .filter((membership) => membership.organizationId === row.id)
        .map((membership) => membership.personId),
    );
    const staffIds = new Set(
      membershipRows
        .filter(
          (membership) =>
            membership.organizationId === row.id &&
            ["owner", "manager", "coach", "front-desk", "accountant"].includes(
              membership.role,
            ),
        )
        .map((membership) => membership.personId),
    );
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      legalName: row.legalName ?? row.name,
      plan: plan(row.plan),
      memberCount: memberIds.size,
      staffCount: staffIds.size,
      venueCount: venueRows.filter((venue) => venue.organizationId === row.id)
        .length,
      timezone: row.timezone,
      stripeStatus: row.stripeChargesEnabled
        ? "connected"
        : row.stripeAccountId
          ? "restricted"
          : "pending",
    };
  });
}

async function loadWallet(personId: string): Promise<PlayerWallet> {
  const database = getDatabase();
  const account = await database.query.walletAccounts.findFirst({
    where: eq(walletAccounts.personId, personId),
  });
  if (!account) {
    return {
      balanceMinor: 0,
      availableMinor: 0,
      pendingMinor: 0,
      currency: "USD",
      entries: [],
      taxFormStatus: "not-required",
    };
  }
  const rows = await database
    .select()
    .from(walletLedger)
    .where(eq(walletLedger.walletAccountId, account.id))
    .orderBy(desc(walletLedger.createdAt));
  const ledgerEntries = rows.map((row) => ({
    id: row.id,
    direction: row.direction,
    amountMinor: row.amountMinor,
    currency: row.currency,
    status: row.status,
    taxCharacter: row.taxCharacter,
    reasonCode: row.reasonCode,
    occurredAt: row.createdAt.toISOString(),
  }));
  const balance = foldWalletLedger(ledgerEntries);
  const tax = evaluateTaxRails({ entries: ledgerEntries });
  const entries = rows.flatMap((row): WalletEntry[] => {
    if (row.status === "reversed") return [];
    return [
      {
        id: row.id,
        kind: row.kind,
        description: walletDescription(row.reasonCode),
        amount: {
          amountMinor:
            row.direction === "credit" ? row.amountMinor : -row.amountMinor,
          currency: currency(row.currency),
        },
        occurredAt: row.createdAt.toISOString(),
        status: row.status,
        taxCharacter: row.taxCharacter === "refund" ? "none" : row.taxCharacter,
      },
    ];
  });
  return {
    balanceMinor: balance.totalMinor,
    availableMinor: balance.availableMinor,
    pendingMinor: balance.pendingMinor,
    currency: "USD",
    entries,
    taxFormStatus: tax.taxFormCollectionRequired ? "pending" : "not-required",
  };
}

async function loadAdminQueues(): Promise<AdminQueue[]> {
  const database = getDatabase();
  const rows = await database
    .select()
    .from(reports)
    .where(
      inArray(reports.status, ["open", "triaged", "investigating", "held"]),
    )
    .orderBy(asc(reports.slaDueAt));
  return rows.map((row) => ({
    id: row.id,
    title: titleCase(row.category),
    detail: `${titleCase(row.entityType)} report`,
    age: relativeAge(row.createdAt),
    sla: slaLabel(row.slaDueAt),
    priority: row.involvesMinor
      ? "urgent"
      : row.category.includes("wallet")
        ? "high"
        : "normal",
  }));
}

async function loadAudit(): Promise<AuditEvent[]> {
  const database = getDatabase();
  const rows = await database
    .select({
      id: auditLog.id,
      occurredAt: auditLog.createdAt,
      actorName: people.displayName,
      actorType: auditLog.actorType,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      reason: auditLog.reason,
    })
    .from(auditLog)
    .leftJoin(people, eq(auditLog.actorPersonId, people.id))
    .orderBy(desc(auditLog.createdAt))
    .limit(100);
  return rows.map((row) => ({
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    actorName: row.actorName ?? titleCase(row.actorType),
    action: row.action,
    entity: `${titleCase(row.entityType)} · ${row.entityId}`,
    reason: row.reason,
    severity:
      row.action.includes("suspend") || row.action.includes("delete")
        ? "critical"
        : row.action.includes("hold") || row.action.includes("override")
          ? "attention"
          : "info",
  }));
}

function scheduleFromEvents(
  events: readonly EventSummary[],
  timezone: string,
): OperatorScheduleItem[] {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  });
  return events.slice(0, 8).map((event) => ({
    time: formatter.format(new Date(event.startsAt)),
    court: event.venueName,
    title: event.title,
    detail: `${event.spotsRemaining} spots remaining · ${titleCase(event.kind)}`,
    state: event.live ? "live" : "scheduled",
  }));
}

async function createPickup(input: PickupMutationInput): Promise<EventSummary> {
  const database = getDatabase();
  const matchingVenue = await database.query.venues.findFirst({
    where: input.organizationId
      ? and(
          eq(venues.organizationId, input.organizationId),
          eq(venues.name, input.venueName),
        )
      : eq(venues.name, input.venueName),
  });
  const pickupId = crypto.randomUUID();
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  await database.batch([
    database.insert(pickupSessions).values({
      id: pickupId,
      hostPersonId: input.hostPersonId,
      venueId: matchingVenue?.id,
      venueLabel: input.venueName,
      title: input.title,
      startsAt,
      endsAt,
      capacity: input.capacity,
      ratingMinimum: input.ratingMinimum,
      ratingMaximum: input.ratingMaximum,
    }),
    database.insert(auditLog).values({
      organizationId: input.organizationId,
      actorPersonId: input.hostPersonId,
      actorType: "person",
      action: "pickup.created",
      entityType: "pickup-session",
      entityId: pickupId,
      reason: "Player created a community pickup.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
    }),
  ]);
  return {
    id: pickupId,
    slug: `pickup-${pickupId}`,
    title: input.title,
    kind: "pickup",
    organizationName: "Player-hosted pickup",
    venueName: input.venueName,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    timezone: matchingVenue?.timezone ?? "America/New_York",
    price: { amountMinor: 0, currency: "USD" },
    spotsRemaining: Math.max(0, input.capacity - 1),
    capacity: input.capacity,
    ratingRange:
      input.ratingMinimum !== undefined && input.ratingMaximum !== undefined
        ? [input.ratingMinimum, input.ratingMaximum]
        : undefined,
    tags: ["Pickup", "Player hosted"],
  };
}

export const databaseRepository = {
  public: {
    events: async () => (await loadEvents()).map(({ event }) => event),
    eventBySlug: async (slug: string) =>
      (await loadEvents()).find(({ event }) => event.slug === slug)?.event,
    venues: () => loadVenues(),
    playerByHandle: async (handle: string) => {
      const database = getDatabase();
      const person = await database.query.people.findFirst({
        where: and(
          eq(people.handle, handle),
          eq(people.status, "active"),
          eq(people.profileVisibility, "public"),
        ),
      });
      if (!person || person.isMinor) return undefined;
      return (await loadPeople([person.id]))[0];
    },
  },
  player: {
    dashboard: async (personId: string) => {
      const [player, events, wallet] = await Promise.all([
        loadPeople([personId]).then((rows) => rows[0]),
        loadEvents().then((rows) => rows.map(({ event }) => event)),
        loadWallet(personId),
      ]);
      if (!player) throw new Error("Player profile was not found");
      const metrics: Metric[] = [
        {
          label: "Sand Rating",
          value: player.rating.display.toFixed(2),
          change: player.rating.confidence,
        },
        {
          label: "Rated matches",
          value: "—",
          change: "No connected match history",
          trend: "flat",
        },
        {
          label: "Upcoming",
          value: String(events.length),
          change: "Published events",
        },
        {
          label: "Wallet",
          value: formatUsd(wallet.availableMinor),
          change: "Available",
        },
      ];
      return {
        player,
        metrics,
        bookings: [],
        events,
        feed: [],
        recentMatches: [],
        walletBalanceMinor: wallet.balanceMinor,
        currency: "USD" as const,
      };
    },
    matchHistory: async () => [],
    wallet: loadWallet,
    quote: (input: {
      items: readonly PricedOrderItem[];
      isDunaPlus: boolean;
    }) =>
      priceConsumerOrder({
        items: input.items,
        currency: "USD" satisfies CurrencyCode,
        isDunaPlus: input.isDunaPlus,
      }),
    createPickup,
  },
  operator: {
    dashboard: async (organizationId: string) => {
      const [organization, scopedEvents, organizationVenues] =
        await Promise.all([
          loadOrganizations(organizationId).then((rows) => rows[0]),
          loadEvents().then((rows) =>
            rows
              .filter((row) => row.organizationId === organizationId)
              .map(({ event }) => event),
          ),
          loadVenues(organizationId),
        ]);
      if (!organization) throw new Error("Organization was not found");
      const courtCount = organizationVenues.reduce(
        (total, venue) => total + venue.courtCount,
        0,
      );
      return {
        organization,
        metrics: [
          {
            label: "Published sessions",
            value: String(scopedEvents.length),
          },
          { label: "Members", value: String(organization.memberCount) },
          { label: "Active courts", value: String(courtCount) },
          {
            label: "Stripe",
            value: titleCase(organization.stripeStatus),
            tone:
              organization.stripeStatus === "connected"
                ? "positive"
                : "warning",
          },
        ],
        schedule: scheduleFromEvents(scopedEvents, organization.timezone),
        events: scopedEvents,
        alerts:
          organization.stripeStatus === "connected"
            ? []
            : [
                {
                  id: "stripe",
                  title: "Payments need attention",
                  detail: "Complete the connected-account readiness steps.",
                  action: "Review payments",
                  tone: "warning",
                },
              ],
      };
    },
    schedule: async (organizationId: string) => {
      const [organization, eventRows] = await Promise.all([
        loadOrganizations(organizationId).then((rows) => rows[0]),
        loadEvents(),
      ]);
      if (!organization) throw new Error("Organization was not found");
      return scheduleFromEvents(
        eventRows
          .filter((row) => row.organizationId === organizationId)
          .map(({ event }) => event),
        organization.timezone,
      );
    },
    organization: async (organizationId: string) => {
      const organization = (await loadOrganizations(organizationId))[0];
      if (!organization) throw new Error("Organization was not found");
      return organization;
    },
    members: async (organizationId: string) => {
      const database = getDatabase();
      const rows = await database
        .select({ personId: organizationMemberships.personId })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.organizationId, organizationId),
            eq(organizationMemberships.active, true),
          ),
        );
      return loadPeople([...new Set(rows.map((row) => row.personId))]);
    },
    events: async (organizationId: string) =>
      (await loadEvents())
        .filter((row) => row.organizationId === organizationId)
        .map(({ event }) => event),
  },
  admin: {
    overview: async () => {
      const database = getDatabase();
      const [
        organizationRows,
        ratingRows,
        reportRows,
        orderRows,
        queues,
        audit,
      ] = await Promise.all([
        database.select({ id: organizations.id }).from(organizations),
        database.select({ personId: ratings.personId }).from(ratings),
        database
          .select({ status: reports.status })
          .from(reports)
          .where(
            inArray(reports.status, [
              "open",
              "triaged",
              "investigating",
              "held",
            ]),
          ),
        database
          .select({ totalMinor: orders.totalMinor, status: orders.status })
          .from(orders)
          .where(inArray(orders.status, ["paid", "partially-refunded"])),
        loadAdminQueues(),
        loadAudit(),
      ]);
      const gmvMinor = orderRows.reduce(
        (total, order) => total + order.totalMinor,
        0,
      );
      const metrics: Metric[] = [
        { label: "Platform GMV", value: formatUsd(gmvMinor) },
        {
          label: "Active operators",
          value: String(organizationRows.length),
        },
        {
          label: "Rated players",
          value: String(new Set(ratingRows.map((row) => row.personId)).size),
        },
        {
          label: "Open safety SLAs",
          value: String(reportRows.length),
          tone: reportRows.length > 0 ? "warning" : "positive",
        },
      ];
      return {
        metrics,
        queues,
        audit,
        system: [
          { service: "API", status: "healthy", detail: "Serving requests" },
          {
            service: "Database",
            status: "healthy",
            detail: "Connected and queryable",
          },
          {
            service: "Stripe webhooks",
            status: process.env.STRIPE_WEBHOOK_SECRET
              ? "configured"
              : "attention",
            detail: process.env.STRIPE_WEBHOOK_SECRET
              ? "Signing secret connected"
              : "Signing secret missing",
          },
          {
            service: "Wallet reconciliation",
            status: "attention",
            detail: "Processor balance feed required",
          },
          {
            service: "Messaging",
            status: "attention",
            detail: "Provider not connected",
          },
        ],
      };
    },
    organizations: () => loadOrganizations(),
    queues: loadAdminQueues,
    audit: loadAudit,
  },
} satisfies DunaRepository;
