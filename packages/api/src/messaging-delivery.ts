import {
  demoConversationDetail,
  demoMessagingInbox,
  type ConversationMessage,
  type DeliveryConversationState,
  type DeliveryInboxItem,
  type DeliveryPage,
  type MessagingActionResult,
  type MessagingPrincipal,
  type PrincipalType,
} from "@duna/messaging-client";
import {
  conversationMessageReactions,
  conversationMessages,
  getDatabase,
  isDatabaseConfigured,
  messagingConversationParticipants,
  messagingConversations,
  organizations,
  people,
} from "@duna/db";
import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { ApiActor } from "./context";
import {
  canUseOrganizationMessaging,
  loadMessageAttachmentDirectory,
  MessagingError,
  type MessagingPrincipalMode,
} from "./messaging-service";
import { scheduleConversationWakeUp } from "./messaging-wakeups";

interface DeliveryIdentity {
  readonly principalType: MessagingPrincipalMode;
  readonly principalId: string;
}

interface KeysetCursor {
  readonly t: string;
  readonly k: string;
}

type ParticipantRow = typeof messagingConversationParticipants.$inferSelect;
type MessageRow = typeof conversationMessages.$inferSelect;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolveIdentity(
  actor: ApiActor,
  mode: MessagingPrincipalMode = "user",
): DeliveryIdentity {
  if (mode === "organization") {
    if (!actor.organizationId || !canUseOrganizationMessaging(actor)) {
      throw new MessagingError(
        "FORBIDDEN",
        "Choose an organization with messaging access.",
      );
    }
    return {
      principalType: "organization",
      principalId: actor.organizationId,
    };
  }
  return { principalType: "user", principalId: actor.personId };
}

function parseLimit(value: number | undefined, fallback: number, max: number) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new MessagingError(
      "BAD_REQUEST",
      `Limit must be between 1 and ${max}.`,
    );
  }
  return value;
}

export function encodeMessagingCursor(cursor: KeysetCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeMessagingCursor(value: string): KeysetCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<KeysetCursor>;
    if (
      typeof parsed.t !== "string" ||
      Number.isNaN(new Date(parsed.t).getTime()) ||
      typeof parsed.k !== "string" ||
      parsed.k.length > 512
    ) {
      throw new Error("invalid");
    }
    return { t: new Date(parsed.t).toISOString(), k: parsed.k };
  } catch {
    throw new MessagingError("BAD_REQUEST", "Messaging cursor is invalid.");
  }
}

function parseStateCursor(value: string | undefined): KeysetCursor {
  if (!value) return { t: "1970-01-01T00:00:00.000Z", k: "" };
  const timestamp = new Date(value);
  if (!Number.isNaN(timestamp.getTime())) {
    return { t: timestamp.toISOString(), k: "\u{10ffff}" };
  }
  return decodeMessagingCursor(value);
}

function membershipFilter(identity: DeliveryIdentity) {
  return and(
    eq(messagingConversationParticipants.principalType, identity.principalType),
    eq(messagingConversationParticipants.principalId, identity.principalId),
  );
}

async function requireHistoricalMembership(input: {
  readonly conversationId: string;
  readonly identity: DeliveryIdentity;
}): Promise<ParticipantRow> {
  const participant =
    await getDatabase().query.messagingConversationParticipants.findFirst({
      where: and(
        eq(
          messagingConversationParticipants.conversationId,
          input.conversationId,
        ),
        membershipFilter(input.identity),
      ),
    });
  if (!participant) {
    throw new MessagingError(
      "FORBIDDEN",
      "You are not a participant in this conversation.",
    );
  }
  return participant;
}

function visibleMessageFilter(identity: DeliveryIdentity) {
  return or(
    inArray(conversationMessages.status, ["published", "removed"]),
    and(
      eq(conversationMessages.senderPrincipalType, identity.principalType),
      eq(conversationMessages.senderPrincipalId, identity.principalId),
    ),
  );
}

function departureFilter(leftAt: Date | null) {
  return leftAt ? lte(conversationMessages.createdAt, leftAt) : undefined;
}

function principalKey(type: PrincipalType, id: string) {
  return `${type}:${id}`;
}

async function principalDirectory(input: {
  readonly participants?: readonly ParticipantRow[];
  readonly messages?: readonly MessageRow[];
}): Promise<Map<string, MessagingPrincipal>> {
  const personIds = new Set<string>();
  const organizationIds = new Set<string>();
  for (const participant of input.participants ?? []) {
    if (participant.personId) personIds.add(participant.personId);
    if (participant.organizationId)
      organizationIds.add(participant.organizationId);
  }
  for (const message of input.messages ?? []) {
    if (message.senderPersonId) personIds.add(message.senderPersonId);
    if (message.senderOrganizationId)
      organizationIds.add(message.senderOrganizationId);
  }
  const database = getDatabase();
  const [personRows, organizationRows] = await Promise.all([
    personIds.size
      ? database
          .select({
            avatarUrl: people.avatarUrl,
            displayName: people.displayName,
            id: people.id,
          })
          .from(people)
          .where(inArray(people.id, [...personIds]))
      : [],
    organizationIds.size
      ? database
          .select({
            displayName: organizations.name,
            id: organizations.id,
          })
          .from(organizations)
          .where(inArray(organizations.id, [...organizationIds]))
      : [],
  ]);
  const directory = new Map<string, MessagingPrincipal>();
  for (const person of personRows) {
    directory.set(principalKey("user", person.id), {
      type: "user",
      id: person.id,
      displayName: person.displayName,
      ...(person.avatarUrl ? { avatarUrl: person.avatarUrl } : {}),
    });
  }
  for (const organization of organizationRows) {
    directory.set(principalKey("organization", organization.id), {
      type: "organization",
      id: organization.id,
      displayName: organization.displayName,
    });
  }
  directory.set(principalKey("agent", "duna-ai-support"), {
    type: "agent",
    id: "duna-ai-support",
    displayName: "Duna Support",
  });
  return directory;
}

function fallbackPrincipal(type: PrincipalType, id: string) {
  return {
    type,
    id,
    displayName:
      type === "agent"
        ? "Duna Support"
        : type === "organization"
          ? "Duna organization"
          : "Duna member",
  } satisfies MessagingPrincipal;
}

function messageFromRow(
  row: MessageRow,
  directory: ReadonlyMap<string, MessagingPrincipal>,
  attachments: ReadonlyMap<
    string,
    ConversationMessage["attachments"]
  > = new Map(),
): ConversationMessage {
  const sender =
    directory.get(
      principalKey(row.senderPrincipalType, row.senderPrincipalId),
    ) ?? fallbackPrincipal(row.senderPrincipalType, row.senderPrincipalId);
  const removed = row.status === "removed";
  return {
    id: row.id,
    conversationId: row.conversationId,
    clientMessageId: row.clientMessageId,
    seq: row.sequence,
    sender,
    kind: row.kind,
    ...(!removed && row.body ? { body: row.body } : {}),
    widgets: removed ? [] : (row.widgets as ConversationMessage["widgets"]),
    attachments: removed ? [] : (attachments.get(row.id) ?? []),
    status: row.status,
    moderationState: row.moderationState,
    createdAt: row.createdAt.toISOString(),
    ...(row.editedAt ? { editedAt: row.editedAt.toISOString() } : {}),
    ...(row.removedAt ? { removedAt: row.removedAt.toISOString() } : {}),
  };
}

function participantPrincipal(
  participant: ParticipantRow,
  directory: ReadonlyMap<string, MessagingPrincipal>,
) {
  return (
    directory.get(
      principalKey(participant.principalType, participant.principalId),
    ) ?? fallbackPrincipal(participant.principalType, participant.principalId)
  );
}

export async function loadDeliveryInbox(input: {
  readonly actor: ApiActor;
  readonly asPrincipal?: MessagingPrincipalMode;
  readonly cursor?: string;
  readonly limit?: number;
  readonly now?: Date;
}): Promise<DeliveryPage<DeliveryInboxItem>> {
  const identity = resolveIdentity(input.actor, input.asPrincipal);
  const serverTime = input.now ?? new Date();
  const limit = parseLimit(input.limit, 50, 100);
  if (!isDatabaseConfigured() || input.actor.isDemo) {
    const demo = demoMessagingInbox({
      type: identity.principalType,
      id: identity.principalId,
      displayName: input.actor.displayName,
    });
    return {
      items: demo.conversations.slice(0, limit).map((conversation) => ({
        ...conversation,
        latestSeq: conversation.lastMessage?.seq ?? 0,
        lastReadSeq: 0,
        lastDeliveredSeq: 0,
        messageUpdatedAt: conversation.updatedAt,
        stateUpdatedAt: conversation.updatedAt,
      })),
      nextCursor: null,
      serverTime: serverTime.toISOString(),
    };
  }
  const database = getDatabase();
  const cursor = input.cursor ? decodeMessagingCursor(input.cursor) : undefined;
  if (cursor && !UUID_PATTERN.test(cursor.k)) {
    throw new MessagingError("BAD_REQUEST", "Messaging cursor is invalid.");
  }
  const sourceSortTime = sql<Date>`CASE
    WHEN ${messagingConversationParticipants.leftAt} IS NOT NULL
      AND ${messagingConversations.lastMessageAt} > ${messagingConversationParticipants.leftAt}
      THEN ${messagingConversationParticipants.leftAt}
    ELSE COALESCE(${messagingConversations.lastMessageAt}, ${messagingConversations.createdAt})
  END`;
  const sortTime = sql<Date>`date_trunc('milliseconds', ${sourceSortTime})`;
  const rows = await database
    .select({
      conversation: messagingConversations,
      membership: messagingConversationParticipants,
      sortTime,
    })
    .from(messagingConversationParticipants)
    .innerJoin(
      messagingConversations,
      eq(
        messagingConversationParticipants.conversationId,
        messagingConversations.id,
      ),
    )
    .where(
      and(
        membershipFilter(identity),
        ...(cursor
          ? [
              or(
                sql`${sortTime} < ${new Date(cursor.t)}`,
                and(
                  sql`${sortTime} = ${new Date(cursor.t)}`,
                  sql`${messagingConversations.id} < ${cursor.k}`,
                ),
              ),
            ]
          : []),
      ),
    )
    .orderBy(desc(sortTime), desc(messagingConversations.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  if (pageRows.length === 0) {
    return {
      items: [],
      nextCursor: null,
      serverTime: serverTime.toISOString(),
    };
  }
  const conversationIds = pageRows.map((row) => row.conversation.id);
  const participantRows = await database
    .select()
    .from(messagingConversationParticipants)
    .where(
      and(
        inArray(
          messagingConversationParticipants.conversationId,
          conversationIds,
        ),
        or(
          sql`${messagingConversationParticipants.leftAt} IS NULL`,
          and(
            eq(
              messagingConversationParticipants.principalType,
              identity.principalType,
            ),
            eq(
              messagingConversationParticipants.principalId,
              identity.principalId,
            ),
          ),
        ),
      ),
    );
  const [
    bulkLatestRows,
    unreadRows,
    messageVersionRows,
    participantVersionRows,
    reactionVersionRows,
  ] = await Promise.all([
    database
      .selectDistinctOn([conversationMessages.conversationId])
      .from(conversationMessages)
      .where(
        and(
          inArray(conversationMessages.conversationId, conversationIds),
          visibleMessageFilter(identity),
        ),
      )
      .orderBy(
        conversationMessages.conversationId,
        desc(conversationMessages.sequence),
      ),
    database
      .select({
        conversationId: conversationMessages.conversationId,
        count: sql<number>`count(*)::int`,
      })
      .from(conversationMessages)
      .innerJoin(
        messagingConversationParticipants,
        eq(
          conversationMessages.conversationId,
          messagingConversationParticipants.conversationId,
        ),
      )
      .where(
        and(
          inArray(conversationMessages.conversationId, conversationIds),
          eq(conversationMessages.status, "published"),
          membershipFilter(identity),
          sql`${conversationMessages.sequence} > ${messagingConversationParticipants.lastReadSequence}`,
          or(
            isNull(messagingConversationParticipants.leftAt),
            lte(
              conversationMessages.createdAt,
              messagingConversationParticipants.leftAt,
            ),
          ),
        ),
      )
      .groupBy(conversationMessages.conversationId),
    database
      .select({
        conversationId: conversationMessages.conversationId,
        updatedAt: sql<Date>`max(${conversationMessages.updatedAt})`,
      })
      .from(conversationMessages)
      .where(
        and(
          inArray(conversationMessages.conversationId, conversationIds),
          visibleMessageFilter(identity),
        ),
      )
      .groupBy(conversationMessages.conversationId),
    database
      .select({
        conversationId: messagingConversationParticipants.conversationId,
        updatedAt: sql<Date>`max(${messagingConversationParticipants.updatedAt})`,
      })
      .from(messagingConversationParticipants)
      .where(
        inArray(
          messagingConversationParticipants.conversationId,
          conversationIds,
        ),
      )
      .groupBy(messagingConversationParticipants.conversationId),
    database
      .select({
        conversationId: conversationMessages.conversationId,
        updatedAt: sql<Date>`max(${conversationMessageReactions.updatedAt})`,
      })
      .from(conversationMessageReactions)
      .innerJoin(
        conversationMessages,
        eq(conversationMessageReactions.messageId, conversationMessages.id),
      )
      .where(
        and(
          inArray(conversationMessages.conversationId, conversationIds),
          inArray(conversationMessages.status, ["published", "removed"]),
        ),
      )
      .groupBy(conversationMessages.conversationId),
  ]);
  const latestByConversation = new Map(
    bulkLatestRows.map((message) => [message.conversationId, message]),
  );
  for (const { conversation, membership } of pageRows) {
    const latest = latestByConversation.get(conversation.id);
    if (!membership.leftAt || !latest || latest.createdAt <= membership.leftAt)
      continue;
    const [historicalLatest] = await database
      .select()
      .from(conversationMessages)
      .where(
        and(
          eq(conversationMessages.conversationId, conversation.id),
          visibleMessageFilter(identity),
          departureFilter(membership.leftAt),
        ),
      )
      .orderBy(desc(conversationMessages.sequence))
      .limit(1);
    if (historicalLatest)
      latestByConversation.set(conversation.id, historicalLatest);
    else latestByConversation.delete(conversation.id);
  }
  const latestRows = [...latestByConversation.values()];
  const unreadByConversation = new Map(
    unreadRows.map((row) => [row.conversationId, row.count]),
  );
  const participantVersionByConversation = new Map(
    participantVersionRows.map((row) => [row.conversationId, row.updatedAt]),
  );
  const reactionVersionByConversation = new Map(
    reactionVersionRows.map((row) => [row.conversationId, row.updatedAt]),
  );
  const messageVersionByConversation = new Map(
    messageVersionRows.map((row) => [row.conversationId, row.updatedAt]),
  );
  const directory = await principalDirectory({
    messages: latestRows,
    participants: participantRows,
  });
  const attachmentDirectory = await loadMessageAttachmentDirectory(
    latestRows.map((message) => message.id),
  );
  const participantsByConversation = new Map<string, ParticipantRow[]>();
  for (const participant of participantRows) {
    const current = participantsByConversation.get(participant.conversationId);
    if (current) current.push(participant);
    else
      participantsByConversation.set(participant.conversationId, [participant]);
  }
  const items = pageRows.map(({ conversation, membership }) => {
    const latest = latestByConversation.get(conversation.id);
    const capVersion = (value: Date) =>
      membership.leftAt && value > membership.leftAt
        ? membership.leftAt
        : value;
    const messageVersion = capVersion(
      messageVersionByConversation.get(conversation.id) ??
        latest?.updatedAt ??
        conversation.updatedAt,
    );
    const stateVersionCandidates = [
      membership.updatedAt,
      participantVersionByConversation.get(conversation.id),
      reactionVersionByConversation.get(conversation.id),
    ].flatMap((value) => (value ? [value] : []));
    const stateVersion = capVersion(
      new Date(
        Math.max(...stateVersionCandidates.map((value) => value.getTime())),
      ),
    );
    const visibleVersion = new Date(
      Math.max(
        capVersion(conversation.updatedAt).getTime(),
        messageVersion.getTime(),
        stateVersion.getTime(),
      ),
    );
    const participants = (
      participantsByConversation.get(conversation.id) ?? [membership]
    )
      .slice(0, 8)
      .map((participant) => participantPrincipal(participant, directory));
    return {
      id: conversation.id,
      type: conversation.type,
      title: conversation.title,
      ...(conversation.contextType &&
      conversation.contextId &&
      conversation.contextLabel
        ? {
            context: {
              type: conversation.contextType,
              id: conversation.contextId,
              label: conversation.contextLabel,
              ...(conversation.organizationId
                ? { organizationId: conversation.organizationId }
                : {}),
            },
          }
        : {}),
      participants,
      ...(latest
        ? {
            lastMessage: messageFromRow(latest, directory, attachmentDirectory),
          }
        : {}),
      unreadCount: unreadByConversation.get(conversation.id) ?? 0,
      announcementOnly: conversation.announcementOnly,
      muted: membership.notificationLevel === "muted",
      safety: {
        minorPresent: conversation.minorPresent,
        guardianPresent: conversation.guardianCoverageComplete,
        screeningRequired: conversation.safetyScreeningRequired,
      },
      updatedAt: visibleVersion.toISOString(),
      latestSeq: latest?.sequence ?? 0,
      lastReadSeq: membership.lastReadSequence,
      lastDeliveredSeq: membership.lastDeliveredSequence,
      messageUpdatedAt: messageVersion.toISOString(),
      stateUpdatedAt: stateVersion.toISOString(),
      ...(membership.leftAt ? { leftAt: membership.leftAt.toISOString() } : {}),
    } satisfies DeliveryInboxItem;
  });
  const last = pageRows.at(-1);
  return {
    items,
    nextCursor:
      hasMore && last
        ? encodeMessagingCursor({
            t: last.sortTime.toISOString(),
            k: last.conversation.id,
          })
        : null,
    serverTime: serverTime.toISOString(),
  };
}

export async function loadDeliveryMessages(input: {
  readonly actor: ApiActor;
  readonly conversationId: string;
  readonly asPrincipal?: MessagingPrincipalMode;
  readonly afterSequence?: number;
  readonly beforeSequence?: number;
  readonly limit?: number;
  readonly now?: Date;
}): Promise<DeliveryPage<ConversationMessage>> {
  if (!UUID_PATTERN.test(input.conversationId)) {
    throw new MessagingError("BAD_REQUEST", "Conversation id is invalid.");
  }
  if (input.afterSequence !== undefined && input.beforeSequence !== undefined) {
    throw new MessagingError(
      "BAD_REQUEST",
      "Choose forward sync or history pagination, not both.",
    );
  }
  for (const sequence of [input.afterSequence, input.beforeSequence]) {
    if (
      sequence !== undefined &&
      (!Number.isInteger(sequence) || sequence < 0)
    ) {
      throw new MessagingError(
        "BAD_REQUEST",
        "Message sequence cursor must be non-negative.",
      );
    }
  }
  const identity = resolveIdentity(input.actor, input.asPrincipal);
  const limit = parseLimit(input.limit, 100, 200);
  const serverTime = input.now ?? new Date();
  if (!isDatabaseConfigured() || input.actor.isDemo) {
    const messages = demoConversationDetail(input.conversationId)
      .messages.filter(
        (message) =>
          (input.afterSequence === undefined ||
            message.seq > input.afterSequence) &&
          (input.beforeSequence === undefined ||
            message.seq < input.beforeSequence),
      )
      .slice(0, limit);
    return {
      items: messages,
      nextCursor: null,
      serverTime: serverTime.toISOString(),
    };
  }
  const membership = await requireHistoricalMembership({
    conversationId: input.conversationId,
    identity,
  });
  const history = input.beforeSequence !== undefined;
  const rows = await getDatabase()
    .select()
    .from(conversationMessages)
    .where(
      and(
        eq(conversationMessages.conversationId, input.conversationId),
        visibleMessageFilter(identity),
        departureFilter(membership.leftAt),
        ...(input.afterSequence !== undefined
          ? [sql`${conversationMessages.sequence} > ${input.afterSequence}`]
          : []),
        ...(input.beforeSequence !== undefined
          ? [sql`${conversationMessages.sequence} < ${input.beforeSequence}`]
          : []),
      ),
    )
    .orderBy(
      history
        ? desc(conversationMessages.sequence)
        : asc(conversationMessages.sequence),
    )
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  if (history) pageRows.reverse();
  const directory = await principalDirectory({ messages: pageRows });
  const attachmentDirectory = await loadMessageAttachmentDirectory(
    pageRows.map((message) => message.id),
  );
  return {
    items: pageRows.map((message) =>
      messageFromRow(message, directory, attachmentDirectory),
    ),
    nextCursor:
      hasMore && pageRows.length > 0
        ? String(history ? pageRows[0]!.sequence : pageRows.at(-1)!.sequence)
        : null,
    serverTime: serverTime.toISOString(),
  };
}

function stateKey(item: DeliveryConversationState): string {
  return `${item.type}:${item.id}`;
}

export async function loadDeliveryState(input: {
  readonly actor: ApiActor;
  readonly conversationId: string;
  readonly asPrincipal?: MessagingPrincipalMode;
  readonly since?: string;
  readonly limit?: number;
  readonly now?: Date;
}): Promise<DeliveryPage<DeliveryConversationState>> {
  if (!UUID_PATTERN.test(input.conversationId)) {
    throw new MessagingError("BAD_REQUEST", "Conversation id is invalid.");
  }
  const identity = resolveIdentity(input.actor, input.asPrincipal);
  const serverTime = input.now ?? new Date();
  const cursor = parseStateCursor(input.since);
  const limit = parseLimit(input.limit, 500, 1_000);
  if (!isDatabaseConfigured() || input.actor.isDemo) {
    const detail = demoConversationDetail(input.conversationId);
    return {
      items: detail.participants.map((participant, index) => ({
        type: "participant" as const,
        id: `demo-${index}`,
        conversationId: input.conversationId,
        participant,
        joinedAt: serverTime.toISOString(),
        updatedAt: serverTime.toISOString(),
      })),
      nextCursor: null,
      serverTime: serverTime.toISOString(),
    };
  }
  const membership = await requireHistoricalMembership({
    conversationId: input.conversationId,
    identity,
  });
  const queryTime =
    membership.leftAt && membership.leftAt < serverTime
      ? membership.leftAt
      : serverTime;
  const database = getDatabase();
  const sinceDate = new Date(cursor.t);
  const participantStateKey = sql<string>`('participant:' || ${messagingConversationParticipants.id}::text) COLLATE "C"`;
  const reactionStateKey = sql<string>`('reaction:' || ${conversationMessageReactions.messageId}::text || ':' || ${conversationMessageReactions.principalType}::text || ':' || ${conversationMessageReactions.principalId} || ':' || ${conversationMessageReactions.emoji}) COLLATE "C"`;
  const participantUpdatedAt = sql<Date>`date_trunc('milliseconds', ${messagingConversationParticipants.updatedAt})`;
  const reactionUpdatedAt = sql<Date>`date_trunc('milliseconds', ${conversationMessageReactions.updatedAt})`;
  const [participants, reactions] = await Promise.all([
    database
      .select()
      .from(messagingConversationParticipants)
      .where(
        and(
          eq(
            messagingConversationParticipants.conversationId,
            input.conversationId,
          ),
          or(
            sql`${participantUpdatedAt} > ${sinceDate}`,
            and(
              sql`${participantUpdatedAt} = ${sinceDate}`,
              sql`${participantStateKey} > ${cursor.k}`,
            ),
          ),
          sql`${participantUpdatedAt} <= ${queryTime}`,
        ),
      )
      .orderBy(asc(participantUpdatedAt), asc(participantStateKey))
      .limit(limit + 1),
    database
      .select({ reaction: conversationMessageReactions })
      .from(conversationMessageReactions)
      .innerJoin(
        conversationMessages,
        eq(conversationMessageReactions.messageId, conversationMessages.id),
      )
      .where(
        and(
          eq(conversationMessages.conversationId, input.conversationId),
          visibleMessageFilter(identity),
          or(
            sql`${reactionUpdatedAt} > ${sinceDate}`,
            and(
              sql`${reactionUpdatedAt} = ${sinceDate}`,
              sql`${reactionStateKey} > ${cursor.k}`,
            ),
          ),
          sql`${reactionUpdatedAt} <= ${queryTime}`,
        ),
      )
      .orderBy(asc(reactionUpdatedAt), asc(reactionStateKey))
      .limit(limit + 1),
  ]);
  const directory = await principalDirectory({ participants });
  const participantItems: DeliveryConversationState[] = participants.map(
    (participant) => ({
      type: "participant",
      id: participant.id,
      conversationId: participant.conversationId,
      participant: {
        principal: participantPrincipal(participant, directory),
        role: participant.role,
        ...(participant.guardianOfPersonId
          ? { guardianOfPersonId: participant.guardianOfPersonId }
          : {}),
        canPost: participant.canPost,
        lastReadSeq: participant.lastReadSequence,
        lastDeliveredSeq: participant.lastDeliveredSequence,
      },
      joinedAt: participant.joinedAt.toISOString(),
      ...(participant.leftAt
        ? { leftAt: participant.leftAt.toISOString() }
        : {}),
      updatedAt: participant.updatedAt.toISOString(),
    }),
  );
  const reactionItems: DeliveryConversationState[] = reactions.map(
    ({ reaction }) => ({
      type: "reaction",
      id: `${reaction.messageId}:${reaction.principalType}:${reaction.principalId}:${reaction.emoji}`,
      messageId: reaction.messageId,
      principalType: reaction.principalType,
      principalId: reaction.principalId,
      emoji: reaction.emoji,
      createdAt: reaction.createdAt.toISOString(),
      updatedAt: reaction.updatedAt.toISOString(),
    }),
  );
  const allItems = [...participantItems, ...reactionItems]
    .filter((item) => {
      const time = item.updatedAt;
      return (
        time > cursor.t || (time === cursor.t && stateKey(item) > cursor.k)
      );
    })
    .sort((left, right) => {
      const leftKey = `${left.updatedAt}:${stateKey(left)}`;
      const rightKey = `${right.updatedAt}:${stateKey(right)}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
  const hasMore = allItems.length > limit;
  const items = allItems.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      hasMore && last
        ? encodeMessagingCursor({ t: last.updatedAt, k: stateKey(last) })
        : null,
    serverTime: queryTime.toISOString(),
  };
}

export async function advanceDeliveryWatermark(input: {
  readonly actor: ApiActor;
  readonly conversationId: string;
  readonly asPrincipal?: MessagingPrincipalMode;
  readonly kind: "delivered" | "read";
  readonly seq: number;
  readonly now?: Date;
}): Promise<MessagingActionResult> {
  if (!UUID_PATTERN.test(input.conversationId)) {
    throw new MessagingError("BAD_REQUEST", "Conversation id is invalid.");
  }
  if (!Number.isInteger(input.seq) || input.seq < 0) {
    throw new MessagingError("BAD_REQUEST", "Sequence must be non-negative.");
  }
  const identity = resolveIdentity(input.actor, input.asPrincipal);
  if (!isDatabaseConfigured() || input.actor.isDemo) {
    return {
      ok: true,
      id: input.conversationId,
      message: input.kind === "read" ? "Conversation read." : "Delivered.",
    };
  }
  const membership = await requireHistoricalMembership({
    conversationId: input.conversationId,
    identity,
  });
  const [visible] = await getDatabase()
    .select({
      max: sql<number>`COALESCE(max(${conversationMessages.sequence}), 0)::int`,
    })
    .from(conversationMessages)
    .where(
      and(
        eq(conversationMessages.conversationId, input.conversationId),
        eq(conversationMessages.status, "published"),
        departureFilter(membership.leftAt),
      ),
    );
  const seq = Math.min(input.seq, visible?.max ?? 0);
  const now = input.now ?? new Date();
  const values =
    input.kind === "read"
      ? {
          lastReadSequence: sql`GREATEST(${messagingConversationParticipants.lastReadSequence}, ${seq})`,
          lastDeliveredSequence: sql`GREATEST(${messagingConversationParticipants.lastDeliveredSequence}, ${seq})`,
          updatedAt: now,
        }
      : {
          lastDeliveredSequence: sql`GREATEST(${messagingConversationParticipants.lastDeliveredSequence}, ${seq})`,
          updatedAt: now,
        };
  await getDatabase()
    .update(messagingConversationParticipants)
    .set(values)
    .where(eq(messagingConversationParticipants.id, membership.id));
  scheduleConversationWakeUp({
    conversationId: input.conversationId,
    seq,
  });
  return {
    ok: true,
    id: input.conversationId,
    message: input.kind === "read" ? "Conversation read." : "Delivered.",
  };
}
