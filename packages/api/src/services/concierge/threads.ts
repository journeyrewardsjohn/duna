/**
 * Concierge threads (B7): a compatibility read of the existing messaging
 * conversations. Every existing conversation IS a thread (no copy, no
 * migration of data): the thread kind comes from its context
 * (lesson → lesson, match → match, event / division → tournament, league →
 * league, organization / rental / none → club, support → Duna).
 *
 * Viewers:
 *  - a club's staff read the club's threads as the club principal (the same
 *    membership the HQ inbox uses), with the staff queue filters;
 *  - a person reads the threads they are an active participant of,
 *    including the threads of the juniors they are the verified guardian of
 *    (guardians are participants of the same thread).
 *
 * A person sees a thread's history from when they joined it. Lists are
 * keyset-paginated (at most 100) and take a fixed number of queries.
 */
import {
  conciergeDeliveries,
  conciergeMessageChannels,
  conciergeThreadAssignments,
  conversationMessages,
  getDatabase,
  messagingConversationParticipants,
  messagingConversations,
  organizationMemberships,
  organizations,
  people,
} from "@duna/db";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { verifiedGuardianMembership } from "../../messaging-guardian-access";
import { personRef } from "./proposals";
import { ConciergeError, type ConciergeChannel } from "./types";

export type ConciergeThreadKind =
  "lesson" | "match" | "tournament" | "league" | "club" | "duna";
export type ConciergeThreadFilter = "all" | "unread" | "families";
export type ConciergeQueue = "all" | "mine" | "unassigned";

export type ConciergeViewer =
  | {
      readonly kind: "club";
      readonly organizationId: string;
      readonly personId: string;
    }
  | { readonly kind: "person"; readonly personId: string };

type ConversationRow = typeof messagingConversations.$inferSelect;

export function threadKindOf(
  conversation: Pick<ConversationRow, "type" | "contextType">,
): ConciergeThreadKind {
  if (conversation.type === "support") return "duna";
  switch (conversation.contextType) {
    case "lesson":
      return "lesson";
    case "match":
      return "match";
    case "event":
    case "division":
      return "tournament";
    case "league":
      return "league";
    default:
      return "club";
  }
}

function kindCondition(kind: ConciergeThreadKind): SQL {
  const c = messagingConversations;
  switch (kind) {
    case "duna":
      return eq(c.type, "support");
    case "lesson":
      return and(sql`${c.type} <> 'support'`, eq(c.contextType, "lesson"))!;
    case "match":
      return and(sql`${c.type} <> 'support'`, eq(c.contextType, "match"))!;
    case "tournament":
      return and(
        sql`${c.type} <> 'support'`,
        inArray(c.contextType, ["event", "division"]),
      )!;
    case "league":
      return and(sql`${c.type} <> 'support'`, eq(c.contextType, "league"))!;
    case "club":
      return and(
        sql`${c.type} <> 'support'`,
        or(
          isNull(c.contextType),
          inArray(c.contextType, ["organization", "rental", "support-case"]),
        ),
      )!;
  }
}

function membershipCondition(viewer: ConciergeViewer): SQL {
  const p = messagingConversationParticipants;
  return viewer.kind === "club"
    ? and(
        eq(p.principalType, "organization"),
        eq(p.organizationId, viewer.organizationId),
      )!
    : and(eq(p.principalType, "user"), eq(p.personId, viewer.personId))!;
}

/** Unread published messages after the viewer's read watermark (and join, for a person). */
function unreadSql(viewer: ConciergeViewer): SQL<number> {
  const m = conversationMessages;
  const p = messagingConversationParticipants;
  return sql<number>`(SELECT count(*)::int FROM ${m} WHERE ${m.conversationId} = ${messagingConversations.id} AND ${m.status} = 'published' AND ${m.sequence} > ${p.lastReadSequence}${
    viewer.kind === "person" ? sql` AND ${m.createdAt} >= ${p.joinedAt}` : sql``
  })`;
}

function encodeCursor(at: Date, id: string): string {
  return Buffer.from(`${at.toISOString()}|${id}`).toString("base64url");
}

function decodeCursor(cursor: string): { at: Date; id: string } | undefined {
  try {
    const [iso, id] = Buffer.from(cursor, "base64url").toString().split("|");
    const at = new Date(iso ?? "");
    return id && !Number.isNaN(at.getTime()) ? { at, id } : undefined;
  } catch {
    return undefined;
  }
}

export interface ConciergeThreadsInput {
  readonly filter: ConciergeThreadFilter;
  readonly kind?: ConciergeThreadKind;
  readonly search?: string;
  readonly queue?: ConciergeQueue;
  readonly cursor?: string;
  readonly limit: number;
}

/** Threads for one viewer with All / Unread / Families counts (four queries). */
export async function listConciergeThreads(
  viewer: ConciergeViewer,
  input: ConciergeThreadsInput,
) {
  const database = getDatabase();
  const c = messagingConversations;
  const p = messagingConversationParticipants;
  const a = conciergeThreadAssignments;
  const unread = unreadSql(viewer);
  const sortAt = sql<Date>`coalesce(${c.lastMessageAt}, ${c.updatedAt})`;
  const search = input.search?.trim().slice(0, 80);
  const scope = and(
    membershipCondition(viewer),
    isNull(p.leftAt),
    verifiedGuardianMembership(),
    eq(c.status, "open"),
    ...(input.kind ? [kindCondition(input.kind)] : []),
    ...(search
      ? [
          or(
            sql`${c.title} ILIKE ${`%${search.replace(/[%_\\]/g, "\\$&")}%`}`,
            sql`${c.contextLabel} ILIKE ${`%${search.replace(/[%_\\]/g, "\\$&")}%`}`,
          )!,
        ]
      : []),
    ...(viewer.kind === "club" && input.queue === "mine"
      ? [eq(a.assignedPersonId, viewer.personId)]
      : []),
    ...(viewer.kind === "club" && input.queue === "unassigned"
      ? [isNull(a.assignedPersonId)]
      : []),
  )!;
  const cursor = input.cursor ? decodeCursor(input.cursor) : undefined;
  const limit = Math.min(100, Math.max(1, input.limit));
  const rows = await database
    .select({
      conversation: c,
      unread,
      assignedPersonId: a.assignedPersonId,
      joinedAt: p.joinedAt,
    })
    .from(p)
    .innerJoin(c, eq(p.conversationId, c.id))
    .leftJoin(a, eq(a.conversationId, c.id))
    .where(
      and(
        scope,
        ...(input.filter === "unread" ? [sql`${unread} > 0`] : []),
        ...(input.filter === "families" ? [eq(c.minorPresent, true)] : []),
        ...(cursor
          ? [
              sql`(${sortAt}, ${c.id}) < (${cursor.at.toISOString()}::timestamptz, ${cursor.id}::uuid)`,
            ]
          : []),
      ),
    )
    .orderBy(desc(sortAt), desc(c.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const ids = page.map((row) => row.conversation.id);
  const [counts, lastMessages, participantCounts] = await Promise.all([
    database
      .select({
        all: sql<number>`count(*)::int`,
        unread: sql<number>`count(*) FILTER (WHERE ${unread} > 0)::int`,
        families: sql<number>`count(*) FILTER (WHERE ${c.minorPresent})::int`,
      })
      .from(p)
      .innerJoin(c, eq(p.conversationId, c.id))
      .leftJoin(a, eq(a.conversationId, c.id))
      .where(scope),
    ids.length === 0
      ? Promise.resolve([])
      : database
          .selectDistinctOn([conversationMessages.conversationId], {
            conversationId: conversationMessages.conversationId,
            body: conversationMessages.body,
            createdAt: conversationMessages.createdAt,
          })
          .from(conversationMessages)
          .where(
            and(
              inArray(conversationMessages.conversationId, ids),
              eq(conversationMessages.status, "published"),
            ),
          )
          .orderBy(
            conversationMessages.conversationId,
            desc(conversationMessages.sequence),
          ),
    ids.length === 0
      ? Promise.resolve([])
      : database
          .select({
            conversationId: p.conversationId,
            count: sql<number>`count(*)::int`,
          })
          .from(p)
          .where(
            and(
              inArray(p.conversationId, ids),
              eq(p.principalType, "user"),
              isNull(p.leftAt),
            ),
          )
          .groupBy(p.conversationId),
  ]);
  const lastOf = new Map(lastMessages.map((row) => [row.conversationId, row]));
  const participantsOf = new Map(
    participantCounts.map((row) => [row.conversationId, row.count]),
  );
  const last = page.at(-1);
  return {
    items: page.map(({ conversation, unread: unreadCount, joinedAt }) => {
      const message = lastOf.get(conversation.id);
      const visible =
        message &&
        (viewer.kind === "club" ||
          message.createdAt.getTime() >= joinedAt.getTime());
      return {
        conversationId: conversation.id,
        kind: threadKindOf(conversation),
        title: conversation.title,
        ...(conversation.contextType &&
        conversation.contextId &&
        conversation.type !== "support"
          ? {
              context: {
                type: conversation.contextType,
                id: conversation.contextId,
                label: conversation.contextLabel ?? conversation.title,
              },
            }
          : {}),
        participantCount: participantsOf.get(conversation.id) ?? 0,
        unreadCount: Number(unreadCount),
        minorPresent: conversation.minorPresent,
        ...(visible && message.body
          ? { lastMessagePreview: message.body.slice(0, 280) }
          : {}),
        ...(conversation.lastMessageAt
          ? { lastMessageAt: conversation.lastMessageAt.toISOString() }
          : {}),
      };
    }),
    ...(rows.length > limit && last
      ? {
          nextCursor: encodeCursor(
            last.conversation.lastMessageAt ?? last.conversation.updatedAt,
            last.conversation.id,
          ),
        }
      : {}),
    counts: counts[0] ?? { all: 0, unread: 0, families: 0 },
  };
}

const SYSTEM_KINDS: Readonly<Record<string, "schedule" | "score" | undefined>> =
  {
    "schedule-change": "schedule",
    "score-update": "score",
  };

/** One thread with participants and up to 50 messages (fixed query count). */
export async function loadConciergeThread(
  viewer: ConciergeViewer,
  input: { readonly conversationId: string; readonly beforeSequence?: number },
) {
  const database = getDatabase();
  const p = messagingConversationParticipants;
  const [membership] = await database
    .select({ participant: p, conversation: messagingConversations })
    .from(p)
    .innerJoin(
      messagingConversations,
      eq(messagingConversations.id, p.conversationId),
    )
    .where(
      and(
        eq(p.conversationId, input.conversationId),
        membershipCondition(viewer),
        isNull(p.leftAt),
        verifiedGuardianMembership(),
        sql`${messagingConversations.status} <> 'archived'`,
      ),
    )
    .limit(1);
  if (!membership) throw new ConciergeError("NOT_FOUND", "Thread not found.");
  const { participant, conversation } = membership;
  const m = conversationMessages;
  const own =
    viewer.kind === "club"
      ? and(
          eq(m.senderPrincipalType, "organization"),
          eq(m.senderPrincipalId, viewer.organizationId),
        )
      : and(
          eq(m.senderPrincipalType, "user"),
          eq(m.senderPrincipalId, viewer.personId),
        );
  const [participantRows, messageRows, unreadRows] = await Promise.all([
    database
      .select({
        personId: p.personId,
        role: p.role,
        guardianOfPersonId: p.guardianOfPersonId,
      })
      .from(p)
      .where(
        and(
          eq(p.conversationId, conversation.id),
          eq(p.principalType, "user"),
          isNull(p.leftAt),
          verifiedGuardianMembership(),
        ),
      )
      .orderBy(asc(p.joinedAt))
      .limit(100),
    database
      .select()
      .from(m)
      .where(
        and(
          eq(m.conversationId, conversation.id),
          or(eq(m.status, "published"), own),
          ...(viewer.kind === "person"
            ? [sql`${m.createdAt} >= ${participant.joinedAt}`]
            : []),
          ...(input.beforeSequence
            ? [sql`${m.sequence} < ${input.beforeSequence}`]
            : []),
        ),
      )
      .orderBy(desc(m.sequence))
      .limit(50),
    database
      .select({ count: sql<number>`count(*)::int` })
      .from(m)
      .where(
        and(
          eq(m.conversationId, conversation.id),
          eq(m.status, "published"),
          sql`${m.sequence} > ${participant.lastReadSequence}`,
          ...(viewer.kind === "person"
            ? [sql`${m.createdAt} >= ${participant.joinedAt}`]
            : []),
        ),
      ),
  ]);
  messageRows.reverse();
  const messageIds = messageRows.map((row) => row.id);
  const personIds = [
    ...new Set([
      ...participantRows.flatMap((row) =>
        [row.personId, row.guardianOfPersonId].filter((id): id is string =>
          Boolean(id),
        ),
      ),
      ...messageRows.flatMap((row) =>
        row.senderPersonId ? [row.senderPersonId] : [],
      ),
    ]),
  ];
  const orgIds = [
    ...new Set(
      messageRows.flatMap((row) =>
        row.senderOrganizationId ? [row.senderOrganizationId] : [],
      ),
    ),
  ];
  const showDelivery = viewer.kind === "club";
  const [personRows, orgRows, staffRows, inboundChannels, deliveryRows] =
    await Promise.all([
      personIds.length
        ? database
            .select({ id: people.id, displayName: people.displayName })
            .from(people)
            .where(inArray(people.id, personIds))
        : Promise.resolve([]),
      orgIds.length
        ? database
            .select({ id: organizations.id, name: organizations.name })
            .from(organizations)
            .where(inArray(organizations.id, orgIds))
        : Promise.resolve([]),
      conversation.organizationId && personIds.length
        ? database
            .select({
              personId: organizationMemberships.personId,
              role: organizationMemberships.role,
            })
            .from(organizationMemberships)
            .where(
              and(
                eq(
                  organizationMemberships.organizationId,
                  conversation.organizationId,
                ),
                eq(organizationMemberships.active, true),
                inArray(organizationMemberships.personId, personIds),
              ),
            )
        : Promise.resolve([]),
      messageIds.length
        ? database
            .select()
            .from(conciergeMessageChannels)
            .where(inArray(conciergeMessageChannels.messageId, messageIds))
        : Promise.resolve([]),
      messageIds.length
        ? database
            .select({
              messageId: conciergeDeliveries.messageId,
              personId: conciergeDeliveries.personId,
              channel: conciergeDeliveries.channel,
              status: conciergeDeliveries.status,
            })
            .from(conciergeDeliveries)
            .where(
              and(
                inArray(conciergeDeliveries.messageId, messageIds),
                ...(showDelivery
                  ? []
                  : [eq(conciergeDeliveries.personId, viewer.personId)]),
              ),
            )
        : Promise.resolve([]),
    ]);
  const nameOf = new Map(personRows.map((row) => [row.id, row.displayName]));
  const orgName = new Map(orgRows.map((row) => [row.id, row.name]));
  const staffRole = new Map(staffRows.map((row) => [row.personId, row.role]));
  const inboundOf = new Map(
    inboundChannels.map((row) => [row.messageId, row.channel]),
  );
  const ref = (id: string) =>
    personRef({ id, displayName: nameOf.get(id) ?? "Duna member" });
  const watermarks = showDelivery
    ? await database
        .select({ personId: p.personId, lastRead: p.lastReadSequence })
        .from(p)
        .where(
          and(
            eq(p.conversationId, conversation.id),
            eq(p.principalType, "user"),
            isNull(p.leftAt),
          ),
        )
    : [];
  return {
    conversationId: conversation.id,
    kind: threadKindOf(conversation),
    title: conversation.title,
    ...(conversation.contextType &&
    conversation.contextId &&
    conversation.type !== "support"
      ? {
          context: {
            type: conversation.contextType,
            id: conversation.contextId,
            label: conversation.contextLabel ?? conversation.title,
          },
        }
      : {}),
    participantCount: participantRows.length,
    unreadCount: unreadRows[0]?.count ?? 0,
    minorPresent: conversation.minorPresent,
    ...(conversation.lastMessageAt
      ? { lastMessageAt: conversation.lastMessageAt.toISOString() }
      : {}),
    participants: participantRows.flatMap((row) => {
      if (!row.personId) return [];
      const staff = staffRole.get(row.personId);
      return [
        {
          ...ref(row.personId),
          role:
            row.role === "guardian"
              ? ("guardian" as const)
              : staff === "coach"
                ? ("coach" as const)
                : staff
                  ? ("staff" as const)
                  : ("member" as const),
          ...(row.guardianOfPersonId
            ? { guardianOf: nameOf.get(row.guardianOfPersonId) ?? "Junior" }
            : {}),
        },
      ];
    }),
    messages: messageRows.map((row) => {
      const mine =
        viewer.kind === "club"
          ? row.senderPrincipalType === "organization" &&
            row.senderPersonId === viewer.personId
          : row.senderPrincipalType === "user" &&
            row.senderPrincipalId === viewer.personId;
      const system = [
        "system",
        "schedule-change",
        "score-update",
        "event-update",
      ].includes(row.kind);
      const kind = mine
        ? ("mine" as const)
        : row.senderPrincipalType === "agent" || row.kind === "support-response"
          ? ("duna" as const)
          : system
            ? ("system" as const)
            : row.senderPrincipalType === "organization"
              ? ("coach" as const)
              : ("person" as const);
      const deliveries = deliveryRows.filter(
        (delivery) => delivery.messageId === row.id,
      );
      const own = deliveries.find(
        (delivery) => delivery.personId === viewer.personId,
      );
      const channel =
        (inboundOf.get(row.id) as ConciergeChannel | undefined) ??
        (own?.channel as ConciergeChannel | undefined);
      const readBy = showDelivery
        ? watermarks
            .filter(
              (mark) =>
                mark.personId &&
                mark.lastRead >= row.sequence &&
                deliveries.some((d) => d.personId === mark.personId),
            )
            .slice(0, 10)
            .map((mark) => nameOf.get(mark.personId!) ?? "Duna member")
        : [];
      return {
        messageId: row.id,
        sequence: row.sequence,
        kind,
        ...(row.senderPersonId && kind !== "duna"
          ? { author: ref(row.senderPersonId) }
          : {}),
        ...(row.senderOrganizationId &&
        row.senderPrincipalType === "organization"
          ? {
              onBehalfOfOrganization:
                orgName.get(row.senderOrganizationId) ?? "Club",
            }
          : {}),
        body: row.status === "published" || mine ? (row.body ?? "") : "",
        ...(system && SYSTEM_KINDS[row.kind]
          ? { systemKind: SYSTEM_KINDS[row.kind] }
          : {}),
        ...(channel ? { channel } : {}),
        ...(showDelivery && deliveries.length > 0
          ? {
              delivery: {
                status: (readBy.length > 0
                  ? "read"
                  : row.status === "screening"
                    ? "queued"
                    : "sent") as "read" | "queued" | "sent",
                readBy,
                recipientCount: deliveries.length,
              },
            }
          : {}),
        createdAt: row.createdAt.toISOString(),
      };
    }),
  };
}

/** Assign a club thread to a staff member (or clear it). */
export async function assignConciergeThread(input: {
  readonly organizationId: string;
  readonly actorPersonId: string;
  readonly conversationId: string;
  readonly assigneePersonId: string | null;
  readonly now: Date;
}) {
  const database = getDatabase();
  if (input.assigneePersonId) {
    const staff = await database.query.organizationMemberships.findFirst({
      where: and(
        eq(organizationMemberships.organizationId, input.organizationId),
        eq(organizationMemberships.personId, input.assigneePersonId),
        eq(organizationMemberships.active, true),
      ),
    });
    if (!staff)
      throw new ConciergeError("NOT_FOUND", "Staff member not found.");
    await database
      .insert(conciergeThreadAssignments)
      .values({
        conversationId: input.conversationId,
        organizationId: input.organizationId,
        assignedPersonId: input.assigneePersonId,
        assignedByPersonId: input.actorPersonId,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: conciergeThreadAssignments.conversationId,
        set: {
          assignedPersonId: input.assigneePersonId,
          assignedByPersonId: input.actorPersonId,
          updatedAt: input.now,
        },
      });
  } else {
    await database
      .delete(conciergeThreadAssignments)
      .where(
        eq(conciergeThreadAssignments.conversationId, input.conversationId),
      );
  }
}

/** Mute or unmute a thread for a person (in-app stays; push and outside channels stop). */
export async function setConciergeThreadMute(input: {
  readonly personId: string;
  readonly conversationId: string;
  readonly muted: boolean;
  readonly now: Date;
}) {
  const [updated] = await getDatabase()
    .update(messagingConversationParticipants)
    .set({
      notificationLevel: input.muted ? "muted" : "all",
      updatedAt: input.now,
    })
    .where(
      and(
        eq(
          messagingConversationParticipants.conversationId,
          input.conversationId,
        ),
        eq(messagingConversationParticipants.principalType, "user"),
        eq(messagingConversationParticipants.personId, input.personId),
        isNull(messagingConversationParticipants.leftAt),
      ),
    )
    .returning({ id: messagingConversationParticipants.id });
  if (!updated) throw new ConciergeError("NOT_FOUND", "Thread not found.");
  return { conversationId: input.conversationId, muted: input.muted };
}
