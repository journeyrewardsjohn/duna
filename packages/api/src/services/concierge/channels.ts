/**
 * A person's Concierge channels (B7): connected, VERIFIED destinations and
 * the preferred channel per kind of message. Defaults never assume consent:
 * everyone is on `duna` (in-app and push) until they connect a destination
 * and prove it with a six-digit code sent through that very channel.
 *
 * - Connecting never contacts a provider while the channel is switched off
 *   or has no production values; the result says which.
 * - Juniors never connect outside channels: their guardian is contacted.
 * - Destinations are stored for delivery only and returned masked.
 * - Codes are stored as a hash, expire after 10 minutes, allow 5 attempts,
 *   and at most 5 codes per person per hour.
 */
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import {
  auditLog,
  conciergeChannelVerifications,
  conciergeOrganizationMutes,
  getDatabase,
  getTransactionalDatabase,
  personChannelEndpoints,
  personChannelPreferences,
} from "@duna/db";
import { log } from "@duna/observability";
import { and, desc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import type { ApiActor } from "../../context";
import { conciergeAdapters } from "./adapters";
import { loadChannelAvailability } from "./availability";
import { isValidTimeZone } from "./channel-choice";
import {
  ConciergeError,
  OUTSIDE_CHANNELS,
  type ConciergeChannel,
  type ConciergeOutsideChannel,
} from "./types";

const CODE_TTL_MS = 10 * 60_000;
const CODE_ATTEMPTS = 5;
const CODES_PER_HOUR = 5;

type EndpointRow = typeof personChannelEndpoints.$inferSelect;

export function maskDestination(
  channel: ConciergeChannel,
  destination: string | null,
): string | undefined {
  if (!destination) return undefined;
  if (channel === "email") {
    const [local, domain] = destination.split("@");
    return `${(local ?? "").slice(0, 1)}••••@${domain ?? ""}`.slice(0, 64);
  }
  return `••• ${destination.slice(-4)}`;
}

function endpointOutput(row: EndpointRow) {
  const hint = maskDestination(
    row.channel as ConciergeChannel,
    row.destination,
  );
  return {
    endpointId: row.id,
    channel: row.channel as ConciergeChannel,
    ...(hint ? { destinationHint: hint } : {}),
    status: row.status as "pending-verification" | "connected" | "revoked",
    ...(row.verifiedAt ? { verifiedAt: row.verifiedAt.toISOString() } : {}),
  };
}

function codeHash(endpointId: string, code: string): string {
  return createHash("sha256").update(`${endpointId}:${code}`).digest("hex");
}

function requireAdult(actor: ApiActor) {
  if (actor.ageBand !== "adult") {
    throw new ConciergeError(
      "FORBIDDEN",
      "A parent or guardian is contacted for juniors. Juniors read their messages in Duna.",
    );
  }
}

export async function loadConciergeChannels(actor: ApiActor) {
  const database = getDatabase();
  const [preference, endpoints, availability] = await Promise.all([
    database.query.personChannelPreferences.findFirst({
      where: eq(personChannelPreferences.personId, actor.personId),
    }),
    database
      .select()
      .from(personChannelEndpoints)
      .where(eq(personChannelEndpoints.personId, actor.personId))
      .orderBy(desc(personChannelEndpoints.createdAt))
      .limit(40),
    loadChannelAvailability({ organizationId: actor.organizationId }),
  ]);
  // The newest endpoint per channel (an active one wins over revoked history).
  const latest = new Map<string, EndpointRow>();
  for (const row of endpoints) {
    const current = latest.get(row.channel);
    if (!current || (current.status === "revoked" && row.status !== "revoked"))
      latest.set(row.channel, row);
  }
  return {
    preferredChannel: (preference?.preferredChannel ??
      "duna") as ConciergeChannel,
    ...(preference?.operationalChannel
      ? {
          operationalChannel: preference.operationalChannel as ConciergeChannel,
        }
      : {}),
    ...(preference?.quietHoursStart &&
    preference.quietHoursEnd &&
    preference.timezone
      ? {
          quietHours: {
            start: preference.quietHoursStart.slice(0, 5),
            end: preference.quietHoursEnd.slice(0, 5),
            timezone: preference.timezone,
          },
        }
      : {}),
    availability: (["duna", ...OUTSIDE_CHANNELS] as const).map((channel) => ({
      channel,
      availability: availability[channel],
    })),
    endpoints: [...latest.values()].map(endpointOutput),
  };
}

async function sendCode(
  channel: ConciergeOutsideChannel,
  destination: string,
  code: string,
  idempotencyKey: string,
) {
  const text = `Your Duna code is ${code}. It expires in 10 minutes. If you did not ask for it, ignore this message.`;
  return conciergeAdapters[channel].send({
    to: destination,
    subject: "Your Duna code",
    text,
    idempotencyKey,
    template: "verification",
    templateParameters: { code },
  });
}

/** Start connecting a destination: a pending endpoint and a code sent through it. */
export async function connectConciergeChannel(input: {
  readonly actor: ApiActor;
  readonly channel: ConciergeOutsideChannel;
  readonly destination: string;
  readonly now: Date;
}) {
  requireAdult(input.actor);
  const availability = (
    await loadChannelAvailability({
      organizationId: input.actor.organizationId,
    })
  )[input.channel];
  if (availability !== "available") return { availability };
  const destination =
    input.channel === "email"
      ? input.destination.trim().toLowerCase()
      : input.destination.trim();
  const database = getDatabase();
  const [recent] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(conciergeChannelVerifications)
    .where(
      and(
        eq(conciergeChannelVerifications.personId, input.actor.personId),
        gt(
          conciergeChannelVerifications.createdAt,
          new Date(input.now.getTime() - 60 * 60_000),
        ),
      ),
    );
  if ((recent?.count ?? 0) >= CODES_PER_HOUR) {
    throw new ConciergeError(
      "TOO_MANY_REQUESTS",
      "Too many codes this hour. Try again later.",
    );
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const endpoint = await getTransactionalDatabase().transaction(
    async (transaction) => {
      const [active] = await transaction
        .select()
        .from(personChannelEndpoints)
        .where(
          and(
            eq(personChannelEndpoints.personId, input.actor.personId),
            eq(personChannelEndpoints.channel, input.channel),
            ne(personChannelEndpoints.status, "revoked"),
          ),
        )
        .for("update");
      let row = active;
      if (active && active.destination !== destination) {
        await transaction
          .update(personChannelEndpoints)
          .set({
            status: "revoked",
            revokedAt: input.now,
            revokedReason: "replaced",
            updatedAt: input.now,
          })
          .where(eq(personChannelEndpoints.id, active.id));
        row = undefined;
      }
      if (!row) {
        [row] = await transaction
          .insert(personChannelEndpoints)
          .values({
            personId: input.actor.personId,
            channel: input.channel,
            destination,
            status: "pending-verification",
            createdAt: input.now,
            updatedAt: input.now,
          })
          .returning();
      }
      if (row!.status === "connected") return row!;
      await transaction
        .update(conciergeChannelVerifications)
        .set({ consumedAt: input.now })
        .where(
          and(
            eq(conciergeChannelVerifications.endpointId, row!.id),
            isNull(conciergeChannelVerifications.consumedAt),
          ),
        );
      await transaction.insert(conciergeChannelVerifications).values({
        endpointId: row!.id,
        personId: input.actor.personId,
        codeHash: codeHash(row!.id, code),
        expiresAt: new Date(input.now.getTime() + CODE_TTL_MS),
        createdAt: input.now,
      });
      return row!;
    },
  );
  if (endpoint.status === "connected") {
    return { availability, endpoint: endpointOutput(endpoint) };
  }
  const result = await sendCode(
    input.channel,
    destination,
    code,
    `concierge-verify-${endpoint.id}-${input.now.getTime()}`,
  );
  log.info("concierge.channel.code_sent", {
    channel: input.channel,
    endpointId: endpoint.id,
    outcome: result.kind,
  });
  if (result.kind === "not-configured") {
    return { availability: "provider-not-configured" as const };
  }
  if (result.kind !== "sent") {
    throw new ConciergeError(
      result.kind === "rejected" ? "BAD_REQUEST" : "PRECONDITION_FAILED",
      result.kind === "rejected"
        ? "That destination could not receive a code. Check it and try again."
        : "The code could not be sent right now. Try again in a minute.",
    );
  }
  return { availability, endpoint: endpointOutput(endpoint) };
}

export async function verifyConciergeChannel(input: {
  readonly actor: ApiActor;
  readonly endpointId: string;
  readonly code: string;
  readonly now: Date;
}) {
  const database = getDatabase();
  const endpoint = await database.query.personChannelEndpoints.findFirst({
    where: and(
      eq(personChannelEndpoints.id, input.endpointId),
      eq(personChannelEndpoints.personId, input.actor.personId),
    ),
  });
  if (!endpoint) throw new ConciergeError("NOT_FOUND", "Channel not found.");
  if (endpoint.status === "connected") return endpointOutput(endpoint);
  if (endpoint.status !== "pending-verification")
    throw new ConciergeError("CONFLICT", "Connect this channel again.");
  const [verification] = await database
    .select()
    .from(conciergeChannelVerifications)
    .where(
      and(
        eq(conciergeChannelVerifications.endpointId, endpoint.id),
        isNull(conciergeChannelVerifications.consumedAt),
        gt(conciergeChannelVerifications.expiresAt, input.now),
      ),
    )
    .orderBy(desc(conciergeChannelVerifications.createdAt))
    .limit(1);
  if (!verification || verification.attempts >= CODE_ATTEMPTS) {
    throw new ConciergeError(
      "PRECONDITION_FAILED",
      "This code expired. Ask for a new one.",
    );
  }
  const expected = Buffer.from(verification.codeHash);
  const given = Buffer.from(codeHash(endpoint.id, input.code));
  if (!timingSafeEqual(expected, given)) {
    await database
      .update(conciergeChannelVerifications)
      .set({ attempts: sql`${conciergeChannelVerifications.attempts} + 1` })
      .where(eq(conciergeChannelVerifications.id, verification.id));
    throw new ConciergeError("BAD_REQUEST", "That code is not right.");
  }
  const updated = await getTransactionalDatabase().transaction(
    async (transaction) => {
      await transaction
        .update(conciergeChannelVerifications)
        .set({ consumedAt: input.now })
        .where(eq(conciergeChannelVerifications.id, verification.id));
      const [row] = await transaction
        .update(personChannelEndpoints)
        .set({
          status: "connected",
          verifiedAt: input.now,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(personChannelEndpoints.id, endpoint.id),
            eq(personChannelEndpoints.status, "pending-verification"),
          ),
        )
        .returning();
      await transaction.insert(auditLog).values({
        actorPersonId: input.actor.personId,
        actorType: "user",
        action: "concierge.channel_verified",
        entityType: "person_channel_endpoint",
        entityId: endpoint.id,
        reason: `The person proved they receive ${endpoint.channel} messages at this destination.`,
        createdAt: input.now,
      });
      return row ?? endpoint;
    },
  );
  return endpointOutput(updated);
}

/** Revoke an endpoint (by the person, or by an opt-out keyword). */
export async function revokeConciergeEndpoint(input: {
  readonly personId: string;
  readonly endpointId: string;
  readonly reason: "person" | "opt-out";
  readonly now: Date;
}) {
  return getTransactionalDatabase().transaction(async (transaction) => {
    const [row] = await transaction
      .update(personChannelEndpoints)
      .set({
        status: "revoked",
        revokedAt: input.now,
        revokedReason: input.reason,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(personChannelEndpoints.id, input.endpointId),
          eq(personChannelEndpoints.personId, input.personId),
        ),
      )
      .returning();
    if (!row) throw new ConciergeError("NOT_FOUND", "Channel not found.");
    if (input.reason === "person") {
      // Turning a channel off by hand returns the person to in-app; an
      // opt-out keeps the preference so the review shows "no consent".
      await transaction
        .update(personChannelPreferences)
        .set({ preferredChannel: "duna", updatedAt: input.now })
        .where(
          and(
            eq(personChannelPreferences.personId, input.personId),
            eq(personChannelPreferences.preferredChannel, row.channel),
          ),
        );
      await transaction
        .update(personChannelPreferences)
        .set({ operationalChannel: null, updatedAt: input.now })
        .where(
          and(
            eq(personChannelPreferences.personId, input.personId),
            eq(personChannelPreferences.operationalChannel, row.channel),
          ),
        );
    }
    await transaction.insert(auditLog).values({
      actorPersonId: input.personId,
      actorType: input.reason === "opt-out" ? "system" : "user",
      action:
        input.reason === "opt-out"
          ? "concierge.channel_opted_out"
          : "concierge.channel_revoked",
      entityType: "person_channel_endpoint",
      entityId: row.id,
      reason:
        input.reason === "opt-out"
          ? `An opt-out keyword arrived on ${row.channel}; nothing more is sent there.`
          : `The person turned ${row.channel} off.`,
      createdAt: input.now,
    });
    return endpointOutput(row);
  });
}

/** Exactly one preferred channel (and one for operational notices), plus quiet hours. */
export async function setConciergePreference(input: {
  readonly actor: ApiActor;
  readonly preferredChannel: ConciergeChannel;
  readonly operationalChannel?: ConciergeChannel | null;
  readonly quietHours?: {
    readonly start: string;
    readonly end: string;
    readonly timezone: string;
  } | null;
  readonly now: Date;
}) {
  const wanted = [
    input.preferredChannel,
    ...(input.operationalChannel ? [input.operationalChannel] : []),
  ].filter((channel) => channel !== "duna");
  if (wanted.length > 0) {
    requireAdult(input.actor);
    const connected = await getDatabase()
      .select({ channel: personChannelEndpoints.channel })
      .from(personChannelEndpoints)
      .where(
        and(
          eq(personChannelEndpoints.personId, input.actor.personId),
          eq(personChannelEndpoints.status, "connected"),
          inArray(personChannelEndpoints.channel, wanted),
        ),
      );
    const have = new Set(connected.map((row) => row.channel));
    if (wanted.some((channel) => !have.has(channel))) {
      throw new ConciergeError(
        "PRECONDITION_FAILED",
        "Connect and verify that channel first.",
      );
    }
  }
  if (input.quietHours && !isValidTimeZone(input.quietHours.timezone)) {
    throw new ConciergeError("BAD_REQUEST", "Choose a valid time zone.");
  }
  const quiet =
    input.quietHours === undefined
      ? {}
      : input.quietHours === null
        ? { quietHoursStart: null, quietHoursEnd: null }
        : {
            quietHoursStart: input.quietHours.start,
            quietHoursEnd: input.quietHours.end,
            timezone: input.quietHours.timezone,
          };
  const operational =
    input.operationalChannel === undefined
      ? {}
      : { operationalChannel: input.operationalChannel };
  await getDatabase()
    .insert(personChannelPreferences)
    .values({
      personId: input.actor.personId,
      preferredChannel: input.preferredChannel,
      ...operational,
      ...quiet,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: personChannelPreferences.personId,
      set: {
        preferredChannel: input.preferredChannel,
        ...operational,
        ...quiet,
        updatedAt: input.now,
      },
    });
  return loadConciergeChannels(input.actor);
}

/** Mute (or unmute) a club's messages on outside channels; in-app stays. */
export async function setConciergeClubMute(input: {
  readonly personId: string;
  readonly organizationId: string;
  readonly muted: boolean;
  readonly now: Date;
}) {
  const database = getDatabase();
  if (input.muted) {
    await database
      .insert(conciergeOrganizationMutes)
      .values({
        personId: input.personId,
        organizationId: input.organizationId,
        createdAt: input.now,
      })
      .onConflictDoNothing();
  } else {
    await database
      .delete(conciergeOrganizationMutes)
      .where(
        and(
          eq(conciergeOrganizationMutes.personId, input.personId),
          eq(conciergeOrganizationMutes.organizationId, input.organizationId),
        ),
      );
  }
  return { organizationId: input.organizationId, muted: input.muted };
}
