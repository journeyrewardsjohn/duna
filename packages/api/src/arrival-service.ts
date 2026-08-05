import {
  getDatabase,
  people,
  programs,
  registrations,
  sessionArrivalSignals,
  sessions,
  venues,
} from "@duna/db";
import {
  arrivalSharingWindow,
  arrivalStatus,
  distanceMeters,
  fallbackTravelDurationSeconds,
  leaveByTime,
  type Coordinate,
} from "@duna/scheduling";
import { and, asc, eq, gt } from "drizzle-orm";
import type { ApiActor } from "./context";
import type { z } from "zod";
import {
  sessionArrivalBoardSchema,
  sessionArrivalSignalSchema,
} from "./contracts";

export type SessionArrivalSignal = z.infer<typeof sessionArrivalSignalSchema>;
export type SessionArrivalBoard = z.infer<typeof sessionArrivalBoardSchema>;

interface ArrivalRouteEstimate {
  readonly distanceMeters: number;
  readonly travelDurationSeconds: number;
  readonly routeSource: "google-routes" | "distance-estimate";
}

interface ArrivalTarget {
  readonly organizationId: string;
  readonly sessionId: string;
  readonly title: string;
  readonly registrationId?: string;
  readonly startsAt: Date;
  readonly timezone: string;
  readonly venueName?: string;
  readonly venue: Coordinate;
}

export class ArrivalSignalError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "SESSION_NOT_FOUND"
      | "VENUE_LOCATION_REQUIRED"
      | "OUTSIDE_SHARING_WINDOW"
      | "CONSENT_REQUIRED"
      | "REGISTRATION_REQUIRED",
    message: string,
  ) {
    super(message);
    this.name = "ArrivalSignalError";
  }
}

function requireDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new ArrivalSignalError(
      "DATABASE_REQUIRED",
      "Arrival sharing needs the live Duna data service.",
    );
  }
}

function coordinate(latitude: number | null, longitude: number | null) {
  if (latitude === null || longitude === null) {
    throw new ArrivalSignalError(
      "VENUE_LOCATION_REQUIRED",
      "This venue needs a verified map location before arrival sharing can begin.",
    );
  }
  return { latitude, longitude };
}

async function playerArrivalTarget(input: {
  readonly personId: string;
  readonly registrationId: string;
}): Promise<ArrivalTarget> {
  const rows = await getDatabase()
    .select({
      organizationId: programs.organizationId,
      sessionId: sessions.id,
      title: sessions.title,
      startsAt: sessions.startsAt,
      timezone: sessions.timezone,
      registrationId: registrations.id,
      registrationStatus: registrations.status,
      venueName: venues.name,
      latitude: venues.latitude,
      longitude: venues.longitude,
    })
    .from(registrations)
    .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
    .innerJoin(programs, eq(sessions.programId, programs.id))
    .innerJoin(venues, eq(sessions.venueId, venues.id))
    .where(
      and(
        eq(registrations.personId, input.personId),
        eq(registrations.id, input.registrationId),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new ArrivalSignalError(
      "REGISTRATION_REQUIRED",
      "Only registered players can share an arrival for this session.",
    );
  }
  if (
    row.registrationStatus === "cancelled" ||
    row.registrationStatus === "refunded"
  ) {
    throw new ArrivalSignalError(
      "REGISTRATION_REQUIRED",
      "Arrival sharing is available only for an active session registration.",
    );
  }
  return {
    organizationId: row.organizationId,
    sessionId: row.sessionId,
    title: row.title,
    registrationId: row.registrationId,
    startsAt: row.startsAt,
    timezone: row.timezone,
    venueName: row.venueName,
    venue: coordinate(row.latitude, row.longitude),
  };
}

async function coachArrivalTarget(input: {
  readonly organizationId: string;
  readonly sessionId: string;
}): Promise<ArrivalTarget> {
  const rows = await getDatabase()
    .select({
      organizationId: programs.organizationId,
      sessionId: sessions.id,
      title: sessions.title,
      startsAt: sessions.startsAt,
      timezone: sessions.timezone,
      venueName: venues.name,
      latitude: venues.latitude,
      longitude: venues.longitude,
    })
    .from(sessions)
    .innerJoin(programs, eq(sessions.programId, programs.id))
    .innerJoin(venues, eq(sessions.venueId, venues.id))
    .where(
      and(
        eq(sessions.id, input.sessionId),
        eq(programs.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new ArrivalSignalError(
      "SESSION_NOT_FOUND",
      "This session is not available to the current organization.",
    );
  }
  return {
    organizationId: row.organizationId,
    sessionId: row.sessionId,
    title: row.title,
    startsAt: row.startsAt,
    timezone: row.timezone,
    venueName: row.venueName,
    venue: coordinate(row.latitude, row.longitude),
  };
}

function googleDurationSeconds(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Number(value.replace(/s$/, ""));
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.round(parsed)
    : undefined;
}

async function routeEstimate(
  origin: Coordinate,
  destination: Coordinate,
): Promise<ArrivalRouteEstimate> {
  const directDistance = distanceMeters(origin, destination);
  const fallback = (): ArrivalRouteEstimate => ({
    distanceMeters: directDistance,
    travelDurationSeconds: fallbackTravelDurationSeconds(directDistance),
    routeSource: "distance-estimate",
  });
  const apiKey =
    process.env.GOOGLE_ROUTES_API_KEY?.trim() ||
    process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey || directDistance <= 120) return fallback();
  try {
    const response = await fetch(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
          "x-goog-fieldmask": "routes.distanceMeters,routes.duration",
        },
        body: JSON.stringify({
          origin: { location: { latLng: origin } },
          destination: { location: { latLng: destination } },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
          computeAlternativeRoutes: false,
          languageCode: "en-US",
          units: "IMPERIAL",
        }),
        signal: AbortSignal.timeout(4_000),
      },
    );
    if (!response.ok) return fallback();
    const payload = (await response.json()) as {
      readonly routes?: readonly {
        readonly distanceMeters?: number;
        readonly duration?: string;
      }[];
    };
    const route = payload.routes?.[0];
    const duration = googleDurationSeconds(route?.duration);
    if (
      !route ||
      !Number.isFinite(route.distanceMeters) ||
      route.distanceMeters! < 0 ||
      duration === undefined
    ) {
      return fallback();
    }
    return {
      distanceMeters: Math.round(route.distanceMeters!),
      travelDurationSeconds: duration,
      routeSource: "google-routes",
    };
  } catch {
    return fallback();
  }
}

async function saveArrivalSignal(input: {
  readonly actor: ApiActor;
  readonly role: "player" | "coach";
  readonly target: ArrivalTarget;
  readonly location: Coordinate;
  readonly accuracyMeters?: number;
  readonly consentedAt: Date;
  readonly now: Date;
}) {
  const window = arrivalSharingWindow(input.target.startsAt, input.now);
  if (!window.active) {
    throw new ArrivalSignalError(
      "OUTSIDE_SHARING_WINDOW",
      "Arrival sharing is available from 60 minutes before until 30 minutes after the session starts.",
    );
  }
  const consentTime = input.consentedAt.getTime();
  const consentAgeMs = input.now.getTime() - consentTime;
  if (
    !Number.isFinite(consentAgeMs) ||
    consentAgeMs < -60_000 ||
    consentAgeMs > 95 * 60_000 ||
    consentTime < Date.parse(window.opensAt)
  ) {
    throw new ArrivalSignalError(
      "CONSENT_REQUIRED",
      "Choose Share trip ETA again before Duna uses location for this arrival window.",
    );
  }
  const route = await routeEstimate(input.location, input.target.venue);
  const status = arrivalStatus({
    ...route,
    accuracyMeters: input.accuracyMeters,
    startsAt: input.target.startsAt,
    now: input.now,
  });
  const values = {
    organizationId: input.target.organizationId,
    sessionId: input.target.sessionId,
    personId: input.actor.personId,
    registrationId: input.target.registrationId,
    role: input.role,
    status,
    distanceMeters: route.distanceMeters,
    travelDurationSeconds: route.travelDurationSeconds,
    leaveBy: new Date(
      leaveByTime({
        startsAt: input.target.startsAt,
        travelDurationSeconds: route.travelDurationSeconds,
      }),
    ),
    routeSource: route.routeSource,
    accuracyMeters: input.accuracyMeters,
    consentedAt: input.consentedAt,
    observedAt: input.now,
    expiresAt: new Date(window.closesAt),
    updatedAt: input.now,
  };
  await getDatabase()
    .insert(sessionArrivalSignals)
    .values({ ...values, createdAt: input.now })
    .onConflictDoUpdate({
      target: [sessionArrivalSignals.sessionId, sessionArrivalSignals.personId],
      set: values,
    });
  return {
    ...values,
    startsAt: input.target.startsAt,
    timezone: input.target.timezone,
    title: input.target.title,
    venueName: input.target.venueName,
  };
}

export async function publishPlayerArrivalSignal(input: {
  readonly actor: ApiActor;
  readonly registrationId: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyMeters?: number;
  readonly consentedAt: Date;
  readonly now: Date;
}) {
  requireDatabase();
  return saveArrivalSignal({
    actor: input.actor,
    role: "player",
    target: await playerArrivalTarget({
      personId: input.actor.personId,
      registrationId: input.registrationId,
    }),
    location: { latitude: input.latitude, longitude: input.longitude },
    accuracyMeters: input.accuracyMeters,
    consentedAt: input.consentedAt,
    now: input.now,
  });
}

export async function publishCoachArrivalSignal(input: {
  readonly actor: ApiActor;
  readonly sessionId: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyMeters?: number;
  readonly consentedAt: Date;
  readonly now: Date;
}) {
  requireDatabase();
  if (!input.actor.organizationId) {
    throw new ArrivalSignalError(
      "SESSION_NOT_FOUND",
      "Choose an organization before sharing an arrival.",
    );
  }
  return saveArrivalSignal({
    actor: input.actor,
    role: "coach",
    target: await coachArrivalTarget({
      organizationId: input.actor.organizationId,
      sessionId: input.sessionId,
    }),
    location: { latitude: input.latitude, longitude: input.longitude },
    accuracyMeters: input.accuracyMeters,
    consentedAt: input.consentedAt,
    now: input.now,
  });
}

export async function stopArrivalSharing(input: {
  readonly actor: ApiActor;
  readonly sessionId: string;
}) {
  requireDatabase();
  const removed = await getDatabase()
    .delete(sessionArrivalSignals)
    .where(
      and(
        eq(sessionArrivalSignals.sessionId, input.sessionId),
        eq(sessionArrivalSignals.personId, input.actor.personId),
      ),
    )
    .returning({
      id: sessionArrivalSignals.id,
      registrationId: sessionArrivalSignals.registrationId,
      role: sessionArrivalSignals.role,
    });
  return {
    stopped: removed.length > 0,
    registrationId: removed[0]?.registrationId ?? undefined,
    role:
      removed[0]?.role === "coach" ? ("coach" as const) : ("player" as const),
  };
}

export async function loadSessionArrivalBoard(input: {
  readonly organizationId: string;
  readonly sessionId: string;
  readonly now: Date;
}): Promise<SessionArrivalBoard> {
  requireDatabase();
  const sessionRows = await getDatabase()
    .select({
      sessionId: sessions.id,
      startsAt: sessions.startsAt,
      venueName: venues.name,
    })
    .from(sessions)
    .innerJoin(programs, eq(sessions.programId, programs.id))
    .leftJoin(venues, eq(sessions.venueId, venues.id))
    .where(
      and(
        eq(sessions.id, input.sessionId),
        eq(programs.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  const session = sessionRows[0];
  if (!session) {
    throw new ArrivalSignalError(
      "SESSION_NOT_FOUND",
      "This session is not available to the current organization.",
    );
  }
  const [rows, registrationRows] = await Promise.all([
    getDatabase()
      .select({ signal: sessionArrivalSignals, person: people })
      .from(sessionArrivalSignals)
      .innerJoin(people, eq(sessionArrivalSignals.personId, people.id))
      .where(
        and(
          eq(sessionArrivalSignals.sessionId, input.sessionId),
          gt(sessionArrivalSignals.expiresAt, input.now),
        ),
      )
      .orderBy(asc(sessionArrivalSignals.travelDurationSeconds)),
    getDatabase()
      .select({ id: registrations.id, status: registrations.status })
      .from(registrations)
      .where(eq(registrations.sessionId, input.sessionId)),
  ]);
  return {
    sessionId: session.sessionId,
    venueName: session.venueName ?? undefined,
    startsAt: session.startsAt.toISOString(),
    expectedPlayers: registrationRows.filter(
      (registration) =>
        registration.status !== "cancelled" &&
        registration.status !== "refunded",
    ).length,
    sharingWindow: arrivalSharingWindow(session.startsAt, input.now),
    signals: rows.map(({ person, signal }) => ({
      sessionId: signal.sessionId,
      personId: signal.personId,
      displayName: person.displayName,
      avatarUrl: person.avatarUrl ?? undefined,
      role: signal.role === "coach" ? "coach" : "player",
      status:
        signal.status === "arrived" ||
        signal.status === "running-late" ||
        signal.status === "leave-now"
          ? signal.status
          : "on-time",
      distanceMeters: signal.distanceMeters,
      travelDurationSeconds: signal.travelDurationSeconds,
      leaveBy: signal.leaveBy.toISOString(),
      routeSource:
        signal.routeSource === "google-routes"
          ? "google-routes"
          : "distance-estimate",
      accuracyMeters: signal.accuracyMeters ?? undefined,
      observedAt: signal.observedAt.toISOString(),
      expiresAt: signal.expiresAt.toISOString(),
    })),
  };
}

export function publicArrivalSignal(
  signal: Awaited<ReturnType<typeof publishPlayerArrivalSignal>>,
  displayName: string,
  avatarUrl?: string,
): SessionArrivalSignal {
  return {
    sessionId: signal.sessionId,
    personId: signal.personId,
    displayName,
    avatarUrl,
    role: signal.role,
    status: signal.status,
    distanceMeters: signal.distanceMeters,
    travelDurationSeconds: signal.travelDurationSeconds,
    leaveBy: signal.leaveBy.toISOString(),
    routeSource: signal.routeSource,
    accuracyMeters: signal.accuracyMeters,
    observedAt: signal.observedAt.toISOString(),
    expiresAt: signal.expiresAt.toISOString(),
  };
}
