import {
  eventTypes,
  getDatabase,
  people,
  programs,
  registrations,
  sessions,
  tickets,
  ticketTypes,
  venues,
} from "@duna/db";
import {
  encodeAdmissionCredential,
  type AdmissionCredentialKind,
} from "@duna/core";
import { SignJWT, jwtVerify } from "jose";
import { and, eq, gte, inArray } from "drizzle-orm";

export type PlayerAdmissionPass = {
  readonly id: string;
  readonly sessionId: string;
  readonly kind: AdmissionCredentialKind;
  readonly eventTitle: string;
  readonly holderName: string;
  readonly passLabel: string;
  readonly credentialPayload: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timezone: string;
  readonly venueName: string;
  readonly venueAddress?: string;
  readonly status:
    "confirmed" | "checked-in" | "issued" | "transferred" | "scanned";
  readonly usable: boolean;
  readonly walletStatus: "available" | "configuration-required";
  readonly walletPassPath?: string;
};

export type TournamentAdmissionPassRecord = Omit<
  PlayerAdmissionPass,
  "walletStatus" | "walletPassPath"
> & {
  readonly ownerPersonId: string;
};

const walletIssuer = "duna.coach";
const walletAudience = "duna-wallet-pass";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function walletDownloadSecret(): Uint8Array | undefined {
  const value = process.env.DUNA_WALLET_DOWNLOAD_SECRET?.trim();
  return value && value.length >= 32
    ? new TextEncoder().encode(value)
    : undefined;
}

function walletSigningConfigured(): boolean {
  return Boolean(
    walletDownloadSecret() &&
    process.env.APPLE_WALLET_PASS_TYPE_ID?.trim() &&
    process.env.APPLE_WALLET_TEAM_ID?.trim() &&
    process.env.APPLE_WALLET_WWDR_CERT_BASE64?.trim() &&
    process.env.APPLE_WALLET_SIGNER_CERT_BASE64?.trim() &&
    process.env.APPLE_WALLET_SIGNER_KEY_BASE64?.trim(),
  );
}

async function createWalletPassPath(input: {
  readonly kind: AdmissionCredentialKind;
  readonly passId: string;
  readonly personId: string;
}): Promise<string | undefined> {
  const secret = walletDownloadSecret();
  if (!secret || !walletSigningConfigured()) return undefined;
  const token = await new SignJWT({
    kind: input.kind,
    passId: input.passId,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(input.personId)
    .setIssuer(walletIssuer)
    .setAudience(walletAudience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);
  return `/api/wallet/passes/${token}`;
}

export async function verifyWalletPassDownloadToken(token: string): Promise<
  | {
      readonly kind: AdmissionCredentialKind;
      readonly passId: string;
      readonly personId: string;
    }
  | undefined
> {
  const secret = walletDownloadSecret();
  if (!secret) return undefined;
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: walletIssuer,
      audience: walletAudience,
      algorithms: ["HS256"],
    });
    if (
      (payload.kind !== "player-registration" &&
        payload.kind !== "fan-ticket") ||
      typeof payload.passId !== "string" ||
      !uuidPattern.test(payload.passId) ||
      typeof payload.sub !== "string" ||
      !uuidPattern.test(payload.sub)
    ) {
      return undefined;
    }
    return {
      kind: payload.kind,
      passId: payload.passId,
      personId: payload.sub,
    };
  } catch {
    return undefined;
  }
}

function venueAddress(input: {
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly locality: string | null;
  readonly administrativeArea: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string | null;
}): string | undefined {
  const locality = [input.locality, input.administrativeArea, input.postalCode]
    .filter(Boolean)
    .join(", ");
  const value = [
    input.addressLine1,
    input.addressLine2,
    locality,
    input.countryCode,
  ]
    .filter(Boolean)
    .join(", ");
  return value || undefined;
}

function isTournament(input: {
  readonly programKind: string | null;
  readonly eventTypeKind: string | null;
}): boolean {
  return (input.programKind ?? input.eventTypeKind) === "tournament";
}

type RegistrationPassRow = {
  readonly id: string;
  readonly sessionId: string;
  readonly ownerPersonId: string;
  readonly eventTitle: string;
  readonly holderName: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly timezone: string;
  readonly venueName: string | null;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly locality: string | null;
  readonly administrativeArea: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string | null;
  readonly programKind: string | null;
  readonly eventTypeKind: string | null;
  readonly status: "confirmed" | "checked-in";
};

type TicketPassRow = Omit<RegistrationPassRow, "status"> & {
  readonly token: string;
  readonly ticketName: string;
  readonly status: "issued" | "transferred" | "scanned";
};

function registrationRecord(
  row: RegistrationPassRow,
): TournamentAdmissionPassRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    ownerPersonId: row.ownerPersonId,
    kind: "player-registration",
    eventTitle: row.eventTitle,
    holderName: row.holderName,
    passLabel: row.status === "checked-in" ? "Checked in" : "Player check-in",
    credentialPayload: encodeAdmissionCredential({
      kind: "player-registration",
      token: row.id,
    }),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    timezone: row.timezone,
    venueName: row.venueName ?? "Venue to be announced",
    venueAddress: venueAddress(row),
    status: row.status,
    usable: row.status === "confirmed",
  };
}

function ticketRecord(row: TicketPassRow): TournamentAdmissionPassRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    ownerPersonId: row.ownerPersonId,
    kind: "fan-ticket",
    eventTitle: row.eventTitle,
    holderName: row.holderName,
    passLabel: row.ticketName,
    credentialPayload: encodeAdmissionCredential({
      kind: "fan-ticket",
      token: row.token,
    }),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    timezone: row.timezone,
    venueName: row.venueName ?? "Venue to be announced",
    venueAddress: venueAddress(row),
    status: row.status,
    usable: row.status === "issued" || row.status === "transferred",
  };
}

async function registrationPassRows(input: {
  readonly personId?: string;
  readonly registrationId?: string;
  readonly now?: Date;
}): Promise<readonly RegistrationPassRow[]> {
  return getDatabase()
    .select({
      id: registrations.id,
      sessionId: sessions.id,
      ownerPersonId: registrations.personId,
      eventTitle: sessions.title,
      holderName: people.displayName,
      startsAt: sessions.startsAt,
      endsAt: sessions.endsAt,
      timezone: sessions.timezone,
      venueName: venues.name,
      addressLine1: venues.addressLine1,
      addressLine2: venues.addressLine2,
      locality: venues.locality,
      administrativeArea: venues.administrativeArea,
      postalCode: venues.postalCode,
      countryCode: venues.countryCode,
      programKind: programs.kind,
      eventTypeKind: eventTypes.kind,
      status: registrations.status,
    })
    .from(registrations)
    .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
    .innerJoin(people, eq(registrations.personId, people.id))
    .leftJoin(programs, eq(sessions.programId, programs.id))
    .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
    .leftJoin(venues, eq(sessions.venueId, venues.id))
    .where(
      and(
        input.personId ? eq(registrations.personId, input.personId) : undefined,
        input.registrationId
          ? eq(registrations.id, input.registrationId)
          : undefined,
        inArray(registrations.status, ["confirmed", "checked-in"]),
        input.now ? gte(sessions.endsAt, input.now) : undefined,
      ),
    ) as Promise<readonly RegistrationPassRow[]>;
}

async function ticketPassRows(input: {
  readonly personId?: string;
  readonly ticketId?: string;
  readonly now?: Date;
}): Promise<readonly TicketPassRow[]> {
  return getDatabase()
    .select({
      id: tickets.id,
      sessionId: sessions.id,
      ownerPersonId: tickets.ownerPersonId,
      eventTitle: sessions.title,
      holderName: people.displayName,
      startsAt: sessions.startsAt,
      endsAt: sessions.endsAt,
      timezone: sessions.timezone,
      venueName: venues.name,
      addressLine1: venues.addressLine1,
      addressLine2: venues.addressLine2,
      locality: venues.locality,
      administrativeArea: venues.administrativeArea,
      postalCode: venues.postalCode,
      countryCode: venues.countryCode,
      programKind: programs.kind,
      eventTypeKind: eventTypes.kind,
      token: tickets.token,
      ticketName: ticketTypes.name,
      status: tickets.status,
    })
    .from(tickets)
    .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
    .innerJoin(sessions, eq(ticketTypes.sessionId, sessions.id))
    .innerJoin(people, eq(tickets.ownerPersonId, people.id))
    .leftJoin(programs, eq(sessions.programId, programs.id))
    .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
    .leftJoin(venues, eq(sessions.venueId, venues.id))
    .where(
      and(
        input.personId ? eq(tickets.ownerPersonId, input.personId) : undefined,
        input.ticketId ? eq(tickets.id, input.ticketId) : undefined,
        inArray(tickets.status, ["issued", "transferred", "scanned"]),
        input.now ? gte(sessions.endsAt, input.now) : undefined,
      ),
    ) as Promise<readonly TicketPassRow[]>;
}

export async function loadPlayerAdmissionPasses(input: {
  readonly personId: string;
  readonly now: Date;
}): Promise<readonly PlayerAdmissionPass[]> {
  if (!process.env.DATABASE_URL) return [];
  const [registrationsForPlayer, ticketsForPlayer] = await Promise.all([
    registrationPassRows({ personId: input.personId, now: input.now }),
    ticketPassRows({ personId: input.personId, now: input.now }),
  ]);
  const records = [
    ...registrationsForPlayer.filter(isTournament).map(registrationRecord),
    ...ticketsForPlayer.filter(isTournament).map(ticketRecord),
  ].sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  const configured = walletSigningConfigured();
  return Promise.all(
    records.map(async ({ ownerPersonId, ...record }) => {
      if (ownerPersonId !== input.personId) {
        throw new Error("Admission pass ownership could not be verified.");
      }
      const walletPassPath = configured
        ? await createWalletPassPath({
            kind: record.kind,
            passId: record.id,
            personId: input.personId,
          })
        : undefined;
      return {
        ...record,
        walletStatus: walletPassPath ? "available" : "configuration-required",
        walletPassPath,
      };
    }),
  );
}

export async function loadTournamentAdmissionPassById(input: {
  readonly kind: AdmissionCredentialKind;
  readonly passId: string;
  readonly personId: string;
}): Promise<TournamentAdmissionPassRecord | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const rows =
    input.kind === "player-registration"
      ? await registrationPassRows({ registrationId: input.passId })
      : await ticketPassRows({ ticketId: input.passId });
  const row = rows[0];
  if (!row || row.ownerPersonId !== input.personId || !isTournament(row)) {
    return undefined;
  }
  return input.kind === "player-registration"
    ? registrationRecord(row as RegistrationPassRow)
    : ticketRecord(row as TicketPassRow);
}
