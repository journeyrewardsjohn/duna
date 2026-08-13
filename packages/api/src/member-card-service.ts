import {
  courtBookingParticipants,
  courtBookings,
  getDatabase,
  people,
  pickupParticipants,
  pickupSessions,
  registrations,
  sessions,
  venues,
} from "@duna/db";
import { encodeDunaMemberCredential } from "@duna/core";
import { SignJWT, jwtVerify } from "jose";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import type { ApiActor } from "./context";

export type PlayerMemberCard = {
  readonly memberId: string;
  readonly holderName: string;
  readonly credentialPayload: string;
  readonly walletStatus: "available" | "configuration-required";
  readonly walletPassPath?: string;
  readonly upcoming: readonly {
    readonly id: string;
    readonly kind: "event" | "match" | "court-reservation";
    readonly title: string;
    readonly startsAt: string;
    readonly venueName: string;
  }[];
};

export type MemberWalletPassRecord = PlayerMemberCard & {
  readonly personId: string;
};

const walletIssuer = "duna.coach";
const walletAudience = "duna-member-wallet-pass";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function walletDownloadSecret(): Uint8Array | undefined {
  const value = process.env.DUNA_WALLET_DOWNLOAD_SECRET?.trim();
  return value && value.length >= 32
    ? new TextEncoder().encode(value)
    : undefined;
}

function memberWalletSigningConfigured(): boolean {
  return Boolean(
    walletDownloadSecret() &&
    (process.env.APPLE_WALLET_MEMBER_PASS_TYPE_ID?.trim() ||
      process.env.APPLE_WALLET_PASS_TYPE_ID?.trim()) &&
    process.env.APPLE_WALLET_TEAM_ID?.trim() &&
    process.env.APPLE_WALLET_WWDR_CERT_BASE64?.trim() &&
    (process.env.APPLE_WALLET_MEMBER_SIGNER_CERT_BASE64?.trim() ||
      process.env.APPLE_WALLET_SIGNER_CERT_BASE64?.trim()) &&
    (process.env.APPLE_WALLET_MEMBER_SIGNER_KEY_BASE64?.trim() ||
      process.env.APPLE_WALLET_SIGNER_KEY_BASE64?.trim()),
  );
}

async function memberWalletPassPath(personId: string) {
  const secret = walletDownloadSecret();
  if (!secret || !memberWalletSigningConfigured()) return undefined;
  const token = await new SignJWT({ kind: "member-card" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(personId)
    .setIssuer(walletIssuer)
    .setAudience(walletAudience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);
  return `/api/wallet/members/${token}`;
}

export async function verifyMemberWalletDownloadToken(
  token: string,
): Promise<{ readonly personId: string } | undefined> {
  const secret = walletDownloadSecret();
  if (!secret) return undefined;
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: walletIssuer,
      audience: walletAudience,
      algorithms: ["HS256"],
    });
    if (
      payload.kind !== "member-card" ||
      typeof payload.sub !== "string" ||
      !uuidPattern.test(payload.sub)
    ) {
      return undefined;
    }
    return { personId: payload.sub };
  } catch {
    return undefined;
  }
}

async function upcomingActivities(personId: string, now: Date) {
  const database = getDatabase();
  const [eventRows, bookingRows, pickupRows] = await Promise.all([
    database
      .select({
        id: sessions.id,
        title: sessions.title,
        startsAt: sessions.startsAt,
        venueName: venues.name,
      })
      .from(registrations)
      .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
      .leftJoin(venues, eq(sessions.venueId, venues.id))
      .where(
        and(
          eq(registrations.personId, personId),
          inArray(registrations.status, ["confirmed", "checked-in"]),
          gte(sessions.endsAt, now),
        ),
      )
      .orderBy(asc(sessions.startsAt)),
    database
      .select({
        id: courtBookings.id,
        startsAt: courtBookings.startsAt,
        venueName: venues.name,
      })
      .from(courtBookingParticipants)
      .innerJoin(
        courtBookings,
        eq(courtBookingParticipants.bookingId, courtBookings.id),
      )
      .innerJoin(venues, eq(courtBookings.venueId, venues.id))
      .where(
        and(
          eq(courtBookingParticipants.personId, personId),
          inArray(courtBookingParticipants.status, [
            "organizer",
            "accepted",
            "paid",
          ]),
          eq(courtBookings.status, "confirmed"),
          gte(courtBookings.endsAt, now),
        ),
      )
      .orderBy(asc(courtBookings.startsAt)),
    database
      .select({
        id: pickupSessions.id,
        courtBookingId: pickupSessions.courtBookingId,
        title: pickupSessions.title,
        startsAt: pickupSessions.startsAt,
        venueName: pickupSessions.venueLabel,
      })
      .from(pickupParticipants)
      .innerJoin(
        pickupSessions,
        eq(pickupParticipants.pickupSessionId, pickupSessions.id),
      )
      .where(
        and(
          eq(pickupParticipants.personId, personId),
          inArray(pickupParticipants.status, ["confirmed", "checked-in"]),
          eq(pickupSessions.status, "active"),
          gte(pickupSessions.endsAt, now),
        ),
      )
      .orderBy(asc(pickupSessions.startsAt)),
  ]);
  const linkedBookingIds = new Set(
    pickupRows.flatMap((row) =>
      row.courtBookingId ? [row.courtBookingId] : [],
    ),
  );
  return [
    ...eventRows.map((row) => ({
      id: row.id,
      kind: "event" as const,
      title: row.title,
      startsAt: row.startsAt.toISOString(),
      venueName: row.venueName ?? "Location pending",
    })),
    ...bookingRows
      .filter((row) => !linkedBookingIds.has(row.id))
      .map((row) => ({
        id: row.id,
        kind: "court-reservation" as const,
        title: "Court reservation",
        startsAt: row.startsAt.toISOString(),
        venueName: row.venueName,
      })),
    ...pickupRows.map((row) => ({
      id: row.id,
      kind: "match" as const,
      title: row.title,
      startsAt: row.startsAt.toISOString(),
      venueName: row.venueName,
    })),
  ]
    .sort(
      (left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt),
    )
    .slice(0, 4);
}

export async function loadMemberWalletPassRecord(input: {
  readonly personId: string;
  readonly now?: Date;
}): Promise<MemberWalletPassRecord | undefined> {
  const database = getDatabase();
  const person = await database.query.people.findFirst({
    where: and(eq(people.id, input.personId), eq(people.status, "active")),
  });
  if (!person) return undefined;
  const now = input.now ?? new Date();
  const upcoming = await upcomingActivities(person.id, now);
  const walletPassPath = await memberWalletPassPath(person.id);
  return {
    personId: person.id,
    memberId: person.dunaMemberId,
    holderName: person.displayName,
    credentialPayload: encodeDunaMemberCredential(person.membershipQrToken),
    walletStatus: walletPassPath ? "available" : "configuration-required",
    walletPassPath,
    upcoming,
  };
}

export async function loadPlayerMemberCard(input: {
  readonly actor: ApiActor;
  readonly now: Date;
}): Promise<PlayerMemberCard> {
  const card = await loadMemberWalletPassRecord({
    personId: input.actor.personId,
    now: input.now,
  });
  if (!card)
    throw new Error("Duna Membership is not available for this account.");
  return {
    memberId: card.memberId,
    holderName: card.holderName,
    credentialPayload: card.credentialPayload,
    walletStatus: card.walletStatus,
    walletPassPath: card.walletPassPath,
    upcoming: card.upcoming,
  };
}
