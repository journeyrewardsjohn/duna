/**
 * Who a Concierge send reaches (B7), resolved on the server every time: the
 * thread's audience right now, the verified guardians of every junior in it,
 * and for each person exactly one channel or one reason they cannot be
 * reached. Read-only. A fixed number of queries whatever the roster size
 * (no per-person query).
 *
 * The audience of a context thread is the SAME resolver a club send uses to
 * sync the thread (`previewOrganizationContextAudience`), so the review and
 * the send cannot disagree; someone who cancelled is gone, someone who joined
 * is there. A thread without a club context (a direct thread) reaches its
 * current participants.
 */
import { createHash } from "node:crypto";
import {
  conciergeOrganizationMutes,
  getDatabase,
  guardianships,
  messagingBlocks,
  messagingConversationParticipants,
  messagingConversations,
  people,
  personChannelEndpoints,
  personChannelPreferences,
} from "@duna/db";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { verifiedGuardianMembership } from "../../messaging-guardian-access";
import { previewOrganizationContextAudience } from "../../messaging-service";
import type { ChannelAvailabilityMap } from "./availability";
import {
  chooseChannel,
  type ChannelChoice,
  type ConciergeMessageKind,
  type RecipientChannelFacts,
} from "./channel-choice";
import type { ConciergeChannel } from "./types";

type ConversationRow = typeof messagingConversations.$inferSelect;

export interface ResolvedRecipient {
  readonly personId: string;
  readonly displayName: string;
  readonly isMinor: boolean;
  readonly guardianOfPersonId?: string;
  readonly channel?: ConciergeChannel;
  readonly unreachableReason?: Exclude<ChannelChoice["reason"], undefined>;
  /** The connected endpoint frozen for an outside channel. */
  readonly endpointId?: string;
}

export const GUARDIAN_NOTE =
  "Guardians receive messages about the juniors they look after. Juniors see it in their Duna thread only.";

const ORGANIZATION_CONTEXTS = new Set([
  "organization",
  "event",
  "division",
  "league",
  "lesson",
  "rental",
]);

function chunks<T>(values: readonly T[], size = 1000): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size)
    result.push(values.slice(index, index + size));
  return result;
}

async function inChunks<T>(
  ids: readonly string[],
  load: (batch: string[]) => Promise<T[]>,
): Promise<T[]> {
  if (ids.length === 0) return [];
  const rows: T[] = [];
  for (const batch of chunks([...new Set(ids)])) rows.push(...(await load(batch)));
  return rows;
}

/** People the thread reaches now, before guardians, blocks and channels. */
export async function threadAudiencePersonIds(input: {
  readonly organizationId: string;
  readonly conversation: ConversationRow;
}): Promise<readonly string[]> {
  const { conversation } = input;
  if (
    conversation.contextType &&
    conversation.contextId &&
    conversation.organizationId === input.organizationId &&
    ORGANIZATION_CONTEXTS.has(conversation.contextType)
  ) {
    return previewOrganizationContextAudience({
      organizationId: input.organizationId,
      context: {
        type: conversation.contextType,
        id: conversation.contextId,
        label: conversation.contextLabel ?? conversation.title,
      },
    });
  }
  const rows = await getDatabase()
    .select({
      personId: messagingConversationParticipants.personId,
      role: messagingConversationParticipants.role,
    })
    .from(messagingConversationParticipants)
    .where(
      and(
        eq(messagingConversationParticipants.conversationId, conversation.id),
        eq(messagingConversationParticipants.principalType, "user"),
        isNull(messagingConversationParticipants.leftAt),
        verifiedGuardianMembership(),
      ),
    );
  return rows.flatMap((row) =>
    row.personId && row.role !== "guardian" ? [row.personId] : [],
  );
}

/**
 * Resolve every recipient with one channel or one reason. `requested` holds
 * channels the sender picked on the review; each is kept only while the same
 * rules would still deliver on it.
 */
export async function resolveRecipients(input: {
  readonly organizationId: string;
  readonly conversation: ConversationRow;
  readonly authorPersonId: string;
  readonly kind: ConciergeMessageKind;
  readonly availability: ChannelAvailabilityMap;
  readonly requested?: ReadonlyMap<string, ConciergeChannel>;
  readonly now: Date;
}): Promise<readonly ResolvedRecipient[]> {
  const database = getDatabase();
  const audienceIds = [
    ...new Set(
      await threadAudiencePersonIds({
        organizationId: input.organizationId,
        conversation: input.conversation,
      }),
    ),
  ].filter((personId) => personId !== input.authorPersonId);
  const audiencePeople = await inChunks(audienceIds, (batch) =>
    database
      .select({
        id: people.id,
        displayName: people.displayName,
        isMinor: people.isMinor,
        status: people.status,
        claim: people.profileClaimStatus,
      })
      .from(people)
      .where(inArray(people.id, batch)),
  );
  const minorIds = audiencePeople.filter((p) => p.isMinor).map((p) => p.id);
  const guardianRows = await inChunks(minorIds, (batch) =>
    database
      .select({
        guardianId: guardianships.guardianId,
        minorId: guardianships.minorId,
        displayName: people.displayName,
        isMinor: people.isMinor,
        status: people.status,
        claim: people.profileClaimStatus,
      })
      .from(guardianships)
      .innerJoin(people, eq(people.id, guardianships.guardianId))
      .where(
        and(
          inArray(guardianships.minorId, batch),
          eq(guardianships.verified, true),
          eq(guardianships.reviewStatus, "verified"),
          eq(people.status, "active"),
          eq(people.isMinor, false),
        ),
      ),
  );
  const everyone = [
    ...new Set([
      ...audiencePeople.map((p) => p.id),
      ...guardianRows.map((g) => g.guardianId),
    ]),
  ].filter((personId) => personId !== input.authorPersonId);
  const [blocks, preferences, endpoints, clubMutes, threadMutes] =
    await Promise.all([
      inChunks(everyone, (batch) =>
        database
          .select({ personId: messagingBlocks.blockerPersonId })
          .from(messagingBlocks)
          .where(
            and(
              inArray(messagingBlocks.blockerPersonId, batch),
              eq(messagingBlocks.blockedPrincipalType, "organization"),
              eq(messagingBlocks.blockedPrincipalId, input.organizationId),
              isNull(messagingBlocks.revokedAt),
            ),
          ),
      ),
      inChunks(everyone, (batch) =>
        database
          .select()
          .from(personChannelPreferences)
          .where(inArray(personChannelPreferences.personId, batch)),
      ),
      inChunks(everyone, (batch) =>
        database
          .select({
            id: personChannelEndpoints.id,
            personId: personChannelEndpoints.personId,
            channel: personChannelEndpoints.channel,
            status: personChannelEndpoints.status,
            revokedReason: personChannelEndpoints.revokedReason,
          })
          .from(personChannelEndpoints)
          .where(inArray(personChannelEndpoints.personId, batch))
          .orderBy(desc(personChannelEndpoints.createdAt)),
      ),
      inChunks(everyone, (batch) =>
        database
          .select({ personId: conciergeOrganizationMutes.personId })
          .from(conciergeOrganizationMutes)
          .where(
            and(
              inArray(conciergeOrganizationMutes.personId, batch),
              eq(
                conciergeOrganizationMutes.organizationId,
                input.organizationId,
              ),
            ),
          ),
      ),
      database
        .select({ personId: messagingConversationParticipants.personId })
        .from(messagingConversationParticipants)
        .where(
          and(
            eq(
              messagingConversationParticipants.conversationId,
              input.conversation.id,
            ),
            eq(messagingConversationParticipants.principalType, "user"),
            eq(messagingConversationParticipants.notificationLevel, "muted"),
            isNull(messagingConversationParticipants.leftAt),
          ),
        ),
    ]);
  const blocked = new Set(blocks.map((row) => row.personId));
  const mutedClub = new Set(clubMutes.map((row) => row.personId));
  const mutedThread = new Set(
    threadMutes.flatMap((row) => (row.personId ? [row.personId] : [])),
  );
  const preferenceOf = new Map(preferences.map((row) => [row.personId, row]));
  const connected = new Map<string, Map<ConciergeChannel, string>>();
  const optedOut = new Map<string, Set<ConciergeChannel>>();
  const seenLatest = new Set<string>();
  for (const endpoint of endpoints) {
    const channel = endpoint.channel as ConciergeChannel;
    if (endpoint.status === "connected") {
      const map = connected.get(endpoint.personId) ?? new Map();
      map.set(channel, endpoint.id);
      connected.set(endpoint.personId, map);
    }
    // Endpoints are newest first: only the latest per channel decides opt-out.
    const latestKey = `${endpoint.personId}:${channel}`;
    if (seenLatest.has(latestKey)) continue;
    seenLatest.add(latestKey);
    if (endpoint.status === "revoked" && endpoint.revokedReason === "opt-out") {
      const set = optedOut.get(endpoint.personId) ?? new Set();
      set.add(channel);
      optedOut.set(endpoint.personId, set);
    }
  }
  const factsOf = (person: {
    id: string;
    isMinor: boolean;
    status: string;
    claim: string;
  }): RecipientChannelFacts => {
    const preference = preferenceOf.get(person.id);
    const quietHours =
      preference?.quietHoursStart &&
      preference.quietHoursEnd &&
      preference.timezone
        ? {
            start: preference.quietHoursStart,
            end: preference.quietHoursEnd,
            timezone: preference.timezone,
          }
        : undefined;
    return {
      isMinor: person.isMinor,
      hasAccount: person.status === "active" && person.claim === "claimed",
      blockedClub: blocked.has(person.id),
      mutedClub: mutedClub.has(person.id),
      mutedThread: mutedThread.has(person.id),
      preferredChannel: (preference?.preferredChannel ??
        "duna") as ConciergeChannel,
      operationalChannel:
        (preference?.operationalChannel as ConciergeChannel | null) ?? null,
      ...(quietHours ? { quietHours } : {}),
      connectedChannels: new Set(connected.get(person.id)?.keys() ?? []),
      optedOutChannels: optedOut.get(person.id) ?? new Set(),
    };
  };
  const decide = (person: {
    id: string;
    isMinor: boolean;
    status: string;
    claim: string;
  }) => {
    const facts = factsOf(person);
    const requested = input.requested?.get(person.id);
    const automatic = chooseChannel({
      facts,
      kind: input.kind,
      availability: (channel) => input.availability[channel],
      now: input.now,
    });
    if (requested && requested !== automatic.channel) {
      const manual = chooseChannel({
        facts,
        kind: input.kind,
        availability: (channel) => input.availability[channel],
        now: input.now,
        requested,
      });
      if (manual.channel === requested) return manual;
    }
    return automatic;
  };
  const guardiansByMinor = new Map<string, typeof guardianRows>();
  for (const row of guardianRows) {
    const list = guardiansByMinor.get(row.minorId) ?? [];
    list.push(row);
    guardiansByMinor.set(row.minorId, list);
  }
  const recipients = new Map<string, ResolvedRecipient>();
  const add = (
    person: {
      id: string;
      displayName: string;
      isMinor: boolean;
      status: string;
      claim: string;
    },
    guardianOfPersonId?: string,
    forced?: ChannelChoice,
  ) => {
    if (person.id === input.authorPersonId) return;
    const existing = recipients.get(person.id);
    if (existing) {
      if (guardianOfPersonId && !existing.guardianOfPersonId)
        recipients.set(person.id, { ...existing, guardianOfPersonId });
      return;
    }
    const choice = forced ?? decide(person);
    recipients.set(person.id, {
      personId: person.id,
      displayName: person.displayName,
      isMinor: person.isMinor,
      ...(guardianOfPersonId ? { guardianOfPersonId } : {}),
      ...(choice.channel
        ? {
            channel: choice.channel,
            ...(choice.channel !== "duna"
              ? { endpointId: connected.get(person.id)?.get(choice.channel) }
              : {}),
          }
        : { unreachableReason: choice.reason }),
    });
  };
  for (const person of audiencePeople) {
    if (!person.isMinor) {
      add(person);
      continue;
    }
    const guardians = (guardiansByMinor.get(person.id) ?? []).filter(
      (guardian) => !blocked.has(guardian.guardianId),
    );
    // A junior is reachable only with a verified guardian in the same thread
    // (the existing messaging rule), and only in-app; the guardian is the
    // one contacted on their own channel.
    add(
      person,
      undefined,
      guardians.length > 0 ? { channel: "duna" } : { reason: "no-channel" },
    );
    for (const guardian of guardians) {
      add(
        {
          id: guardian.guardianId,
          displayName: guardian.displayName,
          isMinor: guardian.isMinor,
          status: guardian.status,
          claim: guardian.claim,
        },
        person.id,
      );
    }
  }
  return [...recipients.values()].sort((left, right) =>
    left.personId.localeCompare(right.personId),
  );
}

/** SHA-256 of what will be sent: body, kind and every recipient's one channel. */
export function conciergeContentHash(input: {
  readonly body: string;
  readonly kind: ConciergeMessageKind;
  readonly recipients: readonly Pick<
    ResolvedRecipient,
    "personId" | "guardianOfPersonId" | "channel" | "unreachableReason"
  >[];
}): string {
  const canonical = JSON.stringify({
    body: input.body,
    kind: input.kind,
    recipients: [...input.recipients]
      .sort((left, right) => left.personId.localeCompare(right.personId))
      .map((recipient) => [
        recipient.personId,
        recipient.guardianOfPersonId ?? null,
        recipient.channel ?? null,
        recipient.unreachableReason ?? null,
      ]),
  });
  return createHash("sha256").update(canonical).digest("hex");
}
