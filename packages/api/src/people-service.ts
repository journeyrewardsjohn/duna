import {
  auditLog,
  divisions,
  eventTypes,
  getDatabase,
  guardianships,
  healthConnections,
  healthSharingGrants,
  membershipTiers,
  memberships,
  messages,
  orderItems,
  orders,
  organizationCreditGrants,
  organizations,
  organizationWallets,
  people,
  programs,
  refundRecords,
  registrations,
  sessionAttendance,
  sessionNoteRecipients,
  sessionNotes,
  sessionOperations,
  sessions,
  teamEntries,
  venues,
  videos,
} from "@duna/db";
import { arrivalSharingWindow } from "@duna/scheduling";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { stableHash } from "./canonical";
import type {
  OperatorMemberProfile,
  OperatorMutationResult,
  OperatorSessionDetail,
  OperatorSessionNote,
  OperatorWorkspace,
} from "./contracts";
import type { ApiActor } from "./context";
import { loadSessionArrivalBoard } from "./arrival-service";
import { loadHealthProfile } from "./health-service";
import {
  loadDemoOperatorWorkspace,
  loadOperatorWorkspace,
} from "./operator-service";
import {
  loadWeatherForecast,
  resolveWeatherCoordinates,
  weatherForecastAvailableAt,
  weatherForecastIsAvailable,
} from "./weather";

type CurrencyCode = OperatorWorkspace["organization"]["currency"];
type SessionWeatherOperations = OperatorSessionDetail["operations"];

function requireDatabase(): void {
  if (!process.env.DATABASE_URL) {
    throw new Error("People operations require the connected Duna database.");
  }
}

function requireOrganization(actor: ApiActor): string {
  if (!actor.organizationId) {
    throw new Error("An organization context is required.");
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
  return "USD";
}

function muxThumbnail(
  playbackId: string | null,
  policy: string | null,
): string | undefined {
  return playbackId && policy === "public"
    ? `https://image.mux.com/${playbackId}/thumbnail.jpg?time=0`
    : undefined;
}

export function summarizeSessionTranscript(value: string): string {
  const transcript = value.replace(/\s+/g, " ").trim();
  if (!transcript) return "";
  const sentences = transcript
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const selected = sentences.slice(0, 4).join(" ");
  return selected.length <= 650
    ? selected
    : `${selected.slice(0, 647).trimEnd()}…`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function detectSessionNotePeople(
  transcript: string,
  roster: readonly { personId: string; displayName: string }[],
): readonly string[] {
  const text = transcript.toLocaleLowerCase();
  const firstNameCounts = new Map<string, number>();
  for (const person of roster) {
    const first = person.displayName.trim().split(/\s+/)[0]?.toLowerCase();
    if (first)
      firstNameCounts.set(first, (firstNameCounts.get(first) ?? 0) + 1);
  }
  return roster
    .filter((person) => {
      const name = person.displayName.trim().toLowerCase();
      const first = name.split(/\s+/)[0];
      if (name.length > 1 && text.includes(name)) return true;
      return Boolean(
        first &&
        first.length > 2 &&
        firstNameCounts.get(first) === 1 &&
        new RegExp(`\\b${escapeRegExp(first)}\\b`, "i").test(text),
      );
    })
    .map((person) => person.personId);
}

async function relationshipWorkspace(
  organizationId: string,
  demo = false,
): Promise<OperatorWorkspace> {
  return demo
    ? loadDemoOperatorWorkspace(organizationId)
    : loadOperatorWorkspace(organizationId);
}

async function captureSessionWeatherIfAvailable(input: {
  readonly organizationId: string;
  readonly sessionId: string;
  readonly now: Date;
}): Promise<void> {
  if (!process.env.TOMORROW_IO_API_KEY) return;
  const database = getDatabase();
  const row = await database
    .select({
      startsAt: sessions.startsAt,
      endsAt: sessions.endsAt,
      timezone: sessions.timezone,
      venueName: venues.name,
      latitude: venues.latitude,
      longitude: venues.longitude,
      googlePlaceId: venues.googlePlaceId,
      addressLine1: venues.addressLine1,
      locality: venues.locality,
      administrativeArea: venues.administrativeArea,
      postalCode: venues.postalCode,
      countryCode: venues.countryCode,
      organizationId: venues.organizationId,
    })
    .from(sessions)
    .innerJoin(venues, eq(sessions.venueId, venues.id))
    .where(eq(sessions.id, input.sessionId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!row || row.organizationId !== input.organizationId) return;
  const coordinates = await resolveWeatherCoordinates({
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    googlePlaceId: row.googlePlaceId ?? undefined,
    query: [
      row.venueName,
      row.addressLine1,
      row.locality,
      row.administrativeArea,
      row.postalCode,
      row.countryCode,
    ]
      .filter(Boolean)
      .join(", "),
    now: input.now,
  });
  if (!coordinates) return;
  const forecast = await loadWeatherForecast({
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    timezone: row.timezone,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    now: input.now,
  });
  const point = forecast.hourly
    .slice()
    .sort(
      (left, right) =>
        Math.abs(Date.parse(left.startsAt) - row.startsAt.getTime()) -
        Math.abs(Date.parse(right.startsAt) - row.startsAt.getTime()),
    )[0];
  if (!point) return;
  await database
    .insert(sessionOperations)
    .values({
      sessionId: input.sessionId,
      organizationId: input.organizationId,
      weatherSnapshot: {
        condition: point.condition,
        temperatureC: point.temperatureC,
        apparentTemperatureC: point.apparentTemperatureC,
        precipitationProbability: point.precipitationProbability,
        windSpeedKph: point.windSpeedKph,
        source: forecast.source,
        observedAt: point.startsAt,
      },
      weatherCapturedAt: input.now,
    })
    .onConflictDoUpdate({
      target: sessionOperations.sessionId,
      set: {
        weatherSnapshot: {
          condition: point.condition,
          temperatureC: point.temperatureC,
          apparentTemperatureC: point.apparentTemperatureC,
          precipitationProbability: point.precipitationProbability,
          windSpeedKph: point.windSpeedKph,
          source: forecast.source,
          observedAt: point.startsAt,
        },
        weatherCapturedAt: input.now,
        updatedAt: input.now,
      },
    });
}

async function loadSessionWeatherOperations(input: {
  readonly session: {
    readonly startsAt: Date;
    readonly endsAt: Date;
    readonly timezone: string;
  };
  readonly venue?: {
    readonly name: string;
    readonly latitude: number | null;
    readonly longitude: number | null;
    readonly googlePlaceId: string | null;
    readonly addressLine1: string | null;
    readonly locality: string | null;
    readonly administrativeArea: string | null;
    readonly postalCode: string | null;
    readonly countryCode: string;
  };
  readonly snapshot?: SessionWeatherOperations["weather"];
  readonly now: Date;
}): Promise<
  Pick<
    SessionWeatherOperations,
    "weather" | "weatherKind" | "weatherStatus" | "forecastAvailableAt"
  >
> {
  if (input.snapshot) {
    return {
      weather: input.snapshot,
      weatherKind: "captured",
      weatherStatus: "captured",
    };
  }
  if (input.session.startsAt.getTime() <= input.now.getTime()) {
    return { weatherStatus: "not-captured" };
  }
  if (!weatherForecastIsAvailable(input.session.startsAt, input.now)) {
    return {
      weatherStatus: "forecast-pending",
      forecastAvailableAt: weatherForecastAvailableAt(
        input.session.startsAt,
      ).toISOString(),
    };
  }
  const hasStoredCoordinates =
    Number.isFinite(input.venue?.latitude) &&
    Number.isFinite(input.venue?.longitude);
  if (!hasStoredCoordinates && !process.env.GOOGLE_PLACES_API_KEY?.trim()) {
    return { weatherStatus: "location-required" };
  }
  if (!process.env.TOMORROW_IO_API_KEY?.trim()) {
    return { weatherStatus: "provider-required" };
  }
  if (!input.venue) return { weatherStatus: "location-required" };
  const coordinates = await resolveWeatherCoordinates({
    latitude: input.venue.latitude ?? undefined,
    longitude: input.venue.longitude ?? undefined,
    googlePlaceId: input.venue.googlePlaceId ?? undefined,
    query: [
      input.venue.name,
      input.venue.addressLine1,
      input.venue.locality,
      input.venue.administrativeArea,
      input.venue.postalCode,
      input.venue.countryCode,
    ]
      .filter(Boolean)
      .join(", "),
    now: input.now,
  });
  if (!coordinates) return { weatherStatus: "location-required" };
  const forecast = await loadWeatherForecast({
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    timezone: input.session.timezone,
    startsAt: input.session.startsAt,
    endsAt: input.session.endsAt,
    now: input.now,
  });
  const point = forecast.hourly
    .slice()
    .sort(
      (left, right) =>
        Math.abs(Date.parse(left.startsAt) - input.session.startsAt.getTime()) -
        Math.abs(Date.parse(right.startsAt) - input.session.startsAt.getTime()),
    )[0];
  if (!point || forecast.source !== "tomorrow.io") {
    return { weatherStatus: "temporarily-unavailable" };
  }
  return {
    weatherStatus: "forecast-ready",
    weatherKind: "forecast",
    weather: {
      condition: point.condition,
      temperatureC: point.temperatureC,
      apparentTemperatureC: point.apparentTemperatureC,
      precipitationProbability: point.precipitationProbability,
      windSpeedKph: point.windSpeedKph,
      source: forecast.provider,
      observedAt: point.startsAt,
    },
  };
}

async function assertRelationship(
  organizationId: string,
  personId: string,
  demo = false,
) {
  const workspace = await relationshipWorkspace(organizationId, demo);
  const relationship = workspace.people.find(
    (candidate) => candidate.personId === personId,
  );
  if (!relationship) {
    throw new Error("This person is not connected to the organization.");
  }
  return { relationship, workspace };
}

async function loadSessionNotes(input: {
  readonly organizationId: string;
  readonly sessionId?: string;
  readonly personId?: string;
}): Promise<readonly OperatorSessionNote[]> {
  const database = getDatabase();
  const rows = input.personId
    ? await database
        .select({ note: sessionNotes, sessionTitle: sessions.title })
        .from(sessionNoteRecipients)
        .innerJoin(
          sessionNotes,
          eq(sessionNoteRecipients.noteId, sessionNotes.id),
        )
        .innerJoin(sessions, eq(sessionNotes.sessionId, sessions.id))
        .where(
          and(
            eq(sessionNotes.organizationId, input.organizationId),
            eq(sessionNoteRecipients.personId, input.personId),
            input.sessionId
              ? eq(sessionNotes.sessionId, input.sessionId)
              : undefined,
          ),
        )
        .orderBy(desc(sessionNotes.createdAt))
    : await database
        .select({ note: sessionNotes, sessionTitle: sessions.title })
        .from(sessionNotes)
        .innerJoin(sessions, eq(sessionNotes.sessionId, sessions.id))
        .where(
          and(
            eq(sessionNotes.organizationId, input.organizationId),
            input.sessionId
              ? eq(sessionNotes.sessionId, input.sessionId)
              : undefined,
          ),
        )
        .orderBy(desc(sessionNotes.createdAt));
  const noteIds = rows.map((row) => row.note.id);
  if (noteIds.length === 0) return [];
  const recipientRows = await database
    .select({
      noteId: sessionNoteRecipients.noteId,
      personId: sessionNoteRecipients.personId,
      displayName: people.displayName,
      detected: sessionNoteRecipients.detected,
      sharedAt: sessionNoteRecipients.sharedAt,
    })
    .from(sessionNoteRecipients)
    .innerJoin(people, eq(sessionNoteRecipients.personId, people.id))
    .where(inArray(sessionNoteRecipients.noteId, noteIds));
  const authorIds = [...new Set(rows.map((row) => row.note.authorPersonId))];
  const authorRows = await database
    .select({ id: people.id, displayName: people.displayName })
    .from(people)
    .where(inArray(people.id, authorIds));
  const authors = new Map(authorRows.map((row) => [row.id, row.displayName]));
  return rows.map(({ note, sessionTitle }) => ({
    id: note.id,
    sessionId: note.sessionId,
    sessionTitle,
    authorPersonId: note.authorPersonId,
    authorName: authors.get(note.authorPersonId) ?? "Duna coach",
    subject: note.subject ?? undefined,
    visibility: note.visibility as "private" | "player",
    source: note.source as "typed" | "livekit-voice",
    transcript: note.transcript ?? undefined,
    summary: note.summary,
    status: note.status as "draft" | "published" | "archived",
    recipients: recipientRows
      .filter((recipient) => recipient.noteId === note.id)
      .map((recipient) => ({
        personId: recipient.personId,
        displayName: recipient.displayName,
        detected: recipient.detected,
        sharedAt: recipient.sharedAt?.toISOString(),
      })),
    publishedAt: note.publishedAt?.toISOString(),
    createdAt: note.createdAt.toISOString(),
  }));
}

export async function loadOperatorMemberProfile(input: {
  readonly actor: ApiActor;
  readonly organizationId: string;
  readonly personId: string;
  readonly now: Date;
  readonly requestId?: string;
  readonly ipAddress?: string;
}): Promise<OperatorMemberProfile> {
  requireDatabase();
  const { organizationId, personId } = input;
  const { relationship, workspace } = await assertRelationship(
    organizationId,
    personId,
  );
  const database = getDatabase();
  const person = await database.query.people.findFirst({
    where: eq(people.id, personId),
  });
  if (!person) throw new Error("Person was not found.");
  const [
    planRows,
    walletRows,
    orderRows,
    attendanceRows,
    videoRows,
    healthGrant,
  ] = await Promise.all([
    database
      .select({ membership: memberships, tier: membershipTiers })
      .from(memberships)
      .innerJoin(membershipTiers, eq(memberships.tierId, membershipTiers.id))
      .where(
        and(
          eq(memberships.personId, personId),
          eq(membershipTiers.organizationId, organizationId),
        ),
      )
      .orderBy(desc(memberships.createdAt)),
    database
      .select({ grant: organizationCreditGrants })
      .from(organizationCreditGrants)
      .innerJoin(
        organizationWallets,
        eq(
          organizationCreditGrants.organizationWalletId,
          organizationWallets.id,
        ),
      )
      .where(
        and(
          eq(organizationCreditGrants.organizationId, organizationId),
          eq(organizationWallets.personId, personId),
        ),
      )
      .orderBy(desc(organizationCreditGrants.createdAt)),
    database
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.organizationId, organizationId),
          eq(orders.buyerPersonId, personId),
        ),
      )
      .orderBy(desc(orders.createdAt)),
    database
      .select()
      .from(sessionAttendance)
      .where(
        and(
          eq(sessionAttendance.organizationId, organizationId),
          eq(sessionAttendance.personId, personId),
        ),
      ),
    database
      .select({
        id: videos.id,
        title: videos.title,
        category: videos.category,
        status: videos.status,
        eventId: videos.eventId,
        durationSeconds: videos.durationSeconds,
        muxAssetPlaybackId: videos.muxAssetPlaybackId,
        muxAssetPlaybackPolicy: videos.muxAssetPlaybackPolicy,
        createdAt: videos.createdAt,
      })
      .from(videos)
      .where(
        and(
          eq(videos.organizationId, organizationId),
          eq(videos.ownerPersonId, personId),
          sql`${videos.status} <> 'deleted'`,
        ),
      )
      .orderBy(desc(videos.createdAt))
      .limit(24),
    database.query.healthSharingGrants.findFirst({
      where: and(
        eq(healthSharingGrants.ownerPersonId, personId),
        eq(healthSharingGrants.audienceKind, "organization"),
        eq(healthSharingGrants.organizationId, organizationId),
        isNull(healthSharingGrants.revokedAt),
        gte(healthSharingGrants.expiresAt, input.now),
        sql`${healthSharingGrants.scopes} @> ARRAY['summary']::text[]`,
      ),
      orderBy: [desc(healthSharingGrants.createdAt)],
    }),
  ]);

  const orderIds = orderRows.map((order) => order.id);
  const [itemRows, refundRows, notes, healthProfile, healthConnection] =
    await Promise.all([
      orderIds.length
        ? database
            .select()
            .from(orderItems)
            .where(inArray(orderItems.orderId, orderIds))
        : Promise.resolve([]),
      orderIds.length
        ? database
            .select()
            .from(refundRecords)
            .where(
              and(
                eq(refundRecords.organizationId, organizationId),
                inArray(refundRecords.orderId, orderIds),
              ),
            )
            .orderBy(desc(refundRecords.createdAt))
        : Promise.resolve([]),
      loadSessionNotes({ organizationId, personId }),
      healthGrant
        ? loadHealthProfile({
            actor: input.actor,
            subjectPersonId: personId,
            now: input.now,
            requestId: input.requestId,
            ipAddress: input.ipAddress,
          })
        : Promise.resolve(undefined),
      healthGrant
        ? database.query.healthConnections.findFirst({
            where: eq(healthConnections.personId, personId),
          })
        : Promise.resolve(undefined),
    ]);
  const noteCountBySession = new Map<string, number>();
  for (const note of notes) {
    noteCountBySession.set(
      note.sessionId,
      (noteCountBySession.get(note.sessionId) ?? 0) + 1,
    );
  }
  const attendanceBySession = new Map(
    attendanceRows.map((row) => [row.sessionId, row.status]),
  );
  const sessionById = new Map(
    workspace.sessions.map((session) => [session.id, session]),
  );
  const memberSessions = workspace.eventRegistrations
    .filter((registration) => registration.personId === personId)
    .flatMap((registration) => {
      const session = sessionById.get(registration.sessionId);
      return session
        ? [
            {
              id: session.id,
              title: session.title,
              kind: session.kind,
              startsAt: session.startsAt,
              endsAt: session.endsAt,
              timezone: session.timezone,
              venueName: session.venueName,
              status: session.status,
              registrationId: registration.id,
              registrationStatus: registration.status,
              attendanceStatus: attendanceBySession.get(session.id) as
                "scheduled" | "attended" | "no-show" | "cancelled" | undefined,
              orderId: registration.orderId,
              noteCount: noteCountBySession.get(session.id) ?? 0,
            },
          ]
        : [];
    })
    .toSorted((left, right) => right.startsAt.localeCompare(left.startsAt));
  const purchases = orderRows.map((order) => {
    const descriptions = itemRows
      .filter((item) => item.orderId === order.id)
      .map((item) => item.description);
    const relatedRefunds = refundRows
      .filter((refund) => refund.orderId === order.id)
      .map((refund) => ({
        id: refund.id,
        amountMinor: refund.amountMinor,
        disposition: refund.disposition as
          "original-payment" | "organization-credit",
        creditsIssued: refund.creditsIssued ?? undefined,
        status: refund.status,
        reason: refund.reason,
        createdAt: refund.createdAt.toISOString(),
      }));
    return {
      orderId: order.id,
      description: descriptions.join(" + ") || "Duna purchase",
      amountMinor: order.totalMinor,
      refundedMinor: relatedRefunds
        .filter((refund) => ["pending", "succeeded"].includes(refund.status))
        .reduce((sum, refund) => sum + refund.amountMinor, 0),
      currency: currency(order.currency),
      status: order.status,
      purchasedAt: order.createdAt.toISOString(),
      refunds: relatedRefunds,
    };
  });
  const sessionTitles = new Map(
    workspace.sessions.map((session) => [session.id, session.title]),
  );
  const mappedVideos = videoRows.map((video) => ({
    id: video.id,
    title: video.title,
    category: video.category,
    status: video.status,
    sessionId: video.eventId ?? undefined,
    sessionTitle: video.eventId ? sessionTitles.get(video.eventId) : undefined,
    durationSeconds: video.durationSeconds ?? undefined,
    thumbnailUrl: muxThumbnail(
      video.muxAssetPlaybackId,
      video.muxAssetPlaybackPolicy,
    ),
    createdAt: video.createdAt.toISOString(),
  }));
  const timeline: OperatorMemberProfile["timeline"] = [
    ...memberSessions.map((session) => ({
      id: `session:${session.registrationId}`,
      kind: "session" as const,
      title: session.title,
      detail: `${session.registrationStatus.replaceAll("-", " ")} · ${session.venueName ?? "Location pending"}`,
      occurredAt: session.startsAt,
      href: `/events/${session.id}`,
    })),
    ...purchases.map((purchase) => ({
      id: `purchase:${purchase.orderId}`,
      kind: "purchase" as const,
      title: purchase.description,
      detail: `${purchase.status.replaceAll("-", " ")} · ${purchase.currency} ${(purchase.amountMinor / 100).toFixed(2)}`,
      occurredAt: purchase.purchasedAt,
    })),
    ...purchases.flatMap((purchase) =>
      purchase.refunds.map((refund) => ({
        id: `refund:${refund.id}`,
        kind: "refund" as const,
        title: "Refund recorded",
        detail: refund.reason,
        occurredAt: refund.createdAt,
      })),
    ),
    ...notes.map((note) => ({
      id: `note:${note.id}`,
      kind: "note" as const,
      title: note.subject ?? "Session note",
      detail: `${note.visibility === "private" ? "Private" : note.status === "published" ? "Shared" : "Shareable draft"} · ${note.sessionTitle}`,
      occurredAt: note.createdAt,
      href: `/events/${note.sessionId}`,
    })),
    ...walletRows.map(({ grant }) => ({
      id: `credit:${grant.id}`,
      kind: "credit" as const,
      title: `${grant.initialCredits} credits added`,
      detail: `${grant.remainingCredits} remaining${grant.expiresAt ? ` · expires ${grant.expiresAt.toISOString().slice(0, 10)}` : ""}`,
      occurredAt: grant.createdAt.toISOString(),
    })),
    ...mappedVideos.map((video) => ({
      id: `video:${video.id}`,
      kind: "video" as const,
      title: video.title,
      detail: `${video.category} · ${video.status}`,
      occurredAt: video.createdAt,
    })),
  ]
    .toSorted((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, 80);

  return {
    relationship,
    profile: {
      handle: person.handle,
      homeMarket: person.homeMarket ?? undefined,
      birthDate: person.birthDate ?? undefined,
      ageBand: person.ageBand,
      profileClaimStatus: person.profileClaimStatus,
      profileVisibility: person.profileVisibility,
      playingExperience: person.playingExperience,
      yearsPlaying: person.yearsPlaying ?? undefined,
      collegeName: person.collegeName ?? undefined,
      experienceSummary: person.experienceSummary ?? undefined,
    },
    plans: planRows.map(({ membership, tier }) => ({
      id: membership.id,
      name: tier.name,
      status: membership.status,
      interval: tier.interval,
      priceMinor: tier.priceMinor,
      currency: currency(tier.currency),
      currentPeriodEndsAt: membership.currentPeriodEndsAt?.toISOString(),
      cancelAtPeriodEnd: membership.cancelAtPeriodEnd,
    })),
    creditGrants: walletRows.map(({ grant }) => ({
      id: grant.id,
      initialCredits: grant.initialCredits,
      remainingCredits: grant.remainingCredits,
      initialValueMinor: grant.initialValueMinor,
      remainingValueMinor: grant.remainingValueMinor,
      currency: grant.currency ? currency(grant.currency) : undefined,
      status: grant.status,
      expiresAt: grant.expiresAt?.toISOString(),
      createdAt: grant.createdAt.toISOString(),
    })),
    sessions: memberSessions,
    purchases,
    notes,
    videos: mappedVideos,
    health:
      healthGrant && healthProfile
        ? {
            source: "apple-healthkit",
            scopes: healthGrant.categories,
            grantedAt: healthGrant.createdAt.toISOString(),
            observedAt: healthConnection?.lastSyncedAt?.toISOString(),
            metrics: {
              readinessScore: healthProfile.intelligence.readiness.score,
              readinessLabel: healthProfile.intelligence.readiness.label,
              readinessConfidence:
                healthProfile.intelligence.readiness.confidence,
              readinessSummary: healthProfile.intelligence.readiness.summary,
              strainScore: healthProfile.intelligence.strain.score,
              sleepContinuityPercent:
                healthProfile.intelligence.sleep?.efficiencyPercent,
              restingHeartRate: healthProfile.summary.restingHeartRate,
              heartRateVariabilityMs:
                healthProfile.summary.heartRateVariabilityMs,
              sleepHours: healthProfile.summary.lastSleepHours,
              steps:
                healthProfile.daily[0]?.steps === undefined
                  ? undefined
                  : Math.round(healthProfile.daily[0].steps),
              activeEnergyKcal:
                healthProfile.daily[0]?.activeEnergyKcal ??
                healthProfile.summary.sevenDayActiveEnergyKcal,
              latestWorkoutAt: healthProfile.timeline.find(
                (entry) => entry.metric === "workout",
              )?.startedAt,
            },
          }
        : undefined,
    timeline,
  };
}

export async function loadDemoOperatorMemberProfile(
  organizationId: string,
  personId: string,
): Promise<OperatorMemberProfile> {
  const { relationship, workspace } = await assertRelationship(
    organizationId,
    personId,
    true,
  );
  const sessionsForPerson = workspace.eventRegistrations
    .filter((registration) => registration.personId === personId)
    .flatMap((registration) => {
      const session = workspace.sessions.find(
        (candidate) => candidate.id === registration.sessionId,
      );
      if (!session) return [];
      const attendanceStatus =
        registration.status === "checked-in"
          ? ("attended" as const)
          : registration.status === "cancelled" ||
              registration.status === "refunded"
            ? ("cancelled" as const)
            : session.status === "completed" &&
                relationship.displayName === "Jordan Smith"
              ? ("no-show" as const)
              : ("scheduled" as const);
      return [
        {
          id: session.id,
          title: session.title,
          kind: session.kind,
          startsAt: session.startsAt,
          endsAt: session.endsAt,
          timezone: session.timezone,
          venueName: session.venueName,
          status: session.status,
          registrationId: registration.id,
          registrationStatus: registration.status,
          attendanceStatus,
          orderId: registration.orderId,
          noteCount:
            session.status === "completed" &&
            ["Maya Chen", "Jordan Smith"].includes(relationship.displayName)
              ? 1
              : 0,
        },
      ];
    })
    .toSorted((left, right) => right.startsAt.localeCompare(left.startsAt));
  const completedSession = workspace.sessions.find(
    (session) => session.status === "completed",
  );
  const publishedNote: OperatorSessionNote | undefined = completedSession
    ? {
        id: "10000000-0000-4000-8000-000000000801",
        sessionId: completedSession.id,
        sessionTitle: completedSession.title,
        authorPersonId: "10000000-0000-4000-8000-000000000901",
        authorName: "Coach Alex Rivera",
        subject: "Calmer first contact",
        visibility: "player",
        source: "livekit-voice",
        transcript:
          "Maya stayed balanced in serve receive. Her platform was calm and she made an early call. Next time begin one step deeper.",
        summary:
          "Your platform stayed calm and your early call helped the whole play. Next session, begin one step deeper so you can keep that same balance against the short serve.",
        status: "published",
        recipients: [
          {
            personId,
            displayName: relationship.displayName,
            detected: true,
            sharedAt: completedSession.endsAt,
          },
        ],
        publishedAt: completedSession.endsAt,
        createdAt: completedSession.endsAt,
      }
    : undefined;
  const privateNote: OperatorSessionNote | undefined = completedSession
    ? {
        id: "10000000-0000-4000-8000-000000000802",
        sessionId: completedSession.id,
        sessionTitle: completedSession.title,
        authorPersonId: "10000000-0000-4000-8000-000000000901",
        authorName: "Coach Alex Rivera",
        subject: "Next-session setup",
        visibility: "private",
        source: "typed",
        summary:
          "Pair with a stronger short server next time and watch the first two steps before changing the platform cue.",
        status: "draft",
        recipients: [
          {
            personId,
            displayName: relationship.displayName,
            detected: false,
          },
        ],
        createdAt: completedSession.endsAt,
      }
    : undefined;
  const notes =
    relationship.displayName === "Maya Chen"
      ? [publishedNote, privateNote].filter(
          (note): note is OperatorSessionNote => Boolean(note),
        )
      : relationship.displayName === "Jordan Smith" && privateNote
        ? [
            {
              ...privateNote,
              id: "10000000-0000-4000-8000-000000000803",
              subject: "Re-entry follow-up",
              summary:
                "Check in before the next clinic. Recent no-show may reflect scheduling friction rather than training intent.",
            },
          ]
        : [];
  const purchaseAt = new Date(Date.now() - 21 * 24 * 60 * 60_000).toISOString();
  const purchaseId =
    workspace.eventRegistrations.find(
      (registration) =>
        registration.personId === personId && registration.orderId,
    )?.orderId ?? "10000000-0000-4000-8000-000000000599";
  const purchases = relationship.purchaseCount
    ? [
        {
          orderId: purchaseId,
          description:
            relationship.membershipName ?? "Small-group training session",
          amountMinor: relationship.recentPurchases[0]?.amountMinor ?? 9_000,
          refundedMinor: 0,
          currency: "USD" as const,
          status: "paid",
          purchasedAt: purchaseAt,
          refunds: [],
        },
      ]
    : [];
  const videos = completedSession
    ? [
        {
          id: "10000000-0000-4000-8000-000000000851",
          title: "Serve receive · final round",
          category: "practice",
          status: "ready",
          sessionId: completedSession.id,
          sessionTitle: completedSession.title,
          durationSeconds: 86,
          createdAt: completedSession.endsAt,
        },
      ]
    : [];
  const timeline: OperatorMemberProfile["timeline"] = [
    ...sessionsForPerson.map((session) => ({
      id: `session:${session.registrationId}`,
      kind: "session" as const,
      title: session.title,
      detail: `${session.attendanceStatus.replaceAll("-", " ")} · ${session.venueName ?? "Location pending"}`,
      occurredAt: session.startsAt,
      href: `/events/${session.id}`,
    })),
    ...purchases.map((purchase) => ({
      id: `purchase:${purchase.orderId}`,
      kind: "purchase" as const,
      title: purchase.description,
      detail: `Paid · USD ${(purchase.amountMinor / 100).toFixed(2)}`,
      occurredAt: purchase.purchasedAt,
    })),
    ...notes.map((note) => ({
      id: `note:${note.id}`,
      kind: "note" as const,
      title: note.subject ?? "Session note",
      detail: `${note.visibility === "private" ? "Private" : "Shared"} · ${note.sessionTitle}`,
      occurredAt: note.createdAt,
      href: `/events/${note.sessionId}`,
    })),
  ].toSorted((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  return {
    relationship,
    profile: {
      handle: relationship.displayName.toLowerCase().replace(/\W+/g, "-"),
      homeMarket: "South Bay, CA",
      ageBand: relationship.isMinor ? "teen" : "adult",
      profileClaimStatus: "claimed",
      profileVisibility: "private",
      playingExperience: relationship.isMinor ? "club" : "competitive",
      yearsPlaying: relationship.isMinor ? 3 : 8,
      experienceSummary: relationship.roles.includes("guardian")
        ? "Guardian and household booking contact."
        : "Developing a composed first contact and a more assertive transition game.",
    },
    plans: relationship.membershipStatus
      ? [
          {
            id: "10000000-0000-4000-8000-000000000701",
            name: relationship.membershipName ?? "Training membership",
            status: relationship.membershipStatus,
            interval: "month",
            priceMinor: 18_500,
            currency: "USD",
            currentPeriodEndsAt: new Date(
              Date.now() + 24 * 60 * 60_000 * 24,
            ).toISOString(),
            cancelAtPeriodEnd: relationship.membershipStatus === "cancelled",
          },
        ]
      : [],
    creditGrants: relationship.creditBalance
      ? [
          {
            id: "10000000-0000-4000-8000-000000000702",
            initialCredits: 10,
            remainingCredits: relationship.creditBalance,
            initialValueMinor: 75_000,
            remainingValueMinor: relationship.creditBalance * 7_500,
            currency: "USD",
            status: "active",
            expiresAt: new Date(
              Date.now() + 60 * 24 * 60 * 60_000,
            ).toISOString(),
            createdAt: purchaseAt,
          },
        ]
      : [],
    sessions: sessionsForPerson,
    purchases,
    notes,
    videos,
    health:
      relationship.displayName === "Maya Chen"
        ? {
            source: "apple-healthkit",
            scopes: ["activity", "heart-rate", "sleep", "workouts"],
            grantedAt: new Date(
              Date.now() - 30 * 24 * 60 * 60_000,
            ).toISOString(),
            observedAt: new Date(Date.now() - 4 * 60 * 60_000).toISOString(),
            metrics: {
              restingHeartRate: 58,
              heartRateVariabilityMs: 67,
              sleepHours: 7.7,
              steps: 8_942,
              activeEnergyKcal: 614,
              exerciseMinutes: 71,
              latestWorkoutAt: completedSession?.endsAt,
            },
          }
        : undefined,
    timeline,
  };
}

export async function loadOperatorSessionDetail(
  organizationId: string,
  sessionId: string,
  now: Date = new Date(),
): Promise<OperatorSessionDetail> {
  requireDatabase();
  const workspace = await loadOperatorWorkspace(organizationId);
  const session = workspace.sessions.find(
    (candidate) => candidate.id === sessionId,
  );
  if (!session) throw new Error("Session was not found in this organization.");
  const database = getDatabase();
  const sessionRow = await database.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
  });
  if (!sessionRow) throw new Error("Session was not found.");
  const venueRow = sessionRow.venueId
    ? await database.query.venues.findFirst({
        where: and(
          eq(venues.id, sessionRow.venueId),
          eq(venues.organizationId, organizationId),
        ),
      })
    : undefined;
  const registrationRows = workspace.eventRegistrations.filter(
    (registration) => registration.sessionId === sessionId,
  );
  const orderIds = [
    ...new Set(
      registrationRows.flatMap((registration) =>
        registration.orderId ? [registration.orderId] : [],
      ),
    ),
  ];
  const [
    attendanceRows,
    orderRows,
    refundRows,
    operation,
    notes,
    videoRows,
    teamEntryRows,
    arrivalBoard,
  ] = await Promise.all([
    database
      .select()
      .from(sessionAttendance)
      .where(
        and(
          eq(sessionAttendance.organizationId, organizationId),
          eq(sessionAttendance.sessionId, sessionId),
        ),
      ),
    orderIds.length
      ? database
          .select()
          .from(orders)
          .where(
            and(
              eq(orders.organizationId, organizationId),
              inArray(orders.id, orderIds),
            ),
          )
      : Promise.resolve([]),
    orderIds.length
      ? database
          .select()
          .from(refundRecords)
          .where(
            and(
              eq(refundRecords.organizationId, organizationId),
              inArray(refundRecords.orderId, orderIds),
            ),
          )
      : Promise.resolve([]),
    database.query.sessionOperations.findFirst({
      where: and(
        eq(sessionOperations.organizationId, organizationId),
        eq(sessionOperations.sessionId, sessionId),
      ),
    }),
    loadSessionNotes({ organizationId, sessionId }),
    database
      .select({
        id: videos.id,
        ownerPersonId: videos.ownerPersonId,
        title: videos.title,
        status: videos.status,
        durationSeconds: videos.durationSeconds,
        muxAssetPlaybackId: videos.muxAssetPlaybackId,
        muxAssetPlaybackPolicy: videos.muxAssetPlaybackPolicy,
        createdAt: videos.createdAt,
      })
      .from(videos)
      .where(
        and(
          eq(videos.organizationId, organizationId),
          eq(videos.eventId, sessionId),
          sql`${videos.status} <> 'deleted'`,
        ),
      )
      .orderBy(desc(videos.createdAt)),
    database
      .select({
        id: teamEntries.id,
        expectedTeamSize: teamEntries.expectedTeamSize,
        paymentMode: teamEntries.paymentMode,
        roster: teamEntries.roster,
        status: teamEntries.status,
        claimExpiresAt: teamEntries.claimExpiresAt,
        divisionName: divisions.name,
        captainName: people.displayName,
        registrationStatus: registrations.status,
        orderStatus: orders.status,
      })
      .from(teamEntries)
      .innerJoin(
        registrations,
        eq(teamEntries.registrationId, registrations.id),
      )
      .innerJoin(divisions, eq(registrations.divisionId, divisions.id))
      .innerJoin(people, eq(teamEntries.payingPersonId, people.id))
      .leftJoin(orders, eq(registrations.orderId, orders.id))
      .where(eq(registrations.sessionId, sessionId)),
    loadSessionArrivalBoard({ organizationId, sessionId, now }),
  ]);
  const personIds = [
    ...new Set([
      ...(sessionRow.coachPersonId ? [sessionRow.coachPersonId] : []),
      ...(operation?.cancelledByPersonId
        ? [operation.cancelledByPersonId]
        : []),
      ...videoRows.map((video) => video.ownerPersonId),
    ]),
  ];
  const personRows = personIds.length
    ? await database
        .select({
          id: people.id,
          displayName: people.displayName,
          avatarUrl: people.avatarUrl,
        })
        .from(people)
        .where(inArray(people.id, personIds))
    : [];
  const personById = new Map(personRows.map((person) => [person.id, person]));
  const orderById = new Map(orderRows.map((order) => [order.id, order]));
  const refundedByOrder = new Map<string, number>();
  for (const refund of refundRows) {
    if (!["pending", "succeeded"].includes(refund.status)) continue;
    refundedByOrder.set(
      refund.orderId,
      (refundedByOrder.get(refund.orderId) ?? 0) + refund.amountMinor,
    );
  }
  const attendanceByPerson = new Map(
    attendanceRows.map((row) => [row.personId, row.status]),
  );
  const grossMinor = orderRows
    .filter((order) =>
      ["paid", "partially-refunded", "refunded"].includes(order.status),
    )
    .reduce((sum, order) => sum + order.totalMinor, 0);
  const refundedMinor = [...refundedByOrder.values()].reduce(
    (sum, amount) => sum + amount,
    0,
  );
  const coach = sessionRow.coachPersonId
    ? personById.get(sessionRow.coachPersonId)
    : undefined;
  const weatherOperations = await loadSessionWeatherOperations({
    session: sessionRow,
    venue: venueRow,
    snapshot: operation?.weatherSnapshot as SessionWeatherOperations["weather"],
    now,
  }).catch(() => ({
    weatherStatus: "temporarily-unavailable" as const,
  }));
  return {
    session,
    arrivalBoard,
    coaches: coach
      ? [
          {
            personId: coach.id,
            displayName: coach.displayName,
            avatarUrl: coach.avatarUrl ?? undefined,
          },
        ]
      : [],
    attendees: registrationRows.map((registration) => {
      const order = registration.orderId
        ? orderById.get(registration.orderId)
        : undefined;
      return {
        ...registration,
        attendanceStatus: (attendanceByPerson.get(registration.personId) ??
          (registration.status === "cancelled" ||
          registration.status === "refunded"
            ? "cancelled"
            : registration.status === "checked-in"
              ? "attended"
              : "scheduled")) as
          "scheduled" | "attended" | "no-show" | "cancelled",
        paidMinor: order?.totalMinor ?? 0,
        refundedMinor: registration.orderId
          ? (refundedByOrder.get(registration.orderId) ?? 0)
          : 0,
      };
    }),
    teams: teamEntryRows.map((team) => {
      const captainPaid =
        team.orderStatus === "paid" ||
        team.orderStatus === "partially-refunded" ||
        team.registrationStatus === "confirmed" ||
        team.registrationStatus === "checked-in";
      const claimedPlayers =
        1 + team.roster.filter((member) => member.status === "claimed").length;
      const paidPlayers =
        team.paymentMode === "team" && captainPaid
          ? team.expectedTeamSize
          : (captainPaid ? 1 : 0) +
            team.roster.filter((member) => Boolean(member.paidAt)).length;
      const playersAdded = Math.min(
        team.expectedTeamSize,
        1 + team.roster.length,
      );
      const status =
        team.status === "ready" ||
        team.status === "confirmed" ||
        team.status === "cancelled" ||
        team.status === "expired"
          ? team.status
          : "assembling";
      return {
        id: team.id,
        divisionName: team.divisionName,
        captainName: team.captainName,
        expectedTeamSize: team.expectedTeamSize,
        playersAdded,
        claimedPlayers,
        paidPlayers,
        paymentMode: team.paymentMode === "team" ? "team" : "self",
        status,
        needsAttention:
          status === "assembling" &&
          (playersAdded < team.expectedTeamSize ||
            claimedPlayers < team.expectedTeamSize ||
            paidPlayers < team.expectedTeamSize),
        expiresAt: team.claimExpiresAt.toISOString(),
        roster: [
          {
            displayName: team.captainName,
            status: "captain" as const,
            paid: captainPaid,
          },
          ...team.roster.map((member) => ({
            displayName:
              member.displayName ?? member.inviteTarget ?? "Invite pending",
            status: member.status,
            deliveryStatus: member.deliveryStatus,
            paid:
              team.paymentMode === "team"
                ? captainPaid
                : Boolean(member.paidAt),
          })),
        ],
      };
    }),
    finance: {
      grossMinor,
      refundedMinor,
      netMinor: grossMinor - refundedMinor,
      currency: currency(session.currency),
      paidOrders: orderRows.filter((order) =>
        ["paid", "partially-refunded", "refunded"].includes(order.status),
      ).length,
    },
    operations: {
      cancellationKind: operation?.cancellationKind as
        "coach" | "weather" | "operator" | "venue" | "other" | undefined,
      cancellationReason: operation?.cancellationReason ?? undefined,
      cancelledByName: operation?.cancelledByPersonId
        ? personById.get(operation.cancelledByPersonId)?.displayName
        : undefined,
      cancelledAt: operation?.cancelledAt?.toISOString(),
      ...weatherOperations,
    },
    notes,
    videos: videoRows.map((video) => ({
      id: video.id,
      ownerPersonId: video.ownerPersonId,
      ownerName:
        personById.get(video.ownerPersonId)?.displayName ?? "Duna player",
      title: video.title,
      status: video.status,
      durationSeconds: video.durationSeconds ?? undefined,
      thumbnailUrl: muxThumbnail(
        video.muxAssetPlaybackId,
        video.muxAssetPlaybackPolicy,
      ),
      createdAt: video.createdAt.toISOString(),
    })),
  };
}

export async function loadDemoOperatorSessionDetail(
  organizationId: string,
  sessionId: string,
  now: Date = new Date(),
): Promise<OperatorSessionDetail> {
  const workspace = await loadDemoOperatorWorkspace(organizationId);
  const session = workspace.sessions.find(
    (candidate) => candidate.id === sessionId,
  );
  if (!session) throw new Error("Session was not found in this organization.");
  const registrations = workspace.eventRegistrations.filter(
    (registration) => registration.sessionId === sessionId,
  );
  const isCompleted = session.status === "completed";
  const isCancelled = session.status === "cancelled";
  const attendees: OperatorSessionDetail["attendees"] = registrations.map(
    (registration) => ({
      ...registration,
      attendanceStatus: isCancelled
        ? "cancelled"
        : registration.status === "checked-in"
          ? "attended"
          : registration.status === "cancelled" ||
              registration.status === "refunded"
            ? "cancelled"
            : isCompleted && registration.displayName === "Jordan Smith"
              ? "no-show"
              : "scheduled",
      paidMinor: session.priceMinor,
      refundedMinor:
        isCancelled ||
        registration.status === "cancelled" ||
        registration.status === "refunded"
          ? session.priceMinor
          : 0,
    }),
  );
  const activeOrders = attendees.filter(
    (attendee) => attendee.refundedMinor === 0,
  ).length;
  const grossMinor = attendees.length * session.priceMinor;
  const refundedMinor = attendees.reduce(
    (total, attendee) => total + attendee.refundedMinor,
    0,
  );
  const coachPersonId = "10000000-0000-4000-8000-000000000901";
  const notes: OperatorSessionNote[] = isCompleted
    ? [
        {
          id: "10000000-0000-4000-8000-000000000811",
          sessionId,
          sessionTitle: session.title,
          authorPersonId: coachPersonId,
          authorName: "Coach Alex Rivera",
          subject: "Calmer first contact",
          visibility: "player",
          source: "livekit-voice",
          transcript:
            "Maya stayed balanced in serve receive. Her platform was calm and she made an early call. Next time begin one step deeper.",
          summary:
            "Maya stayed balanced through first contact. Keep the early call and begin one step deeper against the short serve.",
          status: "published",
          recipients: attendees
            .filter((attendee) => attendee.displayName === "Maya Chen")
            .map((attendee) => ({
              personId: attendee.personId,
              displayName: attendee.displayName,
              detected: true,
              sharedAt: session.endsAt,
            })),
          publishedAt: session.endsAt,
          createdAt: session.endsAt,
        },
        {
          id: "10000000-0000-4000-8000-000000000812",
          sessionId,
          sessionTitle: session.title,
          authorPersonId: coachPersonId,
          authorName: "Coach Alex Rivera",
          subject: "Session shape",
          visibility: "private",
          source: "typed",
          summary:
            "The short-serve progression exposed a useful first-step pattern. Repeat it before adding the transition constraint.",
          status: "draft",
          recipients: [],
          createdAt: session.endsAt,
        },
      ]
    : [];
  return {
    session,
    arrivalBoard: {
      sessionId,
      venueName: session.venueName,
      startsAt: session.startsAt,
      expectedPlayers: attendees.filter(
        (attendee) => attendee.attendanceStatus !== "cancelled",
      ).length,
      sharingWindow: arrivalSharingWindow(session.startsAt, now),
      signals: attendees.slice(0, 4).map((attendee, index) => {
        const etaMinutes = index === 0 ? 0 : 6 + index * 4;
        return {
          sessionId,
          personId: attendee.personId,
          displayName: attendee.displayName,
          avatarUrl: attendee.avatarUrl,
          role: "player" as const,
          status:
            index === 0
              ? ("arrived" as const)
              : index === 3
                ? ("running-late" as const)
                : index === 2
                  ? ("leave-now" as const)
                  : ("on-time" as const),
          distanceMeters: index === 0 ? 45 : 1_200 + index * 1_900,
          travelDurationSeconds: etaMinutes * 60,
          leaveBy: new Date(
            Date.parse(session.startsAt) - etaMinutes * 60_000 - 5 * 60_000,
          ).toISOString(),
          routeSource: "google-routes" as const,
          accuracyMeters: 18,
          observedAt: now.toISOString(),
          expiresAt: new Date(
            Date.parse(session.startsAt) + 30 * 60_000,
          ).toISOString(),
        };
      }),
    },
    coaches: [
      {
        personId: coachPersonId,
        displayName: "Coach Alex Rivera",
      },
    ],
    attendees,
    teams: [],
    finance: {
      grossMinor,
      refundedMinor,
      netMinor: grossMinor - refundedMinor,
      currency: session.currency,
      paidOrders: activeOrders,
    },
    operations: isCancelled
      ? {
          cancellationKind: "weather",
          cancellationReason:
            "Unsafe wind conditions persisted through the competition window.",
          cancelledByName: "Coach Alex Rivera",
          cancelledAt: new Date(
            Date.parse(session.startsAt) - 3 * 60 * 60_000,
          ).toISOString(),
          weather: {
            condition: "Strong wind",
            temperatureC: 17,
            apparentTemperatureC: 16,
            precipitationProbability: 12,
            windSpeedKph: 38,
            source: "Tomorrow.io",
            observedAt: session.startsAt,
          },
          weatherKind: "captured",
          weatherStatus: "captured",
        }
      : isCompleted
        ? {
            weather: {
              condition: "Clear",
              temperatureC: 21,
              apparentTemperatureC: 21,
              precipitationProbability: 2,
              windSpeedKph: 11,
              source: "Tomorrow.io",
              observedAt: session.startsAt,
            },
            weatherKind: "captured",
            weatherStatus: "captured",
          }
        : !weatherForecastIsAvailable(new Date(session.startsAt), now)
          ? {
              weatherStatus: "forecast-pending",
              forecastAvailableAt: weatherForecastAvailableAt(
                new Date(session.startsAt),
              ).toISOString(),
            }
          : {
              weatherStatus: "provider-required",
            },
    notes,
    videos: isCompleted
      ? [
          {
            id: "10000000-0000-4000-8000-000000000852",
            ownerPersonId: attendees[0]?.personId ?? coachPersonId,
            ownerName: attendees[0]?.displayName ?? "Coach Alex Rivera",
            title: "Serve receive · final round",
            status: "ready",
            durationSeconds: 86,
            createdAt: session.endsAt,
          },
        ]
      : [],
  };
}

export async function loadPlayerCoachingNotes(input: {
  readonly actor: ApiActor;
  readonly subjectPersonId?: string;
}) {
  requireDatabase();
  const database = getDatabase();
  const personId = input.subjectPersonId ?? input.actor.personId;
  if (personId !== input.actor.personId) {
    const guardianship = await database.query.guardianships.findFirst({
      where: and(
        eq(guardianships.guardianId, input.actor.personId),
        eq(guardianships.minorId, personId),
        eq(guardianships.verified, true),
        eq(guardianships.reviewStatus, "verified"),
      ),
    });
    if (!guardianship) {
      throw new Error("This player is not connected to your household.");
    }
  }
  return database
    .select({
      id: sessionNotes.id,
      organizationId: sessionNotes.organizationId,
      organizationName: organizations.name,
      sessionId: sessionNotes.sessionId,
      sessionTitle: sessions.title,
      coachName: people.displayName,
      subject: sessionNotes.subject,
      summary: sessionNotes.summary,
      publishedAt: sessionNotes.publishedAt,
    })
    .from(sessionNoteRecipients)
    .innerJoin(sessionNotes, eq(sessionNoteRecipients.noteId, sessionNotes.id))
    .innerJoin(sessions, eq(sessionNotes.sessionId, sessions.id))
    .innerJoin(organizations, eq(sessionNotes.organizationId, organizations.id))
    .innerJoin(people, eq(sessionNotes.authorPersonId, people.id))
    .where(
      and(
        eq(sessionNoteRecipients.personId, personId),
        eq(sessionNotes.visibility, "player"),
        eq(sessionNotes.status, "published"),
      ),
    )
    .orderBy(desc(sessionNotes.publishedAt))
    .then((rows) =>
      rows.flatMap((row) =>
        row.publishedAt
          ? [
              {
                id: row.id,
                organizationId: row.organizationId,
                organizationName: row.organizationName,
                sessionId: row.sessionId,
                sessionTitle: row.sessionTitle,
                coachName: row.coachName,
                subject: row.subject ?? undefined,
                summary: row.summary,
                publishedAt: row.publishedAt.toISOString(),
              },
            ]
          : [],
      ),
    );
}

export async function createSessionNote(input: {
  readonly actor: ApiActor;
  readonly sessionId: string;
  readonly subject?: string;
  readonly visibility: "private" | "player";
  readonly source: "typed" | "livekit-voice";
  readonly transcript?: string;
  readonly summary?: string;
  readonly recipientPersonIds: readonly string[];
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const workspace = await loadOperatorWorkspace(organizationId);
  const session = workspace.sessions.find(
    (candidate) => candidate.id === input.sessionId,
  );
  if (!session) throw new Error("Session was not found in this organization.");
  const transcript = input.transcript?.replace(/\s+/g, " ").trim() ?? "";
  const summary =
    input.summary?.trim() || summarizeSessionTranscript(transcript);
  if (!summary) throw new Error("Add a session note or record a voice note.");
  const roster = workspace.eventRegistrations
    .filter((registration) => registration.sessionId === input.sessionId)
    .map((registration) => ({
      personId: registration.personId,
      displayName: registration.displayName,
    }));
  const rosterIds = new Set(roster.map((person) => person.personId));
  const detectedIds = new Set(
    detectSessionNotePeople(transcript || summary, roster),
  );
  const recipientIds = [
    ...new Set([
      ...input.recipientPersonIds.filter((personId) => rosterIds.has(personId)),
      ...detectedIds,
    ]),
  ];
  if (input.visibility === "player" && recipientIds.length === 0) {
    throw new Error("Choose at least one player for a shareable note.");
  }
  const database = getDatabase();
  const id = crypto.randomUUID();
  const noteValues = {
    id,
    organizationId,
    sessionId: input.sessionId,
    authorPersonId: input.actor.personId,
    subject: input.subject?.trim() || undefined,
    visibility: input.visibility,
    source: input.source,
    transcript: transcript || undefined,
    summary,
    status: "draft",
  };
  const noteInsert = database.insert(sessionNotes).values(noteValues);
  const auditInsert = database.insert(auditLog).values({
    organizationId,
    actorPersonId: input.actor.personId,
    actorType: "person",
    action: "session.note_drafted",
    entityType: "session-note",
    entityId: id,
    afterHash: stableHash({
      sessionId: input.sessionId,
      visibility: input.visibility,
      source: input.source,
      recipientIds,
      contentHash: stableHash({ transcript, summary }),
    }),
    reason:
      input.visibility === "private"
        ? "Coach saved a private session note."
        : "Coach saved a player-shareable draft; it has not been published.",
    traceId: input.requestId,
    ipAddress: input.ipAddress,
    createdAt: input.now,
  });
  if (recipientIds.length > 0) {
    await database.batch([
      noteInsert,
      database.insert(sessionNoteRecipients).values(
        recipientIds.map((personId) => ({
          noteId: id,
          personId,
          detected: detectedIds.has(personId),
        })),
      ),
      auditInsert,
    ]);
  } else {
    await database.batch([noteInsert, auditInsert]);
  }
  try {
    await captureSessionWeatherIfAvailable({
      organizationId,
      sessionId: input.sessionId,
      now: input.now,
    });
  } catch {
    // A provider outage never blocks the coach from saving a session note.
  }
  return { id, entity: "session-note", status: "draft" };
}

export async function publishSessionNote(input: {
  readonly actor: ApiActor;
  readonly noteId: string;
  readonly confirmed: boolean;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  if (!input.confirmed) throw new Error("Confirm before sharing this note.");
  const organizationId = requireOrganization(input.actor);
  const database = getDatabase();
  const note = await database.query.sessionNotes.findFirst({
    where: and(
      eq(sessionNotes.id, input.noteId),
      eq(sessionNotes.organizationId, organizationId),
    ),
  });
  if (!note) throw new Error("Session note was not found.");
  if (note.visibility !== "player") {
    throw new Error("Private session notes cannot be published to players.");
  }
  if (note.status !== "draft") {
    throw new Error("Only a shareable draft can be published.");
  }
  const recipients = await database
    .select({ personId: sessionNoteRecipients.personId })
    .from(sessionNoteRecipients)
    .where(eq(sessionNoteRecipients.noteId, note.id));
  if (recipients.length === 0) {
    throw new Error("Choose at least one player before publishing.");
  }
  const recipientIds = recipients.map((recipient) => recipient.personId);
  const [recipientPeople, guardianRows] = await Promise.all([
    database
      .select({ id: people.id, isMinor: people.isMinor })
      .from(people)
      .where(inArray(people.id, recipientIds)),
    database
      .select({
        minorId: guardianships.minorId,
        guardianId: guardianships.guardianId,
      })
      .from(guardianships)
      .where(
        and(
          inArray(guardianships.minorId, recipientIds),
          eq(guardianships.verified, true),
          eq(guardianships.reviewStatus, "verified"),
        ),
      ),
  ]);
  const minorIds = new Set(
    recipientPeople
      .filter((person) => person.isMinor)
      .map((person) => person.id),
  );
  for (const minorId of minorIds) {
    if (!guardianRows.some((guardian) => guardian.minorId === minorId)) {
      throw new Error(
        "A verified guardian is required before sharing a coaching note with a minor.",
      );
    }
  }
  await database.batch([
    database
      .update(sessionNotes)
      .set({
        status: "published",
        publishedAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(sessionNotes.id, note.id)),
    database
      .update(sessionNoteRecipients)
      .set({ sharedAt: input.now })
      .where(eq(sessionNoteRecipients.noteId, note.id)),
    database.insert(messages).values(
      recipientIds.map((personId) => ({
        id: crypto.randomUUID(),
        organizationId,
        senderPersonId: input.actor.personId,
        recipientPersonId: personId,
        guardianCopyPersonIds: minorIds.has(personId)
          ? guardianRows
              .filter((guardian) => guardian.minorId === personId)
              .map((guardian) => guardian.guardianId)
          : [],
        channel: "in-app" as const,
        kind: "session-note-shared",
        subject: note.subject ?? "A note from your coach",
        body: note.summary,
        status: "queued",
      })),
    ),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "session.note_published",
      entityType: "session-note",
      entityId: note.id,
      beforeHash: stableHash({ status: note.status }),
      afterHash: stableHash({
        status: "published",
        recipientPersonIds: recipientIds,
      }),
      reason:
        "Coach confirmed the reviewed note should be shared with players.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { id: note.id, entity: "session-note", status: "published" };
}

export async function recordSessionAttendance(input: {
  readonly actor: ApiActor;
  readonly registrationId: string;
  readonly status: "scheduled" | "attended" | "no-show" | "cancelled";
  readonly note?: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const database = getDatabase();
  const registration = await database
    .select({
      id: registrations.id,
      sessionId: registrations.sessionId,
      personId: registrations.personId,
      registrationStatus: registrations.status,
      organizationId: sql<string>`coalesce(${programs.organizationId}, ${eventTypes.organizationId}, ${venues.organizationId})`,
    })
    .from(registrations)
    .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
    .leftJoin(programs, eq(sessions.programId, programs.id))
    .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
    .leftJoin(venues, eq(sessions.venueId, venues.id))
    .where(eq(registrations.id, input.registrationId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!registration || registration.organizationId !== organizationId) {
    throw new Error("Registration was not found in this organization.");
  }
  const attendanceId = crypto.randomUUID();
  const attendanceWrite = database
    .insert(sessionAttendance)
    .values({
      id: attendanceId,
      organizationId,
      sessionId: registration.sessionId,
      registrationId: registration.id,
      personId: registration.personId,
      status: input.status,
      note: input.note?.trim() || undefined,
      recordedByPersonId: input.actor.personId,
      recordedAt: input.now,
    })
    .onConflictDoUpdate({
      target: [sessionAttendance.sessionId, sessionAttendance.personId],
      set: {
        registrationId: registration.id,
        status: input.status,
        note: input.note?.trim() || null,
        recordedByPersonId: input.actor.personId,
        recordedAt: input.now,
        updatedAt: input.now,
      },
    });
  const auditInsert = database.insert(auditLog).values({
    organizationId,
    actorPersonId: input.actor.personId,
    actorType: "person",
    action: "session.attendance_recorded",
    entityType: "registration",
    entityId: registration.id,
    beforeHash: stableHash({ status: registration.registrationStatus }),
    afterHash: stableHash({ attendanceStatus: input.status }),
    reason: input.note?.trim() || `Attendance marked ${input.status}.`,
    traceId: input.requestId,
    ipAddress: input.ipAddress,
    createdAt: input.now,
  });
  if (input.status === "attended") {
    await database.batch([
      attendanceWrite,
      database
        .update(registrations)
        .set({
          status: "checked-in",
          checkedInAt: input.now,
          updatedAt: input.now,
        })
        .where(eq(registrations.id, registration.id)),
      auditInsert,
    ]);
  } else {
    await database.batch([attendanceWrite, auditInsert]);
  }
  try {
    await captureSessionWeatherIfAvailable({
      organizationId,
      sessionId: registration.sessionId,
      now: input.now,
    });
  } catch {
    // Attendance remains authoritative even when weather is unavailable.
  }
  return {
    id: registration.id,
    entity: "session-attendance",
    status: input.status,
  };
}

export type PlayerRegistrationScanResult = {
  readonly scanEventId: string;
  readonly registrationId: string;
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly reason?: "not-confirmed" | "already-checked-in";
  readonly registrationStatus:
    | "invited"
    | "pending"
    | "confirmed"
    | "waitlisted"
    | "cancelled"
    | "refunded"
    | "checked-in";
  readonly playerName: string;
  readonly eventTitle: string;
};

export async function scanPlayerRegistration(input: {
  readonly actor: ApiActor;
  readonly registrationId: string;
  readonly deviceId: string;
  readonly scannedAt: Date;
  readonly offline: boolean;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<PlayerRegistrationScanResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const database = getDatabase();
  const registration = await database
    .select({
      id: registrations.id,
      sessionId: registrations.sessionId,
      personId: registrations.personId,
      playerName: people.displayName,
      eventTitle: sessions.title,
      registrationStatus: registrations.status,
      organizationId: sql<string>`coalesce(${programs.organizationId}, ${eventTypes.organizationId}, ${venues.organizationId})`,
    })
    .from(registrations)
    .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
    .innerJoin(people, eq(registrations.personId, people.id))
    .leftJoin(programs, eq(sessions.programId, programs.id))
    .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
    .leftJoin(venues, eq(sessions.venueId, venues.id))
    .where(eq(registrations.id, input.registrationId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!registration || registration.organizationId !== organizationId) {
    throw new Error("Registration was not found in this organization.");
  }

  const scanEventId = crypto.randomUUID();
  const audit = (inputValue: {
    readonly accepted: boolean;
    readonly duplicate: boolean;
    readonly reason: string;
    readonly beforeStatus: string;
  }) =>
    database.insert(auditLog).values({
      id: scanEventId,
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: inputValue.accepted
        ? "tournament.player_scan_accepted"
        : inputValue.duplicate
          ? "tournament.player_scan_duplicate"
          : "tournament.player_scan_rejected",
      entityType: "registration",
      entityId: registration.id,
      beforeHash: stableHash({ status: inputValue.beforeStatus }),
      afterHash: stableHash({
        status: inputValue.accepted ? "checked-in" : inputValue.beforeStatus,
        accepted: inputValue.accepted,
        duplicate: inputValue.duplicate,
      }),
      reason: `${inputValue.reason} Device ${input.deviceId}; scanned ${input.scannedAt.toISOString()}${input.offline ? "; reconciled after offline capture" : ""}.`,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });

  const result = (inputValue: {
    readonly accepted: boolean;
    readonly duplicate: boolean;
    readonly reason?: PlayerRegistrationScanResult["reason"];
    readonly registrationStatus: PlayerRegistrationScanResult["registrationStatus"];
  }): PlayerRegistrationScanResult => ({
    scanEventId,
    registrationId: registration.id,
    playerName: registration.playerName,
    eventTitle: registration.eventTitle,
    ...inputValue,
  });

  if (registration.registrationStatus === "checked-in") {
    await audit({
      accepted: false,
      duplicate: true,
      beforeStatus: "checked-in",
      reason: "Duplicate player registration scan rejected.",
    });
    return result({
      accepted: false,
      duplicate: true,
      reason: "already-checked-in",
      registrationStatus: "checked-in",
    });
  }
  if (registration.registrationStatus !== "confirmed") {
    await audit({
      accepted: false,
      duplicate: false,
      beforeStatus: registration.registrationStatus,
      reason: "Player registration was not confirmed.",
    });
    return result({
      accepted: false,
      duplicate: false,
      reason: "not-confirmed",
      registrationStatus: registration.registrationStatus,
    });
  }

  const claimed = await database
    .update(registrations)
    .set({
      status: "checked-in",
      checkedInAt: input.scannedAt,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(registrations.id, registration.id),
        eq(registrations.status, "confirmed"),
      ),
    )
    .returning({ id: registrations.id });
  if (!claimed[0]) {
    await audit({
      accepted: false,
      duplicate: true,
      beforeStatus: "checked-in",
      reason: "Concurrent duplicate player registration scan rejected.",
    });
    return result({
      accepted: false,
      duplicate: true,
      reason: "already-checked-in",
      registrationStatus: "checked-in",
    });
  }

  await database.batch([
    database
      .insert(sessionAttendance)
      .values({
        id: crypto.randomUUID(),
        organizationId,
        sessionId: registration.sessionId,
        registrationId: registration.id,
        personId: registration.personId,
        status: "attended",
        note: `Player registration QR · device ${input.deviceId}`,
        recordedByPersonId: input.actor.personId,
        recordedAt: input.scannedAt,
      })
      .onConflictDoUpdate({
        target: [sessionAttendance.sessionId, sessionAttendance.personId],
        set: {
          registrationId: registration.id,
          status: "attended",
          note: `Player registration QR · device ${input.deviceId}`,
          recordedByPersonId: input.actor.personId,
          recordedAt: input.scannedAt,
          updatedAt: input.now,
        },
      }),
    audit({
      accepted: true,
      duplicate: false,
      beforeStatus: "confirmed",
      reason: "Player registration QR accepted and checked in.",
    }),
  ]);
  try {
    await captureSessionWeatherIfAvailable({
      organizationId,
      sessionId: registration.sessionId,
      now: input.now,
    });
  } catch {
    // Admission remains authoritative when the weather provider is unavailable.
  }
  return result({
    accepted: true,
    duplicate: false,
    registrationStatus: "checked-in",
  });
}

export async function updateOperatorMemberProfile(input: {
  readonly actor: ApiActor;
  readonly personId: string;
  readonly displayName: string;
  readonly email?: string;
  readonly phoneE164?: string;
  readonly homeMarket?: string;
  readonly experienceSummary?: string;
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  await assertRelationship(organizationId, input.personId);
  const database = getDatabase();
  const current = await database.query.people.findFirst({
    where: eq(people.id, input.personId),
  });
  if (!current) throw new Error("Person was not found.");
  const values = {
    displayName: input.displayName.trim(),
    email: input.email?.trim().toLowerCase() || null,
    phoneE164: input.phoneE164?.trim() || null,
    homeMarket: input.homeMarket?.trim() || null,
    experienceSummary: input.experienceSummary?.trim() || null,
    updatedAt: input.now,
  };
  await database.batch([
    database.update(people).set(values).where(eq(people.id, input.personId)),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "member.profile_updated_by_operator",
      entityType: "person",
      entityId: input.personId,
      beforeHash: stableHash({
        displayName: current.displayName,
        email: current.email,
        phoneE164: current.phoneE164,
        homeMarket: current.homeMarket,
        experienceSummary: current.experienceSummary,
      }),
      afterHash: stableHash(values),
      reason: input.reason,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    }),
  ]);
  return { id: input.personId, entity: "member-profile", status: "updated" };
}
