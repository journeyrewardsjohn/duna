import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import {
  adminRoles,
  auditLog,
  eventTypes,
  getDatabase,
  organizationMemberships,
  organizationParticipants,
  organizations,
  orders,
  people,
  programs,
  refundRecords,
  registrations,
  sessions,
  superAdminMoneyReviews,
  venues,
} from "@duna/db";
import { WorkOS } from "@workos-inc/node";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import type {
  SuperAdminPeopleOverview,
  SuperAdminPersonProfile,
} from "./contracts";
import type { ApiActor } from "./context";
import {
  addCalendarParticipant,
  refundOrganizationOrder,
} from "./catalog-service";
import {
  grantOrganizationAccess,
  type OrganizationAccessRole,
} from "./organization-access-service";
import { resolveWorkOSCredentials } from "./workos-environment";

const DUNA_PLATFORM_SYSTEM_KEY = "duna-platform";
const DUNA_PLATFORM_WORKOS_ROLE_SLUG = "org-admin";
const SUPER_ADMIN_ROLE = "super-admin";
const PEOPLE_DIRECTORY_PAGE_SIZE = 100;

export class SuperAdminPeopleError extends Error {
  constructor(message: string) {
    super(message);
  }
}

function requireDatabase(): void {
  if (!process.env.DATABASE_URL) {
    throw new SuperAdminPeopleError(
      "A connected Duna database is required to manage people.",
    );
  }
}

function iso(value: Date): string {
  return value.toISOString();
}

function roleSet(input: {
  readonly membershipRoles: readonly string[];
  readonly adminRoles: readonly string[];
}): readonly (
  | "player"
  | "guardian"
  | "coach"
  | "owner"
  | "manager"
  | "front-desk"
  | "scorekeeper"
  | "accountant"
  | "admin"
  | "super-admin"
)[] {
  const roles = new Set<string>(["player"]);
  input.membershipRoles.forEach((role) => roles.add(role));
  input.adminRoles.forEach((role) => roles.add(role));
  return [...roles].filter(
    (
      role,
    ): role is
      | "player"
      | "guardian"
      | "coach"
      | "owner"
      | "manager"
      | "front-desk"
      | "scorekeeper"
      | "accountant"
      | "admin"
      | "super-admin" =>
      [
        "player",
        "guardian",
        "coach",
        "owner",
        "manager",
        "front-desk",
        "scorekeeper",
        "accountant",
        "admin",
        "super-admin",
      ].includes(role),
  );
}

function currencyForPersonOrders(
  rows: readonly { readonly currency: string }[],
): string {
  return rows[0]?.currency ?? "USD";
}

function moneyChallenge(): string {
  return `REFUND ${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

function hashChallenge(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function timingSafeMatches(expectedHash: string, value: string): boolean {
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(hashChallenge(value), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function eventOrganizationRows(now: Date) {
  const database = getDatabase();
  return database
    .select({
      id: sessions.id,
      title: sessions.title,
      startsAt: sessions.startsAt,
      capacity: sessions.capacity,
      status: sessions.status,
      organizationId: sql<
        string | null
      >`coalesce(${programs.organizationId}, ${eventTypes.organizationId}, ${venues.organizationId})`,
    })
    .from(sessions)
    .leftJoin(programs, eq(sessions.programId, programs.id))
    .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
    .leftJoin(venues, eq(sessions.venueId, venues.id))
    .where(
      and(
        sql`${sessions.startsAt} >= ${now}`,
        sql`${sessions.status} NOT IN ('cancelled', 'completed')`,
      ),
    )
    .orderBy(asc(sessions.startsAt));
}

function personRow(input: {
  readonly person: typeof people.$inferSelect;
  readonly memberships: readonly string[];
  readonly adminRoleRows: readonly string[];
  readonly organizationCount: number;
  readonly eventCount: number;
  readonly purchaseTotalMinor: number;
  readonly currency: string;
}) {
  const accountRoles = roleSet({
    membershipRoles: input.memberships,
    adminRoles: input.adminRoleRows,
  });
  return {
    id: input.person.id,
    displayName: input.person.displayName,
    email: input.person.email ?? undefined,
    avatarUrl: input.person.avatarUrl ?? undefined,
    dunaMemberId: input.person.dunaMemberId,
    status: input.person.status,
    ageBand: input.person.ageBand as "unknown" | "under-13" | "teen" | "adult",
    accountRoles,
    organizationCount: input.organizationCount,
    eventCount: input.eventCount,
    purchaseTotalMinor: input.purchaseTotalMinor,
    currency: input.currency,
    isSuperAdmin: accountRoles.includes("super-admin"),
    createdAt: iso(input.person.createdAt),
  };
}

export async function loadSuperAdminPeopleOverview(input: {
  readonly query?: string;
  readonly page?: number;
  readonly now: Date;
}): Promise<SuperAdminPeopleOverview> {
  requireDatabase();
  const database = getDatabase();
  const query = input.query?.trim();
  const page = input.page ?? 1;
  const fetchedPersonRows = await database
    .select()
    .from(people)
    .where(
      query
        ? or(
            ilike(people.displayName, `%${query}%`),
            ilike(people.handle, `%${query}%`),
            ilike(people.email, `%${query}%`),
            ilike(people.dunaMemberId, `%${query}%`),
          )
        : undefined,
    )
    .orderBy(asc(people.displayName))
    .limit(PEOPLE_DIRECTORY_PAGE_SIZE + 1)
    .offset((page - 1) * PEOPLE_DIRECTORY_PAGE_SIZE);
  const hasNextPage = fetchedPersonRows.length > PEOPLE_DIRECTORY_PAGE_SIZE;
  const personRows = fetchedPersonRows.slice(0, PEOPLE_DIRECTORY_PAGE_SIZE);
  const personIds = personRows.map((person) => person.id);
  const [
    membershipRows,
    platformRoleRows,
    registrationRows,
    orderRows,
    organizationRows,
    eventRows,
    accountCount,
    superAdminCount,
  ] = await Promise.all([
    personIds.length
      ? database
          .select({
            personId: organizationMemberships.personId,
            organizationId: organizationMemberships.organizationId,
            role: organizationMemberships.role,
          })
          .from(organizationMemberships)
          .innerJoin(
            organizations,
            eq(organizationMemberships.organizationId, organizations.id),
          )
          .where(
            and(
              inArray(organizationMemberships.personId, personIds),
              eq(organizationMemberships.active, true),
              isNull(organizations.systemKey),
            ),
          )
      : Promise.resolve([]),
    personIds.length
      ? database
          .select({ personId: adminRoles.personId, role: adminRoles.role })
          .from(adminRoles)
          .where(inArray(adminRoles.personId, personIds))
      : Promise.resolve([]),
    personIds.length
      ? database
          .select({ personId: registrations.personId })
          .from(registrations)
          .where(
            and(
              inArray(registrations.personId, personIds),
              inArray(registrations.status, [
                "pending",
                "confirmed",
                "waitlisted",
                "checked-in",
              ]),
            ),
          )
      : Promise.resolve([]),
    personIds.length
      ? database
          .select({
            personId: orders.buyerPersonId,
            totalMinor: orders.totalMinor,
            currency: orders.currency,
          })
          .from(orders)
          .where(
            and(
              inArray(orders.buyerPersonId, personIds),
              inArray(orders.status, [
                "paid",
                "partially-refunded",
                "refunded",
              ]),
            ),
          )
      : Promise.resolve([]),
    database
      .select({
        id: organizations.id,
        name: organizations.name,
        plan: organizations.plan,
      })
      .from(organizations)
      .where(isNull(organizations.systemKey))
      .orderBy(asc(organizations.name)),
    eventOrganizationRows(input.now),
    database
      .select({ count: sql<number>`count(*)::int` })
      .from(people)
      .then((rows) => rows[0]?.count ?? 0),
    database
      .select({ count: sql<number>`count(*)::int` })
      .from(adminRoles)
      .where(eq(adminRoles.role, SUPER_ADMIN_ROLE))
      .then((rows) => rows[0]?.count ?? 0),
  ]);
  const organizationRolesByPerson = new Map<string, string[]>();
  const organizationIdsByPerson = new Map<string, Set<string>>();
  for (const membership of membershipRows) {
    organizationRolesByPerson.set(membership.personId, [
      ...(organizationRolesByPerson.get(membership.personId) ?? []),
      membership.role,
    ]);
    const ids = organizationIdsByPerson.get(membership.personId) ?? new Set();
    ids.add(membership.organizationId);
    organizationIdsByPerson.set(membership.personId, ids);
  }
  const platformRolesByPerson = new Map<string, string[]>();
  for (const role of platformRoleRows) {
    platformRolesByPerson.set(role.personId, [
      ...(platformRolesByPerson.get(role.personId) ?? []),
      role.role,
    ]);
  }
  const eventCountByPerson = new Map<string, number>();
  for (const registration of registrationRows) {
    eventCountByPerson.set(
      registration.personId,
      (eventCountByPerson.get(registration.personId) ?? 0) + 1,
    );
  }
  const ordersByPerson = new Map<
    string,
    { readonly totalMinor: number; readonly currency: string }[]
  >();
  for (const order of orderRows) {
    ordersByPerson.set(order.personId, [
      ...(ordersByPerson.get(order.personId) ?? []),
      { totalMinor: order.totalMinor, currency: order.currency },
    ]);
  }
  const confirmedByEvent = new Map<string, number>();
  const eventIds = eventRows.map((event) => event.id);
  if (eventIds.length > 0) {
    const counts = await database
      .select({
        sessionId: registrations.sessionId,
        count: sql<number>`count(*)::int`,
      })
      .from(registrations)
      .where(
        and(
          inArray(registrations.sessionId, eventIds),
          inArray(registrations.status, ["confirmed", "checked-in"]),
        ),
      )
      .groupBy(registrations.sessionId);
    counts.forEach((row) => confirmedByEvent.set(row.sessionId, row.count));
  }
  const organizationNameById = new Map(
    organizationRows.map((organization) => [
      organization.id,
      organization.name,
    ]),
  );
  return {
    totals: {
      accounts: accountCount,
      superAdmins: superAdminCount,
      activeOrganizations: organizationRows.length,
      upcomingEvents: eventRows.length,
    },
    people: personRows.map((person) => {
      const purchaseRows = ordersByPerson.get(person.id) ?? [];
      return personRow({
        person,
        memberships: organizationRolesByPerson.get(person.id) ?? [],
        adminRoleRows: platformRolesByPerson.get(person.id) ?? [],
        organizationCount: organizationIdsByPerson.get(person.id)?.size ?? 0,
        eventCount: eventCountByPerson.get(person.id) ?? 0,
        purchaseTotalMinor: purchaseRows.reduce(
          (total, order) => total + order.totalMinor,
          0,
        ),
        currency: currencyForPersonOrders(purchaseRows),
      });
    }),
    organizations: organizationRows.map((organization) => ({
      id: organization.id,
      name: organization.name,
      plan: organization.plan,
    })),
    events: eventRows.flatMap((event) => {
      const organizationName = event.organizationId
        ? organizationNameById.get(event.organizationId)
        : undefined;
      return event.organizationId && organizationName
        ? [
            {
              id: event.id,
              title: event.title,
              organizationId: event.organizationId,
              organizationName,
              startsAt: iso(event.startsAt),
              capacity: event.capacity,
              confirmedCount: confirmedByEvent.get(event.id) ?? 0,
              status: event.status,
            },
          ]
        : [];
    }),
    query,
    page,
    pageSize: PEOPLE_DIRECTORY_PAGE_SIZE,
    hasNextPage,
  };
}

export async function loadSuperAdminPersonProfile(
  personId: string,
): Promise<SuperAdminPersonProfile | null> {
  requireDatabase();
  const database = getDatabase();
  const person = await database.query.people.findFirst({
    where: eq(people.id, personId),
  });
  if (!person) return null;
  const [membershipRows, roleRows, registrationRows, orderRows] =
    await Promise.all([
      database
        .select({
          organizationId: organizationMemberships.organizationId,
          organizationName: organizations.name,
          role: organizationMemberships.role,
          active: organizationMemberships.active,
        })
        .from(organizationMemberships)
        .innerJoin(
          organizations,
          eq(organizationMemberships.organizationId, organizations.id),
        )
        .where(
          and(
            eq(organizationMemberships.personId, personId),
            isNull(organizations.systemKey),
          ),
        )
        .orderBy(asc(organizations.name)),
      database
        .select({ role: adminRoles.role })
        .from(adminRoles)
        .where(eq(adminRoles.personId, personId)),
      database
        .select({
          registration: registrations,
          title: sessions.title,
          startsAt: sessions.startsAt,
          organizationId: sql<
            string | null
          >`coalesce(${programs.organizationId}, ${eventTypes.organizationId}, ${venues.organizationId})`,
        })
        .from(registrations)
        .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
        .leftJoin(programs, eq(sessions.programId, programs.id))
        .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
        .leftJoin(venues, eq(sessions.venueId, venues.id))
        .where(eq(registrations.personId, personId))
        .orderBy(desc(sessions.startsAt))
        .limit(100),
      database
        .select({
          order: orders,
          organizationName: organizations.name,
          refundedMinor: sql<number>`coalesce(sum(case when ${refundRecords.status} in ('pending', 'succeeded') then ${refundRecords.amountMinor} else 0 end), 0)::int`,
        })
        .from(orders)
        .leftJoin(organizations, eq(orders.organizationId, organizations.id))
        .leftJoin(refundRecords, eq(refundRecords.orderId, orders.id))
        .where(
          and(
            eq(orders.buyerPersonId, personId),
            inArray(orders.status, ["paid", "partially-refunded", "refunded"]),
          ),
        )
        .groupBy(orders.id, organizations.name)
        .orderBy(desc(orders.createdAt))
        .limit(100),
    ]);
  const eventOrganizationIds = [
    ...new Set(
      registrationRows
        .map((row) => row.organizationId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const eventOrganizations = eventOrganizationIds.length
    ? await database
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(inArray(organizations.id, eventOrganizationIds))
    : [];
  const eventOrganizationNameById = new Map(
    eventOrganizations.map((organization) => [
      organization.id,
      organization.name,
    ]),
  );
  const purchaseRows = orderRows.map(({ order }) => ({
    totalMinor: order.totalMinor,
    currency: order.currency,
  }));
  return {
    person: personRow({
      person,
      memberships: membershipRows
        .filter((membership) => membership.active)
        .map((membership) => membership.role),
      adminRoleRows: roleRows.map((role) => role.role),
      organizationCount: new Set(
        membershipRows
          .filter((membership) => membership.active)
          .map((membership) => membership.organizationId),
      ).size,
      eventCount: registrationRows.filter((row) =>
        ["pending", "confirmed", "waitlisted", "checked-in"].includes(
          row.registration.status,
        ),
      ).length,
      purchaseTotalMinor: purchaseRows.reduce(
        (total, order) => total + order.totalMinor,
        0,
      ),
      currency: currencyForPersonOrders(purchaseRows),
    }),
    organizationRoles: membershipRows.map((membership) => ({
      organizationId: membership.organizationId,
      organizationName: membership.organizationName,
      role: membership.role,
      active: membership.active,
    })),
    purchases: orderRows.map(({ order, organizationName, refundedMinor }) => ({
      id: order.id,
      organizationId: order.organizationId ?? undefined,
      organizationName: organizationName ?? undefined,
      status: order.status,
      totalMinor: order.totalMinor,
      refundableMinor: Math.max(0, order.totalMinor - refundedMinor),
      currency: order.currency,
      createdAt: iso(order.createdAt),
    })),
    eventAssignments: registrationRows.map((row) => ({
      id: row.registration.id,
      sessionId: row.registration.sessionId,
      title: row.title,
      organizationName: row.organizationId
        ? eventOrganizationNameById.get(row.organizationId)
        : undefined,
      startsAt: iso(row.startsAt),
      status: row.registration.status,
    })),
  };
}

export async function assignPersonToEvent(input: {
  readonly actor: ApiActor;
  readonly personId: string;
  readonly sessionId: string;
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly id: string; readonly status: string }> {
  requireDatabase();
  const database = getDatabase();
  const [person, event] = await Promise.all([
    database.query.people.findFirst({ where: eq(people.id, input.personId) }),
    database
      .select({
        organizationId: sql<
          string | null
        >`coalesce(${programs.organizationId}, ${eventTypes.organizationId}, ${venues.organizationId})`,
      })
      .from(sessions)
      .leftJoin(programs, eq(sessions.programId, programs.id))
      .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
      .leftJoin(venues, eq(sessions.venueId, venues.id))
      .where(eq(sessions.id, input.sessionId))
      .limit(1)
      .then((rows) => rows[0]),
  ]);
  if (!person) throw new SuperAdminPeopleError("Duna account was not found.");
  if (!event?.organizationId) {
    throw new SuperAdminPeopleError(
      "This event is not connected to an organization and cannot be assigned.",
    );
  }
  await database
    .insert(organizationParticipants)
    .values({
      organizationId: event.organizationId,
      personId: person.id,
      relationship: "player",
      status: "active",
      addedByPersonId: input.actor.personId,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: [
        organizationParticipants.organizationId,
        organizationParticipants.personId,
        organizationParticipants.relationship,
      ],
      set: {
        status: "active",
        addedByPersonId: input.actor.personId,
        updatedAt: input.now,
      },
    });
  const result = await addCalendarParticipant({
    actor: { ...input.actor, organizationId: event.organizationId },
    sessionId: input.sessionId,
    personId: input.personId,
    reason: input.reason,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
  });
  return result;
}

export async function grantPersonOrganizationRole(input: {
  readonly actor: ApiActor;
  readonly personId: string;
  readonly organizationId: string;
  readonly role: OrganizationAccessRole;
  readonly workerClassification: "1099-contractor" | "w2-employee";
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  requireDatabase();
  const person = await getDatabase().query.people.findFirst({
    where: eq(people.id, input.personId),
  });
  if (!person?.email) {
    throw new SuperAdminPeopleError(
      "This account has no email address, so organization access cannot be synchronized safely.",
    );
  }
  return grantOrganizationAccess({
    actor: input.actor,
    organizationId: input.organizationId,
    email: person.email,
    displayName: person.displayName,
    role: input.role,
    workerClassification: input.workerClassification,
    deliveryMode: "link-only",
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
  });
}

async function ensureDunaPlatformOrganization(input: {
  readonly requestId: string;
}): Promise<typeof organizations.$inferSelect> {
  const database = getDatabase();
  const existing = await database.query.organizations.findFirst({
    where: eq(organizations.systemKey, DUNA_PLATFORM_SYSTEM_KEY),
  });
  if (existing) return existing;

  const organizationId = randomUUID();
  const credentials = resolveWorkOSCredentials();
  let workosOrganizationId: string | undefined;
  if (credentials) {
    const workos = new WorkOS(credentials.apiKey, {
      appInfo: { name: "duna", version: "0.1.0" },
    });
    const remote = await workos.organizations.createOrganization(
      {
        name: "Duna",
        externalId: organizationId,
        metadata: { duna_system: "platform" },
      },
      { idempotencyKey: `duna-platform:${input.requestId}` },
    );
    workosOrganizationId = remote.id;
  }
  try {
    const [created] = await database
      .insert(organizations)
      .values({
        id: organizationId,
        systemKey: DUNA_PLATFORM_SYSTEM_KEY,
        workosOrganizationId,
        slug: "duna-platform",
        name: "Duna",
        legalName: "Duna",
      })
      .returning();
    if (!created) throw new Error("Duna platform workspace was not created.");
    return created;
  } catch (error) {
    const concurrent = await database.query.organizations.findFirst({
      where: eq(organizations.systemKey, DUNA_PLATFORM_SYSTEM_KEY),
    });
    if (concurrent) return concurrent;
    throw error;
  }
}

export async function setPersonSuperAdmin(input: {
  readonly actor: ApiActor;
  readonly personId: string;
  readonly enabled: boolean;
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{
  readonly id: string;
  readonly status: string;
  readonly workosSync: "synced" | "not-linked";
  readonly workosInvitationSent?: boolean;
}> {
  requireDatabase();
  const database = getDatabase();
  const person = await database.query.people.findFirst({
    where: eq(people.id, input.personId),
  });
  if (!person) throw new SuperAdminPeopleError("Duna account was not found.");
  if (!input.enabled && input.personId === input.actor.personId) {
    throw new SuperAdminPeopleError(
      "You cannot remove your own Super Admin access.",
    );
  }
  if (!input.enabled) {
    const count = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(adminRoles)
      .where(eq(adminRoles.role, SUPER_ADMIN_ROLE))
      .then((rows) => rows[0]?.count ?? 0);
    if (count <= 1) {
      throw new SuperAdminPeopleError(
        "Duna must retain at least one Super Admin.",
      );
    }
    const dunaOrganization = await database.query.organizations.findFirst({
      where: eq(organizations.systemKey, DUNA_PLATFORM_SYSTEM_KEY),
    });
    let workosSync: "synced" | "not-linked" = "not-linked";
    if (
      dunaOrganization?.workosOrganizationId &&
      person.workosUserId &&
      resolveWorkOSCredentials()
    ) {
      try {
        const credentials = resolveWorkOSCredentials();
        if (credentials) {
          const workos = new WorkOS(credentials.apiKey, {
            appInfo: { name: "duna", version: "0.1.0" },
          });
          const memberships =
            await workos.userManagement.listOrganizationMemberships({
              organizationId: dunaOrganization.workosOrganizationId,
              userId: person.workosUserId,
              statuses: ["active", "inactive"],
              limit: 10,
            });
          const membership = memberships.data.find(
            (candidate) => candidate.userId === person.workosUserId,
          );
          if (membership?.status === "active") {
            await workos.userManagement.deactivateOrganizationMembership(
              membership.id,
            );
          }
          if (membership) workosSync = "synced";
        }
      } catch {
        // Local authorization is always removed. A WorkOS provider outage must
        // not leave an accidental Super Admin grant in Duna.
      }
    }
    await database.transaction(async (transaction) => {
      await transaction
        .delete(adminRoles)
        .where(
          and(
            eq(adminRoles.personId, person.id),
            eq(adminRoles.role, SUPER_ADMIN_ROLE),
          ),
        );
      if (dunaOrganization) {
        await transaction
          .update(organizationMemberships)
          .set({ active: false, updatedAt: input.now })
          .where(
            and(
              eq(organizationMemberships.organizationId, dunaOrganization.id),
              eq(organizationMemberships.personId, person.id),
            ),
          );
      }
      await transaction.insert(auditLog).values({
        actorPersonId: input.actor.personId,
        actorType: "person",
        action: "super-admin.revoked",
        entityType: "person",
        entityId: person.id,
        afterHash: hashChallenge(
          JSON.stringify({
            dunaOrganizationId: dunaOrganization?.id,
            workosSync,
          }),
        ),
        reason: input.reason,
        traceId: input.requestId,
        ipAddress: input.ipAddress,
        createdAt: input.now,
      });
    });
    return { id: person.id, status: "revoked", workosSync };
  }

  const dunaOrganization = await ensureDunaPlatformOrganization({
    requestId: input.requestId,
  });
  let workosSync: "synced" | "not-linked" = "not-linked";
  let workosInvitationSent = false;
  if (person.email) {
    const access = await grantOrganizationAccess({
      actor: input.actor,
      organizationId: dunaOrganization.id,
      email: person.email,
      displayName: person.displayName,
      role: "director",
      workerClassification: "w2-employee",
      deliveryMode: "link-only",
      requestId: `${input.requestId}:platform-membership`,
      ipAddress: input.ipAddress,
      now: input.now,
      allowSystemOrganization: true,
      workosRoleSlug: DUNA_PLATFORM_WORKOS_ROLE_SLUG,
    });
    workosSync = access.workosSync;
    if (!person.workosUserId && dunaOrganization.workosOrganizationId) {
      const credentials = resolveWorkOSCredentials();
      if (credentials) {
        const workos = new WorkOS(credentials.apiKey, {
          appInfo: { name: "duna", version: "0.1.0" },
        });
        try {
          await workos.userManagement.sendInvitation({
            email: person.email,
            organizationId: dunaOrganization.workosOrganizationId,
            roleSlug: DUNA_PLATFORM_WORKOS_ROLE_SLUG,
            expiresInDays: 7,
          });
          workosInvitationSent = true;
        } catch {
          // The durable Duna grant is still authoritative. A previously sent
          // WorkOS invitation or a provider retry must never undo it.
        }
      }
    }
  }
  await database.transaction(async (transaction) => {
    await transaction
      .insert(adminRoles)
      .values({
        personId: person.id,
        role: SUPER_ADMIN_ROLE,
        scopes: [],
        grantedByPersonId: input.actor.personId,
        grantedAt: input.now,
      })
      .onConflictDoNothing();
    await transaction.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "super-admin.granted",
      entityType: "person",
      entityId: person.id,
      afterHash: hashChallenge(
        JSON.stringify({ dunaOrganizationId: dunaOrganization.id, workosSync }),
      ),
      reason: input.reason,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return {
    id: person.id,
    status: "granted",
    workosSync,
    workosInvitationSent,
  };
}

export async function prepareSuperAdminRefund(input: {
  readonly actor: ApiActor;
  readonly personId: string;
  readonly orderId: string;
  readonly amountMinor: number;
  readonly disposition: "original-payment" | "organization-credit";
  readonly credits?: number;
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{
  readonly id: string;
  readonly orderId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly confirmationCode: string;
  readonly expiresAt: string;
}> {
  requireDatabase();
  const database = getDatabase();
  const [order, refunded] = await Promise.all([
    database.query.orders.findFirst({ where: eq(orders.id, input.orderId) }),
    database
      .select({
        amount: sql<number>`coalesce(sum(${refundRecords.amountMinor}), 0)::int`,
      })
      .from(refundRecords)
      .where(
        and(
          eq(refundRecords.orderId, input.orderId),
          inArray(refundRecords.status, ["pending", "succeeded"]),
        ),
      )
      .then((rows) => rows[0]?.amount ?? 0),
  ]);
  if (
    !order ||
    order.buyerPersonId !== input.personId ||
    !order.organizationId
  ) {
    throw new SuperAdminPeopleError(
      "Purchase was not found for this Duna account.",
    );
  }
  if (!["paid", "partially-refunded", "refunded"].includes(order.status)) {
    throw new SuperAdminPeopleError(
      "Only a completed purchase can be reviewed for a refund.",
    );
  }
  const refundableMinor = Math.max(0, order.totalMinor - refunded);
  if (input.amountMinor <= 0 || input.amountMinor > refundableMinor) {
    throw new SuperAdminPeopleError(
      "Refund amount exceeds the remaining refundable balance.",
    );
  }
  if (input.disposition === "organization-credit" && !input.credits) {
    throw new SuperAdminPeopleError(
      "Choose a positive credit amount for a credit refund.",
    );
  }
  const confirmationCode = moneyChallenge();
  const expiresAt = new Date(input.now.getTime() + 10 * 60_000);
  const [review] = await database
    .insert(superAdminMoneyReviews)
    .values({
      actorPersonId: input.actor.personId,
      buyerPersonId: input.personId,
      organizationId: order.organizationId,
      orderId: order.id,
      amountMinor: input.amountMinor,
      currency: order.currency,
      disposition: input.disposition,
      credits: input.credits,
      reason: input.reason,
      confirmationCodeHash: hashChallenge(confirmationCode),
      expiresAt,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning({ id: superAdminMoneyReviews.id });
  if (!review)
    throw new SuperAdminPeopleError("Refund review could not be created.");
  await database.insert(auditLog).values({
    organizationId: order.organizationId,
    actorPersonId: input.actor.personId,
    actorType: "person",
    action: "super-admin.refund_review_created",
    entityType: "refund-review",
    entityId: review.id,
    afterHash: hashChallenge(
      JSON.stringify({ orderId: order.id, amountMinor: input.amountMinor }),
    ),
    reason: input.reason,
    traceId: input.requestId,
    ipAddress: input.ipAddress,
    createdAt: input.now,
  });
  return {
    id: review.id,
    orderId: order.id,
    amountMinor: input.amountMinor,
    currency: order.currency,
    confirmationCode,
    expiresAt: iso(expiresAt),
  };
}

export async function confirmSuperAdminRefund(input: {
  readonly actor: ApiActor;
  readonly reviewId: string;
  readonly confirmationCode: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<{ readonly id: string; readonly status: string }> {
  requireDatabase();
  const database = getDatabase();
  const review = await database.query.superAdminMoneyReviews.findFirst({
    where: and(
      eq(superAdminMoneyReviews.id, input.reviewId),
      eq(superAdminMoneyReviews.actorPersonId, input.actor.personId),
    ),
  });
  if (!review) throw new SuperAdminPeopleError("Refund review was not found.");
  if (review.status !== "pending") {
    throw new SuperAdminPeopleError(
      "This refund review has already been used.",
    );
  }
  if (review.expiresAt <= input.now) {
    await database
      .update(superAdminMoneyReviews)
      .set({ status: "expired", updatedAt: input.now })
      .where(eq(superAdminMoneyReviews.id, review.id));
    throw new SuperAdminPeopleError(
      "Refund review expired. Start a new review.",
    );
  }
  if (
    !timingSafeMatches(
      review.confirmationCodeHash,
      input.confirmationCode.trim(),
    )
  ) {
    throw new SuperAdminPeopleError(
      "Type the exact refund confirmation code to continue.",
    );
  }
  const acquired = await database
    .update(superAdminMoneyReviews)
    .set({ status: "processing", updatedAt: input.now })
    .where(
      and(
        eq(superAdminMoneyReviews.id, review.id),
        eq(superAdminMoneyReviews.status, "pending"),
      ),
    )
    .returning({ id: superAdminMoneyReviews.id });
  if (!acquired[0]) {
    throw new SuperAdminPeopleError("This refund is already being processed.");
  }
  try {
    const result = await refundOrganizationOrder({
      actor: { ...input.actor, organizationId: review.organizationId },
      orderId: review.orderId,
      amountMinor: review.amountMinor,
      disposition: review.disposition as
        "original-payment" | "organization-credit",
      credits: review.credits ?? undefined,
      reason: review.reason,
      requestId: `super-admin-refund:${review.id}`,
      ipAddress: input.ipAddress,
      now: input.now,
    });
    const status = result.status === "failed" ? "failed" : "succeeded";
    await database.batch([
      database
        .update(superAdminMoneyReviews)
        .set({
          status,
          confirmedAt: input.now,
          failureCode: result.status === "failed" ? "provider-failed" : null,
          updatedAt: input.now,
        })
        .where(eq(superAdminMoneyReviews.id, review.id)),
      database.insert(auditLog).values({
        organizationId: review.organizationId,
        actorPersonId: input.actor.personId,
        actorType: "person",
        action: "super-admin.refund_confirmed",
        entityType: "refund-review",
        entityId: review.id,
        afterHash: hashChallenge(
          JSON.stringify({ resultId: result.id, status: result.status }),
        ),
        reason: review.reason,
        traceId: input.requestId,
        ipAddress: input.ipAddress,
        createdAt: input.now,
      }),
    ]);
    return { id: result.id, status: result.status };
  } catch (error) {
    await database
      .update(superAdminMoneyReviews)
      .set({
        status: "failed",
        failureCode: "refund-error",
        updatedAt: input.now,
      })
      .where(eq(superAdminMoneyReviews.id, review.id));
    throw error;
  }
}
