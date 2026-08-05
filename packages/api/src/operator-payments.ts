import {
  appliedFees,
  auditLog,
  catalogItems,
  catalogPrices,
  eventTypes,
  getDatabase,
  operatorEarningsGoals,
  operatorPaymentCollections,
  operatorPaymentEvents,
  orderItems,
  orders,
  organizationCreditGrants,
  organizationMemberships,
  organizationParticipants,
  organizationTerminalLocations,
  organizationWallets,
  organizations,
  payments,
  people,
  programs,
  sessions,
  venues,
  walletAccounts,
  walletLedger,
} from "@duna/db";
import {
  calculateOperatorProcessingFee,
  calculateOrganizationCommissionFee,
  type CurrencyCode,
} from "@duna/pricing";
import { and, desc, eq, gt, inArray, ne, or, sql } from "drizzle-orm";
import type {
  OperatorPaymentCollection,
  OperatorPaymentStart,
  OperatorPaymentWorkspace,
} from "./contracts";
import type { ApiActor } from "./context";
import { ensureLedgerAccount } from "./catalog-service";
import { resolveOrganizationCommissionPolicy } from "./organization-billing";
import {
  createTerminalConnectionToken,
  createTerminalLocation,
  createTerminalPaymentIntent,
  isStripeConfigured,
  retrieveTerminalPaymentIntent,
} from "./payments";

export class OperatorPaymentError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "ORGANIZATION_NOT_FOUND"
      | "PAYER_NOT_FOUND"
      | "REFERENCE_NOT_FOUND"
      | "PAYMENTS_NOT_READY"
      | "TERMINAL_LOCATION_REQUIRED"
      | "COLLECTION_NOT_FOUND"
      | "COLLECTION_CONFLICT"
      | "INSUFFICIENT_CREDITS"
      | "INSUFFICIENT_WALLET_BALANCE"
      | "WALLET_CASH_DISABLED"
      | "MINOR_WALLET_RESTRICTED"
      | "PAYMENT_NOT_SETTLED",
    message: string,
  ) {
    super(message);
    this.name = "OperatorPaymentError";
  }
}

type PaymentReferenceType = "session" | "catalog-item" | "custom";
type PaymentTender = "card-present" | "organization-credit" | "wallet-cash";
type PaymentStatus = OperatorPaymentCollection["status"];

interface ResolvedReference {
  readonly type: PaymentReferenceType;
  readonly id?: string;
  readonly label: string;
  readonly itemKind: string;
  readonly suggestedAmountMinor?: number;
  readonly creditAmount?: number;
  readonly revenueCode: string;
}

function requireDatabase(): void {
  if (!process.env.DATABASE_URL) {
    throw new OperatorPaymentError(
      "DATABASE_REQUIRED",
      "In-person payments require the connected Duna database.",
    );
  }
}

function requireOrganization(actor: ApiActor): string {
  if (!actor.organizationId) {
    throw new OperatorPaymentError(
      "ORGANIZATION_NOT_FOUND",
      "Choose an organization before collecting payment.",
    );
  }
  return actor.organizationId;
}

function currency(value: string): CurrencyCode {
  if (
    value === "USD" ||
    value === "CAD" ||
    value === "AUD" ||
    value === "BRL" ||
    value === "EUR"
  ) {
    return value;
  }
  throw new OperatorPaymentError(
    "PAYMENTS_NOT_READY",
    `Duna Pro cannot collect ${value} payments yet.`,
  );
}

function collectionStatus(value: string): PaymentStatus {
  if (
    value === "created" ||
    value === "awaiting-reader" ||
    value === "processing" ||
    value === "succeeded" ||
    value === "declined" ||
    value === "failed" ||
    value === "cancelled"
  ) {
    return value;
  }
  return "failed";
}

function referenceType(value: string): PaymentReferenceType {
  if (value === "session" || value === "catalog-item") return value;
  return "custom";
}

function tender(value: string): PaymentTender {
  if (value === "organization-credit" || value === "wallet-cash") {
    return value;
  }
  return "card-present";
}

function collectionResult(
  row: typeof operatorPaymentCollections.$inferSelect,
  payerName: string,
): OperatorPaymentCollection {
  return {
    id: row.id,
    orderId: row.orderId,
    payerPersonId: row.payerPersonId,
    payerName,
    referenceType: referenceType(row.referenceType),
    referenceId: row.referenceId ?? undefined,
    referenceLabel: row.referenceLabel,
    tender: tender(row.tender),
    amountMinor: row.amountMinor,
    currency: currency(row.currency),
    applicationFeeMinor: row.applicationFeeMinor,
    processingFeeMinor: row.processingFeeMinor,
    commissionMinor: row.commissionMinor,
    creditsApplied: row.creditsApplied,
    walletCashAppliedMinor: row.walletCashAppliedMinor,
    netMinor: row.amountMinor - row.applicationFeeMinor,
    stripePaymentIntentId: row.stripePaymentIntentId ?? undefined,
    status: collectionStatus(row.status),
    declineCode: row.declineCode ?? undefined,
    failureCode: row.failureCode ?? undefined,
    failureMessage: row.failureMessage ?? undefined,
    receiptUrl: row.receiptUrl ?? undefined,
    completedAt: row.completedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function periodBounds(
  period: "week" | "month" | "quarter" | "year",
  now: Date,
): { readonly startsAt: Date; readonly endsAt: Date } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  if (period === "week") {
    const startsAt = new Date(
      Date.UTC(year, month, now.getUTCDate(), 0, 0, 0, 0),
    );
    const weekday = startsAt.getUTCDay() || 7;
    startsAt.setUTCDate(startsAt.getUTCDate() - weekday + 1);
    return {
      startsAt,
      endsAt: new Date(startsAt.getTime() + 7 * 24 * 60 * 60_000),
    };
  }
  if (period === "month") {
    return {
      startsAt: new Date(Date.UTC(year, month, 1)),
      endsAt: new Date(Date.UTC(year, month + 1, 1)),
    };
  }
  if (period === "quarter") {
    const quarterMonth = Math.floor(month / 3) * 3;
    return {
      startsAt: new Date(Date.UTC(year, quarterMonth, 1)),
      endsAt: new Date(Date.UTC(year, quarterMonth + 3, 1)),
    };
  }
  return {
    startsAt: new Date(Date.UTC(year, 0, 1)),
    endsAt: new Date(Date.UTC(year + 1, 0, 1)),
  };
}

function addressReady(
  organization: typeof organizations.$inferSelect,
): boolean {
  return Boolean(
    organization.addressLine1 &&
    organization.locality &&
    organization.postalCode &&
    organization.countryCode &&
    (!["US", "CA", "AU"].includes(organization.countryCode) ||
      organization.administrativeArea),
  );
}

function terminalReadiness(
  organization: typeof organizations.$inferSelect,
  locationId?: string,
): OperatorPaymentWorkspace["terminal"] {
  const stripeConfigured = isStripeConfigured();
  const connectedAccountReady = Boolean(
    organization.stripeAccountId && organization.stripeChargesEnabled,
  );
  const organizationAddressReady = addressReady(organization);
  let reason: string | undefined;
  if (!stripeConfigured)
    reason = "Stripe is not configured for this Duna environment.";
  else if (!connectedAccountReady)
    reason = "Finish the organization’s Stripe payouts setup first.";
  else if (!organizationAddressReady)
    reason = "Add the organization’s complete business address in Duna HQ.";
  return {
    ready:
      stripeConfigured && connectedAccountReady && organizationAddressReady,
    stripeConfigured,
    connectedAccountReady,
    organizationAddressReady,
    locationId,
    merchantDisplayName: organization.name,
    reason,
  };
}

async function organizationRow(organizationId: string) {
  const row = await getDatabase().query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });
  if (!row) {
    throw new OperatorPaymentError(
      "ORGANIZATION_NOT_FOUND",
      "This organization could not be found.",
    );
  }
  return row;
}

async function collectionById(
  organizationId: string,
  collectionId: string,
): Promise<OperatorPaymentCollection> {
  const row = (
    await getDatabase()
      .select({
        collection: operatorPaymentCollections,
        payerName: people.displayName,
      })
      .from(operatorPaymentCollections)
      .innerJoin(
        people,
        eq(operatorPaymentCollections.payerPersonId, people.id),
      )
      .where(
        and(
          eq(operatorPaymentCollections.id, collectionId),
          eq(operatorPaymentCollections.organizationId, organizationId),
        ),
      )
      .limit(1)
  )[0];
  if (!row) {
    throw new OperatorPaymentError(
      "COLLECTION_NOT_FOUND",
      "That payment attempt is not part of this organization.",
    );
  }
  return collectionResult(row.collection, row.payerName);
}

async function resolveReference(input: {
  readonly organizationId: string;
  readonly type: PaymentReferenceType;
  readonly id?: string;
  readonly label?: string;
}): Promise<ResolvedReference> {
  const database = getDatabase();
  if (input.type === "custom") {
    return {
      type: "custom",
      label: input.label?.trim() || "In-person payment",
      itemKind: "booking",
      revenueCode: "SERVICE_REVENUE",
    };
  }
  if (!input.id) {
    throw new OperatorPaymentError(
      "REFERENCE_NOT_FOUND",
      "Choose what this payment is for.",
    );
  }
  if (input.type === "session") {
    const row = (
      await database
        .select({
          session: sessions,
          eventType: eventTypes,
          programOrganizationId: programs.organizationId,
          venueOrganizationId: venues.organizationId,
        })
        .from(sessions)
        .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
        .leftJoin(programs, eq(sessions.programId, programs.id))
        .leftJoin(venues, eq(sessions.venueId, venues.id))
        .where(eq(sessions.id, input.id))
        .limit(1)
    )[0];
    if (
      !row ||
      ![
        row.eventType?.organizationId,
        row.programOrganizationId,
        row.venueOrganizationId,
      ].includes(input.organizationId)
    ) {
      throw new OperatorPaymentError(
        "REFERENCE_NOT_FOUND",
        "That session is not part of this organization.",
      );
    }
    return {
      type: "session",
      id: row.session.id,
      label: row.session.title,
      itemKind: "registration",
      suggestedAmountMinor: row.eventType?.priceMinor,
      creditAmount: row.eventType?.packageCreditCost ?? undefined,
      revenueCode: "EVENT_REVENUE",
    };
  }
  const item = await database.query.catalogItems.findFirst({
    where: and(
      eq(catalogItems.id, input.id),
      eq(catalogItems.organizationId, input.organizationId),
      ne(catalogItems.status, "archived"),
    ),
  });
  if (!item) {
    throw new OperatorPaymentError(
      "REFERENCE_NOT_FOUND",
      "That product is not part of this organization.",
    );
  }
  const priceRows = await database
    .select()
    .from(catalogPrices)
    .where(
      and(
        eq(catalogPrices.catalogItemId, item.id),
        eq(catalogPrices.active, true),
      ),
    );
  const moneyPrice =
    priceRows.find(
      (price) => price.paymentKind === "card" && price.audience === "everyone",
    ) ?? priceRows.find((price) => price.paymentKind === "card");
  const creditPrice =
    priceRows.find(
      (price) =>
        price.paymentKind === "credit" && price.audience === "everyone",
    ) ?? priceRows.find((price) => price.paymentKind === "credit");
  return {
    type: "catalog-item",
    id: item.id,
    label: item.title,
    itemKind:
      item.type === "good"
        ? "merchandise"
        : item.type === "event"
          ? "registration"
          : item.type === "plan"
            ? item.subtype === "membership"
              ? "membership"
              : "package"
            : "booking",
    suggestedAmountMinor: moneyPrice?.amountMinor ?? undefined,
    creditAmount: creditPrice?.creditAmount ?? undefined,
    revenueCode:
      item.type === "good"
        ? "GOODS_REVENUE"
        : item.type === "event"
          ? "EVENT_REVENUE"
          : item.type === "plan"
            ? item.subtype === "membership"
              ? "MEMBERSHIP_REVENUE"
              : "PLAN_REVENUE"
            : "SERVICE_REVENUE",
  };
}

async function assertPayer(
  organizationId: string,
  payerPersonId: string,
): Promise<typeof people.$inferSelect> {
  const database = getDatabase();
  const [person, participant, membership] = await Promise.all([
    database.query.people.findFirst({ where: eq(people.id, payerPersonId) }),
    database.query.organizationParticipants.findFirst({
      where: and(
        eq(organizationParticipants.organizationId, organizationId),
        eq(organizationParticipants.personId, payerPersonId),
        eq(organizationParticipants.status, "active"),
      ),
    }),
    database.query.organizationMemberships.findFirst({
      where: and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.personId, payerPersonId),
        eq(organizationMemberships.active, true),
      ),
    }),
  ]);
  if (!person || (!participant && !membership)) {
    throw new OperatorPaymentError(
      "PAYER_NOT_FOUND",
      "Choose a person connected to this organization.",
    );
  }
  return person;
}

async function ensureTerminalLocation(
  organization: typeof organizations.$inferSelect,
): Promise<string> {
  const database = getDatabase();
  const existing = await database.query.organizationTerminalLocations.findFirst(
    {
      where: and(
        eq(organizationTerminalLocations.organizationId, organization.id),
        eq(organizationTerminalLocations.status, "active"),
      ),
    },
  );
  if (existing) return existing.stripeLocationId;
  if (!addressReady(organization)) {
    throw new OperatorPaymentError(
      "TERMINAL_LOCATION_REQUIRED",
      "Add the organization’s complete business address before using Tap to Pay.",
    );
  }
  const location = await createTerminalLocation({
    organizationId: organization.id,
    displayName: organization.name,
    address: {
      line1: organization.addressLine1!,
      line2: organization.addressLine2 ?? undefined,
      city: organization.locality!,
      state: organization.administrativeArea ?? undefined,
      postalCode: organization.postalCode!,
      country: organization.countryCode,
    },
    idempotencyKey: `duna-terminal-location:${organization.id}`,
  });
  await database
    .insert(organizationTerminalLocations)
    .values({
      organizationId: organization.id,
      stripeLocationId: location.id,
      status: "active",
    })
    .onConflictDoNothing();
  const stored = await database.query.organizationTerminalLocations.findFirst({
    where: eq(organizationTerminalLocations.organizationId, organization.id),
  });
  if (!stored) {
    throw new OperatorPaymentError(
      "PAYMENTS_NOT_READY",
      "Duna could not finish the Stripe Terminal location setup.",
    );
  }
  return stored.stripeLocationId;
}

async function earningsSince(input: {
  readonly organizationId: string;
  readonly operatorPersonId: string;
  readonly startsAt: Date;
}): Promise<{ readonly grossMinor: number; readonly netMinor: number }> {
  const row = (
    await getDatabase()
      .select({
        grossMinor: sql<number>`COALESCE(SUM(${operatorPaymentCollections.amountMinor}), 0)::integer`,
        netMinor: sql<number>`COALESCE(SUM(${operatorPaymentCollections.amountMinor} - ${operatorPaymentCollections.applicationFeeMinor}), 0)::integer`,
      })
      .from(operatorPaymentCollections)
      .where(
        and(
          eq(operatorPaymentCollections.organizationId, input.organizationId),
          eq(
            operatorPaymentCollections.operatorPersonId,
            input.operatorPersonId,
          ),
          eq(operatorPaymentCollections.status, "succeeded"),
          gt(operatorPaymentCollections.completedAt, input.startsAt),
        ),
      )
  )[0];
  return {
    grossMinor: Number(row?.grossMinor ?? 0),
    netMinor: Number(row?.netMinor ?? 0),
  };
}

export async function loadOperatorPaymentWorkspace(input: {
  readonly actor: ApiActor;
  readonly now: Date;
}): Promise<OperatorPaymentWorkspace> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const database = getDatabase();
  const organization = await organizationRow(organizationId);
  const storedCurrency = currency(organization.currency);
  const [memberRows, participantRows, terminalLocation, goal, recentRows] =
    await Promise.all([
      database
        .select({ personId: organizationMemberships.personId })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.organizationId, organizationId),
            eq(organizationMemberships.active, true),
          ),
        ),
      database
        .select({ personId: organizationParticipants.personId })
        .from(organizationParticipants)
        .where(
          and(
            eq(organizationParticipants.organizationId, organizationId),
            eq(organizationParticipants.status, "active"),
          ),
        ),
      database.query.organizationTerminalLocations.findFirst({
        where: and(
          eq(organizationTerminalLocations.organizationId, organizationId),
          eq(organizationTerminalLocations.status, "active"),
        ),
      }),
      database.query.operatorEarningsGoals.findFirst({
        where: and(
          eq(operatorEarningsGoals.organizationId, organizationId),
          eq(operatorEarningsGoals.personId, input.actor.personId),
          eq(operatorEarningsGoals.active, true),
        ),
      }),
      database
        .select({
          collection: operatorPaymentCollections,
          payerName: people.displayName,
        })
        .from(operatorPaymentCollections)
        .innerJoin(
          people,
          eq(operatorPaymentCollections.payerPersonId, people.id),
        )
        .where(eq(operatorPaymentCollections.organizationId, organizationId))
        .orderBy(desc(operatorPaymentCollections.createdAt))
        .limit(30),
    ]);
  const personIds = [
    ...new Set([...memberRows, ...participantRows].map((row) => row.personId)),
  ];
  const [personRows, creditRows, cashRows, sessionRows, catalogRows] =
    await Promise.all([
      personIds.length
        ? database
            .select()
            .from(people)
            .where(inArray(people.id, personIds))
            .orderBy(people.displayName)
        : [],
      personIds.length
        ? database
            .select({
              personId: organizationWallets.personId,
              credits: organizationWallets.cachedAvailableCredits,
            })
            .from(organizationWallets)
            .where(
              and(
                eq(organizationWallets.organizationId, organizationId),
                eq(organizationWallets.status, "active"),
                inArray(organizationWallets.personId, personIds),
              ),
            )
        : [],
      personIds.length
        ? database
            .select({
              personId: walletAccounts.personId,
              currency: walletAccounts.currency,
              spendingBlocked: walletAccounts.spendingBlocked,
              availableMinor: sql<number>`GREATEST(COALESCE(SUM(CASE WHEN ${walletLedger.status} IN ('available', 'complete') THEN CASE WHEN ${walletLedger.direction} = 'credit' THEN ${walletLedger.amountMinor} ELSE -${walletLedger.amountMinor} END ELSE 0 END), 0), 0)::integer`,
            })
            .from(walletAccounts)
            .leftJoin(
              walletLedger,
              eq(walletLedger.walletAccountId, walletAccounts.id),
            )
            .where(inArray(walletAccounts.personId, personIds))
            .groupBy(
              walletAccounts.personId,
              walletAccounts.currency,
              walletAccounts.spendingBlocked,
            )
        : [],
      database
        .select({
          id: sessions.id,
          title: sessions.title,
          startsAt: sessions.startsAt,
          priceMinor: eventTypes.priceMinor,
          creditAmount: eventTypes.packageCreditCost,
          organizationFromEvent: eventTypes.organizationId,
          organizationFromProgram: programs.organizationId,
          organizationFromVenue: venues.organizationId,
        })
        .from(sessions)
        .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
        .leftJoin(programs, eq(sessions.programId, programs.id))
        .leftJoin(venues, eq(sessions.venueId, venues.id))
        .where(
          and(
            gt(
              sessions.endsAt,
              new Date(input.now.getTime() - 30 * 24 * 60 * 60_000),
            ),
            or(
              eq(eventTypes.organizationId, organizationId),
              eq(programs.organizationId, organizationId),
              eq(venues.organizationId, organizationId),
            ),
          ),
        )
        .orderBy(desc(sessions.startsAt))
        .limit(30),
      database
        .select({ item: catalogItems, price: catalogPrices })
        .from(catalogItems)
        .leftJoin(
          catalogPrices,
          and(
            eq(catalogPrices.catalogItemId, catalogItems.id),
            eq(catalogPrices.active, true),
          ),
        )
        .where(
          and(
            eq(catalogItems.organizationId, organizationId),
            ne(catalogItems.status, "archived"),
          ),
        )
        .orderBy(desc(catalogItems.updatedAt)),
    ]);
  const creditsByPerson = new Map(
    creditRows.map((row) => [row.personId, row.credits] as const),
  );
  const cashByPerson = new Map(
    cashRows.map((row) => [row.personId, row] as const),
  );
  const cashWalletFeatureEnabled =
    process.env.DUNA_WALLET_CASH_ENABLED === "true";
  const catalogReferenceMap = new Map<
    string,
    OperatorPaymentWorkspace["references"][number]
  >();
  for (const row of catalogRows) {
    const existing = catalogReferenceMap.get(row.item.id) ?? {
      type: "catalog-item" as const,
      id: row.item.id,
      label: row.item.title,
      detail: `${row.item.type.replaceAll("-", " ")} · ${row.item.status}`,
    };
    const next = {
      ...existing,
      suggestedAmountMinor:
        existing.suggestedAmountMinor ??
        (row.price?.paymentKind === "card"
          ? (row.price.amountMinor ?? undefined)
          : undefined),
      creditAmount:
        existing.creditAmount ??
        (row.price?.paymentKind === "credit"
          ? (row.price.creditAmount ?? undefined)
          : undefined),
    };
    catalogReferenceMap.set(row.item.id, next);
  }
  const todayStart = new Date(
    Date.UTC(
      input.now.getUTCFullYear(),
      input.now.getUTCMonth(),
      input.now.getUTCDate(),
    ),
  );
  const defaultPeriod = periodBounds("month", input.now);
  const goalActive =
    goal &&
    goal.periodStartsAt <= input.now &&
    goal.periodEndsAt > input.now &&
    goal.currency === storedCurrency;
  const periodStart = goalActive ? goal.periodStartsAt : defaultPeriod.startsAt;
  const [today, period] = await Promise.all([
    earningsSince({
      organizationId,
      operatorPersonId: input.actor.personId,
      startsAt: todayStart,
    }),
    earningsSince({
      organizationId,
      operatorPersonId: input.actor.personId,
      startsAt: periodStart,
    }),
  ]);
  return {
    currency: storedCurrency,
    terminal: terminalReadiness(
      organization,
      terminalLocation?.stripeLocationId,
    ),
    earnings: {
      todayGrossMinor: today.grossMinor,
      todayNetMinor: today.netMinor,
      periodGrossMinor: period.grossMinor,
      periodNetMinor: period.netMinor,
      goal: goalActive
        ? {
            id: goal.id,
            targetMinor: goal.targetMinor,
            period:
              goal.period === "week" ||
              goal.period === "quarter" ||
              goal.period === "year"
                ? goal.period
                : "month",
            periodStartsAt: goal.periodStartsAt.toISOString(),
            periodEndsAt: goal.periodEndsAt.toISOString(),
            progressMinor: period.netMinor,
            progressBps: Math.max(
              0,
              Math.round((period.netMinor * 10_000) / goal.targetMinor),
            ),
          }
        : undefined,
    },
    people: personRows.map((person) => {
      const cash = cashByPerson.get(person.id);
      const cashCurrency = cash ? currency(cash.currency) : undefined;
      return {
        personId: person.id,
        displayName: person.displayName,
        avatarUrl: person.avatarUrl ?? undefined,
        isMinor: person.isMinor,
        creditBalance: creditsByPerson.get(person.id) ?? 0,
        cashAvailableMinor: Number(cash?.availableMinor ?? 0),
        cashCurrency,
        cashWalletEnabled: Boolean(
          cashWalletFeatureEnabled &&
          cash &&
          !cash.spendingBlocked &&
          !person.isMinor &&
          cashCurrency === storedCurrency,
        ),
      };
    }),
    references: [
      ...sessionRows.map((session) => ({
        type: "session" as const,
        id: session.id,
        label: session.title,
        detail: new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone: organization.timezone,
        }).format(session.startsAt),
        suggestedAmountMinor: session.priceMinor ?? undefined,
        creditAmount: session.creditAmount ?? undefined,
      })),
      ...catalogReferenceMap.values(),
    ],
    recent: recentRows.map((row) =>
      collectionResult(row.collection, row.payerName),
    ),
  };
}

export async function createOperatorTerminalConnectionToken(input: {
  readonly actor: ApiActor;
}): Promise<{
  readonly secret: string;
  readonly locationId: string;
  readonly merchantDisplayName: string;
}> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const organization = await organizationRow(organizationId);
  const readiness = terminalReadiness(organization);
  if (!readiness.ready) {
    throw new OperatorPaymentError(
      "PAYMENTS_NOT_READY",
      readiness.reason ?? "Tap to Pay is not ready for this organization.",
    );
  }
  const locationId = await ensureTerminalLocation(organization);
  const token = await createTerminalConnectionToken(locationId);
  return {
    secret: token.secret,
    locationId,
    merchantDisplayName: organization.name,
  };
}

async function settleOrganizationCredits(input: {
  readonly collectionId: string;
  readonly orderId: string;
  readonly organizationId: string;
  readonly payerPersonId: string;
  readonly amountMinor: number;
  readonly credits: number;
  readonly currency: CurrencyCode;
  readonly revenueCode: string;
  readonly actorPersonId: string;
  readonly requestId: string;
  readonly now: Date;
}): Promise<void> {
  const database = getDatabase();
  const wallet = await database.query.organizationWallets.findFirst({
    where: and(
      eq(organizationWallets.organizationId, input.organizationId),
      eq(organizationWallets.personId, input.payerPersonId),
      eq(organizationWallets.status, "active"),
    ),
  });
  const availableGrant = wallet
    ? await database.query.organizationCreditGrants.findFirst({
        where: and(
          eq(organizationCreditGrants.organizationWalletId, wallet.id),
          eq(organizationCreditGrants.status, "active"),
          gt(organizationCreditGrants.remainingCredits, 0),
        ),
      })
    : undefined;
  if (
    !wallet ||
    !availableGrant ||
    wallet.cachedAvailableCredits < input.credits
  ) {
    throw new OperatorPaymentError(
      "INSUFFICIENT_CREDITS",
      `This player needs ${input.credits} organization credits.`,
    );
  }
  const unit = `${input.organizationId}:CREDIT`;
  const [controlAccountId, walletAccountId, deferredId, revenueId] =
    await Promise.all([
      ensureLedgerAccount({
        organizationId: input.organizationId,
        code: "CREDIT_REDEMPTION_CONTROL",
        name: "Credit redemption control",
        accountType: "memo",
        normalSide: "credit",
        unitKind: "organization-credit",
        unit,
      }),
      ensureLedgerAccount({
        organizationId: input.organizationId,
        ownerPersonId: input.payerPersonId,
        code: `MEMBER_CREDITS_${input.payerPersonId}`,
        name: "Member credit wallet",
        accountType: "liability",
        normalSide: "credit",
        unitKind: "organization-credit",
        unit,
      }),
      ensureLedgerAccount({
        organizationId: input.organizationId,
        code: "DEFERRED_CREDIT_REVENUE",
        name: "Deferred organization-credit revenue",
        accountType: "liability",
        normalSide: "credit",
        unitKind: "money",
        unit: input.currency,
        currency: input.currency,
      }),
      ensureLedgerAccount({
        organizationId: input.organizationId,
        code: input.revenueCode,
        name: input.revenueCode
          .toLowerCase()
          .replaceAll("_", " ")
          .replace(/^\w/, (value) => value.toUpperCase()),
        accountType: "revenue",
        normalSide: "credit",
        unitKind: "money",
        unit: input.currency,
        currency: input.currency,
      }),
    ]);
  await database.execute(sql`
    SELECT duna_redeem_organization_credits(
      ${input.organizationId}::uuid,
      ${input.payerPersonId}::uuid,
      ${input.orderId}::uuid,
      ${input.credits}::integer,
      ${walletAccountId}::uuid,
      ${controlAccountId}::uuid,
      ${crypto.randomUUID()}::uuid,
      ${deferredId}::uuid,
      ${revenueId}::uuid,
      ${crypto.randomUUID()}::uuid,
      ${input.currency}::text,
      ${`operator-payment:${input.collectionId}`}::text,
      ${input.now}::timestamptz
    )
  `);
  await database.batch([
    database
      .update(orders)
      .set({ walletAppliedMinor: input.amountMinor, updatedAt: input.now })
      .where(eq(orders.id, input.orderId)),
    database.insert(payments).values({
      orderId: input.orderId,
      method: "organization-credit",
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: "succeeded",
      createdAt: input.now,
      updatedAt: input.now,
    }),
    database
      .update(operatorPaymentCollections)
      .set({
        status: "succeeded",
        completedAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(operatorPaymentCollections.id, input.collectionId)),
    database.insert(operatorPaymentEvents).values({
      collectionId: input.collectionId,
      organizationId: input.organizationId,
      eventType: "wallet.approved",
      status: "succeeded",
      idempotencyKey: `operator-payment:${input.collectionId}:wallet-approved`,
      message: `${input.credits} organization credits redeemed.`,
    }),
    database.insert(auditLog).values({
      organizationId: input.organizationId,
      actorPersonId: input.actorPersonId,
      actorType: "person",
      action: "operator_payment.credit_succeeded",
      entityType: "operator-payment-collection",
      entityId: input.collectionId,
      reason: "Operator confirmed an in-person organization-credit payment.",
      traceId: input.requestId,
      createdAt: input.now,
    }),
  ]);
}

async function settleWalletCash(input: {
  readonly collectionId: string;
  readonly orderId: string;
  readonly organizationId: string;
  readonly payer: typeof people.$inferSelect;
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
  readonly now: Date;
}): Promise<void> {
  if (process.env.DUNA_WALLET_CASH_ENABLED !== "true") {
    throw new OperatorPaymentError(
      "WALLET_CASH_DISABLED",
      "Cash-wallet spending is not enabled for this environment.",
    );
  }
  if (input.payer.isMinor) {
    throw new OperatorPaymentError(
      "MINOR_WALLET_RESTRICTED",
      "A guardian must complete cash-wallet payments for a minor.",
    );
  }
  const database = getDatabase();
  const account = await database.query.walletAccounts.findFirst({
    where: and(
      eq(walletAccounts.personId, input.payer.id),
      eq(walletAccounts.currency, input.currency),
      eq(walletAccounts.spendingBlocked, false),
    ),
  });
  if (!account) {
    throw new OperatorPaymentError(
      "INSUFFICIENT_WALLET_BALANCE",
      "This player does not have an available cash wallet in this currency.",
    );
  }
  try {
    await database.execute(sql`
      SELECT duna_operator_wallet_cash_payment(
        ${input.collectionId}::uuid,
        ${account.id}::uuid,
        ${input.orderId}::uuid,
        ${input.amountMinor}::integer,
        ${input.currency}::text,
        ${input.now}::timestamptz
      )
    `);
  } catch (error) {
    throw new OperatorPaymentError(
      "INSUFFICIENT_WALLET_BALANCE",
      error instanceof Error
        ? error.message
        : "The player’s cash wallet could not cover this payment.",
    );
  }
}

export async function startOperatorPaymentCollection(input: {
  readonly actor: ApiActor;
  readonly amountMinor: number;
  readonly payerPersonId: string;
  readonly referenceType: PaymentReferenceType;
  readonly referenceId?: string;
  readonly referenceLabel?: string;
  readonly tender: PaymentTender;
  readonly creditsApplied?: number;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorPaymentStart> {
  requireDatabase();
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new OperatorPaymentError(
      "COLLECTION_CONFLICT",
      "Enter a payment amount greater than zero.",
    );
  }
  const organizationId = requireOrganization(input.actor);
  const database = getDatabase();
  const existing = (
    await database
      .select({
        collection: operatorPaymentCollections,
        payerName: people.displayName,
      })
      .from(operatorPaymentCollections)
      .innerJoin(
        people,
        eq(operatorPaymentCollections.payerPersonId, people.id),
      )
      .where(
        eq(operatorPaymentCollections.idempotencyKey, input.idempotencyKey),
      )
      .limit(1)
  )[0];
  if (existing) {
    if (existing.collection.organizationId !== organizationId) {
      throw new OperatorPaymentError(
        "COLLECTION_CONFLICT",
        "That payment key belongs to another organization.",
      );
    }
    const result = collectionResult(existing.collection, existing.payerName);
    const intent = existing.collection.stripePaymentIntentId
      ? await retrieveTerminalPaymentIntent(
          existing.collection.stripePaymentIntentId,
        )
      : undefined;
    const location =
      await database.query.organizationTerminalLocations.findFirst({
        where: eq(organizationTerminalLocations.organizationId, organizationId),
      });
    return {
      collection: result,
      clientSecret:
        result.status === "succeeded" ? undefined : intent?.clientSecret,
      terminalLocationId: location?.stripeLocationId,
    };
  }
  const [organization, payer, reference] = await Promise.all([
    organizationRow(organizationId),
    assertPayer(organizationId, input.payerPersonId),
    resolveReference({
      organizationId,
      type: input.referenceType,
      id: input.referenceId,
      label: input.referenceLabel,
    }),
  ]);
  const storedCurrency = currency(organization.currency);
  if (input.tender === "organization-credit") {
    if (!reference.creditAmount) {
      throw new OperatorPaymentError(
        "COLLECTION_CONFLICT",
        "Choose a session or product with a configured credit price.",
      );
    }
    if (input.creditsApplied !== reference.creditAmount) {
      throw new OperatorPaymentError(
        "COLLECTION_CONFLICT",
        `This item requires exactly ${reference.creditAmount} organization credits.`,
      );
    }
  }
  const commissionPolicy = resolveOrganizationCommissionPolicy(organization);
  const processingFee =
    input.tender === "card-present"
      ? calculateOperatorProcessingFee({
          amountMinor: input.amountMinor,
          currency: storedCurrency,
          method: "card-present",
        })
      : undefined;
  const commissionFee =
    input.tender === "card-present"
      ? calculateOrganizationCommissionFee({
          amountMinor: input.amountMinor,
          currency: storedCurrency,
          rateBps: commissionPolicy.rateBps,
          organizationId,
          plan: commissionPolicy.effectivePlan,
          source: commissionPolicy.source,
        })
      : undefined;
  const processingFeeMinor = processingFee?.amountMinor ?? 0;
  const commissionMinor = commissionFee?.amountMinor ?? 0;
  const applicationFeeMinor = Math.min(
    input.amountMinor,
    processingFeeMinor + commissionMinor,
  );
  const orderId = crypto.randomUUID();
  const collectionId = crypto.randomUUID();
  const initialStatus =
    input.tender === "card-present" ? "created" : "processing";
  await database.batch([
    database.insert(orders).values({
      id: orderId,
      organizationId,
      buyerPersonId: payer.id,
      status: "pending",
      currency: storedCurrency,
      subtotalMinor: input.amountMinor,
      feeTotalMinor: 0,
      taxTotalMinor: 0,
      totalMinor: input.amountMinor,
      idempotencyKey: `operator-payment:${input.idempotencyKey}`,
      expiresAt: new Date(input.now.getTime() + 24 * 60 * 60_000),
      createdAt: input.now,
      updatedAt: input.now,
    }),
    database.insert(orderItems).values({
      orderId,
      kind: reference.itemKind,
      referenceId: reference.id,
      description: reference.label,
      quantity: 1,
      unitAmountMinor: input.amountMinor,
      totalAmountMinor: input.amountMinor,
      createdAt: input.now,
    }),
    ...(processingFee
      ? [
          database.insert(appliedFees).values({
            orderId,
            ruleId: processingFee.id,
            payer: processingFee.payer,
            amountMinor: processingFee.amountMinor,
            currency: processingFee.currency,
            ruleInputs: processingFee.ruleInputs,
            createdAt: input.now,
          }),
        ]
      : []),
    ...(commissionFee
      ? [
          database.insert(appliedFees).values({
            orderId,
            ruleId: commissionFee.id,
            payer: commissionFee.payer,
            amountMinor: commissionFee.amountMinor,
            currency: commissionFee.currency,
            ruleInputs: commissionFee.ruleInputs,
            createdAt: input.now,
          }),
        ]
      : []),
    database.insert(operatorPaymentCollections).values({
      id: collectionId,
      organizationId,
      payerPersonId: payer.id,
      operatorPersonId: input.actor.personId,
      orderId,
      referenceType: reference.type,
      referenceId: reference.id,
      referenceLabel: reference.label,
      tender: input.tender,
      amountMinor: input.amountMinor,
      currency: storedCurrency,
      applicationFeeMinor,
      processingFeeMinor,
      commissionMinor,
      creditsApplied: input.creditsApplied ?? 0,
      walletCashAppliedMinor:
        input.tender === "wallet-cash" ? input.amountMinor : 0,
      status: initialStatus,
      idempotencyKey: input.idempotencyKey,
      createdAt: input.now,
      updatedAt: input.now,
    }),
    database.insert(operatorPaymentEvents).values({
      collectionId,
      organizationId,
      eventType: "collection.created",
      status: initialStatus,
      idempotencyKey: `operator-payment:${collectionId}:created`,
      message: `${payer.displayName} · ${reference.label}`,
      createdAt: input.now,
    }),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "operator_payment.created",
      entityType: "operator-payment-collection",
      entityId: collectionId,
      afterHash: undefined,
      reason: `Operator started a ${input.tender} collection for ${reference.label}.`,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  if (input.tender === "organization-credit") {
    try {
      await settleOrganizationCredits({
        collectionId,
        orderId,
        organizationId,
        payerPersonId: payer.id,
        amountMinor: input.amountMinor,
        credits: input.creditsApplied!,
        currency: storedCurrency,
        revenueCode: reference.revenueCode,
        actorPersonId: input.actor.personId,
        requestId: input.requestId,
        now: input.now,
      });
    } catch (error) {
      await recordOperatorPaymentEvent({
        actor: input.actor,
        collectionId,
        eventType: "wallet.declined",
        status: "declined",
        processorCode: "insufficient_credits",
        message:
          error instanceof Error ? error.message : "Credit payment failed.",
        details: {},
        idempotencyKey: `operator-payment:${collectionId}:wallet-declined`,
        now: input.now,
      });
      throw error;
    }
    return { collection: await collectionById(organizationId, collectionId) };
  }
  if (input.tender === "wallet-cash") {
    try {
      await settleWalletCash({
        collectionId,
        orderId,
        organizationId,
        payer,
        amountMinor: input.amountMinor,
        currency: storedCurrency,
        now: input.now,
      });
    } catch (error) {
      await recordOperatorPaymentEvent({
        actor: input.actor,
        collectionId,
        eventType: "wallet.declined",
        status: "declined",
        processorCode: "wallet_unavailable",
        message:
          error instanceof Error ? error.message : "Wallet payment failed.",
        details: {},
        idempotencyKey: `operator-payment:${collectionId}:wallet-declined`,
        now: input.now,
      });
      throw error;
    }
    return { collection: await collectionById(organizationId, collectionId) };
  }
  const readiness = terminalReadiness(organization);
  if (!readiness.ready || !organization.stripeAccountId) {
    await recordOperatorPaymentEvent({
      actor: input.actor,
      collectionId,
      eventType: "terminal.unavailable",
      status: "failed",
      processorCode: "terminal_not_ready",
      message: readiness.reason ?? "Tap to Pay is not ready.",
      details: {},
      idempotencyKey: `operator-payment:${collectionId}:terminal-unavailable`,
      now: input.now,
    });
    throw new OperatorPaymentError(
      "PAYMENTS_NOT_READY",
      readiness.reason ?? "Tap to Pay is not ready for this organization.",
    );
  }
  try {
    const locationId = await ensureTerminalLocation(organization);
    const intent = await createTerminalPaymentIntent({
      orderId,
      collectionId,
      organizationId,
      amountMinor: input.amountMinor,
      currency: storedCurrency,
      connectedAccountId: organization.stripeAccountId,
      applicationFeeMinor,
      payerPersonId: payer.id,
      operatorPersonId: input.actor.personId,
      referenceType: reference.type,
      referenceId: reference.id,
      idempotencyKey: `operator-payment:${collectionId}:intent`,
    });
    if (!intent.clientSecret) {
      throw new Error("Stripe did not return a Terminal client secret.");
    }
    await database.batch([
      database
        .update(orders)
        .set({ stripePaymentIntentId: intent.id, updatedAt: input.now })
        .where(eq(orders.id, orderId)),
      database
        .update(operatorPaymentCollections)
        .set({
          stripePaymentIntentId: intent.id,
          status: "awaiting-reader",
          updatedAt: input.now,
        })
        .where(eq(operatorPaymentCollections.id, collectionId)),
      database.insert(operatorPaymentEvents).values({
        collectionId,
        organizationId,
        eventType: "terminal.intent_ready",
        status: "awaiting-reader",
        idempotencyKey: `operator-payment:${collectionId}:intent-ready`,
        message: "Stripe Terminal PaymentIntent is ready for the reader.",
        createdAt: input.now,
      }),
    ]);
    return {
      collection: await collectionById(organizationId, collectionId),
      clientSecret: intent.clientSecret,
      terminalLocationId: locationId,
    };
  } catch (error) {
    await recordOperatorPaymentEvent({
      actor: input.actor,
      collectionId,
      eventType: "terminal.intent_failed",
      status: "failed",
      processorCode: "intent_creation_failed",
      message: error instanceof Error ? error.message : "Stripe setup failed.",
      details: {},
      idempotencyKey: `operator-payment:${collectionId}:intent-failed`,
      now: input.now,
    });
    throw error;
  }
}

export async function recordOperatorPaymentEvent(input: {
  readonly actor: ApiActor;
  readonly collectionId: string;
  readonly eventType: string;
  readonly status: PaymentStatus;
  readonly processorCode?: string;
  readonly message?: string;
  readonly details: Record<string, string | number | boolean>;
  readonly idempotencyKey: string;
  readonly now: Date;
}): Promise<OperatorPaymentCollection> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const database = getDatabase();
  const collection = await database.query.operatorPaymentCollections.findFirst({
    where: and(
      eq(operatorPaymentCollections.id, input.collectionId),
      eq(operatorPaymentCollections.organizationId, organizationId),
    ),
  });
  if (!collection) {
    throw new OperatorPaymentError(
      "COLLECTION_NOT_FOUND",
      "That payment attempt was not found.",
    );
  }
  await database
    .insert(operatorPaymentEvents)
    .values({
      collectionId: collection.id,
      organizationId,
      eventType: input.eventType.slice(0, 48),
      status: input.status,
      processorCode: input.processorCode?.slice(0, 96),
      message: input.message?.slice(0, 1_000),
      details: input.details,
      idempotencyKey: input.idempotencyKey,
      createdAt: input.now,
    })
    .onConflictDoNothing();
  if (collection.status !== "succeeded") {
    await database
      .update(operatorPaymentCollections)
      .set({
        status: input.status,
        declineCode:
          input.status === "declined"
            ? input.processorCode?.slice(0, 96)
            : collection.declineCode,
        failureCode:
          input.status === "failed"
            ? input.processorCode?.slice(0, 96)
            : collection.failureCode,
        failureMessage:
          input.status === "declined" || input.status === "failed"
            ? input.message?.slice(0, 1_000)
            : collection.failureMessage,
        updatedAt: input.now,
      })
      .where(eq(operatorPaymentCollections.id, collection.id));
  }
  return collectionById(organizationId, collection.id);
}

export async function finalizeOperatorPaymentCollection(input: {
  readonly actor: ApiActor;
  readonly collectionId: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorPaymentCollection> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const database = getDatabase();
  const collection = await database.query.operatorPaymentCollections.findFirst({
    where: and(
      eq(operatorPaymentCollections.id, input.collectionId),
      eq(operatorPaymentCollections.organizationId, organizationId),
    ),
  });
  if (!collection) {
    throw new OperatorPaymentError(
      "COLLECTION_NOT_FOUND",
      "That payment attempt was not found.",
    );
  }
  if (collection.status === "succeeded") {
    return collectionById(organizationId, collection.id);
  }
  if (!collection.stripePaymentIntentId) {
    throw new OperatorPaymentError(
      "COLLECTION_CONFLICT",
      "This payment attempt does not have a Stripe Terminal PaymentIntent.",
    );
  }
  const intent = await retrieveTerminalPaymentIntent(
    collection.stripePaymentIntentId,
  );
  const matches =
    intent.orderId === collection.orderId &&
    intent.collectionId === collection.id &&
    intent.amountMinor === collection.amountMinor &&
    intent.currency === collection.currency;
  if (!matches) {
    throw new OperatorPaymentError(
      "COLLECTION_CONFLICT",
      "Stripe’s payment details do not match this Duna collection.",
    );
  }
  if (intent.status !== "succeeded" || !intent.chargeId) {
    const declined = Boolean(intent.declineCode);
    await recordOperatorPaymentEvent({
      actor: input.actor,
      collectionId: collection.id,
      eventType: declined ? "terminal.declined" : "terminal.not_settled",
      status: declined ? "declined" : "failed",
      processorCode: intent.declineCode ?? intent.failureCode ?? intent.status,
      message:
        intent.failureMessage ??
        "Stripe has not confirmed this payment as succeeded.",
      details: { stripeStatus: intent.status },
      idempotencyKey: `operator-payment:${collection.id}:finalize:${intent.status}:${intent.declineCode ?? intent.failureCode ?? "none"}`,
      now: input.now,
    });
    throw new OperatorPaymentError(
      "PAYMENT_NOT_SETTLED",
      intent.failureMessage ?? "The card payment has not completed.",
    );
  }
  await database.execute(sql`
    SELECT duna_project_order_payment(
      ${collection.orderId}::uuid,
      ${intent.id}::text,
      ${intent.chargeId}::text,
      ${input.now}::timestamptz,
      ${`operator-payment:${collection.id}`}::text
    )
  `);
  await database.batch([
    database
      .update(payments)
      .set({ method: "stripe-terminal", updatedAt: input.now })
      .where(eq(payments.orderId, collection.orderId)),
    database
      .update(operatorPaymentCollections)
      .set({
        status: "succeeded",
        receiptUrl: intent.receiptUrl,
        declineCode: null,
        failureCode: null,
        failureMessage: null,
        completedAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(operatorPaymentCollections.id, collection.id)),
    database
      .insert(operatorPaymentEvents)
      .values({
        collectionId: collection.id,
        organizationId,
        eventType: "terminal.approved",
        status: "succeeded",
        idempotencyKey: `operator-payment:${collection.id}:approved`,
        message: "Stripe verified and settled the card-present payment.",
        details: { paymentIntentId: intent.id, chargeId: intent.chargeId },
        createdAt: input.now,
      })
      .onConflictDoNothing(),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "operator_payment.card_succeeded",
      entityType: "operator-payment-collection",
      entityId: collection.id,
      reason: "Server verified Stripe Terminal success before posting payment.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return collectionById(organizationId, collection.id);
}

export async function setOperatorEarningsGoal(input: {
  readonly actor: ApiActor;
  readonly targetMinor: number;
  readonly period: "week" | "month" | "quarter" | "year";
  readonly now: Date;
}): Promise<OperatorPaymentWorkspace> {
  requireDatabase();
  if (!Number.isSafeInteger(input.targetMinor) || input.targetMinor <= 0) {
    throw new OperatorPaymentError(
      "COLLECTION_CONFLICT",
      "Set an earnings goal greater than zero.",
    );
  }
  const organizationId = requireOrganization(input.actor);
  const database = getDatabase();
  const organization = await organizationRow(organizationId);
  const bounds = periodBounds(input.period, input.now);
  await database
    .update(operatorEarningsGoals)
    .set({ active: false, updatedAt: input.now })
    .where(
      and(
        eq(operatorEarningsGoals.organizationId, organizationId),
        eq(operatorEarningsGoals.personId, input.actor.personId),
        eq(operatorEarningsGoals.active, true),
      ),
    );
  await database.insert(operatorEarningsGoals).values({
    organizationId,
    personId: input.actor.personId,
    targetMinor: input.targetMinor,
    currency: currency(organization.currency),
    period: input.period,
    periodStartsAt: bounds.startsAt,
    periodEndsAt: bounds.endsAt,
    active: true,
    createdAt: input.now,
    updatedAt: input.now,
  });
  return loadOperatorPaymentWorkspace({ actor: input.actor, now: input.now });
}
