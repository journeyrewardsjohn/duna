import {
  appliedFees,
  auditLog,
  divisions,
  eventBlueprints,
  eventPolicyAcceptances,
  eventTypes,
  follows,
  getDatabase,
  messages,
  orderItems,
  orders,
  organizations,
  people,
  pickupParticipants,
  pickupSessions,
  programs,
  registrations,
  sessions,
  teamMembers,
  teamEntries,
  tickets,
  ticketTypes,
  venues,
} from "@duna/db";
import type { PersonSummary } from "@duna/core";
import {
  calculateOrganizationCommissionFee,
  calculateOperatorProcessingFee,
  priceConsumerOrder,
  type CurrencyCode,
  type OrderItemKind,
} from "@duna/pricing";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { stableHash } from "./canonical";
import { canonicalPublicWebUrl } from "./public-web-url";
import {
  evaluatePickupParticipant,
  evaluateRegistrationForSession,
  joinPickupGroup,
  registerForSession,
} from "./commerce";
import type { ApiActor } from "./context";
import { evaluateDivisionCriteria } from "./division-eligibility";
import { loadAttendanceReliability } from "./attendance-service";
import { reconcileDivisionSelection } from "./event-operations-service";
import { hasActiveDunaPlusMembership } from "./membership";
import { resolveOrganizationCommissionPolicy } from "./organization-billing";
import { sendTransactionalEmail } from "./resend";
import { sendTemplateSms } from "./sent";
import {
  createEventCheckoutSession,
  createEventPaymentIntent,
  createMobilePaymentCustomerSession,
  getOrCreatePlayerStripeCustomer,
  getStripeClient,
  getStripePublishableKey,
  isStripeConfigured,
} from "./payments";

export class CheckoutError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "EVENT_NOT_FOUND"
      | "EVENT_NOT_CHECKOUT_ELIGIBLE"
      | "STRIPE_REQUIRED"
      | "CHECKOUT_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}

export interface EventCheckoutResult {
  readonly mode: "free" | "stripe" | "waitlist" | "already-registered";
  readonly orderId?: string;
  readonly registrationId?: string;
  readonly registrationStatus?: "confirmed" | "waitlisted" | "pending";
  readonly fulfillmentStatus?: "confirmed" | "pending-approval";
  readonly teamClaimToken?: string;
  readonly checkoutSessionId?: string;
  readonly checkoutUrl?: string;
  readonly paymentSheet?: {
    readonly publishableKey: string;
    readonly paymentIntentId: string;
    readonly paymentIntentClientSecret: string;
    readonly customerId: string;
    readonly customerSessionClientSecret: string;
  };
  readonly expiresAt?: string;
  readonly pricing: {
    readonly subtotalMinor: number;
    readonly feeTotalMinor: number;
    readonly totalMinor: number;
    readonly currency: CurrencyCode;
  };
}

export interface EventCheckoutStatus {
  readonly orderId: string;
  readonly orderStatus:
    | "draft"
    | "pending"
    | "paid"
    | "partially-refunded"
    | "refunded"
    | "failed"
    | "disputed"
    | "cancelled";
  readonly registrationStatus?:
    | "invited"
    | "pending"
    | "confirmed"
    | "waitlisted"
    | "cancelled"
    | "refunded"
    | "checked-in";
  readonly fulfillmentStatus?: "confirmed" | "pending-approval";
  readonly complete: boolean;
}

export function validatePickupCoverPayment(input: {
  readonly pickup: boolean;
  readonly actorPersonId: string;
  readonly subjectPersonIds: readonly string[];
  readonly perPersonAmountMinor?: number;
}): void {
  if (
    input.pickup &&
    input.subjectPersonIds.some(
      (personId) => personId !== input.actorPersonId,
    ) &&
    input.perPersonAmountMinor === 0
  ) {
    throw new CheckoutError(
      "EVENT_NOT_CHECKOUT_ELIGIBLE",
      "Invite other players to a free match. Each player confirms their own place.",
    );
  }
}

export interface TeamClaimSummary {
  readonly eventTitle: string;
  readonly eventSlug: string;
  readonly divisionId: string;
  readonly divisionName: string;
  readonly captainName: string;
  readonly expectedTeamSize: number;
  readonly claimedPlayers: number;
  readonly paidPlayers: number;
  readonly paymentMode: "self" | "team";
  readonly status:
    "assembling" | "ready" | "confirmed" | "cancelled" | "expired";
  readonly expiresAt: string;
  readonly alreadyClaimed: boolean;
  readonly paymentRequired: boolean;
  readonly isOrganizer: boolean;
  readonly canManageRoster: boolean;
  readonly registrationClosesAt: string;
  readonly roster: readonly {
    readonly slot: number;
    readonly personId?: string;
    readonly inviteTarget?: string;
    readonly displayName: string;
    readonly status: "captain" | "selected" | "invited" | "claimed";
    readonly deliveryStatus?: "queued" | "sent" | "failed";
    readonly paid: boolean;
    readonly editable: boolean;
  }[];
}

export interface PendingTicketApproval {
  readonly orderId: string;
  readonly ticketTypeId: string;
  readonly sessionId: string;
  readonly eventTitle: string;
  readonly ticketName: string;
  readonly buyerName: string;
  readonly quantity: number;
  readonly totalMinor: number;
  readonly currency: CurrencyCode;
  readonly purchasedAt: string;
}

export interface TeammateSearchResult {
  readonly person: PersonSummary;
  readonly relationship: "recent-partner" | "connection" | "nearby" | "search";
  readonly sharedTeams: number;
  readonly following: boolean;
  readonly followsYou: boolean;
  readonly lastActivityAt?: string;
  readonly reliability: {
    readonly score?: number;
    readonly label:
      "new" | "building" | "needs-context" | "reliable" | "highly-reliable";
    readonly tracked: number;
    readonly attended: number;
    readonly noShows: number;
  };
  readonly gender: string;
  readonly eligible: boolean;
  readonly eligibilityReasons: readonly string[];
}

function personInitials(displayName: string): string {
  return displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export async function searchEventTeammates(input: {
  readonly actor: ApiActor;
  readonly query?: string;
  readonly divisionId?: string;
  readonly limit: number;
  readonly now: Date;
}): Promise<readonly TeammateSearchResult[]> {
  if (!process.env.DATABASE_URL) return [];
  const database = getDatabase();
  const query = input.query?.trim().slice(0, 80) ?? "";
  const actor = await database.query.people.findFirst({
    where: eq(people.id, input.actor.personId),
  });
  const division = input.divisionId
    ? await database.query.divisions.findFirst({
        where: eq(divisions.id, input.divisionId),
      })
    : undefined;
  const settings = (division?.settings ?? {}) as {
    readonly ratingMinimum?: number;
    readonly ratingMaximum?: number;
    readonly ageMinimum?: number;
    readonly ageMaximum?: number;
    readonly gender?: string;
  };
  const divisionSession = division?.sessionId
    ? await database.query.sessions.findFirst({
        where: eq(sessions.id, division.sessionId),
      })
    : undefined;
  const eligibilityDate = divisionSession?.startsAt ?? input.now;
  const discipline = division?.discipline ?? "beach-2s";
  const rows = await database.execute(sql`
    WITH actor_teams AS (
      SELECT ${teamMembers.teamId} AS team_id
      FROM ${teamMembers}
      WHERE ${teamMembers.personId} = ${input.actor.personId}::uuid
    ), partner_stats AS (
      SELECT
        teammate.person_id,
        count(DISTINCT teammate.team_id)::integer AS shared_teams,
        max(teammate.joined_at) AS last_partnered_at
      FROM team_members teammate
      INNER JOIN actor_teams mine ON mine.team_id = teammate.team_id
      WHERE teammate.person_id <> ${input.actor.personId}::uuid
      GROUP BY teammate.person_id
    )
    SELECT
      candidate.id,
      candidate.display_name,
      candidate.handle,
      candidate.avatar_url,
      candidate.home_market,
      candidate.is_minor,
      candidate.gender_category,
      candidate.birth_date,
      candidate.profile_claim_status,
      candidate.is_professional,
      rating.display,
      rating.mu,
      rating.phi,
      rating.sigma,
      rating.confidence,
      rating.discipline,
      coalesce(partner.shared_teams, 0)::integer AS shared_teams,
      partner.last_partnered_at,
      activity.last_activity_at
    FROM people candidate
    LEFT JOIN ratings rating
      ON rating.person_id = candidate.id
      AND rating.discipline = ${discipline}
    LEFT JOIN partner_stats partner ON partner.person_id = candidate.id
    LEFT JOIN LATERAL (
      SELECT max(last_activity_at) AS last_activity_at
      FROM (
        SELECT max(coalesce(recorded_at, updated_at, created_at)) AS last_activity_at
        FROM activity_attendance
        WHERE person_id = candidate.id
        UNION ALL
        SELECT max(coalesce(recorded_at, updated_at, created_at)) AS last_activity_at
        FROM session_attendance
        WHERE person_id = candidate.id
      ) activity_times
    ) activity ON true
    WHERE candidate.id <> ${input.actor.personId}::uuid
      AND candidate.status = 'active'
      AND candidate.profile_visibility = 'public'
      AND candidate.is_minor = false
      AND (
        ${query} = '' OR
        (
          coalesce(candidate.display_name, '') || ' ' ||
          coalesce(candidate.handle, '') || ' ' ||
          coalesce(candidate.home_market, '')
        )
          ILIKE ${`%${query}%`}
      )
    ORDER BY
      CASE WHEN lower(candidate.display_name) = lower(${query}) THEN 0 ELSE 1 END,
      CASE WHEN lower(candidate.display_name) LIKE lower(${`${query}%`}) THEN 0 ELSE 1 END,
      CASE WHEN partner.shared_teams > 0 THEN 0 ELSE 1 END,
      partner.last_partnered_at DESC NULLS LAST,
      CASE WHEN candidate.home_market = ${actor?.homeMarket ?? ""} THEN 0 ELSE 1 END,
      candidate.display_name ASC
    LIMIT ${Math.max(1, Math.min(20, input.limit))}
  `);
  type SearchRow = {
    id: string;
    display_name: string;
    handle: string;
    avatar_url: string | null;
    home_market: string | null;
    is_minor: boolean;
    gender_category: string | null;
    birth_date: string | null;
    profile_claim_status: string;
    is_professional: boolean;
    display: number | null;
    mu: number | null;
    phi: number | null;
    sigma: number | null;
    confidence: PersonSummary["rating"]["confidence"] | null;
    discipline: PersonSummary["rating"]["discipline"] | null;
    shared_teams: number;
    last_activity_at: Date | string | null;
  };
  const candidateIds = (rows.rows as unknown as SearchRow[]).map(
    (row) => row.id,
  );
  const [reliability, followingRows, followerRows] = await Promise.all([
    loadAttendanceReliability({ personIds: candidateIds }),
    candidateIds.length
      ? database
          .select({ personId: follows.entityId })
          .from(follows)
          .where(
            and(
              eq(follows.followerPersonId, input.actor.personId),
              eq(follows.entityType, "person"),
              inArray(follows.entityId, candidateIds),
            ),
          )
      : Promise.resolve([]),
    candidateIds.length
      ? database
          .select({ personId: follows.followerPersonId })
          .from(follows)
          .where(
            and(
              eq(follows.entityType, "person"),
              eq(follows.entityId, input.actor.personId),
              inArray(follows.followerPersonId, candidateIds),
            ),
          )
      : Promise.resolve([]),
  ]);
  const following = new Set(followingRows.map((row) => row.personId));
  const followers = new Set(followerRows.map((row) => row.personId));
  return (rows.rows as unknown as SearchRow[]).map((row) => {
    const ratingDisplay = row.display ?? 1;
    const criteria = evaluateDivisionCriteria({
      asOf: eligibilityDate,
      criteria: settings,
      participant: {
        birthDate: row.birth_date,
        genderCategory: row.gender_category,
        rating: ratingDisplay,
      },
    });
    const isFollowing = following.has(row.id);
    const followsYou = followers.has(row.id);
    const lastActivity = row.last_activity_at
      ? new Date(row.last_activity_at)
      : undefined;
    return {
      person: {
        id: row.id,
        displayName: row.display_name,
        handle: row.handle,
        initials: personInitials(row.display_name),
        homeMarket: row.home_market ?? "Market not set",
        rating: {
          display: ratingDisplay,
          mu: row.mu ?? 1_500,
          phi: row.phi ?? 350,
          sigma: row.sigma ?? 0.06,
          confidence: row.confidence ?? "Provisional",
          discipline: row.discipline ?? "beach-2s",
        },
        roles: ["player"],
        isMinor: row.is_minor,
        avatarUrl: row.avatar_url ?? undefined,
        profileClaimStatus:
          row.profile_claim_status as PersonSummary["profileClaimStatus"],
        isProfessional: row.is_professional,
      },
      relationship:
        row.shared_teams > 0
          ? "recent-partner"
          : isFollowing || followsYou
            ? "connection"
            : row.home_market && row.home_market === actor?.homeMarket
              ? "nearby"
              : "search",
      sharedTeams: row.shared_teams,
      following: isFollowing,
      followsYou,
      lastActivityAt:
        lastActivity && Number.isFinite(lastActivity.getTime())
          ? lastActivity.toISOString()
          : undefined,
      reliability: reliability.get(row.id) ?? {
        label: "new",
        tracked: 0,
        attended: 0,
        noShows: 0,
      },
      gender: row.gender_category ?? "Not listed",
      eligible: criteria.eligible,
      eligibilityReasons: criteria.reasons,
    };
  });
}

export interface ApprovedTicketOrder {
  readonly orderId: string;
  readonly ticketTypeId: string;
  readonly quantity: number;
  readonly status: "issued";
}

function currency(value: string): CurrencyCode {
  const supported: readonly CurrencyCode[] = [
    "USD",
    "CAD",
    "AUD",
    "BRL",
    "EUR",
  ];
  if (!supported.includes(value as CurrencyCode)) {
    throw new CheckoutError(
      "EVENT_NOT_CHECKOUT_ELIGIBLE",
      "Event currency is not supported.",
    );
  }
  return value as CurrencyCode;
}

interface CheckoutEvent {
  readonly id: string;
  readonly source: "session" | "pickup";
  readonly title: string;
  readonly kind:
    | "tournament"
    | "league"
    | "clinic"
    | "open-play"
    | "private-lesson"
    | "court-rental"
    | "pickup";
  readonly priceMinor: number;
  readonly teamPriceMinor?: number;
  readonly playerPriceMinor?: number;
  readonly currency: CurrencyCode;
  readonly itemKind?: OrderItemKind;
  readonly itemReferenceId?: string;
  readonly quantity?: number;
  readonly ticketTypeId?: string;
  readonly approvalRequired?: boolean;
  readonly teamSize?: number;
  readonly priceBasis?: "per-person" | "per-team";
  readonly organization?: typeof organizations.$inferSelect;
}

export interface CheckoutPolicy {
  readonly id: string;
  readonly kind: "policy" | "waiver";
  readonly title: string;
  readonly markdown: string;
  readonly required: boolean;
  readonly requireFullScroll: boolean;
  readonly waiverDocumentId?: string;
  readonly waiverVersionId?: string;
  readonly waiverContentHash?: string;
}

function checkoutPolicy(
  value: Record<string, unknown>,
): CheckoutPolicy | undefined {
  if (
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    value.id.length > 128 ||
    (value.kind !== "policy" && value.kind !== "waiver") ||
    typeof value.title !== "string" ||
    value.title.length === 0 ||
    typeof value.markdown !== "string" ||
    typeof value.required !== "boolean" ||
    typeof value.requireFullScroll !== "boolean"
  ) {
    return undefined;
  }
  return {
    id: value.id,
    kind: value.kind,
    title: value.title,
    markdown: value.markdown,
    required: value.required,
    requireFullScroll: value.requireFullScroll,
    waiverDocumentId:
      typeof value.waiverDocumentId === "string"
        ? value.waiverDocumentId
        : undefined,
    waiverVersionId:
      typeof value.waiverVersionId === "string"
        ? value.waiverVersionId
        : undefined,
    waiverContentHash:
      typeof value.waiverContentHash === "string"
        ? value.waiverContentHash
        : undefined,
  };
}

async function loadCheckoutPolicies(
  sessionId: string,
): Promise<readonly CheckoutPolicy[]> {
  const blueprint = await getDatabase().query.eventBlueprints.findFirst({
    where: eq(eventBlueprints.sessionId, sessionId),
  });
  const policies = (blueprint?.policies ?? [])
    .map(checkoutPolicy)
    .filter((policy): policy is CheckoutPolicy => Boolean(policy));
  // Waivers are a post-purchase participation requirement. Do not present a
  // legacy waiver policy in checkout or make payment depend on it; the
  // versioned waiver library supplies the follow-up signing flow instead.
  return policies.filter((policy) => policy.kind !== "waiver");
}

export function validatePolicyAcceptances(input: {
  readonly policies: readonly CheckoutPolicy[];
  readonly acceptedPolicyIds: readonly string[];
  readonly readPolicyIds: readonly string[];
}): readonly CheckoutPolicy[] {
  const accepted = new Set(input.acceptedPolicyIds);
  const read = new Set(input.readPolicyIds);
  const knownIds = new Set(input.policies.map((policy) => policy.id));
  if (
    input.acceptedPolicyIds.some((id) => !knownIds.has(id)) ||
    input.readPolicyIds.some((id) => !knownIds.has(id))
  ) {
    throw new CheckoutError(
      "EVENT_NOT_CHECKOUT_ELIGIBLE",
      "An event policy changed. Review the current agreements before continuing.",
    );
  }
  for (const policy of input.policies) {
    if (policy.required && !accepted.has(policy.id)) {
      throw new CheckoutError(
        "EVENT_NOT_CHECKOUT_ELIGIBLE",
        `${policy.title} must be accepted before checkout.`,
      );
    }
    if (
      accepted.has(policy.id) &&
      (policy.kind === "waiver" || policy.requireFullScroll) &&
      !read.has(policy.id)
    ) {
      throw new CheckoutError(
        "EVENT_NOT_CHECKOUT_ELIGIBLE",
        `${policy.title} must be read to the end before it can be accepted.`,
      );
    }
  }
  return input.policies.filter((policy) => accepted.has(policy.id));
}

async function recordPolicyAcceptances(input: {
  readonly policies: readonly CheckoutPolicy[];
  readonly readPolicyIds: readonly string[];
  readonly actor: ApiActor;
  readonly subjectPersonId: string;
  readonly sessionId: string;
  readonly orderId?: string;
  readonly registrationId?: string;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  if (input.policies.length === 0) return;
  const database = getDatabase();
  const read = new Set(input.readPolicyIds);
  for (const policy of input.policies) {
    const documentTextHash = stableHash(policy.markdown);
    const acceptanceKey = stableHash({
      checkout: input.idempotencyKey,
      policyId: policy.id,
      subjectPersonId: input.subjectPersonId,
      documentTextHash,
    });
    const accepted = await database
      .insert(eventPolicyAcceptances)
      .values({
        acceptanceKey,
        sessionId: input.sessionId,
        policyId: policy.id,
        policyKind: policy.kind,
        policyTitle: policy.title,
        documentText: policy.markdown,
        documentTextHash,
        subjectPersonId: input.subjectPersonId,
        acceptedByPersonId: input.actor.personId,
        orderId: input.orderId,
        registrationId: input.registrationId,
        fullScrollConfirmed: read.has(policy.id),
        ipAddress: input.ipAddress,
        acceptedAt: input.now,
      })
      .onConflictDoNothing({
        target: eventPolicyAcceptances.acceptanceKey,
      })
      .returning({ id: eventPolicyAcceptances.id });
    const acceptanceId = accepted[0]?.id;
    if (!acceptanceId) continue;
    await database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      organizationId: input.actor.organizationId,
      actorType: "person",
      action:
        policy.kind === "waiver"
          ? "event.waiver.accepted"
          : "event.policy.accepted",
      entityType: "event-policy-acceptance",
      entityId: acceptanceId,
      afterHash: stableHash({
        sessionId: input.sessionId,
        policyId: policy.id,
        documentTextHash,
        subjectPersonId: input.subjectPersonId,
        acceptedByPersonId: input.actor.personId,
        fullScrollConfirmed: read.has(policy.id),
      }),
      reason: `Accepted the exact ${policy.kind} document presented during event checkout.`,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
    });
  }
}

async function loadCheckoutEvent(
  eventId: string,
  divisionId?: string,
  ticketTypeId?: string,
  ticketQuantity = 1,
): Promise<CheckoutEvent> {
  if (ticketTypeId) {
    if (
      !Number.isSafeInteger(ticketQuantity) ||
      ticketQuantity < 1 ||
      ticketQuantity > 10
    ) {
      throw new CheckoutError(
        "EVENT_NOT_CHECKOUT_ELIGIBLE",
        "Ticket quantity must be between 1 and 10.",
      );
    }
    const ticket = (
      await getDatabase()
        .select({
          eventId: sessions.id,
          eventTitle: sessions.title,
          ticketTypeId: ticketTypes.id,
          ticketName: ticketTypes.name,
          priceMinor: ticketTypes.priceMinor,
          currency: ticketTypes.currency,
          quantity: ticketTypes.quantity,
          minimumPerOrder: ticketTypes.minimumPerOrder,
          maximumPerOrder: ticketTypes.maximumPerOrder,
          salesStartsAt: ticketTypes.salesStartsAt,
          salesEndsAt: ticketTypes.salesEndsAt,
          hidden: ticketTypes.hidden,
          availableOnline: ticketTypes.availableOnline,
          manualSoldOut: ticketTypes.manualSoldOut,
          approvalRequired: ticketTypes.approvalRequired,
          organizationFromProgram: programs.organizationId,
          organizationFromEventType: eventTypes.organizationId,
          organizationFromVenue: venues.organizationId,
        })
        .from(ticketTypes)
        .innerJoin(sessions, eq(ticketTypes.sessionId, sessions.id))
        .leftJoin(programs, eq(sessions.programId, programs.id))
        .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
        .leftJoin(venues, eq(sessions.venueId, venues.id))
        .where(eq(ticketTypes.id, ticketTypeId))
        .limit(1)
    )[0];
    if (!ticket || ticket.eventId !== eventId) {
      throw new CheckoutError(
        "EVENT_NOT_CHECKOUT_ELIGIBLE",
        "The selected ticket is not available for this event.",
      );
    }
    const now = new Date();
    if (
      ticket.hidden ||
      !ticket.availableOnline ||
      ticket.manualSoldOut ||
      ticketQuantity < ticket.minimumPerOrder ||
      ticketQuantity > ticket.maximumPerOrder ||
      (ticket.salesStartsAt && ticket.salesStartsAt > now) ||
      (ticket.salesEndsAt && ticket.salesEndsAt <= now)
    ) {
      throw new CheckoutError(
        "EVENT_NOT_CHECKOUT_ELIGIBLE",
        "The selected ticket is not currently available online.",
      );
    }
    if (ticket.quantity !== null) {
      const issued = await getDatabase()
        .select({ count: sql<number>`count(*)::integer` })
        .from(tickets)
        .where(
          sql`${tickets.ticketTypeId} = ${ticketTypeId}::uuid AND ${tickets.status} IN ('held', 'issued', 'transferred', 'scanned')`,
        );
      if ((issued[0]?.count ?? 0) + ticketQuantity > ticket.quantity) {
        throw new CheckoutError(
          "EVENT_NOT_CHECKOUT_ELIGIBLE",
          "There are not enough tickets remaining for that quantity.",
        );
      }
    }
    const organizationId =
      ticket.organizationFromProgram ??
      ticket.organizationFromEventType ??
      ticket.organizationFromVenue;
    if (!organizationId) {
      throw new CheckoutError(
        "EVENT_NOT_CHECKOUT_ELIGIBLE",
        "Event is not attached to a billable organization.",
      );
    }
    const organization = await getDatabase().query.organizations.findFirst({
      where: eq(organizations.id, organizationId),
    });
    if (!organization) {
      throw new CheckoutError(
        "EVENT_NOT_CHECKOUT_ELIGIBLE",
        "Event organization was not found.",
      );
    }
    return {
      id: ticket.eventId,
      source: "session",
      title: `${ticket.eventTitle} · ${ticket.ticketName}`,
      kind: "open-play",
      priceMinor: ticket.priceMinor,
      currency: currency(ticket.currency),
      itemKind: "ticket",
      itemReferenceId: ticket.ticketTypeId,
      quantity: ticketQuantity,
      ticketTypeId: ticket.ticketTypeId,
      approvalRequired: ticket.approvalRequired,
      organization,
    };
  }

  const row = (
    await getDatabase()
      .select({
        id: sessions.id,
        title: sessions.title,
        kindFromProgram: programs.kind,
        kindFromEventType: eventTypes.kind,
        organizationFromProgram: programs.organizationId,
        organizationFromEventType: eventTypes.organizationId,
        organizationFromVenue: venues.organizationId,
        priceMinor: eventTypes.priceMinor,
        currency: eventTypes.currency,
        divisionId: divisions.id,
        divisionPriceMinor: divisions.entryFeeMinor,
        divisionCurrency: divisions.currency,
        divisionTeamSize: divisions.teamSize,
        divisionPriceBasis: divisions.priceBasis,
        divisionSettings: divisions.settings,
      })
      .from(sessions)
      .leftJoin(programs, eq(sessions.programId, programs.id))
      .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
      .leftJoin(venues, eq(sessions.venueId, venues.id))
      .leftJoin(
        divisions,
        divisionId
          ? sql`${divisions.id} = ${divisionId}::uuid AND ${divisions.sessionId} = ${sessions.id}`
          : sql`false`,
      )
      .where(eq(sessions.id, eventId))
      .limit(1)
  )[0];
  if (row) {
    if (divisionId && row.divisionId !== divisionId) {
      throw new CheckoutError(
        "EVENT_NOT_CHECKOUT_ELIGIBLE",
        "The selected division is not available for this event.",
      );
    }
    const organizationId =
      row.organizationFromProgram ??
      row.organizationFromEventType ??
      row.organizationFromVenue;
    if (!organizationId) {
      throw new CheckoutError(
        "EVENT_NOT_CHECKOUT_ELIGIBLE",
        "Event is not attached to a billable organization.",
      );
    }
    const organization = await getDatabase().query.organizations.findFirst({
      where: eq(organizations.id, organizationId),
    });
    if (!organization) {
      throw new CheckoutError(
        "EVENT_NOT_CHECKOUT_ELIGIBLE",
        "Event organization was not found.",
      );
    }
    const selectedTeamSize = Math.max(1, row.divisionTeamSize ?? 1);
    const configuredTeamPrice = row.divisionSettings?.teamEntryFeeMinor;
    const configuredPlayerPrice = row.divisionSettings?.playerEntryFeeMinor;
    const basePriceMinor = row.divisionPriceMinor ?? row.priceMinor ?? 0;
    const teamPriceMinor =
      typeof configuredTeamPrice === "number" &&
      Number.isSafeInteger(configuredTeamPrice) &&
      configuredTeamPrice >= 0
        ? configuredTeamPrice
        : row.divisionPriceBasis === "per-person"
          ? basePriceMinor * selectedTeamSize
          : basePriceMinor;
    const playerPriceMinor =
      typeof configuredPlayerPrice === "number" &&
      Number.isSafeInteger(configuredPlayerPrice) &&
      configuredPlayerPrice >= 0
        ? configuredPlayerPrice
        : row.divisionPriceBasis === "per-person"
          ? basePriceMinor
          : Math.ceil(basePriceMinor / selectedTeamSize);
    return {
      id: row.id,
      source: "session",
      title: row.title,
      kind: row.kindFromProgram ?? row.kindFromEventType ?? "open-play",
      priceMinor: basePriceMinor,
      teamPriceMinor,
      playerPriceMinor,
      currency: currency(
        row.divisionCurrency ?? row.currency ?? organization.currency,
      ),
      teamSize: selectedTeamSize,
      priceBasis:
        row.divisionPriceBasis === "per-person" ? "per-person" : "per-team",
      organization,
    };
  }

  const pickup = (
    await getDatabase()
      .select({
        id: pickupSessions.id,
        title: pickupSessions.title,
        organizationId: pickupSessions.organizationId,
        venueOrganizationId: venues.organizationId,
        priceMinor: pickupSessions.costMinor,
        currency: pickupSessions.currency,
        approvalRequired: pickupSessions.approvalRequired,
      })
      .from(pickupSessions)
      .leftJoin(venues, eq(pickupSessions.venueId, venues.id))
      .where(eq(pickupSessions.id, eventId))
      .limit(1)
  )[0];
  if (!pickup) {
    throw new CheckoutError("EVENT_NOT_FOUND", "Event was not found.");
  }
  const organizationId =
    pickup.organizationId ?? pickup.venueOrganizationId ?? undefined;
  const organization = organizationId
    ? await getDatabase().query.organizations.findFirst({
        where: eq(organizations.id, organizationId),
      })
    : undefined;
  return {
    id: pickup.id,
    source: "pickup",
    title: pickup.title,
    kind: "pickup",
    priceMinor: pickup.priceMinor,
    playerPriceMinor: pickup.priceMinor,
    teamPriceMinor: pickup.priceMinor * 2,
    currency: currency(pickup.currency),
    approvalRequired: pickup.approvalRequired,
    teamSize: 2,
    priceBasis: "per-person",
    organization,
  };
}

async function existingCheckoutResult(input: {
  readonly orderId: string;
  readonly registrationId?: string;
  readonly teamClaimToken?: string;
  readonly paymentSurface: "hosted" | "native";
}): Promise<EventCheckoutResult | undefined> {
  const order = await getDatabase().query.orders.findFirst({
    where: eq(orders.id, input.orderId),
  });
  if (!order || !isStripeConfigured()) {
    return undefined;
  }
  const orderPricing = {
    subtotalMinor: order.subtotalMinor,
    feeTotalMinor: order.feeTotalMinor,
    totalMinor: order.totalMinor,
    currency: currency(order.currency),
  };

  if (input.paymentSurface === "native") {
    if (!order.stripePaymentIntentId) return undefined;
    const intent = await getStripeClient().paymentIntents.retrieve(
      order.stripePaymentIntentId,
    );
    if (intent.status === "canceled" || !intent.client_secret) return undefined;
    const customerId =
      typeof intent.customer === "string"
        ? intent.customer
        : intent.customer?.id;
    if (!customerId) return undefined;
    return {
      mode: "stripe",
      orderId: order.id,
      registrationId: input.registrationId,
      registrationStatus: "pending",
      teamClaimToken: input.teamClaimToken,
      paymentSheet: {
        publishableKey: getStripePublishableKey(),
        paymentIntentId: intent.id,
        paymentIntentClientSecret: intent.client_secret,
        customerId,
        customerSessionClientSecret:
          await createMobilePaymentCustomerSession(customerId),
      },
      expiresAt: order.expiresAt?.toISOString(),
      pricing: orderPricing,
    };
  }

  if (!order.stripeCheckoutSessionId) return undefined;
  const checkout = await getStripeClient().checkout.sessions.retrieve(
    order.stripeCheckoutSessionId,
  );
  if (!checkout.url || checkout.status !== "open") return undefined;
  return {
    mode: "stripe",
    orderId: order.id,
    registrationId: input.registrationId,
    registrationStatus: "pending",
    teamClaimToken: input.teamClaimToken,
    checkoutSessionId: checkout.id,
    checkoutUrl: checkout.url,
    expiresAt: new Date(checkout.expires_at * 1_000).toISOString(),
    pricing: orderPricing,
  };
}

export function resolveRegistrationUnitAmount(input: {
  readonly currentUnitAmountMinor: number;
  readonly paidRegistration?: boolean;
  readonly paidRegistrationUnitAmountMinor?: number;
}): number {
  if (
    input.paidRegistration &&
    input.paidRegistrationUnitAmountMinor === undefined
  ) {
    throw new CheckoutError(
      "CHECKOUT_UNAVAILABLE",
      "The paid registration price snapshot is unavailable. No new amount was charged.",
    );
  }
  const amount =
    input.paidRegistrationUnitAmountMinor ?? input.currentUnitAmountMinor;
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new CheckoutError(
      "CHECKOUT_UNAVAILABLE",
      "The registration price snapshot is invalid.",
    );
  }
  return amount;
}

interface CheckoutTeamMember {
  readonly personId?: string;
  readonly inviteTarget?: string;
  readonly displayName?: string;
  readonly status?: "selected" | "invited" | "claimed";
  readonly deliveryChannel?: "email" | "sms" | "in-app";
  readonly deliveryStatus?: "queued" | "sent" | "failed";
  readonly providerMessageId?: string;
  readonly paidAt?: string;
  readonly orderId?: string;
}

async function saveTeamEntry(input: {
  readonly registrationId: string;
  readonly payingPersonId: string;
  readonly expectedTeamSize: number;
  readonly paymentMode: "self" | "team";
  readonly roster: readonly CheckoutTeamMember[];
  readonly now: Date;
}): Promise<{
  readonly id: string;
  readonly claimToken: string;
  readonly created: boolean;
}> {
  const existing = await getDatabase().query.teamEntries.findFirst({
    where: eq(teamEntries.registrationId, input.registrationId),
  });
  if (existing) {
    return { id: existing.id, claimToken: existing.claimToken, created: false };
  }
  const id = crypto.randomUUID();
  const claimToken = crypto.randomUUID();
  await getDatabase()
    .insert(teamEntries)
    .values({
      id,
      registrationId: input.registrationId,
      payingPersonId: input.payingPersonId,
      partnerPersonId: input.roster.find((member) => member.personId)?.personId,
      expectedTeamSize: input.expectedTeamSize,
      paymentMode: input.paymentMode,
      roster: input.roster.map((member) => ({
        ...member,
        status: member.personId ? ("selected" as const) : ("invited" as const),
      })),
      status: "assembling",
      claimToken,
      claimExpiresAt: new Date(input.now.getTime() + 14 * 24 * 60 * 60_000),
    });
  return { id, claimToken, created: true };
}

async function deliverTeamInvitations(input: {
  readonly teamEntryId: string;
  readonly claimToken: string;
  readonly roster: readonly CheckoutTeamMember[];
  readonly captain: ApiActor;
  readonly eventTitle: string;
  readonly organizationId?: string;
  readonly applicationOrigin: string;
  readonly now: Date;
}) {
  const database = getDatabase();
  const invitationUrl = canonicalPublicWebUrl(
    `/app/team/claim/${input.claimToken}`,
    input.applicationOrigin,
  );
  const deliveredRoster = await Promise.all(
    input.roster.map(async (member, index) => {
      if (member.deliveryStatus === "sent") {
        return {
          ...member,
          status:
            member.status ??
            (member.personId ? ("selected" as const) : ("invited" as const)),
        };
      }
      const person = member.personId
        ? await database.query.people.findFirst({
            where: eq(people.id, member.personId),
          })
        : undefined;
      const target = member.inviteTarget?.trim();
      const email =
        person?.email ?? (target?.includes("@") ? target : undefined);
      const phone =
        person?.phoneE164 ??
        (target && !target.includes("@") ? target : undefined);
      const displayName =
        member.displayName ?? person?.displayName ?? "teammate";
      const body = `${input.captain.displayName} invited you to join their team for ${input.eventTitle}. Claim your player spot, review the event agreements, and pay your share if required: ${invitationUrl}`;
      let delivery:
        | {
            readonly channel: "email" | "sms" | "in-app";
            readonly sent: boolean;
            readonly messageId?: string;
          }
        | undefined;
      try {
        if (email) {
          const result = await sendTransactionalEmail({
            to: email,
            subject: `${input.captain.displayName} invited you to ${input.eventTitle}`,
            text: `Hi ${displayName},\n\n${body}\n\nYour team is not complete until every required player has claimed their spot and completed payment.`,
            idempotencyKey: `team-invite-${input.teamEntryId}-${index}-${stableHash({ email }).slice(0, 12)}`,
          });
          delivery = {
            channel: "email",
            sent: result.sent,
            messageId: result.messageId,
          };
        } else if (phone) {
          const result = await sendTemplateSms({
            to: phone,
            templateName:
              process.env.SENT_DM_TEAM_INVITE_TEMPLATE_NAME ??
              "duna_team_event_invite",
            parameters: {
              captain_name: input.captain.displayName,
              event_title: input.eventTitle,
              invite_url: invitationUrl,
            },
            idempotencyKey: `team-invite-${input.teamEntryId}-${index}-${stableHash({ phone }).slice(0, 12)}`,
          });
          delivery = {
            channel: "sms",
            sent: result.sent,
            messageId: result.messageId,
          };
        }
      } catch {
        delivery = {
          channel: email ? "email" : phone ? "sms" : "in-app",
          sent: false,
        };
      }
      if (person) {
        await database.insert(messages).values({
          organizationId: input.organizationId,
          senderPersonId: input.captain.personId,
          recipientPersonId: person.id,
          channel: "in-app",
          kind: "event-team-invitation",
          subject: `Team invitation · ${input.eventTitle}`,
          body,
          status: "queued",
          scheduledAt: input.now,
        });
        delivery ??= { channel: "in-app", sent: true };
      }
      return {
        ...member,
        status:
          member.status ??
          (member.personId ? ("selected" as const) : ("invited" as const)),
        deliveryChannel: delivery?.channel,
        deliveryStatus: delivery
          ? delivery.sent
            ? ("sent" as const)
            : ("failed" as const)
          : undefined,
        providerMessageId: delivery?.messageId,
      };
    }),
  );
  await database
    .update(teamEntries)
    .set({ roster: deliveredRoster, updatedAt: input.now })
    .where(eq(teamEntries.id, input.teamEntryId));
}

export async function startEventCheckout(input: {
  readonly actor: ApiActor;
  readonly sessionId: string;
  readonly divisionId?: string;
  readonly ticketTypeId?: string;
  readonly ticketQuantity?: number;
  readonly teamPaymentMode?: "self" | "team";
  readonly teamRoster?: readonly CheckoutTeamMember[];
  readonly teamClaimToken?: string;
  readonly subjectPersonId?: string;
  readonly acceptedPolicyIds?: readonly string[];
  readonly readPolicyIds?: readonly string[];
  readonly isDunaPlus: boolean;
  readonly paymentSurface?: "hosted" | "native";
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<EventCheckoutResult> {
  if (!process.env.DATABASE_URL) {
    throw new CheckoutError(
      "DATABASE_REQUIRED",
      "Checkout requires the connected Duna database.",
    );
  }
  const database = getDatabase();
  const subjectPersonId = input.subjectPersonId ?? input.actor.personId;
  if (input.divisionId && input.ticketTypeId) {
    throw new CheckoutError(
      "EVENT_NOT_CHECKOUT_ELIGIBLE",
      "Choose either a player division or an event ticket.",
    );
  }
  const event = await loadCheckoutEvent(
    input.sessionId,
    input.divisionId,
    input.ticketTypeId,
    input.ticketQuantity,
  );
  const joiningTeam = input.teamClaimToken
    ? await loadTeamClaimRecord(input.teamClaimToken)
    : undefined;
  if (input.teamClaimToken && !joiningTeam) {
    throw new CheckoutError(
      "EVENT_NOT_FOUND",
      "The team invitation for this registration was not found.",
    );
  }
  if (joiningTeam) {
    const member = joiningTeam.roster.find(
      (candidate) => candidate.personId === input.actor.personId,
    );
    if (
      joiningTeam.sessionId !== input.sessionId ||
      joiningTeam.divisionId !== input.divisionId ||
      joiningTeam.paymentMode === "team" ||
      joiningTeam.payingPersonId === input.actor.personId ||
      member?.status !== "claimed" ||
      member.paidAt
    ) {
      throw new CheckoutError(
        "EVENT_NOT_CHECKOUT_ELIGIBLE",
        "This team invitation is not eligible for an individual payment.",
      );
    }
    if (subjectPersonId !== input.actor.personId) {
      throw new CheckoutError(
        "EVENT_NOT_CHECKOUT_ELIGIBLE",
        "A team invitation must be paid from the invited player's profile.",
      );
    }
  }
  const policies = await loadCheckoutPolicies(input.sessionId);
  const acceptedPolicies = validatePolicyAcceptances({
    policies,
    acceptedPolicyIds: input.acceptedPolicyIds ?? [],
    readPolicyIds: input.readPolicyIds ?? [],
  });
  const expectedTeamSize = Math.max(1, event.teamSize ?? 1);
  const teamRoster = input.teamRoster ?? [];
  const pickupRosterPersonIds =
    event.source === "pickup" && input.teamPaymentMode === "team"
      ? teamRoster
          .map((member) => member.personId)
          .filter((personId): personId is string => Boolean(personId))
      : [];
  const pickupActorParticipation =
    event.source === "pickup"
      ? await database.query.pickupParticipants.findFirst({
          where: and(
            eq(pickupParticipants.pickupSessionId, event.id),
            eq(pickupParticipants.personId, input.actor.personId),
            inArray(pickupParticipants.status, ["confirmed", "checked-in"]),
          ),
        })
      : undefined;
  const pickupSubjectPersonIds =
    event.source === "pickup"
      ? [
          ...(!pickupActorParticipation ||
          subjectPersonId !== input.actor.personId
            ? [subjectPersonId]
            : []),
          ...pickupRosterPersonIds,
        ]
      : [];
  if (
    event.source === "pickup" &&
    ((input.teamPaymentMode === "team" &&
      (teamRoster.length === 0 ||
        pickupRosterPersonIds.length !== teamRoster.length ||
        new Set(pickupSubjectPersonIds).size !==
          pickupSubjectPersonIds.length ||
        pickupSubjectPersonIds.length > 10)) ||
      (input.teamPaymentMode !== "team" && teamRoster.length > 0) ||
      pickupSubjectPersonIds.length === 0)
  ) {
    throw new CheckoutError(
      "EVENT_NOT_CHECKOUT_ELIGIBLE",
      "Choose up to 10 distinct active Duna players to confirm together.",
    );
  }
  if (event.ticketTypeId && teamRoster.length > 0) {
    throw new CheckoutError(
      "EVENT_NOT_CHECKOUT_ELIGIBLE",
      "Team members apply to player entries, not spectator tickets.",
    );
  }
  if (joiningTeam && teamRoster.length > 0) {
    throw new CheckoutError(
      "EVENT_NOT_CHECKOUT_ELIGIBLE",
      "Invited players cannot create a second roster during team payment.",
    );
  }
  if (
    (event.source === "session" &&
      teamRoster.length > Math.max(0, expectedTeamSize - 1)) ||
    teamRoster.some(
      (member) =>
        !member.personId &&
        !member.inviteTarget?.trim() &&
        !member.displayName?.trim(),
    )
  ) {
    throw new CheckoutError(
      "EVENT_NOT_CHECKOUT_ELIGIBLE",
      "The team roster does not match the selected division.",
    );
  }
  const pickupPerPersonAmount =
    event.source === "pickup"
      ? (event.playerPriceMinor ?? event.priceMinor)
      : undefined;
  validatePickupCoverPayment({
    pickup: event.source === "pickup",
    actorPersonId: input.actor.personId,
    subjectPersonIds: pickupSubjectPersonIds,
    perPersonAmountMinor: pickupPerPersonAmount,
  });
  const hasDunaPlus = await hasActiveDunaPlusMembership(
    input.actor.personId,
    input.now,
  );
  const itemKind: OrderItemKind =
    event.itemKind ??
    (event.kind === "league" || event.kind === "tournament"
      ? "registration"
      : "booking");
  const itemQuantity =
    event.source === "pickup"
      ? pickupSubjectPersonIds.length
      : (event.quantity ?? 1);
  const currentUnitAmountMinor =
    event.source === "pickup"
      ? pickupPerPersonAmount!
      : event.ticketTypeId
        ? event.priceMinor
        : expectedTeamSize > 1 && input.teamPaymentMode === "team"
          ? (event.teamPriceMinor ?? event.priceMinor)
          : (event.playerPriceMinor ?? event.priceMinor);
  const paidRegistration = Boolean(
    joiningTeam &&
    (joiningTeam.orderStatus === "paid" ||
      joiningTeam.orderStatus === "partially-refunded"),
  );
  const unitAmountMinor = resolveRegistrationUnitAmount({
    currentUnitAmountMinor,
    paidRegistration,
    paidRegistrationUnitAmountMinor:
      paidRegistration && joiningTeam
        ? (joiningTeam.originalPlayerPriceMinor ?? undefined)
        : undefined,
  });
  const priced = priceConsumerOrder({
    currency: event.currency,
    isDunaPlus: hasDunaPlus,
    items: [
      {
        id: event.itemReferenceId ?? event.id,
        kind: itemKind,
        description: event.title,
        quantity: itemQuantity,
        unitAmountMinor,
      },
    ],
  });
  const feeTotalMinor = priced.fees.reduce(
    (total, fee) => total + fee.amountMinor,
    0,
  );
  const pricing = {
    subtotalMinor: priced.subtotalMinor,
    feeTotalMinor,
    totalMinor: priced.totalMinor,
    currency: priced.currency,
  };

  if (priced.totalMinor === 0) {
    if (event.ticketTypeId) {
      const existingOrder = await database.query.orders.findFirst({
        where: eq(orders.idempotencyKey, input.idempotencyKey),
      });
      if (existingOrder) {
        await recordPolicyAcceptances({
          policies: acceptedPolicies,
          readPolicyIds: input.readPolicyIds ?? [],
          actor: input.actor,
          subjectPersonId,
          sessionId: input.sessionId,
          orderId: existingOrder.id,
          idempotencyKey: input.idempotencyKey,
          requestId: input.requestId,
          ipAddress: input.ipAddress,
          now: input.now,
        });
        return {
          mode: "free",
          orderId: existingOrder.id,
          fulfillmentStatus: event.approvalRequired
            ? "pending-approval"
            : "confirmed",
          pricing,
        };
      }
      const orderId = crypto.randomUUID();
      await database.batch([
        database.insert(orders).values({
          id: orderId,
          organizationId: event.organization?.id,
          buyerPersonId: input.actor.personId,
          status: "pending",
          currency: priced.currency,
          subtotalMinor: 0,
          feeTotalMinor: 0,
          taxTotalMinor: 0,
          totalMinor: 0,
          idempotencyKey: input.idempotencyKey,
        }),
        database.insert(orderItems).values({
          orderId,
          kind: "ticket",
          referenceId: event.ticketTypeId,
          description: event.title,
          quantity: itemQuantity,
          unitAmountMinor: 0,
          totalAmountMinor: 0,
        }),
      ]);
      try {
        await database.execute(sql`
          SELECT *
          FROM duna_hold_event_tickets(
            ${event.ticketTypeId}::uuid,
            ${orderId}::uuid,
            ${input.actor.personId}::uuid,
            ${itemQuantity}::integer
          )
        `);
        await database.batch([
          database
            .update(orders)
            .set({ status: "paid", updatedAt: input.now })
            .where(eq(orders.id, orderId)),
          ...(event.approvalRequired
            ? []
            : [
                database
                  .update(tickets)
                  .set({ status: "issued", updatedAt: input.now })
                  .where(eq(tickets.orderId, orderId)),
              ]),
        ]);
      } catch (error) {
        await database
          .update(orders)
          .set({ status: "cancelled", updatedAt: input.now })
          .where(eq(orders.id, orderId));
        throw error;
      }
      await recordPolicyAcceptances({
        policies: acceptedPolicies,
        readPolicyIds: input.readPolicyIds ?? [],
        actor: input.actor,
        subjectPersonId,
        sessionId: input.sessionId,
        orderId,
        idempotencyKey: input.idempotencyKey,
        requestId: input.requestId,
        ipAddress: input.ipAddress,
        now: input.now,
      });
      return {
        mode: "free",
        orderId,
        fulfillmentStatus: event.approvalRequired
          ? "pending-approval"
          : "confirmed",
        pricing,
      };
    }
    const registration =
      event.source === "pickup"
        ? (
            await joinPickupGroup({
              actor: input.actor,
              pickupSessionId: event.id,
              subjectPersonIds: pickupSubjectPersonIds,
              requestId: input.requestId,
              ipAddress: input.ipAddress,
              now: input.now,
            })
          )[0]!
        : await registerForSession({
            actor: input.actor,
            sessionId: event.id,
            divisionId: input.divisionId,
            subjectPersonId,
            requestId: input.requestId,
            ipAddress: input.ipAddress,
            now: input.now,
          });
    const registrationId =
      "registrationId" in registration
        ? registration.registrationId
        : registration.participantId;
    const savedTeamEntry =
      event.source === "session" &&
      expectedTeamSize > 1 &&
      !joiningTeam &&
      registration.status !== "waitlisted"
        ? await saveTeamEntry({
            registrationId,
            payingPersonId: input.actor.personId,
            expectedTeamSize,
            paymentMode: input.teamPaymentMode ?? "self",
            roster: teamRoster,
            now: input.now,
          })
        : undefined;
    if (savedTeamEntry?.created) {
      await deliverTeamInvitations({
        teamEntryId: savedTeamEntry.id,
        claimToken: savedTeamEntry.claimToken,
        roster: teamRoster,
        captain: input.actor,
        eventTitle: event.title,
        organizationId: event.organization?.id,
        applicationOrigin: new URL(input.successUrl).origin,
        now: input.now,
      }).catch(() => undefined);
    }
    const teamClaimToken = savedTeamEntry?.claimToken;
    if (joiningTeam && input.teamClaimToken) {
      await markTeamMemberPaid({
        record: joiningTeam,
        personId: input.actor.personId,
        now: input.now,
      });
    }
    const changedDivisionId = input.divisionId ?? joiningTeam?.divisionId;
    if (changedDivisionId && event.organization?.id) {
      await reconcileDivisionSelection({
        actor: { ...input.actor, organizationId: event.organization.id },
        divisionId: changedDivisionId,
        requestId: `${input.requestId}:selection`,
        ipAddress: input.ipAddress,
        now: input.now,
      });
    }
    await recordPolicyAcceptances({
      policies: acceptedPolicies,
      readPolicyIds: input.readPolicyIds ?? [],
      actor: input.actor,
      subjectPersonId,
      sessionId: input.sessionId,
      registrationId,
      idempotencyKey: input.idempotencyKey,
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      now: input.now,
    });
    return {
      mode: registration.status === "waitlisted" ? "waitlist" : "free",
      registrationId,
      registrationStatus: registration.status,
      teamClaimToken,
      pricing,
    };
  }
  if (
    !event.organization?.stripeAccountId ||
    !event.organization.stripeChargesEnabled
  ) {
    throw new CheckoutError(
      "CHECKOUT_UNAVAILABLE",
      "Paid registration is unavailable until the operator finishes payment setup.",
    );
  }
  if (!isStripeConfigured()) {
    throw new CheckoutError(
      "STRIPE_REQUIRED",
      "Secure checkout is not configured.",
    );
  }

  const eligibility = event.ticketTypeId
    ? undefined
    : event.source === "pickup"
      ? await evaluatePickupParticipant({
          actor: input.actor,
          pickupSessionId: event.id,
          subjectPersonId,
          now: input.now,
        })
      : await evaluateRegistrationForSession({
          actor: input.actor,
          sessionId: event.id,
          divisionId: input.divisionId,
          subjectPersonId,
          inviteCodes: [],
          now: input.now,
        });
  const existingOrder = await database.query.orders.findFirst({
    where: eq(orders.idempotencyKey, input.idempotencyKey),
  });
  const orderId = existingOrder?.id ?? crypto.randomUUID();
  const holdExpiresAt = new Date(input.now.getTime() + 35 * 60_000);
  const checkoutExpiresAt = new Date(input.now.getTime() + 30 * 60_000);
  const operatorProcessingFee = calculateOperatorProcessingFee({
    amountMinor: priced.subtotalMinor,
    currency: priced.currency,
    method: "online-card",
  });
  const commissionPolicy = resolveOrganizationCommissionPolicy(
    event.organization,
  );
  const organizationCommissionFee = calculateOrganizationCommissionFee({
    amountMinor: priced.subtotalMinor,
    currency: priced.currency,
    rateBps: commissionPolicy.rateBps,
    organizationId: event.organization.id,
    plan: commissionPolicy.effectivePlan,
    source: commissionPolicy.source,
  });
  if (!existingOrder) {
    await database.batch([
      database.insert(orders).values({
        id: orderId,
        organizationId: event.organization?.id,
        buyerPersonId: input.actor.personId,
        status: "pending",
        currency: priced.currency,
        subtotalMinor: priced.subtotalMinor,
        feeTotalMinor,
        taxTotalMinor: 0,
        totalMinor: priced.totalMinor,
        idempotencyKey: input.idempotencyKey,
        expiresAt: checkoutExpiresAt,
      }),
      database.insert(orderItems).values({
        orderId,
        kind: itemKind,
        referenceId: event.itemReferenceId ?? event.id,
        description: event.title,
        quantity: itemQuantity,
        unitAmountMinor,
        totalAmountMinor: unitAmountMinor * itemQuantity,
      }),
      ...[...priced.fees, operatorProcessingFee, organizationCommissionFee]
        .filter((fee) => fee.amountMinor > 0)
        .map((fee) =>
          database.insert(appliedFees).values({
            orderId,
            ruleId: fee.id,
            payer: fee.payer,
            amountMinor: fee.amountMinor,
            currency: fee.currency,
            ruleInputs: fee.ruleInputs,
          }),
        ),
    ]);
  }

  let hold:
    | {
        registration_id?: string | null;
        result_status?: string;
        spots_remaining?: number;
      }
    | undefined;
  try {
    if (event.ticketTypeId) {
      await database.execute(sql`
        SELECT *
        FROM duna_hold_event_tickets(
          ${event.ticketTypeId}::uuid,
          ${orderId}::uuid,
          ${input.actor.personId}::uuid,
          ${itemQuantity}::integer
        )
      `);
    } else if (event.source === "pickup") {
      const participations = await joinPickupGroup({
        actor: input.actor,
        pickupSessionId: event.id,
        subjectPersonIds: pickupSubjectPersonIds,
        orderId,
        holdExpiresAt,
        requestId: input.requestId,
        ipAddress: input.ipAddress,
        now: input.now,
      });
      const participation = participations[0]!;
      hold = {
        registration_id: participation.participantId,
        result_status: participation.status,
        spots_remaining: participation.spotsRemaining,
      };
    } else {
      const result = await database.execute(sql`
        SELECT *
        FROM duna_hold_session_registration(
          ${event.id}::uuid,
          ${input.divisionId ?? null}::uuid,
          ${subjectPersonId}::uuid,
          ${input.actor.personId}::uuid,
          ${orderId}::uuid,
          ${holdExpiresAt}::timestamptz,
          ${JSON.stringify(eligibility!.decision)}::jsonb,
          ${eligibility && "ruleVersion" in eligibility ? eligibility.ruleVersion : 0}::integer,
          ${input.requestId}::text,
          ${input.ipAddress ?? null}::text
        )
      `);
      hold = result.rows[0] as typeof hold;
    }
  } catch (error) {
    await database
      .update(orders)
      .set({ status: "cancelled", updatedAt: input.now })
      .where(eq(orders.id, orderId));
    throw error;
  }
  const savedTeamEntry =
    !event.ticketTypeId &&
    event.source === "session" &&
    expectedTeamSize > 1 &&
    !joiningTeam &&
    hold?.result_status === "pending" &&
    hold.registration_id
      ? await saveTeamEntry({
          registrationId: hold.registration_id,
          payingPersonId: input.actor.personId,
          expectedTeamSize,
          paymentMode: input.teamPaymentMode ?? "self",
          roster: teamRoster,
          now: input.now,
        })
      : undefined;
  if (savedTeamEntry?.created) {
    await deliverTeamInvitations({
      teamEntryId: savedTeamEntry.id,
      claimToken: savedTeamEntry.claimToken,
      roster: teamRoster,
      captain: input.actor,
      eventTitle: event.title,
      organizationId: event.organization?.id,
      applicationOrigin: new URL(input.successUrl).origin,
      now: input.now,
    }).catch(() => undefined);
  }
  const teamClaimToken = savedTeamEntry?.claimToken;
  if (
    joiningTeam &&
    input.teamClaimToken &&
    hold?.result_status === "pending" &&
    hold.registration_id
  ) {
    await attachTeamMemberOrder({
      record: joiningTeam,
      personId: input.actor.personId,
      orderId,
      now: input.now,
    });
  }
  if (!event.ticketTypeId && hold?.result_status === "confirmed") {
    await database
      .update(orders)
      .set({ status: "cancelled", updatedAt: input.now })
      .where(eq(orders.id, orderId));
    return {
      mode: "already-registered",
      registrationId: hold.registration_id ?? undefined,
      registrationStatus: "confirmed",
      pricing,
    };
  }
  if (
    !event.ticketTypeId &&
    (hold?.result_status === "full" || hold?.result_status === "waitlisted")
  ) {
    await database
      .update(orders)
      .set({ status: "cancelled", updatedAt: input.now })
      .where(eq(orders.id, orderId));
    if (hold.registration_id) {
      await recordPolicyAcceptances({
        policies: acceptedPolicies,
        readPolicyIds: input.readPolicyIds ?? [],
        actor: input.actor,
        subjectPersonId,
        sessionId: input.sessionId,
        registrationId: hold.registration_id,
        idempotencyKey: input.idempotencyKey,
        requestId: input.requestId,
        ipAddress: input.ipAddress,
        now: input.now,
      });
    }
    return {
      mode: "waitlist",
      registrationId: hold.registration_id ?? undefined,
      registrationStatus: "waitlisted",
      pricing,
    };
  }
  if (
    !event.ticketTypeId &&
    hold?.result_status === "pending" &&
    hold.registration_id
  ) {
    const heldRegistration =
      event.source === "pickup"
        ? await database.query.pickupParticipants.findFirst({
            where: eq(pickupParticipants.id, hold.registration_id),
          })
        : await database.query.registrations.findFirst({
            where: eq(registrations.id, hold.registration_id),
          });
    if (heldRegistration?.orderId && heldRegistration.orderId !== orderId) {
      await database
        .update(orders)
        .set({ status: "cancelled", updatedAt: input.now })
        .where(eq(orders.id, orderId));
      const resumed = await existingCheckoutResult({
        orderId: heldRegistration.orderId,
        registrationId: heldRegistration.id,
        teamClaimToken,
        paymentSurface: input.paymentSurface ?? "hosted",
      });
      if (resumed) return resumed;
      throw new CheckoutError(
        "CHECKOUT_UNAVAILABLE",
        "A checkout is already active for this participant.",
      );
    }
    const resumed = await existingCheckoutResult({
      orderId,
      registrationId: hold.registration_id,
      teamClaimToken,
      paymentSurface: input.paymentSurface ?? "hosted",
    });
    if (resumed) return resumed;
  }
  if (
    !event.ticketTypeId &&
    (!hold?.registration_id || hold.result_status !== "pending")
  ) {
    throw new CheckoutError(
      "CHECKOUT_UNAVAILABLE",
      "The event could not be held for checkout.",
    );
  }

  await recordPolicyAcceptances({
    policies: acceptedPolicies,
    readPolicyIds: input.readPolicyIds ?? [],
    actor: input.actor,
    subjectPersonId,
    sessionId: input.sessionId,
    orderId,
    registrationId: event.ticketTypeId
      ? undefined
      : (hold?.registration_id ?? undefined),
    idempotencyKey: input.idempotencyKey,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    now: input.now,
  });

  const buyer = await database.query.people.findFirst({
    where: eq(people.id, input.actor.personId),
  });
  try {
    const applicationFeeMinor = Math.min(
      priced.totalMinor,
      feeTotalMinor +
        operatorProcessingFee.amountMinor +
        organizationCommissionFee.amountMinor,
    );
    if (input.paymentSurface === "native") {
      const publishableKey = getStripePublishableKey();
      const customerId = await getOrCreatePlayerStripeCustomer({
        personId: input.actor.personId,
        existingCustomerId: buyer?.stripeCustomerId ?? undefined,
        email: buyer?.email ?? undefined,
        displayName: buyer?.displayName,
      });
      if (buyer?.stripeCustomerId !== customerId) {
        await database
          .update(people)
          .set({ stripeCustomerId: customerId, updatedAt: input.now })
          .where(eq(people.id, input.actor.personId));
      }
      const [paymentIntent, customerSessionClientSecret] = await Promise.all([
        createEventPaymentIntent({
          orderId,
          personId: input.actor.personId,
          customerId,
          customerEmail: buyer?.email ?? undefined,
          eventId: event.id,
          eventTitle: event.title,
          amountMinor: priced.totalMinor,
          currency: priced.currency,
          applicationFeeMinor,
          organizationCommissionMinor: organizationCommissionFee.amountMinor,
          organizationCommissionRateBps: commissionPolicy.rateBps,
          connectedAccountId: event.organization.stripeAccountId,
          idempotencyKey: input.idempotencyKey,
        }),
        createMobilePaymentCustomerSession(customerId),
      ]);
      await database
        .update(orders)
        .set({
          stripePaymentIntentId: paymentIntent.id,
          expiresAt: checkoutExpiresAt,
          updatedAt: input.now,
        })
        .where(eq(orders.id, orderId));
      return {
        mode: "stripe",
        orderId,
        registrationId: hold?.registration_id ?? undefined,
        registrationStatus: event.ticketTypeId ? undefined : "pending",
        teamClaimToken,
        paymentSheet: {
          publishableKey,
          paymentIntentId: paymentIntent.id,
          paymentIntentClientSecret: paymentIntent.clientSecret,
          customerId,
          customerSessionClientSecret,
        },
        expiresAt: checkoutExpiresAt.toISOString(),
        pricing,
      };
    }

    const checkout = await createEventCheckoutSession({
      orderId,
      personId: input.actor.personId,
      customerEmail: buyer?.email ?? undefined,
      eventId: event.id,
      eventTitle: event.title,
      amountMinor: priced.totalMinor,
      currency: priced.currency,
      applicationFeeMinor,
      organizationCommissionMinor: organizationCommissionFee.amountMinor,
      organizationCommissionRateBps: commissionPolicy.rateBps,
      connectedAccountId: event.organization.stripeAccountId,
      successUrl: teamClaimToken
        ? `${input.successUrl}&team=${encodeURIComponent(teamClaimToken)}`
        : input.successUrl,
      cancelUrl: input.cancelUrl,
      expiresAt: checkoutExpiresAt,
      idempotencyKey: input.idempotencyKey,
    });
    if (!checkout.url) {
      throw new CheckoutError(
        "CHECKOUT_UNAVAILABLE",
        "The payment processor did not return a checkout URL.",
      );
    }
    await database
      .update(orders)
      .set({
        stripeCheckoutSessionId: checkout.id,
        expiresAt: new Date(checkout.expiresAt),
        updatedAt: input.now,
      })
      .where(eq(orders.id, orderId));
    return {
      mode: "stripe",
      orderId,
      registrationId: hold?.registration_id ?? undefined,
      registrationStatus: event.ticketTypeId ? undefined : "pending",
      teamClaimToken,
      checkoutSessionId: checkout.id,
      checkoutUrl: checkout.url,
      expiresAt: checkout.expiresAt,
      pricing,
    };
  } catch (error) {
    await database.batch([
      database
        .update(orders)
        .set({ status: "cancelled", updatedAt: input.now })
        .where(eq(orders.id, orderId)),
      database
        .update(registrations)
        .set({ status: "cancelled", updatedAt: input.now })
        .where(eq(registrations.orderId, orderId)),
      database
        .update(pickupParticipants)
        .set({ status: "cancelled", updatedAt: input.now })
        .where(eq(pickupParticipants.orderId, orderId)),
      database
        .update(tickets)
        .set({ status: "void", updatedAt: input.now })
        .where(eq(tickets.orderId, orderId)),
    ]);
    throw error;
  }
}

export async function loadPendingTicketApprovals(input: {
  readonly actor: ApiActor;
}): Promise<readonly PendingTicketApproval[]> {
  if (!process.env.DATABASE_URL) return [];
  if (!input.actor.organizationId) {
    throw new CheckoutError(
      "CHECKOUT_UNAVAILABLE",
      "An organization workspace is required.",
    );
  }
  const rows = await getDatabase()
    .select({
      orderId: orders.id,
      ticketTypeId: ticketTypes.id,
      sessionId: sessions.id,
      eventTitle: sessions.title,
      ticketName: ticketTypes.name,
      buyerName: people.displayName,
      quantity: sql<number>`count(${tickets.id})::integer`,
      totalMinor: orders.totalMinor,
      currency: orders.currency,
      purchasedAt: orders.createdAt,
    })
    .from(tickets)
    .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
    .innerJoin(sessions, eq(ticketTypes.sessionId, sessions.id))
    .innerJoin(orders, eq(tickets.orderId, orders.id))
    .innerJoin(people, eq(orders.buyerPersonId, people.id))
    .where(
      and(
        eq(orders.organizationId, input.actor.organizationId),
        eq(orders.status, "paid"),
        eq(tickets.status, "held"),
        eq(ticketTypes.approvalRequired, true),
      ),
    )
    .groupBy(
      orders.id,
      ticketTypes.id,
      sessions.id,
      sessions.title,
      ticketTypes.name,
      people.displayName,
      orders.totalMinor,
      orders.currency,
      orders.createdAt,
    )
    .orderBy(orders.createdAt);
  return rows.map((row) => ({
    ...row,
    currency: currency(row.currency),
    purchasedAt: row.purchasedAt.toISOString(),
  }));
}

export async function approveTicketOrder(input: {
  readonly actor: ApiActor;
  readonly orderId: string;
  readonly ticketTypeId: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<ApprovedTicketOrder> {
  if (!process.env.DATABASE_URL) {
    throw new CheckoutError(
      "DATABASE_REQUIRED",
      "Ticket approval requires the connected Duna database.",
    );
  }
  if (!input.actor.organizationId) {
    throw new CheckoutError(
      "CHECKOUT_UNAVAILABLE",
      "An organization workspace is required.",
    );
  }
  const database = getDatabase();
  const pending = await database
    .select({
      ticketId: tickets.id,
      ticketName: ticketTypes.name,
      eventTitle: sessions.title,
    })
    .from(tickets)
    .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
    .innerJoin(sessions, eq(ticketTypes.sessionId, sessions.id))
    .innerJoin(orders, eq(tickets.orderId, orders.id))
    .where(
      and(
        eq(tickets.orderId, input.orderId),
        eq(tickets.ticketTypeId, input.ticketTypeId),
        eq(tickets.status, "held"),
        eq(ticketTypes.approvalRequired, true),
        eq(orders.status, "paid"),
        eq(orders.organizationId, input.actor.organizationId),
      ),
    );
  if (pending.length === 0) {
    throw new CheckoutError(
      "EVENT_NOT_FOUND",
      "This paid ticket request is not awaiting approval.",
    );
  }
  const issued = await database
    .update(tickets)
    .set({ status: "issued", updatedAt: input.now })
    .where(
      and(
        eq(tickets.orderId, input.orderId),
        eq(tickets.ticketTypeId, input.ticketTypeId),
        eq(tickets.status, "held"),
      ),
    )
    .returning({ id: tickets.id });
  await database.insert(auditLog).values({
    actorPersonId: input.actor.personId,
    organizationId: input.actor.organizationId,
    actorType: "person",
    action: "ticket.order.approved",
    entityType: "order",
    entityId: input.orderId,
    afterHash: stableHash({
      orderId: input.orderId,
      ticketTypeId: input.ticketTypeId,
      issuedTicketIds: issued.map((ticket) => ticket.id),
    }),
    reason: `Approved ${issued.length} ${pending[0]!.ticketName} ticket(s) for ${pending[0]!.eventTitle}.`,
    traceId: input.requestId,
    ipAddress: input.ipAddress,
  });
  return {
    orderId: input.orderId,
    ticketTypeId: input.ticketTypeId,
    quantity: issued.length,
    status: "issued",
  };
}

export async function getEventCheckoutStatus(input: {
  readonly actor: ApiActor;
  readonly checkoutSessionId?: string;
  readonly paymentIntentId?: string;
}): Promise<EventCheckoutStatus> {
  if (!process.env.DATABASE_URL) {
    throw new CheckoutError(
      "DATABASE_REQUIRED",
      "Checkout status requires the connected Duna database.",
    );
  }
  if (Boolean(input.checkoutSessionId) === Boolean(input.paymentIntentId)) {
    throw new CheckoutError(
      "CHECKOUT_UNAVAILABLE",
      "Provide one Stripe checkout reference.",
    );
  }
  const database = getDatabase();
  const order = await database.query.orders.findFirst({
    where: input.paymentIntentId
      ? eq(orders.stripePaymentIntentId, input.paymentIntentId)
      : eq(orders.stripeCheckoutSessionId, input.checkoutSessionId!),
  });
  if (!order || order.buyerPersonId !== input.actor.personId) {
    throw new CheckoutError(
      "EVENT_NOT_FOUND",
      "Checkout session was not found.",
    );
  }
  const registration = await database.query.registrations.findFirst({
    where: eq(registrations.orderId, order.id),
  });
  const pickupParticipant =
    registration ??
    (await database.query.pickupParticipants.findFirst({
      where: eq(pickupParticipants.orderId, order.id),
    }));
  const orderTickets = await database
    .select({
      status: tickets.status,
      approvalRequired: ticketTypes.approvalRequired,
    })
    .from(tickets)
    .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
    .where(eq(tickets.orderId, order.id));
  const pendingApproval =
    order.status === "paid" &&
    orderTickets.some(
      (ticket) => ticket.approvalRequired && ticket.status === "held",
    );
  return {
    orderId: order.id,
    orderStatus: order.status,
    registrationStatus: pickupParticipant?.status,
    fulfillmentStatus:
      order.status === "paid" && orderTickets.length > 0
        ? pendingApproval
          ? "pending-approval"
          : "confirmed"
        : undefined,
    complete:
      order.status === "paid" &&
      (orderTickets.length > 0 ||
        pickupParticipant === undefined ||
        pickupParticipant.status === "confirmed" ||
        pickupParticipant.status === "checked-in"),
  };
}

async function loadTeamClaimRecord(claimToken: string) {
  const record = (
    await getDatabase()
      .select({
        id: teamEntries.id,
        payingPersonId: teamEntries.payingPersonId,
        expectedTeamSize: teamEntries.expectedTeamSize,
        paymentMode: teamEntries.paymentMode,
        roster: teamEntries.roster,
        status: teamEntries.status,
        claimExpiresAt: teamEntries.claimExpiresAt,
        eventTitle: sessions.title,
        eventSlug: sessions.slug,
        sessionId: sessions.id,
        registrationClosesAt: sessions.startsAt,
        registrationSettings: eventBlueprints.registrationSettings,
        registrationStatus: registrations.status,
        orderStatus: orders.status,
        originalPlayerPriceMinor: orderItems.unitAmountMinor,
        divisionId: divisions.id,
        divisionName: divisions.name,
        captainName: people.displayName,
        organizationId: sql<
          string | null
        >`coalesce(${programs.organizationId}, ${eventTypes.organizationId}, ${venues.organizationId})`,
      })
      .from(teamEntries)
      .innerJoin(
        registrations,
        eq(teamEntries.registrationId, registrations.id),
      )
      .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
      .innerJoin(divisions, eq(registrations.divisionId, divisions.id))
      .leftJoin(eventBlueprints, eq(sessions.id, eventBlueprints.sessionId))
      .innerJoin(people, eq(teamEntries.payingPersonId, people.id))
      .leftJoin(orders, eq(registrations.orderId, orders.id))
      .leftJoin(
        orderItems,
        and(
          eq(orderItems.orderId, orders.id),
          eq(orderItems.kind, "registration"),
        ),
      )
      .leftJoin(programs, eq(sessions.programId, programs.id))
      .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
      .leftJoin(venues, eq(sessions.venueId, venues.id))
      .where(eq(teamEntries.claimToken, claimToken))
      .limit(1)
  )[0];
  if (!record) return undefined;
  const settings = (record.registrationSettings ?? {}) as Record<
    string,
    unknown
  >;
  const configuredClose =
    settings.registrationClosesAt ??
    settings.registrationCloseAt ??
    settings.closesAt;
  const parsedClose =
    typeof configuredClose === "string" &&
    !Number.isNaN(Date.parse(configuredClose))
      ? new Date(configuredClose)
      : record.registrationClosesAt;
  return { ...record, registrationClosesAt: parsedClose };
}

type TeamClaimRecord = NonNullable<
  Awaited<ReturnType<typeof loadTeamClaimRecord>>
>;

function captainPaymentComplete(record: TeamClaimRecord): boolean {
  return (
    record.orderStatus === "paid" ||
    record.orderStatus === "partially-refunded" ||
    record.registrationStatus === "confirmed" ||
    record.registrationStatus === "checked-in"
  );
}

async function refreshTeamEntryStatus(
  record: TeamClaimRecord,
  roster: TeamClaimRecord["roster"],
  now: Date,
) {
  const claimedPlayers =
    1 + roster.filter((member) => member.status === "claimed").length;
  const paidPlayers =
    record.paymentMode === "team" && captainPaymentComplete(record)
      ? record.expectedTeamSize
      : (captainPaymentComplete(record) ? 1 : 0) +
        roster.filter((member) => Boolean(member.paidAt)).length;
  const ready =
    claimedPlayers >= record.expectedTeamSize &&
    paidPlayers >= record.expectedTeamSize;
  await getDatabase()
    .update(teamEntries)
    .set({
      roster,
      status: ready ? "ready" : "assembling",
      claimedAt: ready ? now : null,
      rosterLockedAt: ready ? now : null,
      updatedAt: now,
    })
    .where(eq(teamEntries.id, record.id));
}

async function attachTeamMemberOrder(input: {
  readonly record: TeamClaimRecord;
  readonly personId: string;
  readonly orderId: string;
  readonly now: Date;
}) {
  const roster = input.record.roster.map((member) =>
    member.personId === input.personId
      ? { ...member, orderId: input.orderId }
      : member,
  );
  await getDatabase()
    .update(teamEntries)
    .set({ roster, updatedAt: input.now })
    .where(eq(teamEntries.id, input.record.id));
}

async function markTeamMemberPaid(input: {
  readonly record: TeamClaimRecord;
  readonly personId: string;
  readonly now: Date;
}) {
  const roster = input.record.roster.map((member) =>
    member.personId === input.personId
      ? {
          ...member,
          paidAt: input.now.toISOString(),
          status: "claimed" as const,
        }
      : member,
  );
  await refreshTeamEntryStatus(input.record, roster, input.now);
}

export async function reconcileTeamEntryPayment(
  orderId: string,
  occurredAt: Date,
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  const database = getDatabase();
  const matchingEntries = await database
    .select({
      claimToken: teamEntries.claimToken,
      roster: teamEntries.roster,
    })
    .from(teamEntries)
    .innerJoin(registrations, eq(teamEntries.registrationId, registrations.id))
    .where(
      or(
        eq(registrations.orderId, orderId),
        sql`${teamEntries.roster} @> ${JSON.stringify([{ orderId }])}::jsonb`,
      ),
    );
  for (const entry of matchingEntries) {
    const record = await loadTeamClaimRecord(entry.claimToken);
    if (!record) continue;
    const roster = entry.roster.map((member) =>
      member.orderId === orderId
        ? {
            ...member,
            paidAt: occurredAt.toISOString(),
            status: "claimed" as const,
          }
        : member,
    );
    await refreshTeamEntryStatus(record, roster, occurredAt);
  }
}

function teamEntryStatus(value: string): TeamClaimSummary["status"] {
  if (
    value === "assembling" ||
    value === "ready" ||
    value === "confirmed" ||
    value === "cancelled" ||
    value === "expired"
  ) {
    return value;
  }
  throw new CheckoutError(
    "CHECKOUT_UNAVAILABLE",
    "The team invitation has an invalid status.",
  );
}

async function buildTeamClaimSummary(
  claimToken: string,
  actorPersonId: string,
  now: Date,
): Promise<TeamClaimSummary> {
  const record = await loadTeamClaimRecord(claimToken);
  if (!record) {
    throw new CheckoutError(
      "EVENT_NOT_FOUND",
      "This team invitation was not found.",
    );
  }
  const expired =
    record.claimExpiresAt <= now && record.status === "assembling";
  if (expired) {
    await getDatabase()
      .update(teamEntries)
      .set({ status: "expired", updatedAt: now })
      .where(eq(teamEntries.id, record.id));
  }
  const roster = record.roster;
  const alreadyClaimed =
    record.payingPersonId === actorPersonId ||
    roster.some(
      (member) =>
        member.personId === actorPersonId && member.status === "claimed",
    );
  const claimedPlayers =
    1 + roster.filter((member) => member.status === "claimed").length;
  const captainPaid =
    record.orderStatus === "paid" ||
    record.orderStatus === "partially-refunded" ||
    record.registrationStatus === "confirmed" ||
    record.registrationStatus === "checked-in";
  const paidPlayers =
    record.paymentMode === "team" && captainPaid
      ? record.expectedTeamSize
      : (captainPaid ? 1 : 0) +
        roster.filter((member) => Boolean(member.paidAt)).length;
  const isOrganizer = record.payingPersonId === actorPersonId;
  const registrationOpen = record.registrationClosesAt > now;
  const canManageRoster =
    isOrganizer &&
    registrationOpen &&
    record.status !== "cancelled" &&
    record.status !== "expired";
  const actorRosterMember = roster.find(
    (member) => member.personId === actorPersonId,
  );
  return {
    eventTitle: record.eventTitle,
    eventSlug: record.eventSlug,
    divisionId: record.divisionId,
    divisionName: record.divisionName,
    captainName: record.captainName,
    expectedTeamSize: record.expectedTeamSize,
    claimedPlayers,
    paidPlayers,
    paymentMode: record.paymentMode === "team" ? "team" : "self",
    status: expired ? "expired" : teamEntryStatus(record.status),
    expiresAt: record.claimExpiresAt.toISOString(),
    alreadyClaimed,
    paymentRequired:
      record.paymentMode !== "team" &&
      record.payingPersonId !== actorPersonId &&
      alreadyClaimed &&
      !actorRosterMember?.paidAt,
    isOrganizer,
    canManageRoster,
    registrationClosesAt: record.registrationClosesAt.toISOString(),
    roster: [
      {
        slot: 0,
        personId: record.payingPersonId,
        displayName: record.captainName,
        status: "captain" as const,
        paid: captainPaid,
        editable: false,
      },
      ...roster.map((member, index) => ({
        slot: index + 1,
        personId: member.personId,
        inviteTarget: member.inviteTarget,
        displayName:
          member.displayName ??
          (member.status === "claimed" ? "Duna player" : "Invite pending"),
        status: member.status,
        deliveryStatus: member.deliveryStatus,
        paid:
          record.paymentMode === "team" ? captainPaid : Boolean(member.paidAt),
        editable:
          canManageRoster && (record.paymentMode === "team" || !member.paidAt),
      })),
    ],
  };
}

export async function loadTeamClaim(input: {
  readonly actor: ApiActor;
  readonly claimToken: string;
  readonly now: Date;
}): Promise<TeamClaimSummary> {
  if (!process.env.DATABASE_URL) {
    throw new CheckoutError(
      "DATABASE_REQUIRED",
      "Team invitations require the connected Duna database.",
    );
  }
  return buildTeamClaimSummary(
    input.claimToken,
    input.actor.personId,
    input.now,
  );
}

export async function claimTeamEntry(input: {
  readonly actor: ApiActor;
  readonly claimToken: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<TeamClaimSummary> {
  if (!process.env.DATABASE_URL) {
    throw new CheckoutError(
      "DATABASE_REQUIRED",
      "Team invitations require the connected Duna database.",
    );
  }
  const database = getDatabase();
  const record = await loadTeamClaimRecord(input.claimToken);
  if (!record) {
    throw new CheckoutError(
      "EVENT_NOT_FOUND",
      "This team invitation was not found.",
    );
  }
  if (
    record.status === "cancelled" ||
    record.status === "expired" ||
    record.claimExpiresAt <= input.now
  ) {
    throw new CheckoutError(
      "CHECKOUT_UNAVAILABLE",
      "This team invitation is no longer active.",
    );
  }
  if (record.payingPersonId !== input.actor.personId) {
    await evaluateRegistrationForSession({
      actor: input.actor,
      sessionId: record.sessionId,
      divisionId: record.divisionId,
      subjectPersonId: input.actor.personId,
      inviteCodes: [],
      now: input.now,
    });
    const person = await database.query.people.findFirst({
      where: eq(people.id, input.actor.personId),
    });
    if (!person) {
      throw new CheckoutError(
        "EVENT_NOT_FOUND",
        "Your Duna player profile was not found.",
      );
    }
    const normalizedEmail = person.email?.trim().toLowerCase();
    const normalizedPhone = person.phoneE164?.replace(/\D/g, "");
    const roster = record.roster.map((member) => ({ ...member }));
    let slotIndex = roster.findIndex(
      (member) => member.personId === input.actor.personId,
    );
    if (slotIndex < 0) {
      slotIndex = roster.findIndex((member) => {
        const target = member.inviteTarget?.trim().toLowerCase();
        const targetPhone = target?.replace(/\D/g, "");
        return (
          member.status !== "claimed" &&
          ((normalizedEmail && target === normalizedEmail) ||
            (normalizedPhone &&
              normalizedPhone.length >= 7 &&
              targetPhone === normalizedPhone))
        );
      });
    }
    if (slotIndex < 0) {
      slotIndex = roster.findIndex((member) => member.status !== "claimed");
    }
    if (slotIndex < 0) {
      throw new CheckoutError(
        "CHECKOUT_UNAVAILABLE",
        "Every place on this team has already been claimed.",
      );
    }
    roster[slotIndex] = {
      ...roster[slotIndex]!,
      personId: input.actor.personId,
      displayName: input.actor.displayName,
      status: "claimed",
    };
    const claimedPlayers =
      1 + roster.filter((member) => member.status === "claimed").length;
    const captainPaid =
      record.orderStatus === "paid" ||
      record.orderStatus === "partially-refunded" ||
      record.registrationStatus === "confirmed" ||
      record.registrationStatus === "checked-in";
    const paidPlayers =
      record.paymentMode === "team" && captainPaid
        ? record.expectedTeamSize
        : (captainPaid ? 1 : 0) +
          roster.filter((member) => Boolean(member.paidAt)).length;
    const ready =
      claimedPlayers >= record.expectedTeamSize &&
      paidPlayers >= record.expectedTeamSize;
    await database.batch([
      database
        .update(teamEntries)
        .set({
          partnerPersonId:
            record.expectedTeamSize === 2
              ? input.actor.personId
              : (record.roster.find((member) => member.personId)?.personId ??
                input.actor.personId),
          roster,
          status: ready ? "ready" : "assembling",
          claimedAt: ready ? input.now : undefined,
          rosterLockedAt: ready ? input.now : undefined,
          updatedAt: input.now,
        })
        .where(eq(teamEntries.id, record.id)),
      database.insert(auditLog).values({
        actorPersonId: input.actor.personId,
        actorType: "person",
        action: "team-entry.claimed",
        entityType: "team-entry",
        entityId: record.id,
        reason: ready
          ? "The final invited player claimed the team entry."
          : "An invited player claimed a team entry slot.",
        traceId: input.requestId,
        ipAddress: input.ipAddress,
      }),
    ]);
  }
  if (record.organizationId) {
    await reconcileDivisionSelection({
      actor: { ...input.actor, organizationId: record.organizationId },
      divisionId: record.divisionId,
      requestId: `${input.requestId}:selection`,
      ipAddress: input.ipAddress,
      now: input.now,
    });
  }
  return buildTeamClaimSummary(
    input.claimToken,
    input.actor.personId,
    input.now,
  );
}

function teamMemberKey(member: CheckoutTeamMember): string {
  if (member.personId) return `person:${member.personId}`;
  return `invite:${member.inviteTarget?.trim().toLowerCase() ?? ""}`;
}

export async function updateTeamEntryRoster(input: {
  readonly actor: ApiActor;
  readonly claimToken: string;
  readonly roster: readonly CheckoutTeamMember[];
  readonly applicationOrigin: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<TeamClaimSummary> {
  if (!process.env.DATABASE_URL) {
    throw new CheckoutError(
      "DATABASE_REQUIRED",
      "Team roster editing requires the connected Duna database.",
    );
  }
  const database = getDatabase();
  const record = await loadTeamClaimRecord(input.claimToken);
  if (!record) {
    throw new CheckoutError("EVENT_NOT_FOUND", "This team was not found.");
  }
  if (record.payingPersonId !== input.actor.personId) {
    throw new CheckoutError(
      "CHECKOUT_UNAVAILABLE",
      "Only the original team organizer can edit this roster.",
    );
  }
  if (
    record.registrationClosesAt <= input.now ||
    record.status === "cancelled" ||
    record.status === "expired"
  ) {
    throw new CheckoutError(
      "CHECKOUT_UNAVAILABLE",
      "This roster can no longer be changed because registration is closed.",
    );
  }
  if (input.roster.length > record.expectedTeamSize - 1) {
    throw new CheckoutError(
      "EVENT_NOT_CHECKOUT_ELIGIBLE",
      "The roster has more players than this division allows.",
    );
  }
  const keys = input.roster.map(teamMemberKey);
  if (
    keys.some((key) => key.endsWith(":")) ||
    new Set(keys).size !== keys.length
  ) {
    throw new CheckoutError(
      "EVENT_NOT_CHECKOUT_ELIGIBLE",
      "Every teammate must be unique and have a Duna profile, email, or phone.",
    );
  }
  const existingByKey = new Map(
    record.roster.map((member) => [teamMemberKey(member), member] as const),
  );
  if (
    record.paymentMode !== "team" &&
    record.roster.some(
      (member) => member.paidAt && !keys.includes(teamMemberKey(member)),
    )
  ) {
    throw new CheckoutError(
      "CHECKOUT_UNAVAILABLE",
      "A player who has paid and registered can no longer be removed.",
    );
  }
  const nextRoster = input.roster.map((member) => {
    const existing = existingByKey.get(teamMemberKey(member));
    return {
      ...member,
      status:
        existing?.status ??
        (member.personId ? ("selected" as const) : ("invited" as const)),
      deliveryChannel: existing?.deliveryChannel,
      deliveryStatus: existing?.deliveryStatus,
      providerMessageId: existing?.providerMessageId,
      paidAt: existing?.paidAt,
      orderId: existing?.orderId,
    };
  });
  await database
    .update(teamEntries)
    .set({
      roster: nextRoster,
      partnerPersonId: nextRoster.find((member) => member.personId)?.personId,
      status: "assembling",
      claimedAt: null,
      rosterLockedAt: null,
      updatedAt: input.now,
    })
    .where(eq(teamEntries.id, record.id));
  await deliverTeamInvitations({
    teamEntryId: record.id,
    claimToken: input.claimToken,
    roster: nextRoster,
    captain: input.actor,
    eventTitle: record.eventTitle,
    organizationId: input.actor.organizationId,
    applicationOrigin: input.applicationOrigin,
    now: input.now,
  }).catch(() => undefined);
  await database.insert(auditLog).values({
    actorPersonId: input.actor.personId,
    organizationId: input.actor.organizationId,
    actorType: "person",
    action: "team-entry.roster_updated",
    entityType: "team-entry",
    entityId: record.id,
    afterHash: stableHash({ roster: nextRoster }),
    reason:
      "The original organizer updated the event team before registration closed.",
    traceId: input.requestId,
    ipAddress: input.ipAddress,
  });
  return buildTeamClaimSummary(
    input.claimToken,
    input.actor.personId,
    input.now,
  );
}
